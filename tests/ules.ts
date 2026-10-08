import * as anchor from "@anchor-lang/core";
import { BN, Program } from "@anchor-lang/core";
import {
  createAccount,
  createAssociatedTokenAccountIdempotent,
  createMint,
  createTransferCheckedWithTransferHookInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
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

const NOMINAL = 100_000; // 1000 KZT in tiyn
const RATE_BPS = 1000;

const [alice, bob, carol, dave, keeper] = [0, 1, 2, 3, 4].map(() =>
  Keypair.generate(),
);

let settlementMint: PublicKey;
let issuerKzt: PublicKey;

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

function kztAta(wallet: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(settlementMint, wallet, true);
}

async function kzt(wallet: PublicKey): Promise<number> {
  try {
    return Number((await getAccount(connection, kztAta(wallet))).amount);
  } catch {
    return 0;
  }
}

type Kind = "coupon" | "partial" | "redemption";

class TestBond {
  constructor(
    readonly mint: PublicKey,
    readonly bond: PublicKey,
  ) {}

  static async create(couponsPerYear = 2): Promise<TestBond> {
    const mint = Keypair.generate();
    const maturity = (await chainTime()) + 2 * 365 * 24 * 3600;
    await program.methods
      .createBond({
        registrar: payer.publicKey,
        nominal: new BN(NOMINAL),
        couponRateBps: RATE_BPS,
        couponsPerYear,
        maturityTs: new BN(maturity),
        payWindowSecs: new BN(3600),
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

  action(id: number): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("action"),
        this.bond.toBuffer(),
        new BN(id).toArrayLike(Buffer, "le", 8),
      ],
      program.programId,
    )[0];
  }

  receipt(id: number, wallet: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        this.action(id).toBuffer(),
        this.holder(wallet).toBuffer(),
      ],
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

  async announce(kind: Kind, recordTs: number, principal = 0) {
    const id = (await this.state()).nextActionId.toNumber();
    const ts = new BN(recordTs);
    const call =
      kind === "coupon"
        ? program.methods.announceCoupon(ts)
        : kind === "partial"
          ? program.methods.announcePartialRedemption(ts, new BN(principal))
          : program.methods.announceRedemption(ts);
    await call
      .accountsPartial({
        issuer: payer.publicKey,
        bond: this.bond,
        action: this.action(id),
      })
      .rpc();
    return id;
  }

  async fund(id: number) {
    await program.methods
      .fund()
      .accountsPartial({
        issuer: payer.publicKey,
        bond: this.bond,
        action: this.action(id),
        settlementMint,
        issuerSettlement: issuerKzt,
        vault: kztAta(this.action(id)),
        settlementTokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  settle(id: number, wallet: PublicKey, by: Keypair = payer) {
    return program.methods
      .settle()
      .accountsPartial({
        payer: by.publicKey,
        bond: this.bond,
        action: this.action(id),
        holder: this.holder(wallet),
        wallet,
        mint: this.mint,
        holderBonds: this.ata(wallet),
        settlementMint,
        vault: kztAta(this.action(id)),
        holderSettlement: kztAta(wallet),
        receipt: this.receipt(id, wallet),
        settlementTokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers(by === payer ? [] : [by])
      .rpc();
  }

  async close(id: number) {
    await program.methods
      .closeAction()
      .accountsPartial({
        issuer: payer.publicKey,
        bond: this.bond,
        action: this.action(id),
        settlementMint,
        vault: kztAta(this.action(id)),
        issuerSettlement: issuerKzt,
        settlementTokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  async transfer(
    from: Keypair,
    to: PublicKey,
    qty: number,
    destination = this.ata(to),
  ) {
    const ix = await createTransferCheckedWithTransferHookInstruction(
      connection,
      this.ata(from.publicKey),
      this.mint,
      destination,
      from.publicKey,
      BigInt(qty),
      0,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
    await provider.sendAndConfirm(new Transaction().add(ix), [from]);
  }

  state() {
    return program.account.bond.fetch(this.bond);
  }

  actionState(id: number) {
    return program.account.action.fetch(this.action(id));
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

async function bondWith(
  holdings: [Keypair, number][],
  couponsPerYear = 2,
): Promise<TestBond> {
  const b = await TestBond.create(couponsPerYear);
  for (const [kp, qty] of holdings) {
    await b.register(kp.publicKey);
    if (qty > 0) await b.issue(kp.publicKey, qty);
  }
  return b;
}

async function settleAll(b: TestBond, id: number, wallets: Keypair[]) {
  for (const w of wallets) await b.settle(id, w.publicKey);
}

// Pays every holder and returns how much each one received.
async function runAction(
  b: TestBond,
  kind: Kind,
  wallets: Keypair[],
  principal = 0,
): Promise<number[]> {
  const recordTs = (await chainTime()) + 2;
  const id = await b.announce(kind, recordTs, principal);
  await b.fund(id);
  await waitUntil(recordTs);
  const before = await Promise.all(wallets.map((w) => kzt(w.publicKey)));
  await settleAll(b, id, wallets);
  await b.close(id);
  const after = await Promise.all(wallets.map((w) => kzt(w.publicKey)));
  return after.map((a, i) => a - before[i]);
}

describe("ules", () => {
  before(async () => {
    settlementMint = await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      2,
    );
    issuerKzt = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        settlementMint,
        payer.publicKey,
      )
    ).address;
    await mintTo(
      connection,
      payer,
      settlementMint,
      issuerKzt,
      payer,
      1_000_000_000_00n,
    );
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: keeper.publicKey,
          lamports: LAMPORTS_PER_SOL,
        }),
      ),
    );
  });

  describe("registry and record date", () => {
    it("creates a bond and issues to registered holders", async () => {
      const b = await bondWith([
        [alice, 10],
        [bob, 5],
      ]);
      const bond = await b.state();
      expect(bond.supply.toNumber()).to.equal(15);
      expect(bond.nominal.toNumber()).to.equal(NOMINAL);
      expect(bond.settlementMint.toBase58()).to.equal(
        settlementMint.toBase58(),
      );
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

    it("rejects a transfer to a token account that is not the holder ATA", async () => {
      const b = await bondWith([
        [alice, 10],
        [bob, 0],
      ]);
      const side = await createAccount(
        connection,
        payer,
        b.mint,
        bob.publicKey,
        Keypair.generate(),
        {},
        TOKEN_2022_PROGRAM_ID,
      );
      await expectError(
        b.transfer(alice, bob.publicKey, 1, side),
        "NotAssociatedAccount",
      );
    });

    it("registers a wallet whose ATA was created by someone else", async () => {
      const b = await TestBond.create();
      await createAssociatedTokenAccountIdempotent(
        connection,
        payer,
        b.mint,
        dave.publicKey,
        {},
        TOKEN_2022_PROGRAM_ID,
      );
      await b.register(dave.publicKey);
      await b.issue(dave.publicKey, 2);
      expect(await b.balance(dave.publicKey)).to.equal(2);
    });

    it("rejects issue after issuance closes", async () => {
      const b = await bondWith([[alice, 10]]);
      await b.announce("coupon", (await chainTime()) + 3600);
      await expectError(b.issue(alice.publicKey, 1), "IssuanceClosed");
    });

    it("snapshots balances of holders who move after the record date", async () => {
      const b = await bondWith([
        [alice, 10],
        [bob, 5],
        [carol, 3],
      ]);
      const recordTs = (await chainTime()) + 2;
      const id = await b.announce("coupon", recordTs);
      await waitUntil(recordTs);

      await b.transfer(alice, bob.publicKey, 4);

      expect(await b.balance(alice.publicKey)).to.equal(6);
      expect(await b.balance(bob.publicKey)).to.equal(9);
      expect(await b.snap(alice.publicKey, id)).to.equal(10);
      expect(await b.snap(bob.publicKey, id)).to.equal(5);
      expect(await b.snap(carol.publicKey, id)).to.equal(null);

      await b.transfer(bob, alice.publicKey, 2);
      expect(await b.snap(alice.publicKey, id)).to.equal(10);
      expect(await b.snap(bob.publicKey, id)).to.equal(5);
    });

    it("writes no snapshot for transfers before the record date", async () => {
      const b = await bondWith([
        [alice, 10],
        [bob, 0],
      ]);
      const id = await b.announce("coupon", (await chainTime()) + 3600);
      await b.transfer(alice, bob.publicKey, 4);
      expect(await b.snap(alice.publicKey, id)).to.equal(null);
      expect(await b.snap(bob.publicKey, id)).to.equal(null);
    });
  });

  describe("corporate actions", () => {
    it("pays the listing example coupon when a third wallet settles", async () => {
      const b = await bondWith([[alice, 10]]);
      const recordTs = (await chainTime()) + 2;
      const id = await b.announce("coupon", recordTs);
      await b.fund(id);
      expect((await b.actionState(id)).funded.toNumber()).to.equal(50_000);
      await waitUntil(recordTs);

      const before = await kzt(alice.publicKey);
      await b.settle(id, alice.publicKey, keeper);
      expect((await kzt(alice.publicKey)) - before).to.equal(50_000);
      expect(await kzt(keeper.publicKey)).to.equal(0);

      const receipt = await program.account.receipt.fetch(
        b.receipt(id, alice.publicKey),
      );
      expect(receipt.wallet.toBase58()).to.equal(alice.publicKey.toBase58());
      expect(receipt.qty.toNumber()).to.equal(10);
      expect(receipt.amount.toNumber()).to.equal(50_000);

      await expectError(
        b.settle(id, alice.publicKey, keeper),
        "already in use",
      );
    });

    it("runs partial redemption, coupon on the reduced nominal, then redemption", async () => {
      const b = await bondWith([
        [alice, 6],
        [bob, 4],
      ]);
      const holders = [alice, bob];

      const partial = await runAction(b, "partial", holders, 30_000);
      expect(partial).to.deep.equal([180_000, 120_000]);
      expect((await b.state()).nominal.toNumber()).to.equal(70_000);
      expect(await b.balance(alice.publicKey)).to.equal(6);

      const coupon = await runAction(b, "coupon", holders);
      expect(coupon).to.deep.equal([21_000, 14_000]);

      const redemption = await runAction(b, "redemption", holders);
      expect(redemption).to.deep.equal([441_000, 294_000]);
      expect(redemption[0] + redemption[1]).to.equal(700_000 + 35_000);

      expect((await b.state()).supply.toNumber()).to.equal(0);
      expect(await b.balance(alice.publicKey)).to.equal(0);
      expect(await b.balance(bob.publicKey)).to.equal(0);
      expect(Number((await b.state()).openActions[0].id)).to.equal(0);
    });

    it("pays an unsettled coupon by snapshot after redemption burned the bonds", async () => {
      const b = await bondWith([[alice, 10]]);
      const now = await chainTime();
      const coupon = await b.announce("coupon", now + 2);
      const redemption = await b.announce("redemption", now + 4);
      await b.fund(coupon);
      await b.fund(redemption);
      await waitUntil(now + 4);

      const start = await kzt(alice.publicKey);
      await b.settle(redemption, alice.publicKey);
      expect((await kzt(alice.publicKey)) - start).to.equal(1_050_000);
      expect(await b.balance(alice.publicKey)).to.equal(0);
      expect((await b.state()).supply.toNumber()).to.equal(0);
      expect(await b.snap(alice.publicKey, coupon)).to.equal(10);

      await b.settle(coupon, alice.publicKey);
      expect((await kzt(alice.publicKey)) - start).to.equal(1_100_000);
    });

    it("halts transfers and later actions after the redemption record date", async () => {
      const b = await bondWith([
        [alice, 10],
        [bob, 0],
      ]);
      const recordTs = (await chainTime()) + 2;
      await b.announce("redemption", recordTs);
      await expectError(
        b.announce("coupon", recordTs + 3600),
        "AfterRedemption",
      );
      await waitUntil(recordTs);
      await expectError(b.transfer(alice, bob.publicKey, 1), "TransfersHalted");
    });

    it("rounds each payment down and returns the remainder to the issuer", async () => {
      // Monthly coupon: 1000 KZT * 10% / 12 = 833.33 KZT per bond.
      const b = await bondWith(
        [
          [alice, 1],
          [bob, 1],
          [carol, 1],
        ],
        12,
      );
      const recordTs = (await chainTime()) + 2;
      const id = await b.announce("coupon", recordTs);
      const issuerStart = await kzt(payer.publicKey);
      await b.fund(id);
      await waitUntil(recordTs);
      await settleAll(b, id, [alice, bob, carol]);

      const action = await b.actionState(id);
      expect(action.funded.toNumber()).to.equal(2_500);
      expect(action.paid.toNumber()).to.equal(3 * 833);

      await b.close(id);
      expect(issuerStart - (await kzt(payer.publicKey))).to.equal(3 * 833);
      expect("closed" in (await b.actionState(id)).status).to.equal(true);
    });
  });
});
