/**
 * ORDER SHUFFLE — station 3 of 6 (see prompts/README.md).
 *
 * The wall: word ORDER carries meaning, and an order-blind bag-of-words model
 * can't see it. Students reorder word chips and watch, side by side, a
 * BAG-OF-WORDS prediction (recomputed live from the word multiset — order-blind,
 * so it never moves) versus an ORDER-AWARE prediction (looked up from the
 * precomputed artifact for the current arrangement — so it flips). That gap
 * motivates sequence models.
 *
 * Golden-rule split:
 *   - ORDER-AWARE is PRECOMPUTED (cli.py `order-shuffle`) — the browser never
 *     runs a sequence model; it just looks up the current permutation.
 *   - BAG-OF-WORDS is a pure function of the multiset (sum a per-word lexicon,
 *     no positional term) → provably invariant under shuffle. Summing a handful
 *     of numbers is "light" and allowed in the browser.
 */
import { useEffect, useMemo, useState } from "react";
import { RunButton, SegmentedControl, StationLayout } from "@camp/ui";
import { loadJSON } from "@camp/data";

// --- artifact shape (public/data/course2/order-shuffle/predictions.json) -----

interface Prediction {
  label: string;
  score: number;
  scores: Record<string, number>;
}

interface Arrangement {
  /** A permutation of word indices, e.g. [2,0,3,1]. */
  order: number[];
  prediction: Prediction;
}

interface Sentence {
  sentenceId: string;
  prompt: string;
  words: string[];
  /** Per-word polarity; modifiers ("not"/"very") map to 0 (bag-of-words can't bind them). */
  lexicon: Record<string, number>;
  labels: string[];
  arrangements: Arrangement[];
}

interface ScoreMapping {
  temp: number;
  neutralBias: number;
}

interface OrderShufflePayload {
  labels: string[];
  scoreMapping: ScoreMapping;
  sentences: Sentence[];
}

const DATA_URL = "/data/course2/order-shuffle/predictions.json";

// Display-only zh-TW names for the artifact's label keys. The keys themselves
// (positive/negative/neutral) still drive logits + winner matching — we only
// translate what's shown.
const LABEL_ZH: Record<string, string> = {
  positive: "正面",
  negative: "負面",
  neutral: "中性",
};
const labelZh = (label: string) => LABEL_ZH[label] ?? label;

// --- bag-of-words, in-browser (light, order-invariant) -----------------------

/**
 * Shared score → distribution mapping, mirrored from cli.py (SCORE_TEMP /
 * NEUTRAL_BIAS live in `scoreMapping`). Softmax over per-label logits so both
 * panels render on the same scale.
 */
function scoreToDistribution(
  score: number,
  labels: string[],
  mapping: ScoreMapping,
): Prediction {
  const logitByLabel: Record<string, number> = {
    negative: -mapping.temp * score,
    neutral: mapping.neutralBias,
    positive: mapping.temp * score,
  };
  const logits = labels.map((l) => logitByLabel[l] ?? 0);
  const max = Math.max(...logits);
  const ex = logits.map((l) => Math.exp(l - max));
  const sum = ex.reduce((a, b) => a + b, 0);
  const probs = ex.map((e) => e / sum);

  const scores: Record<string, number> = {};
  let bestLabel = labels[0] ?? "";
  let bestProb = -Infinity;
  labels.forEach((l, i) => {
    const p = probs[i] ?? 0;
    scores[l] = p;
    if (p > bestProb) {
      bestProb = p;
      bestLabel = l;
    }
  });
  return { label: bestLabel, score: bestProb, scores };
}

/**
 * Bag-of-words prediction: sum the lexicon over the word MULTISET. There is no
 * positional term, so `order` is irrelevant — the result is identical for every
 * permutation. That invariance is the whole point of this panel.
 */
function bagOfWords(sentence: Sentence, mapping: ScoreMapping): Prediction {
  const total = sentence.words.reduce(
    (acc, w) => acc + (sentence.lexicon[w] ?? 0),
    0,
  );
  return scoreToDistribution(total, sentence.labels, mapping);
}

// --- prediction panel --------------------------------------------------------

function PredictionPanel({
  heading,
  prediction,
  labels,
  /** Lime marks the winning label — reserved for the reacting (order-aware) panel. */
  highlightWinner,
}: {
  heading: string;
  prediction: Prediction;
  labels: string[];
  highlightWinner: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3 rounded-md border border-border bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <h3
          className={`font-mono text-xs text-muted ${
            /[一-鿿]/.test(heading) ? "" : "uppercase tracking-wide"
          }`}
        >
          {heading}
        </h3>
        <span
          className={`font-mono text-xs ${
            highlightWinner ? "text-accent" : "text-muted"
          }`}
        >
          {labelZh(prediction.label)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {labels.map((label) => {
          const value = prediction.scores[label] ?? 0;
          const isWinner = label === prediction.label;
          const lit = highlightWinner && isWinner;
          return (
            <div key={label} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between font-mono text-[11px]">
                <span className={lit ? "text-accent" : "text-muted"}>
                  {labelZh(label)}
                </span>
                <span className={lit ? "text-accent" : "text-muted"}>
                  {(value * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-md bg-fg/10">
                <div
                  className={`h-full rounded-md motion-safe:transition-[width,opacity] motion-safe:duration-500 ${
                    lit ? "bg-accent" : "bg-fg"
                  }`}
                  style={{
                    width: `${value * 100}%`,
                    // Single hue, magnitude by opacity — brightest for the winner.
                    opacity: lit ? 1 : 0.25 + 0.4 * value,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- station -----------------------------------------------------------------

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

const naturalOrder = (n: number) => Array.from({ length: n }, (_, i) => i);

export function OrderShuffleStation() {
  // 1. STATE
  const [payload, setPayload] = useState<OrderShufflePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentenceId, setSentenceId] = useState<string | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  // The chip position the student tapped first; tapping a second chip swaps them.
  const [armed, setArmed] = useState<number | null>(null);

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
          // Start at the NATURAL order (a clear positive/negative), never a
          // random one — an auto-shuffle could land on a neutral arrangement
          // where both panels agree and the contrast reads as broken.
          setOrder(naturalOrder(first.words.length));
        }
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const sentence = useMemo(
    () => payload?.sentences.find((s) => s.sentenceId === sentenceId) ?? null,
    [payload, sentenceId],
  );

  // 3. DERIVED — both predictions are pure functions of (order, data).
  // Order-aware: looked up from the precomputed artifact by the current order.
  const orderAwareByKey = useMemo(() => {
    const map = new Map<string, Prediction>();
    sentence?.arrangements.forEach((a) =>
      map.set(a.order.join(","), a.prediction),
    );
    return map;
  }, [sentence]);

  const orderAware = orderAwareByKey.get(order.join(","));
  // Bag-of-words: pure function of the multiset — independent of `order`.
  const bow =
    sentence && payload ? bagOfWords(sentence, payload.scoreMapping) : null;

  // --- interactions ---
  function selectSentence(id: string) {
    setSentenceId(id);
    setArmed(null);
    const next = payload?.sentences.find((s) => s.sentenceId === id);
    if (next) setOrder(naturalOrder(next.words.length));
  }

  function tapChip(position: number) {
    if (armed === null) {
      setArmed(position);
      return;
    }
    if (armed === position) {
      setArmed(null);
      return;
    }
    setOrder((prev) => {
      const next = prev.slice();
      const a = next[armed] as number;
      next[armed] = next[position] as number;
      next[position] = a;
      return next;
    });
    setArmed(null);
  }

  function doShuffle() {
    if (!sentence) return;
    setArmed(null);
    setOrder((prev) => {
      // Keep shuffling until the order actually changes (n! ≥ 24 here).
      let next = shuffled(prev);
      for (let i = 0; i < 8 && next.join(",") === prev.join(","); i++) {
        next = shuffled(prev);
      }
      return next;
    });
  }

  const sentenceText =
    sentence && order.length
      ? order.map((i) => sentence.words[i]).join(" ")
      : "";

  return (
    <StationLayout
      title="打亂詞序"
      subtitle="詞序重要嗎？打亂一個句子，看哪個模型會注意到。"
      controls={
        <>
          {payload ? (
            <SegmentedControl<string>
              label="選擇句子"
              value={sentenceId ?? ""}
              onChange={selectSentence}
              options={payload.sentences.map((s, i) => ({
                label: String(i + 1).padStart(2, "0"),
                value: s.sentenceId,
              }))}
            />
          ) : null}

          <div className="text-sm text-muted">
            點兩個詞塊交換它們，或整句打亂。看下方兩個預測有沒有反應。
          </div>

          <RunButton
            label="打亂"
            runningLabel="打亂中…"
            durationMs={400}
            onRun={doShuffle}
          />

          <button
            type="button"
            onClick={() => sentence && selectSentence(sentence.sentenceId)}
            className="rounded-md border border-border px-3 py-2 text-left font-mono text-xs text-muted transition-colors hover:border-accent hover:text-accent"
          >
            還原詞序
          </button>
        </>
      }
      takeaway={
        <span>
          打亂這些詞，<strong>bag-of-words</strong> 模型看不出差別，它眼裡只有
          一堆詞。<span className="text-accent">順序感知</span>的模型看得出來。
          語意藏在順序裡，這就是我們需要能讀懂序列的模型的原因。
        </span>
      }
    >
      {error ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          無法載入預測結果：{error}
        </div>
      ) : !sentence || !orderAware || !bow ? (
        <div className="text-sm text-muted">載入預測結果中…</div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="font-mono text-xs uppercase tracking-wide text-muted">
              {sentence.prompt}
            </p>
            {/* Arrangeable word chips — thin-bordered cards; the armed chip gets the lime outline. */}
            <div className="flex flex-wrap gap-2">
              {order.map((wordIndex, position) => {
                const isArmed = armed === position;
                return (
                  <button
                    key={`${wordIndex}-${position}`}
                    type="button"
                    onClick={() => tapChip(position)}
                    aria-pressed={isArmed}
                    className={`flex items-baseline gap-2 rounded-md border px-3 py-2 font-sans text-base transition-colors motion-safe:transition-all motion-safe:duration-300 ${
                      isArmed
                        ? "border-accent text-accent"
                        : "border-border text-fg hover:border-fg"
                    }`}
                  >
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                      {String(position + 1).padStart(2, "0")}
                    </span>
                    {sentence.words[wordIndex]}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-muted">
              &ldquo;<span className="text-fg">{sentenceText}</span>&rdquo;
            </p>
          </div>

          {/* Side-by-side: bag-of-words (frozen) vs order-aware (reacts). */}
          <div className="flex flex-col gap-4 md:flex-row">
            <PredictionPanel
              heading="Bag-of-words"
              prediction={bow}
              labels={sentence.labels}
              highlightWinner={false}
            />
            <PredictionPanel
              heading="順序感知"
              prediction={orderAware}
              labels={sentence.labels}
              highlightWinner
            />
          </div>
        </div>
      )}
    </StationLayout>
  );
}
