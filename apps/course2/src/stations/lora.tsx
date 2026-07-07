/**
 * LORA — Course 3 panorama station 1: 貼一張小紙條，模型就換了個性.
 *
 * The reveal: the SAME Qwen3-0.6B answers the SAME prompt twice, side by side —
 * left as itself, right with a tiny LoRA adapter (a persona "紙條") glued on at
 * strength α. Flip the 貼上 toggle and drag α: the personality morphs, the base
 * never moves. The 「只改了 ~N 個參數」 callout (from the adapter's real shape)
 * lands the low-rank point: 微調 ≠ retraining the giant.
 *
 * The browser NEVER runs the model. Preset prompts × personas × baked α values
 * are RECORDED greedy Qwen outputs (lora/presets.json, written by
 * `camp-precompute lora` with the same code the live server runs). Typed
 * prompts go to the GPU server (/lora/generate); offline it falls back to the
 * presets and says so.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BlockSlider,
  BlockToggle,
  DockControls,
  GuidedTour,
  LiveStatus,
  LoadingTimer,
  StationLayout,
  SuggestInput,
  type LiveState,
} from "@camp/ui";
import { liveInferTimed, loadJSON } from "@camp/data";

interface LoraAdapterInfo {
  id: string;
  label: string;
  gloss: string;
  rank: number;
  targetModules: string[];
  trainableParams: number;
  totalParams: number;
}

interface AdaptersCatalog {
  model: string;
  adapters: LoraAdapterInfo[];
}

interface LoraPresets {
  model: string;
  maxNewTokens: number;
  /** Baked non-zero strengths; α = 0 is `base`. */
  alphas: number[];
  suggestions: string[];
  /** prompt → base (α = 0) reply. */
  base: Record<string, string>;
  /** adapterId → prompt → reply per alphas[i]. */
  outputs: Record<string, Record<string, string[]>>;
}

/** Response of POST /lora/generate — one text cell of presets.json. */
interface LiveGenerate {
  prompt: string;
  adapter: string | null;
  alpha: number;
  model: string;
  text: string;
}

interface PanelText {
  prompt: string;
  text: string;
}

const PRESETS_URL = "/data/course2/lora/presets.json";
const ADAPTERS_URL = "/data/course2/lora/adapters.json";
const LIVE_TIMEOUT_MS = 30_000;

/** ~229 萬 — the adapter param count in a readable 萬 unit. */
function wan(n: number): string {
  return `${Math.round(n / 10_000)} 萬`;
}

export function LoraStation() {
  // 1. STATE — everything the canvas needs is plain component state.
  const [presets, setPresets] = useState<LoraPresets | null>(null);
  const [catalog, setCatalog] = useState<AdaptersCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("介紹一下你自己");
  const [adapterId, setAdapterId] = useState("wenyan");
  // 貼上 ↔ 基底: whether the adapter is glued on at all.
  const [glued, setGlued] = useState(true);
  // α as an index into [0, ...presets.alphas] — 0 = base, last = full persona.
  // Baked positions only, so every slider stop works offline by construction.
  const [alphaIdx, setAlphaIdx] = useState(3);

  // 2. LOAD PRECOMPUTED DATA — recorded real-model outputs + adapter catalog.
  useEffect(() => {
    let alive = true;
    Promise.all([
      loadJSON<LoraPresets>(PRESETS_URL),
      loadJSON<AdaptersCatalog>(ADAPTERS_URL),
    ])
      .then(([p, c]) => {
        if (!alive) return;
        setPresets(p);
        setCatalog(c);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const trimmed = prompt.trim();
  const uiAlphas = useMemo(() => [0, ...(presets?.alphas ?? [0.33, 0.67, 1])], [presets]);
  const alpha = uiAlphas[Math.min(alphaIdx, uiAlphas.length - 1)]!;
  const adapterInfo = catalog?.adapters.find((a) => a.id === adapterId) ?? null;

  // Persona effectively on only when glued AND α > 0 (α = 0 IS base).
  const personaOn = glued && alpha > 0;

  // Preset coverage: base + every (adapter, baked α) cell ships in the JSON.
  const presetBase = presets?.base[trimmed] ?? null;
  const presetAdapterRow = presets?.outputs[adapterId]?.[trimmed] ?? null;
  const presetAdapter =
    personaOn && presetAdapterRow ? presetAdapterRow[alphaIdx - 1] ?? null : null;

  // 3. LIVE PATH — anything the presets can't cover goes to the GPU server,
  //    which runs the SAME module that recorded them. Failures resolve null →
  //    the last good text stays up and LiveStatus says so.
  const [liveBase, setLiveBase] = useState<LiveGenerate | null>(null);
  const [liveAdapter, setLiveAdapter] = useState<LiveGenerate | null>(null);
  const [liveMs, setLiveMs] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [liveFailed, setLiveFailed] = useState(false);

  const needLiveBase = trimmed !== "" && presetBase === null;
  const needLiveAdapter = trimmed !== "" && personaOn && presetAdapter === null;

  useEffect(() => {
    setLiveFailed(false);
    if (!needLiveBase && !needLiveAdapter) return;
    let alive = true;
    // Debounced: generation holds the GPU for a few seconds, so only ask once
    // typing/dragging pauses. Base and adapter requests fire together; the
    // server's lm queue serialises them.
    const timer = setTimeout(() => {
      if (needLiveBase) {
        setPendingCount((n) => n + 1);
        void liveInferTimed<LiveGenerate>(
          "/lora/generate",
          { prompt: trimmed, adapter: null, alpha: 0 },
          LIVE_TIMEOUT_MS,
        ).then((r) => {
          if (!alive) return;
          setPendingCount((n) => n - 1);
          if (r) {
            setLiveBase(r.data);
            setLiveMs(r.ms);
          } else {
            setLiveFailed(true);
          }
        });
      }
      if (needLiveAdapter) {
        setPendingCount((n) => n + 1);
        void liveInferTimed<LiveGenerate>(
          "/lora/generate",
          { prompt: trimmed, adapter: adapterId, alpha },
          LIVE_TIMEOUT_MS,
        ).then((r) => {
          if (!alive) return;
          setPendingCount((n) => n - 1);
          if (r) {
            setLiveAdapter(r.data);
            setLiveMs(r.ms);
          } else {
            setLiveFailed(true);
          }
        });
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
      setPendingCount(0);
    };
  }, [trimmed, adapterId, alpha, needLiveBase, needLiveAdapter]);

  const liveBaseHit = liveBase && liveBase.prompt === trimmed ? liveBase : null;
  const liveAdapterHit =
    liveAdapter &&
    liveAdapter.prompt === trimmed &&
    liveAdapter.adapter === adapterId &&
    liveAdapter.alpha === alpha
      ? liveAdapter
      : null;

  const liveState = useMemo<LiveState>(() => {
    if (!trimmed || (!needLiveBase && !needLiveAdapter)) return { kind: "idle" };
    if (pendingCount > 0) return { kind: "pending" };
    const covered =
      (!needLiveBase || liveBaseHit) && (!needLiveAdapter || liveAdapterHit);
    if (covered) return { kind: "live", ms: liveMs };
    if (liveFailed) return { kind: "cached" };
    return { kind: "idle" };
  }, [
    trimmed,
    needLiveBase,
    needLiveAdapter,
    pendingCount,
    liveBaseHit,
    liveAdapterHit,
    liveMs,
    liveFailed,
  ]);

  // 4. DERIVED PANEL TEXTS — presets and live answers flow through the SAME
  //    path; when both are missing the last good text stays up, labelled with
  //    the prompt it belongs to (the honest nextToken pattern).
  const lastGoodBase = useRef<PanelText | null>(null);
  const lastGoodAdapter = useRef<PanelText | null>(null);

  const baseDisplay = useMemo<PanelText | null>(() => {
    if (presetBase !== null) {
      lastGoodBase.current = { prompt: trimmed, text: presetBase };
    } else if (liveBaseHit) {
      lastGoodBase.current = { prompt: trimmed, text: liveBaseHit.text };
    }
    return lastGoodBase.current;
  }, [trimmed, presetBase, liveBaseHit]);

  const adapterDisplay = useMemo<PanelText | null>(() => {
    if (!personaOn) return baseDisplay; // 紙條沒貼上 → 右邊就是基底
    if (presetAdapter !== null) {
      lastGoodAdapter.current = { prompt: trimmed, text: presetAdapter };
    } else if (liveAdapterHit) {
      lastGoodAdapter.current = { prompt: trimmed, text: liveAdapterHit.text };
    }
    return lastGoodAdapter.current;
  }, [personaOn, baseDisplay, trimmed, presetAdapter, liveAdapterHit]);

  const baseStale = baseDisplay !== null && baseDisplay.prompt !== trimmed;
  const adapterStale =
    personaOn && adapterDisplay !== null && adapterDisplay.prompt !== trimmed;

  const pct = adapterInfo
    ? ((adapterInfo.trainableParams / adapterInfo.totalParams) * 100).toFixed(2)
    : null;

  return (
    <StationLayout
      title="LoRA"
      subtitle="貼一張小紙條，模型就換了個性。"
      fullBleed
      input={
        <SuggestInput
          value={prompt}
          onChange={setPrompt}
          ariaLabel="輸入問題"
          placeholder="問它一個問題…GPU 即時生成"
          maxLength={200}
          presets={(presets?.suggestions ?? []).map((s) => ({ label: s, value: s }))}
          status={<LiveStatus state={liveState} />}
        />
      }
      controls={
        <DockControls>
          <BlockToggle
            label="紙條"
            gloss="LoRA adapter：外掛的小模組"
            info="LoRA adapter 是一小塊額外訓練的參數，像紙條一樣貼在原模型上。「基底」是把紙條撕掉、看原本的模型；「貼上」是把選好的人格掛上去。底層那顆模型兩邊都一樣。"
            value={glued ? "on" : "off"}
            onChange={(v) => setGlued(v === "on")}
            options={[
              { label: "基底", value: "off" },
              { label: "貼上", value: "on" },
            ]}
          />
          <BlockToggle
            label="人格"
            gloss="每個人格是一張獨立訓練的紙條"
            info="每個選項是一個事先訓練好的 LoRA adapter：拿同一顆 Qwen3-0.6B，各自用一小份風格語料微調出來。切換人格就是換一張紙條，隨貼隨換，不用重訓模型。"
            value={adapterId}
            onChange={setAdapterId}
            options={[
              { label: "文言文", value: "wenyan" },
              { label: "中二", value: "chuuni" },
              { label: "客服", value: "service" },
              { label: "科學家", value: "scientist" },
            ]}
          />
          <BlockSlider
            label="α 強度"
            gloss="紙條的貼合強度：0 = 沒貼，1 = 完整人格"
            info="α 直接縮放 adapter 疊加到模型上的量。0 等於根本沒貼（就是基底），拉高的過程中右邊的回答會從原味逐漸長出人格，1 是訓練出來的完整個性。"
            min={0}
            max={uiAlphas.length - 1}
            step={1}
            value={Math.min(alphaIdx, uiAlphas.length - 1)}
            onChange={setAlphaIdx}
            disabled={!glued}
            format={(v) => (glued ? `${Math.round((uiAlphas[v] ?? 0) * 100)}%` : "沒貼")}
          />
        </DockControls>
      }
      takeaway={
        <span>
          微調不是重訓整顆模型：基底的{" "}
          {adapterInfo ? `${(adapterInfo.totalParams / 1e8).toFixed(1)} 億` : "近 6 億"}
          個參數全部凍結，只訓練一小塊貼上去的低秩 adapter（每張約{" "}
          {adapterInfo ? wan(adapterInfo.trainableParams) : "229 萬"}
          個參數）。同一個 prompt、同一顆模型，貼上不同紙條就換一種個性；α
          控制紙條疊加的強度。
        </span>
      }
    >
      <div className="relative h-full w-full">
        <GuidedTour
          storageKey="camp-tour-lora"
          steps={[
            {
              title: "同一顆模型",
              body: "左右兩欄是同一顆 Qwen3-0.6B 對同一個問題的回答。左邊永遠是原味；右邊可以貼一張「人格紙條」（LoRA adapter）。",
            },
            {
              title: "選一個人格",
              body: "下方的「人格」選單裡每個選項都是一張事先訓練好的紙條：文言文、中二、客服、冷面科學家。點一下就換一張。",
            },
            {
              title: "拉 α 看它變身",
              body: "α 是紙條的貼合強度：0 等於沒貼，1 是完整人格。慢慢拉高，看右邊的回答怎麼一步步長出個性。",
            },
            {
              title: "底層那顆模型沒動",
              body: "每張紙條只有約 229 萬個參數，不到整顆模型的 0.4%。不用重訓那 6 億個參數，只貼一小塊就能改變行為，這就是「微調」。",
            },
          ]}
        />
        {error ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-md text-center text-sm text-warning">
              無法載入 LoRA 資料（{error}）。請執行{" "}
              <code className="font-mono">uv run camp-precompute lora</code>。
            </p>
          </div>
        ) : !presets || !catalog ? (
          <div className="flex h-full items-center justify-center">
            <LoadingTimer label="載入人格資料中" />
          </div>
        ) : (
          <div className="absolute inset-0 overflow-auto px-8 pt-16 pb-32">
            <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center">
              {/* The side-by-side reveal: same model, same prompt, one has a
                  紙條 glued on. Answers render in plain fg; the persona panel's
                  header carries the one lime mark when it's live. */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* BASE panel */}
                <section className="flex flex-col rounded-md border border-border bg-panel/60 p-5">
                  <header className="mb-3 flex items-baseline justify-between border-b border-border/30 pb-2">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                      base · 原本的模型
                    </span>
                    <span className="font-mono text-[10px] text-muted">α = 0</span>
                  </header>
                  {baseStale && baseDisplay ? (
                    <p className="mb-2 font-mono text-[10px] text-warning">
                      顯示「{baseDisplay.prompt}」的結果
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
                    {baseDisplay?.text ??
                      (pendingCount > 0 ? "生成中…" : "輸入一個問題，看它怎麼回。")}
                  </p>
                </section>

                {/* ADAPTER panel */}
                <section
                  className={`flex flex-col rounded-md border p-5 transition-colors ${
                    personaOn ? "border-accent/60 bg-panel" : "border-border bg-panel/60"
                  }`}
                >
                  <header className="mb-3 flex items-baseline justify-between border-b border-border/30 pb-2">
                    <span
                      className={`font-mono text-[10px] uppercase tracking-wide ${
                        personaOn ? "text-accent" : "text-muted"
                      }`}
                    >
                      {personaOn
                        ? `+ lora · ${adapterInfo?.label ?? adapterId}`
                        : "沒貼紙條 · 還是基底"}
                    </span>
                    <span className="font-mono text-[10px] text-muted">
                      α = {personaOn ? alpha : 0}
                    </span>
                  </header>
                  {personaOn && adapterInfo ? (
                    <p className="mb-2 text-xs text-muted">{adapterInfo.gloss}</p>
                  ) : null}
                  {adapterStale && adapterDisplay ? (
                    <p className="mb-2 font-mono text-[10px] text-warning">
                      顯示「{adapterDisplay.prompt}」的結果
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
                    {adapterDisplay?.text ??
                      (pendingCount > 0 ? "生成中…" : "貼上一張紙條看看。")}
                  </p>
                </section>
              </div>

              {/* The low-rank callout — the number that lands the lesson. */}
              {adapterInfo && pct ? (
                <p className="mt-5 text-center font-mono text-xs text-muted">
                  這張紙條只有{" "}
                  <span className="text-accent">
                    ~{wan(adapterInfo.trainableParams)}
                  </span>{" "}
                  個參數（rank {adapterInfo.rank}，佔整顆模型 &lt; {pct}%），
                  其餘 {(adapterInfo.totalParams / 1e8).toFixed(1)} 億個參數凍結不動
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </StationLayout>
  );
}
