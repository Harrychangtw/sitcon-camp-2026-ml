- [ ] Include more descriptive, intersting and diverse precomputed examples
## Handoff — shared-ui: dock control info hover + (i) marker

### Done this session
- b90ed19: dock `info` now reveals on hovering anywhere on the control row (slider track / toggle segments) via a shared `group/control` subgrid row in BlockSlider/BlockToggle; persistent (i) icon in InfoLabel; wired the new `gloss` prop through BlockSlider. Zero station edits; typecheck/lint/build green; verified live on /transformer, /next-token, /rl-playground (Playwright, no console errors).
- Fixed pre-existing red typecheck in @app/course2 (vitest was in package.json but never installed) via `pnpm install`.

### Loose ends
- /code-review high found: the info panel can cover BlockSlider's value bubble when the handle is near the track's left (runtime-confirmed on next-token Temperature at min); on touch, the panel is sticky after a tap (no `hoverOnlyWhenSupported` in the Tailwind preset).
- Cleanup candidates: the `group/control` wrapper string is duplicated in BlockSlider/BlockToggle (extract a DockRow); InfoLabel's hand-drawn (i) differs from the Lucide icons in StationLayout/SuggestInput (extract InfoIcon).
- In the concurrent SuggestInput edit (not committed here): Enter and preset chips bypass the new `unchanged`/已送出 guard and re-submit identical text.

### Suggested next
- Fix the panel-vs-value-bubble occlusion (re-anchor the panel or suppress it while the pointer is on the track), then the DockRow/InfoIcon extractions.
- Gate the SuggestInput keydown/preset submits on the same `unchanged` check as the button.
