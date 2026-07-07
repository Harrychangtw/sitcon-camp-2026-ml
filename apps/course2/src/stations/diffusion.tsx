/**
 * DIFFUSION — Course 3 panorama station 2: 從雜訊長出一張圖.
 *
 * The reveal: 「AI 畫圖」不是一次畫好的。學生從一張純雜訊開始，按播放看模型一步步
 * 『去噪』——結構先浮現、細節後長出，最後才成一張圖——再拖回去、換 seed 或步數，
 * 看同一條軌跡怎麼重新長出不一樣的畫面。
 *
 * The browser NEVER runs the model. A curated set of (preset × seed × steps)
 * denoising trajectories is baked ahead of time (SD-Turbo, latent decoded at
 * every step → a webp frame) into diffusion/presets.json + gitignored frames.
 * Typed prompts optionally go to the GPU server (/diffusion/generate), which
 * runs the SAME checkpoint and returns the same kind of frame sequence; offline
 * it falls back to the presets and says so.
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

interface Trajectory {
  seed: number;
  steps: number;
  /** Frame paths relative to the data root (noise → image), len steps + 1. */
  frames: string[];
}

interface DiffusionPreset {
  id: string;
  label: string;
  promptZh: string;
  prompt: string;
  trajectories: Trajectory[];
}

interface DiffusionPresets {
  station: string;
  model: string;
  sample: boolean;
  note: string;
  frameSize: number;
  seeds: number[];
  stepChoices: number[];
  /** stepCount → per-frame 中文 noise-level captions (len stepCount + 1). */
  noiseLabels: Record<string, string[]>;
  presets: DiffusionPreset[];
}

/** Response of POST /diffusion/generate — a live trajectory for a typed prompt. */
interface LiveGenerate {
  prompt: string;
  seed: number;
  steps: number;
  model: string;
  /** webp data URIs (self-contained), rendered through the same scrubber. */
  frames: string[];
  noiseLabels: string[];
}

interface TrajectoryView {
  /** Identity of this trajectory — changing it resets the scrubber to 0. */
  key: string;
  frames: string[];
  noiseLabels: string[];
}

const PRESETS_URL = "/data/course2/diffusion/presets.json";
const DATA_ROOT = "/data/course2";
const LIVE_TIMEOUT_MS = 90_000; // a denoise holds the GPU for a few seconds
const FRAME_MS = 420; // play-back speed, one denoise step per tick

export function DiffusionStation() {
  // 1. STATE — everything the canvas needs is plain component state.
  const [presets, setPresets] = useState<DiffusionPresets | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [seed, setSeed] = useState<number | null>(null);
  const [steps, setSteps] = useState<number | null>(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  // 2. LOAD PRECOMPUTED DATA — the baked trajectories. Default the knobs to the
  //    first preset so the station opens on something that plays offline.
  useEffect(() => {
    let alive = true;
    loadJSON<DiffusionPresets>(PRESETS_URL)
      .then((p) => {
        if (!alive) return;
        setPresets(p);
        setPrompt(p.presets[0]?.promptZh ?? "");
        setSeed(p.seeds[0] ?? 7);
        setSteps(p.stepChoices[p.stepChoices.length - 1] ?? 8);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const trimmed = prompt.trim();
  const activePreset = presets?.presets.find((p) => p.promptZh === trimmed) ?? null;
  const presetTraj =
    activePreset?.trajectories.find((t) => t.seed === seed && t.steps === steps) ?? null;

  // 3. LIVE PATH — a typed (non-preset) prompt goes to the GPU server, which
  //    runs the SAME checkpoint + per-step decode. Failures resolve null → the
  //    last good trajectory stays up and LiveStatus says 離線.
  const [liveResult, setLiveResult] = useState<LiveGenerate | null>(null);
  const [liveMs, setLiveMs] = useState(0);
  const [pending, setPending] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);

  const needLive = trimmed !== "" && activePreset === null && seed !== null && steps !== null;

  useEffect(() => {
    setLiveFailed(false);
    if (!needLive) return;
    let alive = true;
    // Debounced: a denoise holds the GPU for seconds, so only ask once typing /
    // knob-dragging pauses.
    const timer = setTimeout(() => {
      setPending(true);
      void liveInferTimed<LiveGenerate>(
        "/diffusion/generate",
        { prompt: trimmed, seed, steps },
        LIVE_TIMEOUT_MS,
      ).then((r) => {
        if (!alive) return;
        setPending(false);
        if (r) {
          setLiveResult(r.data);
          setLiveMs(r.ms);
        } else {
          setLiveFailed(true);
        }
      });
    }, 600);
    return () => {
      alive = false;
      clearTimeout(timer);
      setPending(false);
    };
  }, [trimmed, seed, steps, needLive]);

  const liveHit =
    liveResult &&
    liveResult.prompt === trimmed &&
    liveResult.seed === seed &&
    liveResult.steps === steps
      ? liveResult
      : null;

  // 4. DERIVED TRAJECTORY — presets and live answers flow through the SAME
  //    scrubber. When both are missing the last good one stays up (honest
  //    fallback), so scrubbing always has frames to show.
  const lastGood = useRef<TrajectoryView | null>(null);
  const view = useMemo<TrajectoryView | null>(() => {
    if (activePreset && presetTraj && presets) {
      lastGood.current = {
        key: `${activePreset.id}:${seed}:${steps}`,
        frames: presetTraj.frames.map((f) => `${DATA_ROOT}/${f}`),
        noiseLabels: presets.noiseLabels[String(steps)] ?? [],
      };
    } else if (liveHit) {
      lastGood.current = {
        key: `live:${trimmed}:${seed}:${steps}`,
        frames: liveHit.frames,
        noiseLabels: liveHit.noiseLabels,
      };
    }
    return lastGood.current;
  }, [activePreset, presetTraj, presets, liveHit, seed, steps, trimmed]);

  const frames = view?.frames ?? null;
  const frameCount = frames?.length ?? 0;
  const clampedIdx = frameCount > 0 ? Math.min(frameIdx, frameCount - 1) : 0;
  const isCustomOffline = needLive && !liveHit && !pending;

  // Reset the scrubber whenever the trajectory identity changes.
  const viewKey = view?.key ?? null;
  useEffect(() => {
    setFrameIdx(0);
    setPlaying(false);
  }, [viewKey]);

  // Preload frames so play-back doesn't flash (browsers then serve from cache).
  useEffect(() => {
    if (!frames) return;
    for (const src of frames) {
      const img = new Image();
      img.src = src;
    }
  }, [frames]);

  // 5. PLAY-BACK — advance one frame per tick; stop at the end (成形). Dragging
  //    the scrubber or a knob pauses (handled at the call sites).
  useEffect(() => {
    if (!playing || frameCount <= 1) return;
    if (clampedIdx >= frameCount - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(
      () => setFrameIdx((i) => Math.min(i + 1, frameCount - 1)),
      FRAME_MS,
    );
    return () => clearTimeout(t);
  }, [playing, clampedIdx, frameCount]);

  const liveState = useMemo<LiveState>(() => {
    if (!needLive) return { kind: "idle" };
    if (pending) return { kind: "pending" };
    if (liveHit) return { kind: "live", ms: liveMs };
    if (liveFailed) return { kind: "cached" };
    return { kind: "idle" };
  }, [needLive, pending, liveHit, liveMs, liveFailed]);

  const noiseLabel = view?.noiseLabels[clampedIdx] ?? "";
  const atEnd = frameCount > 0 && clampedIdx >= frameCount - 1;

  const togglePlay = () => {
    if (frameCount <= 1) return;
    if (playing) {
      setPlaying(false);
    } else {
      if (atEnd) setFrameIdx(0); // replay from pure noise
      setPlaying(true);
    }
  };

  const scrub = (v: number) => {
    setPlaying(false);
    setFrameIdx(v);
  };

  return (
    <StationLayout
      title="擴散生成圖"
      subtitle="從雜訊長出一張圖。"
      fullBleed
      input={
        <SuggestInput
          value={prompt}
          onChange={setPrompt}
          ariaLabel="輸入畫面主題"
          placeholder="換個主題…輸入文字送到 GPU 即時生成"
          maxLength={150}
          presets={(presets?.presets ?? []).map((p) => ({
            label: p.label,
            value: p.promptZh,
          }))}
          presetLabel="選一個主題"
          status={<LiveStatus state={liveState} />}
        />
      }
      controls={
        <DockControls>
          <BlockToggle
            label="種子"
            gloss="隨機起點：不同種子 = 不同的初始雜訊"
            info="seed（種子）決定第一張純雜訊長什麼樣。同一個主題換一顆種子，就從另一團雜訊出發，去噪出來的畫面也不一樣。這就是為什麼同樣的 prompt 每次生成都不同。"
            value={String(seed ?? "")}
            onChange={(v) => setSeed(Number(v))}
            options={(presets?.seeds ?? []).map((s) => ({
              label: `#${s}`,
              value: String(s),
            }))}
          />
          <BlockToggle
            label="步數"
            gloss="去噪幾步：步數越多，軌跡越長越細"
            info="模型把雜訊清乾淨要分好幾步走。步數越多，每一步改動越小、軌跡越平滑，也越花時間。SD-Turbo 是少步數的加速模型，幾步就能成形。"
            value={String(steps ?? "")}
            onChange={(v) => setSteps(Number(v))}
            options={(presets?.stepChoices ?? []).map((s) => ({
              label: `${s} 步`,
              value: String(s),
            }))}
          />
        </DockControls>
      }
      takeaway={
        <span>
          模型不是一次畫好，是從一張純雜訊一步步「去噪」出來的：結構先浮現，細節後長出。
          換一顆 seed 就從不同的雜訊出發，長出不一樣的圖；步數決定這條軌跡走得多細。
          真正的生成在 GPU 上事先跑好，教室裡播放的是錄下來的每一步。
        </span>
      }
    >
      <div className="relative h-full w-full">
        <GuidedTour
          storageKey="camp-tour-diffusion"
          steps={[
            {
              title: "這是一張純雜訊",
              body: "畫面現在停在第 1 步：一整片彩色雜訊，什麼都還看不出來。這就是模型畫圖的起點。",
            },
            {
              title: "按播放看它去噪",
              body: "按下播放鍵，模型會一步步把雜訊清掉：先浮現大概的結構，再長出細節，最後成一張圖。也可以拖動下面的滑桿，前後來回看。",
            },
            {
              title: "換 seed 或步數",
              body: "換一顆「種子」就從不同的雜訊出發，長出不一樣的畫面；「步數」決定這條去噪軌跡走得多細。換了之後再按一次播放。",
            },
            {
              title: "AI 畫圖不是魔法",
              body: "所謂「AI 畫圖」，其實就是這樣一步步的去噪。這裡播放的是事先在 GPU 上錄好的每一步——瀏覽器只負責放給你看。",
            },
          ]}
        />
        {error ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-md text-center text-sm text-warning">
              無法載入擴散資料（{error}）。請執行{" "}
              <code className="font-mono">uv run camp-precompute diffusion-sample</code>。
            </p>
          </div>
        ) : !presets || !frames ? (
          <div className="flex h-full items-center justify-center">
            <LoadingTimer label="載入去噪軌跡中" />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 py-8">
            {/* THE FRAME — the current step, large. */}
            <div className="flex w-full max-w-md flex-col items-center gap-3">
              <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-lg border border-border bg-black">
                <img
                  key={view?.key}
                  src={frames[clampedIdx]}
                  alt={`去噪第 ${clampedIdx + 1} 步`}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
                {/* Step index / noise level — the "還很雜訊 → 成形" caption. */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-baseline justify-between bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6">
                  <span className="font-mono text-[11px] uppercase tracking-wide text-fg">
                    第 {clampedIdx + 1}/{frameCount} 步
                  </span>
                  <span
                    className={`font-mono text-[11px] ${
                      atEnd ? "text-accent" : "text-muted"
                    }`}
                  >
                    {noiseLabel}
                  </span>
                </div>
                {isCustomOffline ? (
                  <div className="absolute right-2 top-2 rounded bg-panel/90 px-2 py-1 font-mono text-[10px] text-warning">
                    離線 · 顯示上一條軌跡
                  </div>
                ) : null}
              </div>

              {/* TRANSPORT — play/pause + the trajectory scrubber. */}
              <div className="flex w-full items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={playing ? "暫停" : "播放"}
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent text-accent-fg transition-shadow hover:shadow-[0_0_10px] hover:shadow-accent/50"
                >
                  {playing ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
                <div className="grid flex-1 grid-cols-[auto_1fr] items-center gap-x-4">
                  <BlockSlider
                    label="步驟"
                    info="拖動看去噪的每一步：往右走越來越清楚，往左拖回雜訊。按播放會自動一步步前進到成形。"
                    value={clampedIdx}
                    min={0}
                    max={Math.max(0, frameCount - 1)}
                    step={1}
                    onChange={scrub}
                    format={(v) => `第 ${v + 1}/${frameCount} 步`}
                    ariaLabel="去噪軌跡"
                  />
                </div>
              </div>
            </div>

            {/* FILMSTRIP — the trajectory laid out; click a frame to jump. It
                grew from noise (left) to image (right). */}
            <div className="flex w-full max-w-md items-center justify-center gap-1.5 overflow-x-auto">
              {frames.map((src, i) => (
                <button
                  key={`${view?.key}-${i}`}
                  type="button"
                  onClick={() => scrub(i)}
                  aria-label={`跳到第 ${i + 1} 步`}
                  className={`h-11 w-11 flex-none overflow-hidden rounded border transition-all ${
                    i === clampedIdx
                      ? "border-accent ring-1 ring-accent"
                      : "border-border opacity-60 hover:opacity-100"
                  }`}
                >
                  <img
                    src={src}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                </button>
              ))}
            </div>

            {presets.sample ? (
              <p className="text-center font-mono text-[10px] text-muted">
                目前是示範用的合成軌跡；真正的 SD-Turbo 去噪需在 GPU 上烘焙（見 runbook）。
              </p>
            ) : null}
          </div>
        )}
      </div>
    </StationLayout>
  );
}
