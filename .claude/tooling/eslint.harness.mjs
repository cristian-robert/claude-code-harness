// ESLint flat-config fragment for the harness's OWN files.
//
// `.claude/hooks/*.mjs` and `.claude/statusline.mjs` are Node ESM: they read
// `process.stdin`, write `process.stdout`, and use `Buffer`. A project whose lint
// script is `eslint .` reports ~63 `no-undef` errors the moment PHE is installed —
// product code clean, harness red. That is not cosmetic: /harness-init may then
// arm `lint` as a stop gate, and a stop gate that is red at arm time is red on
// every turn thereafter.
//
// Wire it into the project's root eslint.config.js:
//
//     import js from "@eslint/js";
//     import harness from "./.claude/tooling/eslint.harness.mjs";
//     export default [js.configs.recommended, ...harness];
//
// To exclude the harness from linting entirely instead, add to that same config:
//
//     { ignores: [".claude/**"] }
//
// Either is fine — the hooks are covered by `.claude/hooks/smoke-test.mjs`, not by
// the product's linter. What is NOT fine is leaving `eslint .` red and arming it.
export default [
  {
    files: [".claude/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
  },
];
