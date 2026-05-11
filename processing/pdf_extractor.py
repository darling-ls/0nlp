import argparse
import os
from pathlib import Path

import fitz  # PyMuPDF


def extract_pdf_to_text(pdf_path: Path, output_dir: Path) -> Path:
    """Extracts text from a single PDF and saves it as a .txt file."""
    output_dir.mkdir(parents=True, exist_ok=True)
    text_path = output_dir / f"{pdf_path.stem}.txt"

    doc = fitz.open(str(pdf_path))
    full_text = []

    for page_num, page in enumerate(doc, start=1):
        page_text = page.get_text("text")
        full_text.append(f"--- Page {page_num} (parsed text) ---")
        full_text.append(page_text)

        # Basic image detection
        images = page.get_images(full=True)
        if images:
            full_text.append(f"[Note: {len(images)} image(s) found on this page. ]")

    text_path.write_text("\n".join(full_text), encoding="utf-8")
    doc.close()
    return text_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract text from Moroccan customs PDF circulars.")
    parser.add_argument("--pdf-dir", required=True, type=Path, help="Directory containing PDF files.")
    parser.add_argument("--out-dir", required=True, type=Path, help="Directory to save extracted .txt files.")
    args = parser.parse_args()

    pdf_files = list(args.pdf_dir.glob("*.pdf"))
    if not pdf_files:
        print(f"No PDF files found in {args.pdf_dir}")
        return

    print(f"Extracting {len(pdf_files)} PDFs...")
    for pdf in pdf_files:
        try:
            txt_file = extract_pdf_to_text(pdf, args.out_dir)
            print(f"  Extracted: {pdf.name} -> {txt_file.name}")
        except Exception as e:
            print(f"  Failed to extract {pdf.name}: {e}")


if __name__ == "__main__":
    main()
