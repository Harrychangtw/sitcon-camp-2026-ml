/**
 * EMBEDDING STATION — "tokens gain geometry."
 *
 * Students browse precomputed word vectors projected to 2D/3D, search a word,
 * and watch its nearest neighbours light up: distance ≈ similarity. The heavy
 * work (vectors, PCA, neighbour search) is done offline by the precompute
 * pipeline; this station only loads two small JSON files and plots them.
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
const CANVAS_H = 460;

export function EmbeddingStation() {
  // 1. STATE
  const [dim, setDim] = useState<Dim>("2d");
  const [query, setQuery] = useState("");
  const [colorBy, setColorBy] = useState(true);
  const [k, setK] = useState(8);

  // 2. DATA — loaded from precomputed artifacts (never hard-coded coordinates).
  const [points, setPoints] = useState<EmbeddingPoint[]>([]);
  const [neighbors, setNeighbors] = useState<NeighborMap>({});

  useEffect(() => {
    let alive = true;
    Promise.all([
      loadJSON<EmbeddingPoint[]>("/data/course2/embedding/points.json"),
      loadJSON<NeighborMap>("/data/course2/embedding/neighbors.json"),
    ]).then(([pts, nbs]) => {
      if (!alive) return;
      setPoints(pts);
      setNeighbors(nbs);
    });
    return () => {
      alive = false;
    };
  }, []);

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

  // Category legend (colors come straight from the theme palette).
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
      subtitle="Tokens are just ids — where does meaning come from?"
      controls={
        <>
          <SegmentedControl<Dim>
            label="Projection"
            value={dim}
            onChange={setDim}
            options={[
              { label: "2D", value: "2d" },
              { label: "3D", value: "3d" },
            ]}
          />

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-wide text-muted">
              Search word
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              list="embedding-words"
              placeholder="e.g. dog, blue, seven…"
              className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <datalist id="embedding-words">
              {points.map((p) => (
                <option key={p.word} value={p.word} />
              ))}
            </datalist>
            {notFound ? (
              <span className="font-mono text-xs text-warning">
                &ldquo;{query.trim()}&rdquo; is not in the vocabulary.
              </span>
            ) : null}
          </label>

          <LabeledSlider
            label="Neighbours (k)"
            min={1}
            max={MAX_K}
            step={1}
            value={k}
            onChange={setK}
            format={(v) => `${v}`}
          />

          <Toggle
            label="Color by category"
            checked={colorBy}
            onChange={setColorBy}
          />

          {/* Neighbour list — the "distance ≈ similarity" beat, made literal. */}
          {focusWord ? (
            <div className="flex flex-col gap-2 border-t border-border/30 pt-3">
              <span className="font-mono text-xs uppercase tracking-wide text-accent">
                {focusWord} · nearest {nearest.length}
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
          ) : colorBy ? (
            <div className="flex flex-col gap-2 border-t border-border/30 pt-3">
              <span className="font-mono text-xs uppercase tracking-wide text-muted">
                Categories
              </span>
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
          Distance ≈ similarity: related words land near each other (turn on{" "}
          <em>color by category</em> and the clusters pop). But it breaks at the
          seams — search{" "}
          <span className="font-mono text-accent">turkey</span> (a country{" "}
          <em>and</em> a bird): it&rsquo;s stranded <em>between</em> the country
          and animal clusters, and its nearest neighbours split across both.
          Meaning isn&rsquo;t one clean point.
        </span>
      }
    >
      <div className="flex h-full flex-col gap-3">
        <p className="text-sm text-muted">
          {points.length > 0
            ? `${points.length} words projected to ${dim.toUpperCase()} (offline PCA). `
            : "Loading embeddings… "}
          {focusWord
            ? "Its nearest neighbours are lit in lime."
            : "Search a word to light up its nearest neighbours."}
          {dim === "3d" ? " Drag to orbit; scroll to zoom." : ""}
        </p>
        <div className="min-h-0 flex-1">
          {dim === "3d" ? (
            <Scatter3D
              data={scatterData}
              colorBy={colorBy}
              highlight={highlight}
              height={CANVAS_H}
            />
          ) : (
            <Scatter2D
              data={scatterData}
              colorBy={colorBy}
              highlight={highlight}
              height={CANVAS_H}
            />
          )}
        </div>
      </div>
    </StationLayout>
  );
}
