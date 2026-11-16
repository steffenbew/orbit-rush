import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../pwa.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const section = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
function page({ controlled = true, pending = true, blockedStorage = false, saved = null } = {}) {
  const listeners = () => ({ handlers: new Map(), addEventListener(type, fn) { this.handlers.set(type, fn); },
    emit(type, event = {}) { return this.handlers.get(type)?.(event); } });
  const waiting = Object.assign(listeners(), { state: 'installed', messages: [], postMessage(message) { this.messages.push(message); } });
  const installing = Object.assign(listeners(), { state: 'installing' });
  const registration = Object.assign(listeners(), { waiting: pending ? waiting : null, installing, updates: 0,
    async update() { this.updates++; } });
  const workers = Object.assign(listeners(), { controller: controlled ? {} : null, async register() { return registration; } });
  const timers = new Map(), storage = new Map(), buttons = [{ disabled: false }, { disabled: true }];
  const key = 'orbit-rush:update:/game/';
  if (saved !== null) storage.set(key, saved);
  let timerId = 0, reloads = 0, safe = true, checkpoint = null;
  const restored = [], warnings = [];
  const document = Object.assign(listeners(), { hidden: false, querySelectorAll: () => buttons });
  const window = Object.assign(listeners(), { isSecureContext: true,
    location: { href: 'https://example.test/game/?test', reload() { reloads++; } } });
  const context = vm.createContext({ window, document, navigator: { serviceWorker: workers }, URL,
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    sessionStorage: {
      getItem: name => storage.get(name) ?? null,
      setItem(name, value) { if (blockedStorage) throw Error('Storage denied'); storage.set(name, value); },
      removeItem(name) { if (blockedStorage) throw Error('Storage denied'); storage.delete(name); }
    }, console: { warn: (...args) => warnings.push(args) }
  });
  vm.runInContext(source, context);
  const api = window.orbitUpdates;
  return {
    api, window, document, workers, waiting, installing, registration, timers, storage, buttons, restored, warnings, key,
    get reloads() { return reloads; },
    safe(value) { safe = value; }, checkpoint(value) { checkpoint = value; },
    configure() { api.configure({ canReload: () => safe, capture: () => checkpoint, restore: data => restored.push(data) }); },
    load: () => window.emit('load'),
    prepare(id = 'attempt', worker = registration.waiting) {
      let reply;
      workers.emit('message', { source: worker, data: { type: 'orbit:prepare-update', id },
        ports: [{ postMessage: value => { reply = value; } }] });
      return reply;
    },
    cancel(id = 'attempt', worker = waiting) {
      workers.emit('message', { source: worker, data: { type: 'orbit:cancel-update', id } });
    },
    expire() {
      const pending = [...timers]; timers.clear();
      for (const [, timer] of pending) timer.fn();
    }
  };
}

test('ready start screens apply waiting updates; first installs and uninitialized games never force reload', async () => {
  const home = page(); await home.load();
  assert.equal(home.waiting.messages.length, 0);
  home.configure();
  assert.equal(home.waiting.messages[0].type, 'orbit:check-update');
  assert.equal(home.prepare().ready, true);
  assert.equal(home.api.locked, true); assert.ok(home.buttons.every(button => button.disabled));
  home.workers.emit('controllerchange'); home.workers.emit('controllerchange');
  assert.equal(home.reloads, 1); assert.equal(home.timers.size, 0);
  const first = page({ controlled: false }); await first.load(); first.configure();
  assert.equal(first.waiting.messages.length, 0);
  assert.equal(first.prepare().ready, false);
  first.workers.emit('controllerchange'); assert.equal(first.reloads, 0);
});

test('active and paused flights veto updates; safe boundaries trigger a new attempt', async () => {
  const flight = page(); await flight.load(); flight.safe(false); flight.configure();
  assert.equal(flight.waiting.messages.length, 0);
  assert.equal(flight.prepare().ready, false);
  flight.workers.emit('controllerchange'); assert.equal(flight.reloads, 0);
  flight.safe(true); flight.api.check();
  assert.equal(flight.waiting.messages.length, 1);
  assert.equal(flight.prepare().ready, true);
  assert.equal(flight.prepare('duplicate').ready, false);
  flight.cancel('unrelated'); assert.equal(flight.api.locked, true);
  flight.cancel(); assert.equal(flight.api.locked, false);
  assert.deepEqual(flight.buttons.map(button => button.disabled), [false, true]);
  flight.expire(); assert.ok(flight.waiting.messages.length > 1, 'Retry notices another window closing');
});

test('the checkpoint survives exactly one update reload, while cancelled attempts leave no stale resume', async () => {
  const checkpoint = { version: 1, level: 3, score: 1234, shield: 72, retries: 2 };
  const before = page(); await before.load(); before.configure(); before.checkpoint(checkpoint);
  assert.equal(before.prepare().ready, true);
  assert.deepEqual(JSON.parse(before.storage.get(before.key)), checkpoint);
  const after = page({ pending: false, saved: before.storage.get(before.key) }); await after.load(); after.configure();
  assert.deepEqual(JSON.parse(JSON.stringify(after.restored)), [checkpoint]);
  assert.equal(after.storage.size, 0); assert.equal(after.timers.size, 0);
  after.configure(); assert.equal(after.restored.length, 1);
  before.cancel(); assert.equal(before.storage.size, 0);
  const blocked = page({ blockedStorage: true }); await blocked.load(); blocked.configure(); blocked.checkpoint(checkpoint);
  assert.equal(blocked.prepare().ready, false); assert.equal(blocked.api.locked, false);
  blocked.checkpoint(null); assert.equal(blocked.prepare('home').ready, true, 'Home can update without session storage');
});

test('failed negotiations unlock; activation keeps the start controls locked until controllerchange', async () => {
  for (const state of ['installed', 'redundant', 'activating']) {
    const game = page(); await game.load(); game.configure(); game.prepare();
    game.waiting.state = state; game.expire();
    assert.equal(game.api.locked, state === 'activating', state);
  }
  const game = page(); await game.load(); game.configure();
  assert.equal(game.prepare('foreign', {}), undefined);
});

test('update discovery and foreground/online checks work without permanent idle polling', async () => {
  const game = page({ pending: false }); await game.load(); game.configure();
  assert.equal(game.timers.size, 0);
  game.registration.waiting = game.waiting;
  game.installing.emit('statechange'); assert.equal(game.waiting.messages.length, 1);
  game.registration.emit('updatefound'); game.installing.emit('statechange');
  assert.equal(game.waiting.messages.length, 2);
  await game.window.emit('pageshow'); await game.window.emit('online');
  assert.equal(game.registration.updates, 2);
  game.document.hidden = true; await game.document.emit('visibilitychange');
  assert.equal(game.registration.updates, 2);
  game.document.hidden = false; await game.document.emit('visibilitychange');
  assert.equal(game.registration.updates, 3);
  game.registration.update = async () => { throw Error('Offline'); };
  await game.window.emit('online');
  const malformed = page({ saved: '{broken' }); malformed.configure();
  assert.equal(malformed.storage.size, 0); assert.equal(malformed.restored.length, 0);
});

function checkpointGame() {
  return new Function(`
    let level = 1, score = 0, kills = 0, retries = 3, shield = 100, levelCheckpoint = {score: 0, kills: 0};
    let celebrating = false, tutorialCompleted = false, bestAtLevelStart = 0, soundEnabled = true, language = 'de';
    let started = false, crashing = false, roundEnded = false, updateRestored = false, levelPressure = 0;
    const renderDiagnostics = {failed: false}, reducedMotion = false, calls = [], elements = new Map();
    const document = {body: {classList: {add() {}}}, querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {disabled: false, hidden: false, setAttribute() {}});
      return elements.get(selector);
    }};
    const languagePicker = {querySelector: selector => document.querySelector(selector)};
    const scene = {fog: {}}, camera = {updateProjectionMatrix() {}};
    const setLanguage = value => { language = value; }, applyTranslations = () => {}, t = key => key;
    const setupLevelFleet = () => calls.push('fleet'), updateScore = () => calls.push('score');
    const finishRound = reason => {
      // The real finishRound uses this guard too: a restored death must not consume another life.
      if (reason === 'collision' && !crashing) retries--;
      calls.push(reason); roundEnded = true; crashing = false;
    };
    ${section('      function canApplyUpdate()', '      getRenderState =')}
    return {canApplyUpdate, captureUpdateCheckpoint, restoreUpdateCheckpoint, calls,
      state: () => ({started, roundEnded, updateRestored, levelPressure, language}),
      mode(mode) {
        started = !['home', 'loading'].includes(mode); roundEnded = mode === 'results'; crashing = mode === 'crash';
        document.querySelector('#start').disabled = mode === 'loading';
        renderDiagnostics.failed = mode === 'failed';
      }
    };
  `)();
}

test('game safe points exclude startup, paused flights, crashes and render failures', () => {
  const game = checkpointGame();
  for (const mode of ['home', 'loading', 'flight', 'paused', 'crash', 'results', 'failed']) {
    game.mode(mode);
    assert.equal(game.canApplyUpdate(), ['home', 'results'].includes(mode), mode);
  }
  for (const marker of ['async function startGame(withSound = true)', "function restartRound(mode = 'new')"]) {
    const start = html.indexOf(marker);
    assert.match(html.slice(start, start + 150), /orbitUpdates\?\.locked/);
  }
  assert.match(section('      function finishRound(', '      function restartRound('), /orbitUpdates\?\.check\(\)/);
});

test('victory, retry and game-over snapshots retain progress, shield, lives, settings and retry checkpoints', () => {
  for (const [celebrating, retries] of [[true, 3], [false, 2], [false, 0]]) {
    const game = checkpointGame();
    const saved = {version: 1, level: 3, score: 5432, kills: 20, retries, shield: celebrating ? 72 : 0,
      levelCheckpoint: {score: 2000, kills: 12}, celebrating, tutorialCompleted: true,
      bestAtLevelStart: 5000, soundEnabled: false, language: 'en'};
    game.restoreUpdateCheckpoint(saved);
    assert.deepEqual(game.captureUpdateCheckpoint(), saved);
    assert.deepEqual(game.calls, ['fleet', celebrating ? 'time' : 'collision', 'score']);
    assert.equal(game.state().started, true); assert.equal(game.state().roundEnded, true);
    assert.equal(game.state().updateRestored, true); assert.equal(game.canApplyUpdate(), true);
  }
  const game = checkpointGame(); assert.equal(game.captureUpdateCheckpoint(), null);
  assert.throws(() => game.restoreUpdateCheckpoint({version: 99}), /Invalid update checkpoint/);
  assert.equal(game.state().started, false, 'Reject bad storage before changing gameplay');
});
