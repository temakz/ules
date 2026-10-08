import type { ActionView, Kind } from "./chain";

const CLUSTER = "?cluster=devnet";
export const txUrl = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}${CLUSTER}`;
export const addressUrl = (address: string) =>
  `https://explorer.solana.com/address/${address}${CLUSTER}`;

export function kzt(tiyn: bigint): string {
  const whole = (tiyn / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = tiyn % 100n;
  return frac === 0n
    ? `${whole} KZT`
    : `${whole}.${frac.toString().padStart(2, "0")} KZT`;
}

export const rate = (bps: number) => `${bps / 100}%`;

export const kindLabel: Record<Kind, string> = {
  coupon: "Coupon",
  partialRedemption: "Partial redemption",
  redemption: "Redemption",
};

const ALMATY_OFFSET_SECS = 5 * 3600;

// KASE fixes the register at 00:00 Almaty time (UTC+5), so dates are shown there.
export function almaty(ts: number): string {
  const d = new Date((ts + ALMATY_OFFSET_SECS) * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 4)}...${a.slice(-4)}`;
}

function coupon(a: ActionView, qty: bigint): bigint {
  return (
    (qty * a.nominal * BigInt(a.couponRateBps)) /
    (10_000n * BigInt(a.couponsPerYear))
  );
}

// Mirrors Action::entitlement in the program: integer math, rounded down to a tiyn.
export function entitlement(a: ActionView, qty: bigint): bigint {
  if (a.kind === "coupon") return coupon(a, qty);
  if (a.kind === "partialRedemption") return qty * a.principalPerBond;
  return qty * a.nominal + coupon(a, qty);
}

export function formula(a: ActionView, qty: bigint, amount: bigint): string {
  const couponPart = `${qty} x ${kzt(a.nominal)} x ${rate(a.couponRateBps)} / ${a.couponsPerYear}`;
  const left =
    a.kind === "coupon"
      ? couponPart
      : a.kind === "partialRedemption"
        ? `${qty} x ${kzt(a.principalPerBond)}`
        : `${qty} x ${kzt(a.nominal)} + ${couponPart}`;
  return `${left} = ${kzt(amount)}`;
}
