import { Placeholder } from "./Placeholder";

// PLACEHOLDER — no real logic. See /_reference for the pattern to copy.
export function TokenizerStation() {
  return (
    <Placeholder
      title="Tokenizer"
      subtitle="How does raw text become something a model can read?"
      goal="Students type text and watch it split into tokens — then discover tokenization is lossy and rule-bound, which motivates everything downstream."
      todo={[
        "Text input → live token segmentation on a canvas",
        "Toggle between char / word / BPE schemes",
        "Show token ids from a precomputed vocab in public/data/course2/tokenizer/",
      ]}
    />
  );
}
