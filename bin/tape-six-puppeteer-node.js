#!/usr/bin/env node

import process from 'node:process'
import os from 'node:os'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'

import {
  getReporterFileName,
  getReporterType,
  resolvePatterns,
  runtime
} from 'tape-six/utils/config.js'

import {getReporter, setReporter} from 'tape-six/test.js'
import {selectTimer} from 'tape-six/utils/timer.js'

import TestWorker from '../src/TestWorker.js'

const options = {},
  rootFolder = process.cwd()

let flags = '',
  parallel = '',
  files = [],
  startServer = false

const showSelf = () => {
  const self = new URL(import.meta.url)
  if (self.protocol === 'file:') {
    console.log(fileURLToPath(self))
  } else {
    console.log(self)
  }
  process.exit(0)
}

const config = () => {
  if (process.argv.includes('--self')) showSelf()

  const optionNames = {
    f: 'failureOnly',
    t: 'showTime',
    b: 'showBanner',
    d: 'showData',
    o: 'failOnce',
    n: 'showAssertNumber',
    m: 'monochrome',
    c: 'dontCaptureConsole',
    h: 'hideStreams'
  }

  let parIsSet = false

  for (let i = 2; i < process.argv.length; ++i) {
    const arg = process.argv[i]
    if (arg == '-f' || arg == '--flags') {
      if (++i < process.argv.length) {
        flags += process.argv[i]
      }
      continue
    }
    if (arg == '-p' || arg == '--par') {
      if (++i < process.argv.length) {
        parallel = process.argv[i]
        parIsSet = true
        if (!parallel || isNaN(parallel)) {
          parallel = ''
          parIsSet = false
        }
      }
      continue
    }
    if (arg == '--start-server') {
      startServer = true
      continue
    }
    files.push(arg)
  }

  flags = (process.env.TAPE6_FLAGS || '') + flags
  for (let i = 0; i < flags.length; ++i) {
    const option = flags[i].toLowerCase(),
      name = optionNames[option]
    if (typeof name == 'string') options[name] = option !== flags[i]
  }
  options.flags = flags

  if (!parIsSet) {
    parallel = process.env.TAPE6_PAR || parallel
  }
  if (parallel) {
    parallel = Math.max(0, +parallel)
    if (parallel === Infinity) parallel = 0
  } else {
    parallel = 0
  }
  if (!parallel) {
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      parallel = navigator.hardwareConcurrency
    } else {
      try {
        parallel = os.availableParallelism()
      } catch (e) {
        void e
        parallel = 1
      }
    }
  }
}

const getServerUrl = () => {
  if (process.env.TAPE6_SERVER_URL) return process.env.TAPE6_SERVER_URL.replace(/\/+$/, '')
  const host = process.env.HOST || 'localhost',
    port = process.env.PORT || '3000'
  return `http://${host}:${port}`
}

const ensureServer = async serverUrl => {
  try {
    const res = await fetch(serverUrl + '/--tests')
    if (res.ok) return null
  } catch (e) {
    void e
  }

  if (!startServer) {
    console.error(
      `Error: tape6-server is not reachable at ${serverUrl}\n\n` +
        'Start it manually:\n' +
        '  npx tape6-server\n\n' +
        'Or re-run with --start-server:\n' +
        '  tape6-puppeteer --start-server --flags FO\n'
    )
    process.exit(1)
  }

  // start the server
  const serverBin = fileURLToPath(
    new URL('../node_modules/tape-six/bin/tape6-server.js', import.meta.url)
  )
  const child = spawn(process.execPath, [serverBin], {
    cwd: rootFolder,
    stdio: 'ignore',
    detached: false,
    env: {...process.env, HOST: new URL(serverUrl).hostname, PORT: new URL(serverUrl).port || '3000'}
  })
  child.unref()

  // wait for server to become available
  for (let i = 0; i < 30; ++i) {
    await new Promise(resolve => setTimeout(resolve, 500))
    try {
      const res = await fetch(serverUrl + '/--tests')
      if (res.ok) return child
    } catch (e) {
      void e
    }
  }

  console.error(`Error: tape6-server failed to start at ${serverUrl}`)
  process.exit(1)
}

const init = async () => {
  const currentReporter = getReporter()
  if (!currentReporter) {
    const reporterType = getReporterType(),
      reporterFile = getReporterFileName(reporterType),
      CustomReporter = (await import('tape-six/reporters/' + reporterFile)).default,
      hasColors = !(
        options.monochrome ||
        process.env.NO_COLOR ||
        process.env.NODE_DISABLE_COLORS ||
        process.env.FORCE_COLOR === '0'
      ),
      customOptions =
        reporterType === 'tap' ? {useJson: true, hasColors} : {...options, hasColors},
      customReporter = new CustomReporter(customOptions)
    setReporter(customReporter)
  }

  if (files.length) {
    files = await resolvePatterns(rootFolder, files)
  }
}

const main = async () => {
  config()
  await init()
  await selectTimer()

  process.on('uncaughtException', (error, origin) => {
    console.error('UNHANDLED ERROR:', origin, error)
    process.exit(1)
  })

  const serverUrl = getServerUrl()
  const serverChild = await ensureServer(serverUrl)

  // fetch test files from server if none specified on CLI
  if (!files.length) {
    try {
      const res = await fetch(serverUrl + '/--tests')
      if (res.ok) files = await res.json()
    } catch (e) {
      void e
    }
  }

  if (!files.length) {
    console.log('No files found.')
    serverChild && serverChild.kill()
    process.exit(1)
  }

  // fetch importmap from server
  let importmap = null
  try {
    const res = await fetch(serverUrl + '/--importmap')
    if (res.ok) importmap = await res.json()
  } catch (e) {
    void e
  }

  const reporter = getReporter(),
    worker = new TestWorker(reporter, parallel, {
      ...options,
      serverUrl,
      importmap
    })

  reporter.report({type: 'test', test: 0})

  await new Promise(resolve => {
    worker.done = () => resolve()
    worker.execute(files)
  })

  const hasFailed = reporter.state && reporter.state.failed > 0

  reporter.report({
    type: 'end',
    test: 0,
    fail: hasFailed
  })

  await worker.close()

  serverChild && serverChild.kill()
  process.exit(hasFailed ? 1 : 0)
}

main().catch(error => console.error('ERROR:', error))
