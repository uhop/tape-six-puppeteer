# AGENTS.md — tape-six-puppeteer

> `tape-six-puppeteer` is a helper for [tape-six](https://github.com/uhop/tape-six) that runs test files in a headless browser via Puppeteer. Each test file runs in its own iframe in a headless engine — Chromium (default) or Firefox, selectable via `--browser`. The npm package name is `tape-six-puppeteer` and the CLI command is `tape6-puppeteer`.

## Setup

This project uses a git submodule (wiki):

```bash
git clone --recursive https://github.com/uhop/tape-six-puppeteer.git
cd tape-six-puppeteer
npm install
```

There is no build step. `npm install` runs `postinstall` which installs Puppeteer's bundled Chromium. Firefox is not installed by default — run `npm run browser:all` (or `npx puppeteer browsers install firefox`) to add it.

## Commands

- **Install:** `npm install`
- **Test (Node):** `npm test` (runs `tape6-puppeteer --start-server --flags FO`)
- **Test (Firefox):** `npm run test:firefox` — runs the suite on Firefox (`--browser firefox`)
- **Test (all engines):** `npm run test:all` — fans out over Chromium and Firefox in one invocation (`--browsers all`)
- **Test (Bun):** `npm run test:bun`
- **Test (Deno):** `npm run test:deno`
- **Install all engines:** `npm run browser:all` (Chromium + Firefox)
- **Lint:** `npm run lint` (Prettier check)
- **Lint fix:** `npm run lint:fix` (Prettier write)
- **Type check (sidecars):** `npm run ts-check` (strict `tsc` over `.d.ts` sidecars via `tsconfig.json`, no emit)
- **Type check (sources):** `npm run js-check` (`tsc` over `.js` sources via `tsconfig.check.json`, no emit)

## Project structure

```
tape-six-puppeteer/
├── package.json          # Package config; "tape6" section configures test discovery
├── tsconfig.json         # strict ts-check config (.d.ts sidecars)
├── tsconfig.check.json   # js-check config (TypeScript as linter for .js sources)
├── bin/
│   ├── tape6-puppeteer.js     # CLI entry point (--help/--version/--self fast path, else delegates)
│   └── tape6-puppeteer-node.js # One runDriverCli() call into tape-six's driver kit
├── src/
│   ├── TestWorker.js     # Puppeteer adapter for the kit's TestWorker base
│   └── TestWorker.d.ts   # Type sidecar (@ts-self-types): narrows kit driver handles to Puppeteer types
├── tests/                # Test files (test-*.js, test-*.mjs, test-*.html)
├── wiki/                 # GitHub wiki documentation (submodule)
├── README.md
└── LICENSE
```

## Code style

- **ES modules** throughout (`"type": "module"` in package.json).
- **Prettier** for formatting (see `.prettierrc`).
- Imports at the top of files, using `import` syntax.
- **No narrating comments.** Comments are short _why_-markers only — a non-trivial decision or constraint, or an algorithm reference. Never restate _what_ the code does; JSDoc only when explicitly requested.
- The package name is `tape-six-puppeteer` but the CLI command is `tape6-puppeteer`.

## Architecture

- `bin/tape6-puppeteer.js` is the CLI entry point. Handles `--help`, `--version`, and `--self` directly. Otherwise delegates to `bin/tape6-puppeteer-node.js`.
- `bin/tape6-puppeteer-node.js` is a single `runDriverCli({packageUrl, commandName, description, supportedBrowsers, TestWorker})` call into `tape-six/driver/cli.js`. The kit owns the whole driver-bin flow: option/env parsing, protocol resolution like `tape6-server`'s (`--h2` > `TAPE6_PROTOCOL` > `tape6.server.protocol` config > `h1`; h2 upgrades the server URL to `https:`), `ensureServer` (auto-start under `--start-server`, `--h2` passed through; the h2 server mode is Node-only, so under Bun/Deno the server child runs on `node`), the `controlFetch` control plane (request-scoped TLS trust — `TAPE6_CERT` as pinned CA, else the server's cached self-signed cert, else relaxed verification, never process-wide; hard 3s deadlines; explicit TLS-vs-plaintext mismatch diagnostics; a brief port-release wait before self-launching), test-file + importmap fetches (`/--patterns`, `/--tests`, `/--importmap`), and the per-engine run loop with summary and exit code.
- `TestWorker` (in `src/TestWorker.js`) is the Puppeteer adapter for the kit base in `tape-six/driver/TestWorker.js`, which owns the task lifecycle: per-task `BrowserContext` → `Page` (full origin/storage isolation) with completion driven by the page `close` event, `__tape6_reporter` / `__tape6_error` page functions, iframe injection via `tape-six/driver/bootstrap.js`, cooperative drain + force-kill, and cleanup. The adapter supplies `supportedBrowsers`, `pageErrorEvent: 'error'`, `launchBrowser`, and `newContext` (an isolated context via `createBrowserContext()`; the h2 cert flag is taken at launch instead).
- **Browser selection:** `--browser <chromium|firefox>` / `-b` (env `TAPE6_BROWSER`, default `chromium`; precedence CLI > env > default) picks the engine. The kit base resolves it and calls the adapter's `launchBrowser(name, {insecure})` — `puppeteer.launch({browser})`, mapping the user-facing `chromium` to Puppeteer's launch product `chrome` (Chrome for Testing); Firefox is driven over WebDriver BiDi. `--no-sandbox` is applied to Chromium only (Firefox launches without it). `supportedBrowsers` (exported from `src/TestWorker.js`, passed to `runDriverCli`) is the single source of truth the CLI validates against. Only Chrome is fetched by `postinstall`; a missing engine fails the run with an `npx puppeteer browsers install <product>` hint (a launch failure reports a failure, so the run exits non-zero rather than a false pass). Puppeteer drives only Chromium and Firefox — for WebKit use the sibling runner [tape-six-playwright](https://github.com/uhop/tape-six-playwright).
- **Multi-engine fan-out:** `--browsers <list|all>` (env `TAPE6_BROWSERS`; overrides `--browser`; duplicates deduped) runs the suite once per engine sequentially — one `TestWorker` and a fresh reporter per engine, so counts and summaries are per-engine — then prints `Browsers: <name> PASS|FAIL, ...` and exits non-zero if any engine failed. A failed-to-launch engine records FAIL; remaining engines still run.
- **HTTP/2 / TLS:** with an `https:` server URL (from `--h2` or an explicit URL) the adapter's `launchBrowser` adds `acceptInsecureCerts: true` — the tape6 cert ladder ends in a self-signed certificate; the launch-level option covers Chromium (CDP) and Firefox (WebDriver BiDi) alike, which is why `newContext` takes no cert flag.
- **Types:** `src/TestWorker.d.ts` is a hand-written sidecar (advertised via `// @ts-self-types` in `TestWorker.js`) built on tape-six's shipped driver-kit types; it narrows the kit base's deliberately-`any` driver handles to Puppeteer's `Browser` / `BrowserContext`. No `TestWorkerOptions` interface and no constructor union — tape-six ≥ 1.14.1 typings made both unnecessary, and the option keys are read inside the kit. `npm run ts-check` verifies it strictly.
- For `.html` files: loaded as iframe `src` with query parameters (`id`, `test-file-name`, `flags`).
- For `.js`/`.mjs` files: an HTML document is written into the iframe with an `importmap` and a dynamic module script.
- Unsupported extensions (`.cjs`, `.ts`, `.cts`, `.mts`) are skipped with a warning.
- Each iframe's `tape-six` auto-detects `window.parent.__tape6_reporter` and uses a `ProxyReporter` to send events back.
- **Worker control channel** (`destroyTask(id, reason)`): the provider side of tape-six's control plane (full spec: `dev-docs/worker-control-channel.md` in the tape-six repo), implemented by the kit base and inherited by the adapter. `done` closes the task's context. An abort reason (`failOnce` / `timeout`) first cooperatively drains the running test — posting `{type: 'tape6-terminate'}` into its iframe so it unwinds at the next assertion and runs cleanup hooks — then, after `graceTimeout` (`TAPE6_GRACE_TIMEOUT`, default 5000), force-kills it by closing the context (the Node-side kill in-page JS can't perform on itself). Per-task completion is driven by the page `close` event, never by a reported event, so a force-killed page — which emits nothing — still completes `close(id)` exactly once.

## Dependencies

- **`tape-six`** (^1.15.0 — the driver-kit floor) — the core test library. Imports: `driver/TestWorker.js` (the kit base class), `driver/cli.js` (`runDriverCli`), plus `utils/config.js` (`printFlagOptions`) in the wrapper bin.
- **`puppeteer`** — headless browser automation (Chromium and Firefox). Bundled Chromium is installed via `postinstall`; Firefox is fetched on demand (`npm run browser:all`).

## Server

`tape6-puppeteer` requires `tape6-server` (from `tape-six`) to serve test files to the browser.

- `--start-server` flag auto-starts the server.
- Without it, the server must be running. The runner prints instructions if it's unreachable.
- Server URL: `--server-url URL` (`-u`), `TAPE6_SERVER_URL` env var, `HOST`/`PORT`, or default `http://localhost:3000`.
- Server endpoints used: `GET /--tests` (test file list), `GET /--patterns?q=...` (filtered file list), `GET /--importmap` (import map).
- HTTP/2 (tape-six 1.12+): `--h2`, `TAPE6_PROTOCOL=h2`, or `tape6.server.protocol` config. Self-signed certs are handled automatically (browser launch: `acceptInsecureCerts`; control requests: `TAPE6_CERT` > cached server cert > relaxed, scoped to those requests). HTTP/1.1 stays the default.

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
