import * as anchor from "@anchor-lang/core";
import { BN, Program } from "@anchor-lang/core";
import {
  createAssociatedTokenAccountIdempotent,
  createMint,
  createTransferCheckedWithTransferHookInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import { expect } from "chai";
import { Ules } from "../target/types/ules";

const env = anchor.AnchorProvider.env();
const provider = new anchor.AnchorProvider(
  new Connection(env.connection.rpcEndpoint, "confirmed"),
  env.wallet,
  { commitment: "confirmed", preflightCommitment: "confirmed" },
);
anchor.setProvider(provider);
const program = anchor.workspace.Ules as Program<Ules>;
const connection = provider.connection;
const payer = (provider.wallet as anchor.Wallet).payer;

const NOMINAL = new BN(100_000); // 1000 KZT in tiyn
const RATE_BPS = 1000;
const COUPONS_PER_YEAR = 2;

const [alice, bob, carol, dave] = [0, 1, 2, 3].map(() => Keypair.generate());

async function chainTime(): Promise<number> {
  const info = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  return Number(info!.data.readBigInt64LE(32));
}

async function waitUntil(ts: number) {
  while ((await chainTime()) < ts) {
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function expectError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (e: any) {
    const text = [String(e), ...(e.logs ?? e.transactionLogs ?? [])].join("\n");
    expect(text).to.contain(code);
    return;
  }
  expect.fail(`expected ${code}`);
}

class TestBond {
  constructor(
    readonly mint: PublicKey,
    readonly bond: PublicKey,
  ) {}

  static async create(settlementMint: PublicKey): Promise<TestBond> {
    const mint = Keypair.generate();
    const maturity = (await chainTime()) + 2 * 365 * 24 * 3600;
    await program.methods
      .createBond({
        registrar: payer.publicKey,
        nominal: NOMINAL,
        couponRateBps: RATE_BPS,
        couponsPerYear: COUPONS_PER_YEAR,
        maturityTs: new BN(maturity),
      })
      .accountsPartial({
        issuer: payer.publicKey,
        mint: mint.publicKey,
        settlementMint,
      })
      .signers([mint])
      .rpc();
    const [bond] = PublicKey.findProgramAddressSync(
      [Buffer.from("bond"), mint.publicKey.toBuffer()],
      program.programId,
    );
    return new TestBond(mint.publicKey, bond);
  }

  holder(wallet: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("holder"), this.bond.toBuffer(), wallet.toBuffer()],
      program.programId,
    )[0];
  }

  ata(wallet: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(
      this.mint,
      wallet,
      false,
      TOKEN_2022_PROGRAM_ID,
    );
  }

  async register(wallet: PublicKey) {
    await program.methods
      .registerHolder()
      .accountsPartial({
        registrar: payer.publicKey,
        bond: this.bond,
        mint: this.mint,
        wallet,
      })
      .rpc();
  }

  issue(wallet: PublicKey, qty: number) {
    return program.methods
      .issue(new BN(qty))
      .accountsPartial({
        issuer: payer.publicKey,
        bond: this.bond,
        mint: this.mint,
        holder: this.holder(wallet),
        holderAta: this.ata(wallet),
      })
      .rpc();
  }

  async announceCoupon(recordTs: number) {
    const id = (await program.account.bond.fetch(this.bond)).nextActionId;
    await program.methods
      .announceCoupon(new BN(recordTs))
      .accountsPartial({ issuer: payer.publicKey, bond: this.bond })
      .rpc();
    return id.toNumber();
  }

  async transfer(from: Keypair, to: PublicKey, qty: number) {
    const ix = await createTransferCheckedWithTransferHookInstruction(
      connection,
      this.ata(from.publicKey),
      this.mint,
      this.ata(to),
      from.publicKey,
      BigInt(qty),
      0,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
    await provider.sendAndConfirm(new Transaction().add(ix), [from]);
  }

  async balance(wallet: PublicKey): Promise<number> {
    const acc = await getAccount(
      connection,
      this.ata(wallet),
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
    return Number(acc.amount);
  }

  async snap(wallet: PublicKey, actionId: number): Promise<number | null> {
    const holder = await program.account.holder.fetch(this.holder(wallet));
    const snap = holder.snaps.find((s) => s.actionId.toNumber() === actionId);
    return snap ? snap.balance.toNumber() : null;
  }
}

describe("ules", () => {
  let settlementMint: PublicKey;

  before(async () => {
    settlementMint = await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      2,
    );
  });

  async function bondWith(holdings: [Keypair, number][]): Promise<TestBond> {
    const b = await TestBond.create(settlementMint);
    for (const [kp, qty] of holdings) {
      await b.register(kp.publicKey);
      if (qty > 0) await b.issue(kp.publicKey, qty);
    }
    return b;
  }

  it("creates a bond and issues to registered holders", async () => {
    const b = await bondWith([
      [alice, 10],
      [bob, 5],
    ]);
    const bond = await program.account.bond.fetch(b.bond);
    expect(bond.supply.toNumber()).to.equal(15);
    expect(bond.nominal.toNumber()).to.equal(100_000);
    expect(bond.settlementMint.toBase58()).to.equal(settlementMint.toBase58());
    expect(await b.balance(alice.publicKey)).to.equal(10);
  });

  it("moves bonds between registered holders", async () => {
    const b = await bondWith([
      [alice, 10],
      [bob, 0],
    ]);
    await b.transfer(alice, bob.publicKey, 3);
    expect(await b.balance(alice.publicKey)).to.equal(7);
    expect(await b.balance(bob.publicKey)).to.equal(3);
  });

  it("rejects a transfer to an unregistered wallet", async () => {
    const b = await bondWith([[alice, 10]]);
    await createAssociatedTokenAccountIdempotent(
      connection,
      payer,
      b.mint,
      dave.publicKey,
      {},
      TOKEN_2022_PROGRAM_ID,
    );
    await expectError(
      b.transfer(alice, dave.publicKey, 1),
      "HolderNotRegistered",
    );
    expect(await b.balance(alice.publicKey)).to.equal(10);
  });

  it("rejects issue after issuance closes", async () => {
    const b = await bondWith([[alice, 10]]);
    await b.announceCoupon((await chainTime()) + 3600);
    await expectError(b.issue(alice.publicKey, 1), "IssuanceClosed");
  });

  it("snapshots balances of holders who move after the record date", async () => {
    const b = await bondWith([
      [alice, 10],
      [bob, 5],
      [carol, 3],
    ]);
    const recordTs = (await chainTime()) + 2;
    const actionId = await b.announceCoupon(recordTs);
    await waitUntil(recordTs);

    await b.transfer(alice, bob.publicKey, 4);

    expect(await b.balance(alice.publicKey)).to.equal(6);
    expect(await b.balance(bob.publicKey)).to.equal(9);
    expect(await b.snap(alice.publicKey, actionId)).to.equal(10);
    expect(await b.snap(bob.publicKey, actionId)).to.equal(5);
    expect(await b.snap(carol.publicKey, actionId)).to.equal(null);

    await b.transfer(bob, alice.publicKey, 2);
    expect(await b.snap(alice.publicKey, actionId)).to.equal(10);
    expect(await b.snap(bob.publicKey, actionId)).to.equal(5);
  });

  it("writes no snapshot for transfers before the record date", async () => {
    const b = await bondWith([
      [alice, 10],
      [bob, 0],
    ]);
    const actionId = await b.announceCoupon((await chainTime()) + 3600);
    await b.transfer(alice, bob.publicKey, 4);
    expect(await b.snap(alice.publicKey, actionId)).to.equal(null);
    expect(await b.snap(bob.publicKey, actionId)).to.equal(null);
  });
});
