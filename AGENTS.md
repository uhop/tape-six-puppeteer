# AGENTS.md — tape-six-puppeteer

> `tape-six-puppeteer` is a helper for [tape-six](https://github.com/uhop/tape-six) that runs test files in a headless browser via Puppeteer. Each test file runs in its own iframe inside headless Chrome. The npm package name is `tape-six-puppeteer` and the CLI command is `tape6-puppeteer`.

## Setup

This project uses a git submodule (wiki):

```bash
git clone --recursive git@github.com:uhop/tape-six-puppeteer.git
cd tape-six-puppeteer
npm install
```

There is no build step. `npm install` runs `postinstall` which installs Puppeteer's bundled Chromium.

## Commands

- **Install:** `npm install`
- **Test (Node):** `npm test` (runs `tape6-puppeteer --start-server --flags FO`)
- **Test (Bun):** `npm run test:bun`
- **Test (Deno):** `npm run test:deno`
- **Lint:** `npm run lint` (Prettier check)
- **Lint fix:** `npm run lint:fix` (Prettier write)

## Project structure

```
tape-six-puppeteer/
├── package.json          # Package config; "tape6" section configures test discovery
├── bin/
│   ├── tape-six-puppeteer.js     # CLI entry point (--self flag or delegates to -node.js)
│   └── tape-six-puppeteer-node.js # Main CLI: config, reporter, server, test execution
├── src/
│   └── TestWorker.js     # TestWorker class: launches Puppeteer, runs tests in iframes
├── tests/                # Test files (test-*.js, test-*.mjs, test-*.html)
├── wiki/                 # GitHub wiki documentation (submodule)
├── README.md
└── LICENSE
```

## Code style

- **ES modules** throughout (`"type": "module"` in package.json).
- **Prettier** for formatting (see `.prettierrc`).
- Imports at the top of files, using `import` syntax.
- The package name is `tape-six-puppeteer` but the CLI command is `tape6-puppeteer`.

## Architecture

- `bin/tape-six-puppeteer.js` is the CLI entry point. With `--self` it prints its own path (for cross-runtime usage). Otherwise it delegates to `bin/tape-six-puppeteer-node.js`.
- `bin/tape-six-puppeteer-node.js` parses CLI arguments, sets up the reporter, ensures `tape6-server` is running (with optional `--start-server`), fetches test files and importmap from the server, and runs them via `TestWorker`.
- `TestWorker` (in `src/TestWorker.js`) extends `EventServer` from `tape-six`. It launches headless Chrome via Puppeteer, exposes `__tape6_reporter` and `__tape6_error` globals, and runs each test file in a separate iframe.
- For `.html` files: loaded as iframe `src` with query parameters (`id`, `test-file-name`, `flags`).
- For `.js`/`.mjs` files: an HTML document is written into the iframe with an `importmap` and a dynamic module script.
- Unsupported extensions (`.cjs`, `.ts`, `.cts`, `.mts`) are skipped with a warning.
- Each iframe's `tape-six` auto-detects `window.parent.__tape6_reporter` and uses a `ProxyReporter` to send events back.

## Dependencies

- **`tape-six`** — the core test library. Imports: `State.js`, `utils/EventServer.js`, `utils/config.js`, `test.js`, reporters, and `utils/timer.js`.
- **`puppeteer`** — headless Chrome automation. Bundled Chromium is installed via `postinstall`.

## Server

`tape6-puppeteer` requires `tape6-server` (from `tape-six`) to serve test files to the browser.

- `--start-server` flag auto-starts the server.
- Without it, the server must be running. The runner prints instructions if it's unreachable.
- Server URL: `TAPE6_SERVER_URL` env var, or `HOST`/`PORT`, or default `http://localhost:3000`.
- Server endpoints used: `GET /--tests` (test file list), `GET /--importmap` (import map).

## Writing tests

Tests are standard `tape-six` tests that run in a real browser environment:

```js
import test from 'tape-six';

test('DOM example', t => {
  const el = document.createElement('div');
  el.textContent = 'hello';
  t.equal(el.textContent, 'hello', 'element works');
});
```

- `.js` and `.mjs` files run as ES modules in an iframe with an injected importmap.
- `.html` files are loaded directly as iframe src.
- Test file naming convention: `test-*.js`, `test-*.mjs`, `test-*.html`.
- Tests are configured in `package.json` under the `"tape6"` section (same as `tape-six`).

## Key conventions

- Do not add dependencies unless absolutely necessary.
- The `--self` flag prints the path to `tape-six-puppeteer.js` for use in cross-runtime scripts (Bun, Deno).
- Wiki documentation lives in the `wiki/` submodule.
- Environment variables use the `TAPE6_` prefix (shared with `tape-six`).
- Configuration is read from `tape6.json` or the `"tape6"` section of `package.json` (same as `tape-six`).
