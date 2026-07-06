# BUG: Embedding station — typing does nothing, no live request fires

**Status:** open, needs in-browser diagnosis.
**Best diagnosed on:** MacBook + Claude driving Chrome (DevTools console + network),
because everything server-side and build-side has already been ruled out from the
Linux box — the remaining unknown is purely client runtime behaviour.

## Symptom (reported by user)

On the **live public station** `https://sitconcamp-gpu-v100x4.boreray-hippocampus.ts.net/embedding`:

- Typing into the search box produces **nothing** — no neighbour readout panel
  (top-right), no highlighted points in the cloud, no "live · N ms" badge.
- The **backend logs show no request** for the embedding route → the browser is
  **not even firing** `POST /embedding/lookup`. The request never leaves the page.
- The server itself is healthy and **other stations' live inference works**
  (next-token / rnn / transformer), so this is embedding-frontend-specific.

## What has already been RULED OUT (verified from the Linux serving box)

Do not re-investigate these — all confirmed working:

1. **Server + funnel**: `GET :8443/health` → 200, 4× V100 replicas behind the
   Caddy LB on :8300, models loaded (`embedding:Qwen/Qwen3-Embedding-0.6B`).
2. **Live endpoint works**: `POST :8443/embedding/lookup` with `X-Camp-Token`
   returns correct results for both in-vocab (`悲傷`, verbatim) and OOV
   (`quantum` → theory/phase/states…; `柴犬` → 貓/獅子/dog/cat…).
3. **CORS**: preflight + POST succeed from BOTH origins in `ALLOWED_ORIGINS`
   — `http://localhost:5173` and the public origin
   `https://sitconcamp-gpu-v100x4.boreray-hippocampus.ts.net` (443, no port).
   (Note: a non-allowed origin like `:5174` correctly 400s — irrelevant to prod.)
4. **Config baked into the served bundle**: the public site serves
   `dist/assets/index-BgsiGRFZ.js` (built today), which contains the correct
   `VITE_LIVE_INFERENCE_URL=https://…ts.net:8443`, the token, and the
   `/embedding/lookup` path. No stale `localhost:8300`.
5. **Data artifacts load**: `GET /data/course2/embedding/points.json` (200,
   574 KB, valid JSON) and `neighbors.json` (200, 3.6 MB, valid JSON) from the
   public URL.
6. **Route mapping**: `apps/course2/src/stations/registry.tsx` maps
   `id:"embedding"` → `<EmbeddingStation/>` (the real station, not a placeholder).
7. **Input wiring**: `packages/ui/src/SuggestInput.tsx` fires
   `onChange(e.target.value)` on every keystroke; station passes
   `value={query} onChange={setQuery}`. No obvious break in the binding.

## Key design fact that shapes the bug

`apps/course2/src/stations/embedding.tsx` only calls the server for words **NOT**
in the shipped vocab (the `missingWord` memo, ~L124-128). Critically it is gated
on **`points.length > 0`**:

```ts
const missingWord = useMemo(() => {
  const q = query.trim().toLowerCase();
  if (!q || /\s/.test(q)) return null;
  return points.length > 0 && !wordSet.has(q) ? q : null;
}, [query, points, wordSet]);
```

And in-vocab words take an instant local fast path (`focusWord`) with no request.

So "nothing happens for ANY word AND no request fires" means **something upstream
of both paths is broken in the browser** — most likely one of:

- **(A) `points`/`neighbors` never populate in the browser** even though the URLs
  return 200 via curl → then `wordSet` is empty (no in-vocab highlight) AND
  `points.length === 0` (so `missingWord` stays null → no request ever). This is
  the single most consistent explanation for BOTH symptoms at once. Suspect
  `loadJSON` behaviour, a rejected/aborted fetch, JSON parse, or the
  `useEffect` mount fetch silently failing (it has no error handling — the
  `.then` has no `.catch`).
- **(B) A JS exception** in the station render/effect (e.g. Scatter3D/three.js
  WebGL init) throws and kills reactivity — though if the input still renders and
  accepts text, a hard crash is less likely unless caught by an error boundary.
- **(C)** `query` state not updating (least likely — SuggestInput looks correct).

Given no backend log AND no visible reaction, **(A) is the leading hypothesis.**

## Exactly what to do in Chrome (MacBook)

1. Open `https://sitconcamp-gpu-v100x4.boreray-hippocampus.ts.net/embedding`.
2. Open DevTools **Console** — look for any red errors on load (three.js/WebGL,
   fetch failures, uncaught exceptions).
3. Open **Network** tab, filter to `points.json` / `neighbors.json`:
   - Did they load 200 with a JSON body **in the browser**? Or blocked/aborted
     (CORS on the data host? service worker? cache? content-type)?
4. Type `貓` (in-vocab). Expected: readout panel top-right + highlighted points,
   **no** network request. If nothing → `points` didn't populate → confirms (A).
5. Type `柴犬` (OOV). Expected: after ~350 ms debounce, a `POST …:8443/embedding/lookup`
   appears in Network + "live · N ms" badge. If no request → confirms `missingWord`
   is null → `points.length === 0` → confirms (A).
6. In the Console, inspect whether the point cloud rendered at all (is the canvas
   empty?). An empty cloud + empty readout = data never loaded.

## Files to look at

- `apps/course2/src/stations/embedding.tsx` — the mount `useEffect` fetch (L85-99)
  has **no error handling**; add a `.catch` with logging while diagnosing so a
  failed load is visible instead of silent.
- `packages/data/src/loadJSON.ts` — how the fetch resolves the path; check the
  base URL / relative path resolves correctly under the public deploy (does it
  assume same-origin? any leading-slash assumption?).
- `packages/data/src/liveInfer.ts` — `liveInferTimed`; note it NEVER throws
  (swallows all failures to null) so a live failure is silent by design.

## Likely fix directions (once confirmed)

- If (A): make the mount fetch resilient + surfaced (catch + user-visible error),
  and reconsider gating `missingWord` on `points.length > 0` — a failed artifact
  load currently disables live lookup entirely, which is the worst-case coupling
  (offline data breaks the online path too). Consider allowing the live request
  even when `points` is empty, so the server path degrades independently.
- If (B): guard/lazy-init the three.js path (SSR-safety rule already in CLAUDE.md;
  verify Scatter3D isn't throwing on this browser/GPU).

## Repro/verify commands (from the Linux box, already-passing baseline)

```bash
TOKEN=<see server/.env CAMP_TOKEN>
F=https://sitconcamp-gpu-v100x4.boreray-hippocampus.ts.net:8443
curl -s $F/health
curl -s -X POST $F/embedding/lookup -H "Content-Type: application/json" \
  -H "X-Camp-Token: $TOKEN" -d '{"word":"柴犬"}'
curl -s -o /dev/null -w '%{http_code}\n' \
  https://sitconcamp-gpu-v100x4.boreray-hippocampus.ts.net/data/course2/embedding/points.json
```
