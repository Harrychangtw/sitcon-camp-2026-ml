import { Placeholder } from "./Placeholder";

// PLACEHOLDER — no real logic. See /_reference for the pattern to copy.
export function EmbeddingStation() {
  return (
    <Placeholder
      title="Embedding"
      subtitle="Tokens are just ids — where does meaning come from?"
      goal="Students see token ids mapped to vectors, and explore how similar words land near each other in space (and where that breaks)."
      todo={[
        "Project precomputed embeddings to 2D/3D (Scatter2D / Scatter3D)",
        "Search/highlight a word and its nearest neighbours",
        "Load vectors from public/data/course2/embedding/ via @camp/data",
      ]}
    />
  );
}
