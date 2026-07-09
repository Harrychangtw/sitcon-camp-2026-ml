#!/usr/bin/env node
//
// Classroom live control for Course 2 — lock screens and broadcast redirects.
//
// The web app polls a tiny file — apps/course2/public/classroom.json — every
// ~2 seconds (see apps/course2/src/lib/classroom.tsx), so a command here lands
// on every student's screen almost immediately, with NO rebuild. Like
// unlock.sh, we write to two places:
//   - public/classroom.json : survives rebuilds
//   - dist/classroom.json   : the file `vite preview` is serving right now
//
// Usage:
//   scripts/classroom.mjs                        # interactive REPL
//   scripts/classroom.mjs <command ...>          # one-shot, then exit
//
// Commands:
//   lock                       lock ALL stations (default 10 s countdown)
//   lock in 5                  lock all, 5 s countdown
//   lock transformer rnn-viz   lock only these stations
//   lock all in 5 : 先看台前    custom overlay message after ":"
//   unlock                     lift the lock
//   goto <station>             every screen switches to that station once;
//                              a lesson station also syncs the progression
//                              lock, closing every station after it
//   open <station|N|next|all|off>
//                              progression lock: open the lesson line up to a
//                              point (same unlocked.txt as scripts/unlock.sh)
//   status                     current state
//   list                       station ids
//   clear                      remove classroom.json (everything back to normal)
//   help | quit
//
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REG = path.join(ROOT, "apps/course2/src/stations/registry.tsx");
const PUB = path.join(ROOT, "apps/course2/public/classroom.json");
const DIST = path.join(ROOT, "apps/course2/dist/classroom.json");
// Progression lock (how many lesson stations are open) — same files as
// scripts/unlock.sh, polled by apps/course2/src/lib/progression.tsx.
const UNLOCK_PUB = path.join(ROOT, "apps/course2/public/unlocked.txt");
const UNLOCK_DIST = path.join(ROOT, "apps/course2/dist/unlocked.txt");
const DEFAULT_GRACE = 10;

const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
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
const STATION_IDS = new Set(STATIONS.map((s) => s.id));
// Lesson stations in teaching order — what the progression lock counts over.
const LESSONS = STATIONS.filter((s) => s.group === "lesson");

// --- state I/O ---------------------------------------------------------------
function readState() {
  for (const p of [PUB, DIST]) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      if (raw && typeof raw === "object") {
        return { lock: raw.lock ?? null, goto: raw.goto ?? null };
      }
    } catch {
      /* missing or malformed → keep looking / fall through */
    }
  }
  return { lock: null, goto: null };
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

// --- progression lock (unlocked.txt, shared with scripts/unlock.sh) -----------
/** How many lesson stations are open right now; null = no file (all open). */
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

function writeUnlocked(n) {
  fs.writeFileSync(UNLOCK_PUB, `${n}\n`);
  if (fs.existsSync(path.dirname(UNLOCK_DIST))) fs.writeFileSync(UNLOCK_DIST, `${n}\n`);
}

function clearUnlocked() {
  for (const p of [UNLOCK_PUB, UNLOCK_DIST]) fs.rmSync(p, { force: true });
}

/** 1-based position of a station on the lesson line, or 0 if not a lesson. */
function lessonIndex(id) {
  return LESSONS.findIndex((s) => s.id === id) + 1;
}

// --- commands ----------------------------------------------------------------
function lockLabel(lock) {
  if (lock.scope === "all") return "全部 station";
  return lock.scope.join(", ");
}

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
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t === "in") continue; // "in 5" — the number is picked up below
    if (/^\d+$/.test(t)) {
      grace = Number(t);
    } else if (t === "all") {
      global = true;
    } else if (STATION_IDS.has(t)) {
      ids.push(t);
    } else {
      console.log(red(`  未知的 station:「${t}」，先用 list 查 id。`));
      return;
    }
  }
  const lock = {
    scope: global || ids.length === 0 ? "all" : ids,
    issuedAt: Date.now(),
    graceSeconds: grace,
    ...(message ? { message } : {}),
  };
  const state = readState();
  writeState({ ...state, lock });
  console.log(
    `→ 已送出：${bold(lockLabel(lock))} 將在 ${yellow(`${grace} 秒`)}後鎖定` +
      (message ? `，訊息:「${message}」` : ""),
  );
}

function cmdUnlock() {
  const state = readState();
  if (!state.lock) {
    console.log(dim("  目前沒有鎖定。"));
    return;
  }
  writeState({ ...state, lock: null });
  console.log("→ 已解除鎖定，畫面會在下一次輪詢恢復。");
}

function cmdGoto(args) {
  const id = args[0];
  if (!id || !STATION_IDS.has(id)) {
    console.log(red(`  用法:goto <station>,先用 list 查 id。`));
    return;
  }
  const state = readState();
  const seq = (state.goto?.seq ?? 0) + 1;
  writeState({ ...state, goto: { seq, station: id, issuedAt: Date.now() } });
  const title = STATIONS.find((s) => s.id === id)?.title ?? id;
  console.log(`→ 已廣播:所有畫面切到 ${bold(title)} (/${id})`);
  // Keep the lesson line in step: going to a lesson station opens exactly up
  // to it, so later stations (e.g. transformer while teaching RNN) close.
  const idx = lessonIndex(id);
  if (idx > 0 && readUnlocked() !== idx) {
    writeUnlocked(idx);
    console.log(
      `→ 進度同步:開放到第 ${idx}/${LESSONS.length} 站,之後的 station 已關閉。`,
    );
  }
}

function cmdOpen(args) {
  // grammar: open <station|N|next|all|off>
  const t = args[0];
  const cur = readUnlocked();
  let n = null;
  if (!t) {
    console.log(red("  用法:open <station|N|next|all|off>"));
    return;
  } else if (t === "off") {
    clearUnlocked();
    console.log("→ 已移除進度鎖(unlocked.txt),全部 lesson station 開放。");
    return;
  } else if (t === "all") {
    n = LESSONS.length;
  } else if (t === "next") {
    n = (cur ?? 0) + 1;
  } else if (/^\d+$/.test(t)) {
    n = Number(t);
  } else if (lessonIndex(t) > 0) {
    n = lessonIndex(t);
  } else {
    console.log(red(`  「${t}」不是 lesson station,先用 list 查 id。`));
    return;
  }
  n = Math.min(Math.max(n, 1), LESSONS.length);
  writeUnlocked(n);
  console.log(
    `→ 進度:開放到第 ${n}/${LESSONS.length} 站(${bold(LESSONS[n - 1].title)}),之後的 station 關閉。`,
  );
}

function cmdClear() {
  clearState();
  console.log("→ 已移除 classroom.json,全部恢復正常(fail-open)。");
}

function cmdStatus() {
  const state = readState();
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
  const unlocked = readUnlocked();
  if (unlocked === null) {
    console.log(`  進度 : ${green("無進度鎖")},全部 lesson station 開放`);
  } else {
    console.log(
      `  進度 : 開放到第 ${yellow(`${unlocked}/${LESSONS.length}`)} 站` +
        (LESSONS[unlocked - 1] ? `(${LESSONS[unlocked - 1].title})` : ""),
    );
  }
  console.log("  ----------------------------");
  for (const s of STATIONS) {
    const overlayLocked =
      state.lock &&
      (state.lock.scope === "all" || state.lock.scope.includes(s.id));
    const idx = lessonIndex(s.id);
    const progressionClosed = unlocked !== null && idx > 0 && idx > unlocked;
    const mark = overlayLocked ? red("🔒") : progressionClosed ? dim("○ ") : green("● ");
    console.log(`  ${mark} ${s.id.padEnd(14)} ${dim(s.title)}`);
  }
  console.log(
    dim(`  🔒 鎖定畫面  ○ 進度未開放  ● 開放`),
  );
  console.log("");
}

function cmdList() {
  for (const s of STATIONS) {
    console.log(`  ${s.id.padEnd(14)} ${dim(`${s.group}  ${s.title}`)}`);
  }
}

function cmdHelp() {
  console.log(`
  lock                       鎖定全部 station(${DEFAULT_GRACE} 秒倒數)
  lock in 5                  鎖定全部,5 秒倒數
  lock transformer rnn-viz   只鎖這些 station
  lock all in 5 : 先看台前    「:」後面是自訂的鎖定訊息
  unlock                     解除鎖定
  goto <station>             所有畫面切到該 station(一次性)
                             lesson station 會同步進度,之後的站關閉
  open <station|N|next|all|off>
                             進度鎖:lesson 線開放到哪一站(unlocked.txt)
  status                     目前狀態
  list                       station 清單
  clear                      移除 classroom.json,全部恢復
  quit                       離開
`);
}

function dispatch(tokens) {
  const [cmd, ...args] = tokens;
  switch (cmd) {
    case "lock":
      cmdLock(args);
      break;
    case "unlock":
      cmdUnlock();
      break;
    case "goto":
      cmdGoto(args);
      break;
    case "open":
      cmdOpen(args);
      break;
    case "status":
    case "st":
      cmdStatus();
      break;
    case "list":
    case "ls":
      cmdList();
      break;
    case "clear":
      cmdClear();
      break;
    case "help":
    case "?":
      cmdHelp();
      break;
    default:
      console.log(dim(`  ? 不認得「${cmd}」,輸入 help 看指令。`));
  }
}

// --- one-shot mode -------------------------------------------------------------
const argv = process.argv.slice(2);
if (argv.length > 0) {
  dispatch(argv);
  process.exit(0);
}

// --- interactive REPL ----------------------------------------------------------
const COMMANDS = ["lock", "unlock", "goto", "open", "status", "list", "clear", "help", "quit"];
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer(line) {
    const words = [...COMMANDS, "all", "in", ...STATION_IDS];
    const last = line.split(/\s+/).at(-1) ?? "";
    const hits = words.filter((w) => w.startsWith(last));
    return [hits.length ? hits : words, last];
  },
});

cmdStatus();
console.log(dim("  指令:lock / unlock / goto <station> / open <station> / status / clear / help / quit"));
rl.setPrompt(bold("classroom> "));
rl.prompt();
rl.on("line", (line) => {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length > 0) {
    const cmd = tokens[0];
    if (cmd === "quit" || cmd === "q" || cmd === "exit") {
      rl.close();
      return;
    }
    dispatch(tokens);
  }
  rl.prompt();
});
rl.on("close", () => {
  console.log("");
  process.exit(0);
});
