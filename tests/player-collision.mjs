// Run from the project root: node tests/player-collision.mjs
import { readFileSync } from 'node:fs';
import { advanceEnemyBolts } from '../src/fleet/capital-ship.js';
import { createPlayerCollision } from '../src/flight/player-collision.js';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const THREE = await import(new URL('assets/vendor/three.module.js', root));
const source = readFileSync(new URL('src/main.js', root), 'utf8');
function makeGame() {
  const camera = new THREE.PerspectiveCamera(), scene = new THREE.Scene();
  const collision = createPlayerCollision(camera.position), enemyBolts = [], hits = [];
  const flight = { scene, worldStep: new THREE.Vector3(), flightMotion: new THREE.Vector3(),
    pathHitsPlayer: collision.pathHitsPlayer, onHit: object => { hits.push(object); return false; } };
  return { camera, scene, ...collision, enemyBolts, hits, updateEnemyBolts: dt => advanceEnemyBolts(enemyBolts, dt, flight) };
}

function box(width = 2, height = 2, depth = 2) {
  const geometry = new THREE.BoxGeometry(width, height, depth).toNonIndexed();
  geometry.computeBoundingBox();
  const vertices = geometry.attributes.position, triangles = [];
  for (let i = 0; i < vertices.count; i += 3) {
    triangles.push(new THREE.Triangle(...[0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(vertices, i + offset))));
  }
  const object = new THREE.Object3D(), bounds = geometry.boundingBox.clone();
  object.userData = {collisionBox: bounds, collisionParts: [{bounds, triangles}]};
  geometry.dispose();
  return object;
}

const game = makeGame(), rock = box();
const bounds = new THREE.Box3();
for (const probe of game.playerHull) {
  bounds.expandByPoint(probe.center.clone().addScalar(probe.radius));
  bounds.expandByPoint(probe.center.clone().addScalar(-probe.radius));
  assert.ok(probe.center.length() + probe.radius <= game.playerHullRadius, 'Near-pass clearance must cover the whole spacecraft');
}
assert.deepEqual(bounds.getSize(new THREE.Vector3()).toArray(), [40, 20, 43]);
for (const [x, y] of [[-19, 0], [19, 0], [0, -10], [0, 10]]) {
  const previous = new THREE.Vector3(x, y, -100), next = new THREE.Vector3(x, y, 100);
  assert.equal(game.crossesHull(rock, previous, next), false, 'These contacts must miss the old four-unit camera sphere');
  assert.equal(game.crossesPlayer(rock, previous, next), true, 'Both wings and the upper/lower body must collide');
}
for (const [x, y, expected] of [[0, 0, true], [-23, 0, false], [23, 0, false], [0, 12, false],
  [0, -12, false], [20, 9, false], [12, 12, false]]) {
  assert.equal(game.crossesPlayer(rock, new THREE.Vector3(x, y, -100), new THREE.Vector3(x, y, 100)), expected,
    `Rounded body/wing footprint at ${x},${y}; do not use an oversized solid box`);
}
for (const [z, expected] of [[-25, true], [-28, false], [16, true], [19, false]]) {
  const position = new THREE.Vector3(0, 0, z);
  assert.equal(game.crossesPlayer(rock, position, position), expected, 'The spacecraft has a nose and tail, not just a flat cross-section');
}
assert.equal(game.crossesHull(rock, new THREE.Vector3(19, 0, -100), new THREE.Vector3(19, 0, 100), 0, game.camera.position, 20), true,
  'Explicit spherical probes for NPC/asteroid collisions must remain independent of the player hull');
console.log('PASS Interceptor-sized wings, upper/lower body, nose/tail, clear corners and unchanged NPC sphere probes');

for (const rotation of [[0, 0, 0], [.5, -.7, 0], [.3, .4, .7], [0, 0, Math.PI / 2]]) {
  game.playerHullRotation.setFromEuler(new THREE.Euler(...rotation, 'YXZ'));
  rock.quaternion.copy(game.playerHullRotation);
  game.camera.position.set(40, -20, 15);
  for (const [x, y, expected] of [[-19, 0, true], [19, 0, true], [0, 10, true], [0, -10, true], [23, 0, false], [0, 12, false]]) {
    const previous = new THREE.Vector3(x, y, -100).applyQuaternion(game.playerHullRotation).add(game.camera.position);
    const next = new THREE.Vector3(x, y, 100).applyQuaternion(game.playerHullRotation).add(game.camera.position);
    assert.equal(game.crossesPlayer(rock, previous, next), expected, 'The full shape follows pitch/yaw/bank and camera translation');
  }
}
game.camera.position.set(0, 0, 0); rock.quaternion.identity();
const above = new THREE.Vector3(0, 18, -100), beyond = new THREE.Vector3(0, 18, 100);
game.playerHullRotation.identity();
assert.equal(game.crossesPlayer(rock, above, beyond), false);
game.playerHullRotation.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
assert.equal(game.crossesPlayer(rock, above, beyond), true, 'Banking turns the wings into vertical collision area');
const copyAt = source.indexOf('playerHullRotation.copy(camera.quaternion);');
assert.ok(copyAt > 0 && copyAt < source.indexOf('if ((!paused || crashing) && shake > 0)'), 'Capture hull orientation before cosmetic shake');
console.log('PASS translated/rotated hull, banking wing contacts and shake-independent orientation');

game.playerHullRotation.identity();
for (const fps of [5, 30, 60, 144]) for (const x of [-19, 0, 19, 24]) {
  let previous = new THREE.Vector3(x, 0, -100), hit = false;
  for (let frame = 0; frame < Math.ceil(fps * .2); frame++) {
    const next = previous.clone().add(new THREE.Vector3(0, 0, 1500 / fps));
    hit ||= game.crossesPlayer(rock, previous, next);
    previous = next;
  }
  assert.equal(hit, Math.abs(x) <= 19, `Swept wing contacts must not tunnel at ${fps} FPS`);
}
const warningStart = new THREE.Vector3(24, 0, -100), warningEnd = new THREE.Vector3(24, 0, 100);
assert.equal(game.crossesPlayer(rock, warningStart, warningEnd), false);
assert.equal(game.crossesPlayer(rock, warningStart, warningEnd, 8), true, 'The danger margin must surround the same wings that take damage');
assert.ok(source.includes('crossesPlayer(ship, previous, ship.position)'));
assert.ok(source.includes('crossesPlayer(ship, ship.position, future, 8)'));
console.log('PASS swept contacts at 5–144 FPS and matching ship/fragment warning and damage shapes');

// Model solid rock surfaces at the narrowest corridor's floor and ceiling, not a fake gameplay barrier.
const wall = box(400, 80, 80);
for (const side of [-1, 1]) {
  const previous = new THREE.Vector3(0, side * 67, -100), next = new THREE.Vector3(0, side * 67, 100);
  for (const [height, hit] of [[0, false], [16, false], [18, true]]) {
    game.camera.position.y = side * height;
    assert.equal(game.crossesPlayer(wall, previous, next), hit,
      'A 54-unit gap must allow centered flight, but not squeezing the upper/lower hull through a wall');
  }
  game.playerHullRotation.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  game.camera.position.y = 0;
  assert.equal(game.crossesPlayer(wall, previous, next), false, 'Even banked wings fit through the middle');
  game.camera.position.y = side * 8;
  assert.equal(game.crossesPlayer(wall, previous, next), true, 'Banked wings require more ceiling/floor clearance');
  game.playerHullRotation.identity();
}
console.log('PASS centered clearance and upper/lower/wing scrapes in the minimum 54-unit corridor');

for (const side of [-1, 1]) {
  const fire = makeGame(), object = new THREE.Group();
  object.position.set(side * 20, 0, -100);
  fire.scene.add(object);
  fire.enemyBolts.push({object, velocity: new THREE.Vector3(0, 0, 12000), age: 0});
  fire.updateEnemyBolts(1 / 60);
  assert.deepEqual(fire.hits, [object], 'Enemy bolts use the wings, not a separate small camera sphere');
  assert.equal(fire.enemyBolts.length, 0); assert.equal(object.parent, null);
  fire.updateEnemyBolts(1 / 60); assert.equal(fire.hits.length, 1);
}
const warning = makeGame(), bolt = new THREE.Group();
bolt.position.set(27, 0, -100);
warning.enemyBolts.push({object: bolt, velocity: new THREE.Vector3(0, 0, 1000), age: 0});
assert.equal(warning.updateEnemyBolts(1 / 60), true, 'Enemy-fire warnings include the full wing margin');
assert.equal(warning.hits.length, 0, 'A warning is not itself an impact');
console.log('PASS actual enemy-laser wing impacts, full-hull warnings and one-hit cleanup');
