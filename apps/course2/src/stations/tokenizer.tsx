/**
 * TOKENIZER — Course 2, station 1 (Loop 0).
 *
 * The first wall: students type text and watch it segment live into tokens, each
 * carrying an id from a precomputed vocab. Flipping 字元 / 詞 / BPE shows that a
 * model reads *tokens*, not letters or words.
 *
 * A second axis — 語言 (中文 / English) — swaps the corpus/vocab. Chinese has no
 * spaces, so the three schemes genuinely diverge: each 漢字 is a char-token, a 詞
 * like「機器學習」spans several characters with no delimiter (斷詞 is a real
 * problem the browser solves with a greedy dictionary match), and BPE subwords
 * sit in between — merging frequent pairs (讀的, 不是) that the 詞典 keeps apart.
 *
 * Pattern follows reference.tsx: state → controls → a canvas that is a pure,
 * memoized function of that state. The ONLY non-hard-coded input is the vocab,
 * loaded via @camp/data inside an effect. Segmentation itself is light and
 * rule-based (regex + greedy lookup), so it runs in the browser (no training —
 * see CLAUDE.md).
 */
import { useEffect, useMemo, useState } from "react";
import { SegmentedControl, StationLayout } from "@camp/ui";
import { loadJSON } from "@camp/data";

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

/** Pure segmentation: (text, scheme, lang, vocab) → chips. Memoized. */
function segment(
  text: string,
  scheme: Scheme,
  lang: Lang,
  vocab: Vocab | null,
): Token[] {
  if (!vocab || !text) return [];
  const lv = vocab.languages[lang];
  const { spaceMarker, unkId } = vocab;
  if (lang === "en") return segmentEn(text, scheme, lv, spaceMarker, unkId);
  if (scheme === "char") return segmentCharZh(text, lv, unkId);
  if (scheme === "word") return segmentWordZh(text, lv, unkId);
  return segmentBpeZh(text, lv, unkId);
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

const SCHEME_OPTS = [
  { label: "字元", value: "char" as const },
  { label: "詞", value: "word" as const },
  { label: "BPE", value: "bpe" as const },
];

const LANG_OPTS = [
  { label: "中文", value: "zh" as const },
  { label: "English", value: "en" as const },
];

export function TokenizerStation() {
  // 1. STATE — language, scheme, the text, and the vocab (loaded, not hard-coded).
  const [lang, setLang] = useState<Lang>("zh");
  const [scheme, setScheme] = useState<Scheme>("bpe");
  const [text, setText] = useState("");
  const [vocab, setVocab] = useState<Vocab | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // 3. LOAD PRECOMPUTED VOCAB via @camp/data inside an effect. Seed the text box
  //    from the current language's sample sentence the first time it lands.
  useEffect(() => {
    let alive = true;
    loadJSON<Vocab>("/data/course2/tokenizer/vocab.json").then((v) => {
      if (!alive) return;
      setVocab(v);
      setText((t) => (t ? t : v.languages[lang].sampleText));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching content language reseeds the textarea from that corpus's sample.
  function onLangChange(next: Lang) {
    setLang(next);
    if (vocab) setText(vocab.languages[next].sampleText);
  }

  // 2. DERIVED CANVAS DATA — a pure, memoized function of (text, scheme, lang, vocab).
  const tokens = useMemo(
    () => segment(text, scheme, lang, vocab),
    [text, scheme, lang, vocab],
  );
  const groups = useMemo(() => byGroup(tokens), [tokens]);
  const splitWords = useMemo(
    () => new Set(tokens.filter((t) => t.split).map((t) => t.group)).size,
    [tokens],
  );
  // zh has no persistent "split" flag; count the multi-character subwords BPE
  // merged instead, so the BPE panel still reports a quantitative payoff.
  const mergedSubwords = useMemo(
    () =>
      tokens.filter((t) => HAN_RE.test(t.display) && [...t.display].length >= 2)
        .length,
    [tokens],
  );

  const sample = vocab ? vocab.languages[lang].sampleText : "";
  const isZh = lang === "zh";

  return (
    <StationLayout
      title="Tokenizer"
      subtitle="原始文字要怎麼變成模型讀得懂的東西？"
      controls={
        <>
          <SegmentedControl<Lang>
            label="語言 / Language"
            value={lang}
            onChange={onLangChange}
            options={LANG_OPTS}
          />

          <SegmentedControl<Scheme>
            label="切分方式"
            value={scheme}
            onChange={setScheme}
            options={SCHEME_OPTS}
          />

          <div>
            <div className="mb-1 font-mono text-xs text-muted">輸入文字</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder={vocab ? sample : "載入詞彙表中…"}
              className="w-full resize-y rounded-md border border-border bg-panel p-3 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
            {isZh ? (
              <p className="mt-2 text-xs text-muted">
                中文沒有空格，「詞」模式要靠一份詞典逐一比對來斷詞。試試在{" "}
                <span className="font-mono text-fg">BPE</span> 下打「機器學習」：
                它會合併成常見的子詞，跟「詞」和「字元」都不一樣。
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted">
                試試在 <span className="font-mono text-fg">BPE</span> 下輸入像{" "}
                <span className="font-mono text-fg">tokenization</span>{" "}
                這種罕見字，它沒有完整的 token，會被拆成子詞（subword）。
              </p>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-2 border-t border-border/30 pt-4 font-mono text-xs text-muted">
            <dt>token 數</dt>
            <dd className="text-right text-fg">{tokens.length}</dd>
            <dt>分段數</dt>
            <dd className="text-right text-fg">{groups.length}</dd>
            {scheme === "bpe" ? (
              <>
                <dt>{isZh ? "合併的子詞" : "被拆的詞"}</dt>
                <dd className="text-right text-accent">
                  {isZh ? mergedSubwords : splitWords}
                </dd>
              </>
            ) : null}
          </dl>
        </>
      }
      takeaway={
        <span>
          模型從來看不到你的字母或詞，只看到這些{" "}
          <span className="font-mono text-accent">id</span>。換一種切分方式，
          同一個句子就變成一串不同的數字。
        </span>
      }
    >
      <div className="flex h-full flex-col gap-4">
        <p className="text-sm text-muted">
          每張卡片都是模型讀到的一個 token。{" "}
          {isZh ? (
            <span>
              中文沒有空格，切分（tokenization）沒辦法「用空格切開」，得靠模型或
              詞典來斷詞。
            </span>
          ) : (
            <span>
              <span className="font-mono text-xs">
                <span className="text-muted">{vocab?.spaceMarker ?? "▁"}</span>{" "}
                標記詞的邊界
              </span>
              ，切分（tokenization）不只是「用空格切開」而已。
            </span>
          )}{" "}
          把游標移到卡片上可以看細節；亮綠色標記 BPE 的子詞切分。
        </p>

        {!vocab ? (
          <p className="font-mono text-xs text-muted">載入詞彙表中…</p>
        ) : tokens.length === 0 ? (
          <p className="font-mono text-xs text-muted">在上面輸入一些文字。</p>
        ) : (
          <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
            {groups.map((group, gi) => (
              <div key={gi} className="flex flex-wrap items-start gap-1">
                {group.map((t) => {
                  const isHot = hovered === t.key;
                  const base =
                    "flex min-w-[2.25rem] flex-col items-center rounded-md border px-2 py-1.5 transition-colors";
                  const tone = isHot
                    ? "border-accent bg-accent text-accent-fg"
                    : t.split
                      ? "border-accent bg-bg text-accent"
                      : "border-border bg-panel text-fg hover:border-muted";
                  const idTone = isHot
                    ? "text-accent-fg/80"
                    : t.split
                      ? "text-accent/70"
                      : "text-muted";
                  // Drop letter-spacing on Han runs; keep mono ids tracked.
                  const glyphTracking = HAN_RE.test(t.display)
                    ? "tracking-normal"
                    : "";
                  return (
                    <div
                      key={t.key}
                      onMouseEnter={() => setHovered(t.key)}
                      onMouseLeave={() => setHovered(null)}
                      className={`${base} ${tone}`}
                    >
                      <span
                        className={`whitespace-pre font-mono text-sm leading-none ${glyphTracking}`}
                      >
                        {t.display}
                      </span>
                      <span
                        className={`mt-1 font-mono text-[0.625rem] uppercase tracking-wide leading-none ${idTone}`}
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
    </StationLayout>
  );
}
