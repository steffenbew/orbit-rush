// Run from the project root: node tests/touch-controls.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTouchControls } from '../touch-controls.js';

class Element extends EventTarget {
  hidden = true;
  style = {};
  attributes = {};
  captures = new Set();
  classes = new Set();
  children = new Map();
  classList = {
    add: name => this.classes.add(name),
    remove: name => this.classes.delete(name),
    toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name)
  };
  querySelector(selector) {
    if (!this.children.has(selector)) this.children.set(selector, new Element());
    return this.children.get(selector);
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  getBoundingClientRect() { return {left: 200, top: 500, width: 120, height: 120}; }
}
function pointer(element, type, id, x = 260, y = 560, extra = {}) {
  const event = new Event(type, {cancelable: true});
  Object.assign(event, {pointerId: id, pointerType: 'touch', isPrimary: id === 1,
    button: 0, ctrlKey: false, clientX: x, clientY: y, ...extra});
  element.dispatchEvent(event);
  return event;
}
function setup() {
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  document.hidden = false;
  let active = true, aim = [0, 0];
  const shots = [], root = new Element();
  const joystick = root.querySelector('#touch-joystick'), laser = root.querySelector('#touch-laser');
  const power = root.querySelector('#touch-power'), knob = root.querySelector('.joystick-knob');
  knob.getBoundingClientRect = () => ({width: 44});
  const controls = createTouchControls({root, canPlay: () => active && !document.hidden,
    onSteer: (x, y) => { aim = [x, y]; },
    onFire: heavy => shots.push(heavy)});
  return {controls, root, joystick, laser, power, knob, shots, aim: () => aim,
    active: value => { active = value; }};
}

for (const first of ['joystick', 'laser', 'power']) {
  const game = setup();
  const order = [first, ...['joystick', 'laser', 'power'].filter(name => name !== first)];
  order.forEach((name, i) => pointer(game[name], 'pointerdown', i + 1, 298, 560));
  assert.deepEqual(game.aim(), [1, -0], 'Full deflection delivers full normalized steering');
  assert.ok(game.controls.normalHeld && game.controls.heavyHeld, 'Non-primary thumbs can fire and steer simultaneously');
  assert.equal(game.shots.length, 2);
  assert.ok(game.shots.includes(true) && game.shots.includes(false));
  const joystickId = order.indexOf('joystick') + 1;
  pointer(game.joystick, 'pointermove', 99, 222, 560);
  pointer(game.joystick, 'pointerup', 99);
  assert.deepEqual(game.aim(), [1, -0], 'Unrelated pointers cannot move or release a held control');
  for (let i = 0; i < 100; i++) pointer(game.joystick, 'pointermove', joystickId, 298, 560);
  assert.deepEqual(game.aim(), [1, -0], 'Holding or repeated moves never accumulate cursor travel');
  pointer(game.joystick, 'pointerup', joystickId);
  assert.deepEqual(game.aim(), [0, 0], 'Release recenters the cursor immediately');
  assert.equal(game.knob.style.transform, 'translate(0px, 0px)');
  assert.ok(game.controls.normalHeld && game.controls.heavyHeld, 'Releasing steering does not release fire');
  pointer(game.laser, 'pointerup', order.indexOf('laser') + 1);
  assert.equal(game.controls.normalHeld, false);
  assert.equal(game.controls.heavyHeld, true);
  game.controls.reset();
  assert.equal(game.controls.heavyHeld, false);
  for (const name of order) assert.equal(game[name].captures.size, 0);
}

const game = setup();
pointer(game.joystick, 'pointerdown', 1, 262, 561);
assert.deepEqual(game.aim(), [2 / 38, -1 / 38], 'Even small finger movements map immediately without a dead zone');
assert.equal(game.knob.style.transform, 'translate(2px, 1px)', 'The knob follows finger displacement directly');
pointer(game.joystick, 'pointermove', 1, 279, 560);
assert.deepEqual(game.aim(), [.5, -0], 'Half finger travel maps to exactly half steering input');
assert.equal(game.knob.style.transform, 'translate(19px, 0px)');
pointer(game.joystick, 'pointermove', 1, 266, 560);
assert.deepEqual(game.aim(), [6 / 38, -0], 'Moving back updates position immediately without smoothing');
pointer(game.joystick, 'pointermove', 1, 260, 560);
assert.deepEqual(game.aim(), [0, -0], 'Only the exact center produces zero input');
for (const direction of [-1, 1]) {
  let previous = 0;
  for (const travel of [.2, .4, .6, .8, 1]) {
    pointer(game.joystick, 'pointermove', 1, 260 + direction * travel * 38, 560);
    const distance = Math.abs(game.aim()[0]);
    assert.ok(distance > previous && distance <= 1, 'Steering stays within the normalized range');
    assert.ok(Math.abs(distance - travel) < 1e-10, 'Every deflection maps linearly');
    assert.equal(Math.sign(game.aim()[0]), direction);
    previous = distance;
  }
}
for (const [x, y] of [[1000, 560], [-1000, 560], [260, -1000], [260, 1000], [1000, -1000], [-1000, 1000]]) {
  pointer(game.joystick, 'pointermove', 1, x, y);
  assert.ok(Math.abs(Math.hypot(...game.aim()) - 1) < 1e-10, 'Axis and diagonal overdrags respect the same radial limit');
}
for (const event of ['pointercancel', 'lostpointercapture']) {
  pointer(game.joystick, event, 1);
  assert.deepEqual(game.aim(), [0, 0], 'Cancellation centers aim and releases steering');
  pointer(game.joystick, 'pointerdown', 1, 298, 560);
}
game.controls.reset();

for (const interruption of ['blur', 'resize', 'visibilitychange', 'inactive']) {
  const game = setup();
  pointer(game.joystick, 'pointerdown', 1, 298, 560);
  pointer(game.laser, 'pointerdown', 2);
  pointer(game.power, 'pointerdown', 3);
  if (interruption === 'inactive') {
    game.active(false); game.controls.update(0, false, 1);
    assert.equal(game.root.hidden, true, 'No controls on intro, pause, crash, results or modal screens');
  } else if (interruption === 'visibilitychange') {
    document.hidden = true; document.dispatchEvent(new Event(interruption));
  } else window.dispatchEvent(new Event(interruption));
  assert.deepEqual(game.aim(), [0, 0], interruption);
  assert.equal(game.controls.normalHeld, false, interruption);
  assert.equal(game.controls.heavyHeld, false, interruption);
  document.hidden = false; game.active(true);
  pointer(game.joystick, 'pointermove', 1, 222, 560);
  assert.deepEqual(game.aim(), [0, 0], 'Stale moves cannot restart a cleared gesture');
}

const meterGame = setup();
meterGame.controls.update(40, false, .25);
assert.equal(meterGame.root.hidden, false);
for (const [button, value, offset] of [[meterGame.laser, '60', '40'], [meterGame.power, '25', '75']]) {
  const meter = button.querySelector('.touch-charge');
  assert.equal(meter.attributes['aria-valuenow'], value);
  assert.equal(meter.querySelector('.touch-charge-fill').attributes['stroke-dashoffset'], offset);
}
pointer(meterGame.laser, 'pointerdown', 1);
pointer(meterGame.power, 'pointerdown', 2);
meterGame.controls.update(80, true, .25);
assert.ok(meterGame.laser.classes.has('unavailable'));
assert.ok(meterGame.power.classes.has('unavailable'));
assert.ok(meterGame.controls.normalHeld && meterGame.controls.heavyHeld, 'Recharge must not cancel held fire');
meterGame.controls.update(0, false, 1);
assert.ok(!meterGame.laser.classes.has('unavailable') && !meterGame.power.classes.has('unavailable'));
meterGame.controls.reset();
meterGame.active(false);
pointer(meterGame.laser, 'pointerdown', 1);
assert.equal(meterGame.controls.normalHeld, false, 'Inactive controls reject new gestures');

// Exercise the actual gameplay wiring, not just the controller's state getters.
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const callbackStart = source.indexOf('        onSteer: (x, y) => {');
const callbackEnd = source.indexOf('        onFire:', callbackStart);
assert.ok(callbackStart > 0 && callbackEnd > callbackStart);
const THREE = await import('../assets/vendor/three.module.js');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const makeCursor = (width, height) => new Function('innerWidth', 'innerHeight', 'THREE', `
  const mouseAim = new THREE.Vector2(), target = new THREE.Vector2(), reticle = {style: {}};
  const flightVelocity = new THREE.Vector2(), flightTurn = new THREE.Vector2(), flightViewOffset = new THREE.Vector2();
  const flightMotion = new THREE.Vector3(), flightDirection = new THREE.Vector3(), flightTilt = new THREE.Vector3();
  const flightOrientation = new THREE.Euler(0, 0, 0, 'YXZ');
  const camera = new THREE.PerspectiveCamera(), playerHullRotation = new THREE.Quaternion();
  const paused = false, reducedMotion = false, speed = 400;
  let steeringInput = null, lastPointerPosition = {clientX: 100, clientY: 100};
  const cameraMode = 'clear';
  const callbacks = { ${source.slice(callbackStart, callbackEnd)} };
  ${section('      function steer(event)', '      // Suppress accidental secondary clicks')}
  ${section('      function advanceFlightHeading(', '      function forecastFlightPosition(')}
  return {move: callbacks.onSteer, mouseAim, target, reticle, camera, flightTurn,
    lastPointer: () => lastPointerPosition,
    step: dt => { ${section('        if (!paused) {\n          // Aircraft steering:', '        worldStep.copy(flightMotion)')} }
  };
`)(width, height, THREE);
const cursor = makeCursor(800, 600);
cursor.move(1, 0);
assert.deepEqual(cursor.mouseAim.toArray(), [.375, 0], 'Aim retains its aspect-correct, limited range');
assert.deepEqual(cursor.target.toArray(), [1, 0], 'Flight steering is independent of the small aiming circle');
assert.deepEqual(cursor.reticle.style, {left: '550px', top: '300px'}, 'Full stick travel uses half the distance to the nearest viewport edge');
cursor.move(1, 0);
assert.deepEqual(cursor.mouseAim.toArray(), [.375, 0], 'Repeated input does not move the cursor farther');
cursor.move(0, 0);
assert.deepEqual(cursor.mouseAim.toArray(), [0, 0], 'Release centers the actual game cursor');
assert.deepEqual(cursor.target.toArray(), [0, 0], 'Release also neutralizes full-range flight steering');
assert.equal(cursor.lastPointer(), null, 'Touch movement clears stale mouse coordinates');
for (const [width, height] of [[390, 844], [844, 390], [568, 320], [932, 430], [800, 600], [600, 600]]) {
  const circular = makeCursor(width, height);
  for (const travel of [.25, .5, 1]) for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
    const x = Math.cos(angle) * travel, y = Math.sin(angle) * travel;
    circular.move(x, y);
    assert.deepEqual(circular.target.toArray(), [x, y], 'Yaw and pitch must not be scaled by the screen aspect ratio');
    const dx = parseFloat(circular.reticle.style.left) - width / 2;
    const dy = parseFloat(circular.reticle.style.top) - height / 2;
    const expectedRadius = Math.min(width, height) / 4 * travel;
    assert.ok(Math.abs(Math.hypot(dx, dy) - expectedRadius) < 1e-9, `${width}×${height}: equal pixel radius in every direction at every deflection`);
  }
  for (const sign of [-1, 1]) for (const travel of [.5, 1]) {
    const controls = setup(), flight = makeCursor(width, height);
    pointer(controls.joystick, 'pointerdown', 1, 260 + sign * 38 * travel, 560);
    flight.move(...controls.aim());
    for (let frame = 0; frame < 36; frame++) flight.step(1 / 60);
    assert.ok(Math.abs(flight.flightTurn.x) > .9 * travel * .9, 'Touch reaches the same turn rate as desktop');
    for (let frame = 36; frame < 60 * 24; frame++) flight.step(1 / 60);
    assert.ok(Math.abs(flight.camera.rotation.z + sign * travel ** 2 * Math.PI / 2) < 1e-6,
      `${width}×${height}: half stick banks 22.5°, full stick banks 90° in either direction`);
    pointer(controls.joystick, 'pointerup', 1);
    flight.move(...controls.aim());
    for (let frame = 0; frame < 60 * 16; frame++) flight.step(1 / 60);
    assert.ok(Math.abs(flight.camera.rotation.z) < .00002, 'Releasing the joystick smoothly levels the bank');
  }
}
assert.ok(!source.includes('touchControls.advance('), 'No velocity-based cursor integration remains');
const restart = source.slice(source.indexOf('      function restartRound('), source.indexOf("      document.querySelector('#play-again').addEventListener"));
assert.match(restart, /if \(touchMode\) \{\s*lastPointerPosition = null;\s*steeringInput = 'stick';/, 'New levels and retries anchor the idle touch cursor to its steering neutral');
assert.match(source, /#touch-weapons \{[^}]*bottom: calc\(130px \+ env\(safe-area-inset-bottom\)\)/);
assert.match(source, /#touch-joystick \{[^}]*bottom: calc\(120px \+ env\(safe-area-inset-bottom\)\)/);
assert.match(source, /#touch-joystick \{[^}]*right: calc\(48px \+ env\(safe-area-inset-right\)\)/);
assert.match(source, /#touch-controls #touch-power \{[^}]*position: absolute; left: 36px; bottom: 96px/);
assert.match(source, /#touch-weapons \{[^}]*left: calc\(48px \+ env\(safe-area-inset-left\)\)/);
assert.match(source, /\.laser-dot \{ width: 32px; height: 32px;/, 'Orange center is enlarged to 32px');
assert.match(source, /#touch-controls button \{[^}]*width: 92px; height: 92px;/, 'Orange outer button is enlarged to 92px');
assert.ok(source.includes('#touch-controls #touch-laser { left: -12px; }'), 'Only the orange button moves slightly left');
assert.match(source, /#touch-joystick\.held \.joystick-knob \{[^}]*transition: transform 40ms linear;/, 'Only the held knob gets a brief visual transition');
assert.doesNotMatch(source.match(/    \.joystick-knob \{[^}]*\}/)[0], /transition:/, 'Release snaps the knob back without a transition');
assert.ok(source.includes('@media (prefers-reduced-motion: reduce) { #touch-joystick.held .joystick-knob { transition: none; } }'));
assert.ok(source.includes('<span class="power-dot" aria-hidden="true"></span>'));
assert.match(source, /\.power-dot \{ width: 34px; height: 34px;[^}]*background: currentColor;[^}]*box-shadow:/);
assert.ok(!source.includes('power-bars') && !source.includes('power-symbol'), 'Power laser uses a larger glowing center without text or pause-like bars');
assert.match(source, /body\.touch-device \.scoreboard \{ padding: 8px 10px; gap: 6px 14px;/, 'Mobile score card uses tighter spacing');
assert.match(source, /body\.touch-device \.scoreboard \.number \{ font-size: 16px;/, 'Mobile score and level numbers are compact');
assert.match(source, /body\.touch-device #time-left \{ font-size: 13px;/, 'Mobile timer remains visible at a compact size');
assert.match(source, /body\.touch-device #capital-hud \{ bottom: calc\(72px \+ env\(safe-area-inset-bottom\)\); display: grid; gap: 2px;/, 'Mobile boss panel sits above the shield, below touch controls');
const landscape = section('    @media (orientation: landscape) and (max-height: 500px)', '    body.touch-device #control-hints');
assert.match(landscape, /#touch-weapons \{[^}]*bottom: calc\(24px \+ env\(safe-area-inset-bottom\)\)/, 'Landscape fire controls sit near the bottom safe area');
assert.match(landscape, /#touch-joystick \{[^}]*bottom: calc\(24px \+ env\(safe-area-inset-bottom\)\)/, 'Landscape joystick shares the low thumb zone');
assert.match(landscape, /#touch-controls #touch-power \{ left: 88px; bottom: 48px;/, 'Landscape weapons use a shallow diagonal instead of a tall stack');
assert.match(landscape, /body\.touch-device \.hud-actions \{ flex-direction: row;/, 'Short, narrow phones keep toolbar buttons away from the joystick');
assert.match(landscape, /body\.touch-device #capital-hud \{ width: min\(320px, calc\(100vw - 416px/, 'Boss strip fits between the landscape controls');
assert.doesNotMatch(landscape.match(/body\.touch-device #capital-hud \{[^}]*\}/)[0], /bottom:/, 'Boss strip stays above the shield, not in the middle of gameplay');
assert.match(source, /body\.touch-device #capital-health \{ display: block; height: 4px; margin: 0;/, 'Compact boss strip retains its health bar');
assert.match(source, /body\.touch-device #shield-hud \{[^}]*bottom: calc\(8px \+ env\(safe-area-inset-bottom\)\)/, 'Mobile shield sits close to the bottom without covering the home indicator');
assert.match(source, /body\.touch-device \.brand \{ display: none; \}/, 'Hide the in-game title on touch devices regardless of landscape width');
const from = source.indexOf('        if (!paused && !roundEnded) {\n          if (pointer || touchControls.normalHeld)');
const to = source.indexOf('        if (celebrating &&', from);
assert.ok(from > 0 && to > from);
const tick = new Function('touchControls', 'fireRocket', 'heavyEnergy', 'paused', 'roundEnded', `
  const pointer = null, spaceHeld = false;
  ${source.slice(from, to)}
`);
const firing = setup(), fired = [];
pointer(firing.laser, 'pointerdown', 1);
pointer(firing.power, 'pointerdown', 2);
const fire = (manual = false, heavy = false) => fired.push(heavy);
tick(firing.controls, fire, .5, false, false);
assert.deepEqual(fired, [false], 'Held power waits for full recharge');
fired.length = 0;
tick(firing.controls, fire, 1, false, false);
assert.deepEqual(fired, [false, true], 'Both controls feed the existing simulation fire/cooldown logic');
fired.length = 0;
tick(firing.controls, fire, 1, true, false);
tick(firing.controls, fire, 1, false, true);
assert.deepEqual(fired, [], 'No held fire while paused or after round end');
for (const name of ['startCrash', 'finishRound', 'restartRound', 'togglePause']) {
  const start = source.indexOf(`      function ${name}(`);
  const end = source.indexOf('\n      function ', start + 1);
  assert.ok(source.slice(start, end).includes('touchControls.reset();'), `${name} clears held touch input immediately`);
}
assert.ok(source.includes("(event.pointerType === 'touch' && !celebrating) || event.target.closest('#touch-controls')"));
assert.match(readFileSync(new URL('../scripts/deploy.sh', import.meta.url), 'utf8'), /touch-controls\.js/);
console.log('PASS full-range aspect-independent touch steering/banking, circular half-range aim, low landscape controls, release/reset, multi-touch and held-fire integration');
