#!/usr/bin/env node

import process from 'node:process'
import {fileURLToPath} from 'node:url'

if (process.argv.includes('--self')) {
  const self = new URL(import.meta.url)
  if (self.protocol === 'file:') {
    console.log(fileURLToPath(self))
  } else {
    console.log(self)
  }
} else {
  await import('./tape-six-puppeteer-node.js')
}
