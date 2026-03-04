---
description: Pre-release verification checklist for tape-six-puppeteer
---

# Release Check

Run through this checklist before publishing a new version.

## Steps

1. Check that `AGENTS.md` is up to date with any rule or workflow changes.
2. Check that `wiki/Home.md` links to all relevant wiki pages.
3. Check that `wiki/Release-notes.md` is updated with the new version.
4. Check that `wiki/Utility-‐-tape6‐puppeteer.md` reflects any CLI changes.
5. Check that `llms.txt` and `llms-full.txt` are up to date with any CLI or architecture changes.
6. Verify `package.json`:
   - `files` array includes all necessary entries (`bin`, `src`, `llms.txt`, `llms-full.txt`).
   - `bin` entries cover all CLI utilities.
7. Bump `version` in `package.json`.
8. Update release history in `README.md`.
9. Run `npm install` to regenerate `package-lock.json`.
   // turbo
10. Run the full test suite with Node: `npm test`
    // turbo
11. Run tests with Bun: `npm run test:bun`
    // turbo
12. Run tests with Deno: `npm run test:deno`
    // turbo
13. Run lint: `npm run lint`
    // turbo
14. Dry-run publish to verify package contents: `npm pack --dry-run`
