#!/usr/bin/env node
// PHE statusline (settings.json "statusLine" command — NOT a hook). Prints ONE
// line: model · context % · branch(+dirty count) · gate state. Runs locally
// after each assistant message, costs zero tokens. Never crashes: worst case
// prints the model name alone.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  let model = "Claude";
  try {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    const d = JSON.parse(Buffer.concat(chunks).toString("utf8")) || {};
    model = d.model?.display_name || model;
    const parts = [model];

    const pct = d.context_window?.used_percentage; // null early in session / right after compact
    if (typeof pct === "number" && Number.isFinite(pct)) parts.push(`ctx ${Math.round(pct)}%`);

    const cwd = d.workspace?.current_dir || process.cwd();
    const git = (args) => {
      try {
        return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
      } catch { return null; }
    };
    const branch = git(["branch", "--show-current"]);
    if (branch !== null) {
      const name = branch.trim() || "detached";
      const dirty = (git(["status", "--porcelain"]) || "").split("\n").filter(Boolean).length;
      parts.push(dirty ? `${name}*${dirty}` : name);
    }

    let gate = "gate:off";
    try {
      const root = d.workspace?.project_dir || cwd;
      const cfg = JSON.parse(readFileSync(join(root, ".claude", "harness.json"), "utf8"));
      const n = Array.isArray(cfg.stopGate) ? cfg.stopGate.length : 0;
      if (n) gate = `gate:armed(${n})`;
    } catch { /* no/unreadable harness.json => gate:off */ }
    parts.push(gate);

    console.log(parts.join(" · "));
  } catch {
    console.log(model); // fallback: model name only
  }
}

main();
