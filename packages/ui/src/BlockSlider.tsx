export interface BlockSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Formats the pop-up value bubble; defaults to `String(value)`. */
  format?: (value: number) => string;
  /** Dim + lock the control (e.g. a mode makes it irrelevant). */
  disabled?: boolean;
  ariaLabel?: string;
}

/**
 * A blocky range control for the bottom dock: a tall gradient block (dark → lime)
 * with a slim vertical handle. Idle, the gradient is faded and the value hidden;
 * on hover the gradient fills in, the handle thickens, and the exact value folds
 * out above the handle. The outline and handle stay at full weight regardless.
 *
 * Renders as a `[label | control]` pair (two grid cells) so it aligns inside
 * `DockControls`.
 */
export function BlockSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  disabled = false,
  ariaLabel,
}: BlockSliderProps) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  // One notch per step, evenly spaced across the track. Skip when there'd be
  // an unreasonable number of them (a near-continuous slider).
  const steps = Math.round((max - min) / step);
  const tickCount = steps > 0 && steps <= 40 ? steps + 1 : 0;
  return (
    <>
      <span className={`text-sm font-medium ${disabled ? "text-muted" : ""}`}>
        {label}
      </span>
      <div
        className={`group/blockslider relative flex h-7 items-center ${
          disabled ? "opacity-50" : ""
        }`}
      >
        {/* Value bubble — pops up above the handle only while hovering. */}
        <div
          className="pointer-events-none absolute -top-7 z-10 -translate-x-1/2 scale-90 rounded-sm border border-border bg-panel px-2 py-0.5 font-mono text-xs text-fg opacity-0 shadow-md transition-all duration-150 group-hover/blockslider:scale-100 group-hover/blockslider:opacity-100"
          style={{ left: `${pct}%` }}
        >
          {format ? format(value) : value}
        </div>
        {/* Gradient fill on its own layer so only IT fades when idle; the
            outline and handle keep full weight. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-md opacity-50 transition-opacity duration-150 group-hover/blockslider:opacity-100"
          style={{
            background:
              "linear-gradient(to right, rgb(var(--camp-bg)), rgb(var(--camp-accent)))",
          }}
        />
        {/* Step ticks — evenly spaced notches along the bottom of the track.
            `inset-x` matches the slim handle's inset so ticks line up with the
            positions the handle can actually land on. */}
        {tickCount ? (
          <div className="pointer-events-none absolute inset-x-1.5 bottom-1 flex justify-between">
            {Array.from({ length: tickCount }, (_, i) => (
              <span key={i} className="h-1.5 w-px bg-fg/30" />
            ))}
          </div>
        ) : null}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={ariaLabel ?? label}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative h-7 w-full cursor-pointer appearance-none rounded-md bg-transparent disabled:cursor-not-allowed [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-1 [&::-moz-range-thumb]:rounded-[1px] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-fg [&::-moz-range-thumb]:transition-[width] [&::-moz-range-thumb]:duration-150 group-hover/blockslider:[&::-moz-range-thumb]:w-2 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:rounded-md [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-1 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[1px] [&::-webkit-slider-thumb]:bg-fg [&::-webkit-slider-thumb]:transition-[width] [&::-webkit-slider-thumb]:duration-150 group-hover/blockslider:[&::-webkit-slider-thumb]:w-2"
        />
      </div>
    </>
  );
}
