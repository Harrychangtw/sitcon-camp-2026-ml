/**
 * TRANSFORMER — station 06 of Course 2, the payoff.
 *
 * Pipeline overhaul: ONE horizontally-scrollable, left-to-right diagram of a
 * real forward pass — 輸入 → tokenizer → embedding → 迷你模型（attention
 * matrix + MLP，layer/head 兩個轉盤）→ next-token 輸出。The left/right columns
 * deliberately echo the earlier stations (tokenizer 的色塊 chips、embedding 的
 * 向量條、next-token 的機率長條), so the course visibly chains into one model.
 *
 * EVERY number on screen is a real Qwen3-0.6B output: presets are RECORDED
 * pipeline payloads (attention.json, written by `camp-precompute transformer`);
 * typed sentences come from the live GPU server running the same
 * qwen.pipeline_payload(). Embedding/MLP strips are fixed-stride subsamples of
 * the real 1024-dim / 3072-dim vectors — labeled 代表性切片, never decorative.
 *
 * Interaction is free clicking + hover (no guided steps): the layer/head dials
 * pick which attention matrix + MLP slice to show; hovering a matrix cell
 * cross-highlights the query + key tokens across the columns; hovering
 * chips/strips surfaces short explanations. The browser NEVER runs a
 * transformer — it replays recorded/live JSON and does only a softmax over the
 * top-N exported logits.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BlockSlider,
  DockControls,
  LiveStatus,
  StationLayout,
  SuggestInput,
  type LiveState,
} from "@camp/ui";
import { Heatmap, VectorStrip } from "@camp/viz";
import { liveInferTimed, loadJSON } from "@camp/data";

interface TokenLogit {
  token: string;
  /** log P(token|prompt) from the real model; softmax(logit) → probs. */
  logit: number;
}

/** Fixed-stride representative slice of the per-token input embeddings. */
interface PipelineEmbedding {
  dims: number;
  fullDims: number;
  /** vectors[token][d] — real values, `dims` of the `fullDims`-dim vector. */
  vectors: number[][];
}

/** Fixed-stride representative slice of the per-(layer, token) MLP acts. */
interface PipelineMlp {
  dims: number;
  fullDims: number;
  /** layers[l][token][d] — real values at layer l's down_proj input. */
  layers: number[][][];
}

/** One sentence's REAL pipeline — the element shape of both the shipped
 * `sentences[]` and the live server's POST /transformer/attention response.
 * embedding/mlp/output are optional so a stale live server (attention-only)
 * degrades honestly instead of breaking the diagram. */
interface PipelineSentence {
  sentenceId: string;
  /** Real subword pieces (a leading space is part of the token). */
  tokens: string[];
  tokenIds?: number[];
  /** layers[l].heads[h] is a [query][key] matrix (causal). */
  layers: { heads: number[][][] }[];
  embedding?: PipelineEmbedding;
  mlp?: PipelineMlp;
  output?: TokenLogit[];
}

interface PipelineData {
  model: string;
  nLayers: number;
  nHeads: number;
  sentences: PipelineSentence[];
}

interface LivePipeline extends PipelineSentence {
  nLayers: number;
  nHeads: number;
}

const DATA_URL = "/data/course2/transformer/attention.json";

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

/** softmax over the exported top-N log-probs — the only in-browser math. */
function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

// The tokenizer station's muted categorical palette, echoed here so the chips
// read as "the same tokens you met at station 1". Cycled by position — the
// color carries NO meaning beyond "this is one token".
const TOKEN_COLORS = [
  "#3f6f52", // green
  "#2f6470", // teal
  "#7a4a54", // muted rose
  "#5a4d84", // purple
  "#7a6234", // gold
  "#3a5578", // slate blue
  "#6a4a6e", // plum
  "#4a6a44", // olive
] as const;

/** Height (px) of each column's sub-header line — the zone under the 01–05
 * index header that holds a step label ("MLP · L3"). Reserved as blank space
 * in columns without one so every column's rows start at the same offset. */
const SUBHEAD_H = 20;

/** Top gutter (px) inside the attention matrix that holds the rotated key-token
 * labels. The tokenizer / embedding / MLP columns reserve the SAME gutter as
 * blank space so their row 0 lines up with the matrix's query row 0. */
const COL_LABEL_GUTTER = 52;

/** The tokenizer / embedding / qwen columns are nudged up by this much from
 * their centered position (input + next-token stay put), applied as one shared
 * transform so the three columns keep their row alignment. */
const GROUP_NUDGE = "translateY(-32px)";

/** One labeled pipeline column. All columns stretch to the row's height so the
 * 01–05 index headers share one top line. `align="start"` top-anchors the
 * content (used by the token-aligned columns so their rows share one grid);
 * "center" (default) vertically centers it (the input + next-token columns).
 * Honesty footnotes live inside each step's hover tooltip, not on an axis. */
function Column({
  index,
  title,
  align = "center",
  children,
}: {
  index: string;
  title: ReactNode;
  align?: "center" | "start";
  children: ReactNode;
}) {
  return (
    <section className="flex shrink-0 flex-col">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-wide text-muted">
        <span className="mr-1.5 opacity-60">{index}</span>
        {title}
      </div>
      <div
        className={`flex flex-1 flex-col ${
          align === "start" ? "justify-start" : "justify-center"
        }`}
      >
        {children}
      </div>
    </section>
  );
}

/** The flow arrow between columns. */
function Arrow() {
  return (
    <div aria-hidden className="shrink-0 self-center px-1 font-mono text-lg text-muted/50">
      →
    </div>
  );
}

/** On-canvas hover tooltip (the rnnViz group-hover idiom). Wrap the hover
 * target in a `group relative` element and drop this inside. */
function HoverTip({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute bottom-full left-0 z-40 mb-1.5 w-max max-w-xs rounded-md border border-border bg-panel px-3 py-2 text-xs leading-relaxed text-fg opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
      {children}
    </div>
  );
}

export function TransformerStation() {
  // 1. STATE — everything rendered is a pure function of
  //    (data, sentence, layer, head, hovered).
  const [data, setData] = useState<PipelineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentenceId, setSentenceId] = useState<string | null>(null);
  const [layer, setLayer] = useState(0);
  const [head, setHead] = useState(0);
  /** Hovered attention cell: q = query row, k = key column. */
  const [hovered, setHovered] = useState<{ q: number; k: number } | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // 2. LOAD PRECOMPUTED DATA — recorded real Qwen pipeline payloads.
  useEffect(() => {
    let alive = true;
    loadJSON<PipelineData>(DATA_URL)
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

  // TYPED INPUT — any sentence gets its REAL pipeline from the live GPU server
  // (same model + code that recorded the presets). Enter (or the button)
  // submits; the response carries a full 28-layer × 16-head tensor, so this is
  // not fired per keystroke.
  const [customText, setCustomText] = useState("");
  const [customSentence, setCustomSentence] = useState<PipelineSentence | null>(null);
  const [liveMs, setLiveMs] = useState(0);
  const [livePending, setLivePending] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);
  const [liveShown, setLiveShown] = useState(false);

  const sentences = useMemo<PipelineSentence[]>(() => {
    const base = data?.sentences ?? [];
    return customSentence ? [...base, customSentence] : base;
  }, [data, customSentence]);

  const submitCustom = async (text: string) => {
    if (!text || livePending) return;
    setLivePending(true);
    setLiveFailed(false);
    const r = await liveInferTimed<LivePipeline>("/transformer/attention", { text });
    setLivePending(false);
    if (!r) {
      setLiveFailed(true);
      return;
    }
    setCustomSentence(r.data);
    setLiveMs(r.ms);
    setLiveShown(true);
    setSentenceId(r.data.sentenceId);
  };

  // The recorded sentences surface as the input's presets. A submitted text
  // that matches one selects it locally (no round-trip); anything else goes to
  // the live GPU.
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
    setHovered(null);
  }, [sentenceId]);

  // 3. DERIVED — the picked (layer, head) slice, indices clamped so a stale
  //    dial position is safe.
  const nLayers = data?.nLayers ?? 1;
  const nHeads = data?.nHeads ?? 1;
  const l = Math.min(layer, nLayers - 1);
  const h = Math.min(head, nHeads - 1);

  const tokens = useMemo(() => sentence?.tokens ?? [], [sentence]);
  const n = tokens.length;
  const displayTokens = useMemo(() => tokens.map(displayToken), [tokens]);

  // Attention matrix for the Heatmap: upper triangle (key > query) → NaN so
  // the causal mask renders as visibly EMPTY cells, not zero-weight ones.
  const matrix = useMemo<number[][]>(() => {
    if (!sentence) return [];
    const li = Math.min(l, sentence.layers.length - 1);
    const heads = sentence.layers[li]?.heads ?? [];
    const w = heads[Math.min(h, heads.length - 1)] ?? [];
    return w.map((row, q) => row.map((v, k) => (k > q ? NaN : v)));
  }, [sentence, l, h]);

  // Embedding strips share one color domain so the column reads on one scale.
  const embVectors = sentence?.embedding?.vectors ?? null;
  const embMaxAbs = useMemo(
    () => Math.max(...(embVectors ?? []).flat().map(Math.abs), 1e-9),
    [embVectors],
  );

  // MLP slice for the dialed layer, one strip per token, shared domain.
  const mlpActs = useMemo(() => {
    const layers = sentence?.mlp?.layers;
    if (!layers) return null;
    return layers[Math.min(l, layers.length - 1)] ?? null;
  }, [sentence, l]);
  const mlpMaxAbs = useMemo(
    () => Math.max(...(mlpActs ?? []).flat().map(Math.abs), 1e-9),
    [mlpActs],
  );

  // Next-token bars: softmax over the exported top-N log-probs (T = 1).
  const outputProbs = useMemo(() => {
    const entries = sentence?.output ?? [];
    if (!entries.length) return [];
    const p = softmax(entries.map((e) => e.logit));
    return entries
      .map((e, i) => ({ token: e.token, prob: p[i] ?? 0 }))
      .sort((a, b) => b.prob - a.prob);
  }, [sentence]);
  const maxProb = outputProbs[0]?.prob ?? 1;

  // ONE row pitch drives the whole diagram: the token chips, the embedding and
  // MLP strips, and the attention matrix's cells all step by `rowH`, so token
  // row i sits at the same y in every column. Tighter for long sentences.
  const rowH = n > 16 ? 24 : 30;

  // Matrix sizing derived from `rowH` so the Heatmap's cell pitch (cellH + GAP)
  // lands exactly on `rowH` and its cells come out square. GAP is the Heatmap's
  // internal 2px inter-cell gap; leftGutter 72 (row labels) + 8 padding, and the
  // top gutter holds the rotated key labels. Fixed width → intrinsic column size
  // inside the horizontally-scrolling row (Heatmap is responsive to its box).
  const HEATMAP_GAP = 2;
  const matrixW = 72 + 8 + (n * rowH - HEATMAP_GAP);
  const matrixH = COL_LABEL_GUTTER + 8 + (n * rowH - HEATMAP_GAP);

  // Every token-aligned column (tokenizer / embedding / matrix / MLP) is one
  // fixed-height "rail": the shared top zone (sub-header + key-label gutter)
  // above `n` rows of `rowH`. Giving them all the SAME height lets each be
  // vertically centered independently yet land on the same center line — so the
  // whole pipeline reads as one centered group AND row i still aligns across
  // columns. (The matrix's Heatmap runs ~6px taller and spills harmlessly below
  // its rail; its readout is absolutely positioned so it never shifts centering.)
  const railH = SUBHEAD_H + COL_LABEL_GUTTER + n * rowH;

  const barCls = reducedMotion ? "" : "transition-[width,opacity] duration-300";

  const hoveredQTok = hovered ? displayTokens[hovered.q] : null;
  const hoveredKTok = hovered ? displayTokens[hovered.k] : null;
  const hoveredW = hovered ? matrix[hovered.q]?.[hovered.k] : undefined;

  /** Cross-highlight role of token row i under the current matrix hover. */
  const roleOf = (i: number): "q" | "k" | null =>
    hovered ? (i === hovered.q ? "q" : i === hovered.k ? "k" : null) : null;

  // One token row: index + chip, shared by the tokenizer and embedding
  // columns so rows align and cross-highlight identically.
  const tokenChip = (i: number, tip: ReactNode) => {
    const role = roleOf(i);
    return (
      <div className="group relative flex items-center gap-1.5" style={{ height: rowH }}>
        <span className="w-5 shrink-0 text-right font-mono text-[9px] text-muted opacity-60">
          {String(i).padStart(2, "0")}
        </span>
        <span
          className={`relative flex w-28 items-baseline rounded-md px-2 py-1 font-mono text-xs leading-none text-white ${
            role ? "ring-1 ring-white" : ""
          }`}
          style={{ backgroundColor: TOKEN_COLORS[i % TOKEN_COLORS.length] }}
        >
          <span className="min-w-0 flex-1 truncate whitespace-pre text-left">
            {displayTokens[i]}
          </span>
          {sentence?.tokenIds?.[i] !== undefined ? (
            <span className="shrink-0 pl-1.5 text-[9px] leading-none text-white/70">
              {sentence.tokenIds[i]}
            </span>
          ) : null}
          {/* Absolutely positioned so it never widens the row on hover. */}
          {role ? (
            <span className="absolute left-full top-1/2 ml-1.5 -translate-y-1/2 font-mono text-[9px] uppercase text-white">
              {role === "q" ? "Q" : "K"}
            </span>
          ) : null}
        </span>
        <HoverTip>{tip}</HoverTip>
      </div>
    );
  };

  // The shared top zone for a token-aligned column: an optional sub-header line
  // (SUBHEAD_H) plus the key-label gutter (COL_LABEL_GUTTER). The matrix reserves
  // the same two zones (its sub-header + the Heatmap's top gutter), so every
  // column's first token row starts at the identical offset.
  const topZone = (subhead?: ReactNode) => (
    <>
      <div
        className="flex items-end font-mono text-[10px] uppercase tracking-wide text-muted"
        style={{ height: SUBHEAD_H }}
      >
        {subhead}
      </div>
      <div aria-hidden style={{ height: COL_LABEL_GUTTER }} />
    </>
  );

  return (
    <StationLayout
      title="Transformer"
      subtitle="跟著一個 token，看它流過一次真實的 forward pass。"
      fullBleed
      input={
        <SuggestInput
          value={customText}
          onChange={setCustomText}
          onSubmit={submitText}
          ariaLabel="輸入句子"
          placeholder="自己打一句…GPU 跑整條 pipeline"
          maxLength={200}
          presets={(data?.sentences ?? []).map((s) => {
            const text = s.tokens.join("").trim();
            return { label: text, value: text };
          })}
          status={<LiveStatus state={liveState} />}
        />
      }
      controls={
        <DockControls>
          <BlockSlider
            label="Layer"
            info="選看第幾層。attention matrix 和 MLP 切片都會跟著換層。淺層多半關注鄰近、表面的關係，越深的層才逐漸組合出比較抽象的語意。"
            min={0}
            max={nLayers - 1}
            step={1}
            value={l}
            onChange={setLayer}
            format={(v) => `L${v} / L${nLayers - 1}`}
          />
          <BlockSlider
            label="Head"
            info="選同一層裡的哪一個注意力頭。每個 head 各自學到不同的關注模式；真實模型沒有乾淨的「這個 head 做什麼」標籤，自己去翻。"
            min={0}
            max={nHeads - 1}
            step={1}
            value={h}
            onChange={setHead}
            format={(v) => `H${v} / H${nHeads - 1}`}
          />
        </DockControls>
      }
      takeaway={
        <span>
          一次 forward pass 就是一條生產線：tokenizer 給 id、embedding 給向量，
          attention 讓每個 token 一跳看回整句（causal：只能看左邊），MLP
          再逐一變換。把這個 block 疊 {nLayers} 層、每層 {nHeads} 個
          head，最後 softmax 出下一個 token，就是整個模型。
        </span>
      }
    >
      <div className="relative h-full w-full">
        {error ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-md text-center text-sm text-warning">
              載入 pipeline 資料失敗（{error}）。請執行{" "}
              <code className="font-mono">uv run camp-precompute transformer</code>。
            </p>
          </div>
        ) : !data || !sentence ? (
          <div className="flex h-full items-center justify-center">
            <p className="font-mono text-xs text-muted">pipeline 資料載入中…</p>
          </div>
        ) : (
          /* The pipeline: one horizontally-scrollable, left-to-right row. */
          <div className="absolute inset-0 overflow-auto">
            <div className="flex min-h-full min-w-max items-stretch gap-4 px-10 pt-28 pb-64">
              {/* 01 — 輸入 */}
              <Column index="01" title="輸入">
                <div className="max-w-[200px] rounded-md border border-border/60 bg-panel px-4 py-3 text-sm leading-relaxed text-fg">
                  {tokens.join("")}
                </div>
              </Column>

              <Arrow />

              {/* 02 — tokenizer（tokenizer 站的色塊 chips） */}
              <Column index="02" title="Tokenizer">
                <div
                  className="flex flex-col"
                  style={{ height: railH, transform: GROUP_NUDGE }}
                >
                  {topZone()}
                  {tokens.map((_, i) =>
                    <div key={`tok-${i}`}>
                      {tokenChip(
                        i,
                        <>
                          模型真正讀到的第 {i} 個 token（真實 Qwen
                          subword），右邊的數字是它在詞彙表裡的 id，和 Tokenizer
                          站看到的是同一回事。␣ 代表 token 自帶的空格。
                        </>,
                      )}
                    </div>,
                  )}
                </div>
              </Column>

              <Arrow />

              {/* 03 — embedding（embedding 站的向量條） */}
              <Column index="03" title="Embedding">
                {embVectors ? (
                  <div
                    className="flex flex-col"
                    style={{ height: railH, transform: GROUP_NUDGE }}
                  >
                    {topZone()}
                    {embVectors.map((vec, i) => {
                      const role = roleOf(i);
                      return (
                        <div
                          key={`emb-${i}`}
                          className="group relative flex items-center"
                          style={{ height: rowH }}
                        >
                          <div className={role ? "rounded-sm ring-1 ring-white" : ""}>
                            <VectorStrip
                              values={vec}
                              maxAbs={embMaxAbs}
                              cellSize={10}
                              ariaLabel={`embedding of ${displayTokens[i]}`}
                            />
                          </div>
                          <HoverTip>
                            <span className="font-mono text-accent">
                              {displayTokens[i]}
                            </span>{" "}
                            的 embedding 向量：token id 換成一串數字，語意才有幾何。
                            全長 {sentence.embedding?.fullDims} 維，這裡只畫得下{" "}
                            {sentence.embedding?.dims} 維的代表切片。
                          </HoverTip>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="max-w-[180px] text-xs text-muted">
                    這句只有 attention 記錄（伺服器未回傳 embedding）。
                  </p>
                )}
              </Column>

              <Arrow />

              {/* 04 — 迷你模型：attention matrix + MLP，由 layer/head 轉盤驅動 */}
              <Column
                index="04"
                title={
                  <>
                    {data.model} ·{" "}
                    <span className="text-accent">
                      L{l} · H{h}
                    </span>
                  </>
                }
              >
                <div className="flex items-start gap-5" style={{ transform: GROUP_NUDGE }}>
                  {/* attention matrix：列 = query，欄 = key */}
                  <div className="relative flex flex-col" style={{ height: railH }}>
                    <div
                      className="flex items-end font-mono text-[10px] uppercase tracking-wide text-muted"
                      style={{ height: SUBHEAD_H }}
                    >
                      self-attention · 列 = query · 欄 = key
                    </div>
                    <div style={{ width: matrixW }}>
                      <Heatmap
                        matrix={matrix}
                        rowLabels={displayTokens}
                        colLabels={displayTokens}
                        min={0}
                        max={1}
                        highlightMax={false}
                        height={matrixH}
                        topGutter={COL_LABEL_GUTTER}
                        colLabelAngle={-45}
                        onHoverCell={(c) =>
                          setHovered(
                            c && c.col <= c.row ? { q: c.row, k: c.col } : null,
                          )
                        }
                        activeCell={
                          hovered ? { row: hovered.q, col: hovered.k } : null
                        }
                        activeCellStrokeClass="stroke-white"
                      />
                    </div>
                    {/* Absolutely positioned readout: it sits just below the
                        matrix (which itself spills a few px past the fixed-height
                        rail) so swapping the default line for the hover readout
                        never resizes the rail or shifts the group's centering. */}
                    <p
                      className="absolute top-full mt-2 h-8 font-mono text-[10px] leading-snug text-muted"
                      style={{ width: Math.max(matrixW, 320) }}
                    >
                      {hovered && hoveredW !== undefined && Number.isFinite(hoveredW) ? (
                        <>
                          <span className="text-accent">{hoveredQTok}</span> 分了{" "}
                          <span className="text-accent">
                            {(hoveredW * 100).toFixed(1)}%
                          </span>{" "}
                          的注意力給 <span className="text-accent">{hoveredKTok}</span>
                        </>
                      ) : (
                        <> </>
                      )}
                    </p>
                  </div>

                  {/* MLP：attention 混完，MLP 逐 token 變換 */}
                  <div className="group relative flex flex-col" style={{ height: railH }}>
                    {topZone(
                      <>
                        MLP · <span className="text-accent">L{l}</span>
                      </>,
                    )}
                    {mlpActs ? (
                      <>
                        <div className="flex flex-col">
                          {mlpActs.map((vec, i) => {
                            const role = roleOf(i);
                            return (
                              <div
                                key={`mlp-${i}`}
                                className="flex items-center"
                                style={{ height: rowH }}
                              >
                                <div
                                  className={
                                    role ? "rounded-sm ring-1 ring-white" : ""
                                  }
                                >
                                  <VectorStrip
                                    values={vec}
                                    maxAbs={mlpMaxAbs}
                                    cellSize={10}
                                    ariaLabel={`MLP activation of ${displayTokens[i]} at layer ${l}`}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <HoverTip>
                          attention 把整句的資訊混進每個 token 之後，MLP
                          再對每個 token 各自做一次非線性變換。這是 L{l} 真實的
                          activation，全長 {sentence.mlp?.fullDims} 維，只畫得下{" "}
                          {sentence.mlp?.dims} 維的代表切片。
                        </HoverTip>
                      </>
                    ) : (
                      <p className="max-w-[160px] text-xs text-muted">
                        這句只有 attention 記錄（伺服器未回傳 MLP）。
                      </p>
                    )}
                  </div>
                </div>
              </Column>

              <Arrow />

              {/* 05 — 輸出（next-token 站的機率長條） */}
              <Column index="05" title="Next Token">
                {outputProbs.length ? (
                  <div className="group relative flex w-64 flex-col gap-1.5">
                    {outputProbs.map((p, i) => {
                      const isArgmax = i === 0;
                      return (
                        <div key={p.token} className="flex items-center gap-2">
                          <span
                            className={`w-16 shrink-0 truncate text-left font-mono text-xs ${
                              isArgmax ? "text-accent" : "text-muted"
                            }`}
                          >
                            {displayToken(p.token)}
                          </span>
                          <div className="relative h-3.5 flex-1 overflow-hidden rounded-sm bg-panel">
                            <div
                              className={`h-full rounded-sm bg-accent ${barCls}`}
                              style={{
                                width: `${(p.prob / maxProb) * 100}%`,
                                opacity: isArgmax ? 1 : 0.35 + 0.5 * p.prob,
                              }}
                            />
                          </div>
                          <span className="w-11 shrink-0 text-right font-mono text-[10px] text-muted">
                            {(p.prob * 100).toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                    <HoverTip>
                      疊完 {nLayers} 層之後，最後一個 token 的向量 softmax
                      成下一個 token 的機率，和 Next Token 站是同一條長條。
                      這是真實的 top-{sentence.output?.length ?? 0}
                      分布，softmax(T=1)。
                    </HoverTip>
                  </div>
                ) : (
                  <p className="max-w-[180px] text-xs text-muted">
                    這句只有 attention 記錄（伺服器未回傳 next-token 分布）。
                  </p>
                )}
              </Column>
            </div>
          </div>
        )}
      </div>
    </StationLayout>
  );
}
