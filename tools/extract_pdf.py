"""
Step 1 of the multiple-choice processing pipeline: dump a paper's exam PDF and
its marking-guidelines PDF to UTF-8 text files for reading.

Usage:
    python extract_pdf.py 2019
      -> reads  "../../Physics Papers/2019.pdf"  and  "2019 marking.pdf"
                (case-insensitive on "marking"/"Marking")
      -> writes _extract/2019/exam.txt  and  _extract/2019/marking.txt

Why a script: pypdf's text extraction mangles equations and sometimes values
(e.g. a slit spacing that is really "1 um" comes out as "1 mm"), and printing
Greek letters to a Windows console (cp1252) raises UnicodeEncodeError. Writing
straight to a UTF-8 file sidesteps both. The images are the ground truth for any
value or diagram -- always check them (step 3).
"""
import io
import os
import sys
import glob

try:
    from pypdf import PdfReader
except ImportError:
    from PyPDF2 import PdfReader

HERE = os.path.dirname(os.path.abspath(__file__))
PAPERS = os.path.join(HERE, "..", "..", "Physics Papers")


def find(year, kind):
    # kind: "" for the exam, "marking" for the guidelines
    for name in os.listdir(PAPERS):
        low = name.lower()
        if not low.endswith(".pdf"):
            continue
        if not low.startswith(str(year)):
            continue
        has_marking = "marking" in low
        if kind == "marking" and has_marking:
            return os.path.join(PAPERS, name)
        if kind == "" and not has_marking:
            return os.path.join(PAPERS, name)
    return None


def dump(pdf_path, out_path, tag):
    r = PdfReader(pdf_path)
    with io.open(out_path, "w", encoding="utf-8") as fh:
        for i, page in enumerate(r.pages):
            fh.write(f"\n\n===== {tag} PAGE {i + 1}/{len(r.pages)} =====\n")
            fh.write(page.extract_text() or "")
    return len(r.pages)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    year = sys.argv[1]
    out_dir = os.path.join(HERE, "_extract", year)
    os.makedirs(out_dir, exist_ok=True)
    for kind, tag in [("", "exam"), ("marking", "marking")]:
        pdf = find(year, kind)
        if not pdf:
            print(f"  !! could not find the {tag} PDF for {year} in {PAPERS}")
            continue
        n = dump(pdf, os.path.join(out_dir, f"{tag}.txt"), tag)
        print(f"  {os.path.basename(pdf)}  ->  _extract/{year}/{tag}.txt  ({n} pages)")


if __name__ == "__main__":
    main()
