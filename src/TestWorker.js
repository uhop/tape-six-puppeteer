import puppeteer from 'puppeteer';

import {isStopTest} from 'tape-six/State.js';
import EventServer from 'tape-six/utils/EventServer.js';

const supportedExtRe = /\.(?:js|mjs|htm|html)$/i;

// Single source of truth for the `--browser` choice: the CLI validates against
// this and `#init()` resolves the engine from it. Puppeteer drives only the
// Chromium family and Firefox — WebKit is Playwright-only (use tape-six-playwright).
export const supportedBrowsers = ['chromium', 'firefox'];

export default class TestWorker extends EventServer {
  #ready;
  constructor(reporter, numberOfTasks, options) {
    super(reporter, numberOfTasks, options);
    this.counter = 0;
    this.browser = null;
    this.tasks = {}; // id -> {context, page}
    this.graceTimers = {}; // id -> timer set while an abort is draining
    this.#ready = this.#init();
  }
  async #init() {
    const name = this.options.browser || supportedBrowsers[0];
    if (!supportedBrowsers.includes(name)) {
      throw new Error(`Unsupported browser "${name}". Supported: ${supportedBrowsers.join(', ')}.`);
    }
    // Puppeteer's launch `browser` option names the product: 'chrome' (a
    // Chromium build — Chrome for Testing) or 'firefox' (driven over WebDriver
    // BiDi). We keep the user-facing value `chromium` because it names the
    // engine, matching the Playwright sibling.
    const product = name === 'chromium' ? 'chrome' : name;
    // `--no-sandbox` is a Chromium switch; Firefox (WebDriver BiDi) launches without it.
    const launchOptions = {headless: true, browser: product};
    if (name === 'chromium') launchOptions.args = ['--no-sandbox'];
    try {
      this.browser = await puppeteer.launch(launchOptions);
    } catch (error) {
      // postinstall only fetches Chrome, so the usual cause is a missing engine
      // binary. Point at the install command; the wrapped error keeps Puppeteer's
      // own diagnostics.
      throw new Error(
        `Failed to launch ${name} — run \`npx puppeteer browsers install ${product}\` if it is not installed.\n` +
          (error && error.message ? error.message : String(error))
      );
    }
  }
  makeTask(fileName) {
    const id = String(++this.counter);
    if (!supportedExtRe.test(fileName)) {
      this.report(id, {
        name: 'unsupported file type: ' + fileName,
        test: 0,
        marker: new Error(),
        operator: 'error',
        fail: true
      });
      this.report(id, {type: 'terminated', test: 0, name: 'FILE: /' + fileName});
      this.close(id);
      return id;
    }
    this.#ready
      .then(() => this.#runTask(id, fileName))
      .catch(error => {
        // Browser launch / setup failed (e.g. the requested engine isn't
        // installed): no page exists, so there is no 'close' event to drive
        // completion. Report the failure — otherwise a run where the browser
        // never launches reports zero tests and exits 0 (a false pass) — then
        // complete the task directly.
        console.error('Failed to run test:', fileName, error);
        try {
          this.report(id, {
            name: error && error.message ? error.message : String(error),
            test: 0,
            marker: new Error(),
            operator: 'error',
            fail: true
          });
        } catch (reportError) {
          if (!isStopTest(reportError)) throw reportError;
        }
        this.close(id);
      });
    return id;
  }
  // Each task runs in its own BrowserContext + Page (full origin/storage
  // isolation), so the Node-side driver can force-kill a hung test by closing
  // the context — the backstop in-page JS can't provide for itself. The test
  // still runs in an iframe inside that page, so the proven srcdoc / importmap
  // injection and the window.parent.__tape6_reporter data plane are unchanged.
  //
  // Completion is driven by the page 'close' event, never directly from a
  // reported event: a normal end, a cooperative drain, and a force-kill all end
  // in the context being closed, so close(id) fires exactly once per task down
  // every path — including the hung-test kill that emits no event at all.
  async #runTask(id, fileName) {
    let context, page;
    try {
      context = await this.browser.createBrowserContext();
      page = await context.newPage();
    } catch (error) {
      console.error('Failed to open context for:', fileName, error);
      if (context) context.close().catch(() => {});
      this.close(id);
      return;
    }
    this.tasks[id] = {context, page};

    // The single completion path: closing the context (done / drain / kill)
    // closes the page, which lands here and reports the task as finished.
    page.on('close', () => {
      this.#clearGrace(id);
      if (this.tasks[id]) {
        delete this.tasks[id];
        this.close(id);
      }
    });
    page.on('error', e => console.error(e));

    try {
      await page.exposeFunction('__tape6_reporter', (taskId, event) => {
        try {
          this.report(taskId, event);
          if ((event.type === 'end' && event.test === 0) || event.type === 'terminated') {
            // Normal completion: tear the context down; close(id) follows via
            // the page 'close' handler.
            this.destroyTask(taskId, 'done');
          }
        } catch (error) {
          if (!isStopTest(error)) throw error;
        }
      });

      await page.exposeFunction('__tape6_error', (taskId, error) => {
        if (error) {
          this.report(taskId, {
            type: 'comment',
            name: 'fail to load: ' + (error.message || 'Worker error'),
            test: 0
          });
          try {
            this.report(taskId, {
              name: String(error),
              test: 0,
              marker: new Error(),
              operator: 'error',
              fail: true,
              data: {actual: error}
            });
          } catch (error) {
            if (!isStopTest(error)) throw error;
          }
        }
        this.destroyTask(taskId, 'done');
      });

      // navigate to the server so the iframe inherits the correct origin
      await page.goto(this.options.serverUrl + '/--tests', {waitUntil: 'load'});
      await page.evaluate(() => {
        document.documentElement.innerHTML = '<head></head><body></body>';
      });

      // forward console messages only after the page is set up
      page.on('console', msg =>
        console[typeof console[msg.type()] == 'function' ? msg.type() : 'log'](msg.text())
      );

      await this.#runInIframe(id, page, fileName);

      // A stop/bail (or deadline) can fire while this context is still being
      // created — its destroyTask hits a not-yet-tracked task and no-ops. Catch
      // up now that the iframe exists so a just-started task still aborts.
      if (this.stopRequested) this.destroyTask(id, 'failOnce');
    } catch (error) {
      console.error('Failed to set up test:', fileName, error);
      this.destroyTask(id, 'done');
    }
  }
  async #runInIframe(id, page, fileName) {
    const importmap = this.options.importmap,
      flags = this.options.flags || '';

    if (/\.html?$/i.test(fileName)) {
      const search = new URLSearchParams({id, 'test-file-name': fileName});
      if (flags) search.set('flags', flags);
      const url = '/' + fileName + '?' + search.toString();
      await page.evaluate(
        (url, frameId) => {
          const iframe = document.createElement('iframe');
          iframe.id = 'test-iframe-' + frameId;
          iframe.src = url;
          iframe.onerror = error => window.__tape6_error(frameId, error);
          document.body.append(iframe);
        },
        url,
        id
      );
    } else {
      const html =
        '<!doctype html>' +
        '<html lang="en"><head>' +
        '<meta charset="utf-8" />' +
        (importmap ? '<script type="importmap">' + JSON.stringify(importmap) + '<\/script>' : '') +
        '<script type="module">' +
        'window.__tape6_id = ' +
        JSON.stringify(id) +
        ';' +
        'window.__tape6_testFileName = ' +
        JSON.stringify(fileName) +
        ';' +
        'window.__tape6_flags = ' +
        JSON.stringify(flags) +
        ';' +
        'const s = document.createElement("script");' +
        's.setAttribute("type", "module");' +
        's.src = "/' +
        fileName +
        '";' +
        's.onerror = error => window.parent.__tape6_error(' +
        JSON.stringify(id) +
        ', error && error.message || "Script load error");' +
        'document.documentElement.appendChild(s);' +
        '<\/script>' +
        '</head><body></body></html>';
      await page.evaluate(
        (frameId, srcdoc) => {
          const iframe = document.createElement('iframe');
          iframe.id = 'test-iframe-' + frameId;
          iframe.srcdoc = srcdoc;
          document.body.append(iframe);
        },
        id,
        html
      );
    }
  }
  // Control plane. EventServer calls this with reason ∈ done | failOnce | timeout.
  //   done             -> the test finished (or failed to load); tear the
  //                       context down now. close(id) follows via page 'close'.
  //   failOnce/timeout -> abort: cooperatively drain the running test, then
  //                       force-kill (close the context) after graceTimeout.
  destroyTask(id, reason = 'done') {
    if (reason === 'done') {
      this.#kill(id);
      return;
    }
    if (this.graceTimers[id]) return; // already draining
    const task = this.tasks[id];
    if (!task) return;
    // Cooperative drain: post `tape6-terminate` into the running test's iframe so
    // it unwinds at the next assertion (StopTest) and its cleanup hooks run. If
    // it doesn't exit within graceTimeout, force-kill by closing the context —
    // the real Node-side kill an in-page iframe can't perform on itself.
    task.page
      .evaluate(
        (frameId, r) => {
          const iframe = document.getElementById('test-iframe-' + frameId);
          iframe?.contentWindow?.postMessage({type: 'tape6-terminate', reason: r}, '*');
        },
        id,
        reason
      )
      .catch(() => {});
    this.graceTimers[id] = setTimeout(() => this.#kill(id), this.graceTimeout);
  }
  // Close the task's context. Idempotent: the page 'close' handler clears
  // tracking and calls close(id), so a second call (e.g. base close() ->
  // destroyTask('done')) finds no task and returns.
  #kill(id) {
    this.#clearGrace(id);
    const task = this.tasks[id];
    if (!task) return;
    task.context.close().catch(() => {});
  }
  #clearGrace(id) {
    const grace = this.graceTimers[id];
    if (grace) {
      clearTimeout(grace);
      delete this.graceTimers[id];
    }
  }
  async cleanup() {
    for (const id of Object.keys(this.graceTimers)) {
      clearTimeout(this.graceTimers[id]);
    }
    this.graceTimers = {};
    // Drop task tracking first so the page 'close' events fired by browser.close()
    // below are no-ops (the run has already finished by the time cleanup runs).
    this.tasks = {};
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
