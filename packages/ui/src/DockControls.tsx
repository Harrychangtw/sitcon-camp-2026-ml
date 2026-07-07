import type { ReactNode } from "react";

export interface DockControlsProps {
  children: ReactNode;
}

/**
 * Lays out dock controls as a vertical stack of `[label | control]` rows in a
 * shared two-column grid, so every control lines up on both edges. A child
 * either emits its label cell + control cell as flat siblings (`BlockButtons`)
 * or wraps them in a `col-span-2` subgrid row (`BlockToggle` / `BlockSlider`,
 * which use the row as a shared hover scope for the `info` panel); both
 * auto-flow into the same column tracks.
 */
export function DockControls({ children }: DockControlsProps) {
  return (
    <div className="grid grid-cols-[auto_minmax(8rem,auto)] items-center gap-x-5 gap-y-3.5">
      {children}
    </div>
  );
}
