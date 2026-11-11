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
const flightCode = section('        if (!paused) {\n          // Direct velocity steering:', '        worldStep.copy(flightMotion)');
const makeFlight = reducedMotion => new Function('THREE', 'reducedMotion', `
  const target = new THREE.Vector2(), flightVelocity = new THREE.Vector2();
  const flightMotion = new THREE.Vector3(), flightDirection = new THREE.Vector3();
  const flightHeading = new THREE.Vector2(), flightTilt = new THREE.Vector3(), flightOrientation = new THREE.Euler();
  const camera = new THREE.PerspectiveCamera(), playerHullRotation = new THREE.Quaternion();
  let paused = false, speed = 400;
  return { target, flightVelocity, flightMotion, camera, playerHullRotation,
    setPaused: value => { paused = value; }, step: dt => { ${flightCode} }
  };
`)(THREE, reducedMotion);

for (const reducedMotion of [false, true]) {
  for (const fps of [30, 60, 120]) {
    const flight = makeFlight(reducedMotion), movement = reducedMotion ? .35 : 1;
    const sideways = 400 * 1.15 * movement;
    flight.target.set(1, 0);
    for (let i = 0; i < fps * .8; i++) flight.step(1 / fps);
    assert.ok(flight.flightVelocity.x > sideways * .9, 'Reach 90% steering speed in under 0.8 seconds');
    assert.ok(flight.flightVelocity.x < sideways, 'Acceleration must remain smooth without overshoot');
    flight.flightVelocity.set(sideways, 0); flight.target.set(-1, 0);
    for (let i = 0; i < Math.ceil(fps * .25); i++) flight.step(1 / fps);
    assert.ok(flight.flightVelocity.x < 0, 'Reverse lateral direction within a quarter second');
    flight.flightVelocity.set(sideways, 0); flight.target.set(0, 0);
    for (let i = 0; i < fps; i++) flight.step(1 / fps);
    assert.ok(Math.abs(flight.flightVelocity.x / sideways - Math.exp(-3)) < 1e-8,
      'Centering should remove about 95% of the drift in one second, independently of frame rate');
    flight.target.set(1, 1);
    for (let i = 0; i < fps * 5; i++) flight.step(1 / fps);
    assert.ok(Math.abs(flight.flightVelocity.y - 400 * movement) < .001, 'Vertical speed should match forward speed, up from 78%');
    assert.ok(Math.abs(flight.flightVelocity.x - sideways) < .001, 'Keep sideways top speed unchanged');
    assert.equal(flight.flightMotion.z, -400, 'Do not alter forward speed');
    assert.ok(flight.playerHullRotation.equals(flight.camera.quaternion), 'The collision hull must follow pitch, yaw and bank');
    const velocity = flight.flightVelocity.clone(), rotation = flight.camera.quaternion.clone();
    flight.setPaused(true); flight.target.set(-1, -1); flight.step(1);
    assert.ok(flight.flightVelocity.equals(velocity)); assert.ok(flight.camera.quaternion.equals(rotation));
    assert.ok(flight.playerHullRotation.equals(rotation), 'Pause freezes the collision hull too');
    flight.camera.rotation.x += .05;
    assert.ok(flight.playerHullRotation.equals(rotation), 'Cosmetic camera shake must not move the collision hull');
  }
}
console.log('PASS tighter acceleration, braking/reversal, vertical authority, frame-rate independence and pause/reduced motion');

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
