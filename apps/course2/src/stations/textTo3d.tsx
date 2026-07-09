/**
 * TEXT-TO-3D — Course 3 panorama station 5: 文字生 3D.
 *
 * The reveal: 剛剛在擴散生成圖那站，diffusion 從雜訊長出一張 2D 圖。這一站把同一個
 * 想法升一個維度——用 Microsoft TRELLIS 打一句話，長出一個能繞著轉的 3D 物件。
 * 一顆旋鈕兩層意思:挑一個 prompt，物件就長出來（文字 → 3D）；翻另一顆 seed，
 * 同一句話會重新長出一個不一樣的東西（sampling variance，摸得到）。
 *
 * The browser only RENDERS the gaussians (sorting + drawing = playback, the
 * golden rule holds). TRELLIS runs AHEAD of time on the GPU box; the objects are
 * pruned + converted offline by `camp-precompute trellis` into the SAME .splat
 * format the skyfall station streams. No live server route this session (TRELLIS
 * inference is ~10s–1min and free-text 3D raises moderation questions the presets
 * sidestep) — panorama rule 6 is deferred; the station is fully static and works
 * with the backend off. Until the runbook (prompts/server-runs/trellis-precompute
 * .md) runs, the station ships procedural 示意資料 objects so the whole UI works.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BlockToggle,
  DockControls,
  GuidedTour,
  InfoLabel,
  LoadingTimer,
  StationLayout,
} from "@camp/ui";
import { SplatViewer, type SplatPose } from "@camp/viz";
import { loadJSON } from "@camp/data";

interface ObjectMeta {
  seed: number;
  path: string;
  bytes: number;
  splats: number;
  center: [number, number, number];
  radius: number;
  thumb?: string;
  thumbBytes?: number;
}

interface PresetMeta {
  id: string;
  label: string;
  prompt: string;
  recipe: string;
  framingRadius: number;
  objects: ObjectMeta[];
}

interface TextTo3dPresets {
  sample: boolean;
  model: string;
  up: [number, number, number];
  seeds: number[];
  note: string;
  presets: PresetMeta[];
}

const PRESETS_URL = "/data/course2/text-to-3d/presets.json";
const DATA_ROOT = "/data/course2";

/** Distance factor to frame a bounding sphere of radius R: mirrors
 * SplatViewer's 60° vertical fov + margin (R / sin(30°) × 1.25 = 2.5 R), so the
 * reset pose matches the viewer's own auto-frame exactly. */
const FRAME_FACTOR = 2.5;
/** The 3/4 view direction the object opens on (front, a little up + right) —
 * the same feel as the baked thumbnails. */
const VIEW_DIR: [number, number, number] = [0.55, 0.35, 1.0];

const wan = (n: number) =>
  n >= 10_000 ? `${(n / 10_000).toFixed(1)} 萬` : `${Math.round(n / 1000)} 千`;
const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

function framedPose(center: [number, number, number], radius: number): SplatPose {
  const len = Math.hypot(...VIEW_DIR) || 1;
  const d = (radius * FRAME_FACTOR) / len;
  return {
    position: [
      center[0] + VIEW_DIR[0] * d,
      center[1] + VIEW_DIR[1] * d,
      center[2] + VIEW_DIR[2] * d,
    ],
    lookAt: center,
  };
}

export function TextTo3dStation() {
  // 1. STATE — everything the canvas needs is plain component state.
  const [data, setData] = useState<TextTo3dPresets | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [presetId, setPresetId] = useState<string | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [autorotate, setAutorotate] = useState(true);
  // The two-beat copy flips to its second line once the student flips a seed.
  const [seedFlipped, setSeedFlipped] = useState(false);
  // Fresh object per click → SplatViewer re-fires the framed viewpoint.
  const [jump, setJump] = useState<SplatPose | null>(null);

  // firstReady: this object has painted once (full-canvas loader until then).
  // switching: a seed flip is still streaming the other object in.
  const [firstReady, setFirstReady] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState(false);

  // 2. LOAD THE PRESET CATALOG — labels, prompts, per-seed object files.
  useEffect(() => {
    let alive = true;
    loadJSON<TextTo3dPresets>(PRESETS_URL)
      .then((d) => {
        if (!alive) return;
        setData(d);
        const first = d.presets[0];
        setPresetId(first?.id ?? null);
        setSeed(first?.objects[0]?.seed ?? d.seeds[0] ?? 0);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const preset = data?.presets.find((p) => p.id === presetId) ?? null;
  const activeObject =
    preset?.objects.find((o) => o.seed === seed) ?? preset?.objects[0] ?? null;

  const src = activeObject ? `${DATA_ROOT}/${activeObject.path}` : null;
  // Keep BOTH seeds warm so the A/B flip is instant and the camera never moves
  // — the comparison ("same words, different growth") needs a shared frame.
  const keepLoaded = useMemo(
    () => (preset?.objects ?? []).map((o) => `${DATA_ROOT}/${o.path}`),
    [preset],
  );

  // Frame on the first object's centre (both seeds sit near the origin, so the
  // camera can stay put across a flip), radius = the preset-level max.
  const initialPose = useMemo<SplatPose | null>(() => {
    const anchor = preset?.objects[0];
    if (!preset || !anchor) return null;
    return framedPose(anchor.center, preset.framingRadius);
  }, [preset]);

  const pickPreset = (id: string) => {
    if (id === presetId) return;
    const next = data?.presets.find((p) => p.id === id);
    setPresetId(id);
    setSeed(next?.objects[0]?.seed ?? 0);
    setSeedFlipped(false);
    setJump(null);
    setFirstReady(false);
    setSwitching(false);
    setProgress(0);
    setLoadError(false);
    setAutorotate(true);
  };

  const pickSeed = (s: number) => {
    if (s === seed) return;
    setSeed(s);
    setSeedFlipped(true);
    setSwitching(true); // cleared by onReady (same frame when preloaded)
  };

  const resetView = () => {
    if (initialPose) setJump({ ...initialPose });
  };

  // onReady means the ACTIVE object is now on screen. Read the current seed via
  // a ref so the stable callback given to SplatViewer never reports a stale one.
  const activeSeedRef = useRef(seed);
  activeSeedRef.current = seed;

  const seedLabel = (s: number) => (s === (data?.seeds[0] ?? 0) ? "種子 A" : "種子 B");

  // The two-beat takeaway line (canvas readout, not the dock).
  const beat = !firstReady
    ? null
    : seedFlipped
      ? "同一句話,不同的隨機起點,長出不同的東西。"
      : "這個物件是模型從一句話長出來的,不是人建模的。";

  return (
    <StationLayout
      title="文字生 3D · TRELLIS"
      subtitle="打一句話,長出一個能轉的 3D 物件。"
      fullBleed
      controls={
        <DockControls>
          <BlockToggle
            label="種子"
            gloss="隨機起點:同一句話換一顆種子,就長出不一樣的物件"
            info="seed（種子）決定模型從哪個隨機起點開始長。同一句 prompt 換一顆種子,TRELLIS 會生成一個不同的 3D 物件——就像擴散生成圖那站換 seed 會畫出不同的圖。切換時鏡頭不動,方便比較同一句話的兩種長法。"
            value={String(seed ?? "")}
            onChange={(v) => pickSeed(Number(v))}
            options={(data?.seeds ?? []).map((s) => ({
              label: seedLabel(s),
              value: String(s),
            }))}
          />
          <BlockToggle
            label="自動旋轉"
            gloss="讓物件慢慢自轉;一碰它就停下來"
            info="打開後物件會慢慢自轉,方便你看清楚它是立體的。用滑鼠一拖它就停,換你自己轉。"
            value={autorotate ? "on" : "off"}
            onChange={(v) => setAutorotate(v === "on")}
            options={[
              { label: "開", value: "on" },
              { label: "關", value: "off" },
            ]}
          />
          <InfoLabel
            label="提示詞 PROMPT"
            gloss={preset?.prompt ?? ""}
            info="模型讀到的其實是這句英文 prompt。TRELLIS 是用英文訓練的,中文標籤只是給你看的;把游標移到左邊的句子卡上,也會看到餵給模型的英文。"
          />
        </DockControls>
      }
      takeaway={
        <span>
          diffusion 從雜訊長出一張 2D 圖;TRELLIS 把同一個想法升一個維度,從一句話
          長出一個 3D 物件。換一顆 seed,同一句話會長出不一樣的東西——生成模型不是
          在「查一個標準答案」,而是每次從一個隨機起點,重新想像一次。
        </span>
      }
    >
      <div className="relative h-full w-full">
        <GuidedTour
          storageKey="camp-tour-text-to-3d"
          steps={[
            {
              title: "挑一句話",
              body: "左邊每一張卡片就是一句話（prompt）。挑一個,右邊就會長出那句話對應的 3D 物件。把游標移到卡片上,可以看到真正餵給模型的英文。",
            },
            {
              title: "轉轉看這個物件",
              body: "用滑鼠拖曳可以繞著物件轉,滾輪拉遠拉近。它是模型從一句話長出來的立體物件,不是人建模的。",
            },
            {
              title: "換個 seed,再長一次",
              body: "下方的「種子 A / 種子 B」是這一站的重點。翻到另一顆種子,同一句話會從不同的隨機起點,重新長出一個物件。",
            },
            {
              title: "同一句話,不只一種長法",
              body: "兩顆種子長出的東西不一樣——生成模型不是在查一個標準答案,而是每次重新想像一次。這就是 sampling variance。",
            },
          ]}
        />
        {error ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-md text-center text-sm text-warning">
              無法載入物件資料（{error}）。請執行{" "}
              <code className="font-mono">uv run camp-precompute trellis-sample</code>。
            </p>
          </div>
        ) : !data || !preset || !src || !initialPose ? (
          <div className="flex h-full items-center justify-center">
            <LoadingTimer label="載入物件目錄中" />
          </div>
        ) : (
          <>
            <SplatViewer
              key={preset.id}
              src={src}
              keepLoaded={keepLoaded}
              controls="orbit"
              up={data.up}
              initialPose={initialPose}
              framingRadius={preset.framingRadius}
              autorotate={autorotate}
              onAutorotateStop={() => setAutorotate(false)}
              jumpTo={jump}
              fill
              onProgress={(f) => setProgress(Math.round(f * 100) / 100)}
              onReady={() => {
                setFirstReady(true);
                setSwitching(false);
              }}
              onError={() => setLoadError(true)}
            />

            {/* PRESET PICKER — the "挑一句話" rail. Thumbnail + zh label; the
                English prompt reveals on hover (students SEE the model was fed
                English). Lime ring on the active card. */}
            <div className="pointer-events-auto absolute bottom-24 left-4 top-16 flex w-36 flex-col gap-2 overflow-y-auto pr-1 md:w-40">
              <p className="sticky top-0 z-10 bg-gradient-to-b from-bg via-bg/90 to-transparent pb-1 font-mono text-[10px] uppercase tracking-wide text-muted">
                挑一句話
              </p>
              {data.presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickPreset(p.id)}
                  aria-label={p.label}
                  className={`group/card relative flex-none overflow-hidden rounded-md border text-left transition-all ${
                    p.id === presetId
                      ? "border-accent ring-1 ring-accent"
                      : "border-border opacity-80 hover:opacity-100"
                  }`}
                >
                  {p.objects[0]?.thumb ? (
                    <img
                      src={`${DATA_ROOT}/${p.objects[0].thumb}`}
                      alt=""
                      className="aspect-square w-full bg-black object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-black">
                      <span className="font-mono text-[10px] text-muted">3D</span>
                    </div>
                  )}
                  <span
                    className={`block truncate px-2 py-1 text-xs ${
                      p.id === presetId ? "text-accent" : "text-fg"
                    }`}
                  >
                    {p.label}
                  </span>
                  {/* Hover reveal: the exact English prompt fed to TRELLIS. */}
                  <span className="pointer-events-none absolute left-full top-0 z-40 ml-2 hidden w-max max-w-[15rem] rounded-md border border-border bg-panel px-3 py-2 text-xs leading-relaxed text-fg shadow-md group-hover/card:block">
                    <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-muted">
                      模型讀到的英文
                    </span>
                    {p.prompt}
                  </span>
                </button>
              ))}
            </div>

            {/* FIRST LOAD — objects are ≤2 MB so this is quick, but count it. */}
            {!firstReady ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
                <LoadingTimer
                  label={`長出 ${preset.label} 中 ${Math.round(progress * 100)}%`}
                />
                <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
                  {activeObject
                    ? `${wan(activeObject.splats)} 個 gaussians · ${mb(activeObject.bytes)}`
                    : ""}
                </p>
              </div>
            ) : null}

            {/* Seed flip still streaming (only before both seeds are warm). */}
            {firstReady && switching ? (
              <div className="absolute right-4 top-16 rounded bg-panel/90 px-2 py-1 font-mono text-[10px] text-muted">
                重新長出中 {Math.round(progress * 100)}%
              </div>
            ) : null}

            {/* THE TWO-BEAT COPY — what the student is looking at, and the point. */}
            {beat ? (
              <div className="pointer-events-none absolute bottom-6 left-1/2 max-w-sm -translate-x-1/2 rounded-md border border-border bg-panel/85 px-3 py-2 text-center backdrop-blur-sm">
                <p className="font-mono text-[10px] uppercase tracking-wide text-accent">
                  {seedLabel(seed ?? 0)} · {preset.label}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-fg">{beat}</p>
              </div>
            ) : null}

            {/* Reset-view affordance — orbit can wander; snap back to the frame. */}
            <button
              type="button"
              onClick={resetView}
              className="pointer-events-auto absolute right-4 bottom-24 rounded border border-border bg-panel/80 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted transition-colors hover:text-fg md:bottom-6"
            >
              重置視角
            </button>

            {/* Sample badge — honesty convention while the procedural set ships. */}
            {data.sample ? (
              <div className="absolute right-4 top-4 rounded bg-panel/90 px-2 py-1 font-mono text-[10px] text-warning">
                示意資料 · 程式合成,不是 TRELLIS 生成
              </div>
            ) : null}

            {/* Degraded-load notice — an object failed to stream; canvas stays. */}
            {loadError ? (
              <div className="absolute left-44 top-16 rounded bg-panel/90 px-2 py-1 font-mono text-[10px] text-warning">
                有物件檔案載入失敗,換一句話或重新整理可重試
              </div>
            ) : null}

            {/* Controls hint + credit — quiet micro-labels, bottom-right. */}
            <div className="pointer-events-none absolute bottom-14 right-4 hidden flex-col items-end gap-1 md:flex">
              <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
                拖曳 繞著轉 · 滾輪 拉遠拉近
              </p>
              <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
                Microsoft TRELLIS · 文字生 3D · MIT
              </p>
            </div>
          </>
        )}
      </div>
    </StationLayout>
  );
}
