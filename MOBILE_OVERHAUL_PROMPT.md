# Mission: Mobile-friendly overhaul of all 12 Course 2 stations

You are working in `/home/ubuntu/sitcon-camp-2026-ml`, a pnpm + Turborepo monorepo of interactive ML teaching "stations" for SITCON Camp 2026 (Taiwanese high schoolers). Read `CLAUDE.md` first and obey it: package boundaries (`@camp/ui` no viz/data, `@camp/viz` no controls/fetching, `@camp/data` no React), lazy-import `three`/`onnxruntime-web` inside effects only, no training in the browser (sole exception: pixel-shuffle's Web Worker), no large binaries committed.

**Goal:** every one of the 12 public stations must be genuinely usable on a phone (390x844 portrait is the reference viewport, test 360px too), while the desktop experience (the classroom primary, 1440px) does not regress at all. This is not a token pass of `sm:` prefixes: the app currently has essentially zero responsive code, a floating bottom dock that clips controls off both screen edges, and an interaction model where every explanatory panel and most core interactions are mouse-hover-only and therefore unreachable on touch.

This document is the result of a full audit (source-level plus live headless-Chrome screenshots at 390x844 of every station). Every claim below has been verified against the code at the cited line, but line numbers will drift as you edit: re-locate by symbol, not by number.

**You should orchestrate with subagents.** Phases 0 to 2 below are ordered by dependency. Phase 0 (shared `@camp/ui` + app shell) must be done in one context, serially, because everything depends on it. Phase 1 (`@camp/viz`) can be split across parallel subagents per primitive. Phase 2 (per-station fixes) is ideal for parallel fan-out: each station is its own file(s), so spawn one subagent per station (or batches of 3) after Phases 0 and 1 have landed and typecheck passes. After each phase, run the verification protocol at the bottom yourself and LOOK at the screenshots before proceeding.

---

## Non-negotiable ground rules

1. **No em dashes** in any copy, comment, or doc you author. Use ，：。 in Chinese copy and commas/colons in English.
2. **Student-facing copy is Traditional Chinese (zh-TW)**, matching the existing playful tone.
3. **Pre-existing uncommitted changes** in `apps/course2/src/stations/skyfall.tsx`, `apps/course2/vite.config.ts`, and `packages/viz/src/SplatViewer.tsx` are intentional in-progress work (wheel-dolly, Shift-drag pan, sensitivity tuning). Build on top of them; never revert them. Commit your own work in logical increments; only include those three files in a commit if you also modified them.
4. **Desktop must not regress.** All mobile behavior goes behind the `md` (768px) breakpoint for layout, and `(hover: hover)` / `(pointer: coarse)` media for interaction affordances. Rule of thumb: hover affordances may stay, but every piece of CONTENT revealed by hover must also be reachable by tap/click on all devices.
5. **This box serves live infra.** Do not touch the tmux session `camp` or the funnel pane in `ml-c2-station-2`. Grafana owns port 3000. Port 5173 is a vite PREVIEW server: it serves the last `pnpm --filter @app/course2 build` output and needs a rebuild to reflect changes. Use `pnpm --filter @app/course2 dev` (it will pick a free port) for fast iteration.
6. Introduce breakpoints via standard Tailwind defaults (`md:` = 768px). Do not invent a custom breakpoint system. For pointer-type conditions use arbitrary variants like `[@media(hover:hover)]:` or a small `useCoarsePointer()` hook in `@camp/ui` (matchMedia `(pointer: coarse)`, SSR-safe, default false).

---

## Phase 0: Foundation (`@camp/ui` + app shell). Do this first, serially.

### 0.1 The dock: `packages/ui/src/StationLayout.tsx` (lines ~150-166) and `DockControls.tsx`

This is the defining failure. Today the dock is `absolute inset-x-0 bottom-4 flex justify-center px-4` with a single non-wrapping row: a `shrink-0` input (SuggestInput defaults to `w-72` = 288px) + divider + controls in `grid-cols-[auto_minmax(8rem,auto)]` (a hard 128px minimum control column, labels up to 208px). Any station with an input plus one control needs roughly 500px. Because the row is centered, overflow clips off BOTH edges: screenshots confirm that on 9 of 12 stations the labels wrap to one CJK character per line and the actual sliders/toggles are entirely off-screen and unreachable. There is no wrap, no scroll, and no collapse affordance of any kind.

Redesign spec:

- **Mobile (< md): the dock becomes a bottom sheet.** Full-width, anchored to the bottom edge (rounded top corners only), stacked vertically: input row first (full width), then controls. `DockControls` collapses to a single-column layout at this size: label above (or beside, if short) its control, each control row full width. Cap the sheet at about `42dvh` with `overflow-y-auto` inside, so a many-control station (nextToken has 4, steering has one slider per feature, rlPlayground has 7 groups) scrolls within the sheet instead of covering the canvas.
- **Collapse/expand affordance (required, both mobile and desktop).** A slim handle bar (44px min touch height, chevron icon plus a short label such as 控制) that toggles the dock body. Collapsed state shows only the handle. Default expanded. Remember the choice per station id in memory (component state lifted to StationLayout is fine; no persistence needed).
- **Desktop (>= md): keep the current floating-island look**, but make it survive mid-width laptops: allow the input to shrink (`min-w-0`, drop `shrink-0`), allow the controls block to wrap (`flex-wrap`), and cap the island at `max-w-[min(64rem,calc(100vw-2rem))]`.
- **Publish the dock's real height as a CSS variable.** Measure the dock island with a ResizeObserver and set `--dock-h` on the StationLayout root. Replace the hard-coded `pb-28` on non-fullbleed `<main>` with `padding-bottom: calc(var(--dock-h) + 1.5rem)`. This variable is the contract stations use in Phase 2 to un-hide content currently buried behind the dock (lora/steering/diffusion cards, rnn-viz legend) and to place bottom-anchored overlays (skyfall's `bottom-28` hack, textTo3d's rail and reset button, ArenaCanvas's hard-coded `INSET.bottom = 210`).
- **Safe areas:** add `viewport-fit=cover` to the viewport meta in `apps/course2/index.html` and pad the dock bottom with `env(safe-area-inset-bottom)`.
- Keep `animate-dock-in` desktop-only or shorten it; it is a 1s settle on every station switch.

### 0.2 Hover-only content becomes tappable

- **重點 takeaway panel** (`StationLayout.tsx` ~102-131): pure `group-hover`, so the lesson takeaway of every station is unreachable on touch. Give the button real toggle state (onClick, close on outside tap and Escape, `aria-expanded`), keep hover-open on `(hover: hover)` devices. Cap the panel `max-w-md` to `max-w-[calc(100vw-2rem)]`. Grow the 24px button to a 44px hit area (padding, not visual size).
- **InfoLabel** (`packages/ui/src/InfoLabel.tsx` ~33, ~53): the `info` panel behind every BlockSlider/BlockToggle label is hover-only with a 14px non-focusable (i) marker. Same fix: make the (i) a real button (44px hit area via padding), tap toggles the panel, hover still works on desktop, panel capped to viewport width and flipped to open upward when inside the bottom sheet (it opens downward today, which will clip under the dock edge).

### 0.3 Touch targets and sliders

- **BlockSlider** (`packages/ui/src/BlockSlider.tsx`): thumb is `w-1` growing to `w-2` on hover (4 to 8px), the value bubble and gradient fill are hover-gated, track is 28px tall. On coarse pointers: always show the value (kill the hover gate), always show the fill, render a thumb of at least 20px visual / 44px hit area, track at least 44px tall. `LabeledSlider.tsx` (native range, always-visible value) is the touch-correct pattern already in the package: emulate it.
- **BlockButtons / BlockToggle / SegmentedControl** (`py-1`, roughly 24-26px tall) and **Toggle** (24px tall), **SuggestInput submit** (`h-7`): bring all to >= 44px touch height below md (or via pointer-coarse), keep compact on desktop. Non-active options currently rely on `hover:text-fg` for contrast: give them a static readable muted color.
- **SuggestInput** (`packages/ui/src/SuggestInput.tsx`): drop the fixed `w-72` inside the mobile sheet (full width there); replace the `onMouseDown` preventDefault hacks on submit/chips (~221, ~248) with `onPointerDown` so the blur race also works on touch; cap the focused multiline height (`h-[12rem]`) to something like `max-h-[30dvh]` on mobile since the on-screen keyboard is also up; the preset tray already uses `max-w-[min(24rem,80vw)]`, keep that.

### 0.4 App shell (`apps/course2`)

- **StationNav dropdown** (`src/components/StationNav.tsx` ~84): the menu is `overflow-hidden` with no max-height. With 13 rows it clips on short/landscape phones and the bottom stations become unreachable: this breaks navigation outright. Fix: `max-h-[min(70dvh,32rem)] overflow-y-auto`. Grow trigger (`py-0.5`) and items (`py-1.5`) to 44px touch height below md. Hover-open can stay for desktop; onClick toggle already exists.
- **index.html:** viewport gets `viewport-fit=cover`; add `<meta name="theme-color" content="...">` matching `--camp-bg`; add `color-scheme: dark`.
- **src/index.css:** add `overscroll-behavior: none` on body (pull-to-refresh currently fires over the lock overlay and canvases), `-webkit-text-size-adjust: 100%`, `-webkit-tap-highlight-color: transparent`.
- The `h-full` chain is fine (no `100vh` bug), keep it; use `dvh` only for new caps (dock sheet, nav menu).

---

## Phase 1: `@camp/viz` touch support (parallelizable per primitive)

Cross-cutting: every interactive primitive routes its core interaction through `onMouseEnter`/`onMouseLeave` only, so the feature each viz exists for is dead on touch. Introduce one shared idiom: **tap = pin** (tap a target to select/highlight it, tap it again or tap empty space to clear), implemented with pointer events, coexisting with hover on desktop. Callers already pass `onHover`; extend the prop contract compatibly (e.g. keep `onHover` firing for both hover and tap-pin) so stations mostly keep working unchanged.

- **Scatter2D** (`Scatter2D.tsx` ~153-160): hover-only tooltip + `onHover`, 4px circles. Add tap-pin with a nearest-point hit test within a ~24px radius (do not require hitting the 4px circle). Tooltip must position within the viewport.
- **Scatter3D** (`Scatter3D.tsx` ~350-385): OrbitControls touch already works; the raycast hover pick does not. On pointerup with negligible movement (a tap, not an orbit drag), run the same raycast and pin the result.
- **AttentionLines** (~172-183): token focus is mouseenter-only on invisible rects. Add pointerdown/tap focus toggle. Labels (`text-[11px]`, evenly spaced) overlap on narrow widths: shrink or thin labels when per-token width drops below a threshold.
- **Heatmap** (~283-287, 72px fixed gutter): add tap-to-pin cell (drives the same readout and `onHoverCell`); on narrow containers shrink the row-label gutter and clamp label font.
- **VectorStrip** (`VectorStrip.tsx`): fixed `cellSize=16` inline-flex with NO scroll container, so long vectors overflow the viewport. Wrap in `overflow-x-auto` (with `touch-action: pan-x`) or scale cell size to container width.
- **LossCurve:** static, fine; just guard the absolutely-positioned legend against overlapping the line at small widths (move it above the plot on narrow containers).
- **SplatViewer** (`SplatViewer.tsx`, has uncommitted changes: keep them): the big one.
  - Touch today: 1-finger drag-look, 2-finger pinch-dolly, double-tap fly-to-point. All translational movement (WASD/arrows ~541-556) and pan (Shift-drag, ~470-478) is keyboard-gated, so touch users cannot strafe or change altitude in fly mode.
  - Add: **two-finger drag = pan** (centroid movement while pinching maps to the existing pan logic; pinch distance keeps driving dolly). Add an **on-screen joystick or forward/back + up/down control cluster rendered only on coarse pointers** in fly mode, feeding the same velocity state as the key handlers. Bottom-right placement, above `--dock-h` (accept an offset prop or CSS var; do not read station layout from inside the package).
  - Cap DPR harder on coarse-pointer devices if needed for frame rate (already `min(dpr, 2)`; consider 1.5 on mobile). Do not attempt splat-count changes; out of scope.

---

## Phase 2: Per-station fixes (fan out one subagent per station after Phases 0-1 land)

General contract for every station: dock content now renders in the sheet (verify each station's controls actually fit and scroll); any hard-coded bottom clearance (`pb-28`, `pb-32`, `pb-44`, `pb-64`, `bottom-28`, `bottom-24`) is replaced with `calc(var(--dock-h) + ...)`; any `group-hover`-revealed content gets a tap path; screenshots at 390x844 confirm the acceptance criteria.

Screenshot evidence from the audit run is in `/tmp/claude-1000/-home-ubuntu-sitcon-camp-2026-ml/46b8e8ca-77cd-4915-8a8b-623ab26b62a4/scratchpad/mobile-audit/` (may have been cleaned; regenerate with the protocol below if missing).

### Lesson line

1. **tokenizer.tsx** (grade B, lightest). Dock fits after Phase 0. Top-right readout (`w-44`) is fine. Token grid is already responsive (`auto-fill` grid: this is the pattern to preserve). Verify the 切分方式 toggle is reachable and a token chip no longer touches the right edge.
2. **embedding.tsx** (C/D). Two absolute overlays collide at 390px: the glossary caption (`left-9 top-14 max-w-md`, wider than the viewport) and the top-right readout (`w-60 max-w-[70vw]`). Screenshots show the 語意分群 legend covering the title and intro copy. On mobile: stack these (glossary becomes a collapsible line under the title or moves into the takeaway; readout shrinks or drops to a single row). Core mechanic is hover-only neighbor highlight (`onHover={setHoverWord}`): wire the new Scatter tap-pin so tapping a dot selects it.
3. **pixelShuffle/PixelShuffleStation.tsx** (E). Dock actually fits (no input, 6 buttons). The canvas is a roughly 1600px fixed-pixel pipeline (`LANE_H=236`, `w-[180px]` lanes, `w-[300px]` MLP diagrams, `w-[440px]` loss chart) inside `min-w-max` horizontal scroll. Do NOT restack the pipeline (out of scope, high risk): instead make the horizontal scroll obvious and comfortable on touch: `touch-action: pan-x pan-y`, right-edge fade gradient plus a 往右捲 hint that fades after first scroll, and fix the clipped FLATTEN strips and panel captions at stage boundaries. Neuron inspect is `onMouseMove` hover but click-to-pin already exists: verify tap-pin works. SPACE toggles training: fine, the ▶ button covers touch. Hunt the tofu glyph (□) in the image-nav row (a missing-glyph character in a button label) and replace it with a real glyph or SVG.
4. **nextToken.tsx** (C, worst dock: input + 3 sliders + toggle, roughly 580px wide today). After Phase 0 all four controls must be reachable in the sheet; check the sheet scrolls and 取樣/貪婪 labels are not truncated. Canvas (bars + chips) is already responsive. Token-internal `title=` tooltips are supplementary; leave them.
5. **rnnViz.tsx** (C). Fixed-cell grid with horizontal scroll and sticky gutter already works on touch and auto-scrolls to the active column: keep. Fix: the heatmap color-scale legend is half-covered by the dock (use `--dock-h`); the 影響 row explanation is `group-hover` (add tap; the persistent 看這裡 caption stays).
6. **transformer.tsx** (F, worst overall). Three problems.
   - Dock: the custom LayerHeadPad is an un-shrinkable ~251px SVG (`padW = nLayers*9-1`). Make it scale: render width from the available container (it is SVG, parameterize the cell pitch, keep 44px-equivalent touch cells on coarse pointers; it already uses pointer events + setPointerCapture, good).
   - Pipeline: fixed-pixel horizontal flow where stages 03+ are off-screen with no affordance. Same treatment as pixelShuffle: edge fade + scroll hint + `touch-action`, and replace `pb-64` with `--dock-h` math. Absolute explainer paragraphs (`maxWidth:420`) must clamp to `calc(100vw-2rem)`.
   - Core interaction: `onHoverCell` cross-highlight and hover-revealed CapsuleConnector arrows are dead on touch. Wire Heatmap tap-pin so tapping a cell pins the query/key highlight until the next tap.
7. **(dev, skip)** orderShuffle, _reference, vizSandbox get no work beyond compiling.

### Panorama line

8. **lora.tsx** (C). Answer panels already `md:grid-cols-2` (stacks on mobile, good). Fixes: LoRA answer card is cut off behind the dock (use `--dock-h` clearance on the scroll column); the 4-segment 人格 toggle and α slider must be reachable in the sheet.
9. **diffusion.tsx** (C). Dock overlaps the canvas caption (第 1/9 步... cut in half): `--dock-h` clearance. Playback is tap-driven and the filmstrip is `overflow-x-auto`: keep. Seed/steps toggles reachable in the sheet.
10. **steering.tsx** (C/D). The dock maps one BlockSlider per feature; screenshots show all four sliders off-screen, so the station's entire point is uninteractable. After Phase 0 they live in the sheet: verify all feature sliders are usable and their `info` glosses (the only place a knob's meaning is explained) open on tap. The steered comparison card is hidden behind the dock: `--dock-h` clearance.
11. **skyfall.tsx** (C, has uncommitted changes: keep them). Fixes: the controls-hint HUD is `hidden md:flex`, hidden exactly where needed: replace with a touch-specific hint on coarse pointers (拖曳環顧，雙指縮放/平移，雙擊飛過去，或用下方視角按鈕) and update the GuidedTour copy (~258) to branch on pointer type instead of leading with WASD. The honesty readout uses `bottom-28 ... md:bottom-6`: switch to `--dock-h`. Scene-preset button row clips at the right edge with no scroll affordance: make that dock row wrap or scroll. Wire the SplatViewer touch locomotion from Phase 1 (joystick offset above `--dock-h`).
12. **textTo3d.tsx** (C). Orbit touch already works natively. Fixes: the preset rail (`absolute left-4 w-36`, full height) covers roughly 40% of a phone's viewport including the 3D render, and its 4th thumbnail hides behind the dock: on mobile convert it to a horizontal thumbnail strip docked above the sheet (or a collapsed picker), positioned with `--dock-h`. The English-prompt reveal is `group-hover/card:block`: add tap. The two-beat caption at `bottom-6 left-1/2` sits directly under the dock: move above `--dock-h`. Controls hint `hidden md:flex`: same treatment as skyfall.
13. **rlPlayground.tsx + rl/** (F, fundamentally keyboard-dependent). The critical fix of the whole overhaul:
    - **Race-mode movement is keyboard-only** (`useArena.ts` ~71-74, ~179-207: window keydown/keyup for arrows/WASD, Space to start). Add a **virtual D-pad or joystick** rendered on coarse pointers (bottom-right of the arena, thumb-sized, >= 44px directions, pointer events with setPointerCapture) that feeds the exact same action state as `KEY_ACTIONS`, plus an on-screen 開始 that mirrors Space (a tappable 開始 button exists; make sure it is not clipped: screenshots show it extending past the right edge).
    - Dock is the worst in the set (two side-by-side DockControls grids, a 6-segment 干擾 toggle, roughly 700px). In the sheet these become two stacked groups; the 6-segment toggle should wrap to two rows of three on narrow widths.
    - `ArenaCanvas.tsx` hard-codes `INSET = { top: 56, bottom: 210 }` assuming the desktop dock height: derive from `--dock-h` (pass as a prop from the station; `@camp/viz`-style purity is not required here, it is station code).
    - The score pill (centered `top-4`) collides with the title island on 390px: offset it below the title on mobile. The sandbox recipe card (`w-72` with a LossCurve) fits but verify against the title island.
    - Sandbox gem/lava dragging is already pointer-based: verify on touch emulation.

---

## Verification protocol (run after every phase, and per-station in Phase 2)

1. `pnpm typecheck && pnpm lint && pnpm build` must pass.
2. Headless visual check: read `/home/ubuntu/.claude/projects/-home-ubuntu-sitcon-camp-2026-ml/memory/headless-ui-verification.md` for the chrome-headless-shell recipe on this box (needs `--no-sandbox --use-angle=gl-egl` for the V100 GL stack) and the `camp.session.until` localStorage auth bypass. Two gotchas from the audit run: `/tokenizer` fires a live-inference call on load whose 401 handler re-shows the login gate, so for that route perform a real login with the class password from `server/.env`; and give 3D/ONNX stations a delayed second screenshot to finish loading.
3. Screenshot every station route (`/tokenizer /embedding /pixel-shuffle /next-token /rnn-viz /transformer /lora /diffusion /steering /skyfall /text-to-3d /rl-playground`) at: 390x844 (DSF 2, mobile emulation, touch), 360x740, 844x390 landscape (nav menu must scroll), 768x1024, and 1440x900 (desktop regression check). LOOK at every image with the Read tool; do not grep-and-declare-victory.
4. Acceptance per station at 390x844: no control clipped or off-screen; every slider/toggle/button operable; no text truncated mid-character; no content hidden behind the dock; the 重點 panel and at least one InfoLabel open by tap; dock collapses and expands; canvas remains the visual majority of the screen with the dock collapsed.
5. Acceptance at 1440x900: pixel-diff-level similarity to the pre-change desktop screenshots (minor spacing changes acceptable; layout structure identical).
6. Functional spot checks in headless (CDP touch events or fall back to click): tap-pin a Scatter2D point on /embedding, tap a Heatmap cell on /transformer, move the critter with the virtual D-pad on /rl-playground, open the takeaway panel by tap on any station.

## Definition of done

- All 12 stations pass the acceptance criteria above, evidenced by screenshots you have actually viewed.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` green.
- No package-boundary violations introduced (no station logic in `@camp/ui`, no fetching in `@camp/viz`).
- Desktop 1440px screenshots show no structural regressions.
- Work committed in logical increments (foundation, viz, then per-station), with the three pre-existing modified files handled per ground rule 3.
