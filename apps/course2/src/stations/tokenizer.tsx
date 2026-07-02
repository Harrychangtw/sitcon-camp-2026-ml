/**
 * TOKENIZER — Course 2, station 1 (Loop 0).
 *
 * The first wall: students type text and watch it segment live into tokens, each
 * carrying an id from a precomputed vocab. Flipping Char / Word / BPE shows that
 * a model reads *tokens*, not letters or words — and BPE visibly subword-splits
 * a rare word ("tokenization") that the word/char schemes can't.
 *
 * Pattern follows reference.tsx: state → controls → a canvas that is a pure,
 * memoized function of that state. The ONLY non-hard-coded input is the vocab,
 * loaded via @camp/data inside an effect. Segmentation itself is light and
 * rule-based, so it runs in the browser (no training — see CLAUDE.md).
 */
import { useEffect, useMemo, useState } from "react";
import { SegmentedControl, StationLayout } from "@camp/ui";
import { loadJSON } from "@camp/data";

type Scheme = "char" | "word" | "bpe";

/** Shape of tokenizer/vocab.json, written by `camp-precompute tokenizer`. */
interface Vocab {
  spaceMarker: string;
  unkId: number;
  sampleText: string;
  char: { vocab: Record<string, number> };
  word: { vocab: Record<string, number> };
  bpe: { vocab: Record<string, number>; merges: Array<[string, string]> };
}

/** One rendered chip. */
interface Token {
  /** Text shown on the chip (word-boundary marker already applied). */
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

// Split text into word / punctuation units (mirrors the precompute regex).
const UNIT_RE = /[A-Za-z0-9]+|[^\sA-Za-z0-9]/g;

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\n" || ch === "\t";
}

/** Greedy BPE encode of a single word, using the learned merge order. */
function bpeEncode(word: string, vocab: Vocab): string[] {
  const { spaceMarker, bpe } = vocab;
  // rank[a][b] = merge order of the pair (a, b); lower merges first.
  const rank = new Map<string, Map<string, number>>();
  bpe.merges.forEach(([a, b], i) => {
    let inner = rank.get(a);
    if (!inner) {
      inner = new Map();
      rank.set(a, inner);
    }
    inner.set(b, i);
  });

  let syms = [spaceMarker, ...word.split("")];
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

/** Pure segmentation: (text, scheme, vocab) → chips. Memoized in the component. */
function segment(text: string, scheme: Scheme, vocab: Vocab | null): Token[] {
  if (!vocab || !text) return [];
  const { spaceMarker, unkId } = vocab;
  const out: Token[] = [];

  if (scheme === "char") {
    let group = 0;
    const lut = vocab.char.vocab;
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
  const lut = scheme === "word" ? vocab.word.vocab : vocab.bpe.vocab;
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
    const pieces = bpeEncode(unit.toLowerCase(), vocab);
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
  { label: "Char", value: "char" as const },
  { label: "Word", value: "word" as const },
  { label: "BPE", value: "bpe" as const },
];

export function TokenizerStation() {
  // 1. STATE — scheme, the text, and the vocab (loaded, not hard-coded).
  const [scheme, setScheme] = useState<Scheme>("bpe");
  const [text, setText] = useState("");
  const [vocab, setVocab] = useState<Vocab | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // 3. LOAD PRECOMPUTED VOCAB via @camp/data inside an effect. Seed the text box
  //    from the artifact's sample sentence the first time it lands.
  useEffect(() => {
    let alive = true;
    loadJSON<Vocab>("/data/course2/tokenizer/vocab.json").then((v) => {
      if (!alive) return;
      setVocab(v);
      setText((t) => (t ? t : v.sampleText));
    });
    return () => {
      alive = false;
    };
  }, []);

  // 2. DERIVED CANVAS DATA — a pure, memoized function of (text, scheme, vocab).
  const tokens = useMemo(
    () => segment(text, scheme, vocab),
    [text, scheme, vocab],
  );
  const groups = useMemo(() => byGroup(tokens), [tokens]);
  const splitWords = useMemo(
    () => new Set(tokens.filter((t) => t.split).map((t) => t.group)).size,
    [tokens],
  );

  return (
    <StationLayout
      title="Tokenizer"
      subtitle="How does raw text become something a model can read?"
      controls={
        <>
          <SegmentedControl<Scheme>
            label="Scheme"
            value={scheme}
            onChange={setScheme}
            options={SCHEME_OPTS}
          />

          <div>
            <div className="mb-1 font-mono text-xs uppercase tracking-wide text-muted">
              Input text
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder={vocab ? vocab.sampleText : "loading vocab…"}
              className="w-full resize-y rounded-md border border-border bg-panel p-3 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <p className="mt-2 text-xs text-muted">
              Try a rare word like{" "}
              <span className="font-mono text-fg">tokenization</span> in{" "}
              <span className="font-mono text-fg">BPE</span> — it has no whole
              token, so it breaks into subword pieces.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-2 border-t border-border/30 pt-4 font-mono text-xs uppercase tracking-wide text-muted">
            <dt>Tokens</dt>
            <dd className="text-right text-fg">{tokens.length}</dd>
            <dt>Segments</dt>
            <dd className="text-right text-fg">{groups.length}</dd>
            {scheme === "bpe" ? (
              <>
                <dt>Split words</dt>
                <dd className="text-right text-accent">{splitWords}</dd>
              </>
            ) : null}
          </dl>
        </>
      }
      takeaway={
        <span>
          The model never sees your letters or your words — only these{" "}
          <span className="font-mono text-accent">ids</span>. Change the scheme
          and the very same sentence becomes a different list of numbers.
        </span>
      }
    >
      <div className="flex h-full flex-col gap-4">
        <p className="text-sm text-muted">
          Each card is one token the model reads.{" "}
          <span className="font-mono text-xs uppercase tracking-wide">
            <span className="text-muted">{vocab?.spaceMarker ?? "▁"}</span> marks
            a word boundary
          </span>{" "}
          — tokenization is not just &ldquo;split on spaces&rdquo;. Hover a card
          to inspect it; lime marks a BPE subword split.
        </p>

        {!vocab ? (
          <p className="font-mono text-xs uppercase tracking-wide text-muted">
            Loading vocab…
          </p>
        ) : tokens.length === 0 ? (
          <p className="font-mono text-xs uppercase tracking-wide text-muted">
            Type something above.
          </p>
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
                  return (
                    <div
                      key={t.key}
                      onMouseEnter={() => setHovered(t.key)}
                      onMouseLeave={() => setHovered(null)}
                      className={`${base} ${tone}`}
                    >
                      <span className="whitespace-pre font-mono text-sm leading-none">
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
