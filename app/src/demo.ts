export interface DemoReceipt {
  holder: string;
  wallet: string;
  receipt: string;
  signature: string;
  fromSnapshot?: boolean;
}

export interface DemoAction {
  id: number;
  receipts: DemoReceipt[];
  signatures: { announce: string; fund: string; close: string };
}

export interface DemoTransfer {
  from: string;
  to: string;
  qty: number;
  signature: string;
  afterRecordOf: number | null;
}

export interface DemoRun {
  cluster: string;
  programId: string;
  settlementMint: string;
  bondMint: string;
  bond: string;
  holders: Record<string, string>;
  actions: DemoAction[];
  transfers?: DemoTransfer[];
}

const runs = import.meta.glob<DemoRun>("../../demo-output/devnet-*.json", {
  eager: true,
  import: "default",
});

const latest = Object.keys(runs).sort().pop();
if (!latest) throw new Error("No demo-output/devnet-*.json found");

// Names and transaction signatures only. Numbers always come from the chain.
export const demo: DemoRun = runs[latest];

export function demoAction(id: number): DemoAction | undefined {
  return demo.actions.find((a) => a.id === id);
}

export function transfersAfterRecord(
  actionId: number,
  name: string,
): DemoTransfer[] {
  return (demo.transfers ?? []).filter(
    (t) => t.afterRecordOf === actionId && (t.from === name || t.to === name),
  );
}

export function demoReceipt(
  actionId: number,
  wallet: string,
): DemoReceipt | undefined {
  return demoAction(actionId)?.receipts.find((r) => r.wallet === wallet);
}
