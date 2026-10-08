import { useCallback, useEffect, useState } from "react";
import { BondPage } from "./BondPage";
import { loadBond, type BondView } from "./chain";
import { HolderPage } from "./HolderPage";

type Tab = "bond" | "holder";

const tabFromHash = (): Tab =>
  window.location.hash.startsWith("#holder") ? "holder" : "bond";

export function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [bond, setBond] = useState<BondView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    loadBond()
      .then(setBond)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="page">
      <header className="masthead">
        <h1>Ules</h1>
        <p>Corporate actions for a tokenized KZT bond on Solana devnet.</p>
      </header>

      <nav className="tabs">
        <a href="#bond" className={tab === "bond" ? "active" : ""}>
          Bond
        </a>
        <a href="#holder" className={tab === "holder" ? "active" : ""}>
          What am I owed
        </a>
      </nav>

      <main>
        {error ? (
          <div className="notice">
            <p>Could not read devnet: {error}</p>
            <button onClick={load}>Try again</button>
          </div>
        ) : !bond ? (
          <p className="muted">Reading the bond from devnet...</p>
        ) : tab === "bond" ? (
          <BondPage bond={bond} />
        ) : (
          <HolderPage bond={bond} />
        )}
      </main>

      <footer>
        Settlement uses a test KZT stablecoin on devnet, fiat rails are
        simulated.
      </footer>
    </div>
  );
}
