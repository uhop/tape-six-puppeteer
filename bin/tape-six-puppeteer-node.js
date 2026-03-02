#!/usr/bin/env node

import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

import {getOptions, initFiles, initReporter, showInfo} from 'tape-six/utils/config.js';

import {getReporter, setReporter} from 'tape-six/test.js';
import {selectTimer} from 'tape-six/utils/timer.js';

import TestWorker from '../src/TestWorker.js';

const rootFolder = process.cwd();

const showSelf = () => {
  const self = new URL(import.meta.url);
  if (self.protocol === 'file:') {
    console.log(fileURLToPath(self));
  } else {
    console.log(self);
  }
  process.exit(0);
};

const getServerUrl = () => {
  if (process.env.TAPE6_SERVER_URL) return process.env.TAPE6_SERVER_URL.replace(/\/+$/, '');
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
  const serverBin = fileURLToPath(
    new URL('../node_modules/tape-six/bin/tape6-server.js', import.meta.url)
  );
  const child = spawn(process.execPath, [serverBin], {
    cwd: rootFolder,
    stdio: 'ignore',
    detached: false,
    env: {
      ...process.env,
      HOST: new URL(serverUrl).hostname,
      PORT: new URL(serverUrl).port || '3000'
    }
  });
  child.unref();

  // wait for server to become available
  for (let i = 0; i < 30; ++i) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const response = await fetch(serverUrl + '/--tests');
      if (response.ok) return child;
    } catch (error) {
      void error;
    }
  }

  console.error(`Error: tape6-server failed to start at ${serverUrl}`);
  process.exit(1);
};

const main = async () => {
  const options = getOptions({
    '--self': showSelf,
    '--start-server': {isValueRequired: false},
    '--info': {isValueRequired: false}
  });

  await Promise.all([initReporter(getReporter, setReporter, options.flags), selectTimer()]);

  if (options.optionFlags['--info'] === '') {
    const files = await initFiles(options.files, rootFolder);
    showInfo(options, files);
    process.exit(0);
  }

  const startServer = options.optionFlags['--start-server'] === '';

  const serverUrl = getServerUrl();
  const serverChild = await ensureServer(serverUrl, startServer);

  const shutdown = code => {
    serverChild?.kill();
    process.exit(code);
  };

  process.on('uncaughtException', (error, origin) => {
    console.error('UNHANDLED ERROR:', origin, error);
    shutdown(1);
  });

  // resolve CLI patterns or fetch test files from server
  let files = options.files.length ? await initFiles(options.files, rootFolder) : [];
  if (!files.length) {
    try {
      const response = await fetch(serverUrl + '/--tests');
      if (response.ok) files = await response.json();
    } catch (error) {
      void error;
    }
  }

  if (!files.length) {
    console.log('No files found.');
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

  shutdown(hasFailed ? 1 : 0);
};

main().catch(error => console.error('ERROR:', error));
