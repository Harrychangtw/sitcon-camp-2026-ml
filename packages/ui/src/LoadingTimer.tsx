import { useStopwatch } from "./useStopwatch";

export interface LoadingTimerProps {
  /** Copy before the timer, e.g. "載入啟動值中". The elapsed seconds follow it. */
  label: string;
  /** Extra classes on the line (defaults to the muted mono loading style). */
  className?: string;
}

/**
 * The initial-load counterpart to `LiveStatus`'s in-flight counter: a muted
 * mono line that ticks a stopwatch up from 0.000 s while a station's asset is
 * loading, so the wait reads as live work instead of a frozen "…".
 */
export function LoadingTimer({ label, className }: LoadingTimerProps) {
  const elapsedMs = useStopwatch(true);
  return (
    <p className={className ?? "font-mono text-xs text-muted"}>
      {label} · {(elapsedMs / 1000).toFixed(2)} s
    </p>
  );
}
