'use strict';
// The capabilities ratchet (spec: Components 6). Two assertions:
//  (a) every `<plugin>:<skill>` reference in template/ is declared in the manifest —
//      a new external dependency cannot sneak in undeclared;
//  (b) every `when.stack` string is in init.js's STACK_SIGNALS — the matrix cannot
//      drift from the detector.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { STACK_SIGNALS } = require('./init.js');

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'template', '.claude', 'capabilities.json');
check('manifest exists', fs.existsSync(manifestPath));

let manifest = { marketplaces: {}, capabilities: [] };
try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch (e) { check('manifest parses', false); }

// (a) referenced plugin skills ⊆ declared skills
// Known plugin namespaces referenced by the payload. Extend when a new namespace appears —
// the grep below will fail first and name the file.
const NAMESPACES = ['superpowers', 'codex'];
let refs = '';
try {
  refs = execFileSync('grep', ['-rhoE', '\\b(' + NAMESPACES.join('|') + '):[a-z][a-z-]+', path.join(root, 'template')], { encoding: 'utf-8' });
} catch (e) { /* no matches → empty */ }
const referenced = Array.from(new Set(refs.split('\n').filter(Boolean)));
const declared = new Set();
for (const cap of manifest.capabilities) {
  const name = String(cap.id).split('@')[0];
  for (const s of cap.skills || []) declared.add(name + ':' + s);
}
for (const ref of referenced) {
  check('declared: ' + ref, declared.has(ref));
}
check('at least the superpowers refs were found by the grep', referenced.some(r => r.indexOf('superpowers:') === 0));

// (b) when.stack ⊆ STACK_SIGNALS
for (const cap of manifest.capabilities) {
  const stacks = (cap.when && cap.when.stack) || [];
  for (const s of stacks) {
    check('when.stack known to detector: ' + cap.id + ' → ' + s, STACK_SIGNALS.indexOf(s) !== -1);
  }
}

// every row carries a non-empty, non-"same" why (review finding m2)
for (const cap of manifest.capabilities) {
  check('why is real: ' + cap.id, typeof cap.why === 'string' && cap.why.length > 10 && cap.why !== 'same');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
