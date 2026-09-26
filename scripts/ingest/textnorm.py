"""Shared text normalization so excerpt checks behave the same everywhere.

The TypeScript audit (scripts/audit-data.ts) mirrors these rules exactly.
"""
import re
import unicodedata

_QUOTES = {"‘": "'", "’": "'", "‚": "'", "‛": "'",
           "“": '"', "”": '"', "„": '"', "′": "'", "″": '"'}
_DASHES = {"‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "−": "-"}


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("­", "")  # soft hyphen
    for src, dst in {**_QUOTES, **_DASHES}.items():
        text = text.replace(src, dst)
    text = re.sub(r"\s+", " ", text)
    return text.strip().lower()
