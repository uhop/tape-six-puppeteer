// Manual control-channel fixture: a COOPERATIVE test. It asserts on a short
// interval, so once the parent posts `tape6-terminate` the reporter arms
// stopTest and the very next assertion throws StopTest — the test unwinds (its
// cleanup hooks run) WELL before the force-kill graceTimeout. The mirror image
// of hang.mjs (uncooperative). Needs tape-six >= 1.10 inside the iframe (the
// `tape6-terminate` listener); against older tape-six the drain is a no-op and
// only the force-kill backstop ends it. Not matched by the default `test-*`
// glob, so `npm test` ignores it; run it via tests/manual/verify-control-channel.mjs.
import test from 'tape-six';

test('cooperative: stops at next assertion on terminate', async t => {
  t.pass('started');
  // Keep asserting on a short interval. The armed StopTest throws at the next
  // t.pass once the drain lands, unwinding the test cooperatively.
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 25));
    t.pass('tick');
  }
});
