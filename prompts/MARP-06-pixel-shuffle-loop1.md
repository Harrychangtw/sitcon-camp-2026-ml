# Session: Deck **Loop 1 rewrite** — 順序撞牆 goes from 詞袋平均 to 打亂像素 — Course 2

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: the Loop 1 (MLP 吃文字) section of
> `slides/marp/deck/course2.md` rewritten around the new **`/pixel-shuffle`
> station**, `docs/course-spec.md` synced to the new pedagogy, and the deck
> re-rendered to PDF with no seams. Single-thread editing session — the deck is
> one file; do not fan out.

## Prerequisite (hard gate)

The station session (`prompts/08-pixel-shuffle-station.md`) must have shipped.
Verify before writing a single slide, and **stop and say so** if any fails:

- `apps/course2/src/stations/pixelShuffle/` exists and
  `registry.tsx` has `pixel-shuffle` at lesson slot 3 (with `order-shuffle`
  demoted to `dev`).
- `apps/course2/public/data/course2/pixel-shuffle/meta.json` exists (read it —
  it carries the permutation seed, arch, hyperparams, class names you'll cite).
- You have the **real measured numbers**: final val accuracy of the 原始 and
  打亂 runs and roughly how many steps/seconds to plateau. Take them from the
  station session's report if available; otherwise run the station yourself
  (`pnpm --filter @app/course2 dev` → `/pixel-shuffle`, press ▶, wait for the
  plateau) or read `reference-runs.json` if the build shipped it. The 帶站流程
  notes must quote **verified** numbers — this deck's convention (see the
  current slide's 「實測 ppl 712 對 1162」) is that stage-script numbers are
  measured, never invented.
- `slides/marp/themes/camp-dark.css`, `slides/marp/COOKBOOK.md`,
  `slides/marp/CONVENTIONS.md`, and the `preview`/`pdf` scripts in
  `slides/marp/package.json` exist (MARP-00 foundation).

## Why we're doing this (do not re-litigate)

Loop 1 currently walks: bag-of-embeddings 平均 → Iyyer 準度表 (假安全感) →
順序撞牆站 (word chips vs 詞袋指紋) → 故事/事故 → 問題不在準度，在假設 → RNN.
The averaging mechanism is the weak link — it asks students to reason about
mean-pooled vectors one hour after first meeting vectors. Harry's call: the
wall is now **felt on pixels**, using the CIFAR MLP students trained with their
own hands in the morning class (Part 1's "Train a net on images" playground),
then transferred to word order. The station is built; this session moves the
deck.

The new station in one line (get this exactly right on the card): two identical
tiny MLPs train **live in the browser**, one on real CIFAR-10 images, one on
the same images with **every pixel moved by one fixed shuffle**; the two
loss/accuracy curves overlap and converge to the same accuracy, per-image
predictions match, and hovering a hidden neuron shows the shuffled net learned
the *same* weight template — revealed by the 還原排列 button. To a human the
shuffled images are static; to the MLP nothing happened, because **pixel
positions are just wire labels — the MLP has no assumption that arrangement
means anything**.

## Step 0 — Read first

1. `slides/marp/COOKBOOK.md` — the only allowed slide structures.
   `slides/marp/CONVENTIONS.md` — the station-card recipe (4 blocks: 你要動的
   旋鈕 / 試試看 / 你應該會看到 / 檢核點 + the top-right `chip` link) and the
   three presenter-note layers (講者備忘 / 問全班 / 帶站流程).
2. `slides/marp/deck/course2.md` — the whole deck once, then the Loop 1 region
   closely: from the `divider-02.png` divider (footer `MLP 吃文字`) through the
   休息 slide before the Loop 2 (`RNN`) divider. Locate by headings, not line
   numbers (「什麼都沒改就餵進去」, 「而且準度，還不錯」, 「換你動手 _順序撞牆站_」,
   「故事 vs. 事故」, 「問題不在準度，在假設」, 「休息 10 分鐘」). Also read the
   Loop 0 closer (「現在，每個字都是一排數字了」) and the Loop 2 opener — you own
   both seams.
3. `docs/course-spec.md` § Loop 1 (the bullet block under 第二堂課) and the
   開發清單 § 第二堂課 line 「順序撞牆站（取代原 CNN pixel-shuffle）…」 — the spec
   is pedagogy ground truth for future sessions, so it must be rewritten to
   match, not left to drift.
4. The station itself: `apps/course2/src/stations/pixelShuffle/` (skim the UI
   copy so the card's knob names match the real buttons verbatim — 訓練 / 還原
   排列 / 你看到的 / 模型看到的 etc.) and `meta.json`.
5. The morning-class anchor, for the recall slide: Part 1's P6 playground
   ("Train a net on images", dataset picker incl. CIFAR-10, ▶ train, hover a
   neuron → weight template). Don't overclaim its UI — students saw an
   English-labeled bench with train/pause and neuron inspection.

## The copy contract (inherited from MARP-01 — hold every line to it)

- **Slide face = Denny voice:** one concept per slide; cues, contrast pairs,
  checklists — not prose. If a line reads like README text: delete → shorten →
  plainest phrasing.
- **Reviewability lives in presenter notes**, one per content slide, in the
  three-layer convention: 講者備忘 (delivery spine), 問全班 (planned questions
  **with expected answers**), 帶站流程 (numbered stage script with verified
  numbers, plus 注意-style warnings for demos that can backfire).
- **zh-primary**; practice-native terms stay English (MLP, pixel, token,
  RNN…). **No em-dashes** (use 「，。：、」). **One lime run per statement**;
  stats inline in lime. Only COOKBOOK structures; figures via the existing
  `![h:...]` + `######` caption idiom.
- Station hand-off slides stay **short framing cards** — the teaching happens
  in the tool.

## The new Loop 1 arc (beats — copy is yours to write)

Keep the loop's shape: 假安全感 → 撞牆 → 收束到 RNN. Budget stays ~30 min
(hands-on 14 + ☕ 10, per the divider's `⏱` comment). Divider slide and its
baked `divider-02.png` art (「直接餵給 MLP，會怎樣?」) still fit the new arc —
leave them untouched.

1. **Bridge / recall (replaces 「什麼都沒改就餵進去」):** 今天早上，你們親手訓練
   了一顆 MLP 認 CIFAR-10。它看到的不是「圖」：一張圖先攤平成 3072 個數字。
   Face = the flatten cue (image → 一排數字); note carries the P6 recall (hover
   神經元、weight template) and the seam from Loop 0's cliffhanger: 文字變成了
   數字，但先回頭看清楚，MLP 拿到一排數字之後，到底「看」到什麼。
2. **The bet (問全班 slide, the new 假安全感):** 把每張圖的像素全部打亂（所有圖
   都用同一種亂法，訓練和考試都是），你還認得嗎？它還學得會嗎？ Have the room
   vote/predict before the station — most will bet 學不會; the station pays
   that bet off. Expected-answer layer: 對你是雜訊，對它是同一袋數字，只是編號
   換了。
3. **Station card 「換你動手 _像素撞牆站_」** — the 4-block card + chip
   `🛠 講師畫面／各組電腦已開好 · <a href="https://camp.harrychang.me/pixel-shuffle">/pixel-shuffle</a>`.
   Knobs = ▶ 訓練（兩顆 MLP 同時練）、切換圖片、hover 神經元、還原排列。試試看 ≈
   press ▶ and watch the two curves; compare 你看到的 vs 模型看到的; pause,
   hover the same 神經元 on both nets, hit 還原排列. 你應該會看到 = 兩條曲線疊
   在一起、收在同一個準度（quote the real 打亂 vs 原始 val-acc numbers in
   lime）、還原排列後權重長得一樣。檢核點 = first-person, one line (e.g. 我看到
   打亂像素那顆 MLP，學得跟原本一模一樣好). Replace the old `STATION SPEC`
   comment with one describing the new station's contract; write the 帶站流程
   with the verified numbers and a 注意 line if you find a demo that can
   backfire (e.g. don't promise bit-identical curves — late float drift is
   visible if you zoom; the honest claim is 疊在一起、收在同一點).
4. **Debrief 1 — 你看到的 vs 它看到的:** the pixel pair (real image vs shuffled
   static) with the punchline: 對 MLP，位置只是 **編號**；換編號，題目沒變。
   Figure: generate a real pair from the shipped artifact (a tiny script
   reading `cifar10.bin.gz` + `meta.json`'s permutation → two upscaled PNGs
   into `slides/figures/`, following that folder's naming/README conventions)
   — or a station screenshot if cleaner. Do not fake the shuffle in an image
   editor; use the real π.
5. **Debrief 2 — transfer to words (rework 「故事 vs. 事故」):** 圖的排列、句子
   的詞序，對這種模型都只是編號。故事 vs 事故：同兩個字，順序對調，意思天差地
   遠，可是對一個不把順序當回事的模型，它們就是同一袋字。 Reuse
   `story_accident_bag.png` if it still reads without the averaging pipeline
   behind it; the presenter note (not the face) carries the mechanism for
   review (把每個字的數字平均起來就是最簡單的餵法，而平均正好把順序整個抹掉 —
   this is where the old bag-of-embeddings content survives, as a note).
6. **收束 — 「問題不在準度，在假設」 (keep, retune):** the claim sharpens — 準度
   甚至一分都沒掉，牆不在準度，在 MLP 的設計裡根本沒有「排列有意義」這個假設。
   資料再多也補不回它從沒收到的東西。 Lime line stays the door to Loop 2: 我們
   需要一個 **假設順序有意義** 的架構 → RNN，with the grey RNN one-liner
   subtitle. Keep/adapt `bag_vs_seq.png` if it still fits (有序 vs 無序).
7. **休息 10 分鐘** — keep as-is.

**Cuts (deliberate):** the 「什麼都沒改就餵進去」 bag-of-embeddings pipeline
slide and the Iyyer/DAN accuracy-table slide leave the face of the deck — the
假安全感 job now belongs to the bet + the station's own 準度沒掉 result. Move
what's worth keeping (the averaging mechanism, the Iyyer citation) into
presenter notes where they serve review. If you keep any face slide from the
old run, justify it in your report.

## Step 2 — Sync the spec (same session, non-optional)

`docs/course-spec.md`:
- Rewrite the Loop 1 bullet block (橋接 / 撞牆 demo / 收束) to describe the
  pixel-shuffle experiment: 早上 CIFAR MLP 回收、固定 π 打亂全部像素、雙網
  同步訓練收斂到同一點、hover 權重 + 還原排列、再轉寫到詞序 → RNN. Keep the
  收束 sentence ending in RNN intact in spirit.
- Update the 開發清單 station line: 「順序撞牆站（取代原 CNN pixel-shuffle）」
  becomes the pixel-shuffle station (note the historical irony in a short
  parenthetical if you like: pixel-shuffle 回歸，改為佐證序列假設而非 CNN).
- Grep the repo docs for other 順序撞牆 / order-shuffle references that assert
  the old design (`docs/`, `slides/marp/`) and reconcile: the deck may not
  promise UI the station no longer has. Leave `prompts/done/` archives alone.

## Step 3 — Verify

```bash
grep -n "order-shuffle" slides/marp/deck/course2.md   # should be gone (chip now /pixel-shuffle)
cd slides/marp && pnpm pdf                            # render; then open the PDF
```

Read the rendered Loop 1 start-to-finish as one talk: Loop 0's cliffhanger
lands on the recall slide; the bet sets up the station; the card's knob names
match the real UI; the debrief numbers are the measured ones; the RNN door
still opens; the 休息 slide and Loop 2 divider follow unchanged. Confirm no
other deck section quietly depended on a cut slide (the Loop 4 recap's
「MLP（沒假設、order-blind）」 line should still be true — check it).

## Definition of Done

- [ ] Loop 1 in `slides/marp/deck/course2.md` follows the new arc: recall →
      bet (問全班) → station card `/pixel-shuffle` → 編號 debrief → 故事/事故
      transfer → 問題不在準度，在假設 → 休息; divider untouched.
- [ ] The station card uses the 4-block + chip convention, knob names match the
      shipped UI verbatim, and the `STATION SPEC` comment describes the new
      station.
- [ ] 帶站流程 quotes **measured** numbers (both runs' val accuracy, plateau
      time) and carries any 注意 warning discovered while verifying.
- [ ] Every new/rewritten slide has its three-layer presenter note; faces obey
      Denny voice, zh-primary, no em-dashes, one lime run.
- [ ] The pixel-pair figure is generated from the real artifact/π (or a real
      station screenshot), placed per `slides/figures/` conventions.
- [ ] Old bag-of-embeddings averaging + Iyyer table are off the slide faces;
      surviving content demoted to presenter notes.
- [ ] `docs/course-spec.md` Loop 1 + 開發清單 updated; no doc still promises
      the word-chip station on the lesson line.
- [ ] Deck renders to PDF cleanly; both seams (Loop 0 → 1, Loop 1 → 2) read
      continuously; no dangling `/order-shuffle` chip.

## Report when done

Output: the final Loop 1 slide list (title + archetype per slide, vs the old
six); the measured numbers you quoted and where they came from; the figures
added/kept/cut; what survived into presenter notes from the cut slides; the
course-spec diff summary; any seam adjustments outside Loop 1; and a one-line
pass/fail per Definition-of-Done checkbox.
