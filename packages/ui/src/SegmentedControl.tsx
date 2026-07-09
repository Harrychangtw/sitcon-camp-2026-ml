export interface SegmentedOption<T extends string> {
  label: string;
  value: T;
}

export interface SegmentedControlProps<T extends string> {
  label?: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
}

/**
 * A horizontal pick-one control. Generic over a string-literal union so the
 * `value`/`onChange` stay type-safe, e.g.
 *   <SegmentedControl<"mlp" | "rnn"> ... />
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div>
      {label ? <div className="mb-1 text-sm font-medium">{label}</div> : null}
      <div className="inline-flex rounded-md border border-border bg-panel p-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center justify-center rounded px-3 py-1 text-sm transition-colors max-md:min-h-11 ${
              opt.value === value
                ? "bg-accent text-accent-fg"
                : "text-muted hover:text-fg"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
