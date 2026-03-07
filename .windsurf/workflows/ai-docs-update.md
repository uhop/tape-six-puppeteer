---
description: Update AI-facing documentation files after CLI or architecture changes
---

# AI Documentation Update

Update all AI-facing files after changes to the CLI, architecture, or project structure.

## Steps

1. Read `bin/tape6-puppeteer.js`, `bin/tape6-puppeteer-node.js`, and `src/TestWorker.js` to identify the current CLI options and architecture.
2. Read `AGENTS.md` for current state.
3. Update `llms.txt`:
   - Ensure the CLI section matches actual options and behavior.
   - Update common patterns if new features were added.
   - Keep it concise — this is for quick LLM consumption.
4. Update `llms-full.txt`:
   - Full CLI reference with all options, environment variables, and examples.
   - Include any new architecture updates.
5. Update `AGENTS.md` if critical rules, commands, or architecture quick reference changed.
6. Update `wiki/Home.md` if the overview needs to reflect new features.
7. Update `wiki/Utility-‐-tape6‐puppeteer.md` if CLI options or cross-runtime usage changed.
8. Sync `.windsurfrules`, `.cursorrules`, `.clinerules` if `AGENTS.md` critical rules or code style changed:
   - These three files should be identical copies.
9. Review `prompts/init.md` for any needed updates to project guidelines.
10. Track progress with the todo list and provide a summary when done.
