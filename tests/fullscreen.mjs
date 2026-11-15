import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = source.indexOf('      const fullscreenButton');
const end = source.indexOf("      document.addEventListener('visibilitychange'", start);
const setup = source.slice(start, end);
function makeFullscreen(saved = null, blocked = false) {
  const attributes = {}, storage = new Map(saved === null ? [] : [['orbit-rush-fullscreen', saved]]);
  let click;
  const button = {setAttribute: (key, value) => { attributes[key] = value; }, addEventListener: (_, handler) => { click = handler; }};
  const document = {
    fullscreenEnabled: true, fullscreenElement: null,
    querySelector: () => button,
    documentElement: {async requestFullscreen() { document.fullscreenElement = {}; }},
    async exitFullscreen() { document.fullscreenElement = null; }
  };
  const localStorage = {
    getItem(key) { if (blocked) throw Error('Blocked'); return storage.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw Error('Blocked'); storage.set(key, value); }
  };
  const setStarted = new Function('document', 'localStorage', 't', `
    let started = false;
    ${setup}
    return value => { started = value; };
  `)(document, localStorage, key => key);
  return {attributes, storage, document, click: () => click(), setStarted};
}
assert.equal(makeFullscreen().attributes['aria-pressed'], 'true', 'Fullscreen defaults to enabled');
const menu = makeFullscreen('false');
assert.equal(menu.attributes['aria-pressed'], 'false', 'Respect saved opt-out');
await menu.click();
assert.equal(menu.attributes['aria-pressed'], 'true');
assert.equal(menu.storage.get('orbit-rush-fullscreen'), 'true');
assert.equal(menu.document.fullscreenElement, null, 'Menu toggle only sets the preference');
const restored = makeFullscreen(menu.storage.get('orbit-rush-fullscreen'));
assert.equal(restored.attributes['aria-pressed'], 'true', 'Restore saved preference');
restored.document.fullscreenElement = {};
restored.document.fullscreenElement = null; // Browser Escape: no preference change.
assert.equal(restored.attributes['aria-pressed'], 'true');
assert.equal(restored.storage.get('orbit-rush-fullscreen'), 'true');
restored.setStarted(true);
await restored.click();
assert.equal(restored.attributes['aria-pressed'], 'false');
await restored.click();
assert.ok(restored.document.fullscreenElement, 'Enable during gameplay enters fullscreen');
await restored.click();
assert.equal(restored.document.fullscreenElement, null, 'Disable exits fullscreen');
assert.equal(restored.storage.get('orbit-rush-fullscreen'), 'false');
const unavailable = makeFullscreen(null, true);
assert.equal(unavailable.attributes['aria-pressed'], 'true', 'Blocked storage keeps the enabled default');
await unavailable.click();
assert.equal(unavailable.attributes['aria-pressed'], 'false', 'Blocked storage does not break the toggle');
console.log('PASS saved fullscreen preference, menu/gameplay toggles, Escape independence and blocked storage');
