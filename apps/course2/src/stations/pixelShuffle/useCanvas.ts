/* Canvas sizing hook (ported from the morning class): DPR scaling +
   ResizeObserver on the parent. `draw(ctx, w, h)` receives logical (CSS-pixel)
   dimensions and a pre-scaled, pre-cleared context. Returns the canvas ref and
   a `paint()` for manual redraws. Client-only by construction, everything
   DOM-touching runs inside effects/callbacks.

   Unlike the original (a mount-once effect), the observer attaches via a
   CALLBACK ref: this station's canvases mount behind a loading gate AFTER the
   component's first commit, and several (the input images) have deps that
   never change post-mount, a mount-once effect would fire before the canvas
   exists, never attach, and leave them blank forever. The callback ref runs
   exactly when the canvas (un)mounts, so late-mounted and re-mounted canvases
   observe + paint immediately. */

import { useCallback, useEffect, useRef } from "react";

export type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export function useCanvas(draw: DrawFn, deps: unknown[]) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  const paint = useCallback(() => {
    const cv = canvasRef.current;
    const parent = cv?.parentElement;
    if (!cv || !parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(w * dpr);
    const H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawRef.current(ctx, w, h);
  }, []);

  // (re)attach the observer whenever the canvas element (un)mounts.
  const ref = useCallback(
    (cv: HTMLCanvasElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      canvasRef.current = cv;
      const parent = cv?.parentElement;
      if (!parent) return;
      const ro = new ResizeObserver(() => paint());
      ro.observe(parent);
      observerRef.current = ro;
      paint();
    },
    [paint],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  // repaint when the caller's dependencies change.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is the caller's dependency list
  useEffect(() => paint(), [paint, ...deps]);

  return { ref, paint };
}
