/**
 * On-screen D-pad for race mode on touch devices. It owns NO movement logic:
 * press/release call back into useArena's pressDpad/releaseDpad, which push
 * the same arrow-key names the physical keyboard handlers push, so keyboard
 * and D-pad share one action pathway into the sim.
 *
 * A single captured pointer drives it (setPointerCapture): press-and-hold
 * moves, sliding across the pad switches direction live, lifting stops. The
 * direction is derived from the pointer's offset off the pad centre (dominant
 * axis), so thumbs don't need to land precisely on a button.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DpadDirection } from "./useArena";

export interface VirtualDpadProps {
  onPress: (dir: DpadDirection) => void;
  onRelease: (dir: DpadDirection) => void;
}

/** Radius (CSS px) around the pad centre that keeps the held direction. */
const DEAD_ZONE = 14;

export function VirtualDpad({ onPress, onRelease }: VirtualDpadProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<number | null>(null);
  const activeRef = useRef<DpadDirection | null>(null);
  const [active, setActive] = useState<DpadDirection | null>(null);

  // If the pad unmounts mid-hold (mode switch), release the held direction so
  // the shared key stack never keeps a phantom press.
  const onReleaseRef = useRef(onRelease);
  onReleaseRef.current = onRelease;
  useEffect(
    () => () => {
      if (activeRef.current) onReleaseRef.current(activeRef.current);
    },
    [],
  );

  const apply = useCallback(
    (dir: DpadDirection | null) => {
      const prev = activeRef.current;
      if (dir === prev) return;
      if (prev) onRelease(prev);
      if (dir) onPress(dir);
      activeRef.current = dir;
      setActive(dir);
    },
    [onPress, onRelease],
  );

  const dirAt = (e: React.PointerEvent<HTMLDivElement>): DpadDirection | null => {
    const el = rootRef.current;
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const dx = e.clientX - (b.left + b.width / 2);
    const dy = e.clientY - (b.top + b.height / 2);
    // Inside the dead zone, keep whatever is held (no jitter at the centre).
    if (dx * dx + dy * dy < DEAD_ZONE * DEAD_ZONE) return activeRef.current;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
    return dy > 0 ? "down" : "up";
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== null) return; // one pointer owns the pad
    pointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    apply(dirAt(e));
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== e.pointerId) return;
    apply(dirAt(e));
  };
  const onEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== e.pointerId) return;
    pointerRef.current = null;
    apply(null);
  };

  return (
    <div
      ref={rootRef}
      aria-label="虛擬方向鍵"
      className="grid select-none grid-cols-3 grid-rows-3 rounded-2xl border border-border bg-panel/80 p-1 shadow-lg"
      style={{ touchAction: "none" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Cell dir="up" active={active} className="col-start-2 row-start-1" />
      <Cell dir="left" active={active} className="col-start-1 row-start-2" />
      <Cell dir="right" active={active} className="col-start-3 row-start-2" />
      <Cell dir="down" active={active} className="col-start-2 row-start-3" />
    </div>
  );
}

const CHEVRON_ROTATION: Record<DpadDirection, string> = {
  up: "",
  right: "rotate-90",
  down: "rotate-180",
  left: "-rotate-90",
};

/** Purely visual: the container's pointer handlers do all the work. */
function Cell({
  dir,
  active,
  className,
}: {
  dir: DpadDirection;
  active: DpadDirection | null;
  className: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
        active === dir ? "bg-accent text-accent-fg" : "text-muted"
      } ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-5 w-5 ${CHEVRON_ROTATION[dir]}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 15l6-6 6 6" />
      </svg>
    </div>
  );
}
