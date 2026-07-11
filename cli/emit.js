'use strict';

// `npx perfect-harness-engineering emit` -- re-derive the Codex payload from
// the CURRENT .claude/ tree, right now. No download, no payload copy, no
// backup, no prompt.
//
// Why this exists: init/update emit a Codex snapshot that goes stale
// immediately. The mandatory next step after init is /harness-init (or
// $harness-init on Codex), whose entire job is to EDIT the canonical
// sources -- fill AGENTS.md placeholders, fill the knowledge skills, prune
// the MCP clause. Those edits never reach .agents/.codex on their own. Worse,
// `update` is not a safe escape hatch: it REVERTS .claude/ to the framework
// template before it re-emits, so a hand-fitted skill can never survive an
// update. `emit` is the one command that pushes .claude/ -> .agents/.codex/
// with nothing else in between.

const fs = require('fs');
const path = require('path');
const { readHarnessTargets } = require('./harness-targets');
const { emitCodexPayload, cleanupDroppedTargets } = require('./emit-codex');

function main() {
  var projectRoot = process.cwd();

  if (!fs.existsSync(path.join(projectRoot, '.claude'))) {
    console.error('No .claude/ directory found. Run "npx perfect-harness-engineering init" first.');
    process.exit(1);
    return;
  }

  var targets = readHarnessTargets(projectRoot);
  if (!targets || targets.indexOf('codex') === -1) {
    console.log('codex is not a harness target for this project (see .claude/harness.json) -- nothing to emit.');
    return;
  }

  var counts = emitCodexPayload(projectRoot);
  console.log('Emitted Codex payload: ' + counts.skills + ' skills -> .agents/skills/, ' +
    counts.agents + ' agents -> .codex/agents/');

  // Same point init.js/update.js run the F2 cleanup — catches the symmetric
  // case (claude dropped from harness.json since the tree was last emitted,
  // leaving an orphan CLAUDE.md) without requiring a full init/update run.
  var cleanupMsg = cleanupDroppedTargets(projectRoot, targets);
  if (cleanupMsg) console.log(cleanupMsg);
}

module.exports = { main: main };

if (require.main === module) {
  main();
}
