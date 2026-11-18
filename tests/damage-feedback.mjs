// Run from the project root: node tests/damage-feedback.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../assets/vendor/three.module.js';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing source section: ${start}`);
  return source.slice(from, to);
};
const hitStyle = section('    #shield-hit {', '    #shield-hit[hidden]');
assert.match(hitStyle, /background: #e51b2b26/);
assert.match(hitStyle, /border: 5px solid #ff3b4b/);
assert.match(hitStyle, /pointer-events: none/, 'Damage feedback never blocks controls');
const makeHit = (reducedMotion = false) => new Function('THREE', 'reducedMotion', `
  const camera = new THREE.PerspectiveCamera(), flightVelocity = new THREE.Vector2();
  const shieldHit = {hidden: true, style: {}};
  let paused = false, roundEnded = false, crashing = false, shield = 100, shieldHitTime = 0, shieldHitStrength = 1, speed = 400, shake = 0;
  const updateShield = () => {}, showFeedback = () => {}, playSound = () => {}, t = key => key;
  const startCrash = () => { crashing = true; };
  ${section('      function collideWith(', '      const successBurst =')}
  function render() {
    ${section('        shieldHit.hidden = shieldHitTime === 0;', '        renderShieldHud();')}
  }
  return {
    hit(object) { collideWith(object); render(); },
    tick(dt) {
      ${section('        if ((!paused || crashing) && shieldHitTime > 0)', '        updateShieldAnimation(dt);')}
      render();
    },
    pause(value) { paused = value; },
    state: () => ({shield, time: shieldHitTime, hidden: shieldHit.hidden, opacity: Number(shieldHit.style.opacity)})
  };
`)(THREE, reducedMotion);

for (const reduced of [false, true]) for (const userData of [
  {type: {name: 'INTERCEPTOR'}}, {type: {name: 'NOVA SAUCER'}}, {type: {name: 'TITAN CARRIER'}},
  {type: {capital: true}}, ...[1, 2, 3].map(asteroidTier => ({type: {asteroid: true}, asteroidTier})),
  {enemyBolt: true}, {} // A rock fragment has no ship type.
]) {
  const game = makeHit(reduced), object = new THREE.Object3D();
  object.userData = structuredClone(userData); object.position.set(10, 5, -10); object.scale.setScalar(2);
  game.hit(object);
  const first = game.state();
  assert.ok(first.shield < 100 && first.shield > 0);
  assert.equal(first.hidden, false); assert.equal(first.time, .55);
  const strength = .7 + .3 * Math.min(1, (100 - first.shield) / 50);
  assert.ok(Math.abs(first.opacity - strength * (reduced ? .35 : 1)) < 1e-9,
    'Flash intensity follows damage, with a visible floor and a full-strength cap');
  assert.ok(first.opacity >= .7 * (reduced ? .35 : 1), 'Even light hits keep the elevated baseline');
  if (userData.type?.name === 'INTERCEPTOR') assert.ok(Math.abs(first.opacity - .88 * (reduced ? .35 : 1)) < 1e-9,
    'An Interceptor collision now gives a substantial 88% red flash');
  game.tick(.2); const faded = game.state();
  assert.ok(faded.opacity > 0 && faded.opacity < first.opacity, 'Damage flash fades smoothly');
  game.hit(object); assert.deepEqual(game.state(), faded, 'The same contact cannot repeatedly flash');
  game.pause(true); game.tick(3); assert.deepEqual(game.state(), faded, 'Normal pause freezes damage feedback');
  game.pause(false); game.tick(.36);
  assert.equal(game.state().hidden, true); assert.equal(game.state().opacity, 0);
}
for (const [start, end] of [
  ['      function resolveFlightRing(', '      function updateFlightRing('],
  ['      function constrainFlightToBoundary(', '      function updateFlightBoundary(']
]) {
  assert.match(section(start, end), /shieldHitTime = \.55; shieldHit.hidden = false/, 'Checkpoint penalties and boundary contacts share the red flash');
  assert.match(section(start, end), /shieldHitStrength = \.76/, 'Ten-point damage has the same scaled intensity on both paths');
}
for (const reduced of [false, true]) {
  const strengths = [1, 2, 3].map(asteroidTier => {
    const game = makeHit(reduced), object = new THREE.Object3D();
    object.userData = {type: {asteroid: true}, asteroidTier};
    game.hit(object); return game.state().opacity;
  });
  assert.ok(strengths[0] < strengths[1] && strengths[1] < strengths[2], 'Larger asteroid hits feel progressively stronger');
  assert.ok(Math.abs(strengths[2] - (reduced ? .35 : 1)) < 1e-9, 'Large hits retain the previous maximum');
  const game = makeHit(reduced), heavy = new THREE.Object3D(), light = new THREE.Object3D();
  heavy.userData = {type: {asteroid: true}, asteroidTier: 3}; light.userData = {enemyBolt: true};
  game.hit(heavy); game.tick(.1); game.hit(light);
  assert.equal(game.state().time, .55, 'A fresh hit restarts the fade');
  assert.ok(Math.abs(game.state().opacity - .772 * (reduced ? .35 : 1)) < 1e-9, 'A later light hit does not inherit the heavy-hit intensity');
}
const tint = new Function('crashTime', 'reducedMotion', 'crashing', 'danger', 'paused', 'roundEnded', 'celebrating = false', `
  const dangerVignette = {style: {}};
  ${section('        const crashTint =', '        sound.setAlarm(danger')}
  return dangerVignette.style.opacity;
`);
for (const reduced of [false, true]) {
  const at = time => tint(time, reduced, true, false, true, false);
  assert.equal(at(0), 0);
  assert.ok(at(.2) < at(.5), 'Red aftermath builds as the opening fireball clears');
  assert.equal(at(.5), reduced ? .3 : .7);
  assert.ok(at(1.5) < at(.8)); assert.equal(at(2), 0); assert.equal(at(3), 0);
  assert.equal(tint(0, reduced, false, true, false, false), .4, 'Predictive warning strength stays unchanged');
  for (const time of [2, 5, 60]) {
    assert.equal(tint(time, reduced, false, false, true, true), 1, 'Defeat keeps its static dark-red tint throughout the result drift');
  }
  assert.equal(tint(2, reduced, false, false, false, true, true), 0, 'Victory does not get the defeat tint');
  assert.equal(tint(0, reduced, false, false, false, false), 0, 'Normal flight has no lingering defeat tint');
}
assert.match(source, /body\.defeated #danger-vignette \{ background: #320a1429; box-shadow: inset 0 0 140px #18030b4d; \}/);
assert.match(section('    #danger-vignette {', '    body.defeated #danger-vignette'), /z-index: 2/);
assert.match(source, /#round-end \{ position: fixed; z-index: 4;/, 'The result panel sits above the scene tint');
assert.match(section('      function restartRound(', '      function updateCapitalShip('), /classList.remove\('celebrating', 'defeated'\)/, 'Retry and new run remove defeat styling');
console.log('PASS scaled red hit flashes, fade/pause/reduced motion, crash aftermath and persistent scene-only defeat tint with victory/restart isolation');
