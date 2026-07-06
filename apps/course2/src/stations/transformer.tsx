/**
 * TRANSFORMER — station 06 of Course 2, the payoff.
 *
 * Wave 3: two clearly-separated modes.
 *
 * 真實模型 (default) — REAL attention from Qwen3-0.6B. Type any sentence
 * (≤ ~24 tokens), pick a layer (28) and head (16), hover a token → see its
 * real attention to every other token. Presets are RECORDED Qwen outputs
 * (attention.json); typed sentences come from the live GPU server running the
 * same model. No synthetic head labels — real heads don't carry clean roles,
 * so the UI shows honest L{n}·H{m} indices. Attention is causal (a decoder
 * only looks left) — visible and teachable.
 *
 * 機制示意 — the five-step Q·K → ÷√d → softmax → ΣwV walkthrough survives as a
 * FIXED schematic on one hand-picked dim-6 example (clearly marked 示意 — not
 * the live model; real 1024-dim vectors can't render on screen). The Q/K pair
 * is factored so softmax(Q·Kᵀ/√d) reproduces the schematic matrix exactly, so
 * the browser's light arithmetic is genuine.
 *
 * The browser NEVER runs a transformer — it replays recorded/live JSON and
 * does only tiny dot-product/softmax arithmetic in the schematic.
 */
import { useEffect, useMemo, useState } from "react";
import {
  BlockButtons,
  BlockSlider,
  BlockToggle,
  DockControls,
  LiveStatus,
  StationLayout,
  SuggestInput,
  type LiveState,
} from "@camp/ui";
import { AttentionLines, VectorStrip } from "@camp/viz";
import { liveInferTimed, loadJSON } from "@camp/data";

/** One sentence's REAL attention — the element shape of both the shipped
 * `sentences[]` and the live server's POST /transformer/attention response. */
interface AttentionSentence {
  sentenceId: string;
  /** Real subword pieces (a leading space is part of the token). */
  tokens: string[];
  /** layers[l].heads[h] is a [query][key] matrix (causal). */
  layers: { heads: number[][][] }[];
}

/** The fixed 機制示意 example: tiny hand-designed Q/K/V (NOT the live model). */
interface Schematic {
  tokens: string[];
  dim: number;
  q: number[][];
  k: number[][];
  v: number[][];
}

interface AttentionData {
  model: string;
  nLayers: number;
  nHeads: number;
  sentences: AttentionSentence[];
  schematic: Schematic;
}

interface LiveAttention extends AttentionSentence {
  nLayers: number;
  nHeads: number;
}

const DATA_URL = "/data/course2/transformer/attention.json";
const AUTO_STEP_MS = 2400;

/** The five walkthrough phases, in mechanism order (機制示意 only). */
const STEPS = [
  { key: "qk", label: "01", name: "Q·K 內積" },
  { key: "scale", label: "02", name: "÷ √d 縮放" },
  { key: "softmax", label: "03", name: "softmax → weights" },
  { key: "wv", label: "04", name: "加權求和 V" },
  { key: "out", label: "05", name: "輸出向量" },
] as const;
const LAST_STEP = STEPS.length - 1;

type Mode = "real" | "schematic";

/** Make a subword piece visible: leading space → ␣ (it IS part of the token). */
function displayToken(token: string): string {
  return token.replace(/^ /, "␣").replace(/\n/g, "⏎");
}

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

function softmax(scores: number[]): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

export function TransformerStation() {
  // 1. STATE
  const [data, setData] = useState<AttentionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("real");

  // 真實模型 state
  const [sentenceId, setSentenceId] = useState<string | null>(null);
  const [layer, setLayer] = useState(0);
  const [head, setHead] = useState(0);
  const [focus, setFocus] = useState<number | null>(null);

  // 機制示意 state
  const [query, setQuery] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  // 2. LOAD PRECOMPUTED DATA — recorded real Qwen attention + the schematic.
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

  // TYPED INPUT — the primary interaction: any sentence gets its REAL
  // attention tensor from the live GPU server (same model that recorded the
  // presets). Enter (or the button) submits; the response is a full
  // 28-layer × 16-head tensor, so this is not fired per keystroke.
  const [customText, setCustomText] = useState("");
  const [customSentence, setCustomSentence] = useState<AttentionSentence | null>(null);
  const [liveMs, setLiveMs] = useState(0);
  const [livePending, setLivePending] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);
  const [liveShown, setLiveShown] = useState(false);

  const sentences = useMemo<AttentionSentence[]>(() => {
    const base = data?.sentences ?? [];
    return customSentence ? [...base, customSentence] : base;
  }, [data, customSentence]);

  const submitCustom = async (text: string) => {
    if (!text || livePending) return;
    setLivePending(true);
    setLiveFailed(false);
    const r = await liveInferTimed<LiveAttention>("/transformer/attention", { text });
    setLivePending(false);
    if (!r) {
      setLiveFailed(true);
      return;
    }
    setCustomSentence(r.data);
    setLiveMs(r.ms);
    setLiveShown(true);
    setSentenceId(r.data.sentenceId);
    setFocus(null);
  };

  // The recorded sentences surface as the input's presets. A submitted text
  // that matches one selects it locally (no round-trip); anything else goes to
  // the live GPU. Submit-based on purpose — the response is a full
  // 28-layer × 16-head tensor, too heavy to fire per keystroke.
  const presetByText = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of data?.sentences ?? []) {
      m.set(s.tokens.join("").trim(), s.sentenceId);
    }
    return m;
  }, [data]);

  const submitText = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const presetId = presetByText.get(t);
    if (presetId) {
      setSentenceId(presetId);
      return;
    }
    void submitCustom(t);
  };

  const sentence = useMemo(
    () => sentences.find((s) => s.sentenceId === sentenceId) ?? null,
    [sentences, sentenceId],
  );
  const showingLive = Boolean(sentence?.sentenceId.startsWith("live-"));

  const liveState = useMemo<LiveState>(() => {
    if (livePending) return { kind: "pending" };
    if (liveFailed) return { kind: "cached" };
    if (liveShown && showingLive) return { kind: "live", ms: liveMs };
    return { kind: "idle" };
  }, [livePending, liveFailed, liveShown, showingLive, liveMs]);

  // A new sentence has different tokens — reset the hover.
  useEffect(() => {
    setFocus(null);
  }, [sentenceId]);

  // 3. DERIVED — 真實模型: the picked (layer, head) matrix, indices clamped so
  //    a stale slider position is safe.
  const nLayers = data?.nLayers ?? 1;
  const nHeads = data?.nHeads ?? 1;

  const weights = useMemo<number[][]>(() => {
    if (!sentence) return [];
    const l = Math.min(layer, sentence.layers.length - 1);
    const heads = sentence.layers[l]?.heads ?? [];
    const h = Math.min(head, heads.length - 1);
    return heads[h] ?? [];
  }, [sentence, layer, head]);

  const displayTokens = useMemo(
    () => (sentence ? sentence.tokens.map(displayToken) : []),
    [sentence],
  );

  // 3b. DERIVED — 機制示意: light arithmetic on the tiny hand-designed
  //     vectors (dim-6 dot products + a softmax over ≤6 scores). Playback of a
  //     schematic, not a model forward pass.
  const schematic = data?.schematic ?? null;

  useEffect(() => {
    // entering/leaving schematic mode restarts the walkthrough
    setQuery(0);
    setStep(0);
    setPlaying(false);
  }, [mode]);

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

  const mech = useMemo(() => {
    if (!schematic) return null;
    const qi = Math.min(query, schematic.tokens.length - 1);
    const dim = schematic.dim;

    const qRow = schematic.q[qi] ?? [];
    const dots = schematic.k.map((kRow) => dot(qRow, kRow));
    const scale = Math.sqrt(dim);
    const scores = dots.map((d) => d / scale);
    const w = softmax(scores);
    const argmax = w.indexOf(Math.max(...w));
    const output = Array.from({ length: dim }, (_, d) =>
      w.reduce((acc, wj, j) => acc + wj * (schematic.v[j]?.[d] ?? 0), 0),
    );

    // The full schematic attention matrix (all queries) for the payoff view.
    const matrix = schematic.q.map((qr) =>
      softmax(schematic.k.map((kr) => dot(qr, kr) / scale)),
    );

    // Shared color domains so strips read on one scale per family.
    const qkMax = Math.max(
      ...qRow.map(Math.abs),
      ...schematic.k.flat().map(Math.abs),
      1e-9,
    );
    const vMax = Math.max(
      ...schematic.v.flat().map(Math.abs),
      ...output.map(Math.abs),
      1e-9,
    );

    return { qi, dim, scale, qRow, k: schematic.k, v: schematic.v, dots, scores, w, argmax, output, qkMax, vMax, matrix };
  }, [schematic, query]);

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
      subtitle="如果每個 token 都能直接看到所有其他 token 呢？看真實模型的 attention 分工。"
      input={
        mode === "real" ? (
          <SuggestInput
            value={customText}
            onChange={setCustomText}
            onSubmit={submitText}
            ariaLabel="輸入句子"
            placeholder="自己打一句…GPU 算 attention"
            presets={(data?.sentences ?? []).map((s) => {
              const text = s.tokens.join("").trim();
              return { label: text, value: text };
            })}
            status={<LiveStatus state={liveState} />}
          />
        ) : undefined
      }
      controls={
        <DockControls>
          <BlockToggle<Mode>
            label="模式"
            info="切換觀看方式。「真實模型」顯示 Qwen3-0.6B 對你句子算出的真實注意力；「機制示意」用一個固定的小例子，拆解注意力是怎麼一步步算出來的。"
            value={mode}
            onChange={setMode}
            options={[
              { label: "真實模型", value: "real" },
              { label: "機制示意", value: "schematic" },
            ]}
          />

          {mode === "real" ? (
            <>
              <BlockSlider
                label="Layer"
                info="選看第幾層的注意力。淺層多半關注鄰近、表面的關係，越深的層才逐漸組合出比較抽象的語意。"
                min={0}
                max={nLayers - 1}
                step={1}
                value={Math.min(layer, nLayers - 1)}
                onChange={setLayer}
                format={(v) => `L${v} / L${nLayers - 1}`}
              />
              <BlockSlider
                label="Head"
                info="選同一層裡的哪一個注意力頭。每個 head 各自學到不同的關注模式，看的重點不一樣。"
                min={0}
                max={nHeads - 1}
                step={1}
                value={Math.min(head, nHeads - 1)}
                onChange={setHead}
                format={(v) => `H${v} / H${nHeads - 1}`}
              />
            </>
          ) : (
            <>
              <BlockSlider
                label="步驟"
                info="逐步播放注意力的計算流程：Q·K 算相似度，除以 √d 縮放，softmax 轉成權重，再加權求和。"
                min={0}
                max={LAST_STEP}
                step={1}
                value={Math.min(step, LAST_STEP)}
                onChange={(v) => {
                  setPlaying(false);
                  setStep(v);
                }}
                format={(v) => STEPS[v]?.name ?? String(v)}
              />
              <BlockButtons
                label="播放"
                buttons={[
                  {
                    label: playing ? "播放中…" : "從頭播放",
                    onClick: () => {
                      setStep(0);
                      setPlaying(true);
                    },
                    disabled: playing,
                    primary: true,
                  },
                ]}
              />
            </>
          )}
        </DockControls>
      }
      takeaway={
        <span>
          attention 不是魔法：Q·K 內積 → ÷√d → softmax → 加權求和 V，四步而已。
          每個 token 一跳就能看到整個句子，這就是 Transformer 拆掉 RNN 那道牆的方式。
          真實模型裡沒有乾淨的「這個 head 做什麼」標籤，28 層 × 16 個 head
          的分工是訓練自己長出來的，自己去翻。
        </span>
      }
    >
      <div className="flex h-full flex-col gap-5">
        {error ? (
          <p className="text-sm text-warning">
            載入 attention 資料失敗（{error}）。請執行{" "}
            <code className="font-mono">uv run camp-precompute transformer</code>。
          </p>
        ) : !data ? (
          <p className="text-sm text-muted">attention 資料載入中…</p>
        ) : mode === "real" ? (
          /* ---------- 真實模型 — real Qwen attention, hover to read. ---------- */
          !sentence ? (
            <p className="text-sm text-muted">attention 資料載入中…</p>
          ) : (
            <>
              <div>
                <div className="mb-1 font-mono text-xs uppercase tracking-wide text-muted">
                  {data.model} · self-attention ·{" "}
                  <span className="text-accent">
                    L{Math.min(layer, nLayers - 1)} · H{Math.min(head, nHeads - 1)}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  {focus != null && sentence.tokens[focus] ? (
                    <>
                      <span className="font-mono text-accent">
                        {displayToken(sentence.tokens[focus]!)}
                      </span>{" "}
                      最強烈注意的，就是連線最亮的那些 token。
                    </>
                  ) : (
                    <>
                      hover 下方任一個 token，追蹤它的 attention。連線的透明度與粗細
                      和 attention weight 成正比。
                    </>
                  )}
                </p>
              </div>

              <div className="min-h-0 flex-1 rounded-md border border-border/30 bg-bg">
                <AttentionLines
                  tokens={displayTokens}
                  weights={weights}
                  focusToken={focus}
                  onFocusToken={setFocus}
                  height={280}
                />
              </div>

              <p className="text-xs text-muted">
                這些 token 是模型真實的 subword（「␣」表示 token
                自帶空格）。注意力只指向<span className="font-mono">左邊</span>
                ，生成模型讀到第 n 個 token 時，右邊的還不存在（causal
                attention）。很多 head 會把大量權重堆在第一個 token 上（attention
                sink），也是真實模型的常態。
              </p>
            </>
          )
        ) : !mech || !schematic ? (
          <p className="text-sm text-warning">
            這份 attention 資料還沒有 schematic。請重新執行{" "}
            <code className="font-mono">uv run camp-precompute transformer</code>。
          </p>
        ) : (
          /* ---------- 機制示意 — the five-step walkthrough (canned). ---------- */
          <>
            <div>
              <div className="mb-1 font-mono text-xs uppercase tracking-wide text-muted">
                機制示意 · <span className="text-warning">非真實模型</span> · d ={" "}
                {mech.dim}
              </div>
              {/* Query-token picker — click a token to make it the query. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs uppercase tracking-wide text-muted">
                  query
                </span>
                {schematic.tokens.map((tok, i) => (
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
                  {schematic.tokens[mech.qi]}
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
                    ariaLabel={`Q vector of ${schematic.tokens[mech.qi]}`}
                  />
                </div>
                <div className="col-span-4 font-mono text-[10px] text-muted">
                  ↓ 和下面每一列的 K 做內積
                </div>

                {/* Divider */}
                <div className="col-span-6 my-1 border-t border-border/30" />

                {/* One row per key token. */}
                {schematic.tokens.map((tok, j) => {
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

                      {/* ÷√d scaled score */}
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
                    ariaLabel={`Output vector of ${schematic.tokens[mech.qi]}`}
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
                      {schematic.tokens[mech.qi]}
                    </span>{" "}
                    想知道句子裡哪些 token 跟它有關。它拿自己的 Q（query）向量，
                    和每個 token 的 K（key）向量做內積：對應的格子相乘、加總，
                    得到一個分數，方向越對齊，分數越大。
                  </>
                ) : step === 1 ? (
                  <>
                    向量維度 d 越大，內積天生就越大。把每個分數除以 √d（這裡 d ={" "}
                    {mech.dim}，√d ≈ {mech.scale.toFixed(2)}）壓回穩定的範圍，
                    等一下 softmax 才不會一面倒。
                  </>
                ) : step === 2 ? (
                  <>
                    對分數做 softmax：取指數、再除以總和，變成一組加起來等於 1 的
                    attention weights，一個真正的機率分布。最大的分數被放大
                    （softmax 是「柔軟版」的 argmax），但其他 token 仍分到一點權重。
                    最亮的那條就是{" "}
                    <span className="font-mono text-accent">
                      {schematic.tokens[mech.qi]}
                    </span>{" "}
                    最關注的 token。
                  </>
                ) : step === 3 ? (
                  <>
                    每個 token 還帶著一個 V（value）向量，也就是它要「提供」的內容。
                    用剛剛的 weights 加權求和：weight 越大的 token，它的 V
                    貢獻越多（每列的亮度 ∝ weight）。
                  </>
                ) : (
                  <>
                    加權求和的結果，就是{" "}
                    <span className="font-mono text-accent">
                      {schematic.tokens[mech.qi]}
                    </span>{" "}
                    在這個 head 的輸出向量：它一步就混入了整句話裡它最關注的資訊，
                    不必像 RNN 一樣把狀態沿著鏈條傳。切回「真實模型」，
                    Qwen 的 28 層 × 16 個 head 做的就是這件事，只是 d 是 1024。
                  </>
                )}
              </p>
            </div>

            {/* Final phase payoff: the mechanism ties back to the lines view. */}
            {step === LAST_STEP ? (
              <div className="rounded-md border border-border/30 bg-bg">
                <AttentionLines
                  tokens={schematic.tokens}
                  weights={mech.matrix}
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
