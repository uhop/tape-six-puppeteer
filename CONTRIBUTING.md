# Contributing to tape-six-puppeteer

Thank you for your interest in contributing!

## Getting started

This project uses a git submodule for the wiki. Clone and install:

```bash
git clone --recursive git@github.com:uhop/tape-six-puppeteer.git
cd tape-six-puppeteer
npm install
```

## Development workflow

1. Make your changes.
2. Format: `npm run lint:fix`
3. Test: `npm test`

## Code style

- ES modules (`import`/`export`), no CommonJS in source.
- Formatted with Prettier — run `npm run lint:fix` before committing.
- No unnecessary dependencies.

## AI agents

If you are an AI coding agent, see [AGENTS.md](./AGENTS.md) for detailed project conventions, commands, and architecture.
