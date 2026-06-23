# @camp/ui

Station shell, form controls, and the shared design tokens. Framework-agnostic
React (works in both the Next shell and the Vite course apps).

## Public API

```ts
import {
  StationLayout,
  LabeledSlider,
  Toggle,
  SegmentedControl,
  RunButton,
} from "@camp/ui";
```

| Export             | What it is                                                                 |
| ------------------ | -------------------------------------------------------------------------- |
| `StationLayout`    | Header + left control rail + canvas + optional takeaway footer. Responsive. |
| `LabeledSlider`    | Range input with label + monospaced readout.                               |
| `Toggle`           | Accessible on/off switch.                                                   |
| `SegmentedControl` | Generic pick-one control (`SegmentedControl<"a" \| "b">`).                  |
| `RunButton`        | Button with a built-in, configurable fake-loading beat (`durationMs`, `onRun`). |

### Theme tokens (not JS — CSS + Tailwind)

```css
/* app global stylesheet */
@import "@camp/ui/theme.css"; /* defines --camp-* CSS vars, light + .dark */
```

```js
// app tailwind.config
presets: [require("@camp/ui/tailwind-preset")]; // maps bg/fg/muted/accent/... to the vars
```

Dark mode is class-based: put `class="dark"` on `<html>`.

## What does NOT belong here

- **Any visualization / canvas / SVG drawing** → that's `@camp/viz`.
- **Data loading or fetch logic** → that's `@camp/data`.
- **Station-specific business logic** → that lives in the station component
  inside an app. `@camp/ui` stays generic and reusable across all ~15 stations.
- Anything that imports `three`, `onnxruntime-web`, or touches `window` at module
  scope. Controls must be SSR-safe (they render in the Next shell too).
