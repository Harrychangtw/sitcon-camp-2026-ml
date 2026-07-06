/**
 * RNN VIZ — station 05 of Course 2.
 *
 * The first real answer to "how do we handle order": carry a HIDDEN STATE along
 * the sequence. Students type a sentence, step through it token by token and
 * watch the hidden-state vector evolve on a heatmap — then feel the wall: the
 * earliest token's fingerprint washes out of one fixed-size vector (the
 * `influence` trace decays), which motivates attention next.
 *
 * Wave 3: the RNN is REAL — a small GRU language model trained by
 * `camp-precompute train-rnn` on Alice in Wonderland (Qwen is a transformer;
 * reusing it here would defeat the lesson). Presets are recorded outputs of
 * those trained weights; typed sentences are forwarded through the same
 * weights on the live GPU server. The browser NEVER runs the RNN — it replays
 * JSON; the displayed state is a pure function of (sequence, step).
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  BlockSlider,
  DockControls,
  LiveStatus,
  StationLayout,
  SuggestInput,
  type LiveState,
} from "@camp/ui";
import { mix, rgbCss, useThemeColors } from "@camp/viz";
import { liveInferTimed, loadJSON } from "@camp/data";

interface RnnSequence {
  sequenceId: string;
  label: string;
  tokens: string[];
  /** hidden[step] = hidden-state vector after consuming token `step`. */
  hidden: number[][];
  /** influence[step] = normalized lingering influence of the FIRST token. */
  influence: number[];
}

interface Activations {
  hiddenSize: number;
  sequences: RnnSequence[];
}

const DATA_URL = "/data/course2/rnn-viz/activations.json";

// Mirror the server's cap (server/app/routers/rnn.py): the forward pass rejects
// >50 tokens (or a token >30 chars) with a 422. We tokenize with the SAME regex
// the server uses — lowercase a–z runs or single Han chars — so we can cap the
// request before it's sent and surface the limit in the field.
const MAX_RNN_TOKENS = 50;
const RNN_TOKEN_MAX_LEN = 30;
const RNN_TOKEN_RE = /[a-z]+|[一-鿿]/g;

export function RnnVizStation() {
  // 1. STATE
  const [data, setData] = useState<Activations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sequenceId, setSequenceId] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  // 2. LOAD PRECOMPUTED DATA — via @camp/data inside an effect.
  useEffect(() => {
    let alive = true;
    loadJSON<Activations>(DATA_URL)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setSequenceId(d.sequences[0]?.sequenceId ?? null);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  // TYPED INPUT — the primary interaction: any sentence is forwarded through
  // the SAME trained GRU weights on the live GPU server and rendered as one
  // more sequence through the identical viz path. Presets stay precomputed
  // (recorded outputs of the same weights) and keep working offline. Live on
  // type: the effect below is debounced, so keystrokes coalesce into one
  // forward pass; typing a preset's exact text (the chips do this) selects the
  // recorded sequence locally instead.
  const [customText, setCustomText] = useState("");
  const [customSeq, setCustomSeq] = useState<RnnSequence | null>(null);
  const [liveMs, setLiveMs] = useState(0);
  const [livePending, setLivePending] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);
  const [liveShown, setLiveShown] = useState(false);

  const sequences = useMemo<RnnSequence[]>(() => {
    const base = data?.sequences ?? [];
    return customSeq ? [...base, customSeq] : base;
  }, [data, customSeq]);

  const presetIdByText = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of data?.sequences ?? []) m.set(s.tokens.join(" "), s.sequenceId);
    return m;
  }, [data]);

  const trimmedText = customText.trim();

  // Tokenize exactly as the server does, then cap — so the request can never
  // exceed the 24-token limit (which would 422 and silently fall back).
  const rnnTokens = useMemo(
    () => trimmedText.toLowerCase().match(RNN_TOKEN_RE) ?? [],
    [trimmedText],
  );
  const overCap = rnnTokens.length > MAX_RNN_TOKENS;

  useEffect(() => {
    setLiveFailed(false);
    if (!trimmedText) return;
    const presetId = presetIdByText.get(trimmedText);
    if (presetId) {
      setSequenceId(presetId);
      return;
    }
    const capped = rnnTokens
      .slice(0, MAX_RNN_TOKENS)
      .filter((t) => t.length <= RNN_TOKEN_MAX_LEN);
    if (capped.length === 0) return;
    let alive = true;
    setLivePending(true);
    // Debounced: only forward once typing pauses.
    const timer = setTimeout(() => {
      liveInferTimed<RnnSequence>("/rnn/forward", { tokens: capped }).then(
        (r) => {
          if (!alive) return;
          setLivePending(false);
          if (r) {
            setCustomSeq(r.data);
            setLiveMs(r.ms);
            setLiveShown(true);
            setSequenceId(r.data.sequenceId);
          } else {
            setLiveFailed(true);
          }
        },
      );
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
      setLivePending(false);
    };
  }, [trimmedText, rnnTokens, presetIdByText]);

  const seq = useMemo(
    () => sequences.find((s) => s.sequenceId === sequenceId) ?? null,
    [sequences, sequenceId],
  );
  const showingLive = Boolean(seq?.sequenceId.startsWith("live-"));

  const liveState = useMemo<LiveState>(() => {
    if (livePending) return { kind: "pending" };
    if (liveFailed) return { kind: "cached" };
    if (liveShown && showingLive) return { kind: "live", ms: liveMs };
    return { kind: "idle" };
  }, [livePending, liveFailed, liveShown, showingLive, liveMs]);
  const steps = seq?.tokens.length ?? 0;
  const lastStep = Math.max(steps - 1, 0);

  // Reset the step whenever the sequence changes (lengths differ — never index
  // past the shorter one).
  useEffect(() => {
    setStep(0);
  }, [sequenceId]);

  // 3. DERIVED CANVAS DATA — colors are a pure function of the theme. The table
  //    itself renders straight from (seq, step) below: every token sits on the
  //    horizontal axis, but a column the slider hasn't reached yet stays empty.
  //    Diverging fill mirrors @camp/viz Heatmap: grey at 0 → lime (+) / purple
  //    (−), domain fixed at ±1 (tanh range).
  const theme = useThemeColors();
  const zeroColor = useMemo(() => mix(theme.bg, theme.muted, 0.35), [theme]);
  const hiddenColor = (v: number) => {
    const t = Math.max(-1, Math.min(1, v));
    const c =
      t >= 0 ? mix(zeroColor, theme.accent, t) : mix(zeroColor, theme.accent3, -t);
    return rgbCss(c);
  };

  return (
    <StationLayout
      title="RNN 視覺化"
      subtitle="處理順序的一種想法：沿著序列傳遞一個隱藏狀態（hidden state）。"
      fullBleed
      input={
        <SuggestInput
          value={customText}
          onChange={setCustomText}
          ariaLabel="輸入句子"
          placeholder="自己打一句…GPU 跑訓練好的 RNN"
          maxLength={300}
          capLabel={`最多 ${MAX_RNN_TOKENS} 個 token`}
          capReached={overCap}
          presets={(data?.sequences ?? []).map((s) => {
            const text = s.tokens.join(" ");
            return { label: s.label || text, value: text };
          })}
          status={<LiveStatus state={liveState} />}
        />
      }
      controls={
        <DockControls>
          <BlockSlider
            label="拖曳"
            info="拖曳看 RNN 讀到第幾個 token 時的狀態。往後拖，觀察早期 token 的影響怎麼被逐漸沖淡。"
            min={0}
            max={lastStep}
            step={1}
            value={Math.min(step, lastStep)}
            onChange={setStep}
            disabled={!seq}
            format={(v) =>
              `${String(v + 1).padStart(2, "0")} / ${String(steps).padStart(2, "0")}`
            }
          />
        </DockControls>
      }
      takeaway={
        <span>
          往後走得夠遠，最早那個 token 的痕跡就會淡去。把所有東西塞進一個
          vector 裡是行不通的。
        </span>
      }
    >
      <div className="relative h-full w-full">
        {error ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-md text-center text-sm text-warning">
              無法載入啟動值（{error}）。請執行{" "}
              <code className="font-mono">uv run camp-precompute rnn-viz</code>。
            </p>
          </div>
        ) : !seq || !data ? (
          <div className="flex h-full items-center justify-center">
            <p className="font-mono text-xs text-muted">載入啟動值中…</p>
          </div>
        ) : (
          // The table IS the page: every token on the horizontal axis, hidden
          // dims down the rows, the per-step reference strength merged in as the
          // last row. Columns the slider hasn't reached stay empty (dashed
          // outline), so the state fills in left-to-right. Centered by default;
          // once the sequence overflows it scrolls horizontally while the left
          // label gutter stays frozen (sticky) so the labels never scroll out of
          // view.
          <div className="absolute inset-0 overflow-auto pt-16 pb-28">
            <div className="flex min-h-full flex-col justify-center px-8">
              <div className="overflow-x-auto">
                <div
                  className="mx-auto grid gap-0.5"
                  style={{
                    gridTemplateColumns: `4.5rem repeat(${steps}, 2.5rem)`,
                    width: "max-content",
                  }}
                >
                  {/* Header: frozen gutter + every token. Active step in lime,
                      tokens the slider hasn't reached yet are dimmed. */}
                  <div className="sticky left-0 z-10 h-6 border-r border-border/40 bg-bg" />
                  {seq.tokens.map((tok, c) => {
                    const active = c === step;
                    const reached = c <= step;
                    return (
                      <div
                        key={`head-${c}`}
                        title={tok}
                        className={`flex h-6 items-end justify-center truncate px-0.5 font-mono text-[10px] uppercase leading-none tracking-wide ${
                          active
                            ? "text-accent"
                            : reached
                              ? "text-fg"
                              : "text-muted/40"
                        }`}
                      >
                        {tok}
                      </div>
                    );
                  })}

                  {/* Hidden state: one row per dim, diverging fill. Reached cells
                      carry color; unreached ones are an empty dashed slot. Row
                      label sits in the frozen gutter. */}
                  {Array.from({ length: data.hiddenSize }).map((_, d) => (
                    <Fragment key={`dim-${d}`}>
                      <div className="sticky left-0 z-10 flex h-3.5 items-center border-r border-border/40 bg-bg pr-2 font-mono text-[9px] leading-none text-muted">
                        {`h${String(d).padStart(2, "0")}`}
                      </div>
                      {seq.tokens.map((_, c) => {
                        const reached = c <= step;
                        const active = c === step;
                        const v = seq.hidden[c]?.[d] ?? 0;
                        return (
                          <div
                            key={`cell-${d}-${c}`}
                            title={reached ? v.toFixed(2) : undefined}
                            className={`h-3.5 rounded-[2px] ${
                              reached
                                ? ""
                                : "border border-dashed border-border/30"
                            } ${active ? "ring-1 ring-inset ring-accent" : ""}`}
                            style={
                              reached
                                ? { backgroundColor: hiddenColor(v) }
                                : undefined
                            }
                          />
                        );
                      })}
                    </Fragment>
                  ))}

                  {/* Separator between the hidden block and the reference row. */}
                  <div
                    className="mt-1 h-px border-t border-border/40"
                    style={{ gridColumn: "1 / -1" }}
                  />

                  {/* Reference row: at the current step (about to predict the
                      next token), how much the model still references each earlier
                      token. Derived from the recorded fingerprint-vs-distance
                      curve — token c's strength at step q is influence[q - c], so
                      the most recent token reads full and the first token fades as
                      generation advances. Frozen label + hover tooltip. */}
                  <div className="group sticky left-0 z-20 mt-1 flex h-4 items-center border-r border-border/40 bg-bg">
                    <span className="cursor-help font-mono text-[9px] leading-none text-accent underline decoration-dotted underline-offset-2">
                      影響
                    </span>
                    <div className="pointer-events-none absolute bottom-full left-0 z-40 mb-1.5 w-max max-w-xs rounded-md border border-border bg-panel px-3 py-2 text-xs leading-relaxed text-fg opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
                      生成下一個 token 時，模型對每個先前 token 的參考強度。越接近現在的位置參考越強，
                      第一個 token（&ldquo;{seq.tokens[0]}&rdquo;）隨著生成往後推進逐漸被沖淡，
                      這正是 RNN 撞到的長距離依賴牆。
                    </div>
                  </div>
                  {seq.tokens.map((_, c) => {
                    const reached = c <= step;
                    const active = c === step;
                    // Reference strength = fingerprint remaining after (step − c)
                    // more tokens; the current token (distance 0) reads full.
                    const ref = reached ? seq.influence[step - c] ?? 0 : 0;
                    return (
                      <div
                        key={`ref-${c}`}
                        title={reached ? `${(ref * 100).toFixed(0)}%` : undefined}
                        className={`mt-1 h-4 rounded-[2px] ${
                          reached
                            ? ""
                            : "border border-dashed border-border/30"
                        } ${active ? "ring-1 ring-inset ring-accent" : ""}`}
                        style={
                          reached
                            ? {
                                backgroundColor: rgbCss(
                                  theme.accent,
                                  0.12 + 0.88 * Math.max(ref, 0),
                                ),
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </StationLayout>
  );
}
