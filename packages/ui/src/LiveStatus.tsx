/**
 * LiveStatus — one quiet mono line about the live-inference round-trip.
 *
 * Purely presentational: the station owns the state machine (it knows when a
 * request is in flight and when it fell back to the shipped artifact); this
 * component only renders the four states. Latency + fallback transparency
 * only — no device badge, no spinner theatrics.
 */

export type LiveState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "live"; ms: number }
  | { kind: "cached" } // server unreachable → showing shipped artifact
  | { kind: "rejected" }; // server reached but rejected THIS input (e.g. too long)

export interface LiveStatusProps {
  state: LiveState;
  className?: string;
}

export function LiveStatus({ state, className }: LiveStatusProps) {
  if (state.kind === "idle") return null;

  let tone: string;
  let copy: string;
  switch (state.kind) {
    case "pending":
      tone = "text-muted";
      copy = "GPU 計算中…";
      break;
    case "live":
      tone = "text-accent";
      copy = `GPU · ${state.ms} ms`;
      break;
    case "cached":
      tone = "text-warning";
      copy = "離線 · 顯示預先計算的結果";
      break;
    case "rejected":
      tone = "text-warning";
      copy = "句子太長 · 請縮短後再試";
      break;
  }

  return (
    <span className={`font-mono text-xs ${tone}${className ? ` ${className}` : ""}`}>
      {copy}
    </span>
  );
}
