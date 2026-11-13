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
  assert.deepEqual(game.aim(), [.5, -0], 'Full deflection maps directly to half the center-to-edge distance');
  assert.ok(game.controls.normalHeld && game.controls.heavyHeld, 'Non-primary thumbs can fire and steer simultaneously');
  assert.equal(game.shots.length, 2);
  assert.ok(game.shots.includes(true) && game.shots.includes(false));
  const joystickId = order.indexOf('joystick') + 1;
  pointer(game.joystick, 'pointermove', 99, 222, 560);
  pointer(game.joystick, 'pointerup', 99);
  assert.deepEqual(game.aim(), [.5, -0], 'Unrelated pointers cannot move or release a held control');
  for (let i = 0; i < 100; i++) pointer(game.joystick, 'pointermove', joystickId, 298, 560);
  assert.deepEqual(game.aim(), [.5, -0], 'Holding or repeated moves never accumulate cursor travel');
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
assert.deepEqual(game.aim(), [2 / 38 * .5, -1 / 38 * .5], 'Even small finger movements map immediately without a dead zone');
assert.equal(game.knob.style.transform, 'translate(2px, 1px)', 'The knob follows finger displacement directly');
pointer(game.joystick, 'pointermove', 1, 279, 560);
assert.deepEqual(game.aim(), [.25, -0], 'Half finger travel maps to exactly half the available cursor range');
assert.equal(game.knob.style.transform, 'translate(19px, 0px)');
pointer(game.joystick, 'pointermove', 1, 266, 560);
assert.deepEqual(game.aim(), [6 / 38 * .5, -0], 'Moving back updates position immediately without smoothing');
pointer(game.joystick, 'pointermove', 1, 260, 560);
assert.deepEqual(game.aim(), [0, -0], 'Only the exact center produces zero input');
for (const direction of [-1, 1]) {
  let previous = 0;
  for (const travel of [.2, .4, .6, .8, 1]) {
    pointer(game.joystick, 'pointermove', 1, 260 + direction * travel * 38, 560);
    const distance = Math.abs(game.aim()[0]);
    assert.ok(distance > previous && distance <= .5, 'Direct aiming never exceeds half range');
    assert.ok(Math.abs(distance - travel * .5) < 1e-10, 'Every deflection maps linearly');
    assert.equal(Math.sign(game.aim()[0]), direction);
    previous = distance;
  }
}
for (const [x, y] of [[1000, 560], [-1000, 560], [260, -1000], [260, 1000], [1000, -1000], [-1000, 1000]]) {
  pointer(game.joystick, 'pointermove', 1, x, y);
  assert.ok(Math.abs(Math.hypot(...game.aim()) - .5) < 1e-10, 'Axis and diagonal overdrags respect the same radial limit');
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
const makeCursor = new Function('innerWidth', 'innerHeight', `
  const THREE = {MathUtils: {clamp: (value, min, max) => Math.max(min, Math.min(max, value))}};
  const mouseAim = {x: .4, y: -.2, set(x, y) { this.x = x; this.y = y; }};
  const target = {copy(aim) { this.x = aim.x; this.y = aim.y; }}, reticle = {style: {}};
  let lastPointerPosition = {clientX: 100, clientY: 100};
  const callbacks = { ${source.slice(callbackStart, callbackEnd)} };
  ${source.slice(source.indexOf('      function steer(event)'), source.indexOf('      // Suppress accidental secondary clicks'))}
  return {move: callbacks.onSteer, mouseAim, target, reticle, lastPointer: () => lastPointerPosition};
`);
const cursor = makeCursor(800, 600);
cursor.move(.5, 0);
assert.deepEqual([cursor.mouseAim.x, cursor.mouseAim.y], [.375, 0], 'Game wiring uses absolute position with aspect-correct scaling');
assert.deepEqual(cursor.reticle.style, {left: '550px', top: '300px'}, 'Full stick travel uses half the distance to the nearest viewport edge');
cursor.move(.5, 0);
assert.deepEqual([cursor.mouseAim.x, cursor.mouseAim.y], [.375, 0], 'Repeated input does not move the cursor farther');
cursor.move(0, 0);
assert.deepEqual([cursor.mouseAim.x, cursor.mouseAim.y], [0, 0], 'Release centers the actual game cursor');
assert.equal(cursor.target.x, cursor.mouseAim.x, 'Flight steering follows the limited cursor position');
assert.equal(cursor.lastPointer(), null, 'Touch movement clears stale mouse coordinates');
for (const [width, height] of [[390, 844], [844, 390], [800, 600], [600, 600]]) {
  const circular = makeCursor(width, height);
  for (const travel of [.25, .5, 1]) for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
    circular.move(Math.cos(angle) * .5 * travel, Math.sin(angle) * .5 * travel);
    const dx = parseFloat(circular.reticle.style.left) - width / 2;
    const dy = parseFloat(circular.reticle.style.top) - height / 2;
    const expectedRadius = Math.min(width, height) / 4 * travel;
    assert.ok(Math.abs(Math.hypot(dx, dy) - expectedRadius) < 1e-9, `${width}×${height}: equal pixel radius in every direction at every deflection`);
  }
}
assert.ok(!source.includes('touchControls.advance('), 'No velocity-based cursor integration remains');
const restart = source.slice(source.indexOf('      function restartRound('), source.indexOf("      document.querySelector('#restart').addEventListener"));
assert.match(restart, /if \(touchMode\) \{\s*lastPointerPosition = null;\s*steer\(\{ clientX: innerWidth \/ 2, clientY: innerHeight \/ 2 \}\);/, 'New levels and retries center the touch cursor');
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
assert.equal((source.match(/body\.touch-device #capital-hud \{/g) || []).length, 1, 'Landscape must not move the boss panel back into the play area');
assert.match(source, /body\.touch-device #capital-health \{ display: block; height: 4px; margin: 0;/, 'Compact boss strip retains its health bar');
assert.match(source, /body\.touch-device #shield-hud \{[^}]*bottom: calc\(24px \+ env\(safe-area-inset-bottom\)\)/);
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
console.log('PASS direct half-range cursor mapping, radial limits, immediate linear finger tracking, release/reset, enlarged orange center and outer button, raised controls, multi-touch and held-fire integration');
