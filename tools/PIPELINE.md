# Multiple-choice processing pipeline

**Invoke by saying: "use the multiple-choice processing pipeline" (for paper YYYY).**

Turns one NSW HSC Physics **Section I** paper (the 20 multiple-choice questions)
into a staged batch of Physics Quiz Centre questions, ready to preview and insert.
This is the exact procedure that produced the 2019-2025 batches; follow it step by
step, every time.

---

## Inputs (already in the repo)

| What | Where |
|---|---|
| Exam paper | `../Physics Papers/YYYY.pdf` |
| Marking guidelines | `../Physics Papers/YYYY Marking.pdf` (case varies) |
| Extracted images | `../Physics Papers/Extracted Images/YYYY_imgNN.png` |

The answer key is **page 1 of the marking guidelines**. The
question-to-syllabus **mapping grid is on the last few pages** of the marking
guidelines (Section I rows have plain numeric question numbers).

## Outputs (this pipeline writes)

| File | Purpose |
|---|---|
| `questions/hsc-YYYY.json` | the main batch (array of question objects) |
| `quarantine/hsc-YYYY.json` | flagged questions needing a human decision (omit if none) |
| `triage/hsc-YYYY.md` | per-question decision log + QC flags |
| `images/hsc-YYYY/YYYY-qN-slug.png` | the Section I stimulus images that were kept |
| `preview/hsc-YYYY.html` | self-contained QC preview (built, not hand-written) |

## Tools

| Script | Does |
|---|---|
| `python extract_pdf.py YYYY` | dumps both PDFs to `_extract/YYYY/{exam,marking}.txt` (UTF-8) |
| `python validate.py questions/hsc-YYYY.json quarantine/hsc-YYYY.json` | structural checks + type-mix report |
| `python build_preview.py hsc-YYYY` | builds `preview/hsc-YYYY.html` (KaTeX, embedded images, answers highlighted) |
| `node insert_questions.cjs hsc-YYYY [--dry-run]` | uploads images + inserts rows (final step, after approval) |

---

## The steps

### 1. Extract the text

```
python extract_pdf.py YYYY
```

Read `_extract/YYYY/marking.txt` page 1 for the **answer key** (transcribe all 20
letters and re-check them once -- a single mis-read letter has caused a wrong
"correct answer" before). Read the **mapping grid** on the last pages and record,
for each of Q1-Q20, the NESA "Content" cell -> the inquiry id
(`module-<n>` prefix + the dot-point, e.g. `5.1`, `6.4`, `8.3`). Where NESA
dual-maps a question to two modules, pick the closest single inquiry and note it
in the triage.

### 2. Read the 20 stems

Read the Section I pages of `_extract/YYYY/exam.txt`. Note which questions
reference a figure ("shown", "the diagram", "above", W/X/Y/Z labels, "which row
of the table", "which graph").

### 3. View EVERY Section I image -- this is the load-bearing step

- Image numbering does **not** track question order. Extraction merges,
  renumbers and splits panels. Some files are a whole-question capture, some are
  just the stimulus, some are one option panel of four.
- The images are **ground truth** for any value or diagram. The PDF text mangles
  equations and sometimes real values (a "1 um" slit spacing came out as
  "1 mm"; a rectified-DC waveform read as a plain sine in the text).
- View each `YYYY_imgNN.png` with the Read tool and map it to a question. Stop
  when you reach the first Section II figure (usually around img20-img26; a
  data/formula sheet or an H-R diagram with no Section I referent is the tell).
- For every diagram-dependent question, check the claimed correct answer against
  what is actually drawn (vector directions, graph gradients, which plate is
  which, which curve is labelled what).

### 4. Decide the type for each of the 20

Rules (from the project brief and the user's Phase B instructions):

- **At most 10 of the 20 originals stay `multiple-choice`.** Keep MC for genuine
  "which statement is correct / which is NOT" reasoning items, and for
  calculations that need 3-4 plausible distractors. Convert the rest.
- **Diagram-option questions** (the four options are pictures: arrows, graphs,
  circuit variants): reword so neither the stem nor the options need an image.
  Keep any *stimulus* image. Often becomes a `multiple-choice` with worded
  options, a `word-bank`, or a `drag-drop`.
- **"Which row of the table"**: convert to `drag-drop` (item -> value) or, for a
  single choice, a `word-bank`.
- **Calculations**: convert to `numeric-entry` (per-question `tolerance`,
  `tolerance_mode`, `unit`; default tolerance 2). Numeric `word-bank` (bank of
  numbers) also works for "by what factor".
- **Sequences / stages** ("which correctly orders..."): convert to `ordering`.
- **True-false**: use where a single physics claim is a natural fit; do not
  default to it.
- **Every question must stand alone.** If the original said "the experiment
  above" or relied on the figure for a fact (e.g. "Q is higher than P"), state
  that fact inline in the reworded prompt.
- **House style**: no em dashes in new prompt text. Maths as KaTeX `$...$`
  (inline) / `$$...$$` (display); plain Unicode (`v^2`, `omega`) also renders.
  Units in `numeric-entry` render as maths too (`m s^{-1}` is auto-detected).

### 5. Multiply where there is an easy fit

Turn one original into 2-4 platform questions by rewording and/or **reusing its
stimulus image** or its context. Typical outcome is about 1.7x
(20 -> ~32-38). Do **not** force it -- a concept-only paper multiplies less.
Good openings: a rich stimulus figure (H-R diagram, decay chart) that supports
several different asks; a calculation that yields an intermediate value worth its
own numeric-entry; a "which statement" whose correct idea also makes a clean
true-false. Reuse the same `image_filename` on every question that shares a
figure.

### 6. Quarantine what cannot be made self-contained or is doubtful

Put a question in `quarantine/hsc-YYYY.json` (with a `quarantine_reason` string,
which `validate.py` and `build_preview.py` both understand) when:

- it needs **two figures at once** (e.g. a stimulus AND a four-panel of option
  graphs) that cannot be combined into one image, and the answer is
  shape-dependent;
- the four options are diagrams whose meaning depends on details that cannot be
  reconstructed in text (e.g. winding sense, charge spacing);
- **the supplied answer key contradicts the physics** -- flag it, never silently
  override or silently include. Give your best-guess rework and say what you are
  unsure about.

For each quarantined question, offer the user three routes: supply a single
combined image, drop it, or confirm the proposed reword.

### 7. Verify the physics

For every non-trivial question, work the physics yourself and confirm it agrees
with the marking key. Where it does not, quarantine (step 6). Be especially
careful with: relativity of simultaneity / length contraction, rotating-rod EMF
(field in the plane of rotation gives a sinusoid; field perpendicular to the
plane gives a constant EMF), Lenz's-law force directions, elliptical-orbit energy
at labelled points, and de Broglie / photoelectric threshold arithmetic.

### 8. Copy the kept stimulus images

```
mkdir -p images/hsc-YYYY
cp "../Physics Papers/Extracted Images/YYYY_img0X.png" images/hsc-YYYY/YYYY-qN-<short-slug>.png
```

One image per kept question (or shared across a multiplied set). Name
`YYYY-q<originalN>-<slug>.png`. Set `image_filename` on the question to that
basename only.

### 9. Write the three files

**`questions/hsc-YYYY.json`** -- a JSON array. One object per question:

```jsonc
{
  "qsrc": "Q4b",                 // original question + a/b/c... for multiplied ones (triage only)
  "inquiry_id": "8.1",           // module_id is derived by the inserter from this
  "type": "multiple-choice",     // | true-false | word-bank | drag-drop | ordering | numeric-entry
  "prompt": "...",               // full, self-contained; $...$ for maths
  "image_filename": "2019-q4-hr-diagram.png",  // optional; basename in images/hsc-YYYY/
  "hint": "...",                 // one sentence; the app shows it as a "Tip" ONLY when the
                                 //   student answers this question wrong. Point at the idea
                                 //   (relevant formula / principle), never state the answer.

  // exactly the fields for the type:
  "options": ["...", "...", "...", "..."],      // multiple-choice / true-false; answer must be one of these
  "answer": "the correct option string",       //   (true-false options are exactly ["True","False"])

  "bank": ["...", "..."],                       // word-bank: <= 8 items incl. distractors
  "answer": ["blank1", "blank2"],              //   one entry per "___" in prompt, in order; each must be in bank

  "pairs": [{"item":"A","match":"1"}, ...],     // drag-drop
  "answer": {"A":"1", ...},                    //   mirrors pairs exactly

  "items": ["first","second","third"],         // ordering: the correct sequence
  "answer": ["first","second","third"],        //   same set as items (UI shuffles for display)

  "answer": 19.6,                               // numeric-entry: a number
  "unit": "m s^{-1}",                          //   shown beside the field, not typed
  "tolerance": 2,                              //   number; omit -> app default 2
  "tolerance_mode": "relative"                 //   "relative" (percent) | "absolute"; use absolute if answer is 0
}
```

**`quarantine/hsc-YYYY.json`** -- same shape, plus `"quarantine_reason": "..."`.
Use `"image_filename": ""` if the image is unresolved.

**`triage/hsc-YYYY.md`** -- follow the format of the existing triage files:
source line; original->platform count and quarantine count; the transcribed
answer key; the whole-batch type-mix line; a per-question table
(`Orig | Ans | Inquiry (NESA) | Platform questions | Image | Notes`); and a
"Flags for your QC" list (mapping judgement calls, any reconstruction, every
quarantine, the multiplication rate, the true-false share).

### 10. Validate

```
python validate.py questions/hsc-YYYY.json quarantine/hsc-YYYY.json
```

Must end "All checks passed." The report also prints the type mix -- confirm
**MC-only is at or under ~28-33%** (the corpus target) and never above 50%. If
it is high, convert more originals to word-bank / drag-drop. If true-false is
above ~33%, drop the weakest near-restatement true-false multiplications.

### 11. Build the preview and hand it over

```
python build_preview.py hsc-YYYY
```

Serve it (`python -m http.server 8899` from `tools/`, then open
`http://127.0.0.1:8899/preview/hsc-YYYY.html`) and sanity-check: every KaTeX
span rendered, every stimulus image loaded, no `$` showing literally, correct
answers highlighted green, the Quarantine section present.

Send `preview/hsc-YYYY.html` and `triage/hsc-YYYY.md` to the user. **Stop here.**
Wait for approval and for decisions on the quarantined questions.

### 12. Insert (only after explicit approval)

Prerequisites (one-time): `storage_setup.sql` has been run in Supabase (creates
the `question-images` bucket); `../.env` has `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`.

```
node insert_questions.cjs hsc-YYYY --dry-run     # parse + count check, no writes
node insert_questions.cjs hsc-YYYY               # uploads images, inserts rows
```

The script reports `questions` table `before -> after` and flags if the delta
does not equal the number of staged rows. `module_id` is derived from
`inquiry_id` (`"5.1"` -> `"module-5"`). `qsrc` / `quarantine_reason` are not
inserted.

---

## Known gotchas (all hit at least once during 2019-2025)

- The `Read` tool cannot render PDF pages here (no poppler) -- use
  `extract_pdf.py` for text and view the `Extracted Images/*.png` for figures.
- Chaining `git commit && git push` in one Bash call gets classifier-blocked;
  run `git push` as its own call.
- A push to `main` deploys to live students immediately -- content changes are
  a git + insert step, not a deploy.
- `validate.py` treats an empty `image_filename` as "no image" (fine for
  quarantine placeholders); a non-empty name that is not on disk is an error.
