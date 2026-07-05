import { useState, type ReactNode } from "react";

export interface SuggestPreset {
  /** What the chip shows. */
  label: string;
  /** What gets typed into the field when the chip is picked. */
  value: string;
}

export interface SuggestInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired on Enter and when a preset chip is picked. */
  onSubmit?: (value: string) => void;
  placeholder?: string;
  /**
   * Prebuilt examples. Shown as a chip tray ONLY while the field is focused and
   * empty — the "try one of these" affordance. Picking a chip fills + submits.
   */
  presets?: ReadonlyArray<SuggestPreset>;
  /** Small heading above the chip tray. */
  presetLabel?: string;
  /** Optional status line rendered under the field (e.g. a `<LiveStatus />`). */
  status?: ReactNode;
  /** Accessible label for the raw input. */
  ariaLabel?: string;
  /** Width utility for the field; defaults to a comfortable dock width. */
  className?: string;
}

/**
 * A text field whose prebuilt examples surface as selectable chips the moment it
 * gains focus while empty, then get out of the way once the student types. Built
 * for the bottom dock, so the chip tray opens UPWARD. Layout-only + local focus
 * state; the value itself is owned by the station.
 */
export function SuggestInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  presets = [],
  presetLabel = "試試看",
  status,
  ariaLabel,
  className,
}: SuggestInputProps) {
  const [focused, setFocused] = useState(false);
  const showPresets = focused && value.trim() === "" && presets.length > 0;

  return (
    // Fills the dock's height (respecting its padding); the box IS the field,
    // with the arrow + status floated inside its bottom band.
    <div className={`relative h-full ${className ?? "w-72 max-w-[75vw]"}`}>
      {/* The box fills the dock height. The input sits at the TOP (text starts
          top-left); the arrow + status are pinned to the bottom band. */}
      <div className="relative flex h-full min-h-[3.5rem] flex-col rounded-md bg-bg focus-within:ring-2 focus-within:ring-accent/50">
        <input
          type="text"
          value={value}
          aria-label={ariaLabel}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          // Delay so a chip's mousedown/click still registers before we hide it.
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit?.(value);
          }}
          placeholder={placeholder}
          className="w-full flex-none bg-transparent px-3.5 pt-3 text-sm text-fg placeholder:text-muted focus:outline-none"
        />

        {status ? (
          <div className="pointer-events-none absolute bottom-2.5 left-3.5 right-14 truncate">
            {status}
          </div>
        ) : null}

        {onSubmit ? (
          <button
            type="button"
            aria-label="送出"
            disabled={value.trim() === ""}
            // mousedown fires before the input's blur, so the click still lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSubmit(value)}
            className="absolute bottom-2 right-2 flex h-7 w-10 items-center justify-center rounded border border-border bg-panel text-muted transition-all hover:border-accent hover:text-accent hover:shadow-[0_0_10px] hover:shadow-accent/50 disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted disabled:hover:shadow-none"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="13 6 19 12 13 18" />
            </svg>
          </button>
        ) : null}
      </div>

      {showPresets ? (
        // Opens upward (bottom-full): the field lives in a bottom-anchored dock.
        <div className="absolute bottom-full left-0 z-20 mb-2 w-max min-w-full max-w-[min(24rem,80vw)] rounded-sm border border-border bg-panel p-2 shadow-lg">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-muted">
            {presetLabel}
          </div>
          {/* Stacked vertically — one row per option, full-width, so they're
              easy to scan and click. */}
          <div className="flex flex-col gap-1">
            {presets.map((p) => (
              <button
                key={p.value}
                type="button"
                // mousedown fires before the input's blur, so the pick lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(p.value);
                  onSubmit?.(p.value);
                  setFocused(false);
                }}
                className="w-full truncate rounded-sm border border-border bg-bg px-2.5 py-1.5 text-left font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
