import { Placeholder } from "./Placeholder";

// PLACEHOLDER — no real logic. See /_reference for the pattern to copy.
export function TransformerStation() {
  return (
    <Placeholder
      title="Transformer"
      subtitle="What if every token could look at every other token, directly?"
      goal="Students explore attention: hovering a token lights up what it attends to, making self-attention concrete after the RNN's limitations."
      todo={[
        "Token row with attention links on hover (AttentionLines)",
        "Layer / head selector (SegmentedControl)",
        "Load a precomputed attention tensor from public/data/course2/transformer/",
      ]}
    />
  );
}
