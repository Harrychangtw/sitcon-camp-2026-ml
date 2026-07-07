export interface InfoLabelProps {
  label: string;
  /**
   * When set, a small persistent (i) marker sits next to the label, and this
   * text folds out above on hover — of the label itself, or of the whole
   * control row when the parent wraps it in a `group/control` scope
   * (`BlockSlider` / `BlockToggle` do).
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
 * given, an always-visible (i) marker signals that an explanation exists, and
 * the `info` copy folds out above when the label — or the surrounding
 * `group/control` row — is hovered. CSS-only (group-hover, theme tokens), no
 * state.
 */
export function InfoLabel({ label, info, gloss, disabled = false }: InfoLabelProps) {
  const base = `text-sm font-medium ${disabled ? "text-muted" : ""}`;
  const labelEl = !info ? (
    <span className={base}>{label}</span>
  ) : (
    <span
      className={`group/infolabel relative inline-flex cursor-help items-center gap-1.5 ${base}`}
    >
      {label}
      {/* Persistent (i) marker — the obvious cue that hovering explains. */}
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 shrink-0 text-muted transition-colors duration-150 group-hover/control:text-accent group-hover/infolabel:text-accent"
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
      <span className="pointer-events-none absolute bottom-full left-0 z-40 mb-1.5 w-max max-w-[16rem] rounded-md border border-border bg-panel px-3 py-2 text-xs font-normal leading-relaxed text-fg opacity-0 shadow-md transition-opacity duration-150 group-hover/control:opacity-100 group-hover/infolabel:opacity-100">
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
