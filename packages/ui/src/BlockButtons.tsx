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
 * reset). Renders as a `[label | buttons]` pair (two grid cells) so it aligns
 * inside `DockControls`; buttons split the control column evenly, in the same
 * blocky visual language as `BlockToggle`.
 */
export function BlockButtons({ label, buttons }: BlockButtonsProps) {
  return (
    <>
      <span className="text-sm font-medium">{label}</span>
      <div className="flex gap-0.5 rounded-md bg-bg p-0.5">
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={b.onClick}
            disabled={b.disabled}
            className={`flex-1 whitespace-nowrap rounded-sm px-2 py-1 text-sm transition-colors disabled:opacity-40 ${
              b.primary
                ? "bg-accent text-accent-fg"
                : "text-muted hover:text-fg disabled:hover:text-muted"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
    </>
  );
}
