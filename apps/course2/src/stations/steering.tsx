/**
 * STEERING — Course 3 panorama station 3: 打開模型內部的旋鈕.
 *
 * The reveal: the SAME Qwen3-0.6B answers the SAME prompt twice, side by side.
 * Left is the untouched model; right has one or more 「概念旋鈕」 turned — a
 * direction added straight into the residual stream mid-stack. Drag 金門大橋
 * to +2 and the reply can't stop mentioning the bridge; drag 正式語氣 down and
 * it talks like a group chat. 可解釋性 made tangible: we can look inside a
 * model, name what we find, and turn it.
 *
 * Feature sourcing (the resolved decision, see camp_precompute.steering):
 * CONTRASTIVE steering vectors (activation addition) computed once offline on
 * the already-served Qwen — not an SAE. Hand-picked 中文-labeled directions
 * beat SAE releases (English auto-labels, non-中文 bases) on legibility for
 * this audience, and rule 2 keeps the one served model.
 *
 * The browser NEVER runs the model. Preset prompts × features × slider stops
 * are RECORDED outputs (steering/presets.json — currently the hand-authored
 * dev sample; the GPU runbook bakes real ones). Typed prompts and multi-knob
 * combos go to the GPU server (/steering/generate); offline it falls back to
 * the nearest single-knob preset and says so.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BlockSlider,
  DockControls,
  GuidedTour,
  LiveStatus,
  LoadingTimer,
  StationLayout,
  SuggestInput,
  type LiveState,
} from "@camp/ui";
import { liveInferTimed, loadJSON } from "@camp/data";

interface SteeringFeature {
  id: string;
  label: string;
  gloss: string;
  info: string;
  posLabel: string;
  negLabel: string;
  layer: number;
  scale: number | null;
}

interface FeaturesCatalog {
  model: string;
  layer: number;
  maxStrength: number;
  features: SteeringFeature[];
}

interface SteeringPresets {
  model: string;
  maxNewTokens: number;
  /** Baked non-zero slider stops; strength 0 is `base`. */
  strengths: number[];
  suggestions: string[];
  /** prompt → untouched-model reply. */
  base: Record<string, string>;
  /** featureId → prompt → reply per strengths[i] (single knob at a time). */
  outputs: Record<string, Record<string, string[]>>;
}

/** Response of POST /steering/generate — one text cell of presets.json. */
interface LiveGenerate {
  prompt: string;
  features: { id: string; strength: number }[];
  model: string;
  text: string;
}

interface PanelText {
  prompt: string;
  /** Canonical settings key the text belongs to ("" for base). */
  settingsKey: string;
  text: string;
}

const PRESETS_URL = "/data/course2/steering/presets.json";
const FEATURES_URL = "/data/course2/steering/features.json";
const LIVE_TIMEOUT_MS = 30_000;

/** Canonical key for a knob setting: sorted non-zero (id, strength) pairs. */
function settingsKeyOf(settings: Record<string, number>): string {
  return Object.entries(settings)
    .filter(([, s]) => s !== 0)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, s]) => `${id}:${s}`)
    .join(",");
}

export function SteeringStation() {
  // 1. STATE — everything the canvas needs is plain component state.
  const [presets, setPresets] = useState<SteeringPresets | null>(null);
  const [catalog, setCatalog] = useState<FeaturesCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("介紹一下你自己");
  // featureId → slider strength (−2…+2, integer stops). All 0 = base.
  const [strengths, setStrengths] = useState<Record<string, number>>({});

  // 2. LOAD PRECOMPUTED DATA — recorded outputs + the knob catalog.
  useEffect(() => {
    let alive = true;
    Promise.all([
      loadJSON<SteeringPresets>(PRESETS_URL),
      loadJSON<FeaturesCatalog>(FEATURES_URL),
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
  const features = useMemo(() => catalog?.features ?? [], [catalog]);
  const active = useMemo(
    () =>
      features
        .map((f) => ({ feature: f, strength: strengths[f.id] ?? 0 }))
        .filter((a) => a.strength !== 0),
    [features, strengths],
  );
  const steeringOn = active.length > 0;
  const settingsKey = useMemo(() => settingsKeyOf(strengths), [strengths]);

  // Dominant knob = the loudest one — the offline nearest-preset anchor when
  // several knobs are turned (presets only bake single-knob cells).
  const dominant = useMemo(
    () =>
      active.reduce<(typeof active)[number] | null>(
        (best, a) =>
          best === null || Math.abs(a.strength) > Math.abs(best.strength) ? a : best,
        null,
      ),
    [active],
  );

  // Preset coverage: base + every single-knob (feature, baked stop) cell.
  const presetBase = presets?.base[trimmed] ?? null;
  const exactPresetSteered = useMemo(() => {
    if (!presets || active.length !== 1) return null;
    const [only] = active;
    const idx = presets.strengths.indexOf(only!.strength);
    if (idx < 0) return null;
    return presets.outputs[only!.feature.id]?.[trimmed]?.[idx] ?? null;
  }, [presets, active, trimmed]);
  // Nearest single-knob preset for a multi-knob setting — the honest offline
  // approximation (labelled below when used).
  const nearestPresetSteered = useMemo(() => {
    if (!presets || !dominant || active.length < 2) return null;
    const idx = presets.strengths.indexOf(dominant.strength);
    if (idx < 0) return null;
    return presets.outputs[dominant.feature.id]?.[trimmed]?.[idx] ?? null;
  }, [presets, dominant, active.length, trimmed]);

  // 3. LIVE PATH — anything the single-knob presets can't cover goes to the
  //    GPU server, which runs the SAME module that recorded them. Failures
  //    resolve null → the last good text stays up and LiveStatus says so.
  const [liveBase, setLiveBase] = useState<LiveGenerate | null>(null);
  const [liveSteered, setLiveSteered] = useState<
    (LiveGenerate & { settingsKey: string }) | null
  >(null);
  const [liveMs, setLiveMs] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [liveFailed, setLiveFailed] = useState(false);

  const needLiveBase = trimmed !== "" && presetBase === null;
  const needLiveSteered = trimmed !== "" && steeringOn && exactPresetSteered === null;

  // Live answers that still match the current inputs. Computed BEFORE the
  // effect so it can skip a request it already has: a knob drag changes
  // settingsKey but never the base text, so the base is asked once per prompt.
  const liveBaseHit = liveBase && liveBase.prompt === trimmed ? liveBase : null;
  const liveSteeredHit =
    liveSteered && liveSteered.prompt === trimmed && liveSteered.settingsKey === settingsKey
      ? liveSteered
      : null;

  useEffect(() => {
    setLiveFailed(false);
    if (!needLiveBase && !needLiveSteered) return;
    let alive = true;
    const featureBody = active.map((a) => ({ id: a.feature.id, strength: a.strength }));
    // Debounced: generation holds the GPU for a few seconds, so only ask once
    // typing/dragging pauses. Base and steered requests fire together; the
    // server's lm queue serialises them.
    const timer = setTimeout(() => {
      if (needLiveBase && !liveBaseHit) {
        setPendingCount((n) => n + 1);
        void liveInferTimed<LiveGenerate>(
          "/steering/generate",
          { prompt: trimmed, features: [] },
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
      if (needLiveSteered && !liveSteeredHit) {
        setPendingCount((n) => n + 1);
        void liveInferTimed<LiveGenerate>(
          "/steering/generate",
          { prompt: trimmed, features: featureBody },
          LIVE_TIMEOUT_MS,
        ).then((r) => {
          if (!alive) return;
          setPendingCount((n) => n - 1);
          if (r) {
            setLiveSteered({ ...r.data, settingsKey });
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
    // `active` is derived from strengths/features; settingsKey canonically
    // covers its contents for effect purposes. The *Hit values are read as
    // skip-guards only — a hit landing must NOT re-run (and thus cancel) the
    // other request still in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, settingsKey, needLiveBase, needLiveSteered]);

  const liveState = useMemo<LiveState>(() => {
    if (!trimmed || (!needLiveBase && !needLiveSteered)) return { kind: "idle" };
    if (pendingCount > 0) return { kind: "pending" };
    const covered =
      (!needLiveBase || liveBaseHit) && (!needLiveSteered || liveSteeredHit);
    if (covered) return { kind: "live", ms: liveMs };
    if (liveFailed) return { kind: "cached" };
    return { kind: "idle" };
  }, [
    trimmed,
    needLiveBase,
    needLiveSteered,
    pendingCount,
    liveBaseHit,
    liveSteeredHit,
    liveMs,
    liveFailed,
  ]);

  // 4. DERIVED PANEL TEXTS — presets and live answers flow through the SAME
  //    path; when both are missing the last good text stays up, labelled with
  //    the prompt it belongs to (the honest lora/nextToken pattern).
  const lastGoodBase = useRef<PanelText | null>(null);
  const lastGoodSteered = useRef<PanelText | null>(null);

  const baseDisplay = useMemo<PanelText | null>(() => {
    if (presetBase !== null) {
      lastGoodBase.current = { prompt: trimmed, settingsKey: "", text: presetBase };
    } else if (liveBaseHit) {
      lastGoodBase.current = { prompt: trimmed, settingsKey: "", text: liveBaseHit.text };
    }
    return lastGoodBase.current;
  }, [trimmed, presetBase, liveBaseHit]);

  // True while the steered panel is showing the dominant-knob approximation
  // (multi-knob setting, live unavailable).
  const [approx, steeredDisplay] = useMemo<[boolean, PanelText | null]>(() => {
    if (!steeringOn) return [false, baseDisplay]; // 旋鈕都在 0 → 右邊就是原味
    if (exactPresetSteered !== null) {
      lastGoodSteered.current = { prompt: trimmed, settingsKey, text: exactPresetSteered };
      return [false, lastGoodSteered.current];
    }
    if (liveSteeredHit) {
      lastGoodSteered.current = { prompt: trimmed, settingsKey, text: liveSteeredHit.text };
      return [false, lastGoodSteered.current];
    }
    if (nearestPresetSteered !== null) {
      // Deliberately NOT cached as last-good: it is an approximation.
      return [
        true,
        { prompt: trimmed, settingsKey, text: nearestPresetSteered },
      ];
    }
    return [false, lastGoodSteered.current];
  }, [
    steeringOn,
    baseDisplay,
    trimmed,
    settingsKey,
    exactPresetSteered,
    liveSteeredHit,
    nearestPresetSteered,
  ]);

  const baseStale = baseDisplay !== null && baseDisplay.prompt !== trimmed;
  const steeredStale =
    steeringOn &&
    steeredDisplay !== null &&
    (steeredDisplay.prompt !== trimmed || steeredDisplay.settingsKey !== settingsKey) &&
    !approx;

  const knobSummary = active
    .map((a) => `${a.feature.label} ${a.strength > 0 ? "+" : ""}${a.strength}`)
    .join(" · ");

  return (
    <StationLayout
      title="Feature Steering"
      subtitle="打開模型內部的旋鈕。"
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
          {features.map((f) => (
            <BlockSlider
              key={f.id}
              label={f.label}
              gloss={f.gloss}
              info={f.info}
              min={-(catalog?.maxStrength ?? 2)}
              max={catalog?.maxStrength ?? 2}
              step={1}
              value={strengths[f.id] ?? 0}
              onChange={(v) => setStrengths((s) => ({ ...s, [f.id]: v }))}
              format={(v) =>
                v === 0 ? "0：關" : v > 0 ? `+${v} ${f.posLabel}` : `${v} ${f.negLabel}`
              }
            />
          ))}
        </DockControls>
      }
      takeaway={
        <span>
          可解釋性：模型內部不是看不懂的一團數字。用成對的例句對比，可以在第{" "}
          {catalog?.layer ?? 14} 層的內部訊號裡找出「金門大橋」「正式語氣」這種
          有名字的方向；把方向加回去，輸出就跟著偏。能找到、能命名、能轉動，
          代表我們真的看進了模型在想什麼，這條路線叫 interpretability。
        </span>
      }
    >
      <div className="relative h-full w-full">
        <GuidedTour
          storageKey="camp-tour-steering"
          steps={[
            {
              title: "先看正常輸出",
              body: "左右兩欄是同一顆 Qwen3-0.6B 對同一個問題的回答。旋鈕都在 0 的時候，兩邊一模一樣：這就是模型的原味。",
            },
            {
              title: "把「金門大橋」拉到最大",
              body: "下方每個滑桿是模型內部的一個「概念旋鈕」。把「金門大橋」拉到 +2，等右邊重新生成。",
            },
            {
              title: "看它整段都在講橋",
              body: "右邊開始滿腦子都是橋。這不是關鍵字過濾：我們是把「金門大橋」這個方向直接加進模型中層的訊號裡，它是真的「想著」橋在回答。",
            },
            {
              title: "這就是打開模型內部",
              body: "往負的方向拉會避開概念，換「正式語氣」「心情」試試語氣的旋鈕。能在模型裡找到方向、標上名字、直接轉動，就是可解釋性（interpretability）研究在做的事。",
            },
          ]}
        />
        {error ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-md text-center text-sm text-warning">
              無法載入 steering 資料（{error}）。請執行{" "}
              <code className="font-mono">uv run camp-precompute steering-sample</code>。
            </p>
          </div>
        ) : !presets || !catalog ? (
          <div className="flex h-full items-center justify-center">
            <LoadingTimer label="載入概念旋鈕中" />
          </div>
        ) : (
          <div className="absolute inset-0 overflow-auto px-8 pt-16 pb-32">
            <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center">
              {/* The side-by-side reveal: same model, same prompt, one has its
                  internal knobs turned. The steered panel's header carries the
                  one lime mark when a knob is non-zero. */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* BASE panel */}
                <section className="flex flex-col rounded-md border border-border bg-panel/60 p-5">
                  <header className="mb-3 flex items-baseline justify-between border-b border-border/30 pb-2">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                      base · 原本的模型
                    </span>
                    <span className="font-mono text-[10px] text-muted">旋鈕全部 0</span>
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

                {/* STEERED panel */}
                <section
                  className={`flex flex-col rounded-md border p-5 transition-colors ${
                    steeringOn ? "border-accent/60 bg-panel" : "border-border bg-panel/60"
                  }`}
                >
                  <header className="mb-3 flex items-baseline justify-between border-b border-border/30 pb-2">
                    <span
                      className={`font-mono text-[10px] uppercase tracking-wide ${
                        steeringOn ? "text-accent" : "text-muted"
                      }`}
                    >
                      {steeringOn ? "+ steering · 旋鈕轉了" : "旋鈕還沒轉 · 還是原味"}
                    </span>
                    <span className="font-mono text-[10px] text-muted">
                      {steeringOn ? knobSummary : "0"}
                    </span>
                  </header>
                  {approx && dominant ? (
                    <p className="mb-2 font-mono text-[10px] text-warning">
                      離線：只能顯示最大的那顆旋鈕（{dominant.feature.label}{" "}
                      {dominant.strength > 0 ? "+" : ""}
                      {dominant.strength}）的預錄結果
                    </p>
                  ) : null}
                  {steeredStale && steeredDisplay ? (
                    <p className="mb-2 font-mono text-[10px] text-warning">
                      顯示「{steeredDisplay.prompt}」的結果
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
                    {steeredDisplay?.text ??
                      (pendingCount > 0 ? "生成中…" : "轉一顆下面的旋鈕看看。")}
                  </p>
                </section>
              </div>

              {/* The interpretability callout — the line that lands the lesson. */}
              <p className="mt-5 text-center font-mono text-xs text-muted">
                這些不是關鍵字過濾，是模型內部的
                <span className="text-accent">「概念旋鈕」</span>
                ：用對比句子在第 {catalog.layer} 層找出方向，加上去，它想的事就變了
              </p>
            </div>
          </div>
        )}
      </div>
    </StationLayout>
  );
}
