// @camp/ui — station shell, controls, and theme.
// Public API. Anything not re-exported here is private to the package.

export { StationLayout } from "./StationLayout";
export type { StationLayoutProps } from "./StationLayout";

export { LabeledSlider } from "./LabeledSlider";
export type { LabeledSliderProps } from "./LabeledSlider";

export { Toggle } from "./Toggle";
export type { ToggleProps } from "./Toggle";

export { SegmentedControl } from "./SegmentedControl";
export type {
  SegmentedControlProps,
  SegmentedOption,
} from "./SegmentedControl";

export { RunButton } from "./RunButton";
export type { RunButtonProps } from "./RunButton";

// Theme tokens live in ./theme.css and ../tailwind-preset.cjs.
// Import them from app stylesheets / tailwind configs, not from JS.
