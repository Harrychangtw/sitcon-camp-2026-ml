/**
 * The arena's game loop + interaction state. Owns the MUTABLE simulation in
 * refs (React state would re-render 30×/s); the canvas rAF drives it via the
 * returned `draw` (fixed-Δt accumulator → env steps at exactly 30 Hz, matching
 * training), and a slow ticker snapshots a small HUD object into React state.
 *
 * The agent plays LIVE: every sim step builds the observation, runs the tiny
 * MLP forward pass, and feeds argmax back into the same env the policies were
 * trained on (see env.ts's parity contract). The human critter shares the
 * world — same physics, same gems — driven by arrow keys / WASD.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mix, readThemeColors, rgbCss, type ThemeColors } from "@camp/viz";
import {
  CRITTER_R,
  DT,
  GEM_R,
  HORIZON,
  LAVA_R,
  Mulberry32,
  buildObs,
  envStep,
  makeCritterAt,
  makeWorld,
  sampleGemPos,
  stepCritter,
  type Critter,
  type WorldState,
} from "./env";
import { policyAction, type Handicap } from "./policy";
import type { ArenaPointerEvent, ArenaRect, DrawFn } from "./ArenaCanvas";
import type { EnvSpecArtifact, PolicyWeights, RecipeId } from "./types";

export type Mode = "sandbox" | "race";
export type RacePhase = "idle" | "countdown" | "running" | "finished";
export type Winner = "human" | "agent" | "tie" | null;

export interface ArenaHud {
  ready: boolean;
  phase: RacePhase;
  /** Whole seconds left in the pre-race countdown. */
  countdown: number;
  /** Seconds left in the race. */
  timeLeft: number;
  winner: Winner;
  agentGems: number;
  humanGems: number;
  /** Cumulative recipe reward since the last stats reset (sandbox). */
  agentReward: number;
  /** Seconds since the last stats reset (sandbox). */
  elapsedSec: number;
  nGems: number;
  nLava: number;
}

export interface UseArenaOptions {
  spec: EnvSpecArtifact | null;
  weights: PolicyWeights | null;
  recipeId: RecipeId;
  mode: Mode;
  handicap: Handicap;
}

const COUNTDOWN_STEPS = 90; // 3 s
const GEM_CAP = 8;
const LAVA_CAP = 5;
const TRAIL_LEN = 100;
const FLASH_STEPS = 12;

const KEY_ACTIONS: Record<string, number> = {
  ArrowUp: 1, ArrowDown: 2, ArrowLeft: 3, ArrowRight: 4,
  w: 1, s: 2, a: 3, d: 4, W: 1, S: 2, A: 3, D: 4,
};

interface Sim {
  world: WorldState;
  agent: Critter;
  human: Critter | null;
  agentGems: number;
  humanGems: number;
  agentReward: number;
  statSteps: number;
  phase: RacePhase;
  phaseSteps: number;
  winner: Winner;
  agentFlash: number;
  humanFlash: number;
  /** Recent agent positions (flat x,y pairs) — makes orbits/spins visible. */
  trail: number[];
  lastMs: number | null;
  acc: number;
}

const EMPTY_HUD: ArenaHud = {
  ready: false, phase: "idle", countdown: 0, timeLeft: 0, winner: null,
  agentGems: 0, humanGems: 0, agentReward: 0, elapsedSec: 0, nGems: 0, nLava: 0,
};

export function useArena({ spec, weights, recipeId, mode, handicap }: UseArenaOptions) {
  const sim = useRef<Sim | null>(null);
  const weightsRef = useRef<PolicyWeights | null>(weights);
  const recipeRef = useRef<RecipeId>(recipeId);
  const handicapRef = useRef<Handicap>(handicap);
  const modeRef = useRef<Mode>(mode);
  const keysRef = useRef<string[]>([]);
  const dragRef = useRef<{ kind: "gem" | "lava"; index: number } | null>(null);
  const [cursor, setCursor] = useState("default");
  const [hud, setHud] = useState<ArenaHud>(EMPTY_HUD);
  const theme = useMemo<ThemeColors>(() => readThemeColors(), []);

  const resetStats = useCallback(() => {
    const s = sim.current;
    if (!s) return;
    s.agentGems = 0;
    s.humanGems = 0;
    s.agentReward = 0;
    s.statSteps = 0;
    s.trail.length = 0;
  }, []);

  const initWorld = useCallback(
    (randomLayout: boolean) => {
      if (!spec) return;
      // Fresh seed per (re)init: playback needs no reproducibility, and variety
      // sells the "it generalises to maps it never saw" beat.
      const rng = new Mulberry32(Math.floor(Math.random() * 4294967296));
      let world: WorldState;
      let agent: Critter;
      let human: Critter | null = null;
      if (randomLayout) {
        world = makeWorld(rng, spec.nGems, spec.nLava);
        agent = makeCritterAt(world, 0.5, 0.5);
        // Nudge the agent off lava if the random layout landed on it.
        for (let i = 0; i < 20 && !clearOfLava(world, agent.x, agent.y); i++) {
          agent.x = 0.1 + rng.next() * 0.8;
          agent.y = 0.1 + rng.next() * 0.8;
        }
      } else {
        const L = spec.defaultLayout;
        world = {
          gems: L.gems.map((g) => [g[0]!, g[1]!]),
          lavas: L.lava.map((l) => [l[0]!, l[1]!]),
          rng,
        };
        agent = makeCritterAt(world, L.agent[0]!, L.agent[1]!);
      }
      if (modeRef.current === "race") {
        const H = spec.defaultLayout.human;
        human = makeCritterAt(world, H[0]!, H[1]!);
      }
      sim.current = {
        world, agent, human,
        agentGems: 0, humanGems: 0, agentReward: 0, statSteps: 0,
        phase: "idle", phaseSteps: 0, winner: null,
        agentFlash: 0, humanFlash: 0,
        trail: [], lastMs: null, acc: 0,
      };
    },
    [spec],
  );

  // Prop mirrors → refs (the loop reads refs, never stale closures).
  useEffect(() => {
    weightsRef.current = weights;
  }, [weights]);
  useEffect(() => {
    modeRef.current = mode;
    initWorld(false);
  }, [mode, initWorld]);
  useEffect(() => {
    recipeRef.current = recipeId;
    handicapRef.current = handicap;
    resetStats();
  }, [recipeId, handicap, weights, resetStats]);

  // Keyboard: last-pressed-wins direction stack. Space starts/restarts a race.
  const startRaceRef = useRef<() => void>(() => {});
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === " " && modeRef.current === "race") {
        const phase = sim.current?.phase;
        if (phase === "idle" || phase === "finished") {
          e.preventDefault();
          startRaceRef.current();
        }
        return;
      }
      // Movement keys only matter in race mode; leaving them alone elsewhere
      // keeps arrow-key access to the dock sliders working.
      if (modeRef.current !== "race" || !(e.key in KEY_ACTIONS)) return;
      e.preventDefault();
      const keys = keysRef.current;
      if (!keys.includes(e.key)) keys.push(e.key);
    };
    const up = (e: KeyboardEvent) => {
      const keys = keysRef.current;
      const i = keys.indexOf(e.key);
      if (i >= 0) keys.splice(i, 1);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // --- simulation -------------------------------------------------------------

  const stepAgent = useCallback((s: Sim) => {
    const w = weightsRef.current;
    const action = w
      ? policyAction(w, buildObs(s.world, s.agent), handicapRef.current)
      : 0;
    const { reward, events } = envStep(s.world, s.agent, action, recipeRef.current);
    s.agentReward += reward;
    s.agentGems += events.ate;
    s.statSteps += 1;
    if (events.lavaEnter) s.agentFlash = FLASH_STEPS;
    s.trail.push(s.agent.x, s.agent.y);
    if (s.trail.length > TRAIL_LEN * 2) s.trail.splice(0, s.trail.length - TRAIL_LEN * 2);
  }, []);

  const stepOnce = useCallback(
    (s: Sim) => {
      if (s.agentFlash > 0) s.agentFlash -= 1;
      if (s.humanFlash > 0) s.humanFlash -= 1;

      if (modeRef.current === "sandbox") {
        stepAgent(s);
        return;
      }
      if (s.phase === "countdown") {
        s.phaseSteps -= 1;
        if (s.phaseSteps <= 0) {
          s.phase = "running";
          s.phaseSteps = HORIZON;
        }
        return;
      }
      if (s.phase !== "running") return;

      stepAgent(s);
      if (s.human) {
        const lastKey = keysRef.current[keysRef.current.length - 1];
        const action = lastKey !== undefined ? KEY_ACTIONS[lastKey]! : 0;
        const events = stepCritter(s.world, s.human, action);
        s.humanGems += events.ate;
        if (events.lavaEnter) s.humanFlash = FLASH_STEPS;
      }
      s.phaseSteps -= 1;
      if (s.phaseSteps <= 0) {
        s.phase = "finished";
        s.winner =
          s.humanGems > s.agentGems
            ? "human"
            : s.agentGems > s.humanGems
              ? "agent"
              : "tie";
      }
    },
    [stepAgent],
  );

  const advance = useCallback(
    (nowMs: number) => {
      const s = sim.current;
      if (!s) return;
      if (s.lastMs === null) s.lastMs = nowMs;
      // Cap the debt so a background tab doesn't fast-forward on return.
      s.acc = Math.min(s.acc + (nowMs - s.lastMs) / 1000, DT * 6);
      s.lastMs = nowMs;
      while (s.acc >= DT) {
        stepOnce(s);
        s.acc -= DT;
      }
    },
    [stepOnce],
  );

  // --- public actions -----------------------------------------------------------

  const startRace = useCallback(() => {
    initWorld(false);
    const s = sim.current;
    if (!s) return;
    s.phase = "countdown";
    s.phaseSteps = COUNTDOWN_STEPS;
  }, [initWorld]);
  startRaceRef.current = startRace;

  const changeMap = useCallback(() => {
    initWorld(true);
  }, [initWorld]);

  const addGem = useCallback(() => {
    const s = sim.current;
    if (!s || s.world.gems.length >= GEM_CAP) return;
    s.world.gems.push(sampleGemPos(s.world, s.agent.x, s.agent.y));
  }, []);

  const addLava = useCallback(() => {
    const s = sim.current;
    if (!s || s.world.lavas.length >= LAVA_CAP) return;
    // Sample away from both critters so a new hazard never insta-hits.
    for (let i = 0; i < 40; i++) {
      const x = 0.15 + s.world.rng.next() * 0.7;
      const y = 0.15 + s.world.rng.next() * 0.7;
      const dxa = x - s.agent.x;
      const dya = y - s.agent.y;
      if (dxa * dxa + dya * dya < 0.06) continue;
      s.world.lavas.push([x, y]);
      return;
    }
  }, []);

  // --- pointer: drag gems/lava around (sandbox only) ---------------------------

  const hitTest = useCallback((p: ArenaPointerEvent) => {
    const s = sim.current;
    if (!s) return null;
    for (let i = 0; i < s.world.gems.length; i++) {
      const g = s.world.gems[i]!;
      const dx = p.x - g[0]!;
      const dy = p.y - g[1]!;
      if (dx * dx + dy * dy < (GEM_R * 2.4) ** 2) return { kind: "gem" as const, index: i };
    }
    for (let i = 0; i < s.world.lavas.length; i++) {
      const l = s.world.lavas[i]!;
      const dx = p.x - l[0]!;
      const dy = p.y - l[1]!;
      if (dx * dx + dy * dy < (LAVA_R * 1.15) ** 2) return { kind: "lava" as const, index: i };
    }
    return null;
  }, []);

  const onPointerDown = useCallback(
    (p: ArenaPointerEvent) => {
      if (modeRef.current !== "sandbox") return;
      dragRef.current = hitTest(p);
      if (dragRef.current) setCursor("grabbing");
    },
    [hitTest],
  );

  const onPointerMove = useCallback(
    (p: ArenaPointerEvent) => {
      const s = sim.current;
      if (!s) return;
      const drag = dragRef.current;
      if (drag) {
        const x = Math.min(Math.max(p.x, 0.02), 0.98);
        const y = Math.min(Math.max(p.y, 0.02), 0.98);
        const target = drag.kind === "gem" ? s.world.gems[drag.index] : s.world.lavas[drag.index];
        if (target) {
          target[0] = x;
          target[1] = y;
        }
        return;
      }
      if (modeRef.current !== "sandbox") return;
      setCursor(hitTest(p) ? "grab" : "default");
    },
    [hitTest],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    setCursor("default");
  }, []);

  // --- HUD ticker ---------------------------------------------------------------

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = sim.current;
      if (!s) return;
      setHud({
        ready: true,
        phase: s.phase,
        countdown: Math.ceil(s.phaseSteps * DT),
        timeLeft: s.phase === "running" ? s.phaseSteps * DT : HORIZON * DT,
        winner: s.winner,
        agentGems: s.agentGems,
        humanGems: s.humanGems,
        agentReward: s.agentReward,
        elapsedSec: s.statSteps * DT,
        nGems: s.world.gems.length,
        nLava: s.world.lavas.length,
      });
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  // --- drawing --------------------------------------------------------------------

  const draw = useCallback<DrawFn>(
    (ctx, rect, width, height, nowMs) => {
      advance(nowMs);
      ctx.clearRect(0, 0, width, height);
      const s = sim.current;
      if (!s) return;
      drawArena(ctx, rect, s, theme, nowMs, modeRef.current, dragRef.current);
    },
    [advance, theme],
  );

  return {
    hud, cursor, draw,
    onPointerDown, onPointerMove, onPointerUp,
    startRace, changeMap, addGem, addLava,
    gemCap: GEM_CAP, lavaCap: LAVA_CAP,
  };
}

function clearOfLava(world: WorldState, x: number, y: number): boolean {
  for (const l of world.lavas) {
    const dx = x - l[0]!;
    const dy = y - l[1]!;
    if (dx * dx + dy * dy < (LAVA_R + CRITTER_R + 0.05) ** 2) return false;
  }
  return true;
}

// --- canvas rendering (pure function of sim + theme) ----------------------------

function drawArena(
  ctx: CanvasRenderingContext2D,
  rect: ArenaRect,
  s: Sim,
  theme: ThemeColors,
  nowMs: number,
  mode: Mode,
  drag: { kind: "gem" | "lava"; index: number } | null,
) {
  const px = (x: number) => rect.left + x * rect.side;
  const py = (y: number) => rect.top + y * rect.side;
  const scale = rect.side;

  // Arena floor + border.
  ctx.fillStyle = rgbCss(mix(theme.bg, theme.fg, 0.03));
  ctx.strokeStyle = rgbCss(theme.border, 0.7);
  ctx.lineWidth = 1;
  roundRect(ctx, rect.left, rect.top, rect.side, rect.side, 10);
  ctx.fill();
  ctx.stroke();

  // Faint grid to give speed a reference frame.
  ctx.strokeStyle = rgbCss(theme.border, 0.18);
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    line(ctx, px(t), py(0), px(t), py(1));
    line(ctx, px(0), py(t), px(1), py(t));
  }

  // Lava pools (slow pulse so they read as "alive/hot").
  for (let i = 0; i < s.world.lavas.length; i++) {
    const l = s.world.lavas[i]!;
    const pulse = 0.22 + 0.06 * Math.sin(nowMs / 320 + i * 1.7);
    ctx.beginPath();
    ctx.arc(px(l[0]!), py(l[1]!), LAVA_R * scale, 0, Math.PI * 2);
    ctx.fillStyle = rgbCss(theme.accent3, pulse);
    ctx.fill();
    ctx.strokeStyle = rgbCss(theme.accent3, 0.8);
    ctx.lineWidth = drag?.kind === "lava" && drag.index === i ? 2.5 : 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px(l[0]!), py(l[1]!), LAVA_R * 0.45 * scale, 0, Math.PI * 2);
    ctx.fillStyle = rgbCss(theme.accent3, pulse + 0.15);
    ctx.fill();
  }

  // Agent trail — behaviour made visible (orbits, spins, corner camping).
  if (s.trail.length >= 4) {
    ctx.beginPath();
    ctx.moveTo(px(s.trail[0]!), py(s.trail[1]!));
    for (let i = 2; i < s.trail.length; i += 2) {
      ctx.lineTo(px(s.trail[i]!), py(s.trail[i + 1]!));
    }
    ctx.strokeStyle = rgbCss(theme.fg, 0.14);
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  // Gems (gentle bob).
  for (let i = 0; i < s.world.gems.length; i++) {
    const g = s.world.gems[i]!;
    const bob = Math.sin(nowMs / 260 + i * 2.1) * 0.15;
    const r = GEM_R * scale * (1 + bob * 0.15);
    const cx = px(g[0]!);
    const cy = py(g[1]!);
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.75, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.75, cy);
    ctx.closePath();
    ctx.fillStyle = rgbCss(theme.accent, 0.95);
    ctx.fill();
    if (drag?.kind === "gem" && drag.index === i) {
      ctx.strokeStyle = rgbCss(theme.fg, 0.9);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Critters.
  drawCritter(ctx, px, py, scale, s.agent, theme.fg, "AI", s.agentFlash, theme);
  if (s.human && mode === "race") {
    drawCritter(ctx, px, py, scale, s.human, theme.accent2, "你", s.humanFlash, theme);
  }
}

function drawCritter(
  ctx: CanvasRenderingContext2D,
  px: (x: number) => number,
  py: (y: number) => number,
  scale: number,
  c: Critter,
  color: [number, number, number],
  label: string,
  flash: number,
  theme: ThemeColors,
) {
  const cx = px(c.x);
  const cy = py(c.y);
  const r = CRITTER_R * scale;

  // Lava-hit flash ring.
  if (flash > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * (1.4 + (FLASH_STEPS - flash) * 0.12), 0, Math.PI * 2);
    ctx.strokeStyle = rgbCss(theme.accent3, flash / FLASH_STEPS);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = rgbCss(color);
  ctx.fill();

  // Direction "nose" from velocity.
  const speed = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
  if (speed > 0.02) {
    const nx = c.vx / speed;
    const ny = c.vy / speed;
    ctx.beginPath();
    ctx.moveTo(cx + nx * r * 1.5, cy + ny * r * 1.5);
    ctx.lineTo(cx + -ny * r * 0.55 + nx * r * 0.5, cy + nx * r * 0.55 + ny * r * 0.5);
    ctx.lineTo(cx + ny * r * 0.55 + nx * r * 0.5, cy + -nx * r * 0.55 + ny * r * 0.5);
    ctx.closePath();
    ctx.fillStyle = rgbCss(color);
    ctx.fill();
  }

  // Eye (so it reads as a critter, not a puck).
  ctx.beginPath();
  ctx.arc(cx + r * 0.25, cy - r * 0.2, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = rgbCss(theme.bg);
  ctx.fill();

  ctx.fillStyle = rgbCss(color, 0.9);
  ctx.font = "600 11px ui-monospace, SFMono-Regular, monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, cx, cy - r - 6);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
