import { BN, Program, type IdlAccounts } from "@anchor-lang/core";
import { Connection, PublicKey } from "@solana/web3.js";
import { demo } from "./demo";
import idl from "./idl/ules.json";
import type { Ules } from "./idl/ules";

export const RPC_URL =
  import.meta.env.VITE_RPC_URL ?? "https://api.devnet.solana.com";

const connection = new Connection(RPC_URL, "confirmed");
const program = new Program<Ules>(idl as Ules, { connection });
const programId = program.programId;

type Accounts = IdlAccounts<Ules>;
export type Kind = "coupon" | "partialRedemption" | "redemption";
export type Status = "announced" | "funded" | "closed";

export interface BondView {
  address: string;
  mint: string;
  settlementMint: string;
  nominal: bigint;
  nominalAtIssue: bigint;
  couponRateBps: number;
  couponsPerYear: number;
  supply: bigint;
  payWindowSecs: number;
  haltedFromTs: number | null;
  actions: ActionView[];
}

export interface ActionView {
  id: number;
  address: string;
  kind: Kind;
  status: Status;
  recordTs: number;
  payEndTs: number;
  nominal: bigint;
  principalPerBond: bigint;
  couponRateBps: number;
  couponsPerYear: number;
  supplyAtRecord: bigint;
  funded: bigint;
  paid: bigint;
  settledQty: bigint;
  receipts: number;
}

export interface ReceiptView {
  address: string;
  qty: bigint;
  amount: bigint;
  ts: number;
}

const big = (n: BN) => BigInt(n.toString());
const variant = <T extends string>(e: object) => Object.keys(e)[0] as T;

function pda(...seeds: Buffer[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

const bondKey = new PublicKey(demo.bond);

export const actionPda = (id: number) =>
  pda(
    Buffer.from("action"),
    bondKey.toBuffer(),
    new BN(id).toArrayLike(Buffer, "le", 8),
  );
export const holderPda = (wallet: PublicKey) =>
  pda(Buffer.from("holder"), bondKey.toBuffer(), wallet.toBuffer());
export const receiptPda = (actionId: number, wallet: PublicKey) =>
  pda(
    Buffer.from("receipt"),
    actionPda(actionId).toBuffer(),
    holderPda(wallet).toBuffer(),
  );

function decode<K extends keyof Accounts & string>(
  name: K,
  data: Buffer,
): Accounts[K] {
  return program.coder.accounts.decode(name, data);
}

function toAction(
  id: number,
  address: PublicKey,
  a: Accounts["action"],
): ActionView {
  return {
    id,
    address: address.toBase58(),
    kind: variant<Kind>(a.kind),
    status: variant<Status>(a.status),
    recordTs: a.recordTs.toNumber(),
    payEndTs: a.payEndTs.toNumber(),
    nominal: big(a.nominalAtAnnounce),
    principalPerBond: big(a.principalPerBond),
    couponRateBps: a.couponRateBps,
    couponsPerYear: a.couponsPerYear,
    supplyAtRecord: big(a.supplyAtRecord),
    funded: big(a.funded),
    paid: big(a.paid),
    settledQty: big(a.settledQty),
    receipts: a.receipts,
  };
}

export async function loadBond(): Promise<BondView> {
  const info = await connection.getAccountInfo(bondKey);
  if (!info) throw new Error(`Bond ${demo.bond} not found on devnet`);
  const bond = decode("bond", info.data);

  const ids = Array.from(
    { length: bond.nextActionId.toNumber() - 1 },
    (_, i) => i + 1,
  );
  const keys = ids.map(actionPda);
  const infos = keys.length
    ? await connection.getMultipleAccountsInfo(keys)
    : [];
  const actions = infos.flatMap((acc, i) =>
    acc ? [toAction(ids[i], keys[i], decode("action", acc.data))] : [],
  );

  const nominal = big(bond.nominal);
  const redeemedPrincipal = actions
    .filter((a) => a.kind === "partialRedemption")
    .reduce((sum, a) => sum + a.principalPerBond, 0n);

  return {
    address: demo.bond,
    mint: bond.mint.toBase58(),
    settlementMint: bond.settlementMint.toBase58(),
    nominal,
    nominalAtIssue: nominal + redeemedPrincipal,
    couponRateBps: bond.couponRateBps,
    couponsPerYear: bond.couponsPerYear,
    supply: big(bond.supply),
    payWindowSecs: bond.payWindowSecs.toNumber(),
    haltedFromTs: bond.haltedFromTs ? bond.haltedFromTs.toNumber() : null,
    actions,
  };
}

export interface HolderReceipts {
  registered: boolean;
  receipts: Map<number, ReceiptView>;
}

export async function loadReceipts(
  wallet: PublicKey,
  actions: ActionView[],
): Promise<HolderReceipts> {
  const keys = [
    holderPda(wallet),
    ...actions.map((a) => receiptPda(a.id, wallet)),
  ];
  const [holder, ...infos] = await connection.getMultipleAccountsInfo(keys);
  const receipts = new Map<number, ReceiptView>();
  infos.forEach((acc, i) => {
    if (!acc) return;
    const r = decode("receipt", acc.data);
    receipts.set(actions[i].id, {
      address: keys[i + 1].toBase58(),
      qty: big(r.qty),
      amount: big(r.amount),
      ts: r.ts.toNumber(),
    });
  });
  return { registered: holder !== null, receipts };
}

// The receipt is written once, by the settle transaction that created it.
export async function settleSignature(receipt: string): Promise<string | null> {
  const sigs = await connection.getSignaturesForAddress(
    new PublicKey(receipt),
    {
      limit: 1,
    },
  );
  return sigs[0]?.signature ?? null;
}
