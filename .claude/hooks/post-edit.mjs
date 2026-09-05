#!/usr/bin/env node
// PostToolUse (Edit|Write|NotebookEdit): advisory fast feedback on the file
// just touched. Runs the cheapest available checker for the file type and
// surfaces findings to Claude via additionalContext. NEVER blocks: always
// exits 0. The hard gate lives in stop-gate.mjs / the /validate skill.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

const TIMEOUT = 30_000;
const MAX_OUT = 1_800;

function run(cmd, args, cwd) {
  try {
    execFileSync(cmd, args, { cwd, encoding: "utf8", timeout: TIMEOUT, stdio: ["ignore", "pipe", "pipe"] });
    return null; // clean
  } catch (err) {
    if (err.code === "ENOENT" || err.killed) return null; // tool missing / timed out: stay silent
    const out = `${err.stdout || ""}\n${err.stderr || ""}`.trim();
    return out ? out.slice(0, MAX_OUT) : null;
  }
}

function findUp(start, names) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    for (const n of names) if (existsSync(join(dir, n))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

async function main() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const event = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const file = event.tool_input?.file_path;
  if (!file || !existsSync(file)) process.exit(0);

  // Self-enforcing harness rule: editing a hook triggers the hook smoke test.
  // Resolves smoke-test.mjs NEXT TO the edited hook (works from any cwd);
  // skips smoke-test.mjs itself to avoid self-triggering.
  if (/\.claude\/hooks\/[^/]+\.mjs$/.test(file) && !/smoke-test\.mjs$/.test(file)) {
    const hooksDir = dirname(file);
    const smokeTest = join(hooksDir, "smoke-test.mjs");
    if (existsSync(smokeTest)) {
      const root = dirname(dirname(hooksDir)); // <root>/.claude/hooks -> <root>
      let out;
      try {
        out = execFileSync("node", [smokeTest], { cwd: root, encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
      } catch (err) {
        out = `${err.stdout || ""}\n${err.stderr || ""}`;
      }
      const tail = (out || "").trim().slice(-MAX_OUT);
      if (tail) {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PostToolUse",
            additionalContext: `Hook edited — smoke test result (fix failures NOW):\n${tail}`,
          },
        }));
      }
    }
    process.exit(0); // advisory only — never blocks
  }

  let findings = null;
  let checker = null;

  if (/\.py$/.test(file)) {
    const root = findUp(dirname(file), ["pyproject.toml", "ruff.toml", ".ruff.toml"]);
    if (root) { checker = "ruff"; findings = run("ruff", ["check", "--quiet", file], root); }
  } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)) {
    const root = findUp(dirname(file), ["package.json"]);
    if (root && existsSync(join(root, "node_modules", ".bin"))) {
      const eslint = join(root, "node_modules", ".bin", process.platform === "win32" ? "eslint.cmd" : "eslint");
      if (existsSync(eslint)) { checker = "eslint"; findings = run(eslint, ["--no-color", file], root); }
    }
  }

  if (findings) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `Advisory ${checker} findings for ${file} (fix now while it is cheap; the stop gate will not let broken work ship):\n${findings}`,
      },
    }));
  }
  process.exit(0);
}

main().catch(() => process.exit(0)); // advisory: never block, never crash the session
