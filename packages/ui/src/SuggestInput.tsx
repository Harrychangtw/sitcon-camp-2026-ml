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
   * The text most recently submitted (via Enter, the 送出 button, or a preset
   * pick). When set, the submit button gains a third state: while the current
   * value (trimmed) equals it, the button turns idle and reads 已送出 — nothing
   * new to send until the student edits. Omit to keep the two-state behavior
   * (disabled when empty, active otherwise).
   */
  submittedValue?: string | null;
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
  submittedValue,
  maxLength,
  capLabel,
  capReached,
  multiline = false,
  className,
}: SuggestInputProps) {
  const [focused, setFocused] = useState(false);
  const showPresets = focused && value.trim() === "" && presets.length > 0;

  // Submit-button state. Three legible states when `submittedValue` is wired:
  // empty → disabled; unchanged since the last submit → idle 已送出; edited →
  // active 送出. Without the prop, `unchanged` is always false (two states).
  const trimmed = value.trim();
  const unchanged =
    submittedValue != null &&
    trimmed !== "" &&
    trimmed === submittedValue.trim();

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
    // with the arrow + status floated inside its bottom band. Full width in
    // the mobile bottom sheet, the classic dock width on >= md.
    <div
      className={`relative flex h-full flex-col ${
        className ?? "w-full md:w-72 md:max-w-[75vw]"
      }`}
    >
      {/* Cap hint — only once the limit is reached. On >= md it floats ABOVE
          the whole dock (the `mb` clears the dock's p-3 + border so it sits
          over the panel's top edge, not inside it); below md (inside the
          scrollable sheet, where floating up would clip) it sits in flow just
          above the box. The field is non-empty at the cap, so the preset tray
          is closed and can't collide. */}
      {capText && atCap ? (
        <div className="pointer-events-none mb-1 flex items-center gap-1 whitespace-nowrap font-mono text-[11px] leading-none text-warning md:absolute md:bottom-full md:left-1 md:z-20 md:mb-[1.125rem]">
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
      <div className="relative flex min-h-[3.5rem] flex-1 flex-col rounded-md bg-bg focus-within:ring-2 focus-within:ring-accent/50">
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
            // on focus regardless of how much text is in it, and retracts on
            // blur. Content taller than the open box scrolls. The dvh cap
            // keeps the open box short on phones, where the on-screen
            // keyboard is eating the viewport at the same time.
            className={`w-full flex-none resize-none overflow-y-auto bg-transparent px-3.5 pb-8 pt-3 text-sm text-fg placeholder:text-muted transition-[height] duration-200 focus:outline-none ${
              focused ? "h-[12rem] max-h-[30dvh]" : "h-[4rem]"
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
              actions ? "right-28" : onSubmit ? "right-[4.5rem]" : "right-14"
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
          // A labeled 送出 button (was an arrow glyph students read as
          // decoration). Enter still submits. Borderless: fills accent (lime)
          // as soon as there's something new to send; once the current text has
          // been submitted it idles as a muted 已送出 until the student edits.
          <button
            type="button"
            disabled={trimmed === "" || unchanged}
            // pointerdown fires before the input's blur on BOTH mouse and
            // touch, so canceling it keeps focus and the click still lands.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onSubmit(value)}
            // after: extends the touch hit area to ~44px without growing the button.
            className={`absolute bottom-2 right-2 flex h-7 min-w-[3.5rem] items-center justify-center rounded px-2 font-mono text-xs leading-none transition-all after:absolute after:-inset-2 after:content-[''] ${
              unchanged
                ? "bg-panel text-muted"
                : "bg-accent text-accent-fg hover:shadow-[0_0_10px] hover:shadow-accent/50 disabled:bg-panel disabled:text-muted disabled:opacity-40 disabled:hover:shadow-none"
            }`}
          >
            {unchanged ? "已送出" : "送出"}
          </button>
        ) : null}
      </div>

      {showPresets ? (
        // On >= md it opens upward (bottom-full): the field lives in a
        // bottom-anchored dock. Below md (inside the scrollable sheet, where
        // floating up would clip) it expands in flow under the box instead.
        <div className="mt-2 w-full rounded-sm bg-panel p-2 shadow-lg md:absolute md:bottom-full md:left-0 md:z-20 md:mb-2 md:mt-0 md:w-max md:min-w-full md:max-w-[min(24rem,80vw)]">
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
                // pointerdown fires before the input's blur on BOTH mouse and
                // touch, so the pick lands before the tray hides.
                onPointerDown={(e) => {
                  e.preventDefault();
                  onChange(p.value);
                  onSubmit?.(p.value);
                  setFocused(false);
                }}
                className="w-full truncate rounded-sm bg-bg px-2.5 py-2.5 text-left font-mono text-xs text-muted transition-colors hover:text-accent md:py-1.5"
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
