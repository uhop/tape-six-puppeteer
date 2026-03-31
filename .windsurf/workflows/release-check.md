---
description: Pre-release verification checklist for tape-six-puppeteer
---

# Release Check

Run through this checklist before publishing a new version.

## Steps

1. Check that `AGENTS.md` is up to date with any rule or workflow changes.
2. Check that `.windsurfrules`, `.clinerules`, `.cursorrules` are in sync with `AGENTS.md`.
3. Check that `wiki/Home.md` links to all relevant wiki pages.
4. Check that `wiki/Release-notes.md` is updated with the new version.
5. Check that `wiki/Utility-‐-tape6‐puppeteer.md` reflects any CLI changes.
6. Check that `llms.txt` and `llms-full.txt` are up to date with any CLI or architecture changes.
7. Verify `package.json`:
   - `files` array includes all necessary entries (`bin`, `src`, `llms.txt`, `llms-full.txt`).
   - `bin` entries cover all CLI utilities.
8. Check that the copyright year in `LICENSE` includes the current year (e.g., update `2024` → `2024-2026` or `2005-2024` → `2005-2026`).
9. Bump `version` in `package.json`.
10. Update release history in `README.md`.
11. Run `npm install` to regenerate `package-lock.json`.
    // turbo
12. Run the full test suite with Node: `npm test`
    // turbo
13. Run tests with Bun: `npm run test:bun`
    // turbo
14. Run tests with Deno: `npm run test:deno`
    // turbo
15. Run lint: `npm run lint`
    // turbo
16. Dry-run publish to verify package contents: `npm pack --dry-run`
