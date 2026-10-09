import { PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";
import {
  loadReceipts,
  settleSignature,
  type ActionView,
  type BondView,
  type HolderReceipts,
  type ReceiptView,
} from "./chain";
import { demo, demoReceipt, transfersAfterRecord } from "./demo";
import { almaty, formula, kindLabel, kzt, shortAddress, txUrl } from "./format";

const names = Object.keys(demo.holders);

const nameFromHash = () => {
  const name = decodeURIComponent(window.location.hash.split("/")[1] ?? "");
  return names.includes(name) ? name : names[0];
};

function missingText(a: ActionView, registered: boolean): string {
  if (!registered) return "Not a holder on the record date";
  if (a.status !== "closed") return "Not settled yet";
  return a.settledQty === a.supplyAtRecord
    ? "Not a holder on the record date"
    : "Not paid within the payment window";
}

const SNAPSHOT_REASON =
  "The transfer hook saved this holder's balance at the record date, so the payment follows the record-date register.";

function snapshotNote(actionId: number, name: string | undefined, qty: bigint) {
  const moves = name ? transfersAfterRecord(actionId, name) : [];
  if (moves.length === 0) {
    return `Bonds moved after the record date. ${SNAPSHOT_REASON}`;
  }
  const what = moves
    .map((t) =>
      t.from === name
        ? `sent ${t.qty} to ${t.to}`
        : `received ${t.qty} from ${t.from}`,
    )
    .join(" and ");
  return `${name} held ${qty} bonds at the record date, then ${what}. ${SNAPSHOT_REASON}`;
}

function SettleLink({
  wallet,
  actionId,
  receipt,
}: {
  wallet: string;
  actionId: number;
  receipt: ReceiptView;
}) {
  const known = demoReceipt(actionId, wallet)?.signature;
  const [sig, setSig] = useState<string | null>(known ?? null);

  useEffect(() => {
    if (known) return;
    settleSignature(receipt.address)
      .then(setSig)
      .catch(() => setSig(null));
  }, [known, receipt.address]);

  return sig ? (
    <a href={txUrl(sig)} target="_blank" rel="noreferrer">
      Settlement transaction
    </a>
  ) : null;
}

export function HolderPage({ bond }: { bond: BondView }) {
  const [wallet, setWallet] = useState(demo.holders[nameFromHash()]);
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [data, setData] = useState<HolderReceipts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    loadReceipts(new PublicKey(wallet), bond.actions)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [wallet, bond.actions]);

  function lookUp(e: React.FormEvent) {
    e.preventDefault();
    try {
      setWallet(new PublicKey(input.trim()).toBase58());
      setInputError(null);
    } catch {
      setInputError("Not a valid Solana address");
    }
  }

  const name = names.find((n) => demo.holders[n] === wallet);
  const total = data
    ? [...data.receipts.values()].reduce((s, r) => s + r.amount, 0n)
    : 0n;

  return (
    <>
      <section>
        <h2>Holder</h2>
        <div className="picker">
          {names.map((n) => (
            <button
              key={n}
              className={n === name ? "active" : ""}
              onClick={() => {
                setWallet(demo.holders[n]);
                window.history.replaceState(null, "", `#holder/${n}`);
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <form className="lookup" onSubmit={lookUp}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Or paste a wallet address"
            spellCheck={false}
          />
          <button type="submit">Look up</button>
        </form>
        {inputError && <p className="error">{inputError}</p>}
        <p className="muted">
          {name ?? "Wallet"}{" "}
          <span className="mono">{shortAddress(wallet)}</span>
          {data && data.receipts.size > 0 && (
            <> received {kzt(total)} in total</>
          )}
        </p>
      </section>

      <section>
        <h2>Receipts</h2>
        {error ? (
          <p className="error">Could not read devnet: {error}</p>
        ) : !data ? (
          <p className="muted">Reading receipts from devnet...</p>
        ) : (
          <ol className="receipts">
            {bond.actions.map((a) => {
              const r = data.receipts.get(a.id);
              const fromSnapshot = demoReceipt(a.id, wallet)?.fromSnapshot;
              return (
                <li key={a.id}>
                  <div className="receipt-head">
                    <span>
                      {a.id}. {kindLabel[a.kind]}
                    </span>
                    <span className="muted mono">{almaty(a.recordTs)}</span>
                  </div>
                  {r ? (
                    <>
                      <div className="receipt-body">
                        <span>
                          {r.qty.toString()} bonds on the record date
                          {fromSnapshot && (
                            <span className="tag">
                              From record-date snapshot
                            </span>
                          )}
                        </span>
                        <strong className="num">{kzt(r.amount)}</strong>
                      </div>
                      {fromSnapshot && (
                        <p className="snapshot-note">
                          {snapshotNote(a.id, name, r.qty)}
                        </p>
                      )}
                      <p className="formula mono">
                        {formula(a, r.qty, r.amount)}
                      </p>
                      <SettleLink wallet={wallet} actionId={a.id} receipt={r} />
                    </>
                  ) : (
                    <p className="muted">{missingText(a, data.registered)}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}
