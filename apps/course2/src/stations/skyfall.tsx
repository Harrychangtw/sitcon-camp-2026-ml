/**
 * SKYFALL — Course 3 panorama station 4: 衛星長出城市.
 *
 * The reveal: Skyfall-GS 把多視角「衛星照片」重建成一整個可以飛進去的 3D
 * Gaussian Splatting 街區。從高空看一切正常，因為衛星真的拍過；飛到街上，
 * 牆面和路面的細節卻是 diffusion model 想像出來的，衛星從沒拍過那個角度。
 * 這一站的一顆旋鈕就是「補完前 / 補完後」A/B 切換：鏡頭不動，同一個視角，
 * 看資料給了什麼、模型又補了什麼。模型幻覺，在這裡是空間性的、看得到的。
 *
 * The browser only RENDERS splats (sorting + drawing = playback, the golden
 * rule holds). The scenes are the authors' published fused PLYs, pruned +
 * converted offline by `camp-precompute skyfall` into small .splat files.
 * No live server route — scene generation takes hours, so this station is
 * fully static and works with the backend off (panorama rule 6 is N/A).
 * 補完前 (Stage-1-only) variants need a GPU run → the runbook
 * (prompts/server-runs/skyfall-precompute.md); until then those scenes show
 * the toggle disabled with the reason, never a fake stand-in.
 */
import { useEffect, useMemo, useState } from "react";
import {
  BlockButtons,
  BlockToggle,
  DockControls,
  GuidedTour,
  LoadingTimer,
  StationLayout,
} from "@camp/ui";
import { SplatViewer, type SplatPose } from "@camp/viz";
import { loadJSON } from "@camp/data";

interface SceneVariant {
  path: string;
  bytes: number;
  splats: number;
}

interface ScenePoseMeta extends SplatPose {
  id: string;
  label: string;
}

interface SkyfallSceneMeta {
  id: string;
  label: string;
  note: string;
  sample: boolean;
  groundZ: number;
  diag: number;
  bounds: [[number, number, number], [number, number, number]];
  poses: ScenePoseMeta[];
  initialPose: string;
  variants: { after?: SceneVariant; before?: SceneVariant };
}

interface SkyfallScenes {
  up: [number, number, number];
  scenes: SkyfallSceneMeta[];
}

type Variant = "before" | "after";

const SCENES_URL = "/data/course2/skyfall/scenes.json";
const DATA_ROOT = "/data/course2";

/** Below this fraction of the block diagonal counts as 街景 height — where
 * the imagined-detail beat lands. */
const LOW_ALTITUDE_FRAC = 0.12;

const wan = (n: number) => `${Math.round(n / 10_000)} 萬`;
const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

export function SkyfallStation() {
  // 1. STATE — everything the canvas needs is plain component state.
  const [data, setData] = useState<SkyfallScenes | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sceneId, setSceneId] = useState<string | null>(null);
  const [variant, setVariant] = useState<Variant>("after");
  // Fresh object per click → SplatViewer re-fires the same viewpoint.
  const [jump, setJump] = useState<SplatPose | null>(null);
  // firstReady: this scene has painted once (full-canvas loader until then).
  // switching: an A/B flip is still streaming its variant in.
  const [firstReady, setFirstReady] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lowAltitude, setLowAltitude] = useState(false);

  // 2. LOAD THE SCENE CATALOG — poses, bounds, and variant files per scene.
  useEffect(() => {
    let alive = true;
    loadJSON<SkyfallScenes>(SCENES_URL)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setSceneId(d.scenes[0]?.id ?? null);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const scene = data?.scenes.find((s) => s.id === sceneId) ?? null;
  const hasBefore = !!scene?.variants.before;
  const activeVariant: Variant = hasBefore ? variant : "after";
  const variantMeta = scene?.variants[activeVariant] ?? null;

  const src = variantMeta ? `${DATA_ROOT}/${variantMeta.path}` : null;
  // Keep BOTH variants loaded so the A/B flip is instant and the camera
  // never moves — the whole point of the comparison.
  const keepLoaded = useMemo(() => {
    if (!scene) return [];
    return (["after", "before"] as const)
      .map((v) => scene.variants[v])
      .filter((v): v is SceneVariant => !!v)
      .map((v) => `${DATA_ROOT}/${v.path}`);
  }, [scene]);

  const initialPose = useMemo<SplatPose | null>(() => {
    if (!scene) return null;
    const p =
      scene.poses.find((x) => x.id === scene.initialPose) ?? scene.poses[0];
    return p ? { position: p.position, lookAt: p.lookAt } : null;
  }, [scene]);

  const pickScene = (id: string) => {
    setSceneId(id);
    setVariant("after");
    setJump(null);
    setFirstReady(false);
    setSwitching(false);
    setProgress(0);
    setLowAltitude(false);
  };

  const pickVariant = (v: Variant) => {
    if (v === variant) return;
    setVariant(v);
    setSwitching(true); // cleared by onReady (same frame when preloaded)
  };

  // 3. THE HONESTY READOUT — the copy that IS the takeaway, keyed on what the
  //    student is looking at right now.
  const readout = !firstReady
    ? null
    : activeVariant === "before"
      ? {
          tag: "補完前",
          text: "這是只用衛星照片能重建的樣子。幾何大致還在，近看就融化了。",
        }
      : lowAltitude
        ? {
            tag: "補完後 · 街景",
            text: "這些牆面和路面的細節是 diffusion model 想像出來的。衛星沒拍過這個角度。",
          }
        : {
            tag: "補完後",
            text: "這個高度衛星拍得到。飛低一點，到街上看看細節是哪來的。",
          };

  return (
    <StationLayout
      title="衛星長出城市"
      subtitle="從衛星照片長出一座能飛進去的城市。"
      fullBleed
      controls={
        <DockControls>
          <BlockToggle
            label="場景"
            gloss="用 Gaussian Splatting 拼出的 3D 街區"
            info="每個場景是 Skyfall-GS 從多張衛星照片重建出來的 3D 場景，由幾十萬個彩色小橢圓（Gaussian Splatting）拼成。瀏覽器只負責把算好的場景畫出來，重建本身在 GPU 上事先完成。"
            value={sceneId ?? ""}
            onChange={pickScene}
            options={(data?.scenes ?? []).map((s) => ({
              label: s.label,
              value: s.id,
            }))}
          />
          <BlockToggle
            label="補完"
            gloss={
              hasBefore
                ? "同一個視角，比較模型補完前後"
                : "這個場景的補完前版本還沒烘焙（見 runbook）"
            }
            info="補完前是「只用衛星照片」訓練出來的重建：由上往下看還行，街景高度就糊成一團，因為衛星從沒在街上拍過。補完後是 diffusion model 把低空該有的細節想像出來、再重新訓練的版本。切換時鏡頭完全不動，方便比較同一個視角。"
            value={activeVariant}
            onChange={(v) => pickVariant(v as Variant)}
            disabled={!hasBefore}
            options={[
              { label: "補完前", value: "before" },
              { label: "補完後", value: "after" },
            ]}
          />
          <BlockButtons
            label="視角"
            buttons={[
              ...(scene?.poses ?? []).map((p) => ({
                label: p.label,
                onClick: () =>
                  setJump({ position: p.position, lookAt: p.lookAt }),
              })),
              {
                label: "重置",
                onClick: () => initialPose && setJump({ ...initialPose }),
              },
            ]}
          />
        </DockControls>
      }
      takeaway={
        <span>
          衛星照片只給了這座城市的幾何大形狀。街景高度的細節是 diffusion model
          想像出來補上的：資料給你幾何，生成模型幫你想像細節。看起來越真實，
          越要記得問一句：這是拍到的，還是補完的？
        </span>
      }
    >
      <div className="relative h-full w-full">
        <GuidedTour
          storageKey="camp-tour-skyfall"
          steps={[
            {
              title: "這是從衛星照片長出的城市",
              body: "你看到的整個街區，是用幾十萬個彩色小橢圓（Gaussian Splatting）拼出來的 3D 場景，原料只有衛星照片。",
            },
            {
              title: "飛進去",
              body: "用滑鼠拖曳轉頭，WASD 或方向鍵移動，滾輪控制高度，想去哪就在那個點上雙擊，鏡頭會飛過去。按下方的「街景視角」可以直接降到街上。",
            },
            {
              title: "切到補完前",
              body: "下方的「補完前 / 補完後」是這一站的重點。補完前是只用衛星照片重建的樣子，切換時鏡頭不會動，同一個視角直接比。",
            },
            {
              title: "差在哪裡？",
              body: "街上那些牆面、窗戶、路面的細節，衛星根本沒拍過，是 diffusion model 想像出來的。生成模型會「補完」它沒看過的東西，這是它的本事，也是它的風險。",
            },
          ]}
        />
        {error ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-md text-center text-sm text-warning">
              無法載入場景資料（{error}）。請執行{" "}
              <code className="font-mono">uv run camp-precompute skyfall-sample</code>。
            </p>
          </div>
        ) : !data || !scene || !src || !initialPose ? (
          <div className="flex h-full items-center justify-center">
            <LoadingTimer label="載入場景目錄中" />
          </div>
        ) : (
          <>
            <SplatViewer
              key={scene.id}
              src={src}
              keepLoaded={keepLoaded}
              controls="fly"
              up={data.up}
              initialPose={initialPose}
              jumpTo={jump}
              bounds={scene.bounds}
              doubleClickFly={{
                planeHeight: scene.groundZ,
                eyeHeight: 0.012 * scene.diag,
              }}
              fill
              onProgress={setProgress}
              onReady={() => {
                setFirstReady(true);
                setSwitching(false);
              }}
              onError={(e) => setError(e.message)}
              onPoseChange={({ position }) =>
                setLowAltitude(
                  position[2] - scene.groundZ < LOW_ALTITUDE_FRAC * scene.diag,
                )
              }
            />

            {/* FIRST LOAD — these are 10-20 MB files; count the wait. */}
            {!firstReady ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
                <LoadingTimer
                  label={`載入 ${scene.label} 中 ${Math.round(progress * 100)}%`}
                />
                <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
                  {variantMeta
                    ? `${wan(variantMeta.splats)} 個 gaussians · ${mb(variantMeta.bytes)}`
                    : ""}
                </p>
              </div>
            ) : null}

            {/* A/B swap still streaming (only before both variants are warm). */}
            {firstReady && switching ? (
              <div className="absolute right-4 top-16 rounded bg-panel/90 px-2 py-1 font-mono text-[10px] text-muted">
                切換中 {Math.round(progress * 100)}%
              </div>
            ) : null}

            {/* THE HONESTY READOUT — what you're seeing, and where it came from. */}
            {readout ? (
              <div className="pointer-events-none absolute bottom-28 left-4 max-w-xs rounded-md border border-border bg-panel/85 px-3 py-2 backdrop-blur-sm md:bottom-6">
                <p
                  className={`font-mono text-[10px] uppercase tracking-wide ${
                    activeVariant === "after" && lowAltitude
                      ? "text-accent"
                      : "text-muted"
                  }`}
                >
                  {readout.tag}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-fg">
                  {readout.text}
                </p>
              </div>
            ) : null}

            {/* Sample badge — honesty convention for the procedural scene. */}
            {scene.sample ? (
              <div className="absolute right-4 top-4 rounded bg-panel/90 px-2 py-1 font-mono text-[10px] text-warning">
                示意資料 · 程式合成，不是衛星重建
              </div>
            ) : null}

            {/* Controls hint — quiet micro-label, canvas bottom-right. */}
            <p className="pointer-events-none absolute bottom-28 right-4 hidden font-mono text-[10px] uppercase tracking-wide text-muted md:bottom-6 md:block">
              拖曳 看四周 · WASD 移動 · 滾輪 升降 · 雙擊 飛過去
            </p>
          </>
        )}
      </div>
    </StationLayout>
  );
}
