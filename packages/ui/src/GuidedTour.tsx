import { useEffect, useState, type ReactNode } from "react";

export interface GuidedTourStep {
  /** Short mono heading for the step (e.g. "同一顆模型"). */
  title: string;
  /** One or two plain-language sentences. */
  body: ReactNode;
}

export interface GuidedTourProps {
  /**
   * localStorage key that marks the tour as seen. Namespaced per station
   * (e.g. "camp-tour-lora") so each station tours once per browser.
   */
  storageKey: string;
  steps: ReadonlyArray<GuidedTourStep>;
  /** Fired when the tour closes (finished or skipped). */
  onClose?: () => void;
}

/**
 * A skippable first-load walkthrough: a centered card over a dim scrim that
 * steps through a handful of "here's the loop" slides. Purely presentational +
 * a localStorage seen-flag — it knows nothing about the station's state; the
 * station just mounts it and the tour shows itself only on the first visit.
 *
 * SSR-safe: visibility starts false and localStorage is only touched inside an
 * effect, so rendering on the server (or before hydration) draws nothing.
 */
export function GuidedTour({ storageKey, steps, onClose }: GuidedTourProps) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // First visit only. localStorage can throw (private mode / blocked
    // storage) — treat that as "already seen" so the tour never traps anyone.
    try {
      if (window.localStorage.getItem(storageKey) === null) setVisible(true);
    } catch {
      /* storage unavailable → skip the tour */
    }
  }, [storageKey]);

  if (!visible || steps.length === 0) return null;

  const close = () => {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* best-effort — worst case the tour shows again next visit */
    }
    setVisible(false);
    onClose?.();
  };

  const last = step === steps.length - 1;
  const current = steps[step]!;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="導覽"
      className="absolute inset-0 z-[60] flex items-center justify-center bg-bg/70 p-6 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-panel p-6 shadow-lg">
        {/* Step counter — zero-padded mono micro-label. */}
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
            導覽 {String(step + 1).padStart(2, "0")} /{" "}
            {String(steps.length).padStart(2, "0")}
          </span>
          <button
            type="button"
            onClick={close}
            className="font-mono text-[10px] uppercase tracking-wide text-muted transition-colors hover:text-fg"
          >
            略過
          </button>
        </div>

        <h2 className="mb-2 font-semibold uppercase tracking-wider text-accent">
          {current.title}
        </h2>
        <div className="min-h-[3.5rem] text-sm leading-relaxed text-fg">
          {current.body}
        </div>

        <div className="mt-5 flex items-center justify-between">
          {/* Progress dots — the current step is the one lime mark. */}
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === step ? "bg-accent" : "bg-border"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
              >
                上一步
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => (last ? close() : setStep((s) => s + 1))}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg"
            >
              {last ? "開始玩" : "下一步"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
