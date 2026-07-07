# SERVER — Scale live inference across all 4 V100s for a 60-person burst

> **Ops/infra session. Self-contained.** Paste into a fresh Claude Code session
> in this repo. Read `CLAUDE.md`, `server/README.md` (esp. the "Concurrency" +
> "Deploy runbook" sections), `server/app/config.py`, `server/app/loader.py`,
> `RUN.md`, and `scripts/serve.sh` first. This session changes **deploy config +
> a runbook + a benchmark**, not the model code. Keep the app device-agnostic —
> the portability rule in `config.py` ("nothing hardcodes a device id, GPU count,
> VRAM size, IP, or token") must still hold when you're done.

## Why this session

Course 2's live-inference server (`server/`) today runs **one uvicorn process on
`cuda:0`** — by deliberate design, because the models are tiny (`Qwen3-0.6B` +
`Qwen3-Embedding-0.6B` + a small GRU, ~5 GB total). On the 4× Tesla V100 box the
other **three GPUs sit idle** (`config.py:resolve_device` → always `cuda:0`;
systemd/`serve.sh` start a single process with no `--workers`).

That was sized for "~40 students." The camp will run **~60**, and the **loop
pedagogy drives synchronized bursts** — the instructor sends the whole class onto
the *same* station to type at the *same* time. The heavy route is
`/transformer/attention` (extracts a 28-layer × 16-head tensor, builds ~1–2 MB of
JSON, hundreds of ms), and all LM routes serialize behind one in-process
`lm_lock`. A 60-way synchronized burst on that route serializes on one GPU →
worst-case last-student latency in the **10–20 s** range. We have 4 GPUs already
paid for and idle. Use them.

## Decision (made — DO NOT relitigate)

**Scale by process replication: run 4 independent single-GPU server processes,
each pinned to one physical V100 via `CUDA_VISIBLE_DEVICES`, behind one
reverse-proxy that load-balances the single public port across them.** The app
code stays as-is (each process sees only its card, so `resolve_device` still
returns `cuda:0` inside it). This is opt-in **deploy config** for the V100 box;
the 3090/dev box keeps running the existing single process unchanged.

**Explicitly rejected — do not build these:**
- ❌ **Sharding one model across GPUs** (`device_map="auto"`, tensor/pipeline
  parallel, FSDP, `nn.DataParallel`/`DDP`). Those solve "model too big for one
  GPU" or "make one forward faster." Our models fit on one card with room to
  spare; sharding a 0.6B model across 4 cards is *slower* (cross-GPU copies /
  serialized stages) and solves the wrong problem. We need **throughput** for
  many small independent requests, not a faster single forward.
- ❌ **`uvicorn --workers N` in one service.** All workers inherit one
  environment, so you cannot give each a distinct `CUDA_VISIBLE_DEVICES` — they'd
  all pile onto one card. Replication must be **N separate processes, each with
  its own env** (that's what the templated systemd unit below is for).
- ❌ **An in-process multi-GPU replica pool** (load the model 4× in one Python
  process and dispatch across replicas). Possible, but the GIL caps concurrency
  on the CPU-bound transformer-JSON path, and it's hand-rolled dispatch/lock
  code. Separate processes sidestep the GIL entirely and reuse the existing code
  verbatim — the standard way inference servers replicate.
- ❌ A cross-request **batching queue.** Real option, but more complexity than a
  60-person camp needs; leave a one-line pointer to it as future work.

## Part 0 — keep the app portable (near-zero code change)

The point is that **almost nothing in `app/` changes.** Verify and, at most:
- Confirm `resolve_device("auto")` still returns `cuda:0` when
  `CUDA_VISIBLE_DEVICES=<one index>` masks the box to a single visible card —
  each process is single-GPU *from its own point of view*. Don't special-case
  multi-GPU in `config.py`; the masking does the work.
- Optional, log-only: have startup log the value of `CUDA_VISIBLE_DEVICES` (or
  the physical GPU name `/health` already reports) so `journalctl` shows which
  card each process landed on. No behavioral change, no new required env.
- Do **not** add a GPU-count or device-id setting to `Settings`; that would
  break the "one codebase, only `.env` differs" rule.

## Part 1 — templated systemd unit (one per GPU)

Add `server/deploy/camp-server@.service` — a **template** unit where `%i` is the
GPU index:
- `Environment=CUDA_VISIBLE_DEVICES=%i`
- `Environment=PORT=${BASE_PORT + %i}` (e.g. base 8300 → 8300/8301/8302/8303).
  Bind each to **`127.0.0.1`**, not `0.0.0.0` — only the proxy is public.
- `EnvironmentFile=` the shared `server/.env` for `CAMP_TOKEN` / `ALLOWED_ORIGINS`
  / `DEVICE=auto`.
- `ExecStart=…/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port ${PORT}`
- `Restart=on-failure`.

Enable all four: `systemctl enable --now camp-server@0 camp-server@1
camp-server@2 camp-server@3`. Keep the existing single-unit `camp-server.service`
in `server/README.md` for the 3090 box (they're mutually exclusive — document
which box uses which). Note startup: the HF weight cache (`HF_HOME`) is shared on
disk, so only the first process to start downloads; the rest read from cache and
just load into their own card's VRAM.

## Part 2 — the load-balancing proxy (one public port → 4 backends)

Add `server/deploy/Caddyfile` (and/or an nginx equivalent) that reverse-proxies
the **single public port** to the four `127.0.0.1:830x` backends:
- **`lb_policy least_conn`** (nginx: `least_conn;`), **not** round-robin — a
  transformer request costs far more than an embedding lookup, so balance by
  in-flight count, not request count.
- **Active health checks** against `GET /health` (unauthed by design); eject a
  backend that fails so one crashed GPU worker doesn't 502 a quarter of the class.
- **Pass through** `X-Camp-Token` and `Content-Type`; preserve the client's
  Origin so CORS still works. Don't double-compress — the backend already gzips
  responses ≥8 KB (`GZipMiddleware`); let the proxy pass the gzipped body through.
- This proxy is also the natural **TLS terminator** — it resolves the https
  mixed-content note in `RUN.md`/`README.md` (course2 served over https must call
  an https backend). Keep the security posture from README Sidebar A: **exactly
  one** inbound port open (the proxy); backends are localhost-only.

## Part 3 — launcher + runbook (fit the EXISTING two-funnel setup)

**Current topology you must slot into (do not redesign it):** `scripts/serve.sh`
runs the backend (uvicorn on `PORT`, default **8300**) + the course2 frontend
(vite on 5173) in one tmux session, and **two tailscale funnels are already
live**:
- frontend: `tailscale funnel 5173` → public frontend URL;
- backend: `sudo tailscale funnel -bg -https=8443 8300` → public **`https://<host>.ts.net:8443`** maps to **local `:8300`** (today, the single uvicorn).

`apps/course2/.env.local`'s `VITE_LIVE_INFERENCE_URL` points at that `:8443`
backend URL. The whole scaling change must be **invisible to both funnels**: the
two public URLs stay exactly the same; only *what sits behind local `:8300`*
changes — from one uvicorn to `proxy → 4 uvicorns`.

- **Keep the funnel command byte-for-byte identical** (`-https=8443 8300`). The
  proxy takes over **local `:8300`**; the 4 backends move to
  `127.0.0.1:8301..8304`. So the funnel still forwards `8443 → 8300`, but `8300`
  is now the proxy, which `least_conn`-balances to `8301..8304`. The frontend
  funnel (5173) is untouched, and `VITE_LIVE_INFERENCE_URL` does not change —
  students hit the same `:8443` URL. **Do not** move the funnel to a different
  port; make the ports fit the funnel, not the other way around.
- Update `scripts/serve.sh` (or add `scripts/serve-multi.sh`) with a **V100-prod**
  path that starts: the 4 pinned backends + the proxy + the frontend, and leaves
  the two existing funnels serving the same ports. tmux layout is fine for a
  manual run (systemd is the durable path from Part 1); mirror the existing
  session's ergonomics (detach/reattach). The single-process dev/3090 path in
  `serve.sh` must keep working untouched (`scripts/serve.sh` / `serve.sh dev`).
- **Rewrite `RUN.md` for prod clearly** — this is a required deliverable, not a
  footnote. Section 4 ("Launch") and 5 ("Expose publicly") currently describe one
  uvicorn + `tailscale funnel 5173` and hand-wave the backend funnel ("funnel the
  backend port as well"). Replace with an explicit **prod launch** subsection that
  states, in order: (1) start the 4 GPU backends (systemd `camp-server@0..3` or
  the multi launcher), (2) start the proxy on the backend-funnel's port, (3)
  confirm both funnels are up (`tailscale funnel status` — 5173 + backend port),
  (4) the sanity checks below. Show the concrete commands. Keep the existing
  single-process/dev instructions as a clearly separated "dev / 3090" path so a
  reader can't confuse the two.
- Rewrite `server/README.md` **"Concurrency (deliberately simple)"**: it currently
  says multi-GPU scaling is "future work, deliberately not built now." Replace
  that with the real runbook (this design); keep the single-process path as the
  documented 3090 option.
- `server/.env.example`: add `BASE_PORT` / `PROXY_PORT` (whatever the scripts
  read) with comments; make clear the 4-process path is a **deploy choice**, not a
  code mode, and that the funnels are unaffected.

## Part 4 — prove the burst win (this is the acceptance evidence)

Add `server/scripts/loadtest.py` — an asyncio/httpx client that fires **≥60
concurrent** authed requests at a chosen route and reports **p50 / p95 / max
latency + throughput (req/s)**:
- Default target: `/transformer/attention` (the heavy, `lm_lock`-serialized
  route — the real bottleneck). Include a light route (`/embedding/lookup`) for
  contrast.
- Run it twice — against the **single-process** deployment and against the
  **4-process** deployment — and record both in the handoff. Expected shape:
  the heavy-route p95/max drops ~**4×** (60 serialized on 1 GPU → ~15 per GPU on
  4). If it doesn't, the proxy isn't actually spreading load — diagnose before
  claiming done (check `lb_policy`, backend health, that all 4 units are up).
- Keep it a dev tool (needs `CAMP_TOKEN` + base URL as args/env); it must not be
  imported by `app/`.

## Definition of Done

1. On the V100 box, **4 uvicorn processes** run, each pinned to a distinct
   physical V100 (`CUDA_VISIBLE_DEVICES=0..3`); hitting each internal
   `127.0.0.1:830x/health` reports a **different** GPU. The proxy serves one
   public port, `least_conn`-balances across all 4, and ejects an unhealthy
   backend.
2. **Portability intact:** no device id / GPU count / IP is hardcoded in `app/`;
   `DEVICE=auto` still resolves `cuda:0` per process; the single-process 3090/dev
   path is unchanged and still documented. Multi-GPU is purely deploy config.
3. **Correctness across replicas:** the same typed input sent to any backend
   returns **byte-identical rounded output** (same weights + same deterministic
   settings + same GPU model → identical to the exported rounding). Verify by
   curling one preset prompt against each internal port — a student who refreshes
   onto a different GPU must get the same answer. The live==preset invariant from
   `SERVER-live-inference.md` still holds.
4. **Benchmark committed:** `loadtest.py` numbers for 1-process vs 4-process at
   ≥60-way concurrency on `/transformer/attention` are in the handoff, showing a
   ~linear (toward 4×) improvement on p95/max. State the actual measured numbers,
   not an estimate.
5. **Security posture preserved:** still exactly one public port (the proxy);
   backends bound to `127.0.0.1`; `CAMP_TOKEN`, CORS `ALLOWED_ORIGINS` (no
   wildcard), and per-route input caps all unchanged and still enforced through
   the proxy.
6. **Two funnels unchanged, prod runbook clear:** both existing tailscale funnels
   (5173 frontend + backend port) still serve the **same public URLs**;
   `VITE_LIVE_INFERENCE_URL` is unchanged; the backend funnel now fronts the proxy
   → 4 backends. `RUN.md` has an explicit, ordered **prod launch** subsection
   (start 4 backends → start proxy on the funnel's port → `tailscale funnel
   status` shows both → sanity checks), kept separate from the dev/3090 path.
   Verify end-to-end: load the public frontend URL, type a novel word / prompt on
   a live station, confirm a real GPU response comes back through the funnel →
   proxy → a backend.
7. **Runbook + green:** `server/README.md` "Concurrency" describes the 4-GPU launch
   and the benchmark; `pnpm typecheck && pnpm lint && pnpm build` still pass
   (frontend untouched or trivially so); the server still boots single-process on
   a 1-GPU/CPU box.

## Notes / gotchas

- **VRAM budget:** 4 replicas × ~5 GB = ~20 GB *total*, but one replica per
  32 GB card — comfortable. Each process independently loads Qwen + embedding +
  the GRU npz onto its own card.
- **Don't expose backends.** Bind them to `127.0.0.1`; the box has a public IP
  (README Sidebar A) — an open unauthed-`/health`-plus-token backend on `0.0.0.0`
  × 4 is 4× the attack surface for no reason.
- **HF cache stampede:** if `~/.cache/huggingface` is cold, 4 processes starting
  together could each try to download. Warm it once (start one process, let it
  pull, then start the rest) or pre-fetch in the runbook.
- **Health check auth:** `/health` is intentionally unauthenticated (README) —
  good, the proxy can probe it directly. The inference routes still require
  `X-Camp-Token`; make sure the proxy forwards that header unmodified.
- **Determinism across boxes, not just replicas:** all 4 are V100s, so
  float results match; if you ever mix card *types* behind one proxy, last-digit
  drift is possible (README already warns about cross-torch drift) — keep the
  replicas homogeneous.
- Leave a single sentence pointing at a **batching queue** as the next lever if
  even 4-way isn't enough — but don't build it this session.
