/**
 * EMBEDDING STATION — "token 只是 id，語意從哪裡來？"
 *
 * Students browse REAL pretrained word vectors (BGE, zh-TW + English) projected
 * to 2D/3D, search a word, and watch its nearest neighbours light up: 距離 ≈
 * 相似度. The heavy work (embedding thousands of words, PCA, k-means, neighbour
 * search) is done offline by the precompute pipeline; this station only loads two
 * small JSON files per language and plots them. The 語言 control swaps which
 * language's data is loaded (lazily — the files are big, so we fetch on demand).
 */
import { useEffect, useMemo, useState } from "react";
import {
  LabeledSlider,
  SegmentedControl,
  StationLayout,
  Toggle,
} from "@camp/ui";
import {
  Scatter2D,
  Scatter3D,
  categoryColorMap,
  rgbCss,
  useThemeColors,
  type Scatter3DPoint,
} from "@camp/viz";
import { loadJSON } from "@camp/data";

type Dim = "2d" | "3d";
type Lang = "zh" | "en";

interface EmbeddingPoint {
  word: string;
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

const MAX_K = 15; // must match precompute TOP_K

const PLACEHOLDER: Record<Lang, string> = {
  zh: "例如 貓、藍色、快樂…",
  en: "例如 dog、blue、seven…",
};

export function EmbeddingStation() {
  // 1. STATE
  const [lang, setLang] = useState<Lang>("zh");
  // Default to 3D: the cloud is explorable (drag to orbit, scroll to zoom via
  // Scatter3D's OrbitControls). 2D stays one click away for the flat cluster read.
  const [dim, setDim] = useState<Dim>("3d");
  const [query, setQuery] = useState("");
  const [colorBy, setColorBy] = useState(true);
  const [k, setK] = useState(8);

  // 2. DATA — the active language's precomputed artifacts. Lazy-loaded per lang
  // (the files are large, so we never fetch both up front).
  const [points, setPoints] = useState<EmbeddingPoint[]>([]);
  const [neighbors, setNeighbors] = useState<NeighborMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setPoints([]);
    setNeighbors({});
    Promise.all([
      loadJSON<EmbeddingPoint[]>(`/data/course2/embedding/points.${lang}.json`),
      loadJSON<NeighborMap>(`/data/course2/embedding/neighbors.${lang}.json`),
    ]).then(([pts, nbs]) => {
      if (!alive) return;
      setPoints(pts);
      setNeighbors(nbs);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [lang]);

  // 3. DERIVED STATE — pure functions of the loaded data + controls.
  const wordSet = useMemo(() => new Set(points.map((p) => p.word)), [points]);

  // The viz primitives key highlighting off `label`, so carry the word there.
  const scatterData = useMemo<Scatter3DPoint[]>(
    () =>
      points.map((p) => ({
        x: p.x,
        y: p.y,
        z: p.z,
        category: p.category,
        label: p.word,
      })),
    [points],
  );

  const focusWord = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q && wordSet.has(q) ? q : null;
  }, [query, wordSet]);

  const nearest = useMemo<Neighbor[]>(
    () => (focusWord ? (neighbors[focusWord] ?? []).slice(0, k) : []),
    [focusWord, neighbors, k],
  );

  // The searched word + its k nearest neighbours are the only "hot" (lime) marks.
  const highlight = useMemo(
    () => (focusWord ? [focusWord, ...nearest.map((n) => n.word)] : []),
    [focusWord, nearest],
  );

  // Category legend (colors come straight from the theme palette). Categories are
  // k-means clusters, each labelled by its most-central word.
  const colors = useThemeColors();
  const categories = useMemo(
    () => Array.from(new Set(points.map((p) => p.category))),
    [points],
  );
  const catColors = useMemo(
    () => categoryColorMap(colors, categories),
    [colors, categories],
  );

  const notFound = query.trim().length > 0 && !focusWord && points.length > 0;

  return (
    <StationLayout
      title="Embedding"
      subtitle="token 只是一堆 id，語意是從哪裡來的？"
      fullBleed
      controls={
        <>
          <SegmentedControl<Lang>
            label="語言 / Language"
            value={lang}
            onChange={(v) => {
              setLang(v);
              setQuery("");
            }}
            options={[
              { label: "中文", value: "zh" },
              { label: "English", value: "en" },
            ]}
          />

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
              placeholder={PLACEHOLDER[lang]}
              className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <datalist id="embedding-words">
              {points.map((p) => (
                <option key={p.word} value={p.word} />
              ))}
            </datalist>
            {notFound ? (
              <span className="font-mono text-xs text-warning">
                「{query.trim()}」不在詞彙表裡。
              </span>
            ) : null}
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

          <Toggle label="依類別上色" checked={colorBy} onChange={setColorBy} />

          {/* Neighbour list — the "距離 ≈ 相似度" beat, made literal. */}
          {focusWord ? (
            <div className="flex flex-col gap-2 border-t border-border/30 pt-3">
              <span className="font-mono text-xs text-accent">
                {focusWord} · 最近的 {nearest.length} 個
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
                    </span>
                    <span className="text-muted">{n.score.toFixed(3)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : colorBy && categories.length > 0 ? (
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
          這些是<em>真實</em>的 embedding（用預訓練模型算出的 vector，離線投影到
          2D／3D）。距離 ≈ 相似度：意思相近的詞會落在彼此附近（打開
          <em>依類別上色</em>，群集就會浮現）。但語意不是一個乾淨的點。搜尋{" "}
          <span className="font-mono text-accent">蘋果</span>
          ：它既是水果，也是那家做手機的公司，所以最近的鄰居混在一起，有
          <em>水果</em>，也有<em>手機</em>、<em>電腦</em>、<em>微軟</em>。連
          <em>結果</em>、<em>果然</em>都被拉進來，只因為共用了「果」這個字，
          形狀也會滲進語意裡。（切到 English，<span className="font-mono">apple</span>{" "}
          也一樣：鄰居混著 fruit 和 iphone、mac。）
        </span>
      }
    >
      <div className="flex h-full flex-col gap-3">
        <p className="text-sm text-muted">
          {loading
            ? "載入 embedding 中… "
            : `${points.length} 個詞投影到 ${dim.toUpperCase()}（離線 PCA）。`}
          {focusWord
            ? "它最近的鄰居會以亮綠色標示。"
            : "搜尋一個詞，點亮它最近的鄰居。"}
          {dim === "3d" ? " 拖曳可旋轉視角，滾動可縮放。" : ""}
        </p>
        <div className="min-h-0 flex-1">
          {dim === "3d" ? (
            <Scatter3D
              data={scatterData}
              colorBy={colorBy}
              highlight={highlight}
              fill
            />
          ) : (
            <Scatter2D
              data={scatterData}
              colorBy={colorBy}
              highlight={highlight}
              fill
            />
          )}
        </div>
      </div>
    </StationLayout>
  );
}
