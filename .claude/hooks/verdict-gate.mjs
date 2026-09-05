#!/usr/bin/env node
// SubagentStop (settings.json matcher: "code-reviewer"): the reviewer verdict
// contract, enforced. The first non-empty line of the reviewer's final message
// must be exactly PASS or REQUEST_CHANGES; anything else exits 2 so the stderr
// is fed back and the reviewer re-emits in contract format.
// Loop guard: stop_hook_active => exit 0. Fails OPEN on parse errors.
async function main() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const event = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (event.stop_hook_active) process.exit(0);

  const msg = event.last_assistant_message;
  if (typeof msg !== "string") process.exit(0); // absent: nothing to judge

  const first = msg.split("\n").map(l => l.trim()).find(Boolean) || "";
  if (first === "PASS" || first === "REQUEST_CHANGES") process.exit(0);

  process.stderr.write("Reviewer output must start with PASS or REQUEST_CHANGES on the first line, then follow the verdict contract. Re-emit your verdict in the required format.");
  process.exit(2);
}

main().catch(() => process.exit(0)); // fail open: a broken gate must not wedge the reviewer
