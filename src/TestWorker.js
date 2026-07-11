// @ts-self-types="./TestWorker.d.ts"

import puppeteer from 'puppeteer';

import DriverTestWorker from 'tape-six/driver/TestWorker.js';

// Single source of truth for the `--browser` choice: the CLI validates against
// this and the kit resolves the engine from it. Puppeteer drives only the
// Chromium family and Firefox — WebKit is Playwright-only (use tape-six-playwright).
export const supportedBrowsers = ['chromium', 'firefox'];

// The four-member adapter for tape-six's browser-driver kit — the shared task
// lifecycle (contexts, iframes, control plane) lives in the base class.
export class TestWorker extends DriverTestWorker {
  supportedBrowsers = supportedBrowsers;
  pageErrorEvent = 'error';
  async launchBrowser(name, {insecure}) {
    // Puppeteer's launch `browser` option names the product: 'chrome' (a
    // Chromium build — Chrome for Testing) or 'firefox' (driven over WebDriver
    // BiDi). We keep the user-facing value `chromium` because it names the
    // engine, matching the Playwright sibling.
    const product = name === 'chromium' ? 'chrome' : name;
    // `--no-sandbox` is a Chromium switch; Firefox (WebDriver BiDi) launches without it.
    const launchOptions = {headless: true, browser: product};
    if (name === 'chromium') launchOptions.args = ['--no-sandbox'];
    // h2 mode: the tape6 cert ladder ends in a self-signed cert; this launch
    // option covers Chromium (CDP) and Firefox (WebDriver BiDi) alike.
    if (insecure) launchOptions.acceptInsecureCerts = true;
    try {
      return await puppeteer.launch(launchOptions);
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
  async newContext(browser) {
    // isolation only — the h2 self-signed cert is already accepted at launch
    return browser.createBrowserContext();
  }
}

export default TestWorker;
