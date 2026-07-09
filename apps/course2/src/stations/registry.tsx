import type { ReactElement } from "react";
import { TokenizerStation } from "./tokenizer";
import { EmbeddingStation } from "./embedding";
import { OrderShuffleStation } from "./orderShuffle";
import { PixelShuffleStation } from "./pixelShuffle/PixelShuffleStation";
import { NextTokenStation } from "./nextToken";
import { RnnVizStation } from "./rnnViz";
import { TransformerStation } from "./transformer";
import { RlPlaygroundStation } from "./rlPlayground";
import { LoraStation } from "./lora";
import { DiffusionStation } from "./diffusion";
import { SteeringStation } from "./steering";
import { SkyfallStation } from "./skyfall";
import { TextTo3dStation } from "./textTo3d";
import { ReferenceStation } from "./reference";
import { VizSandbox } from "./vizSandbox";

/**
 * - "lesson": the Course 2 teaching line (MLP → RNN → Transformer). Ordered,
 *   gated by the classroom progression lock (lib/progression).
 * - "panorama": Course 3's 拉開全景 stations (LoRA / RL / …). Shown in the nav
 *   under their own section, never locked — they are explorable side quests,
 *   not steps on the lesson line.
 * - "dev": internal tools, URL-only.
 */
export type StationGroup = "lesson" | "panorama" | "dev";

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
  { id: "pixel-shuffle", title: "打亂像素", blurb: "打亂每一顆像素，MLP 卻毫無感覺", group: "lesson", element: <PixelShuffleStation /> },
  { id: "next-token", title: "猜下一個 token", blurb: "預測下一個 token", group: "lesson", element: <NextTokenStation /> },
  { id: "rnn-viz", title: "RNN 視覺化", blurb: "在序列中傳遞狀態", group: "lesson", element: <RnnVizStation /> },
  { id: "transformer", title: "Transformer", blurb: "看一句話流過一次 forward pass", group: "lesson", element: <TransformerStation /> },
  { id: "lora", title: "LoRA", blurb: "貼一張小紙條，模型就換了個性", group: "panorama", element: <LoraStation /> },
  { id: "diffusion", title: "擴散生成圖", blurb: "從雜訊一步步長出一張圖", group: "panorama", element: <DiffusionStation /> },
  { id: "steering", title: "Feature Steering", blurb: "打開模型內部的旋鈕", group: "panorama", element: <SteeringStation /> },
  { id: "skyfall", title: "衛星長出城市 · Skyfall-GS", blurb: "從衛星照片長出一座能飛進去的城市，近看的細節是模型想像的。方法來自 Day 1 廣度講者李杰穎的 Skyfall-GS", group: "panorama", element: <SkyfallStation /> },
  { id: "text-to-3d", title: "文字生 3D", blurb: "打一句話,長出一個能轉的 3D 物件;換顆 seed,同一句話長出不一樣的東西", group: "panorama", element: <TextTo3dStation /> },
  { id: "rl-playground", title: "RL 競技場", blurb: "只靠獎勵和自己的分身,牠學會玩、也學會搶", group: "panorama", element: <RlPlaygroundStation /> },
  // Replaced at lesson slot 3 by pixel-shuffle (2026-07); kept URL-reachable
  // for instructors — its artifacts and server routes are untouched.
  { id: "order-shuffle", title: "打亂詞序", blurb: "為什麼詞序重要", group: "dev", element: <OrderShuffleStation /> },
  { id: "_reference", title: "Reference Station", blurb: "Copy me", group: "dev", element: <ReferenceStation /> },
  { id: "viz-sandbox", title: "Viz Sandbox", blurb: "All @camp/viz primitives", group: "dev", element: <VizSandbox /> },
];
