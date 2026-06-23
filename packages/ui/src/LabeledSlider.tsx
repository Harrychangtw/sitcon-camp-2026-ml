export interface LabeledSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Optional formatter for the numeric readout (defaults to String). */
  format?: (value: number) => string;
}

/** A range input with a label and a live, monospaced numeric readout. */
export function LabeledSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: LabeledSliderProps) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-xs text-muted">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </label>
  );
}
