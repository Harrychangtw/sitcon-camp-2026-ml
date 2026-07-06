/**
 * A muted categorical palette shared across Course 2 stations, in the
 * OpenAI-tokenizer idiom: each entry is a filled colored span/point so
 * boundaries read at a glance. It extends the deck's lime/cyan/purple with
 * harmonizing greens/reds/golds, all darkened so white glyphs stay legible on
 * the near-black ground.
 *
 * The tokenizer cycles these by token position (color carries no meaning beyond
 * "this is one token"); the embedding station reuses the SAME hues to label its
 * semantic taxonomy (one color per cluster). Keeping the palette in one place
 * means the two stations look like one system.
 */
export const CATEGORY_COLORS = [
  "#3f6f52", // green
  "#2f6470", // teal
  "#7a4a54", // muted rose
  "#5a4d84", // purple
  "#7a6234", // gold
  "#3a5578", // slate blue
  "#6a4a6e", // plum
  "#4a6a44", // olive
] as const;
