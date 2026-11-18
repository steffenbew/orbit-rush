// Run from the project root: node tests/crash-flight.mjs
import { createCrashMotion } from '../src/flight/crash-motion.js';
import { livesAfterImpact } from '../src/run/progression.js';
import { createSimulationClock } from '../src/flight/simulation-clock.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../assets/vendor/three.module.js';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing source section: ${start}`);
  return source.slice(from, to);
};
const makeCrash = (reducedMotion = false, side = 1) => new Function('createCrashMotion', 'createSimulationClock', 'livesAfterImpact', 'THREE', 'reducedMotion', 'side', `
  const camera = new THREE.PerspectiveCamera(), scene = new THREE.Scene();
  const flightTilt = new THREE.Vector3(), flightOrientation = new THREE.Euler(0, 0, 0, 'YXZ');
  const flightViewOffset = new THREE.Vector2();
  const flightVelocity = new THREE.Vector2(), flightMotion = new THREE.Vector3(0, 0, reducedMotion ? -40 : -800);
  const flightDirection = new THREE.Vector3(0, 0, -1), worldStep = new THREE.Vector3(), distance = new THREE.Vector3();
  ${section('  const crashMotion =', '  let shieldHitTime =')}
  let speed = -flightMotion.z, crashing = false, crashDrifting = false, crashTime = 0;
  let started = true, paused = false, roundEnded = false, retries = 3, shieldHitTime = 0, shieldHitStrength = 1;
  let flash = 0, shake = 0, results = 0;
  const elements = new Map(), document = {hidden: false, querySelector(key) {
    if (!elements.has(key)) elements.set(key, {hidden: false, textContent: '', classList: {add() {}, remove() {}}});
    return elements.get(key);
  }};
  const controls = {reset() {}}, pauseMenu = {open: false}, showerWarning = {}, repair = {hide() {}};
  const shieldHit = {}, capitalHud = {}, flightPath = {}, collisionAlert = {}, feedback = {classList: {remove() {}}};
  const sound = {setAlarm() {}, failures: 0, playEngineFailure() { this.failures++; }}, particles = [], rockets = [new THREE.Object3D()];
  const projectiles = { clear() { rockets.length = 0; } };
  const updateShield = () => {}, updateRetries = () => {}, clearEnemyBolts = () => {}, renderRoundClock = () => {};
  const sounds = [], bursts = [];
  const clearTargetLock = () => {}, syncMusic = () => {}, playSound = (...args) => sounds.push(args), t = key => key;
  const effects = { crashBurst(impact, motion) { bursts.push([impact, reducedMotion ? 12 : 120, true]); particles.push({vx: motion.x, vy: motion.y, vz: motion.z}); } };
  const finishRound = () => { results++; crashing = false; roundEnded = true; };
  const target = new THREE.Vector2(), flightTurn = new THREE.Vector2(), flightView = {reset() {}};
  const dangerVignette = {style: {}, classList: {remove() {}}};
  ${section('  function resetPlayerFlight()', '  function resetPlayerWeapons()')}
  const clock = createSimulationClock(updateSimulation, () => document.hidden || (paused && !crashDrifting));
  ${section('  function startCrash(', '  function finishRound(')}
  function updateSimulation(dt) {
    ${section('    if (crashing && !document.hidden) {', '    updateFlightTutorial();')}
    ${section('    if ((!paused || crashing) && shieldHitTime > 0)', '    updateShieldAnimation(dt);')}
    updateCrashFlight(dt);
    worldStep.copy(flightMotion).multiplyScalar(paused && !crashDrifting ? 0 : -dt);
    distance.add(worldStep);
  }
  const object = new THREE.Object3D(); object.position.set(side * 20, 5, -10);
  const flightBoundary = new THREE.Object3D(); flightBoundary.position.copy(object.position);
  return {
    resetPlayerFlight,
    crash(cause = 'ship') {
      object.userData = cause === 'checkpoint' ? {flightRing: true} : cause === 'laser' ? {enemyBolt: true}
        : cause === 'asteroid' ? {type: {asteroid: true}} : cause === 'ship' ? {type: {name: 'INTERCEPTOR'}} : {};
      startCrash(cause === 'boundary' ? flightBoundary : object);
    }, frame: clock.advance, particles, rockets, sounds, bursts, sound,
    setFlashStrength: value => {shieldHitStrength = value;},
    setFlight({pitch = 0, yaw = 0, bank = 0, velocity = speed, offsetX = 0, offsetY = 0, hitX = side * 20, hitY = 5}) {
      speed = velocity; flightOrientation.set(pitch, yaw, 0, 'YXZ');
      flightViewOffset.set(offsetX, offsetY); flightTilt.set(pitch + offsetX, yaw + offsetY, bank);
      camera.rotation.set(flightTilt.x, flightTilt.y, flightTilt.z, 'YXZ'); camera.updateMatrixWorld();
      flightMotion.set(0, 0, -speed).applyEuler(flightOrientation);
      object.position.set(hitX, hitY, -10).applyMatrix4(camera.matrixWorld);
      flightBoundary.position.copy(object.position);
    },
    get cameraRotation() { return camera.quaternion.clone(); },
    hide: value => {document.hidden = value; clock.reset();},
    pauseWithoutCrash: () => {paused = true;},
    state: () => ({speed, retries, crashing, crashDrifting, crashTime, roundEnded, paused, results, shieldHitTime, shieldHitStrength, flash, shake,
      label: document.querySelector('#impact-label').textContent,
      tilt: flightTilt.toArray(), motion: flightMotion.toArray(), distance: distance.toArray()})
  };
`)(createCrashMotion, createSimulationClock, livesAfterImpact, THREE, reducedMotion, side);

function advance(game, seconds, fps = 60) {
  for (let i = 0; i < seconds * fps; i++) game.frame(1 / fps);
}
for (const reduced of [false, true]) {
  let reference;
  for (const fps of [5, 30, 60, 144]) {
    const game = makeCrash(reduced);
    const opening = game.state().speed;
    game.setFlashStrength(.48);
    game.crash(); game.crash();
    assert.equal(game.state().shieldHitStrength, 1, 'A fatal hit overrides any previous weaker flash');
    assert.equal(game.state().speed, opening, 'The impact must not zero forward momentum');
    assert.equal(game.state().shieldHitTime, .55, 'Fatal hits get the same immediate red damage flash');
    assert.equal(game.state().retries, 2, 'Repeated impacts consume only one life');
    assert.deepEqual(game.sounds, [['explosion', 3, true]], 'The opening blast plays once, even while gameplay is paused');
    assert.equal(game.bursts.length, 1);
    assert.equal(game.bursts[0][1], reduced ? 12 : 120, 'Reduced motion keeps the opening burst sparse');
    assert.equal(game.rockets.length, 0, 'Existing shots cannot score during the crash');
    assert.equal(game.particles[0].vz, -opening, 'Hull fragments inherit forward momentum');
    advance(game, 1, fps);
    assert.equal(game.state().results, 0);
    assert.equal(game.state().shieldHitTime, 0, 'The damage flash fades during the crash despite paused gameplay');
    assert.ok(game.state().speed > 0 && game.state().speed < opening);
    advance(game, 2, fps);
    const result = game.state();
    assert.equal(result.results, 1); assert.equal(result.roundEnded, true); assert.equal(result.paused, true);
    assert.equal(result.crashDrifting, true); assert.equal(result.retries, 2);
    if (!reference) reference = result;
    else assert.deepEqual(result, reference, 'Crash timing and drift are identical at 5–144 FPS');
    if (reduced) assert.deepEqual(result.tilt, [0, 0, 0], 'Reduced motion has no added tumble');
    else assert.ok(result.tilt[2] > .4 && result.tilt[2] < .65, 'Tumble is noticeable but bounded');
    game.hide(true); const hidden = game.state(); game.frame(20);
    assert.deepEqual(game.state(), hidden, 'Hidden tabs freeze the crash and result drift');
    game.hide(false); advance(game, 10, fps);
    assert.ok(game.state().distance[2] > result.distance[2], 'Drift continues behind results');
    assert.ok(game.state().speed > 0 && game.state().speed < result.speed);
    assert.equal(game.state().results, 1);
    assert.ok(Math.abs(game.state().tilt[2]) < .65, 'The camera settles instead of spinning indefinitely');
  }
}
for (const reduced of [false, true]) {
  for (const cause of ['ship', 'asteroid', 'fragment', 'laser', 'boundary', 'checkpoint']) {
    const game = makeCrash(reduced), depleted = ['boundary', 'checkpoint'].includes(cause);
    game.crash(cause); game.crash(cause);
    assert.equal(game.state().retries, 2, 'Every death cause consumes exactly one life');
    assert.equal(game.sound.failures, 1, 'Every death cause winds the engine down once');
    assert.equal(game.state().shieldHitStrength, 1, 'Every death cause gets the full red damage cue');
    assert.equal(game.bursts.length, 1, 'Every life loss gets the same opening explosion');
    assert.equal(game.bursts[0][1], reduced ? 12 : 120);
    assert.equal(game.particles.length, 1, 'Boundary and checkpoint deaths also emit fire and wreckage');
    assert.equal(game.sounds[0][0], 'explosion');
    assert.equal(game.state().label, depleted ? 'shieldDepleted' : cause === 'laser' ? 'incomingFire' : 'collision');
    assert.equal(game.state().flash, reduced ? 0 : .45);
    assert.equal(game.state().shake, reduced ? 0 : 1);
    advance(game, 1);
    assert.ok(reduced ? game.state().tilt[2] === 0 : Math.abs(game.state().tilt[2]) > .35,
      'All death causes use the same tumble, with reduced motion respected');
    advance(game, 2);
    assert.equal(game.state().results, 1); assert.ok(game.state().speed > 0);
    assert.equal(game.state().crashDrifting, true, 'Both outcomes retain moving results and the same timing');
  }
}
console.log('PASS shared bigger explosion, sound and tumble for every death cause, distinct labels and identical life/timing behavior');
const left = makeCrash(false, -1), right = makeCrash(false, 1);
left.crash(); right.crash(); advance(left, 1); advance(right, 1);
assert.equal(left.state().tilt[2], -right.state().tilt[2], 'Impact side determines tumble direction');
assert.ok(left.state().motion[0] > 0 && right.state().motion[0] < 0, 'The heading veers away from the impact');
for (const bank of [-Math.PI / 2, 0, Math.PI / 2]) for (const pitch of [-.6, 0, .6]) {
  for (const yaw of [-.6, .6]) for (const side of [-1, 1]) for (const vertical of [-1, 1]) {
    let reference;
    for (const fps of [5, 60, 144]) {
      const game = makeCrash(false, side);
      game.setFlight({bank, pitch, yaw, hitY: vertical * 5, velocity: 2500});
      const cockpitInverse = game.cameraRotation.invert();
      const before = game.state().motion;
      game.crash();
      assert.deepEqual([game.particles[0].vx, game.particles[0].vy, game.particles[0].vz], before,
        'Debris inherits the full velocity on all world axes, including banked/angled flight');
      advance(game, 1, fps);
      const after = game.state();
      const localHeading = new THREE.Vector3(...after.motion).normalize().applyQuaternion(cockpitInverse);
      assert.ok(localHeading.x * side < 0, 'Both bank directions must veer away from a left/right cockpit impact');
      assert.ok(localHeading.y * vertical < 0, 'Pitched and yawed flight must also move away from upper/lower impacts');
      if (!reference) reference = after;
      else assert.deepEqual(after, reference, 'Banked crash motion is independent of frame rate');
    }
  }
}
for (const reduced of [false, true]) {
  const game = makeCrash(reduced);
  game.setFlight({pitch: .2, yaw: -.3, bank: .5, offsetX: .04, offsetY: -.03});
  const before = game.state(); game.crash(); advance(game, 1);
  if (reduced) assert.deepEqual(game.state().tilt, before.tilt, 'Reduced motion preserves the existing bank and view offset');
  else assert.ok(game.state().tilt.every(Number.isFinite), 'View offsets remain finite during the quaternion tumble');
}
console.log('PASS ±90° banked impacts, pitched/yawed headings, all hit quadrants, full momentum on every axis and 5–144 FPS');
const pause = makeCrash(); pause.pauseWithoutCrash(); const frozen = pause.state(); advance(pause, 3);
assert.deepEqual(pause.state(), frozen, 'Normal pause still freezes simulation');
assert.doesNotMatch(source, /crash-fire|drawCrashFire|crashFlames/, 'No full-screen fire overlay remains');
const retry = makeCrash();
retry.crash(); advance(retry, .5);
retry.resetPlayerFlight();
assert.equal(retry.state().crashDrifting, false);
assert.deepEqual(retry.state().tilt, [0, 0, 0]);
assert.deepEqual(retry.state().motion, [0, 0, 0]);
const fresh = makeCrash();
for (const flight of [retry, fresh]) {
  flight.setFlight({velocity: 800, hitX: -20});
  flight.crash(); advance(flight, .5);
}
assert.deepEqual(retry.state().motion, fresh.state().motion, 'A new crash after retry has no leftover spin or coast');
assert.deepEqual(retry.state().tilt, fresh.state().tilt);
const finish = section('  function finishRound(', '  function restartRound(');
assert.match(finish, /if \(crashed && !crashDrifting\) speed = 0/);
assert.match(source, /if \(roundEnded && !crashDrifting\) break/);
console.log('PASS directional crash drift, momentum, two-second results, one life, 5–144 FPS, hidden tabs, reduced motion, normal pause and reset wiring');
