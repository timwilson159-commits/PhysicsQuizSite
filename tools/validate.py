"""
Validate a staged question JSON batch before building a preview or inserting.

Usage:
    python validate.py questions/hsc-2019.json [more.json ...]

Checks, per question:
  - required fields for its type
  - multiple-choice / true-false: answer is one of options
  - word-bank: number of ___ blanks in prompt == len(answer); every answer in bank;
    bank has <= 8 items
  - drag-drop: answer keys == pair items; answer values == pair matches
  - ordering: answer is a permutation of items
  - numeric-entry: answer is a real number; tolerance (if present) > 0;
    tolerance_mode in {relative, absolute}; unit is a string
  - image_filename (if present) exists in images/<slug>/
Then reports the type-mix percentage across all files given.
"""
import json
import sys
import os
import numbers

TYPES = {"multiple-choice", "true-false", "word-bank", "drag-drop", "ordering", "numeric-entry"}
HERE = os.path.dirname(os.path.abspath(__file__))

errors = []
warnings = []
type_counts = {}


def check(cond, msg):
    if not cond:
        errors.append(msg)
    return cond


def validate_question(q, tag, slug):
    t = q.get("type")
    type_counts[t] = type_counts.get(t, 0) + 1
    check(t in TYPES, f"{tag}: unknown type {t!r}")
    check(isinstance(q.get("prompt"), str) and q["prompt"].strip(), f"{tag}: missing prompt")
    check(isinstance(q.get("inquiry_id"), str) and q["inquiry_id"], f"{tag}: missing inquiry_id")

    img = q.get("image_filename")
    if img:
        p = os.path.join(HERE, "images", slug, img)
        check(os.path.isfile(p), f"{tag}: image_filename {img!r} not found at {p}")

    if t in ("multiple-choice", "true-false"):
        opts = q.get("options")
        check(isinstance(opts, list) and len(opts) >= 2, f"{tag}: options must be a list of >=2")
        check(q.get("answer") in (opts or []), f"{tag}: answer {q.get('answer')!r} not in options")
        if t == "true-false":
            check(set(opts or []) == {"True", "False"}, f"{tag}: true-false options must be exactly True/False")

    elif t == "word-bank":
        bank = q.get("bank")
        ans = q.get("answer")
        ans = ans if isinstance(ans, list) else [ans]
        blanks = q["prompt"].count("___")
        check(isinstance(bank, list) and 1 <= len(bank) <= 8, f"{tag}: bank must be a list of 1-8 items")
        check(blanks == len(ans), f"{tag}: {blanks} '___' blanks but {len(ans)} answer(s)")
        for a in ans:
            check(a in (bank or []), f"{tag}: answer {a!r} not in bank")

    elif t == "drag-drop":
        pairs = q.get("pairs")
        ans = q.get("answer")
        check(isinstance(pairs, list) and pairs, f"{tag}: pairs must be a non-empty list")
        check(isinstance(ans, dict), f"{tag}: answer must be an object")
        if isinstance(pairs, list) and isinstance(ans, dict):
            items = [p.get("item") for p in pairs]
            check(set(items) == set(ans.keys()), f"{tag}: answer keys != pair items")
            for p in pairs:
                check(ans.get(p["item"]) == p["match"], f"{tag}: answer[{p['item']!r}] != its pair match")

    elif t == "ordering":
        items = q.get("items")
        ans = q.get("answer")
        check(isinstance(items, list) and len(items) >= 2, f"{tag}: items must be a list of >=2")
        check(isinstance(ans, list) and sorted(ans) == sorted(items or []), f"{tag}: answer must be a permutation of items")

    elif t == "numeric-entry":
        ans = q.get("answer")
        check(isinstance(ans, numbers.Real) and not isinstance(ans, bool), f"{tag}: answer must be a number, got {ans!r}")
        tol = q.get("tolerance")
        if tol is not None:
            check(isinstance(tol, numbers.Real) and tol > 0, f"{tag}: tolerance must be > 0")
        tm = q.get("tolerance_mode")
        check(tm in (None, "relative", "absolute"), f"{tag}: tolerance_mode must be relative/absolute")
        check(isinstance(q.get("unit", ""), str), f"{tag}: unit must be a string")
        if q.get("tolerance_mode") == "relative" and ans == 0:
            warnings.append(f"{tag}: relative tolerance around a zero answer only matches exactly 0 -- use absolute")


def main():
    paths = sys.argv[1:]
    if not paths:
        print(__doc__)
        sys.exit(1)
    total = 0
    for path in paths:
        slug = os.path.splitext(os.path.basename(path))[0]
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        check(isinstance(data, list), f"{path}: top level must be a JSON array")
        for i, q in enumerate(data):
            validate_question(q, f"{slug}[{i}] {q.get('qsrc', '?')}/{q.get('type', '?')}", slug)
            total += 1

    print(f"\n{total} questions checked across {len(paths)} file(s).")
    print("\nType mix:")
    mc = type_counts.get("multiple-choice", 0) + type_counts.get("true-false", 0)
    for t in sorted(type_counts):
        print(f"  {t:16s} {type_counts[t]:3d}  ({type_counts[t]/total*100:.0f}%)")
    print(f"  {'(MC + T/F)':16s} {mc:3d}  ({mc/total*100:.0f}%)")
    pure_mc = type_counts.get("multiple-choice", 0)
    print(f"  {'(MC only)':16s} {pure_mc:3d}  ({pure_mc/total*100:.0f}%)")

    if warnings:
        print(f"\n{len(warnings)} WARNING(S):")
        for w in warnings:
            print(f"  ! {w}")
    if errors:
        print(f"\n{len(errors)} ERROR(S):")
        for e in errors:
            print(f"  x {e}")
        sys.exit(1)
    print("\nAll checks passed.")


if __name__ == "__main__":
    main()
