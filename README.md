# tape-six-puppeteer [![NPM version][npm-img]][npm-url]

[npm-img]: https://img.shields.io/npm/v/tape-six-puppeteer.svg
[npm-url]: https://npmjs.org/package/tape-six-puppeteer

`tape-six-puppeteer` is a helper for [tape-six](https://www.npmjs.com/package/tape-six)
to run tests in a headless browser via Puppeteer. Each test file runs in its own
iframe inside headless Chrome, providing full browser isolation.

## Why?

The standard `tape6` runner uses worker threads. `tape6-puppeteer` launches headless
Chrome and runs each test file in a separate iframe, giving tests access to real DOM,
browser APIs, and the full web platform. Tests can be `.js`/`.mjs` modules or `.html` files.

## Install

```bash
npm i -D tape-six-puppeteer
```

Puppeteer's bundled Chromium is installed automatically via `postinstall`.

## Quick start

1. Write tests using [tape-six](https://www.npmjs.com/package/tape-six) that use browser APIs:

```js
import test from 'tape-six'

test('DOM works', t => {
  const el = document.createElement('div')
  el.textContent = 'hello'
  document.body.appendChild(el)
  t.equal(document.body.lastChild.textContent, 'hello', 'element created')
})
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
- **Custom URL:** set `TAPE6_SERVER_URL` or `HOST`/`PORT` environment variables.

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

See the [wiki](https://github.com/uhop/tape-six-puppeteer/wiki) for full documentation.
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

- 1.0.0 _The first official release._

See the full [release notes](https://github.com/uhop/tape-six-puppeteer/wiki/Release-notes) for details.
