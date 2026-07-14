// Skill preview guards — every !`...` dynamic-context line in the payload must
// end in a fallback that cannot exit non-zero. Claude Code aborts the WHOLE
// slash command when an embedded preview command fails, so a bare
// `ls plans/ 2>/dev/null` crashes /plan-work in any repo without plans/ yet.
// Traces to: 2026-07-14 — "/plan-work backlog/015-project-bootstrap.md" died
// with `Shell command failed for pattern "!ls plans/ 2>/dev/null"` on day zero.
const { readFileSync, readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");

let passed = 0, failed = 0;
function check(name, ok) {
  console.log(`  ${ok ? "PASS " : "FAIL "} ${name}`);
  ok ? passed++ : failed++;
}

function mdFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...mdFiles(p));
    else if (e.endsWith(".md")) out.push(p);
  }
  return out;
}

console.log("skill preview guards");
const root = join(__dirname, "..", "template", ".claude");
// A guarded preview ends in `|| true` or `|| echo ...` — the only tails that
// make the pipeline's exit status unconditionally 0.
const GUARDED = /\|\|\s*(true|echo\s.+)$/;
let previews = 0;
for (const file of mdFiles(root)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const m = /^!`(.*)`\s*$/.exec(line);
    if (!m) return;
    previews++;
    check(`${file.slice(root.length - ".claude".length)}:${i + 1} preview ends in a can't-fail fallback`, GUARDED.test(m[1].trim()));
  });
}
// Anti-vacuity: the payload ships 7 preview lines today. Zero matches means the
// regex drifted from the syntax, not that the payload went clean — fail loudly.
check(`found the payload's preview lines (${previews} >= 7)`, previews >= 7);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
