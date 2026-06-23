import { useEffect, useRef, useState } from "react";

export interface RunButtonProps {
  label?: string;
  /** Label shown while the fake compute beat runs. */
  runningLabel?: string;
  /** Duration of the fake "compute is happening" beat, in ms. */
  durationMs?: number;
  /** Fired once the fake compute finishes. Wire your state update here. */
  onRun?: () => void;
  disabled?: boolean;
}

/**
 * A button with a built-in, configurable fake-loading state.
 *
 * The curriculum deliberately wants a visible "compute is happening" beat even
 * though the browser is only replaying precomputed artifacts — it teaches that
 * training/inference costs time. `onRun` fires AFTER the beat, so update station
 * state there to reveal the result.
 */
export function RunButton({
  label = "Run",
  runningLabel = "Computing…",
  durationMs = 700,
  onRun,
  disabled,
}: RunButtonProps) {
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up a pending timer if the button unmounts mid-beat.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const start = () => {
    if (running || disabled) return;
    setRunning(true);
    timer.current = setTimeout(() => {
      setRunning(false);
      onRun?.();
    }, durationMs);
  };

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled || running}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity disabled:opacity-60"
    >
      {running ? (
        <>
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent-fg/40 border-t-accent-fg" />
          {runningLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}
