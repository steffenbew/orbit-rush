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
    const flight = makeFlight(reducedMotion), yawRate = reducedMotion ? .45 : .9, rate = yawRate * .4;
    flight.target.set(.4, 0);
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
    assert.ok(flight.flightMotion.x > 140, 'Neutral controls keep travelling along the new heading');
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
const yawLimit = 65 * Math.PI / 180, pitchLimit = Math.PI / 4;
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
soft.flightOrientation.y = -60 * Math.PI / 180;
soft.target.set(1, 0); center.target.set(1, 0);
soft.step(.1); center.step(.1);
assert.ok(Math.abs(soft.flightTurn.x) < Math.abs(center.flightTurn.x) * .2, 'Outward input softens before hitting the limit');
soft.flightVelocity.set(100, -50); soft.target.set(0, 0); soft.step(1);
assert.ok(Math.abs(soft.flightVelocity.x - 100 * Math.exp(-2)) < 1e-8, 'Impact drift dissipates independently of the flight heading');
console.log('PASS responsive aircraft inertia, persistent heading, soft ±65°/±45° limits, forward-only flight, impulse decay and pause at 5–144 FPS');

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
  ${section('      function steer(event)', '      function togglePause()')}
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
pointerEvent(window, 'pointermove');
assert.ok(Math.abs(input.target.x - .8) < 1e-8);
pointerEvent(canvas, 'pointerleave', canvas);
assert.ok(Math.abs(input.target.x - .8) < 1e-8, 'Leaving the canvas for a HUD control must not recenter steering');
pointerEvent(window, 'pointermove', hud, {clientX: 950, clientY: 80});
assert.ok(Math.abs(input.target.x - .9) < 1e-8); assert.ok(Math.abs(input.target.y - .8) < 1e-8);
pointerEvent(window, 'pointerdown', hud);
assert.equal(input.state().shots, 0, 'HUD interactions must not fire weapons');
pointerEvent(page, 'pointerleave', page);
assert.equal(input.target.length(), 0, 'Leaving the actual page still recenters steering');

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
assert.equal(input.target.length(), 0, 'Releasing touch still stops lateral steering');
pointerEvent(window, 'pointermove', hud); window.dispatchEvent(new Event('blur'));
assert.equal(input.target.length(), 0); assert.equal(input.state().paused, true);
console.log('PASS continuous HUD steering, page exit, inactive/modal guards, no accidental shots, touch/capture and blur safety');

const makeStart = () => new Function('THREE', `
  let innerWidth = 1000, innerHeight = 800, started = false, paused = true, soundEnabled = true, lastPointerPosition = null;
  const mouseAim = new THREE.Vector2(.7, -.6), target = new THREE.Vector2(.7, -.6), reticle = {style: {}};
  const camera = new THREE.PerspectiveCamera(), scene = {fog: {}}, reducedMotion = false;
  const elements = new Map();
  const document = {
    fullscreenEnabled: true, fullscreenElement: null,
    documentElement: {requestFullscreen() { innerWidth = 1280; innerHeight = 900; return Promise.resolve(); }},
    body: {classList: {add() {}}}, activeElement: {blur() {}},
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {disabled: false, hidden: false, dataset: {}, setAttribute() {}});
      return elements.get(selector);
    }
  };
  const languagePicker = document.querySelector('#language'), audioNotice = document.querySelector('#audio-notice');
  let finishAudio = () => {}, lessons = 0;
  const sound = {initAudio: () => new Promise(resolve => { finishAudio = resolve; })};
  const t = key => key, setupLevelFleet = () => {}, beginFlightTutorial = () => { lessons++; };
  const resetSimulationClock = () => {}, syncMusic = () => {}, playSound = () => {};
  const audioError = error => { throw error; };
  ${section('      function steer(event)', '      // Suppress accidental secondary clicks')}
  ${section('      async function startGame(', "      document.querySelector('#start').addEventListener")}
  return {
    start: startGame, loadAudio: () => finishAudio(), remember: value => { lastPointerPosition = value; },
    state: () => ({started, paused, lessons, aim: mouseAim.toArray(), turn: target.toArray(), reticle: reticle.style,
      introHidden: document.querySelector('#intro').hidden, buttonDisabled: document.querySelector('#start').disabled})
  };
`)(THREE);
for (const withSound of [false, true]) for (const pointer of [null, {clientX: 500, clientY: 400}, {clientX: 950, clientY: 700}]) {
  const start = makeStart(); start.remember(pointer);
  const loading = start.start(withSound);
  if (withSound) start.remember({clientX: 100, clientY: 100}); // Pointer movement while audio is loading must not start a turn.
  start.loadAudio(); await loading;
  const state = start.state();
  assert.equal(state.started, true); assert.equal(state.paused, false); assert.equal(state.lessons, 1);
  assert.equal(state.introHidden, true); assert.equal(state.buttonDisabled, false);
  assert.deepEqual(state.aim, [0, 0]); assert.deepEqual(state.turn, [0, 0]);
  assert.deepEqual(state.reticle, {left: '640px', top: '450px'}, 'Center against the new fullscreen viewport, not the old menu coordinates');
}
assert.ok(source.includes('<svg class="intro-orbit"'));
assert.ok(!source.includes('updateIntroCheckpoint'));
assert.match(source, /#intro \.intro-card \{ position: relative; z-index: 1; \}/);
console.log('PASS restored home layout with neutral mouse/keyboard/silent starts, including fullscreen resize and audio-loading pointer movement');
