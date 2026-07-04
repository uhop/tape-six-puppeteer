# Architecture

`tape-six-puppeteer` is the browser worker provider for [tape-six](https://github.com/uhop/tape-six): it runs each test file in its own browser context — a separate page and iframe with isolated cookies and storage — in a headless engine driven by Puppeteer (Chromium over CDP, Firefox over WebDriver BiDi), on Node, Deno, and Bun. Runtime dependencies are minimal by design: `tape-six` (the core test library) and `puppeteer` (browser automation).

## Project layout

```
tape-six-puppeteer/
├── package.json          # Package config; "tape6" section configures test discovery
├── tsconfig.json         # strict ts-check config (.d.ts sidecars)
├── tsconfig.check.json   # js-check config (TypeScript as linter for .js sources)
├── bin/
│   ├── tape6-puppeteer.js      # CLI entry point (--self flag or delegates to tape6-puppeteer-node.js)
│   └── tape6-puppeteer-node.js # Main CLI: config, reporter, server handshake, test execution
├── src/
│   ├── TestWorker.js     # TestWorker class: launches the browser, runs tests in per-context iframes
│   ├── TestWorker.d.ts   # Type sidecar (@ts-self-types)
│   └── controlFetch.js   # Control-plane client: cert-tolerant https GETs for the runner's server requests
├── tests/                # Automated tests (test-*.js, test-*.mjs, test-*.html);
│                         # tests/manual/ holds hand-runnable control-channel fixtures
└── wiki/                 # GitHub wiki documentation (submodule)
```

## Control flow

- `bin/tape6-puppeteer.js` is the CLI entry point. It handles `--help`, `--version`, and `--self` (prints its own path for cross-runtime usage) directly; otherwise it delegates to `bin/tape6-puppeteer-node.js`.
- `bin/tape6-puppeteer-node.js` delegates argument parsing and reporter setup to `tape-six/utils/config.js` (`getOptions`, `initReporter`, `showInfo`). It resolves the server protocol like `tape6-server` does (`--h2` > `TAPE6_PROTOCOL` > `tape6.server.protocol` config > `h1`; h2 upgrades the server URL to `https:`), ensures `tape6-server` is reachable (auto-spawning it under `--start-server`, passing `--h2` through; the h2 server mode is Node-only, so under Bun/Deno the server child runs on `node` from `PATH`), fetches the test-file list (`/--tests` or `/--patterns`) and the importmap (`/--importmap`) from the server, then runs tests via `TestWorker`. On `https:` those control requests go through `src/controlFetch.js` — `node:https` with request-scoped trust (`TAPE6_CERT` as pinned CA, else the server's cached self-signed cert, else relaxed verification; never process-wide).
- `TestWorker` (`src/TestWorker.js`) extends `EventServer` from `tape-six`. It launches one headless browser of the selected engine (`--browser chromium|firefox`, env `TAPE6_BROWSER`; `chromium` maps to Puppeteer's `chrome` product — Chrome for Testing); each test file runs in its own `BrowserContext` → `Page`, with the test itself in an iframe inside that page. With an `https:` server URL the browser launches with `acceptInsecureCerts: true` (the tape6 cert ladder ends in a self-signed certificate; the option covers Chromium over CDP and Firefox over WebDriver BiDi alike). `src/TestWorker.d.ts` is the hand-written type sidecar (advertised via `// @ts-self-types`), built on tape-six's shipped `EventServer` types.
- `--browsers <list|all>` (env `TAPE6_BROWSERS`; overrides `--browser`) fans out over several engines in one invocation: the suite runs once per engine sequentially with one `TestWorker` and a fresh reporter per engine, then a final `Browsers: <name> PASS|FAIL, ...` line; the run exits non-zero if any engine failed, and a failed-to-launch engine records FAIL without stopping the rest.

## Data plane

The page exposes two functions to the browser side: `__tape6_reporter` (the iframe's tape-six detects `window.parent.__tape6_reporter` and proxies test events through it) and `__tape6_error` (load failures). `.html` test files load as the iframe `src` with query parameters (`id`, `test-file-name`, `flags`); `.js`/`.mjs` files get an HTML document written into the iframe with the injected importmap and a dynamic module script. Console messages and page errors are forwarded to the Node console.

## Control plane (worker control channel)

The provider side of tape-six's worker control channel (spec: `dev-docs/worker-control-channel.md` in the tape-six repo). `EventServer` calls `destroyTask(id, reason)`: `done` closes the task's context (normal teardown); an abort reason (`failOnce` / `timeout`) first cooperatively drains the running test — posting `{type: 'tape6-terminate'}` into its iframe so it unwinds at the next assertion and runs cleanup hooks — then, after `graceTimeout` (`TAPE6_GRACE_TIMEOUT`, default 5000 ms), force-kills it by closing the context, the Node-side kill in-page JS can't perform on itself. Completion is keyed off the page **`close` event**, never a reported event: a normal end, a cooperative drain, and a force-kill all end in the context closing, so `close(id)` fires exactly once per task down every path — including the hung-test kill, which emits no test event at all.

## Cross-runtime notes

The CLI uses Node-API-shaped imports (`node:fs`, `node:path`, `node:process`, `node:url`, `node:child_process`, `node:https`) that Node, Bun, and Deno all implement — `npm run test:bun` / `test:deno` run the same `bin/` scripts via `--self`. `src/` touches only Puppeteer, tape-six, and those Node-shaped APIs, which is why `tsconfig.check.json` keeps its types array at `["node"]` only. The one h2 exception: tape6-server's h2 mode is Node-only, so a self-launched `--h2` server child always runs on `node` (found on `PATH` under Bun/Deno).
