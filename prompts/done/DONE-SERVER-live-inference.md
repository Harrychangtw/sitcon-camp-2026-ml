# Session: Build the **live inference server** (FastAPI + torch)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: a new `server/` FastAPI + torch service that runs
> the Course 2 models live for **arbitrary student input**, plus a deploy runbook
> that works **unchanged on two targets** (a home single-**RTX 3090** box and a
> **4x Tesla V100** TWCC VM), with the server importing the **same model code**
> the precompute pipeline uses so live output matches the precomputed baseline.

## Why this exists (read before you touch the golden rule)

`CLAUDE.md` says the browser never trains and no runtime GPU is needed. That rule
still holds for every **fixed-input** station: they stay on precomputed JSON.

This server is a **deliberate, isolated addition** for the three stations where
students type their **own** input and the precomputed lookup table has no row for
it (the frustration we are fixing): **embedding**, **next-token**, **rnn-viz**.
For those, the browser calls a small live endpoint that runs the *same* small
model on the typed input and returns JSON in the *same shape* as the precomputed
artifact. It is opt-in per station and **falls back to precomputed JSON** if the
server is unreachable, so a dead box degrades gracefully instead of breaking the
class.

Non-negotiables that keep this from rotting the architecture:

- **Additive and isolated.** All new code lives under a new top-level `server/`.
  Do **not** move heavy compute into the web apps. Do **not** change the fixed-
  input stations (tokenizer, order-shuffle, transformer).
- **Live must equal precomputed.** The server imports model definitions and
  loads the **same weights** from `camp_precompute`. A typed word must land where
  the precomputed points/neighbors would put it. If you invent a second model,
  the viz becomes inconsistent and this whole thing is worthless.
- **Schema-compatible.** Each endpoint returns JSON whose element shape matches
  the existing artifact it substitutes for. The frontend swaps a `loadJSON` for a
  live POST and nothing else changes.
- **Hardware-portable.** The exact same code and image must run on the 3090 box
  and the 4x V100 VM with **only `.env` changing** — no GPU count, VRAM size, or
  device id may be hardcoded anywhere. See "Two deploy targets" below.

## Two deploy targets (design for both from the start)

The camp may run on **either** machine; the server must not care which.

| | Home box | TWCC VM |
| --- | --- | --- |
| GPU | 1x **RTX 3090 24GB** | 4x **Tesla V100 SXM2 32GB** |
| Host | Ubuntu Server (headless), driver likely already installed | Ubuntu 24.04, **driver not yet installed** |
| Network | LAN / your own router + port-forward | public `203.145.221.64`, inbound gated by **TWCC security-group** console |
| CPU/RAM | Ryzen 9 7900, 64GB | 32 vCPU, 329GB |

The models are tiny, so **one process on `cuda:0` uses a sliver of VRAM on both**
and the extra V100s buy nothing at this load. Design to that lowest common
denominator: single GPU, config-driven, no assumption that more than one device
exists. Portability differences to absorb in **config and the runbook only**:
driver-present vs. driver-absent, PEP 668 venv (both are modern Ubuntu, so use a
venv on both), and LAN port-forward vs. cloud security group. Everything else is
identical.

## Step 0 — Read first (in this order)

1. `CLAUDE.md` — golden rules and package boundaries.
2. `precompute/src/camp_precompute/embedding.py` and `rnn.py` — the model
   definitions and how weights are produced. This is the code the server must
   reuse. Note how models are built, what vocab they use, and **whether trained
   weights are persisted anywhere** or only exist transiently while writing JSON.
3. `precompute/src/camp_precompute/cli.py` — the subcommands that write each
   artifact; understand exactly what tensors go into each JSON.
4. The **existing artifacts** (lock the response schemas by reading real data):
   - `apps/course2/public/data/course2/embedding/points.{en,zh}.json`
   - `apps/course2/public/data/course2/embedding/neighbors.{en,zh}.json`
   - `apps/course2/public/data/course2/next-token/distributions.json`
   - `apps/course2/public/data/course2/rnn-viz/activations.json`
   - `apps/course2/public/data/course2/manifest.json`
5. The three station files that will consume the endpoints:
   `apps/course2/src/stations/embedding.tsx`, `nextToken.tsx`, `rnnViz.tsx`, and
   `packages/data/src/` (the loader package the client helper belongs in).

## Step 1 — Make the trained weights loadable

The server must load the **exact** weights behind the precomputed artifacts.

- If `camp_precompute` already persists weights (a `.pt`/`.npz`/checkpoint), note
  the path and load format.
- If weights are only transient (models are built, used to emit JSON, discarded),
  add a small **export** to the precompute side: a function/subcommand that trains
  or builds the model once and saves weights + the vocab/token maps to a known
  location (e.g. `precompute/artifacts/` or written alongside the JSON). Keep the
  files small; do not commit large binaries (respect the `*.bin` gitignore rule).
  The precomputed JSON and the exported weights must come from the **same** model
  instance so they cannot drift.
- The vocab / token-id maps the server needs to accept arbitrary input must be
  exported too (the server has to turn a typed word or sequence into ids the same
  way precompute did).

## Step 2 — Build the server under `server/`

Create a self-contained **uv**-managed Python project (mirror `precompute/`'s
tooling). It should **depend on `camp_precompute`** (path dependency) so it reuses
model classes and the export from Step 1 rather than copying them.

```
server/
  pyproject.toml        # uv; fastapi, uvicorn[standard], torch, pydantic
  README.md             # the deploy runbook (Step 4)
  .env.example          # CAMP_TOKEN, ALLOWED_ORIGINS, PORT, DEVICE, WEIGHTS_DIR
  app/
    main.py             # FastAPI app: CORS, auth dependency, routers, /health
    loader.py           # load models + vocab into memory ONCE at startup (lifespan)
    schemas.py          # pydantic request/response models matching the artifacts
    routers/
      embedding.py      # POST /embedding/lookup
      next_token.py     # POST /next-token/predict
      rnn.py            # POST /rnn/forward
```

Requirements:

- **Load once, at startup.** Use FastAPI's lifespan to load every model + vocab
  into memory (and onto GPU if available) a single time. Never load per request.
- **Device selection (portability-critical).** Resolve the device at startup from
  the `DEVICE` env: `auto` -> `cuda:0` if `torch.cuda.is_available()` else `cpu`;
  or an explicit override (`cuda:0`, `cpu`). **Never hardcode a device id, GPU
  count, or VRAM assumption anywhere** — the same code must boot identically on
  the single-GPU 3090 and the 4-GPU V100 box with only `.env` differing. One
  process, `cuda:0`, no sharding across the V100s, no batching: the models are
  tiny and 60 users is a handful of req/s. Log the resolved device + GPU name at
  startup so the operator can confirm which machine it landed on. `DEVICE=cpu`
  must fully work for laptop dev and as the last-ditch fallback.
- **Endpoints** (match the artifact element shapes you read in Step 0 — these
  field names are illustrative, use the **real** ones from the JSON):
  - `POST /embedding/lookup` `{ word, lang }` -> the same object the
    `points`/`neighbors` artifacts hold for one word: its coordinate(s) plus its
    nearest-neighbor list `[{ word, score }, ...]`. Handle **out-of-vocab**
    explicitly: return `{ inVocab: false, suggestions: [...] }` (nearest known
    words) instead of an error, so the station can show a graceful message.
  - `POST /next-token/predict` `{ prompt }` -> the same shape as
    `distributions.json` for that prompt (tokens + next-token distribution).
  - `POST /rnn/forward` `{ tokens | text }` -> the same shape as
    `activations.json` (per-timestep hidden vectors, plus any influence/decay
    trace the artifact carries).
  - `GET /health` -> `{ status, device, gpu, models: [...] }`, **no auth**, for
    liveness checks and the deploy smoke test.
- **Auth.** A single shared secret via `X-Camp-Token` header (from `CAMP_TOKEN`),
  enforced by a dependency on the three inference routes. The box has a public IP;
  do not ship an open inference endpoint to the internet.
- **CORS.** Restrict `allow_origins` to `ALLOWED_ORIGINS` (the deployed course2
  origin plus `http://localhost:5173` for dev). No wildcard.
- **Validation.** Cap input length (max word length, max sequence/prompt tokens)
  so a pasted wall of text cannot wedge the process. Return 4xx with a clear
  message, never a 500 stack trace.
- **Determinism.** `torch.no_grad()` / `eval()` on every path; seed anything that
  needs it so repeated identical input gives identical output (students will
  compare with the precomputed baseline).

## Step 3 — Frontend opt-in client (bounded; keep boundaries)

This is the only change outside `server/`. Keep it minimal and additive.

- In **`@camp/data`** (the loader package — this is where it belongs, not in
  `viz`/`ui`), add a helper like `liveInfer(path, body)` that POSTs to
  `import.meta.env.VITE_LIVE_INFERENCE_URL` with the `X-Camp-Token` header and a
  short timeout, and **throws/returns null on any failure** so callers can fall
  back. No React in this package.
- In each of the three stations, gate live calls behind the env var: if
  `VITE_LIVE_INFERENCE_URL` is set and the student submits **custom** input, call
  `liveInfer` and render the result through the **same** viz path as precomputed
  data; on failure or when the var is unset, use the existing precomputed
  artifact exactly as today. The preset/example inputs keep working with zero
  server dependency.
- Add `VITE_LIVE_INFERENCE_URL` and the token to `.env.example` for course2 and
  document it. Do not hardcode the IP or token in source.

## Step 4 — Deploy runbook (write into `server/README.md`, then dry-run what you can)

Structure the runbook as a **shared path plus two short target-specific sidebars**,
so it is obvious that only a few steps differ between the 3090 and the V100 VM.

**Shared (identical on both machines):**

1. **Project + venv** (both are modern Ubuntu, PEP 668): clone/pull the repo,
   `python3 -m venv`, install the server with the CUDA torch wheel (`--index-url
   https://download.pytorch.org/whl/cu124`), verify
   `python -c "import torch; print(torch.cuda.is_available(), torch.cuda.device_count())"`
   (prints `True 1` on the 3090, `True 4` on the VM — both fine).
2. **Config:** copy `.env.example` -> `.env`, set `CAMP_TOKEN` (strong random),
   `ALLOWED_ORIGINS`, `PORT`, and leave `DEVICE=auto`. This `.env` is the **only**
   thing that differs between the two machines.
3. **Run persistently:** a **systemd unit** (preferred over tmux) that runs
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT` in the venv, restarts on
   failure, loads `.env`. Include the unit file text; it is identical on both.
4. **Smoke test:** `curl` `/health` on the box (confirm the logged device is the
   GPU you expect), then hit `/health` from an **outside** machine, then one authed
   `curl` per inference route checking the response shape matches the artifact.

**Sidebar A — TWCC V100 VM:**
- **Driver (absent):** `sudo apt update && sudo apt install -y
  nvidia-driver-535-server`, then `sudo modprobe nvidia` or reboot; `nvidia-smi`
  should list 4x V100.
- **Reachability:** inbound is gated by the **TWCC web-console security group**
  (host `iptables` is already open). Open **only** the one service port. Outside
  smoke test: `http://203.145.221.64:PORT/health`; if it hangs, the security group
  is still closed.

**Sidebar B — Home 3090 box:**
- **Driver:** likely already installed (headless Ubuntu Server); confirm with
  `nvidia-smi` showing 1x RTX 3090. If missing, install the matching
  `nvidia-driver-*-server` package the same way.
- **Reachability:** no cloud security group; expose via your router/LAN
  (port-forward or a tunnel) as appropriate for the venue. If it only needs to
  serve the camp's local network, no public exposure is required at all.

**Security reminders (both):** keep only the one service port reachable, keep the
token secret; on the public-IP VM specifically, consider a reverse proxy / rate
limit before exposing beyond the camp network.

You are likely running this session on the laptop repo, not on the VM, so you may
not be able to execute the VM-side steps. Write and **self-review** the runbook,
run whatever is runnable locally (lint, type-check the server, `uvicorn` boot on
CPU with `DEVICE=cpu` to confirm it serves and shapes are right), and clearly mark
which steps are VM-only for the operator.

## Step 5 — Verify

- **Server (local, CPU is fine):** boot with `DEVICE=cpu`; `GET /health` returns
  ok; each inference route returns the correct shape for a known example **and**
  for a novel input; out-of-vocab embedding returns the graceful `inVocab:false`
  payload. Confirm a known example's live output **matches** the precomputed
  artifact for that same input (the equality check that proves weights are shared).
- **Frontend:** with `VITE_LIVE_INFERENCE_URL` unset, all three stations behave
  exactly as before (precomputed). With it set to a running local server, typing
  custom input renders a live result; killing the server falls back cleanly with
  no crash.
- **Portability:** grep the server for hardcoded device ids / GPU counts / IPs /
  tokens and confirm there are none — switching machines is a `.env` edit only.
  Boot with `DEVICE=auto` and with `DEVICE=cpu` and confirm both start and serve.
- **Nothing else regressed:** `pnpm typecheck && pnpm lint && pnpm build` green;
  fixed-input stations untouched; no `three`/`onnxruntime-web`/torch pulled into
  the browser bundle; package boundaries intact (`@camp/data` gained a fetch
  helper only, no React, no viz).

## Definition of Done

- [ ] `server/` is a self-contained uv project that **imports model code +
      weights from `camp_precompute`**; live output equals the precomputed
      baseline for shared example inputs (verified, not assumed).
- [ ] `/health` + the three inference endpoints work, are **schema-compatible**
      with `points`/`neighbors`/`distributions`/`activations`, handle OOV and
      oversized input gracefully, and are token-authed + CORS-restricted.
- [ ] Weights/vocab export exists on the precompute side (small files, no large
      binaries committed) and is loaded once at startup on GPU-when-available.
- [ ] `@camp/data` has a `liveInfer` helper; the three stations use it **only for
      custom input, behind `VITE_LIVE_INFERENCE_URL`, with precomputed fallback**;
      fixed-input stations and package boundaries are untouched.
- [ ] **Portable across both targets:** no hardcoded device id / GPU count / VRAM
      / IP / token anywhere; the same code + image runs on the 3090 and the 4x
      V100 with only `.env` changing; `DEVICE=auto` and `DEVICE=cpu` both boot.
- [ ] `server/README.md` is a complete, ordered deploy runbook with a **shared
      path plus 3090 and V100 sidebars**, covering driver install (absent on VM,
      present on 3090), PEP 668 venv, systemd, reachability (TWCC security group
      vs. LAN port-forward), and the outside-reachability smoke test.
- [ ] `pnpm typecheck && pnpm lint && pnpm build` green; browser bundle carries no
      new heavy deps.

## Report when done

Output: the `server/` file tree, the final endpoint list with request/response
shapes (and which artifact each mirrors), how weights are shared with precompute
and the proof they match, the exact `@camp/data` + station diffs, which runbook
steps you ran vs. left for the VM operator, and a one-line pass/fail per Definition
of Done checkbox.
