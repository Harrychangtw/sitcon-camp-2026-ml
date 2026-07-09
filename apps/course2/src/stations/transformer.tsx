/**
 * TRANSFORMER — station 06 of Course 2, the payoff.
 *
 * Pipeline overhaul: ONE horizontally-scrollable, left-to-right diagram of a
 * real forward pass — 輸入 → tokenizer → embedding → 迷你模型（attention
 * matrix + MLP，Layer × Head 縮圖選格）→ next-token 輸出。The left/right columns
 * deliberately echo the earlier stations (tokenizer 的色塊 chips、embedding 的
 * 向量條、next-token 的機率長條), so the course visibly chains into one model.
 *
 * EVERY number on screen is a real Qwen3-0.6B output: presets are RECORDED
 * pipeline payloads (attention.json, written by `camp-precompute transformer`);
 * typed sentences come from the live GPU server running the same
 * qwen.pipeline_payload(). Embedding/MLP strips are fixed-stride subsamples of
 * the real 1024-dim / 3072-dim vectors — labeled 代表性切片, never decorative.
 *
 * Interaction is free clicking + hover (no guided steps): the Layer × Head
 * pad (a 2-axis slider shaped like the model, layers × heads) picks which
 * attention matrix + MLP slice to show; hovering a matrix cell
 * cross-highlights the query + key tokens across the columns; hovering
 * chips/strips surfaces short explanations. The browser NEVER runs a
 * transformer — it replays recorded/live JSON and does only a softmax over the
 * top-N exported logits.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  BlockSlider,
  DockControls,
  InfoLabel,
  LiveStatus,
  LoadingTimer,
  StationLayout,
  SuggestInput,
  type LiveState,
} from "@camp/ui";
import { Heatmap, VectorStrip } from "@camp/viz";
import { liveInferOutcome, loadJSON } from "@camp/data";

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
  /** The verbatim source text, when known (typed input). Preferred over
   * joining `tokens` for display: a CJK char split into byte-fallback pieces
   * (數 → two ? tokens) rejoins into replacement chars, but `text` is exact. */
  text?: string;
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

/** softmax(logit / T) over the exported top-N log-probs — the only in-browser
 * math. T reshapes the distribution: higher = flatter/more random, lower = more
 * peaked. */
function softmax(logits: number[], temperature = 1): number[] {
  const t = Math.max(temperature, 1e-3);
  const scaled = logits.map((l) => l / t);
  const max = Math.max(...scaled);
  const exps = scaled.map((s) => Math.exp(s - max));
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
const COL_LABEL_GUTTER = 56;

/** Height of a column's shared top zone (sub-header + key-label gutter) above
 * its first token row. Row i's vertical center is TOP_OFFSET + i·rowH + rowH/2,
 * identical in every token-aligned column — the anchor the arrow overlay uses. */
const TOP_OFFSET = SUBHEAD_H + COL_LABEL_GUTTER;

/** The Heatmap's internal inter-cell gap (px); also the amount the matrix's cell
 * rows sit above the plain token rows (cellH = rowH − GAP), corrected with a
 * matching top nudge so every column's row i lands on one line. */
const HEATMAP_GAP = 2;

/** Upward nudge (px) is applied as a bottom SPACER rather than a transform: a
 * spacer of 2×nudge under the content shifts it up by `nudge` when the column
 * is `safe center`-ed, yet collapses out of the way (top-aligning) once the
 * content is taller than the viewport — so tall sentences never ride up over
 * the column header. The tokenizer / embedding / qwen columns share one value
 * so they stay row-aligned; the input column gets its own smaller nudge. */
const GROUP_NUDGE = 32;
const INPUT_NUDGE = 12;

/** One labeled pipeline column. All columns stretch to the row's height so the
 * 01–05 index headers share one top line. Content uses `safe center`: centered
 * while it fits, but top-anchored the moment it is taller than the column, so a
 * long sentence's rows never ride up and overlap the header. Honesty footnotes
 * live inside each step's hover tooltip, not on an axis. */
function Column({
  index,
  title,
  children,
}: {
  index: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex shrink-0 flex-col">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-wide text-muted">
        <span className="mr-1.5 opacity-60">{index}</span>
        {title}
      </div>
      <div
        className="flex flex-1 flex-col justify-center"
        style={{ justifyContent: "safe center" }}
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

/** A concise white arrow drawn in a token-aligned column's left gutter, linking
 * the two cross-highlighted rows — from the query capsule to the key capsule —
 * so "this token attends to that token" reads off the matrix, on the embedding
 * and MLP strips too. Rendered only while a matrix cell is hovered (q ≠ k);
 * absolutely positioned so it never disturbs row layout. */
function CapsuleConnector({
  q,
  k,
  rowH,
  height,
}: {
  q: number;
  k: number;
  rowH: number;
  height: number;
}) {
  if (q === k) return null;
  const yQ = TOP_OFFSET + q * rowH + rowH / 2;
  const yK = TOP_OFFSET + k * rowH + rowH / 2;
  const x = 7;
  const dir = yK < yQ ? -1 : 1; // travel direction from query → key
  const tipY = yK - dir * 5; // stop the shaft short of the key capsule
  return (
    <svg
      aria-hidden
      width={16}
      height={height}
      className="pointer-events-none absolute left-0 top-0 z-30 overflow-visible"
    >
      <line
        x1={x}
        y1={yQ + dir * 4}
        x2={x}
        y2={tipY}
        className="stroke-white"
        strokeWidth={1.25}
        strokeLinecap="round"
      />
      <path
        d={`M ${x - 3} ${tipY - dir * 3} L ${x} ${tipY + dir * 2} L ${x + 3} ${tipY - dir * 3}`}
        className="fill-none stroke-white"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// LayerHeadPad cell geometry: 8px cells on a 9px pitch. At Qwen3-0.6B's
// 28 layers × 16 heads the pad lands at 251×143px, dock-sized.
const PAD_CELL = 8;
const PAD_GAP = 1;
const PAD_PITCH = PAD_CELL + PAD_GAP;

/** Layer × Head as ONE dock control: a two-axis slider pad shaped like the
 * model itself. Columns = the `nLayers` stacked blocks (depth runs left→right,
 * matching the pipeline flow); rows = the `nHeads` heads inside each block —
 * every cell IS one real attention head. Click or drag moves the crosshair
 * (x picks the layer, y the head, one gesture sets both); arrow keys nudge.
 * Replaces two disconnected sliders so "a layer is a stack of heads" reads
 * spatially instead of numerically. */
function LayerHeadPad({
  nLayers,
  nHeads,
  layer,
  head,
  onPick,
}: {
  nLayers: number;
  nHeads: number;
  layer: number;
  head: number;
  onPick: (layer: number, head: number) => void;
}) {
  const [hover, setHover] = useState<{ l: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const padW = nLayers * PAD_PITCH - PAD_GAP;
  const padH = nHeads * PAD_PITCH - PAD_GAP;

  const cellAt = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const cl = Math.min(
      nLayers - 1,
      Math.max(0, Math.floor((e.clientX - r.left) / PAD_PITCH)),
    );
    const ch = Math.min(
      nHeads - 1,
      Math.max(0, Math.floor((e.clientY - r.top) / PAD_PITCH)),
    );
    return { l: cl, h: ch };
  };

  // The bubble tracks whatever cell is "live": the hovered cell while
  // exploring, the committed selection otherwise (dragging keeps them equal).
  const live = hover ?? { l: layer, h: head };

  return (
    <div className="group/control col-span-2 grid grid-cols-subgrid items-center">
      <InfoLabel
        label="Layer × Head"
        gloss={`模型縮圖：橫向 ${nLayers} 層，縱向每層 ${nHeads} 個 head，點或拖選一格`}
        info="每一格就是模型裡一個真實的注意力頭：橫軸選第幾層，縱軸選同一層裡的哪個 head，一次拖曳同時定兩個。淺層多半關注鄰近、表面的關係，越深越抽象；每個 head 各自學到不同的關注模式，沒有現成標籤，自己去翻。"
      />
      <div
        className="group/pad relative flex items-start gap-1.5 py-1 outline-none focus-visible:rounded-md focus-visible:ring-1 focus-visible:ring-white"
        tabIndex={0}
        role="group"
        aria-label={`Layer 與 Head 選擇：目前 L${layer}、H${head}，方向鍵可調整`}
        onKeyDown={(e) => {
          const d: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          };
          const step = d[e.key];
          if (!step) return;
          e.preventDefault();
          onPick(
            Math.min(nLayers - 1, Math.max(0, layer + step[0])),
            Math.min(nHeads - 1, Math.max(0, head + step[1])),
          );
        }}
      >
        {/* Value bubble — BlockSlider's idiom, tracking the live cell. */}
        <div
          className={`pointer-events-none absolute -top-6 z-10 -translate-x-1/2 whitespace-nowrap rounded-sm border border-border bg-panel px-2 py-0.5 font-mono text-xs text-fg shadow-md transition-all duration-150 ${
            hover || dragging
              ? "scale-100 opacity-100"
              : "scale-90 opacity-0 group-hover/pad:scale-100 group-hover/pad:opacity-100"
          }`}
          style={{ left: 18 + live.l * PAD_PITCH + PAD_CELL / 2 }}
        >
          L{live.l} · H{live.h}
        </div>
        {/* Head axis — top and bottom row indices. */}
        <div
          className="flex w-4 shrink-0 flex-col justify-between text-right font-mono text-[9px] leading-none text-muted"
          style={{ height: padH }}
        >
          <span>H0</span>
          <span>H{nHeads - 1}</span>
        </div>
        <div className="flex flex-col gap-1">
          <svg
            width={padW}
            height={padH}
            className="cursor-pointer touch-none opacity-80 transition-opacity duration-150 group-hover/pad:opacity-100"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragging(true);
              const c = cellAt(e);
              setHover(c);
              onPick(c.l, c.h);
            }}
            onPointerMove={(e) => {
              const c = cellAt(e);
              setHover(c);
              if (dragging) onPick(c.l, c.h);
            }}
            onPointerUp={() => setDragging(false)}
            onPointerLeave={() => {
              if (!dragging) setHover(null);
            }}
          >
            {Array.from({ length: nLayers }, (_, cl) =>
              Array.from({ length: nHeads }, (_, ch) => {
                const selected = cl === layer && ch === head;
                const crosshair = cl === layer || ch === head;
                return (
                  <rect
                    key={`${cl}-${ch}`}
                    x={cl * PAD_PITCH}
                    y={ch * PAD_PITCH}
                    width={PAD_CELL}
                    height={PAD_CELL}
                    rx={1.5}
                    className={
                      selected
                        ? "fill-accent"
                        : crosshair
                          ? "fill-fg/30"
                          : "fill-fg/10"
                    }
                  />
                );
              }),
            )}
            {/* White ring on the selected cell — the crosshair's handle. */}
            <rect
              x={layer * PAD_PITCH - 1}
              y={head * PAD_PITCH - 1}
              width={PAD_CELL + 2}
              height={PAD_CELL + 2}
              rx={2.5}
              className="fill-none stroke-white"
              strokeWidth={1.25}
            />
          </svg>
          {/* Layer axis — depth runs left→right, like the pipeline. */}
          <div
            className="flex justify-between font-mono text-[9px] leading-none text-muted"
            style={{ width: padW }}
          >
            <span>L0</span>
            <span className="opacity-70">Layer 層 →</span>
            <span>L{nLayers - 1}</span>
          </div>
        </div>
      </div>
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
  const [temperature, setTemperature] = useState(1);
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
  // The last text that actually landed (preset picked locally, or live GPU
  // success) — drives the input's 送出/已送出 button state. Failed/rejected
  // live calls deliberately DON'T count, so the button stays active for retry.
  const [lastSubmitted, setLastSubmitted] = useState<string | null>(null);
  const [liveMs, setLiveMs] = useState(0);
  const [livePending, setLivePending] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);
  // Server reached but rejected THIS sentence (over the token cap) — distinct
  // from `liveFailed` (offline), so the status can say "shorten it" not "offline".
  const [liveRejected, setLiveRejected] = useState(false);
  const [liveShown, setLiveShown] = useState(false);

  const sentences = useMemo<PipelineSentence[]>(() => {
    const base = data?.sentences ?? [];
    return customSentence ? [...base, customSentence] : base;
  }, [data, customSentence]);

  const submitCustom = async (text: string) => {
    if (!text || livePending) return;
    setLivePending(true);
    setLiveFailed(false);
    setLiveRejected(false);
    const r = await liveInferOutcome<LivePipeline>("/transformer/attention", { text });
    setLivePending(false);
    if (!r.ok) {
      // 4xx → too long / bad input (actionable); anything else → offline.
      if (r.reason === "rejected") setLiveRejected(true);
      else setLiveFailed(true);
      return;
    }
    setCustomSentence({ ...r.data, text });
    setLiveMs(r.ms);
    setLiveShown(true);
    setSentenceId(r.data.sentenceId);
    setLastSubmitted(text);
  };

  // The recorded sentences surface as the input's presets. A submitted text
  // that matches one selects it locally (no round-trip); anything else goes to
  // the live GPU.
  const presetByText = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of data?.sentences ?? []) {
      m.set((s.text ?? s.tokens.join("")).trim(), s.sentenceId);
    }
    return m;
  }, [data]);

  const submitText = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const presetId = presetByText.get(t);
    if (presetId) {
      // Picking a preset counts as a submit too — the button should idle.
      setSentenceId(presetId);
      setLastSubmitted(t);
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
    if (liveRejected) return { kind: "rejected" };
    if (liveFailed) return { kind: "cached" };
    if (liveShown && showingLive) return { kind: "live", ms: liveMs };
    return { kind: "idle" };
  }, [livePending, liveRejected, liveFailed, liveShown, showingLive, liveMs]);

  // A new sentence has different tokens — reset the hover.
  useEffect(() => {
    setHovered(null);
  }, [sentenceId]);

  // AUTO-SCROLL — the pipeline is wider than the viewport, so each dock
  // control steers the horizontal scroll to the thing it changes: picking a
  // layer/head nudges the attention matrix into view (minimal scroll, no-op
  // if it's already visible); the temperature dial jumps to the far right,
  // where the next-token bars it reshapes live. Both skip the initial render
  // so loading a station doesn't yank the view.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const matrixRef = useRef<HTMLDivElement | null>(null);
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) return;
    const c = scrollRef.current;
    const el = matrixRef.current;
    if (!c || !el) return;
    const margin = 48;
    const left =
      el.getBoundingClientRect().left -
      c.getBoundingClientRect().left +
      c.scrollLeft;
    const right = left + el.offsetWidth;
    // scroll-into-view "nearest" semantics, horizontal axis only.
    let target: number | null = null;
    if (left - margin < c.scrollLeft) target = left - margin;
    else if (right + margin > c.scrollLeft + c.clientWidth)
      target = right + margin - c.clientWidth;
    if (target === null) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    c.scrollTo({
      left: Math.max(0, target),
      behavior: reduce ? "auto" : "smooth",
    });
  }, [layer, head]);

  useEffect(() => {
    if (!didMount.current) return;
    const c = scrollRef.current;
    if (!c) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    c.scrollTo({ left: c.scrollWidth, behavior: reduce ? "auto" : "smooth" });
  }, [temperature]);

  // Declared AFTER the scroll effects: on the initial commit they run first
  // (seeing false), so only later user changes trigger the auto-scroll.
  useEffect(() => {
    didMount.current = true;
  }, []);

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

  // Next-token bars: softmax(logit / T) over the exported top-N log-probs. The
  // Temperature dial is the same knob as the Next Token station.
  const outputProbs = useMemo(() => {
    const entries = sentence?.output ?? [];
    if (!entries.length) return [];
    const p = softmax(entries.map((e) => e.logit), temperature);
    return entries
      .map((e, i) => ({ token: e.token, prob: p[i] ?? 0 }))
      .sort((a, b) => b.prob - a.prob);
  }, [sentence, temperature]);
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
        className="flex items-end whitespace-nowrap font-mono text-[10px] uppercase leading-none tracking-wide text-muted"
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
      subtitle="跟著一個 token，看它流過一次真實的 forward pass（模型從輸入一路算到輸出的完整一趟）。"
      fullBleed
      input={
        <SuggestInput
          value={customText}
          onChange={setCustomText}
          onSubmit={submitText}
          ariaLabel="輸入句子"
          placeholder="自己打一句…GPU 跑整條 pipeline"
          // Coarse char guard; the real limit is the server's 50 real-token cap
          // (can't be counted client-side). Over it → 422 → the status shows a
          // "too long" hint. Sized so ~50 English tokens usually fit.
          maxLength={280}
          submittedValue={lastSubmitted}
          presets={(data?.sentences ?? []).map((s) => {
            const text = (s.text ?? s.tokens.join("")).trim();
            return { label: text, value: text };
          })}
          status={<LiveStatus state={liveState} />}
        />
      }
      controls={
        <DockControls>
          <LayerHeadPad
            nLayers={nLayers}
            nHeads={nHeads}
            layer={l}
            head={h}
            onPick={(nl, nh) => {
              setLayer(nl);
              setHead(nh);
            }}
          />
          <BlockSlider
            label="Temperature 溫度"
            gloss="輸出隨機程度：越高越隨機，越低越保守"
            info="調整最後 next-token 機率分布的平緩程度。數值越高，分布越平均、輸出越隨機有變化；越低，機率越集中在高分 token、輸出越保守穩定。"
            min={0.1}
            max={2}
            step={0.1}
            value={temperature}
            onChange={setTemperature}
            format={(v) => v.toFixed(1)}
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
            <LoadingTimer label="pipeline 資料載入中" />
          </div>
        ) : (
          /* The pipeline: one horizontally-scrollable, left-to-right row. */
          <div ref={scrollRef} className="absolute inset-0 overflow-auto">
            <div className="flex min-h-full min-w-max items-stretch gap-4 px-10 pt-28 pb-64">
              {/* 01 — 輸入 */}
              <Column index="01" title="輸入">
                <div className="max-w-[200px] rounded-md border border-border/60 bg-panel px-4 py-3 text-sm leading-relaxed text-fg">
                  {/* Verbatim source when known — joining tokens would surface
                      byte-fallback pieces (數 → two ? tokens) as replacement
                      chars; only the tokenizer column should show that split. */}
                  {sentence.text ?? tokens.join("")}
                </div>
                {/* bottom spacer → nudges the input box up by INPUT_NUDGE */}
                <div aria-hidden style={{ height: INPUT_NUDGE * 2 }} />
              </Column>

              <Arrow />

              {/* 02 — tokenizer（tokenizer 站的色塊 chips） */}
              <Column index="02" title="Tokenizer 切字">
                <div className="flex flex-col" style={{ height: railH }}>
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
                {/* bottom spacer → shared GROUP_NUDGE for the aligned columns */}
                <div aria-hidden style={{ height: GROUP_NUDGE * 2 }} />
              </Column>

              <Arrow />

              {/* 03 — embedding（embedding 站的向量條） */}
              <Column index="03" title="Embedding 變成數字">
                {embVectors ? (
                  <>
                  <div className="relative flex flex-col" style={{ height: railH }}>
                    {topZone()}
                    {embVectors.map((vec, i) => {
                      const role = roleOf(i);
                      return (
                        <div
                          key={`emb-${i}`}
                          className="group relative flex items-center pl-4"
                          style={{ height: rowH }}
                        >
                          {/* flex (not block) so the highlight hugs the 10px
                              strip instead of the taller inline line-box. */}
                          <div
                            className={`flex ${role ? "rounded-sm ring-1 ring-white" : ""}`}
                          >
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
                    {hovered ? (
                      <CapsuleConnector
                        q={hovered.q}
                        k={hovered.k}
                        rowH={rowH}
                        height={railH}
                      />
                    ) : null}
                    {/* Always-visible one-liner: what these strips ARE (the
                        Embedding station's idea), no hover needed. */}
                    <p className="absolute top-full mt-2 w-44 pl-4 text-[11px] leading-snug text-muted">
                      每個 token 變成一排數字，顏色 = 數字的正負和大小
                    </p>
                  </div>
                  {/* bottom spacer → shared GROUP_NUDGE for the aligned columns */}
                  <div aria-hidden style={{ height: GROUP_NUDGE * 2 }} />
                  </>
                ) : (
                  <p className="max-w-[180px] text-xs text-muted">
                    這句只有 attention 記錄（伺服器未回傳 embedding）。
                  </p>
                )}
              </Column>

              <Arrow />

              {/* 04 — 迷你模型：attention matrix + MLP，由 Layer × Head 縮圖驅動 */}
              <Column
                index="04"
                title={
                  <>
                    {data.model} ·{" "}
                    <span className="text-accent">
                      L{l} · H{h}
                    </span>
                    {/* Spell the code out so L/H read as 層/head, not ids.
                        1-based ordinals for humans; L/H stay the 0-based ids. */}
                    <span className="ml-1.5 opacity-70">
                      第 {l + 1} 層的第 {h + 1} 個 head（共 {nHeads} 個）
                    </span>
                  </>
                }
              >
                <div className="flex items-start gap-5">
                  {/* attention matrix：列 = query，欄 = key */}
                  <div
                    ref={matrixRef}
                    className="relative flex flex-col"
                    style={{ height: railH }}
                  >
                    <div
                      className="flex items-end whitespace-nowrap font-mono text-[10px] uppercase leading-none tracking-wide text-muted"
                      style={{ height: SUBHEAD_H }}
                    >
                      self-attention · 列 = query · 欄 = key
                    </div>
                    {/* +GAP/2 nudge: the Heatmap's cellH is rowH−GAP, so its
                        cell rows would sit 1px above the plain token rows; this
                        lands matrix row i on the same line as every column. */}
                    <div style={{ width: matrixW, marginTop: HEATMAP_GAP / 2 }}>
                      <Heatmap
                        matrix={matrix}
                        rowLabels={displayTokens}
                        colLabels={displayTokens}
                        min={0}
                        max={1}
                        highlightMax={false}
                        height={matrixH}
                        topGutter={COL_LABEL_GUTTER}
                        colLabelAngle={45}
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
                    {/* Persistent layers↔heads explainer (NOT hover-gated):
                        sits under the hover readout, still inside column 04. */}
                    <p
                      className="absolute top-full mt-12 text-[11px] leading-snug text-muted"
                      style={{ width: Math.max(matrixW, 320), maxWidth: 420 }}
                    >
                      一層是模型的一個處理階段；每一層裡有 {nHeads} 個
                      head，各自注意字和字之間不同的關係。模型把 {nLayers}{" "}
                      層疊起來，在下方的模型縮圖上點一格換層、換
                      head，看到的矩陣就跟著換。
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
                                className="flex items-center pl-4"
                                style={{ height: rowH }}
                              >
                                {/* flex hugs the 10px strip so the highlight
                                    stays a slim capsule (not the tall line-box). */}
                                <div
                                  className={`flex ${
                                    role ? "rounded-sm ring-1 ring-white" : ""
                                  }`}
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
                        {hovered ? (
                          <CapsuleConnector
                            q={hovered.q}
                            k={hovered.k}
                            rowH={rowH}
                            height={railH}
                          />
                        ) : null}
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
                {/* bottom spacer → shared GROUP_NUDGE for the aligned columns */}
                <div aria-hidden style={{ height: GROUP_NUDGE * 2 }} />
              </Column>

              <Arrow />

              {/* 05 — 輸出（next-token 站的機率長條） */}
              <Column index="05" title="Next Token 下一個 token">
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
                      分布，softmax(T={temperature.toFixed(1)})。
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
