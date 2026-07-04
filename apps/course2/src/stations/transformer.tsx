/**
 * TRANSFORMER — station 06 of Course 2, the payoff.
 *
 * Wave-2 (06a): a bbycroft-style GUIDED STEP-THROUGH of self-attention. The
 * student picks a query token, then scrubs five phases — Q·K dot products →
 * ÷√d scaling → softmax → weighted sum of V → the token's output — watching
 * every intermediate light up. The old hover-a-matrix view survives as the
 * 「注意力總覽」 view, so the RESULT reading is still one toggle away.
 *
 * Design (not code) modeled on bbycroft.net/llm (github.com/bbycroft/llm-viz):
 * the phase list + commentary-tied-to-highlights interaction. Clean-room
 * implementation — no llm-viz code is used (llm-viz ships no license).
 *
 * The browser NEVER runs a transformer. `camp-precompute transformer` exports
 * the attention tensor PLUS tiny per-token Q/K/V vectors (dim 8), factored so
 * softmax(Q·Kᵀ/√d) reproduces the shipped matrices. The station loads them via
 * @camp/data and does only light arithmetic (8-dim dot products, a softmax over
 * ≤6 scores) — playback, not a forward pass.
 */
import { useEffect, useMemo, useState } from "react";
import { RunButton, SegmentedControl, StationLayout } from "@camp/ui";
import { AttentionLines, VectorStrip } from "@camp/viz";
import { liveInfer, liveInferenceEnabled, loadJSON } from "@camp/data";

interface HeadQKV {
  /** q/k/v are [token][dim] vectors for one (layer, head). */
  q: number[][];
  k: number[][];
  v: number[][];
}

/** One sentence's attention payload — the element shape of both the shipped
 * `sentences[]` and the live server's POST /transformer/attention response. */
interface AttentionSentence {
  sentenceId: string;
  tokens: string[];
  /** layers[l].heads[h] is a [query][key] matrix; qkv[h] its Q/K/V vectors. */
  layers: { heads: number[][][]; qkv?: HeadQKV[] }[];
}

interface AttentionData {
  layers: number;
  heads: number;
  headLabels: string[];
  /** Dimension of the exported Q/K/V vectors (√d is the softmax scale). */
  qkvDim: number;
  sentences: AttentionSentence[];
}

const DATA_URL = "/data/course2/transformer/attention.json";
const AUTO_STEP_MS = 2400;

/** The five walkthrough phases, in mechanism order. */
const STEPS = [
  { key: "qk", label: "01", name: "Q·K 內積" },
  { key: "scale", label: "02", name: "÷ √d 縮放" },
  { key: "softmax", label: "03", name: "softmax → weights" },
  { key: "wv", label: "04", name: "加權求和 V" },
  { key: "out", label: "05", name: "輸出向量" },
] as const;
const LAST_STEP = STEPS.length - 1;

type View = "walk" | "lines";

/** prefers-reduced-motion, read in an effect (SSR-safe, live-updating). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

export function TransformerStation() {
  // 1. STATE — everything the canvas shows is a pure function of this.
  const [data, setData] = useState<AttentionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentenceId, setSentenceId] = useState<string | null>(null);
  const [layer, setLayer] = useState(0);
  const [head, setHead] = useState(0);
  const [view, setView] = useState<View>("walk");
  /** The picked query token (walkthrough view). */
  const [query, setQuery] = useState(0);
  /** Current walkthrough phase (index into STEPS). */
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** The hovered query token in the 總覽 (lines) view. */
  const [focus, setFocus] = useState<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // 2. LOAD PRECOMPUTED DATA — via @camp/data inside an effect. No model runs
  //    in the browser; this is the exported attention tensor + Q/K/V vectors.
  useEffect(() => {
    let alive = true;
    loadJSON<AttentionData>(DATA_URL)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setSentenceId(d.sentences[0]?.sentenceId ?? null);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  // LIVE OPT-IN — a custom sentence gets its attention tensor from the live
  // server (the SAME synthesis code precompute runs, gated on
  // VITE_LIVE_INFERENCE_URL) and walks through the identical step-through.
  // Preset sentences stay precomputed with zero server dependency.
  const [customText, setCustomText] = useState("");
  const [customSentence, setCustomSentence] = useState<AttentionSentence | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const sentences = useMemo<AttentionSentence[]>(() => {
    const base = data?.sentences ?? [];
    return customSentence ? [...base, customSentence] : base;
  }, [data, customSentence]);

  const submitCustom = async () => {
    const text = customText.trim();
    if (!text || liveBusy) return;
    setLiveBusy(true);
    setLiveError(null);
    const r = await liveInfer<AttentionSentence>("/transformer/attention", { text });
    setLiveBusy(false);
    if (!r) {
      setLiveError("即時伺服器沒有回應（句子最多 8 個 token）。預設句子不受影響。");
      return;
    }
    setCustomSentence(r);
    setSentenceId(r.sentenceId);
    setFocus(null);
  };

  const sentence = useMemo(
    () => sentences.find((s) => s.sentenceId === sentenceId) ?? null,
    [sentences, sentenceId],
  );

  // A new sentence has different tokens — restart the walkthrough on it.
  useEffect(() => {
    setQuery(0);
    setStep(0);
    setPlaying(false);
    setFocus(null);
  }, [sentenceId]);

  // Auto-play: advance one phase per beat, stop on the last one.
  useEffect(() => {
    if (!playing) return;
    if (step >= LAST_STEP) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setStep((s) => Math.min(s + 1, LAST_STEP)), AUTO_STEP_MS);
    return () => clearTimeout(id);
  }, [playing, step]);

  // 3. DERIVED CANVAS DATA — pure functions of (data, sentence, layer, head,
  //    query, step). Clamp indices so a stale layer/head/query is safe.
  const weights = useMemo<number[][]>(() => {
    if (!sentence) return [];
    const l = Math.min(layer, sentence.layers.length - 1);
    const heads = sentence.layers[l]?.heads ?? [];
    const h = Math.min(head, heads.length - 1);
    return heads[h] ?? [];
  }, [sentence, layer, head]);

  // The mechanism math: light in-browser arithmetic on the precomputed vectors
  // (8-dim dot products + a softmax over ≤6 scores) — allowed playback, and it
  // rebuilds the SAME weights as the shipped matrix (the factorisation
  // guarantees it), so mechanism and result provably agree.
  const mech = useMemo(() => {
    if (!sentence || !data) return null;
    const l = Math.min(layer, sentence.layers.length - 1);
    const qkvHeads = sentence.layers[l]?.qkv;
    if (!qkvHeads) return null; // stale artifact without qkv
    const h = Math.min(head, qkvHeads.length - 1);
    const qkv = qkvHeads[h];
    if (!qkv) return null;
    const qi = Math.min(query, sentence.tokens.length - 1);
    const dim = data.qkvDim || qkv.q[0]?.length || 8;

    const qRow = qkv.q[qi] ?? [];
    const dots = qkv.k.map((kRow) => dot(qRow, kRow));
    const scale = Math.sqrt(dim);
    const scores = dots.map((d) => d / scale);
    const maxScore = Math.max(...scores);
    const exps = scores.map((s) => Math.exp(s - maxScore));
    const expSum = exps.reduce((a, b) => a + b, 0) || 1;
    const w = exps.map((e) => e / expSum);
    const argmax = w.indexOf(Math.max(...w));
    const output = Array.from({ length: dim }, (_, d) =>
      w.reduce((acc, wj, j) => acc + wj * (qkv.v[j]?.[d] ?? 0), 0),
    );

    // Shared color domains so strips read on one scale per family.
    const qkMax = Math.max(
      ...qRow.map(Math.abs),
      ...qkv.k.flat().map(Math.abs),
      1e-9,
    );
    const vMax = Math.max(...qkv.v.flat().map(Math.abs), ...output.map(Math.abs), 1e-9);
    const dotMax = Math.max(...dots.map(Math.abs), 1e-9);

    return { qi, dim, scale, qRow, k: qkv.k, v: qkv.v, dots, scores, w, argmax, output, qkMax, vMax, dotMax };
  }, [sentence, data, layer, head, query]);

  const headLabel = data?.headLabels[head] ?? "";
  const activeStep = STEPS[Math.min(step, LAST_STEP)]!;
  const fadeCls = reducedMotion ? "" : "transition-opacity duration-500";

  // Per-pipeline-column visibility/focus: hidden until its phase, lime while
  // active, quiet grey once passed. Column c becomes visible at step ≥ c.
  const colState = (c: number): { cls: string; active: boolean } => {
    if (step < c) return { cls: "opacity-0 pointer-events-none", active: false };
    return { cls: step === c ? "opacity-100" : "opacity-60", active: step === c };
  };

  return (
    <StationLayout
      title="Transformer"
      subtitle="如果每個 token 都能直接看到所有其他 token 呢?一步一步拆開 self-attention 的機制。"
      controls={
        <>
          <SegmentedControl<View>
            label="檢視"
            value={view}
            onChange={setView}
            options={[
              { label: "逐步機制", value: "walk" },
              { label: "注意力總覽", value: "lines" },
            ]}
          />

          {data ? (
            <SegmentedControl
              label="句子"
              value={sentenceId ?? ""}
              onChange={(v) => {
                setSentenceId(v);
                setFocus(null);
              }}
              options={sentences.map((s) => ({
                // Short label (first…last word) so three buttons don't overflow
                // the sidebar; the full sentence is visible on the canvas.
                label: s.sentenceId.startsWith("live-")
                  ? "自訂句子"
                  : s.tokens.length > 2
                    ? `${s.tokens[0]}…${s.tokens[s.tokens.length - 1]}`
                    : s.tokens.join(" "),
                value: s.sentenceId,
              }))}
            />
          ) : null}

          {liveInferenceEnabled() && data ? (
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-xs text-muted">
                自己打一句（最多 8 個 token，即時算 attention）
              </span>
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitCustom();
                }}
                placeholder="例如 the dog chased the red ball"
                className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void submitCustom()}
                disabled={liveBusy || !customText.trim()}
                className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm text-fg transition-colors hover:border-accent disabled:opacity-40"
              >
                {liveBusy ? "計算中…" : "算 attention"}
              </button>
              {liveError ? (
                <span className="font-mono text-xs text-warning">{liveError}</span>
              ) : null}
            </label>
          ) : null}

          {data ? (
            <SegmentedControl
              label="Layer"
              value={String(layer)}
              onChange={(v) => setLayer(Number(v))}
              options={Array.from({ length: data.layers }, (_, i) => ({
                label: `L${i}`,
                value: String(i),
              }))}
            />
          ) : null}

          {data ? (
            <SegmentedControl
              label="Head"
              value={String(head)}
              onChange={(v) => setHead(Number(v))}
              options={data.headLabels.map((label, i) => ({
                label: `${i} · ${label}`,
                value: String(i),
              }))}
            />
          ) : null}

          {view === "walk" && data ? (
            <>
              <div>
                <SegmentedControl
                  label="步驟"
                  value={String(step)}
                  onChange={(v) => {
                    setPlaying(false);
                    setStep(Number(v));
                  }}
                  options={STEPS.map((s, i) => ({ label: s.label, value: String(i) }))}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPlaying(false);
                      setStep((s) => Math.max(0, s - 1));
                    }}
                    disabled={step === 0}
                    className="rounded-md border border-border bg-panel px-3 py-1 text-sm text-muted transition-colors hover:text-fg disabled:opacity-40"
                  >
                    ← 上一步
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPlaying(false);
                      setStep((s) => Math.min(LAST_STEP, s + 1));
                    }}
                    disabled={step === LAST_STEP}
                    className="rounded-md border border-border bg-panel px-3 py-1 text-sm text-muted transition-colors hover:text-fg disabled:opacity-40"
                  >
                    下一步 →
                  </button>
                </div>
              </div>

              <RunButton
                label={playing ? "播放中…" : "從頭播放"}
                runningLabel="準備中…"
                durationMs={300}
                disabled={playing}
                onRun={() => {
                  setStep(0);
                  setPlaying(true);
                }}
              />

              <div className="rounded-md border border-border/60 bg-panel p-3 text-xs text-muted">
                點一個 token 當 <span className="text-accent">query</span>
                ,再逐步前進:看它的 Q 怎麼和每個 K 內積、softmax 成
                weights、最後加權 V。切換{" "}
                <span className="font-mono uppercase tracking-wide">layer</span> 和{" "}
                <span className="font-mono uppercase tracking-wide">head</span>
                ,同一套機制會長出不同的注意力模式。
              </div>
            </>
          ) : null}

          {view === "lines" ? (
            <div className="rounded-md border border-border/60 bg-panel p-3 text-xs text-muted">
              hover 任一個 token,亮起
              <span className="text-accent">它注意的對象</span>。切換{" "}
              <span className="font-mono uppercase tracking-wide">layer</span> 和{" "}
              <span className="font-mono uppercase tracking-wide">head</span>
              ,看 attention 如何分工，每個 head 學到不同的工作。
            </div>
          ) : null}
        </>
      }
      takeaway={
        <span>
          attention 不是魔法:Q·K 內積 → ÷√d → softmax → 加權求和 V,四步而已。
          每個 token 一跳就能看到整個句子，這就是 Transformer 拆掉 RNN 那道牆的方式。
        </span>
      }
    >
      <div className="flex h-full flex-col gap-5">
        {error ? (
          <p className="text-sm text-warning">
            載入 attention 資料失敗({error})。請執行{" "}
            <code className="font-mono">uv run camp-precompute transformer</code>。
          </p>
        ) : !data || !sentence ? (
          <p className="text-sm text-muted">attention 資料載入中…</p>
        ) : view === "lines" ? (
          /* ---------- 注意力總覽 — the original RESULT view, kept intact. ---------- */
          <>
            <div>
              <div className="mb-1 font-mono text-xs uppercase tracking-wide text-muted">
                self-attention · layer {layer} · head {head}
                {headLabel ? (
                  <span className="text-accent"> · {headLabel}</span>
                ) : null}
              </div>
              <p className="text-sm text-muted">
                {focus != null && sentence.tokens[focus] ? (
                  <>
                    <span className="font-mono text-accent">
                      {sentence.tokens[focus]}
                    </span>{" "}
                    最強烈注意的,就是連線最亮的那些 token。
                  </>
                ) : (
                  <>
                    hover 下方任一個 token,追蹤它的
                    attention。每條連線的透明度與粗細都和 attention weight 成正比。
                  </>
                )}
              </p>
            </div>

            <div className="min-h-0 flex-1 rounded-md border border-border/30 bg-bg">
              <AttentionLines
                tokens={sentence.tokens}
                weights={weights}
                focusToken={focus}
                onFocusToken={setFocus}
                height={280}
              />
            </div>

            <p className="text-xs text-muted">
              layer <span className="font-mono">L0</span> 銳利而局部;越深的 layer
              注意力越發散。head <span className="font-mono">0</span> 貼著鄰近的
              token、head <span className="font-mono">1</span> 追內容詞、head{" "}
              <span className="font-mono">2</span> 錨定第一個 token，同一種機制,
              學出不同的分工。
            </p>
          </>
        ) : !mech ? (
          <p className="text-sm text-warning">
            這份 attention 資料還沒有 Q/K/V 向量。請重新執行{" "}
            <code className="font-mono">uv run camp-precompute transformer</code>。
          </p>
        ) : (
          /* ---------- 逐步機制 — the bbycroft-style walkthrough. ---------- */
          <>
            <div>
              <div className="mb-1 font-mono text-xs uppercase tracking-wide text-muted">
                self-attention · layer {layer} · head {head}
                {headLabel ? (
                  <span className="text-accent"> · {headLabel}</span>
                ) : null}
                {" · d = "}
                {mech.dim}
              </div>
              {/* Query-token picker — click a token to make it the query. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs uppercase tracking-wide text-muted">
                  query
                </span>
                {sentence.tokens.map((tok, i) => (
                  <button
                    key={`pick-${i}`}
                    type="button"
                    onClick={() => setQuery(i)}
                    className={`rounded-md border px-2.5 py-1 font-mono text-sm transition-colors ${
                      i === mech.qi
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-border bg-panel text-muted hover:text-fg"
                    }`}
                  >
                    <span className="mr-1.5 text-[9px] opacity-60">
                      {String(i).padStart(2, "0")}
                    </span>
                    {tok}
                  </button>
                ))}
              </div>
            </div>

            {/* The pipeline table: one row per key token; columns reveal as the
                student scrubs. The active column's header is the lime mark. */}
            <div className="overflow-x-auto rounded-md border border-border/30 bg-bg p-4">
              <div
                className="grid items-center gap-x-4 gap-y-1.5"
                style={{
                  gridTemplateColumns:
                    "minmax(64px, auto) auto auto auto minmax(110px, 1fr) auto",
                }}
              >
                {/* Column headers */}
                {(
                  [
                    ["token", null],
                    ["K", 0],
                    ["Q·K", 0],
                    ["÷ √d", 1],
                    ["softmax", 2],
                    ["w × V", 3],
                  ] as const
                ).map(([label, c], idx) => {
                  const st = c === null ? { cls: "", active: false } : colState(c);
                  return (
                    <div
                      key={`hd-${idx}`}
                      className={`font-mono text-[10px] uppercase tracking-wide ${fadeCls} ${
                        st.active ? "text-accent" : "text-muted"
                      } ${st.cls}`}
                    >
                      {label}
                    </div>
                  );
                })}

                {/* Q row: the query token's Q vector sits atop the K column. */}
                <div className="text-right font-mono text-sm text-accent">
                  {sentence.tokens[mech.qi]}
                  <span className="ml-1.5 text-[9px] uppercase tracking-wide opacity-70">
                    Q
                  </span>
                </div>
                <div>
                  <VectorStrip
                    values={mech.qRow}
                    maxAbs={mech.qkMax}
                    cellSize={14}
                    highlight={step === 0}
                    ariaLabel={`Q vector of ${sentence.tokens[mech.qi]}`}
                  />
                </div>
                <div className="col-span-4 font-mono text-[10px] text-muted">
                  ↓ 和下面每一列的 K 做內積
                </div>

                {/* Divider */}
                <div className="col-span-6 my-1 border-t border-border/30" />

                {/* One row per key token. */}
                {sentence.tokens.map((tok, j) => {
                  const isQuery = j === mech.qi;
                  const isArgmax = j === mech.argmax;
                  const wj = mech.w[j] ?? 0;
                  const dotJ = mech.dots[j] ?? 0;
                  const scoreJ = mech.scores[j] ?? 0;
                  return (
                    <div key={`row-${j}`} className="contents">
                      <div
                        className={`text-right font-mono text-sm ${
                          isQuery ? "text-accent" : "text-muted"
                        }`}
                      >
                        <span className="mr-1.5 text-[9px] opacity-60">
                          {String(j).padStart(2, "0")}
                        </span>
                        {tok}
                      </div>

                      {/* K vector */}
                      <div className={`${fadeCls} ${colState(0).cls}`}>
                        <VectorStrip
                          values={mech.k[j] ?? []}
                          maxAbs={mech.qkMax}
                          cellSize={14}
                          ariaLabel={`K vector of ${tok}`}
                        />
                      </div>

                      {/* Q·K dot product */}
                      <div className={`${fadeCls} ${colState(0).cls}`}>
                        <span
                          className={`font-mono text-xs ${
                            colState(0).active ? "text-fg" : "text-muted"
                          }`}
                        >
                          {dotJ >= 0 ? "+" : ""}
                          {dotJ.toFixed(2)}
                        </span>
                      </div>

                      {/* ÷√d scaled score, with a magnitude bar on the SAME
                          scale as the raw dots so the shrink is visible. */}
                      <div className={`${fadeCls} ${colState(1).cls}`}>
                        <span
                          className={`font-mono text-xs ${
                            colState(1).active ? "text-fg" : "text-muted"
                          }`}
                        >
                          {scoreJ >= 0 ? "+" : ""}
                          {scoreJ.toFixed(2)}
                        </span>
                      </div>

                      {/* softmax weight bar — argmax is the lime mark. */}
                      <div className={`${fadeCls} ${colState(2).cls}`}>
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-panel">
                            <div
                              className={`h-full rounded-sm ${
                                isArgmax ? "bg-accent" : "bg-fg/50"
                              } ${reducedMotion ? "" : "transition-[width] duration-500"}`}
                              style={{ width: `${Math.round(wj * 100)}%` }}
                            />
                          </div>
                          <span
                            className={`w-9 shrink-0 text-right font-mono text-xs ${
                              isArgmax && step >= 2 ? "text-accent" : "text-muted"
                            }`}
                          >
                            {wj.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* V vector, faded by its weight (contribution). */}
                      <div className={`${fadeCls} ${colState(3).cls}`}>
                        <VectorStrip
                          values={mech.v[j] ?? []}
                          maxAbs={mech.vMax}
                          cellSize={14}
                          emphasis={step >= 3 ? wj : 1}
                          ariaLabel={`V vector of ${tok}`}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Output row: Σ w·V, aligned under the V column. */}
                <div className={`col-span-6 my-1 border-t border-border/30 ${fadeCls} ${colState(3).cls}`} />
                <div
                  className={`text-right font-mono text-xs uppercase tracking-wide ${fadeCls} ${
                    step === LAST_STEP ? "text-accent" : "text-muted"
                  } ${colState(3).cls}`}
                >
                  輸出
                </div>
                <div className={`col-span-4 font-mono text-[10px] text-muted ${fadeCls} ${colState(3).cls}`}>
                  Σ w·V →
                </div>
                <div className={`${fadeCls} ${colState(3).cls}`}>
                  <VectorStrip
                    values={mech.output}
                    maxAbs={mech.vMax}
                    cellSize={14}
                    highlight={step === LAST_STEP}
                    ariaLabel={`Output vector of ${sentence.tokens[mech.qi]}`}
                  />
                </div>
              </div>
            </div>

            {/* Per-step commentary — the narrative tied to what just lit up. */}
            <div className="rounded-md border border-border/60 bg-panel p-4">
              <div className="mb-1 font-mono text-xs uppercase tracking-wide text-muted">
                step {activeStep.label} / {String(STEPS.length).padStart(2, "0")}{" "}
                <span className="text-accent">· {activeStep.name}</span>
              </div>
              <p className="text-sm text-fg/90">
                {step === 0 ? (
                  <>
                    <span className="font-mono text-accent">
                      {sentence.tokens[mech.qi]}
                    </span>{" "}
                    想知道句子裡哪些 token 跟它有關。它拿自己的 Q(query)向量,
                    和每個 token 的 K(key)向量做內積:對應的格子相乘、加總,
                    得到一個分數，方向越對齊,分數越大。
                  </>
                ) : step === 1 ? (
                  <>
                    向量維度 d 越大,內積天生就越大。把每個分數除以 √d(這裡 d ={" "}
                    {mech.dim},√d ≈ {mech.scale.toFixed(2)})壓回穩定的範圍,
                    等一下 softmax 才不會一面倒。
                  </>
                ) : step === 2 ? (
                  <>
                    對分數做 softmax:取指數、再除以總和,變成一組加起來等於 1 的
                    attention weights，一個真正的機率分布。最大的分數被放大
                    (softmax 是「柔軟版」的 argmax),但其他 token 仍分到一點權重。
                    最亮的那條就是{" "}
                    <span className="font-mono text-accent">
                      {sentence.tokens[mech.qi]}
                    </span>{" "}
                    最關注的 token。
                  </>
                ) : step === 3 ? (
                  <>
                    每個 token 還帶著一個 V(value)向量，也就是它要「提供」的內容。
                    用剛剛的 weights 加權求和:weight 越大的 token,它的 V
                    貢獻越多(每列的亮度 ∝ weight)。
                  </>
                ) : (
                  <>
                    加權求和的結果,就是{" "}
                    <span className="font-mono text-accent">
                      {sentence.tokens[mech.qi]}
                    </span>{" "}
                    在這個 head 的輸出向量:它一步就混入了整句話裡它最關注的資訊,
                    不必像 RNN 一樣把狀態沿著鏈條傳。下面的連線就是這一排
                    weights，也就是「注意力總覽」檢視裡 hover 看到的結果。
                  </>
                )}
              </p>
            </div>

            {/* Final phase payoff: the mechanism ties back to the RESULT view. */}
            {step === LAST_STEP ? (
              <div className="rounded-md border border-border/30 bg-bg">
                <AttentionLines
                  tokens={sentence.tokens}
                  weights={weights}
                  focusToken={mech.qi}
                  height={200}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </StationLayout>
  );
}
