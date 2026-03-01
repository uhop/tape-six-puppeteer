import puppeteer from 'puppeteer'

import {isStopTest} from 'tape-six/State.js'
import EventServer from 'tape-six/utils/EventServer.js'

const unsupportedExtRe = /\.(?:cjs|ts|cts|mts)$/i

export default class TestWorker extends EventServer {
  constructor(reporter, numberOfTasks, options) {
    super(reporter, numberOfTasks, options)
    this.counter = 0
    this.browser = null
    this.page = null
    this._ready = this._init()
  }
  async _init() {
    this.browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']})
    this.page = await this.browser.newPage()

    this.page.on('error', e => console.error(e))

    // navigate to server so iframes inherit the correct origin
    await this.page.goto(this.options.serverUrl + '/--tests', {waitUntil: 'load'})
    await this.page.evaluate(() => {
      document.open()
      document.write('<!doctype html><html><head></head><body></body></html>')
      document.close()
    })

    // forward console messages only after the page is set up
    this.page.on('console', msg =>
      console[typeof console[msg.type()] == 'function' ? msg.type() : 'log'](msg.text())
    )

    await this.page.exposeFunction('__tape6_reporter', (id, event) => {
      try {
        this.report(id, event)
        if ((event.type === 'end' && event.test === 0) || event.type === 'terminated') {
          super.close(id)
        }
      } catch (error) {
        if (!isStopTest(error)) throw error
      }
    })

    await this.page.exposeFunction('__tape6_error', (id, error) => {
      if (error) {
        this.report(id, {
          type: 'comment',
          name: 'fail to load: ' + (error.message || 'Worker error'),
          test: 0
        })
        try {
          this.report(id, {
            name: String(error),
            test: 0,
            marker: new Error(),
            operator: 'error',
            fail: true,
            data: {actual: error}
          })
        } catch (error) {
          if (!isStopTest(error)) throw error
        }
      }
      super.close(id)
    })
  }
  makeTask(fileName) {
    if (unsupportedExtRe.test(fileName)) {
      console.warn(`Skipping unsupported file: ${fileName}`)
      return null
    }
    const id = String(++this.counter)
    this._ready.then(() => this._runInIframe(id, fileName))
    return id
  }
  async _runInIframe(id, fileName) {
    const serverUrl = this.options.serverUrl,
      importmap = this.options.importmap,
      failOnce = this.options.failOnce

    if (/\.html?$/i.test(fileName)) {
      const search = new URLSearchParams({id, 'test-file-name': fileName})
      if (failOnce) search.set('flags', 'F')
      const url = '/' + fileName + '?' + search.toString()
      await this.page.evaluate(
        (url, frameId) => {
          const iframe = document.createElement('iframe')
          iframe.id = 'test-iframe-' + frameId
          iframe.src = url
          iframe.onerror = error => window.__tape6_error(frameId, error)
          document.body.append(iframe)
        },
        url,
        id
      )
    } else {
      await this.page.evaluate(
        (frameId, fileName, importmapJson, failOnce) => {
          const iframe = document.createElement('iframe')
          iframe.id = 'test-iframe-' + frameId
          document.body.append(iframe)
          iframe.contentWindow.document.open()
          iframe.contentWindow.document.write(
            '<!doctype html>' +
              '<html lang="en"><head>' +
              '<meta charset="utf-8" />' +
              (importmapJson
                ? '<script type="importmap">' + importmapJson + '</script>'
                : '') +
              '<script type="module">' +
              'window.__tape6_id = ' +
              JSON.stringify(frameId) +
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
              JSON.stringify(frameId) +
              ', error && error.message || "Script load error");' +
              'document.documentElement.appendChild(s);' +
              '</script>' +
              '</head><body></body></html>'
          )
          iframe.contentWindow.document.close()
        },
        id,
        fileName,
        importmap ? JSON.stringify(importmap) : null,
        failOnce
      )
    }
  }
  destroyTask(id) {
    if (!this.page) return
    this.page
      .evaluate(frameId => {
        const iframe = document.getElementById('test-iframe-' + frameId)
        if (iframe) iframe.parentElement.removeChild(iframe)
      }, id)
      .catch(() => {})
  }
  async close() {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.page = null
    }
  }
}
