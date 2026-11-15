// Shared real-game fixture for the independent flight test suites.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { t, setLanguage } from '../../i18n.js';
setLanguage('de');

const hazardInterval = 5 / .75;
const root = new URL('../../', import.meta.url);
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
  const messages = [];
  const collideWith = object => hits.push(object), showFeedback = (message, negative = false) => messages.push({message, negative});
  const rocketGeometry = new THREE.CylinderGeometry(.22, .22, 10, 8);
  rocketGeometry.rotateX(-Math.PI / 2);
  ${section('      const dark =', '      // Reuse one ship of each type')}
  ${section('      const inverseRotation =', '      const mouseAim =')}
  ${section('      const fleetOrder =', '      function updateRetries()')}
  ${section('      const enemyBolts =', '      const rockets =')}
  ${section('      const shieldHud =', '      function collideWith(')}
  ${section('      function recordVisibleObjects()', '      function renderFrame()')}
  if (crossingDanger !== null) {
    const crossing = setAsteroidCrossing;
    setAsteroidCrossing = (rock, time) => crossing(rock, time, crossingDanger);
  }
  return {
    scene, sounds, messages, ships, activeAsteroids, camera, flightMotion, flightOrientation, worldStep, explosions, hits, enemyBolts, target,
    flightTurn, flightVelocity, advanceFlightHeading, forecastFlightPosition, flightDistanceAt, getAsteroidEncounters,
    get encounterIndex() { return asteroidEncounterIndex; }, get corridorPlan() { return corridorPlan; },
    get showerVisible() { return showerGrit.visible; }, get warningHidden() { return showerWarning.hidden; },
    get warningText() { return showerWarning.innerHTML; }, get grit() { return showerGrit; },
    get fieldGroups() { return fieldGroups; }, get fieldRoute() { return fieldRoute; },
    get fieldDebris() { return fieldDebris; }, get fieldImpacts() { return fieldImpacts; }, get fieldBoulder() { return fieldBoulder; },
    recordVisibleShowerRocks, updateShowerRockCollisions, collideAsteroids, collideAsteroidsWithField, fractureImpactAsteroid,
    particles, get fieldShower() { return fieldShower; }, get showerRocks() { return showerRocks; },
    get lateAsteroids() { return lateAsteroids; },
    ringShips, flightRings, resetRingShips, updateRingShipCourse, updateRingShipArrivals, courseWorldOffset,
    beginFlightTutorial, completeTutorialStep, spawnTutorialTarget, updateFlightTutorial, updateFlightRing, flightBoundary,
    flightBoundaryOrigin, flightBoundaryRadii, constrainShipToBoundary,
    moveShip(ship, dt) {
      ${section('          ship.position.addScaledVector(worldStep, .85);', '          updateShipHitFlash(ship);')}
    },
    tutorialState: () => ({stage: tutorialStage, completed: tutorialCompleted, completedAt: tutorialStepCompletedAt, time: gameTime, courseStartTime}),
    coursePlan: () => ({origin: showerCourseOrigin.clone(), start: showerStart, entry: showerEntry, end: showerEnd,
      length: showerLength, bend: showerBend, shape: showerShape, corridor: showerCorridor, kind: showerKind,
      direction: showerDirection.clone(), velocity: showerVelocity.clone()}),
    ringCourse(corridor, shape = 0) {
      asteroidEncounters = []; corridorPlan = null;
      showerStart = 0; showerEntry = 12; showerEnd = 27; showerPending = true;
      showerCorridor = corridor; showerKind = corridor ? 'corridor' : 'shower'; showerShape = shape; showerBend = reducedMotion ? .45 : 1.15;
      gameTime = 0; courseWorldOffset.set(0, 0, 0);
      planAsteroidShower(); resetFlightRing(); resetRingShips();
      return { origin: showerCourseOrigin.clone(), length: showerLength, gap: showerHalfGap };
    },
    setStarted: value => { started = value; },
    resetShip, fadeShipShader, targetInfo, updateShipCourse, avoidAsteroids, updateCapitalShip, updateEnemyBolts, recordVisibleObjects,
    updateShipHitFlash, updateEngineThrust, updateEngineVisuals, collideShipsWithAsteroids,
    clearEnemyBolts, playerLaserSpeed, setupLevelFleet, updateAsteroidShower, updateShipArrivals, queueShip,
    showerPool, maxShowerRocks, eventAsteroid, selectAsteroidEncounter, fadeAsteroidShader, asteroidShader, encounterRest, corridorCenter, corridorSlope, playerHull,
    repairPickup, repairRing, repairMarker, updateRepairPickup, resetRepairPickup,
    get shield() { return shield; }, setShield: value => { shield = value; },
    get repairPending() { return repairPending; }, setRepairPending: value => { repairPending = value; },
    hazardPool, updateCollisionHazard, levelFlightSpeed, crossesHull, crossesPlayer, playerHullRotation, hasPassedCamera, asteroidArrivalDistance, setAsteroidCrossing,
    get nextHazardTime() { return nextHazardTime; },
    get nextShowerObstacle() { return nextShowerObstacle; },
    get showerSpacing() { return showerSpacing; },
    setLevel: value => { level = value; }, setPressure: value => { levelPressure = value; },
    setTime: value => { gameTime = value; },
    setCourseStart: value => { courseStartTime = value; },
    setPaused: value => { paused = value; },
    setRoundEnded: value => { roundEnded = value; }, setCrashing: value => { crashing = value; },
    shower: (corridor, strength, shape = 0, direction = 1) => {
      asteroidEncounters = []; corridorPlan = null;
      showerStart = 0; showerEntry = 12; showerEnd = 27; showerPending = true; showerTravel = 0; nextShowerSlice = 0;
      showerCorridor = corridor; showerKind = corridor ? 'corridor' : 'shower'; showerStrength = strength; showerShape = shape;
      showerBend = direction * (reducedMotion ? .45 : 1.15); gameTime = showerStart;
      planAsteroidShower();
      courseWorldOffset.set(0, 0, flightDistanceAt(showerStart));
      worldStep.set(0, 0, 0); updateAsteroidShower();
      return { pool: showerPool, grit: showerGrit, gap: showerHalfGap, length: showerLength,
        origin: showerOrigin, rotation: showerRotation, direction: showerDirection, velocity: showerVelocity, start: showerStart, entry: showerEntry, end: showerEnd,
        width: showerHalfWidth * 2, spacing: showerSpacing, obstacleSpacing: showerObstacleSpacing, bend: showerBend };
    },
    get capital() { return capitalShip; }, get capitalPending() { return capitalPending; },
    get queue() { return spawnQueue; }
  };
`;
const randomState = {seed: 12345};
const math = Object.create(Math);
math.random = () => ((randomState.seed = (randomState.seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const createGame = new Function('THREE', 'Math', 'random', 'reducedMotion', 'crossingDanger', 't', code);
const makeGame = (reducedMotion = false, crossingDanger = null) => createGame(
  THREE, math, (a, b) => a + math.random() * (b - a), reducedMotion, crossingDanger, t
);

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

function assertShipInsideBoundary(game, ship) {
  const bounds = ship.userData.collisionBox;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const corner = new THREE.Vector3(x, y, z).multiply(ship.scale).applyQuaternion(ship.quaternion)
      .add(ship.position).sub(game.flightBoundaryOrigin).sub(game.courseWorldOffset);
    assert.ok(Math.hypot(corner.x / game.flightBoundaryRadii.x, corner.y / game.flightBoundaryRadii.y) <= .98 + 1e-8,
      `${ship.userData.type.name}: the entire rotated hull must retain clearance inside the shield zone`);
  }
}

// Exercise the actual per-step movement/rotation block, not a test-only approximation.
const moveRock = new Function('ship', 'dt', 'paused', 'reducedMotion',
  section('          if (!paused) {\n            ship.position.addScaledVector(ship.userData.courseVelocity, dt);', '\n          updateShipHitFlash(ship);'));

export { THREE, t, source, section, code, randomState, math, makeGame, hazardInterval, makeFlightClock, assertShipInsideBoundary, moveRock };
