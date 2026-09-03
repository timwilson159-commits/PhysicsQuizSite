// Upload the images for a staged batch to Supabase storage, resolve them to
// public URLs, and insert the question rows. Run as its own explicit step AFTER
// the preview has been approved.
//
// Usage:
//   node insert_questions.cjs <slug>            e.g. hsc-2019
//   node insert_questions.cjs <slug> --dry-run  parse + validate + report, no writes
//
// Reads:  questions/<slug>.json   images/<slug>/<image_filename>
// Env:    VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  (from ../.env)
//
// module_id is derived from inquiry_id ("5.1" -> "module-5"). The staged JSON's
// qsrc / quarantine_reason fields are for triage only and are not inserted.

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// load ../.env without a dependency
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see ../.env).");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET = "question-images";
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif" };

function moduleIdFor(inquiryId) {
  return `module-${String(inquiryId).split(".")[0]}`;
}

async function uploadImage(slug, filename) {
  const local = path.join(__dirname, "images", slug, filename);
  const buf = fs.readFileSync(local);
  const storagePath = `${slug}/${filename}`;
  const ext = path.extname(filename).toLowerCase();
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: MIME[ext] || "application/octet-stream",
    upsert: true,
  });
  if (error) throw new Error(`upload failed for ${filename}: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

(async () => {
  const slug = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!slug) {
    console.error("Usage: node insert_questions.cjs <slug> [--dry-run]");
    process.exit(1);
  }

  const qpath = path.join(__dirname, "questions", `${slug}.json`);
  const questions = JSON.parse(fs.readFileSync(qpath, "utf-8"));
  console.log(`${slug}: ${questions.length} questions staged`);

  // image sanity check up front
  const imageNames = [...new Set(questions.map(q => q.image_filename).filter(Boolean))];
  for (const name of imageNames) {
    const p = path.join(__dirname, "images", slug, name);
    if (!fs.existsSync(p)) throw new Error(`missing image on disk: images/${slug}/${name}`);
  }
  console.log(`${imageNames.length} unique image(s) referenced`);

  const { count: before, error: cErr } = await supabase
    .from("questions").select("*", { count: "exact", head: true });
  if (cErr) throw new Error(`count failed: ${cErr.message}`);
  console.log(`questions table currently holds ${before} row(s)`);

  if (dryRun) {
    console.log("\n--dry-run: no images uploaded, no rows inserted.");
    const byType = {};
    questions.forEach(q => { byType[q.type] = (byType[q.type] || 0) + 1; });
    console.log("type mix:", byType);
    return;
  }

  const urlCache = {};
  for (const name of imageNames) {
    process.stdout.write(`uploading ${name} ... `);
    urlCache[name] = await uploadImage(slug, name);
    console.log("ok");
  }

  const rows = questions.map(q => ({
    module_id: moduleIdFor(q.inquiry_id),
    inquiry_id: q.inquiry_id,
    type: q.type,
    prompt: q.prompt,
    image: q.image_filename ? urlCache[q.image_filename] : "",
    options: q.options || null,
    bank: q.bank || null,
    pairs: q.pairs || null,
    items: q.items || null,
    answer: q.answer,
    tolerance: q.tolerance == null || q.tolerance === "" ? null : Number(q.tolerance),
    tolerance_mode: q.tolerance_mode || null,
    unit: q.unit || null,
    hint: q.hint || null,
  }));

  const { data, error } = await supabase.from("questions").insert(rows).select("id");
  if (error) { console.error("insert failed:", error); process.exitCode = 1; return; }

  const { count: after } = await supabase
    .from("questions").select("*", { count: "exact", head: true });
  console.log(`\ninserted ${data.length} rows. table: ${before} -> ${after} (expected ${before + questions.length})`);
  if (after !== before + questions.length) console.error("!! row count delta does not match -- investigate");
})();
