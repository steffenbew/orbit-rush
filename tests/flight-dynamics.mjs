// No dependencies or build step: exercise the real gameplay functions with Three.js.
// Run from the project root: node tests/flight-dynamics.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { t, setLanguage } from '../i18n.js';
setLanguage('de');

const hazardInterval = 5 / .75;
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
  const mouseAim = new THREE.Vector2(), projectedShip = new THREE.Vector3();
  ${section('      function targetInfo(', '      function findTarget(')}
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
  if (crossingDanger !== null) {
    const crossing = setAsteroidCrossing;
    setAsteroidCrossing = (rock, time) => crossing(rock, time, crossingDanger);
  }
  return {
    scene, sounds, ships, activeAsteroids, camera, flightMotion, flightOrientation, worldStep, explosions, hits, enemyBolts, target,
    resetShip, fadeShipShader, targetInfo, updateShipCourse, avoidAsteroids, updateCapitalShip, updateEnemyBolts, recordVisibleObjects,
    updateShipHitFlash, updateEngineThrust, updateEngineVisuals, collideShipsWithAsteroids,
    clearEnemyBolts, playerLaserSpeed, setupLevelFleet, updateAsteroidShower, updateShipArrivals, queueShip,
    showerPool, maxShowerRocks, eventAsteroid, fadeAsteroidShader, asteroidShader, encounterRest, corridorCenter, corridorSlope,
    repairPickup, repairRing, repairMarker, repairNotice, updateRepairPickup, resetRepairPickup,
    get shield() { return shield; }, setShield: value => { shield = value; },
    get repairPending() { return repairPending; }, setRepairPending: value => { repairPending = value; },
    hazardPool, updateCollisionHazard, levelFlightSpeed, crossesHull, crossesPlayer, playerHullRotation, hasPassedCamera, asteroidArrivalDistance, setAsteroidCrossing,
    get nextHazardTime() { return nextHazardTime; },
    get nextShowerObstacle() { return nextShowerObstacle; },
    setLevel: value => { level = value; }, setPressure: value => { levelPressure = value; },
    setTime: value => { gameTime = value; },
    setPaused: value => { paused = value; },
    setRoundEnded: value => { roundEnded = value; }, setCrashing: value => { crashing = value; },
    shower: (corridor, strength, shape = 0, direction = 1) => {
      showerCorridor = corridor; showerStrength = strength; showerShape = shape;
      showerBend = direction * (reducedMotion ? .45 : 1.15); gameTime = showerStart;
      worldStep.set(0, 0, 0); updateAsteroidShower();
      return { pool: showerPool, grit: showerGrit, gap: showerHalfGap, length: showerLength,
        origin: showerOrigin, rotation: showerRotation, direction: showerDirection, velocity: showerVelocity, start: showerStart, end: showerEnd,
        width: showerHalfWidth * 2, spacing: showerSpacing, obstacleSpacing: showerObstacleSpacing, bend: showerBend };
    },
    get capital() { return capitalShip; }, get capitalPending() { return capitalPending; },
    get queue() { return spawnQueue; }
  };
`;
let seed = 12345;
const math = Object.create(Math);
math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const makeGame = (reducedMotion = false, crossingDanger = null) => new Function('THREE', 'Math', 'random', 'reducedMotion', 'crossingDanger', 't', code)(
  THREE, math, (a, b) => a + math.random() * (b - a), reducedMotion, crossingDanger, t
);

// Production builds the initial fleet before flightMotion is initialized.
for (const reducedMotion of [false, true]) {
  const initialFleet = new Function('THREE', 'reducedMotion', `
    const scene = new THREE.Scene(), glow = new THREE.Texture(), camera = new THREE.PerspectiveCamera();
    const random = (a, b) => a + Math.random() * (b - a);
    ${section('      const dark =', '      // Reuse one ship of each type')}
    const flightMotion = new THREE.Vector3();
    return ships;
  `)(THREE, reducedMotion);
  assert.equal(initialFleet.length, 8, 'Boot-time asteroid creation must not read uninitialized flight state');
  for (const ship of initialFleet.filter(ship => !ship.userData.type.asteroid)) {
    const openingSpeed = reducedMotion ? 35 : 180 * 1.15;
    assert.ok(Math.abs(ship.userData.courseVelocity.length() - openingSpeed * .85 * ship.userData.cruiseRatio) < 1e-8,
      'Opening traffic must match the increased flight speed, without changing reduced motion');
  }
}
console.log('PASS initial fleet creation before flight state initialization');

const flightSpeed = new Function('reducedMotion', 'levelPressure', 'progress', `
  ${section('      function levelFlightSpeed(', '      let capitalShip =')}
  return levelFlightSpeed(progress);
`);
for (const reducedMotion of [false, true]) for (const level of [1, 2, 6, 20, 1000]) {
  const pressure = 1 - Math.exp(-(level - 1) / 4);
  for (const progress of [0, .25, .5, .75, 1]) {
    const previousSpeed = reducedMotion ? 35 + pressure * 10 + (8 + pressure * 15) * progress
      : 180 + pressure * 380 + (140 + pressure * 560) * Math.pow(progress, 1.6);
    assert.ok(Math.abs(flightSpeed(reducedMotion, pressure, progress) / previousSpeed - (reducedMotion ? 1 : 1.15)) < 1e-8,
      'Flight must be 15% faster throughout every level, with reduced motion unchanged');
  }
}
console.log('PASS 15% faster flight across early/late levels and unchanged reduced-motion speed');

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
game.resetShip(ship, true); // Exercise cruising after the distant approach has finished.
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
assert.ok(minSide < -5 && maxSide > 5, 'Ships must still make gentle course changes');
assert.ok(Math.max(Math.abs(minSide), Math.abs(maxSide)) <= 35, 'Ordinary traffic should not sweep across the screen');
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
    assert.ok(reducedMotion ? data.spin.lengthSq() === 0 : data.spin.length() >= .04 - 1e-8 && data.spin.length() <= .6 + 1e-8,
      'Loose rocks receive varied potential spin rates, disabled in reduced motion');
    const velocity = data.courseVelocity.clone();
    const lateral = velocity.dot(data.courseRight);
    const vertical = velocity.dot(data.courseUp);
    const speed = courses.flightMotion.length() * .85;
    const movement = reducedMotion ? .25 : 1;
    const time = rock.position.dot(data.cruiseDirection) / speed;
    const crossingSpeed = Math.max(speed * .28 * movement,
      Math.hypot(data.lane, data.height) * (reducedMotion ? 1.5 : 2.5) / time);
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
        assert.ok(Math.abs(lateral) >= speed * .1 * movement - 1e-8);
        assert.ok(Math.abs(lateral) <= crossingSpeed + 1e-8);
        assert.ok(Math.abs(vertical) <= crossingSpeed * .5 + 1e-8);
      }
    }
    assert.ok(Math.abs(velocity.dot(data.cruiseDirection)) < 1e-8, 'Drift must follow the spawn heading, not world X');
    const pass = rock.position.clone().addScaledVector(velocity, time)
      .addScaledVector(courses.flightMotion, -.85 * time);
    const intended = data.courseRight.clone().multiplyScalar(data.lane).addScaledVector(data.courseUp, data.height);
    assert.ok(pass.distanceTo(intended) < 1e-8, 'Crossings and background drift must preserve their off-axis pass points');
    assert.ok(data.dangerousCrossing ? intended.length() >= 14 - 1e-8 && intended.length() <= 20 + 1e-8
      : intended.length() >= data.type.radius * rock.scale.x + 12 - 1e-8,
      'Mix real wing intersections with near-passes, without aiming at the camera center');
    if (velocity.lengthSq() <= 25) assert.ok(intended.length() >= 60 - 1e-8, 'Stationary/slow rocks stay outside the central approach lane');
    assert.ok(data.previousPosition.equals(rock.position), 'Spawn compensation must not look like a swept teleport');
    courses.target.set(-1, 1); courses.flightMotion.set(-200, 100, -400);
    courses.flightOrientation.set(-.3, .5, 0, 'YXZ');
    courses.updateShipCourse(rock, .5);
    assert.ok(data.courseVelocity.equals(velocity), 'Asteroids must not steer after the player');
  }
  assert.ok(left > 15 && right > 15 && up > 15 && down > 15,
    'Moving asteroids should retain directional variety');
  assert.ok(stationary > sampleCount * .05 && stationary < sampleCount * .2,
    `Retain some stationary background rocks, got ${stationary}/${sampleCount}`);
  assert.ok(gentle > sampleCount * .15 && gentle < sampleCount * .35,
    `Retain gentle off-axis drift, got ${gentle}/${sampleCount}`);
  assert.ok(diagonal > sampleCount * .5 && diagonal < sampleCount * .8,
    `Close approaches should visibly cross rather than fly head-on, got ${diagonal}/${sampleCount}`);
}
console.log('PASS diagonal loose-rock passes, calm off-axis background rocks, fixed trajectories and reduced motion');

// A nonzero velocity alone is not enough: an exact interception can still have constant screen bearing.
for (const reducedMotion of [false, true]) for (const speed of reducedMotion ? [35, 55] : [180, 600, 1100]) {
  const crossing = makeGame(reducedMotion); crossing.setLevel(3);
  crossing.camera.position.set(20, -10, 5);
  crossing.flightOrientation.set(.2, -.4, 0, 'YXZ');
  crossing.camera.quaternion.setFromEuler(crossing.flightOrientation); crossing.camera.updateMatrixWorld();
  crossing.flightMotion.set(0, 0, -speed).applyEuler(crossing.flightOrientation);
  const rock = crossing.ships[4];
  for (const aspect of [16 / 9, 430 / 932]) for (let sample = 0; sample < 20; sample++) {
    crossing.camera.aspect = aspect; crossing.camera.updateProjectionMatrix(); crossing.resetShip(rock);
    const time = Math.max(3, crossing.asteroidArrivalDistance(rock) / (speed * .85));
    rock.position.copy(crossing.camera.position).addScaledVector(crossing.flightMotion, .85 * time);
    crossing.setAsteroidCrossing(rock, time, false);
    const start = rock.position.clone().project(crossing.camera);
    const middle = rock.position.clone().addScaledVector(rock.userData.courseVelocity, time * .75)
      .addScaledVector(crossing.flightMotion, -.85 * time * .75).project(crossing.camera);
    const end = rock.position.clone().addScaledVector(rock.userData.courseVelocity, time * .9)
      .addScaledVector(crossing.flightMotion, -.85 * time * .9).project(crossing.camera);
    assert.ok(start.x * end.x < 0, 'Crossings must travel from one side of the view to the other');
    assert.ok(Math.abs(middle.x - start.x) > (reducedMotion ? .04 : .08),
      'The trajectory must visibly change screen bearing well before the close pass');
  }
}
console.log('PASS visible screen-space crossings, not constant-bearing impacts, at slow/fast speeds and portrait/landscape');

for (const corridor of [false, true]) {
  game.setupLevelFleet();
  const field = game.shower(corridor, 2);
  const active = field.pool.filter(item => item.visible);
  assert.ok(active.length >= (corridor ? 16 : 9));
  assert.ok(active.every(item => item.userData.hull.transparent && item.userData.hull.opacity === 0));
  if (corridor) assert.ok(active.every(item => item.userData.courseVelocity.equals(field.velocity)), 'Corridor rocks must drift together without closing their safe gaps');
  assert.ok(active.every(item => item.userData.hull.onBeforeCompile === game.asteroidShader),
    'Pooled/cloned materials must keep the distance-fade shader');
  assert.ok(field.width <= 1800, 'Field width must not scale with distant view width');
  assert.ok(field.end - field.start <= 20, 'Field length should stay within its shorter travel budget');
  assert.equal(field.grit.material.transparent, false, 'Instances must not use unsorted transparent blending');
  assert.equal(field.grit.material.alphaHash, true, 'Discard faded samples instead of leaving invisible occluders');
  assert.equal(field.grit.material.depthWrite, true, 'Debris must depth-test against other instances and real rocks');
  const matrix = new THREE.Matrix4(), gritPosition = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  for (let i = 0; i < field.grit.count; i++) {
    field.grit.getMatrixAt(i, matrix); matrix.decompose(gritPosition, rotation, scale);
    assert.ok(Math.max(scale.x, scale.y, scale.z) <= (corridor ? 26 * 1.7 : 3.4) + 1e-5,
      'Corridor boulders stay bounded; free showers retain their fine grit');
    if (corridor) assert.ok(Math.abs(gritPosition.y - game.corridorCenter(-gritPosition.z)) - Math.max(scale.x, scale.y, scale.z) >= field.gap + 6 - 1e-4,
      'Dense ring layers must still leave the full flight slit clear');
  }
  assert.equal(field.grit.material.opacity, 0);
  assert.ok(active.every(item => item.position.distanceTo(game.camera.position) - item.userData.type.radius * item.scale.x > 3600),
    'Slanted streams must still spawn wholly beyond the distance fade');
  const localPosition = rock => rock.position.clone().sub(field.origin).applyQuaternion(field.rotation.clone().invert());
  if (corridor) {
    const walls = active.filter(item => Math.abs(localPosition(item).y) >= field.gap);
    assert.equal(walls.length, 16);
    assert.ok(walls.every(item => Math.abs(localPosition(item).y) - item.userData.type.radius * item.scale.x >= field.gap));
    assert.equal(field.grit.count, 12000);
  } else {
    assert.ok(active.every(item => Math.abs(localPosition(item).y) <= 380), 'Free showers retain their scatter volume along the stream axes');
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
      const previousGap = .6 * Math.max(45, 130 - strength * 22 - (level - 1) * 3);
      assert.ok(Math.abs(field.gap - Math.max(27, previousGap * 2 / 3)) < 1e-8,
        'Narrow the flight slit by a third until reaching the existing safety minimum');
      assert.ok(field.gap >= 27, 'Keep a minimum 54-unit clear passage at high levels');
      assert.equal(field.width, 1800, 'Keep the core width fixed rather than scaling with the viewport');
      const walls = field.pool.filter(rock => rock.visible);
      assert.equal(walls.length, [8, 12, 16][strength]);
      for (const rock of walls) {
        const local = rock.position.clone().sub(field.origin).applyQuaternion(field.rotation.clone().invert());
        const offset = Math.abs(local.y) - rock.userData.type.radius * rock.scale.x - field.gap;
        const fringe = THREE.MathUtils.smoothstep(Math.abs(local.x), 540, 1450);
        assert.ok(Math.abs(local.x) <= 1450, 'Shootable walls also taper into the side fringe');
        assert.ok(offset >= -1e-8 && offset <= 70 + fringe * 80 + 1e-8,
          'Loosen the ring layers while keeping wall rocks outside the flight gap');
      }
      assert.equal(field.grit.count, [7200, 9600, 12000][strength]);
      assert.equal(field.grit.instanceMatrix.count, 12000, 'Dense layers still use a fixed instance budget');
      const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
      const cells = [Array(64).fill(0), Array(64).fill(0)], sizes = [];
      const density = Array(5).fill(0), outliers = [0, 0];
      let looseCore = 0;
      for (let i = 0; i < field.grit.count; i++) {
        field.grit.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
        const side = i % 2, offset = Math.abs(position.y) - field.gap - scale.x * 1.7;
        assert.equal(Math.sign(position.y), side ? 1 : -1);
        assert.ok(scale.x >= 4 - 1e-5 && scale.x <= 26 + 1e-5);
        const distance = Math.abs(position.x), fringe = THREE.MathUtils.smoothstep(distance, 540, 1450);
        assert.ok(distance <= 1450, 'The scattered fringe stays bounded in world space');
        assert.ok(offset >= 6 - 1e-4 && offset <= 65 + fringe * 100 + 1e-4,
          'Gravel layers gain depth toward the fringes but never enter the flight gap');
        if (distance < 540 && offset > 36) looseCore++;
        density[Math.min(4, Math.floor(distance / 290))]++;
        if (distance > 900) outliers[position.x < 0 ? 0 : 1]++;
        const column = Math.min(7, Math.floor((position.x / (field.width + 1100) + .5) * 8));
        const row = Math.min(7, Math.floor(-position.z / field.length * 8));
        cells[side][row * 8 + column]++;
        sizes.push(scale.x);
      }
      for (const side of cells) {
        assert.equal(side.reduce((sum, count) => sum + count, 0), field.grit.count / 2);
        assert.ok(side.every(count => count > 0), 'Both ring layers must extend through the fringe along the whole field');
        assert.ok(side.every((count, cell) => cell % 8 < 2 || cell % 8 > 5 || count >= 10), 'Keep a recognizable dense ring core');
      }
      assert.ok(outliers.every(count => count > field.grit.count * .05), 'Scatter rocks beyond both old cut-off edges');
      assert.ok(density[0] > density[2] * 1.1 && density[2] > density[3] * 1.3 && density[3] > density[4] * 1.8,
        'Density must taper progressively toward both outer edges, not form another hard wall');
      assert.ok(looseCore > field.grit.count * .15, 'Spread out the central layers too, not just the side fringe');
      assert.ok(Math.max(...sizes) - Math.min(...sizes) > 21, 'Mix small rubble with substantially larger boulders');
      assert.ok(sizes.filter(size => size > 18).length > field.grit.count * .1, 'Large boulders must be common enough to notice');
      assert.ok(sizes.filter(size => size < 10).length > field.grit.count * .6, 'Keep small rubble rather than replacing the entire ring with giants');
    }
  }
}
console.log('PASS uneven ring layers, progressively scattered side fringes, unchanged narrow slit and bounded instance budget');

// Compare the same seeded layout: only the ceiling/floor separation should change.
const widerCode = code.replace('showerHalfGap = Math.max(27, .4 *', 'showerHalfGap = Math.max(27, .6 *');
assert.notEqual(widerCode, code);
const savedSeed = seed;
for (const corridor of [false, true]) {
  seed = 2048;
  const before = new Function('THREE', 'Math', 'random', 'reducedMotion', 'crossingDanger', 't', widerCode)(
    THREE, math, (a, b) => a + math.random() * (b - a), false, null, t);
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
    const offset = new THREE.Vector3(0, -side * shift, 0).applyQuaternion(tighter.rotation);
    assert.ok(newRock.position.distanceTo(oldRock.position.clone().add(offset)) < 1e-8,
      'Move actual ceiling and floor collision rocks equally toward the center in the stream frame');
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
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  fading.fadeAsteroidShader(shader);
  const band = shader.fragmentShader.match(/1\.0 - smoothstep\((\d+)\.0, (\d+)\.0, length\(vViewPosition\)\)/);
  assert.ok(band);
  assert.deepEqual(band.slice(1).map(Number), reducedMotion ? [400, 700] : [2600, 3600]);
  for (const distance of [reducedMotion ? 350 : 650, 250, 100, 10, 0, -10]) {
    assert.equal(1 - THREE.MathUtils.smoothstep(Math.abs(distance), Number(band[1]), Number(band[2])), 1,
      'The real shader must stay fully opaque throughout close approaches and passes');
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
      const fadeBoundary = reducedMotion ? 700 : 3600;
      assert.ok(minimum - rock.userData.type.radius * rock.scale.x >= fadeBoundary + 200,
        'The whole hull of every size starts beyond the fully invisible distance boundary');
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
      assert.ok(time >= arrivals.asteroidArrivalDistance(hazard) / (-arrivals.flightMotion.z * .85),
        'Even small/reduced-motion threats need a distant approach, not a fixed three-second near spawn');
      const predicted = hazard.position.clone().addScaledVector(hazard.userData.courseVelocity, time);
      assert.ok(predicted.length() >= arrivals.asteroidArrivalDistance(hazard) - 1e-6,
        'Scheduled rocks also need a distant starting point');
      assert.ok(hazard.position.distanceTo(arrivals.camera.position) - hazard.userData.type.radius * hazard.scale.x
        > (reducedMotion ? 700 : 3600), 'Actual scheduled hulls—not only their forecast pass points—start outside visibility');
      assert.equal(arrivals.nextHazardTime, 2 + hazardInterval, 'Longer approaches must not accelerate the reduced spawn cadence');
    }
  }
}
console.log('PASS distant 0.3-second blends for every regular/hazard size, including reduced motion');

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
    const start = field.start, seenSpawns = new Map(), fadeBoundary = speed === 40 ? 700 : 3600;
    let peak = 0;
    for (let frame = 0; frame < 90 * 60; frame++) {
      bounded.setTime(start + frame / 60);
      bounded.worldStep.set(0, 0, speed / 60);
      bounded.updateAsteroidShower(1 / 60);
      const active = field.pool.filter(item => item.visible);
      peak = Math.max(peak, active.length);
      for (const rock of active) {
        if (seenSpawns.get(rock) !== rock.userData.spawn) {
          seenSpawns.set(rock, rock.userData.spawn);
          assert.ok(rock.position.distanceTo(bounded.camera.position) - rock.userData.type.radius * rock.scale.x > fadeBoundary,
            'Every shower slice and reused rock must spawn wholly outside the visible range');
        }
        bounded.updateShipCourse(rock, 1 / 60);
        rock.position.addScaledVector(bounded.worldStep, .85).addScaledVector(rock.userData.courseVelocity, 1 / 60);
        if (rock.userData.courseAge <= .3) assert.ok(rock.position.distanceTo(bounded.camera.position)
          - rock.userData.type.radius * rock.scale.x > fadeBoundary, 'Finish the timed blend while the whole rock is still distant and invisible');
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
console.log('PASS distant shower spawns/blends across all slices, slow/fast flights, ultrawide, reuse and bounded pools');

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
assert.equal(boss.userData.maxHealth, 60, 'The boss has twice its previous 30-hit armor');
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
assert.equal(boss.userData.health, boss.userData.maxHealth - 3);
rock.visible = true; game.collideShipsWithAsteroids();
assert.equal(boss.userData.health, boss.userData.maxHealth - 3, 'A debris cluster must not strip capital armor in one frame');
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
  engineShip.position.set(0, 0, -500); // Test thrust where the arrival fade has finished.
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
    assert.equal(cadence.capital.userData.health, 60);
    const spawn = cadence.capital.userData.spawn;
    cadence.capital.userData.health = 0; cadence.queueShip(cadence.capital);
    cadence.setTime(7.5); cadence.updateShipArrivals();
    assert.equal(cadence.capital.visible, false, 'A defeated boss must not respawn in the same attempt');
    assert.equal(cadence.capital.userData.spawn, spawn);
    // A retry of a boss level restores exactly one fresh encounter.
    cadence.setTime(0); cadence.setupLevelFleet();
    cadence.setTime(6); cadence.updateShipArrivals();
    assert.equal(cadence.capital.visible, true);
    assert.equal(cadence.capital.userData.health, 60);
    assert.equal(cadence.capital.userData.spawn, spawn + 1);
  }
  if (level < 4) assert.equal(cadence.capital, null);
}
assert.equal(cadence.ships.filter(ship => ship.userData.type.capital).length, 1);
console.log('PASS boss only on levels 4/8/12/16, pause, single encounter, retry and model reuse');

const threats = makeGame(false, false); threats.setupLevelFleet();
threats.setTime(1.99); threats.updateCollisionHazard();
assert.equal(threats.hazardPool.length, 0);
threats.setTime(2); threats.updateCollisionHazard();
assert.equal(threats.hazardPool.length, 1);
const hazard = threats.hazardPool[0];
assert.equal(threats.nextHazardTime, 2 + hazardInterval);
assert.equal(hazard.userData.asteroidTier, 1);
assert.equal(hazard.userData.hull.opacity, 0, 'Scheduled threats must also fade in');
const passPoint = hazard.position.clone().addScaledVector(hazard.userData.courseVelocity, hazard.userData.approachTime);
assert.ok(Math.abs(passPoint.x - hazard.userData.lane) < 1e-8 && Math.abs(passPoint.y - hazard.userData.height) < 1e-8,
  'Scheduled crossings must pass beside the forecast flight path, not target the camera');
assert.ok(Math.hypot(passPoint.x, passPoint.y) >= hazard.userData.type.radius * hazard.scale.x + 12);
assert.ok(hazard.position.x * passPoint.x < 0 && hazard.userData.courseVelocity.length() > 5,
  'Every scheduled rock crosses from the opposite side with actual motion');
assert.ok(hazard.position.z < -threats.asteroidArrivalDistance(hazard), 'Even a decelerating forecast must spawn beyond the distant fade boundary');
const fixedPosition = hazard.position.clone();
threats.flightMotion.x = 200; threats.target.x = .5;
threats.setTime(2 + hazardInterval - .01); threats.updateCollisionHazard();
assert.ok(hazard.position.equals(fixedPosition), 'Existing threats must not track steering');
assert.equal(threats.hazardPool.length, 1);
threats.setTime(2 + hazardInterval); threats.setPaused(true); threats.updateCollisionHazard();
assert.equal(threats.hazardPool.length, 1);
threats.setPaused(false); threats.updateCollisionHazard();
assert.equal(threats.hazardPool.length, 2);
const nextCrossing = threats.hazardPool[1];
assert.ok(nextCrossing.position.x + nextCrossing.userData.courseVelocity.x * nextCrossing.userData.approachTime
  - nextCrossing.userData.lane > 0, 'The next crossing must be placed ahead of the new course');
const queueLength = threats.queue.length;
threats.queueShip(hazard);
assert.equal(threats.queue.length, queueLength, 'Scheduled threats must not join normal respawns');
threats.setTime(12); threats.updateCollisionHazard();
assert.equal(hazard.visible, false, 'No early replacement during the first breather');
const thirdHazardTime = threats.nextHazardTime;
threats.setTime(thirdHazardTime); threats.updateCollisionHazard();
assert.equal(hazard.visible, true);
assert.equal(threats.nextHazardTime, thirdHazardTime + hazardInterval);
const spawn = hazard.userData.spawn;
threats.queueShip(hazard); threats.setTime(32); threats.updateCollisionHazard();
assert.equal(hazard.visible, false, 'The second breather also defers hazards');
threats.setTime(33); threats.updateCollisionHazard();
assert.equal(hazard.userData.spawn, spawn + 1, 'A long frame must not spawn catch-up waves');
assert.equal(threats.nextHazardTime, 33 + hazardInterval);
threats.setTime(33 + hazardInterval); threats.updateCollisionHazard();
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
console.log('PASS unchanged crossing schedule, distant approaches, fixed courses, pause, reuse and reset');

for (const reducedMotion of [false, true]) {
  for (const speed of (reducedMotion ? [35, 55] : [200, 600, 1100])) {
    for (const lane of ['hold', 'intercept', 'evade']) {
      const flight = makeGame(reducedMotion, false);
      flight.setLevel(3); flight.setupLevelFleet();
      const motion = reducedMotion ? .35 : 1;
      flight.target.set(.4 / (1.15 * motion), .12 / motion);
      flight.flightMotion.set(speed * .4, speed * .12, -speed);
      flight.setTime(2); flight.updateCollisionHazard();
      const rock = flight.hazardPool[0];
      const passOffset = rock.userData.courseRight.clone().multiplyScalar(rock.userData.lane)
        .addScaledVector(rock.userData.courseUp, rock.userData.height);
      // A parallel flight lane through the pass point must still hit the real hull.
      const probe = flight.camera.position.clone();
      if (lane === 'intercept') probe.add(passOffset);
      let hit = false;
      for (let frame = 0; frame < Math.ceil((rock.userData.approachTime + 1) * 60); frame++) {
        if (lane === 'evade' && frame === 30) flight.target.y = -Math.sign(passOffset.y);
        const previous = rock.position.clone();
        flight.updateShipCourse(rock, 1 / 60);
        rock.position.addScaledVector(flight.flightMotion, -.85 / 60)
          .addScaledVector(rock.userData.courseVelocity, 1 / 60);
        if (flight.crossesPlayer(rock, previous, rock.position, 0, probe)) {
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
      assert.equal(hit, lane === 'intercept', `Crossings must miss held flight and evasions but collide on intersecting lanes (${speed}, lane=${lane}, reduced=${reducedMotion})`);
    }
  }
}
console.log('PASS readable near-passes, real intersecting-lane collisions and evasions at slow/fast/reduced-motion speeds');

// Drive the real accumulator and steering code, not one physics step per display frame.
const makeFlightClock = new Function('THREE', 'flight', 'reducedMotion', 'updateSimulation', `
  const {target, flightMotion, flightOrientation, camera, playerHullRotation, levelFlightSpeed} = flight;
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
        for (const lane of ['hold', 'intercept', 'evade']) {
          const flight = makeGame(reducedMotion, false), startTime = level === 3 ? 2 : 38;
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
          const passOffset = rock.userData.courseRight.clone().multiplyScalar(rock.userData.lane)
            .addScaledVector(rock.userData.courseUp, rock.userData.height);
          const probe = flight.camera.position.clone();
          if (lane === 'intercept') probe.add(passOffset);
          let hit = false, pointHit = false, ticks = 0;
          const clock = makeFlightClock(THREE, flight, reducedMotion, dt => {
            if (lane === 'evade' && ticks === 30) flight.target.y = -Math.sign(passOffset.y);
            const previous = rock.position.clone();
            flight.updateShipCourse(rock, dt);
            rock.position.addScaledVector(flight.flightMotion, -.85 * dt).addScaledVector(rock.userData.courseVelocity, dt);
            hit ||= flight.crossesPlayer(rock, previous, rock.position, 0, probe);
            pointHit ||= flight.crossesHull(rock, previous, rock.position, 0, probe);
            ticks++;
            flight.setTime(startTime + ticks * dt);
            // A distant late-level approach can extend beyond this test's round;
            // keep speed capped just like the production forecast, not above max difficulty.
            clock.move(dt, Math.min(1, (startTime + ticks * dt) / 45));
          });
          for (let frame = 0; frame < Math.ceil(fps * (rock.userData.approachTime + 1)); frame++) clock.frame(1 / fps);
          // An existing sideways impact can now carry a wing into the crossing even if the camera clears it.
          // Still forbid centered interceptions on held input, including the entire post-graze trajectory.
          assert.equal(lane === 'hold' && kick ? pointHit : hit, lane === 'intercept',
            `Fixed-step crossing must respect the full hull and real impulse-driven scrapes (${fps} FPS, level=${level}, kick=${kick}, lane=${lane}, reduced=${reducedMotion})`);
        }
      }
    }
  }
}
console.log('PASS near-pass prediction, actual collisions and evasions at 5–144 FPS, early/late levels, sideways impulses and reduced motion');

// Reinforcements enter from far ahead, never as nearby diagonal ambushes.
for (const reducedMotion of [false, true]) {
  const arrivals = makeGame(reducedMotion);
  arrivals.camera.position.set(20, -10, 5);
  arrivals.flightOrientation.set(.2, -.4, 0, 'YXZ');
  arrivals.flightMotion.set(0, 0, -400).applyEuler(arrivals.flightOrientation);
  for (const ship of arrivals.ships.slice(0, 3)) {
    for (let sample = 0; sample < 30; sample++) {
      arrivals.resetShip(ship);
      const data = ship.userData;
      const local = ship.position.clone().sub(arrivals.camera.position)
        .applyQuaternion(new THREE.Quaternion().setFromEuler(arrivals.flightOrientation).invert());
      assert.ok(-local.z >= (reducedMotion ? 1200 : 3800) - 1e-8);
      assert.ok(Math.abs(local.x) <= 260 && Math.abs(local.y) <= 156, 'Arrival lanes must stay forward, not out to the sides');
      assert.ok(data.previousPosition.equals(ship.position), 'Reuse must not cause a swept teleport');
      assert.equal(data.courseVelocity.length(), 0, 'Far traffic must approach before matching player speed');
      assert.equal(data.health, data.type.health);
      ship.traverse(part => {
        if (!part.isMesh || part.userData.engineExhaust) return;
        assert.equal(part.material.onBeforeCompile, arrivals.fadeShipShader, 'Every hull panel and engine core must fade at distance');
        assert.equal(part.material.alphaHash, true);
        assert.equal(part.material.transparent, false);
        assert.equal(part.material.depthWrite, true);
      });
      for (const flame of data.flames) {
        assert.equal(flame.material.opacity, 0, 'No engine glow may reveal a distant spawn');
        assert.ok(flame.userData.plume.children.every(ribbon => ribbon.material.opacity === 0));
      }
      arrivals.camera.updateMatrixWorld();
      ship.position.copy(arrivals.camera.position).addScaledVector(data.cruiseDirection, reducedMotion ? 1050 : 3100);
      assert.equal(arrivals.targetInfo(ship), null, 'Target brackets must not reveal still-fading arrivals');
      ship.position.copy(arrivals.camera.position).addScaledVector(data.cruiseDirection, 500);
      assert.ok(arrivals.targetInfo(ship), 'Nearby traffic must remain targetable');
      arrivals.updateEngineVisuals(ship);
      assert.ok(data.flames.every(flame => flame.material.opacity > 0), 'Nearby engines must remain visible');
    }
    arrivals.resetShip(ship, true);
    assert.ok(ship.position.z > -1200, 'Keep the two opening targets and intro formation');
  }
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  arrivals.fadeShipShader(shader);
  assert.ok(shader.fragmentShader.includes(reducedMotion ? 'smoothstep(900.0, 1200.0' : 'smoothstep(2600.0, 3600.0'));
}
console.log('PASS distant forward arrivals, heading/translation, whole-model fades, hidden spawn glows and unchanged opening formation');

for (const reducedMotion of [false, true]) {
  for (const level of [1, 7]) for (const fps of [5, 60, 144]) for (const aspect of [390 / 844, 16 / 9]) {
    // Compare the same traffic across frame rates, independent of earlier debris counts.
    seed = 12345;
    const flight = makeGame(reducedMotion);
    flight.setLevel(level); flight.setPressure(1 - Math.exp(-(level - 1) / 4));
    flight.flightMotion.set(0, 0, -flight.levelFlightSpeed(0));
    flight.camera.aspect = aspect; flight.camera.updateProjectionMatrix();
    const traffic = flight.ships.slice(0, 3);
    traffic.forEach(ship => flight.resetShip(ship));
    const entered = new Set(), seenAt = new Map();
    let time = 0;
    const clock = makeFlightClock(THREE, flight, reducedMotion, dt => {
      time += dt; flight.setTime(time);
      clock.move(dt, time / 45);
      for (const ship of traffic) {
        flight.updateShipCourse(ship, dt);
        ship.position.addScaledVector(flight.flightMotion, -.85 * dt).addScaledVector(ship.userData.courseVelocity, dt);
        const data = ship.userData, depth = -ship.position.z;
        if (depth <= 180) continue; // Final passes intentionally stop lane correction.
        assert.ok(Math.abs(ship.position.x - data.lane) <= 60, 'Cruising should stay near its original lane, including inertial overshoot');
        assert.ok(Math.abs(ship.position.y - data.height) <= 27, 'Vertical course changes must stay gentle, including inertial overshoot');
        assert.ok(Math.abs(data.courseVelocity.x) <= (reducedMotion ? 9 : 35));
      }
    });
    for (let frame = 0; frame < fps * 40; frame++) {
      clock.frame(1 / fps);
      for (const ship of traffic) {
        const depth = -ship.position.z;
        if (depth < (reducedMotion ? 900 : 2600) && !seenAt.has(ship)) seenAt.set(ship, time);
        if (depth < (reducedMotion ? 350 : 1100) && !entered.has(ship)) {
          entered.add(ship);
          assert.ok(time - seenAt.get(ship) > 3, 'Traffic must approach visibly for several seconds, not pop into combat range');
        }
      }
      if (entered.size === traffic.length) break;
    }
    assert.equal(entered.size, traffic.length,
      `Distant arrivals must reach the playable area within a level (level=${level}, fps=${fps}, reduced=${reducedMotion}, aspect=${aspect})`);
  }
}
console.log('PASS mostly straight, gradual approaches within the level at 5–144 FPS, portrait/landscape and reduced motion');

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
        const radius = rock.userData.type.radius * rock.scale.x;
        const offset = Math.abs(local.y - bends.corridorCenter(-local.z));
        if (rock.userData.corridorObstacle) {
          assert.ok(offset <= field.gap * .35 + 1e-7, 'Interior hazards must stay in the curved flight passage');
          assert.ok(Math.abs(local.x) + radius + 40 < field.width / 2, 'Even large boulders must leave lateral escape routes');
          if (reducedMotion) assert.ok(offset + radius <= field.gap - 4 + 1e-7, 'Reduced-motion obstacles stay small');
        } else {
          assert.ok(offset - radius >= field.gap - 1e-7, 'Both curved walls must retain the full narrow passage');
        }
        assert.ok(rock.userData.courseVelocity.equals(field.velocity), 'A bent layout keeps its shared stream, never following the player');
      }
    }
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    for (let i = 0; i < field.grit.count; i += 47) {
      field.grit.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
      assert.ok(Math.abs(position.y - bends.corridorCenter(-position.z)) - Math.max(scale.x, scale.y, scale.z) >= field.gap + 6 - 1e-4,
        'Both dense ring layers must follow the curve without covering the narrow opening');
    }
    const center = bends.corridorCenter(field.length * .5);
    bends.flightOrientation.set(.3, -.6, 0); bends.target.set(1, 1); bends.worldStep.set(0, 0, 0);
    bends.updateAsteroidShower();
    assert.equal(bends.corridorCenter(field.length * .5), center, 'The planned bend must not retarget steering');
    bends.flightOrientation.set(0, 0, 0);
  }
}
console.log('PASS fixed arcing/offset corridors, coherent background geometry, full-length clearance and gentler reduced-motion bends');

const passageTiers = new Set(), passageScales = new Set();
let passageCount = 0, centerThreats = 0, scatteredObstacles = 0, oversizedWalls = 0;
for (const reducedMotion of [false, true]) for (const level of [1, 20]) for (const shape of [0, 1, 2]) for (const strength of [0, 1, 2]) {
  const hazards = makeGame(reducedMotion), speed = reducedMotion ? 40 : 400;
  hazards.flightMotion.set(0, 0, -speed);
  hazards.setLevel(level); hazards.setupLevelFleet();
  const field = hazards.shower(true, strength, shape);
  const approachSpeed = hazards.flightMotion.clone().multiplyScalar(.85).sub(field.velocity).length();
  const lead = Math.max((reducedMotion ? 900 : 3800) + approachSpeed * .3, approachSpeed * 5.5);
  assert.ok(field.pool.every(rock => !rock.userData.corridorObstacle), 'Leave the first entry slice clear');
  assert.equal(field.obstacleSpacing, Math.max(260, approachSpeed * (reducedMotion ? 3.6 : [2.2, 1.8, 1.5][strength])));
  for (const rock of field.pool.filter(rock => rock.visible)) {
    const baseScale = [.35, 1.3, 2.8][rock.userData.asteroidTier - 1];
    assert.ok(rock.scale.x >= baseScale * .75 && rock.scale.x <= baseScale * 1.35);
    if (rock.scale.x > 2.8) oversizedWalls++;
  }
  let count = 0, lastDepth = -Infinity;
  for (let travel = 100; travel <= lead + field.length + 300; travel += 100) {
    // These are fixed field rocks, not targeted reinforcements: the formation survives breathers.
    hazards.setTime(12);
    hazards.worldStep.copy(field.direction).multiplyScalar(-100 / .85);
    for (const rock of field.pool.filter(rock => rock.visible)) {
      rock.position.addScaledVector(hazards.worldStep, .85);
      if (hazards.hasPassedCamera(rock)) hazards.queueShip(rock);
    }
    hazards.updateAsteroidShower();
    const spawned = field.pool.filter(rock => rock.visible && rock.userData.corridorObstacle && rock.userData.courseAge === 0);
    assert.ok(spawned.length <= 1, 'Never introduce a group of gap obstacles together');
    for (const rock of spawned) {
      count++;
      const local = rock.position.clone().sub(field.origin).applyQuaternion(field.rotation.clone().invert());
      const radius = rock.userData.type.radius * rock.scale.x;
      assert.ok(-local.z - lastDepth >= field.obstacleSpacing * .9 - 1e-7, 'Keep room between successive evasions');
      lastDepth = -local.z;
      const offsetY = local.y - hazards.corridorCenter(-local.z);
      assert.ok(Math.abs(local.x) <= (reducedMotion ? 30 : 100), 'Scatter obstacles across the flown passage, not at distant edges');
      assert.ok(Math.abs(offsetY) <= field.gap * .35 + 1e-7);
      if (reducedMotion) assert.ok(Math.abs(offsetY) + radius <= field.gap - 4 + 1e-7);
      else {
        passageCount++; passageTiers.add(rock.userData.asteroidTier); passageScales.add(rock.scale.x.toFixed(2));
        if (Math.abs(local.x) > 30) scatteredObstacles++;
        if (hazards.crossesPlayer(rock, new THREE.Vector3(local.x, offsetY, -100), new THREE.Vector3(local.x, offsetY, 100))) centerThreats++;
      }
      assert.ok(rock.position.distanceTo(hazards.camera.position) >= lead - 100, 'No nearby pop-in: interior rocks get the same distant lead as the walls');
      assert.ok(rock.userData.previousPosition.equals(rock.position), 'Placement must not create a swept teleport');
      assert.ok(rock.userData.courseVelocity.equals(field.velocity), 'Interior rocks travel with the walls, never homing toward the pilot');
      assert.equal(rock.userData.health, rock.userData.asteroidTier);
      assert.ok(rock.userData.asteroidTier <= (reducedMotion ? 1 : 3));
      assert.ok(radius <= (reducedMotion ? .35 : 2.8 * 1.2) * rock.userData.type.radius + 1e-8, 'Keep even the largest passage boulders dodgeable');
      assert.ok(hazards.ships.includes(rock) && rock.userData.collisionParts.length > 0, 'Gap rocks must use the real shooting/collision pipeline');
      const position = rock.position.clone();
      hazards.updateShipCourse(rock, .3);
      rock.position.set(0, 0, -100); hazards.camera.updateMatrixWorld();
      assert.ok(hazards.targetInfo(rock), 'A close interior rock must be shootable, not decorative');
      assert.ok(hazards.crossesPlayer(rock, new THREE.Vector3(0, 0, -100), new THREE.Vector3(0, 0, 100)), 'Flying into a gap rock must hit its actual hull');
      const dodge = radius + 30;
      for (const side of [-1, 1]) {
        assert.equal(hazards.crossesPlayer(rock, new THREE.Vector3(side * dodge, 0, -100), new THREE.Vector3(side * dodge, 0, 100)), false,
          'Both lateral dodges must remain clear, including around large passage boulders');
      }
      rock.position.copy(position);
    }
  }
  assert.ok(count >= 2, 'Every shape and strength must contain repeated obstacles, not an occasional lucky roll');
  assert.ok(field.pool.length <= hazards.maxShowerRocks, 'Interior hazards share the existing bounded pool');
  const nextObstacle = hazards.nextShowerObstacle, origin = field.origin.clone();
  hazards.setPaused(true); hazards.updateAsteroidShower();
  assert.equal(hazards.nextShowerObstacle, nextObstacle);
  assert.ok(field.origin.equals(origin), 'Pause freezes obstacle placement and the field');
  hazards.setPaused(false); hazards.setupLevelFleet();
  assert.equal(hazards.nextShowerObstacle, Infinity, 'Retry resets the obstacle schedule');
  const free = hazards.shower(false, strength);
  assert.ok(free.pool.filter(rock => rock.visible).every(rock => !rock.userData.corridorObstacle), 'Pooled rocks must clear corridor roles when reused in free showers');
}
assert.deepEqual([...passageTiers].sort(), [1, 2, 3], 'Passage hazards must include small, medium and large rocks');
assert.ok(passageScales.size > 30 && oversizedWalls > 20, 'Both the passage and walls need noticeable size variety');
assert.ok(centerThreats > passageCount * .3, 'Enough real hull intersections must force evasions or shooting');
assert.ok(scatteredObstacles > passageCount * .15, 'Not every obstacle should line up in the central lane');
console.log('PASS varied small/medium/large passage hazards, larger walls, real central threats, lateral dodges, distant lead, pause and reuse');

// Exercise the actual per-step movement/rotation block, not a test-only approximation.
const moveRock = new Function('ship', 'dt', 'paused', 'reducedMotion',
  section('          if (!paused) {\n            ship.position.addScaledVector(ship.userData.courseVelocity, dt);', '\n          updateShipHitFlash(ship);'));
for (const reducedMotion of [false, true]) for (const corridor of [false, true]) {
  const motion = makeGame(reducedMotion);
  motion.setupLevelFleet(); motion.flightOrientation.set(.2, -.4, 0, 'YXZ');
  const inverse = new THREE.Quaternion().setFromEuler(motion.flightOrientation).invert();
  const field = motion.shower(corridor, 2);
  const stream = field.velocity.clone().applyQuaternion(inverse);
  const streamSpeed = corridor ? 0 : Math.max(reducedMotion ? 50 : 220, motion.flightMotion.length() * .85 * .9);
  assert.ok(Math.abs(stream.length() - streamSpeed) < 1e-8);
  if (!corridor) {
    if (Math.abs(stream.x) > 1e-8) assert.ok(Math.hypot(stream.x, stream.y) > streamSpeed * .8, 'Side streams keep their strong transverse motion');
    else assert.ok(stream.z > 0 && Math.abs(Math.abs(stream.y) / stream.z - .2) < 1e-8, 'Above/below streams approach from ahead at a shallow angle');
  }
  const spinSigns = [0, 0, 0, 0, 0, 0], speedRatios = [];
  let moving = 0, rotating = 0, slowMoving = 0, fastMoving = 0;
  // The player changes heading; newly released rocks must still use the original field axes.
  motion.flightOrientation.set(-.5, .8, 0, 'YXZ');
  for (let sample = 0; sample < 240; sample++) {
    const rock = motion.eventAsteroid(), data = rock.userData;
    const local = data.courseVelocity.clone().applyQuaternion(inverse);
    const rotates = !reducedMotion && data.courseVelocity.lengthSq() > 25;
    if (local.lengthSq() > 0) moving++;
    if (corridor) {
      assert.equal(data.courseVelocity.lengthSq(), 0, 'Corridor walls and obstacles must not inherit rain movement');
    } else {
      const ratio = local.length() / stream.length();
      speedRatios.push(ratio);
      assert.ok(local.clone().normalize().dot(stream.clone().normalize()) > 1 - 1e-12, 'Rain rocks share one direction');
      assert.ok(ratio >= .9 - 1e-8 && ratio <= 1.1 + 1e-8, 'Free rocks vary speed by at most ten percent');
    }
    for (const axis of [0, 1, 2]) {
      assert.ok(Math.abs(local.getComponent(axis)) <= streamSpeed * 1.1 + 1e-8, 'Speed variation stays bounded');
      const spin = data.spin.getComponent(axis);
      if (spin && rotates) spinSigns[axis * 2 + (spin > 0 ? 1 : 0)]++;
    }
    const spin = data.spin.length();
    assert.ok(reducedMotion ? spin === 0 : spin >= .04 - 1e-8 && spin <= .6 + 1e-8,
      'Potential tumbling rates must remain varied across pool reuse');
    const rotation = rock.quaternion.clone();
    moveRock(rock, 1, false, reducedMotion);
    assert.equal(!rock.quaternion.equals(rotation), rotates,
      'Tumbling follows actual drift speed and respects reduced motion');
    if (rotates) {
      rotating++;
      assert.ok(spin > 0, 'Noticeably drifting rocks must also rotate');
      if (spin < .14) slowMoving++;
      if (spin > .35) fastMoving++;
    }
    assert.notEqual(data.spin, motion.ships[4].userData.spin, 'Shared geometry must not share mutable spin vectors');
    const velocity = data.courseVelocity.clone();
    motion.target.set(-1, 1); motion.updateShipCourse(rock, .5);
    assert.ok(data.courseVelocity.equals(velocity), 'Drift must not follow later steering');
    motion.queueShip(rock);
  }
  assert.equal(moving, corridor ? 0 : 240, 'Only free showers stream; corridor rocks stay fixed');
  if (!corridor) assert.ok(Math.min(...speedRatios) < .95 && Math.max(...speedRatios) > 1.05, 'Retain subtle speed variation in free showers');
  if (!reducedMotion && !corridor) {
    assert.ok(slowMoving > rotating * .1 && fastMoving > rotating * .3,
      'Rotating rocks retain a noticeable mix of slow turns and faster tumbling');
    assert.ok(spinSigns.every(count => count > 40), 'Actively tumbling rocks need varied axes');
  }

  const rock = field.pool.find(rock => rock.visible && (corridor || reducedMotion || rock.userData.courseVelocity.lengthSq() > 25));
  const position = rock.position.clone(), rotation = rock.rotation.clone();
  let reference;
  for (const fps of [5, 30, 60, 144]) {
    rock.position.copy(position); rock.rotation.copy(rotation);
    for (let frame = 0; frame < fps * 4; frame++) moveRock(rock, 1 / fps, false, reducedMotion);
    const expected = position.clone().addScaledVector(rock.userData.courseVelocity, 4);
    assert.ok(rock.position.distanceTo(expected) < 1e-8, 'The rendered rock must actually travel with its assigned velocity');
    if (!reference) reference = { position: rock.position.clone(), quaternion: rock.quaternion.clone() };
    assert.ok(rock.position.distanceTo(reference.position) < 1e-8 && rock.quaternion.angleTo(reference.quaternion) < 1e-7,
      'Drift and tumbling must be frame-rate independent');
  }
  assert.equal(rock.quaternion.angleTo(new THREE.Quaternion().setFromEuler(rotation)) > 1e-4,
    !reducedMotion && rock.userData.courseVelocity.lengthSq() > 25,
    'Actual tumbling requires noticeable drift, never camera-relative travel alone');
  const pausedPosition = rock.position.clone(), pausedRotation = rock.quaternion.clone();
  moveRock(rock, 5, true, reducedMotion);
  assert.ok(rock.position.equals(pausedPosition) && rock.quaternion.equals(pausedRotation), 'Pause freezes drift and rotation together');

  motion.setupLevelFleet();
  const nextField = motion.shower(!corridor, 2), reused = nextField.pool.filter(rock => rock.visible);
  if (!corridor) {
    assert.equal(nextField.velocity.lengthSq(), 0, 'Switching to the corridor clears the previous stream');
    assert.ok(reused.every(rock => rock.userData.courseVelocity.lengthSq() === 0), 'Reused rain rocks become stationary corridor rocks');
  }
  else assert.ok(reused.every(rock => rock.userData.courseVelocity.clone().normalize().dot(nextField.velocity.clone().normalize()) > 1 - 1e-12), 'Reused corridor rocks must join the new free-shower stream');
  for (const rock of reused) {
    const rotation = rock.quaternion.clone();
    moveRock(rock, 1, false, reducedMotion);
    assert.equal(!rock.quaternion.equals(rotation), !reducedMotion && rock.userData.courseVelocity.lengthSq() > 25,
      'Pool reuse must apply the new drift speed, not the previous field’s rotation behavior');
  }
}

const driftRock = game.ships[4];
driftRock.userData.spin.set(.1, -.2, .3);
for (const reducedMotion of [false, true]) for (const paused of [false, true]) {
  for (const fps of [5, 30, 60, 144]) for (const speed of [0, .1, 4.99, 5, 5.01, 12]) {
    for (const direction of [[1, 0, 0], [0, -1, 0], [0, 0, 1], [.6, .8, 0]]) {
      driftRock.position.set(0, 0, 0); driftRock.rotation.set(.2, -.3, .1);
      driftRock.userData.courseVelocity.set(...direction).multiplyScalar(speed);
      const rotation = driftRock.quaternion.clone();
      for (let frame = 0; frame < fps * 4; frame++) moveRock(driftRock, 1 / fps, paused, reducedMotion);
      assert.equal(!driftRock.quaternion.equals(rotation), speed > 5 && !paused && !reducedMotion,
        'Rotation cutoff must include exactly 5 units/s, in every direction and at every frame rate');
      const expected = driftRock.userData.courseVelocity.clone().multiplyScalar(paused ? 0 : 4);
      assert.ok(driftRock.position.distanceTo(expected) < 1e-8, 'The rotation cutoff must not alter drift');
    }
  }
}
console.log('PASS coherent shower drift, subtle free-rock speed variation, individual tumbling, 5–144 FPS, reduced motion, pause and reuse');

assert.match(source, /updateShipArrivals\(dt\);/, 'The simulation must pass elapsed time into shower movement');
for (const reducedMotion of [false, true]) for (const corridor of [false, true]) for (const fps of [5, 30, 60, 144]) {
  const motion = makeGame(reducedMotion); motion.setupLevelFleet();
  motion.flightOrientation.set(.2, -.4, 0, 'YXZ');
  const field = motion.shower(corridor, 2, corridor ? 1 : 0);
  const origin = field.origin.clone(), velocity = field.velocity.clone(), travel = new THREE.Vector3();
  const tracked = field.pool.filter(rock => rock.visible).map(rock => ({rock, position: rock.position.clone()}));
  motion.flightOrientation.set(-.5, .8, 0, 'YXZ');
  for (let frame = 0; frame < fps * 6; frame++) {
    const dt = 1 / fps;
    // First prove intrinsic motion with a stationary player, then add player travel.
    motion.worldStep.set(0, 0, 0);
    if (frame >= fps * 2) motion.worldStep.set(-20 * dt, 10 * dt, 90 * dt);
    travel.addScaledVector(motion.worldStep, .85);
    motion.setTime(field.start + (frame + 1) * dt);
    motion.updateShipArrivals(dt);
    for (const {rock} of tracked) {
      rock.position.addScaledVector(motion.worldStep, .85);
      moveRock(rock, dt, false, reducedMotion);
    }
    if (frame === fps * 2 - 1) {
      if (corridor) assert.ok(field.origin.equals(origin), 'The corridor has no intrinsic movement');
      else assert.ok(field.origin.distanceTo(origin) > (reducedMotion ? 15 : 60), 'Rain moves even without player travel');
    }
    assert.ok(field.grit.position.equals(field.origin), 'Instanced rocks and their collision origin move together');
    assert.ok(field.velocity.equals(velocity), 'Later steering must not redirect the stream');
  }
  assert.ok(field.origin.distanceTo(origin.clone().add(travel).addScaledVector(velocity, 6)) < 1e-8);
  for (const {rock, position} of tracked) {
    assert.ok(rock.position.distanceTo(position.clone().add(travel).addScaledVector(rock.userData.courseVelocity, 6)) < 1e-8);
    if (corridor) assert.ok(rock.position.clone().sub(field.origin).distanceTo(position.clone().sub(origin)) < 1e-8,
      'The whole corridor translates without narrowing or shearing its curved safe passage');
  }
  const before = field.origin.clone();
  motion.setPaused(true); motion.updateShipArrivals(2);
  assert.ok(field.origin.equals(before));
  motion.setPaused(false); motion.setRoundEnded(true); motion.updateShipArrivals(2);
  assert.ok(field.origin.equals(before), 'Round end freezes the field as well as individual rocks');
}
console.log('PASS directional rain versus fixed corridor at 5–144 FPS, steering independence, corridor gaps, pause and round end');

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

// Complete 45-second runs, not just a promise that a crossing has nonzero velocity.
// Isolate scheduled crossings so ring/regular-fleet hits cannot hide a harmless threat schedule.
const unattended = [], evasive = [];
let totalCrossings = 0, totalDangerousCrossings = 0;
for (const reducedMotion of [false, true]) for (const fps of [5, 60, 144]) for (let trial = 0; trial < 4; trial++) {
  for (const dodge of [false, true]) {
    seed = 8000 + trial;
    const flight = makeGame(reducedMotion); flight.setupLevelFleet();
    flight.flightMotion.set(0, 0, -flight.levelFlightSpeed(0));
    let ticks = 0, hits = 0, shownCrossings = 0, dangerousCrossings = 0, dodgeAt = Infinity;
    const spawns = new Map();
    const clock = makeFlightClock(THREE, flight, reducedMotion, dt => {
      const time = ticks * dt; flight.setTime(time);
      flight.updateCollisionHazard();
      for (const rock of flight.hazardPool) {
        if (!rock.visible) continue;
        if (spawns.get(rock) !== rock.userData.spawn) {
          spawns.set(rock, rock.userData.spawn); shownCrossings++;
          if (rock.userData.dangerousCrossing) dangerousCrossings++;
          dodgeAt = time + .5;
        }
        const previous = rock.position.clone();
        flight.updateShipCourse(rock, dt);
        rock.position.addScaledVector(flight.flightMotion, -.85 * dt);
        moveRock(rock, dt, false, reducedMotion);
        if (!rock.userData.collisionHandled && rock.userData.lastVisibleTime > -Infinity
          && flight.crossesPlayer(rock, previous, rock.position)) {
          hits++; rock.userData.collisionHandled = true;
        }
        if (flight.hasPassedCamera(rock)) flight.queueShip(rock);
      }
      if (dodge && time >= dodgeAt) {
        flight.target.y = flight.target.y > 0 ? -.8 : .8;
        dodgeAt = Infinity;
      }
      ticks++;
      clock.move(dt, ticks * dt / 45);
    });
    for (let frame = 0; frame < fps * 45; frame++) {
      clock.frame(1 / fps);
      flight.recordVisibleObjects(); // Only actual display frames grant collision eligibility.
    }
    assert.ok(shownCrossings >= 3 && shownCrossings <= 6,
      'Long approaches may occupy the two-rock pool longer; retain repeated encounters without catch-up bursts');
    totalCrossings += shownCrossings; totalDangerousCrossings += dangerousCrossings;
    (dodge ? evasive : unattended).push(hits);
  }
}
// Longer approaches mean fewer completed crossings at low speed; verify the random mix across runs.
assert.ok(totalDangerousCrossings > totalCrossings * .3 && totalDangerousCrossings < totalCrossings * .8,
  'Sampled runs must retain a mix of dangerous crossings and near-passes');
assert.ok(unattended.reduce((sum, hits) => sum + hits, 0) >= unattended.length,
  `Uncorrected flight must still meet real hazards despite the longer warning distance: ${unattended}`);
assert.ok(evasive.reduce((sum, hits) => sum + hits, 0) < unattended.reduce((sum, hits) => sum + hits, 0) * .35,
  `Readable fixed trajectories must remain avoidable: straight=${unattended}, evasive=${evasive}`);
console.log(`PASS full-level collision chance at 5–144 FPS: straight ${unattended.join('/')} hits; evasive ${evasive.join('/')}`);

for (const reducedMotion of [false, true]) {
  const traffic = makeGame(reducedMotion);
  // Include retries and a return to level one after the larger fleet has been allocated.
  for (const level of [1, 2, 3, 4, 8, 12, 20, 20, 1]) {
    traffic.setLevel(level);
    traffic.setupLevelFleet();
    const baseTypes = [0, 0, 3, 1, 2, 0, 2, 3];
    while (baseTypes.length < level + 2) baseTypes.push([3, 0, 1, 3, 2][(baseTypes.length - 8) % 5]);
    const baseFleet = baseTypes.slice(0, level + 2);
    const regularCount = baseFleet.filter(type => type !== 3).length;
    const active = [...traffic.ships.filter(ship => ship.visible), ...traffic.queue];
    assert.equal(new Set(active).size, active.length, 'Every fleet member must be scheduled only once');
    assert.equal(traffic.ships.filter(ship => ship.visible).length, 2, 'Keep the two-ship opening');
    assert.equal(active.filter(ship => !ship.userData.type.asteroid && !ship.userData.type.capital).length,
      regularCount + Math.round(regularCount * .2), 'Increase only regular ships by 20%, rounded');
    assert.equal(active.filter(ship => ship.userData.type.asteroid).length,
      baseFleet.filter(type => type === 3).length + Math.ceil(level / 2), 'Keep asteroid counts unchanged');
    assert.equal(traffic.capitalPending, level >= 4 && level % 4 === 0, 'Keep boss progression unchanged');
    const allocated = traffic.ships.length;
    traffic.setupLevelFleet();
    assert.equal(traffic.ships.length, allocated, 'Reuse the extra ships on retry');
  }
}
console.log('PASS 20% more regular ships, unchanged asteroids/bosses, hidden queued ships and fleet reuse');

// Production already has the intro boss in the pool before gameplay setup.
const previewCode = code.replace('      const fleetOrder =', '      createShip(ships.length, 4);\n      const fleetOrder =');
const preview = new Function('THREE', 'Math', 'random', 'reducedMotion', 'crossingDanger', 't', previewCode)(
  THREE, math, (a, b) => a + math.random() * (b - a), false, null, t);
const previewBoss = preview.capital;
assert.ok(previewBoss?.userData.type.capital);
assert.equal(previewBoss.scale.x, 6, 'The preview uses the full gameplay model scale');
for (const level of [1, 3, 4, 5, 8]) {
  preview.setLevel(level); preview.setTime(0); preview.setupLevelFleet();
  assert.equal(previewBoss.visible, false, 'Hide the menu boss until its scheduled encounter');
  assert.ok(!preview.queue.includes(previewBoss), 'The menu boss must not enter the regular fleet');
  preview.setTime(6); preview.updateShipArrivals();
  assert.equal(previewBoss.visible, level % 4 === 0);
  assert.equal(preview.capital, previewBoss, 'Reuse the exact preview model');
  assert.equal(preview.ships.filter(ship => ship.userData.type.capital).length, 1);
  if (level % 4 === 0) {
    assert.equal(previewBoss.userData.health, 60);
    assert.equal(previewBoss.scale.x, 6, 'Keep the full model scale when moving from preview to combat');
  }
}
console.log('PASS intro boss reuse, no early-level boss leak, scheduled encounters and restored armor');
