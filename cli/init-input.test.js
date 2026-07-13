#!/usr/bin/env node
'use strict';

// cli/init-input.test.js
//
// Unit tests for the piped (non-TTY) stdin asker used by cli/init.js's ask()
// dispatcher (Finding I1). Before the fix, piped input for a MULTI-question
// init (harness question, then vault question) silently exited 0 having
// installed nothing: readline delivered line 1 to the first ask(), then hit
// EOF before the second ask()'s rl.question() callback ever fired -- that
// await never resolved, the event loop drained, and the process exited 0.
//
// The fix reads all of stdin to EOF up front (when not a TTY) and hands out
// one queued line per ask() call via createPipedAsker(). These tests drive
// that helper directly -- no subprocess, no real stdin -- so a queue
// exhausted mid-run throws loudly instead of hanging or no-opping.

const { createPipedAsker } = require('./init.js');

var passed = 0;
var failed = 0;
function assert(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}

console.log('createPipedAsker:');

// Two answers, in order -- the exact shape of Finding I1's repro
// (`printf '1\n/path\n' | node cli/init.js`).
(function () {
  var asker = createPipedAsker('1\n/some/path\n');
  var a1 = asker.ask('Harness? ');
  var a2 = asker.ask('Vault? ');
  assert('first ask() yields "1"', a1 === '1');
  assert('second ask() yields "/some/path"', a2 === '/some/path');
})();

// Under-supplied input (only the first question answered): the second ask()
// must throw -- NOT hang, NOT silently return "" and let main() limp on.
(function () {
  var asker = createPipedAsker('1\n');
  var a1 = asker.ask('Harness? ');
  assert('first ask() yields "1"', a1 === '1');

  var thrown = null;
  try {
    asker.ask('Vault? ');
  } catch (e) {
    thrown = e;
  }
  assert('ask() on an exhausted queue throws', thrown instanceof Error);
  assert(
    'error message explains the piped-input shortfall',
    !!thrown && thrown.message.indexOf('ran out of piped input') !== -1
  );
})();

// A genuinely blank answer line (user/script piped an empty line on purpose)
// is a valid "" answer, not exhaustion -- only running OUT of lines throws.
(function () {
  var asker = createPipedAsker('1\n\n/path\n');
  var a1 = asker.ask('Q1? ');
  var a2 = asker.ask('Q2? ');
  var a3 = asker.ask('Q3? ');
  assert('first ask() yields "1"', a1 === '1');
  assert('middle blank line yields "" (not a throw)', a2 === '');
  assert('third ask() yields "/path"', a3 === '/path');

  var thrown = null;
  try {
    asker.ask('Q4? ');
  } catch (e) {
    thrown = e;
  }
  assert('a 4th ask() past the real content throws', thrown instanceof Error);
})();

// Completely empty stdin (e.g. `< /dev/null`): the very first ask() throws
// immediately rather than hanging or returning "".
(function () {
  var asker = createPipedAsker('');
  var thrown = null;
  try {
    asker.ask('Harness? ');
  } catch (e) {
    thrown = e;
  }
  assert('ask() on empty stdin throws immediately', thrown instanceof Error);
})();

// Last line with no trailing newline is still a real answer (readline would
// deliver it too on EOF without a final \n).
(function () {
  var asker = createPipedAsker('1\n/path');
  var a1 = asker.ask('Q1? ');
  var a2 = asker.ask('Q2? ');
  assert('first ask() yields "1"', a1 === '1');
  assert('unterminated last line still yields "/path"', a2 === '/path');
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
