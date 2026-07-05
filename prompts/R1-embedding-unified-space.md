# R1 — Embedding: one shared zh+en space, always-embed, GPU note

> **Wave 3, prompt 1 of 2.** Self-contained session prompt. Paste into a fresh
> Claude Code session in this repo; it refactors the **embedding** station end to
> end (precompute model → server route → shared UI infra → station) and verifies.
> **Run this BEFORE `R2-real-models-live-gpu.md`** — R1 builds the shared
> **GPU-status / latency** infra in `@camp/ui` + `@camp/data` that R2 reuses
> (same "first session establishes the shared surface" rule the wave-1 theme
> retune followed). Read `CLAUDE.md`, `prompts/DESIGN.md`, `prompts/README.md`,
> and `server/README.md` first.

## Why this refactor

Every station is now served by a real GPU (4× V100 in prod, 1× RTX 3090 in dev),
so live inference is always on (`VITE_LIVE_INFERENCE_URL` is set in both
`.env.local` and `.env.production.local`). Two problems with today's embedding
station, both about **UI complexity** and **rewarding exploration**:

1. **zh and en are two separate spaces behind a toggle.** They are embedded by
   *two different* models (`BAAI/bge-base-zh-v1.5` and `BAAI/bge-base-en-v1.5`,
   see `precompute/src/camp_precompute/embedding.py` `MODELS`), so their vectors
   are **not comparable** — you literally cannot put 貓 and `cat` in the same
   plot. The `語言` `SegmentedControl` is a wall, not a feature.
2. **A typed word that isn't in the shipped vocab dead-ends** ("「…」不在詞彙表
   裡"). The live path exists but is treated as an exception with its own
   pending/hit/notFound copy. The student should be able to type *anything* and
   just see where it lands + its nearest neighbours.

**Goal:** one shared multilingual cloud (貓 sits next to `cat`), any typed word
is embedded and dropped into that same cloud with its neighbours lit, and a
small honest note that a GPU computed it (latency) — or that we fell back to the
cached artifact when the server is down. Fewer controls, more to explore.

## The two decisions already made (don't relitigate)

- **Single multilingual embedding model: `Qwen/Qwen3-Embedding-0.6B`.** One model
  → one vector space → zh and en are directly comparable and get one shared PCA
  projection. It also reuses the Qwen-on-device family R2 loads for the LM
  stations. (If `Qwen3-Embedding-0.6B` proves impractical to load, `BAAI/bge-m3`
  is an acceptable multilingual fallback — but a *single* multilingual model
  either way. Do **not** keep the two per-language BGE models.)
- **GPU note surfaces latency + fallback only** — no device-name badge, no
  fake spinner theatrics. "GPU · 142 ms" when live; "離線 · 顯示預先計算的結果"
  when it fell back to the shipped JSON. Keep it to one quiet mono line.

## Part 0 — shared GPU-status infra (R2 depends on this; build it here)

This is the wave-3 shared surface. Keep package boundaries: **timing/fetch in
`@camp/data`, presentation in `@camp/ui`.**

1. **`@camp/data` — a timed live-inference helper.** Add alongside `liveInfer`
   (keep `liveInfer` as-is for back-compat) a variant that returns latency:

   ```ts
   export interface LiveResult<T> { data: T; ms: number }
   export async function liveInferTimed<T>(
     path: string, body: unknown, timeoutMs?: number,
   ): Promise<LiveResult<T> | null>;
   ```

   Measure wall-clock round-trip around the `fetch` (use `performance.now()`).
   Same never-throws contract: any failure → `null`. Export from
   `packages/data/src/index.ts`.

2. **`@camp/ui` — a presentational status line.** A tiny SSR-safe component that
   takes a discriminated prop and renders one mono micro-label, nothing else:

   ```ts
   export type LiveState =
     | { kind: "idle" }
     | { kind: "pending" }
     | { kind: "live"; ms: number }
     | { kind: "cached" };     // server unreachable → showing shipped artifact
   export function LiveStatus(props: { state: LiveState; className?: string }): JSX.Element | null;
   ```

   Copy (zh-TW, per `00a` glossary): `pending` → `GPU 計算中…`; `live` →
   `GPU · {ms} ms`; `cached` → `離線 · 顯示預先計算的結果`; `idle` → render
   nothing. Style with theme utilities only (`text-accent` for live, `text-muted`
   for pending, `text-warning` for cached; `font-mono text-xs`). NO fetching, NO
   lesson copy beyond these four states. Export from `packages/ui/src/index.ts`.

R2 reuses **both** of these verbatim — do not fork them there.

## Part 1 — precompute: one shared space over the combined vocab

Edit `precompute/src/camp_precompute/embedding.py` (and its `cli.py` wiring):

- **One model** (`Qwen/Qwen3-Embedding-0.6B`) embeds **both** vocabs. Replace the
  per-language `MODELS` map + `LANGUAGES` loop with a single model that embeds the
  union of the zh and en word lists. Keep a per-word `lang` field ("zh"/"en") for
  optional display, but **do not** project them separately.
- **One PCA** fit over the *combined* L2-normalised vectors → shared 3D coords, so
  cross-lingual neighbours are real (貓↔cat land together). **One k-means** over
  the combined set for `category` colouring (keep `N_CLUSTERS`, palette ≤8).
- **Neighbours across the combined vocab** (`TOP_K`), so a zh word can surface en
  neighbours and vice-versa — that cross-lingual mixing *is* the lesson.
- **Output unified artifacts** (no `.zh`/`.en` suffix):
  `apps/course2/public/data/course2/embedding/points.json` and `neighbors.json`.
  Update `upsert_manifest_artifact` calls; **remove** the four old
  `embedding-{points,neighbors}-{zh,en}` manifest entries and delete the stale
  per-lang JSON files.
- Update `export-embedding-state` to export ONE `embedding_state.npz` (single
  model, combined vocab/vectors/PCA/centroids) and keep its verify-vs-artifacts
  guard (`verify_state_against_artifacts`) working against the unified JSON.
- Watch the shipped-JSON size budget (`MAX_WORDS` is per-language today; the
  combined cloud is ~2×). Trim `MAX_WORDS` or `TOP_K` if `points.json` +
  `neighbors.json` blow past today's ~256 KB / ~3.6 MB footprints; `log()` what
  you trimmed. `*.npz` stays gitignored under `precompute/artifacts/`.

## Part 2 — server: `/embedding/lookup` drops `lang`, always one space

Edit `server/app/routers/embedding.py`, `server/app/loader.py`,
`server/app/schemas.py`:

- Load the **single** `Qwen3-Embedding-0.6B` encoder once at startup on the
  resolved device (replace the per-lang `_load_lang` dict with one
  `LangEmbedding`-equivalent over the combined vocab/state).
- `EmbeddingLookupRequest` → `{ word }` only (drop `lang`). Response drops `lang`.
  Keep `inVocab`, `point`, `neighbors`, `suggestions`. In-vocab words still return
  shipped values verbatim (live == precomputed); novel words embed live + project
  with the shared PCA + nearest-centroid category + cosine top-K over the combined
  vectors — exactly the same math, one space.
- Update `server/README.md`'s endpoint row and `model_names`.

## Part 3 — station: one cloud, always-embed, fewer controls

Rewrite `apps/course2/src/stations/embedding.tsx`:

- **Remove** the `語言 / Language` `SegmentedControl`, the `Lang` type, the
  per-lang `PLACEHOLDER`, and the per-lang lazy-load effect. Load the single
  `points.json` + `neighbors.json` once.
- **One search box, always-embed.** Any typed word → debounced `liveInferTimed`
  to `/embedding/lookup` → drop the returned point into the *same* cloud and light
  its neighbours, through the existing `scatterData`/`highlight`/`nearest` derived
  state. **Delete the "不在詞彙表裡" dead-end** — an out-of-vocab word is the
  normal case now, not an error. (Keep the in-vocab fast path: if the word is
  already a point, highlight it without a round-trip.)
- **GPU note:** render `<LiveStatus>` near the search box / neighbour list —
  `pending` while the debounced request is in flight, `live` with `ms` on
  success, `cached` when `liveInferTimed` returns `null` (server down) *and* the
  word wasn't in the shipped cloud.
- **Cut a control to reduce complexity:** fold `依類別上色` away — always colour
  by cluster (that's what makes 貓↔cat legible); keep 2D/3D, search, and `k`.
  The category legend stays (it now spans both languages).
- **Takeaway rewrite:** the payoff is now *cross-lingual* — search `cat` and 貓、
  貓咪、kitten cluster together though one model never saw a translation table;
  search 蘋果/`apple` and fruit + phone senses still mix. Keep it concrete, zh-TW.

## Definition of Done (checkable — extends `prompts/README.md` §DoD)

1. `@camp/data` exports `liveInferTimed`; `@camp/ui` exports `LiveStatus`. Both
   are boundary-clean (no fetch in ui, no React in data) and SSR-safe.
2. `uv run camp-precompute embedding && uv run camp-precompute export-embedding-state`
   writes a **single** unified `points.json`/`neighbors.json` (no `.zh`/`.en`)
   and one `embedding_state.npz`; the export verify-guard passes; `manifest.json`
   lists exactly two embedding artifacts.
3. Station has **no language toggle**; zh and en points share one cloud; a
   searched zh word can list en neighbours (verify 貓 or 蘋果 surfaces at least
   one en neighbour, and `cat`/`apple` at least one zh neighbour).
4. Typing a word **not** in the shipped vocab embeds it live and lights its
   neighbours — no "不在詞彙表裡" message anywhere in the file.
5. `LiveStatus` shows `GPU · N ms` on a live embed and `離線 · …` when the server
   is stopped (test by unsetting `VITE_LIVE_INFERENCE_URL` or stopping the server:
   the shipped cloud still renders, novel words simply can't be added).
6. Golden rules hold: `three`/onnx lazy in effects; browser does only PCA
   *playback* + neighbour highlight (no embedding math in-browser); no hard-coded
   hexes; theme utilities + mono micro-labels per `DESIGN.md`.
7. Green: `pnpm typecheck && pnpm lint && pnpm build`; route renders at
   `/embedding` with no console errors.

## Notes / gotchas

- `Qwen3-Embedding-0.6B` uses last-token pooling with an EOS and (optionally) a
  query instruction. Embed the vocab **without** a retrieval instruction prefix
  (plain words), and use the SAME call in `loader.encode_word` so live == shipped.
  Pin the exact pooling in one helper both precompute and server import.
- Keep `project_3d` and the neighbour math as the single shared implementation
  imported by both sides — do not reimplement in the server.
- This prompt does **not** touch next-token/rnn/transformer/order-shuffle — that's
  R2. Only shared infra + embedding here, so the two sessions don't collide.
