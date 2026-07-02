# Session: Build the **Tokenizer** station (Course 2)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Your deliverable is a working `/tokenizer` station plus its
> precompute artifact, with `typecheck`/`lint`/`build` green.

You are filling in `apps/course2/src/stations/tokenizer.tsx`, currently a
placeholder. This is **station 1 of 6** — see `prompts/README.md` for the order.

## What you're building (the pedagogy)

The first wall. Students type text and watch it split into **tokens**, then
discover tokenization is lossy and rule-bound — which motivates everything
downstream (ids → embeddings → sequence models). The station should let them
*feel* that "a model reads tokens, not letters, not words."

**Goal:** students type text and watch it segment live; they can toggle between
**char / word / BPE** schemes and see each token's **id** from a precomputed
vocab, and notice how BPE splits rare/unknown words into subword pieces.

## Prerequisites & shared surface

- **New viz primitive:** none. Tokens render as DOM chips in the station (light,
  no canvas engine). Do **not** add a primitive to `@camp/viz` for this.
- **Shared files you touch:** `precompute/src/camp_precompute/cli.py` (add a
  subcommand) and `apps/course2/public/data/course2/manifest.json` (append to
  `artifacts[]`). If other stations already added entries, **extend**, don't
  overwrite.

## Step 0 — Read first (in this order)

1. `CLAUDE.md` — the golden rules (esp. "the browser never trains" and package
   boundaries). Non-negotiable.
2. `apps/course2/src/stations/reference.tsx` — the canonical station pattern
   (state → controls → viz). Copy its shape.
3. `docs/adding-a-station.md` — the recipe, esp. §4 (precompute) and §5
   (SSR-safety).
4. `docs/course-spec.md` → section **「第二堂課：模型架構演進」** — the pedagogy
   ground truth for this loop. Don't invent new pedagogy.
5. `prompts/README.md` → **The shared Definition of Done**.
6. `apps/course2/src/stations/tokenizer.tsx` — the placeholder you replace (its
   `goal`/`todo` is your spec).

## Step 1 — Precompute the vocab artifact

Segmentation itself is **light and rule-based** — it runs in the browser. What
must be precomputed is the **vocab / merges table** so the browser only looks up
ids, never trains a tokenizer.

- Add a `tokenizer` subcommand to `cli.py` that writes to
  `apps/course2/public/data/course2/tokenizer/`:
  - `vocab.json` — a **small** BPE vocab (token string → id) plus the merges
    list needed to segment. Keep it tiny (a few hundred entries is plenty for a
    demo; a trimmed GPT-2-style vocab or one built from a small fixed corpus is
    fine). Also include a `word` and `char` scheme's lookup or derive those
    client-side.
  - Register the file(s) in `manifest.json` `artifacts[]` with a `station:
    "tokenizer"` tag and a short `description`.
- Regenerate and confirm: `cd precompute && uv run camp-precompute make-data`
  (or your new subcommand). Commit the **small JSON** only.

## Step 2 — Build the station

Replace the placeholder body in `tokenizer.tsx`, following `reference.tsx`:

- **Controls (`@camp/ui`):** `SegmentedControl` for scheme (Char / Word / BPE);
  a text input (use a plain controlled `<textarea>` styled with the theme — no
  new control needed) seeded with a sentence that includes a rare word so BPE
  visibly subword-splits it.
- **Canvas:** DOM token chips — one chip per token, showing the token text and,
  on hover or inline, its **id**. Color/spacing should make word boundaries and
  subword splits legible. Whitespace/`▁`-style markers should be visible so
  students see tokenization is not just "split on spaces."
- **Data:** load `vocab.json` via `loadJSON` from `@camp/data` inside a
  `useEffect` (see reference lines 83–91). Segmentation is a pure function of
  (text, scheme, vocab) — memoize it like `reference.tsx` memoizes `points`.
- **Takeaway line:** name the wall — e.g. "the model never sees your letters or
  your words, only these ids."

## Step 3 — Verify

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm --filter @app/course2 dev   # open http://localhost:5173/tokenizer
```

Type text, flip schemes, confirm ids appear and BPE subword-splits a rare word.
No console errors.

## Definition of Done (checked by `prompts/validate.md`)

Shared contract (see `prompts/README.md` items 1–7), plus these **tokenizer-
specific** criteria:

- [ ] `apps/course2/public/data/course2/tokenizer/vocab.json` exists, is small,
      and is listed in `manifest.json` `artifacts[]`.
- [ ] The station loads that vocab via `@camp/data` in an effect — **no vocab
      hard-coded** in the `.tsx`.
- [ ] Char / Word / BPE toggle works and changes the segmentation live.
- [ ] Each token shows an **id** from the loaded vocab.
- [ ] BPE visibly splits at least one rare/unknown word into subword pieces.
- [ ] No new primitive was added to `@camp/viz` (chips are DOM).
- [ ] `pnpm typecheck && pnpm lint && pnpm build` are green.

## Report when done

Output: files changed, the exact `artifacts[]` entry you added, how to open the
route, and a one-line confirmation of each Definition-of-Done checkbox.
