import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const helperStart = html.indexOf('    function bindTouchButtons(');
const helperEnd = html.indexOf('    const touchMode', helperStart);
assert.ok(helperStart > 0 && helperEnd > helperStart);
const bindTouchButtons = new Function(`${html.slice(helperStart, helperEnd)}; return bindTouchButtons;`)();

function event(type, properties = {}) {
  return Object.assign(new Event(type, { cancelable: true }), properties);
}
class Button extends EventTarget {
  disabled = false;
  captures = new Set();
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) {
    this.captures.delete(id);
    this.dispatchEvent(event('lostpointercapture', { pointerId: id }));
  }
  getBoundingClientRect() { return { left: 100, top: 50, right: 148, bottom: 98, width: 48, height: 48 }; }
  click() { if (!this.disabled) this.dispatchEvent(event('click', { detail: 0 })); }
}
function setup() {
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  document.hidden = false;
  const button = new Button(), clicks = [];
  bindTouchButtons([button]);
  button.addEventListener('click', event => clicks.push({ target: event.target, detail: event.detail }));
  return { button, clicks };
}
function pointer(button, type, properties = {}) {
  const input = event(type, { pointerId: 2, pointerType: 'touch', isPrimary: false,
    clientX: 124, clientY: 74, button: 0, ctrlKey: false, ...properties });
  button.dispatchEvent(input);
  return input;
}

test('primary and secondary fingers activate on release, preserving existing click actions', () => {
  for (const isPrimary of [true, false]) {
    const { button, clicks } = setup();
    assert.equal(pointer(button, 'pointerdown', { isPrimary }).defaultPrevented, true);
    assert.equal(button.hasPointerCapture(2), true);
    assert.equal(clicks.length, 0, 'Do not activate on touch-down');
    pointer(button, 'pointerup', { isPrimary });
    assert.equal(clicks.length, 1);
    assert.equal(clicks[0].target, button, 'Existing handlers still receive the actual button');
    assert.equal(button.captures.size, 0);
  }
});

test('modern and legacy Safari-style generated clicks cannot double-toggle controls', () => {
  const { button, clicks } = setup();
  pointer(button, 'pointerdown'); pointer(button, 'pointerup');
  for (const properties of [{ detail: 1, pointerType: 'touch' }, { detail: 1 }, { detail: 0, pointerType: 'touch' }]) {
    const click = event('click', properties);
    button.dispatchEvent(click);
    assert.equal(click.defaultPrevented, true);
    assert.equal(clicks.length, 1, 'No second pause/mute/fullscreen activation');
  }
  pointer(button, 'pointerdown'); pointer(button, 'pointerup');
  assert.equal(clicks.length, 2, 'A new tap works immediately, without a debounce timeout');
});

test('mouse, keyboard and assistive clicks still work after touch input', () => {
  const { button, clicks } = setup();
  pointer(button, 'pointerdown'); pointer(button, 'pointerup');
  button.dispatchEvent(event('click', { detail: 0 }));
  button.click();
  assert.equal(clicks.length, 3, 'Keyboard and accessibility activation need no pointerdown');
  pointer(button, 'pointerdown', { pointerType: 'mouse' });
  pointer(button, 'pointerup', { pointerType: 'mouse' });
  assert.equal(clicks.length, 3, 'Mouse still activates only through its native click');
  const click = event('click', { detail: 1, pointerType: 'mouse' });
  button.dispatchEvent(click);
  assert.equal(click.defaultPrevented, false);
  assert.equal(clicks.length, 4);
});

test('release outside the button cancels instead of activating a neighboring control', () => {
  for (const [clientX, clientY] of [[99, 74], [148, 74], [124, 49], [124, 98]]) {
    const { button, clicks } = setup();
    pointer(button, 'pointerdown');
    pointer(button, 'pointerup', { clientX, clientY });
    button.dispatchEvent(event('click', { detail: 1 }));
    assert.equal(clicks.length, 0);
    assert.equal(button.captures.size, 0);
  }
});

test('unrelated fingers, canceled gestures and disabled buttons never activate', () => {
  for (const type of ['pointercancel', 'lostpointercapture']) {
    const { button, clicks } = setup();
    pointer(button, 'pointerdown');
    pointer(button, type, { pointerId: 99 });
    assert.equal(button.hasPointerCapture(2), true);
    pointer(button, type);
    pointer(button, 'pointerup');
    assert.equal(clicks.length, 0);
    assert.equal(button.captures.size, 0);
  }
  const { button, clicks } = setup();
  pointer(button, 'pointerup');
  pointer(button, 'pointerdown', { button: 2 });
  pointer(button, 'pointerup');
  pointer(button, 'pointerdown', { ctrlKey: true });
  pointer(button, 'pointerup');
  button.disabled = true;
  pointer(button, 'pointerdown'); pointer(button, 'pointerup');
  button.disabled = false;
  pointer(button, 'pointerdown');
  pointer(button, 'pointerdown', { pointerId: 99 });
  pointer(button, 'pointerup', { pointerId: 99 });
  assert.equal(button.hasPointerCapture(2), true);
  button.disabled = true;
  pointer(button, 'pointerup');
  assert.equal(clicks.length, 0);
});

test('rotation, app switching and focus loss cancel unfinished taps', () => {
  for (const type of ['resize', 'blur', 'visibilitychange']) {
    const { button, clicks } = setup();
    pointer(button, 'pointerdown');
    if (type === 'visibilitychange') { document.hidden = true; document.dispatchEvent(event(type)); }
    else window.dispatchEvent(event(type));
    pointer(button, 'pointerup');
    assert.equal(clicks.length, 0, type);
    assert.equal(button.captures.size, 0, type);
  }
});

test('mobile UI uses larger separated targets, inert icons and touch binding outside held-fire controls', () => {
  assert.match(html, /body\.touch-device \.hud-actions \{ gap: 10px; \}/);
  assert.match(html, /body\.touch-device \.hud-actions button \{ width: 48px; height: 48px; flex-shrink: 0; \}/);
  assert.match(html, /\.hud-actions \.icon \{ pointer-events: none; \}/);
  assert.ok(html.includes("bindTouchButtons(document.querySelectorAll('button:not(#touch-laser, #touch-power)'))"));
  assert.ok(html.includes('fullscreenButton.hidden = !document.fullscreenEnabled;'));
});
