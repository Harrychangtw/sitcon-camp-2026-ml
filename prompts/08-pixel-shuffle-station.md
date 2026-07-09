# Session: **打亂像素 (Pixel Shuffle)** — rebuild the 順序撞牆 station on the morning class's CIFAR MLP — Course 2

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: a new `/pixel-shuffle` lesson station that
> **replaces `/order-shuffle` at lesson slot 3**: students train **two identical
> MLPs live in the browser** — one on real CIFAR-10 images, one on the same
> images with **every pixel shuffled by one fixed permutation** — and watch the
> two loss/accuracy curves land on the same spot, then hover neurons to see the
> two nets learned the *same* weights (modulo the shuffle).
> `typecheck`/`lint`/`build` green. This is one tightly-coupled build (data pack
> → worker trainer → station UI all depend on each other) — build it **linearly
> in one thread**, no parallel agents/worktrees. When the diff is done, run
> `/code-review high`.
>
> The deck rewrite is a **separate follow-up session**
> (`prompts/MARP-06-pixel-shuffle-loop1.md`) — do NOT touch
> `slides/` or `docs/course-spec.md` in this session, but DO record in your
> report the real numbers the deck session will need (final val accuracies etc.).

## Why we're doing this (the pedagogy overhaul)

The current 打亂詞序 station (`apps/course2/src/stations/orderShuffle.tsx`)
demonstrates order-blindness via **mean-pooled word embeddings** — a bag-of-words
fingerprint that provably can't move under shuffle. It works, but the mechanism
(averaging vectors) is abstract for students who don't yet think in vectors.
That's Harry's call to replace it; do not re-litigate.

The replacement leans on something students **did with their own hands that
morning**: Part 1 (`sitcon-camp-2026-ml-pt1`) ends morning session 1 with a
"Train a net on images" playground — a tiny MLP trained **live in the browser**
on CIFAR-10, with hover-a-neuron weight inspection. This station re-stages that
exact experience as a **controlled experiment**:

- Take the same tiny MLP and the same CIFAR-10 subset.
- Apply **one fixed random permutation π to the pixels of every image** (train
  and test alike). To a human the shuffled images are unrecognizable static.
- Train both nets side by side. **They converge to the same loss and the same
  accuracy** — because to an MLP, pixel positions are just wire labels; a fixed
  relabeling doesn't change the learning problem at all.
- Hover the same hidden neuron in both nets: the shuffled net's weight template
  looks like noise — until you press **還原排列** (undo the permutation) and it's
  the *same template* the normal net learned.

That's the wall, felt on pixels instead of vectors: **an MLP has no assumption
that arrangement means anything.** You can see the difference; it literally
cannot. The deck then transfers this to word order (故事 vs 事故) and lands on
RNN, same as before.

**Historical note:** `docs/course-spec.md` line 151 records that the word-order
station originally *replaced* a "CNN pixel-shuffle" idea. This brings
pixel-shuffle back — viable now because the morning class ships the in-browser
trainer and the students' mental model to anchor it.

**Goal:** a student presses ▶ 訓練, watches two curves overlap and converge,
flips between「你看到的」and「模型看到的」views of the same image, hovers a
neuron and un-shuffles its weights — and walks away knowing the MLP never saw
the difference.

## The golden-rule carve-out (decision made — encode it, don't fight it)

`CLAUDE.md` says the browser never trains. **This station is the one sanctioned
exception**, and the reason is pedagogical, not convenience: the lesson *is*
"the net you trained this morning" — replaying a baked curve would gut it. The
morning class already proves this exact compute is light: a hand-rolled
`Float32Array` MLP (3072→64→10, ~200k params) on a 2,200-image subset trains to
plateau in tens of seconds inside a **Web Worker**, no GPU, no tfjs, UI thread
untouched.

As part of this session, **amend `CLAUDE.md`'s golden-rule section** with a
scoped exception (2–3 lines): in-browser training is allowed **only** for the
pixel-shuffle station, only in a Web Worker, only at this toy scale
(≤ ~2,200 tiny images, ≤ ~1 M params), because it re-enacts the morning class's
own in-browser trainer. Everything else about the rule stands — the dataset
pack and permutation are still **precomputed artifacts** shipped via
`manifest.json`, and no other station may cite this exception.

## The reference we're porting from (this one we DO port code from)

Clone the morning-class repo into the gitignored reference dir:

```bash
git clone --depth 1 https://github.com/burnedinthesky/sitcon-camp-2026-ml-pt1 .reference/sitcon-camp-2026-ml-pt1
```

(Ignore its README/docs — stale. Read the code. It's the camp's own material,
same instructors; porting is intended.) The relevant surface — read all of it:

- `src/lib/workshop/cnn/net.ts` — the hand-rolled MLP: flat `Float32Array`s,
  He-ish init, seeded xorshift RNG (seed `20260709`), mini-batch **SGD +
  momentum 0.9** on softmax cross-entropy, `trainBatch(xs, ys, lr, momentum)`.
- `src/lib/workshop/cnn/trainer.worker.ts` — the training loop:
  `TICK_MS = 33`, `BATCHES_PER_TICK = 3`, `SNAPSHOT_EVERY = 6`,
  `VAL_EVERY = 18`, `VAL_SAMPLE = 500`, EMA-smoothed loss/acc.
- `src/lib/workshop/cnn/client.ts` + `protocol.ts` — main-thread proxy + typed
  worker messages.
- `src/lib/workshop/cnn/presets.ts` — arch presets (`small: [64]`,
  `wide: [128]`, `deep: [128,64]`); `DEFAULT_TRAIN = { lr: 0.05, momentum: 0.9,
  batchSize: 16, act: 'relu' }`.
- `src/lib/workshop/cnn/dataset.ts` — the pack format (see Step 1) and loader:
  `fetch` + native `DecompressionStream('gzip')`, values `byte/255 −
  per-channel mean`. **Deliberately not PNG** — canvas `getImageData` read-back
  goes black in headless/GPU contexts and silently feeds constant input.
- `src/components/workshop/phases/P6Playground.tsx` + `src/lib/workshop/draw/`
  (`mlpDiagram.ts`, `paintVol.ts`, `probBars.ts`) — the diagram (≤12 nodes
  sampled per column, activation-tinted fills, hover hit-testing), the
  weight-template renderer (`'signed'` mode: lime = +, purple = −), the softmax
  class bars. Its `theme.ts` palette is the **same** near-black/lime/cyan/purple
  as `prompts/DESIGN.md` — the visuals port naturally.

Port what you need **into the station's own folder** (see Step 2) — lesson
logic never goes into `@camp/*` packages. Keep the ported files' house-style
comments; adapt, don't transliterate.

## Decisions already made (build to these)

1. **Live twin training in ONE Web Worker.** Two net instances, trained in
   lockstep: each tick draws one batch of indices and feeds **the same indices
   to both nets** (net B just sees the π-permuted pixels). Not precomputed
   playback.
2. **Permuted-copy initialization (load-bearing).** Generate net A's init, then
   set net B's first-layer weights to the **π-relabeled copy** (if shuffled
   position `p` holds original pixel `orig(p)`, then
   `W_B[j][p·3+c] = W_A[j][orig(p)·3+c]`); biases and deeper layers are exact
   copies. Both runs are then the *same arithmetic under renamed wires* — so
   curves coincide (small late drift from float summation order is expected and
   honest — say so in a tooltip, don't hide it), per-image probability bars
   match, and hidden unit *i* of net B un-shuffles into hidden unit *i* of net
   A. This is the theorem made visible, and it's what makes the hover
   comparison land. ↺ 重來 re-seeds and re-applies the same construction.
3. **π permutes the 1,024 pixel POSITIONS, RGB triplets move together.** One
   fixed seeded permutation, shipped in the artifact, applied to every train
   and val image. (Not a per-scalar 3,072 shuffle — colors must survive so the
   shuffled view reads as "the same paint, scattered".)
4. **Architecture/hyperparams mirror the morning defaults, no knobs:**
   3072 → [64] → 10, ReLU, lr 0.05, momentum 0.9, batch 16, seeded RNG.
   Students already turned those dials in the morning; here the experiment is
   the point. (Arch presets are an open decision, below.)
5. **Fully offline, no server changes.** No live GPU endpoints, no `LiveStatus`,
   no typed input. The 4×V100 stack is untouched.
6. **Registry: `pixel-shuffle` replaces `order-shuffle` at lesson slot 3.**
   New `{ id: "pixel-shuffle", title: "打亂像素", group: "lesson" }` in
   `apps/course2/src/stations/registry.tsx` at the position `order-shuffle`
   holds now (the lesson count stays 6, so `unlocked.txt` semantics are
   unchanged). Demote `order-shuffle` to `group: "dev"` (URL-only, still
   reachable for instructors) — do not delete the file or its server routes.

## Step 0 — Read first

1. `CLAUDE.md` — golden rules (you will amend one, see the carve-out above),
   package boundaries, lazy-import rule.
2. `prompts/DESIGN.md` + `prompts/README.md` → shared Definition of Done
   (items 1–8). Note DoD item 2's wording will now defer to the CLAUDE.md
   carve-out for this station.
3. `apps/course2/src/stations/transformer.tsx` — **the layout to copy**: the
   dense, horizontally-scrollable left→right pipeline (`Column`/`Arrow`
   helpers, the row-alignment constants, `justify-content: safe center`,
   `DockControls`, `HoverTip` group-hover tooltips, `usePrefersReducedMotion`).
4. `apps/course2/src/stations/orderShuffle.tsx` — the station being replaced
   (loading/error idiom, `StationLayout fullBleed` usage) and
   `src/stations/rl/` + `rlPlayground.tsx` — precedent for a station with its
   own subfolder of lesson-specific engine code.
5. `packages/viz/src/LossCurve.tsx` — already real: multi-series, theme
   categorical colors, `upTo` replay cursor. Use it for the twin curves; extend
   (prop-driven, no lesson data) only if you must.
6. `apps/course2/src/lib/progression.tsx` + `src/lib/classroom.tsx` — how
   lesson stations are gated. Stations do NOT report completion; nothing to
   wire.
7. `precompute/src/camp_precompute/cli.py` — subcommand + `upsert_manifest_artifact`
   pattern; `.gitignore` — note the comment that root-anchored
   `public/data/**` patterns do NOT match `apps/course2/public/data/` — new
   ignore lines need the `**/` prefix.
8. The `.reference/sitcon-camp-2026-ml-pt1` files listed above.

## Step 1 — Precompute: the CIFAR pack + permutation artifact

Add a `pixel-shuffle` subcommand to `cli.py` writing to
`apps/course2/public/data/course2/pixel-shuffle/`:

- **`cifar10.bin.gz`** — same pack format as the morning class so the ported
  loader works verbatim: raw bytes, **HWC-interleaved, sample-major**
  (`byte(s,y,x,c) = s·3072 + (y·32+x)·3 + c`), 2,000 train + 200 val,
  class-balanced (200/20 per class), seeded selection, gzipped (~6.4 MB).
  Source the data by downloading and parsing the **CIFAR-10 binary tarball**
  directly (`https://www.cs.toronto.edu/~kriz/cifar-10-binary.tar.gz`,
  urllib + tarfile + numpy — no new heavy deps; note the tarball stores
  **CHW planes**, transpose to HWC). Cache the download outside the repo or in
  gitignored `precompute/artifacts/`.
- **`meta.json`** — `{ tile: 32, depth: 3, trainN: 2000, valN: 200, labels,
  mean: [r,g,b] (computed per-channel over the train split), classNames_en,
  classNames_zh (飛機/汽車/鳥/貓/鹿/狗/青蛙/馬/船/卡車), permutation:
  [1024 ints], permutationSeed, arch, train: {lr, momentum, batchSize} }` —
  everything the browser needs, single source of truth for π and the
  hyperparams.
- Register both in `manifest.json` via `upsert_manifest_artifact`
  (`kind: "bin"` / `"json"`, `station: "pixel-shuffle"`). Remove nothing of
  order-shuffle's artifacts.
- **Gitignore + deliberate commit:** add
  `**/public/data/**/pixel-shuffle/*.gz` to `.gitignore` (with the `**/`
  prefix — see the load-bearing note already in that file), then commit the
  ~6.4 MB pack **deliberately with `git add -f`** (skyfall/text-to-3d
  precedent) so a fresh checkout runs the classroom offline. `meta.json` is
  committed normally.

## Step 2 — The trainer: port the worker into the station's folder

Create `apps/course2/src/stations/pixelShuffle/` (station-local — this is
lesson logic, none of it enters `@camp/*`):

- `net.ts`, `trainer.worker.ts`, `client.ts`, `protocol.ts`, `dataset.ts` —
  ported from the reference, adapted:
  - The worker owns **both nets**. On `init` it receives the decoded pack +
    `meta.json`; it builds run B's dataset by applying π once (an O(N) copy),
    constructs the permuted-copy init (decision 2), then each tick trains both
    nets on the same batch indices and snapshots
    `{ step, lossA, lossB, accA, accB, valAccA, valAccB, actsA, actsB }` plus
    on-demand weight rows (`reqWeights` for a given net/layer/neuron).
  - Keep the reference cadence (33 ms ticks, 3 batches/tick — now ×2 nets;
    halve `BATCHES_PER_TICK` if profiling shows jank, and say so).
  - Deterministic seeds throughout so 重來 is reproducible.
- Instantiate via Vite's worker idiom
  (`new Worker(new URL("./trainer.worker.ts", import.meta.url), { type: "module" })`)
  inside an effect, terminate on unmount. If `tsc` complains about worker
  globals, extend the app tsconfig `lib` with `WebWorker` — don't sprinkle
  `any`.
- Port `paintVol` (signed lime/purple weight templates + raw image painting)
  and the diagram/hit-testing logic you need. Rendering pixel images at 32×32
  → upscaled with `image-rendering: pixelated` canvases is 2D-canvas only — no
  `three`, no `onnxruntime-web`, no SSR hazards beyond the usual
  effect-guarded canvas work.

## Step 3 — The station: a dense horizontal twin-lane pipeline

`StationLayout fullBleed`, one horizontally-scrollable canvas in the
`transformer.tsx` style — numbered columns left→right, but with **two aligned
lanes** (top = 原始像素, bottom = 打亂像素) flowing through them so every
comparison is a vertical glance:

1. **01 輸入圖片** — the current CIFAR image, twice: top the real image, bottom
   the π-shuffled view, both upscaled/pixelated, labeled 你看到的 / 模型看到的
   (with a micro-label noting both are the *same* 3,072 numbers, renumbered).
   Dock controls cycle prev / next / 🎲 隨機 through val images.
2. **02 攤平** — a slim visual beat: image → a flat strip of numbers (echo the
   morning's flatten framing). Keep it compact; a labeled connector may be
   enough.
3. **03 兩顆一樣的 MLP** — per lane, the network diagram (input · hidden ·
   output columns, ≤12 sampled nodes, activation-tinted by the current image).
   **Hover/click a neuron** → a shared detail panel shows, side by side: net
   A's weight template, net B's raw template (noise), and net B's template
   with **還原排列** applied (π⁻¹) — revealing (near-)the-same template. Lime
   marks the hovered/pinned unit in both lanes; group-hover tooltips carry the
   zh-TW explanations.
4. **04 訓練** — the shared experiment: ▶ 訓練 / ⏸ / 單步 / ↺ 重來 in the dock
   (Space toggles, morning-style), live **`LossCurve`** with the two runs as
   two series (原始 / 打亂 — categorical cyan/purple), plus a val-accuracy
   readout pair. The two curves visibly overlap and converge to the same
   plateau. Mono stat row: step / loss / train acc / val acc per run.
5. **05 輸出** — per lane, the 10-class softmax bars for the current image
   (zh-TW class names, argmax in lime, true label ticked) — near-identical
   between lanes, and identical in ranking.

State discipline: everything rendered is a pure function of
`(pack, meta, latestSnapshot, currentImage, hoveredNeuron, unshuffleToggle)`.
Loading = `LoadingTimer`; error = friendly zh-TW message naming
`uv run camp-precompute pixel-shuffle`. Respect `prefers-reduced-motion`
(training updates are data-driven redraws, so this is mostly about transitions
and auto-scroll).

**Copy:** all zh-TW (glossary terms English: MLP, pixel, epoch…), same voice as
the other stations. Takeaway (tune as needed): 「你眼中亂成雜訊的圖，對 MLP 是
同一袋數字：兩顆網路學得一樣好、想法一模一樣。位置對它只是編號——但圖的排列、
句子的詞序，意義就住在那裡。」 Update the registry blurb for `pixel-shuffle`
(e.g. 「打亂每一顆像素，MLP 卻毫無感覺」) and adjust `order-shuffle`'s entry per
decision 6.

## Step 4 — Verify

```bash
cd precompute && uv run camp-precompute pixel-shuffle   # bake pack + meta
cd .. && pnpm typecheck && pnpm lint && pnpm build
pnpm --filter @app/course2 dev                          # http://localhost:5173/pixel-shuffle
```

Manually confirm: the pack loads (no black/constant images — the exact failure
the binary format exists to avoid); ▶ trains both nets with the UI thread
smooth; the two curves overlap and plateau at the same val accuracy (**record
the numbers** — expect roughly 35–45% on this subset; equality between runs is
the point, not the absolute value); pausing and hovering hidden unit *i* shows
noise → 還原排列 → net A's template; prob bars match across lanes; 重來
reproduces; `/order-shuffle` still renders at its URL; no console errors. For
headless screenshots this repo has `chrome-headless-shell/` at the root (use
`--use-angle=gl-egl` on this box). Then `/code-review high`.

## Design language (follow `prompts/DESIGN.md`)

- Near-black surface, mono/uppercase micro-labels, thin hairline borders.
  **Lime = the focused thing only** (hovered/pinned neuron, argmax class);
  the two runs as categorical **cyan/purple** in curves and lane accents; base
  marks greyscale. Weight templates keep the ported signed scale (lime +,
  purple −) — read every color from theme vars/props, no hard-coded hexes.
- Magnitude = opacity/width, no rainbows. Pixelated upscaling for all 32×32
  imagery.
- Honesty labels: the diagram samples ≤12 nodes per column (say so); the late
  curve drift is floating-point, not learning (tooltip); "還原排列" states it
  re-maps positions, nothing else.

## Definition of Done (checked by `prompts/validate.md` + `/code-review`)

Shared contract (`prompts/README.md` items 1–8, with item 2 read through the
new CLAUDE.md carve-out), plus **pixel-shuffle-specific**:

- [ ] `CLAUDE.md` carries the scoped in-browser-training exception (worker-only,
      this station only, toy scale) and no other rule changed.
- [ ] `cifar10.bin.gz` + `meta.json` exist under `.../course2/pixel-shuffle/`,
      are in `manifest.json`, load via `@camp/data` in an effect; the pack is
      force-added deliberately; the new `.gitignore` line uses the `**/` prefix.
- [ ] Two nets train live in ONE Web Worker with permuted-copy init and shared
      batch schedule; UI thread stays responsive; ↺ 重來 is deterministic.
- [ ] The twin curves (LossCurve, cyan/purple) visibly overlap and converge to
      the same val accuracy; stat readouts per run.
- [ ] 你看到的 vs 模型看到的 views of the same image; π moves whole RGB pixels.
- [ ] Hover/pin a hidden neuron → side-by-side templates with a working
      還原排列 (π⁻¹) reveal.
- [ ] `pixel-shuffle` sits at lesson slot 3; `order-shuffle` demoted to `dev`
      and still renders; lesson count remains 6.
- [ ] No server changes; station is fully offline; no `three`/`onnxruntime-web`.
- [ ] All copy zh-TW per the glossary convention; design language holds (theme
      utilities only); `prefers-reduced-motion` respected.
- [ ] `pnpm typecheck && pnpm lint && pnpm build` green; `/pixel-shuffle`
      renders with no console errors.

## Open decisions — make the call, then flag it in your report

1. **Baked reference curves:** also have the CLI train the same twin experiment
   offline (numpy mirror) and ship a small `reference-runs.json` the station
   can overlay as a dashed 參考曲線 (stable numbers for the deck; insurance
   against an unlucky live run)? Recommended: yes if the numpy mirror is ≤ ~100
   lines; otherwise skip and note it.
2. **Arch presets:** expose the morning's Small/Wide/Deep picker, or fix
   Small·64? Recommended: fix Small·64 for v1 (knob budget goes to the
   experiment), keep the pack/protocol arch-agnostic.
3. **02 攤平 column:** a real numbers-strip visualization or a labeled
   connector? Recommended: whichever keeps the pipeline legible at 1080p —
   don't let it steal width from the diagrams.
4. **Lane diagrams:** two full diagrams vs one diagram with a lane toggle if
   horizontal space gets tight. Recommended: two, stacked and row-aligned —
   the vertical comparison is the product.

## Report when done

Output: files changed; the artifact entries + sizes; **the measured final val
accuracies of both runs and the step count to plateau** (the deck session
consumes these); how close the curves track (and where fp drift shows);
the four open-decision calls; the CLAUDE.md carve-out wording; and a one-line
pass/fail per Definition-of-Done checkbox.
