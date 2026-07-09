/**
 * Fetch a gzipped binary artifact and return the decompressed bytes.
 *
 * Exists for raw-pixel dataset packs (`*.bin.gz`): decoding image data through
 * a canvas + `getImageData` read-back is unreliable in headless/GPU-composited
 * contexts (regions come back black), which silently feeds constant input to
 * whatever consumes it. Raw bytes + native gunzip is deterministic and
 * canvas-free.
 *
 * Static hosts disagree on `.gz` files: some (vite preview/dev via sirv) serve
 * them with `Content-Encoding: gzip`, so the browser has ALREADY decompressed
 * the body by the time we see it; others hand over the raw gzip bytes. Sniff
 * the gzip magic (0x1f 0x8b) and only run `DecompressionStream` when the
 * payload is still compressed, so the loader works under both behaviors.
 */
export async function loadGzipBinary(
  url: string,
  init?: RequestInit,
): Promise<Uint8Array> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`loadGzipBinary: ${res.status} ${res.statusText}, ${url}`);
  }
  const raw = new Uint8Array(await res.arrayBuffer());
  if (raw.length < 2 || raw[0] !== 0x1f || raw[1] !== 0x8b) {
    return raw; // transport layer already gunzipped it
  }
  const stream = new Blob([raw as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}
