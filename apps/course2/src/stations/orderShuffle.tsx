/**
 * ORDER SHUFFLE — station 3 of 6 (see prompts/README.md).
 *
 * The wall: word ORDER carries meaning, and an order-blind bag-of-words
 * aggregate can't see it. The station makes the bag-of-words PIPELINE literal as
 * a left→right flow diagram, so the invariance is something you watch rather
 * than read:
 *
 *   tokens ─► per-token embeddings ─►(平均 mean pool)─► ONE constant vector
 *
 * Students drag the vertical token stack to reorder it (or type their own
 * sentence, or hit 打亂). Two things sit at the end of the pipe, stacked:
 *
 *   - 詞袋指紋 (bag-of-words): the MEAN POOL of the per-token embeddings. Mean
 *     pooling is symmetric, so this fingerprint provably cannot move under
 *     shuffle — the strip physically does not change a cell. Invariance by
 *     construction: vectors are keyed on the WORD, the browser only averages
 *     them (light, allowed), so a reorder can't even change the request.
 *
 *   - 通順度 (order-aware): Qwen3-0.6B's sequence log-prob / perplexity for the
 *     CURRENT arrangement, fed by the dashed "order-wire" that BYPASSES the
 *     averaging node — the order information the bag throws away. Every
 *     conditional P(t_i | t_<i) changes when the order does, so this moves.
 *
 * Golden-rule split: presets are RECORDED real-model outputs (predictions.json
 * ships every permutation's fluency + the word vectors), so they work fully
 * offline; typed sentences go to the live GPU server running the same models.
 * The browser never runs a model — it averages a handful of small vectors and
 * looks numbers up.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  LiveStatus,
  LoadingTimer,
  StationLayout,
  SuggestInput,
  type LiveState,
} from "@camp/ui";
import { VectorStrip, useResizeObserver } from "@camp/viz";
import { liveInferTimed, loadJSON } from "@camp/data";

// --- artifact shape (public/data/course2/order-shuffle/predictions.json) -----

interface Arrangement {
  /** A permutation of word indices, e.g. [2,0,3,1]. */
  order: number[];
  avgLogProb: number;
  ppl: number;
}

interface Sentence {
  sentenceId: string;
  prompt: string;
  words: string[];
  /** Per-word embedding fingerprint (leading dims, L2-normalised vector). */
  wordVectors: Record<string, number[]>;
  arrangements: Arrangement[];
}

interface OrderShufflePayload {
  model: string;
  embeddingModel: string;
  fingerprintDims: number;
  /** [lo, hi] avg log-prob domain for the fluency bar. */
  logProbDomain: [number, number];
  sentences: Sentence[];
}

/** POST /order-shuffle/score response. */
interface LiveScore {
  tokens: string[];
  text: string;
  avgLogProb: number;
  ppl: number;
}

/** POST /order-shuffle/bag response. */
interface LiveBag {
  vectors: Record<string, number[]>;
  fingerprintDims: number;
}

const DATA_URL = "/data/course2/order-shuffle/predictions.json";
const CUSTOM_ID = "custom";
const MAX_CHIPS = 12;

// Word chips for typed input: ASCII words stay whole; Chinese splits into
// characters (we can't segment 詞 in the browser — honest and it still works).
const CHIP_RE = /[A-Za-z0-9']+|[一-鿿]/g;

// --- helpers -----------------------------------------------------------------

/** Fisher–Yates on a fresh copy. */
function shuffled<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/** Move one element of an order array from index `from` to index `to`. */
function moveInOrder(order: number[], from: number, to: number): number[] {
  const next = order.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as number);
  return next;
}

const naturalOrder = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Join chips for display: space between ASCII words, none otherwise —
 * mirrors the server/precompute join rule. */
function joinChips(tokens: string[]): string {
  let out = "";
  let prevAscii = false;
  for (const t of tokens) {
    const isAscii = /^[A-Za-z0-9']+$/.test(t);
    if (out && isAscii && prevAscii) out += " ";
    out += t;
    prevAscii = isAscii;
  }
  return out;
}

interface Pt {
  x: number;
  y: number;
}

/**
 * SVG path through a polyline of axis-aligned points, rounding each interior
 * corner with a quadratic bend of up to `radius` px (clamped to half the
 * shorter adjacent segment, so tight corners stay clean). Used for every
 * connector so the whole diagram routes strictly horizontal/vertical.
 */
function orthPath(pts: Pt[], radius: number): string {
  if (pts.length < 2) return "";
  const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
  const along = (a: Pt, b: Pt, r: number): Pt => {
    const len = dist(a, b) || 1;
    return { x: a.x + ((b.x - a.x) / len) * r, y: a.y + ((b.y - a.y) / len) * r };
  };
  let d = `M${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const r = Math.min(radius, dist(p0, p1) / 2, dist(p1, p2) / 2);
    const a = along(p1, p0, r);
    const b = along(p1, p2, r);
    d += ` L${a.x},${a.y} Q${p1.x},${p1.y} ${b.x},${b.y}`;
  }
  const last = pts[pts.length - 1]!;
  d += ` L${last.x},${last.y}`;
  return d;
}

/** Mean pool over the multiset of word vectors — symmetric by construction. */
function meanPool(words: string[], vectors: Map<string, number[]>): number[] | null {
  const rows = words.map((w) => vectors.get(w)).filter((v): v is number[] => !!v);
  if (rows.length !== words.length || rows.length === 0) return null;
  const dim = rows[0]!.length;
  const mean = new Array<number>(dim).fill(0);
  for (const r of rows) for (let d = 0; d < dim; d++) mean[d]! += (r[d] ?? 0) / rows.length;
  return mean;
}

/**
 * A readout label with the shared InfoLabel idiom (persistent (i) marker +
 * fold-out panel on hover), replicated locally because these sit inside the
 * station's meter panel, not the dock. CSS-only, theme tokens only.
 */
function ReadoutInfo({ label, info }: { label: string; info: string }) {
  return (
    <span className="group/readout relative inline-flex cursor-help items-center gap-1 text-fg">
      {label}
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="h-3 w-3 shrink-0 text-muted transition-colors duration-150 group-hover/readout:text-accent"
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
      <span className="pointer-events-none absolute bottom-full left-0 z-40 mb-1.5 w-max max-w-[16rem] rounded-md border border-border bg-panel px-3 py-2 font-sans text-xs font-normal leading-relaxed text-fg opacity-0 shadow-md transition-opacity duration-150 group-hover/readout:opacity-100">
        {info}
      </span>
    </span>
  );
}

// --- station -----------------------------------------------------------------

export function OrderShuffleStation() {
  // 1. STATE
  const [payload, setPayload] = useState<OrderShufflePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentenceId, setSentenceId] = useState<string | null>(null);
  /** The current chip words (from a preset or typed) in NATURAL order. */
  const [words, setWords] = useState<string[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  // Drag-to-reorder: the row position being dragged, and the row it's over.
  const [dragPos, setDragPos] = useState<number | null>(null);
  const [overPos, setOverPos] = useState<number | null>(null);
  const [customText, setCustomText] = useState("");
  const [customNote, setCustomNote] = useState<string | null>(null);

  // Word → fingerprint vector, accumulated from presets and /bag responses.
  const [vectorCache, setVectorCache] = useState<Map<string, number[]>>(new Map());

  // 2. LOAD PRECOMPUTED DATA (via @camp/data, inside an effect)
  useEffect(() => {
    let alive = true;
    loadJSON<OrderShufflePayload>(DATA_URL)
      .then((data) => {
        if (!alive) return;
        setPayload(data);
        const first = data.sentences[0];
        if (first) {
          setSentenceId(first.sentenceId);
          setWords(first.words);
          // Start at the NATURAL order (fluent), never a random one — the
          // contrast needs a clear baseline.
          setOrder(naturalOrder(first.words.length));
        }
        // Seed the vector cache with every preset's shipped word vectors.
        setVectorCache((prev) => {
          const next = new Map(prev);
          for (const s of data.sentences) {
            for (const [w, v] of Object.entries(s.wordVectors)) next.set(w, v);
          }
          return next;
        });
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const preset = useMemo(
    () => payload?.sentences.find((s) => s.sentenceId === sentenceId) ?? null,
    [payload, sentenceId],
  );
  const isCustom = sentenceId === CUSTOM_ID;

  // 3. DERIVED — the current arrangement.
  const arranged = useMemo(() => order.map((i) => words[i] ?? ""), [order, words]);

  // ORDER-AWARE side. Presets: look the arrangement up in the RECORDED real
  // outputs (works offline). Typed: ask the live GPU server (same model),
  // debounced, with a client cache per arrangement.
  const presetScore = useMemo<Arrangement | null>(() => {
    if (!preset) return null;
    const key = order.join(",");
    return preset.arrangements.find((a) => a.order.join(",") === key) ?? null;
  }, [preset, order]);

  const [liveScore, setLiveScore] = useState<LiveScore | null>(null);
  const [liveMs, setLiveMs] = useState(0);
  const [livePending, setLivePending] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);
  const scoreCache = useRef<Map<string, LiveScore>>(new Map());

  const arrangedKey = arranged.join(" ");

  useEffect(() => {
    if (!isCustom || arranged.length < 2) return;
    const cached = scoreCache.current.get(arrangedKey);
    if (cached) {
      setLiveScore(cached);
      setLiveFailed(false);
      return;
    }
    let alive = true;
    setLivePending(true);
    setLiveFailed(false);
    const timer = setTimeout(() => {
      liveInferTimed<LiveScore>("/order-shuffle/score", { tokens: arranged }).then(
        (r) => {
          if (!alive) return;
          setLivePending(false);
          if (r) {
            scoreCache.current.set(arrangedKey, r.data);
            setLiveScore(r.data);
            setLiveMs(r.ms);
          } else {
            setLiveFailed(true);
          }
        },
      );
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
      setLivePending(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCustom, arrangedKey]);

  const liveMatches =
    liveScore && liveScore.tokens.join(" ") === arrangedKey ? liveScore : null;

  const fluency = useMemo(
    () =>
      presetScore
        ? { avgLogProb: presetScore.avgLogProb, ppl: presetScore.ppl }
        : liveMatches
          ? { avgLogProb: liveMatches.avgLogProb, ppl: liveMatches.ppl }
          : null,
    [presetScore, liveMatches],
  );

  const liveState = useMemo<LiveState>(() => {
    if (!isCustom) return { kind: "idle" };
    if (livePending) return { kind: "pending" };
    if (liveMatches) return { kind: "live", ms: liveMs };
    if (liveFailed) return { kind: "cached" };
    return { kind: "idle" };
  }, [isCustom, livePending, liveMatches, liveMs, liveFailed]);

  // Keep the last real fluency on screen while a live request is in flight, so
  // the meter's bars stay mounted and simply animate to the new value when the
  // result lands — no collapse to a "GPU 計算中…" line, no layout shift. The
  // pending state is signalled instead by a sweeping bar on the panel's top edge.
  const isPending = liveState.kind === "pending";
  const lastFluencyRef = useRef<{ avgLogProb: number; ppl: number } | null>(null);
  if (fluency) lastFluencyRef.current = fluency;
  const shownFluency = fluency ?? (isPending ? lastFluencyRef.current : null);

  // BAG-OF-WORDS side: mean pool over the word multiset. The cache is keyed by
  // WORD (not position), so `order` cannot influence the result — invariance
  // by construction, and the strip visibly does not move on shuffle.
  const fingerprint = useMemo(
    () => meanPool(words, vectorCache),
    [words, vectorCache],
  );

  // The current arrangement as {word, vector} rows — tokens and their embedding
  // strips move together because both are derived from `order`.
  const tokenRows = useMemo(
    () =>
      order.map((wordIndex, position) => ({
        position,
        wordIndex,
        word: words[wordIndex] ?? "",
        vec: vectorCache.get(words[wordIndex] ?? "") ?? null,
      })),
    [order, words, vectorCache],
  );

  // Width one VectorStrip occupies (cellSize 12 + 1px gap per cell). All strips
  // share the embedding dim, so reserving this on the fingerprint slot keeps the
  // results block from collapsing — and re-centering the whole row — when a typed
  // sentence's fingerprint is still loading (or the server is offline).
  const stripWidthPx = useMemo(() => {
    const dim = fingerprint?.length ?? tokenRows.find((r) => r.vec)?.vec?.length;
    return dim ? dim * 12 + (dim - 1) : undefined;
  }, [fingerprint, tokenRows]);

  // One shared color scale across every strip (per-token + the averaged one) so
  // the "same magnitude, same color" reading holds across the whole diagram.
  const stripMax = useMemo(() => {
    let m = 1e-9;
    for (const row of tokenRows) {
      if (row.vec) for (const x of row.vec) m = Math.max(m, Math.abs(x));
    }
    if (fingerprint) for (const x of fingerprint) m = Math.max(m, Math.abs(x));
    return m;
  }, [tokenRows, fingerprint]);

  // Fetch missing word vectors for a typed sentence — SORTED unique words, so
  // the request itself is order-free.
  useEffect(() => {
    if (!isCustom) return;
    const missing = Array.from(new Set(words)).filter((w) => !vectorCache.has(w));
    if (missing.length === 0) return;
    let alive = true;
    // Debounced: live-on-type means `words` changes per keystroke.
    const timer = setTimeout(() => {
      liveInferTimed<LiveBag>("/order-shuffle/bag", { words: missing.sort() }).then(
        (r) => {
          if (!alive || !r) return;
          setVectorCache((prev) => {
            const next = new Map(prev);
            for (const [w, v] of Object.entries(r.data.vectors)) next.set(w, v);
            return next;
          });
        },
      );
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [isCustom, words, vectorCache]);

  // Fluency bar position from the shared display domain.
  const [loLp, hiLp] = payload?.logProbDomain ?? [-11, -2];
  const fluencyPct = shownFluency
    ? Math.max(0, Math.min(1, (shownFluency.avgLogProb - loLp) / (hiLp - loLp)))
    : 0;

  // --- order-wire geometry ---
  // A dashed path from the ordered-input bracket, down along the diagram floor,
  // under the averaging node, and up into the fluency meter — the order info
  // that bypasses averaging. Measured from real layout so it survives reflow,
  // reorder, and horizontal scroll (all coords are relative to the container).
  const { ref: diagramRef, size: diagramSize } = useResizeObserver<HTMLDivElement>();
  const bracketRef = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const avgCapsuleRef = useRef<HTMLDivElement>(null);
  const stripRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [wirePath, setWirePath] = useState<string | null>(null);
  // Solid pipeline lines: each embedding → the 平均 node, then node → fingerprint.
  const [feedPaths, setFeedPaths] = useState<string[]>([]);
  const [avgOutPath, setAvgOutPath] = useState<string | null>(null);

  useLayoutEffect(() => {
    const c = diagramRef.current;
    if (!c) return;
    const cr = c.getBoundingClientRect();

    // Dashed order-wire: bracket → diagram floor → up into the fluency meter,
    // bypassing the averaging node (the order info the bag throws away).
    const b = bracketRef.current;
    const m = meterRef.current;
    if (b && m) {
      const br = b.getBoundingClientRect();
      const mr = m.getBoundingClientRect();
      const startX = br.left - cr.left + 28;
      const startY = br.bottom - cr.top;
      const railY = cr.height - 6;
      const endX = mr.left - cr.left;
      const endY = mr.top - cr.top + mr.height / 2;
      setWirePath(
        orthPath(
          [
            { x: startX, y: startY },
            { x: startX, y: railY },
            { x: endX - 16, y: railY },
            { x: endX - 16, y: endY },
            { x: endX, y: endY },
          ],
          8,
        ),
      );
    } else {
      setWirePath(null);
    }

    // Solid feed lines: each embedding's right edge curves into the node's left.
    const node = nodeRef.current;
    if (node) {
      const nr = node.getBoundingClientRect();
      const nx = nr.left - cr.left;
      const ny = nr.top - cr.top + nr.height / 2;
      const paths: string[] = [];
      for (let i = 0; i < tokenRows.length; i++) {
        const el = stripRefs.current[i];
        if (!el) continue;
        const sr = el.getBoundingClientRect();
        const sx = sr.right - cr.left;
        const sy = sr.top - cr.top + sr.height / 2;
        // Out from the strip, down/up the shared bus, then into the node —
        // strictly horizontal/vertical with rounded corners. Strips share an
        // x, so the vertical legs stack into one clean merge bus.
        const midX = sx + Math.max(14, (nx - sx) * 0.5);
        paths.push(
          orthPath(
            [
              { x: sx, y: sy },
              { x: midX, y: sy },
              { x: midX, y: ny },
              { x: nx, y: ny },
            ],
            8,
          ),
        );
      }
      setFeedPaths(paths);

      // Solid line: node's right → the 詞袋指紋 (averaged vector) capsule.
      const cap = avgCapsuleRef.current;
      if (cap) {
        const pr = cap.getBoundingClientRect();
        const ox = nr.right - cr.left;
        const px = pr.left - cr.left;
        const py = pr.top - cr.top + pr.height / 2;
        const midX = ox + Math.max(14, (px - ox) * 0.5);
        setAvgOutPath(
          orthPath(
            [
              { x: ox, y: ny },
              { x: midX, y: ny },
              { x: midX, y: py },
              { x: px, y: py },
            ],
            8,
          ),
        );
      } else {
        setAvgOutPath(null);
      }
    } else {
      setFeedPaths([]);
      setAvgOutPath(null);
    }
  }, [diagramRef, diagramSize.width, diagramSize.height, tokenRows, fingerprint, fluency, sentenceId]);

  // --- interactions ---
  function selectSentence(id: string) {
    setDragPos(null);
    setOverPos(null);
    setSentenceId(id);
    if (id === CUSTOM_ID) return; // keep current custom words
    const next = payload?.sentences.find((s) => s.sentenceId === id);
    if (next) {
      setWords(next.words);
      setOrder(naturalOrder(next.words.length));
    }
  }

  // LIVE-ON-TYPE — the text splits into word chips as it's typed (no submit
  // step). Typing a preset's exact text selects the recorded sentence locally;
  // anything else becomes a custom arrangement. The /score and /bag effects are
  // debounced, so keystrokes coalesce.
  function handleText(text: string) {
    setCustomText(text);
    const t = text.trim();
    if (!t) return;
    const presetMatch = payload?.sentences.find((s) => joinChips(s.words) === t);
    if (presetMatch) {
      setCustomNote(null);
      selectSentence(presetMatch.sentenceId);
      return;
    }
    const all = t.match(CHIP_RE) ?? [];
    const chips = all.slice(0, MAX_CHIPS);
    if (chips.length < 2) {
      // Half-typed — keep whatever arrangement is on the board.
      setCustomNote(null);
      return;
    }
    setCustomNote(
      all.length > MAX_CHIPS ? `太長了，只取前 ${MAX_CHIPS} 個詞。` : null,
    );
    setDragPos(null);
    setOverPos(null);
    setSentenceId(CUSTOM_ID);
    setWords(chips);
    setOrder(naturalOrder(chips.length));
  }

  function onDragStart(position: number, e: React.DragEvent) {
    setDragPos(position);
    e.dataTransfer.effectAllowed = "move";
    // Firefox needs data set for a drag to start at all.
    e.dataTransfer.setData("text/plain", String(position));
  }

  function onDragOver(position: number, e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overPos !== position) setOverPos(position);
  }

  function onDrop(position: number) {
    if (dragPos !== null && dragPos !== position) {
      setOrder((prev) => moveInOrder(prev, dragPos, position));
    }
    setDragPos(null);
    setOverPos(null);
  }

  function onDragEnd() {
    setDragPos(null);
    setOverPos(null);
  }

  function doShuffle() {
    setDragPos(null);
    setOverPos(null);
    setOrder((prev) => {
      // Keep shuffling until the order actually changes.
      let next = shuffled(prev);
      for (let i = 0; i < 8 && next.join(",") === prev.join(","); i++) {
        next = shuffled(prev);
      }
      return next;
    });
  }

  return (
    <StationLayout
      title="打亂詞序"
      subtitle="詞序重要嗎？打亂一個句子，看哪個模型會注意到。"
      fullBleed
      input={
        <SuggestInput
          value={customText}
          onChange={handleText}
          ariaLabel="輸入句子"
          placeholder="自己打一句…會拆成詞塊"
          className="min-h-20 w-96 max-w-[80vw]"
          maxLength={200}
          capLabel={`最多 ${MAX_CHIPS} 個詞`}
          capReached={customNote !== null}
          presets={(payload?.sentences ?? []).map((s) => {
            const text = joinChips(s.words);
            return { label: text, value: text };
          })}
          status={<LiveStatus state={liveState} />}
          actions={
            <>
              <button
                type="button"
                onClick={doShuffle}
                className="flex h-7 items-center rounded bg-accent px-2.5 font-mono text-xs text-accent-fg transition-all hover:shadow-[0_0_10px] hover:shadow-accent/60"
              >
                打亂
              </button>
              <button
                type="button"
                onClick={() => {
                  setDragPos(null);
                  setOverPos(null);
                  setOrder(naturalOrder(words.length));
                }}
                className="flex h-7 items-center rounded bg-panel px-2.5 font-mono text-xs text-muted transition-colors hover:text-accent"
              >
                還原
              </button>
            </>
          }
        />
      }
      controls={null}
      takeaway={
        <span>
          打亂這些詞，<strong>詞袋指紋（bag-of-words）</strong>
          動也不動，它眼裡只有一堆詞。
          <span className="text-accent">順序感知</span>的模型（真的 Qwen）
          立刻察覺：通順的句子機率高，打亂的句子機率暴跌。
          語意藏在順序裡，這就是我們需要能讀懂序列的模型的原因。
        </span>
      }
    >
      {error ? (
        <div className="flex h-full items-center justify-center p-5">
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            無法載入預測結果：{error}
          </div>
        </div>
      ) : !payload || words.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <LoadingTimer label="載入預測結果中" />
        </div>
      ) : (
        // Scroll wrapper: vertically centered; horizontally centered when the
        // diagram fits, horizontally scrollable (no clipping) when it doesn't.
        // `w-max min-w-full` == content width but at least the viewport, so
        // justify-center adds no offset once we overflow.
        <div className="h-full w-full overflow-x-auto overflow-y-hidden">
          <div className="flex h-full w-max min-w-full items-center justify-center px-10 pb-28">
            {/* DIAGRAM — the bag-of-words pipeline, left to right. */}
            <div
              ref={diagramRef}
              className="relative flex items-center gap-6 pb-16 md:gap-10"
            >
              {/* connector overlay, drawn under the cards: solid lines follow the
                  real averaging flow (embeddings → 平均 → fingerprint); the
                  dashed wire is the order bypass to the fluency meter. */}
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                aria-hidden="true"
              >
                {feedPaths.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    fill="none"
                    strokeWidth={1.5}
                    className="stroke-muted/50"
                  />
                ))}
                {avgOutPath ? (
                  <path
                    d={avgOutPath}
                    fill="none"
                    strokeWidth={1.5}
                    className="stroke-muted/50"
                  />
                ) : null}
                {wirePath ? (
                  <path
                    d={wirePath}
                    fill="none"
                    strokeWidth={2}
                    strokeDasharray="5 6"
                    className="stroke-muted/50"
                  />
                ) : null}
              </svg>

              {/* REGION A — ordered input: tokens + their embeddings, wrapped in
                  the dashed bracket that "spans both" (this whole region is the
                  order the averaging node is about to throw away). */}
              <div
                ref={bracketRef}
                className="relative rounded-xl border border-dashed border-muted/60 px-4 py-5"
              >
                <span className="absolute -top-2.5 left-4 bg-bg px-1.5 font-mono text-[10px] uppercase tracking-wide text-muted">
                  有序輸入
                </span>
                <div className="mb-2 flex items-center gap-4">
                  <span className="w-36 font-mono text-[10px] uppercase tracking-wide text-muted">
                    詞 token
                  </span>
                  <span className="w-4" aria-hidden="true" />
                  <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                    向量 embedding
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {tokenRows.map((row) => {
                    const isOver = overPos === row.position && dragPos !== row.position;
                    const isDrag = dragPos === row.position;
                    return (
                      <div
                        key={`${row.wordIndex}-${row.position}`}
                        draggable
                        onDragStart={(e) => onDragStart(row.position, e)}
                        onDragOver={(e) => onDragOver(row.position, e)}
                        onDrop={() => onDrop(row.position)}
                        onDragEnd={onDragEnd}
                        className={`flex items-center gap-4 rounded-md transition-all ${
                          isDrag ? "opacity-40" : ""
                        } ${isOver ? "ring-1 ring-accent" : ""}`}
                      >
                        {/* token card: word left, drag handle (id slot) right */}
                        <div className="flex w-36 cursor-grab items-center justify-between gap-2 rounded-md border border-border bg-panel px-3 py-2 transition-colors hover:border-fg active:cursor-grabbing">
                          <span
                            className="min-w-0 flex-1 truncate font-sans text-base text-fg"
                            title={row.word}
                          >
                            {row.word}
                          </span>
                          <span
                            className="shrink-0 font-mono text-xs text-muted/60"
                            aria-hidden="true"
                          >
                            ⠿
                          </span>
                        </div>
                        {row.vec ? (
                          <span
                            ref={(el) => {
                              stripRefs.current[row.position] = el;
                            }}
                            className="inline-flex"
                          >
                            <VectorStrip
                              values={row.vec}
                              maxAbs={stripMax}
                              cellSize={12}
                              ariaLabel={`${row.word} 的向量`}
                            />
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-muted">
                            向量載入中…
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* REGION B — the averaging node the embeddings flow into (lines
                  in from every embedding, one line out to the fingerprint). */}
              <div className="flex flex-col items-center">
                <div
                  ref={nodeRef}
                  className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-accent/50 bg-panel text-center"
                >
                  <span className="font-sans text-sm text-fg">平均</span>
                </div>
              </div>

              {/* REGION C — two stacked capsules: the constant averaged vector
                  (from the node) and the order-aware meter (from the wire). */}
              <div className="flex flex-col gap-4">
                <div
                  ref={avgCapsuleRef}
                  className="flex flex-col gap-2 rounded-2xl border border-border bg-panel px-4 py-3"
                >
                  <div className="flex items-baseline justify-between gap-8">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                      詞袋指紋 · 平均向量
                    </span>
                    <span className="font-mono text-[10px] text-muted">
                      怎麼排都一樣
                    </span>
                  </div>
                  {/* On-face gloss (no hover needed): this is where students
                      first meet 詞袋指紋. Canonical glossary wording. */}
                  <span className="max-w-[16rem] text-[11px] leading-snug text-muted">
                    詞袋指紋（bag-of-words）：只數每個字出現幾次、完全不管順序的統計
                  </span>
                  {/* Fixed-height AND -width slot so the strip ↔ message swap
                      (custom words still fetching their vectors) doesn't nudge
                      the panel or re-center the whole row. */}
                  <div
                    className="flex min-h-4 items-center"
                    style={{ minWidth: stripWidthPx }}
                  >
                    {fingerprint ? (
                      <VectorStrip
                        values={fingerprint}
                        maxAbs={stripMax}
                        cellSize={12}
                        ariaLabel="詞袋指紋（平均向量）"
                      />
                    ) : (
                      <span className="text-xs text-muted">
                        {isCustom ? "拿不到這些詞的向量（伺服器離線？）。" : "…"}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  ref={meterRef}
                  className="relative flex flex-col gap-2 rounded-2xl border border-accent/40 bg-panel px-4 py-3"
                >
                  {/* Top-edge loading signal: an indeterminate sweep while the
                      live GPU score is in flight. Sits on the panel's top border
                      (rounded-t clips it to the corners — the capsule itself is
                      NOT overflow-hidden, so the hover fold-outs can escape) so
                      it never nudges layout — the bars below stay put and
                      refresh when the result lands. */}
                  {isPending ? (
                    <span
                      className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-2xl"
                      aria-hidden="true"
                    >
                      <span className="block h-full w-1/4 animate-indeterminate rounded-full bg-accent" />
                    </span>
                  ) : null}
                  <div className="flex items-baseline justify-between gap-8">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                      順序感知 · {payload.model.split("/").pop()}
                    </span>
                    <span className="font-mono text-[10px] text-accent">
                      會跟著順序變
                    </span>
                  </div>
                  {/* Fixed-height slot: bars whenever we have (or are fetching) a
                      score, message otherwise — both occupy the same height so
                      the panel never grows or shrinks. */}
                  <div className="flex min-h-[5.25rem] flex-col justify-center gap-2">
                    {shownFluency || isPending ? (
                      <>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-baseline justify-between font-mono text-[11px]">
                            <ReadoutInfo
                              label="通順度"
                              info="通順度：模型覺得這句話有多像人話，越高越順。這裡換算成 0 到 100 分方便讀，小字的平均 logP 是模型的原始分數。"
                            />
                            {/* Headline is the NORMALISED 0-100 score (from
                                fluencyPct), so a good sentence reads HIGH; the
                                raw avg log-prob (always negative) is demoted to
                                the small sub-value below. */}
                            <span className="text-accent">
                              {/* No "/ 100" while first score is in flight:
                                  an ellipsis with a denominator reads broken. */}
                              {shownFluency ? (
                                <>
                                  {Math.round(fluencyPct * 100)}
                                  <span className="text-muted"> / 100</span>
                                </>
                              ) : (
                                "…"
                              )}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-md bg-fg/10">
                            <div
                              className="h-full rounded-md bg-accent motion-safe:transition-[width] motion-safe:duration-500"
                              style={{ width: `${fluencyPct * 100}%` }}
                            />
                          </div>
                          <div className="text-right font-mono text-[10px] text-muted">
                            平均 logP{" "}
                            {shownFluency ? shownFluency.avgLogProb.toFixed(2) : "…"}
                          </div>
                        </div>
                        {/* 困惑度: lower = more fluent, so this bar fills as the
                            sentence gets WORSE — the visual opposite of 通順度.
                            ln(ppl) == -avgLogProb, so on the log scale the ppl bar
                            is exactly 1 - fluencyPct. */}
                        <div className="flex flex-col gap-1">
                          <div className="flex items-baseline justify-between font-mono text-[11px]">
                            <ReadoutInfo
                              label="困惑度（PPL）"
                              info="困惑度（PPL）：模型看這句話有多困惑，越低越好；和通順度是同一個數字的兩種看法（數學上 ln(困惑度) = −平均 logP）。"
                            />
                            <span className="text-fg">
                              {shownFluency ? shownFluency.ppl.toLocaleString() : "…"}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-md bg-fg/10">
                            <div
                              className="h-full rounded-md bg-accent3 motion-safe:transition-[width] motion-safe:duration-500"
                              style={{ width: `${shownFluency ? (1 - fluencyPct) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-muted">
                        {isCustom
                          ? "拿不到即時分數（伺服器離線？）。"
                          : "這個排列沒有預先算好的分數。"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </StationLayout>
  );
}
