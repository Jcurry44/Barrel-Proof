#!/usr/bin/env python

import argparse
from pathlib import Path

from pypdf import PdfReader


def parse_args():
    parser = argparse.ArgumentParser(description="Extract embedded PDF text into UTF-8 .txt files.")
    parser.add_argument("--input", action="append", default=[], help="PDF file to extract. Can be repeated.")
    parser.add_argument("--input-dir", help="Directory containing PDF files.")
    parser.add_argument("--out-dir", required=True, help="Directory for extracted .txt files.")
    return parser.parse_args()


def resolve_inputs(args):
    files = [Path(item) for item in args.input]
    if args.input_dir:
        files.extend(sorted(Path(args.input_dir).glob("*.pdf")))
    return sorted(dict.fromkeys(path.resolve() for path in files))


def extract_text(pdf_path):
    reader = PdfReader(str(pdf_path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def main():
    args = parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for pdf_path in resolve_inputs(args):
        out_path = out_dir / (pdf_path.stem + ".txt")
        out_path.write_text(extract_text(pdf_path) + "\n", encoding="utf-8")
        print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
