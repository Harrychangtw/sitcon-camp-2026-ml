import type { ReactElement } from "react";
import { TokenizerStation } from "./tokenizer";
import { EmbeddingStation } from "./embedding";
import { OrderShuffleStation } from "./orderShuffle";
import { NextTokenStation } from "./nextToken";
import { RnnVizStation } from "./rnnViz";
import { TransformerStation } from "./transformer";
import { ReferenceStation } from "./reference";
import { VizSandbox } from "./vizSandbox";

export type StationGroup = "lesson" | "dev";

export interface StationMeta {
  /** URL segment, e.g. "tokenizer" → route "/tokenizer". */
  id: string;
  title: string;
  blurb: string;
  group: StationGroup;
  element: ReactElement;
}

/**
 * THE single source of truth for stations. Add a station here and it shows up in
 * both the router (App.tsx) and the sidebar. The order of "lesson" entries is
 * the intended teaching order: MLP → RNN → Transformer.
 */
export const stations: StationMeta[] = [
  { id: "tokenizer", title: "Tokenizer", blurb: "Text → tokens", group: "lesson", element: <TokenizerStation /> },
  { id: "embedding", title: "Embedding", blurb: "Tokens → vectors", group: "lesson", element: <EmbeddingStation /> },
  { id: "order-shuffle", title: "Order Shuffle", blurb: "Why order matters", group: "lesson", element: <OrderShuffleStation /> },
  { id: "next-token", title: "Next Token", blurb: "Predict the next token", group: "lesson", element: <NextTokenStation /> },
  { id: "rnn-viz", title: "RNN Viz", blurb: "State across a sequence", group: "lesson", element: <RnnVizStation /> },
  { id: "transformer", title: "Transformer", blurb: "Attention everywhere", group: "lesson", element: <TransformerStation /> },
  { id: "_reference", title: "Reference Station", blurb: "Copy me", group: "dev", element: <ReferenceStation /> },
  { id: "viz-sandbox", title: "Viz Sandbox", blurb: "All @camp/viz primitives", group: "dev", element: <VizSandbox /> },
];
