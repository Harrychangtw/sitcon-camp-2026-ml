# Session: Course 2 deck **content overhaul** (self-contained rewrite, fan-out)

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: the full Course 2 lecture deck as Marp markdown in
> `slides/marp/deck/`, rewritten so **each slide is self-contained and reviewable
> without Harry narrating**, rendered to PDF. You are the **main agent =
> reviewer + integrator**. You do not write slides yourself; you spawn **one Opus
> subagent per section**, each rewriting its section into its own file against the
> foundation contract, then you concatenate, reconcile, and verify.

## Prerequisite (hard gate)

`prompts/MARP-00-foundation.md` must have run. These must exist or **stop and say
so**:
- `slides/marp/themes/camp-dark.css`
- `slides/marp/COOKBOOK.md`  ← the authoring contract every subagent writes against
- `slides/marp/MASTERS.md`
- a working `preview`/`pdf` script in `slides/marp/package.json`

If `COOKBOOK.md` is missing, the fan-out will produce six visual dialects. Do not
proceed without it.

## Why this exists

The Affinity-era deck (`slides/decks/course2.md`) is a **lecture scaffold**:
sparse, and it leans on what Harry says live. It is not useful to a student
reviewing later. The fix (Harry's call): **minimal slide faces in Denny's voice +
the reviewable explanation in presenter notes** (see the voice contract below).
That is a content rewrite, not a format conversion — which is why it is delegated
section-by-section to Opus subagents while you review.

## Source of truth (what to rewrite FROM, INTO what)

- **Pedagogy ground truth:** `docs/course-spec.md` §「第二堂課：模型架構演進」. The
  loop / 撞牆 (hit-a-wall) rhythm is fixed. **Do not invent new pedagogy.**
- **Beat structure + shipped refinements:** `slides/decks/course2.md`. Its
  per-slide beats, section boundaries, time budget, and station hand-offs are the
  plan. Its **`BUILT STATE` notes record what Harry actually shipped/refined in
  Affinity** — those decisions (reworded titles, chosen examples like the OOV
  「祺煒」, inverted title tiers on slide 07, the two-panel one-hot|embedding on 08)
  **must survive** the rewrite.
- **Into:** self-contained Marp slides using **only** the recipes in
  `slides/marp/COOKBOOK.md`.

The Affinity-era **verbatim `TEXT` blocks are replaced, not ported** — they were
written sparse for live narration. Keep the *beat and the pedagogy*; rewrite the
*copy* so the slide carries its own point.

## The voice contract — give this to every subagent verbatim

Two goals, deliberately reconciled (this reconciliation is Harry's call — do not
second-guess it):

**1. Slide face = minimal, per Denny's slide voice.**
Reference: https://github.com/denny0223/SITCON-Camp-2026-Prep-Course/blob/gh-pages/AGENTS.md#dennys-slide-voice
- **One concept per slide.** Short visible text: cue-like titles, keywords,
  fragments, contrast pairs, checklists, copyable commands.
- **Prefer simple diagrams, contrast pairs, and checklists over paragraphs.**
- **Avoid:** turning a slide into a mini-article; AI-flavored complete sentences;
  marketing / motivational filler; over-translating practice-native terms (token,
  embedding, attention, prompt, RNN — keep them as-is).
- **The core test:** if a line sounds like README prose, shorten it into a cue,
  label, example, command, URL, contrast pair, or checkpoint. Revision order:
  **Delete → Shorten → use the plainest phrasing → add explanation only if needed.**

**2. Reviewability lives in presenter notes, not on the slide.**
Harry wants the deck useful to review later. Achieve that **without** fattening
the slide: put the connective, sentence-level explanation in **Marp presenter
notes** (an HTML comment on the slide). The projected slide stays a clean cue; a
student self-studying reads the note. This is how "minimal" and "reviewable"
coexist. Every content slide that carries a real idea gets a presenter note.

**Copy rules (both goals):**
- **zh-primary** (Traditional Chinese; TW high-schoolers); English only for
  practice-native terms.
- **No em-dashes in copy** (— and —— banned; use fullwidth CJK punctuation
  「，。：、」).
- **One lime run per statement**; stats inline in lime, never blown up (no
  big-stat slide).

**Density guardrail:** the *slide face* stays sparse — depth goes in notes, not in
more on-slide prose. The deck may grow modestly for clarity but target **≤ ~30%
more slides** than the 35-slide Affinity deck; split before you wall-of-text.

**Worked exemplar** (slide 17 — the wall after bag-of-embeddings):

_Slide face (Denny voice — cue + contrast + one lime word):_
```
# 一袋字，沒有順序

- 「貓追狗」＝「狗追貓」   ← 在 MLP 眼中一模一樣
- 它看不到 **[lime: 順序]**
```
_Presenter note (carries the review detail, off the slide face):_
```
<!--
MLP 把整句話揉成一袋 embedding 再取平均，位置資訊在這一步就被丟掉。
所以主詞受詞對調、意思相反的兩句，對它完全一樣。
這就是下一個要補的洞，帶到 RNN。
-->
```
Same beat and pedagogy as the Affinity slide; the face is now a sparse cue, the
"why it matters" lives in the note. Mirror this split across the deck.

## Sections → one file per section → one Opus subagent per section

Split by the loop structure in `course2.md`. **Each subagent writes its own file**
(clean-parallel; no shared-file collision, unlike the station prompts). Map the
verbatim slide numbers from `course2.md`:

| Part | File (`slides/marp/deck/`) | Slides | Section (footer-right label) |
|------|----------------------------|--------|------------------------------|
| 0 | `part-0-front.md`             | 01–02 | Cover · Outline |
| 1 | `part-1-loop0.md`             | 03–11 | 文字怎麼變數字 (Tokenizer + Embedding) |
| 2 | `part-2-loop1.md`             | 12–17 | MLP 吃文字 (bag-of-embeddings + 順序撞牆) |
| 3 | `part-3-loop2.md`             | 18–24 | RNN (next-token + hidden state) |
| 4 | `part-4-loop3.md`             | 25–32 | Transformer (attention + PE + residual + QKV) |
| 5 | `part-5-loop4-resources.md`   | 33–35 | 架構即樂高 + 收尾 |

Spawn the six with the **Agent tool, `model: opus`**, in parallel (independent
files). Each subagent's prompt must include, inline (do not assume it reads your
context): the **voice contract** above, the path to `COOKBOOK.md` (its recipes are
the only allowed structures), its section's beats pulled from `course2.md` +
`docs/course-spec.md`, the exact slide list + archetype per slide, the station
hand-offs, and the figures it may use from `slides/figures/`.

## Set-piece slides — do NOT rewrite as prose (tell the relevant subagents)

Harry builds the **cover/title, outline (TOC), and section dividers in Affinity**
as full art. For those, the subagent emits a **background-image slide** pointing at
the expected Affinity export in `assets/bg/` (placeholder filename per
`MASTERS.md`), with the intended text left in an HTML comment for Harry — **not** a
rewritten prose slide. Exception: a section **divider** carries its kicker +
section question as Marp text over the master (per the COOKBOOK divider recipe);
keep that text, it is part of the teaching. All **content** slides (title+body,
list/checklist, contrast pair, code/command, figure — the simple COOKBOOK set) get
the Denny-voice rewrite with a presenter note. Station **hand-off** slides stay
short framing slides that pose the question students explore, marked per the
COOKBOOK — the teaching happens in the tool, so do not rebuild station content as
static slides.

## Your job as main agent (review + integrate)

1. **Dispatch** the six subagents (parallel). Collect their part files.
2. **Review each part against the contract** — objective, not "looks right":
   every content slide has its takeaway in text; only COOKBOOK structures used;
   capsules not flattened; one lime run; no em-dashes; zh-primary; `BUILT STATE`
   refinements preserved; set-pieces handled as background slides; station
   hand-offs short. Send it back to the subagent if it misses.
3. **Concatenate** the parts in order into `slides/marp/deck/course2.md`: one
   global Marp front-matter block at the top (`theme: camp-dark`, `paginate: true`,
   size), then the parts joined with `---` slide separators (strip any per-part
   front-matter). Marp computes `N / TT` across the whole file automatically.
4. **Reconcile cross-file seams:** the TOC page references (`……… P. n`) and any
   "see slide N" must point at final concatenated page numbers; footer
   section-labels are constant within a section; each part's exit sets up the next
   part's entry (one continuous talk). The TOC page numbers in `course2.md` are
   explicitly reference-only — recompute them.
5. **Render + verify:** export `deck/course2.md` to PDF (`--allow-local-files`),
   open it, confirm it reads cover → resources as one talk with the theme applied,
   CSS placeholder backgrounds until Affinity masters land, no broken figures.

## Definition of Done

- [ ] `slides/marp/deck/part-0..5*.md` each exist, each written by an Opus
      subagent against `COOKBOOK.md` only (no invented structures).
- [ ] Every **content** slide follows Denny's voice on the face (cue/fragments/
      contrast, one concept, no mini-article) **and** carries its review detail in
      a **presenter note** — minimal face, reviewable via notes.
- [ ] Pedagogy matches `docs/course-spec.md`; beats + `BUILT STATE` refinements
      from `course2.md` survive; verbatim Affinity `TEXT` replaced, not ported.
- [ ] **Set-pieces** (cover/title, outline/TOC) are Affinity background slides with
      intent in comments; **dividers** keep kicker + question over the master;
      **station hand-offs** stay short framing slides.
- [ ] Copy rules hold: zh-primary, **no em-dashes**, one lime run per statement,
      stats inline (no big-stat slide).
- [ ] Slide count within ~30% of the 35-slide Affinity deck (no wall-of-text).
- [ ] `deck/course2.md` is the concatenated whole with one front-matter,
      continuous `N / TT` pagination, reconciled TOC page refs and footer labels;
      it exports to PDF and reads as one continuous talk.

## Report when done

Output: the final `deck/` file list + total slide count (vs 35); a per-section
one-line summary of what each Opus subagent produced; the reconciled TOC page map;
which slides are Affinity set-piece placeholders (awaiting `assets/bg/` PNGs) vs.
fully rewritten; any beat where you deviated from `course2.md` and why; and a
one-line pass/fail per Definition-of-Done checkbox.
