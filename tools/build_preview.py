"""
Build a self-contained HTML QC preview for a staged question batch.

Usage:
    python build_preview.py hsc-2019
      -> reads questions/hsc-2019.json (+ quarantine/hsc-2019.json if present)
      -> writes preview/hsc-2019.html

Every question type is rendered the way it will look to a student, with the
correct answer highlighted. Maths ($...$ / $$...$$) is rendered with KaTeX from
a CDN. Images are embedded as base64 data URIs so the file stands alone.
"""
import base64
import html
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif"}


def esc(s):
    return html.escape(str(s), quote=True)


def data_uri(slug, filename):
    path = os.path.join(HERE, "images", slug, filename)
    if not os.path.isfile(path):
        return None
    ext = os.path.splitext(filename)[1].lower()
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    return f"data:{MIME.get(ext, 'application/octet-stream')};base64,{b64}"


def img_tag(slug, q):
    fn = q.get("image_filename")
    if not fn:
        return ""
    uri = data_uri(slug, fn)
    if not uri:
        return f'<div class="imgmissing">image not found: {esc(fn)}</div>'
    return f'<img class="stim" src="{uri}" alt="{esc(fn)}"><div class="imgcap">{esc(fn)}</div>'


def render_body(q):
    t = q["type"]
    if t in ("multiple-choice", "true-false"):
        rows = []
        for opt in q["options"]:
            correct = opt == q["answer"]
            rows.append(f'<li class="opt {"correct" if correct else ""}">'
                        f'{"&#10003; " if correct else ""}<span class="rich">{esc(opt)}</span></li>')
        return f'<ul class="opts">{"".join(rows)}</ul>'

    if t == "word-bank":
        ans = q["answer"] if isinstance(q["answer"], list) else [q["answer"]]
        filled = q["prompt"]
        for a in ans:
            filled = filled.replace("___", f'<span class="blank">{esc(a)}</span>', 1)
        bank = " ".join(f'<span class="chip rich {"used" if w in ans else ""}">{esc(w)}</span>' for w in q["bank"])
        return (f'<div class="wb-prompt rich">{filled}</div>'
                f'<div class="bank-label">Word bank</div><div class="bank">{bank}</div>')

    if t == "drag-drop":
        rows = "".join(
            f'<tr><td class="rich">{esc(p["item"])}</td><td class="arrow">&rarr;</td>'
            f'<td class="rich match">{esc(p["match"])}</td></tr>'
            for p in q["pairs"])
        return f'<table class="dd">{rows}</table>'

    if t == "ordering":
        rows = "".join(f'<li><span class="num">{i+1}</span> <span class="rich">{esc(x)}</span></li>'
                       for i, x in enumerate(q["answer"]))
        return f'<ol class="ordering">{rows}</ol><div class="note">shown shuffled to the student; correct order above</div>'

    if t == "numeric-entry":
        tol = q.get("tolerance")
        mode = q.get("tolerance_mode") or "relative"
        unit = q.get("unit") or ""
        tol_txt = (f'&plusmn;{tol}{(" " + unit) if unit else ""}' if mode == "absolute"
                   else f'&plusmn;{tol if tol is not None else 2}%')
        return (f'<div class="num-row"><span class="num-box">{esc(q["answer"])}</span>'
                f'<span class="num-unit rich">{esc(unit) if unit else "&nbsp;"}</span></div>'
                f'<div class="note">accepted within {tol_txt} ({mode})</div>')

    return f'<pre>{esc(json.dumps(q, indent=2))}</pre>'


def render_card(slug, q, idx):
    badge = q["type"]
    qsrc = q.get("qsrc", "")
    inq = q.get("inquiry_id", "")
    hint = q.get("hint")
    qreason = q.get("quarantine_reason")
    parts = [f'<div class="card">']
    parts.append(f'<div class="meta"><span class="idx">#{idx}</span>'
                 f'<span class="badge">{esc(badge)}</span>'
                 f'<span class="tag">from {esc(qsrc)}</span>'
                 f'<span class="tag">inquiry {esc(inq)}</span></div>')
    parts.append(img_tag(slug, q))
    parts.append(f'<div class="prompt rich">{esc(q["prompt"])}</div>')
    parts.append(render_body(q))
    if hint:
        parts.append(f'<div class="tip"><b>&#128161; Tip</b> (shown only if the student answers incorrectly): '
                     f'<span class="rich">{esc(hint)}</span></div>')
    if qreason:
        parts.append(f'<div class="qreason"><b>Quarantine reason:</b> {esc(qreason)}</div>')
    parts.append('</div>')
    return "".join(parts)


PAGE = """<!doctype html><html><head><meta charset="utf-8">
<title>Preview - {slug}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
<style>
 body{{font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;max-width:900px;margin:0 auto;padding:24px;color:#1a2233;background:#f6f8fc}}
 h1{{font-size:22px;margin:0 0 4px}} .sub{{color:#667;margin:0 0 20px}}
 h2{{font-size:16px;margin:28px 0 10px;padding-top:14px;border-top:2px solid #dde3ee}}
 .card{{background:#fff;border:1px solid #e3e8f0;border-radius:12px;padding:16px 18px;margin:12px 0;box-shadow:0 1px 3px rgba(20,27,45,.05)}}
 .meta{{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}}
 .idx{{font-weight:800;color:#8a94a6}}
 .badge{{background:#141b2d;color:#fff;font-size:11px;font-weight:800;padding:3px 9px;border-radius:20px;text-transform:capitalize}}
 .tag{{background:#eef1f7;color:#556;font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px}}
 .prompt{{font-weight:600;margin:6px 0 12px}}
 img.stim{{max-width:100%;max-height:320px;border:1px solid #e3e8f0;border-radius:8px;display:block}}
 .imgcap{{font-size:11px;color:#99a;margin:3px 0 10px}}
 .imgmissing{{color:#c00;font-weight:700;margin:8px 0}}
 ul.opts{{list-style:none;padding:0;margin:0}}
 .opt{{border:1.5px solid #e3e8f0;border-radius:9px;padding:9px 12px;margin:6px 0}}
 .opt.correct{{background:#dcfce7;border-color:#059669;color:#065f46;font-weight:700}}
 .wb-prompt{{background:#f6f8fc;border:1px solid #e3e8f0;border-radius:10px;padding:12px 14px;line-height:2}}
 .blank{{background:#dcfce7;border:1px solid #059669;border-radius:6px;padding:1px 8px;font-weight:700;color:#065f46}}
 .bank-label{{font-size:11px;font-weight:800;color:#8a94a6;text-transform:uppercase;margin:12px 0 6px}}
 .chip{{display:inline-block;border:1.5px solid #e3e8f0;border-radius:9px;padding:5px 11px;margin:3px;font-weight:700}}
 .chip.used{{background:#dcfce7;border-color:#059669;color:#065f46}}
 table.dd{{border-collapse:collapse}} table.dd td{{padding:6px 12px;border-bottom:1px solid #eef1f7}}
 td.arrow{{color:#aab}} td.match{{background:#dcfce7;color:#065f46;font-weight:700;border-radius:6px}}
 ol.ordering{{margin:0;padding-left:0;list-style:none}}
 ol.ordering li{{border:1.5px solid #e3e8f0;border-radius:9px;padding:8px 12px;margin:5px 0}}
 ol.ordering .num{{display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;background:#eef1f7;border-radius:6px;font-weight:800;font-size:12px;margin-right:8px}}
 .num-row{{display:flex;gap:8px;align-items:stretch;max-width:420px}}
 .num-box{{flex:1;border:1.5px solid #059669;background:#dcfce7;color:#065f46;border-radius:9px;padding:9px 14px;font-weight:800;font-family:ui-monospace,monospace}}
 .num-unit{{display:flex;align-items:center;padding:0 14px;background:#eef1f7;border-radius:9px;font-weight:700}}
 .note{{font-size:12px;color:#8a94a6;margin-top:6px}}
 .tip{{font-size:13px;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;margin-top:10px;line-height:1.5}}
 .qreason{{font-size:13px;color:#9a3412;background:#ffedd5;border:1px solid #fdba74;border-radius:8px;padding:8px 10px;margin-top:10px}}
 #quar .card{{border-color:#fdba74}}
</style></head><body>
<h1>{slug} - question preview</h1>
<p class="sub">{count} questions in the main set{quarcount}. Correct answers are highlighted green. This is a static QC preview, not the live app.</p>
{main}
{quar}
<script>
 document.addEventListener("DOMContentLoaded", function() {{
   document.querySelectorAll(".rich").forEach(function(el){{
     renderMathInElement(el, {{delimiters:[
       {{left:"$$",right:"$$",display:true}},{{left:"$",right:"$",display:false}}
     ], throwOnError:false}});
   }});
 }});
</script>
</body></html>"""


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    slug = sys.argv[1]
    qpath = os.path.join(HERE, "questions", f"{slug}.json")
    with open(qpath, encoding="utf-8") as f:
        main_qs = json.load(f)
    quar_path = os.path.join(HERE, "quarantine", f"{slug}.json")
    quar_qs = []
    if os.path.isfile(quar_path):
        with open(quar_path, encoding="utf-8") as f:
            quar_qs = json.load(f)

    main_html = ['<h2>Main set</h2>']
    for i, q in enumerate(main_qs, 1):
        main_html.append(render_card(slug, q, i))

    quar_html = ""
    if quar_qs:
        blocks = ['<h2 id="quar">Quarantine - needs your decision</h2>']
        for i, q in enumerate(quar_qs, 1):
            blocks.append(render_card(slug, q, f"Q{i}"))
        quar_html = "".join(blocks)

    out = PAGE.format(
        slug=esc(slug),
        count=len(main_qs),
        quarcount=f", {len(quar_qs)} quarantined" if quar_qs else "",
        main="".join(main_html),
        quar=quar_html,
    )
    out_path = os.path.join(HERE, "preview", f"{slug}.html")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"wrote {out_path}  ({len(out)//1024} KB, {len(main_qs)} main + {len(quar_qs)} quarantine)")


if __name__ == "__main__":
    main()
