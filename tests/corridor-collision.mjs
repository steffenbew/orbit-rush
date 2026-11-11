// Real instanced geometry, spatial queries, visibility and shield damage; no render-only wall proxies.
// Run from the project root: node tests/corridor-collision.mjs
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const THREE = await import(new URL('assets/vendor/three.module.js', root));
const source = readFileSync(new URL('index.html', root), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing source section: ${start}`);
  return source.slice(from, to);
};
function makeGame(seed = 12345, reducedMotion = false) {
  const math = Object.create(Math);
  math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return new Function('THREE', 'Math', 'reducedMotion', `
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(reducedMotion ? 70 : 90, 16 / 9, .03, 14000);
    const flightMotion = new THREE.Vector3(0, 0, -400), flightVelocity = new THREE.Vector2();
    const random = (a, b) => a + Math.random() * (b - a);
    const shipTypes = [null, null, null, {asteroid: true}], fadeAsteroidShader = () => {};
    const document = {querySelector: () => ({})};
    let started = true, paused = false, roundEnded = false, crashing = false, gameTime = 0;
    let shield = 100, shieldHitTime = 0, shake = 0, speed = 400;
    const shieldHit = {hidden: true, style: {}}, hits = [];
    const updateShield = () => hits.push({index: showerRockCollider.userData.instanceIndex, shield});
    const startCrash = () => { crashing = true; }, playSound = () => {};
    ${section('      const inverseRotation =', '      const mouseAim =')}
    ${section('      const showerPool =', '      let spawnQueue =')}
    ${section('      function collideWith(', '      const successBurst =')}
    return {
      camera, scene, flightMotion, playerHullRotation, rocks: showerRocks, cells: showerRockCells,
      grit: showerGrit, origin: showerOrigin, previousOrigin: showerPreviousOrigin, rotation: showerRotation, velocity: showerVelocity,
      hits, prepareShowerRock, nearbyShowerRocks, update: updateShowerRockCollisions, corridorCenter,
      get shield() { return shield; }, setPaused: value => { paused = value; },
      seed: (strength = 2, shape = 0, corridor = true) => {
        showerCorridor = corridor; showerStrength = strength; showerShape = shape;
        showerLength = 3000; showerHalfGap = 27; showerHalfWidth = corridor ? 900 : 650; showerBend = 27 * 1.15;
        showerOrigin.set(0, 0, 0); showerPreviousOrigin.copy(showerOrigin);
        showerRotation.identity(); showerGrit.position.copy(showerOrigin); showerVelocity.set(0, 0, 0);
        shield = 100; hits.length = 0; crashing = paused = false; gameTime = 0;
        seedShowerGrit(); showerGritMaterial.opacity = 1;
      },
      opacity: value => { showerGritMaterial.opacity = value; },
      render: () => {
        showerGrit.position.copy(showerOrigin); showerGrit.quaternion.copy(showerRotation);
        camera.updateMatrixWorld();
        viewFrustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        recordVisibleShowerRocks();
      },
      step: (delta, dt = 1 / 60) => {
        if (!paused) {
          showerPreviousOrigin.copy(showerOrigin); showerOrigin.add(delta); gameTime += dt;
          showerGrit.position.copy(showerOrigin);
        }
        return updateShowerRockCollisions();
      }
    };
  `)(THREE, math, reducedMotion);
}

const game = makeGame(); game.seed();
assert.equal(game.rocks.length, 12000);
assert.equal([...game.cells.values()].reduce((sum, cell) => sum + cell.length, 0), 12000);
assert.equal(game.scene.children.length, 1, 'Do not allocate thousands of extra meshes for collisions');
const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
const vertices = game.grit.geometry.attributes.position;
game.rotation.setFromEuler(new THREE.Euler(.3, -.7, .2)); game.origin.set(50, -20, 100);
for (const record of game.rocks.filter((_, i) => i % 601 === 0)) {
  game.grit.getMatrixAt(record.index, matrix);
  const collider = game.prepareShowerRock(record);
  assert.equal(collider.userData.collisionParts[0].triangles.length, 20);
  for (let i = 0; i < vertices.count; i++) {
    const triangle = collider.userData.collisionParts[0].triangles[Math.floor(i / 3)];
    const actual = [triangle.a, triangle.b, triangle.c][i % 3].clone().applyQuaternion(collider.quaternion).add(collider.position);
    point.fromBufferAttribute(vertices, i).applyMatrix4(matrix).applyQuaternion(game.rotation).add(game.origin);
    assert.ok(actual.distanceTo(point) < .0003, 'Collision triangles must match the visible instance, including non-uniform scale and rotation');
  }
}
const nearby = game.nearbyShowerRocks(new THREE.Vector3(0, 0, -1500), new THREE.Vector3(0, 0, -2100), 51);
assert.ok(nearby.length > 0 && nearby.length < game.rocks.length * .1, 'Only a small nearby subset should need triangle checks');
console.log('PASS all ring instances indexed once, bounded nearby queries and exact rendered collision geometry');

// A large boulder can reach a wing across a cell boundary that the old 17-unit query missed.
const boundary = makeGame(); boundary.seed();
const boulder = boundary.rocks[0], transform = new THREE.Object3D();
transform.position.set(0, 128, -100); transform.scale.set(26, 26, 26 * 1.7);
transform.rotation.x = Math.PI / 2; transform.updateMatrix();
boundary.grit.setMatrixAt(boulder.index, transform.matrix);
boulder.position.copy(transform.position); boulder.seen = true;
boundary.cells.clear(); boundary.cells.set('0,1,-1', [boulder]);
boundary.camera.position.set(0, 75, 0);
boundary.playerHullRotation.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
assert.equal(boundary.nearbyShowerRocks(new THREE.Vector3(0, 75, 0), new THREE.Vector3(0, 75, -500), 26 + 17 + 8).length, 0,
  'This case must lie beyond the old small-gravel query');
assert.equal(boundary.update(), true, 'Warn for a large boulder whose center lies in the adjacent cell');
boundary.step(new THREE.Vector3(0, 0, 200));
assert.equal(boundary.hits.length, 1, 'The enlarged query must include the real boulder/wing impact');
assert.equal(boundary.shield, 85, 'Size variation must not silently change ring collision damage');
console.log('PASS large-boulder broadphase across cell boundaries, real wing contact and unchanged damage');

// Intrinsic stream motion must warn and collide even without any player travel.
const drifting = makeGame(); drifting.seed(); drifting.flightMotion.set(0, 0, 0);
const drifter = drifting.rocks[0];
transform.position.set(80, 0, 0); transform.rotation.set(0, 0, 0); transform.scale.setScalar(10); transform.updateMatrix();
drifting.grit.setMatrixAt(drifter.index, transform.matrix);
drifter.position.copy(transform.position); drifter.seen = true;
drifting.cells.clear(); drifting.cells.set('0,0,0', [drifter]);
assert.equal(drifting.update(), false, 'A stationary rock off to the side is not an incoming threat');
drifting.velocity.set(-55, 0, 0);
assert.equal(drifting.update(), true, 'Include stream velocity in the real collision warning forecast');
drifting.setPaused(true); drifting.step(new THREE.Vector3(-110, 0, 0), 2);
assert.equal(drifting.hits.length, 0);
drifting.setPaused(false); drifting.step(new THREE.Vector3(-110, 0, 0), 2);
assert.equal(drifting.hits.length, 1, 'Sweep the moving instance through the stationary player hull');
const actualDrifter = drifting.prepareShowerRock(drifter).position.clone();
assert.ok(actualDrifter.equals(drifter.position.clone().add(drifting.grit.position)), 'Collision position follows the visible moving field');
drifting.step(new THREE.Vector3(), 0);
assert.equal(drifting.hits.length, 1, 'A drifting boulder can only hit once');
console.log('PASS stream-aware collision warnings, swept hits, visible/collision alignment and pause');

const fastStream = makeGame(); fastStream.seed(); fastStream.velocity.set(0, 0, 1200);
const fastRock = fastStream.rocks[0];
transform.position.set(0, 0, -450); transform.scale.setScalar(10); transform.updateMatrix();
fastStream.grit.setMatrixAt(fastRock.index, transform.matrix); fastRock.position.copy(transform.position);
fastStream.cells.clear(); fastStream.cells.set('0,0,-4', [fastRock]);
fastStream.render();
assert.equal(fastRock.seen, true, 'Visibility look-ahead includes stream speed so fast rendered rocks are registered before contact');
console.log('PASS fast-stream visibility look-ahead for low-frame-rate collision eligibility');

for (const reducedMotion of [false, true]) for (const turn of [false, true]) {
  const flight = makeGame(12345, reducedMotion); flight.seed();
  const record = flight.rocks.find(rock => Math.abs(rock.position.x) < 200 && rock.position.z < -800 && rock.position.z > -2200);
  for (const other of flight.rocks) if (other !== record) other.hit = true; // Isolate one real instance.
  if (turn) flight.rotation.setFromEuler(new THREE.Euler(.2, -.5, .3));
  flight.playerHullRotation.copy(flight.rotation);
  flight.camera.quaternion.copy(flight.rotation);
  const center = record.position.clone().applyQuaternion(flight.rotation).add(flight.origin);
  flight.camera.position.copy(center).add(new THREE.Vector3(-18, 0, 80).applyQuaternion(flight.rotation));
  flight.flightMotion.set(0, 0, -100).applyQuaternion(flight.rotation);
  flight.opacity(0); flight.render();
  assert.equal(record.seen, false, 'Fading/invisible instances cannot become hazards before being drawn');
  flight.opacity(1);
  const delta = new THREE.Vector3(0, 0, 160).applyQuaternion(flight.rotation);
  flight.step(delta);
  assert.equal(flight.hits.length, 0, 'Never-rendered instances cannot hit during catch-up ticks');
  flight.origin.set(0, 0, 0); flight.previousOrigin.copy(flight.origin);
  flight.render(); assert.equal(record.seen, true);
  assert.equal(flight.update(), true, 'The same real ring geometry must warn before a wing impact');
  assert.equal(flight.hits.length, 0, 'A warning must not apply damage early');
  flight.camera.rotateY(Math.PI); // Look away; the already-seen rock is still physically beside the wing.
  flight.step(new THREE.Vector3(), 1);
  flight.render(); assert.equal(record.seen, true);
  flight.setPaused(true); flight.step(delta);
  assert.equal(flight.hits.length, 0, 'Pause freezes ring damage');
  flight.setPaused(false); flight.step(delta);
  assert.equal(flight.hits.length, 1, 'A previously shown rock must still hit a wing after leaving the view for over 0.3 seconds');
  assert.equal(flight.shield, 85, 'Use real small-asteroid shield damage, not a fake collision counter');
  assert.equal(record.hit, true);
  flight.step(delta.clone().negate()); flight.step(delta);
  assert.equal(flight.hits.length, 1, 'The same instance must not damage repeatedly');
  flight.seed(); assert.ok(flight.rocks.every(rock => !rock.seen && !rock.hit));
  flight.seed(0, 0, false);
  assert.equal(flight.rocks.length, 0); assert.equal(flight.cells.size, 0);
  assert.equal(flight.update(), false, 'Free-shower grit stays decorative and cannot retain old ring colliders');
}
console.log('PASS actual shield loss on off-screen wing contacts, no unseen hits, pause, one hit per rock and reset');

// Fly through actual seeded layers. Checking an idealized solid ceiling would miss the original bug.
let wallRuns = 0, wallHits = 0, centeredHits = 0;
const byStrength = [0, 0, 0];
for (const strength of [0, 1, 2]) for (const shape of [0, 1, 2]) for (let sample = 0; sample < 4; sample++) {
  for (const side of [-1, 0, 1]) {
    const flight = makeGame(600 + sample * 101 + shape * 19 + strength * 7); flight.seed(strength, shape);
    flight.camera.position.set(-150 + sample * 100, flight.corridorCenter(1500), -1500);
    flight.camera.rotation.x = Math.atan2(side * 300, 400) * .75;
    flight.playerHullRotation.copy(flight.camera.quaternion);
    flight.flightMotion.set(0, side * 300, -400);
    flight.render();
    const step = flight.flightMotion.clone().multiplyScalar(-.85 / 60);
    for (let frame = 0; frame < 60; frame++) { flight.step(step); flight.render(); }
    if (side === 0) centeredHits += flight.hits.length;
    else { wallRuns++; if (flight.hits.length) { wallHits++; byStrength[strength]++; } }
    assert.ok(flight.hits.length <= 7, 'Stop damage once the shield is exhausted');
  }
}
assert.equal(centeredHits, 0, 'Centered passage must remain open in every corridor shape');
assert.ok(wallHits >= wallRuns * .65, `Crossing the visible layers must usually hurt, not pass through decoration (${wallHits}/${wallRuns}; ${byStrength})`);
assert.ok(byStrength.every(count => count >= 12), 'Both light and dense layers need real collision coverage');
console.log(`PASS real corridor traversal: ${wallHits}/${wallRuns} wall crossings hit; centered runs stay clear (${byStrength.join('/')} by strength)`);
assert.ok(source.includes('danger = updateShowerRockCollisions() || danger;'), 'The gameplay loop must actually apply ring collisions and warnings');
assert.ok(source.includes('recordVisibleObjects();\n        recordVisibleShowerRocks();'), 'Visibility must be recorded on rendered frames, not simulation ticks');
