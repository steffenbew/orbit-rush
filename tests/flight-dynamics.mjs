// No dependencies or build step: exercise the real gameplay functions with Three.js.
// Run from the project root: node tests/flight-dynamics.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const THREE = await import(new URL('assets/vendor/three.module.js', root));
const source = readFileSync(new URL('index.html', root), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const code = `
  const scene = new THREE.Scene(), glow = new THREE.Texture();
  const camera = new THREE.PerspectiveCamera(reducedMotion ? 70 : 90, 16 / 9, .03, 14000);
  const flightMotion = new THREE.Vector3(0, 0, -400), flightDirection = new THREE.Vector3(0, 0, -1);
  const flightOrientation = new THREE.Euler(), worldStep = new THREE.Vector3();
  const progressionTimeScale = 1.5, roundDuration = 45;
  ${section('      const simulationStep =', '      let lastFrameTime =')}
  const target = new THREE.Vector2();
  let started = true, paused = false, roundEnded = false, crashing = false, gameTime = 0, difficulty = 0;
  const elements = new Map();
  const document = { querySelector: selector => {
    if (!elements.has(selector)) elements.set(selector, { hidden: true, innerHTML: '', style: {}, classList: { toggle() {} } });
    return elements.get(selector);
  } };
  const innerWidth = 1280, innerHeight = 720;
  let shield = 100;
  const explosions = [], hits = [], sounds = [], particles = [];
  const explode = (...args) => explosions.push(args), playSound = name => sounds.push(name);
  const collideWith = object => hits.push(object);
  const rocketGeometry = new THREE.CylinderGeometry(.22, .22, 10, 8);
  rocketGeometry.rotateX(-Math.PI / 2);
  ${section('      const dark =', '      // Reuse one ship of each type')}
  ${section('      const inverseRotation =', '      const mouseAim =')}
  ${section('      const fleetOrder =', '      function updateRetries()')}
  ${section('      const enemyBolts =', '      const rockets =')}
  ${section('      function updateShield()', '      function collideWith(')}
  ${section('      function recordVisibleObjects()', '      function renderFrame()')}
  return {
    scene, sounds, ships, activeAsteroids, camera, flightMotion, flightOrientation, worldStep, explosions, hits, enemyBolts, target,
    resetShip, setShipIntercept, updateShipCourse, avoidAsteroids, updateCapitalShip, updateEnemyBolts, recordVisibleObjects,
    updateShipHitFlash, updateEngineThrust, updateEngineVisuals, collideShipsWithAsteroids,
    clearEnemyBolts, playerLaserSpeed, setupLevelFleet, updateAsteroidShower, updateShipArrivals, queueShip,
    showerPool, maxShowerRocks, eventAsteroid, fadeAsteroidShader, asteroidShader, encounterRest, corridorCenter, corridorSlope,
    repairPickup, repairRing, repairMarker, repairNotice, updateRepairPickup, resetRepairPickup,
    get shield() { return shield; }, setShield: value => { shield = value; },
    get repairPending() { return repairPending; }, setRepairPending: value => { repairPending = value; },
    hazardPool, updateCollisionHazard, levelFlightSpeed, crossesHull, hasPassedCamera, asteroidArrivalDistance,
    get nextHazardTime() { return nextHazardTime; },
    setLevel: value => { level = value; }, setPressure: value => { levelPressure = value; },
    setTime: value => { gameTime = value; },
    setPaused: value => { paused = value; },
    setRoundEnded: value => { roundEnded = value; }, setCrashing: value => { crashing = value; },
    shower: (corridor, strength, shape = 0, direction = 1) => {
      showerCorridor = corridor; showerStrength = strength; showerShape = shape;
      showerBend = direction * (reducedMotion ? .45 : 1.15); gameTime = showerStart;
      worldStep.set(0, 0, 0); updateAsteroidShower();
      return { pool: showerPool, grit: showerGrit, gap: showerHalfGap, length: showerLength,
        origin: showerOrigin, rotation: showerRotation, start: showerStart, end: showerEnd,
        width: showerHalfWidth * 2, spacing: showerSpacing, bend: showerBend };
    },
    get capital() { return capitalShip; }, get capitalPending() { return capitalPending; },
    get queue() { return spawnQueue; }
  };
`;
let seed = 12345;
const math = Object.create(Math);
math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const makeGame = (reducedMotion = false) => new Function('THREE', 'Math', 'random', 'reducedMotion', code)(
  THREE, math, (a, b) => a + math.random() * (b - a), reducedMotion
);

// Production builds the initial fleet before flightMotion is initialized.
for (const reducedMotion of [false, true]) {
  const initialFleet = new Function('THREE', 'reducedMotion', `
    const scene = new THREE.Scene(), glow = new THREE.Texture();
    const random = (a, b) => a + Math.random() * (b - a);
    ${section('      const dark =', '      // Reuse one ship of each type')}
    const flightMotion = new THREE.Vector3();
    return ships;
  `)(THREE, reducedMotion);
  assert.equal(initialFleet.length, 8, 'Boot-time asteroid creation must not read uninitialized flight state');
}
console.log('PASS initial fleet creation before flight state initialization');

const game = makeGame();
const moveLaser = new Function('rocket', 'dt', 'playerLaserSpeed',
  section('          rocket.object.position.addScaledVector(rocket.direction,', '          rocket.object.position.add(worldStep);'));
assert.ok(source.includes('const projectileSpeed = playerLaserSpeed(heavy);'),
  'Aim prediction must use the same speed as projectile movement');
for (const speed of [35, 180, 600, 1200]) {
  game.flightMotion.set(speed * .4, speed * .1, -speed);
  for (const heavy of [false, true]) {
    const previousSpeed = (game.flightMotion.length() + 420) * (heavy ? 1 : 1.5);
    const currentSpeed = game.playerLaserSpeed(heavy);
    assert.ok(Math.abs(currentSpeed / previousSpeed - (heavy ? 1.25 : 1)) < 1e-8,
      'Only the blue heavy laser gets another 25% speed increase');
    const rocket = { object: new THREE.Object3D(), direction: new THREE.Vector3(0, 0, -1), heavy };
    moveLaser(rocket, 1 / 60, game.playerLaserSpeed);
    assert.ok(Math.abs(rocket.object.position.z + currentSpeed / 60) < 1e-8,
      'Actual movement must match the predicted laser speed');
  }
  assert.ok(Math.abs(game.playerLaserSpeed(true) / game.playerLaserSpeed(false) - 5 / 6) < 1e-8,
    'The heavy laser should now be only one sixth slower than normal fire');
}
game.flightMotion.set(0, 0, -400);
console.log('PASS 25% faster heavy laser, synchronized aim/movement and unchanged normal-laser speed');

const ship = game.ships[0];
let minSpeed = Infinity, maxSpeed = 0, minSide = Infinity, maxSide = -Infinity;
let minThrust = Infinity, maxThrust = 0;
game.resetShip(ship, true); // Exercise ordinary maneuvering, not a committed intercept.
for (let frame = 0; frame < 1200; frame++) {
  game.updateShipCourse(ship, 1 / 60);
  const velocity = ship.userData.courseVelocity;
  const forward = velocity.dot(ship.userData.cruiseDirection);
  minSpeed = Math.min(minSpeed, forward); maxSpeed = Math.max(maxSpeed, forward);
  minSide = Math.min(minSide, velocity.x); maxSide = Math.max(maxSide, velocity.x);
  minThrust = Math.min(minThrust, ship.userData.engineThrust); maxThrust = Math.max(maxThrust, ship.userData.engineThrust);
  assert.ok(velocity.toArray().every(Number.isFinite));
}
assert.ok(minSpeed > 0 && maxSpeed - minSpeed > 50, 'Cruising and acceleration must vary');
assert.ok(minSide < -10 && maxSide > 10, 'Ships must maneuver in both lateral directions');
assert.ok(maxThrust - minThrust > .3, 'Flight AI acceleration must actually drive the engine visuals');
console.log('PASS cruising, acceleration, thrust response and lateral maneuvers');

// A direct obstruction produces a lateral avoidance request.
const rock = game.ships[4];
game.resetShip(rock); game.resetShip(ship);
ship.position.set(0, 0, -400); rock.position.set(0, 0, -500);
rock.userData.courseVelocity.set(0, 0, 0); rock.scale.setScalar(1.3);
game.activeAsteroids.push(rock);
const desired = new THREE.Vector3(0, 0, -200);
game.avoidAsteroids(ship, desired);
assert.ok(Math.abs(desired.x) > 1, 'Threatened ships must attempt to dodge');

// Sweep right through an actual hull in one frame, then verify recycling exactly once.
for (const item of game.ships) item.visible = false;
ship.visible = rock.visible = true;
ship.userData.previousPosition.set(0, 0, -400); ship.position.set(0, 0, -600);
rock.userData.previousPosition.copy(rock.position);
const queuedBefore = game.queue.length;
game.collideShipsWithAsteroids();
assert.equal(ship.visible, false); assert.equal(rock.visible, false);
assert.equal(ship.userData.health, 0);
assert.equal(game.queue.length, queuedBefore + 2);
game.collideShipsWithAsteroids();
assert.equal(game.queue.length, queuedBefore + 2);
assert.ok(game.explosions.some(args => args[1] === 65));
console.log('PASS asteroid avoidance, swept collisions, explosions and single recycling');

for (const reducedMotion of [false, true]) {
  const courses = makeGame(reducedMotion);
  const rock = courses.ships[4];
  let left = 0, right = 0, stationary = 0, gentle = 0, diagonal = 0, up = 0, down = 0;
  const sampleCount = 300;
  for (let sample = 0; sample < sampleCount; sample++) {
    courses.flightOrientation.set(.2, -.4, 0, 'YXZ');
    courses.flightMotion.set(0, 0, -400).applyEuler(courses.flightOrientation);
    courses.resetShip(rock);
    const data = rock.userData;
    const velocity = data.courseVelocity.clone();
    const lateral = velocity.dot(data.courseRight);
    const vertical = velocity.dot(data.courseUp);
    const speed = courses.flightMotion.length() * .85;
    const movement = reducedMotion ? .25 : 1;
    if (velocity.lengthSq() === 0) stationary++;
    else {
      if (lateral < 0) left++; else right++;
      if (vertical < 0) down++; else up++;
      if (Math.abs(lateral) < speed * .1 * movement) {
        gentle++;
        assert.ok(Math.abs(lateral) >= speed * .01 * movement - 1e-8);
        assert.ok(Math.abs(lateral) <= speed * .05 * movement + 1e-8);
        assert.ok(Math.abs(vertical) <= speed * .02 * movement + 1e-8);
      } else {
        diagonal++;
        assert.ok(Math.abs(lateral) >= speed * .12 * movement - 1e-8);
        assert.ok(Math.abs(lateral) <= speed * .28 * movement + 1e-8);
        assert.ok(Math.abs(vertical) <= speed * .08 * movement + 1e-8);
      }
    }
    assert.ok(Math.abs(velocity.dot(data.cruiseDirection)) < 1e-8, 'Drift must follow the spawn heading, not world X');
    const time = rock.position.dot(data.cruiseDirection) / speed;
    const pass = rock.position.clone().addScaledVector(velocity, time)
      .addScaledVector(courses.flightMotion, -.85 * time);
    const intended = data.courseRight.clone().multiplyScalar(data.lane).addScaledVector(data.courseUp, data.height);
    assert.ok(pass.distanceTo(intended) < 1e-8, 'Angled arrivals must preserve the intended collision/near-pass point');
    assert.ok(data.previousPosition.equals(rock.position), 'Spawn compensation must not look like a swept teleport');
    courses.target.set(-1, 1); courses.flightMotion.set(-200, 100, -400);
    courses.flightOrientation.set(-.3, .5, 0, 'YXZ');
    courses.updateShipCourse(rock, .5);
    assert.ok(data.courseVelocity.equals(velocity), 'Asteroids must not steer after the player');
  }
  assert.ok(left > 15 && right > 15 && up > 15 && down > 15,
    'Moving asteroids should retain directional variety');
  assert.ok(stationary > sampleCount * .4 && stationary < sampleCount * .6,
    `About half should sit still in space, got ${stationary}/${sampleCount}`);
  assert.ok(gentle > sampleCount * .2 && gentle < sampleCount * .4,
    `Gentle drift should be common, got ${gentle}/${sampleCount}`);
  assert.ok(diagonal > sampleCount * .1 && diagonal < sampleCount * .3,
    `Noticeable diagonals should be a minority, got ${diagonal}/${sampleCount}`);
}
console.log('PASS mostly stationary/gently drifting asteroids, occasional diagonals, preserved pass points and reduced motion');

for (const corridor of [false, true]) {
  game.setupLevelFleet();
  const field = game.shower(corridor, 2);
  const active = field.pool.filter(item => item.visible);
  assert.ok(active.length >= (corridor ? 16 : 9));
  assert.ok(active.every(item => item.userData.hull.transparent && item.userData.hull.opacity === 0));
  assert.ok(active.every(item => item.userData.courseVelocity.lengthSq() === 0), 'Shower formations must not drift into their safe gaps');
  assert.ok(active.every(item => item.userData.hull.onBeforeCompile === game.asteroidShader),
    'Pooled/cloned materials must keep the distance-fade shader');
  assert.ok(field.width <= 1800, 'Field width must not scale with distant view width');
  assert.ok(field.end - field.start <= 20, 'Field length should stay within its shorter travel budget');
  assert.equal(field.grit.material.depthWrite, false, 'Transparent grit must not leave invisible depth occluders');
  assert.equal(field.grit.material.opacity, 0);
  assert.ok(active.every(item => item.position.z < -3000), 'Rocks must start beyond the near field');
  if (corridor) {
    const walls = active.filter(item => Math.abs(item.position.y) >= field.gap);
    assert.equal(walls.length, 16);
    assert.ok(walls.every(item => Math.abs(item.position.y) - item.userData.type.radius * item.scale.x >= field.gap));
    assert.equal(field.grit.count, 4800);
  } else {
    assert.ok(active.every(item => Math.abs(item.position.y) <= 380), 'Free showers should retain their full vertical scatter volume');
  }
  const position = field.origin.clone();
  game.setPaused(true); game.worldStep.set(20, 0, 100); game.updateAsteroidShower();
  assert.ok(field.origin.equals(position));
  assert.equal(field.grit.material.opacity, 0, 'Pause must freeze the fade too');
  game.setPaused(false); game.setTime(field.end + .1); game.updateAsteroidShower();
  assert.ok(field.grit.visible, 'The distant tail must not disappear on a timer');
  assert.ok(field.origin.x > position.x, 'The field must move through space with the world');
}
console.log('PASS narrower/shorter fields, transparent arrivals, pause and spatial tail');

for (const reducedMotion of [false, true]) {
  const corridor = makeGame(reducedMotion);
  for (const level of [1, 5, 15, 40]) {
    for (const strength of [0, 1, 2]) {
      corridor.setLevel(level); corridor.setupLevelFleet();
      const field = corridor.shower(true, strength);
      const previousGap = .75 * Math.max(45, 130 - strength * 22 - (level - 1) * 3);
      assert.ok(Math.abs(field.gap - previousGap * .8) < 1e-8,
        'Bring ceiling and floor another 20% closer at every level and strength');
      assert.ok(field.gap >= 27, 'Keep a minimum 54-unit clear passage at high levels');
      assert.equal(field.width, 1800, 'Narrow the passage, not the surrounding asteroid field');
      const walls = field.pool.filter(rock => rock.visible && Math.abs(rock.position.y) >= field.gap);
      assert.equal(walls.length, [8, 12, 16][strength]);
      assert.ok(walls.every(rock => Math.abs(rock.position.y) - rock.userData.type.radius * rock.scale.x >= field.gap),
        'Ceiling and floor rocks must still leave the intended hull-sized clearance');
    }
  }
}
console.log('PASS another 20% tighter vertical corridor, intact wall clearance and bounded difficulty in normal/reduced motion');

// Compare the same seeded layout: only the ceiling/floor separation should change.
const widerCode = code.replace('showerHalfGap = .6 *', 'showerHalfGap = .75 *');
assert.notEqual(widerCode, code);
const savedSeed = seed;
for (const corridor of [false, true]) {
  seed = 2048;
  const before = new Function('THREE', 'Math', 'random', 'reducedMotion', widerCode)(
    THREE, math, (a, b) => a + math.random() * (b - a), false);
  before.setupLevelFleet(); const wider = before.shower(corridor, 1);
  seed = 2048;
  const after = makeGame(); after.setupLevelFleet(); const tighter = after.shower(corridor, 1);
  const shift = corridor ? wider.gap - tighter.gap : 0;
  const wallCount = corridor ? 12 : 6;
  assert.equal(tighter.width, wider.width); assert.equal(tighter.length, wider.length);
  assert.equal(tighter.grit.count, wider.grit.count);
  for (let i = 0; i < wallCount; i++) {
    const oldRock = wider.pool[i], newRock = tighter.pool[i];
    const side = i % 2 ? 1 : -1;
    assert.equal(newRock.position.x, oldRock.position.x);
    assert.equal(newRock.position.z, oldRock.position.z);
    assert.ok(Math.abs(newRock.position.y - (oldRock.position.y - side * shift)) < 1e-8,
      'Move actual ceiling and floor collision rocks equally toward the center');
  }
  const oldMatrix = new THREE.Matrix4(), newMatrix = new THREE.Matrix4();
  for (let i = 0; i < tighter.grit.count; i++) {
    wider.grit.getMatrixAt(i, oldMatrix); tighter.grit.getMatrixAt(i, newMatrix);
    const side = i % 2 ? 1 : -1;
    for (let j = 0; j < 16; j++) {
      const expected = oldMatrix.elements[j] - (j === 13 ? side * shift : 0);
      assert.ok(Math.abs(newMatrix.elements[j] - expected) < 1e-4,
        'Move decorative ceiling/floor rocks by the same amount without changing width, depth, size or rotation');
    }
  }
}
seed = savedSeed;
console.log('PASS ceiling/floor move inward equally in collision and decorative geometry; free asteroid fields stay unchanged');

for (const reducedMotion of [false, true]) {
  const fading = makeGame(reducedMotion);
  fading.setupLevelFleet();
  const field = fading.shower(true, 2);
  const rock = field.pool.find(item => item.visible);
  assert.equal(rock.userData.hull.opacity, 0);
  fading.updateShipCourse(rock, .15);
  assert.ok(Math.abs(rock.userData.hull.opacity - .5) < .001);
  fading.updateShipCourse(rock, .15);
  assert.equal(rock.userData.hull.opacity, 1, 'Nearby hazards must become fully solid');
  for (const distance of [650, 250, 100, 10, 0, -10]) {
    rock.position.set(0, 0, -distance);
    fading.updateShipCourse(rock, 1);
    assert.equal(rock.userData.hull.opacity, 1, 'Approaching and passing rocks must not fade out');
    assert.equal(fading.hasPassedCamera(rock), false, 'Keep close rocks until their full hull passes behind');
  }
  fading.queueShip(rock);
  assert.equal(fading.eventAsteroid(), rock, 'Reuse inactive rocks rather than allocate new models');
  assert.equal(rock.userData.hull.opacity, 0, 'Reused rocks must restart the fade');
  fading.setTime(field.start + .15); fading.updateAsteroidShower();
  assert.ok(Math.abs(field.grit.material.opacity - .5) < .001);
}
for (const reducedMotion of [false, true]) {
  const arrivals = makeGame(reducedMotion);
  arrivals.setLevel(3);
  const rock = arrivals.ships[4], tiers = new Set();
  for (const speed of reducedMotion ? [35, 55] : [180, 600, 1100]) {
    arrivals.flightMotion.set(0, 0, -speed);
    for (let sample = 0; sample < 40; sample++) {
      arrivals.resetShip(rock);
      tiers.add(rock.userData.asteroidTier);
      const minimum = arrivals.asteroidArrivalDistance(rock);
      assert.ok(rock.position.dot(rock.userData.cruiseDirection) >= minimum + speed * .85 * .3 - 1e-8);
      assert.equal(rock.userData.hull.opacity, 0);
      for (let tick = 0; tick < 18; tick++) {
        arrivals.updateShipCourse(rock, 1 / 60);
        rock.position.addScaledVector(arrivals.flightMotion, -.85 / 60)
          .addScaledVector(rock.userData.courseVelocity, 1 / 60);
      }
      assert.ok(rock.userData.hull.opacity > .999999, 'Every tier must finish its spawn blend in 0.3 seconds');
      assert.ok(rock.position.dot(rock.userData.cruiseDirection) >= minimum - 1e-6,
        'Bigger rocks must still be distant when the spawn blend finishes');
    }
  }
  assert.equal(tiers.size, 3);
  for (const level of [1, 3, 15]) {
    arrivals.setLevel(level); arrivals.setPressure(1 - Math.exp(-(level - 1) / 4)); arrivals.setupLevelFleet();
    arrivals.setTime(2); arrivals.flightMotion.set(0, 0, -arrivals.levelFlightSpeed(2 / 45));
    for (let sample = 0; sample < 30; sample++) {
      arrivals.setupLevelFleet(); arrivals.updateCollisionHazard();
      const hazard = arrivals.hazardPool.find(rock => rock.visible);
      assert.ok(hazard);
      const time = hazard.userData.approachTime;
      assert.ok(time >= 3 && Math.abs(time * 60 - Math.round(time * 60)) < 1e-8);
      if (hazard.userData.asteroidTier === 1) assert.equal(time, 3, 'Small/reduced-motion threats keep their original approach');
      const predicted = hazard.position.clone().addScaledVector(hazard.userData.courseVelocity, time);
      assert.ok(predicted.length() >= arrivals.asteroidArrivalDistance(hazard) - 1e-6,
        'Scheduled large rocks also need a distant starting point');
      assert.equal(arrivals.nextHazardTime, 7, 'Longer approaches must not accelerate the five-second spawn cadence');
    }
  }
}
console.log('PASS 0.3-second blends, size-aware regular/hazard arrivals and unchanged small-rock cadence');

const rockShader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
game.fadeAsteroidShader(rockShader);
assert.ok(rockShader.fragmentShader.includes('1.0 - smoothstep(2600.0, 3600.0, length(vViewPosition))'));
assert.ok(rockShader.fragmentShader.includes('if (diffuseColor.a < 0.003) discard;'));
const gritShader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
const shaderField = makeGame(); shaderField.setupLevelFleet();
shaderField.shower(true, 2).grit.material.onBeforeCompile(gritShader);
assert.equal(gritShader.fragmentShader, rockShader.fragmentShader,
  'Background rocks must use the same far-only fade as solid collision rocks, with no close-range dissolve');
console.log('PASS smooth arrivals and reuse, fully solid close passes, no near fade in shower rocks');

for (const corridor of [false, true]) {
  for (const speed of [40, 200, 900]) {
    const bounded = makeGame(speed === 40);
    bounded.flightMotion.set(0, 0, -speed); bounded.camera.aspect = 32 / 9;
    bounded.setupLevelFleet();
    const field = bounded.shower(corridor, 2);
    const start = field.start;
    let peak = 0;
    for (let frame = 0; frame < 90 * 60; frame++) {
      bounded.setTime(start + frame / 60);
      bounded.worldStep.set(0, 0, speed / 60);
      bounded.updateAsteroidShower();
      const active = field.pool.filter(item => item.visible);
      peak = Math.max(peak, active.length);
      for (const rock of active) {
        rock.position.addScaledVector(bounded.worldStep, .85);
        if (bounded.hasPassedCamera(rock)) bounded.queueShip(rock);
      }
    }
    assert.ok(peak > 0 && peak <= bounded.maxShowerRocks);
    assert.ok(field.pool.length <= 144, 'Even slow/ultrawide flights must have a bounded collision pool');
    assert.ok(field.width <= 1800);
    assert.ok(field.pool.length < 144, 'Normal straight flight should not exhaust the pool and create gaps');
    assert.equal(field.grit.visible, false, 'The tail must eventually leave spatially');
    bounded.setupLevelFleet();
    assert.ok(field.pool.every(rock => !rock.visible), 'Retry must hide every pooled rock');
    // Steering can keep old rocks ahead for longer: enforce the hard budget even then.
    for (let i = 0; i < 200; i++) bounded.eventAsteroid();
    assert.equal(field.pool.length, 144);
    assert.equal(bounded.eventAsteroid(), null);
  }
}
console.log('PASS bounded collision fleet across slow/fast flights, ultrawide, reuse and pool exhaustion');

const turning = makeGame(); turning.setupLevelFleet();
const turningField = turning.shower(true, 2);
turning.camera.rotation.y = -.7; turning.camera.updateMatrixWorld();
turningField.origin.set(4500, 0, turningField.length + 750);
turning.updateAsteroidShower();
assert.ok(turningField.grit.visible, 'Turning can keep the field in view after its original travel-axis cutoff');
const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4()
  .multiplyMatrices(turning.camera.projectionMatrix, turning.camera.matrixWorldInverse));
assert.ok(frustum.intersectsBox(turningField.grit.boundingBox.clone().applyMatrix4(turningField.grit.matrixWorld)),
  'The retained field must really intersect the camera view');
turningField.origin.set(0, 0, turningField.length + 10000);
turning.updateAsteroidShower();
assert.equal(turningField.grit.visible, false, 'A fully passed field should still be cleaned up');
console.log('PASS camera-relative full-field cleanup without visible edges disappearing during turns');

game.setLevel(4); game.setupLevelFleet(); game.activeAsteroids.length = 0;
const boss = game.capital;
game.resetShip(boss);
assert.equal(boss.userData.maxHealth, 30, 'The occasional boss must not retain its old 60-hit armor');
assert.equal(boss.userData.health, boss.userData.maxHealth);
assert.ok(boss.position.z <= -4200);
const materials = boss.userData.flashMaterials;
const flame = boss.userData.flames[0].material;
const flameColor = flame.color.getHex();
const originalHullColor = game.ships[0].userData.hull.color.getHex();
boss.userData.hitFlash = .2; game.updateShipHitFlash(boss);
assert.ok(materials.every(entry => entry.material.color.getHex() === 0xff172d));
assert.notEqual(flame.color.getHex(), flameColor);
assert.equal(game.ships[0].userData.hull.color.getHex(), originalHullColor);
boss.userData.hitFlash = 0; game.updateShipHitFlash(boss);
assert.equal(flame.color.getHex(), flameColor);
console.log('PASS distant capital arrival and isolated full-model red hit flash, including engines');

let left = Infinity, right = -Infinity, down = Infinity, up = -Infinity, near = Infinity, far = 0;
let attackFrames = 0, maxLateralSpeed = 0;
for (let frame = 0; frame < 1800; frame++) {
  game.updateCapitalShip(boss, 1 / 60);
  boss.position.addScaledVector(boss.userData.courseVelocity, 1 / 60).addScaledVector(game.flightMotion, -.85 / 60);
  maxLateralSpeed = Math.max(maxLateralSpeed, Math.abs(boss.userData.courseVelocity.x));
  if (frame < 900) continue;
  if (-boss.position.z < 2200) attackFrames++;
  left = Math.min(left, boss.position.x); right = Math.max(right, boss.position.x);
  down = Math.min(down, boss.position.y); up = Math.max(up, boss.position.y);
  near = Math.min(near, -boss.position.z); far = Math.max(far, -boss.position.z);
}
assert.ok(left < -100 && right > 100 && up - down > 75 && far - near > 1000);
assert.ok(maxLateralSpeed < 90, 'Sideways maneuvers should leave readable firing opportunities');
assert.ok(attackFrames > 5 * 60, 'The attack phase needs time for slower shots to arrive');
assert.ok(near > 1500 && far > 3100 && far < 3800, `The boss must alternate distant retreats and attack runs, got ${near}–${far}`);
assert.equal(game.enemyBolts.length, 0, 'Off-screen capital ships must not fire');
console.log('PASS capital maneuvers left/right, up/down and near/far without teleporting');

for (const item of game.ships) item.visible = false;
boss.visible = rock.visible = true;
boss.position.set(0, 0, -1500); boss.userData.previousPosition.copy(boss.position);
rock.position.copy(boss.position); rock.userData.previousPosition.copy(rock.position);
rock.scale.setScalar(2.8); rock.userData.asteroidTier = 3;
game.activeAsteroids.push(rock);
game.collideShipsWithAsteroids();
assert.equal(boss.userData.health, 27);
rock.visible = true; game.collideShipsWithAsteroids();
assert.equal(boss.userData.health, 27, 'A debris cluster must not strip capital armor in one frame');
assert.equal(boss.visible, true);
boss.userData.health = 3; boss.userData.rockHitCooldown = 0; rock.visible = true;
const destructionStart = game.explosions.length;
game.collideShipsWithAsteroids();
const capitalExplosion = game.explosions.slice(destructionStart).find(args => args[1] === 65);
assert.ok(capitalExplosion, 'A fatal asteroid collision must destroy the capital ship');
assert.equal(capitalExplosion[5], false, 'Environmental kills must retain their no-screen-flash policy');
assert.equal(capitalExplosion[6], true, 'Environmental capital kills must use the giant finale too');
assert.equal(boss.visible, false);
game.activeAsteroids.length = 0; game.resetShip(boss);
console.log('PASS capital armor absorbs clustered asteroid hits');

for (const engineShip of [game.ships[0], game.ships[1], game.ships[2], boss]) {
  game.resetShip(engineShip);
  const data = engineShip.userData;
  const flame = data.flames[0];
  const core = flame.userData.core;
  const plume = flame.userData.plume;
  const hullBox = data.collisionBox.clone();
  data.courseVelocity.copy(data.cruiseDirection).multiplyScalar(170);
  for (let frame = 0; frame < 120; frame++) game.updateEngineThrust(engineShip, 170, 1 / 60);
  game.updateShipHitFlash(engineShip);
  const cruising = { thrust: data.engineThrust, size: flame.scale.x, length: plume.scale.z,
    light: core.material.emissiveIntensity, opacity: flame.material.opacity };
  let forward = 170;
  for (let frame = 0; frame < 60; frame++) {
    data.courseVelocity.copy(data.cruiseDirection).multiplyScalar(forward + 2);
    game.updateEngineThrust(engineShip, forward, 1 / 60);
    forward += 2;
  }
  game.updateShipHitFlash(engineShip);
  assert.ok(data.engineThrust > .95, 'Actual acceleration must visibly ignite the drives');
  assert.ok(flame.scale.x > cruising.size * 1.3);
  assert.ok(plume.scale.z > cruising.length * 1.6);
  assert.ok(core.material.emissiveIntensity > cruising.light * 1.5);
  assert.ok(flame.material.opacity > cruising.opacity);
  assert.ok(data.collisionBox.equals(hullBox), 'Long flames must not enlarge the collision hull');
  assert.ok(plume.children.every(ribbon => ribbon.userData.engineExhaust));
  let solidParts = 0;
  engineShip.traverse(part => { if (part.isMesh && !part.userData.engineExhaust) solidParts++; });
  assert.equal(data.collisionParts.length, solidParts, 'Exhaust ribbons must be excluded from hull collision geometry');
  const boost = data.engineThrust;
  game.updateEngineThrust(engineShip, forward, 0);
  assert.equal(data.engineThrust, boost, 'Zero-duration frames must not corrupt engine state');
  for (let frame = 0; frame < 180; frame++) game.updateEngineThrust(engineShip, forward, 1 / 60);
  game.updateShipHitFlash(engineShip);
  assert.ok(data.engineThrust < boost - .3, 'Boost must ease off when acceleration stops');
  game.resetShip(engineShip);
  assert.equal(data.engineThrust, .25);
}
console.log('PASS acceleration-driven engine glow, longer exhaust, cooldown and reset on all ship types');

// Boosted exhaust must still join the capital ship\'s full red hit flash.
boss.userData.engineThrust = 1; boss.userData.hitFlash = .2; game.updateShipHitFlash(boss);
assert.ok(boss.userData.flashMaterials.every(entry => entry.material.color.getHex() === 0xff172d));
boss.userData.hitFlash = 0; game.updateShipHitFlash(boss);
assert.ok(boss.userData.flashMaterials.every(entry => entry.material.color.equals(entry.color)));
game.resetShip(boss);

boss.position.set(0, -50, -1500); boss.userData.lastVisibleTime = 0;
boss.userData.fireCooldown = 0; game.setTime(0);
game.updateCapitalShip(boss, 1 / 60);
assert.equal(game.enemyBolts.length, 2);
assert.equal(boss.userData.fireCooldown, 3.4, 'Leave a longer gap between volleys');
for (const bolt of game.enemyBolts) {
  assert.ok(Math.abs(bolt.velocity.length() - (400 + 420) * 1.2) < 1e-8);
  assert.equal(bolt.object.children[0].geometry, game.enemyBolts[0].object.children[0].geometry);
  assert.equal(bolt.object.children[0].material.color.getHex(), 0xff3344);
}
const bolt = game.enemyBolts[0];
const position = bolt.object.position.clone();
game.setPaused(true); game.updateEnemyBolts(.5);
assert.ok(bolt.object.position.equals(position));
game.setPaused(false);
// Fixed velocity: later steering must not retarget a projectile.
const velocity = bolt.velocity.clone(); game.flightMotion.x = 200; game.worldStep.set(-2, 0, 4);
game.updateEnemyBolts(.01);
assert.ok(bolt.velocity.equals(velocity));
// Even an artificially large frame must register a laser crossing the player.
game.clearEnemyBolts();
const object = new THREE.Group(); object.position.set(0, 0, -30); object.userData.enemyBolt = true;
game.enemyBolts.push({ object, velocity: new THREE.Vector3(0, 0, 1000), age: 0 });
game.worldStep.set(0, 0, 0); game.updateEnemyBolts(.06);
assert.equal(game.enemyBolts.length, 0); assert.equal(game.hits.length, 1);
console.log('PASS red laser speed, pause, non-homing trajectories and swept laser collisions');

const reduced = makeGame(true);
reduced.setLevel(4); reduced.setupLevelFleet();
reduced.resetShip(reduced.capital); reduced.updateCapitalShip(reduced.capital, .05);
assert.ok(reduced.capital.userData.courseVelocity.toArray().every(Number.isFinite));
reduced.setupLevelFleet();
assert.ok(reduced.ships.filter(item => item.userData.shower || item.userData.type.capital).every(item => !item.visible));
assert.equal(reduced.enemyBolts.length, 0);
console.log('PASS reduced-motion initialization and level reset');

const cadence = makeGame();
for (let level = 1; level <= 16; level++) {
  cadence.setLevel(level); cadence.setTime(0); cadence.setupLevelFleet();
  const expected = level % 4 === 0;
  assert.equal(cadence.capitalPending, expected, `Unexpected boss schedule for level ${level}`);
  assert.ok(!cadence.capital?.visible);
  assert.ok(cadence.queue.every(ship => !ship.userData.type.capital));
  cadence.setTime(5.99); cadence.updateShipArrivals();
  assert.ok(!cadence.capital?.visible, 'Even scheduled bosses must wait for their arrival');
  cadence.setTime(6); cadence.setPaused(true); cadence.updateShipArrivals();
  assert.ok(!cadence.capital?.visible, 'Pause must hold the boss arrival');
  cadence.setPaused(false); cadence.updateShipArrivals();
  assert.equal(!!cadence.capital?.visible, expected);
  assert.equal(cadence.capitalPending, false);
  if (expected) {
    assert.equal(cadence.capital.userData.health, 30);
    const spawn = cadence.capital.userData.spawn;
    cadence.capital.userData.health = 0; cadence.queueShip(cadence.capital);
    cadence.setTime(7.5); cadence.updateShipArrivals();
    assert.equal(cadence.capital.visible, false, 'A defeated boss must not respawn in the same attempt');
    assert.equal(cadence.capital.userData.spawn, spawn);
    // A retry of a boss level restores exactly one fresh encounter.
    cadence.setTime(0); cadence.setupLevelFleet();
    cadence.setTime(6); cadence.updateShipArrivals();
    assert.equal(cadence.capital.visible, true);
    assert.equal(cadence.capital.userData.health, 30);
    assert.equal(cadence.capital.userData.spawn, spawn + 1);
  }
  if (level < 4) assert.equal(cadence.capital, null);
}
assert.equal(cadence.ships.filter(ship => ship.userData.type.capital).length, 1);
console.log('PASS boss only on levels 4/8/12/16, pause, single encounter, retry and model reuse');

const threats = makeGame(); threats.setupLevelFleet();
threats.setTime(1.99); threats.updateCollisionHazard();
assert.equal(threats.hazardPool.length, 0);
threats.setTime(2); threats.updateCollisionHazard();
assert.equal(threats.hazardPool.length, 1);
const hazard = threats.hazardPool[0];
assert.equal(threats.nextHazardTime, 7);
assert.equal(hazard.userData.asteroidTier, 1);
assert.equal(hazard.userData.hull.opacity, 0, 'Scheduled threats must also fade in');
const impactPoint = hazard.position.clone().addScaledVector(hazard.userData.courseVelocity, 3);
assert.ok(Math.abs(impactPoint.x) < 1e-8 && Math.abs(impactPoint.y) < 1e-8,
  'Scheduled diagonal courses must still cross the forecast flight path');
assert.ok(hazard.position.z < -400, 'The first threat must have a readable approach, not spawn beside the player');
const fixedPosition = hazard.position.clone();
threats.flightMotion.x = 200; threats.target.x = .5;
threats.setTime(6.99); threats.updateCollisionHazard();
assert.ok(hazard.position.equals(fixedPosition), 'Existing threats must not track steering');
assert.equal(threats.hazardPool.length, 1);
threats.setTime(7); threats.setPaused(true); threats.updateCollisionHazard();
assert.equal(threats.hazardPool.length, 1);
threats.setPaused(false); threats.updateCollisionHazard();
assert.equal(threats.hazardPool.length, 2);
assert.ok(threats.hazardPool[1].position.x > 0, 'The next threat must follow the new course');
const queueLength = threats.queue.length;
threats.queueShip(hazard);
assert.equal(threats.queue.length, queueLength, 'Scheduled threats must not join normal respawns');
threats.setTime(12); threats.updateCollisionHazard();
assert.equal(hazard.visible, false, 'Quiet phases defer new collision hazards');
threats.setTime(15); threats.updateCollisionHazard();
assert.equal(hazard.visible, true);
assert.equal(threats.nextHazardTime, 20);
const spawn = hazard.userData.spawn;
threats.queueShip(hazard); threats.setTime(32); threats.updateCollisionHazard();
assert.equal(hazard.visible, false, 'The second breather also defers hazards');
threats.setTime(33); threats.updateCollisionHazard();
assert.equal(hazard.userData.spawn, spawn + 1, 'A long frame must not spawn catch-up waves');
assert.equal(threats.nextHazardTime, 38);
threats.setTime(38); threats.updateCollisionHazard();
assert.equal(threats.hazardPool.length, 2, 'Never grow the pool or teleport an active threat');
assert.equal(hazard.userData.spawn, spawn + 1);
threats.queueShip(hazard); threats.setRoundEnded(true); threats.updateCollisionHazard();
assert.equal(hazard.visible, false);
threats.setRoundEnded(false); threats.setCrashing(true); threats.updateCollisionHazard();
assert.equal(hazard.visible, false);
threats.setCrashing(false); threats.setTime(0); threats.setupLevelFleet();
assert.ok(threats.hazardPool.every(rock => !rock.visible));
assert.equal(threats.nextHazardTime, 2);
threats.setTime(2); threats.flightMotion.set(0, 0, -1); threats.updateCollisionHazard();
assert.ok(threats.hazardPool.every(rock => !rock.visible), 'Do not spawn dangerously close during resume acceleration');
threats.flightMotion.set(0, 0, -200); threats.updateCollisionHazard();
assert.ok(hazard.visible);
console.log('PASS five-second threat cadence, fixed courses, pause, reuse, reset and bounded missed intervals');

for (const reducedMotion of [false, true]) {
  for (const speed of (reducedMotion ? [35, 55] : [200, 600, 1100])) {
    for (const dodge of [false, true]) {
      const flight = makeGame(reducedMotion);
      flight.setLevel(3); flight.setupLevelFleet();
      const motion = reducedMotion ? .35 : 1;
      flight.target.set(.4 / (1.15 * motion), .12 / motion);
      flight.flightMotion.set(speed * .4, speed * .12, -speed);
      flight.setTime(2); flight.updateCollisionHazard();
      const rock = flight.hazardPool[0];
      let hit = false;
      for (let frame = 0; frame < Math.ceil((rock.userData.approachTime + 1) * 60); frame++) {
        if (dodge && frame === 30) flight.target.x = -1;
        const previous = rock.position.clone();
        flight.updateShipCourse(rock, 1 / 60);
        rock.position.addScaledVector(flight.flightMotion, -.85 / 60)
          .addScaledVector(rock.userData.courseVelocity, 1 / 60);
        if (flight.crossesHull(rock, previous, rock.position)) {
          hit = true;
          assert.equal(rock.userData.hull.opacity, 1, 'Threats must be fully visible before impact');
          break;
        }
        // Actual flight keeps accelerating and easing toward held input between spawns.
        const forward = -flight.flightMotion.z;
        const nextSpeed = forward + (flight.levelFlightSpeed((2 + (frame + 1) / 60) / 45) - forward) * (1 - Math.exp(-3 / 60));
        flight.flightMotion.x += (flight.target.x * nextSpeed * 1.15 * motion - flight.flightMotion.x) * (1 - Math.exp(-3 / 60));
        flight.flightMotion.y += (flight.target.y * nextSpeed * motion - flight.flightMotion.y) * (1 - Math.exp(-3 / 60));
        flight.flightMotion.z = -nextSpeed;
      }
      assert.equal(hit, !dodge, `Scheduled hazard must hit unchanged flight and miss a dodge (${speed}, reduced=${reducedMotion})`);
    }
  }
}
console.log('PASS real swept-hull impacts on unchanged courses and successful evasions at slow/fast/reduced-motion speeds');

// Drive the real accumulator and steering code, not one physics step per display frame.
const makeFlightClock = new Function('THREE', 'flight', 'reducedMotion', 'updateSimulation', `
  const {target, flightMotion, flightOrientation, camera, levelFlightSpeed} = flight;
  const flightVelocity = new THREE.Vector2(flightMotion.x, flightMotion.y);
  const flightDirection = new THREE.Vector3(), flightHeading = new THREE.Vector2(), flightTilt = new THREE.Vector3();
  let speed = -flightMotion.z, hitMarker = 0;
  const started = true, paused = false, crashing = false, celebrating = false, document = {hidden: false};
  const resetFrameStats = () => {}; // This physics-only clock does not render a HUD.
  ${section('      const simulationStep =', '      const progressionTimeScale =')}
  return {frame: advanceSimulation, move: (dt, difficulty) => {
    ${section('        const easing = 1 - Math.exp(-3 * dt);', '        worldStep.copy(flightMotion)')}
    ${section('        const speedFov =', '        danger = false;')}
  }};
`);
for (const reducedMotion of [false, true]) {
  for (const fps of [5, 10, 15, 20, 30, 60, 120, 144]) {
    for (const level of [1, 3, 7, 15]) {
      for (const kick of [false, true]) {
        for (const dodge of [false, true]) {
          const flight = makeGame(reducedMotion), startTime = level === 3 ? 2 : 38;
          flight.setLevel(level); flight.setPressure(1 - Math.exp(-(level - 1) / 4)); flight.setupLevelFleet();
          const speed = flight.levelFlightSpeed(startTime / 45), motion = reducedMotion ? .35 : 1;
          flight.target.set(.4 / (1.15 * motion), .12 / motion);
          flight.flightMotion.set(speed * (kick ? -.4 : .4), speed * (kick ? -.3 : .12), -speed);
          flight.flightOrientation.set(Math.atan2(flight.flightMotion.y, Math.hypot(speed, flight.flightMotion.x)),
            -Math.atan2(flight.flightMotion.x, speed), 0, 'YXZ');
          flight.setTime(startTime); flight.updateCollisionHazard();
          const rock = flight.hazardPool[0];
          assert.ok(rock.visible);
          // A small, valid asteroid gives prediction errors less room to hide.
          rock.scale.setScalar(.35);
          let hit = false, ticks = 0;
          const clock = makeFlightClock(THREE, flight, reducedMotion, dt => {
            if (hit) return;
            if (dodge && ticks === 30) flight.target.x = -1;
            const previous = rock.position.clone();
            flight.updateShipCourse(rock, dt);
            rock.position.addScaledVector(flight.flightMotion, -.85 * dt).addScaledVector(rock.userData.courseVelocity, dt);
            hit = flight.crossesHull(rock, previous, rock.position);
            ticks++;
            flight.setTime(startTime + ticks * dt);
            clock.move(dt, (startTime + ticks * dt) / 45);
          });
          for (let frame = 0; frame < Math.ceil(fps * (rock.userData.approachTime + 1)) && !hit; frame++) clock.frame(1 / fps);
          assert.equal(hit, !dodge,
            `Fixed-step hazard must hit held input but remain dodgeable (${fps} FPS, level=${level}, kick=${kick}, reduced=${reducedMotion})`);
        }
      }
    }
  }
}
console.log('PASS collision prediction and evasions at 5–144 FPS, early/late levels, strong sideways impulses and reduced motion');

for (const reducedMotion of [false, true]) {
  const arrivals = makeGame(reducedMotion);
  arrivals.setLevel(4); arrivals.setPressure(1 - Math.exp(-3 / 4)); arrivals.setupLevelFleet();
  arrivals.setTime(16);
  arrivals.flightOrientation.set(.2, -.4, 0, 'YXZ');
  arrivals.flightMotion.set(0, 0, -arrivals.levelFlightSpeed(16 / 45)).applyEuler(arrivals.flightOrientation);
  for (const ship of arrivals.ships.slice(0, 3)) {
    let intercepts = 0, left = 0, right = 0, up = 0, down = 0;
    for (let sample = 0; sample < 200; sample++) {
      arrivals.resetShip(ship);
      const data = ship.userData;
      assert.ok(data.previousPosition.equals(ship.position), 'Intercept placement must not cause a swept teleport');
      assert.equal(data.health, data.type.health, 'Intercepts must keep normal armor and scoring');
      if (!data.interceptCourse) {
        assert.equal(data.approachTime, 0, 'Reused cruise ships must clear the previous intercept');
        continue;
      }
      intercepts++;
      const velocity = data.courseVelocity.clone(), orientation = ship.quaternion.clone();
      const speed = arrivals.flightMotion.length() * .85, motion = reducedMotion ? .25 : 1;
      const lateral = velocity.dot(data.courseRight), vertical = velocity.dot(data.courseUp);
      if (lateral < 0) left++; else right++;
      if (vertical < 0) down++; else up++;
      assert.ok(Math.abs(velocity.dot(data.cruiseDirection) / speed - .35) < 1e-8);
      assert.ok(Math.abs(lateral) / speed >= .22 * motion - 1e-8 && Math.abs(lateral) / speed <= .34 * motion + 1e-8);
      assert.ok(Math.abs(vertical) / speed <= .12 * motion + 1e-8);
      assert.ok(data.approachTime > 3.5, 'All intercepts need a readable lead, plus hull clearance');
      assert.ok(new THREE.Vector3(0, 0, -1).applyQuaternion(orientation).dot(velocity.clone().normalize()) > .999999,
        'The nose and engines must follow the actual crossing course');
      const oldMotion = arrivals.flightMotion.clone();
      arrivals.target.set(-1, 1); arrivals.flightMotion.set(-600, 200, -800);
      // Even a rock directly in the way must not make an intercept curve after the pilot.
      const rock = arrivals.ships[4]; rock.position.copy(ship.position).addScaledVector(velocity, .5);
      arrivals.activeAsteroids.push(rock);
      for (let tick = 0; tick < 360; tick++) arrivals.updateShipCourse(ship, 1 / 60);
      assert.ok(data.courseVelocity.equals(velocity) && ship.quaternion.equals(orientation),
        'The entire crossing remains fixed after spawn, including the final pass');
      arrivals.activeAsteroids.length = 0; arrivals.flightMotion.copy(oldMotion); arrivals.target.set(0, 0);
    }
    assert.ok(intercepts > 70 && intercepts < 130, 'About half of each regular ship type should intercept');
    assert.ok(left > 20 && right > 20 && up > 20 && down > 20, 'Crossing courses must come from different sides');
    arrivals.resetShip(ship, true);
    assert.equal(ship.userData.interceptCourse, false, 'Do not change the opening formation or intro');
  }
  arrivals.resetShip(arrivals.capital);
  assert.equal(arrivals.capital.userData.interceptCourse, false, 'Keep the destroyer on its existing attack run');
  arrivals.flightMotion.set(0, 0, -1);
  for (let attempt = 0; attempt < 30; attempt++) {
    arrivals.resetShip(arrivals.ships[0]);
    assert.equal(arrivals.ships[0].userData.interceptCourse, false, 'Do not place nearby intercepts during resume acceleration');
  }
  arrivals.setupLevelFleet();
  assert.ok(arrivals.ships.filter(ship => ship.visible).every(ship => !ship.userData.interceptCourse));
}
console.log('PASS mixed intercepts for all regular ship types, readable lead, fixed nose/course, reuse and gentler reduced motion');

for (const reducedMotion of [false, true]) {
  for (const fps of [5, 20, 60, 144]) {
    for (const level of [1, 7]) {
      for (const kick of [false, true]) {
        for (const dodge of [false, true]) {
          for (const shipIndex of [0, 1, 2]) {
            const flight = makeGame(reducedMotion), startTime = level === 1 ? 2 : 34;
            flight.setLevel(level); flight.setPressure(1 - Math.exp(-(level - 1) / 4));
            flight.setTime(startTime);
            const speed = flight.levelFlightSpeed(startTime / 45), motion = reducedMotion ? .35 : 1;
            flight.target.set(.4 / (1.15 * motion), .12 / motion);
            flight.flightMotion.set(speed * (kick ? -.4 : .4), speed * (kick ? -.3 : .12), -speed);
            flight.flightOrientation.set(Math.atan2(flight.flightMotion.y, Math.hypot(speed, flight.flightMotion.x)),
              -Math.atan2(flight.flightMotion.x, speed), 0, 'YXZ');
            const ship = flight.ships[shipIndex];
            for (let attempt = 0; attempt < 32; attempt++) {
              flight.resetShip(ship);
              if (ship.userData.interceptCourse || flight.setShipIntercept(ship)) break;
            }
            assert.ok(ship.userData.interceptCourse, 'This flight should allow a readable crossing course');
            const velocity = ship.userData.courseVelocity.clone();
            let hit = false, ticks = 0, warning = false;
            const clock = makeFlightClock(THREE, flight, reducedMotion, dt => {
              if (hit) return;
              if (dodge && ticks === 30) flight.target.x = -1;
              const previous = ship.position.clone();
              flight.updateShipCourse(ship, dt);
              ship.position.addScaledVector(flight.flightMotion, -.85 * dt).addScaledVector(ship.userData.courseVelocity, dt);
              assert.ok(ship.userData.courseVelocity.equals(velocity), 'An intercept must not follow a changed heading');
              const future = ship.position.clone().addScaledVector(flight.flightMotion, -.85 * 1.6)
                .addScaledVector(velocity, 1.6);
              warning ||= flight.crossesHull(ship, ship.position, future, 8);
              hit = flight.crossesHull(ship, previous, ship.position);
              ticks++;
              flight.setTime(startTime + ticks * dt);
              clock.move(dt, (startTime + ticks * dt) / 45);
            });
            for (let frame = 0; frame < Math.ceil(fps * (ship.userData.approachTime + 1)) && !hit; frame++) clock.frame(1 / fps);
            const context = `${ship.userData.type.name}, ${fps} FPS, level=${level}, kick=${kick}, reduced=${reducedMotion}`;
            assert.equal(hit, !dodge, 'Intercept must hit held input but miss a deliberate dodge: ' + context);
            if (hit) {
              assert.ok(ticks / 60 >= 3, 'Leave at least three seconds before actual hull contact: ' + context);
              assert.ok(warning, 'The existing collision warning must recognize the intercept: ' + context);
            }
          }
        }
      }
    }
  }
}
console.log('PASS actual ship-hull intercepts and evasions at 5–144 FPS, early/late levels, impulses and reduced motion');

// Regression: a four-second intercept used to offer only ~0.17 seconds on screen
// after a diagonal reversal in portrait. Render visibility, not spawn age, is the contract.
let declinedIntercepts = 0, minimumVisibleLead = Infinity;
for (const reducedMotion of [false, true]) {
  for (const aspect of [390 / 844, 320 / 900, 16 / 10]) {
    for (const shipIndex of [0, 1, 2]) {
      let acceptedIntercepts = 0;
      for (const level of [1, 7]) for (const fps of [5, 60]) {
        for (const [from, to] of [
          [[0, 0], [0, 0]], [[1, 0], [1, 0]], [[1, 1], [1, 1]],
          [[1, 0], [-1, 0]], [[0, 1], [0, -1]], [[1, 1], [-1, -1]]
        ]) {
          const flight = makeGame(reducedMotion);
          flight.setLevel(level); flight.setPressure(1 - Math.exp(-(level - 1) / 4));
          flight.camera.aspect = aspect; flight.camera.updateProjectionMatrix();
          flight.ships.forEach(ship => { ship.visible = false; });
          const ship = flight.ships[shipIndex], motion = reducedMotion ? .35 : 1;
          for (let sample = 0; sample < 4; sample++) {
            ship.visible = false;
            let time = 13, pending = false, spawned = false, accepted = false;
            let contactTime = null, firstVisibleTime = null, spawnTime = null, velocity = null;
            const speed = flight.levelFlightSpeed(time / 45);
            flight.target.set(...from);
            flight.flightMotion.set(from[0] * speed * 1.15 * motion, from[1] * speed * motion, -speed);
            const clock = makeFlightClock(THREE, flight, reducedMotion, dt => {
              if (contactTime !== null || (spawned && !accepted)) return;
              time += dt; flight.setTime(time); clock.move(dt, time / 45);
              if (pending) {
                pending = false; spawned = true; spawnTime = time;
                flight.resetShip(ship);
                const position = ship.position.clone(), course = ship.userData.courseVelocity.clone();
                const rotation = ship.quaternion.clone(), approach = ship.userData.approachTime;
                const wasIntercept = ship.userData.interceptCourse, cameraRotation = flight.camera.quaternion.clone();
                accepted = flight.setShipIntercept(ship);
                assert.ok(flight.camera.quaternion.equals(cameraRotation), 'Planning must not move the real camera');
                if (!accepted) {
                  declinedIntercepts++;
                  assert.ok(ship.position.equals(position) && ship.userData.courseVelocity.equals(course)
                    && ship.quaternion.equals(rotation), 'Reject an unreadable course without moving the existing ship');
                  assert.equal(ship.userData.approachTime, approach);
                  assert.equal(ship.userData.interceptCourse, wasIntercept);
                  return;
                }
                acceptedIntercepts++;
                velocity = ship.userData.courseVelocity.clone();
              }
              if (!spawned) return;
              const previous = ship.position.clone();
              flight.updateShipCourse(ship, dt);
              ship.position.addScaledVector(flight.flightMotion, -.85 * dt).addScaledVector(ship.userData.courseVelocity, dt);
              assert.ok(ship.userData.courseVelocity.equals(velocity), 'Visibility planning must not become homing');
              if (flight.crossesHull(ship, previous, ship.position)) {
                contactTime = time;
                assert.ok(time - ship.userData.lastVisibleTime <= .3, 'A real rendered frame must authorize the contact');
              }
            });
            // Settle actual flight/camera motion, then switch input just before an arrival.
            for (let frame = 0; frame < 180; frame++) clock.frame(1 / 60);
            flight.target.set(...to); pending = true;
            for (let frame = 0; frame < fps * 15; frame++) {
              clock.frame(1 / fps);
              if (spawned && !accepted || contactTime !== null) break;
              flight.recordVisibleObjects(); // Once per display frame, never per catch-up tick.
              if (ship.userData.lastVisibleTime >= spawnTime && firstVisibleTime === null) {
                firstVisibleTime = ship.userData.lastVisibleTime;
              }
            }
            if (!accepted) continue;
            const context = `${ship.userData.type.name}, aspect=${aspect}, ${fps} FPS, level=${level}, ${from} -> ${to}, reduced=${reducedMotion}`;
            assert.ok(contactTime !== null && firstVisibleTime !== null, 'A readable intercept must still reach held input: ' + context);
            const visibleLead = contactTime - firstVisibleTime;
            minimumVisibleLead = Math.min(minimumVisibleLead, visibleLead);
            assert.ok(visibleLead >= 3 - 1e-8, `Visible approach too short (${visibleLead.toFixed(3)}s): ${context}`);
          }
        }
      }
      assert.ok(acceptedIntercepts > 8, 'Do not solve visibility by disabling intercepts for this ship/viewport/motion setting');
    }
  }
}
assert.ok(declinedIntercepts > 0, 'The matrix must exercise rejecting an unreadable approach');
console.log(`PASS at least three rendered seconds before contact across portrait/landscape, reversals, all ships, reduced motion and 5/60 FPS (min ${minimumVisibleLead.toFixed(3)}s)`);

const pacing = makeGame(); pacing.setLevel(4); pacing.setupLevelFleet();
for (const [start, end] of [[10, 15], [28, 33]]) {
  assert.equal(pacing.encounterRest(start - .01), false);
  assert.equal(pacing.encounterRest(start), true);
  assert.equal(pacing.encounterRest(end), false);
  const queueLength = pacing.queue.length;
  const existing = pacing.ships.filter(ship => ship.visible && !ship.userData.shower);
  for (const time of [start, end - .01]) {
    pacing.setTime(time); pacing.updateShipArrivals();
    assert.equal(pacing.queue.length, queueLength, 'Reinforcements should wait through the breather');
    assert.ok(existing.every(ship => ship.visible), 'Pacing must not remove existing visible threats');
  }
  pacing.setTime(end); pacing.updateShipArrivals();
  assert.equal(pacing.queue.length, queueLength - 1, 'Resume with one arrival, not a catch-up wave');
  pacing.updateShipArrivals();
  assert.equal(pacing.queue.length, queueLength - 1);
}
pacing.resetShip(pacing.capital); pacing.clearEnemyBolts();
pacing.capital.position.set(0, -50, -1500);
pacing.capital.userData.fireCooldown = 0; pacing.capital.userData.lastVisibleTime = 12;
pacing.setTime(12); pacing.updateCapitalShip(pacing.capital, 1 / 60);
assert.equal(pacing.enemyBolts.length, 0, 'The boss also holds new volleys during a breather');
assert.ok(pacing.capital.userData.fireCooldown >= .7, 'Resuming must leave a readable charging period');
pacing.setTime(15); pacing.capital.userData.lastVisibleTime = 15;
pacing.updateCapitalShip(pacing.capital, 1 / 60);
assert.equal(pacing.enemyBolts.length, 0);
console.log('PASS reinforcement breaks, existing-threat continuity, single arrivals and fair boss-volley resumption');

for (const reducedMotion of [false, true]) {
  const bends = makeGame(reducedMotion);
  for (const level of [1, 20]) for (const shape of [1, 2]) for (const sign of [-1, 1]) {
    bends.setLevel(level); bends.setupLevelFleet();
    const field = bends.shower(true, 2, shape, sign);
    assert.equal(Math.abs(bends.corridorCenter(0)), 0, 'Keep a straight, readable entry');
    assert.ok(Math.abs(bends.corridorCenter(field.length * .5)) > field.gap * (reducedMotion ? .2 : .5));
    assert.ok(Math.abs(bends.corridorCenter(field.length) - (shape === 1 ? 0 : field.bend)) < 1e-8);
    assert.ok(Math.abs(field.bend) <= field.gap * (reducedMotion ? .45 : 1.15) + 1e-8);
    const inverse = field.rotation.clone().invert();
    for (let slice = 0; slice < 7; slice++) {
      if (slice) {
        bends.worldStep.set(0, 0, field.length / 6 / .85);
        for (const rock of field.pool.filter(rock => rock.visible)) {
          rock.position.addScaledVector(bends.worldStep, .85);
          if (bends.hasPassedCamera(rock)) bends.queueShip(rock);
        }
        bends.updateAsteroidShower();
      }
      for (const rock of field.pool.filter(rock => rock.visible)) {
        const local = rock.position.clone().sub(field.origin).applyQuaternion(inverse);
        const clearance = Math.abs(local.y - bends.corridorCenter(-local.z)) - rock.userData.type.radius * rock.scale.x;
        assert.ok(clearance >= field.gap - 1e-7, 'Both curved walls must retain the full narrow passage');
        assert.equal(rock.userData.courseVelocity.lengthSq(), 0, 'A bent layout must not make rocks follow the player');
      }
    }
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    for (let i = 0; i < field.grit.count; i += 47) {
      field.grit.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
      assert.ok(Math.abs(position.y - bends.corridorCenter(-position.z)) - Math.max(scale.x, scale.y, scale.z) >= field.gap - 1e-4,
        'Decorative rocks must follow the same curve without covering the opening');
    }
    const center = bends.corridorCenter(field.length * .5);
    bends.flightOrientation.set(.3, -.6, 0); bends.target.set(1, 1); bends.worldStep.set(0, 0, 0);
    bends.updateAsteroidShower();
    assert.equal(bends.corridorCenter(field.length * .5), center, 'The planned bend must not retarget steering');
    bends.flightOrientation.set(0, 0, 0);
  }
}
console.log('PASS fixed arcing/offset corridors, coherent background geometry, full-length clearance and gentler reduced-motion bends');

for (const reducedMotion of [false, true]) {
  const repairs = makeGame(reducedMotion); repairs.setupLevelFleet();
  repairs.ships.forEach(ship => { ship.visible = false; }); repairs.camera.updateMatrixWorld();
  repairs.setShield(50); repairs.setRepairPending(true); repairs.setTime(9.99);
  repairs.updateRepairPickup(0); assert.equal(repairs.repairPickup.visible, false);
  repairs.setTime(10); repairs.setPaused(true); repairs.updateRepairPickup(0);
  assert.equal(repairs.repairPickup.visible, false, 'Pause cannot spawn or collect a repair');
  repairs.setPaused(false); repairs.updateRepairPickup(0);
  assert.equal(repairs.repairPickup.visible, true); assert.equal(repairs.repairPending, false);
  assert.ok(Math.abs(repairs.repairPickup.position.x) > 18, 'The pickup should require a small optional detour');
  assert.equal(repairs.repairMarker.hidden, false);
  const position = repairs.repairPickup.position.clone(), rotation = repairs.repairRing.rotation.z;
  repairs.worldStep.set(0, 0, 140); repairs.setPaused(true); repairs.updateRepairPickup(1);
  assert.ok(repairs.repairPickup.position.equals(position)); assert.equal(repairs.repairRing.rotation.z, rotation);
  repairs.setPaused(false); repairs.setCrashing(true); repairs.updateRepairPickup(1);
  assert.equal(repairs.shield, 50, 'Repairs cannot revive a crashed ship');
  repairs.setCrashing(false); repairs.setRoundEnded(true); repairs.updateRepairPickup(1);
  assert.ok(repairs.repairPickup.position.equals(position)); repairs.setRoundEnded(false);
  repairs.repairPickup.position.set(0, 0, -60); repairs.updateRepairPickup(1 / 60);
  assert.equal(repairs.shield, 75, 'Swept collection must work even when a frame crosses the pickup');
  assert.equal(repairs.repairPickup.visible, false); assert.equal(repairs.repairNotice.textContent, '+25 SCHILD');
  assert.deepEqual(repairs.sounds, ['reward']); repairs.updateRepairPickup(0);
  assert.deepEqual(repairs.sounds, ['reward'], 'Collection must happen only once');
  repairs.resetRepairPickup(); repairs.setRepairPending(true); repairs.setShield(100); repairs.worldStep.set(0, 0, 0);
  repairs.updateRepairPickup(0); assert.equal(repairs.repairPickup.visible, false, 'Save the opportunity while shield is full');
  repairs.setShield(90); repairs.setTime(28); repairs.updateRepairPickup(0);
  repairs.repairPickup.position.set(0, 0, -60); repairs.worldStep.set(0, 0, 140); repairs.updateRepairPickup(1 / 60);
  assert.equal(repairs.shield, 100); assert.equal(repairs.repairNotice.textContent, '+10 SCHILD');
  repairs.resetRepairPickup(); repairs.setRepairPending(true); repairs.setShield(50); repairs.worldStep.set(0, 0, 0);
  repairs.updateRepairPickup(0); repairs.repairPickup.position.set(100, 0, 200); repairs.updateRepairPickup(0);
  assert.equal(repairs.repairPickup.visible, false); assert.equal(repairs.shield, 50, 'Missed pickups do not repair automatically');
  repairs.setTime(29); repairs.updateRepairPickup(0); assert.equal(repairs.repairPickup.visible, false, 'A missed pickup does not respawn');
  repairs.setupLevelFleet();
  assert.equal(repairs.repairPickup.visible, false); assert.equal(repairs.repairNotice.hidden, true);
  assert.equal(repairs.scene.children.filter(object => object === repairs.repairPickup).length, 1, 'Reuse one pickup model across attempts');
}
const litRockShader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
game.asteroidShader(litRockShader);
assert.ok(litRockShader.fragmentShader.includes('totalEmissiveRadiance += vec3(0.7, 0.8, 1.0)'));
assert.ok(litRockShader.fragmentShader.includes('smoothstep(450.0, 1600.0, length(vViewPosition))'));
assert.ok(litRockShader.fragmentShader.includes('1.0 - smoothstep(2600.0, 3600.0, length(vViewPosition))'));
assert.equal((litRockShader.fragmentShader.match(/diffuseColor.a \*=/g) || []).length, 1, 'Edge lighting must not add a near fade');
console.log('PASS optional bounded shield repairs, swept collection, cap, pause/results/reset and surface-only asteroid lighting');
