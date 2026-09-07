// @ts-nocheck
import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import katex from "katex";
import { supabase } from "./supabaseClient";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = "admin123"; // fallback only -- real password lives in Supabase (app_settings), see admin_password_setup.sql
const SCHOOL_NAME = "Physics Quiz Centre";
const FLAG_REASONS = [
  { id: "confusing", label: "Confusing wording", icon: "😕" },
  { id: "difficult", label: "Too difficult", icon: "😤" },
  { id: "content", label: "Not aligned to content", icon: "📚" }
];

// Question-count picker limits per scope
const COUNT_LIMITS = {
  inquiry: { min: 5, softMax: 50 },
  module: { min: 20, softMax: 100 },
  year: { min: 20, softMax: 100 }
};

// ─── MODULE / INQUIRY QUESTION DEFINITIONS ────────────────────────────────────
// Module = whole topic. Inquiry = a single inquiry question within it.
// Ids are what gets stored on each question row (module_id, inquiry_id).
const MODULE_DEFS = [
  {
    id: "module-5",
    year: 12,
    icon: "🛰️",
    title: "Advanced Mechanics",
    color: "#F97316",
    color2: "#FDBA74",
    description: "Projectiles, uniform circular motion and the gravitational fields that govern planets and satellites.",
    inquiries: [
      { id: "5.1", title: "Projectile Motion", question: "How can models that are used to explain projectile motion be used to analyse and make predictions?" },
      { id: "5.2", title: "Circular Motion", question: "Why do objects move in circles?" },
      { id: "5.3", title: "Motion in Gravitational Fields", question: "How does the force of gravity determine the motion of planets and satellites?" }
    ]
  },
  {
    id: "module-6",
    year: 12,
    icon: "🧲",
    title: "Electromagnetism",
    color: "#7C3AED",
    color2: "#A78BFA",
    description: "How charges, currents and changing magnetic fields interact to produce forces, EMFs and the motor effect.",
    inquiries: [
      { id: "6.1", title: "Charged Particles, Conductors and Electric and Magnetic Fields", question: "What happens to stationary and moving charged particles when they interact with an electric or magnetic field?" },
      { id: "6.2", title: "The Motor Effect", question: "Under what circumstances is a force produced on a current-carrying conductor in a magnetic field?" },
      { id: "6.3", title: "Electromagnetic Induction", question: "How are electric and magnetic fields related?" },
      { id: "6.4", title: "Applications of the Motor Effect", question: "How has knowledge about the Motor Effect been applied to technological advances?" }
    ]
  },
  {
    id: "module-7",
    year: 12,
    icon: "💡",
    title: "The Nature of Light",
    color: "#0891B2",
    color2: "#22D3EE",
    description: "The electromagnetic spectrum, the wave and quantum models of light, and light's link to special relativity.",
    inquiries: [
      { id: "7.1", title: "Electromagnetic Spectrum", question: "What is light?" },
      { id: "7.2", title: "Light: Wave Model", question: "What evidence supports the classical wave model of light and what predictions can be made using this model?" },
      { id: "7.3", title: "Light: Quantum Model", question: "What evidence supports the particle model of light and what are the implications of this evidence for the development of the quantum model of light?" },
      { id: "7.4", title: "Light and Special Relativity", question: "How does the behaviour of light affect concepts of time, space and matter?" }
    ]
  },
  {
    id: "module-8",
    year: 12,
    icon: "⚛️",
    title: "From the Universe to the Atom",
    color: "#DB2777",
    color2: "#F472B6",
    description: "From the origin of the elements and stellar processes down to the structure of the atom and its nucleus.",
    inquiries: [
      { id: "8.1", title: "Origins of the Elements", question: "What evidence is there for the origins of the elements?" },
      { id: "8.2", title: "Structure of the Atom", question: "How is it known that atoms are made up of protons, neutrons and electrons?" },
      { id: "8.3", title: "Quantum Mechanical Nature of the Atom", question: "How is it known that classical physics cannot explain the properties of the atom?" },
      { id: "8.4", title: "Properties of the Nucleus", question: "How can the energy of the atomic nucleus be harnessed?" },
      { id: "8.5", title: "Deep Inside the Atom", question: "How is it known that human understanding of matter is still incomplete?" }
    ]
  }
];

// This app carries the Year 12 course only, so every module is Year 12 and there
// is nothing to filter -- these keep the same signatures the shared components
// call, so a Year 11 course could be slotted back in later without rewiring them.
function normalizedYear() { return 12; }
function modulesForYear() { return MODULE_DEFS; }

function moduleLabel(m) { return `Module ${m.id.split("-")[1]}: ${m.title}`; }

function findModule(moduleId) { return MODULE_DEFS.find(m => m.id === moduleId); }
function findInquiry(inquiryId) {
  for (const m of MODULE_DEFS) {
    const inq = m.inquiries.find(i => i.id === inquiryId);
    if (inq) return { ...inq, moduleId: m.id, moduleTitle: m.title, color: m.color, color2: m.color2, icon: m.icon };
  }
  return null;
}

// ─── FORMAT GUIDES ────────────────────────────────────────────────────────────
const FORMAT_GUIDE = `[
  {
    "type": "multiple-choice",
    "prompt": "Your question here?",
    "image": "",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": "Option A"
  },
  {
    "type": "true-false",
    "prompt": "Statement to evaluate.",
    "image": "",
    "options": ["True", "False"],
    "answer": "True"
  },
  {
    "type": "word-bank",
    "prompt": "The ___ contains an answer to drag in.",
    "image": "",
    "bank": ["correct answer", "distractor 1", "distractor 2", "distractor 3", "distractor 4"],
    "answer": "correct answer"
  },
  {
    "type": "word-bank",
    "prompt": "___ synthesises mRNA from a DNA template, and ___ then reads that mRNA to build a polypeptide. (up to 3 blanks, in order; bank can hold up to 8 words)",
    "image": "",
    "bank": ["Transcription", "Translation", "Replication", "Mutation", "A ribosome", "An enzyme", "A vector", "A promoter"],
    "answer": ["Transcription", "Translation"]
  },
  {
    "type": "drag-drop",
    "prompt": "Match each item to its pair:",
    "image": "",
    "pairs": [
      { "item": "Item A", "match": "Match A" },
      { "item": "Item B", "match": "Match B" }
    ],
    "answer": { "Item A": "Match A", "Item B": "Match B" }
  },
  {
    "type": "ordering",
    "prompt": "Order these stages correctly:",
    "image": "",
    "items": ["First", "Second", "Third", "Fourth"],
    "answer": ["First", "Second", "Third", "Fourth"]
  },
  {
    "type": "numeric-entry",
    "prompt": "A ball is dropped from rest and falls freely for $2.0$ s. Calculate its final speed. Take $g = 9.8$ m s$^{-2}$.",
    "image": "",
    "answer": 19.6,
    "unit": "$\\mathrm{m\\ s^{-1}}$",
    "tolerance": 2,
    "tolerance_mode": "relative"
  }
]

Notes:
- Every question may include a "hint" string. It is shown to the student as a
  "Tip" ONLY when they answer that question incorrectly. Keep it to one sentence
  that points at the idea (the relevant formula or principle), not the answer.
- Wrap maths in $...$ (inline) or $$...$$ (display) LaTeX anywhere in prompt,
  options, bank, items, unit or hint. Plain Unicode (v², ω, Δt, ×) also renders.
  A unit written as bare LaTeX (m s^{-1}) is auto-detected, but $...$ is clearer.
- numeric-entry: "answer" is the expected number (a plain JSON number, e.g. 19.6
  or 5.83e24). "tolerance" is optional (default 2, treated as a percent);
  "tolerance_mode" is "relative" (percent) or "absolute" (± value in the answer's
  units). "unit" is shown beside the input, not typed by the student. Use
  "absolute" whenever the expected answer is 0. Students may enter the value as a
  plain decimal or in scientific notation (5.6e-3, 5.6 x 10^-3, 5.6 × 10⁻³);
  grading is on the numeric value, so every equivalent form scores the same.`;

const BULK_STUDENT_GUIDE = `Smith, John, 12PHYS1, 12, STU-AB12
Jones, Emily, 12PHYS1, 12, STU-CD34
Nguyen, Kim, 12PHYS2, 12, STU-EF56`;

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const MONO = "'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace";

const C = {
  ink: "#141B2D",        // headings
  body: "#4A5568",       // body copy
  muted: "#8A94A6",      // secondary / captions
  faint: "#B8C0CC",      // placeholders, disabled
  line: "#E7EAF0",       // borders
  lineSoft: "#F1F3F7",   // subtle dividers
  surface: "#FFFFFF",
  canvas: "#F6F8FC",     // page background
  brand: "#4F46E5",      // primary action
  brand2: "#818CF8",
  brandDeep: "#3730A3",
  good: "#059669",
  goodBg: "#DCFCE7",
  bad: "#E11D48",
  badBg: "#FFE4E6",
  warn: "#D97706",
  warnBg: "#FEF3C7",
  info: "#0284C7",
  violet: "#7C3AED",
};

const SHADOW = {
  sm: "0 1px 2px rgba(20,27,45,0.05), 0 1px 3px rgba(20,27,45,0.04)",
  md: "0 2px 4px rgba(20,27,45,0.04), 0 6px 16px rgba(20,27,45,0.07)",
  lg: "0 4px 8px rgba(20,27,45,0.05), 0 16px 40px rgba(20,27,45,0.11)",
  xl: "0 8px 16px rgba(20,27,45,0.07), 0 32px 64px rgba(20,27,45,0.16)",
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  page: { minHeight: "100vh", background: C.canvas, fontFamily: FONT, color: C.ink, colorScheme: "light" },
  nav: {
    background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
    borderBottom: `1px solid ${C.line}`, padding: "0 1.5rem", display: "flex", alignItems: "center",
    gap: "1rem", height: 62, position: "sticky", top: 0, zIndex: 100
  },
  navBrand: { fontWeight: 800, fontSize: 16, color: C.ink, cursor: "pointer", lineHeight: 1.15, letterSpacing: "-0.02em" },
  navSub: { fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: "0.02em" },
  cont: { maxWidth: 1040, margin: "0 auto", padding: "2rem 1.5rem 4rem" },

  btn: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
    padding: "11px 20px", borderRadius: 11, border: "1.5px solid transparent", cursor: "pointer",
    fontSize: 14, fontWeight: 700, fontFamily: FONT, letterSpacing: "-0.01em",
    transition: "transform 0.15s cubic-bezier(.34,1.56,.64,1), box-shadow 0.15s, background 0.15s, border-color 0.15s, color 0.15s",
    lineHeight: 1.2,
  },
  btnPrimary: { background: `linear-gradient(135deg, ${C.brand} 0%, ${C.brandDeep} 100%)`, color: "#fff", boxShadow: "0 2px 8px rgba(79,70,229,0.28)" },
  btnOutline: { background: C.surface, color: C.ink, borderColor: C.line, boxShadow: SHADOW.sm },
  btnGhost: { background: "transparent", color: C.body, borderColor: "transparent" },
  btnSm: { padding: "8px 14px", fontSize: 13, borderRadius: 9 },
  btnLg: { padding: "14px 28px", fontSize: 15, borderRadius: 13 },
  btnSuccess: { background: `linear-gradient(135deg, #10B981 0%, ${C.good} 100%)`, color: "#fff", boxShadow: "0 2px 8px rgba(5,150,105,0.28)" },
  btnDanger: { background: `linear-gradient(135deg, #F43F5E 0%, ${C.bad} 100%)`, color: "#fff", boxShadow: "0 2px 8px rgba(225,29,72,0.28)" },

  card: { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: "1.5rem", boxShadow: SHADOW.sm },
  input: {
    width: "100%", padding: "12px 14px", borderRadius: 11, border: `1.5px solid ${C.line}`, fontSize: 14,
    outline: "none", boxSizing: "border-box", fontFamily: FONT, color: C.ink, background: C.surface,
    transition: "border-color 0.15s, box-shadow 0.15s", fontWeight: 500,
  },
  label: { fontSize: 11, fontWeight: 800, color: C.muted, display: "block", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" },
  modal: { position: "fixed", inset: 0, background: "rgba(20,27,45,0.55)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: "1rem", animation: "bqcFade .2s ease" },
  modalBox: { background: C.surface, borderRadius: 22, padding: "2rem", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: SHADOW.xl, animation: "bqcPop .28s cubic-bezier(.34,1.56,.64,1)" },
  badge: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "4px 10px", borderRadius: 20, fontWeight: 800, letterSpacing: "0.01em" },
  optBtn: {
    display: "block", width: "100%", textAlign: "left", padding: "14px 16px", borderRadius: 13,
    border: `1.5px solid ${C.line}`, background: C.surface, cursor: "pointer", fontSize: 14.5,
    marginBottom: 10, transition: "all 0.15s", color: C.ink, fontFamily: FONT, lineHeight: 1.5, fontWeight: 500,
  },
  progress: { background: C.lineSoft, borderRadius: 99, height: 8, overflow: "hidden" },
  th: { padding: "11px 14px", textAlign: "left", background: C.canvas, borderBottom: `1px solid ${C.line}`, fontWeight: 800, fontSize: 11, color: C.muted, whiteSpace: "nowrap", letterSpacing: "0.05em", textTransform: "uppercase" },
  td: { padding: "11px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13.5, verticalAlign: "middle", color: C.body },
  tabBtn: (active) => ({
    padding: "10px 18px", borderRadius: 11, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 700,
    fontFamily: FONT, transition: "all .15s",
    background: active ? C.ink : "transparent", color: active ? "#fff" : C.muted,
    boxShadow: active ? SHADOW.md : "none",
  }),
  h1: { margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", color: C.ink, lineHeight: 1.15 },
  h2: { margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", color: C.ink, lineHeight: 1.25 },
  h3: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", color: C.ink, lineHeight: 1.3 },
  eyebrow: { fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, margin: 0 },
  sub: { margin: 0, color: C.body, fontSize: 14.5, lineHeight: 1.6, fontWeight: 500 },
};

// Global stylesheet: resets, keyframes, focus rings, hover lift, reduced-motion guard.
const GLOBAL_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  button { font-family: ${FONT}; }
  button:not(:disabled):hover { transform: translateY(-1px); }
  button:not(:disabled):active { transform: translateY(0); }
  button:disabled { opacity: .45; cursor: not-allowed !important; }
  :focus-visible { outline: 3px solid rgba(79,70,229,.45); outline-offset: 2px; border-radius: 8px; }
  input:focus, select:focus, textarea:focus { border-color: ${C.brand} !important; box-shadow: 0 0 0 4px rgba(79,70,229,.13); }
  ::selection { background: rgba(79,70,229,.22); }
  ::-webkit-scrollbar { width: 11px; height: 11px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #D3D9E3; border-radius: 99px; border: 3px solid ${C.canvas}; }
  ::-webkit-scrollbar-thumb:hover { background: #B8C0CC; }

  @keyframes bqcFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes bqcPop { from { opacity: 0; transform: scale(.94) translateY(12px) } to { opacity: 1; transform: none } }
  @keyframes bqcRise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
  @keyframes bqcSlideIn { from { opacity: 0; transform: translateX(-10px) } to { opacity: 1; transform: none } }
  @keyframes bqcFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-9px) } }
  @keyframes bqcSpin { to { transform: rotate(360deg) } }
  @keyframes bqcPulseRing { 0% { transform: scale(.9); opacity: .7 } 70% { transform: scale(1.25); opacity: 0 } 100% { opacity: 0 } }
  @keyframes bqcShimmer { 0% { background-position: -600px 0 } 100% { background-position: 600px 0 } }

  .bqc-rise { animation: bqcRise .5s cubic-bezier(.22,1,.36,1) both; }
  .bqc-lift { transition: transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .2s; }
  .bqc-lift:hover { transform: translateY(-4px); box-shadow: ${SHADOW.lg}; }

  /* Grid/flex children default to min-width:auto, so a long unbreakable label
     inside one can force the whole page wider than the viewport. */
  .bqc-progress-hero > * { min-width: 0; }

  /* Module cards: all 4 in a single row on desktop -- narrower + taller
     rather than wrapping to two rows. */
  .bqc-module-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
  @media (max-width: 780px) {
    .bqc-module-grid { grid-template-columns: repeat(2, 1fr); gap: 1.1rem; }
  }
  @media (max-width: 460px) {
    .bqc-module-grid { grid-template-columns: 1fr; }
  }

  @media (max-width: 860px) {
    .bqc-progress-hero { grid-template-columns: 1fr !important; }
  }
  @media (max-width: 560px) {
    .bqc-hide-sm { display: none !important; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .001ms !important; animation-iteration-count: 1 !important;
      transition-duration: .001ms !important; scroll-behavior: auto !important;
    }
  }
`;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
// Deterministic shuffle - same seed gives same order (used within a single render, e.g. MCQ option order)
function seededShuffle(array, seed) {
  if (!array || array.length === 0) return [];
  const arr = [...array];
  const seedStr = String(seed || "default");
  let s = 0;
  for (let i = 0; i < seedStr.length; i++) {
    s = ((s << 5) - s + seedStr.charCodeAt(i)) | 0;
  }
  s = Math.abs(s) || 1;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    const temp = arr[i]; arr[i] = arr[j]; arr[j] = temp;
  }
  return arr;
}

// True random shuffle - used when assembling a fresh practice attempt
function randomShuffle(array) {
  const arr = [...(array || [])];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function calcScore(questions, answers) {
  if (!questions || !questions.length) return null;
  let correct = 0;
  questions.forEach(q => {
    if (calcQuestionCorrect(q, answers[q.id])) correct++;
  });
  return { correct, total: questions.length, pct: Math.round((correct / questions.length) * 100) };
}

// numeric-entry: a null tolerance means "use the default" -- 2, read as a percent.
const NUMERIC_DEFAULT_TOLERANCE = 2;

// Turn whatever a student typed into a Number. Accepts a plain decimal
// (0.0056, -2.5, .5, 4250), native exponent form (5.6e-3, 6.02E23) and
// scientific notation written out with x / * / unicode times and an optional
// caret: "5.6 x 10^-3", "5.6*10**-3", "5.6 x 10 -3", "5.6 × 10⁻³", "10^5".
// The exact numeric value is what gets graded, so 0.0056 and 5.6e-3 and
// 5.6×10⁻³ all score identically. Anything ambiguous or incomplete returns
// NaN -- callers treat that as "no valid answer" and the field says so rather
// than guessing.
const SUPERSCRIPTS = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "-",
};
function parseNumericInput(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  s = s
    .replace(/[   ]/g, " ")                       // odd spaces -> space
    .replace(/[−–—]/g, "-")                       // minus / dashes -> hyphen
    .replace(/[×✕✖∗⋅∙]/g, "x")     // ×, ✕, ∗, ⋅, ∙ -> x
    .replace(/,/g, "");                                          // strip thousands separators
  // Superscript exponent digits:  10⁻³ -> 10^-3
  s = s.replace(/[⁰¹²³⁴-⁹⁺⁻]+/g, m =>
    "^" + m.split("").map(ch => SUPERSCRIPTS[ch] || "").join(""));
  s = s.replace(/\^\s*\^/g, "^").replace(/\s*([-+x*^e])\s*/gi, "$1");
  if (/\d\s+\d/.test(s)) return NaN;   // a stray gap between digits is a typo, not notation
  s = s.replace(/\s+/g, "");
  if (!s) return NaN;
  // Plain decimal, optionally with a native exponent.
  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return Number(s);
  // Mantissa, then x or *, then 10, then an optional ^ / ** / e, then the exponent.
  let m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+))(?:x|\*)10(?:\^|\*\*|e)?([+-]?\d+)$/i);
  if (m) return Number(m[1]) * Math.pow(10, Number(m[2]));
  // Bare power of ten, mantissa 1 implied:  10^5,  x10^-3
  m = s.match(/^(?:x|\*)?10(?:\^|\*\*|e)?([+-]?\d+)$/i);
  if (m) return Math.pow(10, Number(m[1]));
  return NaN;
}

// A tidy, faithful readout of a parsed value for the "Interpreted as" echo:
// plain decimal for human-sized numbers, m x 10^n (as LaTeX) for the extremes.
function formatParsedEcho(n) {
  if (!isFinite(n)) return null;
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e-4 && abs < 1e7) return Number(n.toPrecision(12)).toString();
  const exp = Math.floor(Math.log10(abs));
  const mant = Number((n / Math.pow(10, exp)).toPrecision(12)).toString();
  return `$${mant} \\times 10^{${exp}}$`;
}

function numericMatches(q, ans) {
  const target = Number(q.answer);
  const val = parseNumericInput(ans);
  if (!isFinite(target) || !isFinite(val)) return false;
  const mode = q.tolerance_mode === "absolute" ? "absolute" : "relative";
  const tol = q.tolerance == null || q.tolerance === "" ? NUMERIC_DEFAULT_TOLERANCE : Number(q.tolerance);
  if (!isFinite(tol) || tol < 0) return val === target;
  if (mode === "absolute") return Math.abs(val - target) <= tol;
  // Relative tolerance around 0 can only ever match 0 exactly -- authors are told
  // to use "absolute" for zero-valued answers.
  return Math.abs(val - target) <= Math.abs(target) * (tol / 100);
}

function calcQuestionCorrect(q, ans) {
  if (ans === undefined || ans === null) return false;
  if (q.type === "multiple-choice" || q.type === "true-false") return ans === q.answer;
  if (q.type === "word-bank") {
    const answerArr = Array.isArray(q.answer) ? q.answer : [q.answer];
    const ansArr = Array.isArray(ans) ? ans : [ans];
    return answerArr.every((a, i) => ansArr[i] === a);
  }
  if (q.type === "drag-drop") return q.pairs && q.pairs.every(p => ans && ans[p.item] === p.match);
  if (q.type === "ordering") return Array.isArray(ans) && q.answer.every((a, i) => ans[i] === a);
  if (q.type === "numeric-entry") return numericMatches(q, ans);
  return false;
}

function hasAnswer(q, ans) {
  if (ans === undefined || ans === null) return false;
  if (q.type === "word-bank") {
    const answerArr = Array.isArray(q.answer) ? q.answer : [q.answer];
    const ansArr = Array.isArray(ans) ? ans : [ans];
    return ansArr.filter(Boolean).length >= answerArr.length;
  }
  if (q.type === "drag-drop") return q.pairs && q.pairs.some(p => ans[p.item]);
  if (q.type === "ordering") return Array.isArray(ans) && ans.length > 0;
  if (q.type === "numeric-entry") return String(ans).trim() !== "" && isFinite(parseNumericInput(ans));
  return true;
}

function formatCorrectAnswer(q) {
  if (q.type === "word-bank" && Array.isArray(q.answer)) return q.answer.join(", ");
  if (q.type === "drag-drop") return (q.pairs || []).map(p => `${p.item} → ${p.match}`).join(", ");
  if (q.type === "ordering") return (q.answer || []).join(" → ");
  if (q.type === "numeric-entry") return q.unit ? `${q.answer} ${q.unit}` : String(q.answer);
  return String(q.answer);
}

// ─── RICH TEXT (KaTeX) ────────────────────────────────────────────────────────
// Splits a string on $...$ (inline) and $$...$$ (display) and renders the maths
// segments with KaTeX; everything else is plain text. Used for every prompt,
// option, word-bank tile, ordering row, unit and answer readout in the app.
function renderRich(text) {
  let str = String(text ?? "");
  if (!str) return null;
  if (str.indexOf("$") === -1) {
    // No delimiters. If the whole string still carries LaTeX markup -- a
    // backslash command, sub/superscripts, braces -- treat it as one inline
    // maths span (covers units like "m s^{-1}" or "\Omega" written without $).
    // Otherwise it is plain prose, return as-is.
    if (!/\\[a-zA-Z]|[\^_]\{|[\^_][a-zA-Z0-9]/.test(str)) return str;
    str = `$${str}$`;
  }
  const parts = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0, m, key = 0;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) parts.push(str.slice(last, m.index));
    const display = m[1] != null;
    const tex = display ? m[1] : m[2];
    try {
      const html = katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "html" });
      parts.push(
        <span
          key={`k${key++}`}
          style={display ? { display: "block", margin: "8px 0", overflowX: "auto" } : undefined}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } catch {
      parts.push(m[0]);
    }
    last = re.lastIndex;
  }
  if (last < str.length) parts.push(str.slice(last));
  return parts;
}

// Score ramp: rose -> amber -> emerald. Returns a solid hue plus tinted bg/text/border.
const SCORE_STOPS = [
  { at: 0, rgb: [225, 29, 72] },    // rose
  { at: 50, rgb: [245, 158, 11] },  // amber
  { at: 75, rgb: [132, 204, 22] },  // lime
  { at: 100, rgb: [5, 150, 105] },  // emerald
];

function scoreRgb(pct) {
  const p = Math.max(0, Math.min(100, pct));
  let lo = SCORE_STOPS[0], hi = SCORE_STOPS[SCORE_STOPS.length - 1];
  for (let i = 0; i < SCORE_STOPS.length - 1; i++) {
    if (p >= SCORE_STOPS[i].at && p <= SCORE_STOPS[i + 1].at) { lo = SCORE_STOPS[i]; hi = SCORE_STOPS[i + 1]; break; }
  }
  const span = hi.at - lo.at || 1;
  const t = (p - lo.at) / span;
  return lo.rgb.map((v, i) => Math.round(v + (hi.rgb[i] - v) * t));
}

function gradientColor(pct) {
  if (pct === null || pct === undefined) return { bg: C.lineSoft, text: C.faint, border: C.line, solid: C.faint };
  const [r, g, b] = scoreRgb(pct);
  return {
    bg: `rgba(${r},${g},${b},0.13)`,
    text: `rgb(${Math.round(r * 0.72)},${Math.round(g * 0.62)},${Math.round(b * 0.66)})`,
    border: `rgba(${r},${g},${b},0.38)`,
    solid: `rgb(${r},${g},${b})`,
  };
}

// ─── ANIMATION HELPERS ────────────────────────────────────────────────────────
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Flips to true one frame after mount, so CSS transitions animate from their
// initial value instead of snapping straight to the final one.
function useMounted(delay = 60) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return on;
}

// Counts from 0 up to `target` with an ease-out curve.
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const end = Number(target) || 0;
    if (prefersReducedMotion()) { setVal(end); return; }
    let raf = null, start = null, done = false;
    // Safety net: requestAnimationFrame is paused while a tab is hidden or not
    // compositing, which would otherwise leave the figure stuck on 0. setTimeout
    // still fires there, so the real number always lands even without animation.
    const fallback = setTimeout(() => { if (!done) setVal(end); }, duration + 300);
    const step = (ts) => {
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      setVal(end * (1 - Math.pow(1 - p, 3)));
      if (p < 1) { raf = requestAnimationFrame(step); }
      else { done = true; clearTimeout(fallback); }
    };
    raf = requestAnimationFrame(step);
    return () => { if (raf) cancelAnimationFrame(raf); clearTimeout(fallback); };
  }, [target, duration]);
  return val;
}

// Question pool for a given scope -- every question in the bank is usable
function poolForScope(questions, scopeType, scopeId) {
  if (scopeType === "inquiry") return questions.filter(q => q.inquiry_id === scopeId);
  if (scopeType === "module") return questions.filter(q => q.module_id === scopeId);
  if (scopeType === "year") {
    // scopeId carries the student's course year ("11"/"12") so a mixed quiz
    // never draws from a year the student hasn't been taught.
    const ids = new Set(modulesForYear(scopeId).map(m => m.id));
    return questions.filter(q => ids.has(q.module_id));
  }
  return [];
}

function buildAttemptQuestions(pool, count) {
  const n = Math.min(count, pool.length);
  return randomShuffle(pool).slice(0, n);
}

// ─── PROGRESS ANALYTICS ───────────────────────────────────────────────────────
// Every attempt stores the full question snapshot, so performance can be broken
// down per syllabus area (inquiry question) no matter which scope was practised
// -- a whole-year quiz still credits each individual area it touched.
const MIN_SAMPLE = 5; // questions needed in an area before we call it a strength/weakness

function emptyBucket() { return { attempted: 0, correct: 0, sessions: 0, lastAt: null, timeline: [] }; }

function computeAnalytics(attempts, modules = MODULE_DEFS) {
  const chronological = [...(attempts || [])].sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));

  const byInquiry = {};
  const byModule = {};
  const series = [];
  const dayKeys = new Set();
  let totalAttempted = 0, totalCorrect = 0;

  for (const a of chronological) {
    const snapshot = Array.isArray(a.question_snapshot) ? a.question_snapshot : [];
    const answers = a.answers || {};
    const at = new Date(a.submitted_at);
    const touchedInquiries = new Set();
    const touchedModules = new Set();
    let sessionAttempted = 0, sessionCorrect = 0;

    for (const q of snapshot) {
      if (!q || !q.id) continue;
      const ans = answers[q.id];
      if (!hasAnswer(q, ans)) continue; // unanswered questions are excluded, matching how attempts are scored
      const ok = calcQuestionCorrect(q, ans);
      const iq = q.inquiry_id, mod = q.module_id;

      if (iq) {
        if (!byInquiry[iq]) byInquiry[iq] = emptyBucket();
        byInquiry[iq].attempted++;
        if (ok) byInquiry[iq].correct++;
        byInquiry[iq].lastAt = at;
        byInquiry[iq].timeline.push(ok ? 1 : 0);
        touchedInquiries.add(iq);
      }
      if (mod) {
        if (!byModule[mod]) byModule[mod] = emptyBucket();
        byModule[mod].attempted++;
        if (ok) byModule[mod].correct++;
        byModule[mod].lastAt = at;
        touchedModules.add(mod);
      }
      sessionAttempted++;
      if (ok) sessionCorrect++;
    }

    touchedInquiries.forEach(id => { byInquiry[id].sessions++; });
    touchedModules.forEach(id => { byModule[id].sessions++; });

    if (sessionAttempted > 0) {
      totalAttempted += sessionAttempted;
      totalCorrect += sessionCorrect;
      dayKeys.add(at.toDateString());
      series.push({
        id: a.id,
        at,
        attempted: sessionAttempted,
        correct: sessionCorrect,
        accuracy: Math.round((sessionCorrect / sessionAttempted) * 100),
        scopeType: a.scope_type,
        scopeId: a.scope_id,
        modules: [...touchedModules],
        cumulativeAccuracy: Math.round((totalCorrect / totalAttempted) * 100),
      });
    }
  }

  const finalise = (bucket) => ({
    ...bucket,
    accuracy: bucket.attempted ? Math.round((bucket.correct / bucket.attempted) * 100) : null,
  });
  Object.keys(byInquiry).forEach(k => { byInquiry[k] = finalise(byInquiry[k]); });
  Object.keys(byModule).forEach(k => { byModule[k] = finalise(byModule[k]); });

  // Trend within an area: accuracy over the most recent half vs the earlier half.
  Object.keys(byInquiry).forEach(k => {
    const tl = byInquiry[k].timeline;
    if (tl.length >= 8) {
      const mid = Math.floor(tl.length / 2);
      const early = tl.slice(0, mid), late = tl.slice(mid);
      const eAcc = Math.round((early.reduce((s, v) => s + v, 0) / early.length) * 100);
      const lAcc = Math.round((late.reduce((s, v) => s + v, 0) / late.length) * 100);
      byInquiry[k].delta = lAcc - eAcc;
      byInquiry[k].earlyAccuracy = eAcc;
      byInquiry[k].lateAccuracy = lAcc;
    } else {
      byInquiry[k].delta = null;
    }
  });

  // Every syllabus area in the student's own course year, including ones never
  // practised (so gaps are visible) -- never the other year's, so a Year 11
  // student isn't shown "8 areas not started" for Year 12 content they haven't
  // been taught yet.
  const areas = [];
  for (const m of modules) {
    for (const inq of m.inquiries) {
      const b = byInquiry[inq.id] || { ...emptyBucket(), accuracy: null, delta: null };
      areas.push({
        id: inq.id, title: inq.title, question: inq.question,
        moduleId: m.id, moduleTitle: m.title, color: m.color, color2: m.color2, icon: m.icon,
        ...b,
      });
    }
  }

  const rated = areas.filter(a => a.attempted >= MIN_SAMPLE);
  const strengths = [...rated].sort((a, b) => b.accuracy - a.accuracy).slice(0, 3);
  const focus = [...rated].sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
  const untouched = areas.filter(a => a.attempted === 0);
  const improved = [...areas].filter(a => a.delta !== null && a.delta > 0).sort((a, b) => b.delta - a.delta);

  return {
    totalAttempted, totalCorrect,
    accuracy: totalAttempted ? Math.round((totalCorrect / totalAttempted) * 100) : null,
    sessionCount: series.length,
    daysPractised: dayKeys.size,
    streak: computeStreak(dayKeys),
    areas, byModule, series,
    strengths, focus, untouched,
    mostImproved: improved[0] || null,
    hasEnoughForInsights: rated.length >= 2,
  };
}

// Consecutive days of practice, counting back from today (or yesterday, so a
// streak isn't "broken" just because today's session hasn't happened yet).
function computeStreak(dayKeys) {
  if (!dayKeys.size) return 0;
  const has = (d) => dayKeys.has(d.toDateString());
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!has(cursor)) {
    cursor.setDate(cursor.getDate() - 1);
    if (!has(cursor)) return 0;
  }
  let streak = 0;
  while (has(cursor)) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

function scopeLabelFor(scopeType, scopeId) {
  if (scopeType === "year") return (scopeId === "11" || scopeId === "12") ? `Year ${scopeId} Mix` : "Whole Year Mix";
  if (scopeType === "module") { const m = findModule(scopeId); return m ? moduleLabel(m) : scopeId; }
  const inq = findInquiry(scopeId);
  return inq ? `${inq.id} ${inq.title}` : scopeId;
}

function relativeDay(date) {
  if (!date) return "—";
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - d) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  if (diff < 14) return "Last week";
  if (diff < 60) return `${Math.floor(diff / 7)} weeks ago`;
  return `${Math.floor(diff / 30)} months ago`;
}

// ─── SUPABASE DATA HOOKS ──────────────────────────────────────────────────────
function useQuestions() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { reload(); }, []);

  const reload = async () => {
    setLoading(true);
    // Supabase/PostgREST caps a single response at 1000 rows by default. The
    // bank is well past that now, so page through in fixed-size chunks until
    // a page comes back short (the reliable signal we've reached the end) --
    // don't rely on knowing the exact PostgREST limit here.
    const PAGE_SIZE = 1000;
    let all = [];
    let error = null;
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error: pageError } = await supabase
        .from("questions")
        .select("*")
        .order("created_at", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (pageError) { error = pageError; break; }
      all = all.concat(data || []);
      if (!data || data.length < PAGE_SIZE) break;
    }
    const data = all;
    if (error) { console.error("Load questions error:", error); setLoading(false); return; }
    setQuestions(data || []);
    setLoading(false);
  };

  const addQuestion = async (moduleId, inquiryId, q) => {
    const row = {
      module_id: moduleId, inquiry_id: inquiryId, type: q.type, prompt: q.prompt, image: q.image || "",
      options: q.options || null, bank: q.bank || null, pairs: q.pairs || null, items: q.items || null,
      answer: q.answer, hint: q.hint || null,
      tolerance: q.tolerance == null || q.tolerance === "" ? null : Number(q.tolerance),
      tolerance_mode: q.tolerance_mode || null, unit: q.unit || null
    };
    const { data, error } = await supabase.from("questions").insert(row).select().single();
    if (error) { console.error("Add question error:", error); return null; }
    setQuestions(prev => [...prev, data]);
    return data;
  };

  const addQuestionsBulk = async (moduleId, inquiryId, list) => {
    const rows = list.map(q => ({
      module_id: moduleId, inquiry_id: inquiryId, type: q.type, prompt: q.prompt, image: q.image || "",
      options: q.options || null, bank: q.bank || null, pairs: q.pairs || null, items: q.items || null,
      answer: q.answer, hint: q.hint || null,
      tolerance: q.tolerance == null || q.tolerance === "" ? null : Number(q.tolerance),
      tolerance_mode: q.tolerance_mode || null, unit: q.unit || null
    }));
    const { data, error } = await supabase.from("questions").insert(rows).select();
    if (error) { console.error("Bulk add questions error:", error); return false; }
    setQuestions(prev => [...prev, ...(data || [])]);
    return true;
  };

  const updateQuestion = async (id, updates) => {
    const dbUpdates = { ...updates, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("questions").update(dbUpdates).eq("id", id);
    if (error) { console.error("Update question error:", error); return; }
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const deleteQuestion = async (id) => {
    const { error } = await supabase.from("questions").delete().eq("id", id);
    if (error) { console.error("Delete question error:", error); return; }
    await supabase.from("question_flags").delete().eq("question_id", id);
    setQuestions(prev => prev.filter(q => q.id !== id));
  };

  return { questions, loading, addQuestion, addQuestionsBulk, updateQuestion, deleteQuestion, reload };
}

function useUsers() {
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("users").select("*");
    if (!error && data) {
      const obj = {};
      data.forEach(u => {
        obj[u.code] = {
          name: u.name,
          className: u.class_name || "",
          year: u.year || "",
          createdAt: u.created_at ? new Date(u.created_at).getTime() : Date.now()
        };
      });
      setUsers(obj);
    }
    setLoading(false);
  };

  const addUser = async (code, info) => {
    const { error } = await supabase.from("users").insert({
      code, name: info.name, class_name: info.className || null, year: info.year || null
    });
    if (error) { console.error("Add user error:", error); return false; }
    setUsers(p => ({ ...p, [code]: { ...info, createdAt: Date.now() } }));
    return true;
  };

  const addUsersBulk = async (records) => {
    const rows = records.map(r => ({
      code: r.code, name: r.name, class_name: r.className || null, year: r.year || null
    }));
    const { error } = await supabase.from("users").insert(rows);
    if (error) { console.error("Bulk insert error:", error); return false; }
    await loadUsers();
    return true;
  };

  const removeUser = async (code) => {
    await supabase.from("attempts").delete().eq("user_code", code);
    const { error } = await supabase.from("users").delete().eq("code", code);
    if (error) { console.error("Remove user error:", error); return; }
    setUsers(p => { const n = { ...p }; delete n[code]; return n; });
  };

  const removeUsersBulk = async (codes) => {
    if (!codes || codes.length === 0) return;
    for (const code of codes) {
      await supabase.from("attempts").delete().eq("user_code", code);
    }
    const { error } = await supabase.from("users").delete().in("code", codes);
    if (error) { console.error("Bulk remove error:", error); return; }
    setUsers(p => { const n = { ...p }; codes.forEach(c => delete n[c]); return n; });
  };

  return { users, loading, addUser, addUsersBulk, removeUser, removeUsersBulk, reload: loadUsers };
}

function useMyAttempts(userCode) {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!userCode) return;
    setLoading(true);
    const { data, error } = await supabase.from("attempts").select("*").eq("user_code", userCode).order("submitted_at", { ascending: false });
    if (!error && data) setAttempts(data);
    setLoading(false);
  };

  useEffect(() => { reload(); }, [userCode]);

  return { attempts, loading, reload };
}

function useAllAttempts() {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("attempts").select("*").order("submitted_at", { ascending: false });
    if (!error && data) setAttempts(data);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  return { attempts, loading, reload };
}

// Class- or year-scoped leaderboard: ranked by total questions ever answered
// correctly (no penalty for wrong answers -- purely a "how much have you got
// right" count, so more practice always helps rather than risking your rank).
// `scope` is either { type: "class", className } or { type: "year", year }.
function useLeaderboard(scope) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!scope || (scope.type === "class" && !scope.className) || (scope.type === "year" && !scope.year)) {
      setRows([]); setLoading(false); return;
    }
    setLoading(true);

    let peers;
    if (scope.type === "class") {
      const { data, error } = await supabase.from("users").select("code,name").eq("class_name", scope.className);
      if (error || !data) { setRows([]); setLoading(false); return; }
      peers = data;
    } else {
      const { data, error } = await supabase.from("users").select("code,name,year");
      if (error || !data) { setRows([]); setLoading(false); return; }
      peers = data.filter(u => normalizedYear(u.year) === scope.year);
    }
    if (!peers.length) { setRows([]); setLoading(false); return; }

    const codes = peers.map(u => u.code);
    const { data: attempts, error: aErr } = await supabase.from("attempts").select("user_code,correct").in("user_code", codes);
    if (aErr) { setRows([]); setLoading(false); return; }

    const totals = {};
    (attempts || []).forEach(a => { totals[a.user_code] = (totals[a.user_code] || 0) + (a.correct || 0); });

    const ranked = peers
      .map(u => ({ code: u.code, name: u.name, correct: totals[u.code] || 0 }))
      .sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name));

    // Competition ranking (1, 2, 2, 4 ...) so ties share a place.
    let rank = 0, lastScore = null;
    ranked.forEach((r, i) => {
      if (r.correct !== lastScore) { rank = i + 1; lastScore = r.correct; }
      r.rank = rank;
    });

    setRows(ranked);
    setLoading(false);
  };

  useEffect(() => { reload(); }, [scope?.type, scope?.className, scope?.year]);

  return { rows, loading, reload };
}

function useFlags() {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("question_flags").select("*").order("created_at", { ascending: false });
    if (!error && data) setFlags(data);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const addFlag = async (questionId, userCode, reasons) => {
    const { error } = await supabase.from("question_flags").insert({ question_id: questionId, user_code: userCode, reasons });
    if (error) { console.error("Add flag error:", error); return; }
    await reload();
  };

  const resolveFlag = async (id) => {
    const { error } = await supabase.from("question_flags").update({ resolved: true }).eq("id", id);
    if (error) { console.error("Resolve flag error:", error); return; }
    setFlags(prev => prev.map(f => f.id === id ? { ...f, resolved: true } : f));
  };

  return { flags, loading, addFlag, resolveFlag, reload };
}

// Admin password lives in Supabase (app_settings table) so it can be changed at
// runtime instead of being hardcoded. Falls back to ADMIN_PASSWORD if the table
// hasn't been created yet (see admin_password_setup.sql).
function useAdminSettings() {
  const [adminPassword, setAdminPassword] = useState(null);
  const [loading, setLoading] = useState(true);
  const [migrationMissing, setMigrationMissing] = useState(false);

  const reload = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("app_settings").select("admin_password").eq("id", 1).single();
    if (error || !data) {
      setAdminPassword(ADMIN_PASSWORD);
      setMigrationMissing(true);
    } else {
      setAdminPassword(data.admin_password);
      setMigrationMissing(false);
    }
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const updatePassword = async (newPassword) => {
    const { error } = await supabase.from("app_settings").update({ admin_password: newPassword, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) { console.error("Update admin password error:", error); return false; }
    setAdminPassword(newPassword);
    return true;
  };

  return { adminPassword, loading, migrationMissing, updatePassword, reload };
}

// ─── IMAGE MODAL / QUESTION IMAGE ─────────────────────────────────────────────
function ImageModal({ src, onClose }) {
  return (
    <div style={S.modal} onClick={onClose}>
      <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>
        <img src={src} alt="Enlarged" style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 12, display: "block" }} />
        <button onClick={onClose}
          style={{ position: "absolute", top: 12, right: 12, width: 40, height: 40, borderRadius: "50%", background: "#fff", border: "none", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
          ✕
        </button>
      </div>
    </div>
  );
}

function QuestionImage({ src }) {
  const [modalOpen, setModalOpen] = useState(false);
  if (!src) return null;
  return (
    <>
      <img
        src={src}
        alt="Question visual"
        onClick={() => setModalOpen(true)}
        style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 8, marginBottom: 14, cursor: "pointer", transition: "opacity 0.2s", border: `1px solid ${C.line}` }}
        onMouseEnter={e => e.target.style.opacity = "0.85"}
        onMouseLeave={e => e.target.style.opacity = "1"}
      />
      <p style={{ fontSize: 11, color: "#aaa", margin: "0 0 8px", textAlign: "center" }}>Click image to enlarge</p>
      {modalOpen && <ImageModal src={src} onClose={() => setModalOpen(false)} />}
    </>
  );
}

// ─── QUESTION RENDERERS ───────────────────────────────────────────────────────
function MCQ({ q, ans, setAns, revealed, seed }) {
  const fallbackOptions = q.type === "true-false" ? ["True", "False"] : [];
  const shuffledOptions = seededShuffle(q.options?.length ? q.options : fallbackOptions, seed || "default");
  return (
    <>
      <QuestionImage src={q.image} />
      {shuffledOptions.map((opt, i) => {
        let bg = C.surface, border = C.line, col = C.ink, mark = null, markCol = C.faint;
        if (ans === opt && !revealed) { bg = "rgba(79,70,229,.07)"; border = C.brand; }
        if (revealed) {
          if (opt === q.answer) { bg = C.goodBg; border = C.good; col = "#065F46"; mark = "✓"; markCol = C.good; }
          else if (ans === opt) { bg = C.badBg; border = C.bad; col = "#9F1239"; mark = "✗"; markCol = C.bad; }
          else { col = C.muted; }
        }
        return (
          <button key={`${opt}-${i}`} disabled={revealed} onClick={() => setAns(opt)}
            style={{
              ...S.optBtn, background: bg, borderColor: border, color: col,
              fontWeight: ans === opt || (revealed && opt === q.answer) ? 700 : 500,
              display: "flex", alignItems: "center", gap: 12, opacity: revealed && opt !== q.answer && ans !== opt ? 0.6 : 1,
            }}>
            <span style={{
              width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: bg === C.surface ? C.lineSoft : "rgba(255,255,255,.65)",
              color: markCol === C.faint ? C.muted : markCol, fontSize: 12.5, fontWeight: 800,
            }}>
              {mark || String.fromCharCode(65 + i)}
            </span>
            <span style={{ flex: 1 }}>{renderRich(opt)}</span>
          </button>
        );
      })}
    </>
  );
}

// Word Bank supports 1-3 blanks (marked "___" in the prompt, in order). Legacy
// single-blank questions store `answer` as a plain string; multi-blank ones
// store it as an array in blank order -- normalised to an array internally so
// both shapes render identically.
function WordBank({ q, ans, setAns, revealed, seed }) {
  const [dragging, setDragging] = useState(null);
  const bank = seededShuffle(q.bank || [], seed || "default");
  const answerArr = Array.isArray(q.answer) ? q.answer : [q.answer];
  const promptParts = q.prompt.split("___");
  const blanksCount = promptParts.length - 1;
  const placed = Array.isArray(ans) ? ans : (ans != null ? [ans] : []);

  const placeWord = (word, blankIdx) => {
    if (revealed) return;
    const next = [...placed];
    while (next.length < blanksCount) next.push(null);
    const existingIdx = next.indexOf(word);
    if (existingIdx !== -1) next[existingIdx] = null; // moving a word frees its old blank
    next[blankIdx] = word;
    setAns(next);
  };

  const clearBlank = blankIdx => {
    if (revealed) return;
    const next = [...placed];
    next[blankIdx] = null;
    setAns(next);
  };

  const clickBankWord = word => {
    if (revealed || placed.includes(word)) return; // remove via clicking the blank itself, not the bank tile
    const next = [...placed];
    while (next.length < blanksCount) next.push(null);
    const emptyIdx = next.findIndex(w => !w);
    if (emptyIdx === -1) return;
    next[emptyIdx] = word;
    setAns(next);
  };

  const allCorrect = revealed && answerArr.every((a, i) => placed[i] === a);

  return (
    <div>
      <QuestionImage src={q.image} />
      <div style={{ fontSize: 16.5, lineHeight: 2, marginBottom: 20, padding: "18px 20px", background: C.canvas, borderRadius: 14, border: `1px solid ${C.line}`, color: C.ink, fontWeight: 500 }}>
        {promptParts.map((part, i) => {
          const word = placed[i];
          const ok = revealed && word === answerArr[i];
          const bad = revealed && word && word !== answerArr[i];
          return (
            <Fragment key={i}>
              {renderRich(part)}
              {i < blanksCount && (
                <span onDragOver={e => e.preventDefault()} onDrop={() => { if (dragging) { placeWord(dragging, i); setDragging(null); } }}
                  onClick={word && !revealed ? () => clearBlank(i) : undefined}
                  style={{
                    display: "inline-block", minWidth: 130, padding: "6px 14px", margin: "0 5px", borderRadius: 10,
                    border: `2px ${word ? "solid" : "dashed"} ${ok ? C.good : bad ? C.bad : word ? C.brand : C.faint}`,
                    background: ok ? C.goodBg : bad ? C.badBg : word ? "rgba(79,70,229,.08)" : "transparent",
                    color: ok ? "#065F46" : bad ? "#9F1239" : C.ink, fontWeight: 700, textAlign: "center",
                    cursor: word && !revealed ? "pointer" : "default", verticalAlign: "middle", transition: "all .18s",
                  }}>
                  {word ? renderRich(word) : <span style={{ color: C.faint, fontStyle: "italic", fontWeight: 500, fontSize: 14 }}>drop word here</span>}
                </span>
              )}
            </Fragment>
          );
        })}
      </div>
      <p style={{ ...S.eyebrow, marginBottom: 10 }}>Word Bank</p>
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
        {bank.map(word => {
          const isPlaced = placed.includes(word);
          return (
            <div key={word} draggable={!revealed && !isPlaced} onDragStart={() => setDragging(word)}
              onClick={() => clickBankWord(word)}
              style={{
                padding: "10px 16px", border: `1.5px solid ${isPlaced ? C.line : C.line}`, borderRadius: 11,
                cursor: revealed || isPlaced ? "default" : "grab", fontSize: 14.5, fontWeight: 700, fontFamily: FONT,
                background: isPlaced ? C.lineSoft : C.surface, color: isPlaced ? C.faint : C.ink,
                opacity: isPlaced ? 0.55 : 1, userSelect: "none", boxShadow: isPlaced ? "none" : SHADOW.sm,
                transition: "all .15s",
              }}>
              {renderRich(word)}
            </div>
          );
        })}
      </div>
      {revealed && (
        <div className="bqc-rise" style={{ marginTop: 14, padding: "12px 15px", borderRadius: 12, background: allCorrect ? C.goodBg : C.badBg, color: allCorrect ? C.good : C.bad, fontSize: 13.5, fontWeight: 700 }}>
          {allCorrect ? "✓ Correct!" : (blanksCount > 1 ? `Correct answers: ${answerArr.join(", ")}` : `Correct answer: ${answerArr[0]}`)}
        </div>
      )}
      {!revealed && <p style={{ fontSize: 12.5, color: C.muted, marginTop: 12, fontWeight: 600 }}>
        {placed.some(Boolean) ? "Tip: click a filled blank to clear it." : `Tip: drag a word into ${blanksCount > 1 ? "a blank" : "the blank"}, or just tap it.`}
      </p>}
    </div>
  );
}

function DragDrop({ q, ans, setAns, revealed, seed }) {
  const cur = ans || {};
  const baseSeed = String(seed || "default");
  const items = seededShuffle((q.pairs || []).map(p => p.item), baseSeed + "-items");
  const uniqueTargets = [...new Set((q.pairs || []).map(p => p.match))];
  const targets = seededShuffle(uniqueTargets, baseSeed + "-targets");

  // Some questions legitimately map more than one item to the same match (e.g. two
  // features both belonging to "Animal transport system"), so selecting a target
  // must NOT unassign it from any other item that also needs it.
  const setMatch = (item, target) => {
    if (revealed) return;
    const next = { ...cur };
    if (target) next[item] = target; else delete next[item];
    setAns(next);
  };

  return (
    <div>
      <QuestionImage src={q.image} />
      <p style={{ fontSize: 13.5, color: C.muted, margin: "0 0 14px", fontWeight: 600 }}>Select the correct match for each item from the dropdown:</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map(item => {
          const selected = cur[item] || "";
          const correctMatch = q.answer[item];
          const ok = revealed && selected === correctMatch;
          const bad = revealed && selected && selected !== correctMatch;
          const empty = revealed && !selected;
          let bg = C.surface, borderCol = C.line;
          if (ok) { bg = C.goodBg; borderCol = C.good; }
          else if (bad) { bg = C.badBg; borderCol = C.bad; }
          else if (empty) { bg = C.warnBg; borderCol = C.warn; }
          return (
            <div key={item} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 15px",
              border: `1.5px solid ${borderCol}`, borderRadius: 13, background: bg, flexWrap: "wrap", transition: "all .18s" }}>
              <span style={{ fontSize: 14, fontWeight: 700, flex: "1 1 140px", minWidth: 100, color: C.ink }}>{renderRich(item)}</span>
              <span style={{ fontSize: 17, color: C.faint }}>→</span>
              {!revealed ? (
                <select value={selected} onChange={e => setMatch(item, e.target.value)}
                  style={{ flex: "2 1 200px", minWidth: 160, padding: "10px 13px", borderRadius: 10,
                    border: `1.5px solid ${C.line}`, fontSize: 14, fontFamily: FONT, background: C.surface,
                    cursor: "pointer", color: selected ? C.ink : C.faint, fontWeight: 600 }}>
                  <option value="">— select a match —</option>
                  {targets.map((t, ti) => {
                    const usedElsewhere = Object.entries(cur).some(([k, v]) => k !== item && v === t);
                    return (
                      <option key={`${t}-${ti}`} value={t} style={{ background: usedElsewhere ? "#fef9c3" : "#dbeafe", color: C.ink }}>
                        {t}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <span style={{ flex: "2 1 200px", minWidth: 160, padding: "10px 13px", borderRadius: 10,
                  background: ok ? "#A7F3D0" : bad ? "#FECDD3" : "#FDE68A", fontSize: 14, fontWeight: 700,
                  color: ok ? "#065F46" : bad ? "#9F1239" : "#92400E", display: "flex", alignItems: "center", gap: 6 }}>
                  {selected ? renderRich(selected) : "(no answer)"}
                  {ok && <span>✓</span>}
                  {bad && <span>✗</span>}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {revealed && (
        <div className="bqc-rise" style={{ marginTop: 15, padding: "13px 16px", background: C.canvas, borderRadius: 13, border: `1px solid ${C.line}` }}>
          <p style={{ ...S.eyebrow, marginBottom: 8 }}>Correct matches</p>
          {(q.pairs || []).map(p => (
            <p key={p.item} style={{ margin: "5px 0", fontSize: 13.5, color: C.body, lineHeight: 1.5 }}>
              <strong style={{ color: C.ink }}>{renderRich(p.item)}</strong> <span style={{ color: C.faint }}>→</span> {renderRich(p.match)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Ordering({ q, ans, setAns, revealed }) {
  const initial = ans && ans.length ? ans : [...(q.items || [])].sort(() => Math.random() - 0.5);
  const [order, setOrder] = useState(initial);
  const [drag, setDrag] = useState(null);
  useEffect(() => { setAns(order); }, []);
  const move = (from, to) => { const n = [...order]; const [x] = n.splice(from, 1); n.splice(to, 0, x); setOrder(n); setAns(n); };
  const moveUp = (i) => { if (i > 0) move(i, i - 1); };
  const moveDown = (i) => { if (i < order.length - 1) move(i, i + 1); };
  return (
    <div>
      <QuestionImage src={q.image} />
      <p style={{ fontSize: 13.5, color: C.muted, margin: "0 0 12px", fontWeight: 600 }}>Drag the rows into the correct order, or use the arrows:</p>
      {order.map((item, i) => {
        const ci = (q.answer || []).indexOf(item);
        const ok = revealed && i === ci;
        const bad = revealed && i !== ci;
        return (
          <div key={item} draggable={!revealed} onDragStart={() => setDrag(i)}
            onDragOver={e => e.preventDefault()} onDrop={() => { if (drag !== null && drag !== i) move(drag, i); setDrag(null); }}
            style={{
              padding: "13px 15px", marginBottom: 9,
              border: `1.5px solid ${ok ? C.good : bad ? C.bad : C.line}`,
              borderRadius: 13, background: ok ? C.goodBg : bad ? C.badBg : C.surface,
              cursor: revealed ? "default" : "grab", display: "flex", alignItems: "center", gap: 12, fontSize: 14,
              boxShadow: revealed ? "none" : SHADOW.sm, opacity: drag === i ? 0.45 : 1, transition: "opacity .15s, border-color .18s",
            }}>
            <span style={{
              width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: ok ? "rgba(255,255,255,.7)" : bad ? "rgba(255,255,255,.7)" : C.lineSoft,
              color: ok ? C.good : bad ? C.bad : C.muted, fontSize: 12, fontWeight: 800,
            }}>{i + 1}</span>
            <span style={{ flex: 1, fontWeight: 600, color: C.ink, lineHeight: 1.45 }}>{renderRich(item)}</span>
            {!revealed && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
                <button type="button" aria-label={`Move "${item}" up`} disabled={i === 0} onClick={() => moveUp(i)}
                  style={{
                    width: 26, height: 20, padding: 0, borderRadius: 6, border: `1px solid ${C.line}`, background: C.surface,
                    color: i === 0 ? C.faint : C.body, fontSize: 11, lineHeight: 1, cursor: i === 0 ? "default" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT,
                  }}>▲</button>
                <button type="button" aria-label={`Move "${item}" down`} disabled={i === order.length - 1} onClick={() => moveDown(i)}
                  style={{
                    width: 26, height: 20, padding: 0, borderRadius: 6, border: `1px solid ${C.line}`, background: C.surface,
                    color: i === order.length - 1 ? C.faint : C.body, fontSize: 11, lineHeight: 1, cursor: i === order.length - 1 ? "default" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT,
                  }}>▼</button>
              </div>
            )}
            {!revealed && <span style={{ color: C.faint, fontSize: 17, cursor: "grab" }}>⠿</span>}
            {revealed && ok && <span style={{ color: C.good, fontSize: 14, fontWeight: 800 }}>✓</span>}
            {revealed && bad && <span style={{ ...S.badge, background: "rgba(255,255,255,.75)", color: C.bad, fontSize: 10.5 }}>should be #{ci + 1}</span>}
          </div>
        );
      })}
    </div>
  );
}

// Student types a number; the unit sits beside the field as a fixed label and is
// never typed. Scored by numericMatches() with the question's own tolerance.
// The field accepts a plain decimal or scientific notation in any common style
// (5.6e-3, 5.6 x 10^-3, 5.6 × 10⁻³); parseNumericInput() normalises it and an
// "Interpreted as" line echoes the exact value that will be graded, so a student
// can catch a mistyped exponent before pressing Check Answer.
// Not an auto-reveal type -- the student presses "Check Answer" so a mid-typing
// pause is never marked.
function NumericEntry({ q, ans, setAns, revealed }) {
  const value = ans == null ? "" : String(ans);
  const correct = revealed && calcQuestionCorrect(q, ans);
  const mode = q.tolerance_mode === "absolute" ? "absolute" : "relative";
  const tol = q.tolerance == null || q.tolerance === "" ? NUMERIC_DEFAULT_TOLERANCE : Number(q.tolerance);
  const tolText = mode === "absolute"
    ? `±${tol}${q.unit ? " " + q.unit : ""}`
    : `±${tol}%`;
  const typed = value.trim() !== "";
  const echoText = typed ? formatParsedEcho(parseNumericInput(value)) : null;
  return (
    <div>
      <QuestionImage src={q.image} />
      <div style={{ display: "flex", alignItems: "stretch", gap: 10, maxWidth: 440, flexWrap: "wrap" }}>
        <input
          type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
          value={value} disabled={revealed}
          onChange={e => setAns(e.target.value.replace(/[^0-9eExX.,+\-*^\s×⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻−–—]/g, ""))}
          placeholder="e.g. 0.0056 or 5.6e-3"
          style={{
            ...S.input, flex: "1 1 200px", fontSize: 18, fontWeight: 700, fontFamily: MONO,
            borderColor: revealed ? (correct ? C.good : C.bad) : C.line,
            background: revealed ? (correct ? C.goodBg : C.badBg) : C.surface,
            color: revealed ? (correct ? "#065F46" : "#9F1239") : C.ink,
          }}
        />
        {q.unit ? (
          <span style={{
            display: "flex", alignItems: "center", padding: "0 16px", borderRadius: 11,
            background: C.lineSoft, fontWeight: 700, color: C.body, whiteSpace: "nowrap", fontSize: 15,
          }}>{renderRich(q.unit)}</span>
        ) : null}
      </div>
      {!revealed && typed && (
        echoText != null ? (
          <div style={{
            display: "inline-flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
            marginTop: 10, padding: "6px 12px", borderRadius: 9, background: C.lineSoft,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.muted }}>Interpreted as</span>
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: C.ink }}>
              {renderRich(echoText)}{q.unit ? <> {renderRich(q.unit)}</> : null}
            </span>
          </div>
        ) : (
          <div style={{
            marginTop: 10, padding: "6px 12px", borderRadius: 9,
            background: "rgba(245,158,11,.14)", color: "#B45309",
            fontSize: 12.5, fontWeight: 700, maxWidth: 440,
          }}>
            Can't read that value yet. Enter a plain decimal (0.0056) or scientific notation (5.6e-3 or 5.6×10^-3).
          </div>
        )
      )}
      {!revealed && (
        <p style={{ fontSize: 12.5, color: C.muted, marginTop: 8, fontWeight: 600 }}>
          Accepted within {tolText} of the correct value. Plain decimals and scientific notation (5.6e-3, 5.6×10^-3) are both fine. Press "Check Answer" when you're ready.
        </p>
      )}
      {revealed && (
        <div className="bqc-rise" style={{
          marginTop: 14, padding: "12px 15px", borderRadius: 12,
          background: correct ? C.goodBg : C.badBg, color: correct ? C.good : C.bad,
          fontSize: 13.5, fontWeight: 700,
        }}>
          {correct ? "✓ Correct!" : <>Correct answer: {renderRich(formatCorrectAnswer(q))}</>}
        </div>
      )}
    </div>
  );
}

function QuestionRenderer({ q, ans, setAns, revealed, seed }) {
  if (!q) return null;
  if (q.type === "multiple-choice" || q.type === "true-false") return <MCQ q={q} ans={ans} setAns={setAns} revealed={revealed} seed={seed} />;
  if (q.type === "word-bank") return <WordBank q={q} ans={ans} setAns={setAns} revealed={revealed} seed={seed} />;
  if (q.type === "drag-drop") return <DragDrop q={q} ans={ans} setAns={setAns} revealed={revealed} seed={seed} />;
  if (q.type === "ordering") return <Ordering q={q} ans={ans} setAns={setAns} revealed={revealed} />;
  if (q.type === "numeric-entry") return <NumericEntry q={q} ans={ans} setAns={setAns} revealed={revealed} />;
  return null;
}

const AUTO_REVEAL_TYPES = ["multiple-choice", "true-false", "word-bank"];

// ─── LOGIN PAGE ───────────────────────────────────────────────────────────────
function LoginPage({ users, onLogin, onAdmin }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const submit = () => {
    setErr("");
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setErr("Please enter your login code."); return; }
    if (users[trimmed]) {
      onLogin({ code: trimmed, name: users[trimmed].name, className: users[trimmed].className || "", year: users[trimmed].year || "" });
    } else {
      setErr("Login code not recognised. Please check with your teacher.");
    }
  };
  return (
    <div className="login-page-root" style={{ minHeight: "100vh", background: "linear-gradient(150deg, #1E1B4B 0%, #24216A 35%, #312E81 70%, #1B1840 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: FONT, padding: "2rem", position: "relative", overflow: "hidden" }}>
      <style>{GLOBAL_CSS}</style>
      <style>{`
        @keyframes drift1 { 0%,100% { transform: translate(0,0) scale(1) } 33% { transform: translate(20px,-30px) scale(1.06) } 66% { transform: translate(-15px,15px) scale(.97) } }
        @keyframes drift2 { 0%,100% { transform: translate(0,0) scale(1) } 40% { transform: translate(-20px,25px) scale(1.09) } 70% { transform: translate(10px,-20px) scale(.95) } }
        @keyframes drift3 { 0%,100% { transform: translateY(0) scale(1) } 50% { transform: translateY(-40px) scale(1.1) } }
        @keyframes loginShimmer { 0%,100% { opacity:.035 } 50% { opacity:.075 } }
        .login-page-root input::placeholder { color: rgba(255,255,255,.32); letter-spacing: 1px; }
      `}</style>
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-12%", left: "-8%", width: "58%", height: "62%", background: "radial-gradient(ellipse, rgba(129,140,248,.22) 0%, transparent 70%)", animation: "drift1 18s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "-12%", right: "-8%", width: "62%", height: "66%", background: "radial-gradient(ellipse, rgba(79,70,229,.18) 0%, transparent 70%)", animation: "drift2 22s ease-in-out infinite" }} />
        <div style={{ position: "absolute", top: "28%", right: "12%", width: "38%", height: "42%", background: "radial-gradient(ellipse, rgba(56,189,248,.12) 0%, transparent 70%)", animation: "drift3 15s ease-in-out infinite" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "38px 38px", animation: "loginShimmer 8s ease-in-out infinite" }} />
      </div>

      <div className="bqc-rise" style={{ width: "100%", maxWidth: 412, position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{
            width: 66, height: 66, borderRadius: 21, margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 33, background: "linear-gradient(135deg, rgba(129,140,248,.28), rgba(79,70,229,.14))",
            border: "1px solid rgba(255,255,255,.16)", backdropFilter: "blur(10px)", animation: "bqcFloat 5s ease-in-out infinite",
          }}>⚛️</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(199,210,254,.85)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>NSW Stage 6 Physics</div>
          <h1 style={{ margin: "0 0 8px", fontSize: 37, fontWeight: 800, color: "#fff", letterSpacing: "-0.035em", lineHeight: 1.1 }}>{SCHOOL_NAME}</h1>
          <p style={{ margin: 0, color: "rgba(255,255,255,.5)", fontSize: 15, fontWeight: 500 }}>Year 12 revision, any time</p>
        </div>

        <div style={{
          background: "rgba(255,255,255,.07)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(255,255,255,.14)", borderRadius: 22, padding: "2rem", boxShadow: "0 24px 60px rgba(0,0,0,.32)"
        }}>
          <label style={{ ...S.label, color: "rgba(255,255,255,.62)" }}>Your login code</label>
          <input style={{
            ...S.input, textAlign: "center", fontSize: 19, letterSpacing: "2.5px", marginBottom: 14, fontWeight: 700,
            background: "rgba(255,255,255,.07)", border: "1.5px solid rgba(255,255,255,.18)", color: "#fff", fontFamily: MONO,
          }}
            value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            autoFocus
            onKeyDown={e => e.key === "Enter" && submit()} />
          {err && (
            <p style={{ color: "#FDA4AF", fontSize: 13, margin: "0 0 12px", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <span>⚠️</span>{err}
            </p>
          )}
          <button style={{ ...S.btn, ...S.btnLg, width: "100%", background: `linear-gradient(135deg, ${C.brand2} 0%, ${C.brand} 100%)`, color: "#fff", boxShadow: "0 6px 20px rgba(129,140,248,.32)", fontWeight: 800 }} onClick={submit}>
            Sign In →
          </button>
        </div>

        <p style={{ textAlign: "center", marginTop: "1.5rem" }}>
          <button style={{ background: "none", border: "none", color: "rgba(255,255,255,.32)", fontSize: 12.5, cursor: "pointer", fontFamily: FONT, fontWeight: 600 }} onClick={onAdmin}>Admin access</button>
        </p>
      </div>
    </div>
  );
}

// ─── COUNT PICKER MODAL ───────────────────────────────────────────────────────
function CountPickerModal({ title, subtitle, scopeType, poolSize, onStart, onCancel }) {
  const limits = COUNT_LIMITS[scopeType];
  const max = Math.max(1, Math.min(limits.softMax, poolSize));
  const min = Math.min(limits.min, max);
  const [count, setCount] = useState(Math.min(max, Math.max(min, limits.min)));

  const countOptions = [];
  for (let n = Math.ceil(min / 5) * 5; n <= max; n += 5) countOptions.push(n);
  if (countOptions.length === 0 || countOptions[0] !== min) countOptions.unshift(min);
  if (countOptions[countOptions.length - 1] !== max) countOptions.push(max);

  if (poolSize === 0) {
    return (
      <div style={S.modal}>
        <div style={S.modalBox}>
          <h3 style={{ margin: "0 0 10px" }}>{title}</h3>
          <p style={{ color: "#777", fontSize: 14, margin: "0 0 1.5rem" }}>No questions have been published for this yet. Check back soon.</p>
          <button style={{ ...S.btn, ...S.btnOutline, width: "100%", justifyContent: "center" }} onClick={onCancel}>Close</button>
        </div>
      </div>
    );
  }

  const mins = Math.max(1, Math.round(count * 0.6));

  return (
    <div style={S.modal} onClick={onCancel}>
      <div style={S.modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ ...S.h2, marginBottom: 6 }}>{title}</h3>
        {subtitle && <p style={{ ...S.sub, fontSize: 13.5, marginBottom: 12 }}>{subtitle}</p>}
        <span style={{ ...S.badge, background: C.lineSoft, color: C.muted, marginBottom: "1.5rem" }}>
          {poolSize} question{poolSize === 1 ? "" : "s"} in the bank
        </span>

        <label style={{ ...S.label, marginTop: "1.25rem" }}>How many questions?</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginBottom: "1rem" }}>
          {countOptions.map(n => {
            const on = count === n;
            return (
              <button key={n} onClick={() => setCount(n)}
                style={{
                  minWidth: 52, padding: "11px 15px", borderRadius: 12,
                  border: `1.5px solid ${on ? C.brand : C.line}`,
                  background: on ? `linear-gradient(135deg, ${C.brand}, ${C.brandDeep})` : C.surface,
                  color: on ? "#fff" : C.ink, fontWeight: 800, fontSize: 14.5, cursor: "pointer", fontFamily: FONT,
                  boxShadow: on ? "0 3px 10px rgba(79,70,229,.3)" : "none",
                  transition: "all .15s cubic-bezier(.34,1.56,.64,1)",
                }}>
                {n}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 1.75rem", fontWeight: 600 }}>
          ⏱️ Roughly {mins} minute{mins === 1 ? "" : "s"} · you can stop and submit at any point
        </p>

        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ ...S.btn, ...S.btnPrimary, ...S.btnLg, flex: 1 }} onClick={() => onStart(count)}>Let's go →</button>
          <button style={{ ...S.btn, ...S.btnOutline, ...S.btnLg }} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── PRACTICE SESSION (question-by-question, instant feedback) ───────────────
function PracticeSession({ scopeType, scopeId, scopeLabel, color, pool, count, user, onExit, onTryAgain }) {
  const [questions] = useState(() => buildAttemptQuestions(pool, count));
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [revealedIds, setRevealedIds] = useState({});
  const [flaggedQuestions, setFlaggedQuestions] = useState({});
  const [flagModal, setFlagModal] = useState(false);
  const [finished, setFinished] = useState(false);
  const [finalScore, setFinalScore] = useState(null);
  const [seed] = useState(() => Math.random().toString(36).slice(2));

  // Autosave: a student who answers a few questions then gets distracted or
  // runs out of time (never hitting Submit) previously left nothing recorded
  // at all. Instead of one insert at the end, every checked/revealed question
  // saves progress into the same attempt row (created on the first one),
  // so an abandoned session is still captured -- just with a smaller total
  // than the student originally chose. `finishSession` does one final save
  // of the same row rather than a separate insert.
  const attemptRowId = useRef(null);
  const savingRef = useRef(false);
  const saveAgainRef = useRef(false);
  const latestRef = useRef(null);
  latestRef.current = { questions, answers, revealedIds };

  const persistProgress = async () => {
    if (savingRef.current) { saveAgainRef.current = true; return; }
    savingRef.current = true;
    try {
      do {
        saveAgainRef.current = false;
        const { questions: qs, answers: ans, revealedIds: rev } = latestRef.current;
        const completedQuestions = qs.filter(qq => rev[qq.id]);
        if (completedQuestions.length === 0) break; // nothing checked yet -- nothing worth saving
        const score = calcScore(completedQuestions, ans) || { correct: 0, total: 0 };
        if (!attemptRowId.current) {
          const { data, error } = await supabase.from("attempts").insert({
            user_code: user.code, scope_type: scopeType, scope_id: scopeId,
            question_snapshot: qs, answers: ans, correct: score.correct, total: score.total,
          }).select("id").single();
          if (error) { console.error("Save progress error:", error); break; }
          attemptRowId.current = data.id;
        } else {
          const { error } = await supabase.from("attempts").update({
            answers: ans, correct: score.correct, total: score.total, submitted_at: new Date().toISOString(),
          }).eq("id", attemptRowId.current);
          if (error) console.error("Save progress error:", error);
        }
      } while (saveAgainRef.current);
    } finally {
      savingRef.current = false;
    }
  };

  useEffect(() => {
    if (Object.keys(revealedIds).length > 0) persistProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedIds]);

  if (!questions.length) {
    return (
      <div style={S.cont}>
        <button style={{ ...S.btn, ...S.btnOutline, ...S.btnSm, marginBottom: "1.5rem" }} onClick={onExit}>Back</button>
        <div style={{ ...S.card, textAlign: "center", padding: "3rem" }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>🚧</p>
          <h3 style={{ margin: "0 0 8px" }}>Nothing to practise yet</h3>
          <p style={{ color: "#777" }}>No questions have been published here yet. Check back later.</p>
        </div>
      </div>
    );
  }

  if (finished) {
    const noneCompleted = finalScore.total === 0;
    const pct = finalScore.pct;
    const praise = noneCompleted ? { emoji: "🤔", head: "No questions completed", sub: "Only completed questions get marked — have a go at a few next time." }
      : pct === 100 ? { emoji: "🏆", head: "Perfect score!", sub: "Every single one correct. Outstanding." }
      : pct >= 85 ? { emoji: "🌟", head: "Brilliant work!", sub: "You've really got a handle on this." }
      : pct >= 70 ? { emoji: "🎉", head: "Nice work!", sub: "Solid effort — you're getting there." }
      : pct >= 50 ? { emoji: "💪", head: "Good progress", sub: "Halfway there. Another round will sharpen it up." }
      : { emoji: "📚", head: "Keep practising", sub: "Every attempt helps — check the answers and go again." };
    return (
      <div style={S.cont}>
        <div className="bqc-rise" style={{ ...S.card, textAlign: "center", padding: "3.25rem 2rem", position: "relative", overflow: "hidden" }}>
          <div aria-hidden style={{ position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)", width: 320, height: 200, background: `radial-gradient(ellipse, ${gradientColor(pct).solid}22 0%, transparent 70%)` }} />
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 54, marginBottom: 6, animation: "bqcFloat 3s ease-in-out infinite" }}>{praise.emoji}</div>
            {!noneCompleted && <AccuracyRing pct={pct} size={150} />}
            <h2 style={{ ...S.h1, fontSize: 27, marginTop: noneCompleted ? 0 : 14 }}>{praise.head}</h2>
            <p style={{ ...S.sub, margin: "9px auto 6px", maxWidth: 380 }}>{praise.sub}</p>
            {!noneCompleted && (
              <p style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: "0 0 26px" }}>
                {finalScore.correct} out of {finalScore.total} correct
              </p>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: noneCompleted ? 24 : 0 }}>
              <button style={{ ...S.btn, ...S.btnLg, background: `linear-gradient(135deg, ${color}, ${color}cc)`, color: "#fff", boxShadow: `0 3px 12px ${color}55` }} onClick={onTryAgain}>🔄 Try Again</button>
              <button style={{ ...S.btn, ...S.btnOutline, ...S.btnLg }} onClick={onExit}>Back</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[idx];
  const isRevealed = !!revealedIds[q.id];
  const needsCheck = !AUTO_REVEAL_TYPES.includes(q.type);
  const canCheck = needsCheck && !isRevealed && hasAnswer(q, answers[q.id]);
  const isLast = idx === questions.length - 1;
  const answeredCount = Object.keys(revealedIds).length;

  const setAns = val => {
    setAnswers(p => ({ ...p, [q.id]: val }));
    // hasAnswer(q, val) gates this on ALL blanks being filled for multi-blank
    // word-bank, not just the first one -- for every other auto-reveal type
    // (MCQ/true-false/single-blank word-bank) it's equivalent to "any answer".
    if (AUTO_REVEAL_TYPES.includes(q.type) && hasAnswer(q, val)) setRevealedIds(p => ({ ...p, [q.id]: true }));
  };
  const checkAnswer = () => setRevealedIds(p => ({ ...p, [q.id]: true }));

  const finishSession = async () => {
    const completedQuestions = questions.filter(qq => revealedIds[qq.id]);
    const score = calcScore(completedQuestions, answers) || { correct: 0, total: 0, pct: null };
    setFinalScore(score);
    setFinished(true);
    await persistProgress(); // final save of the same row -- not a second insert
  };

  const submitSession = () => {
    if (answeredCount < questions.length) {
      const proceed = window.confirm(`You've completed ${answeredCount} of ${questions.length} questions. Submitting now will only mark and score the questions you've completed — the rest won't count. Submit anyway?`);
      if (!proceed) return;
    }
    finishSession();
  };

  const nextLabel = needsCheck && !isRevealed ? "Check Answer" : (isLast ? "Finish" : "Next");
  const nextDisabled = needsCheck && !isRevealed && !canCheck;

  const goNext = () => {
    if (needsCheck && !isRevealed) { if (canCheck) checkAnswer(); return; }
    if (isLast) finishSession(); else setIdx(i => i + 1);
  };

  return (
    <div style={S.cont}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <span style={{ ...S.badge, background: `${color}14`, color, fontSize: 11.5, padding: "6px 12px" }}>{scopeLabel}</span>
        <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSm }} onClick={submitSession}>Submit Quiz</button>
      </div>

      <div style={{ ...S.card, marginBottom: "1.25rem", padding: "1.25rem 1.35rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 11, flexWrap: "wrap" }}>
          <h2 style={{ ...S.h3, fontSize: 15 }}>{answeredCount} of {questions.length} answered</h2>
          <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 700 }}>
            {Math.round((answeredCount / questions.length) * 100)}% complete
          </span>
        </div>
        <div style={{ ...S.progress, marginBottom: 14 }}>
          <div style={{
            height: "100%", borderRadius: 99, width: `${Math.round((answeredCount / questions.length) * 100)}%`,
            background: `linear-gradient(90deg, ${color}bb, ${color})`, transition: "width .5s cubic-bezier(.22,1,.36,1)"
          }} />
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {questions.map((qq, i) => {
            const rev = !!revealedIds[qq.id];
            const correct = rev ? calcQuestionCorrect(qq, answers[qq.id]) : false;
            const current = i === idx;
            let bg = C.lineSoft, txt = C.faint, ring = "transparent";
            if (rev) { bg = correct ? C.goodBg : C.badBg; txt = correct ? C.good : C.bad; }
            if (current) { ring = color; }
            return (
              <button key={qq.id} onClick={() => setIdx(i)} title={`Question ${i + 1}`}
                style={{
                  width: 32, height: 32, borderRadius: 9, border: `2px solid ${ring}`, cursor: "pointer",
                  fontSize: 11.5, fontWeight: 800, background: bg, color: txt, fontFamily: FONT,
                  transition: "all .15s", boxShadow: current ? `0 2px 8px ${color}44` : "none",
                }}>
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bqc-rise" key={q.id} style={{ ...S.card, marginBottom: "1.25rem", padding: "1.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ ...S.badge, background: C.ink, color: "#fff" }}>Q{idx + 1} / {questions.length}</span>
          <span style={{ ...S.badge, background: C.lineSoft, color: C.muted, textTransform: "capitalize" }}>{(q.type || "").replace(/-/g, " ")}</span>
        </div>
        <p style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.45, margin: "0 0 1.4rem", color: C.ink, letterSpacing: "-0.015em" }}>{renderRich(q.prompt)}</p>
        <QuestionRenderer q={q} ans={answers[q.id]} setAns={setAns} revealed={isRevealed} seed={`${seed}-${q.id}`} />

        {isRevealed && (q.type === "drag-drop" || q.type === "ordering") && (
          <div className="bqc-rise" style={{
            marginTop: 14, padding: "12px 15px", borderRadius: 12,
            background: calcQuestionCorrect(q, answers[q.id]) ? C.goodBg : C.badBg,
            color: calcQuestionCorrect(q, answers[q.id]) ? C.good : C.bad, fontSize: 13.5, fontWeight: 700
          }}>
            {calcQuestionCorrect(q, answers[q.id]) ? "✓ Correct!" : <>Correct answer: {renderRich(formatCorrectAnswer(q))}</>}
          </div>
        )}

        {/* Tip: shown only after the question is checked AND the student got it wrong. */}
        {isRevealed && q.hint && hasAnswer(q, answers[q.id]) && !calcQuestionCorrect(q, answers[q.id]) && (
          <div className="bqc-rise" style={{
            marginTop: 12, padding: "12px 15px", borderRadius: 12,
            background: C.warnBg, color: "#92400E", fontSize: 13.5, lineHeight: 1.55,
            border: `1px solid ${C.warn}55`,
          }}>
            <strong style={{ fontWeight: 800 }}>💡 Tip: </strong>{renderRich(q.hint)}
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
        <button style={{ ...S.btn, ...S.btnOutline }} disabled={idx === 0} onClick={() => setIdx(i => i - 1)}>← Previous</button>
        <button
          style={{
            ...S.btn, ...S.btnSm,
            background: flaggedQuestions?.[q.id]?.reasons?.length ? "#F3E8FF" : "transparent",
            color: flaggedQuestions?.[q.id]?.reasons?.length ? C.violet : C.muted,
            borderColor: flaggedQuestions?.[q.id]?.reasons?.length ? "#DDD0FE" : C.line,
          }}
          onClick={() => setFlagModal(true)}>
          🚩 {flaggedQuestions?.[q.id]?.reasons?.length ? "Flagged" : "Flag"}
        </button>
        <button
          style={{
            ...S.btn, ...S.btnLg, color: "#fff",
            background: (isLast && (!needsCheck || isRevealed))
              ? `linear-gradient(135deg, #F43F5E, ${C.bad})`
              : `linear-gradient(135deg, ${color}, ${color}cc)`,
            boxShadow: `0 3px 12px ${(isLast && (!needsCheck || isRevealed)) ? "rgba(225,29,72,.4)" : `${color}55`}`,
          }}
          disabled={nextDisabled} onClick={goNext}>
          {nextLabel} {nextLabel === "Check Answer" ? "✓" : "→"}
        </button>
      </div>

      {flagModal && (
        <div style={S.modal}>
          <div style={S.modalBox}>
            <h3 style={{ margin: "0 0 10px" }}>Flag this question</h3>
            <p style={{ color: "#666", fontSize: 13, margin: "0 0 1.5rem" }}>Why are you flagging this question?</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.5rem" }}>
              {FLAG_REASONS.map(reason => (
                <button
                  key={reason.id}
                  onClick={() => {
                    setFlaggedQuestions(prev => ({
                      ...prev,
                      [q.id]: {
                        reasons: prev?.[q.id]?.reasons
                          ? (prev[q.id].reasons.includes(reason.id)
                            ? prev[q.id].reasons.filter(r => r !== reason.id)
                            : [...prev[q.id].reasons, reason.id])
                          : [reason.id]
                      }
                    }));
                  }}
                  style={{
                    padding: "12px 14px", borderRadius: 8,
                    border: flaggedQuestions?.[q.id]?.reasons?.includes(reason.id) ? "2px solid #4c1d95" : `1px solid ${C.line}`,
                    background: flaggedQuestions?.[q.id]?.reasons?.includes(reason.id) ? "#f3e8ff" : "#fff",
                    cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 500, fontFamily: FONT, transition: "all 0.18s"
                  }}>
                  <span style={{ marginRight: 8 }}>{reason.icon}</span>
                  {reason.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                style={{ ...S.btn, ...S.btnPrimary, flex: 1, justifyContent: "center" }}
                onClick={async () => {
                  const reasons = flaggedQuestions?.[q.id]?.reasons || [];
                  if (reasons.length) await submitFlag(q.id, user.code, reasons);
                  setFlagModal(false);
                }}
                disabled={!flaggedQuestions?.[q.id]?.reasons?.length}>
                Save Flag
              </button>
              <button style={{ ...S.btn, ...S.btnOutline, flex: 1, justifyContent: "center" }} onClick={() => setFlagModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function submitFlag(questionId, userCode, reasons) {
  const { error } = await supabase.from("question_flags").insert({ question_id: questionId, user_code: userCode, reasons });
  if (error) console.error("Submit flag error:", error);
}

// ─── MODULE PAGE ──────────────────────────────────────────────────────────────
function ModulePage({ moduleDef, questions, user, onBack, onLaunch }) {
  const [picker, setPicker] = useState(null); // { scopeType, scopeId, scopeLabel, title, subtitle }

  const moduleActive = questions.filter(q => q.module_id === moduleDef.id);

  return (
    <div style={S.cont}>
      <button style={{ ...S.btn, ...S.btnOutline, ...S.btnSm, marginBottom: "1.5rem" }} onClick={onBack}>← All Modules</button>

      <div className="bqc-rise" style={{
        position: "relative", overflow: "hidden", borderRadius: 22, padding: "2rem", marginBottom: "1.5rem",
        background: `linear-gradient(135deg, ${moduleDef.color} 0%, ${moduleDef.color2} 140%)`,
        boxShadow: `0 12px 30px ${moduleDef.color}3d`
      }}>
        <div aria-hidden style={{ position: "absolute", top: -46, right: -20, fontSize: 168, opacity: 0.17, lineHeight: 1 }}>{moduleDef.icon}</div>
        <div style={{ position: "relative" }}>
          <p style={{ margin: "0 0 7px", fontSize: 11.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.82)" }}>
            Module {moduleDef.id.split("-")[1]}
          </p>
          <h1 style={{ ...S.h1, color: "#fff", fontSize: 31 }}>{moduleDef.title}</h1>
          <p style={{ margin: "10px 0 0", color: "rgba(255,255,255,.8)", fontSize: 14.5, maxWidth: 540, lineHeight: 1.6, fontWeight: 500 }}>{moduleDef.description}</p>
        </div>
      </div>

      <div className="bqc-rise bqc-lift" style={{
        ...S.card, marginBottom: "1.75rem", display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 16, flexWrap: "wrap", animationDelay: "80ms", borderColor: `${moduleDef.color}44`,
        background: `linear-gradient(120deg, ${moduleDef.color}0a 0%, #fff 70%)`
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
          <div style={{
            width: 50, height: 50, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 23,
            background: `linear-gradient(135deg, ${moduleDef.color}, ${moduleDef.color2})`, boxShadow: `0 4px 14px ${moduleDef.color}4d`, flexShrink: 0
          }}>⚡</div>
          <div>
            <h3 style={S.h3}>Whole Module Quiz</h3>
            <p style={{ margin: "3px 0 0", fontSize: 13.5, color: C.muted, fontWeight: 600 }}>{moduleActive.length} questions across all {moduleDef.inquiries.length} areas</p>
          </div>
        </div>
        <button style={{ ...S.btn, ...S.btnLg, background: `linear-gradient(135deg, ${moduleDef.color}, ${moduleDef.color2})`, color: "#fff", boxShadow: `0 3px 12px ${moduleDef.color}55` }}
          onClick={() => setPicker({ scopeType: "module", scopeId: moduleDef.id, scopeLabel: moduleDef.title, title: "Whole Module Quiz", subtitle: moduleDef.title })}>
          Start →
        </button>
      </div>

      <h2 style={{ ...S.h2, marginBottom: 4 }}>Inquiry questions</h2>
      <p style={{ ...S.sub, fontSize: 13.5, marginBottom: "1.1rem" }}>Focus your revision on one syllabus area at a time.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
        {moduleDef.inquiries.map((inq, i) => {
          const bank = questions.filter(q => q.inquiry_id === inq.id);
          return (
            <div key={inq.id} className="bqc-rise bqc-lift"
              style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", animationDelay: `${140 + i * 65}ms`, padding: "1.25rem 1.35rem" }}>
              <div style={{ flex: "1 1 280px", display: "flex", gap: 14 }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 13, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  background: `${moduleDef.color}14`, color: moduleDef.color, fontWeight: 800, fontSize: 14.5
                }}>{inq.id}</div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={S.h3}>{inq.title}</h3>
                  <p style={{ margin: "5px 0 8px", fontSize: 13.5, color: C.body, fontStyle: "italic", lineHeight: 1.55 }}>“{inq.question}”</p>
                  <span style={{ ...S.badge, background: C.lineSoft, color: C.muted }}>{bank.length} question{bank.length === 1 ? "" : "s"}</span>
                </div>
              </div>
              <button style={{ ...S.btn, background: `${moduleDef.color}14`, color: moduleDef.color, borderColor: `${moduleDef.color}33` }}
                onClick={() => setPicker({ scopeType: "inquiry", scopeId: inq.id, scopeLabel: `${moduleDef.title} · ${inq.title}`, title: `Practice: ${inq.title}`, subtitle: inq.question })}>
                Practise →
              </button>
            </div>
          );
        })}
      </div>

      {picker && (
        <CountPickerModal
          title={picker.title} subtitle={picker.subtitle} scopeType={picker.scopeType}
          poolSize={poolForScope(questions, picker.scopeType, picker.scopeId).length}
          onCancel={() => setPicker(null)}
          onStart={count => { onLaunch({ ...picker, color: moduleDef.color, count }); setPicker(null); }}
        />
      )}
    </div>
  );
}

// ─── CLASS LEADERBOARD ────────────────────────────────────────────────────────
function initials(name) {
  return (name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };
const PODIUM_STAND = {
  1: "linear-gradient(160deg, #FFE8A3, #F5A524)",
  2: "linear-gradient(160deg, #EDF0F5, #B8C0CC)",
  3: "linear-gradient(160deg, #F3C9A0, #C97B3D)",
};
const PODIUM_STAND_HEIGHT = { 1: 86, 2: 60, 3: 46 };

function PodiumSpot({ entry, place, delay }) {
  const on = useMounted(delay);
  const shown = useCountUp(entry ? entry.correct : 0, 900);
  const empty = !entry;
  return (
    <div className="bqc-rise" style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "1 1 0", minWidth: 0, animationDelay: `${delay}ms` }}>
      <div style={{ fontSize: place === 1 ? 28 : 22, marginBottom: 4, opacity: empty ? 0.35 : 1, animation: (place === 1 && !empty) ? "bqcFloat 3s ease-in-out infinite" : "none" }}>
        {MEDAL[place]}
      </div>
      <div style={{
        width: place === 1 ? 56 : 46, height: place === 1 ? 56 : 46, borderRadius: "50%",
        background: empty ? C.lineSoft : `linear-gradient(135deg, ${C.brand2}, ${C.brand})`,
        color: empty ? C.faint : "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: place === 1 ? 17 : 14, boxShadow: empty ? "none" : SHADOW.md,
        border: "3px solid #fff", marginBottom: 8, flexShrink: 0,
      }}>
        {empty ? "—" : initials(entry.name)}
      </div>
      <div style={{
        fontSize: 12, fontWeight: 800, color: empty ? C.faint : C.ink, textAlign: "center",
        maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 2px",
      }}>
        {empty ? "Open spot" : entry.name.split(/\s+/)[0]}
      </div>
      <div style={{ fontSize: place === 1 ? 19 : 15, fontWeight: 800, color: empty ? C.faint : gradientColor(100).solid, marginTop: 2, lineHeight: 1.2 }}>
        {empty ? "–" : Math.round(shown)}
      </div>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 9 }}>
        {empty ? "unclaimed" : "correct"}
      </div>
      <div style={{
        width: "100%", height: on ? PODIUM_STAND_HEIGHT[place] : 0, borderRadius: "10px 10px 0 0",
        background: empty ? C.lineSoft : PODIUM_STAND[place], transition: "height .85s cubic-bezier(.22,1,.36,1)",
        display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 6, boxSizing: "border-box",
      }}>
        <span style={{ fontWeight: 800, fontSize: place === 1 ? 20 : 16, color: "rgba(255,255,255,.8)" }}>{place}</span>
      </div>
    </div>
  );
}

function ClassLeaderboard({ user }) {
  const courseYear = normalizedYear(user.year);
  const [mode, setMode] = useState("year"); // "year" | "class" -- defaults to year group
  const scope = mode === "class"
    ? { type: "class", className: user.className }
    : { type: "year", year: courseYear };
  const { rows, loading } = useLeaderboard(scope);

  const scopeLabel = mode === "class" ? user.className : `Year ${courseYear}`;
  const pillBtn = (active) => ({
    padding: "6px 14px", borderRadius: 999, border: `1.5px solid ${active ? C.brand : C.line}`,
    background: active ? C.brand : "#fff", color: active ? "#fff" : C.muted,
    fontWeight: 700, fontSize: 12.5, fontFamily: FONT, cursor: "pointer", transition: "all .15s",
  });

  const toggle = user.className && (
    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
      <button style={pillBtn(mode === "year")} onClick={() => setMode("year")}>Year {courseYear}</button>
      <button style={pillBtn(mode === "class")} onClick={() => setMode("class")}>{user.className}</button>
    </div>
  );

  if (loading) {
    return (
      <div className="bqc-rise" style={{ ...S.card, marginBottom: "1.75rem", padding: "2rem", textAlign: "center", color: C.muted, fontWeight: 600, fontSize: 13.5 }}>
        🏆 Loading the leaderboard…
      </div>
    );
  }
  if (!rows.length) return null;

  const me = rows.find(r => r.code === user.code);
  const podiumEntry = (r) => (r && r.correct > 0 ? r : null);
  const anyActivity = rows[0].correct > 0;

  return (
    <div className="bqc-rise" style={{
      ...S.card, marginBottom: "1.75rem", animationDelay: "420ms", position: "relative", overflow: "hidden",
      background: `linear-gradient(165deg, #fff 0%, ${C.canvas} 100%)`, borderColor: "rgba(245,165,36,.3)",
    }}>
      <div aria-hidden style={{ position: "absolute", top: -44, right: -34, fontSize: 140, opacity: 0.05, lineHeight: 1 }}>🏆</div>
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: anyActivity ? 20 : 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 19 }}>🏆</span>
            <h2 style={S.h2}>Leaderboard</h2>
          </div>
          <p style={{ ...S.sub, fontSize: 13, maxWidth: 460 }}>
            Ranked by total questions answered correctly in <strong style={{ color: C.ink }}>{scopeLabel}</strong> — wrong guesses never cost you, so every attempt only helps.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, flexShrink: 0 }}>
          {toggle}
          {me && me.correct > 0 && (
            <span style={{ ...S.badge, background: me.rank <= 3 ? C.goodBg : C.lineSoft, color: me.rank <= 3 ? C.good : C.body, fontSize: 12.5, padding: "7px 13px" }}>
              {me.rank <= 3 ? "🎉 " : ""}You're #{me.rank} of {rows.length}
            </span>
          )}
        </div>
      </div>

      {anyActivity ? (
        <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 10, justifyContent: "center", maxWidth: 420, margin: "0 auto" }}>
          <PodiumSpot entry={podiumEntry(rows[1])} place={2} delay={140} />
          <PodiumSpot entry={podiumEntry(rows[0])} place={1} delay={80} />
          <PodiumSpot entry={podiumEntry(rows[2])} place={3} delay={200} />
        </div>
      ) : (
        <div style={{ position: "relative", textAlign: "center", padding: "1.25rem 1rem 0.5rem" }}>
          <div style={{ fontSize: 34, marginBottom: 8, animation: "bqcFloat 3s ease-in-out infinite" }}>🌱</div>
          <p style={{ margin: 0, fontSize: 13.5, color: C.body, fontWeight: 600 }}>No one in {scopeLabel} has answered a question yet — be the first on the board!</p>
        </div>
      )}

      {me && me.correct > 0 && me.rank > 3 && (
        <div className="bqc-rise" style={{ position: "relative", marginTop: 20, padding: "12px 16px", borderRadius: 13, background: C.canvas, border: `1.5px dashed ${C.line}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
            background: `linear-gradient(135deg, ${C.brand2}, ${C.brand})`, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12.5,
          }}>{initials(me.name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>You're ranked #{me.rank} of {rows.length}</div>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginTop: 1 }}>{me.correct} correct so far — keep practising to climb the board!</div>
          </div>
        </div>
      )}
      {me && me.correct === 0 && (
        <div className="bqc-rise" style={{ position: "relative", marginTop: 20, padding: "12px 16px", borderRadius: 13, background: C.canvas, border: `1.5px dashed ${C.line}`, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 12.5, color: C.muted, fontWeight: 600 }}>Answer a few questions to join the board yourself!</p>
        </div>
      )}
    </div>
  );
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
function HomePage({ user, questions, onSelectModule, onViewProgress, onLaunch }) {
  const [yearPicker, setYearPicker] = useState(false);
  const courseYear = normalizedYear(user.year);
  const myModules = useMemo(() => modulesForYear(courseYear), [courseYear]);
  const myModuleIds = useMemo(() => new Set(myModules.map(m => m.id)), [myModules]);
  const totalQuestions = questions.filter(q => myModuleIds.has(q.module_id)).length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (user.name || "").trim().split(/\s+/)[0];

  return (
    <div style={S.cont}>
      {/* Hero */}
      <div className="bqc-rise" style={{
        position: "relative", overflow: "hidden", borderRadius: 22, padding: "2.25rem 2rem", marginBottom: "1.5rem",
        background: `linear-gradient(135deg, #1E1B4B 0%, #312E81 45%, #4F46E5 100%)`,
        boxShadow: "0 12px 32px rgba(30,27,75,.32)"
      }}>
        <div aria-hidden style={{ position: "absolute", top: -70, right: -50, width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle, rgba(129,140,248,.34) 0%, transparent 68%)", animation: "bqcFloat 7s ease-in-out infinite" }} />
        <div aria-hidden style={{ position: "absolute", bottom: -90, left: "28%", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(56,189,248,.2) 0%, transparent 70%)", animation: "bqcFloat 9s ease-in-out infinite reverse" }} />
        <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,.07) 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: "0 0 8px", fontSize: 13.5, fontWeight: 700, color: "#C7D2FE", letterSpacing: "-0.01em" }}>
              {greeting}, {firstName} 👋
            </p>
            <h1 style={{ ...S.h1, color: "#fff", fontSize: 34 }}>Ready for a bit of revision?</h1>
            <p style={{ margin: "10px 0 0", color: "rgba(255,255,255,.72)", fontSize: 14.5, fontWeight: 500, maxWidth: 430, lineHeight: 1.6 }}>
              Pick a module below, or throw yourself at a mix from your whole Year {courseYear} course. Instant feedback on every question.
            </p>
          </div>
          <button style={{ ...S.btn, ...S.btnLg, background: "rgba(255,255,255,.14)", color: "#fff", borderColor: "rgba(255,255,255,.28)", backdropFilter: "blur(6px)" }}
            onClick={onViewProgress}>
            📊 My Progress
          </button>
        </div>
      </div>

      {/* Whole-year CTA */}
      <div className="bqc-rise bqc-lift" style={{
        ...S.card, marginBottom: "1.75rem", display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 16, flexWrap: "wrap", animationDelay: "80ms",
        background: `linear-gradient(120deg, #fff 0%, ${C.canvas} 100%)`, borderColor: "rgba(79,70,229,.28)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 25,
            background: `linear-gradient(135deg, ${C.brand2}, ${C.brandDeep})`, boxShadow: "0 4px 14px rgba(55,48,163,.3)", flexShrink: 0
          }}>🎲</div>
          <div>
            <h3 style={S.h3}>Year {courseYear} Mix</h3>
            <p style={{ margin: "3px 0 0", fontSize: 13.5, color: C.muted, fontWeight: 600 }}>
              {totalQuestions} questions across all {myModules.length} Year {courseYear} modules
            </p>
          </div>
        </div>
        <button style={{ ...S.btn, ...S.btnPrimary, ...S.btnLg }} onClick={() => setYearPicker(true)}>Start mixed quiz →</button>
      </div>

      <h2 style={{ ...S.h2, marginBottom: 4 }}>Year {courseYear} Modules</h2>
      <p style={{ ...S.sub, fontSize: 13.5, marginBottom: "1.1rem" }}>Practise a whole module, or drill a single inquiry question inside it.</p>

      <div className="bqc-module-grid">
        {myModules.map((m, i) => {
          const moduleQuestions = questions.filter(q => q.module_id === m.id);
          return (
            <div key={m.id} className="bqc-rise bqc-lift"
              style={{ ...S.card, padding: 0, cursor: "pointer", overflow: "hidden", animationDelay: `${140 + i * 70}ms`, display: "flex", flexDirection: "column" }}
              onClick={() => onSelectModule(m)}>
              <div style={{
                position: "relative", padding: "1.5rem 1.1rem 1.1rem",
                background: `linear-gradient(135deg, ${m.color} 0%, ${m.color2} 130%)`, overflow: "hidden"
              }}>
                <div aria-hidden style={{ position: "absolute", top: -30, right: -20, fontSize: 78, opacity: 0.19, lineHeight: 1 }}>{m.icon}</div>
                <div style={{ position: "relative" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.11em", textTransform: "uppercase", color: "rgba(255,255,255,.8)", marginBottom: 6 }}>
                    Module {m.id.split("-")[1]}
                  </div>
                  <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.3 }}>{m.title}</h3>
                </div>
              </div>
              <div style={{ padding: "1.1rem 1.1rem 1.25rem", display: "flex", flexDirection: "column", flex: 1 }}>
                <p style={{ margin: "0 0 16px", fontSize: 13, color: C.body, lineHeight: 1.6, fontWeight: 500, flex: 1 }}>{m.description}</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ ...S.badge, background: `${m.color}14`, color: m.color, fontSize: 10.5, padding: "3px 8px" }}>{moduleQuestions.length} Qs</span>
                    <span style={{ ...S.badge, background: C.lineSoft, color: C.muted, fontSize: 10.5, padding: "3px 8px" }}>{m.inquiries.length} areas</span>
                  </div>
                  <span style={{ color: m.color, fontWeight: 800, fontSize: 17 }}>→</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ClassLeaderboard user={user} />

      {yearPicker && (
        <CountPickerModal
          title={`Year ${courseYear} Mix`} subtitle={`A random mix from every Year ${courseYear} module`} scopeType="year"
          poolSize={totalQuestions}
          onCancel={() => setYearPicker(false)}
          onStart={count => { onLaunch({ scopeType: "year", scopeId: String(courseYear), scopeLabel: `Year ${courseYear} Mix`, color: C.brand, count }); setYearPicker(false); }}
        />
      )}
    </div>
  );
}

// ─── MY PROGRESS PAGE ─────────────────────────────────────────────────────────
// ─── CHART PRIMITIVES ─────────────────────────────────────────────────────────

// Catmull-Rom style smoothing so the trend line curves instead of zig-zagging.
function smoothPath(pts) {
  if (!pts.length) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const t = 0.17;
    d += ` C ${p1.x + (p2.x - p0.x) * t} ${p1.y + (p2.y - p0.y) * t} ${p2.x - (p3.x - p1.x) * t} ${p2.y - (p3.y - p1.y) * t} ${p2.x} ${p2.y}`;
  }
  return d;
}

function StatTile({ icon, label, value, suffix = "", tint, delay = 0, caption }) {
  const shown = useCountUp(value, 950);
  return (
    <div className="bqc-rise bqc-lift" style={{ ...S.card, padding: "1.1rem 1.2rem", animationDelay: `${delay}ms`, position: "relative", overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", top: -34, right: -34, width: 104, height: 104, borderRadius: "50%", background: `radial-gradient(circle, ${tint}26 0%, transparent 70%)` }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, position: "relative" }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ ...S.eyebrow, fontSize: 10.5 }}>{label}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.035em", color: C.ink, lineHeight: 1, position: "relative" }}>
        {Math.round(shown)}<span style={{ fontSize: 18, color: tint, marginLeft: 1 }}>{suffix}</span>
      </div>
      {caption && <div style={{ fontSize: 12, color: C.muted, marginTop: 7, fontWeight: 600 }}>{caption}</div>}
    </div>
  );
}

// Big circular accuracy dial -- sweeps from empty to the real value on mount.
function AccuracyRing({ pct, size = 168 }) {
  const on = useMounted(180);
  const shown = useCountUp(pct ?? 0, 1100);
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const gc = gradientColor(pct);
  const target = pct === null ? 0 : pct;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gc.solid} stopOpacity="0.75" />
            <stop offset="100%" stopColor={gc.solid} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.lineSoft} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ringGrad)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={on ? circ - (circ * target) / 100 : circ}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.04em", color: C.ink, lineHeight: 1 }}>
          {pct === null ? "—" : Math.round(shown)}
          {pct !== null && <span style={{ fontSize: 20, color: gc.solid }}>%</span>}
        </div>
        <div style={{ ...S.eyebrow, marginTop: 6, fontSize: 10 }}>Accuracy</div>
      </div>
    </div>
  );
}

// Accuracy per session: animated draw-on line with gradient area fill + hover readout.
function TrendChart({ points, accent }) {
  const on = useMounted(260);
  const pathRef = useRef(null);
  const [len, setLen] = useState(0);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (pathRef.current) setLen(pathRef.current.getTotalLength());
  }, [points]);

  const W = 720, H = 250, padL = 38, padR = 16, padT = 18, padB = 34;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  if (!points.length) {
    return <div style={{ padding: "3rem 1rem", textAlign: "center", color: C.muted, fontSize: 14, fontWeight: 600 }}>No sessions in this filter yet.</div>;
  }

  const xAt = (i) => points.length === 1 ? padL + innerW / 2 : padL + (i / (points.length - 1)) * innerW;
  const yAt = (v) => padT + innerH - (v / 100) * innerH;
  const pts = points.map((p, i) => ({ x: xAt(i), y: yAt(p.accuracy), ...p }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x} ${padT + innerH} L ${pts[0].x} ${padT + innerH} Z`;
  const active = hover !== null ? pts[hover] : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
      role="img" aria-label={`Accuracy across your last ${points.length} sessions`}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 25, 50, 75, 100].map(v => (
        <g key={v}>
          <line x1={padL} y1={yAt(v)} x2={W - padR} y2={yAt(v)} stroke={v === 0 ? C.line : C.lineSoft} strokeWidth="1" />
          <text x={padL - 10} y={yAt(v) + 4} textAnchor="end" fontSize="11" fill={C.faint} fontWeight="700" fontFamily={FONT}>{v}</text>
        </g>
      ))}

      <path d={area} fill="url(#areaGrad)" style={{ opacity: on ? 1 : 0, transition: "opacity .9s ease .5s" }} />
      <path
        ref={pathRef} d={line} fill="none" stroke={accent} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={len || undefined} strokeDashoffset={on ? 0 : len || 0}
        style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1)" }}
      />

      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 7 : 4.5}
          fill="#fff" stroke={accent} strokeWidth="3"
          style={{ opacity: on ? 1 : 0, transition: `opacity .35s ease ${700 + i * 55}ms, r .15s ease` }} />
      ))}

      {active && (
        <g style={{ pointerEvents: "none" }}>
          <line x1={active.x} y1={padT} x2={active.x} y2={padT + innerH} stroke={accent} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.5" />
          <rect x={Math.min(Math.max(active.x - 78, 2), W - 158)} y={Math.max(active.y - 62, 2)} width="156" height="50" rx="10" fill={C.ink} opacity="0.96" />
          <text x={Math.min(Math.max(active.x - 78, 2), W - 158) + 12} y={Math.max(active.y - 62, 2) + 20} fontSize="13" fontWeight="800" fill="#fff" fontFamily={FONT}>
            {active.accuracy}% · {active.correct}/{active.attempted}
          </text>
          <text x={Math.min(Math.max(active.x - 78, 2), W - 158) + 12} y={Math.max(active.y - 62, 2) + 38} fontSize="11" fontWeight="600" fill="#A8B2C4" fontFamily={FONT}>
            {scopeLabelFor(active.scopeType, active.scopeId).slice(0, 24)}
          </text>
        </g>
      )}

      {pts.map((p, i) => (
        <rect key={`hit${i}`} x={p.x - innerW / points.length / 2} y={padT} width={Math.max(innerW / points.length, 12)} height={innerH}
          fill="transparent" style={{ cursor: "pointer" }}
          onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
      ))}

      <text x={padL} y={H - 8} fontSize="11" fill={C.faint} fontWeight="700" fontFamily={FONT}>
        {points[0].at.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
      </text>
      <text x={W - padR} y={H - 8} textAnchor="end" fontSize="11" fill={C.faint} fontWeight="700" fontFamily={FONT}>
        {points[points.length - 1].at.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
      </text>
    </svg>
  );
}

// Whole-syllabus shape at a glance: one spoke per inquiry question.
function SyllabusRadar({ areas, onPick, selected }) {
  const on = useMounted(320);
  const size = 340, cx = size / 2, cy = size / 2, R = 116;
  const n = areas.length;
  const angle = (i) => (-Math.PI / 2) + (i * 2 * Math.PI) / n;
  const at = (i, radius) => ({ x: cx + Math.cos(angle(i)) * radius, y: cy + Math.sin(angle(i)) * radius });

  const poly = areas.map((a, i) => {
    const p = at(i, (Math.max(a.accuracy ?? 0, 0) / 100) * R);
    return `${p.x},${p.y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: "100%", maxWidth: 360, height: "auto", display: "block", margin: "0 auto" }}
      role="img" aria-label="Accuracy across all syllabus areas">
      {[25, 50, 75, 100].map(ring => (
        <polygon key={ring}
          points={areas.map((_, i) => { const p = at(i, (ring / 100) * R); return `${p.x},${p.y}`; }).join(" ")}
          fill="none" stroke={ring === 100 ? C.line : C.lineSoft} strokeWidth="1" />
      ))}
      {areas.map((a, i) => {
        const p = at(i, R);
        return <line key={a.id} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={C.lineSoft} strokeWidth="1" />;
      })}

      <g style={{ transformOrigin: `${cx}px ${cy}px`, transform: on ? "scale(1)" : "scale(0)", transition: "transform 1.1s cubic-bezier(.34,1.4,.5,1)" }}>
        <polygon points={poly} fill="rgba(79,70,229,0.18)" stroke={C.brand} strokeWidth="2.5" strokeLinejoin="round" />
        {areas.map((a, i) => {
          const p = at(i, (Math.max(a.accuracy ?? 0, 0) / 100) * R);
          const isSel = selected === a.id;
          return <circle key={a.id} cx={p.x} cy={p.y} r={isSel ? 6.5 : 4} fill={a.attempted ? a.color : C.faint} stroke="#fff" strokeWidth="2" />;
        })}
      </g>

      {areas.map((a, i) => {
        const p = at(i, R + 22);
        const isSel = selected === a.id;
        return (
          <g key={`lbl${a.id}`} style={{ cursor: "pointer" }} onClick={() => onPick(isSel ? null : a.id)}>
            <circle cx={p.x} cy={p.y} r="13" fill={isSel ? a.color : (a.attempted ? `${a.color}1a` : C.lineSoft)} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="10.5" fontWeight="800" fontFamily={FONT}
              fill={isSel ? "#fff" : (a.attempted ? a.color : C.faint)}>{a.id}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Ranked, animated bars -- the drill-down that answers "what should I revise?"
function AreaBar({ area, delay, expanded, onToggle }) {
  const on = useMounted(120 + delay);
  const gc = gradientColor(area.accuracy);
  const started = area.attempted > 0;
  return (
    <div style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
      <button onClick={onToggle}
        style={{ width: "100%", background: expanded ? C.canvas : "transparent", border: "none", cursor: "pointer", padding: "13px 14px", textAlign: "left", fontFamily: FONT, borderRadius: 10, transition: "background .15s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9 }}>
          <span style={{ ...S.badge, background: `${area.color}18`, color: area.color, fontSize: 10.5, minWidth: 40, justifyContent: "center" }}>{area.id}</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: "-0.01em" }}>{area.title}</span>
          {area.delta !== null && area.delta !== undefined && Math.abs(area.delta) >= 5 && (
            <span style={{ ...S.badge, background: area.delta > 0 ? C.goodBg : C.badBg, color: area.delta > 0 ? C.good : C.bad, fontSize: 10.5 }}>
              {area.delta > 0 ? "▲" : "▼"} {Math.abs(area.delta)}%
            </span>
          )}
          <span style={{ fontSize: 15, fontWeight: 800, color: started ? gc.text : C.faint, minWidth: 46, textAlign: "right" }}>
            {started ? `${area.accuracy}%` : "—"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ ...S.progress, flex: 1, height: 9 }}>
            <div style={{
              height: "100%", borderRadius: 99, width: on && started ? `${area.accuracy}%` : "0%",
              background: `linear-gradient(90deg, ${gc.solid}bb, ${gc.solid})`,
              transition: "width 1.1s cubic-bezier(.22,1,.36,1)"
            }} />
          </div>
          <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, minWidth: 92, textAlign: "right" }}>
            {started ? `${area.correct}/${area.attempted} correct` : "Not started"}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="bqc-rise" style={{ padding: "0 14px 15px 14px", background: C.canvas, borderRadius: "0 0 10px 10px" }}>
          <p style={{ margin: "0 0 10px", fontSize: 13.5, color: C.body, fontStyle: "italic", lineHeight: 1.55 }}>“{area.question}”</p>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12, color: C.muted, fontWeight: 600 }}>
            <span>📚 {area.moduleTitle}</span>
            {started && <span>🎯 {area.sessions} session{area.sessions === 1 ? "" : "s"}</span>}
            {started && <span>🕑 Last practised {relativeDay(area.lastAt)}</span>}
            {!started && <span>Nothing practised here yet — a good place to start.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function InsightCard({ tone, icon, title, areas, emptyText }) {
  const positive = tone === "good";
  return (
    <div style={{ ...S.card, padding: "1.15rem 1.25rem", borderLeft: `4px solid ${positive ? C.good : C.warn}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <h3 style={{ ...S.h3, fontSize: 14.5 }}>{title}</h3>
      </div>
      {areas.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 600, lineHeight: 1.5 }}>{emptyText}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {areas.map(a => {
            const gc = gradientColor(a.accuracy);
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ ...S.badge, background: `${a.color}18`, color: a.color, fontSize: 10, minWidth: 36, justifyContent: "center" }}>{a.id}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: C.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: gc.text }}>{a.accuracy}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── MY PROGRESS PAGE ─────────────────────────────────────────────────────────
function ProgressPage({ user, onBack }) {
  const { attempts, loading } = useMyAttempts(user.code);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [sortMode, setSortMode] = useState("syllabus");
  const [openArea, setOpenArea] = useState(null);

  const myModules = useMemo(() => modulesForYear(user.year), [user.year]);
  const a = useMemo(() => computeAnalytics(attempts, myModules), [attempts, myModules]);

  if (loading) {
    return (
      <div style={S.cont}>
        <div style={{ ...S.card, padding: "4rem", textAlign: "center", color: C.muted, fontWeight: 600 }}>
          <div style={{ width: 34, height: 34, margin: "0 auto 14px", border: `3px solid ${C.lineSoft}`, borderTopColor: C.brand, borderRadius: "50%", animation: "bqcSpin .8s linear infinite" }} />
          Crunching your numbers…
        </div>
      </div>
    );
  }

  if (!a.sessionCount) {
    return (
      <div style={S.cont}>
        <button style={{ ...S.btn, ...S.btnOutline, ...S.btnSm, marginBottom: "1.5rem" }} onClick={onBack}>← Home</button>
        <div style={{ ...S.card, textAlign: "center", padding: "3.5rem 2rem" }}>
          <div style={{ fontSize: 52, marginBottom: 14, animation: "bqcFloat 3.5s ease-in-out infinite" }}>📊</div>
          <h2 style={{ ...S.h2, marginBottom: 8 }}>Your progress starts here</h2>
          <p style={{ ...S.sub, maxWidth: 420, margin: "0 auto 1.75rem" }}>
            Finish your first practice session and this page fills up with your accuracy over time, a breakdown of every syllabus area, and which topics to focus on next.
          </p>
          <button style={{ ...S.btn, ...S.btnPrimary, ...S.btnLg }} onClick={onBack}>Start practising →</button>
        </div>
      </div>
    );
  }

  const filteredSeries = (moduleFilter === "all" ? a.series : a.series.filter(s => s.modules.includes(moduleFilter))).slice(-24);
  const accentModule = moduleFilter === "all" ? null : findModule(moduleFilter);
  const accent = accentModule ? accentModule.color : C.brand;

  const visibleAreas = a.areas.filter(ar => moduleFilter === "all" || ar.moduleId === moduleFilter);
  const sortedAreas = sortMode === "weakest"
    ? [...visibleAreas].sort((x, y) => {
        if (x.attempted === 0 && y.attempted === 0) return x.id.localeCompare(y.id);
        if (x.attempted === 0) return 1;
        if (y.attempted === 0) return -1;
        return x.accuracy - y.accuracy;
      })
    : visibleAreas;

  const chip = (active, color) => ({
    ...S.btn, ...S.btnSm, borderRadius: 99, fontSize: 12.5,
    background: active ? color : C.surface,
    color: active ? "#fff" : C.body,
    borderColor: active ? color : C.line,
    boxShadow: active ? `0 2px 8px ${color}44` : "none",
  });

  return (
    <div style={S.cont}>
      <button style={{ ...S.btn, ...S.btnOutline, ...S.btnSm, marginBottom: "1.5rem" }} onClick={onBack}>← Home</button>

      <div style={{ marginBottom: "1.75rem" }}>
        <p style={{ ...S.eyebrow, marginBottom: 7 }}>My Progress</p>
        <h1 style={S.h1}>Hey {(user.name || "").trim().split(/\s+/)[0]}, here's how it's going</h1>
        <p style={{ ...S.sub, marginTop: 9 }}>Every question you've answered, broken down by syllabus area — so you can see exactly what's clicking and what needs another look.</p>
      </div>

      {/* Headline: dial + stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 320px) 1fr", gap: "1.25rem", marginBottom: "1.25rem", alignItems: "stretch" }} className="bqc-progress-hero">
        <div className="bqc-rise" style={{ ...S.card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: `linear-gradient(160deg, #fff 0%, ${C.canvas} 100%)` }}>
          <AccuracyRing pct={a.accuracy} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.body }}>{a.totalCorrect} of {a.totalAttempted} correct</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3, fontWeight: 600 }}>across {a.sessionCount} session{a.sessionCount === 1 ? "" : "s"}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "1.25rem" }}>
          <StatTile icon="✏️" label="Questions done" value={a.totalAttempted} tint={C.info} delay={60} caption={`${a.totalCorrect} correct`} />
          <StatTile icon="🔥" label="Day streak" value={a.streak} tint="#EA580C" delay={120} caption={a.streak > 0 ? "Keep it rolling" : "Practise today to start"} />
          <StatTile icon="📅" label="Days practised" value={a.daysPractised} tint={C.violet} delay={180} caption={`${a.sessionCount} sessions total`} />
          <StatTile icon="🗺️" label="Areas explored" value={a.areas.filter(x => x.attempted > 0).length} suffix={`/${a.areas.length}`} tint={C.brand} delay={240} caption={a.untouched.length ? `${a.untouched.length} not started` : "Every area covered!"} />
        </div>
      </div>

      {/* Module filter */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1.25rem", alignItems: "center" }}>
        <span style={{ ...S.eyebrow, marginRight: 2 }}>Filter</span>
        <button style={chip(moduleFilter === "all", C.ink)} onClick={() => setModuleFilter("all")}>All modules</button>
        {myModules.map(m => (
          <button key={m.id} style={chip(moduleFilter === m.id, m.color)} onClick={() => setModuleFilter(m.id)}>
            {m.icon} Module {m.id.split("-")[1]}
          </button>
        ))}
      </div>

      {/* Trend */}
      <div className="bqc-rise" style={{ ...S.card, marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
          <div>
            <h2 style={S.h2}>Accuracy over time</h2>
            <p style={{ ...S.sub, fontSize: 13.5, marginTop: 4 }}>
              {accentModule ? `Sessions that included ${moduleLabel(accentModule)}` : "Each point is one practice session"} · hover to see details
            </p>
          </div>
          {filteredSeries.length >= 2 && (() => {
            const first = filteredSeries[0].accuracy, last = filteredSeries[filteredSeries.length - 1].accuracy;
            const d = last - first;
            return (
              <span style={{ ...S.badge, background: d >= 0 ? C.goodBg : C.badBg, color: d >= 0 ? C.good : C.bad, fontSize: 12, padding: "6px 12px" }}>
                {d >= 0 ? "▲" : "▼"} {Math.abs(d)}% since {filteredSeries[0].at.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </span>
            );
          })()}
        </div>
        <TrendChart points={filteredSeries} accent={accent} />
      </div>

      {/* Radar + insights */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 420px) 1fr", gap: "1.25rem", marginBottom: "1.25rem" }} className="bqc-progress-hero">
        <div className="bqc-rise" style={S.card}>
          <h2 style={S.h2}>Your syllabus map</h2>
          <p style={{ ...S.sub, fontSize: 13.5, marginTop: 4, marginBottom: 6 }}>The further out a point sits, the stronger that area. Tap a number to inspect it.</p>
          <SyllabusRadar areas={a.areas} selected={openArea} onPick={(id) => { setOpenArea(id); if (id) setSortMode("syllabus"); }} />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 10 }}>
            {myModules.map(m => (
              <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.muted, fontWeight: 700 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: m.color }} /> M{m.id.split("-")[1]}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <InsightCard tone="good" icon="⭐" title="Going well" areas={a.strengths}
            emptyText={`Answer at least ${MIN_SAMPLE} questions in an area and your strongest topics will show up here.`} />
          <InsightCard tone="warn" icon="🎯" title="Worth another look" areas={a.focus}
            emptyText={`Keep practising — once you've done ${MIN_SAMPLE}+ questions in a few areas, we'll point you at the ones to revise.`} />
          {a.mostImproved && (
            <div style={{ ...S.card, padding: "1.15rem 1.25rem", background: `linear-gradient(135deg, ${C.goodBg} 0%, #fff 90%)`, borderColor: "rgba(5,150,105,.25)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontSize: 22 }}>🚀</span>
                <div>
                  <h3 style={{ ...S.h3, fontSize: 14 }}>Biggest improvement</h3>
                  <p style={{ margin: "3px 0 0", fontSize: 13, color: C.body, fontWeight: 600 }}>
                    <strong style={{ color: C.ink }}>{a.mostImproved.id} {a.mostImproved.title}</strong> — up {a.mostImproved.delta}% from
                    {" "}{a.mostImproved.earlyAccuracy}% to {a.mostImproved.lateAccuracy}%.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Per-area breakdown */}
      <div className="bqc-rise" style={{ ...S.card, padding: "1.5rem 1.25rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14, padding: "0 4px" }}>
          <div>
            <h2 style={S.h2}>Every syllabus area</h2>
            <p style={{ ...S.sub, fontSize: 13.5, marginTop: 4 }}>Tap any row for the inquiry question and when you last practised it.</p>
          </div>
          <div style={{ display: "flex", gap: 6, background: C.canvas, padding: 4, borderRadius: 11 }}>
            <button style={{ ...S.btn, ...S.btnSm, background: sortMode === "syllabus" ? C.surface : "transparent", color: sortMode === "syllabus" ? C.ink : C.muted, boxShadow: sortMode === "syllabus" ? SHADOW.sm : "none" }} onClick={() => setSortMode("syllabus")}>Syllabus order</button>
            <button style={{ ...S.btn, ...S.btnSm, background: sortMode === "weakest" ? C.surface : "transparent", color: sortMode === "weakest" ? C.ink : C.muted, boxShadow: sortMode === "weakest" ? SHADOW.sm : "none" }} onClick={() => setSortMode("weakest")}>Weakest first</button>
          </div>
        </div>
        <div>
          {sortedAreas.map((area, i) => (
            <AreaBar key={area.id} area={area} delay={i * 55}
              expanded={openArea === area.id}
              onToggle={() => setOpenArea(openArea === area.id ? null : area.id)} />
          ))}
        </div>
      </div>

      {/* Session history */}
      <div className="bqc-rise" style={S.card}>
        <h2 style={{ ...S.h2, marginBottom: 4 }}>Recent sessions</h2>
        <p style={{ ...S.sub, fontSize: 13.5, marginBottom: 14 }}>Your last {Math.min(12, a.series.length)} of {a.series.length} practice sessions.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...a.series].reverse().slice(0, 12).map(s => {
            const gc = gradientColor(s.accuracy);
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 12, background: C.canvas, flexWrap: "wrap" }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, background: gc.bg, color: gc.text, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13.5, flexShrink: 0 }}>
                  {s.accuracy}%
                </div>
                <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {scopeLabelFor(s.scopeType, s.scopeId)}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginTop: 2 }}>
                    {relativeDay(s.at)} · {s.at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </div>
                </div>
                <span style={{ ...S.badge, background: C.surface, color: C.body, border: `1px solid ${C.line}` }}>{s.correct}/{s.attempted}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── QUESTION EDITOR ──────────────────────────────────────────────────────────
function QuestionEditor({ question, onSave, onCancel }) {
  const [q, setQ] = useState(question);

  const updateField = (field, value) => setQ(prev => ({ ...prev, [field]: value }));
  const updatePair = (idx, field, value) => { const newPairs = [...(q.pairs || [])]; newPairs[idx] = { ...newPairs[idx], [field]: value }; setQ(prev => ({ ...prev, pairs: newPairs })); };
  const updateItem = (idx, value) => { const newItems = [...(q.items || [])]; newItems[idx] = value; setQ(prev => ({ ...prev, items: newItems })); };
  const updateBankWord = (idx, value) => { const nb = [...(q.bank || [])]; while (nb.length < 8) nb.push(""); nb[idx] = value; setQ(prev => ({ ...prev, bank: nb })); };
  // blankIdx -1 clears a word's assignment (marks it a distractor); otherwise
  // assigns it to that blank, stealing the slot from any other word that had it.
  const setWordBankAnswerSlot = (word, blankIdx, blanksCount) => {
    const cur = Array.isArray(q.answer) ? [...q.answer] : (q.answer ? [q.answer] : []);
    while (cur.length < blanksCount) cur.push("");
    for (let i = 0; i < cur.length; i++) if (cur[i] === word) cur[i] = "";
    if (blankIdx >= 0) cur[blankIdx] = word;
    setQ(prev => ({ ...prev, answer: blanksCount === 1 ? (cur[0] || "") : cur }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <label style={S.label}>Type</label>
        <select value={q.type || ""} onChange={e => setQ({ ...question, type: e.target.value })} style={{ ...S.input, fontFamily: FONT }}>
          <option value="multiple-choice">Multiple Choice</option>
          <option value="true-false">True/False</option>
          <option value="word-bank">Word Bank</option>
          <option value="drag-drop">Drag Drop (Matching)</option>
          <option value="ordering">Ordering</option>
          <option value="numeric-entry">Numeric Entry</option>
        </select>
      </div>
      <div>
        <label style={S.label}>Prompt / Question Text</label>
        <textarea value={q.prompt || ""} onChange={e => updateField("prompt", e.target.value)}
          style={{ ...S.input, minHeight: 80, resize: "vertical", fontFamily: FONT }} placeholder="Enter the question or prompt here. Wrap maths in $...$ (inline) or $$...$$ (display)." />
        {(q.prompt || "").includes("$") && (
          <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: C.canvas, border: `1px solid ${C.line}`, fontSize: 14, lineHeight: 1.5 }}>
            <span style={{ ...S.eyebrow, fontSize: 10, display: "block", marginBottom: 4 }}>Preview</span>
            {renderRich(q.prompt)}
          </div>
        )}
      </div>
      <div>
        <label style={S.label}>Image URL (optional)</label>
        <input value={q.image || ""} onChange={e => updateField("image", e.target.value)} style={S.input} placeholder="https://example.com/image.png" />
      </div>

      <div>
        <label style={S.label}>Tip (shown only if the student answers incorrectly)</label>
        <textarea value={q.hint || ""} onChange={e => updateField("hint", e.target.value)}
          style={{ ...S.input, minHeight: 56, resize: "vertical", fontFamily: FONT }}
          placeholder="One sentence pointing the student towards the idea, e.g. the relevant formula or principle." />
      </div>

      {q.type === "multiple-choice" && (
        <div>
          <label style={S.label}>Options</label>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <input value={q.options?.[i] || ""} onChange={e => { const no = [...(q.options || ["", "", "", ""])]; no[i] = e.target.value; setQ(prev => ({ ...prev, options: no })); }} style={{ ...S.input, flex: 1 }} placeholder={`Option ${i + 1}`} />
              <input type="radio" name="answer" checked={q.answer === q.options?.[i]} onChange={() => updateField("answer", q.options?.[i])} style={{ width: 20, height: 20, cursor: "pointer" }} title="Select as correct answer" />
            </div>
          ))}
        </div>
      )}

      {q.type === "true-false" && (
        <div>
          <label style={S.label}>Correct Answer</label>
          <div style={{ display: "flex", gap: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="radio" name="tfAnswer" checked={q.answer === "True"} onChange={() => updateField("answer", "True")} /><span>True</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="radio" name="tfAnswer" checked={q.answer === "False"} onChange={() => updateField("answer", "False")} /><span>False</span>
            </label>
          </div>
        </div>
      )}

      {q.type === "word-bank" && (() => {
        const blanksCount = Math.max(1, Math.min(3, ((q.prompt || "").match(/___/g) || []).length || 1));
        const answerArr = Array.isArray(q.answer) ? q.answer : (q.answer ? [q.answer] : []);
        return (
          <div>
            <label style={S.label}>Word Bank (up to 8 words) — prompt has {blanksCount} blank{blanksCount > 1 ? "s" : ""}</label>
            {Array.from({ length: 8 }).map((_, i) => {
              const word = q.bank?.[i] || "";
              const assignedBlank = word ? answerArr.indexOf(word) : -1;
              return (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <input value={word} onChange={e => updateBankWord(i, e.target.value)} style={{ ...S.input, flex: 1 }} placeholder={`Word ${i + 1}`} />
                  <select value={String(assignedBlank)} disabled={!word}
                    onChange={e => setWordBankAnswerSlot(word, Number(e.target.value), blanksCount)}
                    style={{ ...S.input, width: 140, fontFamily: FONT }}>
                    <option value="-1">Distractor</option>
                    {Array.from({ length: blanksCount }).map((_, b) => <option key={b} value={b}>Blank {b + 1}</option>)}
                  </select>
                </div>
              );
            })}
            <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0" }}>Note: use ___ in the prompt for each blank (up to 3, in order). Mark which bank word is correct for each blank above.</p>
          </div>
        );
      })()}

      {q.type === "drag-drop" && (
        <div>
          <label style={S.label}>Pairs (Item → Match)</label>
          {(q.pairs || []).map((pair, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input value={pair.item || ""} onChange={e => updatePair(i, "item", e.target.value)} style={{ ...S.input, flex: 1 }} placeholder="Item" />
              <span style={{ padding: "8px 0", fontSize: 14 }}>→</span>
              <input value={pair.match || ""} onChange={e => updatePair(i, "match", e.target.value)} style={{ ...S.input, flex: 1 }} placeholder="Match" />
              <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSm }} onClick={() => {
                const newPairs = q.pairs.filter((_, idx) => idx !== i);
                const newAns = { ...(q.answer || {}) }; delete newAns[pair.item];
                setQ(prev => ({ ...prev, pairs: newPairs, answer: newAns }));
              }}>Delete</button>
            </div>
          ))}
          <button style={{ ...S.btn, ...S.btnOutline, ...S.btnSm, marginTop: 8 }} onClick={() => setQ(prev => ({ ...prev, pairs: [...(prev.pairs || []), { item: "", match: "" }] }))}>+ Add Pair</button>
        </div>
      )}

      {q.type === "ordering" && (
        <div>
          <label style={S.label}>Items to Order (in correct sequence)</label>
          {(q.items || []).map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <span style={{ padding: "8px 12px", background: C.lineSoft, borderRadius: 6, fontWeight: 700, minWidth: 30, textAlign: "center" }}>{i + 1}</span>
              <input value={item || ""} onChange={e => updateItem(i, e.target.value)} style={{ ...S.input, flex: 1 }} placeholder={`Step ${i + 1}`} />
              <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSm }} onClick={() => { const ni = q.items.filter((_, idx) => idx !== i); setQ(prev => ({ ...prev, items: ni, answer: ni })); }}>Delete</button>
            </div>
          ))}
          <button style={{ ...S.btn, ...S.btnOutline, ...S.btnSm, marginTop: 8 }} onClick={() => setQ(prev => ({ ...prev, items: [...(prev.items || []), ""], answer: [...(prev.answer || []), ""] }))}>+ Add Step</button>
          <p style={{ fontSize: 12, color: "#888", margin: "8px 0 0" }}>Items will be shown in random order to students; you're setting the correct sequence here.</p>
        </div>
      )}

      {q.type === "numeric-entry" && (
        <>
          <div>
            <label style={S.label}>Correct value</label>
            <input type="number" step="any" value={q.answer ?? ""}
              onChange={e => updateField("answer", e.target.value === "" ? "" : Number(e.target.value))}
              style={S.input} placeholder="e.g. 19.6" />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Tolerance</label>
              <input type="number" step="any" value={q.tolerance ?? ""}
                onChange={e => updateField("tolerance", e.target.value === "" ? null : Number(e.target.value))}
                style={S.input} placeholder="2" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Tolerance mode</label>
              <select value={q.tolerance_mode || "relative"} onChange={e => updateField("tolerance_mode", e.target.value)} style={{ ...S.input, fontFamily: FONT }}>
                <option value="relative">Relative (%)</option>
                <option value="absolute">Absolute (± value)</option>
              </select>
            </div>
          </div>
          <div>
            <label style={S.label}>Unit (shown beside the input, not typed)</label>
            <input value={q.unit || ""} onChange={e => updateField("unit", e.target.value)} style={S.input} placeholder="$\mathrm{m\ s^{-1}}$" />
          </div>
          <p style={{ fontSize: 12, color: "#888", margin: "-4px 0 0" }}>Blank tolerance defaults to ±2% (relative). Use Absolute whenever the correct value is 0.</p>
        </>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button style={{ ...S.btn, ...S.btnPrimary, flex: 1, justifyContent: "center" }} onClick={() => onSave(q)}>Save Question</button>
        <button style={{ ...S.btn, ...S.btnOutline, flex: 1, justifyContent: "center" }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
function AdminPanel({ questions, questionsApi, users, usersApi, flagsApi, onBack }) {
  const adminSettings = useAdminSettings();
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [tab, setTab] = useState("questions");
  const [pwModalOpen, setPwModalOpen] = useState(false);

  if (adminSettings.loading) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontWeight: 600 }}>
        <style>{GLOBAL_CSS}</style>
        Loading...
      </div>
    );
  }

  const tryLogin = () => pw === adminSettings.adminPassword ? setAuthed(true) : setPwErr("Incorrect password.");

  if (!authed) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
        <style>{GLOBAL_CSS}</style>
        <div className="bqc-rise" style={{ ...S.card, width: "100%", maxWidth: 380, padding: "2rem", boxShadow: SHADOW.lg }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔐</div>
          <h2 style={{ ...S.h2, marginBottom: 6 }}>Admin Access</h2>
          <p style={{ ...S.sub, fontSize: 13.5, marginBottom: "1.5rem" }}>Enter the admin password to manage questions and students.</p>
          <input type="password" style={{ ...S.input, marginBottom: 12 }} placeholder="Password" value={pw} autoFocus
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && tryLogin()} />
          {pwErr && <p style={{ color: C.bad, fontSize: 13, margin: "0 0 12px", fontWeight: 600 }}>⚠️ {pwErr}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ ...S.btn, ...S.btnPrimary, ...S.btnLg, flex: 1 }} onClick={tryLogin}>Enter</button>
            <button style={{ ...S.btn, ...S.btnOutline, ...S.btnLg }} onClick={onBack}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{GLOBAL_CSS}</style>
      <div style={S.cont}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: 10 }}>
        <h1 style={S.h1}>Admin Panel</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...S.btn, ...S.btnOutline, ...S.btnSm }} onClick={() => setPwModalOpen(true)}>Change Password</button>
          <button style={{ ...S.btn, ...S.btnOutline, ...S.btnSm }} onClick={onBack}>Exit Admin</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <button style={S.tabBtn(tab === "questions")} onClick={() => setTab("questions")}>Questions</button>
        <button style={S.tabBtn(tab === "flags")} onClick={() => setTab("flags")}>
          Flags {flagsApi.flags.filter(f => !f.resolved).length > 0 && `(${flagsApi.flags.filter(f => !f.resolved).length})`}
        </button>
        <button style={S.tabBtn(tab === "students")} onClick={() => setTab("students")}>Students</button>
        <button style={S.tabBtn(tab === "progress")} onClick={() => setTab("progress")}>Progress</button>
      </div>

      {tab === "questions" && <AdminQuestions questions={questions} questionsApi={questionsApi} />}
      {tab === "flags" && <AdminFlags flagsApi={flagsApi} questions={questions} questionsApi={questionsApi} users={users} />}
      {tab === "students" && <AdminStudents users={users} usersApi={usersApi} />}
      {tab === "progress" && <AdminProgress users={users} />}

      {pwModalOpen && <ChangePasswordModal adminSettings={adminSettings} onClose={() => setPwModalOpen(false)} />}
      </div>
    </div>
  );
}

function ChangePasswordModal({ adminSettings, onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setErr("");
    if (current !== adminSettings.adminPassword) { setErr("Current password is incorrect."); return; }
    if (next.length < 6) { setErr("New password must be at least 6 characters."); return; }
    if (next !== confirm) { setErr("New password and confirmation don't match."); return; }
    const ok = await adminSettings.updatePassword(next);
    if (!ok) {
      setErr(adminSettings.migrationMissing
        ? "Couldn't save — the app_settings table doesn't exist yet. Run admin_password_setup.sql in the Supabase SQL editor first."
        : "Couldn't save the new password — check the console for details.");
      return;
    }
    setSaved(true);
  };

  return (
    <div style={S.modal}>
      <div style={S.modalBox}>
        <h3 style={{ margin: "0 0 14px" }}>Change Admin Password</h3>
        {saved ? (
          <>
            <p style={{ color: "#065f46", fontSize: 14, margin: "0 0 1.5rem" }}>Password updated. Use your new password next time you enter the admin panel.</p>
            <button style={{ ...S.btn, ...S.btnPrimary, width: "100%", justifyContent: "center" }} onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            {adminSettings.migrationMissing && (
              <p style={{ fontSize: 12, color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px", margin: "0 0 1rem" }}>
                One-time setup needed: run <code>admin_password_setup.sql</code> in the Supabase SQL editor before this can be saved.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: "1.25rem" }}>
              <div>
                <label style={S.label}>Current Password</label>
                <input type="password" style={S.input} value={current} onChange={e => setCurrent(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>New Password</label>
                <input type="password" style={S.input} value={next} onChange={e => setNext(e.target.value)} placeholder="At least 6 characters" />
              </div>
              <div>
                <label style={S.label}>Confirm New Password</label>
                <input type="password" style={S.input} value={confirm} onChange={e => setConfirm(e.target.value)} />
              </div>
            </div>
            {err && <p style={{ color: "#DC2626", fontSize: 13, margin: "0 0 12px" }}>{err}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...S.btn, ...S.btnPrimary, flex: 1, justifyContent: "center" }} onClick={save}>Save</button>
              <button style={{ ...S.btn, ...S.btnOutline, flex: 1, justifyContent: "center" }} onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AdminQuestions({ questions, questionsApi }) {
  const [moduleId, setModuleId] = useState(MODULE_DEFS[0].id);
  const mod = findModule(moduleId);
  const [inquiryId, setInquiryId] = useState(mod.inquiries[0].id);
  const [editing, setEditing] = useState(null); // question object or "new"
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkErr, setBulkErr] = useState("");

  const changeModule = (id) => { setModuleId(id); setInquiryId(findModule(id).inquiries[0].id); };

  const bankQuestions = questions.filter(q => q.inquiry_id === inquiryId);

  const blankQuestion = { type: "multiple-choice", prompt: "", image: "", options: ["", "", "", ""], answer: "" };

  const saveQuestion = async (q) => {
    if (editing && editing.id) await questionsApi.updateQuestion(editing.id, q);
    else await questionsApi.addQuestion(moduleId, inquiryId, q);
    setEditing(null);
  };

  const runBulkImport = async () => {
    setBulkErr("");
    let parsed;
    try { parsed = JSON.parse(bulkText); } catch (e) { setBulkErr("Invalid JSON — check the format guide."); return; }
    if (!Array.isArray(parsed)) { setBulkErr("Expected a JSON array of question objects."); return; }
    const ok = await questionsApi.addQuestionsBulk(moduleId, inquiryId, parsed);
    if (!ok) { setBulkErr("Import failed — check the console for details."); return; }
    setBulkText(""); setBulkOpen(false);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <select value={moduleId} onChange={e => changeModule(e.target.value)} style={{ ...S.input, width: "auto", minWidth: 220 }}>
          {MODULE_DEFS.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
        <select value={inquiryId} onChange={e => setInquiryId(e.target.value)} style={{ ...S.input, width: "auto", minWidth: 220 }}>
          {mod.inquiries.map(i => <option key={i.id} value={i.id}>{i.id} — {i.title}</option>)}
        </select>
      </div>

      <div style={{ ...S.card, marginBottom: "1.25rem" }}>
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "#666", fontStyle: "italic" }}>{findInquiry(inquiryId)?.question}</p>
        <p style={{ margin: 0, fontSize: 12, color: "#aaa" }}>{bankQuestions.length} question{bankQuestions.length === 1 ? "" : "s"} in this bank</p>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: "1.25rem" }}>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setEditing({ id: null, ...blankQuestion })}>+ Add Question</button>
        <button style={{ ...S.btn, ...S.btnOutline }} onClick={() => setBulkOpen(true)}>Bulk Import (JSON)</button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={S.th}>Prompt</th>
              <th style={S.th}>Type</th>
              <th style={S.th}></th>
            </tr>
          </thead>
          <tbody>
            {bankQuestions.map(q => (
              <tr key={q.id}>
                <td style={{ ...S.td, maxWidth: 360 }}>{renderRich(q.prompt)}</td>
                <td style={S.td}>{q.type}</td>
                <td style={S.td}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ ...S.btn, ...S.btnOutline, ...S.btnSm }} onClick={() => setEditing(q)}>Edit</button>
                    <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSm }} onClick={() => { if (confirm("Delete this question?")) questionsApi.deleteQuestion(q.id); }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {bankQuestions.length === 0 && (
              <tr><td style={S.td} colSpan={3}><span style={{ color: "#aaa" }}>No questions yet for this inquiry question.</span></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div style={S.modal}>
          <div style={S.modalBox}>
            <h3 style={{ margin: "0 0 14px" }}>{editing.id ? "Edit Question" : "New Question"}</h3>
            <QuestionEditor question={editing} onSave={saveQuestion} onCancel={() => setEditing(null)} />
          </div>
        </div>
      )}

      {bulkOpen && (
        <div style={S.modal}>
          <div style={{ ...S.modalBox, maxWidth: 640 }}>
            <h3 style={{ margin: "0 0 6px" }}>Bulk Import Questions</h3>
            <p style={{ fontSize: 13, color: "#666", margin: "0 0 12px" }}>Imports into <strong>{mod.title} → {inquiryId} {findInquiry(inquiryId)?.title}</strong> and is immediately visible to students. Paste a JSON array in this format:</p>
            <pre style={{ background: C.canvas, padding: 12, borderRadius: 8, fontSize: 11, overflowX: "auto", marginBottom: 12 }}>{FORMAT_GUIDE}</pre>
            <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} style={{ ...S.input, minHeight: 160, fontFamily: "monospace", fontSize: 12, marginBottom: 10 }} placeholder="Paste JSON array here..." />
            {bulkErr && <p style={{ color: "#DC2626", fontSize: 13, margin: "0 0 10px" }}>{bulkErr}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...S.btn, ...S.btnPrimary, flex: 1, justifyContent: "center" }} onClick={runBulkImport}>Import</button>
              <button style={{ ...S.btn, ...S.btnOutline, flex: 1, justifyContent: "center" }} onClick={() => { setBulkOpen(false); setBulkErr(""); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminFlags({ flagsApi, questions, questionsApi, users }) {
  const [editing, setEditing] = useState(null);
  const unresolved = flagsApi.flags.filter(f => !f.resolved);
  const questionById = id => questions.find(q => q.id === id);
  const flaggedByName = code => users[code]?.name ? `${users[code].name} (${code})` : code;

  return (
    <div>
      {unresolved.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", padding: "2.5rem" }}>
          <p style={{ color: "#aaa" }}>No open flags. 🎉</p>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {unresolved.map(f => {
          const q = questionById(f.question_id);
          return (
            <div key={f.id} style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 300px" }}>
                  <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>{q ? renderRich(q.prompt) : "(question deleted)"}</p>
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: "#888" }}>Flagged by {flaggedByName(f.user_code)} · {new Date(f.created_at).toLocaleString()}</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {f.reasons.map(r => {
                      const reason = FLAG_REASONS.find(fr => fr.id === r);
                      return <span key={r} style={{ ...S.badge, background: "#f3e8ff", color: "#4c1d95" }}>{reason?.icon} {reason?.label}</span>;
                    })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  {q && <button style={{ ...S.btn, ...S.btnOutline, ...S.btnSm }} onClick={() => setEditing(q)}>Edit Question</button>}
                  {q && (
                    <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSm }}
                      onClick={async () => {
                        if (!confirm("Delete this question entirely? This removes it for all students and clears this flag.")) return;
                        await questionsApi.deleteQuestion(q.id);
                        await flagsApi.reload();
                      }}>
                      Delete Question
                    </button>
                  )}
                  <button style={{ ...S.btn, ...S.btnSuccess, ...S.btnSm }} onClick={() => flagsApi.resolveFlag(f.id)}>Resolve</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div style={S.modal}>
          <div style={S.modalBox}>
            <h3 style={{ margin: "0 0 14px" }}>Edit Question</h3>
            <QuestionEditor question={editing} onSave={async q => { await questionsApi.updateQuestion(editing.id, q); setEditing(null); }} onCancel={() => setEditing(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LOGIN CARDS (PRINT / PDF) ─────────────────────────────────────────────
const CARDS_PER_PAGE = 27; // 3 columns x 9 rows

function LoginCardsPrint({ students, onClose }) {
  const pages = [];
  for (let i = 0; i < students.length; i += CARDS_PER_PAGE) pages.push(students.slice(i, i + CARDS_PER_PAGE));

  return (
    <div id="login-cards-print" style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 500, overflowY: "auto" }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #login-cards-print, #login-cards-print * { visibility: visible; }
          #login-cards-print { position: absolute; inset: 0; }
          .no-print { display: none !important; }
          .print-page { page-break-after: always; height: 277mm; }
          .print-page:last-child { page-break-after: auto; }
        }
        @page { size: A4 portrait; margin: 10mm; }
      `}</style>

      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "1rem 1.5rem", borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
        <div>
          <h2 style={{ margin: "0 0 2px", fontSize: 18 }}>Print Login Cards</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#777" }}>{students.length} card{students.length === 1 ? "" : "s"} · {pages.length} page{pages.length === 1 ? "" : "s"} · 3 × 9 per page</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => window.print()}>🖨️ Print / Save as PDF</button>
          <button style={{ ...S.btn, ...S.btnOutline }} onClick={onClose}>Close</button>
        </div>
      </div>

      <div style={{ padding: "1.5rem" }}>
        {pages.map((pageStudents, pi) => (
          <div key={pi} className="print-page" style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "repeat(9, 1fr)",
            gap: 8, maxWidth: 900, margin: "0 auto 2rem", minHeight: 600
          }}>
            {pageStudents.map(s => (
              <div key={s.code} style={{
                border: "1.5px dashed #ccc", borderRadius: 8, padding: "8px 10px",
                display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
                textAlign: "center", gap: 3, minHeight: 60
              }}>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: "#999", textTransform: "uppercase" }}>{SCHOOL_NAME}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, lineHeight: 1.2 }}>{s.name}</div>
                <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 0.5, color: "#aaa", marginTop: 2 }}>LOGIN CODE</div>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 1, fontFamily: "monospace", color: "#1D9E75" }}>{s.code}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Per-student summary for teachers/admins: reuses the same analytics engine
// as the student's own Progress page, scoped to just this one student's attempts.
function StudentProfileModal({ code, info, onClose }) {
  const { attempts, loading } = useMyAttempts(code);
  const myModules = useMemo(() => modulesForYear(info.year), [info.year]);
  const a = useMemo(() => computeAnalytics(attempts, myModules), [attempts, myModules]);

  const statBlock = (label, value, caption) => (
    <div style={{ ...S.card, padding: "12px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.ink }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>{label}</div>
      {caption && <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>{caption}</div>}
    </div>
  );

  return (
    <div style={S.modal} onClick={onClose}>
      <div style={{ ...S.modalBox, maxWidth: 620 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 10 }}>
          <div>
            <h3 style={{ margin: "0 0 4px" }}>{info.name}</h3>
            <p style={{ margin: 0, fontSize: 13, color: C.muted, fontFamily: "monospace" }}>{code} · {info.className || "No class"} · Year {info.year || "—"}</p>
          </div>
          <button style={{ ...S.btn, ...S.btnOutline, ...S.btnSm }} onClick={onClose}>Close</button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "2.5rem", color: C.muted }}>
            <div style={{ width: 30, height: 30, margin: "0 auto 12px", border: `3px solid ${C.lineSoft}`, borderTopColor: C.brand, borderRadius: "50%", animation: "bqcSpin .8s linear infinite" }} />
            Loading progress…
          </div>
        ) : !a.sessionCount ? (
          <div style={{ ...S.card, textAlign: "center", padding: "2rem", color: C.muted }}>This student hasn't completed any practice attempts yet.</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: "1.25rem" }}>
              {statBlock("Accuracy", `${a.accuracy}%`, `${a.totalCorrect}/${a.totalAttempted} correct`)}
              {statBlock("Sessions", a.sessionCount)}
              {statBlock("Day streak", a.streak)}
              {statBlock("Days practised", a.daysPractised)}
            </div>

            <h4 style={{ ...S.h3, fontSize: 14, marginBottom: 8 }}>By module</h4>
            <div style={{ overflowX: "auto", marginBottom: "1.25rem" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={S.th}>Module</th><th style={S.th}>Questions</th><th style={S.th}>Accuracy</th></tr></thead>
                <tbody>
                  {myModules.map(m => {
                    const b = a.byModule[m.id];
                    const gc = gradientColor(b?.accuracy ?? null);
                    return (
                      <tr key={m.id}>
                        <td style={S.td}>{m.icon} {m.title}</td>
                        <td style={S.td}>{b?.attempted || 0}</td>
                        <td style={S.td}>{b?.accuracy != null ? <span style={{ ...S.badge, background: gc.bg, color: gc.text }}>{b.accuracy}%</span> : <span style={{ color: "#ccc" }}>—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: "1.25rem" }}>
              <div>
                <h4 style={{ ...S.h3, fontSize: 14, marginBottom: 8 }}>💪 Strengths</h4>
                {a.strengths.length ? a.strengths.map(s => (
                  <div key={s.id} style={{ fontSize: 13, marginBottom: 4 }}>{s.title} <span style={{ color: C.good, fontWeight: 700 }}>{s.accuracy}%</span></div>
                )) : <p style={{ fontSize: 12.5, color: C.faint, margin: 0 }}>Not enough attempts yet to tell.</p>}
              </div>
              <div>
                <h4 style={{ ...S.h3, fontSize: 14, marginBottom: 8 }}>🎯 Focus areas</h4>
                {a.focus.length ? a.focus.map(s => (
                  <div key={s.id} style={{ fontSize: 13, marginBottom: 4 }}>{s.title} <span style={{ color: C.bad, fontWeight: 700 }}>{s.accuracy}%</span></div>
                )) : <p style={{ fontSize: 12.5, color: C.faint, margin: 0 }}>Not enough attempts yet to tell.</p>}
              </div>
            </div>

            <h4 style={{ ...S.h3, fontSize: 14, marginBottom: 8 }}>Recent activity</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[...a.series].reverse().slice(0, 8).map(s => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "5px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
                  <span style={{ color: C.muted }}>{s.at.toLocaleDateString()}</span>
                  <span>{s.correct}/{s.attempted} correct ({s.accuracy}%)</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AdminStudents({ users, usersApi }) {
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", className: "", year: "" });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkErr, setBulkErr] = useState("");
  const [selected, setSelected] = useState([]);
  const [printCards, setPrintCards] = useState(null); // array of {code, name} or null
  const [profileCode, setProfileCode] = useState(null);
  const [yearFilter, setYearFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [sort, setSort] = useState({ field: "code", dir: "asc" });

  const codes = Object.keys(users).sort();
  const allYears = useMemo(() => [...new Set(codes.map(c => String(users[c].year || "").trim()).filter(Boolean))].sort(), [users]);
  const allClasses = useMemo(() => [...new Set(codes.map(c => users[c].className).filter(Boolean))].sort(), [users]);

  const toggleSort = (field) => setSort(s => s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" });
  const sortArrow = (field) => sort.field !== field ? "" : (sort.dir === "asc" ? " ▲" : " ▼");
  const sortableTh = (field, label) => (
    <th style={{ ...S.th, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort(field)}>{label}{sortArrow(field)}</th>
  );

  const filteredCodes = useMemo(() => {
    const field = { code: c => c, name: c => users[c].name, className: c => users[c].className, year: c => users[c].year }[sort.field] || (c => c);
    return codes
      .filter(c => (yearFilter === "all" || String(users[c].year || "").trim() === yearFilter) && (classFilter === "all" || users[c].className === classFilter))
      .sort((a, b) => {
        const cmp = String(field(a) || "").localeCompare(String(field(b) || ""), undefined, { numeric: true, sensitivity: "base" });
        return sort.dir === "asc" ? cmp : -cmp;
      });
  }, [codes, users, yearFilter, classFilter, sort]);

  const addSingle = async () => {
    if (!form.code.trim() || !form.name.trim()) return;
    const ok = await usersApi.addUser(form.code.trim().toUpperCase(), { name: form.name.trim(), className: form.className.trim(), year: form.year.trim() });
    if (ok) { setForm({ code: "", name: "", className: "", year: "" }); setAddOpen(false); }
  };

  const runBulk = async () => {
    setBulkErr("");
    const lines = bulkText.split("\n").map(l => l.trim()).filter(Boolean);
    const records = [];
    for (const line of lines) {
      const parts = line.split(",").map(p => p.trim());
      if (parts.length < 4) { setBulkErr(`Line skipped (needs 4 fields): ${line}`); continue; }
      const [lastName, firstName, className, year, code] = parts;
      records.push({ code: (code || "").toUpperCase(), name: `${firstName} ${lastName}`, className, year });
    }
    if (!records.length) { setBulkErr("No valid rows found."); return; }
    const ok = await usersApi.addUsersBulk(records);
    if (!ok) { setBulkErr("Import failed — a code may already exist."); return; }
    setBulkText(""); setBulkOpen(false);
  };

  const toggleSelect = (code) => setSelected(p => p.includes(code) ? p.filter(c => c !== code) : [...p, code]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <select style={{ ...S.input, width: "auto", minWidth: 140 }} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
          <option value="all">All years</option>
          {allYears.map(y => <option key={y} value={y}>Year {y}</option>)}
        </select>
        <select style={{ ...S.input, width: "auto", minWidth: 160 }} value={classFilter} onChange={e => setClassFilter(e.target.value)}>
          <option value="all">All classes</option>
          {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(yearFilter !== "all" || classFilter !== "all") && (
          <span style={{ fontSize: 12.5, color: "#888" }}>{filteredCodes.length} of {codes.length} students</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setAddOpen(true)}>+ Add Student</button>
        <button style={{ ...S.btn, ...S.btnOutline }} onClick={() => setBulkOpen(true)}>Bulk Import</button>
        <button style={{ ...S.btn, ...S.btnOutline }}
          onClick={() => {
            const targetCodes = selected.length ? selected : filteredCodes;
            setPrintCards(targetCodes.map(c => ({ code: c, name: users[c].name })));
          }}
          disabled={filteredCodes.length === 0}>
          🖨️ Print Login Cards{selected.length > 0 ? ` (${selected.length})` : (yearFilter !== "all" || classFilter !== "all") ? ` (${filteredCodes.length})` : ""}
        </button>
        {selected.length > 0 && (
          <button style={{ ...S.btn, ...S.btnDanger }} onClick={() => { if (confirm(`Remove ${selected.length} student(s)?`)) { usersApi.removeUsersBulk(selected); setSelected([]); } }}>
            Remove Selected ({selected.length})
          </button>
        )}
        {classFilter !== "all" && (
          <button style={{ ...S.btn, ...S.btnDanger }}
            onClick={() => {
              const classCodes = filteredCodes;
              if (classCodes.length === 0) return;
              const typed = prompt(`This permanently deletes all ${classCodes.length} student(s) in "${classFilter}" and their entire quiz history. This cannot be undone.\n\nType the class name to confirm:`);
              if (typed !== classFilter) { if (typed !== null) alert("Class name didn't match — nothing was deleted."); return; }
              usersApi.removeUsersBulk(classCodes);
              setSelected(p => p.filter(c => !classCodes.includes(c)));
              setClassFilter("all");
            }}>
            🗑️ Delete Class "{classFilter}" ({filteredCodes.length})
          </button>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={S.th}></th>
              {sortableTh("code", "Code")}
              {sortableTh("name", "Name")}
              {sortableTh("className", "Class")}
              {sortableTh("year", "Year")}
              <th style={S.th}></th>
            </tr>
          </thead>
          <tbody>
            {filteredCodes.map(code => (
              <tr key={code}>
                <td style={S.td}><input type="checkbox" checked={selected.includes(code)} onChange={() => toggleSelect(code)} /></td>
                <td style={S.td}>{code}</td>
                <td style={S.td}>{users[code].name}</td>
                <td style={S.td}>{users[code].className}</td>
                <td style={S.td}>{users[code].year}</td>
                <td style={S.td}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ ...S.btn, ...S.btnOutline, ...S.btnSm }} onClick={() => setProfileCode(code)}>Profile</button>
                    <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSm }} onClick={() => { if (confirm(`Remove ${code}?`)) usersApi.removeUser(code); }}>Remove</button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredCodes.length === 0 && <tr><td style={S.td} colSpan={6}><span style={{ color: "#aaa" }}>No students match this filter.</span></td></tr>}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <div style={S.modal}>
          <div style={S.modalBox}>
            <h3 style={{ margin: "0 0 14px" }}>Add Student</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: "1.5rem" }}>
              <div><label style={S.label}>Login Code</label><input style={S.input} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="STU-1234" /></div>
              <div><label style={S.label}>Name</label><input style={S.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" /></div>
              <div><label style={S.label}>Class</label><input style={S.input} value={form.className} onChange={e => setForm(f => ({ ...f, className: e.target.value }))} placeholder="12PHYS1" /></div>
              <div><label style={S.label}>Year</label><input style={S.input} value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} placeholder="12" /></div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...S.btn, ...S.btnPrimary, flex: 1, justifyContent: "center" }} onClick={addSingle}>Add</button>
              <button style={{ ...S.btn, ...S.btnOutline, flex: 1, justifyContent: "center" }} onClick={() => setAddOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {bulkOpen && (
        <div style={S.modal}>
          <div style={{ ...S.modalBox, maxWidth: 640 }}>
            <h3 style={{ margin: "0 0 6px" }}>Bulk Import Students</h3>
            <p style={{ fontSize: 13, color: "#666", margin: "0 0 8px" }}>One student per line: <code>Last, First, Class, Year, Code</code></p>
            <pre style={{ background: C.canvas, padding: 12, borderRadius: 8, fontSize: 12, marginBottom: 12 }}>{BULK_STUDENT_GUIDE}</pre>
            <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} style={{ ...S.input, minHeight: 140, fontFamily: "monospace", fontSize: 12, marginBottom: 10 }} placeholder="Paste rows here..." />
            {bulkErr && <p style={{ color: "#DC2626", fontSize: 13, margin: "0 0 10px" }}>{bulkErr}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...S.btn, ...S.btnPrimary, flex: 1, justifyContent: "center" }} onClick={runBulk}>Import</button>
              <button style={{ ...S.btn, ...S.btnOutline, flex: 1, justifyContent: "center" }} onClick={() => { setBulkOpen(false); setBulkErr(""); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {printCards && <LoginCardsPrint students={printCards} onClose={() => setPrintCards(null)} />}
      {profileCode && <StudentProfileModal code={profileCode} info={users[profileCode]} onClose={() => setProfileCode(null)} />}
    </div>
  );
}

function AdminProgress({ users }) {
  const { attempts, loading } = useAllAttempts();
  const codes = Object.keys(users).sort();
  const [yearFilter, setYearFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [sort, setSort] = useState({ field: "name", dir: "asc" });

  const allYears = useMemo(() => [...new Set(codes.map(c => String(users[c].year || "").trim()).filter(Boolean))].sort(), [users]);
  const allClasses = useMemo(() => [...new Set(codes.map(c => users[c].className).filter(Boolean))].sort(), [users]);

  const statsFor = (code) => {
    const mine = attempts.filter(a => a.user_code === code);
    const totalQuestions = mine.reduce((s, a) => s + (a.total || 0), 0);
    const totalCorrect = mine.reduce((s, a) => s + (a.correct || 0), 0);
    const avgPct = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : null;
    const last = mine[0]; // already ordered desc by submitted_at
    return { attemptCount: mine.length, totalQuestions, avgPct, lastActive: last?.submitted_at };
  };

  const toggleSort = (field) => setSort(s => s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: field === "name" ? "asc" : "desc" });
  const sortArrow = (field) => sort.field !== field ? "" : (sort.dir === "asc" ? " ▲" : " ▼");
  const sortableTh = (field, label) => (
    <th style={{ ...S.th, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort(field)}>{label}{sortArrow(field)}</th>
  );

  const rows = useMemo(() => {
    const withStats = codes
      .filter(c => (yearFilter === "all" || String(users[c].year || "").trim() === yearFilter) && (classFilter === "all" || users[c].className === classFilter))
      .map(c => ({ code: c, ...statsFor(c) }));
    const value = { name: r => users[r.code].name, attemptCount: r => r.attemptCount, totalQuestions: r => r.totalQuestions, avgPct: r => r.avgPct ?? -1, lastActive: r => r.lastActive || "" }[sort.field];
    withStats.sort((a, b) => {
      const va = value(a), vb = value(b);
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" });
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return withStats;
  }, [codes, users, attempts, yearFilter, classFilter, sort]);

  // Class leaderboard: ranked by total correct answers, computed from the
  // already-loaded attempts so this needs no extra query.
  const leaderboard = useMemo(() => {
    if (classFilter === "all") return null;
    const classCodes = codes.filter(c => users[c].className === classFilter);
    const totals = {};
    attempts.forEach(a => { if (classCodes.includes(a.user_code)) totals[a.user_code] = (totals[a.user_code] || 0) + (a.correct || 0); });
    const ranked = classCodes
      .map(c => ({ code: c, name: users[c].name, correct: totals[c] || 0 }))
      .sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name));
    let rank = 0, lastScore = null;
    ranked.forEach((r, i) => { if (r.correct !== lastScore) { rank = i + 1; lastScore = r.correct; } r.rank = rank; });
    return ranked;
  }, [classFilter, codes, users, attempts]);

  return (
    <div>
      <p style={{ fontSize: 13, color: "#666", margin: "0 0 1rem" }}>This is a revision tool, so the focus is on practice volume rather than single scores — how much each student is actually practising.</p>

      <div style={{ display: "flex", gap: 10, marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
        <select style={{ ...S.input, width: "auto", minWidth: 140 }} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
          <option value="all">All years</option>
          {allYears.map(y => <option key={y} value={y}>Year {y}</option>)}
        </select>
        <select style={{ ...S.input, width: "auto", minWidth: 160 }} value={classFilter} onChange={e => setClassFilter(e.target.value)}>
          <option value="all">All classes</option>
          {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(yearFilter !== "all" || classFilter !== "all") && (
          <span style={{ fontSize: 12.5, color: "#888" }}>{rows.length} of {codes.length} students</span>
        )}
      </div>

      {loading && <p style={{ color: "#888" }}>Loading...</p>}
      {!loading && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {sortableTh("name", "Student")}
                {sortableTh("attemptCount", "Attempts")}
                {sortableTh("totalQuestions", "Questions Practised")}
                {sortableTh("avgPct", "Avg Score")}
                {sortableTh("lastActive", "Last Active")}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const gc = gradientColor(r.avgPct);
                return (
                  <tr key={r.code}>
                    <td style={S.td}>{users[r.code].name} <span style={{ color: "#aaa" }}>({r.code})</span></td>
                    <td style={S.td}>{r.attemptCount}</td>
                    <td style={S.td}>{r.totalQuestions}</td>
                    <td style={S.td}>{r.avgPct !== null ? <span style={{ ...S.badge, background: gc.bg, color: gc.text }}>{r.avgPct}%</span> : <span style={{ color: "#ccc" }}>—</span>}</td>
                    <td style={S.td}>{r.lastActive ? new Date(r.lastActive).toLocaleDateString() : <span style={{ color: "#ccc" }}>—</span>}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td style={S.td} colSpan={5}><span style={{ color: "#aaa" }}>No students match this filter.</span></td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {classFilter !== "all" && leaderboard && (
        <div style={{ ...S.card, marginTop: "1.25rem" }}>
          <h3 style={{ ...S.h3, marginBottom: 10 }}>🏆 {classFilter} Leaderboard</h3>
          {leaderboard.length === 0 ? (
            <p style={{ color: "#aaa", margin: 0, fontSize: 13.5 }}>No students in this class yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {leaderboard.map(r => (
                <div key={r.code} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 4px", borderBottom: `1px solid ${C.lineSoft}` }}>
                  <span style={{ fontSize: 13.5 }}><b style={{ color: C.muted, marginRight: 8 }}>#{r.rank}</b>{r.name} <span style={{ color: "#aaa" }}>({r.code})</span></span>
                  <span style={{ fontWeight: 800, color: C.brandDeep }}>{r.correct} correct</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TEACHER VIEW (read-only, no login) ────────────────────────────────────────
// Reachable only via an obscure, unguessable URL (see TEACHER_VIEW_PATH below) --
// no auth screen. Shows the same student login details + progress data as the
// admin panel's Students/Progress tabs, but with every write action (add, bulk
// import, remove, print cards, class delete) stripped out. Never link to this
// path from anywhere in the app itself.
function TeacherStudents({ users }) {
  const [yearFilter, setYearFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [sort, setSort] = useState({ field: "code", dir: "asc" });
  const [profileCode, setProfileCode] = useState(null);

  const codes = Object.keys(users).sort();
  const allYears = useMemo(() => [...new Set(codes.map(c => String(users[c].year || "").trim()).filter(Boolean))].sort(), [users]);
  const allClasses = useMemo(() => [...new Set(codes.map(c => users[c].className).filter(Boolean))].sort(), [users]);

  const toggleSort = (field) => setSort(s => s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" });
  const sortArrow = (field) => sort.field !== field ? "" : (sort.dir === "asc" ? " ▲" : " ▼");
  const sortableTh = (field, label) => (
    <th style={{ ...S.th, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort(field)}>{label}{sortArrow(field)}</th>
  );

  const filteredCodes = useMemo(() => {
    const field = { code: c => c, name: c => users[c].name, className: c => users[c].className, year: c => users[c].year }[sort.field] || (c => c);
    return codes
      .filter(c => (yearFilter === "all" || String(users[c].year || "").trim() === yearFilter) && (classFilter === "all" || users[c].className === classFilter))
      .sort((a, b) => {
        const cmp = String(field(a) || "").localeCompare(String(field(b) || ""), undefined, { numeric: true, sensitivity: "base" });
        return sort.dir === "asc" ? cmp : -cmp;
      });
  }, [codes, users, yearFilter, classFilter, sort]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
        <select style={{ ...S.input, width: "auto", minWidth: 140 }} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
          <option value="all">All years</option>
          {allYears.map(y => <option key={y} value={y}>Year {y}</option>)}
        </select>
        <select style={{ ...S.input, width: "auto", minWidth: 160 }} value={classFilter} onChange={e => setClassFilter(e.target.value)}>
          <option value="all">All classes</option>
          {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: "#888" }}>{filteredCodes.length} of {codes.length} students</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {sortableTh("code", "Login Code")}
              {sortableTh("name", "Name")}
              {sortableTh("className", "Class")}
              {sortableTh("year", "Year")}
              <th style={S.th}></th>
            </tr>
          </thead>
          <tbody>
            {filteredCodes.map(code => (
              <tr key={code}>
                <td style={{ ...S.td, fontFamily: "monospace", fontWeight: 700 }}>{code}</td>
                <td style={S.td}>{users[code].name}</td>
                <td style={S.td}>{users[code].className}</td>
                <td style={S.td}>{users[code].year}</td>
                <td style={S.td}><button style={{ ...S.btn, ...S.btnOutline, ...S.btnSm }} onClick={() => setProfileCode(code)}>Profile</button></td>
              </tr>
            ))}
            {filteredCodes.length === 0 && <tr><td style={S.td} colSpan={5}><span style={{ color: "#aaa" }}>No students match this filter.</span></td></tr>}
          </tbody>
        </table>
      </div>
      {profileCode && <StudentProfileModal code={profileCode} info={users[profileCode]} onClose={() => setProfileCode(null)} />}
    </div>
  );
}

function TeacherView({ users }) {
  const [tab, setTab] = useState("students");
  return (
    <div style={{ minHeight: "100vh", background: C.canvas, fontFamily: FONT }}>
      <style>{GLOBAL_CSS}</style>
      <div style={S.cont}>
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={S.h1}>⚛️ {SCHOOL_NAME}</h1>
          <p style={{ ...S.sub, marginTop: 6 }}>Read-only teacher view — student login details and practice progress. This page has no editing ability and needs no login; please don't share this link outside teaching staff.</p>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem" }}>
          <button style={S.tabBtn(tab === "students")} onClick={() => setTab("students")}>Students</button>
          <button style={S.tabBtn(tab === "progress")} onClick={() => setTab("progress")}>Progress</button>
        </div>
        {tab === "students" && <TeacherStudents users={users} />}
        {tab === "progress" && <AdminProgress users={users} />}
      </div>
    </div>
  );
}

// Obscure, unguessable path -- this is the only "access control" for TeacherView.
// Do not link to this from anywhere else in the app.
const TEACHER_VIEW_PATH = "/teacher-view/9Kt2mXbQ7fLpZ3rN6wYhVcEaJ8uD5gS";

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const questionsApi = useQuestions();
  const usersApi = useUsers();
  const flagsApi = useFlags();
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("login");
  const [activeModule, setActiveModule] = useState(null);
  const [session, setSession] = useState(null); // { scopeType, scopeId, scopeLabel, color, count, key }

  const logout = () => { setUser(null); setPage("login"); setActiveModule(null); setSession(null); };

  // Obscure-link teacher view -- checked first, independent of login/admin state,
  // and only waits on student data (not the question bank).
  if (typeof window !== "undefined" && window.location.pathname.replace(/\/$/, "") === TEACHER_VIEW_PATH) {
    if (usersApi.loading) return (
      <div style={{ minHeight: "100vh", background: C.canvas, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, color: C.muted, fontWeight: 600 }}>
        <style>{GLOBAL_CSS}</style>
        Loading…
      </div>
    );
    return <TeacherView users={usersApi.users} />;
  }

  if (questionsApi.loading || usersApi.loading) return (
    <div style={{ minHeight: "100vh", background: C.canvas, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: FONT, color: C.muted, gap: 16, fontWeight: 600 }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ fontSize: 40, animation: "bqcFloat 2.4s ease-in-out infinite" }}>⚛️</div>
      <div style={{ width: 32, height: 32, border: `3px solid ${C.lineSoft}`, borderTopColor: C.brand, borderRadius: "50%", animation: "bqcSpin .8s linear infinite" }} />
      Loading your quiz centre…
    </div>
  );

  if (page === "admin") return (
    <AdminPanel questions={questionsApi.questions} questionsApi={questionsApi} users={usersApi.users} usersApi={usersApi} flagsApi={flagsApi}
      onBack={() => setPage(user ? "home" : "login")} />
  );
  if (page === "login" || !user) return <LoginPage users={usersApi.users} onLogin={u => { setUser(u); setPage("home"); }} onAdmin={() => setPage("admin")} />;

  const launchSession = (params) => {
    setSession({ ...params, key: Math.random().toString(36).slice(2) });
    setPage("practice");
  };
  const retrySession = () => {
    setSession(prev => ({ ...prev, key: Math.random().toString(36).slice(2) }));
  };
  const exitSession = () => {
    setSession(null);
    setPage(activeModule ? "module" : "home");
  };

  return (
    <div style={S.page}>
      <style>{GLOBAL_CSS}</style>
      <nav style={S.nav}>
        <div style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 11 }}
          onClick={() => { setPage("home"); setActiveModule(null); setSession(null); }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 19, background: `linear-gradient(135deg, ${C.brand2} 0%, ${C.brandDeep} 100%)`,
            boxShadow: "0 3px 10px rgba(55,48,163,.32)"
          }}>⚛️</div>
          <div>
            <div style={S.navBrand}>{SCHOOL_NAME}</div>
            <div style={S.navSub}>Year 12 Physics</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div className="bqc-hide-sm" style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${C.brand2}, ${C.brand})`,
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 800
          }}>
            {(user.name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <span style={{ fontSize: 13.5, color: C.body, fontWeight: 700 }}>{user.name}</span>
        </div>
        <button style={{ ...S.btn, ...S.btnOutline, ...S.btnSm }} onClick={logout}>Sign out</button>
      </nav>

      {page === "home" && (
        <HomePage user={user} questions={questionsApi.questions}
          onSelectModule={m => { setActiveModule(m); setPage("module"); }}
          onViewProgress={() => setPage("progress")}
          onLaunch={launchSession} />
      )}
      {page === "module" && activeModule && (
        <ModulePage moduleDef={activeModule} questions={questionsApi.questions} user={user}
          onBack={() => setPage("home")} onLaunch={launchSession} />
      )}
      {page === "progress" && <ProgressPage user={user} onBack={() => setPage("home")} />}
      {page === "practice" && session && (
        <PracticeSession
          key={session.key}
          scopeType={session.scopeType} scopeId={session.scopeId} scopeLabel={session.scopeLabel} color={session.color}
          pool={poolForScope(questionsApi.questions, session.scopeType, session.scopeId)} count={session.count}
          user={user} onExit={exitSession} onTryAgain={retrySession}
        />
      )}
    </div>
  );
}
