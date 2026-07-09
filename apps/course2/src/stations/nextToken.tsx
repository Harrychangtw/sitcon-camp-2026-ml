/**
 * NEXT TOKEN — station 04 of Course 2.
 *
 * The unifying idea: every language task is just "predict the next token."
 * The student types ANY prompt and watches a REAL next-token distribution —
 * Qwen3-0.6B computed live on the GPU server. The primary knob is the CONTEXT
 * WINDOW (how many trailing tokens of the prompt the model may see): shrink it
 * and the prediction goes vague, widen it and the distribution sharpens.
 * Temperature and top-k stay as secondary knobs that reshape the distribution.
 * The tokens are the model's real subword pieces (a leading space is part of
 * the token, the "␣" mark), which ties straight back to the tokenizer station.
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
import { CATEGORY_COLORS } from "../palette";

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
  /** Total tokens in the prompt before truncation. Clamps the slider max. */
  promptTokens: number;
  /** How many trailing tokens the model actually saw (the effective window). */
  contextTokens: number;
  /** The prompt's decoded pieces in read order (len === promptTokens). */
  promptPieces: string[];
  /** Matching vocab ids (parallel to promptPieces). */
  promptTokenIds: number[];
}

interface Distributions {
  model: string;
  topN: number;
  suggestions: string[];
  /** Recorded real-model outputs for the preset prompts. */
  prompts: Record<string, TokenLogit[]>;
  /** Recorded prompt pieces (read order) for each preset's context strip. */
  pieces: Record<string, string[]>;
  /** Matching vocab ids per preset (parallel to `pieces`). */
  tokenIds: Record<string, number[]>;
}

type Decoding = "sampling" | "greedy";

interface Prob {
  token: string;
  prob: number;
}

const DATA_URL = "/data/course2/next-token/distributions.json";

/** The quiet placeholder for a code point that can't render as text. Reads as
 * "a byte fragment of a character", not a bug. */
const FRAGMENT_MARK = "▢";

/** True for code points that can't render as normal text: U+FFFD (the JSON
 * decoder hit a partial/invalid UTF-8 sequence — Qwen BPE tokens are often
 * fragments of a multi-byte character), control chars, lone surrogates.
 * `\n` is excluded: displayToken already substitutes it with ⏎. */
function isUndisplayableCodePoint(cp: number): boolean {
  if (cp === 0xfffd) return true; // replacement char: partial UTF-8 fragment
  if (cp === 0x0a) return false; // newline → ⏎ substitution handles it
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return true; // C0/C1 controls
  if (cp >= 0xd800 && cp <= 0xdfff) return true; // lone surrogate halves
  return false;
}

/** Does this raw token contain any undisplayable code point? Drives the
 * 半個字 hint and the tooltip note. */
function hasFragment(token: string): boolean {
  for (const ch of token) {
    if (isUndisplayableCodePoint(ch.codePointAt(0) ?? 0)) return true;
  }
  return false;
}

/** Make a subword piece visible: leading space → ␣, newline → ⏎. These ARE
 * part of the token — showing them is the honest move. Undisplayable code
 * points (partial UTF-8 fragments, control chars) become ▢ placeholders. */
function displayToken(token: string): string {
  const marked = token.replace(/^ /, "␣").replace(/\n/g, "⏎");
  return Array.from(marked)
    .map((ch) => (isUndisplayableCodePoint(ch.codePointAt(0) ?? 0) ? FRAGMENT_MARK : ch))
    .join("");
}

/** Hover tooltip: the raw token string, its code points, UTF-8 hex bytes, and
 * (when known) vocab id — the truth behind the display substitutions. */
function tokenTitle(token: string, id?: number): string {
  const codePoints = Array.from(token)
    .map((ch) => `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ");
  const bytes = Array.from(new TextEncoder().encode(token))
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join(" ");
  const lines = [
    `token 原文：${JSON.stringify(token)}`,
    `code points：${codePoints}`,
    `UTF-8：${bytes}`,
  ];
  if (id != null) lines.push(`vocab id：${id}`);
  if (hasFragment(token)) {
    lines.push("這是一個字的位元組片段，與前後 token 合起來才是一個字");
  }
  return lines.join("\n");
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
  const [prompt, setPrompt] = useState("台灣最高的山是玉");
  // The primary knob: how many trailing tokens of the prompt the model may see.
  // `null` = 全部 / full context (the top of the slider).
  const [contextTokens, setContextTokens] = useState<number | null>(null);
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

  // A preset prompt has its recorded distribution — but only at FULL context.
  // The recorded presets are full-context outputs (they back the offline
  // fallback at the 全部 slider position); any REDUCED window must be served
  // live, since only the server tokenizes and truncates.
  const trimmed = prompt.trim();
  const presetEntries = dist?.prompts[trimmed] ?? null;
  const atFull = contextTokens === null;
  const usePreset = atFull && presetEntries != null;

  // ALWAYS-PREDICT — anything not served by a full-context preset goes to the
  // GPU server, which runs the SAME model that recorded the presets. On any
  // failure `liveInferTimed` yields null and the station keeps the last good
  // distribution (LiveStatus says so honestly).
  const [live, setLive] = useState<LivePredict | null>(null);
  const [liveMs, setLiveMs] = useState(0);
  const [livePending, setLivePending] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);

  useEffect(() => {
    setLive(null);
    setLiveFailed(false);
    if (!trimmed || usePreset) return;
    let alive = true;
    // Debounced: only ask the server once typing pauses. The pending stopwatch
    // starts when the request actually fires (not during the debounce), so its
    // count matches the round-trip the final report shows. `contextTokens` is
    // sent as-is (null → server uses the full cap); the server truncates.
    const timer = setTimeout(() => {
      setLivePending(true);
      liveInferTimed<LivePredict>("/next-token/predict", {
        prompt: trimmed,
        contextTokens,
      }).then((r) => {
        if (!alive) return;
        setLivePending(false);
        if (r && r.data.prompt === trimmed) {
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
  }, [trimmed, usePreset, contextTokens]);

  const liveHit = live && live.prompt === trimmed ? live : null;

  const liveState = useMemo<LiveState>(() => {
    if (!trimmed || usePreset) return { kind: "idle" };
    if (livePending) return { kind: "pending" };
    if (liveHit) return { kind: "live", ms: liveMs };
    if (liveFailed) return { kind: "cached" };
    return { kind: "idle" };
  }, [trimmed, usePreset, livePending, liveHit, liveMs, liveFailed]);

  // 3. DERIVED CANVAS DATA — preset and live answers flow through the SAME
  //    path. When both are missing (offline, non-preset prompt) the last good
  //    distribution stays on screen, labelled with the prompt it belongs to.
  const lastGood = useRef<{
    prompt: string;
    entries: TokenLogit[];
    pieces: string[];
    ids: number[];
    /** How many trailing pieces the model saw for this distribution. */
    context: number;
  } | null>(null);

  const { base, basePrompt, basePieces, baseIds, baseContext } = useMemo(() => {
    if (usePreset && presetEntries) {
      // Full-context preset: every recorded piece is in-window (nothing trimmed).
      const pieces = dist?.pieces[trimmed] ?? [];
      const ids = dist?.tokenIds[trimmed] ?? [];
      lastGood.current = { prompt: trimmed, entries: presetEntries, pieces, ids, context: pieces.length };
      return { base: presetEntries, basePrompt: trimmed, basePieces: pieces, baseIds: ids, baseContext: pieces.length };
    }
    if (liveHit) {
      lastGood.current = {
        prompt: liveHit.prompt,
        entries: liveHit.entries,
        pieces: liveHit.promptPieces,
        ids: liveHit.promptTokenIds,
        context: liveHit.contextTokens,
      };
      return {
        base: liveHit.entries,
        basePrompt: liveHit.prompt,
        basePieces: liveHit.promptPieces,
        baseIds: liveHit.promptTokenIds,
        baseContext: liveHit.contextTokens,
      };
    }
    if (lastGood.current) {
      return {
        base: lastGood.current.entries,
        basePrompt: lastGood.current.prompt,
        basePieces: lastGood.current.pieces,
        baseIds: lastGood.current.ids,
        baseContext: lastGood.current.context,
      };
    }
    const first = dist?.suggestions[0];
    const entries = first ? dist?.prompts[first] ?? [] : [];
    const pieces = first ? dist?.pieces[first] ?? [] : [];
    const ids = first ? dist?.tokenIds[first] ?? [] : [];
    return { base: entries, basePrompt: first ?? "", basePieces: pieces, baseIds: ids, baseContext: pieces.length };
  }, [dist, trimmed, usePreset, presetEntries, liveHit]);

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

  const maxProb = probs.length ? probs[0]!.prob : 1;

  // Slider extent. Until a live/preset response reports the real prompt length,
  // fall back to a sensible fixed max so the slider is usable; once known (from
  // the live promptTokens or the recorded preset pieces), clamp to it so the
  // slider never promises more context than the prompt has. The max end is the
  // 全部 / full position (contextTokens === null).
  const sliderMax = (liveHit?.promptTokens ?? basePieces.length) || 16;
  const sliderValue = Math.min(contextTokens ?? sliderMax, sliderMax);

  return (
    <StationLayout
      title="猜下一個 token"
      subtitle="所有語言任務其實都一樣：預測下一個 token。"
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
          <BlockSlider
            label="上下文視窗"
            info="模型只看得到前文的最後幾個 token。視窗越小，可用線索越少、預測越不確定；放到「全部」就看整段前文。"
            min={1}
            max={sliderMax}
            step={1}
            value={sliderValue}
            onChange={(v) => setContextTokens(v >= sliderMax ? null : v)}
            format={(v) => (v >= sliderMax ? "全部" : `${v}`)}
          />
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
            label="Temperature 溫度"
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
          模型能看到的前文越多，對下一個 token 越有把握，機率越集中。這裡的每一
          條長條都是真的：GPU 上的{" "}
          <span className="font-mono">Qwen3-0.6B</span>{" "}
          對你打的字算出來的分布。注意它預測的是 token，不是單字：「␣」表示
          token 自帶空格，「▢」表示這個 token 只是半個字的位元組片段，滑鼠移上去可以看原文。
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
          // readable column, clear of the top island and bottom dock (via the
          // measured --dock-h, so the phone bottom sheet never buries the last
          // bar). Minimal header labels name what each column is; no caption,
          // no heatmap.
          <div className="absolute inset-0 overflow-auto px-4 pt-16 pb-[calc(var(--dock-h,7rem)+1rem)] md:px-8">
            <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center">
              {/* Context strip: the prompt's real pieces, in read order. The
                  ones the window trims off are dimmed + struck through (the
                  model can't see them); the in-window tail is solid and wires
                  down into the distribution below. Makes "what context length
                  does" literal. */}
              {basePieces.length > 0 ? (
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                      前文 token
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                      {baseContext} / {basePieces.length} 看得到
                    </span>
                  </div>
                  {/* Chips echo the Tokenizer station: a colored block per
                      token with its vocab id beneath (same token, same id). The
                      trimmed tail drops its color and greys out, so "the model
                      can't see this" is unmistakable. */}
                  <div className="flex flex-wrap items-start gap-1.5">
                    {basePieces.map((piece, i) => {
                      const inWindow = i >= basePieces.length - baseContext;
                      const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
                      return (
                        <div
                          key={i}
                          title={tokenTitle(piece, baseIds[i])}
                          style={inWindow ? { backgroundColor: color } : undefined}
                          className={`flex flex-col items-center rounded-md px-2 py-1 transition-opacity duration-200 ${
                            inWindow ? "" : "bg-panel opacity-40"
                          }`}
                        >
                          <span
                            className={`whitespace-pre font-mono text-xs leading-none ${
                              inWindow ? "text-white" : "text-muted line-through"
                            }`}
                          >
                            {displayToken(piece)}
                          </span>
                          <span
                            className={`mt-1 font-mono text-[0.5625rem] leading-none ${
                              inWindow ? "text-white/70" : "text-muted/70"
                            }`}
                          >
                            {baseIds[i] ?? ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* The wire: a small arrow from the in-window context down to
                      the prediction. */}
                  <div className="mt-2 flex justify-center">
                    <svg
                      width="16"
                      height="18"
                      viewBox="0 0 16 18"
                      fill="none"
                      aria-hidden
                      className="text-accent"
                    >
                      <path
                        d="M8 1 V13 M3.5 8.5 L8 13 L12.5 8.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
              ) : null}

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
                {probs.map((p, i) => {
                  // By index, not token string: two byte-fragment tokens can
                  // decode to the identical U+FFFD string (probs is sorted, so
                  // row 0 IS the argmax).
                  const isArgmax = i === 0;
                  const fragment = hasFragment(p.token);
                  return (
                    <div key={`${i}-${p.token}`} className="flex items-center gap-3">
                      <span
                        title={tokenTitle(p.token)}
                        className={`w-24 shrink-0 truncate text-left font-mono text-xs ${
                          isArgmax ? "text-accent" : "text-muted"
                        }`}
                      >
                        {displayToken(p.token)}
                        {fragment ? (
                          <span className="ml-1 text-[0.5625rem] text-muted/70">半個字</span>
                        ) : null}
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
