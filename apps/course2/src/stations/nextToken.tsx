/**
 * NEXT TOKEN — station 04 of Course 2.
 *
 * The unifying idea: every language task is just "predict the next token." The
 * student types a prompt and watches a probability distribution over the next
 * token, then reshapes it with temperature and top-k.
 *
 * The browser NEVER trains. A precomputed word-level bigram table
 * (public/data/course2/next-token/distributions.json, written by
 * `camp-precompute next-token`) is loaded via @camp/data; the only in-browser
 * math is the light temperature/top-k transform on the exported logits.
 */
import { useEffect, useMemo, useState } from "react";
import { LabeledSlider, SegmentedControl, StationLayout } from "@camp/ui";
import { Heatmap } from "@camp/viz";
import { liveInfer, liveInferenceEnabled, loadJSON } from "@camp/data";

interface TokenLogit {
  token: string;
  /** log(prob) from the precomputed table; softmax(logit/T) recovers probs. */
  logit: number;
}

/** Response of the live server's POST /next-token/predict — the same entry
 * shape as one context's list in distributions.json. */
interface LivePredict {
  prompt: string;
  context: string;
  contextKnown: boolean;
  topN: number;
  entries: TokenLogit[];
}

interface Distributions {
  topN: number;
  suggestions: string[];
  fallback: TokenLogit[];
  bigram: Record<string, TokenLogit[]>;
}

type Decoding = "sampling" | "greedy";

interface Prob {
  token: string;
  prob: number;
}

const DATA_URL = "/data/course2/next-token/distributions.json";

/** Last whitespace/punctuation-delimited word of the prompt, lowercased. */
function lastToken(prompt: string): string {
  const words = prompt.toLowerCase().match(/[a-z]+/g);
  return words && words.length ? words[words.length - 1]! : "";
}

/** softmax(logit / T) → probabilities. Light, allowed in-browser math. */
function softmaxWithTemperature(logits: number[], temperature: number): number[] {
  const t = Math.max(temperature, 1e-3);
  const scaled = logits.map((l) => l / t);
  const max = Math.max(...scaled);
  const exps = scaled.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

/** Keep the k highest-probability tokens, then renormalize over them. */
function applyTopK(probs: Prob[], k: number): Prob[] {
  const kept = [...probs].sort((a, b) => b.prob - a.prob).slice(0, Math.max(1, k));
  const sum = kept.reduce((a, b) => a + b.prob, 0) || 1;
  return kept.map((p) => ({ ...p, prob: p.prob / sum }));
}

export function NextTokenStation() {
  // 1. STATE — everything the canvas needs is plain component state.
  const [dist, setDist] = useState<Distributions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("the cat sat on the");
  const [temperature, setTemperature] = useState(1);
  const [topK, setTopK] = useState(8);
  const [decoding, setDecoding] = useState<Decoding>("sampling");

  // 2. LOAD PRECOMPUTED DATA — via @camp/data inside an effect (the reference
  //    pattern). No training, no model weights: just the bigram table.
  useEffect(() => {
    let alive = true;
    loadJSON<Distributions>(DATA_URL)
      .then((d) => alive && setDist(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  // LIVE OPT-IN — when VITE_LIVE_INFERENCE_URL is set, every prompt is routed
  // through the live server (same bigram model, rebuilt from the same code).
  // On any failure `liveInfer` yields null and the local precomputed table
  // below answers exactly as before.
  const [livePred, setLivePred] = useState<LivePredict | null>(null);

  useEffect(() => {
    if (!liveInferenceEnabled()) return;
    let alive = true;
    const timer = setTimeout(() => {
      liveInfer<LivePredict>("/next-token/predict", { prompt }).then((r) => {
        if (alive && r && r.prompt === prompt) setLivePred(r);
      });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [prompt]);

  // 3. DERIVED CANVAS DATA — a pure function of state + loaded data. The live
  // result (when fresh) and the precomputed table produce the same shape.
  const { base, contextKnown, context } = useMemo(() => {
    if (livePred && livePred.prompt === prompt) {
      return {
        context: livePred.context,
        contextKnown: livePred.contextKnown,
        base: livePred.entries,
      };
    }
    const ctx = lastToken(prompt);
    const table = dist?.bigram[ctx];
    return {
      context: ctx,
      contextKnown: Boolean(table),
      base: table ?? dist?.fallback ?? [],
    };
  }, [dist, prompt, livePred]);

  const probs = useMemo<Prob[]>(() => {
    if (base.length === 0) return [];
    // Greedy = argmax, i.e. the T→0 limit; use a tiny temperature so the display
    // collapses onto the single most-likely token.
    const t = decoding === "greedy" ? 0.05 : temperature;
    const p = softmaxWithTemperature(base.map((b) => b.logit), t);
    const withTokens = base.map((b, i) => ({ token: b.token, prob: p[i]! }));
    const k = decoding === "greedy" ? 1 : topK;
    return applyTopK(withTokens, k).sort((a, b) => b.prob - a.prob);
  }, [base, temperature, topK, decoding]);

  const argmaxToken = probs.length ? probs[0]!.token : null;
  const maxProb = probs.length ? probs[0]!.prob : 1;

  // Heatmap consumes the SAME probabilities as a 1×N row (proves the reused
  // primitive; station 05 feeds it multi-row hidden states).
  const heatMatrix = useMemo(() => [probs.map((p) => p.prob)], [probs]);
  const heatCols = useMemo(() => probs.map((p) => p.token), [probs]);

  return (
    <StationLayout
      title="Next Token"
      subtitle="所有語言任務其實都一樣：預測 next token。"
      controls={
        <>
          <label className="block">
            <div className="mb-1 font-mono text-xs text-muted">輸入</div>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="輸入一段文字…"
              className="w-full rounded-md border border-border bg-panel px-2 py-1.5 text-sm text-fg outline-none placeholder:text-muted focus:border-accent"
            />
            <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted">
              context ={" "}
              {context ? (
                <span className={contextKnown ? "text-accent" : "text-warning"}>
                  {context}
                </span>
              ) : (
                <span className="text-warning">∅</span>
              )}
              {!contextKnown && context ? " · 未知，改用詞頻" : ""}
            </div>
          </label>

          {dist?.suggestions?.length ? (
            <div>
              <div className="mb-1 font-mono text-xs text-muted">試試看</div>
              <div className="flex flex-wrap gap-1.5">
                {dist.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPrompt(s)}
                    className="rounded-md border border-border bg-panel px-2 py-1 text-left text-xs text-muted transition-colors hover:border-accent hover:text-fg"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <SegmentedControl<Decoding>
            label="解碼方式"
            value={decoding}
            onChange={setDecoding}
            options={[
              { label: "取樣", value: "sampling" },
              { label: "貪婪", value: "greedy" },
            ]}
          />
          <LabeledSlider
            label="Temperature"
            min={0.1}
            max={2}
            step={0.1}
            value={temperature}
            onChange={setTemperature}
            format={(v) => (decoding === "greedy" ? "貪婪模式" : v.toFixed(1))}
          />
          <LabeledSlider
            label="Top-k"
            min={1}
            max={dist?.topN ?? 12}
            step={1}
            value={topK}
            onChange={setTopK}
            format={(v) => (decoding === "greedy" ? "1 (貪婪)" : `${v}`)}
          />
        </>
      }
      takeaway={
        <span>
          一個訓練好的 next token 預測器，加上一個 temperature 旋鈕，就是完整的
          生成迴圈。
        </span>
      }
    >
      <div className="flex h-full flex-col gap-5">
        {error ? (
          <p className="text-sm text-warning">
            無法載入機率分布（{error}）。請執行{" "}
            <code className="font-mono">uv run camp-precompute next-token</code>。
          </p>
        ) : !dist ? (
          <p className="text-sm text-muted">載入機率分布中…</p>
        ) : (
          <>
            <div>
              <div className="mb-1 font-mono text-xs uppercase tracking-wide text-muted">
                P(next token)
              </div>
              <p className="text-sm text-muted">
                {decoding === "greedy" ? (
                  <>
                    貪婪解碼永遠取 argmax：{" "}
                    <span className="font-mono text-accent">{argmaxToken}</span>。
                  </>
                ) : (
                  <>
                    取樣會依這些長條的比例來抽。調高{" "}
                    <span className="font-mono">temperature</span> 會讓分布變平，
                    調低會變尖；<span className="font-mono">top-k</span>{" "}
                    只保留機率最高的前 {topK} 個。
                  </>
                )}
              </p>
            </div>

            {/* Bar field: thin bars, single lime hue, magnitude via width +
                opacity; the argmax is the one mark in full lime. */}
            <div className="flex flex-col gap-1.5">
              {probs.map((p) => {
                const isArgmax = p.token === argmaxToken;
                return (
                  <div key={p.token} className="flex items-center gap-3">
                    <span
                      className={`w-24 shrink-0 truncate text-right font-mono text-xs ${
                        isArgmax ? "text-accent" : "text-muted"
                      }`}
                    >
                      {p.token}
                    </span>
                    <div className="relative h-4 flex-1 overflow-hidden rounded-sm bg-panel">
                      <div
                        className="h-full rounded-sm bg-accent transition-[width,opacity] duration-300"
                        style={{
                          width: `${(p.prob / (maxProb || 1)) * 100}%`,
                          opacity: isArgmax ? 1 : 0.35 + 0.5 * p.prob,
                        }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right font-mono text-[10px] text-muted">
                      {(p.prob * 100).toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>

            {/* The reused @camp/viz Heatmap, fed the same probabilities as a
                1×N row. Station 05 feeds it multi-row hidden states. */}
            <div>
              <div className="mb-1 font-mono text-xs text-muted">
                Heatmap · 同一列
              </div>
              <Heatmap
                matrix={heatMatrix}
                colLabels={heatCols}
                rowLabels={["p"]}
                min={0}
                height={72}
              />
            </div>
          </>
        )}
      </div>
    </StationLayout>
  );
}
