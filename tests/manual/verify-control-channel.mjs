// Manual integration check for the worker control channel — provider side.
//
// Both cases drive destroyTask(id, 'failOnce') directly — exactly what the
// EventServer base does on a bail / failOnce / worker-deadline — against a
// running test, then assert HOW the task completes:
//
//   - hang.mjs (UNCOOPERATIVE): ignores the abort, so the cooperative drain is
//     a no-op and only the force-kill backstop (driver closes the context after
//     graceTimeout) ends it -> completes at ~graceTimeout.
//   - cooperative.mjs (COOPERATIVE): asserts on a short interval, so the armed
//     StopTest unwinds it at the next assertion -> completes WELL before
//     graceTimeout, no force-kill needed.
//
// Both prove the property a naive provider gets wrong: a force-killed page emits
// NO completion event, so close(id) must be driven by the page 'close' event,
// not by a reported 'end'. The cooperative case additionally exercises the
// in-iframe `tape6-terminate` listener, which needs tape-six >= 1.10; the
// force-kill backstop is version-independent.
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

// Launch a worker for one fixture, wait until the test has actually started,
// drive a failOnce abort, and measure how long until done() fires. A fresh
// worker per case keeps the task-id counter deterministic (single file -> '1').
const runCase = async file => {
  const reporter = makeReporter();
  const worker = new TestWorker(reporter, 1, {serverUrl, importmap});
  // The base honors graceTimeout from options; set it directly here so the
  // backstop has a deterministic, observable delay independent of TAPE6_*.
  worker.graceTimeout = GRACE;

  const donePromise = new Promise(resolve => {
    worker.done = () => resolve();
  });

  worker.execute([file]);
  const id = '1';

  // Wait until the test's first assertion ('started') arrived, so the abort
  // lands on a running test, not during setup.
  let started = false;
  for (let i = 0; i < 80; ++i) {
    if (reporter.events.some(e => e.name && String(e.name).includes('started'))) {
      started = true;
      break;
    }
    await wait(250);
  }

  const abortAt = Date.now();
  worker.destroyTask(id, 'failOnce');

  const guard = wait(GRACE + 15000).then(() => 'TIMEOUT');
  const outcome = await Promise.race([donePromise.then(() => 'DONE'), guard]);
  const elapsed = Date.now() - abortAt;

  await worker.cleanup().catch(() => {});
  return {started, completed: outcome === 'DONE', elapsed};
};

const main = async () => {
  const server = await startServer();
  const results = [];
  let ok = true;
  try {
    // Force-kill backstop: an uncooperative test ends only at ~graceTimeout.
    const hang = await runCase('tests/manual/hang.mjs');
    const hangPass = hang.started && hang.completed && hang.elapsed >= GRACE - 200;
    ok = ok && hangPass;
    results.push(
      `force-kill backstop: ${hangPass ? 'PASS' : 'FAIL'} ` +
        `(started=${hang.started}; completed=${hang.completed}; ` +
        `killedAfter=${hang.elapsed}ms; grace=${GRACE}ms)`
    );

    // Cooperative drain: a test that keeps asserting unwinds at the next
    // assertion, well before the kill would fire.
    const coop = await runCase('tests/manual/cooperative.mjs');
    const coopPass = coop.started && coop.completed && coop.elapsed <= GRACE - 600;
    ok = ok && coopPass;
    results.push(
      `cooperative drain:   ${coopPass ? 'PASS' : 'FAIL'} ` +
        `(started=${coop.started}; completed=${coop.completed}; ` +
        `drainedAfter=${coop.elapsed}ms; grace=${GRACE}ms)`
    );
  } catch (error) {
    ok = false;
    results.push('ERROR: ' + (error?.message || error));
  } finally {
    server.kill();
  }

  console.log('\n=== worker control channel — provider verification ===');
  for (const line of results) console.log('  ' + line);
  console.log('  note: cooperative drain needs tape-six >= 1.10 in the iframe;');
  console.log('        the force-kill backstop is version-independent.');
  console.log('  overall: ' + (ok ? 'PASS' : 'FAIL') + '\n');
  process.exitCode = ok ? 0 : 1;
};

main().catch(error => {
  console.error('verify ERROR:', error);
  process.exitCode = 1;
});
