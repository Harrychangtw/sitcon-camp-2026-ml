# Course 3 panorama — station-build prompts

Course 3 (「拉開全景」, `docs/course-spec.md`) is the flashy, divergent third
lesson: after two lessons of "one line punched through" (data → model →
architecture), students see that the ML world is much bigger than that line.
Each panorama station is still one interactive canvas with one student-turnable
knob — but the models behind them are REAL, big-ish, and pre-trained.

Same workflow as `prompts/README.md`: one self-contained prompt per session,
paste into a fresh Claude Code session, build linearly to done. Build in this
order — the first prompt establishes shared scaffolding the later ones reuse.

## The stations

| # | Prompt | Station | Shared scaffolding it builds |
|---|--------|---------|------------------------------|
| 1 | `01-lora.md` (this wave's first session) | LoRA — 貼一張小紙條，模型就換了個性 | the `panorama` `StationGroup` + nav section, RL reclassification, `@camp/ui` `GuidedTour` |
| 2 | (future) ComfyUI — 影像生成 | reuses all of the above |
| 3 | (already built, reclassified here) RL Playground — Critter Arena | moves from `lesson` into `panorama` |
| 4 | `04-skyfall-gs.md` | Skyfall-GS — 衛星長出城市 (fly a real satellite-reconstructed city, A/B the diffusion-imagined detail) | `@camp/viz` `SplatViewer` (fly + orbit), the splat prune/convert precompute path, the force-add binary convention for splats |
| 5 | `05-trellis-text-to-3d.md` | TRELLIS — 文字生 3D (prompt presets → spinnable 3D objects, seed flip) | reuses 04's `SplatViewer` + converters; **build 04 first** |

## The rules (each prompt cites these by number)

1. **One knob per student.** Every station has something the STUDENT turns
   (adapter / prompt / α / reward / node param) — never a watch-the-instructor
   demo. (course-spec 參與感底線.)
2. **Fetch from checkpoints, don't train.** All training happens ahead of time
   (`precompute/`, or a documented offline run). The station loads pre-trained
   checkpoints/adapters; the classroom only loads + plays. Reuse the
   already-served Qwen3-0.6B wherever an LM is needed — no second base model.
3. **Front-loaded precompute.** A `camp-precompute` subcommand bakes the preset
   interactions (prompt × knob positions → recorded real outputs) into small
   JSON under `apps/course2/public/data/course2/<station>/`, listed in
   `manifest.json`. The 30 classroom minutes go to playing, not loading.
4. **Offline-safe.** The station is fully usable with the live server OFF:
   presets cover every knob position. Live inference is the upgrade, not the
   requirement.
5. **Guided tutorial.** Panorama stations meet students LATE in the camp with
   unfamiliar concepts — each one runs a skippable first-load `GuidedTour`
   (`@camp/ui`) that walks the loop once: what this is → touch the knob → see
   the change → the takeaway.
6. **Live server per station.** Custom typed input goes through a
   `server/app/routers/<station>.py` router reusing the existing lm-lock /
   auth / rate-limit machinery, called with `liveInferTimed`, surfaced with
   `LiveStatus` (latency + fallback transparency only).
7. **Panorama ≠ lesson progression.** Panorama stations live in the `panorama`
   `StationGroup`: they show in the nav under their own section and are NEVER
   gated by `unlocked.txt` (that lock counts `lesson` stations only). RL
   Playground belongs here, not in the Course 2 lesson line.
8. **Dev MacBook vs prod GPU.** Sessions are built on a no-GPU dev machine:
   write all code, verify build + UI against a small committed hand-authored
   sample artifact, and emit a runbook to `prompts/server-runs/<station>.md`
   with the exact GPU-box commands (precompute run, artifact regeneration,
   manifest update, deploy + restart + health check). Never run GPU work in
   the session.

Plus the shared Definition of Done in `prompts/README.md` (#1–8) — golden
rules, package boundaries, controls-drive-state, green build, design language.

## UI conventions the panorama stations inherit

- **Inline glossary:** every dock control carries an `info` (hover-revealed
  plain-language explanation) and, where the term is jargon, a `gloss`
  (always-visible one-line 白話文 identity) via `InfoLabel` — the convention
  every Course 2 station already follows.
- **Hover-reveal controls:** dock controls idle quiet and reveal detail
  (value bubbles, info panels) on hover — `BlockSlider` / `BlockToggle` /
  `DockControls` already implement this; use them, don't rebuild.
- **Copy style:** 正體中文, no em-dashes, tight sentences; mono/uppercase
  micro-labels; lime accent only for the focused element (`prompts/DESIGN.md`).
