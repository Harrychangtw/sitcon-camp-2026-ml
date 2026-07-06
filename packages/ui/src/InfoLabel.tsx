export interface InfoLabelProps {
  label: string;
  /** When set, the label gets a dotted underline and reveals this text on hover. */
  info?: string;
  /** Dim the label to match a disabled control. */
  disabled?: boolean;
}

/**
 * A control label for the bottom dock. Plain text by default; when `info` is
 * given it becomes a hover target — dotted underline + `cursor-help`, and the
 * `info` copy folds out above on hover. Mirrors the "影響" tooltip in the RNN
 * station (CSS group-hover, no state, theme tokens).
 */
export function InfoLabel({ label, info, disabled = false }: InfoLabelProps) {
  const base = `text-sm font-medium ${disabled ? "text-muted" : ""}`;
  if (!info) {
    return <span className={base}>{label}</span>;
  }
  return (
    <span className={`group/infolabel relative ${base}`}>
      <span className="cursor-help underline decoration-dotted decoration-muted underline-offset-2">
        {label}
      </span>
      <span className="pointer-events-none absolute bottom-full left-0 z-40 mb-1.5 w-max max-w-[16rem] rounded-md border border-border bg-panel px-3 py-2 text-xs font-normal leading-relaxed text-fg opacity-0 shadow-md transition-opacity duration-150 group-hover/infolabel:opacity-100">
        {info}
      </span>
    </span>
  );
}
