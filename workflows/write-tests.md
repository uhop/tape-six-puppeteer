---
description: Write or update tape-six browser tests to be run with tape-six-puppeteer
---

# Write Tests

Write or update tests using the tape-six testing library, run via tape-six-puppeteer in headless Chrome iframes.

## Notes

- `tape-six` supports ES modules (`.js`, `.mjs`) and HTML files (`.html`) for browser tests.
- Tests run in a real browser environment with full DOM and browser API access.
- `tape6-puppeteer` runs each test file in its own iframe for isolation. There is no sequential runner — use `tape6-puppeteer --par 1` to run one file at a time if needed.
- `.cjs`, `.ts`, `.cts`, `.mts` files are not supported in the browser and will be skipped.

## Steps

1. Read the testing guide at `node_modules/tape-six/TESTING.md` for API reference and patterns.
2. Identify the browser feature or API to test. Consider what needs a real browser environment.
3. Create or update the test file in `tests/test-<name>.js` (or `.mjs` or `.html`):
   - For `.js`/`.mjs`: import `test` from `tape-six` and use browser APIs (DOM, fetch, etc.).
   - For `.html`: include an importmap and inline `<script type="module">` with tests.
   - Write one top-level `test()` per logical group.
   - Use embedded `await t.test()` for sub-cases.
   - Cover: normal operation, edge cases, error conditions.
   - Use `t.equal` for primitives, `t.deepEqual` for objects/arrays, `t.ok`/`t.notOk` for truthiness.
   - All `msg` arguments are optional but recommended for clarity.
     // turbo
4. Run the full test suite to verify: `npm test`
5. Report results and any failures.
