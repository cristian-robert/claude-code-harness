#!/usr/bin/env node
// Context ledger: measures the ALWAYS-LOADED context tax of a harnessed project.
//   node tools/context-ledger.mjs [projectDir] [--budget N]     (default budget: 2000 est. tokens)
// Counts what Claude Code loads into EVERY session: root CLAUDE.md, .claude/CLAUDE.md,
// CLAUDE.local.md, every .claude/rules/*.md WITHOUT a `paths:` frontmatter key (unscoped
// rules always load — and `globs:` is the wrong key, silently ignored, so those load too),
// plus each skill's SKILL.md frontmatter description (the only skill part that always
// loads — EXCEPT skills with disable-model-invocation: true, which cost nothing).
// Exit 0 = OK/WARN, 1 = OVER budget.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

let budget = 2000, dir = process.cwd();
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--budget") budget = Number(args[++i]) || 2000;
  else if (args[i].startsWith("--budget=")) budget = Number(args[i].slice(9)) || 2000;
  else dir = resolve(args[i]);
}

const est = (text) => Math.round(text.split(/\s+/).filter(Boolean).length * 1.33);
// Normalize CRLF: the frontmatter regexes below assume \n line endings.
const read = (p) => { try { return readFileSync(p, "utf8").replace(/\r\n/g, "\n"); } catch { return null; } };

function frontmatter(text) {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  return end < 0 ? null : text.slice(text.indexOf("\n") + 1, end);
}
const hasKey = (fm, key) => fm != null && new RegExp(`^${key}\\s*:`, "m").test(fm);
// Key's value incl. indented continuation lines (handles `>`/`|` block scalars).
function fmValue(fm, key) {
  const m = fm?.match(new RegExp(`^${key}\\s*:(.*)((\\n[ \\t]+.*)*)`, "m"));
  return m ? (m[1] + m[2]).replace(/^\s*[>|][+-]?\s*/, "").trim() : "";
}

// Per-file line budgets (soft warn / hard block) mirroring harness-maintenance.md.
const LINE_BUDGETS = { claudemd: [60, 80], rule: [45, 60] };
const DESC_WORDS = [40, 60]; // skill description soft/hard word cap (always loads unless disabled)

const rows = [], warns = [], hardViolations = [];
const add = (file, text, cls) => {
  const lines = text.split("\n").length;
  const b = LINE_BUDGETS[cls];
  let mark = "";
  if (b && lines > b[1]) { mark = " !!HARD"; hardViolations.push(`${file}: ${lines} lines > hard cap ${b[1]}`); }
  else if (b && lines > b[0]) { mark = " !soft"; warns.push(`${file}: ${lines} lines > soft cap ${b[0]} — trim or lazy-load.`); }
  rows.push({ file: file + mark, lines, tokens: est(text) });
};

for (const f of ["CLAUDE.md", join(".claude", "CLAUDE.md"), "CLAUDE.local.md"]) {
  const text = read(join(dir, f));
  if (text != null) add(f, text, "claudemd");
}

const rulesDir = join(dir, ".claude", "rules");
if (existsSync(rulesDir)) {
  for (const name of readdirSync(rulesDir).filter((n) => n.endsWith(".md")).sort()) {
    const text = read(join(rulesDir, name));
    if (text == null) continue;
    const fm = frontmatter(text);
    if (hasKey(fm, "globs"))
      warns.push(`.claude/rules/${name} uses "globs:" — WRONG KEY, silently ignored by Claude Code. Use "paths:".`);
    if (!hasKey(fm, "paths")) add(`.claude/rules/${name}`, text, "rule"); // unscoped -> always loads
  }
}

const skillsDir = join(dir, ".claude", "skills");
if (existsSync(skillsDir)) {
  for (const d of readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const text = read(join(skillsDir, d.name, "SKILL.md"));
    if (text == null) continue;
    const fm = frontmatter(text);
    // Body-line budget (soft 100 / hard 120, per harness-maintenance.md) — checked
    // for EVERY skill even when its body isn't always-loaded, so the budget the
    // framework holds others to is enforced on the framework itself.
    const fmEnd = text.startsWith("---") ? text.indexOf("\n---", 3) : -1;
    const bodyStart = fmEnd >= 0 ? text.indexOf("\n", fmEnd + 1) + 1 : 0;
    const bodyLines = text.slice(bodyStart).replace(/\n+$/, "").split("\n").length;
    if (bodyLines > 120) hardViolations.push(`.claude/skills/${d.name}/SKILL.md: body ${bodyLines} lines > hard cap 120 — convert to a phase-table router`);
    else if (bodyLines > 100) warns.push(`.claude/skills/${d.name}/SKILL.md: body ${bodyLines} lines > soft cap 100 — trim.`);
    // disable-model-invocation: true removes the description from context
    // entirely (loads only on explicit /invoke) — it costs nothing per session.
    if (/^disable-model-invocation\s*:\s*true/m.test(fm ?? "")) continue;
    const always = [fmValue(fm, "description"), fmValue(fm, "when_to_use")].filter(Boolean).join("\n");
    if (!always) continue;
    const words = always.split(/\s+/).filter(Boolean).length;
    if (words > DESC_WORDS[1]) hardViolations.push(`.claude/skills/${d.name}: description ${words} words > hard cap ${DESC_WORDS[1]} (always loads — trim it)`);
    else if (words > DESC_WORDS[0]) warns.push(`.claude/skills/${d.name}: description ${words} words > soft cap ${DESC_WORDS[0]}.`);
    add(`.claude/skills/${d.name}/SKILL.md (frontmatter)`, always);
  }
}

const total = rows.reduce((s, r) => s + r.tokens, 0);
const w = Math.max(5, ...rows.map((r) => r.file.length));
console.log(`Context ledger — always-loaded tax for ${dir}\n`);
console.log(`${"file".padEnd(w)}  ${"lines".padStart(5)}  ${"est.tok".padStart(7)}`);
console.log("-".repeat(w + 16));
for (const r of rows) console.log(`${r.file.padEnd(w)}  ${String(r.lines).padStart(5)}  ${String(r.tokens).padStart(7)}`);
if (!rows.length) console.log("(nothing always-loaded found — is this a harnessed project?)");
console.log("-".repeat(w + 16));
console.log(`${"TOTAL".padEnd(w)}  ${" ".repeat(5)}  ${String(total).padStart(7)}`);

for (const msg of warns) console.log(`\n!! WARN ${msg}`);

const status = total > budget ? "OVER" : total > budget * 0.8 ? "WARN" : "OK";
console.log(`\nStatus: ${status} — ${total} / ${budget} est. tokens (${Math.round((total / budget) * 100)}%)`);
if (status === "OVER") {
  console.log("Top contributors:");
  for (const t of [...rows].sort((a, b) => b.tokens - a.tokens).slice(0, 3))
    console.log(`  ${String(t.tokens).padStart(6)}  ${t.file}`);
  console.log("Hint: scope rules with paths:, move detail to references/, cut lines that don't prevent mistakes.");
}
for (const v of hardViolations) console.log(`!! HARD ${v}`);
process.exit(status === "OVER" || hardViolations.length ? 1 : 0);
