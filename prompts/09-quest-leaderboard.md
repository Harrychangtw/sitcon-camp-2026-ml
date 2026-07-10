# Session: **任務 + 排行榜 (Quests & Leaderboard)** — a shared quest system across all six lesson stations — Course 2

> Paste this whole file into a fresh Claude Code session at the repo root. It is
> self-contained. Deliverable: every lesson station (tokenizer, embedding,
> pixel-shuffle, next-token, rnn-viz, transformer) gains a small set of
> **quests** (scavenger hunts inside the canvas + Duolingo-style multiple-choice
> checks), completions are verified and recorded **server-side** against the
> per-person login that already exists, and a live **leaderboard** ranks both
> individuals and 小隊 (teams). `typecheck`/`lint`/`build` green, server boots
> and passes the smoke tests. When the diff is done, run `/code-review high`.
>
> **Orchestration: this session USES PARALLEL SUBAGENTS.** Phase A (shared
> infrastructure) is built linearly in the main thread. Phase B (per-station
> quest wiring) spawns **six parallel subagents, one per station**. Phase C
> (leaderboard UI + validation) is linear again. **Every subagent you spawn
> MUST be run with `model: "claude-fable-5"` — no exceptions, for every single
> Agent/Task spawn in this session.** The file-ownership matrix in Phase B is
> what makes the parallel fan-out collision-free; do not let any subagent touch
> a file outside its column.

## Why we're doing this (decisions made — encode them, don't re-litigate)

The morning class (`sitcon-camp-2026-ml-pt1`) showed us something empirical:
when there is a quantifiable goal and a shared leaderboard, students engage
hard; when they only listen, they drift. But Course 2's stations are
exploratory canvases, not score-optimizers — a raw "high score" fits at most
two of them. The framing that fits **all six** is the **quest**:

- **Hunt quests** give the poke phase a target: "find a word that splits into
  4+ tokens" IS the exploration, directed. The quest *is the wall* in the
  loop pedagogy (poke → wall → new concept).
- **MCQ quests** land *after* the concept, Duolingo-style: one question, 3–4
  choices, answerable directly from what the canvas shows if the student
  actually looked.

Design decisions already made with Harry — do not reopen them:

1. **Ranking unit: both.** Personal progress (quest checklist per station) AND
   a 小隊-aggregate leaderboard. Team ranking drives the room's energy;
   the personal view drives completion.
2. **Metric: stars + time tiebreak.** Hunt complete = **1 pt**. MCQ correct on
   the **first try = 2 pt** (a ★), correct after retries = 1 pt. Rank by total
   points descending; ties broken by **earlier timestamp of the last
   point-scoring event** (whoever got there first wins the tie). Wall-clock
   speed is deliberately NOT the primary metric — speed-ranking rewards
   guess-and-retry and punishes careful readers.
3. **Scope: all six lesson stations**, 3–5 quests each.
4. **Verification is server-side.** MCQ answers and hunt verifiers never ship
   in the client bundle — one devtools tab must not reveal them. The server
   already runs the same models the stations query, so it can re-derive hunt
   evidence itself. The sole attestation exception is pixel-shuffle (training
   happens in the student's browser); accept the client's claim there, at camp
   scale with named accounts and the existing ban hammer that risk is accepted.
5. **The leaderboard is an optional layer, never a gate.** Every station keeps
   working exactly as today when the live server is unreachable (the existing
   offline/precomputed degrade in `apps/course2/src/lib/auth.ts` and
   `@camp/data`'s `liveInfer`). Quests simply hide with a quiet note when
   offline.

## What already exists (reuse, don't rebuild)

Read these before writing any code:

- `server/app/main.py` — FastAPI app. `require_session` puts a verified
  `Identity {username, role}` on `request.state.camp_identity`; the `GUARDS`
  stack (session → rate limit → gpu slot) wraps every inference router. Quest
  routes need session + rate limit but **NOT** `limiter.gpu_slot` (no GPU work
  — build a lighter guard list).
- `server/app/usage.py` — the multi-replica storage pattern to copy verbatim:
  one JSONL per replica (`usage-<port>.jsonl`), appends are per-line, and
  `aggregate()` reads ALL replicas' files so any replica can answer box-wide.
  The middleware in `main.py` already logs every authenticated request, so
  quest attempts get usage attribution for free.
- `server/app/roster.py` — CSV-loading conventions (utf-8-sig, fail loudly at
  boot with an actionable message). Note the contrast below: the groups CSV
  fails **soft**, not loud.
- `server/app/routers/*.py` — the router pattern; each imports model code and
  returns the same JSON shapes precompute bakes.
- `server/app/controls.py` + `server/scripts/usagetui.py` — ban/throttle state
  and the staff TUI. Banned users must not score (they can't log in anyway).
- `apps/course2/src/lib/auth.ts` + `components/AuthGate.tsx` — credentialed
  fetch + the offline degrade philosophy.
- `apps/course2/src/lib/progression.tsx` — the classroom lock. Poll pattern
  (short interval + refetch on focus) to reuse for the leaderboard.
- `apps/course2/src/stations/registry.tsx` — the six lesson stations, in order.
- `packages/data/src/liveInfer.ts` — how stations reach the live server today.
- `packages/ui/src/` — `DockControls`, `StationLayout`, mobile bottom-sheet
  idioms. Recent commits made every station mobile-first; the quest UI must be
  touch-friendly and must not regress any station's mobile layout.
- `prompts/DESIGN.md` — the visual language. Theme utilities only, mono
  uppercase micro-labels, lime accent for the active element.

## The 小隊 mapping CSV (PII — handle exactly like the roster)

A file `student-group-id.csv` maps students to 小隊. Its real header (already
seen on a local copy; the production file will be **pasted onto the box by
hand over ssh** — it is NOT in git and `.gitignore` already blocks it):

```
組別,隊輔,姓名,年齡,房號,衣服size,性別,飲食,提前入住,加購睡袋,備註
1,Yuto、牛排,李千誼,15,124,S,女,葷食,,,
1,,黃主星,16,208,XL,男,葷食,是,是,
```

Rules:

- New `server/app/groups.py`: load via a `GROUPS_CSV` env var (default
  `<repo>/student-group-id.csv`, same convention as `STUDENTS_CSV`). Parse with
  `utf-8-sig`. Read **ONLY** the `姓名` and `組別` columns — ignore and never
  log or expose 隊輔/年齡/房號/衣服size/性別/飲食 or anything else. The
  in-memory result is `{姓名: 組別}` and nothing more.
- **Fail SOFT, not loud** (unlike the roster): if the file is missing or
  malformed, log a clear warning and serve anyway — the user deploys the real
  CSV by hand later; the leaderboard shows those students under `未分組` and
  team ranking simply lists whatever groups exist. The server must never
  refuse to boot over this file.
- Document `GROUPS_CSV` in `server/.env.example` and `server/README.md`
  (including "paste the CSV onto the box; only 姓名/組別 are read").
- Ship a `student-group-id.example.csv` (fake names, same header) so the
  expected shape is in-repo without the PII.
- The client never receives the mapping wholesale — only each leaderboard
  row's display fields (name, group label, points, stars).

## The system

### Server (new `server/app/quests/` package + one router)

- **Quest definitions** live server-side, one module per station:
  `server/app/quests/tokenizer.py`, `embedding.py`, `pixel_shuffle.py`,
  `next_token.py`, `rnn.py`, `transformer.py`. Each exports a list of quests:
  `{id, kind: "hunt"|"mcq", title (zh-TW), prompt (zh-TW), choices? (mcq),
  points, verify(...)}`. The **answer/verifier never leaves the module**.
  A central `server/app/quests/__init__.py` registry imports all six —
  Phase A creates it with all six module names already listed (stub modules
  with empty quest lists), so Phase B agents each fill in ONLY their own file
  and never touch the registry.
- **Routes** (new `server/app/routers/quests.py`), guarded by
  `require_session` + `limiter.rate_limit` (no gpu slot):
  - `GET /quests/{station}` → public shape only: id, kind, title, prompt,
    choices, points, plus this caller's per-quest status (done / firstTry).
    Never the answers.
  - `POST /quests/{station}/{quest_id}/attempt` → body is
    `{choice: int}` for MCQ or `{evidence: {...}}` for hunts. The server
    verifies (MCQ: index check; hunt: re-run the same model code the
    inference routers use on the submitted evidence — e.g. re-tokenize the
    submitted word and count tokens). Response: `{correct, done, points,
    firstTry}`. Wrong-answer responses must not leak the right answer.
  - `GET /leaderboard` → `{individuals: [...], teams: [...], generatedAt}`,
    students only (staff/admin excluded from ranking, though their attempts
    are accepted for testing), sorted by the metric above. Any logged-in
    session may read it (it powers a projector view too).
- **Scoring rules, enforced server-side**: completion is idempotent (repeat
  completions score zero); MCQ first-try is derived from the server's own
  attempt log, never client-claimed; a short per-quest cooldown (~5 s)
  between wrong MCQ attempts blunts brute-forcing a 4-choice question.
- **Storage**: copy the `usage.py` pattern — `quests-<port>.jsonl` in the same
  `USAGE_DIR`, one JSON line per attempt
  (`{ts, user, role, station, quest, kind, correct, pointsAwarded, firstTry}`),
  aggregate on read across all replicas' files. No database.

### Client (all inside `apps/course2` — nothing station-specific enters the shared packages)

- `src/lib/quests.ts` — typed fetch layer (`credentials: "include"`), quest
  list + attempt + leaderboard, and an "offline → quests hidden" outcome
  mirroring `auth.ts`'s philosophy. Poll the leaderboard with the
  `progression.tsx` pattern (interval + refetch on focus), interval ≥ 10 s.
- `src/components/QuestDock.tsx` — ONE shared quest panel every station
  mounts: collapsible checklist (points, ★ for first-try), hunt quests show
  a "回報" affordance the station feeds evidence into, MCQs render
  choice buttons with immediate correct/incorrect feedback and the cooldown
  state. Mobile: folds into the existing bottom-sheet idiom; touch targets
  per the recent mobile-first pass. When offline or logged out: renders
  nothing but a one-line muted note.
- `src/stations/<station>.tsx` wiring (Phase B, per subagent): mount the dock,
  and wire hunt evidence from the canvas interactions the station already has
  (e.g. the tokenizer station already knows the current input and its token
  count — submitting that as evidence is a few lines).
- **Leaderboard page**: new route `/leaderboard` registered in
  `registry.tsx` under a nav placement that fits (visible to students, never
  progression-locked — pattern-match how dev stations bypass the lock, but
  this one IS shown in the nav). Two tabs: 小隊 (default, big type — this is
  the projector view) and 個人. Show points, ★ count, and per-station
  completion dots. Auto-refresh via the poll. Design per `DESIGN.md`.

### Copy rules (student-facing text)

- 正體中文 (zh-TW), high-school register, jargon-free: name a term only after
  its analogy, matching the existing stations' copy voice.
- **No em-dashes anywhere in student-facing copy.** Keep every string tight.
- Quest titles are imperative and concrete (「找出一個會被切成 4 塊的詞」),
  never abstract (「探索分詞行為」).

## Per-station quest specs (anchors — adapt to what the station actually renders)

Each Phase B subagent MUST read its station file (and its server router +
precompute artifacts) before finalizing quests. The lists below are anchors:
keep the intent, adjust wording/parameters to the real UI, and pick 3–5 total
per station (at least one hunt + one MCQ each). Every hunt below states its
verification path.

**tokenizer** (`stations/tokenizer.tsx`, `routers/tokenizer.py`)
- Hunt: 找出一個會被切成 4 塊以上 token 的中文或英文詞。Evidence: the word;
  server re-tokenizes and counts. 1 pt.
- Hunt: 找出兩個「開頭共用同一塊 token」的不同詞。Evidence: both words; server
  re-tokenizes and compares first token ids. 1 pt.
- MCQ: 為什麼有些長詞只算 1 塊、有些短詞卻被切很碎？(frequency vs length
  distractors). 2 pt first-try.

**embedding** (`stations/embedding.tsx`, `routers/embedding.py`)
- Hunt: 找出一個離「國王」比「女王」更近的詞。Evidence: the word; server
  embeds and compares cosine distances. 1 pt.
- Hunt: 找出一組「中文詞和英文詞是鄰居」的例子 (the unified zh+en space from
  wave 3). Evidence: both words; server checks the distance under a threshold
  the subagent calibrates against the real model. 1 pt.
- MCQ: 地圖上兩個詞靠得近，代表什麼？(meaning vs spelling vs frequency
  distractors). 2 pt.

**pixel-shuffle** (`stations/pixelShuffle/`, trains in a Web Worker — the one
client-attested station)
- Hunt: 把「打亂像素」那顆網路訓練到驗證準確率 ≥ X%（subagent reads the real
  plateau from the station/worker code and sets X a bit under it). Evidence:
  claimed accuracy + steps; server sanity-bounds it (≤ theoretical range) and
  accepts. 1 pt.
- MCQ: 兩條曲線最後幾乎重疊，說明 MLP 對什麼「沒有感覺」？2 pt.
- MCQ: 按下「還原排列」後看到相同的模板，代表兩顆網路學到了什麼？2 pt.

**next-token** (`stations/nextToken.tsx`, `routers/next_token.py`)
- Hunt: 連續 3 次猜中模型的第一名 token。Evidence: the 3 (context, guess)
  pairs; server re-runs the model and checks each guess was top-1. 1 pt.
- Hunt: 找出一個「模型第一名機率超過 90%」的句子開頭。Evidence: the context;
  server re-runs and checks. 1 pt.
- MCQ: 模型輸出的其實是什麼？(a probability distribution vs "the answer"
  distractors). 2 pt.

**rnn-viz** (`stations/rnnViz.tsx`, `routers/rnn.py`) — the MCQ-heavy one
- Hunt: 用預設句子，找出隱藏狀態「忘記主詞」的那個 token 位置。Evidence: the
  index; server recomputes the state trajectory on the preset and checks
  against the position the subagent derives from the real model. 1 pt.
- MCQ: 狀態是怎麼往後傳的？(one step at a time vs all at once). 2 pt.
- MCQ: 句子變長，最早的資訊會怎樣？2 pt.

**transformer** (`stations/transformer.tsx`, `routers/transformer.py`)
- Hunt: 在預設句子裡找出「注意力指回前一個 token」的那顆 head。Evidence:
  (layer, head); server recomputes attention on the preset and verifies the
  previous-token pattern dominates for that head. 1 pt.
- Hunt: 找出這句話裡「代名詞注意力連回它指的人」的 head。Same verification
  shape. 1 pt.
- MCQ: attention 和 RNN 傳狀態最大的差別是什麼？(every position sees every
  position at once). 2 pt.

If a station's real UI makes an anchor infeasible (e.g. wave-3 changed what is
on screen), the subagent substitutes a quest with the same kind and intent and
records the substitution in its report.

## Orchestration plan

**Phase A — shared infrastructure (main thread, linear).**
1. Read the files listed in "What already exists".
2. Server: `groups.py`, quest storage, `quests/` package with the registry
   and six empty stub modules, `routers/quests.py` with the three routes,
   scoring/idempotency/cooldown logic, `schemas.py` additions, wire into
   `main.py` with the lighter guard list, `.env.example` + README +
   `student-group-id.example.csv`.
3. Client: `lib/quests.ts`, `components/QuestDock.tsx` (renders from props +
   the lib; no station specifics), `/leaderboard` page + registry entry.
4. Gate: `pnpm typecheck && pnpm lint` green, server boots with stub quests,
   `GET /quests/tokenizer` returns `[]`, `GET /leaderboard` returns empty
   rankings. Only then fan out.

**Phase B — six parallel subagents, one per station. Every spawn uses
`model: "claude-fable-5"`.** Each subagent gets: this prompt's spec for its
station, the file-ownership matrix, and the instruction to read its station +
router first. File ownership (a subagent edits ONLY these):

| Subagent | May edit |
|---|---|
| tokenizer | `server/app/quests/tokenizer.py`, `apps/course2/src/stations/tokenizer.tsx` |
| embedding | `server/app/quests/embedding.py`, `apps/course2/src/stations/embedding.tsx` |
| pixel-shuffle | `server/app/quests/pixel_shuffle.py`, `apps/course2/src/stations/pixelShuffle/**` |
| next-token | `server/app/quests/next_token.py`, `apps/course2/src/stations/nextToken.tsx` |
| rnn-viz | `server/app/quests/rnn.py`, `apps/course2/src/stations/rnnViz.tsx` |
| transformer | `server/app/quests/transformer.py`, `apps/course2/src/stations/transformer.tsx` |

No subagent touches `registry.tsx`, `main.py`, `quests/__init__.py`,
`QuestDock.tsx`, `lib/quests.ts`, or any shared package. If a subagent believes
it needs a shared change, it reports the need instead of making the edit; the
main thread applies it after the fan-out. Each subagent's report: quests
shipped (id/kind/points), how each hunt is verified, any anchor substitutions,
and the manual check it ran.

**Phase C — integration + validation (main thread, linear).**
1. Apply any shared-change requests from Phase B reports.
2. `pnpm typecheck && pnpm lint && pnpm build` green.
3. Boot the server (dev settings). Smoke: login as a roster student (dev
   roster), `GET /quests/<each station>` lists that station's quests without
   answers; a correct MCQ first try returns 2 pt and a repeat returns 0;
   a wrong-then-right MCQ returns 1 pt and no ★; one hunt per station
   verified end-to-end with real evidence (drive the station in the browser
   or curl the attempt route with evidence you derived from the model);
   `GET /leaderboard` reflects it all, with 未分組 grouping when
   `GROUPS_CSV` is absent and real grouping when the example CSV is pointed to.
4. In `pnpm --filter @app/course2 dev`: each station renders with the quest
   dock, no console errors, mobile layout not regressed (narrow viewport
   check); `/leaderboard` renders both tabs and auto-refreshes; with the
   server stopped, every station still fully works and quest UI degrades to
   the muted note.
5. Run `/code-review high`.

## Definition of Done (all of it, objectively checkable)

1. All CLAUDE.md golden rules hold: no training/heavy compute added to the
   browser, no package-boundary crossings (quest fetch logic lives in
   `apps/course2`, NOT `@camp/viz`/`@camp/ui`/`@camp/data`), no
   `three`/`onnxruntime-web` at module scope, no large binaries committed.
2. No quest answer, verifier logic, or 小隊 CSV content beyond
   name+group-label ever reaches the client bundle or any response payload.
   `student-group-id.csv` remains untracked (`.gitignore` already covers it);
   only the `.example.csv` with fake names is committed.
3. Scoring is server-authoritative: idempotent completions, server-derived
   firstTry, wrong-attempt cooldown, students-only ranking.
4. Offline degrade intact: with the live server down, all six stations behave
   exactly as before this change.
5. Progression lock untouched for stations; `/leaderboard` visible and never
   locked.
6. Phase B file-ownership respected (verify with `git diff --stat` per area).
7. `pnpm typecheck && pnpm lint && pnpm build` green; server boots; the
   Phase C smoke list passes.
8. Copy: zh-TW, no em-dashes, analogy-first voice; design per
   `prompts/DESIGN.md`; quest dock touch-friendly.
9. Every subagent spawned in this session ran on `claude-fable-5`.

Record in your final report: the full quest list per station (id, kind,
points, verification path), the smoke-test transcript, and anything the
usage TUI (`server/scripts/usagetui.py`) should later grow to display quest
stats (do NOT modify the TUI in this session).
