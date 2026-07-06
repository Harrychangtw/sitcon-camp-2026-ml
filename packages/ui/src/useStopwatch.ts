import { useEffect, useState } from "react";

/**
 * Milliseconds elapsed since `active` last became true, updated once per
 * animation frame (so it auto-pauses on a hidden tab) and reset to 0 each time
 * `active` toggles on. Returns 0 while inactive.
 *
 * Shared by the in-flight `LiveStatus` counter and the initial-load
 * `LoadingTimer` so both tick from the same clock.
 */
export function useStopwatch(active: boolean): number {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    setElapsedMs(0);
    let raf = requestAnimationFrame(function tick() {
      setElapsedMs(performance.now() - start);
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return elapsedMs;
}
