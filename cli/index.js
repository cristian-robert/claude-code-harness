#!/usr/bin/env node

const command = process.argv[2];

switch (command) {
  case 'init':
    require('./init.js').main().catch(function (err) {
      console.error('Error: ' + err.message);
      process.exit(1);
    });
    break;
  case 'update':
    require('./update.js').main().catch(function (err) {
      console.error('Error: ' + err.message);
      process.exit(1);
    });
    break;
  case 'merge-settings': {
    const { spawnSync } = require('child_process');
    const result = spawnSync(
      process.execPath,
      [require.resolve('./merge-settings.js'), ...process.argv.slice(3)],
      { stdio: 'inherit' }
    );
    process.exit(result.status === null ? 1 : result.status);
    break;
  }
  case 'file-size-check': {
    // PHE ships tools/context-ledger.mjs as the always-loaded-budget tool;
    // route the command to it (path is relative to the package root).
    const path = require('path');
    const { spawnSync } = require('child_process');
    const ledger = path.join(__dirname, '..', 'tools', 'context-ledger.mjs');
    const result = spawnSync(process.execPath, [ledger, ...process.argv.slice(3)], { stdio: 'inherit' });
    process.exit(result.status === null ? 1 : result.status);
    break;
  }
  case '--version':
  case '-v':
    console.log(require('../package.json').version);
    break;
  case '--help':
  case '-h':
  case undefined:
    console.log(`
perfect-harness-engineering — the harness around Claude Code that makes it reliable.

Usage:
  npx perfect-harness-engineering init             Install the harness payload into the current project
  npx perfect-harness-engineering update           Update payload files, preserving customizations (three-way merge)
  npx perfect-harness-engineering merge-settings   Deep-merge a .claude/settings.json with the framework version (init/update do this automatically; use to re-run by hand)
  npx perfect-harness-engineering file-size-check  Lint always-loaded context (CLAUDE.md, rules, skills) against budgets
  npx perfect-harness-engineering --version        Show version
  npx perfect-harness-engineering --help           Show this help

Then run /harness-init inside Claude Code to fit the payload to your project.
Docs: https://github.com/cristian-robert/claude-code-harness
    `);
    break;
  default:
    console.error('Unknown command: ' + command);
    console.log('Run "npx perfect-harness-engineering --help" for usage information.');
    process.exit(1);
}
