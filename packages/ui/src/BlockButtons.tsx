export interface BlockButtonsItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Render as the lime primary action. */
  primary?: boolean;
}

export interface BlockButtonsProps {
  label: string;
  buttons: ReadonlyArray<BlockButtonsItem>;
}

/**
 * A row of compact action buttons for the bottom dock (step ←/→, play, shuffle,
 * reset). Renders as a `[label | buttons]` row that aligns inside
 * `DockControls` (subgrid cells on >= md, label stacked above the buttons
 * below md); buttons split the control column evenly, in the same blocky
 * visual language as `BlockToggle`. Buttons grow to a 44px touch height in
 * the mobile sheet.
 */
export function BlockButtons({ label, buttons }: BlockButtonsProps) {
  return (
    <div className="flex flex-col gap-1.5 md:col-span-2 md:grid md:grid-cols-subgrid md:items-center">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap gap-0.5 rounded-md bg-bg p-0.5 md:flex-nowrap">
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={b.onClick}
            disabled={b.disabled}
            className={`flex-1 whitespace-nowrap rounded-sm px-2 py-1 text-sm transition-colors disabled:opacity-40 max-md:min-h-11 max-md:min-w-[22%] ${
              b.primary
                ? "bg-accent text-accent-fg"
                : "text-muted hover:text-fg disabled:hover:text-muted"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
