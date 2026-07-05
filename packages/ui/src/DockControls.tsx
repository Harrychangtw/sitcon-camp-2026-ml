import type { ReactNode } from "react";

export interface DockControlsProps {
  children: ReactNode;
}

/**
 * Lays out dock controls as a vertical stack of `[label | control]` rows in a
 * shared two-column grid, so every control lines up on both edges. Each child
 * control (`BlockToggle` / `BlockSlider`) emits exactly its label cell + control
 * cell, and the grid auto-flows them into the columns.
 */
export function DockControls({ children }: DockControlsProps) {
  return (
    <div className="grid grid-cols-[auto_8rem] items-center gap-x-5 gap-y-3.5">
      {children}
    </div>
  );
}
