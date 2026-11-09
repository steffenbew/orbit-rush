// Run from the project root: node tests/round-controls.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = source.indexOf('      // Space belongs to gameplay,');
const end = source.indexOf('      const enemyBolts', start);
assert.ok(start >= 0 && end > start);
const button = new EventTarget();
new Function('document', source.slice(start, end))({
  querySelector(selector) {
    assert.equal(selector, '#play-again', 'Only the result action should lose Space activation');
    return button;
  }
});

function key(type, code, repeat = false) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { code, repeat });
  button.dispatchEvent(event);
  return event.defaultPrevented;
}

assert.equal(key('keydown', 'Space'), true);
assert.equal(key('keydown', 'Space', true), true);
assert.equal(key('keyup', 'Space'), true);
// Release can land on the newly focused button without any preceding keydown there.
assert.equal(key('keyup', 'Space'), true);
for (const code of ['Enter', 'Tab', 'Escape']) {
  assert.equal(key('keydown', code), false);
  assert.equal(key('keyup', code), false);
}
const click = new Event('click', { cancelable: true });
button.dispatchEvent(click);
assert.equal(click.defaultPrevented, false);
console.log('PASS result button blocks Space press/repeat/release, preserves Enter, Tab and click');
