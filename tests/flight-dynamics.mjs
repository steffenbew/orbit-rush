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
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing source section: ${start}`);
  return source.slice(from, to);
};
const code = `
  const scene = new THREE.Scene(), glow = new THREE.Texture();
  const camera = new THREE.PerspectiveCamera(reducedMotion ? 70 : 90, 16 / 9, .03, 14000);
  const flightMotion = new THREE.Vector3(0, 0, -400), flightDirection = new THREE.Vector3(0, 0, -1);
  const flightOrientation = new THREE.Euler(0, 0, 0, 'YXZ'), worldStep = new THREE.Vector3();
  const flightTurn = new THREE.Vector2(), flightVelocity = new THREE.Vector2(), flightViewOffset = new THREE.Vector2();
  const progressionTimeScale = 1.5, roundDuration = 45;
  ${section('      const simulationStep =', '      let lastFrameTime =')}
  const target = new THREE.Vector2();
  let started = true, paused = false, roundEnded = false, crashing = false, gameTime = 0, difficulty = 0;
  const elements = new Map();
  const document = { querySelector: selector => {
    if (!elements.has(selector)) elements.set(selector, { hidden: true, innerHTML: '', style: {}, classList: { toggle() {}, remove() {} } });
    return elements.get(selector);
  } };
  const innerWidth = 1280, innerHeight = 720;
  const mouseAim = new THREE.Vector2(), projectedShip = new THREE.Vector3();
  ${section('      function targetInfo(', '      function findTarget(')}
  let shield = 100;
  const rockets = [], showControlStep = () => {}, updateScore = () => {};
  let lastShot = -Infinity, lastEmptyAttempt = -Infinity, lastHeatShot = 0, shotFlashUntil = 0, emptyFlashUntil = 0;
  let combo = 0, lastKill = -Infinity;
  const explosions = [], hits = [], sounds = [], particles = [];
  const explode = (...args) => explosions.push(args), playSound = name => sounds.push(name);
  const collideWith = object => hits.push(object), showFeedback = () => {};
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
    flightTurn, flightVelocity, advanceFlightHeading, forecastFlightPosition, flightDistanceAt,
    ringShips, flightRings, resetRingShips, updateRingShipCourse, updateRingShipArrivals, courseWorldOffset,
    beginFlightTutorial, completeTutorialStep, spawnTutorialTarget, updateFlightTutorial, updateFlightRing, flightBoundary,
    flightBoundaryOrigin, flightBoundaryRadii, constrainShipToBoundary,
    moveShip(ship, dt) {
      ${section('          ship.position.addScaledVector(worldStep, .85);', '          updateShipHitFlash(ship);')}
    },
    tutorialState: () => ({stage: tutorialStage, completed: tutorialCompleted, completedAt: tutorialStepCompletedAt, time: gameTime, courseStartTime}),
    coursePlan: () => ({origin: showerCourseOrigin.clone(), start: showerStart, end: showerEnd, length: showerLength, bend: showerBend, shape: showerShape}),
    ringCourse(corridor, shape = 0) {
      showerCorridor = corridor; showerShape = shape; showerBend = reducedMotion ? .45 : 1.15;
      gameTime = 0; courseWorldOffset.set(0, 0, 0);
      planAsteroidShower(); resetFlightRing(); resetRingShips();
      return { origin: showerCourseOrigin.clone(), length: showerLength, gap: showerHalfGap };
    },
    setStarted: value => { started = value; },
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
    get showerSpacing() { return showerSpacing; },
    setLevel: value => { level = value; }, setPressure: value => { levelPressure = value; },
    setTime: value => { gameTime = value; },
    setPaused: value => { paused = value; },
    setRoundEnded: value => { roundEnded = value; }, setCrashing: value => { crashing = value; },
    shower: (corridor, strength, shape = 0, direction = 1) => {
      showerCorridor = corridor; showerStrength = strength; showerShape = shape;
      showerBend = direction * (reducedMotion ? .45 : 1.15); gameTime = showerStart;
      planAsteroidShower();
      courseWorldOffset.set(0, 0, flightDistanceAt(showerStart));
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
    const openingSpeed = reducedMotion ? 35 : 180 * 1.86;
    assert.ok(Math.abs(ship.userData.courseVelocity.length() - openingSpeed * .85 * ship.userData.cruiseRatio) < 1e-8,
      'Opening traffic must match the increased flight speed, without changing reduced motion');
  }
}
console.log('PASS initial fleet creation before flight state initialization');

const flightSpeed = new Function('reducedMotion', 'levelPressure', 'progress', `
  ${section('      function levelFlightSpeed(', '      function flightDistanceAt(')}
  return levelFlightSpeed(progress);
`);
for (const reducedMotion of [false, true]) for (const level of [1, 2, 6, 20, 1000]) {
  const pressure = 1 - Math.exp(-(level - 1) / 4);
  for (const progress of [0, .25, .5, .75, 1]) {
    const previousSpeed = reducedMotion ? 35 + pressure * 10 + (8 + pressure * 15) * progress
      : 1.55 * (180 + pressure * 380 + (140 + pressure * 560) * Math.pow(progress, 1.6));
    assert.ok(Math.abs(flightSpeed(reducedMotion, pressure, progress) / previousSpeed - (reducedMotion ? 1 : 1.2)) < 1e-8,
      'Flight must be another 20% faster, with reduced motion unchanged');
  }
}
console.log('PASS another 20% faster forward flight across early/late levels and unchanged reduced-motion speed');
const pressureForLevel = new Function('level', 'return ' + source.match(/        levelPressure = ([^;]+);/)[1]);
assert.equal(pressureForLevel(1), 0, 'Level one keeps its familiar speed');
assert.ok(Math.abs(pressureForLevel(2) - (1 - Math.exp(-1 / 6))) < 1e-12);
for (const progress of [0, .5, 1]) {
  const before = flightSpeed(false, 1 - Math.exp(-1 / 4), progress);
  const after = flightSpeed(false, pressureForLevel(2), progress);
  assert.ok(after < before * .92 && after > before * .85, 'Level two is about 10% slower than before');
}
for (let level = 2; level <= 100; level++) {
  assert.ok(pressureForLevel(level) > pressureForLevel(level - 1) && pressureForLevel(level) < 1);
}
console.log('PASS gentler six-level speed ramp, slower level two, unchanged opening speed and bounded progression');

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
game.flightMotion.set(0, 0, -480); // Keep this cruising scenario at the same relative speed after the 20% increase.
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
game.flightMotion.set(0, 0, -400);

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
      const originalGap = Math.max(27, .4 * (130 - strength * 22 - (level - 1) * 3));
      assert.equal(field.gap, originalGap, 'Restore the original narrow corridor height exactly at every level/strength');
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
console.log('PASS uneven ring layers, progressively scattered side fringes, original narrow flight passage and bounded instance budget');

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
    // Fast travel belongs to a fast level: field layout is now fixed before takeoff.
    if (speed === 900) { bounded.setLevel(15); bounded.setPressure(1 - Math.exp(-14 / 4)); }
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
assert.ok(materials.every(entry => entry.material.color.equals(entry.color.clone().lerp(new THREE.Color(0xff344f), .2 / .22 * .28))),
  'The red hit tint blends with the original material instead of replacing it');
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
assert.ok(boss.userData.flashMaterials.every(entry => entry.material.color.equals(entry.color.clone().lerp(new THREE.Color(0xff344f), .2 / .22 * .28))));
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
const nextForecast = new THREE.Vector3();
threats.forecastFlightPosition(nextForecast, Math.round(nextCrossing.userData.approachTime * 60));
const plannedPass = nextForecast.clone().addScaledVector(nextCrossing.userData.courseRight, nextCrossing.userData.lane)
  .addScaledVector(nextCrossing.userData.courseUp, nextCrossing.userData.height);
const actualPass = nextCrossing.position.clone().addScaledVector(nextCrossing.userData.courseVelocity, nextCrossing.userData.approachTime);
assert.ok(actualPass.distanceTo(plannedPass) < 1e-7,
  'The next crossing must follow the aircraft forecast, even when a sustained turn loops past the original world heading');
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
threats.flightMotion.set(0, 0, -threats.levelFlightSpeed(2 / 45)); threats.updateCollisionHazard();
assert.ok(hazard.visible);
console.log('PASS unchanged crossing schedule, distant approaches, fixed courses, pause, reuse and reset');

// Drive the actual aircraft steering and simulation accumulator.
const makeFlightClock = new Function('THREE', 'flight', 'reducedMotion', 'updateSimulation', `
  const {target, flightMotion, flightOrientation, flightTurn, flightVelocity, advanceFlightHeading, camera, playerHullRotation, levelFlightSpeed} = flight;
  const flightDirection = new THREE.Vector3(), flightTilt = new THREE.Vector3(), flightViewOffset = new THREE.Vector2();
  const initialDirection = new THREE.Vector3(0, 0, -1).applyEuler(flightOrientation);
  let speed = flightMotion.dot(initialDirection) - flightVelocity.x * initialDirection.x - flightVelocity.y * initialDirection.y, hitMarker = 0;
  const started = true, paused = false, crashing = false, celebrating = false, document = {hidden: false};
  const resetFrameStats = () => {};
  ${section('      const simulationStep =', '      const progressionTimeScale =')}
  return {frame: advanceSimulation, move: (dt, difficulty) => {
    ${section('        const easing = 1 - Math.exp(-3 * dt);', '        worldStep.copy(flightMotion)')}
    ${section('        const speedFov =', '        danger = false;')}
  }};
`);
for (const reducedMotion of [false, true]) {
  for (const fps of [5, 30, 60, 144]) for (const level of [1, 7, 15]) {
    for (const kick of [false, true]) for (const lane of ['hold', 'intercept', 'evade']) {
      const flight = makeGame(reducedMotion, false), startTime = 2;
      flight.setLevel(level); flight.setPressure(1 - Math.exp(-(level - 1) / 4)); flight.setupLevelFleet();
      const speed = flight.levelFlightSpeed(startTime / 45);
      flight.flightOrientation.set(.12, -.38, 0, 'YXZ');
      flight.flightMotion.set(0, 0, -speed).applyEuler(flight.flightOrientation);
      if (kick) {
        flight.flightVelocity.set(-speed * .2, speed * .1);
        flight.flightMotion.x += flight.flightVelocity.x; flight.flightMotion.y += flight.flightVelocity.y;
      }
      flight.setTime(startTime); flight.updateCollisionHazard();
      const rock = flight.hazardPool[0];
      assert.ok(rock.visible);
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
        clock.move(dt, Math.min(1, (startTime + ticks * dt) / 45));
      });
      for (let frame = 0; frame < Math.ceil(fps * (rock.userData.approachTime + 1)); frame++) clock.frame(1 / fps);
      assert.equal(lane === 'hold' && kick ? pointHit : hit, lane === 'intercept',
        `Aircraft crossing: ${fps} FPS, level=${level}, kick=${kick}, lane=${lane}, reduced=${reducedMotion}`);
    }
  }
}
console.log('PASS aircraft-course forecasts, held-heading near-passes, actual interceptions and inertial evasions at 5–144 FPS');

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
      assert.ok(ship.position.distanceTo(arrivals.camera.position) >= (reducedMotion ? 1200 : 3800) - 1e-8,
        'Bringing angled arrivals inside the shield must preserve their distant fade');
      assert.ok(ship.position.z < arrivals.camera.position.z, 'Arrivals remain ahead along the protected course');
      assertShipInsideBoundary(arrivals, ship);
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
          assert.ok(time - seenAt.get(ship) > 3 * (reducedMotion ? 1 : 1.15 / 1.86),
            'Preserve the visible approach distance while traversing it at the faster cruise speed');
        }
      }
      if (entered.size === traffic.length) break;
    }
    assert.equal(entered.size, traffic.length,
      `Distant arrivals must reach the playable area within a level (level=${level}, fps=${fps}, reduced=${reducedMotion}, aspect=${aspect})`);
  }
}
console.log('PASS mostly straight, gradual approaches within the level at 5–144 FPS, portrait/landscape and reduced motion');

function assertShipInsideBoundary(game, ship) {
  const bounds = ship.userData.collisionBox;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const corner = new THREE.Vector3(x, y, z).multiply(ship.scale).applyQuaternion(ship.quaternion)
      .add(ship.position).sub(game.flightBoundaryOrigin).sub(game.courseWorldOffset);
    assert.ok(Math.hypot(corner.x / game.flightBoundaryRadii.x, corner.y / game.flightBoundaryRadii.y) <= .98 + 1e-8,
      `${ship.userData.type.name}: the entire rotated hull must retain clearance inside the shield zone`);
  }
}

for (const reducedMotion of [false, true]) {
  const confined = makeGame(reducedMotion);
  confined.setLevel(4); confined.setupLevelFleet();
  const traffic = [...confined.ships.slice(0, 3), confined.capital];
  for (const ship of traffic) for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    confined.resetShip(ship, true);
    confined.courseWorldOffset.set(420, -170, 900);
    confined.flightBoundaryOrigin.set(30, -20, 40);
    ship.position.copy(confined.flightBoundaryOrigin).add(confined.courseWorldOffset)
      .add(new THREE.Vector3(Math.cos(angle) * confined.flightBoundaryRadii.x * .98,
        Math.sin(angle) * confined.flightBoundaryRadii.y * .98, -800));
    ship.quaternion.setFromEuler(new THREE.Euler(.2, -.35, .15));
    ship.userData.courseVelocity.set(Math.cos(angle) * 4000, Math.sin(angle) * 4000, -400);
    const depth = ship.position.z, health = ship.userData.health;
    // Include a large step, shared sideways world motion and a non-zero course origin.
    confined.worldStep.set(-80, 40, 100);
    confined.courseWorldOffset.addScaledVector(confined.worldStep, .85);
    confined.moveShip(ship, .2);
    assertShipInsideBoundary(confined, ship);
    assert.equal(ship.position.z, depth + 85 - 80, 'Containment must preserve forward travel');
    assert.equal(ship.userData.courseVelocity.z, -400);
    assert.equal(ship.userData.health, health, 'NPC boundary contact does not damage ships');
    assert.equal(confined.shield, 100, 'NPC boundary contact must not damage the player');
  }
}
console.log('PASS whole-hull fleet containment on every shield face, high-speed movement and shared world offsets');

for (const reducedMotion of [false, true]) {
  const confined = makeGame(reducedMotion);
  confined.setLevel(4); confined.setupLevelFleet();
  confined.courseWorldOffset.set(100, -70, 600);
  for (const ship of [...confined.ships.slice(0, 3), confined.capital]) {
    for (const pitch of [-Math.PI / 4, 0, Math.PI / 4]) for (const yaw of [-65, 0, 65]) {
      confined.flightOrientation.set(pitch, yaw * Math.PI / 180, 0, 'YXZ');
      confined.resetShip(ship);
      assertShipInsideBoundary(confined, ship);
      assert.ok(ship.userData.previousPosition.equals(ship.position), 'Constrain arrivals before recording collision history');
      assert.ok(ship.position.distanceTo(confined.camera.position) >= (reducedMotion ? 1200 : 3800),
        'Even sharply turned arrivals stay beyond the fade, including the full-size dreadnought');
      for (let step = 0; step < 120; step++) {
        if (ship.userData.type.capital) confined.updateCapitalShip(ship, 1 / 60);
        else confined.updateShipCourse(ship, 1 / 60);
        confined.moveShip(ship, 1 / 60);
        assertShipInsideBoundary(confined, ship);
      }
    }
  }
  confined.resetRingShips();
  const runner = confined.ringShips[0], route = runner.userData.ringRoute;
  // Force a route beyond the wall to cover spline overshoot and corrected route bookkeeping.
  route.curve.points.forEach(point => { point.x += confined.flightBoundaryRadii.x * 2; });
  for (let step = 0; step < 120; step++) {
    confined.worldStep.set(-2, 1, 5);
    confined.courseWorldOffset.addScaledVector(confined.worldStep, .85);
    confined.updateShipCourse(runner, 1 / 60); confined.moveShip(runner, 1 / 60);
    assertShipInsideBoundary(confined, runner);
    assert.ok(runner.position.clone().sub(confined.courseWorldOffset).distanceTo(route.position) < 1e-8,
      'Constrained route traffic must retain the actual course-space position without accumulating drift');
  }
  const ship = confined.ships[0];
  ship.position.set(10000, 10000, -500); ship.userData.courseVelocity.set(50, 50, -400);
  for (const [setter, inactive] of [['setPaused', true], ['setRoundEnded', true], ['setCrashing', true], ['setStarted', false]]) {
    const position = ship.position.clone(), velocity = ship.userData.courseVelocity.clone();
    confined[setter](inactive); confined.constrainShipToBoundary(ship);
    assert.ok(ship.position.equals(position) && ship.userData.courseVelocity.equals(velocity), 'Inactive states must not constrain ships');
    confined[setter](!inactive);
  }
  const rock = confined.ships[4]; rock.visible = true; rock.position.copy(ship.position);
  confined.constrainShipToBoundary(rock);
  assert.ok(rock.position.equals(ship.position), 'Asteroid streams and corridors are not confined by the NPC shield');
}
console.log('PASS extreme-heading arrivals, sustained NPC maneuvers, reduced-motion dreadnought clearance and lifecycle isolation');

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
  const approachSpeed = hazards.levelFlightSpeed(field.start / 45) * .85;
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
  const fittingObstacles = field.length > field.spacing * 2 + field.obstacleSpacing * 1.2 ? 2 : field.length > field.spacing ? 1 : 0;
  assert.ok(count >= fittingObstacles, 'Place every obstacle that fits before the guaranteed finish; short reduced-motion passages must not overrun it');
  assert.ok(field.pool.length <= hazards.maxShowerRocks, 'Interior hazards share the existing bounded pool');
  const nextObstacle = hazards.nextShowerObstacle, origin = field.origin.clone();
  hazards.setPaused(true); hazards.updateAsteroidShower();
  assert.equal(hazards.nextShowerObstacle, nextObstacle);
  assert.ok(field.origin.equals(origin), 'Pause freezes obstacle placement and the field');
  hazards.setPaused(false); hazards.setupLevelFleet();
  assert.equal(hazards.nextShowerObstacle, hazards.showerSpacing, 'Retry preplans a fresh first obstacle slice');
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
  const inverse = new THREE.Quaternion(); // Field axes belong to the fixed course, not the player's turn.
  const field = motion.shower(corridor, 2);
  const stream = field.velocity.clone().applyQuaternion(inverse);
  const streamSpeed = corridor ? 0 : Math.max(reducedMotion ? 50 : 220, motion.levelFlightSpeed(field.start / 45) * .85 * .9);
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
    const active = [...traffic.ships.filter(ship => ship.visible && !ship.userData.ringRoute), ...traffic.queue];
    assert.equal(new Set(active).size, active.length, 'Every fleet member must be scheduled only once');
    assert.equal(traffic.ships.filter(ship => ship.visible && !ship.userData.ringRoute).length, 2, 'Keep the two regular opening ships');
    assert.equal(traffic.ringShips.filter(ship => ship.visible).length, 0, 'Course traffic must not crowd the opening formation');
    assert.equal(traffic.ships.filter(ship => ship.visible).length, 2, 'Only two ships at level start, including level two');
    assert.equal(active.filter(ship => !ship.userData.type.asteroid && !ship.userData.type.capital).length,
      Math.round((regularCount + Math.round(regularCount * .2) + 3) * 1.3), 'Increase regular ships by about 30% without crowding the opening');
    assert.equal(active.filter(ship => ship.userData.type.asteroid).length,
      Math.round((baseFleet.filter(type => type === 3).length + Math.ceil(level / 2) + 3) * 1.3), 'Increase asteroid arrivals by about 30%');
    assert.equal(active.filter(ship => ship.userData.stationary).length, 3, 'Three guaranteed stationary rocks are mixed into arrivals');
    assert.equal(traffic.queue[1].userData.type.asteroid, undefined, 'Extra ships arrive early among the rocks, not only at the end');
    assert.equal(traffic.capitalPending, level >= 4 && level % 4 === 0, 'Keep boss progression unchanged');
    const allocated = traffic.ships.length;
    traffic.setupLevelFleet();
    assert.equal(traffic.ships.length, allocated, 'Reuse the extra ships on retry');
  }
}
console.log('PASS 30% more ships/asteroids, three stationary rocks, unchanged two-ship opening/bosses and fleet reuse');

for (const reducedMotion of [false, true]) for (const fps of [5, 30, 60, 144]) {
  const still = makeGame(reducedMotion); still.setLevel(3); still.setupLevelFleet();
  const rocks = still.queue.filter(rock => rock.userData.stationary);
  for (const rock of rocks) {
    still.resetShip(rock);
    assert.equal(rock.userData.courseVelocity.length(), 0);
    assert.equal(rock.userData.dangerousCrossing, false);
    assert.ok(rock.position.distanceTo(still.camera.position) >= (reducedMotion ? 900 : 3800));
    const position = rock.position.clone(), rotation = rock.quaternion.clone(), travel = new THREE.Vector3();
    still.flightOrientation.set(.4, -.6, 0, 'YXZ');
    for (let frame = 0; frame < fps * 3; frame++) {
      const dt = 1 / fps;
      still.worldStep.set(-80 * dt, 30 * dt, 350 * dt);
      travel.addScaledVector(still.worldStep, .85);
      still.updateShipCourse(rock, dt);
      rock.position.addScaledVector(still.worldStep, .85); moveRock(rock, dt, false, reducedMotion);
      assert.equal(rock.userData.courseVelocity.length(), 0, 'Later steering never sets stationary rocks in motion');
    }
    assert.ok(rock.position.distanceTo(position.add(travel)) < 1e-8);
    assert.ok(rock.quaternion.equals(rotation), 'Stationary rocks do not tumble');
    still.queueShip(rock); still.resetShip(rock);
    assert.equal(rock.userData.courseVelocity.length(), 0, 'Reused arrivals remain stationary');
    assert.equal(rock.userData.health, rock.userData.asteroidTier, 'Stationary rocks retain real health and collisions');
  }
}
for (const reducedMotion of [false, true]) {
  const tint = makeGame(reducedMotion); tint.setLevel(4); tint.setupLevelFleet();
  const ship = tint.ships[0]; tint.resetShip(ship); ship.position.set(0, 0, -500);
  const material = ship.userData.hull, color = material.color.clone(), opacity = material.opacity;
  ship.userData.hitFlash = .22; tint.updateShipHitFlash(ship);
  const fullRed = material.emissive.r;
  assert.ok(fullRed > 0 && fullRed <= .15, 'The red hit overlay is subtle, not a bright red body');
  ship.userData.hitFlash = .11; tint.updateShipHitFlash(ship);
  assert.ok(Math.abs(material.emissive.r - fullRed / 2) < 1e-9, 'The tint fades smoothly');
  assert.ok(material.color.equals(color)); assert.equal(material.opacity, opacity, 'The hull stays solid underneath the translucent-looking tint');
  ship.userData.hitFlash = 0; tint.updateShipHitFlash(ship); assert.equal(material.emissive.r, 0);
}
console.log('PASS stationary collidable rock arrivals/reuse at 5–144 FPS and soft fading hit tints without transparent hulls');

// The extra course ships must not join the opening formation, especially in level two.
for (const reducedMotion of [false, true]) for (const level of [2, 10]) for (const fps of [5, 60]) {
  const arrivals = makeGame(reducedMotion);
  arrivals.setLevel(level); arrivals.setPressure(1 - Math.exp(-(level - 1) / 4)); arrivals.setupLevelFleet();
  const pool = [...arrivals.ringShips], allocated = arrivals.ships.length;
  assert.equal(arrivals.ships.filter(ship => ship.visible).length, 2);
  arrivals.setTime(5.99); arrivals.updateRingShipArrivals();
  assert.ok(pool.every(ship => !ship.visible), 'Keep course traffic hidden through the opening checkpoint');
  arrivals.setTime(6);
  for (const [setter, inactive] of [['setPaused', true], ['setRoundEnded', true], ['setCrashing', true], ['setStarted', false]]) {
    arrivals[setter](inactive); arrivals.updateRingShipArrivals();
    assert.ok(pool.every(ship => !ship.visible), 'No pending arrival in an inactive state');
    arrivals[setter](!inactive);
  }
  arrivals.courseWorldOffset.set(120, -30, arrivals.flightDistanceAt(6));
  for (const gate of arrivals.flightRings) {
    gate.position.add(arrivals.courseWorldOffset);
    if (gate.position.z >= 0) { gate.visible = false; gate.userData.resolved = true; }
  }
  arrivals.updateRingShipArrivals();
  assert.deepEqual(arrivals.ringShips, pool); assert.equal(arrivals.ships.length, allocated);
  assert.equal(pool.length, 6, 'Six reusable ships add traffic along the checkpoint route');
  const spacing = arrivals.levelFlightSpeed(6 / 45) * .85 * 2.5;
  pool.slice(1).forEach((ship, index) => {
    assert.ok(Math.abs(ship.userData.ringRoute.distance - pool[index].userData.ringRoute.distance - spacing) < 1e-8,
      'Spread course traffic by 2.5 seconds of cruise distance instead of a tight formation');
  });
  assert.ok(pool.every(ship => ship.visible && ship.userData.arrivalOpacity === 0));
  assert.ok(pool.every(ship => ship.position.distanceTo(arrivals.camera.position) > (reducedMotion ? 450 : 3600)),
    'Delayed traffic must still start well ahead, not teleport into the current flight path');
  const routes = pool.map(ship => ship.userData.ringRoute);
  for (let frame = 1; frame <= fps * 12; frame++) {
    const dt = 1 / fps, time = 6 + frame * dt;
    arrivals.setTime(time); arrivals.updateRingShipArrivals();
    arrivals.flightMotion.set(0, 0, -arrivals.levelFlightSpeed(time / 45));
    arrivals.worldStep.copy(arrivals.flightMotion).multiplyScalar(-dt);
    arrivals.courseWorldOffset.addScaledVector(arrivals.worldStep, .85);
    for (const ship of pool) {
      arrivals.updateShipCourse(ship, dt);
      ship.position.addScaledVector(ship.userData.courseVelocity, dt).addScaledVector(arrivals.worldStep, .85);
      assert.ok(ship.position.distanceTo(ship.userData.ringRoute.position.clone().add(arrivals.courseWorldOffset)) < 1e-8);
      assert.ok(ship.position.z < -(reducedMotion ? 100 : 500), 'High-speed levels must not overtake still-arriving ships');
    }
  }
  pool.forEach((ship, index) => assert.equal(ship.userData.ringRoute, routes[index], 'Activate the pending flight only once'));
}
const trainingTraffic = makeGame(); trainingTraffic.setupLevelFleet(); trainingTraffic.beginFlightTutorial();
trainingTraffic.setTime(30); trainingTraffic.updateRingShipArrivals();
assert.ok(trainingTraffic.ringShips.every(ship => !ship.visible), 'A long tutorial must not trigger the scheduled course ships');
assert.ok(source.indexOf('        updateRingShipArrivals();') < source.indexOf('        if (started && !paused && !roundEnded && !crashing) courseWorldOffset.addScaledVector(worldStep, .85);'),
  'Place delayed routes before applying the next world step');
console.log('PASS two-ship opening, delayed distant course traffic, pause/lifecycle guards, single activation, high-speed clearance and model reuse');

// Course traffic crosses the real, oriented openings, independent of player steering.
for (const reducedMotion of [false, true]) for (const level of [1, 10]) for (const shape of [-1, 0, 1, 2]) for (const fps of [5, 60, 144]) {
  const traffic = makeGame(reducedMotion);
  traffic.setLevel(level); traffic.setPressure(1 - Math.exp(-(level - 1) / 4)); traffic.setupLevelFleet();
  const field = traffic.ringCourse(shape >= 0, Math.max(0, shape));
  const gates = traffic.flightRings.filter(gate => gate.visible).map(gate => ({
    position: gate.position.clone(), normal: gate.userData.normal.clone(), radius: gate.userData.radius
  }));
  const gateState = traffic.flightRings.map(gate => [gate.position.toArray(), gate.visible, gate.userData.resolved]);
  const passes = traffic.ringShips.map(() => new Set());
  const previous = new THREE.Vector3(), local = new THREE.Vector3(), crossing = new THREE.Vector3(), corner = new THREE.Vector3();
  for (let frame = 1; frame <= 45 * fps; frame++) {
    const dt = 1 / fps, time = frame * dt;
    traffic.setTime(time);
    // Vary the player's course. Only the common inverse-world translation may affect the ships.
    traffic.target.set(Math.sin(time), Math.cos(time));
    traffic.flightOrientation.set(.3 * Math.cos(time), time * .1, 0, 'YXZ');
    traffic.worldStep.set(Math.sin(time) * 50 * dt, Math.cos(time) * 20 * dt, traffic.levelFlightSpeed(time / 45) * dt);
    traffic.courseWorldOffset.addScaledVector(traffic.worldStep, .85);
    traffic.ringShips.forEach((ship, index) => {
      previous.copy(ship.position).sub(traffic.courseWorldOffset).addScaledVector(traffic.worldStep, .85);
      traffic.updateShipCourse(ship, dt);
      traffic.moveShip(ship, dt);
      assertShipInsideBoundary(traffic, ship);
      local.copy(ship.position).sub(traffic.courseWorldOffset);
      assert.ok(local.distanceTo(ship.userData.ringRoute.position) < 1e-6, 'Apply inverse-world travel exactly once');
      const depth = field.origin.z - local.z;
      if (shape >= 0 && depth >= 0 && depth <= field.length) {
        assert.ok(Math.abs(local.y - field.origin.y - traffic.corridorCenter(depth)) < field.gap * .65,
          'Course traffic follows the narrow passage instead of clipping through the ceiling or floor');
      }
      gates.forEach((gate, gateIndex) => {
        const before = previous.clone().sub(gate.position).dot(gate.normal);
        const after = local.clone().sub(gate.position).dot(gate.normal);
        if (before <= 0 || after > 0) return;
        assert.ok(!passes[index].has(gateIndex), 'Each interceptor crosses each gate once');
        passes[index].add(gateIndex);
        crossing.lerpVectors(previous, local, before / (before - after)).sub(gate.position);
        const box = ship.userData.collisionBox;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          corner.set(x, y, z).multiply(ship.scale).applyQuaternion(ship.quaternion).add(crossing);
          corner.addScaledVector(gate.normal, -corner.dot(gate.normal));
          assert.ok(corner.length() < gate.radius * .925,
            `Whole hull must fit: reduced=${reducedMotion}, level=${level}, shape=${shape}, fps=${fps}, ship=${index}, gate=${gateIndex}, radius=${corner.length()}/${gate.radius * .925}, time=${time}`);
        }
      });
    });
  }
  passes.forEach(passed => assert.equal(passed.size, gates.length, 'Every extra ship flies through every available ring within the level'));
  assert.deepEqual(traffic.flightRings.map(gate => [gate.position.toArray(), gate.visible, gate.userData.resolved]), gateState,
    'NPC passages never move, hide or resolve the player gates');
  assert.equal(traffic.shield, 100, 'NPC passages cannot cost player armor');
  assert.equal(traffic.sounds.length, 0, 'NPC passages do not trigger player rewards or misses');
}
console.log('PASS six real ring-flying interceptors, whole-hull aperture clearance, corridor paths, independent steering and shared world motion at 5–144 FPS');

const ringTraffic = makeGame(); ringTraffic.setupLevelFleet(); ringTraffic.resetRingShips();
const runner = ringTraffic.ringShips[0];
for (const [setter, inactive] of [['setPaused', true], ['setRoundEnded', true], ['setCrashing', true], ['setStarted', false]]) {
  const distance = runner.userData.ringRoute.distance, velocity = runner.userData.courseVelocity.clone(), rotation = runner.quaternion.clone();
  ringTraffic[setter](inactive); ringTraffic.updateRingShipCourse(runner, 1);
  assert.equal(runner.userData.ringRoute.distance, distance);
  assert.ok(runner.userData.courseVelocity.equals(velocity) && runner.quaternion.equals(rotation), 'Inactive traffic stays frozen');
  ringTraffic[setter](!inactive);
}
const queueBefore = ringTraffic.queue.length, pool = [...ringTraffic.ringShips];
runner.userData.health = 0; ringTraffic.queueShip(runner);
assert.equal(ringTraffic.queue.length, queueBefore, 'Destroyed course ships do not join ordinary reinforcements');
const retiredDistance = runner.userData.ringRoute.distance;
ringTraffic.updateRingShipCourse(runner, 1);
assert.equal(runner.userData.ringRoute.distance, retiredDistance);
ringTraffic.setTime(20); ringTraffic.updateShipArrivals();
assert.equal(runner.visible, false, 'A destroyed interceptor cannot reappear mid-course');
const allocatedShips = ringTraffic.ships.length;
ringTraffic.setTime(0); ringTraffic.setupLevelFleet();
assert.equal(ringTraffic.ships.length, allocatedShips, 'Retries reuse the same bounded three-ship pool');
assert.deepEqual(ringTraffic.ringShips, pool);
assert.ok(ringTraffic.ringShips.every(ship => !ship.visible && ship.userData.health === 3 && ship.userData.lastVisibleTime === -Infinity),
  'Retry resets the pool but keeps it out of the opening formation');
ringTraffic.flightRings.forEach(gate => { gate.userData.resolved = true; });
ringTraffic.resetRingShips();
assert.ok(ringTraffic.ringShips.every(ship => !ship.visible), 'No route is created when no gates are available');
console.log('PASS ring-traffic lifecycle: pause, intro, crash, results, destruction, no mid-course respawns and bounded retry reuse');

function moveTutorialTarget(game, ship, dt) {
  game.updateShipCourse(ship, dt);
  ship.position.addScaledVector(ship.userData.courseVelocity, dt).addScaledVector(game.flightMotion, -.85 * dt);
}

for (const reducedMotion of [false, true]) for (const aspect of [9 / 16, 16 / 9, 32 / 9]) {
  const entry = makeGame(reducedMotion);
  entry.setupLevelFleet(); entry.beginFlightTutorial();
  entry.camera.aspect = aspect;
  entry.camera.rotation.set(.12, -.2, .06, 'YXZ');
  entry.camera.updateProjectionMatrix(); entry.camera.updateMatrixWorld();
  entry.playerHullRotation.copy(entry.camera.quaternion);
  entry.completeTutorialStep('checkpoint'); entry.setTime(.8); entry.updateFlightTutorial();
  for (const stage of [1, 2]) {
    for (const fps of [5, 30, 60, 144]) {
      entry.flightOrientation.set(.18, -.28, .08, 'YXZ');
      entry.spawnTutorialTarget();
      const ship = entry.ships.find(ship => ship.visible);
      if (stage === 1) {
        assert.equal(ship.userData.arrivalOpacity, 0, 'The nearby ship blends in instead of popping into view');
        moveTutorialTarget(entry, ship, .1);
        assert.ok(ship.userData.arrivalOpacity > 0 && ship.userData.arrivalOpacity < 1);
        entry.resetShip(ship, true);
        assert.equal(ship.userData.arrivalOpacity, 1, 'Reusing a target killed during its fade restores normal opacity');
        entry.spawnTutorialTarget();
      }
      const destination = new THREE.Vector3(0, 0, reducedMotion ? -110 : -200)
        .applyEuler(entry.flightOrientation).add(entry.camera.position);
      const offset = ship.userData.tutorialEntry.clone();
      const duration = reducedMotion ? 3 : 2.4;
      const localOffset = offset.clone().applyQuaternion(new THREE.Quaternion().setFromEuler(entry.flightOrientation).invert());
      assert.ok(Math.abs(localOffset.x) < 1e-8, 'No sideways entrance');
      assert.ok(Math.abs(localOffset.y - (stage === 1 ? (reducedMotion ? 7 : 28) : 0)) < 1e-8,
        'Only the ship has a small downward approach; the asteroid comes straight ahead');
      assert.ok(Math.abs(localOffset.z + (reducedMotion ? 10.5 : 42)) < 1e-8);
      assert.ok(Math.abs(destination.distanceTo(entry.camera.position) - (reducedMotion ? 110 : 200)) < 1e-8, 'Both tutorial targets settle much closer');
      const destinationBearing = destination.clone().sub(entry.camera.position).normalize();
      if (stage === 2) assert.ok(ship.position.clone().sub(entry.camera.position).normalize().distanceTo(destinationBearing) < 1e-8);
      const assertFitsOnScreen = () => {
        ship.updateMatrixWorld(true);
        const bounds = ship.userData.collisionBox;
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          const corner = new THREE.Vector3(x, y, z).applyMatrix4(ship.matrixWorld).project(entry.camera);
          assert.ok(Math.abs(corner.x) < .95 && Math.abs(corner.y) < .95,
            `The larger target must still fit on screen: reduced=${reducedMotion}, aspect=${aspect}, stage=${stage}, corner=${corner.toArray()}`);
        }
      };
      assertFitsOnScreen();
      const advance = seconds => {
        for (let remaining = seconds; remaining > 1e-9;) {
          const dt = Math.min(1 / fps, remaining);
          const previous = ship.position.clone();
          moveTutorialTarget(entry, ship, dt); remaining -= dt;
          assert.equal(entry.crossesPlayer(ship, previous, ship.position), false, 'Closer tutorial targets must still clear the player hull');
        }
      };
      entry.flightMotion.set(80, 30, -350).multiplyScalar(reducedMotion ? .1 : 1);
      advance(duration / 2);
      assert.ok(ship.position.distanceTo(destination.clone().addScaledVector(offset, .5)) < 1e-8,
        'A smooth, frame-rate-independent entrance reaches halfway at half duration');
      const halfway = ship.position.clone().project(entry.camera);
      assert.ok(Math.abs(halfway.x) < .5 && Math.abs(halfway.y) < .5, 'The short trajectory stays near the flight path');
      if (stage === 2) assert.ok(ship.position.clone().sub(entry.camera.position).normalize().distanceTo(destinationBearing) < 1e-8,
        'The asteroid stays on the same straight line throughout its approach');
      if (stage === 1) assert.equal(ship.userData.arrivalOpacity, 1, 'The spawn fade completes well before settling');
      entry.flightOrientation.set(-.2, .3, 0, 'YXZ');
      entry.flightMotion.set(-60, 40, -320).multiplyScalar(reducedMotion ? .1 : 1);
      advance(duration / 2);
      assert.ok(ship.position.distanceTo(destination) < 1e-8, 'Settle at the original shooting position, not the changing heading');
      advance(1);
      assert.ok(ship.position.distanceTo(destination) < 1e-8, 'No overshoot or continued drift after the entrance');
      assertFitsOnScreen();
      assert.equal(entry.tutorialState().stage, stage, 'Entrance motion alone cannot complete a shooting lesson');
    }
    if (stage === 1) {
      entry.queueShip(entry.ships.find(ship => ship.visible)); entry.completeTutorialStep('laser');
      entry.setTime(1.6); entry.updateFlightTutorial();
    }
  }
}
console.log('PASS gentle near-path tutorial trajectories, soft spawn/reuse, no screen-width sweep, stable shooting distance and reduced motion at 5–144 FPS');

for (const reducedMotion of [false, true]) for (const corridor of [false, true]) {
  const lesson = makeGame(reducedMotion);
  lesson.setupLevelFleet(); lesson.ringCourse(corridor, 2);
  const plan = lesson.coursePlan(), runners = [...lesson.ringShips];
  lesson.beginFlightTutorial();
  const queued = [...lesson.queue], boundary = lesson.flightBoundary.position.clone();
  const allocated = lesson.ships.length;
  assert.ok(lesson.ships.every(ship => !ship.visible));
  assert.equal(lesson.flightRings.filter(gate => gate.visible).length, 1);
  lesson.setTime(50); lesson.updateShipArrivals(.1);
  assert.equal(lesson.tutorialState().stage, 0, 'Waiting must not advance the tutorial');
  assert.equal(lesson.hazardPool.length, 0); assert.equal(lesson.showerPool.length, 0);
  assert.ok(lesson.ships.every(ship => !ship.visible), 'No timed enemies or fields leak into the checkpoint lesson');
  lesson.courseWorldOffset.set(-100, 20, 16000);
  lesson.flightRings[0].visible = false; lesson.flightRings[0].userData.resolved = true;
  lesson.flightRings[0].position.set(-100, 20, 400);
  const opening = lesson.flightRings[0].position.clone();
  lesson.completeTutorialStep('checkpoint'); lesson.setTime(50.8); lesson.updateFlightTutorial();
  assert.equal(lesson.tutorialState().stage, 1);
  const target = lesson.ships.find(ship => ship.visible);
  assert.equal(lesson.ships.filter(ship => ship.visible).length, 1);
  assert.equal(target.userData.tutorialTarget, 'laser');
  const position = target.position.clone().sub(target.userData.tutorialEntry);
  lesson.flightMotion.set(100, 20, -300);
  moveTutorialTarget(lesson, target, 3.1);
  assert.ok(target.position.distanceTo(position) < 1e-8, 'Practice target settles into the flight path');
  moveTutorialTarget(lesson, target, .1);
  assert.ok(target.position.distanceTo(position) < 1e-8, 'Practice targets remain at a readable shooting distance after entering');
  lesson.queueShip(target); lesson.completeTutorialStep('laser'); lesson.setTime(51.6); lesson.updateFlightTutorial();
  const rock = lesson.ships.find(ship => ship.visible);
  assert.equal(lesson.tutorialState().stage, 2); assert.ok(rock.userData.type.asteroid);
  assert.equal(rock.userData.tutorialTarget, 'heavy'); assert.equal(rock.userData.health, 2);
  lesson.queueShip(rock); lesson.completeTutorialStep('heavy'); lesson.setTime(53.1); lesson.updateFlightTutorial();
  assert.equal(lesson.tutorialState().stage, 3); assert.equal(lesson.tutorialState().time, 53.1);
  assert.equal(lesson.tutorialState().courseStartTime, 53.1);
  assert.equal(lesson.tutorialState().completed, true); assert.equal(lesson.shield, 100);
  assert.ok(lesson.courseWorldOffset.equals(new THREE.Vector3(-100, 20, 16000)));
  assert.ok(lesson.flightBoundary.position.equals(boundary), 'The existing boundary is not rebuilt or moved');
  assert.ok(lesson.flightRings[0].position.equals(opening), 'The passed opening checkpoint is never repositioned');
  assert.equal(lesson.flightRings[0].visible, false); assert.equal(lesson.flightRings.at(-1).visible, true);
  assert.equal(lesson.flightRings.filter(gate => !gate.userData.resolved).length, 4, 'Four remaining checkpoints after the training checkpoint');
  assert.ok(lesson.flightRings.slice(1).every(gate => gate.children[0].material.opacity === 0
    && gate.children[1].material.uniforms.brightness.value === 0), 'The remaining checkpoints fade in without a transition flash');
  const continuedPlan = lesson.coursePlan();
  assert.equal(continuedPlan.length, plan.length); assert.equal(continuedPlan.bend, plan.bend);
  assert.equal(continuedPlan.shape, plan.shape, 'No random new field at the transition');
  assert.equal(continuedPlan.start, plan.start + 53.1);
  assert.equal(continuedPlan.end, plan.end + 53.1);
  assert.ok(continuedPlan.origin.equals(plan.origin.clone().add(new THREE.Vector3(0, 0, -16000))));
  assert.deepEqual(lesson.queue, queued, 'Keep the planned fleet, but deploy it gradually');
  assert.deepEqual(lesson.ringShips, runners, 'Reuse the same checkpoint traffic');
  assert.ok(lesson.ships.every(ship => !ship.visible), 'No ship pops in at the handoff; course traffic also waits');
  assert.equal(lesson.ships.length, allocated, 'The tutorial reuses real ships, without growing the fleet');
  assert.ok(lesson.ships.every(ship => !ship.userData.tutorialTarget && !ship.userData.tutorialEntry));

  const handoffOffset = lesson.courseWorldOffset.clone();
  const nextGate = lesson.flightRings.find(gate => !gate.userData.resolved);
  const checkpointDistance = lesson.camera.position.z - nextGate.position.z;
  const advanceToCheckpoint = fraction => {
    const travel = lesson.courseWorldOffset.z - handoffOffset.z;
    lesson.worldStep.set(0, 0, (checkpointDistance * fraction - travel) / .85);
    lesson.courseWorldOffset.addScaledVector(lesson.worldStep, .85);
    lesson.updateFlightRing();
  };
  // Exercise the real movement order on the first continuous frame, including a nonzero world offset.
  lesson.worldStep.set(-5, 2, 15); lesson.courseWorldOffset.addScaledVector(lesson.worldStep, .85);
  const finish = lesson.flightRings.at(-1).position.clone();
  assert.ok(lesson.ringShips.every(ship => !ship.visible), 'The two staggered arrivals come before route traffic');
  lesson.updateFlightRing(.05);
  assert.ok(lesson.flightRings.at(-1).position.distanceTo(finish.addScaledVector(lesson.worldStep, .85)) < 1e-8);
  lesson.setTime(53.59); lesson.updateShipArrivals(.05);
  assert.equal(lesson.queue.length, queued.length, 'No pop-in at the exact handoff');
  const earlyShips = queued.filter(ship => !ship.userData.type.asteroid).slice(0, 2);
  lesson.setTime(55.59); lesson.updateShipArrivals(.05);
  assert.equal(earlyShips[0].visible, false, 'Elapsed time alone must not release the first post-tutorial ship');
  advanceToCheckpoint(1 / 3 - .001); lesson.updateShipArrivals(.05);
  assert.equal(earlyShips[0].visible, false, 'Keep the first third of the checkpoint approach clear');
  advanceToCheckpoint(1 / 3 + .001);
  lesson.flightOrientation.set(.2, -.3, 0, 'YXZ'); // Spawn beside the fixed gate, not along this new heading.
  for (const [slot, ship] of earlyShips.entries()) {
    if (slot > 0) {
      lesson.setTime(55.59 + slot * 3); lesson.updateShipArrivals(.05);
      assert.equal(ship.visible, false, 'The second ship cannot arrive before its three-second gap');
    }
    lesson.setTime(55.6 + slot * 3);
    lesson.setPaused(true); lesson.updateShipArrivals(.05);
    assert.equal(lesson.queue.length, queued.length - slot, 'Pause freezes the post-training arrivals');
    lesson.setPaused(false); lesson.updateShipArrivals(.05);
    assert.equal(lesson.queue.length, queued.length - slot - 1, 'One ship at a time, not a sudden fleet');
    assert.equal(ship.visible, true); assert.equal(ship.userData.arrivalOpacity, 0);
    assertShipInsideBoundary(lesson, ship);
    assert.equal(ship.userData.health, 3, 'Real interceptor health, with no tutorial weapon restriction');
    const offset = ship.position.clone().sub(nextGate.position);
    assert.ok(offset.dot(nextGate.userData.normal) > 0, 'Both ships start before the checkpoint plane, not behind it');
    if (slot === 0) {
      const distance = ship.position.distanceTo(lesson.camera.position);
      assert.ok(distance > (reducedMotion ? 60 : 400) && distance < (reducedMotion ? 190 : 600),
        'The delayed first arrival stays at a readable shooting distance with safe hull clearance');
      assert.ok(distance < nextGate.position.distanceTo(lesson.camera.position),
        'The delayed first ship still arrives before the checkpoint');
    } else {
      assert.ok(offset.length() < (reducedMotion ? 90 : 500), 'The second arrival stays near the next checkpoint');
      assert.ok(Math.abs(offset.dot(ship.userData.courseRight)) > nextGate.userData.radius + (reducedMotion ? 30 : 90),
        'Keep the second silhouette clear of the bright checkpoint rim');
      assert.ok(Math.abs(offset.dot(nextGate.userData.normal) - (reducedMotion ? 70 : 450)) < 1e-8);
    }
    assert.ok(ship.userData.cruiseDirection.equals(nextGate.userData.normal.clone().negate()), 'Follow the checkpoint course, not subsequent player steering');
    assert.equal(lesson.ships.filter(other => other.visible && !other.userData.type.asteroid).length, slot + 1, 'Only these two ships arrive directly after training');
    lesson.recordVisibleObjects();
    assert.equal(ship.userData.lastVisibleTime, -Infinity, 'An invisible arrival cannot deal unseen collision damage');
    assert.equal(lesson.targetInfo(ship), null, 'No brackets over the still-invisible model');
    lesson.updateShipCourse(ship, .6);
    assert.ok(ship.userData.arrivalOpacity > .45 && ship.userData.arrivalOpacity < .55, 'The whole ship fades in smoothly');
    if (slot === 0) assert.ok(lesson.targetInfo(ship), 'The first ship is large enough for immediate targeting once visible');
    lesson.recordVisibleObjects(); assert.equal(ship.userData.lastVisibleTime, 55.6 + slot * 3);
    lesson.updateShipCourse(ship, .6); assert.equal(ship.userData.arrivalOpacity, 1);
  }
  assert.equal(lesson.ships.filter(ship => !ship.userData.scheduledHazard).length, allocated,
    'The two arrivals reuse planned fleet members; independent scheduled hazards keep their own pool');
  lesson.setTime(59.09); lesson.updateRingShipArrivals();
  assert.ok(lesson.ringShips.every(ship => !ship.visible), 'Route traffic waits six active course seconds');
  lesson.setTime(59.1); lesson.updateRingShipArrivals();
  assert.ok(lesson.ringShips.every(ship => ship.visible && ship.userData.arrivalOpacity === 0));
  assert.ok(lesson.ringShips.every(ship => ship.position.distanceTo(lesson.camera.position) > (reducedMotion ? 450 : 3600)));
  lesson.worldStep.set(-5, 2, 15); lesson.courseWorldOffset.addScaledVector(lesson.worldStep, .85);
  for (const ship of lesson.ringShips) {
    const distance = ship.userData.ringRoute.distance;
    lesson.updateShipCourse(ship, .05);
    ship.position.addScaledVector(ship.userData.courseVelocity, .05).addScaledVector(lesson.worldStep, .85);
    assert.ok(ship.position.distanceTo(ship.userData.ringRoute.position.clone().add(lesson.courseWorldOffset)) < 1e-8,
      'Route and rendered position share exactly one world step');
    assert.ok(ship.userData.ringRoute.distance - distance < 4, 'Traffic starts at opening speed, not the old elapsed tutorial time');
    assert.ok(ship.userData.arrivalOpacity > 0 && ship.userData.arrivalOpacity < 1);
    ship.traverse(part => {
      if (part.isMesh && !part.userData.engineExhaust) assert.equal(part.material.opacity, ship.userData.arrivalOpacity);
    });
  }
  const next = lesson.queue[0];
  lesson.setTime(61.59); lesson.updateShipArrivals(.05); assert.equal(next.visible, false);
  lesson.setTime(61.6); lesson.updateShipArrivals(.05); assert.equal(next.visible, true);
  assert.ok(next.position.distanceTo(lesson.camera.position) >= (reducedMotion ? 900 : 3600),
    'After two checkpoint arrivals, ordinary distant reinforcements resume');
  const continuedRoutes = lesson.ringShips.map(ship => ship.userData.ringRoute);
  lesson.setTime(62.1); lesson.updateRingShipArrivals();
  lesson.ringShips.forEach((ship, index) => assert.equal(ship.userData.ringRoute, continuedRoutes[index], 'The delayed course traffic deploys only once'));
  lesson.setLevel(2); lesson.setTime(0); lesson.setupLevelFleet(); lesson.beginFlightTutorial();
  assert.equal(lesson.tutorialState().stage, 3, 'Completed training is skipped on the next run');
  assert.equal(lesson.flightRings[0].visible, true, 'Ordinary levels still start with a checkpoint');
  assert.equal(lesson.ships.filter(ship => ship.visible).length, 2, 'Level two retains its two-ship opening after training');
  const levelTwoArrival = lesson.queue[0]; lesson.setTime(3); lesson.updateShipArrivals(.05);
  assert.equal(levelTwoArrival.visible, true);
  assert.ok(levelTwoArrival.position.distanceTo(lesson.camera.position) >= (reducedMotion ? 900 : 3600),
    'The nearby post-tutorial arrivals do not repeat in level two');
}
console.log('PASS real guided targets, seamless handoff, two staggered checkpoint arrivals, soft fades, model reuse and ordinary level-two arrivals');

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
