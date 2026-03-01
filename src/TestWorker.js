import puppeteer from 'puppeteer';

import {isStopTest} from 'tape-six/State.js';
import EventServer from 'tape-six/utils/EventServer.js';

const supportedExtRe = /\.(?:js|mjs|htm|html)$/i;

export default class TestWorker extends EventServer {
  #ready;
  constructor(reporter, numberOfTasks, options) {
    super(reporter, numberOfTasks, options);
    this.counter = 0;
    this.browser = null;
    this.page = null;
    this.#ready = this.#init();
  }
  async #init() {
    this.browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
    this.page = await this.browser.newPage();

    this.page.on('error', e => console.error(e));

    // navigate to server so iframes inherit the correct origin
    await this.page.goto(this.options.serverUrl + '/--tests', {waitUntil: 'load'});
    await this.page.evaluate(() => {
      document.documentElement.innerHTML = '<head></head><body></body>';
    });

    // forward console messages only after the page is set up
    this.page.on('console', msg =>
      console[typeof console[msg.type()] == 'function' ? msg.type() : 'log'](msg.text())
    );

    await this.page.exposeFunction('__tape6_reporter', (id, event) => {
      try {
        this.report(id, event);
        if ((event.type === 'end' && event.test === 0) || event.type === 'terminated') {
          this.close(id);
        }
      } catch (error) {
        if (!isStopTest(error)) throw error;
      }
    });

    await this.page.exposeFunction('__tape6_error', (id, error) => {
      if (error) {
        this.report(id, {
          type: 'comment',
          name: 'fail to load: ' + (error.message || 'Worker error'),
          test: 0
        });
        try {
          this.report(id, {
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
      this.close(id);
    });
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
      .then(() => this.#runInIframe(id, fileName))
      .catch(error => {
        console.error('Failed to run test:', fileName, error);
        this.close(id);
      });
    return id;
  }
  async #runInIframe(id, fileName) {
    const importmap = this.options.importmap,
      failOnce = this.options.failOnce;

    try {
      if (/\.html?$/i.test(fileName)) {
        const search = new URLSearchParams({id, 'test-file-name': fileName});
        if (failOnce) search.set('flags', 'F');
        const url = '/' + fileName + '?' + search.toString();
        await this.page.evaluate(
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
          (importmap
            ? '<script type="importmap">' + JSON.stringify(importmap) + '<\/script>'
            : '') +
          '<script type="module">' +
          'window.__tape6_id = ' +
          JSON.stringify(id) +
          ';' +
          'window.__tape6_testFileName = ' +
          JSON.stringify(fileName) +
          ';' +
          'window.__tape6_flags = "' +
          (failOnce ? 'F' : '') +
          '";' +
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
        await this.page.evaluate(
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
    } catch (error) {
      console.error('Failed to create iframe for:', fileName, error);
      this.close(id);
    }
  }
  destroyTask(id) {
    if (!this.page) return;
    this.page
      .evaluate(frameId => {
        const iframe = document.getElementById('test-iframe-' + frameId);
        if (iframe) iframe.parentElement.removeChild(iframe);
      }, id)
      .catch(() => {});
  }
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
