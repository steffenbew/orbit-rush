// Run from the project root: node tests/steering.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const THREE = await import(new URL('assets/vendor/three.module.js', root));
const source = readFileSync(new URL('index.html', root), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
};
const flightCode = section('        if (!paused) {\n          // Aircraft steering:', '        worldStep.copy(flightMotion)');
const makeFlight = reducedMotion => new Function('THREE', 'reducedMotion', `
  const target = new THREE.Vector2(), flightVelocity = new THREE.Vector2(), flightTurn = new THREE.Vector2(), flightViewOffset = new THREE.Vector2();
  const flightMotion = new THREE.Vector3(), flightDirection = new THREE.Vector3();
  const flightTilt = new THREE.Vector3(), flightOrientation = new THREE.Euler(0, 0, 0, 'YXZ');
  const camera = new THREE.PerspectiveCamera(), playerHullRotation = new THREE.Quaternion();
  let paused = false, speed = 400;
  ${section('      function advanceFlightHeading(', '      function forecastFlightPosition(')}
  return { target, flightVelocity, flightTurn, flightMotion, flightOrientation, camera, playerHullRotation,
    setPaused: value => { paused = value; }, step: dt => { ${flightCode} }
  };
`)(THREE, reducedMotion);

for (const reducedMotion of [false, true]) {
  const outcomes = [];
  for (const fps of [5, 30, 60, 120, 144]) {
    const flight = makeFlight(reducedMotion), yawRate = reducedMotion ? .45 : .9, rate = yawRate * .25;
    flight.target.set(.25, 0); // Keep this inertia test inside the narrower soft-limit region.
    flight.step(.1);
    assert.ok(Math.abs(flight.flightTurn.x) > rate * .3 && Math.abs(flight.flightTurn.x) < rate * .35,
      'Turn-in reaches about one third of the requested rate in 100 ms, retaining some inertia');
    for (let i = 0; i < fps * 2; i++) flight.step(1 / fps);
    assert.ok(Math.abs(flight.flightTurn.x) > rate * .98);
    assert.ok(Math.abs(flight.flightMotion.length() - 400) < 1e-8, 'Turning redirects forward speed, not extra strafe speed');
    const heading = flight.flightOrientation.y;
    flight.target.set(0, 0);
    for (let i = 0; i < fps * 5; i++) flight.step(1 / fps);
    assert.ok(flight.flightOrientation.y < heading, 'Inertia carries the turn briefly after releasing input');
    assert.ok(Math.abs(flight.flightTurn.x) < .00002, 'The turn rate settles to zero');
    assert.ok(Math.abs(flight.flightOrientation.y + rate * 2.1) < .00002, 'Hold the resulting course, never recenter the nose');
    const settled = flight.flightOrientation.y;
    for (let i = 0; i < fps * 3; i++) flight.step(1 / fps);
    assert.ok(Math.abs(flight.flightOrientation.y - settled) < .00001);
    assert.ok(flight.flightMotion.x > 90, 'Neutral controls keep travelling along the new heading');
    outcomes.push(flight.flightOrientation.y);
    assert.ok(Math.abs(flight.camera.rotation.z) < .001, 'Wings level after the turn, without undoing yaw');
    assert.ok(flight.playerHullRotation.equals(flight.camera.quaternion));
    const velocity = flight.flightMotion.clone(), rotation = flight.camera.quaternion.clone();
    flight.setPaused(true); flight.target.set(-1, -1); flight.step(1);
    assert.ok(flight.flightMotion.equals(velocity)); assert.ok(flight.camera.quaternion.equals(rotation));
    flight.camera.rotation.x += .05;
    assert.ok(flight.playerHullRotation.equals(rotation), 'Cosmetic shake must not rotate the collision hull');

    const response = makeFlight(reducedMotion), pitchRate = reducedMotion ? .325 : .65;
    response.target.set(1, 1);
    for (let i = 0; i < Math.ceil(fps * .6); i++) response.step(1 / fps);
    assert.ok(-response.flightTurn.x > yawRate * .9 && response.flightTurn.y > pitchRate * .9,
      'Yaw and pitch reach 90% of the requested rate within 600 ms');
    response.target.set(-1, -1);
    for (let i = 0; i < Math.ceil(fps * .2); i++) response.step(1 / fps);
    assert.ok(response.flightTurn.x > 0 && response.flightTurn.y < 0, 'Countersteering reverses the turn within 200 ms');
    response.target.set(0, 0);
    for (let i = 0; i < fps; i++) response.step(1 / fps);
    assert.ok(Math.abs(response.flightTurn.x) < yawRate * .02 && Math.abs(response.flightTurn.y) < pitchRate * .02,
      'Centering controls quickly settles both axes instead of leaving a long drifting turn');
  }
  for (const heading of outcomes) assert.ok(Math.abs(heading - outcomes[0]) < 1e-8, 'Frame-rate-independent turn integration');
}
// Full input reaches a sideways bank without widening the heading cone.
for (const fps of [5, 60, 144]) for (const sign of [-1, 1]) for (const input of [.25, .5, 1]) {
  const banked = makeFlight(false);
  banked.target.set(sign * input, 0);
  banked.step(1 / fps);
  const firstBank = THREE.MathUtils.clamp(-sign * input ** 2 * Math.PI / 2 * (1 - Math.exp(-1.2 / fps)),
    -50 * Math.PI / 180 / fps, 50 * Math.PI / 180 / fps);
  assert.ok(Math.abs(banked.camera.rotation.z - firstBank) < 1e-10, 'Banking uses the slower inertia response');
  for (let frame = 1; frame < fps * 24; frame++) banked.step(1 / fps);
  const expected = -sign * input ** 2 * Math.PI / 2;
  assert.ok(Math.abs(banked.camera.rotation.z - expected) < 1e-6);
  assert.ok(Math.abs(banked.flightOrientation.y) <= Math.PI / 4);
  assert.ok(banked.flightMotion.z < 0);
  banked.target.set(0, 0);
  for (let frame = 0; frame < fps * 16; frame++) banked.step(1 / fps);
  assert.ok(Math.abs(banked.camera.rotation.z) < .00002, 'Release smoothly levels the aircraft');
}
// A full reversal must respect the same roll-speed cap, not snap through 180 degrees.
for (const fps of [5, 60, 144]) {
  const banked = makeFlight(false);
  banked.target.set(1, 0);
  for (let frame = 0; frame < fps * 20; frame++) banked.step(1 / fps);
  banked.target.set(-1, 0);
  for (let frame = 0; frame < fps * 8; frame++) {
    const previous = banked.camera.rotation.z;
    banked.step(1 / fps);
    assert.ok(Math.abs(banked.camera.rotation.z - previous) <= 50 * Math.PI / 180 / fps + 1e-10);
    if ((frame + 1) / fps <= 1.5) assert.ok(banked.camera.rotation.z < 0, 'Reversing a full bank takes time to reach level');
  }
  assert.ok(banked.camera.rotation.z > 0, 'A sustained reversal eventually banks the other way');
}
for (const sign of [-1, 1]) {
  const banked = makeFlight(true);
  banked.flightTurn.x = sign * .45;
  banked.target.set(-sign, 0);
  banked.step(.1);
  const expected = banked.flightTurn.x / .9 * .1 * (1 - Math.exp(-.4));
  assert.ok(Math.abs(banked.camera.rotation.z - expected) < 1e-10, 'Reduced-motion banking stays unchanged');
}
console.log('PASS curved ±90° input banking, gentle partial turns, smooth leveling and unchanged reduced motion');
const yawLimit = Math.PI / 4, pitchLimit = Math.PI / 4;
for (const reducedMotion of [false, true]) for (const fps of [5, 60, 144]) for (const sign of [-1, 1]) {
  const bounded = makeFlight(reducedMotion);
  bounded.target.set(sign, sign);
  for (let i = 0; i < fps * 20; i++) {
    bounded.step(1 / fps);
    assert.ok(Math.abs(bounded.flightOrientation.y) <= yawLimit && Math.abs(bounded.flightOrientation.x) <= pitchLimit);
    assert.ok(bounded.flightMotion.z < 0, 'Even combined full steering cannot reverse forward travel');
  }
  assert.ok(Math.abs(bounded.flightOrientation.y) > yawLimit * .98 && Math.abs(bounded.flightOrientation.x) > pitchLimit * .98);
  assert.ok(bounded.flightTurn.length() < .02, 'Outward turning eases nearly to rest at the cone edge');
  const heldYaw = bounded.flightOrientation.y;
  bounded.target.set(0, 0);
  for (let i = 0; i < fps * 2; i++) bounded.step(1 / fps);
  assert.ok(Math.abs(bounded.flightOrientation.y) >= Math.abs(heldYaw), 'Neutral controls never pull a limited heading back to center');
  const yaw = bounded.flightOrientation.y, pitch = bounded.flightOrientation.x;
  bounded.target.set(-sign, -sign);
  for (let i = 0; i < Math.ceil(fps * .6); i++) bounded.step(1 / fps);
  assert.ok(Math.abs(bounded.flightOrientation.y) < Math.abs(yaw) - .1 && Math.abs(bounded.flightOrientation.x) < Math.abs(pitch) - .08,
    'Turning back into the forward cone stays responsive, without a sticky boundary');
}
const soft = makeFlight(false), center = makeFlight(false);
soft.flightOrientation.y = -42 * Math.PI / 180;
soft.target.set(1, 0); center.target.set(1, 0);
soft.step(.1); center.step(.1);
assert.ok(Math.abs(soft.flightTurn.x) < Math.abs(center.flightTurn.x) * .2, 'Outward input softens before hitting the limit');
soft.flightVelocity.set(100, -50); soft.target.set(0, 0); soft.step(1);
assert.ok(Math.abs(soft.flightVelocity.x - 100 * Math.exp(-2)) < 1e-8, 'Impact drift dissipates independently of the flight heading');
console.log('PASS responsive aircraft inertia, persistent heading, matching soft ±45° yaw/pitch limits, forward-only flight, impulse decay and pause at 5–144 FPS');

class Element extends EventTarget {
  closest() { return null; }
  setPointerCapture() {}
}
const canvas = new Element(), hud = new Element(), page = new Element(), window = new EventTarget();
let modal = false;
const document = new EventTarget();
document.documentElement = page;
document.querySelector = () => modal ? hud : null;
const input = new Function('THREE', 'window', 'document', 'canvas', `
  const innerWidth = 1000, innerHeight = 800;
  const mouseAim = new THREE.Vector2(), target = new THREE.Vector2(), reticle = {style: {}};
  let started = true, paused = false, crashing = false, roundEnded = false, celebrating = false;
  let lastPointerPosition = null, pointer = null, spaceHeld = false, shots = 0, drawings = 0;
  const fireRocket = () => shots++, sprayEmojis = () => drawings++;
  const togglePause = () => { paused = !paused; };
  ${section('      function steer(event)', '      async function endRun()')}
  return { target, mouseAim, reticle,
    state: () => ({lastPointerPosition, pointer, shots, drawings, paused}),
    mode: name => {
      started = name !== 'intro'; paused = name === 'pause'; crashing = name === 'crash';
      roundEnded = name === 'defeat' || name === 'victory'; celebrating = name === 'victory';
    }
  };
`)(THREE, window, document, canvas);
function pointerEvent(receiver, type, target = canvas, overrides = {}) {
  const event = new Event(type, {cancelable: true});
  Object.defineProperty(event, 'target', {value: target});
  Object.assign(event, {isPrimary: true, pointerId: 1, pointerType: 'mouse', clientX: 900, clientY: 400, button: 0, ctrlKey: false}, overrides);
  receiver.dispatchEvent(event);
  return event;
}
const creditLink = new Element();
creditLink.closest = selector => selector === '#audio-credits, #render-diagnostics' ? creditLink : null;
const reportField = new Element();
reportField.closest = selector => selector === '#audio-credits, #render-diagnostics' ? reportField : null;
for (const type of ['contextmenu', 'auxclick', 'dblclick', 'dragstart', 'selectstart', 'wheel', 'gesturestart', 'gesturechange', 'gestureend']) {
  for (const target of [canvas, hud]) {
    assert.equal(pointerEvent(document, type, target).defaultPrevented, true, `${type} is blocked across game surfaces and overlays`);
  }
  assert.equal(pointerEvent(document, type, creditLink).defaultPrevented, false, `${type} remains available inside credits`);
  assert.equal(pointerEvent(document, type, reportField).defaultPrevented, false, `${type} remains available for diagnostic report copying`);
}
assert.equal(pointerEvent(document, 'click', hud).defaultPrevented, false, 'Normal taps/clicks still activate UI controls');
assert.match(source, /body > :not\(#audio-credits, #render-diagnostics\), body > :not\(#audio-credits, #render-diagnostics\) \* \{[^}]*touch-action: none;[^}]*user-select: none;[^}]*-webkit-user-select: none;[^}]*-webkit-touch-callout: none;[^}]*-webkit-user-drag: none;/, 'Native touch suppression covers all game UI from first paint, excluding credits');
pointerEvent(window, 'pointermove');
assert.ok(Math.abs(input.target.x - .8) < 1e-8);
pointerEvent(canvas, 'pointerleave', canvas);
assert.ok(Math.abs(input.target.x - .8) < 1e-8, 'Leaving the canvas for a HUD control must not recenter steering');
pointerEvent(window, 'pointermove', hud, {clientX: 950, clientY: 80});
assert.ok(Math.abs(input.target.x - .9) < 1e-8); assert.ok(Math.abs(input.target.y - .8) < 1e-8);
pointerEvent(window, 'pointerdown', hud);
assert.equal(input.state().shots, 0, 'HUD interactions must not fire weapons');
const heldSteering = input.target.clone();
pointerEvent(page, 'pointerleave', page, {pointerType: 'touch', pointerId: 2, isPrimary: false});
assert.ok(input.target.equals(heldSteering), 'Lifting a firing finger must not cancel held joystick steering');
pointerEvent(page, 'pointerleave', page, {pointerType: 'touch', pointerId: 1});
assert.ok(input.target.equals(heldSteering), 'The first touch may also be a firing finger');
pointerEvent(page, 'pointerleave', page);
assert.equal(input.target.length(), 0, 'Leaving the actual page with a mouse still recenters steering');

for (const mode of ['intro', 'pause', 'crash', 'defeat']) {
  input.mode(mode); pointerEvent(window, 'pointermove', hud, {clientX: 100, clientY: 100});
  assert.equal(input.target.length(), 0, mode + ' must not accept active steering');
  assert.deepEqual(input.state().lastPointerPosition, {clientX: 100, clientY: 100}, 'Keep the pointer location for the next start/resume');
}
input.mode('playing'); modal = true; pointerEvent(window, 'pointermove', hud);
assert.equal(input.target.length(), 0, 'Modal dialogs must block gameplay steering'); modal = false;
pointerEvent(window, 'pointermove', hud, {isPrimary: false});
assert.equal(input.target.length(), 0, 'Ignore secondary pointers');
input.mode('victory'); pointerEvent(window, 'pointermove', hud);
assert.ok(input.target.x > .7, 'Celebration flight should retain steering across overlays');
input.mode('playing'); pointerEvent(canvas, 'pointerdown');
assert.equal(input.state().shots, 1);
const before = input.target.clone();
pointerEvent(window, 'pointermove', hud, {pointerId: 2, clientX: 0});
assert.ok(input.target.equals(before), 'An unrelated pointer must not override a captured drag');
pointerEvent(canvas, 'pointercancel'); assert.equal(input.target.length(), 0); assert.equal(input.state().pointer, null);
pointerEvent(canvas, 'pointerdown', canvas, {pointerType: 'touch'});
pointerEvent(canvas, 'pointerup', canvas, {pointerType: 'touch'});
assert.equal(input.target.length(), 0, 'Touch on the canvas must not steer');
assert.equal(input.state().pointer, null, 'Touch must use the dedicated controls, not canvas capture');
assert.equal(input.state().shots, 1, 'Canvas touch must not fire');
pointerEvent(window, 'pointermove', canvas, {pointerType: 'touch', clientX: 100, clientY: 100});
assert.equal(input.target.length(), 0, 'Touch anywhere outside the joystick must not steer');
pointerEvent(window, 'pointermove', hud); window.dispatchEvent(new Event('blur'));
assert.equal(input.target.length(), 0); assert.equal(input.state().paused, true);
input.mode('victory');
pointerEvent(canvas, 'pointerdown', canvas, {pointerType: 'touch'});
assert.equal(input.state().drawings, 1, 'Touch still draws emojis during the victory flight');
pointerEvent(canvas, 'pointerup', canvas, {pointerType: 'touch'});
assert.equal(input.state().pointer, null);
console.log('PASS continuous HUD steering, page exit, inactive/modal guards, no accidental shots, touch/capture and blur safety');

const makeStart = (fullscreenPreferred = true, enterFullscreen = () => Promise.resolve(), frame = queueMicrotask) =>
  new Function('THREE', 'fullscreenPreferred', 'enterFullscreen', 'requestAnimationFrame', `
  let innerWidth = 1000, innerHeight = 800, started = false, paused = true, soundEnabled = true, lastPointerPosition = null;
  const mouseAim = new THREE.Vector2(.7, -.6), target = new THREE.Vector2(.7, -.6), reticle = {style: {}};
  const camera = new THREE.PerspectiveCamera(), scene = {fog: {}}, reducedMotion = false;
  const elements = new Map(), calls = [], timers = new Map(), errors = [];
  let timerId = 0;
  const setTimeout = (callback, delay) => { timers.set(++timerId, {callback, delay}); return timerId; };
  const clearTimeout = id => timers.delete(id);
  const document = {
    fullscreenEnabled: true, fullscreenElement: null,
    documentElement: {async requestFullscreen() { calls.push('fullscreen'); await enterFullscreen(); innerWidth = 1280; innerHeight = 900; }},
    body: {classList: {add() {}}}, activeElement: {blur() {}},
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {disabled: false, hidden: false, dataset: {}, setAttribute() {}});
      return elements.get(selector);
    }
  };
  const languagePicker = document.querySelector('#language'), audioNotice = document.querySelector('#audio-notice');
  let finishAudio = () => {}, lessons = 0;
  const sound = {initAudio: () => { calls.push('audio'); return new Promise(resolve => { finishAudio = resolve; }); }};
  const t = key => key, localTestLevel = () => null, setupLevelFleet = () => {}, beginFlightTutorial = () => { lessons++; };
  const resetSimulationClock = () => {}, syncMusic = () => {}, playSound = () => {};
  const audioError = error => { errors.push(error.message); audioNotice.hidden = false; };
  ${section('      function steer(event)', '      // Suppress accidental secondary clicks')}
  ${section('      async function startGame(', "      document.querySelector('#start').addEventListener")}
  return {
    start: startGame, loadAudio: () => finishAudio(), remember: value => { lastPointerPosition = value; },
    expireAudio: () => { for (const timer of timers.values()) timer.callback(); },
    state: () => ({started, paused, lessons, soundEnabled, calls, errors, timerDelays: [...timers.values()].map(timer => timer.delay),
      aim: mouseAim.toArray(), turn: target.toArray(), reticle: reticle.style,
      introHidden: document.querySelector('#intro').hidden, buttonDisabled: document.querySelector('#start').disabled,
      languageDisabled: languagePicker.disabled, label: document.querySelector('#start-label').textContent,
      silentDisabled: document.querySelector('#silent-start').disabled, noticeHidden: audioNotice.hidden})
  };
`)(THREE, fullscreenPreferred, enterFullscreen, frame);
for (const withSound of [false, true]) {
  let completeFullscreen;
  const frames = [];
  const start = makeStart(true, () => new Promise(resolve => { completeFullscreen = resolve; }), cb => frames.push(cb));
  const loading = start.start(withSound);
  start.loadAudio();
  await new Promise(setImmediate);
  assert.equal(start.state().started, false, 'Ready audio must not start flight during the fullscreen transition');
  assert.deepEqual(frames, []);
  completeFullscreen();
  await new Promise(setImmediate);
  frames.shift()();
  await Promise.resolve();
  assert.equal(start.state().introHidden, false, 'Keep the intro up for the first resized paint');
  frames.shift()();
  await loading;
  assert.equal(start.state().started, true);
}
let deniedFrames = 0;
const denied = makeStart(true, () => Promise.reject(new Error('Fullscreen denied')), cb => { deniedFrames++; queueMicrotask(cb); });
await denied.start(false);
assert.equal(deniedFrames, 0, 'No resize to wait for when fullscreen is denied');
assert.equal(denied.state().started, true, 'A rejected fullscreen request still starts windowed');
for (const withSound of [false, true]) {
  const start = makeStart(false);
  const loading = start.start(withSound);
  start.loadAudio(); await loading;
  assert.deepEqual(start.state().calls, withSound ? ['audio'] : [], 'Disabled fullscreen preference must keep startup windowed');
  assert.equal(start.state().started, true);
}
for (const withSound of [false, true]) for (const pointer of [null, {clientX: 500, clientY: 400}, {clientX: 950, clientY: 700}]) {
  const start = makeStart(); start.remember(pointer);
  const loading = start.start(withSound);
  assert.deepEqual(start.state().calls, withSound ? ['audio', 'fullscreen'] : ['fullscreen'], 'Unlock audio before fullscreen, without awaiting either');
  assert.deepEqual(start.state().timerDelays, withSound ? [15000] : []);
  if (withSound) start.remember({clientX: 100, clientY: 100}); // Pointer movement while audio is loading must not start a turn.
  start.loadAudio(); await loading;
  const state = start.state();
  assert.equal(state.started, true); assert.equal(state.paused, false); assert.equal(state.lessons, 1);
  assert.equal(state.introHidden, true); assert.equal(state.buttonDisabled, false);
  assert.deepEqual(state.timerDelays, [], 'Successful startup clears its timeout');
  const position = withSound ? {clientX: 100, clientY: 100} : pointer || {clientX: 640, clientY: 450};
  assert.deepEqual(state.aim, [position.clientX / 1280 * 2 - 1, 1 - position.clientY / 900 * 2]);
  assert.deepEqual(state.turn, [0, 0], 'Pointer placement must not start a turn');
  assert.deepEqual(state.reticle, {left: `${position.clientX}px`, top: `${position.clientY}px`}, 'Use the latest pointer position, or center for keyboard-only startup');
}
for (const retryWithSound of [false, true]) {
  const start = makeStart();
  const loading = start.start();
  const finishOriginalAudio = start.loadAudio;
  start.expireAudio();
  await loading;
  const state = start.state();
  assert.equal(state.started, false, 'Stalled audio must not start gameplay');
  assert.equal(state.buttonDisabled, false);
  assert.equal(state.languageDisabled, false);
  assert.equal(state.silentDisabled, false);
  assert.equal(state.noticeHidden, false);
  assert.equal(state.label, 'retryStart');
  assert.match(state.errors[0], /Audio startup timed out/);
  assert.deepEqual(state.timerDelays, []);
  finishOriginalAudio();
  await Promise.resolve();
  assert.equal(start.state().started, false, 'Late audio completion must not start a timed-out attempt');
  const retry = start.start(retryWithSound);
  if (retryWithSound) start.loadAudio();
  await retry;
  assert.equal(start.state().started, true, 'Retry and silent play both recover from a timeout');
  assert.equal(start.state().soundEnabled, retryWithSound);
  assert.equal(start.state().lessons, 1);
}
console.log('PASS audio unlock before fullscreen, bounded startup, timeout recovery and no late game start');
assert.ok(source.includes('const introAsteroids = new THREE.Group();'), 'Home-screen orbit uses decorative asteroids instead of an SVG track');
assert.ok(!source.includes('updateIntroCheckpoint'));
assert.match(source, /#intro \.intro-card \{ position: relative; z-index: 1; \}/);
console.log('PASS restored home layout with neutral mouse/keyboard/silent starts, including fullscreen resize and audio-loading pointer movement');
