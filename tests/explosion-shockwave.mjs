// Run from the project root: node tests/explosion-shockwave.mjs
import { activeFlightSource } from './helpers/app-source.mjs';
import * as physics from '../src/flight/physics.js';
import { createCrashMotion } from '../src/flight/crash-motion.js';
import { createExplosions } from '../src/presentation/explosions.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const THREE = await import(new URL('assets/vendor/three.module.js', root));
const source = readFileSync(new URL('src/main.js', root), 'utf8');
const start = source.indexOf('  function applyExplosionShockwave(');
const end = source.indexOf('  function resize()', start);
assert.ok(start >= 0 && end > start);
const math = Object.create(Math);
math.random = () => .5;
const makeGame = () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), flightVelocity = new THREE.Vector2();
  const pilot = new Function('physics', 'camera', 'flightVelocity', `
    let started = true, paused = false, roundEnded = false, crashing = false, speed = 400, shake = 0, flash = 0;
    ${activeFlightSource}
    ${source.slice(start, end)}
    return { applyExplosionShockwave, state: () => ({shake, flash, speed, shield:100, score:123, velocity:flightVelocity.toArray()}),
      reset: () => { shake = flash = 0; flightVelocity.set(0, 0); },
      setMode(mode) { started = mode !== 'intro'; paused = mode === 'paused'; roundEnded = mode === 'result'; crashing = mode === 'crash'; }
    };
  `)(physics, camera, flightVelocity);
  const fx = createExplosions({ scene, camera, glow: new THREE.Texture(), pick: values => values[0],
    random: (a, b) => a === 0 && b === 1 ? math.random() : (a + b) / 2, onBlast: pilot.applyExplosionShockwave });
  let paused = false;
  return { ...pilot, scene, camera, flightVelocity, explode: fx.explode, crashBurst: fx.crashBurst,
    get particles() { return fx.particles; }, shockwaves: fx.shockwaves,
    setMode(mode) { paused = mode === 'paused'; pilot.setMode(mode); },
    tick(dt, movement = new THREE.Vector3(0, 0, paused ? 0 : dt * 100)) {
      camera.updateMatrixWorld(); fx.update(dt, movement, camera, !paused);
    }
  };
};

const direction = new THREE.Vector3(.6, 0, -.8);
const game = makeGame();
let previousShake = Infinity, previousImpulse = Infinity;
for (const distance of [25, 150, 400, 650, 700, 3000]) {
  game.reset();
  game.applyExplosionShockwave(direction.clone().multiplyScalar(distance), 1);
  const state = game.state();
  assert.ok(state.shake <= previousShake);
  assert.ok(game.flightVelocity.length() <= previousImpulse);
  if (distance < 700) {
    assert.ok(state.shake < previousShake && game.flightVelocity.length() < previousImpulse);
    assert.ok(state.velocity[0] < 0, 'Blast on the right must push left');
  } else {
    assert.equal(state.shake, 0);
    assert.equal(state.flash, 0);
    assert.equal(game.flightVelocity.length(), 0);
  }
  assert.equal(state.shield, 100); assert.equal(state.score, 123);
  previousShake = state.shake; previousImpulse = game.flightVelocity.length();
}
console.log('PASS smooth distance falloff, silent distant blasts and no direct damage or score changes');

// Halfway to the 700-unit cutoff: a unit blast has quarter strength and adds to existing drift.
{
  const playerPosition = new THREE.Vector3(100, 50, 20), drift = new THREE.Vector2(8, -3);
  const flight = {playerPosition, speed: 400, drift};
  const origin = playerPosition.clone().add(new THREE.Vector3(210, -280, 0));
  assert.equal(physics.applyBlastImpulse(origin, 1, flight), .25);
  const impulse = 35;
  assert.ok(drift.distanceTo(new THREE.Vector2(8 - .6 * impulse, -3 + .8 * impulse)) < 1e-9);
  const before = drift.clone();
  assert.equal(physics.applyBlastImpulse(playerPosition.clone().addScalar(700), 1, flight), 0);
  assert.ok(drift.equals(before), 'An out-of-range blast leaves existing drift intact');
}
game.reset(); game.applyExplosionShockwave(game.camera.position, 1);
assert.ok(Object.values(game.state()).flat().every(Number.isFinite), 'Coincident blast must not produce NaNs');
assert.equal(game.state().shake, 2.2, 'A centered close explosion must still deliver a strong camera kick');
console.log('PASS directional impulses, translated camera and point-blank centered blast');

const close = new THREE.Vector3(30, 0, -40);
game.reset(); game.applyExplosionShockwave(close, .1);
const small = game.state().shake;
game.reset(); game.applyExplosionShockwave(close, 1);
const normal = game.state();
assert.ok(normal.shake > small);
for (let i = 0; i < 100; i++) game.applyExplosionShockwave(close, 10);
assert.ok(game.state().shake <= 2.2 && game.state().flash <= .3);
assert.ok(game.flightVelocity.length() <= 400 * 1.6 + .001);
const strongest = game.state().shake;
game.applyExplosionShockwave(new THREE.Vector3(0, 0, -600), 1);
assert.equal(game.state().shake, strongest, 'A distant blast must not cancel a stronger existing kick');
console.log('PASS size scaling, bounded chain reactions and strongest-camera-kick preservation');

for (const mode of ['intro', 'paused', 'result', 'crash']) {
  game.reset(); game.setMode(mode); const before = game.state();
  game.applyExplosionShockwave(close, 1);
  assert.deepEqual(game.state(), before, mode + ' must not receive new shockwave impulses');
}
game.setMode('playing');
console.log('PASS pause, intro, results and player-crash isolation');

game.reset(); game.explode(close, 12);
assert.equal(game.state().shake, 0, 'Ordinary hit sparks are not blast waves');
game.reset(); game.explode(close, 65, true);
assert.equal(game.state().shake, 0, 'The separate player-crash sequence owns its feedback');
game.reset(); game.explode(close, 65, false, false, 1, false);
assert.ok(game.state().shake > 0 && game.flightVelocity.length() > 0, 'Nearby environmental destruction must be felt');
assert.equal(game.state().flash, 0, 'Environmental accidents retain their no-screen-flash policy');
game.reset(); game.explode(close, 18, false, true, 1, false);
assert.ok(game.state().shake > 0, 'Small asteroid accident bursts also carry a shockwave');
game.reset(); game.explode(new THREE.Vector3(0, 0, -2000));
assert.equal(game.state().shake, 0); assert.equal(game.state().flash, 0);
game.reset(); game.explode(close);
assert.ok(game.state().shake > 0 && game.state().flash > 0);
console.log('PASS actual explosion wiring: destructions and asteroid accidents, not hit sparks or crash bursts');

{
  const crash = makeGame();
  crash.setMode('crash');
  const origin = new THREE.Vector3(7, -4, -22);
  crash.explode(origin, 120, true);
  assert.equal(crash.shockwaves.length, 1, 'The crash starts with a hull blast');
  const wave = crash.shockwaves[0];
  assert.equal(wave.life, .8);
  assert.equal(wave.size, 1.8, 'Fatal-impact blast uses the full hull effect');
  assert.equal(crash.particles.length, 127, 'Crash particle/debris budget stays bounded');
  assert.equal(crash.state().shield, 100); assert.equal(crash.state().score, 123);
  assert.equal(crash.flightVelocity.length(), 0, 'The opening blast cannot apply a second gameplay impulse');
  crash.tick(.1);
  assert.ok(wave.fireball.position.equals(origin), 'The hull blast stays visible despite forward travel');
  const firstSize = wave.fireball.scale.x, firstOpacity = wave.fireball.material.opacity;
  crash.tick(.15);
  assert.ok(wave.fireball.material.opacity < firstOpacity, 'The fireball fades without repeated flashes');
  assert.ok(wave.fireball.scale.x > firstSize && firstSize > 60, 'The opening fireball fills much of the view');
  crash.tick(.3);
  assert.equal(wave.fireball.material.opacity, 0, 'Fire clears into drifting debris within about half a second');
  let disposed = 0;
  wave.ring.material.addEventListener('dispose', () => disposed++);
  wave.fireball.material.addEventListener('dispose', () => disposed++);
  crash.tick(.3);
  assert.equal(crash.shockwaves.length, 0); assert.equal(disposed, 2, 'The whole blast is cleaned up before the result screen');
}
console.log('PASS brief moving-cockpit crash blast, expanding fireball, no extra damage and timely cleanup');

// Drive real particle movement/cleanup with the same coast-down as the crash flight.
function makeDrift(speed) {
  const flightMotion = new THREE.Vector3();
  const drift = createCrashMotion({ flightMotion, flightVelocity: new THREE.Vector2(),
    flightViewOffset: new THREE.Vector2(), flightDirection: new THREE.Vector3(),
    flightTilt: new THREE.Vector3(), flightOrientation: new THREE.Euler(0, 0, 0, 'YXZ') });
  drift.begin(speed, new THREE.Vector3(3, -1, -22));
  return dt => { speed = drift.advance(dt, speed); return flightMotion.clone().multiplyScalar(-dt); };
}
for (const speed of [800, 1500, 2500, 5000]) {
  const crash = makeGame(), drift = makeDrift(speed);
  crash.setMode('crash'); crash.crashBurst(new THREE.Vector3(0, 0, -22), new THREE.Vector3(0, 0, -speed));
  const fragments = crash.particles.filter(p => p.kind === 'debris');
  assert.ok(fragments.every(p => Math.abs(p.vz + speed) <= 230), 'Only the small ejection speed differs from inherited flight velocity');
  // Remove random ejection spread to isolate inherited momentum from the coast-down.
  fragments.forEach(p => { p.vx = p.vy = 0; p.vz = -speed; });
  for (let step = 0; step < 36; step++) crash.tick(1 / 60, drift(1 / 60));
  assert.ok(fragments.every(p => crash.particles.includes(p)),
    'At ' + speed + ' units/s the fragments survive the opening blast instead of crossing the cleanup plane');
  for (let step = 0; step < 96; step++) crash.tick(1 / 60, drift(1 / 60));
  assert.equal(crash.particles.length, 0, 'Matching momentum must not bypass ordinary lifetime cleanup');
}
console.log('PASS actual crash-debris movement and cleanup at 800–5000 units/s, with full inherited momentum');

const distant = new THREE.Vector3(0, 0, -2500);
const previousCapital = makeGame(); previousCapital.explode(distant, 65, false, false, 2.5);
for (const roll of [.001, .5, .999]) {
  math.random = () => roll;
  const capital = makeGame(); capital.explode(distant, 65, false, false, 2.5, true, true);
  const wave = capital.shockwaves[0];
  assert.equal(wave.size, previousCapital.shockwaves[0].size * 3.2, 'The giant finale must be guaranteed, not a rare roll');
  assert.equal(wave.life, 2.6); assert.equal(previousCapital.shockwaves[0].life, 1.1);
  assert.equal(wave.ring.geometry.parameters.innerRadius, .97, 'A thin shock front must not look like a solid portal');
  assert.equal(capital.particles.filter(p => p.kind !== 'debris').length, 180);
  assert.equal(capital.particles.filter(p => p.kind === 'debris').length, 48);
  assert.equal(capital.scene.children.length, 230, 'A single finale has a fixed object budget');
  assert.equal(wave.fireball.material.fog, false); assert.equal(wave.ring.material.fog, false);
  assert.ok(capital.particles.filter(p => p.kind === 'fire' || p.kind === 'spark').every(p => !p.object.material.fog),
    'The luminous blast must remain legible at capital-ship fighting distances');
  assert.ok(capital.particles.every(p => p.kind !== 'rock'), 'The victory debris must not introduce damaging fragments');
  assert.equal(capital.state().shield, 100); assert.equal(capital.state().score, 123);
  assert.equal(capital.state().shake, 0); assert.equal(capital.state().flash, 0);
  capital.tick(.6);
  assert.ok(wave.fireball.scale.x > 800 && wave.ring.scale.x * 2 > 900, 'The blast must visibly exceed the 700-unit hull');
  const age = wave.age, position = wave.fireball.position.clone(), particleAges = capital.particles.map(p => p.age);
  capital.setMode('paused'); capital.tick(1);
  assert.equal(wave.age, age); assert.ok(wave.fireball.position.equals(position));
  assert.deepEqual(capital.particles.map(p => p.age), particleAges);
  capital.setMode('playing'); capital.tick(.6);
  assert.ok(capital.shockwaves.includes(wave) && wave.fireball.material.opacity > 0, 'The boss fireball must outlive a normal blast');
  let disposed = 0;
  for (const object of capital.scene.children) object.material.addEventListener('dispose', () => disposed++);
  const remaining = capital.scene.children.length;
  capital.tick(3);
  assert.equal(capital.shockwaves.length, 0); assert.equal(capital.particles.length, 0);
  assert.equal(capital.scene.children.length, 0); assert.equal(disposed, remaining, 'Clean up all private effect materials');
}
math.random = () => .5;
previousCapital.tick(1.2); assert.equal(previousCapital.shockwaves.length, 0, 'Normal explosion timing must remain unchanged');
console.log('PASS guaranteed oversized capital finale, long-lived fireball, bounded particles/debris, pause and disposal');

const fullCapital = makeGame(); fullCapital.explode(close, 65, false, false, 2.5, true, true);
assert.ok(fullCapital.state().shake <= 2.2 && fullCapital.state().flash <= .3);
assert.ok(fullCapital.flightVelocity.length() <= 400 * 1.6);
const accident = makeGame(); accident.explode(close, 65, false, false, 2.5, false, true);
assert.equal(accident.state().flash, 0); assert.equal(accident.shockwaves[0].size, fullCapital.shockwaves[0].size);
console.log('PASS Boss finale, unchanged feedback limits and no environmental screen flash');

const hitStart = source.indexOf('  function hitShipWithLaser(');
const hitEnd = source.indexOf('  function updateFlightEffects(', hitStart);
assert.ok(hitStart >= 0 && hitEnd > hitStart);
const applyLaserHit = new Function('hit', 'rocket', `
  let hitMarker = 0;
  const effects = [], awards = [], sounds = [], shatters = [];
  const explode = (...args) => effects.push(args), award = ship => awards.push(ship);
  const playSound = (...args) => sounds.push(args), updateShipHitFlash = () => {};
  const shatterAsteroid = ship => shatters.push(ship), queueShip = ship => {ship.visible = false;};
  ${source.slice(hitStart, hitEnd)}
  hitShipWithLaser(hit, true, rocket.damage, rocket.object.position);
  return {effects, awards, sounds, shatters};
`);
const capitalTarget = {position: distant, scale: {x: 6}, visible: true, userData: {health: 30, type: {capital: true}}};
const heavyHit = {damage: 3, object: {position: distant}};
const spark = applyLaserHit(capitalTarget, heavyHit);
assert.equal(capitalTarget.userData.health, 27); assert.equal(capitalTarget.visible, true);
assert.equal(spark.effects.length, 1); assert.equal(spark.effects[0][1], 12); assert.equal(spark.awards.length, 0);
capitalTarget.userData.health = 3;
const kill = applyLaserHit(capitalTarget, heavyHit);
assert.equal(kill.effects.length, 1); assert.equal(kill.effects[0][6], true);
assert.equal(kill.awards.length, 1); assert.equal(kill.shatters.length, 0); assert.equal(capitalTarget.visible, false);
console.log('PASS actual laser-hit wiring: sparks before death, one giant finale and one score award on destruction');
