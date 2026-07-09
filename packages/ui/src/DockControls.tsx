import type { ReactNode } from "react";

export interface DockControlsProps {
  children: ReactNode;
}

/**
 * Lays out dock controls. On >= md: a vertical stack of `[label | control]`
 * rows in a shared two-column grid, so every control lines up on both edges;
 * children wrap their cells in an `md:col-span-2` subgrid row (`BlockToggle` /
 * `BlockSlider` / `BlockButtons`, which also use the row as a shared hover
 * scope for the `info` panel). Below md (the bottom sheet) it collapses to a
 * single full-width column: each row stacks its label above its control.
 */
export function DockControls({ children }: DockControlsProps) {
  return (
    <div className="flex w-full flex-col gap-3.5 md:grid md:w-auto md:grid-cols-[auto_minmax(8rem,auto)] md:items-center md:gap-x-5 md:gap-y-3.5">
      {children}
    </div>
  );
}
