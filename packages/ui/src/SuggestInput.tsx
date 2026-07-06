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
  /**
   * Optional status line (e.g. a `<LiveStatus />`) pinned to the box's bottom
   * band. A gradient scrim fades the input text out behind it, so a long value
   * never overlaps the status line.
   */
  status?: ReactNode;
  /**
   * Optional action buttons rendered in the submit-arrow position (the box's
   * bottom-right). When set, they replace the arrow — for stations that are
   * live-on-type but still carry a couple of small actions (e.g. 打亂/還原).
   */
  actions?: ReactNode;
  /** Accessible label for the raw input. */
  ariaLabel?: string;
  /**
   * Hard character cap. Enforced natively on the field (typing/paste can't
   * exceed it) so the backend's length-cap 422 never fires. Once the value hits
   * the cap, a hint floats above the whole dock to say why input stopped.
   */
  maxLength?: number;
  /**
   * The hint copy shown above the dock when the cap is reached. Defaults to
   * "最多 N 字" from `maxLength`; set it for count-based caps the field can't
   * express as characters (e.g. "最多 12 個詞"), paired with `capReached`.
   */
  capLabel?: string;
  /**
   * For count-based caps: the cap has been hit/exceeded → show the hint. (For a
   * plain `maxLength`, "reached" is detected from the value length instead.)
   */
  capReached?: boolean;
  /**
   * Keep a fixed height and scroll horizontally for long text (default). Set
   * true to grow vertically with the content (capped, then scrolls) for fields
   * that are naturally multi-line.
   */
  multiline?: boolean;
  /** Width utility for the field; defaults to a comfortable dock width. */
  className?: string;
}

/**
 * A text field whose prebuilt examples surface as selectable chips the moment it
 * gains focus while empty, then get out of the way once the student types. Built
 * for the bottom dock, so the chip tray opens UPWARD. The field keeps a fixed
 * height and scrolls for long text (opt into vertical growth with `multiline`).
 * Layout-only + local focus state; the value itself is owned by the station.
 */
export function SuggestInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  presets = [],
  presetLabel = "試試看",
  status,
  actions,
  ariaLabel,
  maxLength,
  capLabel,
  capReached,
  multiline = false,
  className,
}: SuggestInputProps) {
  const [focused, setFocused] = useState(false);
  const showPresets = focused && value.trim() === "" && presets.length > 0;

  // Cap hint above the box. `capLabel` (a count-based cap the station enforces)
  // wins; otherwise `maxLength` auto-labels itself and detects "at cap" from the
  // value length. Warning tone once the cap is reached.
  const capText = capLabel ?? (maxLength != null ? `最多 ${maxLength} 字` : null);
  const atCap =
    capLabel != null
      ? Boolean(capReached)
      : maxLength != null && value.length >= maxLength;

  return (
    // Fills the dock's height (respecting its padding); the box IS the field,
    // with the arrow + status floated inside its bottom band.
    <div className={`relative h-full ${className ?? "w-72 max-w-[75vw]"}`}>
      {/* Cap hint — only once the limit is reached. Floats ABOVE the whole dock
          (the `mb` clears the dock's p-3 + border so it sits over the panel's
          top edge, not inside it). The field is non-empty at the cap, so the
          preset tray is closed and can't collide. */}
      {capText && atCap ? (
        <div className="pointer-events-none absolute bottom-full left-1 z-20 mb-[1.125rem] flex items-center gap-1 whitespace-nowrap font-mono text-[11px] leading-none text-warning">
          <svg
            viewBox="0 0 24 24"
            className="h-3 w-3 flex-none"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>{capText}</span>
        </div>
      ) : null}
      {/* The box fills the dock height. The input sits at the TOP (text starts
          top-left); the arrow + status are pinned to the bottom band. */}
      <div className="relative flex h-full min-h-[3.5rem] flex-col rounded-md bg-bg focus-within:ring-2 focus-within:ring-accent/50">
        {multiline ? (
          <textarea
            rows={1}
            value={value}
            maxLength={maxLength}
            aria-label={ariaLabel}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            // Delay so a chip's mousedown/click still registers before we hide it.
            onBlur={() => window.setTimeout(() => setFocused(false), 120)}
            onKeyDown={(e) => {
              // Enter submits when there's a submit handler; Shift+Enter keeps
              // the newline. Without a handler, Enter types a newline as usual.
              if (e.key === "Enter" && onSubmit && !e.shiftKey) {
                e.preventDefault();
                onSubmit(value);
              }
            }}
            placeholder={placeholder}
            // Collapsed to ~1 line at rest; snaps open to a fixed 3× height
            // (10.5rem) on focus regardless of how much text is in it, and
            // retracts on blur. Content taller than the open box scrolls.
            className={`w-full flex-none resize-none overflow-y-auto bg-transparent px-3.5 pb-8 pt-3 text-sm text-fg placeholder:text-muted transition-[height] duration-200 focus:outline-none ${
              focused ? "h-[10.5rem]" : "h-[3.5rem]"
            }`}
          />
        ) : (
          <input
            type="text"
            value={value}
            maxLength={maxLength}
            aria-label={ariaLabel}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            // Delay so a chip's mousedown/click still registers before we hide it.
            onBlur={() => window.setTimeout(() => setFocused(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit?.(value);
            }}
            placeholder={placeholder}
            className="w-full flex-none bg-transparent px-3.5 pb-8 pt-3 text-sm text-fg placeholder:text-muted focus:outline-none"
          />
        )}

        {/* Scrim: fade the input text into the box bg over the bottom band, so a
            long (scrolled) value never bleeds through the status line / arrow.
            Solid bg at the very bottom, transparent by the top of the band. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-md bg-gradient-to-t from-bg via-bg to-transparent" />

        {status ? (
          <div
            className={`pointer-events-none absolute bottom-2.5 left-3.5 truncate ${
              actions ? "right-28" : "right-14"
            }`}
          >
            {status}
          </div>
        ) : null}

        {actions ? (
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            {actions}
          </div>
        ) : onSubmit ? (
          <button
            type="button"
            aria-label="送出"
            disabled={value.trim() === ""}
            // mousedown fires before the input's blur, so the click still lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSubmit(value)}
            // Borderless: fills accent (lime) as soon as there's input.
            className="absolute bottom-2 right-2 flex h-7 w-10 items-center justify-center rounded bg-accent text-accent-fg transition-all hover:shadow-[0_0_10px] hover:shadow-accent/50 disabled:bg-panel disabled:text-muted disabled:opacity-40 disabled:hover:shadow-none"
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
        <div className="absolute bottom-full left-0 z-20 mb-2 w-max min-w-full max-w-[min(24rem,80vw)] rounded-sm bg-panel p-2 shadow-lg">
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
                className="w-full truncate rounded-sm bg-bg px-2.5 py-1.5 text-left font-mono text-xs text-muted transition-colors hover:text-accent"
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
