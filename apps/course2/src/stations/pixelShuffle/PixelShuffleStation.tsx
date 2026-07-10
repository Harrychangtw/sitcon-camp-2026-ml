/**
 * PIXEL SHUFFLE (打亂像素), station 3 of 6, the 順序撞牆 rebuilt on the
 * morning class's own CIFAR MLP.
 *
 * The controlled experiment: two IDENTICAL tiny MLPs (3072 → 64 → 10, the
 * morning defaults) train LIVE in one Web Worker: net A on real CIFAR-10
 * images, net B on the same images with every pixel moved by ONE fixed
 * permutation π. To a human the shuffled images are unreadable static; to an
 * MLP, pixel positions are just wire labels, so the two loss curves land on
 * the same spot. Net B starts from the π-relabeled copy of net A's init and
 * both see the same batch schedule, so the runs are the SAME arithmetic under
 * renamed wires: hover hidden unit i in both nets, press 還原排列, and B's
 * noise template un-shuffles into A's. That's the wall: the MLP never saw the
 * difference, but 圖的排列（和句子的詞序）就是意義住的地方.
 *
 * This is the ONE station allowed to train in the browser (CLAUDE.md golden-
 * rule carve-out): worker-only, toy scale, because the lesson IS the net the
 * students trained that morning. The dataset pack + π are still precomputed
 * artifacts (`camp-precompute pixel-shuffle`).
 *
 * Layout: the transformer station's dense horizontal pipeline, but with two
 * row-aligned LANES (top = 原始像素 cyan, bottom = 打亂像素 purple) flowing
 * through 01 輸入圖片 → 02 攤平 → 03 兩顆一樣的 MLP → 04 訓練 → 05 輸出, so
 * every comparison is a vertical glance. Everything rendered is a pure
 * function of (pack, meta, latest snapshot, current image, hovered neuron,
 * 還原排列 toggle).
 */
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BlockButtons,
  DockControls,
  LoadingTimer,
  StationLayout,
} from "@camp/ui";
import { LossCurve, useThemeColors } from "@camp/viz";
import type { LossSeries } from "@camp/viz";
import { loadJSON } from "@camp/data";
import { QuestDock } from "../../components/QuestDock";
import { TwinNetClient } from "./client";
import {
  REFERENCE_URL,
  loadPixelShuffleData,
  sampleBytes,
} from "./dataset";
import type { PixelShuffleMeta, ReferenceRuns } from "./dataset";
import {
  DIAGRAM_CAP,
  drawMlpDiagram,
  drawProbBars,
  drawWeightStrip,
  hitNode,
  paintRgb,
  paintVol,
  pixelSigned,
} from "./draw";
import type { DiagramNode } from "./draw";
import { applyScalarPerm, expandPerm, invertScalarPerm } from "./permute";
import type { NetId, PackedPixels } from "./protocol";
import { useCanvas } from "./useCanvas";

interface LoadedData {
  meta: PixelShuffleMeta;
  bytes: Uint8Array;
  packed: PackedPixels;
}

/** A neuron address in the diagram: layer -1 = input, 0 = hidden, 1 = output. */
type Neuron = { layer: number; idx: number };

const SERIES_A = "原始像素";
const SERIES_B = "打亂像素";
const SERIES_REF = "參考曲線";

/** Shared lane geometry so column contents row-align: each column stacks
    [lane A (LANE_H)] · gap · [lane B (LANE_H)]. */
const LANE_H = 236;
const LANE_GAP = 16;

/** prefers-reduced-motion, read in an effect (SSR-safe, live-updating). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** One labeled pipeline column (the transformer station's idiom). */
function Column({
  index,
  title,
  children,
}: {
  index: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex shrink-0 flex-col">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-wide text-muted">
        <span className="mr-1.5 opacity-60">{index}</span>
        {title}
      </div>
      <div
        className="flex flex-1 flex-col justify-center"
        style={{ justifyContent: "safe center" }}
      >
        {children}
      </div>
    </section>
  );
}

/** The flow arrow between columns. */
function Arrow() {
  return (
    <div aria-hidden className="shrink-0 self-center px-1 font-mono text-lg text-muted/50">
      →
    </div>
  );
}

/** On-canvas hover tooltip (group-hover idiom shared with transformer/rnnViz).
    `align="right"` anchors the tip to the group's right edge: the last pipeline
    column needs it so the caption grows back INTO the content instead of past
    the scroll extent, where it would be cut off at the screen edge. The width
    also clamps to the viewport so phone-size screens never clip the text. */
function HoverTip({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`pointer-events-none absolute bottom-full z-40 mb-1.5 w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-md border border-border bg-panel px-3 py-2 text-xs leading-relaxed text-fg opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      {children}
    </div>
  );
}

/** Lane badge: which run this row belongs to (cyan = A 原始, purple = B 打亂;
    the same categorical colors as the training curves). */
function LaneTag({ net }: { net: NetId }) {
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-wide ${
        net === "A" ? "text-accent2" : "text-accent3"
      }`}
    >
      {net === "A" ? SERIES_A : SERIES_B}
    </span>
  );
}

/** The two stacked lane boxes every token…er, image-aligned column uses. */
function LaneStack({
  laneA,
  laneB,
}: {
  laneA: ReactNode;
  laneB: ReactNode;
}) {
  return (
    <div className="flex flex-col" style={{ gap: LANE_GAP }}>
      <div style={{ height: LANE_H }}>{laneA}</div>
      <div style={{ height: LANE_H }}>{laneB}</div>
    </div>
  );
}

export function PixelShuffleStation() {
  // 1. STATE: everything rendered is a pure function of these.
  const [data, setData] = useState<LoadedData | null>(null);
  const [reference, setReference] = useState<ReferenceRuns | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [currentInput, setCurrentInput] = useState(0);
  const [hover, setHover] = useState<Neuron | null>(null);
  const [pinned, setPinned] = useState<Neuron | null>(null);
  const [unshuffle, setUnshuffle] = useState(false);
  // The pipeline is wider than any phone: track whether more content hides to
  // the right (fade affordance) and whether the student has already discovered
  // horizontal scrolling (the one-time 往右捲 hint).
  const [moreRight, setMoreRight] = useState(false);
  const [hintDone, setHintDone] = useState(false);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const reducedMotion = usePrefersReducedMotion();
  const colors = useThemeColors();

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const clientRef = useRef<TwinNetClient | null>(null);
  const nodesRefA = useRef<DiagramNode[]>([]);
  const nodesRefB = useRef<DiagramNode[]>([]);
  const metricsTick = useRef(0);

  // 2. LOAD PRECOMPUTED ARTIFACTS: the pack + π (+ the optional baked
  //    reference twin runs; missing reference degrades to no dashed overlay).
  useEffect(() => {
    let alive = true;
    Promise.all([
      loadPixelShuffleData(),
      loadJSON<ReferenceRuns>(REFERENCE_URL).catch(() => null),
    ])
      .then(([d, ref]) => {
        if (!alive) return;
        setData(d);
        setReference(ref);
        setCurrentInput(d.meta.trainN); // first val image
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  // 3. THE WORKER: created in an effect (never during render), fed the
  //    decoded pack, terminated on unmount. The client's onEvent schedules
  //    React re-renders: throttled for the 30 Hz metrics stream, immediate for
  //    everything else (ready / snapshot / weights).
  useEffect(() => {
    if (!data) return;
    const client = new TwinNetClient();
    clientRef.current = client;
    client.onEvent = (ev) => {
      if (ev === "metrics") {
        // the worker auto-pauses at the maxSteps endpoint; mirror that in the
        // dock's ▶/⏸ state.
        if (client.done) setRunning(false);
        if (!client.done && ++metricsTick.current % 3 !== 0) return;
      }
      bump();
    };
    client.init(
      data.packed,
      data.meta.permutation,
      data.meta.arch,
      data.meta.train,
      data.meta.maxSteps,
    );
    return () => {
      client.dispose();
      clientRef.current = null;
    };
  }, [data]);

  const client = clientRef.current;
  const ready = client?.ready ?? null;
  const snap = client?.snapshot ?? null;

  // 4. DERIVED: π expansions, the inspected neuron, current-image bytes.
  const scalarPerm = useMemo(
    () => (data ? expandPerm(data.meta.permutation, data.meta.depth) : null),
    [data],
  );
  const invPerm = useMemo(
    () => (scalarPerm ? invertScalarPerm(scalarPerm) : null),
    [scalarPerm],
  );

  const inspect = pinned ?? hover;

  // Raw display bytes of the current image, both views (pure of the pack, no
  // worker round-trip, so 01 輸入圖片 works even before training starts).
  const imgA = useMemo(
    () => (data ? sampleBytes(data.bytes, data.meta, currentInput) : null),
    [data, currentInput],
  );
  const imgB = useMemo(
    () => (imgA && scalarPerm ? applyScalarPerm(imgA, scalarPerm) : null),
    [imgA, scalarPerm],
  );

  // Keep the inspected neuron's weight rows fresh while training (the worker
  // caches per-request; force refresh whenever a new snapshot lands).
  const snapIndex = snap?.inputIndex;
  const snapStep = client?.step ?? 0;
  useEffect(() => {
    if (!client || !inspect || inspect.layer < 0) return;
    client.reqWeights("A", inspect.layer, inspect.idx, true);
    client.reqWeights("B", inspect.layer, inspect.idx, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh on snapshot/step, not only on neuron change
  }, [client, inspect?.layer, inspect?.idx, snapIndex, snapStep]);

  // 5. CONTROLS: thin wrappers over the worker client.
  const setTrainRunning = (run: boolean) => {
    if (!client) return;
    if (run && client.done) return; // endpoint reached; 重來 starts a fresh run
    if (run) client.start();
    else client.pause();
    setRunning(run);
  };
  const stepOnce = () => client?.stepOnce();
  const resetRun = () => {
    client?.reset();
    setRunning(false);
  };
  const cycleInput = (delta: number) => {
    if (!client || !data) return;
    const { trainN, valN } = data.meta;
    // dock cycles the VAL images, the ones neither net trained on.
    const next = trainN + ((((currentInput - trainN + delta) % valN) + valN) % valN);
    client.setInput(next);
    setCurrentInput(next);
  };
  const randomInput = () => {
    if (!client || !data) return;
    const { trainN, valN } = data.meta;
    const next = trainN + Math.floor(Math.random() * valN);
    client.setInput(next);
    setCurrentInput(next);
  };

  // SPACE toggles training (like the morning playground).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName || "";
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setTrainRunning(!running);
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  });

  // The right-edge fade tracks real overflow (it disappears once the student
  // reaches the end, or when the window is wide enough to fit everything).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () =>
      setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data, ready]);

  const onPipelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const more = el.scrollLeft + el.clientWidth < el.scrollWidth - 8;
    if (more !== moreRight) setMoreRight(more);
    // first real horizontal scroll = hint delivered, retire it for good.
    if (!hintDone && el.scrollLeft > 24) setHintDone(true);
  };

  const onDiagramMove = (net: NetId) => (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const nodes = net === "A" ? nodesRefA.current : nodesRefB.current;
    const nd = hitNode(nodes, e.clientX - rect.left, e.clientY - rect.top);
    const next = nd ? { layer: nd.layer, idx: nd.idx } : null;
    if (next?.layer !== hover?.layer || next?.idx !== hover?.idx) setHover(next);
  };
  const onDiagramClick = (net: NetId) => (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const nodes = net === "A" ? nodesRefA.current : nodesRefB.current;
    const nd = hitNode(nodes, e.clientX - rect.left, e.clientY - rect.top);
    setPinned(nd ? { layer: nd.layer, idx: nd.idx } : null);
  };

  // 6. CANVASES: all pure functions of the state above.
  const meta = data?.meta ?? null;

  const { ref: imgRefA } = useCanvas(
    (ctx, w, h) => {
      if (imgA && meta) paintRgb(ctx, imgA, meta.tile, meta.tile, meta.depth, 0, 0, w, h);
    },
    [imgA, meta],
  );
  const { ref: imgRefB } = useCanvas(
    (ctx, w, h) => {
      if (imgB && meta) paintRgb(ctx, imgB, meta.tile, meta.tile, meta.depth, 0, 0, w, h);
    },
    [imgB, meta],
  );

  // 02 攤平: the first N raw values as a "row of numbers" strip. Same
  // multiset in both lanes, different order: the bag doesn't change.
  const FLAT_N = 96;
  const { ref: flatRefA } = useCanvas(
    (ctx, w, h) => {
      if (imgA) paintVol(ctx, colors, Array.from(imgA.slice(0, FLAT_N)), FLAT_N, 1, 1, 0, 0, w, h, "mag");
    },
    [imgA, colors],
  );
  const { ref: flatRefB } = useCanvas(
    (ctx, w, h) => {
      if (imgB) paintVol(ctx, colors, Array.from(imgB.slice(0, FLAT_N)), FLAT_N, 1, 1, 0, 0, w, h, "mag");
    },
    [imgB, colors],
  );

  const { ref: diagRefA } = useCanvas(
    (ctx, w, h) => {
      if (!ready) return;
      nodesRefA.current = drawMlpDiagram(
        ctx, colors, w, h, ready.layers, snap?.actsA ?? null, pinned, hover,
      );
    },
    [ready, snap, pinned, hover, colors],
  );
  const { ref: diagRefB } = useCanvas(
    (ctx, w, h) => {
      if (!ready) return;
      nodesRefB.current = drawMlpDiagram(
        ctx, colors, w, h, ready.layers, snap?.actsB ?? null, pinned, hover,
      );
    },
    [ready, snap, pinned, hover, colors],
  );

  // Detail tiles: the inspected hidden neuron's incoming-weight templates.
  const wA = inspect && inspect.layer >= 0 ? client?.weights.get(`A:${inspect.layer}:${inspect.idx}`) : undefined;
  const wB = inspect && inspect.layer >= 0 ? client?.weights.get(`B:${inspect.layer}:${inspect.idx}`) : undefined;
  const isHidden = inspect?.layer === 0;
  const isOutput = ready != null && inspect != null && inspect.layer === ready.layers.length - 2;

  const { ref: tileRefA } = useCanvas(
    (ctx, w, h) => {
      if (!wA || !meta) return;
      if (isHidden) {
        paintVol(ctx, colors, pixelSigned(wA.row, wA.depth), wA.tile, wA.tile, 1, 0, 0, w, h, "signed");
      } else {
        drawWeightStrip(ctx, colors, w, h, wA.row);
      }
    },
    [wA, isHidden, meta, colors],
  );
  const { ref: tileRefB } = useCanvas(
    (ctx, w, h) => {
      if (!wB || !meta) return;
      if (isHidden) {
        paintVol(ctx, colors, pixelSigned(wB.row, wB.depth), wB.tile, wB.tile, 1, 0, 0, w, h, "signed");
      } else {
        drawWeightStrip(ctx, colors, w, h, wB.row);
      }
    },
    [wB, isHidden, meta, colors],
  );
  const { ref: tileRefB2 } = useCanvas(
    (ctx, w, h) => {
      if (!wB || !meta || !invPerm || !isHidden || !unshuffle) return;
      // 還原排列: π⁻¹ re-maps positions, nothing else; the values are B's own.
      paintVol(
        ctx, colors,
        pixelSigned(applyScalarPerm(wB.row, invPerm), wB.depth),
        wB.tile, wB.tile, 1, 0, 0, w, h, "signed",
      );
    },
    [wB, invPerm, isHidden, unshuffle, meta, colors],
  );

  const { ref: probRefA } = useCanvas(
    (ctx, w, h) => {
      if (snap && meta) drawProbBars(ctx, colors, w, h, snap.probsA, meta.classNames_zh, snap.label);
    },
    [snap, meta, colors],
  );
  const { ref: probRefB } = useCanvas(
    (ctx, w, h) => {
      if (snap && meta) drawProbBars(ctx, colors, w, h, snap.probsB, meta.classNames_zh, snap.label);
    },
    [snap, meta, colors],
  );

  // 7. THE TRAINING CHART: live twin series on real step numbers, plus the
  //    baked reference run resampled onto the live grid (dashed). Before the
  //    first step, the reference is shown on its own grid as "what to expect".
  const chart = useMemo(() => {
    const stepHist = client?.stepHist ?? [];
    const live = stepHist.length > 0;
    const xs = live ? stepHist : reference?.xs ?? [];
    // A/B first so they claim the first two categorical hues (cyan/purple);
    // the dashed 參考曲線 comes third (fg). Pre-run, A/B are empty series so
    // the reference shows on its own step grid as "what to expect".
    // A drawn wide (cyan casing) under a thin B (purple core): the two runs
    // are bit-identical, so without the width split the later line would
    // simply hide the earlier one and the overlap wouldn't read as two lines.
    const series: LossSeries[] = [
      { label: SERIES_A, values: live ? client!.lossHistA : [], width: 3.4 },
      { label: SERIES_B, values: live ? client!.lossHistB : [], width: 1.4 },
    ];
    if (reference) {
      // resample the baked run onto the live step grid so one shared `xs` fits
      const refAt = (step: number) => {
        const i = Math.min(
          reference.runs.normal.loss.length - 1,
          Math.max(0, Math.round(step / reference.evalEvery) - 1),
        );
        return reference.runs.normal.loss[i] ?? 0;
      };
      series.push({
        label: SERIES_REF,
        values: live ? stepHist.map(refAt) : reference.runs.normal.loss,
        dash: true,
      });
    }
    return { xs, series };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- client hists mutate in place; snapStep tracks growth
  }, [client, reference, snapStep]);

  const fmtPct = (v: number | null | undefined) =>
    v == null ? "…" : `${(v * 100).toFixed(0)}%`;
  const fmtLoss = (v: number | null | undefined) =>
    v == null || v === 0 ? "…" : v.toFixed(3);

  const statRow = (net: NetId) => {
    const c = client;
    const loss = net === "A" ? c?.lossA : c?.lossB;
    const acc = net === "A" ? c?.accA : c?.accB;
    const val = net === "A" ? c?.valAccA : c?.valAccB;
    return (
      <div className="flex items-center gap-3 font-mono text-xs">
        <span className="w-16"><LaneTag net={net} /></span>
        <span className="text-muted">loss <span className="text-fg">{fmtLoss(loss)}</span></span>
        <span className="text-muted">train <span className="text-fg">{c && c.step > 0 ? fmtPct(acc) : "…"}</span></span>
        <span className="text-muted">val <span className={net === "A" ? "text-accent2" : "text-accent3"}>{fmtPct(val)}</span></span>
      </div>
    );
  };

  // Quest evidence (attested station: the server sanity-bounds these numbers,
  // it cannot re-run the browser training). Report the CURRENT run state the
  // worker last posted: net B's val accuracy + the real step count. Null until
  // the first val measurement lands, so the dock shows the hint instead.
  const collectQuestEvidence = (questId: string) => {
    if (questId !== "train-shuffled-30") return null;
    const c = clientRef.current;
    if (!c || c.step <= 0 || c.valAccB == null) return null;
    return { accuracy: c.valAccB, steps: c.step };
  };

  const classZh = meta && snap ? meta.classNames_zh[snap.label] : null;
  const valIndex = meta ? currentInput - meta.trainN : 0;

  const inspectLabel = !inspect
    ? "點或移到神經元上"
    : inspect.layer === -1
      ? "輸入 pixel"
      : isHidden
        ? `隱藏神經元 #${inspect.idx}`
        : `輸出神經元 · ${meta?.classNames_zh[inspect.idx] ?? inspect.idx}`;

  const barCls = reducedMotion ? "" : "transition-opacity duration-300";

  return (
    <StationLayout
      title="打亂像素"
      subtitle="把每一顆像素都打亂，兩顆一樣的 MLP 卻學得一樣好，位置對它只是編號。"
      fullBleed
      controls={
        <DockControls>
          <BlockButtons
            label="訓練"
            buttons={[
              running
                ? { label: "⏸ 暫停", onClick: () => setTrainRunning(false) }
                : {
                    label: client?.done ? "✓ 完成" : "▶ 訓練",
                    onClick: () => setTrainRunning(true),
                    primary: !client?.done,
                    disabled: Boolean(client?.done),
                  },
              { label: "單步", onClick: stepOnce, disabled: !ready || Boolean(client?.done) },
              { label: "↺ 重來", onClick: resetRun, disabled: !ready },
            ]}
          />
          <BlockButtons
            label="圖片"
            buttons={[
              { label: "‹", onClick: () => cycleInput(-1), disabled: !ready },
              { label: "›", onClick: () => cycleInput(1), disabled: !ready },
              // 隨機 in plain text: the 🎲 emoji has no glyph in the deployed
              // font stack and rendered as tofu (□) on students' devices.
              { label: "隨機", onClick: randomInput, disabled: !ready },
            ]}
          />
        </DockControls>
      }
      takeaway={
        <span>
          你眼中亂成雜訊的圖，對 MLP 是同一袋數字：兩顆網路學得一樣好、想法一模一樣。
          位置對它只是編號，但圖的排列、句子的詞序，意義就住在那裡。
        </span>
      }
    >
      <div className="relative h-full w-full">
        <QuestDock
          station="pixel-shuffle"
          collectEvidence={collectQuestEvidence}
          hint="先按 ▶ 開始訓練，等打亂那行的 val 出現數字再回報"
        />
        {error ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-md text-center text-sm text-warning">
              載入 pixel-shuffle 資料失敗（{error}）。請執行{" "}
              <code className="font-mono">uv run camp-precompute pixel-shuffle</code>。
            </p>
          </div>
        ) : !data || !ready ? (
          <div className="flex h-full items-center justify-center">
            <LoadingTimer label="CIFAR-10 資料載入中" />
          </div>
        ) : (
          /* The pipeline: one horizontally-scrollable, left-to-right row with
             two vertically-aligned lanes. */
          <>
          <div
            ref={scrollRef}
            onScroll={onPipelineScroll}
            className="absolute inset-0 overflow-auto [touch-action:pan-x_pan-y]"
          >
            <div className="flex min-h-full min-w-max items-stretch gap-4 px-4 pt-24 pb-[calc(var(--dock-h,7rem)+1.5rem)] md:px-10">
              {/* 01 輸入圖片 */}
              <Column
                index="01"
                title={
                  <>
                    輸入圖片 ·{" "}
                    <span className="text-accent">{classZh}</span>
                    <span className="ml-1.5 opacity-70">
                      驗證集 #{String(valIndex).padStart(3, "0")}
                    </span>
                  </>
                }
              >
                <LaneStack
                  laneA={
                    <div className="group relative flex h-full flex-col gap-1.5">
                      <LaneTag net="A" />
                      <div className="w-[180px] flex-1 overflow-hidden rounded-md border border-border/60">
                        <canvas ref={imgRefA} className="block h-full w-full [image-rendering:pixelated]" />
                      </div>
                      <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                        你看到的
                      </span>
                      <HoverTip>
                        真實的 CIFAR-10 圖片（32×32），是早上訓練場的同一批資料。
                        兩張圖是<span className="text-accent">同一組 3,072 個數字</span>
                        ，下面那張只是重新編號了位置。
                      </HoverTip>
                    </div>
                  }
                  laneB={
                    <div className="group relative flex h-full flex-col gap-1.5">
                      <LaneTag net="B" />
                      <div className="w-[180px] flex-1 overflow-hidden rounded-md border border-border/60">
                        <canvas ref={imgRefB} className="block h-full w-full [image-rendering:pixelated]" />
                      </div>
                      <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                        模型看到的
                      </span>
                      <HoverTip>
                        同一張圖，1,024 顆像素被一個<span className="text-accent">固定的排列 π</span>
                        搬了家（RGB 三個值一起搬）。每張圖、訓練和驗證都用同一個 π：
                        對你是雜訊，對 MLP 只是換了輸入線的編號。
                      </HoverTip>
                    </div>
                  }
                />
              </Column>

              <Arrow />

              {/* 02 攤平 */}
              <Column index="02" title="攤平 flatten">
                <LaneStack
                  laneA={
                    <div className="group relative flex h-full flex-col justify-center gap-1.5">
                      <div className="h-4 w-[120px] overflow-hidden rounded-sm border border-border/40">
                        <canvas ref={flatRefA} className="block h-full w-full [image-rendering:pixelated]" />
                      </div>
                      <span className="w-[120px] font-mono text-[9px] leading-snug text-muted">
                        32×32×3 → 3,072 個數字（畫得下前 {FLAT_N} 個）
                      </span>
                      <HoverTip>
                        MLP 收到的其實是一長條數字：圖片先被「攤平」。
                        這也是它看不見排列的原因：攤平之後，位置只剩編號。
                      </HoverTip>
                    </div>
                  }
                  laneB={
                    <div className="group relative flex h-full flex-col justify-center gap-1.5">
                      <div className="h-4 w-[120px] overflow-hidden rounded-sm border border-border/40">
                        <canvas ref={flatRefB} className="block h-full w-full [image-rendering:pixelated]" />
                      </div>
                      <span className="w-[120px] font-mono text-[9px] leading-snug text-muted">
                        同一袋數字，換了順序
                      </span>
                      <HoverTip>
                        打亂後攤平的同一張圖：值一個都沒變，只是排在不同位置。
                      </HoverTip>
                    </div>
                  }
                />
              </Column>

              <Arrow />

              {/* 03 兩顆一樣的 MLP */}
              <Column
                index="03"
                title={
                  <>
                    兩顆一樣的 MLP ·{" "}
                    <span className="text-accent">
                      {meta
                        ? [meta.arch.inputDim, ...meta.arch.hidden, meta.arch.classes].join(" → ")
                        : ""}
                    </span>
                    <span className="ml-1.5 opacity-70">
                      每欄只畫 {DIAGRAM_CAP} 顆（誠實抽樣）
                    </span>
                  </>
                }
              >
                <div className="flex items-start gap-4">
                  <LaneStack
                    laneA={
                      <div className="flex h-full flex-col gap-1.5">
                        <LaneTag net="A" />
                        <div className="w-[300px] flex-1 rounded-md border border-border/60">
                          <canvas
                            ref={diagRefA}
                            onPointerMove={onDiagramMove("A")}
                            onPointerLeave={() => setHover(null)}
                            onClick={onDiagramClick("A")}
                            className="block h-full w-full cursor-pointer"
                          />
                        </div>
                      </div>
                    }
                    laneB={
                      <div className="flex h-full flex-col gap-1.5">
                        <LaneTag net="B" />
                        <div className="w-[300px] flex-1 rounded-md border border-border/60">
                          <canvas
                            ref={diagRefB}
                            onPointerMove={onDiagramMove("B")}
                            onPointerLeave={() => setHover(null)}
                            onClick={onDiagramClick("B")}
                            className="block h-full w-full cursor-pointer"
                          />
                        </div>
                      </div>
                    }
                  />

                  {/* Shared neuron detail panel, home of the 還原排列 reveal.
                      Width fits its widest row: two 100px tiles + gap + p-3. */}
                  <div
                    className="flex w-[240px] flex-col gap-2 rounded-md border border-border/60 bg-panel/60 p-3"
                    style={{ height: LANE_H * 2 + LANE_GAP }}
                  >
                    <span className="font-mono text-[10px] uppercase tracking-wide text-accent">
                      {inspectLabel}
                    </span>
                    {!inspect || inspect.layer < 0 ? (
                      <p className="text-xs leading-relaxed text-muted">
                        點兩邊網路圖上的同一顆神經元，看它「在找什麼」。
                        第一層每顆神經元的權重可以畫回 32×32 的圖，也就是它的樣板。
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-col gap-0.5">
                          <LaneTag net="A" />
                          <div className="h-[100px] w-[100px] overflow-hidden rounded-sm border border-border/40">
                            <canvas ref={tileRefA} className="block h-full w-full [image-rendering:pixelated]" />
                          </div>
                        </div>
                        <div className="flex items-end gap-2">
                          <div className="flex flex-col gap-0.5">
                            <LaneTag net="B" />
                            <div className="h-[100px] w-[100px] overflow-hidden rounded-sm border border-border/40">
                              <canvas ref={tileRefB} className="block h-full w-full [image-rendering:pixelated]" />
                            </div>
                          </div>
                          {isHidden ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                                還原排列
                              </span>
                              <div className="relative h-[100px] w-[100px] overflow-hidden rounded-sm border border-border/40">
                                {/* canvas stays mounted so its resize observer
                                    lives; the reveal button covers it until
                                    pressed. */}
                                <canvas ref={tileRefB2} className={`block h-full w-full [image-rendering:pixelated] ${barCls}`} />
                                {!unshuffle ? (
                                  <button
                                    type="button"
                                    onClick={() => setUnshuffle(true)}
                                    className="absolute inset-0 flex items-center justify-center border border-dashed border-border/60 bg-bg font-mono text-[10px] text-muted transition-colors hover:border-accent hover:text-accent"
                                  >
                                    還原排列 π⁻¹
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        {isHidden ? (
                          <p className="text-[11px] leading-snug text-muted">
                            {unshuffle ? (
                              <>
                                只把位置編號換回來，<span className="text-fg">數值一個都沒動</span>
                                ，和上面 A 的樣板是同一張。
                                <button
                                  type="button"
                                  onClick={() => setUnshuffle(false)}
                                  className="ml-1 font-mono text-[10px] uppercase text-muted underline hover:text-fg"
                                >
                                  收回
                                </button>
                              </>
                            ) : (
                              <>
                                B 的樣板看起來是雜訊。按下 π⁻¹，把像素位置換回來看看。
                              </>
                            )}
                          </p>
                        ) : isOutput ? (
                          <p className="text-[11px] leading-snug text-muted">
                            輸出層接的是 64 顆隱藏神經元，位置沒被打亂，
                            所以兩邊的權重長得一模一樣（lime 正、紫負）。
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </Column>

              <Arrow />

              {/* 04 訓練（共用的實驗台） */}
              <Column
                index="04"
                title={
                  <>
                    訓練 ·{" "}
                    <span className="text-accent">
                      step {client?.step ?? 0} / {meta?.maxSteps}
                    </span>
                    <span className="ml-1.5 opacity-70">
                      lr {meta?.train.lr} · momentum {meta?.train.momentum} · batch {meta?.train.batchSize}
                    </span>
                  </>
                }
              >
                <div className="group relative flex w-[440px] flex-col gap-3">
                  <div className="rounded-md border border-border/60 bg-panel/40 p-2">
                    <LossCurve series={chart.series} xs={chart.xs} height={LANE_H + 24} />
                  </div>
                  <div className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-panel/40 px-3 py-2">
                    {statRow("A")}
                    {statRow("B")}
                  </div>
                  <p className="text-[11px] leading-snug text-muted">
                    {client?.done ? (
                      <>
                        訓練完成：兩顆網路抵達同一個地方。按 ↺ 重來
                        可以重跑一次一模一樣的實驗。
                      </>
                    ) : (
                      <>
                        兩條線幾乎疊在一起，這不是巧合，是同一套計算換了線路編號。
                        按 <span className="font-mono">Space</span> 開始／暫停。
                      </>
                    )}
                  </p>
                  <HoverTip>
                    兩顆網路從「同一組初始權重（B 的第一層照 π 重新接線）」出發、
                    每一步吃同一批圖，所以兩條線完全重合（我們實測過：逐位元一致）
                    ，這是同一套計算，只是輸入線換了編號。若真的出現微小分岔，
                    那是浮點數加總順序，不是學習差異。虛線是先在電腦上跑好的
                    參考曲線（同一個實驗、不同亂數），給你對照用。
                  </HoverTip>
                </div>
              </Column>

              <Arrow />

              {/* 05 輸出 */}
              <Column index="05" title="輸出 · 10 類機率 softmax">
                <LaneStack
                  laneA={
                    <div className="group relative flex h-full flex-col gap-1.5">
                      <LaneTag net="A" />
                      <div className="w-[240px] flex-1 rounded-md border border-border/60 bg-panel/40 p-1.5">
                        <canvas ref={probRefA} className="block h-full w-full" />
                      </div>
                      <HoverTip align="right">
                        目前這張驗證圖的 10 類機率。lime = 模型的猜測（argmax），
                        青色刻度 = 正確答案。
                      </HoverTip>
                    </div>
                  }
                  laneB={
                    <div className="group relative flex h-full flex-col gap-1.5">
                      <LaneTag net="B" />
                      <div className="w-[240px] flex-1 rounded-md border border-border/60 bg-panel/40 p-1.5">
                        <canvas ref={probRefB} className="block h-full w-full" />
                      </div>
                      <HoverTip align="right">
                        打亂網路看同一張（打亂後的）圖，機率幾乎一模一樣、
                        排名完全相同：它從頭到尾沒發現圖被打亂過。
                      </HoverTip>
                    </div>
                  }
                />
              </Column>
            </div>
          </div>

          {/* Right-edge affordances: a fade that says「還有東西在右邊」plus a
              one-time 往右捲 hint. Both are pointer-transparent overlays; the
              hint retires itself after the first real horizontal scroll. */}
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 right-0 z-30 w-14 bg-gradient-to-l from-bg to-transparent ${barCls} ${
              moreRight ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            aria-hidden
            className={`pointer-events-none absolute right-4 z-30 rounded-full border border-border bg-panel/90 px-3 py-1.5 font-mono text-[11px] text-muted shadow-md ${barCls} ${
              moreRight && !hintDone ? "opacity-100" : "opacity-0"
            }`}
            style={{ bottom: "calc(var(--dock-h, 7rem) + 1rem)" }}
          >
            往右捲 →
          </div>
          </>
        )}
      </div>
    </StationLayout>
  );
}
