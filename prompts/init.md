This is a repository for `tape-six-puppeteer` project.

# Project description

`tape-six-puppeteer` is a Node.js library that provides a test runner that uses Puppeteer
to run tests in a headless browser environment. It is based on `tape-six` library, which is
locally available in ../tape-six/ yet should be installed from `npm`.

The project should look like and work like `tape-six-proc`, which is locally available in
../tape-six-proc/ yet should be installed from `npm` if needed.

Eventually the project will be published on `npm`.

# Technical details

Just like `tape-six-proc`, the project should use `tape-six` as a dependency and define
a special `TestWorker.js`. The only public interface is two scripts in `bin/` directory:
`tape-six-puppeteer` and `tape-six-puppeteer-node` similar to `tape-six-proc`.

This new `TestWorker.js` can be based on the code in `../tape-six/tests/puppeteer-chrome.js`.

It should allow running several tests in parallel, and support Node, Bun and Deno like
the original `puppeteer-chrome.js`.

Internally it exposes a global function that is used by `tape-six`, which receives test
results as messages. They should be conveyed up as `tape-six-proc` does.

In order to run tests in a browser we use a frame in a page, which is created by the
`TestWorker.js`. If the test is a `.js` or `.mjs` file, it is run inside a frame. If it is
an `.html` file, it is loaded into a frame. See `../tape-six/web-app/` for
more details. We cannot load `.cjs` or `.ts` (and `.cts` or `.mts`) files into a frame.

This project should assume that there is a test server running in a separate process.
See `../tape-six/` and its `tape6-server` for more details.

# CLI contract

`bin/tape-six-puppeteer` should follow the same contract as `bin/tape6`.

`bin/tape-six-puppeteer-node` should follow the same contract as `bin/tape6-node`.

They should use the same options and arguments. Just like `tape-six-proc` it should return 0
on success and non-zero on failure.

# Parallelism and isolation model

The expected parallelism model is the same as everywhere in `tape-six` and `tape-six-proc`:
a file-level parallelism with a separate web page per file. It is done by creating a fresh
frame per file.

We can use the same default parallelism settings as `tape-six-proc` does. See its code.

# Browser configuration and CI assumptions

For initial creation we should target headless mode, and use Puppeteer-bundled Chromium.

See `../tape-six/tests/puppeteer-chrome.js` for more details.

# Test file loading rules

`.js` and `.mjs` files are loaded as module scripts. `importmap` is used to resolve paths.
`.html` files are loaded as HTML documents.

The behavior for unsupported extensions (`.cjs`, `.ts`, `.cts`, `.mts`, etc.):
skip with warning.

# Tests

The idea is that test scripts could use real browser environment to run tests. They have
an access to DOM and can use real browser APIs. Write a few scripts in `tests/` directory
that demonstrate this. Some of them should be in `.js` or `.mjs` files, some should be in
`.html` files.

Don't forget to configure tests like `tape-six` does.

# Testing contract

`npm test` should run headless tests provided by this project.

GitHub CI should run them in different environments (Node versions: 20, 22, 24, 25, and on Ubuntu, Mac, Windows) just like `tape-six-proc` does.

# Approach

The project should be based on `tape-six` and `puppeteer` and nothing else. Follow
the minimalistic approach, like `tape-six-proc` does. If you want to make a decision
look at `tape-six-proc` and `tape-six`. If it is not there, ask me directly.

This project should be as AI friendly as possible. It should be easy to understand
and modify. It should be easy to test and debug. It should be easy to use.

Analyze and adapt all necessary AI-related and documentation files from `tape-six-proc` and `tape-six`.
Adapt files from `../tape-six/.github/`, `../tape-six/.windsurf/`, `../tape-six/workflows/`.
Write a `README.md` file. Put all documentation in `wiki/` directory making `Home.md` the main page.
In general follow the same approach as `tape-six-proc` does.

# Definition of done / required repo layout

See `tape-six-proc` for details. We should have the same layout: `bin/`, `tests/`, `src/`, `wiki/`, etc.

Required documentation deliverables (`README.md`, `wiki/Home.md`, and any other
key pages) should be similar to `tape-six-proc`.

# Compatibility and publishing

See `tape-six-proc` for details. We should have the same compatibility and publishing settings.

# License

The project should be published under the same license as `tape-six`.
