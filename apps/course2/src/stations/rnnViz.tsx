import { Placeholder } from "./Placeholder";

// PLACEHOLDER — no real logic. See /_reference for the pattern to copy.
export function RnnVizStation() {
  return (
    <Placeholder
      title="RNN Viz"
      subtitle="One idea for order: carry a hidden state along the sequence."
      goal="Students step through a sequence token-by-token and watch the hidden state evolve — then feel the wall of long-range dependencies vanishing."
      todo={[
        "Step controls that advance the sequence one token at a time",
        "Hidden-state heatmap updating per step (Heatmap)",
        "Replay precomputed activations from public/data/course2/rnn-viz/",
      ]}
    />
  );
}
