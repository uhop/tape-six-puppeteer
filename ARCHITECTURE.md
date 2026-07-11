# Architecture

`tape-six-puppeteer` is the browser worker provider for [tape-six](https://github.com/uhop/tape-six): it runs each test file in its own browser context — a separate page and iframe with isolated cookies and storage — in a headless engine driven by Puppeteer (Chromium over CDP, Firefox over WebDriver BiDi), on Node, Deno, and Bun. Since tape-six 1.15.0 the shared driver machinery lives in core's browser-driver kit (`tape-six/driver/`): this package is the thin Puppeteer adapter — the driver-specific members, the bin identity, and the e2e suite that serves as the kit's real-browser gate (paired with [tape-six-playwright](https://github.com/uhop/tape-six-playwright)). Runtime dependencies are minimal by design: `tape-six` (^1.15.0 — the kit floor) and `puppeteer` (browser automation).

## Project layout

```
tape-six-puppeteer/
├── package.json          # Package config; "tape6" section configures test discovery
├── tsconfig.json         # strict ts-check config (.d.ts sidecars)
├── tsconfig.check.json   # js-check config (TypeScript as linter for .js sources)
├── bin/
│   ├── tape6-puppeteer.js      # CLI entry point (--help/--version/--self fast path, else delegates)
│   └── tape6-puppeteer-node.js # One runDriverCli() call into tape-six's driver kit
├── src/
│   ├── TestWorker.js     # Puppeteer adapter for the kit's TestWorker base
│   └── TestWorker.d.ts   # Type sidecar (@ts-self-types): narrows the kit's driver handles to Puppeteer types
├── tests/                # Automated tests (test-*.js, test-*.mjs, test-*.html);
│                         # tests/manual/ holds hand-runnable control-channel fixtures
└── wiki/                 # GitHub wiki documentation (submodule)
```

## Control flow

- `bin/tape6-puppeteer.js` is the CLI entry point. It handles `--help`, `--version`, and `--self` (prints its own path for cross-runtime usage) directly; otherwise it delegates to `bin/tape6-puppeteer-node.js`.
- `bin/tape6-puppeteer-node.js` is a single `runDriverCli({packageUrl, commandName, description, supportedBrowsers, TestWorker})` call into `tape-six/driver/cli.js`. The kit owns the whole driver-bin flow that used to be mirrored per driver: option/env parsing (`getOptions`), server-protocol resolution the way `tape6-server` does it (`--h2` > `TAPE6_PROTOCOL` > `tape6.server.protocol` config > `h1`, upgrading the server URL to `https:` in h2 mode), `ensureServer` (auto-spawning `tape6-server` under `--start-server` with `--h2` passed through; the h2 server mode is Node-only, so under Bun/Deno the server child runs on `node` from `PATH`), the `controlFetch` control plane (request-scoped TLS trust, hard 3s deadlines, explicit TLS-vs-plaintext mismatch diagnostics, a brief port-release wait before self-launching), the test-file (`/--tests`, `/--patterns`) and importmap (`/--importmap`) fetches, and the per-engine run loop — `--browsers` (comma-separated or `all`; env `TAPE6_BROWSERS`; overrides `--browser`) fans the suite out sequentially with a fresh reporter per engine, ending in a per-engine PASS/FAIL line and a non-zero exit if any engine failed.
- `TestWorker` (`src/TestWorker.js`) extends the kit base from `tape-six/driver/TestWorker.js`, which owns the entire task lifecycle: per-task `BrowserContext` → `Page` with completion driven by the page `close` event, the `__tape6_reporter` / `__tape6_error` wiring, iframe injection via `tape-six/driver/bootstrap.js`, cooperative drain with a `graceTimeout` force-kill, and cleanup. The adapter supplies the driver-specific members:
  - `supportedBrowsers` — `['chromium', 'firefox']`, exported and passed to `runDriverCli` as the single source of truth the CLI validates against (precedence CLI > env > default `chromium`); WebKit is Playwright-only — use the sibling runner [tape-six-playwright](https://github.com/uhop/tape-six-playwright);
  - `pageErrorEvent` — `'error'` (Puppeteer's name for the page-level error event);
  - `launchBrowser(name, {insecure})` — headless launch via `puppeteer.launch({browser})`, mapping the user-facing `chromium` to Puppeteer's `chrome` product (Chrome for Testing) and driving Firefox over WebDriver BiDi; `--no-sandbox` is applied to Chromium only, and `insecure` adds `acceptInsecureCerts: true` at launch — Puppeteer's h2 self-signed-cert flag lives here, covering CDP and WebDriver BiDi alike. Wraps a launch failure with an `npx puppeteer browsers install <product>` hint (only Chrome is fetched by `postinstall`), so a missing engine fails the run rather than reporting a false pass;
  - `newContext(browser)` — an isolated context per task via `createBrowserContext()`; isolation only, since the cert flag is taken at launch.
- `src/TestWorker.d.ts` is the hand-written type sidecar (advertised via `// @ts-self-types`): it narrows the kit base's deliberately-`any` driver handles to Puppeteer's `Browser` / `BrowserContext`. The pre-kit `TestWorkerOptions` interface and the `EventServerReporter | OutputReporter` constructor union are gone — tape-six ≥ 1.14.1 typings made both unnecessary, and the option keys are read inside the kit.

## Data plane

Implemented by the kit (`tape-six/driver/bootstrap.js` owns the in-page harness text). The page exposes two functions to the browser side: `__tape6_reporter` (the iframe's tape-six detects `window.parent.__tape6_reporter` and proxies test events through it) and `__tape6_error` (load failures). `.html` test files load as the iframe `src` with query parameters (`id`, `test-file-name`, `flags`); `.js`/`.mjs` files get an HTML document written into the iframe with the injected importmap and a dynamic module script. Console messages and page errors (via the adapter's `pageErrorEvent`) are forwarded to the Node console.

## Control plane (worker control channel)

The provider side of tape-six's worker control channel (spec: `dev-docs/worker-control-channel.md` in the tape-six repo), implemented by the kit base and inherited by the adapter. `EventServer` calls `destroyTask(id, reason)`: `done` closes the task's context (normal teardown); an abort reason (`failOnce` / `timeout`) first cooperatively drains the running test — posting `{type: 'tape6-terminate'}` into its iframe so it unwinds at the next assertion and runs cleanup hooks — then, after `graceTimeout` (`TAPE6_GRACE_TIMEOUT`, default 5000 ms), force-kills it by closing the context, the Node-side kill in-page JS can't perform on itself. Completion is keyed off the page **`close` event**, never a reported event: a normal end, a cooperative drain, and a force-kill all end in the context closing, so `close(id)` fires exactly once per task down every path — including the hung-test kill, which emits no test event at all.

## Cross-runtime notes

The kit's `cli.js` uses Node-API-shaped imports (`node:fs`, `node:process`, `node:url`, `node:child_process`) that Node, Bun, and Deno all implement — `npm run test:bun` / `test:deno` run the same `bin/` scripts. `src/TestWorker.js` touches only Puppeteer and the kit base, so the adapter itself is runtime-neutral. The one h2 exception: tape6-server's h2 mode is Node-only, so a self-launched `--h2` server child always runs on `node` (found on `PATH` under Bun/Deno).
