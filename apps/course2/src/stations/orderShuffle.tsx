import { Placeholder } from "./Placeholder";

// PLACEHOLDER — no real logic. See /_reference for the pattern to copy.
export function OrderShuffleStation() {
  return (
    <Placeholder
      title="Order Shuffle"
      subtitle="Does word order matter? Let's break a bag-of-words model and see."
      goal="Students shuffle words in a sentence and watch a bag-of-words model give the same answer — exposing the wall that motivates sequence models."
      todo={[
        "Sentence with draggable / shuffleable word chips",
        "Side-by-side: bag-of-words prediction (order-blind) vs an order-aware model",
        "Replay precomputed predictions from public/data/course2/order-shuffle/",
      ]}
    />
  );
}
