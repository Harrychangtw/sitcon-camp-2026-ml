import type { ReactElement } from "react";
import { TokenizerStation } from "./tokenizer";
import { EmbeddingStation } from "./embedding";
import { OrderShuffleStation } from "./orderShuffle";
import { NextTokenStation } from "./nextToken";
import { RnnVizStation } from "./rnnViz";
import { TransformerStation } from "./transformer";
import { RlPlaygroundStation } from "./rlPlayground";
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
  { id: "tokenizer", title: "Tokenizer", blurb: "文字 → token", group: "lesson", element: <TokenizerStation /> },
  { id: "embedding", title: "Embedding", blurb: "token → vector：語意的幾何", group: "lesson", element: <EmbeddingStation /> },
  { id: "order-shuffle", title: "打亂詞序", blurb: "為什麼詞序重要", group: "lesson", element: <OrderShuffleStation /> },
  { id: "next-token", title: "Next Token", blurb: "預測下一個 token", group: "lesson", element: <NextTokenStation /> },
  { id: "rnn-viz", title: "RNN 視覺化", blurb: "在序列中傳遞狀態", group: "lesson", element: <RnnVizStation /> },
  { id: "transformer", title: "Transformer", blurb: "看一句話流過一次 forward pass", group: "lesson", element: <TransformerStation /> },
  { id: "rl-playground", title: "RL 競技場", blurb: "只靠獎勵訊號,牠自己學會玩", group: "lesson", element: <RlPlaygroundStation /> },
  { id: "_reference", title: "Reference Station", blurb: "Copy me", group: "dev", element: <ReferenceStation /> },
  { id: "viz-sandbox", title: "Viz Sandbox", blurb: "All @camp/viz primitives", group: "dev", element: <VizSandbox /> },
];
