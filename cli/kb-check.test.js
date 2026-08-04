// cli/kb-check.test.js
//
// tools/kb-check.mjs is the /validate + /evolve gate on a project-local knowledge base.
// Driven as a REAL process (it is ESM; require() cannot load it), so the exit CODE — the
// only thing a gate is ever judged by — is what these asserts read.
//
// These asserts are written to KILL MUTANTS, not to describe happy paths. An earlier
// version of this suite passed 12/12 against four separately broken implementations: the
// secret regex reduced to AWS-only, subdirs() walking one level instead of recursing, (b)
// comparing byte LENGTH instead of byte CONTENT, and (c) scanning only resources.md. Each
// of those is now pinned by a fixture that fails when the behaviour is removed.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

var passed = 0;
var failed = 0;
function assert(name, condition) {
  if (condition) { console.log('  PASS: ' + name); passed++; }
  else { console.log('  FAIL: ' + name); failed++; }
}

const KB_CHECK = path.join(__dirname, '..', 'tools', 'kb-check.mjs');
const SCAFFOLD = path.join(__dirname, '..', 'template', '.claude', 'references', 'knowledge-base-scaffold');
const TEST_DIR = path.join(os.tmpdir(), 'kb-check-test-' + crypto.randomUUID());

function run(args) {
  var r = spawnSync(process.execPath, [KB_CHECK].concat(args), { encoding: 'utf-8' });
  var out = (r.stdout || '') + (r.stderr || '');
  // A missing or broken script must fail EVERY assert, not accidentally satisfy the ones
  // that only look for a red exit code — a script that crashes on every invocation also
  // exits non-zero. Any stack frame in kb-check.mjs, a syntax error or a failed import
  // poisons the result into a code no assert accepts.
  if (/Cannot find module|SyntaxError|^\s+at .*kb-check\.mjs/m.test(out)) return { code: -1, out: out };
  return { code: r.status, out: out };
}

function countOf(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// Walked here rather than hardcoded so adding a file to the scaffold cannot silently
// weaken the "every placeholder is reported" assert below.
function walkFiles(dir) {
  var out = [];
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var p = path.join(dir, entries[i].name);
    if (entries[i].isDirectory()) out = out.concat(walkFiles(p));
    else out.push(p);
  }
  return out;
}
const SCAFFOLD_FILE_COUNT = walkFiles(SCAFFOLD).length;

console.log('the shipped scaffold:');
var self = run([SCAFFOLD, '--scaffold', SCAFFOLD]);
assert('the shipped scaffold is GREEN', self.code === 0);
assert('(b) is skipped when the checked dir IS the scaffold', self.out.indexOf('(b) skipped') !== -1);
assert('the shipped scaffold carries no secret-shaped string of its own', self.out.indexOf('(c)') === -1);

console.log('(a) Index Law:');
var A = path.join(TEST_DIR, 'a');
fs.mkdirSync(path.join(A, 'research'), { recursive: true });
fs.writeFileSync(path.join(A, '_index.md'), '# kb\n');
var a = run([A, '--scaffold', SCAFFOLD]);
assert('a folder with no _index.md is RED', a.code === 1);
assert('the finding names the folder', a.out.indexOf('(a) no _index.md in research/') !== -1);
fs.writeFileSync(path.join(A, 'research', '_index.md'), '# research\n');
assert('adding the _index.md turns it GREEN', run([A, '--scaffold', SCAFFOLD]).code === 0);

// subdirs() must recurse to ARBITRARY depth. A one-level walk satisfies every shallow
// fixture above while leaving every nested folder in a real knowledge base unchecked.
var A3 = path.join(TEST_DIR, 'a3');
fs.mkdirSync(path.join(A3, 'one', 'two', 'three'), { recursive: true });
fs.writeFileSync(path.join(A3, '_index.md'), '# depth root\n');
fs.writeFileSync(path.join(A3, 'one', '_index.md'), '# one\n');
fs.writeFileSync(path.join(A3, 'one', 'two', '_index.md'), '# two\n');
var a3 = run([A3, '--scaffold', SCAFFOLD]);
assert('(a) reaches a folder three levels down', a3.code === 1);
assert('the depth-3 finding names the nested path',
  a3.out.indexOf('(a) no _index.md in ' + path.join('one', 'two', 'three') + '/') !== -1);
fs.writeFileSync(path.join(A3, 'one', 'two', 'three', '_index.md'), '# three\n');
assert('filling the depth-3 _index.md turns it GREEN', run([A3, '--scaffold', SCAFFOLD]).code === 0);

console.log('(b) untouched scaffold placeholders:');
var B = path.join(TEST_DIR, 'b');
fs.cpSync(SCAFFOLD, B, { recursive: true });
var b = run([B, '--scaffold', SCAFFOLD]);
assert('a byte-identical copy of the scaffold is RED', b.code === 1);
assert('the finding names architecture.md', b.out.indexOf('(b) still the shipped placeholder: architecture.md') !== -1);
assert('EVERY placeholder is reported, not just the first',
  countOf(b.out, '(b) still the shipped placeholder:') === SCAFFOLD_FILE_COUNT);

// Byte IDENTITY, not byte COUNT. Comparing lengths passes every "I edited it" fixture
// that happens to change the file size, while a same-length edit — a filled-in <placeholder>
// of equal width, a corrected date — would still be reported as untouched forever.
var archOriginal = fs.readFileSync(path.join(SCAFFOLD, 'architecture.md'));
var sameLength = Buffer.from(archOriginal);
sameLength[0] = sameLength[0] === 0x23 ? 0x2a : 0x23; // '#' <-> '*': one byte, same length
fs.writeFileSync(path.join(B, 'architecture.md'), sameLength);
assert('the edited file still has the scaffold byte LENGTH',
  fs.readFileSync(path.join(B, 'architecture.md')).length === archOriginal.length);
var bEdited = run([B, '--scaffold', SCAFFOLD]);
assert('a same-LENGTH but different-CONTENT file is no longer a placeholder',
  bEdited.out.indexOf('placeholder: architecture.md') === -1);
assert('and the remaining placeholders are still RED',
  bEdited.code === 1 &&
  countOf(bEdited.out, '(b) still the shipped placeholder:') === SCAFFOLD_FILE_COUNT - 1);

console.log('(c) secret shapes:');
var C = path.join(TEST_DIR, 'c');
fs.mkdirSync(path.join(C, 'inbox'), { recursive: true });
fs.writeFileSync(path.join(C, '_index.md'), '# kb\n');
fs.writeFileSync(path.join(C, 'inbox', '_index.md'), '# inbox\n');
fs.writeFileSync(path.join(C, 'resources.md'), '# Resources\n\nDeploy key lives in 1Password — pointer only.\n');
assert('a credentials INDEX (pointers only) is GREEN', run([C, '--scaffold', SCAFFOLD]).code === 0);

// One assert per credential FAMILY, and every one of them written into inbox/ rather than
// resources.md: a scan scoped to the single filename its fixture happened to use is not a
// scan of the knowledge base. Each string is a real-format sample of that vendor's key.
var FAMILIES = [
  ['an AWS access key id', 'aws_key: AKIAIOSFODNN7EXAMPLE'],
  ['an Anthropic API key', 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'],
  ['an OpenAI project key', 'sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'],
  ['a GitHub fine-grained PAT', 'github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz1234'],
  ['a GitHub OAuth token', 'gho_16C7e42F292c6912E7710c838347Ae178B4a'],
  ['a Stripe live secret key', 'sk_' . 'live_' . 'x' x 24],
  ['a Slack bot token', 'xox' . 'b-' . '0' x 12],
  ['a Google API key', 'AIzaSyD-1234567890abcdefghijklmnopqrstu'],
  ['a JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'],
  ['an aws_secret_access_key assignment', 'aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'],
  ['a PEM private key header', '-----BEGIN RSA PRIVATE KEY-----'],
];
var LEAK = path.join(C, 'inbox', 'leak.md');
for (var fi = 0; fi < FAMILIES.length; fi++) {
  fs.writeFileSync(LEAK, '# note\n\n' + FAMILIES[fi][1] + '\n');
  var fam = run([C, '--scaffold', SCAFFOLD]);
  assert(FAMILIES[fi][0] + ' anywhere in the KB is RED',
    fam.code === 1 && fam.out.indexOf('(c) secret-shaped string: inbox/leak.md:3') !== -1);
}
fs.rmSync(LEAK);
assert('removing the leaked file turns it GREEN again', run([C, '--scaffold', SCAFFOLD]).code === 0);

// Prose that merely uses the vocabulary must not fire, or the gate gets disabled by whoever
// hits it third.
fs.writeFileSync(path.join(C, 'inbox', 'prose.md'),
  '# note\n\nThe API key rotation runbook lives in the runbook. We use a token bucket.\n');
assert('prose about tokens and API keys is GREEN', run([C, '--scaffold', SCAFFOLD]).code === 0);

// The connection string is the credential form THIS file family actually attracts: runbook.md's
// setup/run/deploy table asks for the command that starts the stack, and that command carries
// the password inline. It is not obfuscation — it is how a runbook records a database — and it
// passed both gates GREEN until the `://user:pass@` alternative landed.
var CONN = 'psql postgres://app_user:Sup3rS3cretDbPass99@db.prod.internal:5432/appdb';
fs.writeFileSync(path.join(C, 'runbook.md'), '# Runbook\n\n' + CONN + '\n');
var conn = run([C, '--scaffold', SCAFFOLD]);
assert('a connection string with inline credentials is RED',
  conn.code === 1 && conn.out.indexOf('(c) secret-shaped string: runbook.md:3') !== -1);
fs.writeFileSync(path.join(C, 'runbook.md'), '# Runbook\n\n' + CONN + ' <!-- kb-check:allow -->\n');
assert('the same connection string with the hatch is GREEN', run([C, '--scaffold', SCAFFOLD]).code === 0);
fs.rmSync(path.join(C, 'runbook.md'));

// A widened regex that fires on ordinary documentation is worse than the hole it closed: the
// adopter who hits a spurious deny switches the gate off. These are the shapes a knowledge base
// is MADE of — links, wikilinks, a host:port with an @handle or an email later on the line, and
// the angle-bracket template form the scaffold itself ships.
//
// The last two lines are the ones that PIN the password class stopping at `/`. Every other line
// here is green under a `/`-swallowing regex too, because the userinfo class also stops at `/`
// and never reaches the `:`. Only a `host:port` URL whose PATH then contains an `@`, with no
// whitespace between, separates the two — drop these and the fixture stops pinning what it names.
fs.writeFileSync(path.join(C, 'links.md'), [
  '# Links',
  '',
  'Docs: https://example.com/docs/getting-started',
  'Runbook: [deploy steps](https://internal.example.com/runbook#deploy)',
  'See [[architecture]] and [[decisions]].',
  'Grafana https://metrics.internal:3000 — owner @platform-team',
  'API https://api.example.com:443/v2/users, questions to ops@example.com',
  'Clone with ssh://git@github.com:org/repo.git',
  'Template: postgres://<user>:<password>@localhost:5432/db',
  'Team page: https://example.com:8080/docs/team@example.com',
  'Chart: https://grafana.internal:3000/d/abc/svc?var=team@platform',
  '',
].join('\n'));
assert('documentation URLs, wikilinks and markdown links are GREEN',
  run([C, '--scaffold', SCAFFOLD]).code === 0);

console.log('dotfiles are content; only named plumbing is skipped:');
var D = path.join(TEST_DIR, 'd');
fs.mkdirSync(path.join(D, '.obsidian'), { recursive: true });
fs.writeFileSync(path.join(D, '_index.md'), '# kb\n');
fs.writeFileSync(path.join(D, '.obsidian', 'app.json'), '{"apiKey":"AKIAIOSFODNN7EXAMPLE"}\n');
assert('.obsidian/ is operator plumbing and stays ignored', run([D, '--scaffold', SCAFFOLD]).code === 0);

// A dotfile is still git-tracked and still published. Skipping everything starting with "."
// was a universal bypass of the only secrets check: knowledge-base/.secrets.md passed GREEN
// with a live AWS key in it.
fs.writeFileSync(path.join(D, '.secrets.md'), 'aws_key: AKIAIOSFODNN7EXAMPLE\n');
var dFile = run([D, '--scaffold', SCAFFOLD]);
assert('a secret in a DOTFILE is RED',
  dFile.code === 1 && dFile.out.indexOf('(c) secret-shaped string: .secrets.md:1') !== -1);
fs.rmSync(path.join(D, '.secrets.md'));

fs.mkdirSync(path.join(D, '.private'), { recursive: true });
fs.writeFileSync(path.join(D, '.private', '_index.md'), '# private\n');
fs.writeFileSync(path.join(D, '.private', 'x.md'), 'aws_key: AKIAIOSFODNN7EXAMPLE\n');
var dDir = run([D, '--scaffold', SCAFFOLD]);
assert('a secret in a DOT-DIRECTORY is RED',
  dDir.code === 1 && dDir.out.indexOf('(c) secret-shaped string: ' + path.join('.private', 'x.md') + ':1') !== -1);
fs.rmSync(path.join(D, '.private'), { recursive: true });
assert('.obsidian/ is STILL ignored once the real dotfiles are gone',
  run([D, '--scaffold', SCAFFOLD]).code === 0);

console.log('the <!-- kb-check:allow --> escape hatch:');
// The spec REQUIRES resources.md to carry credential POINTERS, which are shaped exactly like
// the thing being hunted. Without a hatch the gate false-positives on its own scaffold's
// documented use and gets switched off.
var E = path.join(TEST_DIR, 'e');
fs.mkdirSync(E, { recursive: true });
fs.writeFileSync(path.join(E, '_index.md'), '# kb\n');
var POINTER_LINES = [
  'password: 1Password/Shared-Engineering',
  'token: stored-in-github-actions-secrets',
  'api_key: AWS-Secrets-Manager/prod/app',
];
fs.writeFileSync(path.join(E, 'resources.md'), '# Resources\n\n' + POINTER_LINES.join('\n') + '\n');
var e1 = run([E, '--scaffold', SCAFFOLD]);
assert('realistic credential POINTERS do trip the widened regex without the hatch',
  e1.code === 1 && countOf(e1.out, '(c) secret-shaped string:') === POINTER_LINES.length);
var allowed = POINTER_LINES.map(function (l) { return l + ' <!-- kb-check:allow -->'; });
fs.writeFileSync(path.join(E, 'resources.md'), '# Resources\n\n' + allowed.join('\n') + '\n');
assert('the same pointers with <!-- kb-check:allow --> are GREEN', run([E, '--scaffold', SCAFFOLD]).code === 0);
// The hatch is LINE-scoped: waiving three pointer lines must not disarm the whole file.
fs.appendFileSync(path.join(E, 'resources.md'), 'aws_key: AKIAIOSFODNN7EXAMPLE\n');
var e3 = run([E, '--scaffold', SCAFFOLD]);
assert('the hatch is line-scoped — a real key elsewhere in the file is still RED',
  e3.code === 1 && countOf(e3.out, '(c) secret-shaped string:') === 1);

console.log('symlinks are followed for content, never crashed on:');
// Widening the walker to `e.isFile() || e.isSymbolicLink()` fed symlinks straight into
// readFileSync: ENOENT on a dangling link, EISDIR on a link to a directory. Because findings
// are only flushed at the end, ONE bad link turned a KB holding a real credential into a Node
// stack trace and zero reported findings — fail-closed on the exit code, fail-OPEN on the
// information. Every fixture below therefore carries a real AWS key in a normal file, and
// asserts that BOTH findings survive: the exit code alone cannot tell a crash from a catch.
var S = path.join(TEST_DIR, 'symlink');
fs.mkdirSync(path.join(S, 'sub'), { recursive: true });
fs.writeFileSync(path.join(S, '_index.md'), '# kb\n');
fs.writeFileSync(path.join(S, 'sub', '_index.md'), '# sub\n');

// A symlinked note is as published as a copied one, so a resolvable link is still SCANNED.
fs.writeFileSync(path.join(S, 'sub', 'real.md'), 'aws_key: AKIAIOSFODNN7EXAMPLE\n');
fs.symlinkSync(path.join(S, 'sub', 'real.md'), path.join(S, 'link-to-file.md'));
var sFile = run([S, '--scaffold', SCAFFOLD]);
assert('a symlink to a real file is still scanned for secrets',
  sFile.code === 1 && sFile.out.indexOf('(c) secret-shaped string: link-to-file.md:1') !== -1);
fs.rmSync(path.join(S, 'link-to-file.md'));
fs.rmSync(path.join(S, 'sub', 'real.md'));

// Case 1: DANGLING link (ENOENT). The co-located key is the assert that would have caught
// the regression — a crash reports neither, a catch reports both.
fs.writeFileSync(path.join(S, 'leak.md'), 'aws_key: AKIAIOSFODNN7EXAMPLE\n');
fs.symlinkSync(path.join(S, 'no-such-target.md'), path.join(S, 'broken.md'));
var sDangling = run([S, '--scaffold', SCAFFOLD]);
assert('a DANGLING symlink is reported, not crashed on',
  sDangling.code === 1 && sDangling.out.indexOf('(c) UNREADABLE symlink: broken.md') !== -1);
assert('the dangling symlink does not suppress a real key elsewhere in the KB',
  sDangling.out.indexOf('(c) secret-shaped string: leak.md:1') !== -1);
fs.rmSync(path.join(S, 'broken.md'));

// Case 2: link to a DIRECTORY (EISDIR). Reported rather than skipped for the same reason
// (b) NOT RUN is reported: an unscannable path is an unscanned subtree, not a clean one.
fs.symlinkSync(path.join(S, 'sub'), path.join(S, 'dirlink'));
var sDir = run([S, '--scaffold', SCAFFOLD]);
assert('a symlink to a DIRECTORY is reported, not crashed on',
  sDir.code === 1 && sDir.out.indexOf('(c) UNREADABLE symlink: dirlink') !== -1);
assert('the directory symlink does not suppress a real key elsewhere in the KB',
  sDir.out.indexOf('(c) secret-shaped string: leak.md:1') !== -1);
fs.rmSync(path.join(S, 'dirlink'));
fs.rmSync(path.join(S, 'leak.md'));
assert('the KB is GREEN again once the bad links and the key are gone',
  run([S, '--scaffold', SCAFFOLD]).code === 0);

console.log('missing knowledge base:');
assert('a missing knowledge-base/ is RED, not a silent pass',
  run([path.join(TEST_DIR, 'nope'), '--scaffold', SCAFFOLD]).code === 1);

console.log('a check that could not RUN is not a check that passed:');
// The blocker this suite missed: an entirely unfilled knowledge base reported GREEN whenever
// the scaffold was not where the tool guessed — which is the default in every repo whose
// .claude/ has no references/, including this one.
var U = path.join(TEST_DIR, 'unfilled');
fs.cpSync(SCAFFOLD, U, { recursive: true });
var bogus = run([U, '--scaffold', path.join(TEST_DIR, 'no-such-scaffold')]);
assert('an unfilled KB with a bogus --scaffold is RED, not "skipped"', bogus.code === 1);
assert('the finding says NOT RUN and names the missing scaffold', bogus.out.indexOf('(b) NOT RUN') !== -1);

console.log('argv is parsed strictly:');
// A gate that mis-parses its own invocation silently checks the wrong directory. The exit
// CODE alone cannot pin this: the lax parser ALSO exits 1, because its mis-parse falls
// through to a default scaffold path that does not exist and trips (b) NOT RUN. The
// rejection MESSAGE is the only thing that separates "refused the argv" from "failed for an
// unrelated reason" — asserting the code alone let all four of these pass against the bug.
var noValue = run([U, '--scaffold']);
assert('a valueless --scaffold is rejected by name',
  noValue.code === 1 && noValue.out.indexOf('--scaffold requires a directory argument') !== -1);
var flagValue = run([U, '--scaffold', '--verbose']);
assert('--scaffold followed by another flag is rejected by name',
  flagValue.code === 1 && flagValue.out.indexOf('--scaffold requires a directory argument') !== -1);
var unknown = run([U, '--bogus']);
assert('an unknown flag is rejected by name',
  unknown.code === 1 && unknown.out.indexOf('unknown flag --bogus') !== -1);
// Two REAL directories, so a lax parser silently prefers the second and checks the wrong KB.
var twoPos = run([A, U]);
assert('a second positional is rejected, not silently preferred',
  twoPos.code === 1 && twoPos.out.indexOf('unexpected second positional argument') !== -1);

console.log('the guard.mjs twin stays byte-identical:');
// This tool blocks the COMMIT; template/.claude/hooks/guard.mjs blocks the WRITE using a
// DUPLICATE of the same literal — duplicated because hooks are copied standalone into adopter
// repos and must stay dependency-free. Nothing else detects the two drifting apart, and a drift
// means one gate accepts exactly what the other rejects. This assert cannot live in the hooks'
// smoke test: that file ships into adopter repos, where tools/kb-check.mjs does not exist.
const GUARD = path.join(__dirname, '..', 'template', '.claude', 'hooks', 'guard.mjs');
function regexLiteral(file, name) {
  var m = fs.readFileSync(file, 'utf-8').match(new RegExp('^const ' + name + ' = (/.*/[a-z]*);$', 'm'));
  return m === null ? null : m[1];
}
var toolLiteral = regexLiteral(KB_CHECK, 'SECRET_SHAPE');
var hookLiteral = regexLiteral(GUARD, 'KB_SECRET');
assert('SECRET_SHAPE (tools/kb-check.mjs) and KB_SECRET (template/.claude/hooks/guard.mjs) are byte-identical',
  toolLiteral !== null && hookLiteral !== null && toolLiteral === hookLiteral);

fs.rmSync(TEST_DIR, { recursive: true, force: true });

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
