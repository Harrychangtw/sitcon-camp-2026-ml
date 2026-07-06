/**
 * TOKENIZER — Course 2, station 1 (Loop 0).
 *
 * The first wall: students type text and watch it segment live into tokens, each
 * carrying an id from a precomputed vocab. Flipping 字元 / 詞 / BPE shows that a
 * model reads *tokens*, not letters or words.
 *
 * There is no language switch: real tokenizers just read whatever you type, so
 * the station does too. Mixed 中英文 works in one input. 字元/詞 auto-detect
 * script per run — a 漢字 run has no spaces (斷詞 is a real problem the browser
 * solves with a greedy 詞典 match), a latin run splits on whitespace — while BPE
 * (Qwen) tokenizes the whole mixed string at once.
 *
 * Pattern follows reference.tsx: state → controls → a canvas that is a pure,
 * memoized function of that state. The ONLY hard-coded-free input is the vocab,
 * loaded via @camp/data inside an effect.
 *
 * BPE is special: 字元/詞 stay light + rule-based in the browser, but BPE calls
 * the live server (POST /tokenizer/encode) for the REAL Qwen3-0.6B merges/vocab
 * — the same tokenizer the next-token / transformer stations run — instead of
 * the toy-corpus BPE the browser can only approximate. The rule-based BPE stays
 * as the offline fallback (server down → LiveStatus says so). This is still no
 * training in the browser: tokenizing is light; the merges just come from a
 * real vocab now (see CLAUDE.md).
 */
import { useEffect, useMemo, useState } from "react";
import {
  BlockToggle,
  DockControls,
  LiveStatus,
  StationLayout,
  SuggestInput,
  type LiveState,
} from "@camp/ui";
import { liveInferTimed, liveInferenceEnabled, loadJSON } from "@camp/data";
import { CATEGORY_COLORS } from "../palette";

type Scheme = "char" | "word" | "bpe";
type Lang = "zh" | "en";

/** Per-language lookup tables. `word.dict` only ships for zh (greedy 斷詞). */
interface LangVocab {
  sampleText: string;
  char: { vocab: Record<string, number> };
  word: { vocab: Record<string, number>; dict?: string[] };
  bpe: { vocab: Record<string, number>; merges: Array<[string, string]> };
}

/** Shape of tokenizer/vocab.json, written by `camp-precompute tokenizer`. */
interface Vocab {
  spaceMarker: string;
  unkId: number;
  languages: Record<Lang, LangVocab>;
}

/** One rendered chip. */
interface Token {
  /** Text shown on the chip (word-boundary marker already applied for en). */
  display: string;
  /** Id looked up from the loaded vocab (unkId when the token is unknown). */
  id: number;
  isUnk: boolean;
  /** True for pieces of a word that BPE had to subword-split (the callout). */
  split: boolean;
  /** Segment index, used to group + space chips by source word. */
  group: number;
  key: string;
}

// English word / punctuation units (mirrors the precompute regex).
const UNIT_RE = /[A-Za-z0-9]+|[^\sA-Za-z0-9]/g;
// Chinese runs: a maximal 漢字 run | an ASCII word | a single symbol.
const ZH_UNIT_RE = /[一-鿿]+|[A-Za-z0-9]+|[^\s]/g;
const HAN_RE = /[一-鿿]/;

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\n" || ch === "\t";
}

/** Greedy BPE over a symbol list, using the learned merge order. */
function bpeMerge(initial: string[], merges: Array<[string, string]>): string[] {
  // rank[a][b] = merge order of the pair (a, b); lower merges first.
  const rank = new Map<string, Map<string, number>>();
  merges.forEach(([a, b], i) => {
    let inner = rank.get(a);
    if (!inner) {
      inner = new Map();
      rank.set(a, inner);
    }
    inner.set(b, i);
  });

  let syms = initial;
  // Repeatedly merge the adjacent pair with the lowest (earliest) rank.
  for (;;) {
    let best = Infinity;
    let bi = -1;
    for (let i = 0; i < syms.length - 1; i++) {
      const a = syms[i];
      const b = syms[i + 1];
      if (a === undefined || b === undefined) continue;
      const r = rank.get(a)?.get(b);
      if (r !== undefined && r < best) {
        best = r;
        bi = i;
      }
    }
    if (bi < 0) break;
    const merged = `${syms[bi] ?? ""}${syms[bi + 1] ?? ""}`;
    syms = [...syms.slice(0, bi), merged, ...syms.slice(bi + 2)];
  }
  return syms;
}

/** English BPE: a leading ▁ marker joins the merge (SentencePiece style). */
function bpeEncodeEn(word: string, spaceMarker: string, lv: LangVocab): string[] {
  return bpeMerge([spaceMarker, ...word.split("")], lv.bpe.merges);
}

/** Chinese BPE: a bare 漢字 run, no space marker (Chinese has no spaces). */
function bpeEncodeZh(run: string, lv: LangVocab): string[] {
  return bpeMerge([...run.split("")], lv.bpe.merges);
}

/** English segmentation — the original char / word / BPE path, untouched. */
function segmentEn(
  text: string,
  scheme: Scheme,
  lv: LangVocab,
  spaceMarker: string,
  unkId: number,
): Token[] {
  const out: Token[] = [];

  if (scheme === "char") {
    let group = 0;
    const lut = lv.char.vocab;
    [...text].forEach((ch, i) => {
      const space = isSpace(ch);
      out.push({
        display: space ? spaceMarker : ch,
        id: lut[ch] ?? unkId,
        isUnk: !(ch in lut),
        split: false,
        group,
        key: `c${i}`,
      });
      if (space) group++;
    });
    return out;
  }

  // Word + BPE both work over units; whitespace is folded into the ▁ marker.
  const units = text.match(UNIT_RE) ?? [];
  const lut = scheme === "word" ? lv.word.vocab : lv.bpe.vocab;
  units.forEach((unit, gi) => {
    const isWord = /[A-Za-z0-9]/.test(unit);

    if (scheme === "word") {
      const key = isWord ? unit.toLowerCase() : unit;
      out.push({
        display: isWord ? spaceMarker + unit : unit,
        id: lut[key] ?? unkId,
        isUnk: !(key in lut),
        split: false,
        group: gi,
        key: `w${gi}`,
      });
      return;
    }

    // BPE
    if (!isWord) {
      out.push({
        display: unit,
        id: lut[unit] ?? unkId,
        isUnk: !(unit in lut),
        split: false,
        group: gi,
        key: `b${gi}`,
      });
      return;
    }
    const pieces = bpeEncodeEn(unit.toLowerCase(), spaceMarker, lv);
    const didSplit = pieces.length > 1;
    pieces.forEach((piece, pi) => {
      out.push({
        display: piece,
        id: lut[piece] ?? unkId,
        isUnk: !(piece in lut),
        split: didSplit,
        group: gi,
        key: `b${gi}.${pi}`,
      });
    });
  });
  return out;
}

/** Chinese char mode: one chip per non-space character (no ▁ marker). */
function segmentCharZh(text: string, lv: LangVocab, unkId: number): Token[] {
  const out: Token[] = [];
  const lut = lv.char.vocab;
  let group = 0;
  [...text].forEach((ch, i) => {
    if (isSpace(ch)) {
      group++;
      return;
    }
    out.push({
      display: ch,
      id: lut[ch] ?? unkId,
      isUnk: !(ch in lut),
      split: false,
      group,
      key: `c${i}`,
    });
  });
  return out;
}

/**
 * Chinese 詞 mode: greedy longest-match 斷詞 against the shipped dictionary.
 * At each position take the longest dict entry that matches, else fall back to a
 * single character. This is dictionary lookup, not training — light and allowed.
 */
function segmentWordZh(text: string, lv: LangVocab, unkId: number): Token[] {
  const lut = lv.word.vocab;
  const dict = new Set(lv.word.dict ?? []);
  let maxLen = 1;
  for (const w of dict) maxLen = Math.max(maxLen, [...w].length);

  const chars = [...text];
  const out: Token[] = [];
  let i = 0;
  let group = 0;
  while (i < chars.length) {
    if (isSpace(chars[i] ?? "")) {
      i++;
      continue;
    }
    // Probe substring lengths longest→1 against the dictionary Set.
    let match = "";
    for (let L = Math.min(maxLen, chars.length - i); L >= 1; L--) {
      const cand = chars.slice(i, i + L).join("");
      if (dict.has(cand)) {
        match = cand;
        break;
      }
    }
    const piece = match || (chars[i] ?? "");
    out.push({
      display: piece,
      id: lut[piece] ?? unkId,
      isUnk: !(piece in lut),
      split: false,
      group,
      key: `w${i}`,
    });
    i += [...piece].length;
    group++;
  }
  return out;
}

/**
 * Chinese BPE mode: BPE-merge each 漢字 run using the zh merges; ASCII words and
 * punctuation are atomic (one chip), mirroring how en BPE treats punctuation.
 */
function segmentBpeZh(text: string, lv: LangVocab, unkId: number): Token[] {
  const lut = lv.bpe.vocab;
  const units = text.match(ZH_UNIT_RE) ?? [];
  const out: Token[] = [];
  units.forEach((unit, gi) => {
    if (HAN_RE.test(unit)) {
      const pieces = bpeEncodeZh(unit, lv);
      // Unlike English (where BPE splits a rare word out of otherwise whole
      // tokens), Chinese BPE *merges* characters, so nearly every piece of a run
      // is a subword. Persisting lime on all of them would drown the "lime =
      // focus" idiom, so zh pieces stay greyscale and lime is hover-only.
      pieces.forEach((piece, pi) => {
        out.push({
          display: piece,
          id: lut[piece] ?? unkId,
          isUnk: !(piece in lut),
          split: false,
          group: gi,
          key: `b${gi}.${pi}`,
        });
      });
      return;
    }
    const key = /[A-Za-z0-9]/.test(unit) ? unit.toLowerCase() : unit;
    out.push({
      display: unit,
      id: lut[key] ?? unkId,
      isUnk: !(key in lut),
      split: false,
      group: gi,
      key: `b${gi}`,
    });
  });
  return out;
}

/** Split text into maximal runs of one script: a 漢字 run vs everything else
 * (latin, digits, spaces, punctuation). Each run is segmented with its script's
 * rules, so mixed 中英文 needs no language toggle. */
function scriptRuns(text: string): { han: boolean; text: string }[] {
  const runs: { han: boolean; text: string }[] = [];
  let cur = "";
  let curHan = false;
  for (const ch of text) {
    const han = HAN_RE.test(ch);
    if (cur !== "" && han !== curHan) {
      runs.push({ han: curHan, text: cur });
      cur = "";
    }
    cur += ch;
    curHan = han;
  }
  if (cur) runs.push({ han: curHan, text: cur });
  return runs;
}

/**
 * Pure rule-based segmentation (the offline fallback; BPE prefers live Qwen).
 * Script-aware: 漢字 runs use the zh vocab + 斷詞/merge rules, latin runs use the
 * en vocab + whitespace/▁ rules. Groups + keys are offset per run so chips from
 * different runs stay distinct. Memoized in the component.
 */
function segment(text: string, scheme: Scheme, vocab: Vocab | null): Token[] {
  if (!vocab || !text) return [];
  const { spaceMarker, unkId } = vocab;
  const en = vocab.languages.en;
  const zh = vocab.languages.zh;

  const out: Token[] = [];
  let groupBase = 0;
  scriptRuns(text).forEach((run, ri) => {
    let toks: Token[];
    if (run.han) {
      toks =
        scheme === "char"
          ? segmentCharZh(run.text, zh, unkId)
          : scheme === "word"
            ? segmentWordZh(run.text, zh, unkId)
            : segmentBpeZh(run.text, zh, unkId);
    } else {
      toks = segmentEn(run.text, scheme, en, spaceMarker, unkId);
    }
    let maxGroup = -1;
    for (const t of toks) {
      maxGroup = Math.max(maxGroup, t.group);
      out.push({ ...t, group: t.group + groupBase, key: `r${ri}.${t.key}` });
    }
    groupBase += maxGroup + 1;
  });
  return out;
}

/** One real Qwen BPE token from POST /tokenizer/encode. */
interface QwenPiece {
  id: number;
  /** Decoded subword; a word-initial piece keeps its leading space. */
  piece: string;
}

interface LiveEncode {
  model: string;
  tokens: QwenPiece[];
}

const LEAD_WS_RE = /^\s+/;

/**
 * Map real Qwen pieces onto the same chip shape the rule-based path produces,
 * so live and fallback render through one code path. A piece whose decode
 * starts with whitespace opens a new source-word group (Qwen's word boundary,
 * shown as the ▁ marker like the English rule path); continuation pieces join
 * the previous group. `split` (the lime callout) marks a latin word Qwen broke
 * into >1 subword; 漢字 runs merge almost every char, so lime would drown — it
 * stays hover-only for them (mirrors segmentBpeZh). No `unk` — byte-level BPE
 * covers everything.
 */
function chipsFromQwen(pieces: QwenPiece[], spaceMarker: string): Token[] {
  // Pass 1: assign each piece to a source-word group + count group sizes.
  const groupOf: number[] = [];
  const size = new Map<number, number>();
  let group = -1;
  pieces.forEach((p, i) => {
    if (i === 0 || LEAD_WS_RE.test(p.piece)) group++;
    groupOf.push(group);
    size.set(group, (size.get(group) ?? 0) + 1);
  });

  // Pass 2: build chips. Leading whitespace collapses to a single ▁ marker.
  return pieces.map((p, i) => {
    const g = groupOf[i] ?? 0;
    const display = p.piece.replace(LEAD_WS_RE, spaceMarker) || spaceMarker;
    // Latin pieces test true; 漢字 pieces don't — so a split word lights up but
    // a merged Han run doesn't (the 合併的子詞 metric counts those instead).
    const split = (size.get(g) ?? 1) > 1 && /[A-Za-z0-9]/.test(p.piece);
    return { display, id: p.id, isUnk: false, split, group: g, key: `q${i}` };
  });
}

/**
 * Split real Qwen pieces into paragraphs at newline tokens, then map each
 * paragraph to chips. A piece whose decode contains a newline is a paragraph
 * break: it opens a new block and is not itself rendered (any non-newline tail
 * starts the next block). Keeps the live path on the same Token[][] shape as the
 * rule-based fallback, so the canvas renders both through one code path.
 */
function paragraphsFromQwen(
  pieces: QwenPiece[],
  spaceMarker: string,
): Token[][] {
  const blocks: QwenPiece[][] = [];
  let cur: QwenPiece[] = [];
  const flush = () => {
    if (cur.length) blocks.push(cur);
    cur = [];
  };
  for (const p of pieces) {
    if (/\n/.test(p.piece)) {
      flush();
      const tail = p.piece.replace(/^\s+/, "");
      if (tail) cur.push({ ...p, piece: tail });
      continue;
    }
    cur.push(p);
  }
  flush();
  return blocks.map((b) => chipsFromQwen(b, spaceMarker));
}

/** Group consecutive tokens by their source segment, for spacing. */
function byGroup(tokens: Token[]): Token[][] {
  const groups: Token[][] = [];
  let last: Token[] | null = null;
  let cur = -1;
  for (const t of tokens) {
    if (t.group !== cur || last === null) {
      last = [];
      groups.push(last);
      cur = t.group;
    }
    last.push(t);
  }
  return groups;
}

/**
 * How many grid cells a chip spans. Chips snap to a fixed-width column grid so
 * rows line up top-to-bottom; a short token fills one cell, a long BPE piece (or
 * a multi-字 Han merge) widens to two or three. Width is estimated from the
 * monospace glyph run — Han glyphs are full-width, the id sits in a smaller
 * font — against the ~56px base cell (see grid-template-columns in the render).
 */
function slotSpan(t: Token): number {
  const dispPx = [...t.display].reduce(
    (w, ch) => w + (HAN_RE.test(ch) ? 16 : 9.6),
    0,
  );
  const idPx = String(t.isUnk ? "unk" : t.id).length * 6;
  const contentPx = Math.max(dispPx, idPx);
  // Base cell ≈ 56px, gap ≈ 6px, chip padding ≈ 16px → n cells hold 62n−22 px.
  return Math.max(1, Math.ceil((contentPx + 24) / 62));
}

const SCHEME_OPTS = [
  { label: "字元", value: "char" as const },
  { label: "詞", value: "word" as const },
  { label: "BPE", value: "bpe" as const },
];

// Cycled by token position — the color carries NO meaning beyond "this is one
// token". Shared with the embedding taxonomy legend (see ../palette).
const TOKEN_COLORS = CATEGORY_COLORS;

// Mixed 中英文 seed: 漢字 (some single, some merged like 學習/方式) plus a rare
// latin word Qwen splits (token|ization) — one sentence that exercises every
// scheme without a toggle, and tokenizes cleanly (no byte-fallback � chips).
const DEFAULT_TEXT = "機器學習的 tokenization 是一種切分方式";

// Prebuilt examples surfaced in the input when it's focused and empty — the
// mixed seed plus a pure-en and pure-zh line (unk chips are a teachable
// moment, not an error).
const PRESETS = [
  { label: DEFAULT_TEXT, value: DEFAULT_TEXT },
  { label: "the cat sat on the mat", value: "the cat sat on the mat" },
  { label: "我今天很開心", value: "我今天很開心" },
] as const;

export function TokenizerStation() {
  // 1. STATE — scheme, the text, and the vocab (loaded, not hard-coded). No
  //    language toggle: the tokenizer reads whatever you type, 中英文 mixed.
  const [scheme, setScheme] = useState<Scheme>("bpe");
  const [text, setText] = useState(DEFAULT_TEXT);
  const [vocab, setVocab] = useState<Vocab | null>(null);

  // 3. LOAD PRECOMPUTED VOCAB via @camp/data inside an effect (the rule-based
  //    fallback tables; BPE prefers live Qwen).
  useEffect(() => {
    let alive = true;
    loadJSON<Vocab>("/data/course2/tokenizer/vocab.json").then((v) => {
      if (alive) setVocab(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  // LIVE BPE — the real Qwen tokenizer, for custom text the toy vocab can't
  // cover. Only BPE mode asks the server; 字元/詞 stay rule-based. On any
  // failure (server down, disabled) `liveEnc` stays behind the current text and
  // the rule-based BPE below shows through, so a dead server just degrades to
  // the approximation instead of breaking the station.
  const marker = vocab?.spaceMarker ?? "▁";
  const bpeLive = scheme === "bpe" && liveInferenceEnabled();
  const [liveEnc, setLiveEnc] = useState<{
    sig: string;
    paragraphs: Token[][];
  } | null>(null);
  const [liveMs, setLiveMs] = useState(0);
  const [livePending, setLivePending] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);

  useEffect(() => {
    if (!bpeLive || !text.trim()) {
      setLivePending(false);
      setLiveFailed(false);
      return;
    }
    let alive = true;
    setLiveFailed(false);
    // Debounced: only ask the server once typing pauses. The pending stopwatch
    // starts when the request actually fires (not during the debounce), so its
    // count matches the round-trip the final report shows.
    const timer = setTimeout(() => {
      setLivePending(true);
      liveInferTimed<LiveEncode>("/tokenizer/encode", { text }).then((r) => {
        if (!alive) return;
        setLivePending(false);
        if (r) {
          setLiveEnc({
            sig: text,
            paragraphs: paragraphsFromQwen(r.data.tokens, marker),
          });
          setLiveMs(r.ms);
        } else {
          setLiveFailed(true);
        }
      });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
      setLivePending(false);
    };
  }, [bpeLive, text, marker]);

  // Live tokens win only when they belong to exactly what's on screen now.
  const liveHit = bpeLive && liveEnc?.sig === text ? liveEnc : null;

  // 2. DERIVED CANVAS DATA — tokens grouped into paragraphs so the canvas reads
  //    top-to-bottom like a document. The source text is split on blank lines
  //    (rule-based path) or at Qwen's newline tokens (live path); either way we
  //    land on one Token[][] shape — one inner array per paragraph — with live
  //    Qwen overriding the rule-based BPE when present.
  const fallbackParas = useMemo(() => {
    if (!vocab || !text.trim()) return [];
    return text
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => segment(p, scheme, vocab));
  }, [text, scheme, vocab]);
  const paragraphs = liveHit ? liveHit.paragraphs : fallbackParas;
  const tokens = useMemo(() => paragraphs.flat(), [paragraphs]);

  // Running palette offset per paragraph so the categorical colors flow
  // continuously across paragraph breaks instead of restarting each block.
  const colorOffsets = useMemo(() => {
    const offs: number[] = [];
    let acc = 0;
    for (const p of paragraphs) {
      offs.push(acc);
      acc += p.length;
    }
    return offs;
  }, [paragraphs]);

  const liveState = useMemo<LiveState>(() => {
    if (!bpeLive || !text.trim()) return { kind: "idle" };
    if (liveHit) return { kind: "live", ms: liveMs };
    if (livePending) return { kind: "pending" };
    if (liveFailed) return { kind: "cached" };
    return { kind: "idle" };
  }, [bpeLive, text, liveHit, livePending, liveFailed, liveMs]);
  // 分段數 / 被拆的詞 aggregate per paragraph (group ids restart each block).
  const groupCount = useMemo(
    () => paragraphs.reduce((n, p) => n + byGroup(p).length, 0),
    [paragraphs],
  );
  const splitWords = useMemo(
    () =>
      paragraphs.reduce(
        (n, p) =>
          n + new Set(p.filter((t) => t.split).map((t) => t.group)).size,
        0,
      ),
    [paragraphs],
  );
  // zh has no persistent "split" flag; count the multi-character subwords BPE
  // merged instead, so the BPE panel still reports a quantitative payoff.
  const mergedSubwords = useMemo(
    () =>
      tokens.filter((t) => HAN_RE.test(t.display) && [...t.display].length >= 2)
        .length,
    [tokens],
  );

  const sample = DEFAULT_TEXT;

  return (
    <StationLayout
      title="Tokenizer"
      subtitle="原始文字要怎麼變成模型讀得懂的東西？"
      fullBleed
      input={
        <SuggestInput
          value={text}
          onChange={setText}
          ariaLabel="輸入文字"
          placeholder={vocab ? sample : "載入詞彙表中…"}
          maxLength={500}
          multiline
          presets={PRESETS}
          status={<LiveStatus state={liveState} />}
        />
      }
      controls={
        <DockControls>
          <BlockToggle<Scheme>
            label="切分方式"
            info="選擇把文字切成 token 的方法。不同切法會把同一句話拆成不同數量、不同邊界的 token。"
            value={scheme}
            onChange={setScheme}
            options={SCHEME_OPTS}
          />
        </DockControls>
      }
      takeaway={
        <span>
          模型從來看不到你的字母或詞，只看到這些{" "}
          <span className="font-mono text-accent">id</span>。換一種切分方式，
          同一個句子就變成一串不同的數字。
        </span>
      }
    >
      <div className="relative h-full w-full">
        {/* Readout thrown outside the dock: the token counts, docked to the top
            edge, just left of the 重點 badge. */}
        <div className="absolute right-4 top-4 z-20 w-44 rounded-md border border-border bg-panel p-3 shadow-md">
          <dl className="grid grid-cols-2 gap-2 font-mono text-xs text-muted">
            <dt>token 數</dt>
            <dd className="text-right text-fg">{tokens.length}</dd>
            <dt>分段數</dt>
            <dd className="text-right text-fg">{groupCount}</dd>
            {scheme === "bpe" ? (
              <>
                <dt>被拆的詞</dt>
                <dd className="text-right text-accent">{splitWords}</dd>
                <dt>合併的子詞</dt>
                <dd className="text-right text-accent">{mergedSubwords}</dd>
              </>
            ) : null}
          </dl>
        </div>

        {/* <p className="max-w-3xl text-sm text-muted">
          每個色塊都是模型讀到的一個 token，下方的數字是它的{" "}
          <span className="font-mono text-accent">id</span>。 英文用{" "}
          <span className="font-mono text-xs text-muted">
            {vocab?.spaceMarker ?? "▁"}
          </span>{" "}
          標記詞的邊界；中文沒有空格，切分（tokenization）得靠模型直接把整串切開。
        </p> */}

        {/* Tokens fill the whole canvas, centered. Padding clears the floating
            islands (top) and the bottom dock. Overflow scrolls; short inputs sit
            centered, wrapping ones left-align for clean rows going down. */}
        <div className="absolute inset-0 overflow-auto px-8 pt-16 pb-28">
          {!vocab || paragraphs.length === 0 ? (
            <div className="flex min-h-full items-center justify-center">
              <p className="font-mono text-xs text-muted">
                {!vocab ? "載入詞彙表中…" : "在下方輸入一些文字。"}
              </p>
            </div>
          ) : (
            // One wrapping block per paragraph, stacked in a centered reading
            // column. Rows within a paragraph get a tight gap; paragraphs are
            // separated by a much larger gap so the text reads top-to-bottom.
            <div className="mx-auto flex min-h-full max-w-5xl flex-col items-start justify-center gap-y-8">
              {paragraphs.map((para, pi) => (
                <div
                  key={pi}
                  className="grid w-full grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-x-1.5 gap-y-2.5"
                >
                  {para.map((t, i) => {
                    const color =
                      TOKEN_COLORS[
                        ((colorOffsets[pi] ?? 0) + i) % TOKEN_COLORS.length
                      ];
                    // Drop letter-spacing on Han runs; keep mono ids tracked.
                    const glyphTracking = HAN_RE.test(t.display)
                      ? "tracking-normal"
                      : "";
                    return (
                      <div
                        key={`${pi}.${t.key}`}
                        style={{
                          gridColumn: `span ${slotSpan(t)}`,
                          ...(t.isUnk ? null : { backgroundColor: color }),
                        }}
                        className={`flex flex-col items-center rounded-md px-2 py-1.5 ${
                          t.isUnk
                            ? "border border-dashed border-warning bg-panel"
                            : ""
                        }`}
                      >
                        <span
                          className={`whitespace-pre font-mono text-base leading-none ${
                            t.isUnk ? "text-warning" : "text-white"
                          } ${glyphTracking}`}
                        >
                          {t.display}
                        </span>
                        <span
                          className={`mt-1.5 font-mono text-[0.625rem] leading-none ${
                            t.isUnk ? "text-warning/80" : "text-white/70"
                          }`}
                        >
                          {t.isUnk ? "unk" : t.id}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </StationLayout>
  );
}
