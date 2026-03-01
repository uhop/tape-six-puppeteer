import test from 'tape-six';

test('window and navigator', t => {
  t.equal(typeof window, 'object', 'window exists');
  t.equal(typeof document, 'object', 'document exists');
  t.equal(typeof navigator, 'object', 'navigator exists');
  t.equal(typeof navigator.userAgent, 'string', 'userAgent is a string');
});

test('URL and URLSearchParams', t => {
  const url = new URL('https://example.com/path?a=1&b=2');
  t.equal(url.hostname, 'example.com', 'hostname parsed');
  t.equal(url.pathname, '/path', 'pathname parsed');

  const params = url.searchParams;
  t.equal(params.get('a'), '1', 'param a');
  t.equal(params.get('b'), '2', 'param b');
});

test('fetch available', t => {
  t.equal(typeof fetch, 'function', 'fetch is a function');
  t.equal(typeof Request, 'function', 'Request is a function');
  t.equal(typeof Response, 'function', 'Response is a function');
});
