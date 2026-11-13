// Run from the project root: node tests/render-diagnostics.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRenderDiagnostics } from '../render-diagnostics.js';
import { t, setLanguage } from '../i18n.js';

class Element extends EventTarget {
  value = '';
  textContent = '';
  open = false;
  focused = false;
  selected = false;
  children = new Map();
  querySelector(selector) {
    if (!this.children.has(selector)) this.children.set(selector, new Element());
    return this.children.get(selector);
  }
  showModal() { this.open = true; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
}
function setup() {
  const root = new Element(), canvas = new Element();
  let stopped = 0, reloads = 0, copied = '';
  globalThis.window = {innerWidth: 390, innerHeight: 844, devicePixelRatio: 3};
  globalThis.location = {origin: 'https://example.com', pathname: '/orbit/', search: '?private=omit', reload: () => reloads++};
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {
    userAgent: 'Test Mobile Browser', language: 'de-DE', hardwareConcurrency: 4,
    clipboard: {writeText: async value => { copied = value; }}
  }});
  const diagnostics = createRenderDiagnostics({root, canvas, t,
    getState: () => ({phase: 'simulation', level: 4, effects: {particles: 180}}),
    onFailure: () => stopped++
  });
  return {root, canvas, diagnostics, stopped: () => stopped, reloads: () => reloads, copied: () => copied,
    report: () => JSON.parse(root.querySelector('#render-report').value)};
}
const originalConsoleError = console.error;
console.error = () => {};
try {
  setLanguage('en');
  const game = setup();
  let frames = 0;
  game.diagnostics.runFrame(() => frames++);
  assert.equal(frames, 1);
  assert.equal(game.root.open, false, 'No diagnostic UI during healthy frames');
  assert.equal(game.stopped(), 0);
  const error = new TypeError('Cannot read health of destroyed ship');
  game.diagnostics.runFrame(() => { throw error; });
  assert.equal(game.root.open, true);
  assert.equal(game.diagnostics.failed, true);
  assert.equal(game.stopped(), 1);
  const report = game.report();
  assert.equal(report.kind, 'frame-error');
  assert.equal(report.message, error.message);
  assert.equal(report.stack, error.stack);
  assert.equal(report.game.level, 4);
  assert.equal(report.game.effects.particles, 180);
  assert.equal(report.page, 'https://example.com/orbit/', 'Do not include query strings or fragments');
  game.diagnostics.runFrame(() => frames++);
  game.diagnostics.report('secondary-error', new Error('Do not replace the original'));
  assert.equal(frames, 1, 'No more simulation/render calls after failure');
  assert.deepEqual(game.report(), report);
  assert.equal(game.stopped(), 1);
  const cancel = new Event('cancel', {cancelable: true});
  game.root.dispatchEvent(cancel);
  assert.ok(cancel.defaultPrevented, 'Escape cannot dismiss diagnostics and resume a broken game');

  game.root.querySelector('#copy-render-report').dispatchEvent(new Event('click'));
  await Promise.resolve();
  assert.equal(game.copied(), game.root.querySelector('#render-report').value);
  assert.equal(game.root.querySelector('#render-copy-status').textContent, t('diagnosticsCopied'));
  for (const clipboard of [undefined, {writeText: async () => { throw new Error('Permission denied'); }}]) {
    navigator.clipboard = clipboard;
    game.root.querySelector('#copy-render-report').dispatchEvent(new Event('click'));
    await Promise.resolve();
    assert.ok(game.root.querySelector('#render-report').focused);
    assert.ok(game.root.querySelector('#render-report').selected);
    assert.equal(game.root.querySelector('#render-copy-status').textContent, t('diagnosticsCopyManually'));
  }
  game.root.querySelector('#reload-render').dispatchEvent(new Event('click'));
  assert.equal(game.reloads(), 1, 'Reload is explicit, never automatic');

  const lost = setup();
  const event = new Event('webglcontextlost', {cancelable: true});
  event.statusMessage = 'GPU reset';
  lost.canvas.dispatchEvent(event);
  assert.ok(event.defaultPrevented);
  assert.equal(lost.report().kind, 'webgl-context-lost');
  assert.equal(lost.report().message, 'GPU reset');
  assert.equal(lost.stopped(), 1);
  assert.equal(lost.root.open, true);

  // Verify the real shutdown code, not just the popup's onFailure callback.
  const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const shutdownFrom = source.lastIndexOf('      stopRendering = () => {');
  const shutdownTo = source.indexOf('      resetSimulationClock();', shutdownFrom);
  assert.ok(shutdownFrom > 0 && shutdownTo > shutdownFrom);
  const calls = [], deferred = [];
  const shutdown = new Function('calls', 'deferred', `
    let stopRendering, paused = false, speed = 500, pointer = {}, spaceHeld = true;
    const queueMicrotask = fn => deferred.push(fn);
    const renderer = {setAnimationLoop: value => calls.push(['loop', value])};
    const touchControls = {reset: () => calls.push(['touch'])};
    const sound = {suspendAudio: async () => calls.push(['audio'])};
    ${source.slice(shutdownFrom, shutdownTo)}
    stopRendering();
    return {paused, speed, pointer, spaceHeld};
  `)(calls, deferred);
  assert.deepEqual(shutdown, {paused: true, speed: 0, pointer: null, spaceHeld: false});
  assert.ok(calls.some(([name]) => name === 'audio'));
  assert.ok(calls.some(([name]) => name === 'touch'));
  assert.equal(deferred.length, 1, 'Cancel the next animation frame after Three.js schedules it');
  deferred[0]();
  assert.deepEqual(calls.at(-1), ['loop', null]);
} finally {
  console.error = originalConsoleError;
}
console.log('PASS failure reports, WebGL loss, clipboard fallback, explicit reload and gameplay/audio shutdown');
