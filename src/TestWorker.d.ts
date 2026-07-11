import DriverTestWorker from 'tape-six/driver/TestWorker.js';
import type {Browser, BrowserContext} from 'puppeteer';

/**
 * Engines this provider can drive: the Chromium family and Firefox
 * (WebDriver BiDi). WebKit is Playwright-only — use tape-six-playwright.
 */
export const supportedBrowsers: string[];

/**
 * Puppeteer adapter for tape-six's browser-driver kit: the shared task
 * lifecycle (per-task BrowserContext + Page, completion driven by the page
 * `close` event, cooperative drain / force-kill) lives in the base class;
 * this subclass supplies the driver-specific members. See ARCHITECTURE.md.
 */
export class TestWorker extends DriverTestWorker {
  /**
   * Launch the named engine headless (`--no-sandbox` on Chromium; `chromium`
   * maps to Puppeteer's `chrome` product). `insecure` sets
   * `acceptInsecureCerts` at launch — Puppeteer's h2 self-signed-cert flag
   * lives here, not on the context. Wraps a launch failure with an
   * `npx puppeteer browsers install` remediation hint.
   */
  launchBrowser(name: string, options: {insecure: boolean}): Promise<Browser>;

  /** Isolated context per task via `createBrowserContext()`; the h2 cert flag lives at launch. */
  newContext(browser: Browser, options: {insecure: boolean}): Promise<BrowserContext>;

  /** The launched browser; `null` until the first task and after `cleanup()`. */
  browser: Browser | null;
}

export default TestWorker;
