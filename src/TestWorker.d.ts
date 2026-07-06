import {EventServer, EventServerOptions, EventServerReporter} from 'tape-six/utils/EventServer.js';
import type {OutputReporter} from 'tape-six/test.js';
import type {Browser, BrowserContext, Page} from 'puppeteer';

/**
 * Options consumed by the Puppeteer worker on top of the base class:
 * runner wiring (`serverUrl`, `importmap`, `flags`) and the engine choice.
 */
export interface TestWorkerOptions extends EventServerOptions {
  /** Engine to launch — one of `supportedBrowsers` (default: `'chromium'`). */
  browser?: string;
  /** Base URL of the tape6 server the tests are loaded from. */
  serverUrl?: string;
  /** Import map injected into generated test pages. */
  importmap?: object | null;
  /** Reporter flags forwarded to the in-page tape-six. */
  flags?: string;
}

/**
 * Engines this provider can drive: the Chromium family and Firefox
 * (WebDriver BiDi). WebKit is Playwright-only — use tape-six-playwright.
 */
export const supportedBrowsers: string[];

/**
 * Puppeteer-backed test worker: each task runs in its own BrowserContext +
 * Page (the test itself in an iframe inside that page); completion is driven
 * by the page `close` event. See ARCHITECTURE.md.
 */
export class TestWorker extends EventServer {
  // OutputReporter in the union: State lacks EventServerReporter.state's index signature (upstream gap)
  constructor(
    reporter: EventServerReporter | OutputReporter,
    numberOfTasks?: number,
    options?: TestWorkerOptions
  );

  options: TestWorkerOptions;

  /** The launched browser; `null` until the first task and after `cleanup()`. */
  browser: Browser | null;

  // Per-task bookkeeping — not a consumer surface.
  counter: number;
  tasks: Record<string, {context: BrowserContext; page: Page}>;
  graceTimers: Record<string, ReturnType<typeof setTimeout>>;

  /** Close the launched browser and drop all task tracking. */
  cleanup(): Promise<void>;
}

export default TestWorker;
