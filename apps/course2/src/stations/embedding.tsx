/**
 * EMBEDDING STATION — "token 只是 id，語意從哪裡來？"
 *
 * Students browse REAL pretrained word vectors — zh-TW AND English embedded by
 * ONE multilingual model into ONE shared space — projected to 2D/3D, search a
 * word, and watch its nearest neighbours light up: 距離 ≈ 相似度, and it holds
 * ACROSS languages (貓 sits next to cat). Typing anything works: an in-vocab
 * word highlights instantly from the shipped artifacts; any other word is
 * embedded live by the GPU server with the same model and dropped into the
 * same cloud (LiveStatus shows the honest latency, or the offline fallback).
 * The heavy work (embedding thousands of words, PCA, k-means, neighbour
 * search) is done offline by the precompute pipeline; the browser only plots
 * points and highlights neighbours.
 */
import { useEffect, useMemo, useState } from "react";
import {
  LabeledSlider,
  LiveStatus,
  SegmentedControl,
  StationLayout,
  type LiveState,
} from "@camp/ui";
import {
  Scatter2D,
  Scatter3D,
  categoryColorMap,
  rgbCss,
  useThemeColors,
  type Scatter3DPoint,
} from "@camp/viz";
import { liveInferTimed, loadJSON } from "@camp/data";

type Dim = "2d" | "3d";

interface EmbeddingPoint {
  word: string;
  /** Source vocab list ("zh"/"en") for shipped words; null for a live word —
   * display metadata only, the vectors share one space either way. */
  lang?: string | null;
  x: number;
  y: number;
  z: number;
  category: string;
}

interface Neighbor {
  word: string;
  score: number;
}

type NeighborMap = Record<string, Neighbor[]>;

/** Response of the live server's POST /embedding/lookup — the same element
 * shapes as points/neighbors JSON, for any typed word. */
interface LiveLookup {
  word: string;
  inVocab: boolean;
  point: EmbeddingPoint;
  neighbors: Neighbor[];
  suggestions: string[];
}

const MAX_K = 15; // must match precompute TOP_K

export function EmbeddingStation() {
  // 1. STATE
  // Default to 3D: the cloud is explorable (drag to orbit, scroll to zoom via
  // Scatter3D's OrbitControls). 2D stays one click away for the flat cluster read.
  const [dim, setDim] = useState<Dim>("3d");
  const [query, setQuery] = useState("");
  const [k, setK] = useState(8);

  // 2. DATA — the unified precomputed artifacts (zh+en in one cloud).
  const [points, setPoints] = useState<EmbeddingPoint[]>([]);
  const [neighbors, setNeighbors] = useState<NeighborMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      loadJSON<EmbeddingPoint[]>("/data/course2/embedding/points.json"),
      loadJSON<NeighborMap>("/data/course2/embedding/neighbors.json"),
    ]).then(([pts, nbs]) => {
      if (!alive) return;
      setPoints(pts);
      setNeighbors(nbs);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 3. DERIVED STATE — pure functions of the loaded data + controls.
  const wordSet = useMemo(() => new Set(points.map((p) => p.word)), [points]);
  const langOf = useMemo(
    () => new Map(points.map((p) => [p.word, p.lang ?? null])),
    [points],
  );

  // In-vocab fast path: the word is already a point — highlight it without a
  // round-trip.
  const focusWord = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q && wordSet.has(q) ? q : null;
  }, [query, wordSet]);

  // ALWAYS-EMBED — a typed word outside the shipped vocab is the normal case,
  // not an error: the live server embeds it with the SAME model and it drops
  // into the same cloud. On any failure `liveInferTimed` yields null and the
  // shipped cloud simply stays as-is (LiveStatus says so honestly).
  //
  // The station (and the server) work ONE word at a time: /embedding/lookup
  // rejects whitespace with a 422. Honor that contract client-side so a typed
  // phrase ("apple store") never fires a lookup the server is bound to reject —
  // it's treated like a half-typed word (idle), not an offline failure.
  const missingWord = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || /\s/.test(q)) return null;
    return points.length > 0 && !wordSet.has(q) ? q : null;
  }, [query, points, wordSet]);

  const [live, setLive] = useState<LiveLookup | null>(null);
  const [liveMs, setLiveMs] = useState(0);
  const [livePending, setLivePending] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);

  useEffect(() => {
    setLive(null);
    setLiveFailed(false);
    if (!missingWord) return;
    let alive = true;
    setLivePending(true);
    // Debounced: only ask the server once typing pauses.
    const timer = setTimeout(() => {
      liveInferTimed<LiveLookup>("/embedding/lookup", {
        word: missingWord,
      }).then((r) => {
        if (!alive) return;
        setLivePending(false);
        if (r && r.data.word === missingWord) {
          setLive(r.data);
          setLiveMs(r.ms);
        } else {
          setLiveFailed(true);
        }
      });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
      setLivePending(false);
    };
  }, [missingWord]);

  const liveHit = live && live.word === missingWord ? live : null;

  // The one quiet mono line about the GPU round-trip (latency + fallback only).
  const liveState = useMemo<LiveState>(() => {
    if (!missingWord) return { kind: "idle" };
    if (livePending) return { kind: "pending" };
    if (liveHit) return { kind: "live", ms: liveMs };
    if (liveFailed) return { kind: "cached" };
    return { kind: "idle" };
  }, [missingWord, livePending, liveHit, liveMs, liveFailed]);

  // The word the station is focused on: precomputed when in vocab, live result
  // otherwise. Both flow through the SAME derived state below.
  const activeWord = focusWord ?? liveHit?.point.word ?? null;

  // The viz primitives key highlighting off `label`, so carry the word there.
  // A live word becomes one extra point in the same cloud.
  const scatterData = useMemo<Scatter3DPoint[]>(() => {
    const base = points.map((p) => ({
      x: p.x,
      y: p.y,
      z: p.z,
      category: p.category,
      label: p.word,
    }));
    if (liveHit) {
      base.push({
        x: liveHit.point.x,
        y: liveHit.point.y,
        z: liveHit.point.z,
        category: liveHit.point.category,
        label: liveHit.point.word,
      });
    }
    return base;
  }, [points, liveHit]);

  const nearest = useMemo<Neighbor[]>(() => {
    if (focusWord) return (neighbors[focusWord] ?? []).slice(0, k);
    if (liveHit) return liveHit.neighbors.slice(0, k);
    return [];
  }, [focusWord, neighbors, liveHit, k]);

  // The searched word + its k nearest neighbours are the only "hot" (lime) marks.
  const highlight = useMemo(
    () => (activeWord ? [activeWord, ...nearest.map((n) => n.word)] : []),
    [activeWord, nearest],
  );

  // Category legend (colors come straight from the theme palette). Categories
  // are k-means clusters over the COMBINED vocab — one cluster can span both
  // languages — each labelled by its most-central word.
  const colors = useThemeColors();
  const categories = useMemo(
    () => Array.from(new Set(points.map((p) => p.category))),
    [points],
  );
  const catColors = useMemo(
    () => categoryColorMap(colors, categories),
    [colors, categories],
  );

  return (
    <StationLayout
      title="Embedding"
      subtitle="token 只是一堆 id，語意是從哪裡來的？"
      fullBleed
      controls={
        <>
          <SegmentedControl<Dim>
            label="投影"
            value={dim}
            onChange={setDim}
            options={[
              { label: "2D", value: "2d" },
              { label: "3D", value: "3d" },
            ]}
          />

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-xs text-muted">搜尋詞</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              list="embedding-words"
              placeholder="例如 貓、cat、蘋果…"
              className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <datalist id="embedding-words">
              {points.map((p) => (
                <option key={p.word} value={p.word} />
              ))}
            </datalist>
            <LiveStatus state={liveState} />
          </label>

          <LabeledSlider
            label="鄰居數（k）"
            min={1}
            max={MAX_K}
            step={1}
            value={k}
            onChange={setK}
            format={(v) => `${v}`}
          />

          {/* Neighbour list — the "距離 ≈ 相似度" beat, made literal, across
              both languages. Works identically for precomputed (in-vocab) and
              live (novel) words. */}
          {activeWord ? (
            <div className="flex flex-col gap-2 border-t border-border/30 pt-3">
              <span className="font-mono text-xs text-accent">
                {activeWord} · 最近的 {nearest.length} 個
              </span>
              <ol className="flex flex-col gap-1">
                {nearest.map((n, i) => (
                  <li
                    key={n.word}
                    className="flex items-baseline justify-between gap-2 font-mono text-xs"
                  >
                    <span className="text-fg">
                      <span className="text-muted">
                        {String(i + 1).padStart(2, "0")}
                      </span>{" "}
                      {n.word}
                      {langOf.get(n.word) ? (
                        <span className="text-muted uppercase"> {langOf.get(n.word)}</span>
                      ) : null}
                    </span>
                    <span className="text-muted">{n.score.toFixed(3)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : categories.length > 0 ? (
            <div className="flex flex-col gap-2 border-t border-border/30 pt-3">
              <span className="font-mono text-xs text-muted">類別（k-means 群集）</span>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {categories.map((c) => (
                  <span
                    key={c}
                    className="flex items-center gap-1.5 font-mono text-xs text-muted"
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm border border-border"
                      style={{
                        backgroundColor: rgbCss(catColors.get(c) ?? colors.muted),
                      }}
                    />
                    {c}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </>
      }
      takeaway={
        <span>
          中文和英文的詞由<em>同一個</em>多語模型變成 vector，落在
          <em>同一個</em>空間裡。距離 ≈ 相似度，而且跨語言也成立：搜尋{" "}
          <span className="font-mono text-accent">貓</span>，旁邊是 貓咪、
          <span className="font-mono">cat</span>、
          <span className="font-mono">kitten</span>
          ——模型從沒看過任何翻譯對照表，只是它們出現的語境相似。語意也不是一個乾淨的點：搜尋{" "}
          <span className="font-mono text-accent">蘋果</span> 或{" "}
          <span className="font-mono">apple</span>
          ，水果和手機公司兩種意思的鄰居混在一起。詞彙雲外的詞也能玩——隨便打一個詞，GPU
          會用同一個模型即時算出它的位置，掉進同一朵雲。
        </span>
      }
    >
      <div className="flex h-full flex-col gap-3">
        <p className="text-sm text-muted">
          {loading
            ? "載入 embedding 中… "
            : `${points.length} 個詞（中＋英，同一個空間）投影到 ${dim.toUpperCase()}（離線 PCA）。`}
          {activeWord
            ? "它最近的鄰居會以亮綠色標示。"
            : "搜尋任何一個詞，點亮它最近的鄰居。"}
          {dim === "3d" ? " 拖曳可旋轉視角，滾動可縮放。" : ""}
        </p>
        <div className="min-h-0 flex-1">
          {dim === "3d" ? (
            <Scatter3D
              data={scatterData}
              colorBy
              highlight={highlight}
              fill
            />
          ) : (
            <Scatter2D
              data={scatterData}
              colorBy
              highlight={highlight}
              fill
            />
          )}
        </div>
      </div>
    </StationLayout>
  );
}
