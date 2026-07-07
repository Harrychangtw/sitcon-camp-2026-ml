"""Course 2 *rl-playground* station — "Critter Arena" reinforcement learning.

The pedagogy: a critter learns to forage gems and dodge lava **only from a
reward signal**. Students race it with the arrow keys, scrub a checkpoint
slider from random flailing to unbeatable, then swap the reward recipe and
watch the agent optimise the *proxy* instead of the intent (reward hacking).

The golden rule holds: PPO training happens HERE, offline. The browser gets a
small JSON of MLP weights per checkpoint (`policies.json`) and runs the
environment + the policy's forward pass live — a few lines of matmul, no ONNX
runtime, no training.

THE PARITY CONTRACT (load-bearing): the environment is defined once and
implemented twice — this file (training) and apps/course2/src/stations/rl/env.ts
(playback). Both use IEEE-754 double scalar math with the SAME constants, the
SAME operation order, and the SAME integer RNG (mulberry32), so a fixed seed +
scripted action sequence reproduces bit-near-identical trajectories. `rl-export`
dumps `parity.json` (seed + actions + full per-step trace) and a vitest test in
course2 replays it through env.ts asserting ≤1e-6 drift. If you touch ANY
dynamics constant or formula here, mirror it in env.ts and regenerate parity.json.

Determinism knobs (mirrors server/README.md spirit):
  - env math is plain Python floats (= JS doubles); no numpy inside the env
  - fixed integration order: accel → drag → speed clamp → move → wall clamp →
    gems → lava → obs → reward
  - mulberry32 for ALL env randomness (layout + respawns); uint32 masking here
    mirrors `>>> 0` coercions in TS step for step
  - playback is deterministic argmax; no RNG in the browser's policy
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Environment spec — MUST mirror apps/course2/src/stations/rl/env.ts exactly.
# ---------------------------------------------------------------------------

DT = 1 / 30          # fixed simulation step (s)
ACCEL = 2.4          # thrust from a direction action (units/s²)
DRAG = 0.88          # per-step velocity decay (applied after thrust)
VMAX = 0.65          # hard speed cap (units/s)
CRITTER_R = 0.035
GEM_R = 0.03
LAVA_R = 0.09
KNOCKBACK = 0.5      # speed the critter is ejected from lava at (units/s)
N_GEMS = 4
N_LAVA = 2
HORIZON = 900        # training episode length: 30 s at 30 Hz

# Spawn-sampling constraints (identical rejection loops on both sides).
LAVA_MARGIN = 0.16
GEM_MARGIN = 0.06
CRITTER_MARGIN = 0.08
LAVA_SPACING = 2 * LAVA_R + 0.05   # min distance between lava centres
GEM_SPACING = 0.12                 # min distance between gems
GEM_LAVA_CLEAR = LAVA_R + GEM_R + 0.02
GEM_EATER_CLEAR = 0.2              # respawn keeps clear of the critter that ate
CRITTER_LAVA_CLEAR = LAVA_R + CRITTER_R + 0.05
MAX_SAMPLE_TRIES = 40

OBS_SIZE = 12
N_ACTIONS = 5        # noop, up, down, left, right (screen coords: up = −y)
HIDDEN = 64

OBS_LAYOUT = [
    "vx", "vy",
    "gemDx", "gemDy", "gemDist",
    "lavaDx", "lavaDy", "lavaDist",
    "wallL", "wallR", "wallU", "wallD",
]
ACTIONS = ["noop", "up", "down", "left", "right"]

# Fixed arrangement the station opens with (training uses random layouts; the
# obs is egocentric so the policy transfers). Human spawn mirrors the agent's.
DEFAULT_LAYOUT = {
    "gems": [[0.15, 0.72], [0.5, 0.14], [0.86, 0.32], [0.78, 0.84]],
    "lava": [[0.35, 0.38], [0.66, 0.62]],
    "agent": [0.2, 0.5],
    "human": [0.8, 0.5],
}

STATION = "rl-playground"


# ---------------------------------------------------------------------------
# mulberry32 — the shared deterministic RNG. Python side of the contract:
# every `& 0xFFFFFFFF` here is a `>>> 0` in env.ts; `_imul` is Math.imul.
# ---------------------------------------------------------------------------

_U32 = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    """JS Math.imul(a, b) >>> 0 — 32-bit multiply, unsigned result."""
    return (a * b) & _U32


class Mulberry32:
    def __init__(self, seed: int):
        self.a = seed & _U32

    def next(self) -> float:
        """Uniform in [0, 1) — bit-identical to the TS twin."""
        self.a = (self.a + 0x6D2B79F5) & _U32
        t = self.a
        t = _imul(t ^ (t >> 15), t | 1)
        t = (t ^ ((t + _imul(t ^ (t >> 7), t | 61)) & _U32)) & _U32
        return ((t ^ (t >> 14)) & _U32) / 4294967296


# ---------------------------------------------------------------------------
# Reference environment — plain Python floats only (env math must be JS-double
# identical; numpy is quarantined to training/eval BATCH work outside the env).
# ---------------------------------------------------------------------------


class Critter:
    __slots__ = ("x", "y", "vx", "vy", "in_lava", "prev_gem_dist")

    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y
        self.vx = 0.0
        self.vy = 0.0
        self.in_lava = False
        self.prev_gem_dist = 1.0


class World:
    __slots__ = ("gems", "lavas", "rng")

    def __init__(self, gems: list[list[float]], lavas: list[list[float]], rng: Mulberry32):
        self.gems = gems    # [[x, y], ...] — mutated on respawn
        self.lavas = lavas  # [[x, y], ...] — static (until the student drags)
        self.rng = rng


def _sample_pos(rng: Mulberry32, margin: float) -> tuple[float, float]:
    x = margin + rng.next() * (1 - 2 * margin)
    y = margin + rng.next() * (1 - 2 * margin)
    return x, y


def _clear_of(points: list[list[float]], x: float, y: float, min_dist: float) -> bool:
    for p in points:
        dx = x - p[0]
        dy = y - p[1]
        if dx * dx + dy * dy < min_dist * min_dist:
            return False
    return True


def sample_gem_pos(world: World, avoid_x: float, avoid_y: float) -> list[float]:
    """Respawn/spawn a gem clear of lava, other gems, and the eater. The
    rejection loop consumes RNG identically on both sides; after
    MAX_SAMPLE_TRIES the last sample is accepted as-is."""
    x = y = 0.5
    for _ in range(MAX_SAMPLE_TRIES):
        x, y = _sample_pos(world.rng, GEM_MARGIN)
        if not _clear_of(world.lavas, x, y, GEM_LAVA_CLEAR):
            continue
        if not _clear_of(world.gems, x, y, GEM_SPACING):
            continue
        dx = x - avoid_x
        dy = y - avoid_y
        if dx * dx + dy * dy < GEM_EATER_CLEAR * GEM_EATER_CLEAR:
            continue
        break
    return [x, y]


def make_world(rng: Mulberry32, n_gems: int = N_GEMS, n_lava: int = N_LAVA) -> World:
    """Random layout: lavas first, then gems, then (separately) the critter —
    a fixed RNG-consumption order both implementations share."""
    world = World([], [], rng)
    for _ in range(n_lava):
        x = y = 0.5
        for _ in range(MAX_SAMPLE_TRIES):
            x, y = _sample_pos(rng, LAVA_MARGIN)
            if _clear_of(world.lavas, x, y, LAVA_SPACING):
                break
        world.lavas.append([x, y])
    for _ in range(n_gems):
        # avoid point (-1, -1): impossible position → only lava/gem constraints bind
        world.gems.append(sample_gem_pos(world, -1.0, -1.0))
    return world


def spawn_critter(world: World, rng: Mulberry32) -> Critter:
    x = y = 0.5
    for _ in range(MAX_SAMPLE_TRIES):
        x, y = _sample_pos(rng, CRITTER_MARGIN)
        if _clear_of(world.lavas, x, y, CRITTER_LAVA_CLEAR):
            break
    c = Critter(x, y)
    gd = nearest_block(world.gems, c.x, c.y)
    c.prev_gem_dist = gd[2]
    return c


def nearest_block(points: list[list[float]], x: float, y: float) -> tuple[float, float, float]:
    """(dx, dy, dist/√2) to the nearest point; (0, 0, 1) when there are none.
    Ties break to the lowest index (strict `<` in the same loop order)."""
    if not points:
        return 0.0, 0.0, 1.0
    best_i = 0
    best_d2 = math.inf
    for i, p in enumerate(points):
        dx = p[0] - x
        dy = p[1] - y
        d2 = dx * dx + dy * dy
        if d2 < best_d2:
            best_d2 = d2
            best_i = i
    p = points[best_i]
    dx = p[0] - x
    dy = p[1] - y
    return dx, dy, math.sqrt(best_d2) / math.sqrt(2)


def step_critter(world: World, c: Critter, action: int) -> dict:
    """One physics step + gem/lava interactions. Returns event counts.

    Fixed order (the parity contract): thrust → drag → speed clamp → move →
    wall clamp (zero the clamped velocity component) → eat gems (respawn via
    world.rng) → lava entry (penalty event + knockback).
    """
    ax = 0.0
    ay = 0.0
    if action == 1:
        ay = -ACCEL
    elif action == 2:
        ay = ACCEL
    elif action == 3:
        ax = -ACCEL
    elif action == 4:
        ax = ACCEL

    c.vx = (c.vx + ax * DT) * DRAG
    c.vy = (c.vy + ay * DT) * DRAG
    s2 = c.vx * c.vx + c.vy * c.vy
    if s2 > VMAX * VMAX:
        k = VMAX / math.sqrt(s2)
        c.vx = c.vx * k
        c.vy = c.vy * k

    c.x = c.x + c.vx * DT
    c.y = c.y + c.vy * DT
    if c.x < CRITTER_R:
        c.x = CRITTER_R
        c.vx = 0.0
    elif c.x > 1 - CRITTER_R:
        c.x = 1 - CRITTER_R
        c.vx = 0.0
    if c.y < CRITTER_R:
        c.y = CRITTER_R
        c.vy = 0.0
    elif c.y > 1 - CRITTER_R:
        c.y = 1 - CRITTER_R
        c.vy = 0.0

    ate = 0
    eat_r = CRITTER_R + GEM_R
    for i in range(len(world.gems)):
        g = world.gems[i]
        dx = g[0] - c.x
        dy = g[1] - c.y
        if dx * dx + dy * dy < eat_r * eat_r:
            ate += 1
            world.gems[i] = sample_gem_pos(world, c.x, c.y)

    lava_r = CRITTER_R + LAVA_R
    inside = -1
    for i, l in enumerate(world.lavas):
        dx = c.x - l[0]
        dy = c.y - l[1]
        if dx * dx + dy * dy < lava_r * lava_r:
            inside = i
            break
    lava_enter = inside >= 0 and not c.in_lava
    if lava_enter:
        l = world.lavas[inside]
        dx = c.x - l[0]
        dy = c.y - l[1]
        d = math.sqrt(dx * dx + dy * dy)
        if d < 1e-9:
            c.vx = KNOCKBACK
            c.vy = 0.0
        else:
            c.vx = dx / d * KNOCKBACK
            c.vy = dy / d * KNOCKBACK
    c.in_lava = inside >= 0

    return {"ate": ate, "lava_enter": lava_enter}


def build_obs(world: World, c: Critter) -> list[float]:
    gdx, gdy, gdist = nearest_block(world.gems, c.x, c.y)
    ldx, ldy, ldist = nearest_block(world.lavas, c.x, c.y)
    return [
        c.vx / VMAX, c.vy / VMAX,
        gdx, gdy, gdist,
        ldx, ldy, ldist,
        c.x, 1 - c.x, c.y, 1 - c.y,
    ]


# ---------------------------------------------------------------------------
# Reward recipes — the "you get what you reward" gallery. `env_step` computes
# every recipe from the same events, so the browser can show the score the
# agent is ACTUALLY optimising (in TS: same formulas, display only).
# ---------------------------------------------------------------------------

RECIPES = [
    {
        "id": "forager",
        "label": "覓食者",
        "isGood": True,
        "rewardDesc": "吃到寶石 +1(靠近寶石有引導分);碰到岩漿 −1(貼近也會微扣分);每一步 −0.001",
        "totalSteps": 1_000_000,
        # Milestones straddle the learning S-curve (takeoff ≈ 175k–400k, still
        # climbing at 1M) so every slider rung LOOKS different: frozen → first
        # steps → a few gems → competent → strong → final.
        "checkpointSteps": [0, 200_000, 300_000, 400_000, 600_000, 1_000_000],
        "entCoef": 0.015,
    },
    {
        "id": "couch_potato",
        "label": "沙發馬鈴薯",
        "isGood": False,
        "rewardDesc": "幾乎不動的每一步 +0.03;碰到岩漿 −5(寶石?誰在乎)",
        "totalSteps": 150_000,
        "checkpointSteps": [150_000],
    },
    {
        "id": "magnetized",
        "label": "寶石磁鐵",
        "isGood": False,
        "rewardDesc": "每靠近最近的寶石一點就加分——但吃掉它會讓寶石跳走(距離暴增=大扣分)",
        "totalSteps": 150_000,
        "checkpointSteps": [150_000],
    },
    {
        "id": "speedster",
        "label": "飆速狂",
        "isGood": False,
        "rewardDesc": "跑得越快,每一步加越多分。就這樣。",
        "totalSteps": 150_000,
        "checkpointSteps": [150_000],
    },
]

COUCH_SPEED = 0.05  # "almost still" threshold for couch_potato (units/s)

# Forager's lava economics, tuned so the optimum is "forage while curving
# around lava", not "freeze". A −5 entry spike makes freezing (−0.9/ep) beat
# even competent foraging (~10 gems but ~8 transits = −40) → PPO locks into
# never-move (verified empirically). At −1 foraging beats freezing BEFORE
# avoidance is learned, and the weak dense proximity field below sharpens the
# detours without dominating the gem pull (which is ≈+0.007/step).
LAVA_ENTER_PENALTY = 1.0
LAVA_NEAR = 0.21
LAVA_NEAR_COEF = 0.015


def recipe_reward(
    recipe_id: str,
    events: dict,
    speed: float,
    gem_dist: float,
    prev_gem_dist: float,
    lava_dist: float,
) -> float:
    """Reward for one step. MUST mirror recipeReward in env.ts.

    `gem_dist`/`lava_dist` are the obs-normalised (÷√2) nearest distances.
    """
    if recipe_id == "forager":
        r = events["ate"] * 1.0 - 0.001
        # Approach-shaping, SKIPPED on eat steps so the respawn jump never
        # punishes eating (contrast: magnetized keeps it — that's its trap).
        # Without this the sparse +1 is undiscoverable: random per-step thrust
        # under drag barely displaces the critter.
        if not events["ate"]:
            r += 0.5 * (prev_gem_dist - gem_dist)
        d = lava_dist * math.sqrt(2)
        if d < LAVA_NEAR:
            r -= LAVA_NEAR_COEF * (1 - d / LAVA_NEAR)
        if events["lava_enter"]:
            r -= LAVA_ENTER_PENALTY
        return r
    if recipe_id == "couch_potato":
        r = 0.03 if speed < COUCH_SPEED else 0.0
        if events["lava_enter"]:
            r -= 5.0
        return r
    if recipe_id == "magnetized":
        # Deliberately keeps the respawn jump in the delta: eating a gem makes
        # the nearest-gem distance leap → a big NEGATIVE reward → the agent
        # learns to hover next to gems without eating. That's the lesson.
        return 2.0 * (prev_gem_dist - gem_dist)
    if recipe_id == "speedster":
        return 0.08 * (speed / VMAX)
    raise ValueError(f"unknown recipe {recipe_id!r}")


def env_step(world: World, c: Critter, action: int, recipe_id: str) -> tuple[list[float], float, dict]:
    """Physics + obs + reward, in the canonical order. Returns (obs, reward, events)."""
    events = step_critter(world, c, action)
    obs = build_obs(world, c)
    speed = math.sqrt(c.vx * c.vx + c.vy * c.vy)
    gem_dist = obs[4]
    lava_dist = obs[7]
    reward = recipe_reward(
        recipe_id, events, speed, gem_dist, c.prev_gem_dist, lava_dist
    )
    c.prev_gem_dist = gem_dist
    return obs, reward, events


# ---------------------------------------------------------------------------
# Parity fixture — seed + scripted actions + full trace. The script is
# GENERATED greedily here (chase gems → guaranteed eats/respawns, seek lava →
# guaranteed entry/knockback, grind walls, idle) but SHIPPED as a flat action
# list, so the TS test replays recorded actions and never re-derives them.
# ---------------------------------------------------------------------------

PARITY_SEED = 20260707


def _greedy_action(dx: float, dy: float) -> int:
    if abs(dx) >= abs(dy):
        return 4 if dx >= 0 else 3
    return 2 if dy >= 0 else 1


def build_parity() -> dict:
    rng = Mulberry32(PARITY_SEED)
    world = make_world(rng)
    critter = spawn_critter(world, rng)
    layout = {
        "gems": [[g[0], g[1]] for g in world.gems],
        "lava": [[l[0], l[1]] for l in world.lavas],
        "critter": [critter.x, critter.y],
    }

    actions: list[int] = []
    trace: list[dict] = []

    def run(n: int, pick) -> None:
        for _ in range(n):
            a = pick()
            obs, reward, events = env_step(world, critter, a, "forager")
            actions.append(a)
            trace.append(
                {
                    "x": critter.x,
                    "y": critter.y,
                    "vx": critter.vx,
                    "vy": critter.vy,
                    "ate": events["ate"],
                    "lava": events["lava_enter"],
                    "obs": obs,
                    "reward": reward,
                    "gems": [[g[0], g[1]] for g in world.gems],
                }
            )

    # 1) chase gems — eats + RNG-consuming respawns
    run(300, lambda: _greedy_action(*nearest_block(world.gems, critter.x, critter.y)[:2]))
    # 2) seek lava — entry penalty + knockback (repeatedly: knocked out, dives back)
    run(120, lambda: _greedy_action(*nearest_block(world.lavas, critter.x, critter.y)[:2]))
    # 3) grind the walls — clamped position + zeroed velocity
    run(60, lambda: 4)
    run(45, lambda: 1)
    # 4) idle — drag decay to rest
    run(30, lambda: 0)

    eats = sum(t["ate"] for t in trace)
    lava_hits = sum(1 for t in trace if t["lava"])
    if eats < 2 or lava_hits < 1:
        raise SystemExit(
            f"rl parity: script too tame (eats={eats}, lava={lava_hits}) — "
            "it must exercise respawn RNG and lava knockback."
        )

    return {
        "generator": "camp-precompute rl-export",
        "station": STATION,
        "note": (
            "Cross-language determinism fixture: seed + initial layout + a "
            "recorded action script + the full per-step trace (state, obs, "
            "forager reward, gem positions) from the Python reference env. "
            "apps/course2 replays `actions` through env.ts from the same seed "
            "and asserts every traced value matches within 1e-6. Regenerate "
            "with `camp-precompute rl-export` whenever env dynamics change."
        ),
        "seed": PARITY_SEED,
        "nGems": N_GEMS,
        "nLava": N_LAVA,
        "layout": layout,
        "stats": {"eats": eats, "lavaHits": lava_hits, "steps": len(actions)},
        "actions": actions,
        "trace": trace,
    }


# ---------------------------------------------------------------------------
# Policy forward (numpy) — the SAME math the browser runs, used for checkpoint
# evaluation on the ROUNDED weights, so shipped stats describe shipped weights.
# ---------------------------------------------------------------------------


def mlp_forward(w: dict[str, np.ndarray], obs: np.ndarray) -> np.ndarray:
    h = np.tanh(w["W0"] @ obs + w["b0"])
    h = np.tanh(w["W1"] @ h + w["b1"])
    return w["W2"] @ h + w["b2"]


def _round_weights(w: dict[str, np.ndarray], decimals: int = 4) -> dict[str, np.ndarray]:
    return {k: np.round(v.astype(np.float64), decimals) for k, v in w.items()}


def evaluate_policy(
    w: dict[str, np.ndarray], recipe_id: str, episodes: int = 8, seed: int = 990_001
) -> tuple[float, float]:
    """Mean (return, gems eaten) over eval episodes: random layouts,
    deterministic argmax — exactly the browser's playback regime."""
    total_r = 0.0
    total_g = 0.0
    for ep in range(episodes):
        rng = Mulberry32(seed + ep)
        world = make_world(rng)
        c = spawn_critter(world, rng)
        obs = build_obs(world, c)
        for _ in range(HORIZON):
            a = int(np.argmax(mlp_forward(w, np.asarray(obs))))
            obs, r, events = env_step(world, c, a, recipe_id)
            total_r += r
            total_g += events["ate"]
    return total_r / episodes, total_g / episodes


# ---------------------------------------------------------------------------
# PPO training (torch, offline only) — one compact clipped-PPO loop per recipe.
# ---------------------------------------------------------------------------

TRAIN_SEED = 20260707
N_ENVS = 16
ROLLOUT_T = 128          # steps per env per iteration → 2048 steps/iter
GAMMA = 0.99
GAE_LAMBDA = 0.95
CLIP = 0.2
LR = 3e-4
EPOCHS = 4
MINIBATCH = 512
ENT_COEF = 0.01
VF_COEF = 0.5
MAX_GRAD_NORM = 0.5

STATE_NPZ = "rl_{recipe}.npz"


class _EnvSlot:
    """One training env instance: world + critter + episode bookkeeping."""

    __slots__ = ("rng", "world", "critter", "obs", "ep_return", "ep_steps", "ep_gems")

    def __init__(self, seed: int):
        self.rng = Mulberry32(seed)
        self.reset()

    def reset(self) -> None:
        self.world = make_world(self.rng)
        self.critter = spawn_critter(self.world, self.rng)
        self.obs = build_obs(self.world, self.critter)
        self.ep_return = 0.0
        self.ep_steps = 0
        self.ep_gems = 0


def _actor_weights(actor) -> dict[str, np.ndarray]:
    sd = actor.state_dict()
    return {
        "W0": sd["net.0.weight"].detach().cpu().numpy(),
        "b0": sd["net.0.bias"].detach().cpu().numpy(),
        "W1": sd["net.2.weight"].detach().cpu().numpy(),
        "b1": sd["net.2.bias"].detach().cpu().numpy(),
        "W2": sd["net.4.weight"].detach().cpu().numpy(),
        "b2": sd["net.4.bias"].detach().cpu().numpy(),
    }


def train_recipe(recipe: dict, artifacts_dir: Path) -> Path:
    """Train one reward recipe with PPO; save checkpoints + return curve npz.

    CPU on purpose: the nets are tiny (obs 12 → 64 → 64 → 5), so device
    transfer would dominate GPU compute, and seeded CPU torch is deterministic.
    """
    import torch
    from torch import nn
    from torch.distributions import Categorical

    recipe_id = recipe["id"]
    total_steps = recipe["totalSteps"]
    targets = sorted(set(recipe["checkpointSteps"]))

    torch.manual_seed(TRAIN_SEED)
    np.random.seed(TRAIN_SEED)
    device = "cpu"

    def make_net(out: int, final_gain: float) -> nn.Module:
        net = nn.Sequential(
            nn.Linear(OBS_SIZE, HIDDEN), nn.Tanh(),
            nn.Linear(HIDDEN, HIDDEN), nn.Tanh(),
            nn.Linear(HIDDEN, out),
        )
        for i, gain in ((0, math.sqrt(2)), (2, math.sqrt(2)), (4, final_gain)):
            nn.init.orthogonal_(net[i].weight, gain)
            nn.init.zeros_(net[i].bias)
        return net

    class Actor(nn.Module):
        def __init__(self):
            super().__init__()
            self.net = make_net(N_ACTIONS, 0.01)

        def forward(self, x):
            return self.net(x)

    class Critic(nn.Module):
        def __init__(self):
            super().__init__()
            self.net = make_net(1, 1.0)

        def forward(self, x):
            return self.net(x).squeeze(-1)

    actor = Actor().to(device)
    critic = Critic().to(device)
    opt = torch.optim.Adam(
        list(actor.parameters()) + list(critic.parameters()), lr=LR, eps=1e-5
    )

    envs = [_EnvSlot(TRAIN_SEED + 1000 * i + 1) for i in range(N_ENVS)]

    checkpoints: list[dict] = []  # {"step": int, "target": int, "weights": {...}}
    next_target = 0

    def snapshot(steps_done: int) -> None:
        nonlocal next_target
        while next_target < len(targets) and steps_done >= targets[next_target]:
            checkpoints.append(
                {
                    "step": steps_done,
                    "target": targets[next_target],
                    "weights": _round_weights(_actor_weights(actor)),
                }
            )
            next_target += 1

    steps_done = 0
    curve_steps: list[int] = []
    curve_returns: list[float] = []
    last_mean = 0.0
    ent0 = float(recipe.get("entCoef", ENT_COEF))

    print(f"rl: training {recipe_id!r} for {total_steps} steps "
          f"({N_ENVS} envs × {ROLLOUT_T}/iter)…")

    while steps_done < total_steps:
        snapshot(steps_done)

        # Linear anneal (standard PPO trick): explore early, converge crisply —
        # matters because playback is deterministic argmax.
        progress = steps_done / total_steps
        frac = 1.0 - progress
        for group in opt.param_groups:
            group["lr"] = LR * max(frac, 0.05)
        ent_coef = ent0 * max(frac, 0.1)
        # Lava curriculum refund (0 → no refund; see the recipe comment).
        cur_frac = float(recipe.get("lavaCurriculumFrac", 0.0))
        lava_refund = (
            float(recipe.get("lavaPenalty", 0.0))
            * max(1.0 - progress / cur_frac, 0.0)
            if cur_frac > 0
            else 0.0
        )

        obs_buf = np.zeros((ROLLOUT_T, N_ENVS, OBS_SIZE), dtype=np.float32)
        act_buf = np.zeros((ROLLOUT_T, N_ENVS), dtype=np.int64)
        logp_buf = np.zeros((ROLLOUT_T, N_ENVS), dtype=np.float32)
        rew_buf = np.zeros((ROLLOUT_T, N_ENVS), dtype=np.float32)
        done_buf = np.zeros((ROLLOUT_T, N_ENVS), dtype=np.float32)
        val_buf = np.zeros((ROLLOUT_T, N_ENVS), dtype=np.float32)
        # Episode ends are TRUNCATIONS of a continuing task (the horizon is a
        # training artifact the policy can't observe), so GAE must bootstrap
        # V(s_next) of the PRE-reset state instead of 0 — else value targets
        # depend on invisible time-remaining and long-horizon credit breaks.
        trunc_obs: list[tuple[int, int, list[float]]] = []  # (t, env, obs)
        finished_returns: list[float] = []

        for t in range(ROLLOUT_T):
            obs_np = np.array([e.obs for e in envs], dtype=np.float32)
            with torch.no_grad():
                obs_t = torch.from_numpy(obs_np).to(device)
                logits = actor(obs_t)
                dist = Categorical(logits=logits)
                acts = dist.sample()
                logps = dist.log_prob(acts)
                vals = critic(obs_t)
            obs_buf[t] = obs_np
            act_buf[t] = acts.cpu().numpy()
            logp_buf[t] = logps.cpu().numpy()
            val_buf[t] = vals.cpu().numpy()

            for i, e in enumerate(envs):
                obs, r, events = env_step(e.world, e.critter, int(act_buf[t, i]), recipe_id)
                e.obs = obs
                e.ep_return += r  # curve records the TRUE recipe reward
                e.ep_gems += events["ate"]
                e.ep_steps += 1
                rew_buf[t, i] = r + (lava_refund if events["lava_enter"] else 0.0)
                if e.ep_steps >= HORIZON:
                    done_buf[t, i] = 1.0
                    trunc_obs.append((t, i, obs))
                    finished_returns.append(e.ep_return)
                    e.reset()
        steps_done += ROLLOUT_T * N_ENVS

        with torch.no_grad():
            last_obs = torch.from_numpy(
                np.array([e.obs for e in envs], dtype=np.float32)
            ).to(device)
            next_val = critic(last_obs).cpu().numpy()
            # Values of the pre-reset states at each truncation point.
            trunc_val = np.zeros((ROLLOUT_T, N_ENVS), dtype=np.float32)
            if trunc_obs:
                tv = critic(
                    torch.from_numpy(
                        np.array([o for _, _, o in trunc_obs], dtype=np.float32)
                    ).to(device)
                ).cpu().numpy()
                for (t, i, _), v in zip(trunc_obs, tv):
                    trunc_val[t, i] = v

        adv = np.zeros_like(rew_buf)
        last_gae = np.zeros(N_ENVS, dtype=np.float32)
        for t in reversed(range(ROLLOUT_T)):
            nonterminal = 1.0 - done_buf[t]
            nv = next_val if t == ROLLOUT_T - 1 else val_buf[t + 1]
            # Truncation: bootstrap the pre-reset next state's value, but still
            # cut the GAE λ-chain at the episode boundary.
            delta = (
                rew_buf[t]
                + GAMMA * (nv * nonterminal + trunc_val[t] * done_buf[t])
                - val_buf[t]
            )
            last_gae = delta + GAMMA * GAE_LAMBDA * nonterminal * last_gae
            adv[t] = last_gae
        ret = adv + val_buf

        b_obs = torch.from_numpy(obs_buf.reshape(-1, OBS_SIZE)).to(device)
        b_act = torch.from_numpy(act_buf.reshape(-1)).to(device)
        b_logp = torch.from_numpy(logp_buf.reshape(-1)).to(device)
        b_adv = torch.from_numpy(adv.reshape(-1)).to(device)
        b_ret = torch.from_numpy(ret.reshape(-1)).to(device)
        b_adv = (b_adv - b_adv.mean()) / (b_adv.std() + 1e-8)

        n = b_obs.shape[0]
        for _ in range(EPOCHS):
            perm = torch.randperm(n)
            for start in range(0, n, MINIBATCH):
                idx = perm[start : start + MINIBATCH]
                logits = actor(b_obs[idx])
                dist = Categorical(logits=logits)
                logp = dist.log_prob(b_act[idx])
                ratio = torch.exp(logp - b_logp[idx])
                pg1 = ratio * b_adv[idx]
                pg2 = torch.clamp(ratio, 1 - CLIP, 1 + CLIP) * b_adv[idx]
                pg_loss = -torch.min(pg1, pg2).mean()
                v = critic(b_obs[idx])
                v_loss = 0.5 * ((v - b_ret[idx]) ** 2).mean()
                loss = pg_loss + VF_COEF * v_loss - ent_coef * dist.entropy().mean()
                opt.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(
                    list(actor.parameters()) + list(critic.parameters()), MAX_GRAD_NORM
                )
                opt.step()

        if finished_returns:
            last_mean = float(np.mean(finished_returns))
        curve_steps.append(steps_done)
        curve_returns.append(round(last_mean, 4))
        if len(curve_steps) % 20 == 1:
            print(f"  {recipe_id}: {steps_done} steps, mean episode return {last_mean:.2f}")

    snapshot(steps_done)
    print(f"  {recipe_id}: done at {steps_done} steps, final return {last_mean:.2f}")

    # Evaluate every checkpoint on ROUNDED weights with the reference env —
    # exactly what the browser will play back.
    evals = []
    for ck in checkpoints:
        r_mean, g_mean = evaluate_policy(ck["weights"], recipe_id)
        evals.append({"returnMean": round(r_mean, 2), "gemsMean": round(g_mean, 2)})
        print(
            f"  {recipe_id} @ {ck['target']}: eval return {r_mean:.2f}, gems {g_mean:.2f}"
        )

    artifacts_dir.mkdir(parents=True, exist_ok=True)
    path = artifacts_dir / STATE_NPZ.format(recipe=recipe_id)
    payload: dict[str, np.ndarray] = {
        "recipe": np.array(recipe_id),
        "curve_steps": np.array(curve_steps, dtype=np.int64),
        "curve_returns": np.array(curve_returns, dtype=np.float64),
        "n_checkpoints": np.array(len(checkpoints)),
    }
    for i, (ck, ev) in enumerate(zip(checkpoints, evals)):
        payload[f"ck{i}_step"] = np.array(ck["step"])
        payload[f"ck{i}_target"] = np.array(ck["target"])
        payload[f"ck{i}_return_mean"] = np.array(ev["returnMean"])
        payload[f"ck{i}_gems_mean"] = np.array(ev["gemsMean"])
        for k, v in ck["weights"].items():
            payload[f"ck{i}_{k}"] = v
    np.savez_compressed(path, **payload)
    print(f"wrote {path} ({path.stat().st_size / 1e3:.0f} kB)")
    return path


def train_rl(artifacts_dir: Path, only: str | None = None) -> None:
    recipes = [r for r in RECIPES if only is None or r["id"] == only]
    if not recipes:
        raise SystemExit(f"rl: unknown recipe {only!r} — "
                         f"choose from {[r['id'] for r in RECIPES]}")
    for recipe in recipes:
        train_recipe(recipe, artifacts_dir)


# ---------------------------------------------------------------------------
# Export — policies.json (weights per checkpoint, rounded 4 dp) + parity.json.
# ---------------------------------------------------------------------------


def _steps_label(target: int, is_final: bool) -> str:
    if target == 0:
        return "0(隨機)"
    if target >= 1_000_000:
        base = f"{target // 1_000_000}M"
    elif target >= 1000:
        base = f"{target // 1000}k"
    else:
        base = str(target)
    return f"{base}(最終)" if is_final else base


def _weights_json(w: dict[str, np.ndarray]) -> dict:
    def arr(a: np.ndarray):
        if a.ndim == 1:
            return [round(float(x), 4) for x in a]
        return [[round(float(x), 4) for x in row] for row in a]

    return {k: arr(v) for k, v in w.items()}


def _downsample(xs: list, ys: list, max_points: int = 200) -> tuple[list, list]:
    if len(xs) <= max_points:
        return xs, ys
    idx = np.linspace(0, len(xs) - 1, max_points).round().astype(int)
    return [xs[i] for i in idx], [ys[i] for i in idx]


def rl_export(out_dir: Path, artifacts_dir: Path) -> list[Path]:
    """Build rl-playground/policies.json + parity.json from the trained npz
    files (run `camp-precompute train-rl` first) and register both."""
    from .cli import upsert_manifest_artifact

    station_dir = out_dir / STATION
    station_dir.mkdir(parents=True, exist_ok=True)

    recipes_out = []
    for recipe in RECIPES:
        path = artifacts_dir / STATE_NPZ.format(recipe=recipe["id"])
        if not path.exists():
            raise SystemExit(
                f"rl: missing {path}. Run `camp-precompute train-rl` first "
                f"(on this repo's GPU box: ../server/.venv/bin/camp-precompute)."
            )
        z = np.load(path, allow_pickle=False)
        n_ck = int(z["n_checkpoints"])
        targets = [int(z[f"ck{i}_target"]) for i in range(n_ck)]
        final_target = max(targets)
        checkpoints = []
        for i in range(n_ck):
            target = int(z[f"ck{i}_target"])
            checkpoints.append(
                {
                    "step": int(z[f"ck{i}_step"]),
                    "target": target,
                    "label": _steps_label(target, target == final_target and target > 0),
                    "returnMean": float(z[f"ck{i}_return_mean"]),
                    "gemsMean": float(z[f"ck{i}_gems_mean"]),
                    "weights": _weights_json(
                        {k: z[f"ck{i}_{k}"] for k in ("W0", "b0", "W1", "b1", "W2", "b2")}
                    ),
                }
            )
        curve_steps, curve_returns = _downsample(
            [int(s) for s in z["curve_steps"]],
            [round(float(r), 3) for r in z["curve_returns"]],
        )
        recipes_out.append(
            {
                "id": recipe["id"],
                "label": recipe["label"],
                "isGood": recipe["isGood"],
                "rewardDesc": recipe["rewardDesc"],
                "totalSteps": recipe["totalSteps"],
                "curveSteps": curve_steps,
                "returnCurve": curve_returns,
                "checkpoints": checkpoints,
            }
        )

    policies = {
        "generator": "camp-precompute rl-export",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "station": STATION,
        "note": (
            "Tiny MLP policies trained OFFLINE by `camp-precompute train-rl` "
            "(compact PPO; see camp_precompute.rl). The browser runs the "
            "Critter Arena env + this network's forward pass live (a few "
            "matmuls — no training, no ONNX). Weights are rounded to 4 dp; "
            "returnMean/gemsMean were evaluated on the ROUNDED weights with "
            "deterministic argmax, i.e. exactly the shipped playback."
        ),
        "env": {
            "dt": DT,
            "accel": ACCEL,
            "drag": DRAG,
            "vmax": VMAX,
            "critterR": CRITTER_R,
            "gemR": GEM_R,
            "lavaR": LAVA_R,
            "knockback": KNOCKBACK,
            "nGems": N_GEMS,
            "nLava": N_LAVA,
            "horizon": HORIZON,
            "obsLayout": OBS_LAYOUT,
            "actions": ACTIONS,
            "defaultLayout": DEFAULT_LAYOUT,
        },
        "policy": {
            "arch": [OBS_SIZE, HIDDEN, HIDDEN, N_ACTIONS],
            "activation": "tanh",
            "actionSelect": "argmax",
        },
        "recipes": recipes_out,
    }

    pol_path = station_dir / "policies.json"
    pol_path.write_text(
        json.dumps(policies, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {pol_path} ({pol_path.stat().st_size / 1e6:.2f} MB)")

    parity = build_parity()
    parity["generatedAt"] = datetime.now(timezone.utc).isoformat()
    par_path = station_dir / "parity.json"
    par_path.write_text(
        json.dumps(parity, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(
        f"wrote {par_path} ({par_path.stat().st_size / 1e3:.0f} kB, "
        f"{parity['stats']['steps']} steps, {parity['stats']['eats']} eats, "
        f"{parity['stats']['lavaHits']} lava hits)"
    )

    upsert_manifest_artifact(
        out_dir,
        {
            "id": "rl-playground-policies",
            "kind": "json",
            "path": f"{STATION}/policies.json",
            "station": STATION,
            "bytes": pol_path.stat().st_size,
            "description": (
                "PPO-trained MLP policy weights (per reward recipe, per "
                "training checkpoint) + return curves for the Critter Arena. "
                "The browser runs env + forward pass live; training stays offline."
            ),
        },
    )
    upsert_manifest_artifact(
        out_dir,
        {
            "id": "rl-playground-parity",
            "kind": "json",
            "path": f"{STATION}/parity.json",
            "station": STATION,
            "bytes": par_path.stat().st_size,
            "description": (
                "Python↔TS env determinism fixture: seed + scripted actions + "
                "reference trace, replayed by the course2 vitest parity test."
            ),
        },
    )
    return [pol_path, par_path]


def export_parity_only(out_dir: Path) -> Path:
    """Write just parity.json (no trained npz needed) — used while iterating
    on env dynamics before/without retraining."""
    from .cli import upsert_manifest_artifact

    station_dir = out_dir / STATION
    station_dir.mkdir(parents=True, exist_ok=True)
    parity = build_parity()
    parity["generatedAt"] = datetime.now(timezone.utc).isoformat()
    par_path = station_dir / "parity.json"
    par_path.write_text(
        json.dumps(parity, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(
        f"wrote {par_path} ({par_path.stat().st_size / 1e3:.0f} kB, "
        f"{parity['stats']['steps']} steps, {parity['stats']['eats']} eats, "
        f"{parity['stats']['lavaHits']} lava hits)"
    )
    upsert_manifest_artifact(
        out_dir,
        {
            "id": "rl-playground-parity",
            "kind": "json",
            "path": f"{STATION}/parity.json",
            "station": STATION,
            "bytes": par_path.stat().st_size,
            "description": (
                "Python↔TS env determinism fixture: seed + scripted actions + "
                "reference trace, replayed by the course2 vitest parity test."
            ),
        },
    )
    return par_path
