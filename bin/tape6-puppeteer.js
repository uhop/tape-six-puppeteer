#!/usr/bin/env node

import {readFileSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {printFlagOptions} from 'tape-six/utils/config.js';

const getVersion = () => {
  const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json');
  return JSON.parse(readFileSync(pkgPath, 'utf8')).version;
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
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
} else if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log('tape6-puppeteer ' + getVersion());
  process.exit(0);
} else if (process.argv.includes('--self')) {
  const self = new URL(import.meta.url);
  if (self.protocol === 'file:') {
    console.log(fileURLToPath(self));
  } else {
    console.log(self);
  }
} else {
  await import('./tape6-puppeteer-node.js');
}
