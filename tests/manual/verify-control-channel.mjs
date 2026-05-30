// Manual integration check for the worker control channel — provider side.
//
// Scope vs. the installed dependency: the tape-six **hub** control plane
// (EventServer abort triggers, the iframe child's `tape6-terminate` listener,
// graceTimeout/workerTimeout wiring) ships in a tape-six version newer than the
// 1.7.13 this package currently depends on. So:
//   - The force-kill BACKSTOP (driver closes the context after graceTimeout) is
//     pure driver-side and verifiable against any tape-six — that's this test.
//   - The cooperative DRAIN (postMessage tape6-terminate -> reporter.terminate()
//     in the iframe) needs the newer tape-six loaded inside the iframe; it can't
//     be exercised end-to-end until the dep is bumped. The provider already
//     sends the postMessage, so it lights up automatically then.
//
// What this proves, version-independently, is the property a naive provider gets
// wrong: a force-killed page emits NO completion event, so close(id) must be
// driven by the page 'close' event, not by a reported 'end'. We drive
// destroyTask(id, 'failOnce') directly (what the new base will do on bail) on a
// test that hangs ignoring all signals, and assert done() still fires, after
// roughly graceTimeout (the kill), not before.
//
// Run: `node tests/manual/verify-control-channel.mjs`
import process from 'node:process';
import {spawn} from 'node:child_process';
import {join} from 'node:path';

import TestWorker from '../../src/TestWorker.js';

const rootFolder = process.cwd();
const PORT = process.env.PORT || '3199';
const serverUrl = `http://localhost:${PORT}`;
const importmap = {
  imports: {
    'tape-six': '/node_modules/tape-six/index.js',
    'tape-six/': '/node_modules/tape-six/src/'
  }
};
const GRACE = 1500;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const startServer = async () => {
  const serverBin = join(rootFolder, 'node_modules/tape-six/bin/tape6-server.js');
  const child = spawn(process.execPath, [serverBin], {
    cwd: rootFolder,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: {...process.env, HOST: 'localhost', PORT}
  });
  for (let i = 0; i < 40; ++i) {
    await wait(250);
    try {
      const r = await fetch(serverUrl + '/--tests');
      if (r.ok) return child;
    } catch {
      // not up yet
    }
  }
  child.kill();
  throw new Error('tape6-server did not start');
};

const makeReporter = () => ({
  state: {stopTest: false, failed: 0},
  events: [],
  report(event) {
    this.events.push(event);
    if (event?.stopTest) this.state.stopTest = true;
    if (event?.fail) this.state.failed++;
  }
});

const main = async () => {
  const server = await startServer();
  const results = [];
  let ok = true;
  let worker;
  try {
    const reporter = makeReporter();
    worker = new TestWorker(reporter, 1, {serverUrl, importmap});
    // The 1.7.13 base doesn't set graceTimeout (no control plane); set it
    // explicitly so the backstop has a deterministic, observable delay.
    worker.graceTimeout = GRACE;

    const donePromise = new Promise(resolve => {
      worker.done = () => resolve();
    });

    // Single file -> deterministic task id '1' (counter: 0 -> ++ -> 1).
    worker.execute(['tests/manual/hang.mjs']);
    const id = '1';

    // Wait until the hung test has actually started (its first assert arrived),
    // so the abort lands on a running test, not during setup.
    let started = false;
    for (let i = 0; i < 80; ++i) {
      if (reporter.events.some(e => e.name && String(e.name).includes('started'))) {
        started = true;
        break;
      }
      await wait(250);
    }

    const abortAt = Date.now();
    // Simulate the new base's bail trigger. Cooperative drain is a no-op in the
    // 1.7.13 iframe, so this must fall through to the force-kill backstop.
    worker.destroyTask(id, 'failOnce');

    const guard = wait(GRACE + 15000).then(() => 'TIMEOUT');
    const outcome = await Promise.race([donePromise.then(() => 'DONE'), guard]);
    const elapsed = Date.now() - abortAt;

    const completed = outcome === 'DONE';
    const killedNotBeforeGrace = elapsed >= GRACE - 300; // waited for the kill
    const pass = started && completed && killedNotBeforeGrace;
    ok = pass;
    results.push(
      `force-kill backstop: ${pass ? 'PASS' : 'FAIL'} ` +
        `(started=${started}; completed=${completed}; killedAfter=${elapsed}ms; grace=${GRACE}ms)`
    );
  } catch (error) {
    ok = false;
    results.push('ERROR: ' + (error?.message || error));
  } finally {
    if (worker) await worker.cleanup().catch(() => {});
    server.kill();
  }

  console.log('\n=== worker control channel — provider verification ===');
  for (const line of results) console.log('  ' + line);
  console.log('  note: cooperative in-page drain awaits the tape-six hub release;');
  console.log('        the force-kill backstop above is version-independent.');
  console.log('  overall: ' + (ok ? 'PASS' : 'FAIL') + '\n');
  process.exitCode = ok ? 0 : 1;
};

main().catch(error => {
  console.error('verify ERROR:', error);
  process.exitCode = 1;
});
