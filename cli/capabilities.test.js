'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}
function tmpdir() {
  const d = path.join(os.tmpdir(), 'phe-cap-' + crypto.randomUUID());
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ── Task 1: STACK_SIGNALS vocabulary ──────────────────────────────────────
const initMod = require('./init.js');
check('STACK_SIGNALS is a non-empty array', Array.isArray(initMod.STACK_SIGNALS) && initMod.STACK_SIGNALS.length > 0);
check('STACK_SIGNALS covers the known signals', ['Next.js','React','Vue','Svelte','Express','NestJS','Expo','Supabase','Tailwind','Stripe','Prisma','Drizzle','MongoDB/Mongoose','Python','FastAPI','Django','Flask','Go','Rust'].every(s => initMod.STACK_SIGNALS.indexOf(s) !== -1));
check('STACK_SIGNALS has no duplicates', new Set(initMod.STACK_SIGNALS).size === initMod.STACK_SIGNALS.length);

// detection still behaves: dual-key deps dedupe to one signal
{
  const d = tmpdir();
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({
    dependencies: { next: '1', svelte: '1', '@sveltejs/kit': '1', prisma: '1', '@prisma/client': '1' }
  }));
  const prev = process.cwd();
  process.chdir(d);
  const got = initMod.detectTechStack();
  process.chdir(prev);
  check('detect: Next.js present', got.indexOf('Next.js') !== -1);
  check('detect: Svelte deduped', got.filter(s => s === 'Svelte').length === 1);
  check('detect: Prisma deduped', got.filter(s => s === 'Prisma').length === 1);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
