/* The fixed pixel permutation π, shared by every consumer: the worker (run B's
   dataset + permuted-copy init), the input painter (模型看到的 view) and the
   detail panel (還原排列). π lives in meta.json over the 1,024 pixel POSITIONS;
   RGB triplets move together, shuffled position p shows original pixel π[p].
   Pure functions, no DOM. */

/** Expand a pixel-position permutation to scalar indices (RGB stays together):
    scalar[p*depth+c] = π[p]*depth + c. */
export function expandPerm(perm: number[], depth: number): Int32Array {
  const out = new Int32Array(perm.length * depth);
  for (let p = 0; p < perm.length; p++) {
    for (let c = 0; c < depth; c++) out[p * depth + c] = perm[p]! * depth + c;
  }
  return out;
}

/** π⁻¹ as scalar indices, what 還原排列 applies to run B's weight template. */
export function invertScalarPerm(scalarPerm: Int32Array): Int32Array {
  const inv = new Int32Array(scalarPerm.length);
  for (let i = 0; i < scalarPerm.length; i++) inv[scalarPerm[i]!] = i;
  return inv;
}

/** Gather: dst[i] = src[scalarPerm[i]]. With `expandPerm(π)` this produces the
    shuffled view (position p shows original pixel π[p]); with the inverse it
    un-shuffles a shuffled-space array back to original pixel order. */
export function applyScalarPerm(
  src: ArrayLike<number>,
  scalarPerm: Int32Array,
): Float32Array {
  const out = new Float32Array(scalarPerm.length);
  for (let i = 0; i < scalarPerm.length; i++) out[i] = src[scalarPerm[i]!]!;
  return out;
}

/** The permuted-copy init (the theorem's load-bearing step): rewire `dst`'s
    FIRST layer as the π-relabeled copy of `src`'s, if shuffled position p
    holds original pixel π[p], then W_dst[o][p·depth+c] = W_src[o][π[p]·depth+c].
    Biases and deeper layers must already be exact copies (build both nets from
    the same seed). After this, training dst on π-moved inputs is the same
    arithmetic as training src on the originals, under renamed wires. */
export function relabelFirstLayer(
  dst: { layers: { W: Float32Array; inDim: number; outDim: number }[] },
  src: { layers: { W: Float32Array; inDim: number; outDim: number }[] },
  scalarPerm: Int32Array,
): void {
  const d = dst.layers[0]!;
  const s = src.layers[0]!.W;
  for (let o = 0; o < d.outDim; o++) {
    const base = o * d.inDim;
    for (let i = 0; i < d.inDim; i++) d.W[base + i] = s[base + scalarPerm[i]!]!;
  }
}
