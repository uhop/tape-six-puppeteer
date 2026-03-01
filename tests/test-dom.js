import test from 'tape-six'

test('DOM element creation', t => {
  const div = document.createElement('div')
  div.id = 'test-div'
  div.textContent = 'hello'
  document.body.appendChild(div)

  const found = document.getElementById('test-div')
  t.ok(found, 'element found in DOM')
  t.equal(found.textContent, 'hello', 'textContent matches')

  document.body.removeChild(div)
  t.notOk(document.getElementById('test-div'), 'element removed')
})

test('DOM classList', t => {
  const el = document.createElement('span')
  el.classList.add('foo', 'bar')
  t.ok(el.classList.contains('foo'), 'has class foo')
  t.ok(el.classList.contains('bar'), 'has class bar')

  el.classList.remove('foo')
  t.notOk(el.classList.contains('foo'), 'foo removed')
  t.ok(el.classList.contains('bar'), 'bar still present')
})
