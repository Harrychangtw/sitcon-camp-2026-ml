import { InfoLabel } from "./InfoLabel";

export interface BlockToggleOption<T extends string> {
  label: string;
  value: T;
}

export interface BlockToggleProps<T extends string> {
  label: string;
  /** Optional hover tooltip on the label (e.g. what this control does). */
  info?: string;
  /** Always-visible one-line plain-language identity under the label. */
  gloss?: string;
  value: T;
  options: ReadonlyArray<BlockToggleOption<T>>;
  onChange: (value: T) => void;
  /** Grey out the whole toggle (mirrors BlockSlider's disabled). */
  disabled?: boolean;
}

/**
 * A blocky, full-width pick-one toggle for the bottom dock. Renders as one
 * `group/control` row spanning both `DockControls` columns (subgrid keeps the
 * `[label | segments]` cells aligned with sibling rows), so hovering anywhere
 * on the row — segments included — reveals the `info` panel. The selected
 * segment is the lime mark; segments split the control column evenly. Generic
 * over a string-literal union for type-safe `value`/`onChange`.
 */
export function BlockToggle<T extends string>({
  label,
  info,
  gloss,
  value,
  options,
  onChange,
  disabled = false,
}: BlockToggleProps<T>) {
  return (
    <div className="group/control col-span-2 grid grid-cols-subgrid items-center">
      <InfoLabel label={label} info={info} gloss={gloss} disabled={disabled} />
      <div className={`flex rounded-md bg-bg p-0.5 ${disabled ? "opacity-50" : ""}`}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`flex-1 whitespace-nowrap rounded-sm px-2 py-1 text-sm transition-colors disabled:cursor-not-allowed ${
              opt.value === value
                ? disabled
                  ? "bg-border text-fg"
                  : "bg-accent text-accent-fg"
                : "text-muted hover:text-fg disabled:hover:text-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
