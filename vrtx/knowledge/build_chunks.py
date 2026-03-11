#!/usr/bin/env python3
r"""
VRTX Knowledge Builder
- Reads PDFs from:  ./pdfs
- Writes JSONL chunks to: ./chunks
Each JSONL line: {"source": "...pdf", "chunk_id": 0, "text": "...", "chars": 1234}

Run from sabian_core:
  python .\vrtx\knowledge\build_chunks.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, Iterator, List

def _load_pdf_text(pdf_path: Path) -> str:
    # Try pypdf first, then PyPDF2
    reader = None
    try:
        from pypdf import PdfReader  # type: ignore
        reader = PdfReader(str(pdf_path))
    except Exception:
        try:
            from PyPDF2 import PdfReader  # type: ignore
            reader = PdfReader(str(pdf_path))
        except Exception as e:
            raise RuntimeError(
                "PDF reader import failed. Install one:\n"
                "  pip install pypdf\n"
                "or\n"
                "  pip install PyPDF2\n"
            ) from e

    texts: List[str] = []
    for page in reader.pages:
        try:
            t = page.extract_text() or ""
        except Exception:
            t = ""
        if t:
            texts.append(t)

    return "\n".join(texts)



def _clean_text(t: str) -> str:
    t = t.replace("\r", "\n")
    t = t.replace("\u00ad", "")  # soft hyphen
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def _split_paragraphs(t: str) -> List[str]:
    lines = [line.strip() for line in t.split("\n")]
    lines = [line for line in lines if line]

    paras: List[str] = []
    current: List[str] = []

    for line in lines:
        if len(line) < 40:
            if current:
                para = " ".join(current).strip()
                if len(para) >= 80:
                    paras.append(para)
                current = []
            continue

        current.append(line)

        if len(" ".join(current)) >= 1200:
            para = " ".join(current).strip()
            if len(para) >= 80:
                paras.append(para)
            current = []

    if current:
        para = " ".join(current).strip()
        if len(para) >= 80:
            paras.append(para)

    return paras


def _split_large_text(text: str, max_chars: int = 1500, overlap_chars: int = 200) -> Iterator[str]:
    text = text.strip()
    if not text:
        return

    start = 0
    n = len(text)

    while start < n:
        end = min(start + max_chars, n)
        part = text[start:end].strip()
        if part:
            yield part

        if end >= n:
            break

        next_start = end - overlap_chars if overlap_chars > 0 else end
        if next_start <= start:
            next_start = end
        start = next_start

def _chunk_paragraphs(paras: List[str], max_chars: int = 1500, overlap_chars: int = 200) -> Iterator[str]:
    buf: List[str] = []
    size = 0

    noise_patterns = [
        r"^contents$",
        r"^contributors$",
        r"^series foreword$",
        r"^preface$",
        r"^editors$",
        r"^index$",
        r"^copyright$",
        r"^all rights reserved",
        r"^wiley-blackwell",
        r"^published by",
        r"^for details of our global editorial offices",
        r"^the right of the author to be identified",
        r"^no part of this publication may be reproduced",
        r"^\d+(\.\d+)+\s+",
    ]

    def is_noise(text: str) -> bool:
        t = " ".join(text.lower().split()).strip()
        if len(t) < 80:
            return True
        for pat in noise_patterns:
            if re.search(pat, t):
                return True
        return False

    def flush_buffer() -> Iterator[str]:
        nonlocal buf, size

        if not buf:
            return

        chunk = "\n\n".join(buf).strip()
        buf = []
        size = 0

        if len(chunk) >= 80 and not is_noise(chunk):
            yield chunk

    for p in paras:
        p = p.strip()
        if not p:
            continue

        if is_noise(p):
            continue

        if len(p) > 50000:
            print(f"  Skipping oversized paragraph ({len(p)} chars)")
            continue

        if len(p) > max_chars:
            yield from flush_buffer()
            for part in _split_large_text(p, max_chars=max_chars, overlap_chars=overlap_chars):
                part = part.strip()
                if len(part) >= 80 and not is_noise(part):
                    yield part
            continue

        add_len = len(p) + (2 if buf else 0)

        if size + add_len <= max_chars:
            buf.append(p)
            size += add_len
        else:
            yield from flush_buffer()
            buf.append(p)
            size = len(p)

    yield from flush_buffer()



def main() -> int:
    base_dir = Path(__file__).resolve().parent
    pdf_dir = base_dir / "pdfs"
    out_dir = base_dir / "chunks"
    out_dir.mkdir(parents=True, exist_ok=True)

    if not pdf_dir.exists():
        print(f"ERROR: pdfs folder not found: {pdf_dir}")
        return 2

    pdfs = sorted(pdf_dir.glob("*.pdf"))
    if not pdfs:
        print(f"ERROR: no PDFs found in: {pdf_dir}")
        return 3

    index: List[Dict] = []
    total_chunks = 0

    for pdf in pdfs:
        print(f"Reading: {pdf.name}")

        raw = _load_pdf_text(pdf)
        clean = _clean_text(raw)
        paras = _split_paragraphs(clean)

        out_path = out_dir / f"{pdf.stem}.jsonl"
        chunk_count = 0

        with out_path.open("w", encoding="utf-8") as f:
            for i, ch in enumerate(_chunk_paragraphs(paras, max_chars=1500, overlap_chars=200)):
                rec = {
                    "source": pdf.name,
                    "chunk_id": i,
                    "chars": len(ch),
                    "text": ch,
                }
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                chunk_count += 1

        index.append(
            {
                "source": pdf.name,
                "chunks_file": out_path.name,
                "chunk_count": chunk_count,
            }
        )
        total_chunks += chunk_count
        print(f"  -> {chunk_count} chunks written to {out_path.name}")

    index_path = out_dir / "index.json"
    index_path.write_text(
        json.dumps(
            {
                "total_pdfs": len(pdfs),
                "total_chunks": total_chunks,
                "files": index,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print("")
    print(f"Done. PDFs: {len(pdfs)} | Total chunks: {total_chunks}")
    print(f"Index: {index_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())