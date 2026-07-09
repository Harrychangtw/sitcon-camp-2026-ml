/* Canvas painters for the pixel-shuffle station, ported from the morning
   class's draw/paintVol.ts · mlpDiagram.ts · probBars.ts. Colors come from the
   shared theme (@camp/viz readThemeColors, canvas can't use Tailwind
   utilities), never hard-coded hues: lime = the focused thing, cyan/purple =
   the two runs / signed weights, everything else greyscale. */

import { rgbCss } from "@camp/viz";
import type { ThemeColors } from "@camp/viz";
import { argmax } from "./net";
import type { LayerMeta } from "./protocol";

export const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

export type VolMode = "image" | "mag" | "signed";

/* ---------------- paintVol, a flat Float/byte array as an image tile ------
   Three modes:
     'image' , a picture (RGB depth 3), per-tile normalized
     'mag'   , a non-negative activation map (dark → accent-lime hot)
     'signed', a weight template (purple negative ↔ dark zero ↔ lime positive)
   Offscreen-canvas → drawImage upscale; callers set image-rendering:pixelated
   on the destination canvas for the crisp 32×32 look. */

const offCanvases = new Map<string, HTMLCanvasElement>();
function off(sx: number, sy: number): CanvasRenderingContext2D {
  const key = `${sx}x${sy}`;
  let cv = offCanvases.get(key);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = sx;
    cv.height = sy;
    offCanvases.set(key, cv);
  }
  return cv.getContext("2d")!;
}

function minMax(data: ArrayLike<number>): [number, number] {
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return [mn, mx];
}

export function paintVol(
  ctx: CanvasRenderingContext2D,
  colors: ThemeColors,
  data: ArrayLike<number>,
  sx: number,
  sy: number,
  depth: number,
  x: number,
  y: number,
  w: number,
  h: number,
  mode: VolMode = "image",
) {
  const hctx = off(sx, sy);
  const img = hctx.createImageData(sx, sy);
  const [mn, mx] = minMax(data);
  const scale = Math.max(Math.abs(mn), Math.abs(mx)) || 1;
  const range = mx - mn || 1;

  for (let py = 0; py < sy; py++) {
    for (let px = 0; px < sx; px++) {
      const di = (py * sx + px) * 4;
      if (depth === 3 && mode === "image") {
        const s = (py * sx + px) * 3;
        img.data[di] = ((data[s]! - mn) / range) * 255;
        img.data[di + 1] = ((data[s + 1]! - mn) / range) * 255;
        img.data[di + 2] = ((data[s + 2]! - mn) / range) * 255;
        img.data[di + 3] = 255;
        continue;
      }
      const v = data[py * sx + px]!;
      let r: number, g: number, b: number;
      if (mode === "signed") {
        // purple (neg) ↔ near-black (0) ↔ lime (pos)
        const t = v / scale; // [-1,1]
        if (t >= 0) {
          r = colors.accent[0] * t;
          g = colors.accent[1] * t;
          b = colors.accent[2] * t;
        } else {
          r = colors.accent3[0] * -t;
          g = colors.accent3[1] * -t;
          b = colors.accent3[2] * -t;
        }
      } else if (mode === "mag") {
        const t = (v - mn) / range;
        r = colors.accent[0] * t;
        g = colors.accent[1] * t;
        b = colors.accent[2] * t;
      } else {
        const t = (v - mn) / range;
        r = g = b = t * 255;
      }
      img.data[di] = r;
      img.data[di + 1] = g;
      img.data[di + 2] = b;
      img.data[di + 3] = 255;
    }
  }
  hctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false; // pixelated upscaling everywhere (32×32 imagery)
  ctx.drawImage(hctx.canvas, x, y, w, h);
}

/** A weight template averaged to one signed value per PIXEL (mean over RGB),
    so depth-3 rows still paint as a single signed image. */
export function pixelSigned(row: ArrayLike<number>, depth: number): Float32Array {
  if (depth === 1) return Float32Array.from(row as ArrayLike<number>);
  const n = row.length / depth;
  const out = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    let acc = 0;
    for (let c = 0; c < depth; c++) acc += row[p * depth + c]!;
    out[p] = acc / depth;
  }
  return out;
}

/* ---------------- network diagram ------------------------------------------
   A row of layer columns (input · hidden · output) with sampled neuron nodes,
   tinted live by the current input's activations. Returns hoverable node boxes
   so the caller can map a pointer to a neuron. */

export interface DiagramNode {
  /** fc layer index: -1 = input column, 0 = first hidden, …, L-1 = output. */
  layer: number;
  /** neuron index within its layer. */
  idx: number;
  kind: "input" | "hidden" | "output";
  x: number;
  y: number;
  r: number;
}

export const DIAGRAM_CAP = 12; // max nodes drawn per column (honesty label!)

/** which neuron indices to draw for a layer of `size`: all if ≤ CAP, else an
    even sample. */
function sampleIdx(size: number): number[] {
  if (size <= DIAGRAM_CAP) return Array.from({ length: size }, (_, i) => i);
  return Array.from({ length: DIAGRAM_CAP }, (_, k) =>
    Math.round((k * (size - 1)) / (DIAGRAM_CAP - 1)),
  );
}

export function drawMlpDiagram(
  ctx: CanvasRenderingContext2D,
  colors: ThemeColors,
  W: number,
  H: number,
  layers: LayerMeta[],
  acts: Float32Array[] | null,
  selected: { layer: number; idx: number } | null,
  hovered: { layer: number; idx: number } | null,
): DiagramNode[] {
  const nodes: DiagramNode[] = [];
  const cols = layers.length;
  const padX = 40;
  const padTop = 26;
  const padBot = 20;
  const colX = (c: number) => padX + (W - 2 * padX) * (cols === 1 ? 0.5 : c / (cols - 1));

  // precompute per-column sampled node ys
  const colNodes = layers.map((ly, c) => {
    const idxs = sampleIdx(ly.size);
    const n = idxs.length;
    const gp = n > 1 ? Math.min(26, (H - padTop - padBot) / (n - 1)) : 0;
    const cy = padTop + (H - padTop - padBot) / 2;
    return idxs.map((idx, k) => ({
      idx,
      x: colX(c),
      y: n > 1 ? padTop + (H - padTop - padBot - gp * (n - 1)) / 2 + k * gp : cy,
    }));
  });

  // edges, faint lines between adjacent columns (sampled nodes only)
  for (let c = 0; c < cols - 1; c++) {
    ctx.strokeStyle = rgbCss(colors.border, 0.18);
    ctx.lineWidth = 1;
    for (const a of colNodes[c]!)
      for (const b of colNodes[c + 1]!) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
  }

  const fcOf = (c: number) => c - 1; // input col → -1, hidden0 → 0, … output → L-1
  layers.forEach((ly, c) => {
    const kind = ly.type;
    const fc = fcOf(c);
    // column caption
    ctx.fillStyle = rgbCss(colors.muted);
    ctx.font = `600 9px ${FONT_MONO}`;
    ctx.textAlign = "center";
    const cap = kind === "input" ? "input" : kind === "output" ? "output" : "hidden";
    ctx.fillText(cap.toUpperCase(), colX(c), 14);
    if (ly.size > DIAGRAM_CAP) {
      // honesty: this column shows a 12-node sample of `size` neurons
      ctx.fillStyle = rgbCss(colors.muted, 0.6);
      ctx.font = `500 9px ${FONT_MONO}`;
      ctx.fillText(`${DIAGRAM_CAP}/${ly.size}`, colX(c), H - 6);
    }

    const actRow = acts ? acts[c] : null; // acts[0] = input, aligns with column c
    for (const nd of colNodes[c]!) {
      const a = actRow ? actRow[nd.idx]! : 0;
      const isSel = selected && selected.layer === fc && selected.idx === nd.idx;
      const isHov = hovered && hovered.layer === fc && hovered.idx === nd.idx;
      const r = kind === "input" ? 4.5 : 6.5;
      // fill intensity from activation magnitude (relu ≥0; probs in [0,1])
      const mag = Math.max(0, Math.min(1, Math.abs(a) / (kind === "output" ? 1 : 3)));
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2);
      ctx.fillStyle = rgbCss(colors.accent, 0.12 + mag * 0.8);
      ctx.fill();
      ctx.lineWidth = isSel ? 2.5 : isHov ? 2 : 1;
      ctx.strokeStyle = isSel
        ? rgbCss(colors.accent)
        : isHov
          ? rgbCss(colors.fg, 0.8)
          : rgbCss(colors.border);
      ctx.stroke();
      nodes.push({ layer: fc, idx: nd.idx, kind, x: nd.x, y: nd.y, r: r + 3 });
    }
  });

  return nodes;
}

/** hit-test a pointer against the returned node boxes (circular). */
export function hitNode(nodes: DiagramNode[], px: number, py: number): DiagramNode | null {
  let best: DiagramNode | null = null;
  let bestD = Infinity;
  for (const nd of nodes) {
    const d = Math.hypot(px - nd.x, py - nd.y);
    if (d <= nd.r && d < bestD) {
      best = nd;
      bestD = d;
    }
  }
  return best;
}

/** a plain signed-value strip (for the output layer's incoming weights over
    the hidden units, positions there were never shuffled). */
export function drawWeightStrip(
  ctx: CanvasRenderingContext2D,
  colors: ThemeColors,
  W: number,
  H: number,
  row: ArrayLike<number>,
) {
  const n = row.length;
  let scale = 0;
  for (let i = 0; i < n; i++) scale = Math.max(scale, Math.abs(row[i]!));
  scale = scale || 1;
  const bw = W / n;
  const mid = H / 2;
  for (let i = 0; i < n; i++) {
    const t = row[i]! / scale;
    const bh = (Math.abs(t) * H) / 2;
    ctx.fillStyle = t >= 0 ? rgbCss(colors.accent, 0.85) : rgbCss(colors.accent3, 0.85);
    ctx.fillRect(i * bw, t >= 0 ? mid - bh : mid, Math.max(1, bw - 0.5), bh);
  }
  ctx.strokeStyle = rgbCss(colors.border, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(W, mid);
  ctx.stroke();
}

/** Blit raw 0-255 HWC bytes verbatim (no per-tile normalize), the 你看到的 /
    模型看到的 views must show the true pixels, not a contrast-stretched copy. */
export function paintRgb(
  ctx: CanvasRenderingContext2D,
  data: ArrayLike<number>,
  sx: number,
  sy: number,
  depth: number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const hctx = off(sx, sy);
  const img = hctx.createImageData(sx, sy);
  for (let p = 0; p < sx * sy; p++) {
    const di = p * 4;
    if (depth === 3) {
      img.data[di] = data[p * 3]!;
      img.data[di + 1] = data[p * 3 + 1]!;
      img.data[di + 2] = data[p * 3 + 2]!;
    } else {
      img.data[di] = img.data[di + 1] = img.data[di + 2] = data[p]!;
    }
    img.data[di + 3] = 255;
  }
  hctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(hctx.canvas, x, y, w, h);
}

/* ---------------- softmax bars ---------------------------------------------
   The output layer's class probabilities as labeled horizontal bars, with the
   predicted (argmax) class in lime and the true label ticked in cyan. */

export function drawProbBars(
  ctx: CanvasRenderingContext2D,
  colors: ThemeColors,
  W: number,
  H: number,
  probs: ArrayLike<number>,
  classNames: string[],
  trueLabel: number | null,
) {
  const n = probs.length;
  const pred = argmax(probs);
  const rowH = H / n;
  const labelW = 40;
  const barX = labelW + 8;
  const barW = W - barX - 40;
  ctx.textBaseline = "middle";
  for (let i = 0; i < n; i++) {
    const cy = i * rowH + rowH / 2;
    const p = probs[i]!;
    // label
    ctx.font = `${i === pred ? 700 : 500} 11px ${FONT_MONO}`;
    ctx.fillStyle = i === pred ? rgbCss(colors.accent) : rgbCss(colors.muted);
    ctx.textAlign = "right";
    ctx.fillText(classNames[i] ?? String(i), labelW, cy);
    // track
    ctx.fillStyle = rgbCss(colors.border, 0.25);
    ctx.fillRect(barX, cy - rowH * 0.28, barW, rowH * 0.56);
    // bar, one hue, magnitude = opacity (design language)
    ctx.fillStyle = i === pred ? rgbCss(colors.accent) : rgbCss(colors.accent, 0.4);
    ctx.fillRect(barX, cy - rowH * 0.28, barW * Math.max(0, Math.min(1, p)), rowH * 0.56);
    // true-label tick
    if (trueLabel === i) {
      ctx.strokeStyle = rgbCss(colors.accent2);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(barX - 4, cy - rowH * 0.34);
      ctx.lineTo(barX - 4, cy + rowH * 0.34);
      ctx.stroke();
    }
    // value
    ctx.font = `500 10px ${FONT_MONO}`;
    ctx.fillStyle = rgbCss(colors.muted);
    ctx.textAlign = "left";
    ctx.fillText(`${(p * 100).toFixed(0)}%`, barX + barW + 6, cy);
  }
}
