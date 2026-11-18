// Shared real-game fixture for the independent flight test suites.
import { readFileSync } from 'node:fs';
import { createFlightTutorial } from '../../src/run/tutorial.js';
import { newRun } from '../../src/run/progression.js';
import { createSimulationClock, simulationStep } from '../../src/flight/simulation-clock.js';
import { targetInfo } from '../../src/weapons/targeting.js';
import { createRepairPickup } from '../../src/course/repair-pickup.js';
import { createAsteroidImpacts, rockHitsShip } from '../../src/course/asteroid-impacts.js';
import { createCrossingAsteroids } from '../../src/course/crossing-asteroids.js';
import { createAsteroidEncounter } from '../../src/course/asteroid-encounter.js';
import { hitFlashStrength } from '../../src/flight/shield-damage.js';
import { createShieldHud } from '../../src/flight/shield-hud.js';
import { createFlightBoundary } from '../../src/course/boundary.js';
import { createCheckpoints, planCheckpoints } from '../../src/course/checkpoints.js';
import * as physics from '../../src/flight/physics.js';
import assert from 'node:assert/strict';
import { createShipModels, shipTypes } from '../../src/fleet/models.js';
import { createFragments } from '../../src/course/fragments.js';
import { createFleetArrivals } from '../../src/fleet/arrivals.js';
import { createFleetSpawn } from '../../src/fleet/spawn.js';
import { createFleetRoster, initialFleetTypes } from '../../src/fleet/roster.js';
import { createCapitalEncounter } from '../../src/fleet/capital-ship.js';
import { createFleetTraffic, advanceShipMotion } from '../../src/fleet/traffic.js';
import { createFleetVisuals, setShipOpacity } from '../../src/fleet/visuals.js';
import { createPlayerCollision } from '../../src/flight/player-collision.js';
import { getAsteroidEncounters } from '../../src/course/encounter-plan.js';
import { t, setLanguage } from '../../src/presentation/i18n.js';
setLanguage('de');

const hazardInterval = 5 / .75;
const root = new URL('../../', import.meta.url);
const THREE = await import(new URL('assets/vendor/three.module.js', root));
const source = readFileSync(new URL('src/main.js', root), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing source section: ${start}`);
  return source.slice(from, to);
};
const code = `
  const scene = new THREE.Scene(), glow = new THREE.Texture();
  const camera = new THREE.PerspectiveCamera(reducedMotion ? 70 : 90, 16 / 9, .03, 14000);
  const viewCamera = camera;
  const playerFlight = physics.createPlayerFlight(reducedMotion);
  const { target, flightMotion, flightDirection, flightOrientation, flightTurn, flightVelocity, flightViewOffset } = playerFlight;
  flightMotion.set(0, 0, -400);
  const worldStep = new THREE.Vector3();
  const progressionTimeScale = 1.5, roundDuration = 45;
  let started = true, paused = false, roundEnded = false, crashing = false, gameTime = 0, difficulty = 0;
  const crashDrifting = false;
  let danger = false;
  const elements = new Map();
  const document = { querySelector: selector => {
    if (!elements.has(selector)) elements.set(selector, { hidden: true, innerHTML: '', style: {}, classList: { toggle() {}, remove() {} } });
    return elements.get(selector);
  } };
  const innerWidth = 1280, innerHeight = 720;
  const mouseAim = new THREE.Vector2();
  const showControlStep = () => {}, updateScore = () => {};
  const explosions = [], hits = [], sounds = [];
  const pick = values => values[Math.floor(Math.random() * values.length)];
  const explode = (...args) => explosions.push(args), playSound = name => sounds.push(name);
  const messages = [];
  const collideWith = object => hits.push(object), showFeedback = (message, negative = false) => messages.push({message, negative});
  ${section('  const { createModel,', '  // Reuse one ship of each type')}
  ${section('  const { playerHull,', '  const mouseAim =')}
  ${section('  const roster =', '  function updateRetries()')}
  ${section('  const capitalEncounter =', '  const projectiles =')}
  ${section('  let shieldHitTime =', '  function collideWith(')}
  ${section('  function recordVisibleObjects()', '  function renderFrame()')}
  if (crossingDanger !== null) {
    const crossing = spawn.setAsteroidCrossing;
    spawn.setAsteroidCrossing = (rock, time, speed, radius) => crossing(rock, time, speed, radius, crossingDanger);
  }
  return {
    playerFlight, scene, sounds, messages, ships, activeAsteroids, camera, flightMotion, flightOrientation, worldStep, explosions, hits, enemyBolts: capitalEncounter.bolts, target,
    flightTurn, flightVelocity, forecastFlightPosition, flightDistanceAt, getAsteroidEncounters: () => getAsteroidEncounters(level, reducedMotion),
    get encounterIndex() { return encounter.index; }, get corridorPlan() { return encounter.corridorPlan; },
    get showerVisible() { return showerGrit.visible; }, get warningHidden() { return showerWarning.hidden; },
    get warningText() { return showerWarning.innerHTML; }, get grit() { return showerGrit; },
    get fieldGroups() { return encounter.field?.groups ?? []; }, get fieldRoute() { return encounter.field?.route ?? []; },
    get fieldDebris() { return encounter.field?.debris ?? []; }, get fieldImpacts() { return encounter.field?.impacts ?? []; }, get fieldBoulder() { return encounter.boulder; },
    recordVisibleShowerRocks, updateShowerRockCollisions, collideAsteroids, collideAsteroidsWithField, fractureImpactAsteroid: (rock, normal) => impacts.fracture(rock, normal, gameTime),
    particles: fragments.rocks, get fieldShower() { return encounter.crossingRocks; }, get showerRocks() { return debrisField.rocks; },
    get lateAsteroids() { return encounter.lateRocks; },
    ringShips: arrivals.ringShips, flightRings, resetRingShips: (distant = false) => arrivals.resetRingShips(distant, gameTime - courseStartTime, level, encounter.corridorPlan), updateRingShipCourse: traffic.updateRingShipCourse, updateRingShipArrivals, courseWorldOffset,
    beginFlightTutorial, completeTutorialStep, spawnTutorialTarget, updateFlightTutorial, updateFlightRing, flightBoundary,
    flightBoundaryOrigin: boundary.origin, flightBoundaryRadii: boundary.radii, constrainShipToBoundary,
    moveShip: (ship, dt) => traffic.moveShip(ship, dt, worldStep, !paused || crashDrifting),
    tutorialState: () => ({lesson: tutorial.lesson?.action ?? null, completed: tutorialCompleted, time: gameTime, courseStartTime}),
    coursePlan: () => ({ ...encounter.timing, ...encounter.layout, origin: encounter.layout.origin.clone(),
      direction: encounter.layout.direction.clone(), velocity: encounter.velocity.clone(), kind: encounter.kind, corridor: encounter.kind === 'corridor' }),
    ringCourse(corridor, shape = 0) {
      encounter.reset(level, [{ kind: corridor ? 'corridor' : 'shower', shape, strength: encounter.strength, direction: encounter.course,
        prepare: 0, entry: 12, exit: 27, bend: reducedMotion ? .45 : 1.15 }], courseStartTime);
      gameTime = 0; courseWorldOffset.set(0, 0, 0);
      resetFlightRing(); arrivals.resetRingShips(false, gameTime - courseStartTime, level, encounter.corridorPlan);
      return { origin: encounter.layout.origin.clone(), length: encounter.layout.length, gap: encounter.layout.gap };
    },
    setStarted: value => { started = value; },
    resetShip, fadeShipShader: ships[0].userData.hull.onBeforeCompile, targetInfo: ship => targetInfo(ship, {camera, viewCamera, mouseAim, reducedMotion, width: innerWidth, height: innerHeight}),
    updateShipCourse: traffic.updateShipCourse, avoidAsteroids: traffic.avoidAsteroids, updateCapitalShip, updateEnemyBolts, recordVisibleObjects,
    updateShipHitFlash, updateEngineThrust: traffic.updateEngineThrust, updateEngineVisuals, collideShipsWithAsteroids,
    clearEnemyBolts, updateFleet, setupLevelFleet, updateAsteroidShower, updateShipArrivals, queueShip,
    showerPool: encounter.pool, maxShowerRocks: encounter.maxShowerRocks, eventAsteroid: encounter.eventAsteroid, selectAsteroidEncounter: event => encounter.select(event, courseStartTime), fadeAsteroidShader, asteroidShader: ships[4].userData.hull.onBeforeCompile, encounterRest, corridorCenter, playerHull,
    repairPickup: repair.mesh, repairRing: repair.ring, repairMarker, updateRepairPickup, resetRepairPickup: repair.reset,
    get shield() { return shield; }, setShield: value => { shield = value; },
    get repairPending() { return repair.pending; },
    hazardPool: crossingAsteroids.rocks, get nextHazardTime() { return crossingAsteroids.nextTime; },
    // Some seeded flights isolate crossing rocks so unrelated arrivals cannot change the path or RNG.
    updateCollisionHazard() { if (!tutorial.active && canSpawnReinforcements()) crossingAsteroids.update(gameTime, difficulty); },
    levelFlightSpeed, crossesHull, crossesPlayer, playerHullRotation, hasPassedCamera, asteroidArrivalDistance: spawn.asteroidArrivalDistance,
    setAsteroidCrossing: (rock, time, dangerous) => spawn.setAsteroidCrossing(rock, time, flightMotion.length(), playerHullRadius, dangerous),
    get nextShowerObstacle() { return encounter.nextObstacle; },
    get showerSpacing() { return encounter.layout.spacing; },
    setLevel: value => { level = value; },
    setTime: value => { gameTime = value; },
    setCourseStart: value => { courseStartTime = value; },
    setPaused: value => { paused = value; },
    setRoundEnded: value => { roundEnded = value; }, setCrashing: value => { crashing = value; },
    shower: (corridor, strength, shape = 0, direction = 1) => {
      encounter.reset(level, [{ kind: corridor ? 'corridor' : 'shower', shape, strength, direction: encounter.course,
        prepare: 0, entry: 12, exit: 27, bend: direction * (reducedMotion ? .45 : 1.15) }], courseStartTime);
      const { start: showerStart, entry: showerEntry, end: showerEnd } = encounter.timing;
      gameTime = showerStart;
      courseWorldOffset.set(0, 0, flightDistanceAt(showerStart));
      worldStep.set(0, 0, 0); updateAsteroidShower();
      return { pool: encounter.pool, grit: showerGrit, gap: encounter.layout.gap, length: encounter.layout.length,
        origin: encounter.origin, rotation: encounter.rotation, direction: encounter.layout.direction, velocity: encounter.velocity, start: showerStart, entry: showerEntry, end: showerEnd,
        width: encounter.layout.halfWidth * 2, spacing: encounter.layout.spacing, obstacleSpacing: encounter.layout.obstacleSpacing, bend: encounter.layout.bend };
    },
    get capital() { return capitalShip; }, get capitalPending() { return capitalPending; },
    get queue() { return arrivals.queue; }
  };
`;
const randomState = {seed: 12345};
const math = Object.create(Math);
math.random = () => ((randomState.seed = (randomState.seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
function buildGameFixture(sourceCode) {
  const create = new Function('THREE', 'Math', 'random', 'reducedMotion', 'crossingDanger', 't', 'getAsteroidEncounters', 'createShipModels', 'shipTypes', 'createPlayerCollision', 'createAsteroidEncounter', 'physics', 'newRun', 'simulationStep', 'targetInfo', 'createFleetRoster', 'createFleetTraffic', 'createFleetVisuals', 'setShipOpacity', 'initialFleetTypes', 'planCheckpoints', 'createCheckpoints', 'createFlightBoundary', 'createCapitalEncounter', 'createShieldHud', 'hitFlashStrength', 'createFleetSpawn', 'createFleetArrivals', 'createFragments', 'createAsteroidImpacts', 'rockHitsShip', 'createRepairPickup', 'createFlightTutorial', 'createCrossingAsteroids', sourceCode);
  return (reducedMotion = false, crossingDanger = null) => create(THREE, math,
    (a, b) => a + math.random() * (b - a), reducedMotion, crossingDanger, t, getAsteroidEncounters, createShipModels, shipTypes, createPlayerCollision, createAsteroidEncounter, physics, newRun, simulationStep, targetInfo, createFleetRoster, createFleetTraffic, createFleetVisuals, setShipOpacity, initialFleetTypes, planCheckpoints, createCheckpoints, createFlightBoundary, createCapitalEncounter, createShieldHud, hitFlashStrength, createFleetSpawn, createFleetArrivals, createFragments, createAsteroidImpacts, rockHitsShip, createRepairPickup, createFlightTutorial, createCrossingAsteroids);
}
const makeGame = buildGameFixture(code);

// Drive the actual aircraft steering and simulation accumulator.
function makeFlightClock(flight, updateSimulation) {
  const { playerFlight, camera, playerHullRotation, levelFlightSpeed } = flight;
  const { flightMotion, flightOrientation, flightVelocity, flightTilt } = playerFlight;
  const initialDirection = new THREE.Vector3(0, 0, -1).applyEuler(flightOrientation);
  let speed = flightMotion.dot(initialDirection) - flightVelocity.x * initialDirection.x - flightVelocity.y * initialDirection.y;
  return {
    frame: createSimulationClock(updateSimulation).advance,
    move(dt, difficulty) {
      speed = playerFlight.advance(dt, speed, levelFlightSpeed(difficulty));
      camera.rotation.set(flightTilt.x, flightTilt.y, flightTilt.z, 'YXZ');
      playerHullRotation.copy(camera.quaternion);
    }
  };
}

function assertShipInsideBoundary(game, ship) {
  const bounds = ship.userData.collisionBox;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const corner = new THREE.Vector3(x, y, z).multiply(ship.scale).applyQuaternion(ship.quaternion)
      .add(ship.position).sub(game.flightBoundaryOrigin).sub(game.courseWorldOffset);
    assert.ok(Math.hypot(corner.x / game.flightBoundaryRadii.x, corner.y / game.flightBoundaryRadii.y) <= .98 + 1e-8,
      `${ship.userData.type.name}: the entire rotated hull must retain clearance inside the shield zone`);
  }
}

function moveRock(rock, dt, paused, reducedMotion) {
  if (!paused) advanceShipMotion(rock, dt, reducedMotion);
}

export { THREE, t, source, section, code, randomState, math, buildGameFixture, makeGame, hazardInterval, makeFlightClock, assertShipInsideBoundary, moveRock };
