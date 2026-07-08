# FIX: inline plain-language gloss for every jargon term students operate on; purge stray English — Course 2 stations

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: every jargon term a student **reads or operates**
> in a station carries a one-line 白話文 explanation *on screen* (not buried in a
> hover-only panel), and non-jargon English is removed from station copy.
> `typecheck`/`lint`/`build` green. Run `/code-review high` when done.

## Why (trial-run feedback)

> 共同問題：都有提到 layer 給學員實作，但是不給解釋，這樣學員只會是單純玩，但不
> 知道自己在玩什麼。至少要說 layer 是什麼？會影響什麼？其他有在實作上面操作的專
> 有名詞都是。

Plus: "太多英文單字了，學員會放棄學習"; "要小心不要蹦出英文，像是 drag 這種非專有
名詞的英文 (晶晶體)"; specific undefined terms flagged: **layer, head, embedding,
one-hot, 詞袋指紋, Qwen, PPL, 通順度**.

**Sequencing:** this pairs with `prompts/fixes/shared-ui/FIX-hover-reveal-controls.md`. That prompt
makes control `info` discoverable on hover; **this** prompt makes the *core*
concept for each knob visible **without** hovering (a knob's identity shouldn't
require discovery). Run hover-reveal first if both are pending.

## The rule

For every term a student **manipulates** (every `BlockSlider`/`BlockToggle`
`label`) and every jargon term in **visible takeaway/subtitle copy**, there must
be a plain-language "what is it / what does it change" that is **visible on the
face**, not only in a hover tooltip. Hover can hold the *longer* nuance; the
one-liner identity must be visible.

## Concrete targets (from the code map)

- **Transformer** (`apps/course2/src/stations/transformer.tsx`): the **Layer**
  (line ~530) and **Head** (line ~540) dials define head/layer roles **only** in
  hover `info` + the takeaway. Surface a persistent one-liner: what a *layer* is
  and what changing it does; what a *head* is. (The deeper heads↔layers
  relationship is built in `prompts/fixes/stations/FIX-transformer-input-and-heads.md` — don't
  duplicate; keep this to the plain identity.) Column titles `Tokenizer` /
  `Embedding` / `Next Token` (lines ~601/624/814) and dial labels `Layer` /
  `Head` / `Temperature` are English — add a Chinese gloss or render bilingually.
- **Next Token** (`nextToken.tsx`): station title is bare English `"Next Token"`
  (line ~261) — every other station title is Chinese; give it a Chinese title/gloss.
  Control labels `Temperature` (~298) and `Top-k` (~309) are English amid Chinese
  siblings — add gloss. `context 視窗` (~278) mixes English "context" mid-Chinese.
- **Order Shuffle** (`orderShuffle.tsx`): `mean` printed in the diagram (~773)
  next to `平均` — drop the bare English or gloss it. `詞袋指紋` (~788) and
  `bag-of-words` (~624) need a one-line "what is a 詞袋指紋" on the face.
- **RNN Viz** (`rnnViz.tsx`): running-prose English — `vector` ("塞進一個
  vector 裡", ~257), `hidden state` (~220), `token`. Gloss `hidden state` on the
  face (it's the whole lesson); soften stray `vector`.
- **Embedding** (`embedding.tsx`): ensure a visible "什麼是 embedding" one-liner
  (the "有教什麼是 embedding 嗎" feedback). The deeper *how it's learned* story is
  **backlog** (see `todo.md`) — don't build it here; just the plain identity.

## Style constraints

- Follow `prompts/DESIGN.md`: theme utilities only, mono/uppercase micro-labels,
  lime reserved for the focused element. Glosses are quiet secondary text, not
  shouty.
- **Keep genuine ML jargon** (token, embedding, attention) — the fix is to *gloss*
  it once where first operated, not to purge it. Only purge **non-jargon** English
  (drag, mean, stray "vector"/"context" in Chinese prose) and bare English labels
  that have a natural Chinese equivalent.
- One canonical gloss per term — reuse the wording across stations; don't invent a
  different phrasing per station.

## Definition of Done

- Shared DoD in `prompts/README.md`.
- In `pnpm --filter @app/course2 dev`, opening each of transformer / next-token /
  order-shuffle / rnn-viz / embedding shows, **without hovering**, a plain-language
  identity for every term the student can operate, and no non-jargon English
  remains in visible copy. No console errors.
