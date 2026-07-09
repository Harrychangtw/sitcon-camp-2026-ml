#!/usr/bin/env node
//
// Classroom live control for Course 2 — full-screen TUI + one-shot CLI.
//
// The web app polls a tiny file — apps/course2/public/classroom.json — every
// ~2 seconds (see apps/course2/src/lib/classroom.tsx), so anything done here
// lands on every student's screen almost immediately, with NO rebuild. Like
// unlock.sh, we write to two places:
//   - public/classroom.json : survives rebuilds
//   - dist/classroom.json   : the file `vite preview` is serving right now
//
// Three controls:
//   1. global lock  — freeze every screen behind the "look at the front"
//                     overlay (classroom.json `lock`, with a grace countdown)
//   2. station open/close — per-station progression lock; closed stations are
//                     grayed out in the nav and URL-redirected away
//                     (classroom.json `closed`). Supersedes unlocked.txt: any
//                     existing unlocked.txt state is absorbed into `closed`
//                     on the first write here, then unlocked.txt is removed.
//   3. goto         — one-shot "every screen switches to station X" broadcast
//                     (classroom.json `goto`); a lesson target also syncs the
//                     lesson line (opens up to it, closes the later lessons).
//
// Usage:
//   scripts/classroom.mjs                 # interactive TUI (needs a TTY)
//   scripts/classroom.mjs <command ...>   # one-shot, then exit
//
// TUI keys:
//   ↑/↓ (or j/k)   move the cursor over the 12 stations
//   space          open/close the station under the cursor
//   enter or g     broadcast goto → station under the cursor
//   0              global lock (10 s countdown)
//   1–12           open stations 1..N, close the rest
//   u              lift the global lock
//   a              open every station
//   c              clear everything (remove classroom.json + unlocked.txt)
//   q / ctrl-c     quit
//
// One-shot commands:
//   lock [in N] [: message]    global lock (default 10 s countdown)
//   lock <station ...>         overlay-lock only these stations
//   unlock                     lift the (overlay) lock
//   open <N|station|next|all>  open stations 1..N, close the rest
//   close <station ...>        close just these stations
//   goto <station>             every screen switches there once
//   status | list | clear | help
//
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REG = path.join(ROOT, "apps/course2/src/stations/registry.tsx");
const PUB = path.join(ROOT, "apps/course2/public/classroom.json");
const DIST = path.join(ROOT, "apps/course2/dist/classroom.json");
// Legacy progression lock (unlocked.txt, scripts/unlock.sh). Read for display
// and absorbed into `closed` on the first write, then removed.
const UNLOCK_PUB = path.join(ROOT, "apps/course2/public/unlocked.txt");
const UNLOCK_DIST = path.join(ROOT, "apps/course2/dist/unlocked.txt");
const DEFAULT_GRACE = 10;

const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

// --- stations straight from the registry (no drift); dev stations excluded ---
function loadStations() {
  const src = fs.readFileSync(REG, "utf8");
  const out = [];
  const re = /id: "([^"]+)", title: "([^"]+)",.*?group: "(lesson|panorama|dev)"/g;
  for (const m of src.matchAll(re)) {
    if (m[3] !== "dev") out.push({ id: m[1], title: m[2], group: m[3] });
  }
  if (out.length === 0) {
    console.error(`error: no stations found in ${REG}`);
    process.exit(1);
  }
  return out;
}
const STATIONS = loadStations();
const TOTAL = STATIONS.length;
const STATION_IDS = new Set(STATIONS.map((s) => s.id));
// Lesson stations in teaching order — what a lesson `goto` syncs over.
const LESSONS = STATIONS.filter((s) => s.group === "lesson");

// --- state I/O ---------------------------------------------------------------
function readState() {
  for (const p of [PUB, DIST]) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      if (raw && typeof raw === "object") {
        return {
          lock: raw.lock ?? null,
          goto: raw.goto ?? null,
          closed: Array.isArray(raw.closed)
            ? raw.closed.filter((s) => STATION_IDS.has(s))
            : [],
        };
      }
    } catch {
      /* missing or malformed → keep looking / fall through */
    }
  }
  return { lock: null, goto: null, closed: [] };
}

function writeState(state) {
  const json = JSON.stringify(state, null, 2) + "\n";
  fs.writeFileSync(PUB, json);
  // Only touch dist if a build exists — otherwise the live update is a no-op.
  if (fs.existsSync(path.dirname(DIST))) fs.writeFileSync(DIST, json);
}

function clearState() {
  for (const p of [PUB, DIST]) fs.rmSync(p, { force: true });
}

// --- legacy unlocked.txt (read + absorb, never written) -----------------------
/** Lesson-prefix count from unlocked.txt; null = no file. */
function readUnlocked() {
  for (const p of [UNLOCK_PUB, UNLOCK_DIST]) {
    try {
      const n = Number.parseInt(fs.readFileSync(p, "utf8").trim(), 10);
      if (Number.isFinite(n)) return Math.max(0, n);
    } catch {
      /* missing → keep looking */
    }
  }
  return null;
}

function clearUnlocked() {
  for (const p of [UNLOCK_PUB, UNLOCK_DIST]) fs.rmSync(p, { force: true });
}

/**
 * The effective closed set: classroom.json `closed` plus whatever the legacy
 * unlocked.txt still closes. This is what students actually see, and what
 * every mutation starts from — so old unlock.sh state is absorbed, not lost.
 */
function mergedClosed() {
  const set = new Set(readState().closed);
  const n = readUnlocked();
  if (n !== null) for (const s of LESSONS.slice(n)) set.add(s.id);
  return set;
}

/** Persist a closed set (registry order) and retire unlocked.txt. */
function writeClosed(set) {
  const closed = STATIONS.filter((s) => set.has(s.id)).map((s) => s.id);
  writeState({ ...readState(), closed });
  clearUnlocked();
}

// --- actions (shared by TUI + CLI) --------------------------------------------
function lockLabel(lock) {
  if (lock.scope === "all") return "全部 station";
  return lock.scope.join(", ");
}

function actionGlobalLock(grace = DEFAULT_GRACE, message, scope = "all") {
  const lock = {
    scope,
    issuedAt: Date.now(),
    graceSeconds: grace,
    ...(message ? { message } : {}),
  };
  writeState({ ...readState(), lock });
  return lock;
}

function actionUnlock() {
  const state = readState();
  if (!state.lock) return false;
  writeState({ ...state, lock: null });
  return true;
}

/** Open stations 1..n (registry order), close the rest. */
function actionOpenUpTo(n) {
  n = Math.min(Math.max(n, 1), TOTAL);
  writeClosed(new Set(STATIONS.slice(n).map((s) => s.id)));
  return n;
}

/** Flip one station open/closed; returns true if it is now closed. */
function actionToggle(id) {
  const set = mergedClosed();
  const nowClosed = !set.has(id);
  if (nowClosed) set.add(id);
  else set.delete(id);
  writeClosed(set);
  return nowClosed;
}

/**
 * Broadcast "everyone to station id". The target is always opened; a lesson
 * target also syncs the lesson line — earlier lessons open, later lessons
 * close — so e.g. transformer stays shut while the class is on RNN.
 */
function actionGoto(id) {
  const set = mergedClosed();
  set.delete(id);
  const li = LESSONS.findIndex((s) => s.id === id);
  if (li >= 0) {
    for (const s of LESSONS.slice(0, li)) set.delete(s.id);
    for (const s of LESSONS.slice(li + 1)) set.add(s.id);
  }
  const state = readState();
  const seq = (state.goto?.seq ?? 0) + 1;
  const closed = STATIONS.filter((s) => set.has(s.id)).map((s) => s.id);
  writeState({
    ...state,
    goto: { seq, station: id, issuedAt: Date.now() },
    closed,
  });
  clearUnlocked();
  return { seq, lessonSynced: li >= 0 };
}

function actionClearAll() {
  clearState();
  clearUnlocked();
}

// --- one-shot CLI --------------------------------------------------------------
function cmdLock(args) {
  // grammar: lock [all | id ...] [in N | N] [: message]
  let message;
  const colon = args.indexOf(":");
  if (colon !== -1) {
    message = args.slice(colon + 1).join(" ").trim() || undefined;
    args = args.slice(0, colon);
  }
  let grace = DEFAULT_GRACE;
  const ids = [];
  let global = false;
  for (const t of args) {
    if (t === "in") continue; // "in 5" — the number is picked up below
    if (/^\d+$/.test(t)) grace = Number(t);
    else if (t === "all") global = true;
    else if (STATION_IDS.has(t)) ids.push(t);
    else {
      console.log(red(`  未知的 station:「${t}」，先用 list 查 id。`));
      return;
    }
  }
  const scope = global || ids.length === 0 ? "all" : ids;
  const lock = actionGlobalLock(grace, message, scope);
  console.log(
    `→ 已送出：${bold(lockLabel(lock))} 將在 ${yellow(`${grace} 秒`)}後鎖定` +
      (message ? `，訊息:「${message}」` : ""),
  );
}

function cmdUnlock() {
  if (!actionUnlock()) {
    console.log(dim("  目前沒有鎖定。"));
    return;
  }
  console.log("→ 已解除鎖定，畫面會在下一次輪詢恢復。");
}

function cmdGoto(args) {
  const id = args[0];
  if (!id || !STATION_IDS.has(id)) {
    console.log(red(`  用法:goto <station>,先用 list 查 id。`));
    return;
  }
  const { lessonSynced } = actionGoto(id);
  const title = STATIONS.find((s) => s.id === id)?.title ?? id;
  console.log(`→ 已廣播:所有畫面切到 ${bold(title)} (/${id})`);
  if (lessonSynced) console.log(`→ 進度同步:之後的 lesson station 已關閉。`);
}

function cmdOpen(args) {
  // grammar: open <N|station|next|all|off>
  const t = args[0];
  let n = null;
  if (!t) {
    console.log(red("  用法:open <N|station|next|all|off>"));
    return;
  } else if (t === "all" || t === "off") {
    n = TOTAL;
  } else if (t === "next") {
    // one more than the currently-open prefix
    const set = mergedClosed();
    let p = 0;
    while (p < TOTAL && !set.has(STATIONS[p].id)) p++;
    n = p + 1;
  } else if (/^\d+$/.test(t)) {
    n = Number(t);
  } else if (STATION_IDS.has(t)) {
    n = STATIONS.findIndex((s) => s.id === t) + 1;
  } else {
    console.log(red(`  「${t}」不是 station,先用 list 查 id。`));
    return;
  }
  n = actionOpenUpTo(n);
  console.log(
    `→ 開放 1–${n}/${TOTAL}(到 ${bold(STATIONS[n - 1].title)}),之後的 station 關閉。`,
  );
}

function cmdClose(args) {
  const ids = args.filter((t) => STATION_IDS.has(t));
  if (ids.length === 0) {
    console.log(red("  用法:close <station ...>,先用 list 查 id。"));
    return;
  }
  const set = mergedClosed();
  for (const id of ids) set.add(id);
  writeClosed(set);
  console.log(`→ 已關閉:${ids.join(", ")}`);
}

function cmdClear() {
  actionClearAll();
  console.log("→ 已移除 classroom.json + unlocked.txt,全部恢復正常(fail-open)。");
}

function stationMark(s, state, closed) {
  const overlayLocked =
    state.lock && (state.lock.scope === "all" || state.lock.scope.includes(s.id));
  if (overlayLocked) return red("🔒");
  if (closed.has(s.id)) return dim("○ ");
  return green("● ");
}

function cmdStatus() {
  const state = readState();
  const closed = mergedClosed();
  console.log("");
  console.log("  Course 2 — classroom control");
  console.log("  ----------------------------");
  if (state.lock) {
    const remaining = Math.ceil(
      state.lock.graceSeconds - (Date.now() - state.lock.issuedAt) / 1000,
    );
    const phase =
      remaining > 0 ? yellow(`倒數中,${remaining} 秒後鎖定`) : red("鎖定中");
    console.log(`  lock : ${phase} — ${lockLabel(state.lock)}`);
    if (state.lock.message) console.log(`         訊息:「${state.lock.message}」`);
  } else {
    console.log(`  lock : ${green("無")}`);
  }
  if (state.goto) {
    console.log(`  goto : 上次廣播 → /${state.goto.station} (seq ${state.goto.seq})`);
  } else {
    console.log(`  goto : ${dim("尚未廣播")}`);
  }
  console.log("  ----------------------------");
  STATIONS.forEach((s, i) => {
    console.log(
      `  ${stationMark(s, state, closed)} ${String(i + 1).padStart(2)}. ${s.id.padEnd(14)} ${dim(s.title)}`,
    );
  });
  console.log(dim(`  🔒 鎖定畫面  ○ 關閉(未開放)  ● 開放`));
  console.log("");
}

function cmdList() {
  STATIONS.forEach((s, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${s.id.padEnd(14)} ${dim(`${s.group}  ${s.title}`)}`);
  });
}

function cmdHelp() {
  console.log(`
  (不帶參數執行 = 互動 TUI:方向鍵選站、space 開關、enter 廣播、0 全域鎖、1-${TOTAL} 開放到第 N 站)

  lock                       鎖定全部 station(${DEFAULT_GRACE} 秒倒數)
  lock in 5                  鎖定全部,5 秒倒數
  lock transformer rnn-viz   只鎖這些 station 的畫面
  lock all in 5 : 先看台前    「:」後面是自訂的鎖定訊息
  unlock                     解除鎖定
  goto <station>             所有畫面切到該 station(一次性;lesson 會同步進度)
  open <N|station|next|all>  開放第 1–N 站,其餘關閉
  close <station ...>        關閉這些 station
  status                     目前狀態
  list                       station 清單
  clear                      移除 classroom.json + unlocked.txt,全部恢復
`);
}

function dispatch(tokens) {
  const [cmd, ...args] = tokens;
  switch (cmd) {
    case "lock": cmdLock(args); break;
    case "unlock": cmdUnlock(); break;
    case "goto": cmdGoto(args); break;
    case "open": cmdOpen(args); break;
    case "close": cmdClose(args); break;
    case "status": case "st": cmdStatus(); break;
    case "list": case "ls": cmdList(); break;
    case "clear": cmdClear(); break;
    case "help": case "?": cmdHelp(); break;
    default:
      console.log(dim(`  ? 不認得「${cmd}」,輸入 help 看指令。`));
  }
}

const argv = process.argv.slice(2);
if (argv.length > 0) {
  dispatch(argv);
  process.exit(0);
}

// --- interactive TUI -------------------------------------------------------------
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("互動 TUI 需要 TTY;請改用一次性指令,例如: scripts/classroom.mjs status");
  process.exit(2);
}

/** Display width with CJK counted as 2 cells, ANSI-free input assumed. */
function dwidth(str) {
  let w = 0;
  for (const ch of str) w += ch.codePointAt(0) > 0xff ? 2 : 1;
  return w;
}

function padDisplay(str, width) {
  let out = "";
  let w = 0;
  for (const ch of str) {
    const cw = ch.codePointAt(0) > 0xff ? 2 : 1;
    if (w + cw > width - 1 && dwidth(str) > width) return out + "…" + " ".repeat(Math.max(0, width - w - 1));
    out += ch;
    w += cw;
  }
  return out + " ".repeat(Math.max(0, width - w));
}

const out = process.stdout;
let cursor = 0;
let digits = "";
let digitTimer = null;
let flash = "";
let flashAt = 0;

function setFlash(msg) {
  flash = msg;
  flashAt = Date.now();
}

function cleanup() {
  if (digitTimer) clearTimeout(digitTimer);
  out.write("\x1b[?25h\x1b[?1049l"); // show cursor, leave alt screen
  try {
    process.stdin.setRawMode(false);
  } catch {
    /* stdin already gone */
  }
}

function quit() {
  cleanup();
  process.exit(0);
}

function render() {
  const state = readState();
  const closed = mergedClosed();
  const lines = [];

  lines.push("");
  lines.push(`  ${bold("Course 2 — 教室即時控制")}`);
  lines.push(`  ${dim("─".repeat(52))}`);

  // global lock line
  if (state.lock) {
    const remaining = Math.ceil(
      state.lock.graceSeconds - (Date.now() - state.lock.issuedAt) / 1000,
    );
    const phase =
      remaining > 0 ? yellow(`倒數 ${remaining} 秒後鎖定`) : red("鎖定中");
    lines.push(
      `  全域鎖:${phase} — ${lockLabel(state.lock)}` +
        (state.lock.message ? dim(`「${state.lock.message}」`) : ""),
    );
  } else {
    lines.push(`  全域鎖:${green("無")} ${dim(`(按 0 鎖定所有畫面)`)}`);
  }

  // goto line
  lines.push(
    `  廣播  :${
      state.goto
        ? `上次 → /${state.goto.station} ${dim(`(seq ${state.goto.seq})`)}`
        : dim("尚未廣播")
    }`,
  );
  lines.push("");

  // station rows
  STATIONS.forEach((s, i) => {
    if (i > 0 && STATIONS[i - 1].group !== s.group) {
      lines.push(`       ${dim("── 全景 ─────────────────────")}`);
    }
    const cur = i === cursor;
    const ptr = cur ? cyan("▸") : " ";
    const num = dim(String(i + 1).padStart(2));
    const mark = stationMark(s, state, closed);
    const title = padDisplay(s.title, 28);
    const row = `  ${ptr} ${num} ${mark} ${
      closed.has(s.id) ? dim(title) : cur ? bold(title) : title
    } ${dim(s.id)}`;
    lines.push(row);
  });

  lines.push("");
  lines.push(`  ${dim("🔒 鎖定畫面  ○ 關閉(未開放)  ● 開放")}`);
  lines.push(`  ${dim("─".repeat(52))}`);
  lines.push(
    `  ${dim("↑↓ 選站")}  ${dim("space")} 開/關  ${dim("enter/g")} 廣播切到該站  ${dim("0")} 全域鎖定`,
  );
  lines.push(
    `  ${dim(`1-${TOTAL}`)} 開放到第 N 站  ${dim("u")} 解除全域鎖  ${dim("a")} 全開  ${dim("c")} 全部清除  ${dim("q")} 離開`,
  );

  // input / flash line
  if (digits) {
    lines.push(`  ${yellow(`開放到第 ${digits}▌ 站`)} ${dim("(enter 確定,esc 取消)")}`);
  } else if (flash && Date.now() - flashAt < 4000) {
    lines.push(`  ${flash}`);
  } else {
    lines.push("");
  }

  out.write("\x1b[H" + lines.join("\x1b[K\n") + "\x1b[K\x1b[J");
}

function commitDigits() {
  if (digitTimer) clearTimeout(digitTimer);
  digitTimer = null;
  const raw = digits;
  digits = "";
  if (!raw) return;
  const n = Number(raw);
  if (n === 0) {
    actionGlobalLock();
    setFlash(`${red("→")} 全域鎖定:${DEFAULT_GRACE} 秒倒數後鎖定所有畫面。`);
  } else if (n >= 1 && n <= TOTAL) {
    actionOpenUpTo(n);
    setFlash(`${green("→")} 開放 1–${n},其餘關閉(到 ${bold(STATIONS[n - 1].title)})。`);
  } else {
    setFlash(red(`「${raw}」超出範圍(0-${TOTAL})。`));
  }
}

function pushDigit(ch) {
  if (digitTimer) clearTimeout(digitTimer);
  digits += ch;
  // Commit as soon as no further digit could still form a valid number
  // (0 → global lock now; 2-9 → done; "1" waits briefly for 10/11/12).
  if (digits === "0" || Number(digits) * 10 > TOTAL || digits.length >= 2) {
    commitDigits();
    return;
  }
  digitTimer = setTimeout(() => {
    commitDigits();
    render();
  }, 800);
}

function move(delta) {
  cursor = Math.min(TOTAL - 1, Math.max(0, cursor + delta));
}

function handleKey(ch) {
  if (ch === "\x03" || ch === "q") quit();
  else if (ch >= "0" && ch <= "9") pushDigit(ch);
  else if (ch === "\r" || ch === "\n") {
    if (digits) commitDigits();
    else {
      const s = STATIONS[cursor];
      actionGoto(s.id);
      setFlash(`${green("→")} 已廣播:所有畫面切到 ${bold(s.title)} (/${s.id})`);
    }
  } else if (ch === " ") {
    const s = STATIONS[cursor];
    const nowClosed = actionToggle(s.id);
    setFlash(
      nowClosed
        ? `${yellow("→")} 已關閉 ${bold(s.title)}`
        : `${green("→")} 已開放 ${bold(s.title)}`,
    );
  } else if (ch === "g") {
    const s = STATIONS[cursor];
    actionGoto(s.id);
    setFlash(`${green("→")} 已廣播:所有畫面切到 ${bold(s.title)} (/${s.id})`);
  } else if (ch === "k") move(-1);
  else if (ch === "j") move(1);
  else if (ch === "u") {
    setFlash(
      actionUnlock()
        ? `${green("→")} 已解除全域鎖,畫面將於下一次輪詢恢復。`
        : dim("目前沒有全域鎖。"),
    );
  } else if (ch === "a") {
    actionOpenUpTo(TOTAL);
    setFlash(`${green("→")} 全部 ${TOTAL} 站開放。`);
  } else if (ch === "c") {
    actionClearAll();
    setFlash(`${green("→")} 已清除 classroom.json + unlocked.txt,全部恢復。`);
  }
}

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");
out.write("\x1b[?1049h\x1b[?25l"); // alt screen, hide cursor

process.stdin.on("data", (s) => {
  let i = 0;
  while (i < s.length) {
    if (s[i] === "\x1b") {
      if (s[i + 1] === "[") {
        const c = s[i + 2];
        if (c === "A") move(-1);
        else if (c === "B") move(1);
        i += 3;
        continue;
      }
      digits = ""; // bare esc cancels pending number entry
      if (digitTimer) clearTimeout(digitTimer);
      i += 1;
      continue;
    }
    handleKey(s[i]);
    i += 1;
  }
  render();
});

process.on("SIGTERM", quit);
process.on("exit", cleanup);
out.on("resize", render);
const repaint = setInterval(render, 500); // keeps countdowns + external edits live
repaint.unref?.();
render();
