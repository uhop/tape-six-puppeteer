# tape-six-puppeteer [![NPM version][npm-img]][npm-url]

[npm-img]: https://img.shields.io/npm/v/tape-six-puppeteer.svg
[npm-url]: https://npmjs.org/package/tape-six-puppeteer

`tape-six-puppeteer` is a helper for [tape-six](https://www.npmjs.com/package/tape-six)
to run tests in a headless browser via Puppeteer. Each test file runs in its own
browser context — a separate page and iframe with isolated cookies and storage —
in a headless engine. Chromium runs by default; Firefox is available via `--browser`.

## Why?

The standard `tape6` runner uses worker threads. `tape6-puppeteer` launches a headless
browser (Chromium or Firefox) and runs each test file in its own browser context, giving
tests access to real DOM, browser APIs, and the full web platform. Tests can be `.js`/`.mjs`
modules or `.html` files.

## Install

```bash
npm i -D tape-six-puppeteer
```

Puppeteer's bundled Chromium is installed automatically via `postinstall`. Firefox is
optional — add it with `npm run browser:all` (or `npx puppeteer browsers install firefox`)
when you want to run on that engine.

## Quick start

1. Write tests using [tape-six](https://www.npmjs.com/package/tape-six) that use browser APIs:

```js
import test from 'tape-six';

test('DOM works', t => {
  const el = document.createElement('div');
  el.textContent = 'hello';
  document.body.appendChild(el);
  t.equal(document.body.lastChild.textContent, 'hello', 'element created');
});
```

2. Configure tests in `package.json`:

```json
{
  "scripts": {
    "test": "tape6-puppeteer --start-server --flags FO"
  },
  "tape6": {
    "browser": ["/tests/test-*.html"],
    "tests": ["/tests/test-*.*js"],
    "importmap": {
      "imports": {
        "tape-six": "/node_modules/tape-six/index.js",
        "tape-six/": "/node_modules/tape-six/src/"
      }
    }
  }
}
```

3. Run:

```bash
npm test
```

## Server

`tape6-puppeteer` requires `tape6-server` (from `tape-six`) to serve test files to the browser.

- **Auto-start:** use `--start-server` to launch it automatically.
- **Manual:** run `npx tape6-server` in a separate terminal, then run tests without `--start-server`.
- **Custom URL:** use `--server-url URL` (`-u`), or set `TAPE6_SERVER_URL` or `HOST`/`PORT` environment variables.

### HTTP/2

`tape6-server` (tape-six 1.12+) can serve HTTPS with HTTP/2 (HTTP/1.1 is still accepted via
ALPN). Opt in with `--h2`, `TAPE6_PROTOCOL=h2`, or the sticky `tape6.server.protocol`
config — the runner mirrors the server's flag > env > config resolution:

```bash
tape6-puppeteer --h2 --start-server --flags FO
tape6-puppeteer -u https://localhost:3000 --flags FO   # external h2 server
```

`--h2` implies an `https:` server URL and is passed through to a self-launched server.
Certificates are handled automatically: the browser launches with `acceptInsecureCerts`
(covers Chromium and Firefox alike), and the runner's own control requests trust
`TAPE6_CERT` when set (e.g. an mkcert certificate), else the server's cached
auto-generated certificate (`node_modules/.cache/tape6/`), else fall back to relaxed
verification scoped to those requests only — never process-wide.

HTTP/1.1 remains the default: h2 means TLS, and a self-signed certificate blocks
service-worker registration even after an interstitial click-through. Opt in per suite for
features that require h2 — e.g. `fetch()` request-body streaming (`duplex: 'half'`), which
Chromium supports over h2/h3 only. The h2 server mode is Node-only; under Bun or Deno the
runner starts the server child with `node` from `PATH`.

## Choosing a browser engine

Tests run on Chromium by default. Select another engine with `--browser` (`-b`) or the
`TAPE6_BROWSER` environment variable — `chromium` or `firefox` (CLI overrides env, which
overrides the default):

```bash
tape6-puppeteer --start-server --browser firefox --flags FO
TAPE6_BROWSER=firefox tape6-puppeteer --start-server --flags FO
```

Only Chromium is installed by `postinstall`. Install Firefox on demand (a run that
requests a missing engine fails with an install hint):

```bash
npx puppeteer browsers install firefox   # or: npm run browser:all
```

Run several engines with one script each:

```json
{
  "scripts": {
    "test": "tape6-puppeteer --start-server --flags FO",
    "test:firefox": "tape6-puppeteer --start-server --browser firefox --flags FO"
  }
}
```

Or fan out over both engines in one invocation with `--browsers` (comma-separated, or
`all`; env `TAPE6_BROWSERS`; overrides `--browser`). Each engine runs the full suite and
prints its own summary, followed by a per-engine verdict; the run fails if any engine fails:

```bash
tape6-puppeteer --start-server --browsers all --flags FO
tape6-puppeteer --start-server --browsers chromium,firefox --flags FO
```

```
Browser: chromium
  ♥️   tests: 10, asserts: 24, passed: 24, ...
Browser: firefox
  ♥️   tests: 10, asserts: 24, passed: 24, ...

Browsers: chromium PASS, firefox PASS
```

This is the cheap way to catch cross-engine web-platform gaps (e.g. a Web Streams method
one engine hasn't shipped) that single-engine testing can't see.

> For WebKit support, use the sibling runner
> [tape-six-playwright](https://github.com/uhop/tape-six-playwright); Puppeteer drives only
> Chromium and Firefox.

## Cross-runtime usage

```json
{
  "scripts": {
    "test": "tape6-puppeteer --start-server --flags FO",
    "test:bun": "bun run `tape6-puppeteer --self` --start-server --flags FO",
    "test:deno": "deno run -A `tape6-puppeteer --self` --start-server --flags FO"
  }
}
```

## Docs

Full documentation is in the **[wiki](https://github.com/uhop/tape-six-puppeteer/wiki)** &mdash; browse the [index](https://github.com/uhop/tape-six-puppeteer/wiki/Home), or [search it](https://uhop.github.io/wiki-search/app/?wiki=uhop/tape-six-puppeteer) by name.
`tape-six` has its own [wiki](https://github.com/uhop/tape-six/wiki).

`tape-six-puppeteer` uses the same test configuration and CLI conventions as `tape-six`.

### Command-line utilities

- [tape6-puppeteer](https://github.com/uhop/tape-six-puppeteer/wiki/Utility-‐-tape6‐puppeteer) &mdash; the main utility of this package to run browser tests.

## AI agents

If you are an AI coding agent, see [AGENTS.md](./AGENTS.md) for project conventions, commands, and architecture.

LLM-friendly documentation is available:

- [llms.txt](./llms.txt) &mdash; concise reference.
- [llms-full.txt](./llms-full.txt) &mdash; full reference with architecture details.

## Release notes

The most recent releases:

- 1.2.1 _Fixed server readiness probing: chained h1/h2 runs no longer hang; a TLS-vs-plaintext mismatch is reported clearly. Updated dependencies._
- 1.2.0 _Added HTTP/2 mode and multi-engine fan-out._
- 1.1.0 _Added browser-engine selection (`--browser chromium|firefox`). Wired the worker control channel: cooperative `terminate` drain with a Node-side force-kill backstop. Updated dependencies._
- 1.0.4 _Replaced `process.exit()` with `process.exitCode` for graceful shutdown. Updated dependencies._
- 1.0.3 _Added `--help` and `--version` options. Converted write-tests workflow to a skill._
- 1.0.2 _Updated dependencies. Consolidated workflows._
- 1.0.1 _Renamed bin files from `tape-six-*` to `tape6-*` pattern._
- 1.0.0 _The first official release._

See the full [release notes](https://github.com/uhop/tape-six-puppeteer/wiki/Release-notes) for details.
