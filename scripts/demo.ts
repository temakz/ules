import * as anchor from "@anchor-lang/core";
import { BN, Program } from "@anchor-lang/core";
import {
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createTransferCheckedWithTransferHookInstruction,
  ExtensionType,
  getAccount,
  getAssociatedTokenAddressSync,
  getMintLen,
  getOrCreateAssociatedTokenAccount,
  LENGTH_SIZE,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
} from "@solana/spl-token";
import { createInitializeInstruction, pack } from "@solana/spl-token-metadata";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";
import idl from "../target/idl/ules.json";
import { Ules } from "../target/types/ules";

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const CLUSTER = RPC_URL.includes("devnet") ? "devnet" : "localnet";
const WALLET =
  process.env.WALLET ?? path.join(os.homedir(), ".config", "solana", "id.json");

const NOMINAL = 100_000n; // 1000 KZT in tiyn
const RATE_BPS = 1000n;
const COUPONS_PER_YEAR = 2n;
const PAY_WINDOW_SECS = 120;
const RECORD_DELAY_SECS = 25;
const PARTIAL_PRINCIPAL = 30_000n;

const connection = new Connection(RPC_URL, "confirmed");
const issuer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(WALLET, "utf8"))),
);
const provider = new anchor.AnchorProvider(
  connection,
  new anchor.Wallet(issuer),
  { commitment: "confirmed", preflightCommitment: "confirmed" },
);
const program = new Program<Ules>(idl as Ules, provider);
const programId = program.programId;

type Kind = "coupon" | "partial" | "redemption";

interface Person {
  name: string;
  kp: Keypair;
  bonds: bigint;
}

const holders: Person[] = [
  { name: "Aigerim", kp: Keypair.generate(), bonds: 10n },
  { name: "Bauyrzhan", kp: Keypair.generate(), bonds: 5n },
  { name: "Dana", kp: Keypair.generate(), bonds: 3n },
];
const [aigerim, bauyrzhan, dana] = holders;
const crank = Keypair.generate();

const output: any = {
  cluster: CLUSTER,
  programId: programId.toBase58(),
  issuer: issuer.publicKey.toBase58(),
  crank: crank.publicKey.toBase58(),
  holders: {},
  actions: [],
  transactions: [],
};

let settlementMint: PublicKey;
let issuerKzt: PublicKey;
let bondMint: PublicKey;
let bond: PublicKey;

function explorer(sig: string): string {
  const base = `https://explorer.solana.com/tx/${sig}`;
  return CLUSTER === "devnet"
    ? `${base}?cluster=devnet`
    : `${base}?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`;
}

function kzt(tiyn: bigint): string {
  const sign = tiyn < 0n ? "-" : "";
  const abs = tiyn < 0n ? -tiyn : tiyn;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${whole}.${(abs % 100n).toString().padStart(2, "0")} KZT`;
}

function step(text: string, sig: string) {
  output.transactions.push({ step: text, signature: sig });
  console.log(`  ${text}\n    ${explorer(sig)}`);
}

function section(title: string) {
  console.log(`\n== ${title}`);
}

function check(ok: boolean, what: string) {
  if (!ok) throw new Error(`Check failed: ${what}`);
  console.log(`  ok: ${what}`);
}

async function clusterTime(): Promise<number> {
  const info = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  return Number(info!.data.readBigInt64LE(32));
}

async function waitForCluster(ts: number) {
  let now = await clusterTime();
  if (now < ts) console.log(`  waiting ${ts - now}s for the cluster clock`);
  while (now < ts) {
    await new Promise((r) => setTimeout(r, 2000));
    now = await clusterTime();
  }
}

function pda(...seeds: Buffer[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

const holderPda = (wallet: PublicKey) =>
  pda(Buffer.from("holder"), bond.toBuffer(), wallet.toBuffer());
const actionPda = (id: number) =>
  pda(
    Buffer.from("action"),
    bond.toBuffer(),
    new BN(id).toArrayLike(Buffer, "le", 8),
  );
const receiptPda = (id: number, wallet: PublicKey) =>
  pda(
    Buffer.from("receipt"),
    actionPda(id).toBuffer(),
    holderPda(wallet).toBuffer(),
  );
const bondAta = (wallet: PublicKey) =>
  getAssociatedTokenAddressSync(bondMint, wallet, true, TOKEN_2022_PROGRAM_ID);
const kztAta = (wallet: PublicKey) =>
  getAssociatedTokenAddressSync(
    settlementMint,
    wallet,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

async function kztBalance(wallet: PublicKey): Promise<bigint> {
  try {
    const acc = await getAccount(
      connection,
      kztAta(wallet),
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
    return acc.amount;
  } catch {
    return 0n;
  }
}

async function bondBalance(wallet: PublicKey): Promise<bigint> {
  const acc = await getAccount(
    connection,
    bondAta(wallet),
    "confirmed",
    TOKEN_2022_PROGRAM_ID,
  );
  return acc.amount;
}

// Same formula as Action::entitlement in the program.
function entitlement(
  kind: Kind,
  qty: bigint,
  nominal: bigint,
  principal: bigint,
): bigint {
  const coupon = (qty * nominal * RATE_BPS) / (10_000n * COUPONS_PER_YEAR);
  if (kind === "coupon") return coupon;
  if (kind === "partial") return qty * principal;
  return qty * nominal + coupon;
}

async function createTenge() {
  const mint = Keypair.generate();
  const metadata = {
    mint: mint.publicKey,
    name: "Test Tenge",
    symbol: "tKZT",
    uri: "",
    additionalMetadata: [] as [string, string][],
  };
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const lamports = await connection.getMinimumBalanceForRentExemption(
    mintLen + metadataLen,
  );
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: issuer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mint.publicKey,
      issuer.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      2,
      issuer.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: issuer.publicKey,
      mint: mint.publicKey,
      mintAuthority: issuer.publicKey,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
    }),
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [issuer, mint]);
  settlementMint = mint.publicKey;
  step(`Create tKZT test tenge mint ${settlementMint.toBase58()}`, sig);

  issuerKzt = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      issuer,
      settlementMint,
      issuer.publicKey,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID,
    )
  ).address;
  const supply = 50_000_00n;
  const mintSig = await mintTo(
    connection,
    issuer,
    settlementMint,
    issuerKzt,
    issuer,
    supply,
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );
  step(`Issuer mints ${kzt(supply)} to itself`, mintSig);
}

async function createBond() {
  const mint = Keypair.generate();
  const maturity = (await clusterTime()) + 2 * 365 * 24 * 3600;
  const sig = await program.methods
    .createBond({
      registrar: issuer.publicKey,
      nominal: new BN(NOMINAL.toString()),
      couponRateBps: Number(RATE_BPS),
      couponsPerYear: Number(COUPONS_PER_YEAR),
      maturityTs: new BN(maturity),
      payWindowSecs: new BN(PAY_WINDOW_SECS),
    })
    .accountsPartial({
      issuer: issuer.publicKey,
      mint: mint.publicKey,
      settlementMint,
    })
    .signers([mint])
    .rpc();
  bondMint = mint.publicKey;
  bond = pda(Buffer.from("bond"), bondMint.toBuffer());
  step(
    `Create bond: 1,000 KZT nominal, 10% a year, 2 coupons, mint ${bondMint.toBase58()}`,
    sig,
  );
}

async function onboardHolders() {
  const fundTx = new Transaction();
  for (const p of holders) {
    fundTx.add(
      SystemProgram.transfer({
        fromPubkey: issuer.publicKey,
        toPubkey: p.kp.publicKey,
        lamports: 0.01 * LAMPORTS_PER_SOL,
      }),
    );
  }
  fundTx.add(
    SystemProgram.transfer({
      fromPubkey: issuer.publicKey,
      toPubkey: crank.publicKey,
      lamports: 0.05 * LAMPORTS_PER_SOL,
    }),
  );
  step(
    "Send SOL for fees to the holders and the crank",
    await sendAndConfirmTransaction(connection, fundTx, [issuer]),
  );

  for (const p of holders) {
    output.holders[p.name] = p.kp.publicKey.toBase58();
    const regSig = await program.methods
      .registerHolder()
      .accountsPartial({
        registrar: issuer.publicKey,
        bond,
        mint: bondMint,
        wallet: p.kp.publicKey,
      })
      .rpc();
    step(`Registrar registers ${p.name} ${p.kp.publicKey.toBase58()}`, regSig);
    const issueSig = await program.methods
      .issue(new BN(p.bonds.toString()))
      .accountsPartial({
        issuer: issuer.publicKey,
        bond,
        mint: bondMint,
        holder: holderPda(p.kp.publicKey),
        holderAta: bondAta(p.kp.publicKey),
      })
      .rpc();
    step(`Issue ${p.bonds} bonds to ${p.name}`, issueSig);
  }
  for (const p of holders) {
    check(
      (await bondBalance(p.kp.publicKey)) === p.bonds,
      `${p.name} holds ${p.bonds}`,
    );
  }
}

async function transferIx(from: Person, to: Person, qty: bigint) {
  return createTransferCheckedWithTransferHookInstruction(
    connection,
    bondAta(from.kp.publicKey),
    bondMint,
    bondAta(to.kp.publicKey),
    from.kp.publicKey,
    qty,
    0,
    [],
    "confirmed",
    TOKEN_2022_PROGRAM_ID,
  );
}

async function transfer(from: Person, to: Person, qty: bigint) {
  const tx = new Transaction().add(await transferIx(from, to, qty));
  const sig = await sendAndConfirmTransaction(connection, tx, [from.kp]);
  from.bonds -= qty;
  to.bonds += qty;
  step(`${from.name} transfers ${qty} bonds to ${to.name}`, sig);
  check(
    (await bondBalance(from.kp.publicKey)) === from.bonds &&
      (await bondBalance(to.kp.publicKey)) === to.bonds,
    `${from.name} ${from.bonds}, ${to.name} ${to.bonds}`,
  );
}

// Lands a failing transfer on chain so the error is visible in the explorer.
async function transferExpectingHalt(from: Person, to: Person, qty: bigint) {
  const tx = new Transaction().add(await transferIx(from, to, qty));
  tx.feePayer = from.kp.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(from.kp);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
  });
  await connection.confirmTransaction(sig, "confirmed");
  const landed = await connection.getTransaction(sig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  const logs = landed?.meta?.logMessages?.join("\n") ?? "";
  step(
    `${from.name} tries to transfer ${qty} bond to ${to.name}: rejected as expected`,
    sig,
  );
  check(
    landed?.meta?.err != null && logs.includes("TransfersHalted"),
    "transfer failed with TransfersHalted",
  );
}

async function runAction(
  title: string,
  kind: Kind,
  opts: { principal?: bigint; afterRecord?: () => Promise<void> } = {},
) {
  section(title);
  const principal = opts.principal ?? 0n;
  const before = await program.account.bond.fetch(bond);
  const id = before.nextActionId.toNumber();
  const nominal = BigInt(before.nominal.toString());
  const supply = BigInt(before.supply.toString());
  const action = actionPda(id);
  const recordTs = (await clusterTime()) + RECORD_DELAY_SECS;
  const ts = new BN(recordTs);

  const call =
    kind === "coupon"
      ? program.methods.announceCoupon(ts)
      : kind === "partial"
        ? program.methods.announcePartialRedemption(
            ts,
            new BN(principal.toString()),
          )
        : program.methods.announceRedemption(ts);
  const announceSig = await call
    .accountsPartial({ issuer: issuer.publicKey, bond, action })
    .rpc();
  step(
    `Issuer announces ${kind} #${id}, record date ${new Date(recordTs * 1000).toISOString()}`,
    announceSig,
  );

  // Nobody moves bonds between the announcement and the record date, so the
  // current positions are the record-date positions.
  const atRecord = holders.map((p) => ({ p, qty: p.bonds }));

  await waitForCluster(recordTs);
  if (opts.afterRecord) await opts.afterRecord();

  const expectedTotal = entitlement(kind, supply, nominal, principal);
  const fundSig = await program.methods
    .fund()
    .accountsPartial({
      issuer: issuer.publicKey,
      bond,
      action,
      settlementMint,
      issuerSettlement: issuerKzt,
      vault: kztAta(action),
      settlementTokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .rpc();
  step(`Issuer funds ${kzt(expectedTotal)} for ${supply} bonds`, fundSig);
  const funded = BigInt(
    (await program.account.action.fetch(action)).funded.toString(),
  );
  check(funded === expectedTotal, `funded ${kzt(funded)} matches the formula`);

  const receipts: any[] = [];
  let paid = 0n;
  for (const { p, qty } of atRecord) {
    const wallet = p.kp.publicKey;
    const kztBefore = await kztBalance(wallet);
    const settleSig = await program.methods
      .settle()
      .accountsPartial({
        payer: crank.publicKey,
        bond,
        action,
        holder: holderPda(wallet),
        wallet,
        mint: bondMint,
        holderBonds: bondAta(wallet),
        settlementMint,
        vault: kztAta(action),
        holderSettlement: kztAta(wallet),
        receipt: receiptPda(id, wallet),
        settlementTokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([crank])
      .rpc();
    const receipt = await program.account.receipt.fetch(receiptPda(id, wallet));
    const amount = BigInt(receipt.amount.toString());
    const expected = entitlement(kind, qty, nominal, principal);
    step(
      `Crank settles ${p.name}: ${receipt.qty} bonds on record date, ${kzt(amount)}`,
      settleSig,
    );
    check(
      BigInt(receipt.qty.toString()) === qty && amount === expected,
      `${p.name} receipt matches ${qty} bonds and ${kzt(expected)}`,
    );
    check(
      (await kztBalance(wallet)) - kztBefore === amount,
      `${p.name} received the money`,
    );
    paid += amount;
    receipts.push({
      holder: p.name,
      wallet: wallet.toBase58(),
      receipt: receiptPda(id, wallet).toBase58(),
      qty: qty.toString(),
      amount: amount.toString(),
      signature: settleSig,
    });
  }

  const remainder = funded - paid;
  const vaultBefore = await getAccount(
    connection,
    kztAta(action),
    "confirmed",
    TOKEN_2022_PROGRAM_ID,
  );
  check(
    vaultBefore.amount === remainder,
    `vault holds the remainder ${kzt(remainder)}`,
  );
  const issuerBefore = await kztBalance(issuer.publicKey);
  const closeSig = await program.methods
    .closeAction()
    .accountsPartial({
      issuer: issuer.publicKey,
      bond,
      action,
      settlementMint,
      vault: kztAta(action),
      issuerSettlement: issuerKzt,
      settlementTokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .rpc();
  step(
    `Issuer closes ${kind} #${id}: paid ${kzt(paid)}, returned ${kzt(remainder)}`,
    closeSig,
  );
  check(
    (await kztBalance(issuer.publicKey)) - issuerBefore === remainder,
    "remainder returned to the issuer",
  );

  output.actions.push({
    id,
    kind,
    address: action.toBase58(),
    recordTs,
    nominalAtAnnounce: nominal.toString(),
    principalPerBond: principal.toString(),
    funded: funded.toString(),
    paid: paid.toString(),
    returned: remainder.toString(),
    receipts,
    signatures: { announce: announceSig, fund: fundSig, close: closeSig },
  });
}

async function main() {
  console.log(`Ules demo on ${CLUSTER} (${RPC_URL})`);
  console.log(`Program ${programId.toBase58()}`);
  console.log(`Issuer and registrar ${issuer.publicKey.toBase58()}`);

  section("Setup");
  await createTenge();
  await createBond();
  await onboardHolders();
  await transfer(aigerim, bauyrzhan, 2n);

  await runAction("Coupon on 1,000 KZT nominal", "coupon", {
    afterRecord: () => transfer(bauyrzhan, dana, 3n),
  });
  await runAction("Partial redemption of 30%", "partial", {
    principal: PARTIAL_PRINCIPAL,
  });
  check(
    BigInt((await program.account.bond.fetch(bond)).nominal.toString()) ===
      NOMINAL - PARTIAL_PRINCIPAL,
    "nominal is now 700 KZT",
  );
  await runAction("Coupon on 700 KZT nominal", "coupon");
  await runAction("Redemption", "redemption", {
    afterRecord: () => transferExpectingHalt(aigerim, dana, 1n),
  });

  const final = await program.account.bond.fetch(bond);
  check(final.supply.toNumber() === 0, "bond supply is 0");
  for (const p of holders) {
    check(
      (await bondBalance(p.kp.publicKey)) === 0n,
      `${p.name} has no bonds left`,
    );
  }

  section("Holders received");
  for (const p of holders) {
    console.log(`  ${p.name}: ${kzt(await kztBalance(p.kp.publicKey))}`);
  }

  Object.assign(output, {
    settlementMint: settlementMint.toBase58(),
    bondMint: bondMint.toBase58(),
    bond: bond.toBase58(),
  });
  fs.mkdirSync("demo-output", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join("demo-output", `${CLUSTER}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(output, null, 2) + "\n");
  console.log(`\nWrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
