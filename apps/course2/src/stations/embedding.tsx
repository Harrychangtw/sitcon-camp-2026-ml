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
  BlockSlider,
  BlockToggle,
  DockControls,
  LiveStatus,
  StationLayout,
  SuggestInput,
  type LiveState,
} from "@camp/ui";
import { Scatter2D, Scatter3D, type Scatter3DPoint } from "@camp/viz";
import { liveInferTimed, loadJSON } from "@camp/data";
import { QuestDock } from "../components/QuestDock";
import { CATEGORY_COLORS } from "../palette";

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

// Human-readable names for the precomputed semantic clusters. The artifact
// labels each cluster by the word nearest its centroid (並且, on, about…), which
// is opaque; these describe what the cluster's words actually have in common,
// derived by reading each cluster's members ranked by centrality. Keyed by the
// cluster id (the centroid word in points.json). A cluster with no entry falls
// back to showing its raw id, so a re-clustered artifact degrades, not breaks.
const CLUSTER_LABELS: Record<string, string> = {
  並且: "時間過渡與指示詞",
  之中: "書面虛詞與方位詞",
  作為: "機構業務關聯詞",
  天下: "人群與日常生活",
  國家: "國家與區域地名",
  am: "英文國家歷史詞彙",
  on: "英文文法虛詞",
  about: "英文一般事務詞彙",
};

// Prebuilt examples surfaced in the search field when it's focused and empty —
// bilingual on purpose (the whole point is one shared space across languages).
const PRESETS = [
  { label: "貓", value: "貓" },
  { label: "cat", value: "cat" },
  { label: "蘋果", value: "蘋果" },
  { label: "apple", value: "apple" },
  { label: "快樂", value: "快樂" },
  { label: "music", value: "music" },
] as const;

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
  // Tracked to gate the initial fetch; the loaded state reads as an empty cloud.
  const [, setLoading] = useState(true);

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

  // TAXONOMY — the model's own semantic clusters (precomputed k-means, each
  // named by the word nearest its centroid). One shared palette color per
  // cluster, assigned by cluster size (largest first) so the mapping is stable
  // across loads. The SAME `categoryColors` record drives both the point cloud
  // and the legend below, so a swatch always matches its dots exactly.
  const taxonomy = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of points) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .map(([category, count], i) => ({
        category,
        count,
        label: CLUSTER_LABELS[category] ?? category,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]!,
      }));
  }, [points]);

  const categoryColors = useMemo(() => {
    const rec: Record<string, string> = {};
    for (const t of taxonomy) rec[t.category] = t.color;
    return rec;
  }, [taxonomy]);

  // In-vocab fast path: the word is already a point — highlight it without a
  // round-trip.
  const focusWord = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q && wordSet.has(q) ? q : null;
  }, [query, wordSet]);

  // ALWAYS-EMBED: anything outside the shipped vocab is the normal case, not an
  // error. The live server embeds it with the SAME model and it drops into the
  // same cloud. On any failure `liveInferTimed` yields null and the shipped
  // cloud simply stays as-is (LiveStatus says so honestly).
  //
  // Phrases are allowed too: the embedding model reads a short sentence as one
  // vector, so a pasted phrase lands as a single point near the words closest to
  // its overall meaning. The 64-char cap on the input (and the server schema)
  // bounds the cost; the server no longer rejects whitespace. Gating on
  // whitespace here only swallowed pasted input silently, which read as broken.
  const missingWord = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
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
      label: p.word,
      category: p.category,
    }));
    if (liveHit) {
      base.push({
        x: liveHit.point.x,
        y: liveHit.point.y,
        z: liveHit.point.z,
        label: liveHit.point.word,
        category: liveHit.point.category,
      });
    }
    return base;
  }, [points, liveHit]);

  // Pointing at any point in the cloud previews it as if searched: the hovered
  // word takes precedence over the typed query, so its neighbours light up and
  // the readout panel fills. Reverts to the query the moment the cursor leaves.
  // On touch the Scatter primitives fire the same callback from tap-to-pin, so
  // a tapped point sticks here until the pin is cleared.
  const [hoverWord, setHoverWord] = useState<string | null>(null);
  const shownWord = hoverWord ?? activeWord;

  // Mobile-only (< md) disclosure state for the two top overlays. At phone
  // width the glossary and the legend can't float side by side without
  // covering the title or each other, so both fold into tap-to-expand lines
  // and default closed to leave the point cloud the screen. >= md ignores
  // these entirely and always shows both expanded.
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

  const nearest = useMemo<Neighbor[]>(() => {
    if (!shownWord) return [];
    // Shipped words carry precomputed neighbours; a live-embedded word carries
    // its own. Both are keyed by the exact word/label.
    if (neighbors[shownWord]) return neighbors[shownWord].slice(0, k);
    if (liveHit && liveHit.point.word === shownWord)
      return liveHit.neighbors.slice(0, k);
    return [];
  }, [shownWord, neighbors, liveHit, k]);

  // The focused word + its k nearest neighbours are the only "hot" (lime) marks.
  const highlight = useMemo(
    () => (shownWord ? [shownWord, ...nearest.map((n) => n.word)] : []),
    [shownWord, nearest],
  );

  // Top K only changes what's visible once a word is focused. Slid while the
  // search is empty it does nothing, which reads as broken. So seed the search
  // with a demo word on the first nudge — a real neighbour list appears and the
  // slider's effect is immediately legible. Once query is set this is a no-op
  // and normal sliding takes over.
  const handleKChange = (next: number) => {
    setK(next);
    if (!query.trim()) setQuery(PRESETS[0].value);
  };

  return (
    <StationLayout
      title="Embedding"
      subtitle="token 只是一堆 id，語意是從哪裡來的？"
      fullBleed
      input={
        <SuggestInput
          value={query}
          onChange={setQuery}
          ariaLabel="搜尋詞"
          placeholder="搜尋一個詞…貓、cat、蘋果"
          maxLength={64}
          presets={PRESETS}
          status={<LiveStatus state={liveState} />}
        />
      }
      controls={
        <DockControls>
          <BlockToggle<Dim>
            label="投影"
            gloss="把很多維的數字壓成平面或立體來看"
            info="把高維詞向量壓到 2D 或 3D 來看。維度越高保留越多結構，但也越難一眼看懂。"
            value={dim}
            onChange={setDim}
            options={[
              { label: "2D", value: "2d" },
              { label: "3D", value: "3d" },
            ]}
          />
          <BlockSlider
            label="鄰居數 Top K"
            gloss="顯示距離最近的前 K 個詞"
            info="顯示與查詢詞距離最近的前 K 個鄰居。K 越大看到越多相關詞，也越容易混進比較遠的詞。"
            min={1}
            max={MAX_K}
            step={1}
            value={k}
            onChange={handleKChange}
            ariaLabel="鄰居數 K"
          />
        </DockControls>
      }
      takeaway={
        <span>
          中文和英文的詞由<em>同一個</em>多語模型變成向量，落在
          <em>同一個</em>空間裡。距離 ≈ 相似度，而且跨語言也成立：搜尋{" "}
          <span className="font-mono text-accent">貓</span>，旁邊是 貓咪、
          <span className="font-mono">cat</span>、
          <span className="font-mono">kitten</span>
          ，模型從沒看過任何翻譯對照表，只是它們出現的語境相似。語意也不是一個乾淨的點：搜尋{" "}
          <span className="font-mono text-accent">蘋果</span> 或{" "}
          <span className="font-mono">apple</span>
          ，水果和手機公司兩種意思的鄰居混在一起。詞彙雲外的詞也能玩，隨便打一個詞，GPU
          會用同一個模型即時算出它的位置，掉進同一朵雲。
        </span>
      }
    >
      <div className="relative h-full w-full">
        {/* Quest dock. Both embedding hunts verify "the word the station is
            focused on": the searched (or live-embedded) word, or the
            hovered / tap-pinned point. The dock submits that one word and the
            server re-derives the whole claim with the same model code, so no
            extra evidence wiring is needed. Anchored LEFT of the top-right
            readout island (w-60 at right-3) on >= md so the two never overlap. */}
        <QuestDock
          station="embedding"
          collectEvidence={() => (shownWord ? { word: shownWord } : null)}
          hint="先搜尋或點住一個詞，再回來回報"
          anchorClassName="right-3 top-3.5 md:right-[16.5rem] md:top-4"
        />

        {/* The point cloud fills the whole canvas. */}
        <div className="absolute inset-0">
          {dim === "3d" ? (
            <Scatter3D
              data={scatterData}
              categoryColors={categoryColors}
              highlight={highlight}
              focus={shownWord ?? undefined}
              onHover={setHoverWord}
              fill
            />
          ) : (
            <Scatter2D
              data={scatterData}
              categoryColors={categoryColors}
              highlight={highlight}
              focus={shownWord ?? undefined}
              onHover={setHoverWord}
              fill
            />
          )}
        </div>


        {/* Top overlays. >= md the wrapper dissolves (md:contents) and the two
            children float exactly where they always did: the glossary caption
            under the title island (left), the readout island top-right. < md
            the wrapper is a flow column under the title, so title, glossary and
            readout stack and can never cover each other at phone width. */}
        <div className="pointer-events-none absolute inset-x-4 top-14 z-20 flex flex-col gap-2 md:contents">
          {/* Glossary caption (no hover needed): the plain-language identity of
              the two jargon terms students meet here. Always visible on >= md;
              on phones it folds into a tap-to-expand line. Quiet secondary
              text; the deeper how-embeddings-are-learned story is out of scope
              for this station. */}
          <div className="self-start md:pointer-events-none md:absolute md:left-9 md:top-14 md:z-20 md:max-w-md">
            <button
              type="button"
              aria-expanded={glossaryOpen}
              onClick={() => setGlossaryOpen((v) => !v)}
              className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-border bg-panel/85 px-2.5 py-1.5 font-mono text-[11px] text-muted backdrop-blur-sm transition-colors hover:text-fg md:hidden"
            >
              <svg
                viewBox="0 0 24 24"
                className={`h-3 w-3 transition-transform duration-200 ${
                  glossaryOpen ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
              <span>embedding、token 是什麼？</span>
            </button>
            <div
              className={`${
                glossaryOpen ? "flex" : "hidden"
              } mt-2 max-w-md flex-col gap-1 rounded-md border border-border bg-panel/85 px-3 py-2 backdrop-blur-sm md:mt-0 md:flex md:rounded-none md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none`}
            >
              <p className="text-xs leading-relaxed text-muted">
                <span className="font-mono">embedding</span>
                ：把每個 token 變成一排數字（向量），意思相近的字，數字也相近
              </p>
              <p className="text-xs leading-relaxed text-muted">
                <span className="font-mono">token</span>
                ：模型把句子切成的小單位，可能比一個字還小
              </p>
            </div>
          </div>

          {/* Readout thrown outside the dock. Two modes: with a word focused
              (searched, hovered, or tap-pinned) it's the neighbour list (the
              "距離 ≈ 相似度" beat); idle, it's the taxonomy legend that decodes
              the point colors, the model's own semantic clusters. On phones the
              idle legend collapses to its header line and the neighbour list
              caps its height with an inner scroll. */}
          <div className="pointer-events-auto w-60 max-w-full self-end md:absolute md:right-3 md:top-4 md:z-20 md:max-w-[70vw]">
            {shownWord ? (
              <div className="rounded-md border border-border bg-panel p-3 shadow-md max-md:max-h-60 max-md:overflow-y-auto">
                <span className="font-mono text-xs text-accent">
                  {shownWord.slice(0, 10) + (shownWord.length > 10 ? "..." : "")} · 最近的 {nearest.length} 個
                </span>
                <ol className="mt-2 flex flex-col gap-1">
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
                          <span className="text-muted uppercase">
                            {" "}
                            {langOf.get(n.word)}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-muted">{n.score.toFixed(3)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="rounded-md border border-border bg-panel p-3 shadow-md">
                <button
                  type="button"
                  aria-expanded={legendOpen}
                  onClick={() => setLegendOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 font-mono text-xs text-accent md:pointer-events-none"
                >
                  <span>語意分群 · {taxonomy.length} 類</span>
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-3 w-3 transition-transform duration-200 ${
                      legendOpen ? "rotate-180" : ""
                    } md:hidden`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <ul
                  className={`${
                    legendOpen ? "flex" : "hidden"
                  } mt-2 flex-col gap-1.5 md:flex`}
                >
                  {taxonomy.map((t) => (
                    <li
                      key={t.category}
                      className="flex items-center gap-2 font-mono text-xs"
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="truncate text-fg">{t.label}</span>
                      <span className="ml-auto text-muted">{t.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </StationLayout>
  );
}
