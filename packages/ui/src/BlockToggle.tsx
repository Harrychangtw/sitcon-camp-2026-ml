export interface BlockToggleOption<T extends string> {
  label: string;
  value: T;
}

export interface BlockToggleProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<BlockToggleOption<T>>;
  onChange: (value: T) => void;
}

/**
 * A blocky, full-width pick-one toggle for the bottom dock. Renders as a
 * `[label | segments]` pair (two grid cells) so it aligns inside `DockControls`.
 * The selected segment is the lime mark; segments split the control column
 * evenly. Generic over a string-literal union for type-safe `value`/`onChange`.
 */
export function BlockToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: BlockToggleProps<T>) {
  return (
    <>
      <span className="text-sm font-medium">{label}</span>
      <div className="flex rounded-md bg-bg p-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 whitespace-nowrap rounded-sm px-2 py-1 text-sm transition-colors ${
              opt.value === value
                ? "bg-accent text-accent-fg"
                : "text-muted hover:text-fg"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </>
  );
}
