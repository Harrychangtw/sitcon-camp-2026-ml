import { InfoLabel } from "./InfoLabel";
import { useCoarsePointer } from "./useCoarsePointer";

export interface BlockSliderProps {
  label: string;
  /** Optional hover tooltip on the label (e.g. what this control does). */
  info?: string;
  /** Always-visible one-line plain-language identity under the label. */
  gloss?: string;
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
 * with a slim vertical handle. On fine pointers the gradient is faded and the
 * value hidden at rest; hover fills the gradient, thickens the handle, and pops
 * the exact value above it. On coarse pointers (touch) nothing is hover-gated:
 * the track grows to 44px, the thumb to 20px, the gradient stays filled, and
 * the value bubble rides the thumb inside the track.
 *
 * Renders as one `group/control` row: on >= md it spans both `DockControls`
 * columns (subgrid keeps the `[label | control]` cells aligned with sibling
 * rows); below md it stacks the label above a full-width track.
 */
export function BlockSlider({
  label,
  info,
  gloss,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  disabled = false,
  ariaLabel,
}: BlockSliderProps) {
  const coarse = useCoarsePointer();
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  // One notch per step, evenly spaced across the track. Skip when there'd be
  // an unreasonable number of them (a near-continuous slider).
  const steps = Math.round((max - min) / step);
  const tickCount = steps > 0 && steps <= 40 ? steps + 1 : 0;
  const trackH = coarse ? "h-11" : "h-7";
  const thumbCls = coarse
    ? "[&::-webkit-slider-thumb]:h-11 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded [&::-moz-range-thumb]:h-11 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded"
    : "[&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-1 [&::-webkit-slider-thumb]:rounded-[1px] [&::-webkit-slider-thumb]:transition-[width] [&::-webkit-slider-thumb]:duration-150 group-hover/blockslider:[&::-webkit-slider-thumb]:w-2 [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-1 [&::-moz-range-thumb]:rounded-[1px] [&::-moz-range-thumb]:transition-[width] [&::-moz-range-thumb]:duration-150 group-hover/blockslider:[&::-moz-range-thumb]:w-2";
  return (
    <div className="group/control flex flex-col gap-1.5 md:col-span-2 md:grid md:grid-cols-subgrid md:items-center">
      <InfoLabel label={label} info={info} gloss={gloss} disabled={disabled} />
      <div
        className={`group/blockslider relative flex items-center ${trackH} ${
          disabled ? "opacity-50" : ""
        }`}
      >
        {/* Value bubble. Fine pointers: pops up above the handle on hover.
            Coarse pointers: always visible, riding the thumb inside the track
            (clamped so it never spills past either edge). */}
        <div
          className={`pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-sm border border-border bg-panel px-2 py-0.5 font-mono text-xs text-fg shadow-md transition-all duration-150 ${
            coarse
              ? "top-1/2 -translate-y-1/2 scale-100 opacity-100"
              : "-top-7 scale-90 opacity-0 group-hover/blockslider:scale-100 group-hover/blockslider:opacity-100"
          }`}
          style={{
            left: coarse
              ? `clamp(1.75rem, ${pct}%, calc(100% - 1.75rem))`
              : `${pct}%`,
          }}
        >
          {format ? format(value) : value}
        </div>
        {/* Gradient fill on its own layer so only IT fades when idle; the
            outline and handle keep full weight. Always filled on touch. */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 rounded-md transition-opacity duration-150 ${
            coarse
              ? "opacity-100"
              : "opacity-50 group-hover/blockslider:opacity-100"
          }`}
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
          className={`relative w-full cursor-pointer appearance-none rounded-md bg-transparent disabled:cursor-not-allowed ${trackH} [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-fg [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:rounded-md [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-fg ${thumbCls}`}
        />
      </div>
    </div>
  );
}
