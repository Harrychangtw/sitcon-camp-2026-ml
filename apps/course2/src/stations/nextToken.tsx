import { Placeholder } from "./Placeholder";

// PLACEHOLDER — no real logic. See /_reference for the pattern to copy.
export function NextTokenStation() {
  return (
    <Placeholder
      title="Next Token"
      subtitle="What if every language task is just: predict the next token?"
      goal="Students give a prompt and watch a probability distribution over the next token, building intuition for sampling, temperature, and greedy decoding."
      todo={[
        "Prompt input → bar chart of next-token probabilities (Heatmap/bars)",
        "Temperature / top-k controls (LabeledSlider, SegmentedControl)",
        "Light ONNX inference via loadOnnxSession on a small precomputed model",
      ]}
    />
  );
}
