# Server-run runbooks

Stations are BUILT on a no-GPU dev MacBook: all code is written and the UI is
verified against a small committed hand-authored sample artifact. The REAL
artifacts (recorded model outputs) and the live serving come from running the
steps in these runbooks on the GPU box (currently the TWCC 4× V100 VM; see
`server/README.md` for the base deploy).

Each runbook is one file per station/feature and follows this template:

1. **What it produces** — the artifacts written, where they land, which
   manifest ids they update, and what sample they replace.
2. **Prereqs** — which model state must already exist (weights, adapters,
   earlier precompute steps), and the venv to use (`server/.venv` has torch +
   the camp-precompute editable install;
   `cd server && uv sync --extra gpu` refreshes it).
3. **The commands** — exact `uv run camp-precompute …` invocations, in order.
4. **Verify** — how to check the artifacts are real (spot-check the JSON,
   `git diff` the manifest bytes).
5. **Deploy** — commit the small JSON, restart the server replicas, health
   check, and the one-line classroom smoke test.

Conventions:

- Run precompute through the **server venv** (`server/.venv`) so the artifact
  build uses the exact torch/transformers the live server serves with — that
  is what keeps "presets are recorded real outputs" honest.
- **Sync `server/.venv` with `uv sync --extra gpu`, never plain `uv sync`.**
  diffusers/accelerate arrive via the `gpu` extra, so a plain sync silently
  uninstalls them and `/diffusion/generate` breaks on the next replica
  restart (bitten 2026-07-09). After any sync, verify:
  `uv run python -c "import peft, diffusers"`.
- Weights (safetensors/npz) stay in `precompute/artifacts/` (gitignored);
  only the small JSON under `apps/course2/public/data/course2/` is committed.
- After any router/loader change, restart ALL replicas
  (`sudo systemctl restart camp-server@0 camp-server@1 camp-server@2 camp-server@3`)
  and re-run the smoke test in `server/README.md` §5.
