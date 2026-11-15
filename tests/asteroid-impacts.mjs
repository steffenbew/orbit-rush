// Mixed encounters and non-explosive asteroid contact physics.
import assert from 'node:assert/strict';
import {THREE, makeGame, randomState} from './helpers/flight-game.mjs';

const orientations = [], positions = [], fractions = [], styles = new Set();
for (const reduced of [false, true]) for (const level of [1, 2, 4, 5, 6, 7, 9, 12, 20]) {
  const game = makeGame(reduced); game.setLevel(level); game.setupLevelFleet(); game.updateAsteroidShower(0);
  if (level === 1) {
    assert.equal(game.grit.visible, false, 'No formation at the start of level one');
    game.setTime(game.getAsteroidEncounters()[0].prepare); game.updateAsteroidShower(0);
  }
  assert.equal(game.fieldGroups.length, 1, 'A compact formation, not a chain arranged along the flight axis');
  const first = game.fieldGroups[0], plan = game.coursePlan();
  styles.add(first.diffuse);
  if (level === 1) assert.equal(first.diffuse, false, 'Preserve the approved compact introductory field');
  const orientation = game.fieldImpacts[0].drift.clone().normalize();
  if (!reduced) { orientations.push(orientation); positions.push(first.position.clone()); fractions.push(-first.position.z / plan.length); }
  const placement = first.position.clone();
  if (level < 6) assert.equal(game.fieldShower.length, 0);
  else {
    assert.equal(game.fieldShower.length, reduced ? 2 : 4 + game.getAsteroidEncounters()[0].strength * 2);
    assert.ok(game.fieldShower.every(rock => rock.visible && rock.userData.courseVelocity.length() > (reduced ? 20 : 200)));
    assert.ok(first.rocks.every(rock => rock.userData.courseVelocity.lengthSq() === 0), 'Field is initially anchored while the crossing shower already moves');
  }
  game.setupLevelFleet(); game.setTime(game.getAsteroidEncounters()[0].prepare); game.updateAsteroidShower(0);
  assert.deepEqual(game.fieldGroups[0].position, placement);
  assert.ok(game.fieldImpacts[0].drift.clone().normalize().distanceTo(orientation) < 1e-9, 'Retry retains orientation, position and timing');
}
assert.deepEqual([...styles].sort(), [false, true], 'Use both diffuse and directional formations');
assert.ok(orientations.some(v => v.z > .3) && orientations.some(v => v.z < -.3));
assert.ok(orientations.some(v => Math.abs(v.z) < .4), 'Include transverse formations, not only cones pointing along the flight axis');
assert.ok(positions.some(p => p.x < -20) && positions.some(p => p.x > 20));
assert.ok(positions.some(p => p.y < -10) && positions.some(p => p.y > 10));
assert.ok(Math.max(...fractions) - Math.min(...fractions) > .12 && fractions.every(f => Math.abs(f - .5) > .001), 'Arrival depth varies rather than always using the midpoint');
console.log('PASS delayed introduction, random 3D orientations, off-center/depth variation, stable retries and simultaneous showers from level six');

function pair(reduced = false, sizeA = 1.3, sizeB = 3.5, speed = 100) {
  const game = makeGame(reduced); game.setLevel(2); game.setupLevelFleet();
  game.ships.forEach(ship => ship.visible = false);
  const a = game.eventAsteroid(), b = game.eventAsteroid();
  for (const [rock, size] of [[a, sizeA], [b, sizeB]]) {
    rock.scale.setScalar(size); rock.userData.courseVelocity.set(0, 0, 0); rock.position.set(0, 0, -600);
  }
  const distance = (sizeA + sizeB) * a.userData.type.radius;
  a.userData.previousPosition.set(-distance - 5, 0, -600); a.position.set(-distance + 2, 0, -600);
  b.userData.previousPosition.copy(b.position); a.userData.courseVelocity.x = speed;
  game.activeAsteroids.push(a, b);
  return {game, a, b, distance};
}
for (const reduced of [false, true]) {
  const {game, a, b, distance} = pair(reduced, 1.3, 3.5, reduced ? 10 : 100);
  const before = a.userData.courseVelocity.x * a.scale.x ** 3;
  assert.equal(game.collideAsteroids(), 1);
  assert.ok(a.userData.courseVelocity.x < 0 && b.userData.courseVelocity.x > 0, 'Small impactor rebounds and dislodges the larger stationary rock');
  const after = a.userData.courseVelocity.x * a.scale.x ** 3 + b.userData.courseVelocity.x * b.scale.x ** 3;
  assert.ok(Math.abs(after - before) < 1e-7, 'Conserve linear momentum');
  assert.ok(a.position.distanceTo(b.position) >= distance);
  assert.equal(game.collideAsteroids(), 0, 'Separating bodies do not receive another impulse');
  assert.deepEqual(game.explosions, []); assert.deepEqual(game.sounds, []);
  assert.ok(a.visible && b.visible);
}
for (const state of ['setPaused', 'setRoundEnded', 'setCrashing']) {
  const {game, a} = pair(); game[state](true);
  assert.equal(game.collideAsteroids(), 0); assert.equal(a.userData.courseVelocity.x, 100);
}
{
  const {game, a, b} = pair(false, .35, .35, 100);
  a.userData.previousPosition.set(-100, 0, -600); a.position.set(100, 0, -600);
  assert.equal(game.collideAsteroids(), 1, 'Swept contact catches an entire crossed rock between frames');
  assert.ok(a.position.x < b.position.x, 'Resolve the contact on the original side rather than letting bodies tunnel');
}
{
  const {game, a, b} = pair();
  a.userData.courseVelocity.set(0, 0, 0); a.position.copy(a.userData.previousPosition).add(new THREE.Vector3(10, 20, 100));
  b.position.copy(b.userData.previousPosition).add(new THREE.Vector3(10, 20, 100));
  assert.equal(game.collideAsteroids(), 0, 'Shared player travel must not impart collision energy to anchored rocks');
}
{
  const {game, a} = pair(false, 3.5);
  for (let i = 0; i < 11; i++) game.eventAsteroid().userData.impactFragment = true;
  assert.equal(game.fractureImpactAsteroid(a, new THREE.Vector3(1, 0, 0)), false, 'An unsplit body needs room for both resulting pieces');
  game.showerPool.find(rock => rock.userData.impactFragment).visible = false;
  assert.equal(game.fractureImpactAsteroid(a, new THREE.Vector3(1, 0, 0)), true);
  assert.equal(game.showerPool.filter(rock => rock.visible && rock.userData.impactFragment).length, 12);
}
let fractures = 0;
for (let seed = 1; seed <= 40; seed++) {
  const {game, a, b} = pair(false, 1.3, 3.5, 350); randomState.seed = seed * 871;
  const volume = a.scale.x ** 3 + b.scale.x ** 3;
  game.collideAsteroids();
  const visible = game.showerPool.filter(rock => rock.visible);
  assert.ok(visible.length >= 2 && visible.length <= 3);
  assert.ok(Math.abs(visible.reduce((sum, rock) => sum + rock.scale.x ** 3, 0) - volume) < 1e-7);
  assert.deepEqual(game.explosions, []); assert.deepEqual(game.sounds, []);
  if (visible.length === 3) {
    fractures++;
    const pieces = visible.filter(rock => rock.userData.impactFragment);
    assert.equal(pieces.length, 2); assert.ok(pieces.every(rock => rock.scale.x < 1.3 && rock.userData.health > 0));
    assert.equal(game.fractureImpactAsteroid(pieces[0], new THREE.Vector3(1, 0, 0)), false, 'No immediate chain fragmentation');
  }
}
assert.ok(fractures > 0 && fractures < 30, 'Hard contacts sometimes fracture, rather than always splitting or exploding');
console.log('PASS momentum transfer, rebound, swept contacts, lifecycle guards and occasional volume-conserving fracture without explosions');

for (const reduced of [false, true]) {
  const game = makeGame(reduced); game.setLevel(6); game.setupLevelFleet(); game.updateAsteroidShower(0);
  const piece = game.showerRocks.find(rock => rock.size > 1), parent = game.eventAsteroid();
  const origin = game.coursePlan().origin, center = piece.position.clone().add(origin);
  parent.scale.setScalar(1.3); parent.position.copy(center).add(new THREE.Vector3(-2, 0, 0));
  parent.userData.previousPosition.copy(center).add(new THREE.Vector3(-100, 0, 0));
  parent.userData.courseVelocity.set(150, 0, 0); game.activeAsteroids.push(parent);
  assert.ok(game.collideAsteroidsWithField() > 0);
  assert.ok(game.showerRocks.some(rock => rock.destroyed));
  const fragment = game.particles.find(p => p.kind === 'rock');
  assert.ok(fragment && Math.hypot(fragment.vx, fragment.vy, fragment.vz) > 0);
  assert.equal(fragment.object.geometry, game.grit.geometry, 'Detach the actual visible fragment, not a different proxy shape');
  assert.equal(fragment.worldFactor, .85); assert.equal(fragment.object.userData.collisionParts.length, 1);
  assert.deepEqual(game.explosions, []); assert.deepEqual(game.sounds, []);
}
for (const reduced of [false, true]) for (const level of [6, 8, 11]) for (const fps of [5, 60, 144]) {
  const game = makeGame(reduced); game.setLevel(level); game.setupLevelFleet(); game.updateAsteroidShower(0);
  let contacts = 0;
  for (let frame = 1; frame <= 9 * fps; frame++) {
    game.setTime(frame / fps); game.activeAsteroids.length = 0;
    for (const rock of game.showerPool.filter(rock => rock.visible)) {
      rock.userData.previousPosition.copy(rock.position); game.moveShip(rock, 1 / fps); game.activeAsteroids.push(rock);
    }
    contacts += game.collideAsteroids(); game.collideAsteroidsWithField();
    assert.ok(game.showerPool.every(rock => rock.position.toArray().every(Number.isFinite) && rock.userData.courseVelocity.toArray().every(Number.isFinite)));
  }
  assert.ok(contacts > 0, 'The authored mixed encounter actually produces rock-on-rock contacts');
  assert.ok(game.fieldGroups.flatMap(group => group.rocks).some(rock => rock.userData.courseVelocity.lengthSq() > 0));
  assert.ok(game.showerPool.filter(rock => rock.visible && rock.userData.impactFragment).length <= 12);
  assert.ok(game.particles.length <= 96); assert.deepEqual(game.explosions, []);
}
console.log('PASS moving showers disturb real fields and instanced rubble without explosions, with bounded fragmentation and finite state at 5–144 FPS');
