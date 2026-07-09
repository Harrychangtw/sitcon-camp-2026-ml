# lora — train the persona adapters + bake the real presets

Replaces the hand-authored sample in
`apps/course2/public/data/course2/lora/{presets,adapters}.json` with RECORDED
real Qwen3-0.6B outputs, installs the trained adapters for the live server,
and turns on `/lora/generate`.

## 1. What it produces

| Artifact | Where | Committed? |
| -------- | ----- | ---------- |
| 4 trained LoRA adapters (`adapter_model.safetensors` + `adapter_config.json`) | `precompute/artifacts/lora/{wenyan,chuuni,service,scientist}/` | NO (gitignored weights) |
| `lora/presets.json` — base + adapter×α replies for the 5 preset prompts | `apps/course2/public/data/course2/lora/` | yes (small JSON) |
| `lora/adapters.json` — persona catalog + real param counts | `apps/course2/public/data/course2/lora/` | yes (small JSON) |
| manifest updates (`lora-presets`, `lora-adapters` ids, real bytes) | `apps/course2/public/data/course2/manifest.json` | yes |

Checkpoints/datasets used: base is the already-served **Qwen/Qwen3-0.6B**
(same instance as next-token/transformer — no second base). Adapters are
trained **from scratch here** (no public Qwen3-0.6B persona adapters fit) on
the four small inline style corpora in
`precompute/src/camp_precompute/lora.py` (~18 hand-written zh-TW QA pairs per
persona) — LoRA r=8, α=16, q/k/v/o, 300 steps each, a few minutes per adapter
on a V100.

## 2. Prereqs

- The base deploy from `server/README.md` is in place (repo cloned,
  `server/.venv` synced, systemd replicas running).
- `git pull` so the tree has the `lora` cli subcommand + router.
- Refresh the venv (new `peft` dependency):

```bash
cd ~/sitcon-camp-2026-ml/server && uv sync
```

## 3. The commands

Run precompute through the SERVER venv so the recorded presets use the exact
torch/transformers the live server answers with:

```bash
cd ~/sitcon-camp-2026-ml/precompute

# 3a. Train the four persona adapters (once; ~a few min each on a V100).
#     Writes precompute/artifacts/lora/<id>/ — gitignored weights.
uv run --project ../server camp-precompute train-lora

# (single persona iterate: uv run --project ../server camp-precompute train-lora --adapter chuuni)

# 3b. Bake the presets: real base + each adapter over the 5 preset prompts
#     at α ∈ {0.33, 0.67, 1.0} (greedy). Overwrites the hand-authored sample
#     and updates manifest.json.
uv run --project ../server camp-precompute lora
```

## 4. Verify

```bash
# generator must now be "camp-precompute lora", not the hand-authored note:
head -3 ../apps/course2/public/data/course2/lora/presets.json

# spot-check: the wenyan α=1.0 reply for 介紹一下你自己 should read 文言
python3 -c "import json;d=json.load(open('../apps/course2/public/data/course2/lora/presets.json'));print(d['outputs']['wenyan']['介紹一下你自己'])"

# param counts in adapters.json should be the REAL counted numbers
git diff --stat ../apps/course2/public/data/course2/
```

If a persona reads flat at α=1 (undertrained), re-run that adapter with more
steps: `... train-lora --adapter <id> --steps 600`, then re-run `lora`.

## 5. Deploy

```bash
# commit ONLY the small JSON (weights are gitignored)
cd ~/sitcon-camp-2026-ml
git add apps/course2/public/data/course2/lora apps/course2/public/data/course2/manifest.json
git commit -m "data: real lora presets from the V100 box"
git push

# restart every replica so loader.py attaches the new adapters
sudo systemctl restart camp-server@0 camp-server@1 camp-server@2 camp-server@3

# health: startup log must show "lora: attached adapters (idle-disabled): chuuni, scientist, service, wenyan"
journalctl -u camp-server@0 -n 20 | grep lora

# smoke test (after /auth per server/README.md §5; expect the same text as
# presets.json's outputs.wenyan['介紹一下你自己'][2]):
curl -sb "$JAR" -H 'Content-Type: application/json' \
  -d '{"prompt":"介紹一下你自己","adapter":"wenyan","alpha":1.0}' \
  http://127.0.0.1:8300/lora/generate
```

Frontend: redeploy (Vercel picks up the committed JSON). The station then
serves presets offline and live generation for typed prompts.

## Notes / knobs

- `/lora/generate` holds the per-process `lm_lock` for the whole greedy
  generation (≤64 new tokens, a few seconds on V100 fp32). The existing
  concurrency slot + queue (`MAX_CONCURRENT_INFER` / `INFER_QUEUE`) keep a
  classroom burst orderly; if the lora station gets its own class block,
  consider lowering `INFER_QUEUE` so students see 離線-fallback instead of
  long queues.
- Progression note: `rl-playground` moved from the `lesson` group into
  `panorama`, so `unlocked.txt` now counts only the SIX lesson stations
  (tokenizer…transformer). If prod currently ships `7`, change it to `6` (or
  leave it — overcounting fails open).
