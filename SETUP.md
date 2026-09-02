# Physics Quiz Centre — Setup

NSW Stage 6 **Year 12 Physics** revision quiz. Same architecture and design system
as the Biology Quiz Centre (Vite + React + Supabase, single-file app), with:

- **KaTeX** math rendering — write `$...$` (inline) or `$$...$$` (display) LaTeX
  anywhere in a prompt, option, word-bank item, ordering item, unit or hint.
- A sixth question type, **`numeric-entry`** — the student types a number, scored
  against an expected value with a per-question tolerance; the unit is shown as a
  fixed label beside the input, not typed.
- Content scope: Modules 5–8 only (Advanced Mechanics, Electromagnetism, The
  Nature of Light, From the Universe to the Atom).

## 1. Create the Supabase project

1. Create a **new** Supabase project dedicated to this app (do not reuse the
   Biology project — this app has its own students, questions and admin password).
2. Open the SQL editor and run, once each:
   - [`schema.sql`](schema.sql) — `users`, `questions`, `question_flags`,
     `attempts` + permissive RLS.
   - [`admin_password_setup.sql`](admin_password_setup.sql) — moves the admin
     password into `app_settings` (starts as `admin123`).
   - [`storage_setup.sql`](storage_setup.sql) — creates the public
     `question-images` bucket for stimulus diagrams/graphs.
3. Copy the project's **Project URL** and **anon public key** from
   Settings → API.

## 2. Configure the app

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## 3. Run it locally

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## 4. Before students use it

- Log in to Admin (password starts as `admin123`) → **Change Password**.
- **Students** tab → add students (single or bulk paste). All students are
  Year 12.
- **Questions** tab → pick a module + inquiry question → add questions (single or
  bulk JSON import). Every question is live to students immediately — there is no
  draft/review step, so double-check content before saving.
- Optionally update `SCHOOL_NAME` in `src/App.jsx`.

## Deploying

New Netlify site connected to the GitHub repo: `npm run build` → deploy `dist/`,
SPA fallback (`/* → /index.html`, in `netlify.toml`). Set the two `VITE_SUPABASE_*`
variables in Netlify → Site configuration → Environment variables (all scopes),
then trigger a fresh deploy — Vite bakes them in at build time, so simply adding
them without rebuilding leaves the app on a white screen ("supabaseUrl is
required"). A push to `main` deploys to production immediately — there is no
staging environment and no draft gate on content.

## Teacher view

A read-only, no-login view of the Students + Progress tabs lives at the obscure
path in `TEACHER_VIEW_PATH` (`src/App.jsx`). Nothing links to it; treat the link
like a password and share it only with teaching staff.
