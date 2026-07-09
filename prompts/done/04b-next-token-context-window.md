# Session: **Next Token: add a context-window slider** (Course 2, light adjustment)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: the `/next-token` station gains a **context-window
> slider** as its **primary** knob (how many trailing tokens of the prompt the
> model may see), Temperature/Top-k demoted to secondary, with
> `typecheck`/`lint`/`build` green. This is a **small, surgical adjustment** to an
> already-built, already-merged station, not a rebuild. Build it linearly in one
> thread; do not fan out into parallel agents.

This touches the built Next Token station (`apps/course2/src/stations/nextToken.tsx`),
the live server route (`server/app/routers/next_token.py` + `server/app/schemas.py`),
and the Qwen helper (`precompute/src/camp_precompute/qwen.py`). It **keeps** the
real-Qwen live-inference plumbing from `R2`/`DONE-04`. See `prompts/README.md` for
the wave history and the shared Definition of Done.

## Why we're doing this

Next Token sits at the top of Loop 2 in the deck, whose whole arc is 前文 → 記憶:
"看得越多，押得越準 → 可是句子會一直變長 → 得把前面記住 → RNN 的 hidden state."
The station currently exposes **Temperature / Top-k** (which are *how you sample
from* a distribution, really a Course 3 / generation concept). What Loop 2 actually
needs the student to feel is **context length → confidence**: shrink the window to
1-2 tokens and the prediction gets vague; widen it and the distribution sharpens.

The matching slide card (`slides/marp/deck/course2.md`, the「換你動手 _next-token 站_」
page) has **already been rewritten** to describe a context-window slider as the main
knob, with Temperature/Top-k kept as secondary. **Your job is to make the station
match that card.** Read that card first so the copy, the checkpoint, and the demo
sentences line up.

## The one hard caveat (read before building)

On a **live** model over arbitrary input, "narrow window mispredicts, wide window
fixes it" is **not monotonic or guaranteed**, some inputs will show flat or
counterintuitive results and undercut the point. The robustness lever is **curated
preset prompts** where the effect reliably holds. Do not skip Step 3: you must
actually run candidate presets through the model and keep only the ones where
shrinking the window visibly changes the top token(s).

## Step 0: Read first (in this order)

1. `CLAUDE.md`, golden rules (the browser never trains; light transform only).
2. `apps/course2/src/stations/nextToken.tsx`, the station you're adjusting. Note
   the preset-vs-live routing (`presetEntries` short-circuits the round-trip;
   anything else goes through `liveInferTimed("/next-token/predict", …)`), and the
   existing `DockControls` with 解碼方式 / Temperature / Top-k.
3. `server/app/routers/next_token.py` and `server/app/schemas.py`
   (`NextTokenRequest` / `NextTokenResponse` / `TokenLogit`).
4. `precompute/src/camp_precompute/qwen.py` → `next_token_entries` (it already
   truncates to the last `NEXT_TOKEN_MAX_TOKENS` tokens: `ids = ids[:, -N:]`).
5. `precompute/src/camp_precompute/cli.py` → `make_next_token` and
   `NEXT_TOKEN_PROMPTS`.
6. `slides/marp/deck/course2.md` → the「換你動手 _next-token 站_」card (already
   rewritten to the context-window framing you are matching).
7. `prompts/README.md` → Definition of Done; `prompts/DESIGN.md` → design language.

## Step 1: Server + Qwen: honour an explicit context window

- **`qwen.next_token_entries`**: add a param `context_tokens: int | None = None`.
  Compute `window = min(context_tokens or NEXT_TOKEN_MAX_TOKENS, NEXT_TOKEN_MAX_TOKENS)`
  and slice `ids = ids[:, -window:]`. `None` = today's behaviour (full 48-token cap),
  so no existing caller changes.
- **`NextTokenRequest`**: add `contextTokens: Optional[int] = Field(default=None, ge=1)`.
- **Router `predict`**: pass `context_tokens=req.contextTokens` into
  `qwen.next_token_entries(...)`.
- **`NextTokenResponse`** (and the station's `LivePredict` interface): add two
  fields so the UI can label + clamp the slider honestly:
  - `promptTokens: int`, total tokens in the prompt **before** truncation.
  - `contextTokens: int`, how many were **actually** used (the effective window).
  Populate them in the router (tokenize once to get the count). Keep the field names
  identical across Python and TS.

## Step 2: Station: add the context slider as the primary knob

In `apps/course2/src/stations/nextToken.tsx`:

- **State:** add `const [contextTokens, setContextTokens] = useState<number | null>(null)`
  where `null` means **全部 / full** (the top of the slider).
- **Control:** add a `BlockSlider` labelled **context 視窗** as the **first** child of
  `DockControls` (above 解碼方式). Range `1 … max`, `step 1`; the **max end** is the
  "全部" position (render `null`/full there). Until a prediction has reported
  `promptTokens`, fall back to a sensible fixed max (e.g. 16). Once a live/preset
  response is known, clamp the max to that `promptTokens` so the slider never
  promises more context than the prompt has. `format`: show `全部` at the top, else
  `${n}`.
  - Give it an `info` tooltip in the same voice as the others, e.g. "模型只看得到
    前文的最後幾個 token。視窗越小，可用線索越少、預測越不確定；放到「全部」就看整段前文。"
- **Routing (the important bit):** the preset short-circuit must only apply at
  **full** context. Change the guard so that when `contextTokens !== null` (a reduced
  window), the prompt goes through the **live** path with
  `liveInferTimed("/next-token/predict", { prompt: trimmed, contextTokens })`, even
  for preset prompts. At full context, keep today's behaviour (preset → recorded
  `distributions.json`, offline-safe). This means: classroom GPU (always on in wave 3)
  serves the windowed demo; offline it falls back to the cached full-context
  distribution and `LiveStatus` says "cached" honestly. Do **not** try to truncate by
  tokens in the browser, only the server tokenizes.
- **Keep Temperature / Top-k** exactly as they are, just below the context slider
  (secondary knobs; a soft teaser for Course 3). Do not remove them.
- **Takeaway:** update the copy so it leads with context, e.g. "模型能看到的前文越多，
  對下一個 token 越有把握，機率越集中。" Keep the existing note that these are real Qwen
  outputs and that「␣」means the token carries its own space.
- **No em-dashes anywhere.** Use commas, colons, or restructure. This is a hard repo rule.

## Step 3: Precompute: curate presets where the effect is robust

The demo must be dependable in front of a class. In `cli.py`'s `NEXT_TOKEN_PROMPTS`,
curate the list (zh + en, keep it multilingual) so that **at least 2-3 prompts**
show a clear "small window mispredicts / wide window fixes it" behaviour. Verify by
actually running each candidate at a narrow window and at full and comparing the top
tokens (write a throwaway check or reuse `qwen.next_token_entries(..., context_tokens=2)`
vs full). Keep only prompts where the difference is visible. A good candidate has a
strong long-range cue, e.g. a sentence whose ending is only predictable from an early
word.

Regenerate `distributions.json` (`uv run camp-precompute next-token`) and commit the
**small JSON + manifest entry only** (never `.onnx`/`.bin`). The presets remain
recorded **full-context** outputs (they back the offline fallback at the "全部"
slider position); windowed views are served live.

_Optional, only if you want offline-robust windowed demos:_ record a couple of window
sizes per preset into the artifact and let the station read those at reduced windows
before falling back to live. Skip unless it's cheap, the classroom GPU covers the
live case.

## Step 4: Verify

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm --filter @app/course2 dev   # open http://localhost:5173/next-token
```

- Type a sentence; drag **context 視窗** from 全部 down to 1-2 tokens and watch the
  distribution get vaguer/flatter; widen it and watch it sharpen.
- On a curated preset, the narrow-window top token is clearly wrong and the
  wide-window one is right.
- Temperature/Top-k still reshape the distribution as before.
- `LiveStatus` shows "live (…ms)" for windowed requests and stays honest ("cached")
  if the server is down. No console errors; no onnx/three at module scope.
- If you have the server locally: `curl` the route with and without `contextTokens`
  and confirm `promptTokens`/`contextTokens` come back and the entries differ.

## Definition of Done

Shared contract (`prompts/README.md` items 1-7 and the design item 8), plus
**this-adjustment-specific**:

- [ ] Server truncates to an explicit `contextTokens` (last-N tokens) and returns
      `promptTokens` + `contextTokens`; `None`/absent = unchanged 48-cap behaviour.
- [ ] Station has a **context 視窗** slider as the primary dock control; reducing it
      routes through the live path (even for presets); 全部 keeps the offline-safe
      preset path.
- [ ] Temperature/Top-k retained as secondary controls.
- [ ] `NEXT_TOKEN_PROMPTS` curated + verified so the context effect is visible on at
      least 2-3 presets; `distributions.json` regenerated (JSON + manifest only).
- [ ] Copy matches the deck's next-token card; **no em-dashes** anywhere.
- [ ] `pnpm typecheck && pnpm lint && pnpm build` green; route renders with no
      console errors.

## Report when done

Output: files changed (station + router + schemas + qwen + cli + manifest), the new
request/response fields, which presets you curated and the before/after top tokens
that prove the effect, whether you took the optional per-window recording path, and a
one-line pass/fail per checkbox.
