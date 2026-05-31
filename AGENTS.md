# AGENTS.md — tape-six-puppeteer

> `tape-six-puppeteer` is a helper for [tape-six](https://github.com/uhop/tape-six) that runs test files in a headless browser via Puppeteer. Each test file runs in its own iframe in a headless engine — Chromium (default) or Firefox, selectable via `--browser`. The npm package name is `tape-six-puppeteer` and the CLI command is `tape6-puppeteer`.

## Setup

This project uses a git submodule (wiki):

```bash
git clone --recursive git@github.com:uhop/tape-six-puppeteer.git
cd tape-six-puppeteer
npm install
```

There is no build step. `npm install` runs `postinstall` which installs Puppeteer's bundled Chromium. Firefox is not installed by default — run `npm run browser:all` (or `npx puppeteer browsers install firefox`) to add it.

## Commands

- **Install:** `npm install`
- **Test (Node):** `npm test` (runs `tape6-puppeteer --start-server --flags FO`)
- **Test (Firefox):** `npm run test:firefox` — runs the suite on Firefox (`--browser firefox`)
- **Test (Bun):** `npm run test:bun`
- **Test (Deno):** `npm run test:deno`
- **Install all engines:** `npm run browser:all` (Chromium + Firefox)
- **Lint:** `npm run lint` (Prettier check)
- **Lint fix:** `npm run lint:fix` (Prettier write)

## Project structure

```
tape-six-puppeteer/
├── package.json          # Package config; "tape6" section configures test discovery
├── bin/
│   ├── tape6-puppeteer.js     # CLI entry point (--self flag or delegates to -node.js)
│   └── tape6-puppeteer-node.js # Main CLI: config, reporter, server, test execution
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

- `bin/tape6-puppeteer.js` is the CLI entry point. Handles `--help`, `--version`, and `--self` directly. Otherwise delegates to `bin/tape6-puppeteer-node.js`.
- `bin/tape6-puppeteer-node.js` uses `getOptions()` and `initReporter()` from `tape-six` for CLI parsing and reporter setup. Ensures `tape6-server` is running (with optional `--start-server`), fetches test files from the server (via `/--patterns` or `/--tests`) and importmap, then runs tests via `TestWorker`.
- `TestWorker` (in `src/TestWorker.js`) extends `EventServer` from `tape-six`. It launches one headless browser of the selected engine via Puppeteer; each test file runs in its own `BrowserContext` → `Page` (full origin/storage isolation), with `__tape6_reporter` and `__tape6_error` exposed as page functions and the test itself in an iframe inside that page.
- **Browser selection:** `--browser <chromium|firefox>` / `-b` (env `TAPE6_BROWSER`, default `chromium`; precedence CLI > env > default) picks the engine. `TestWorker.#init()` dynamic-picks it via `puppeteer.launch({browser})`, mapping the user-facing `chromium` to Puppeteer's launch product `chrome` (Chrome for Testing); Firefox is driven over WebDriver BiDi. `--no-sandbox` is applied to Chromium only (Firefox launches without it). `supportedBrowsers` (exported from `src/TestWorker.js`) is the single source of truth the CLI validates against. Only Chrome is fetched by `postinstall`; a missing engine fails the run with an `npx puppeteer browsers install <product>` hint (a launch failure reports a failure, so the run exits non-zero rather than a false pass). Puppeteer drives only Chromium and Firefox — for WebKit use the sibling runner [tape-six-playwright](https://github.com/uhop/tape-six-playwright).
- For `.html` files: loaded as iframe `src` with query parameters (`id`, `test-file-name`, `flags`).
- For `.js`/`.mjs` files: an HTML document is written into the iframe with an `importmap` and a dynamic module script.
- Unsupported extensions (`.cjs`, `.ts`, `.cts`, `.mts`) are skipped with a warning.
- Each iframe's `tape-six` auto-detects `window.parent.__tape6_reporter` and uses a `ProxyReporter` to send events back.
- **Worker control channel** (`destroyTask(id, reason)`): the provider side of tape-six's control plane (full spec: `dev-docs/worker-control-channel.md` in the tape-six repo). `done` closes the task's context. An abort reason (`failOnce` / `timeout`) first cooperatively drains the running test — posting `{type: 'tape6-terminate'}` into its iframe so it unwinds at the next assertion and runs cleanup hooks — then, after `graceTimeout` (`TAPE6_GRACE_TIMEOUT`, default 5000), force-kills it by closing the context (the Node-side kill in-page JS can't perform on itself). Per-task completion is driven by the page `close` event, never by a reported event, so a force-killed page — which emits nothing — still completes `close(id)` exactly once. The cooperative drain is active with the current `tape-six` dependency (`^1.10`, which ships the in-iframe `tape6-terminate` listener); the force-kill backstop is driver-side and version-independent.

## Dependencies

- **`tape-six`** — the core test library. Imports: `State.js`, `utils/EventServer.js`, `utils/config.js` (`getOptions`, `initReporter`, `showInfo`, `printFlagOptions`), `test.js`, `utils/timer.js`.
- **`puppeteer`** — headless browser automation (Chromium and Firefox). Bundled Chromium is installed via `postinstall`; Firefox is fetched on demand (`npm run browser:all`).

## Server

`tape6-puppeteer` requires `tape6-server` (from `tape-six`) to serve test files to the browser.

- `--start-server` flag auto-starts the server.
- Without it, the server must be running. The runner prints instructions if it's unreachable.
- Server URL: `--server-url URL` (`-u`), `TAPE6_SERVER_URL` env var, `HOST`/`PORT`, or default `http://localhost:3000`.
- Server endpoints used: `GET /--tests` (test file list), `GET /--patterns?q=...` (filtered file list), `GET /--importmap` (import map).

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
- The `--self` flag prints the path to `tape6-puppeteer.js` for use in cross-runtime scripts (Bun, Deno).
- Wiki documentation lives in the `wiki/` submodule.
- Environment variables use the `TAPE6_` prefix (shared with `tape-six`).
- Configuration is read from `tape6.json` or the `"tape6"` section of `package.json` (same as `tape-six`).
