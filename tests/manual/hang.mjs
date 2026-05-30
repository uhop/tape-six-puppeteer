// Manual control-channel fixture: an UNCOOPERATIVE test. It hangs in a
// non-signal-aware await with no further assertions, so the cooperative drain
// (tape6-terminate -> StopTest at next assertion) can never stop it. Only the
// Node-side force-kill (driver closes the context after graceTimeout) ends it.
// Not matched by the default `test-*` glob, so `npm test` ignores it; run it via
// tests/manual/verify-control-channel.mjs.
import test from 'tape-six';

test('uncooperative: hangs ignoring abort', async t => {
  t.pass('started');
  await new Promise(() => {}); // never resolves, never observes t.signal
});
