/**
 * The arena's <canvas> shell: sizing (ResizeObserver + devicePixelRatio), the
 * single requestAnimationFrame driver, and pointer→world coordinate mapping.
 * All game/lesson logic lives in useArena; this component just calls the
 * provided `draw` every frame and forwards pointer events in world coords.
 *
 * SSR-safe by construction: canvas/rAF/RO are only touched inside effects
 * (course2 is client-only, but the rule still binds the pattern).
 */
import { useEffect, useRef } from "react";

/** The centered square the unit-arena maps onto, in CSS pixels. */
export interface ArenaRect {
  left: number;
  top: number;
  side: number;
}

export type DrawFn = (
  ctx: CanvasRenderingContext2D,
  rect: ArenaRect,
  width: number,
  height: number,
  nowMs: number,
) => void;

export interface ArenaPointerEvent {
  /** Arena coords (unit square; may fall outside [0,1] near the edges). */
  x: number;
  y: number;
}

export interface ArenaCanvasProps {
  draw: DrawFn;
  onPointerDown?: (e: ArenaPointerEvent) => void;
  onPointerMove?: (e: ArenaPointerEvent) => void;
  onPointerUp?: (e: ArenaPointerEvent) => void;
  /** CSS cursor for the canvas (the host hit-tests and decides). */
  cursor?: string;
}

/** Reserve breathing room for the floating title (top) and dock (bottom).
 *  The RL dock is a 3-row control stack (~190px tall), so the bottom inset
 *  clears it — otherwise the arena's lower half hides behind the dock. */
const INSET = { top: 56, bottom: 210, x: 24 };

export function arenaRect(width: number, height: number): ArenaRect {
  const availW = width - INSET.x * 2;
  const availH = height - INSET.top - INSET.bottom;
  const side = Math.max(Math.min(availW, availH), 40);
  return {
    left: (width - side) / 2,
    top: INSET.top + (availH - side) / 2,
    side,
  };
}

export function ArenaCanvas({
  draw,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  cursor = "default",
}: ArenaCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Keep the latest callbacks without re-subscribing the rAF loop.
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    const frame = (nowMs: number) => {
      const ctx = canvas.getContext("2d");
      if (ctx && width > 0 && height > 0) {
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawRef.current(ctx, arenaRect(width, height), width, height, nowMs);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const toWorld = (e: React.PointerEvent<HTMLCanvasElement>): ArenaPointerEvent => {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    const rect = arenaRect(bounds.width, bounds.height);
    return {
      x: (e.clientX - bounds.left - rect.left) / rect.side,
      y: (e.clientY - bounds.top - rect.top) / rect.side,
    };
  };

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        style={{ cursor }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onPointerDown?.(toWorld(e));
        }}
        onPointerMove={(e) => onPointerMove?.(toWorld(e))}
        onPointerUp={(e) => onPointerUp?.(toWorld(e))}
      />
    </div>
  );
}
