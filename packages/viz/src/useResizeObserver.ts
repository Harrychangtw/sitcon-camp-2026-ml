import { useEffect, useRef, useState } from "react";

export interface Size {
  width: number;
  height: number;
}

/**
 * Measures an element with ResizeObserver so a viz can size to its container.
 *
 * SSR-safe: the observer is only created inside useEffect (browser only), and
 * `ResizeObserver` is feature-detected. Until the first measurement `size` is
 * `{ width: 0, height: 0 }` — render nothing (or a skeleton) while width is 0.
 */
export function useResizeObserver<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}
