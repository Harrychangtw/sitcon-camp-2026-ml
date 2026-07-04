"""Generate the committed word lists the embedding station embeds.

Run ONCE (offline) to (re)write ``precompute/data/vocab.zh.txt`` and
``precompute/data/vocab.en.txt``. Those files are the committed source of truth;
``embedding.py`` only reads them (it never calls wordfreq/OpenCC), so the build
path depends on a small text file + the embedder, not on this generator.

    uv run python scripts/gen_vocab.py

Source: ``wordfreq`` ships frequency-ranked word lists offline (no scraping).
For zh it returns Simplified; we convert to Taiwan Traditional (zh-TW) with
OpenCC ``s2twp`` and dedup, since S→T can collapse two words onto one form.
"""

from __future__ import annotations

import re
from pathlib import Path

from wordfreq import top_n_list

try:
    from opencc import OpenCC
except ImportError as exc:  # pragma: no cover - clear message if dep missing
    raise SystemExit("gen_vocab: `opencc` not installed — run `uv sync`") from exc

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# How many frequency-ranked candidates to pull before filtering, and the cap on
# the kept list (keeps the shipped JSON within the size budget — see embedding.py).
ZH_CANDIDATES = 12000
EN_CANDIDATES = 8000
MAX_WORDS = 3610

_HAN = re.compile(r"^[一-鿿]{2,4}$")  # 2–4 漢字, no latin/digits/punct
_EN = re.compile(r"^[a-z]{2,}$")  # letters only, drop single letters

# Single-char 漢字 the _HAN filter drops but the station advertises as an example
# search (see the placeholder in embedding.tsx). Seeded first so they stay
# searchable across regenerations.
ALWAYS_ZH = ("貓",)


def build_zh() -> list[str]:
    """Frequency-ranked zh-TW 詞: multi-char Han runs, Simplified → Traditional.

    ALWAYS_ZH words (single-char examples the regex would drop) are seeded first
    so they survive the MAX_WORDS cap.
    """
    cc = OpenCC("s2twp")
    seen: set[str] = set(ALWAYS_ZH)
    out: list[str] = list(ALWAYS_ZH)
    for simp in top_n_list("zh", ZH_CANDIDATES):
        if not _HAN.match(simp):
            continue
        trad = cc.convert(simp)
        if not _HAN.match(trad) or trad in seen:  # dedup post-conversion
            continue
        seen.add(trad)
        out.append(trad)
        if len(out) >= MAX_WORDS:
            break
    return out


def build_en() -> list[str]:
    """Frequency-ranked English words: lowercase, letters only, ≥2 chars."""
    seen: set[str] = set()
    out: list[str] = []
    for word in top_n_list("en", EN_CANDIDATES):
        w = word.lower()
        if not _EN.match(w) or w in seen:
            continue
        seen.add(w)
        out.append(w)
        if len(out) >= MAX_WORDS:
            break
    return out


def main() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for lang, words in (("zh", build_zh()), ("en", build_en())):
        path = DATA_DIR / f"vocab.{lang}.txt"
        path.write_text("\n".join(words) + "\n", encoding="utf-8")
        print(f"wrote {path} ({len(words)} words)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
