import { useEffect, useState } from "react";

/**
 * True when the primary pointer is coarse (touch). SSR-safe: defaults to false
 * and resolves in an effect, so server and first client render always agree.
 * Components use it to swap hover-sized affordances for touch-sized ones.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setCoarse(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCoarse(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return coarse;
}
