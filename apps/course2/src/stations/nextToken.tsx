/**
 * NEXT TOKEN — station 04 of Course 2.
 *
 * The unifying idea: every language task is just "predict the next token."
 * The student types ANY prompt and watches a REAL next-token distribution —
 * Qwen3-0.6B computed live on the GPU server — then reshapes it with
 * temperature and top-k. The tokens are the model's real subword pieces
 * (a leading space is part of the token — the "␣" mark), which ties straight
 * back to the tokenizer station.
 *
 * The browser NEVER runs the model. Preset prompts are RECORDED Qwen outputs
 * (distributions.json, written by `camp-precompute next-token` with the same
 * code + settings the server runs), so offline fallback is honest; the only
 * in-browser math is the light temperature/top-k transform on the exported
 * log-probs.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BlockSlider,
  BlockToggle,
  DockControls,
  LiveStatus,
  LoadingTimer,
  StationLayout,
  SuggestInput,
  type LiveState,
} from "@camp/ui";
import { liveInferTimed, loadJSON } from "@camp/data";

interface TokenLogit {
  token: string;
  /** log P(token|prompt) from the real model; softmax(logit/T) → probs. */
  logit: number;
}

/** Response of the live server's POST /next-token/predict — the same entry
 * shape as one prompt's list in distributions.json. */
interface LivePredict {
  prompt: string;
  model: string;
  topN: number;
  entries: TokenLogit[];
}

interface Distributions {
  model: string;
  topN: number;
  suggestions: string[];
  /** Recorded real-model outputs for the preset prompts. */
  prompts: Record<string, TokenLogit[]>;
}

type Decoding = "sampling" | "greedy";

interface Prob {
  token: string;
  prob: number;
}

const DATA_URL = "/data/course2/next-token/distributions.json";

/** Make a subword piece visible: leading space → ␣, newline → ⏎. These ARE
 * part of the token — showing them is the honest move. */
function displayToken(token: string): string {
  return token.replace(/^ /, "␣").replace(/\n/g, "⏎");
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

  // 2. LOAD PRECOMPUTED DATA — recorded real-model outputs for the presets.
  useEffect(() => {
    let alive = true;
    loadJSON<Distributions>(DATA_URL)
      .then((d) => alive && setDist(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  // A preset prompt already has its recorded distribution — no round-trip.
  const trimmed = prompt.trim();
  const presetEntries = dist?.prompts[trimmed] ?? null;

  // ALWAYS-PREDICT — any non-preset prompt goes to the GPU server, which runs
  // the SAME model that recorded the presets. On any failure `liveInferTimed`
  // yields null and the station keeps the last good distribution (LiveStatus
  // says so honestly).
  const [live, setLive] = useState<LivePredict | null>(null);
  const [liveMs, setLiveMs] = useState(0);
  const [livePending, setLivePending] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);

  useEffect(() => {
    setLive(null);
    setLiveFailed(false);
    if (!trimmed || presetEntries) return;
    let alive = true;
    // Debounced: only ask the server once typing pauses. The pending stopwatch
    // starts when the request actually fires (not during the debounce), so its
    // count matches the round-trip the final report shows.
    const timer = setTimeout(() => {
      setLivePending(true);
      liveInferTimed<LivePredict>("/next-token/predict", { prompt: trimmed }).then(
        (r) => {
          if (!alive) return;
          setLivePending(false);
          if (r && r.data.prompt === trimmed) {
            setLive(r.data);
            setLiveMs(r.ms);
          } else {
            setLiveFailed(true);
          }
        },
      );
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
      setLivePending(false);
    };
  }, [trimmed, presetEntries]);

  const liveHit = live && live.prompt === trimmed ? live : null;

  const liveState = useMemo<LiveState>(() => {
    if (!trimmed || presetEntries) return { kind: "idle" };
    if (livePending) return { kind: "pending" };
    if (liveHit) return { kind: "live", ms: liveMs };
    if (liveFailed) return { kind: "cached" };
    return { kind: "idle" };
  }, [trimmed, presetEntries, livePending, liveHit, liveMs, liveFailed]);

  // 3. DERIVED CANVAS DATA — preset and live answers flow through the SAME
  //    path. When both are missing (offline, non-preset prompt) the last good
  //    distribution stays on screen, labelled with the prompt it belongs to.
  const lastGood = useRef<{ prompt: string; entries: TokenLogit[] } | null>(null);

  const { base, basePrompt } = useMemo(() => {
    if (presetEntries) {
      lastGood.current = { prompt: trimmed, entries: presetEntries };
      return { base: presetEntries, basePrompt: trimmed };
    }
    if (liveHit) {
      lastGood.current = { prompt: liveHit.prompt, entries: liveHit.entries };
      return { base: liveHit.entries, basePrompt: liveHit.prompt };
    }
    if (lastGood.current) {
      return { base: lastGood.current.entries, basePrompt: lastGood.current.prompt };
    }
    const first = dist?.suggestions[0];
    const entries = first ? dist?.prompts[first] ?? [] : [];
    return { base: entries, basePrompt: first ?? "" };
  }, [dist, trimmed, presetEntries, liveHit]);

  const stale = basePrompt !== trimmed;

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

  return (
    <StationLayout
      title="Next Token"
      subtitle="所有語言任務其實都一樣：預測 next token。"
      fullBleed
      input={
        <SuggestInput
          value={prompt}
          onChange={setPrompt}
          ariaLabel="輸入文字"
          placeholder="輸入一段文字…GPU 即時算"
          maxLength={500}
          presets={(dist?.suggestions ?? []).map((s) => ({ label: s, value: s }))}
          status={<LiveStatus state={liveState} />}
        />
      }
      controls={
        <DockControls>
          <BlockToggle<Decoding>
            label="解碼方式"
            info="決定怎麼從機率分布挑下一個 token。「取樣」依機率隨機抽，同樣的輸入每次可能不一樣；「貪婪」永遠選機率最高的那個，穩定但容易重複。"
            value={decoding}
            onChange={setDecoding}
            options={[
              { label: "取樣", value: "sampling" },
              { label: "貪婪", value: "greedy" },
            ]}
          />
          <BlockSlider
            label="Temperature"
            info="調整機率分布的平緩程度。數值越高，分布越平均、輸出越隨機有變化；越低，機率越集中在高分 token、輸出越保守穩定。"
            min={0.1}
            max={2}
            step={0.1}
            value={temperature}
            onChange={setTemperature}
            disabled={decoding === "greedy"}
            format={(v) => (decoding === "greedy" ? "貪婪" : v.toFixed(1))}
          />
          <BlockSlider
            label="Top-k"
            info="只從機率最高的前 k 個 token 裡抽樣，其餘直接排除。k 越小選擇越受限、越安全；k 越大越開放、越多元。"
            min={1}
            max={dist?.topN ?? 12}
            step={1}
            value={topK}
            onChange={setTopK}
            disabled={decoding === "greedy"}
            format={(v) => (decoding === "greedy" ? "1" : `${v}`)}
          />
        </DockControls>
      }
      takeaway={
        <span>
          一個訓練好的 next token 預測器，加上一個 temperature 旋鈕，就是完整的
          生成迴圈。這裡的每一條長條都是真的：GPU 上的{" "}
          <span className="font-mono">Qwen3-0.6B</span>{" "}
          對你打的字算出來的分布。注意它預測的是 token，不是單字，「␣」表示
          token 自帶空格。
        </span>
      }
    >
      <div className="relative h-full w-full">
        {error ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-md text-center text-sm text-warning">
              無法載入機率分布（{error}）。請執行{" "}
              <code className="font-mono">uv run camp-precompute next-token</code>。
            </p>
          </div>
        ) : !dist ? (
          <div className="flex h-full items-center justify-center">
            <LoadingTimer label="載入機率分布中" />
          </div>
        ) : (
          // The bar field is the whole page: vertically centered, capped to a
          // readable column, clear of the top island and bottom dock. Minimal
          // header labels name what each column is; no caption, no heatmap.
          <div className="absolute inset-0 overflow-auto px-8 pt-16 pb-28">
            <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center">
              {/* Column headers — light, mono, aligned to the row structure. */}
              <div className="mb-3 flex items-center gap-3">
                <span className="w-24 shrink-0 text-left font-mono text-[10px] uppercase tracking-wide text-muted">
                  token
                </span>
                <div className="flex-1">
                  {stale && basePrompt ? (
                    <span className="font-mono text-[10px] text-warning">
                      顯示「{basePrompt}」的結果
                    </span>
                  ) : null}
                </div>
                <span className="w-12 shrink-0 text-right font-mono text-[10px] uppercase tracking-wide text-muted">
                  機率
                </span>
              </div>

              {/* Bar field: thin bars, single lime hue, magnitude via width +
                  opacity; the argmax is the one mark in full lime. */}
              <div className="flex flex-col gap-1.5">
                {probs.map((p) => {
                  const isArgmax = p.token === argmaxToken;
                  return (
                    <div key={p.token} className="flex items-center gap-3">
                      <span
                        className={`w-24 shrink-0 truncate text-left font-mono text-xs ${
                          isArgmax ? "text-accent" : "text-muted"
                        }`}
                      >
                        {displayToken(p.token)}
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
            </div>
          </div>
        )}
      </div>
    </StationLayout>
  );
}
