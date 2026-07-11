#!/usr/bin/env node

import runDriverCli from 'tape-six/driver/cli.js';

import {TestWorker, supportedBrowsers} from '../src/TestWorker.js';

runDriverCli({
  packageUrl: import.meta.url,
  commandName: 'tape6-puppeteer',
  description: 'Puppeteer-based browser test runner for tape-six',
  supportedBrowsers,
  TestWorker
}).catch(error => console.error('ERROR:', error));
