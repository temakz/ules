import type { BondView } from "./chain";
import { demoAction } from "./demo";
import {
  addressUrl,
  almaty,
  entitlement,
  kindLabel,
  kzt,
  rate,
  shortAddress,
  txUrl,
} from "./format";

function bondStatus(bond: BondView): string {
  if (bond.haltedFromTs === null) return "Active";
  return bond.supply > 0n ? "Redemption announced" : "Redeemed";
}

const statusLabel = {
  announced: "Announced",
  funded: "Funded",
  closed: "Closed",
};

function Address({ label, address }: { label: string; address: string }) {
  return (
    <a href={addressUrl(address)} target="_blank" rel="noreferrer">
      {label} <span className="mono">{shortAddress(address)}</span>
    </a>
  );
}

export function BondPage({ bond }: { bond: BondView }) {
  const nominalChanged = bond.nominal !== bond.nominalAtIssue;

  return (
    <>
      <section>
        <h2>Terms</h2>
        <dl className="terms">
          <div>
            <dt>Nominal</dt>
            <dd>
              {nominalChanged ? (
                <>
                  <s>{kzt(bond.nominalAtIssue)}</s> {kzt(bond.nominal)}
                </>
              ) : (
                kzt(bond.nominal)
              )}
            </dd>
          </div>
          <div>
            <dt>Coupon</dt>
            <dd>
              {rate(bond.couponRateBps)} a year, {bond.couponsPerYear} payments
            </dd>
          </div>
          <div>
            <dt>Bonds outstanding</dt>
            <dd>{bond.supply.toString()}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{bondStatus(bond)}</dd>
          </div>
          <div>
            <dt>Payment window</dt>
            <dd>{bond.payWindowSecs} s (15 days on KASE)</dd>
          </div>
        </dl>
        <p className="links">
          <Address label="Bond mint" address={bond.mint} />
          <Address label="Bond account" address={bond.address} />
          <Address label="Settlement token" address={bond.settlementMint} />
        </p>
      </section>

      <section>
        <h2>Corporate actions</h2>
        <table className="actions">
          <thead>
            <tr>
              <th>Action</th>
              <th>Record date, Almaty</th>
              <th>Status</th>
              <th className="num">Per bond</th>
              <th className="num">Paid</th>
              <th className="num">Returned</th>
              <th className="num">Receipts</th>
              <th>Transactions</th>
            </tr>
          </thead>
          <tbody>
            {bond.actions.map((a) => {
              const sigs = demoAction(a.id)?.signatures;
              return (
                <tr key={a.id}>
                  <td data-label="Action">
                    <a
                      href={addressUrl(a.address)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.id}. {kindLabel[a.kind]}
                    </a>
                  </td>
                  <td data-label="Record date, Almaty" className="mono">
                    {almaty(a.recordTs)}
                  </td>
                  <td data-label="Status">{statusLabel[a.status]}</td>
                  <td data-label="Per bond" className="num">
                    {kzt(entitlement(a, 1n))}
                  </td>
                  <td data-label="Paid" className="num">
                    {kzt(a.paid)}
                  </td>
                  <td data-label="Returned" className="num">
                    {a.status === "closed" ? kzt(a.funded - a.paid) : "-"}
                  </td>
                  <td data-label="Receipts" className="num">
                    {a.receipts}
                  </td>
                  <td data-label="Transactions" className="txs">
                    <span>
                      {sigs
                        ? (["announce", "fund", "close"] as const).map((k) => (
                            <a
                              key={k}
                              href={txUrl(sigs[k])}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {k}
                            </a>
                          ))
                        : "-"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
