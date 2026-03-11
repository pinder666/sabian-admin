#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter
from pathlib import Path


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def load_chunks(chunks_dir: Path) -> list[dict]:
    rows = []
    for path in sorted(chunks_dir.glob("*.jsonl")):
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return rows


def build_idf(rows: list[dict]) -> dict[str, float]:
    df = Counter()
    total = 0
    for row in rows:
        terms = set(tokenize(row.get("text", "")))
        if not terms:
            continue
        total += 1
        for term in terms:
            df[term] += 1
    return {term: math.log((1 + total) / (1 + freq)) + 1.0 for term, freq in df.items()}


def score(query: str, text: str, idf: dict[str, float]) -> float:
    q = tokenize(query)
    t = tokenize(text)
    if not q or not t:
        return 0.0

    tf = Counter(t)
    s = 0.0
    for term in q:
        if term in tf:
            s += tf[term] * idf.get(term, 1.0)

    hits = len({term for term in q if term in tf})
    s += hits * 0.75
    return s


def main() -> int:
    base = Path(__file__).resolve().parent
    chunks_dir = base / "chunks"

    if len(sys.argv) < 2:
        print(r'Usage: python .\vrtx\knowledge\test_search.py "electrolytes fatigue hydration"')
        return 1

    rows = load_chunks(chunks_dir)
    idf = build_idf(rows)
    query = " ".join(sys.argv[1:])

    ranked = []
    for row in rows:
        s = score(query, row.get("text", ""), idf)
        if s > 0:
            ranked.append((s, row))

    ranked.sort(key=lambda x: x[0], reverse=True)

    print(f'Query: "{query}"\n')
    for i, (s, row) in enumerate(ranked[:8], start=1):
        print(f"[{i}] score={s:.2f} | source={row.get('source')} | chunk_id={row.get('chunk_id')}")
        print(row.get("text", "")[:600].replace("\n", " "))
        print("-" * 80)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
