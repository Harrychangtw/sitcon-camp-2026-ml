/**
 * RL PLAYGROUND — station 07 of Course 2 ("Critter Arena").
 *
 * The demo beat for Course 3's RL segment: an agent that learned to forage
 * gems and dodge lava FROM A REWARD SIGNAL ALONE — and, via SELF-PLAY against
 * frozen copies of itself (à la OpenAI's hide-and-seek), to CONTEST whoever
 * shares its arena. Its obs carries an egocentric opponent block; in race
 * mode that opponent is YOU. The spine is "can you beat the bot?" (race it
 * with the arrow keys), and three walls hang off it:
 *
 *   1. 從零學會 — scrub the checkpoint slider from random flailing to the
 *      measured-strongest checkpoint (ladder ordered by head-to-head strength).
 *   2. 獎勵駭客 — swap the reward recipe; the agent optimises the PROXY, not
 *      the intent (couch-camps, orbits gems without eating, spins).
 *   3. 戳戳看 — perturb the world / blindfold (gems, lava, or the OPPONENT)
 *      or handcuff a FIXED policy.
 *
 * Golden rule intact: PPO training happened offline (`camp-precompute
 * train-rl`); the browser loads small JSON weights and runs the env + a tiny
 * MLP forward pass live (policy.ts). env.ts is parity-locked to the Python
 * reference env, so playback IS the training distribution.
 */
import { useEffect, useMemo, useState } from "react";
import {
  BlockButtons,
  BlockSlider,
  BlockToggle,
  DockControls,
  LoadingTimer,
  StationLayout,
} from "@camp/ui";
import { LossCurve } from "@camp/viz";
import { loadJSON } from "@camp/data";
import { ArenaCanvas } from "./rl/ArenaCanvas";
import { useArena, type Mode } from "./rl/useArena";
import type { Handicap } from "./rl/policy";
import type { PoliciesArtifact, RecipeId } from "./rl/types";

const DATA_URL = "/data/course2/rl-playground/policies.json";

const RECIPE_SEGMENTS: { label: string; value: RecipeId }[] = [
  { label: "覓食", value: "forager" },
  { label: "沙發", value: "couch_potato" },
  { label: "磁鐵", value: "magnetized" },
  { label: "飆速", value: "speedster" },
];

const HANDICAP_SEGMENTS: { label: string; value: Handicap }[] = [
  { label: "無", value: "none" },
  { label: "遮寶石", value: "blind_gems" },
  { label: "遮岩漿", value: "blind_lava" },
  { label: "遮對手", value: "blind_opponent" },
  { label: "禁左", value: "no_left" },
  { label: "禁上", value: "no_up" },
];

const HANDICAP_HINTS: Record<Exclude<Handicap, "none">, string> = {
  blind_gems: "寶石的感官被歸零——牠不是「忘了」寶石,是「感覺不到」了。",
  blind_lava: "牠看不到岩漿了。注意牠會一頭栽進去:知識不在腦裡,在感官裡。",
  blind_opponent:
    "對手從牠的感官裡消失了。去比賽模式試試:不管你怎麼貼著牠搶,牠的路線都不再理你。",
  no_left: "「往左」被沒收。看牠怎麼用剩下的動作繞路。",
  no_up: "「往上」被沒收。有些寶石突然變得好遠。",
};

export function RlPlaygroundStation() {
  // 1. STATE
  const [data, setData] = useState<PoliciesArtifact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("race");
  const [recipeId, setRecipeId] = useState<RecipeId>("forager");
  const [ckIndex, setCkIndex] = useState(2); // race opens mid-ladder: beatable
  const [handicap, setHandicap] = useState<Handicap>("none");

  // 2. LOAD PRECOMPUTED DATA — via @camp/data inside an effect.
  useEffect(() => {
    let alive = true;
    loadJSON<PoliciesArtifact>(DATA_URL)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  // 3. DERIVED — current recipe / checkpoint / weights.
  const recipe = useMemo(
    () => data?.recipes.find((r) => r.id === recipeId) ?? null,
    [data, recipeId],
  );
  const maxCk = Math.max((recipe?.checkpoints.length ?? 1) - 1, 0);
  const ck = recipe?.checkpoints[Math.min(ckIndex, maxCk)] ?? null;

  const arena = useArena({
    spec: data?.env ?? null,
    weights: ck?.weights ?? null,
    recipeId,
    mode,
    handicap,
  });

  // Return-curve replay cursor: the last curve point at or before the
  // selected checkpoint's milestone.
  const curveUpTo = useMemo(() => {
    if (!recipe || !ck) return 0;
    let i = 0;
    for (let k = 0; k < recipe.curveSteps.length; k++) {
      if (recipe.curveSteps[k]! <= ck.target) i = k;
    }
    return ck.target === 0 ? 0 : i;
  }, [recipe, ck]);

  const { hud } = arena;
  const racing = hud.phase === "countdown" || hud.phase === "running";

  return (
    <StationLayout
      title="RL 競技場"
      subtitle="沒有人寫規則,只有獎勵。牠自己學會玩——然後你會發現它學的不一定是你想的。"
      fullBleed
      controls={
        <>
          <DockControls>
            <BlockToggle<Mode>
              label="模式"
              info="觀察:看 AI 自己玩、隨便惡搞牠。比賽:你下場跟牠搶寶石。"
              value={mode}
              onChange={setMode}
              options={[
                { label: "比賽", value: "race" },
                { label: "觀察", value: "sandbox" },
              ]}
            />
            <BlockToggle<RecipeId>
              label="獎勵配方"
              info="訓練時 AI 追求的獎勵怎麼算。換一個配方,看它「認真地」學出什麼怪招——你獎勵什麼,就得到什麼。"
              value={recipeId}
              onChange={(id) => {
                setRecipeId(id);
                setCkIndex((i) => {
                  const r = data?.recipes.find((x) => x.id === id);
                  return Math.min(i, Math.max((r?.checkpoints.length ?? 1) - 1, 0));
                });
              }}
              options={RECIPE_SEGMENTS}
            />
            <BlockSlider
              label="訓練進度"
              info="同一隻 AI 在訓練不同階段的「腦」。0 = 還沒訓練(亂動);最右邊是「實測最會搶」的版本,試試打得贏嗎。"
              min={0}
              max={maxCk}
              step={1}
              value={Math.min(ckIndex, maxCk)}
              onChange={setCkIndex}
              disabled={!recipe || maxCk === 0}
              format={(v) => recipe?.checkpoints[v]?.label ?? String(v)}
            />
          </DockControls>
          <DockControls>
            <BlockToggle<Handicap>
              label="干擾"
              info="對「同一個」訓練好的腦動手腳:遮住某種感官、沒收某個動作——不重新訓練。牠只知道它感覺得到的事。"
              value={handicap}
              onChange={setHandicap}
              options={HANDICAP_SEGMENTS}
            />
            <BlockButtons
              label="世界"
              buttons={[
                { label: "+寶石", onClick: arena.addGem, disabled: hud.nGems >= arena.gemCap },
                { label: "+岩漿", onClick: arena.addLava, disabled: hud.nLava >= arena.lavaCap },
                { label: "換地圖", onClick: arena.changeMap, disabled: racing },
              ]}
            />
            {mode === "race" ? (
              <BlockButtons
                label="比賽"
                buttons={[
                  {
                    label: hud.phase === "finished" ? "再來一次" : "開始(空白鍵)",
                    onClick: arena.startRace,
                    disabled: racing,
                    primary: !racing,
                  },
                ]}
              />
            ) : null}
          </DockControls>
        </>
      }
      takeaway={
        <span>
          AI 的行為不是寫出來的,是被<strong>獎勵</strong>「長」出來的。獎勵寫歪一點,
          牠就認真地學會歪掉的事(reward hacking)。讓牠跟自己的分身對打(self-play),
          牠會自己學著把對手納入感官。而且牠只知道感官裡有的世界——
          遮住眼睛,知識就不存在。
        </span>
      }
    >
      <div className="relative h-full w-full">
        {error ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-md text-center text-sm text-warning">
              無法載入 policies({error})。請先執行{" "}
              <code className="font-mono">uv run camp-precompute train-rl</code> 再{" "}
              <code className="font-mono">rl-export</code>。
            </p>
          </div>
        ) : !data || !ck ? (
          <div className="flex h-full items-center justify-center">
            <LoadingTimer label="載入 policy 中" />
          </div>
        ) : (
          <>
            <ArenaCanvas
              draw={arena.draw}
              onPointerDown={arena.onPointerDown}
              onPointerMove={arena.onPointerMove}
              onPointerUp={arena.onPointerUp}
              cursor={arena.cursor}
            />

            {/* Top-center: race scoreboard / result. */}
            {mode === "race" ? (
              <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
                <div className="flex items-center gap-4 rounded-md border border-border bg-panel/90 px-4 py-2 font-mono text-sm shadow-md">
                  <span className="text-accent2">你 {hud.humanGems}</span>
                  <span className="text-muted">:</span>
                  <span className="text-fg">AI {hud.agentGems}</span>
                  <span className="w-px self-stretch bg-border" />
                  <span className="tabular-nums text-muted">
                    {hud.phase === "running" ? `${hud.timeLeft.toFixed(1)}s` : "30.0s"}
                  </span>
                </div>
              </div>
            ) : null}

            {/* Center overlays: pre-race hint / countdown / result. */}
            {mode === "race" && hud.phase === "idle" ? (
              <CenterCard>
                <p className="text-base font-semibold">
                  30 秒內,比 AI 吃到更多寶石!
                </p>
                <p className="mt-1 text-sm text-muted">
                  方向鍵 / WASD 移動,小心岩漿。按「開始」或空白鍵。
                </p>
                <p className="mt-1.5 max-w-sm text-xs text-muted/80">
                  牠感覺得到你的位置和速度,而且是跟自己的分身對打(self-play)
                  練出來的:搶寶石的本事沒有人教,是自己長出來的。
                </p>
              </CenterCard>
            ) : null}
            {mode === "race" && hud.phase === "countdown" ? (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                <span className="font-mono text-7xl font-bold text-accent">
                  {hud.countdown}
                </span>
              </div>
            ) : null}
            {mode === "race" && hud.phase === "finished" ? (
              <CenterCard>
                <p className="text-lg font-semibold">
                  {hud.winner === "human"
                    ? "你贏了!🎉"
                    : hud.winner === "agent"
                      ? "AI 贏了!"
                      : "平手!"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {hud.winner === "human"
                    ? "把「訓練進度」拉到最右邊,再試一次?"
                    : "沒有人教過它怎麼搶:它靠 self-play 跟自己的分身練出來的。調低訓練進度雪恥一下?"}
                </p>
              </CenterCard>
            ) : null}

            {/* Top-right: recipe card + training curve (sandbox). */}
            {mode === "sandbox" && recipe ? (
              <div className="pointer-events-none absolute right-4 top-4 z-20 w-72 rounded-md border border-border bg-panel/90 p-3 shadow-md">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-sm font-semibold text-accent">
                    {recipe.label}
                  </span>
                  <span className={`text-[10px] ${recipe.isGood ? "text-muted" : "text-warning"}`}>
                    {recipe.isGood ? "本來想要的配方" : "寫歪的配方"}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  獎勵:{recipe.rewardDesc}
                </p>
                {recipe.selfPlay ? (
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    訓練:self-play,跟「過去版本的自己」在同一張地圖搶寶石。
                    拖訓練進度,可以看到新招一層層長出來。
                  </p>
                ) : null}
                <div className="mt-2">
                  <LossCurve
                    series={[{ label: "每局平均獎勵", values: recipe.returnCurve }]}
                    xs={recipe.curveSteps}
                    xLabel="訓練步數"
                    height={110}
                    upTo={curveUpTo}
                  />
                </div>
                <div className="mt-1.5 flex gap-3 font-mono text-[11px] text-muted">
                  <span>
                    本階段評測:得分 <span className="text-fg">{ck.returnMean}</span>
                  </span>
                  <span>
                    寶石/局 <span className="text-fg">{ck.gemsMean}</span>
                  </span>
                  {ck.vsPanelMargin !== undefined ? (
                    <span>
                      對戰{" "}
                      <span className="text-fg">
                        {ck.vsPanelMargin > 0 ? "+" : ""}
                        {ck.vsPanelMargin}
                      </span>
                    </span>
                  ) : null}
                </div>
                <div className="mt-1.5 border-t border-border/50 pt-1.5 font-mono text-[11px] text-muted">
                  現在:寶石 <span className="text-accent">{hud.agentGems}</span>
                  {" · "}累積獎勵{" "}
                  <span className="text-fg">{hud.agentReward.toFixed(2)}</span>
                  {" · "}
                  {Math.floor(hud.elapsedSec)}s
                </div>
                {handicap !== "none" ? (
                  <p className="mt-1.5 border-t border-border/50 pt-1.5 text-[11px] leading-relaxed text-warning">
                    {HANDICAP_HINTS[handicap]}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Bottom-left: quiet interaction hint (sandbox). */}
            {mode === "sandbox" ? (
              <p className="pointer-events-none absolute bottom-28 left-4 z-20 text-[11px] text-muted/80">
                直接拖曳寶石和岩漿——牠沒背地圖,只感覺得到「最近的」寶石跟岩漿在哪。
              </p>
            ) : null}
          </>
        )}
      </div>
    </StationLayout>
  );
}

function CenterCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="rounded-lg border border-border bg-panel/95 px-6 py-4 text-center shadow-lg">
        {children}
      </div>
    </div>
  );
}
