// @camp/ui — station shell, controls, and theme.
// Public API. Anything not re-exported here is private to the package.

export { StationLayout, StationHeaderTitleProvider } from "./StationLayout";
export type {
  StationLayoutProps,
  StationHeaderTitleRenderer,
} from "./StationLayout";

export { LabeledSlider } from "./LabeledSlider";
export type { LabeledSliderProps } from "./LabeledSlider";

export { Toggle } from "./Toggle";
export type { ToggleProps } from "./Toggle";

export { SegmentedControl } from "./SegmentedControl";
export type {
  SegmentedControlProps,
  SegmentedOption,
} from "./SegmentedControl";

export { SuggestInput } from "./SuggestInput";
export type { SuggestInputProps, SuggestPreset } from "./SuggestInput";

export { DockControls } from "./DockControls";
export type { DockControlsProps } from "./DockControls";

export { InfoLabel } from "./InfoLabel";
export type { InfoLabelProps } from "./InfoLabel";

export { BlockToggle } from "./BlockToggle";
export type { BlockToggleProps, BlockToggleOption } from "./BlockToggle";

export { BlockSlider } from "./BlockSlider";
export type { BlockSliderProps } from "./BlockSlider";

export { BlockButtons } from "./BlockButtons";
export type { BlockButtonsProps, BlockButtonsItem } from "./BlockButtons";

export { RunButton } from "./RunButton";
export type { RunButtonProps } from "./RunButton";

export { LiveStatus } from "./LiveStatus";
export type { LiveState, LiveStatusProps } from "./LiveStatus";

export { LoadingTimer } from "./LoadingTimer";
export type { LoadingTimerProps } from "./LoadingTimer";

export { useStopwatch } from "./useStopwatch";

// Theme tokens live in ./theme.css and ../tailwind-preset.cjs.
// Import them from app stylesheets / tailwind configs, not from JS.
