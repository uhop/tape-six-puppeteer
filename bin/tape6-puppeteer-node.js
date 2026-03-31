#!/usr/bin/env node

import {readFileSync} from 'node:fs';
import path, {join} from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

import {getOptions, initReporter, showInfo, printFlagOptions} from 'tape-six/utils/config.js';

import {getReporter, setReporter} from 'tape-six/test.js';
import {selectTimer} from 'tape-six/utils/timer.js';

import TestWorker from '../src/TestWorker.js';

const rootFolder = process.cwd();

const getVersion = () => {
  const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json');
  return JSON.parse(readFileSync(pkgPath, 'utf8')).version;
};

const showSelf = () => {
  const self = new URL(import.meta.url);
  if (self.protocol === 'file:') {
    console.log(fileURLToPath(self));
  } else {
    console.log(self);
  }
  process.exit(0);
};

const showVersion = () => {
  console.log('tape6-puppeteer ' + getVersion());
  process.exit(0);
};

const showHelp = () => {
  console.log(
    'tape6-puppeteer ' + getVersion() + ' \u2014 Puppeteer-based browser test runner for tape-six\n'
  );
  console.log('Usage: tape6-puppeteer [options] [patterns...]\n');
  const options = [
    ['--flags, -f <flags>', 'Set reporter flags (env: TAPE6_FLAGS)'],
    ['--par, -p <n>', 'Set parallelism level (env: TAPE6_PAR)'],
    [
      '--server-url, -u <url>',
      'Server URL (env: TAPE6_SERVER_URL, default: http://localhost:3000)'
    ],
    ['--start-server', 'Auto-start tape6-server'],
    ['--info', 'Show configuration info and exit'],
    ['--self', 'Print the path to this script and exit'],
    ['--help, -h', 'Show this help message and exit'],
    ['--version, -v', 'Show version and exit']
  ];
  console.log('Options:');
  const width = options.reduce((max, [flag]) => Math.max(max, flag.length), 0) + 2;
  for (const [flag, desc] of options) {
    console.log('  ' + flag.padEnd(width) + desc);
  }
  printFlagOptions();
  process.exit(0);
};

const getServerUrl = () => {
  if (process.env.TAPE6_SERVER_URL) return process.env.TAPE6_SERVER_URL;
  const host = process.env.HOST || 'localhost',
    port = process.env.PORT || '3000';
  return `http://${host}:${port}`;
};

const ensureServer = async (serverUrl, startServer) => {
  try {
    const response = await fetch(serverUrl + '/--tests');
    if (response.ok) return null;
  } catch (error) {
    void error;
  }

  if (!startServer) {
    console.error(
      `Error: tape6-server is not reachable at ${serverUrl}\n\n` +
        'Start it manually:\n' +
        '  npx tape6-server\n\n' +
        'Or re-run with --start-server:\n' +
        '  tape6-puppeteer --start-server --flags FO\n'
    );
    process.exit(1);
  }

  // start the server
  const serverBin = join(rootFolder, 'node_modules/tape-six/bin/tape6-server.js'),
    serverParts = new URL(serverUrl),
    host = serverParts.hostname,
    port = serverParts.port || '3000',
    child = spawn(process.execPath, [serverBin], {
      cwd: rootFolder,
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: false,
      env: {...process.env, HOST: host, PORT: port}
    });

  let exited = false,
    exitCode = null,
    stderrData = '';
  child.stderr.on('data', chunk => (stderrData += chunk));
  child.on('exit', code => {
    exited = true;
    exitCode = code;
  });
  child.unref();

  // wait for server to become available
  for (let i = 0; i < 30; ++i) {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (exited) {
      console.error(
        `Error: tape6-server exited with code ${exitCode} while starting on ${host}:${port}` +
          (stderrData ? '\n' + stderrData.trim() : '')
      );
      process.exit(1);
    }
    try {
      const response = await fetch(serverUrl + '/--tests');
      if (response.ok) return child;
    } catch (error) {
      void error;
    }
  }

  child.kill();
  console.error(
    `Error: tape6-server failed to start on ${host}:${port} (timed out after 15s)` +
      (stderrData ? '\n' + stderrData.trim() : '')
  );
  process.exit(1);
};

const main = async () => {
  const options = getOptions({
    '--self': {fn: showSelf, isValueRequired: false},
    '--start-server': {isValueRequired: false},
    '--info': {isValueRequired: false},
    '--server-url': {aliases: ['-u'], initialValue: getServerUrl(), isValueRequired: true},
    '--help': {aliases: ['-h'], fn: showHelp, isValueRequired: false},
    '--version': {aliases: ['-v'], fn: showVersion, isValueRequired: false}
  });
  options.flags.serverUrl = options.optionFlags['--server-url'];

  await Promise.all([initReporter(getReporter, setReporter, options.flags), selectTimer()]);

  if (options.optionFlags['--info'] === '') {
    showInfo(options, []);
    await new Promise(r => process.stdout.write('', r));
    process.exitCode = 0;
    return;
  }

  const startServer = options.optionFlags['--start-server'] === '';

  const serverUrl = options.optionFlags['--server-url'].replace(/\/+$/, '');
  const serverChild = await ensureServer(serverUrl, startServer);

  console.log(`Connected to ${serverUrl} (${serverChild ? 'self-launched' : 'external'})`);

  const shutdown = code => {
    serverChild?.kill();
    process.exit(code);
  };

  process.on('uncaughtException', (error, origin) => {
    console.error('UNHANDLED ERROR:', origin, error);
    shutdown(1);
  });

  // fetch test files from server
  let files = [];
  try {
    if (options.files.length) {
      const query = options.files.map(p => 'q=' + encodeURIComponent(p)).join('&');
      const response = await fetch(serverUrl + '/--patterns?' + query);
      if (response.ok) files = await response.json();
    }
    if (!files.length) {
      const response = await fetch(serverUrl + '/--tests');
      if (response.ok) files = await response.json();
    }
  } catch (error) {
    void error;
  }

  if (!files.length) {
    console.log('No test files found on the server.');
    shutdown(1);
  }

  // fetch importmap from server
  let importmap = null;
  try {
    const response = await fetch(serverUrl + '/--importmap');
    if (response.ok) importmap = await response.json();
  } catch (error) {
    void error;
  }

  const reporter = getReporter(),
    worker = new TestWorker(reporter, options.parallel, {
      ...options.flags,
      serverUrl,
      importmap
    });

  reporter.report({type: 'test', test: 0});

  await new Promise(resolve => {
    worker.done = () => resolve();
    worker.execute(files);
  });

  const hasFailed = reporter.state && reporter.state.failed > 0;

  reporter.report({
    type: 'end',
    test: 0,
    fail: hasFailed
  });

  await worker.cleanup();

  serverChild?.kill();
  await new Promise(r => process.stdout.write('', r));
  process.exitCode = hasFailed ? 1 : 0;
};

main().catch(error => console.error('ERROR:', error));
