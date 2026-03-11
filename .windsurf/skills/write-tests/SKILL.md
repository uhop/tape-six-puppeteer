---
name: write-tests
description: Write or update tape-six browser tests to be run with tape-six-puppeteer. Use when asked to write tests, add test coverage, or create test files.
---

# Write Tests

Follow the tape-six skill and testing guide, with browser-specific notes below:

1. Read `node_modules/tape-six/skills/write-tests/SKILL.md` for the full skill steps.
2. Read `node_modules/tape-six/TESTING.md` for the API reference and patterns.
3. Follow the project conventions in `AGENTS.md`.

## Browser-specific notes

- Tests run in a real browser environment with full DOM and browser API access.
- `tape6-puppeteer` runs each test file in its own iframe for isolation. There is no sequential runner — use `tape6-puppeteer --par 1` to run one file at a time if needed.
- Supported formats: `.js`, `.mjs` (ES modules), `.html` (loaded as iframe src).
- `.cjs`, `.ts`, `.cts`, `.mts` files are not supported in the browser and will be skipped.
- For `.html` files: include an importmap and inline `<script type="module">` with tests.
