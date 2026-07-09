import { useEffect, useRef, useState } from "react";

export interface InfoLabelProps {
  label: string;
  /**
   * When set, a small persistent (i) button sits next to the label. The text
   * folds out on hover (of the label itself, or of the whole control row when
   * the parent wraps it in a `group/control` scope; `BlockSlider` /
   * `BlockToggle` do) and toggles on tap/click everywhere, so touch devices
   * can reach it too.
   */
  info?: string;
  /**
   * A one-line plain-language identity of the control, ALWAYS visible under
   * the label (no hover needed). Use for "what is this / what does it change";
   * keep the longer nuance in `info`.
   */
  gloss?: string;
  /** Dim the label to match a disabled control. */
  disabled?: boolean;
}

/**
 * A control label for the bottom dock. Plain text by default; when `info` is
 * given, an always-visible (i) button signals that an explanation exists. The
 * `info` copy shows on hover (hover-capable devices) and toggles on tap/click.
 * On >= md it floats above the row; below md (inside the scrollable bottom
 * sheet, where a floating panel would clip) it expands inline under the label.
 */
export function InfoLabel({ label, info, gloss, disabled = false }: InfoLabelProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Close on outside tap and Escape, only while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const base = `text-sm font-medium ${disabled ? "text-muted" : ""}`;
  const labelEl = !info ? (
    <span className={base}>{label}</span>
  ) : (
    <span
      ref={ref}
      className={`group/infolabel relative inline-flex flex-wrap items-center gap-1.5 [@media(hover:hover)]:cursor-help ${base}`}
    >
      {label}
      {/* Persistent (i) — a real button so touch can toggle the explanation.
          after: extends the hit area to ~44px without growing the glyph. */}
      <button
        type="button"
        aria-label={`${label} 說明`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex shrink-0 items-center justify-center after:absolute after:-inset-3.5 after:content-['']"
      >
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className={`h-3.5 w-3.5 shrink-0 transition-colors duration-150 ${
            open
              ? "text-accent"
              : "text-muted [@media(hover:hover)]:group-hover/control:text-accent [@media(hover:hover)]:group-hover/infolabel:text-accent"
          }`}
        >
          <circle
            cx="8"
            cy="8"
            r="6.75"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx="8" cy="4.9" r="1.1" fill="currentColor" />
          <rect x="7.3" y="7" width="1.4" height="4.6" rx="0.7" fill="currentColor" />
        </svg>
      </button>
      {/* The info panel. Below md it expands inline (full width, pushes the
          sheet content, so it can never clip against the sheet's scroll box);
          on >= md it floats above the row like a tooltip. */}
      <span
        className={`rounded-md border border-border bg-panel px-3 py-2 text-xs font-normal leading-relaxed text-fg shadow-md md:pointer-events-none md:absolute md:bottom-full md:left-0 md:z-40 md:mb-1.5 md:block md:w-max md:max-w-[min(16rem,calc(100vw-2rem))] md:transition-opacity md:duration-150 ${
          open ? "mt-1 block w-full basis-full" : "hidden"
        } ${
          open
            ? "md:opacity-100"
            : "md:opacity-0 [@media(hover:hover)]:md:group-hover/control:opacity-100 [@media(hover:hover)]:md:group-hover/infolabel:opacity-100"
        }`}
      >
        {info}
      </span>
    </span>
  );
  if (!gloss) return labelEl;
  // The always-visible plain-language identity: quiet secondary prose under
  // the label, never hover-gated.
  return (
    <span className="flex flex-col gap-0.5">
      {labelEl}
      <span
        className={`max-w-[13rem] text-[11px] font-normal leading-snug text-muted ${
          disabled ? "opacity-60" : ""
        }`}
      >
        {gloss}
      </span>
    </span>
  );
}
