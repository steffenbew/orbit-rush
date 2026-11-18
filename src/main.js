import { t, language, detectLanguage, setLanguage, applyTranslations } from './presentation/i18n.js';
import { createCrossingAsteroids } from './course/crossing-asteroids.js';
import { createFlightView, flightPointerDistance, cameraModeFromPreference, nextCameraMode } from './flight/view.js';
import { createPlayerAim, createPlayerControls } from './platform/player-controls.js';
import { anchorTouchViewport, bindTouchButtons } from './platform/touch-ui.js';
import { livesAfterImpact, newRun, nextRoundProgress, roundOutcome } from './run/progression.js';
import { createFlightTutorial } from './run/tutorial.js';
import { killReward } from './run/scoring.js';
import { showRoundResult } from './run/result.js';
import { createWeapons, advanceWeapons, requestShot } from './weapons/rules.js';
import { collisionDamage, hitFlashStrength } from './flight/shield-damage.js';
import { createShieldHud } from './flight/shield-hud.js';
import { createSimulationClock, simulationStep } from './flight/simulation-clock.js';
import { createWeaponHud, createTargetHud } from './weapons/hud.js';
import { createRoundClock } from './presentation/round-clock.js';
import { createFrameStats } from './presentation/frame-stats.js';
import { createRenderDiagnostics } from './platform/render-diagnostics.js';

const touchMode = matchMedia('(any-pointer: coarse)').matches;
document.body.classList.toggle('touch-device', touchMode);
bindTouchButtons(document.querySelectorAll('button:not(#touch-laser, #touch-power)'));
if (touchMode) document.querySelector('#effects').dataset.i18nAriaLabel = 'touchControls';

setLanguage(detectLanguage(navigator.languages?.[0] || navigator.language));
applyTranslations();
const languagePicker = document.querySelector('#language');
languagePicker.querySelector(`input[value="${language}"]`).checked = true;
languagePicker.setAttribute('data-ready', '');
const status = document.querySelector('#status');
const hud = document.querySelector('.hud'), scorePanel = document.querySelector('.score-panel'), hudActions = document.querySelector('.hud-actions');
function updateHudClearance() {
  const scoreBounds = scorePanel.getBoundingClientRect(), actionsBounds = hudActions.getBoundingClientRect();
  const right = innerWidth - actionsBounds.left;
  hud.style.setProperty('--hud-clearance', `${Math.ceil(Math.max(scoreBounds.right, right) + 12)}px`);
  hud.style.setProperty('--hud-panels-bottom', `${Math.ceil(Math.max(scoreBounds.bottom, actionsBounds.bottom))}px`);
}
// Recalculate only when viewport, localized content or button visibility changes, not each frame.
const hudResizeObserver = new ResizeObserver(updateHudClearance);
for (const element of [hud, scorePanel, hudActions]) hudResizeObserver.observe(element);
updateHudClearance();
let getRenderState = () => ({ phase: 'loading' });
let stopRendering = () => {};
let renderPhase = 'initializing';
if (touchMode) anchorTouchViewport(updateHudClearance);
const renderDiagnostics = createRenderDiagnostics({
  root: document.querySelector('#render-diagnostics'), canvas: document.querySelector('#space'), t,
  getState: () => getRenderState(), onFailure: () => stopRendering()
});
try {
  const [THREE, { createSpaceBackground }, { createShipModels, shipTypes },
    { createPlayerCollision }, { createAsteroidEncounter }, physics,
    { getAsteroidEncounters },
    { createPlayerProjectiles }, { createTargetLock, aimLaser },
    { createFleetRoster, initialFleetTypes }, { createFleetTraffic }, { createFleetVisuals, setShipOpacity },
    { createCheckpoints, planCheckpoints }, { createFlightBoundary }, { createCapitalEncounter }, { createFleetSpawn }, { createFleetArrivals }, { createFragments }, { createExplosions },
    { createAsteroidImpacts, rockHitsShip }, { createIntro }, { createRepairPickup }, { createCrashMotion }
  ] = await Promise.all([
    import('../assets/vendor/three.module.js'),
    import('./presentation/space-background.js'),
    import('./fleet/models.js'),
    import('./flight/player-collision.js'),
    import('./course/asteroid-encounter.js'),
    import('./flight/physics.js'),
    import('./course/encounter-plan.js'),
    import('./weapons/projectiles.js'),
    import('./weapons/targeting.js'),
    import('./fleet/roster.js'),
    import('./fleet/traffic.js'),
    import('./fleet/visuals.js'),
    import('./course/checkpoints.js'),
    import('./course/boundary.js'),
    import('./fleet/capital-ship.js'),
    import('./fleet/spawn.js'),
    import('./fleet/arrivals.js'),
    import('./course/fragments.js'),
    import('./presentation/explosions.js'),
    import('./course/asteroid-impacts.js'),
    import('./presentation/intro.js'),
    import('./course/repair-pickup.js'),
    import('./flight/crash-motion.js')
  ]);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#space'), antialias: true });
  // Stop after the current callback, once Three.js has scheduled its next frame.
  stopRendering = () => queueMicrotask(() => renderer.setAnimationLoop(null));
  // Keep high-DPI fill cost bounded; HUD text stays at native CSS resolution.
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#030711');
  // A clearer showcase keeps the full-size distant ships readable on the menu.
  scene.fog = new THREE.FogExp2('#030711', .0003);
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .03, 14000);
  scene.add(new THREE.HemisphereLight(0xadcaff, 0x32205c, 3));
  const sun = new THREE.DirectionalLight(0xffddc4, 3);
  sun.position.set(-100, 100, 50);
  scene.add(sun);
  const random = (a, b) => a + Math.random() * (b - a);
  const pick = items => items[Math.floor(Math.random() * items.length)];
  const { planet, glow, updateSpaceBackground } = createSpaceBackground(scene, camera, reducedMotion);

  const { createModel, createPlayerModel, fadeAsteroidShader } = createShipModels(glow, reducedMotion);
  function localTestLevel() {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return null;
    const params = new URLSearchParams(location.search);
    if (!params.has('test')) return null;
    const value = params.get('level');
    if (!value || !/^\d+$/.test(value)) return null;
    const requested = Number(value);
    return Number.isInteger(requested) && requested >= 1 && requested <= 1000 ? requested : null;
  }
  let { level, score, kills, retries, shield, levelCheckpoint } = newRun();
  const levelFlightSpeed = progress => physics.levelFlightSpeed(level, reducedMotion, progress);
  const flightDistanceAt = time => physics.flightDistanceAt(time, { level, reducedMotion, roundDuration, simulationStep });
  const ships = [];
  const { updateShipHitFlash, updateEngineVisuals, recordVisibleFleet } = createFleetVisuals(camera, reducedMotion);
  const spawn = createFleetSpawn({ reducedMotion, random, updateShipHitFlash });
  function resetShip(ship, initial = false, formationSlot = ship.userData.slot, maxAsteroidTier = 3) {
    spawn.resetShip(ship, { level, formationSlot, maxAsteroidTier, openingSpeed: levelFlightSpeed(0),
      flight: initial ? null : { speed: flightMotion.length(), position: camera.position, orientation: flightOrientation,
        playerHullRadius, constrainShipToBoundary } });
  }
  function createShip(typeIndex) {
    const slot = ships.length;
    const template = shipTypes[typeIndex].asteroid && slot >= initialFleetTypes.length ? ships[Math.random() < .5 ? 4 : 7] : null;
    const ship = createModel(slot, typeIndex, template);
    resetShip(ship, true);
    ships.push(ship);
    scene.add(ship);
    return ship;
  }
  initialFleetTypes.forEach(createShip);

  // Reuse one ship of each type for the intro; gameplay unlocks the fleet gradually.
  createShip(4);
  const intro = createIntro({ scene, camera, ships, reducedMotion,
    introPlay: document.querySelector('#start'), orbitHover: matchMedia('(hover: hover)') });
  intro.update(0, innerWidth, innerHeight, false);
  const canvas = document.querySelector('#effects');
  const effects = createExplosions({ scene, camera, glow, reducedMotion, random, pick, onBlast: applyExplosionShockwave });
  const { explode } = effects;
  let emission = 0;
  let paused = true, speed = 0;
  const playerFlight = physics.createPlayerFlight(reducedMotion);
  const { target, flightVelocity, flightTurn, flightTilt, flightViewOffset, flightMotion, flightDirection, flightOrientation } = playerFlight;
  const worldStep = new THREE.Vector3();

  const flightPath = document.querySelector('#flight-path');
  const collisionAlert = document.querySelector('#collision-alert');
  const dangerVignette = document.querySelector('#danger-vignette');
  // The camera stays near the origin. Moving every world object by the same
  // inverse flight vector is equivalent to travelling through the scene.
  const { playerHull, playerHullRadius, playerHullRotation, crossesPlayer, pathHitsPlayer, crossesHull } = createPlayerCollision(camera.position);
  const viewFrustum = new THREE.Frustum();
  const viewProjection = new THREE.Matrix4();
  const passedBox = new THREE.Box3(), passedMatrix = new THREE.Matrix4();
  function hasPassedCamera(object, bounds = object.userData.collisionBox) {
    object.updateMatrixWorld(true);
    passedMatrix.multiplyMatrices(viewCamera.matrixWorldInverse, object.matrixWorld);
    // Keep the whole hull, not just its center, until it is safely behind the view.
    return passedBox.copy(bounds).applyMatrix4(passedMatrix).min.z > 100;
  }
  const fragments = createFragments({ scene, reducedMotion, random, pick, viewFrustum, hasPassedCamera, crossesPlayer });
  const mouseAim = new THREE.Vector2();
  const headingPoint = new THREE.Vector3();
  const reticle = document.querySelector('.reticle');
  const roundDuration = 45;
  const frameStats = createFrameStats(document.querySelector('#performance-hud'), location.search, () =>
    document.hidden ? 'inactive' : !started ? 'ready' : crashing ? 'collision' : roundEnded ? 'ended' : paused ? 'pause' : null);
  const simulationClock = createSimulationClock(updateSimulation, () => document.hidden || (started && paused && !crashDrifting));
  let lastFrameTime = performance.now();
  function resetSimulationClock() {
    lastFrameTime = performance.now();
    simulationClock.reset();
    frameStats.reset();
  }
  const progressionTimeScale = roundDuration / 30;
  const roster = createFleetRoster(ships, createShip);
  function isFlightActive() {
    return started && !paused && !roundEnded && !crashing;
  }
  const traffic = createFleetTraffic({ camera, flightMotion, reducedMotion, random, constrainShipToBoundary, isFlightActive });
  const { activeAsteroids } = traffic;
  const crossingAsteroids = createCrossingAsteroids({ reducedMotion, flightMotion, levelFlightSpeed, playerHullRadius,
    createShip, resetShip, spawn, forecastFlightPosition });
  function encounterRest(time = gameTime - courseStartTime) {
    return (time >= 10 && time < 15) || (time >= 28 && time < 33);
  }
  const firstCheckpointTime = 5;
  const courseWorldOffset = new THREE.Vector3(), courseOrigin = new THREE.Vector3();
  let courseStartTime = 0;
  let capitalShip = roster.capital, capitalPending = false;
  const capitalHud = document.querySelector('#capital-hud');
  const capitalHealth = document.querySelector('#capital-health');
  const capitalState = document.querySelector('#capital-state');
  const showerWarning = document.querySelector('#shower-warning');
  const encounter = createAsteroidEncounter({ scene, camera, reducedMotion, random, createShip, resetShip, hasPassedCamera,
    flightMotion, worldStep, courseOrigin, courseWorldOffset, getGates: () => flightRings, roundDuration, firstCheckpointTime,
    flightDistanceAt, levelFlightSpeed, asteroidType: shipTypes[3], fadeAsteroidShader, playerHullRadius, crossesPlayer, showerWarning });
  const { mesh: showerGrit, previousOrigin: showerPreviousOrigin, debrisField, corridorCenter } = encounter;
  function findShowerLaserHit(from, to, maxDistance) {
    if (!isFlightActive() || encounter.kind === 'shower') return null;
    return debrisField.findLaserHit(from, to, maxDistance);
  }
  function damageShowerRock(rock, damage) {
    if (rock.destroyed) return;
    rock.health -= damage;
    hitMarker = .16;
    if (rock.health <= 0) {
      const collider = debrisField.colliderFor(rock);
      debrisField.remove(rock);
      award(collider);
      playSound('explosion', 1);
      explode(debrisField.impactPoint, 16, false, true, .4, false);
    } else {
      playSound('hit');
      explode(debrisField.impactPoint, 6, false, true, .2, false);
    }
  }
  function recordVisibleShowerRocks() {
    debrisField.recordVisible(viewFrustum);
  }
  function onDebrisContact(collider) {
    collideWith(collider);
    return crashing;
  }
  function updateShowerRockCollisions() {
    return isFlightActive() && debrisField.updateContacts(showerPreviousOrigin, onDebrisContact);
  }
  const tutorial = createFlightTutorial();
  let tutorialCompleted = false; // Persisted with round results; lesson progress is per attempt.
  function beginFlightTutorial() {
    if (!tutorial.begin(level, tutorialCompleted)) return;
    // Save the opening fleet for gradual reinforcements after the lesson, not a second near-camera formation.
    arrivals.reserveOpening();
    ships.forEach(ship => { ship.visible = false; delete ship.userData.tutorialTarget; delete ship.userData.tutorialEntry; });
    flightRings.slice(1).forEach(gate => { gate.visible = false; gate.userData.resolved = true; });
    repair.hide();
    showControlStep();
  }
  function completeTutorialStep(action) {
    if (isFlightActive()) tutorial.complete(action, gameTime);
  }
  function spawnTutorialTarget() {
    const ship = ships[tutorial.lesson.action === 'laser' ? 4 : 0];
    resetShip(ship, true);
    ship.userData.tutorialTarget = tutorial.lesson.action;
    if (ship.userData.type.asteroid) {
      ship.userData.asteroidTier = 2; ship.scale.setScalar(1.3);
      ship.userData.health = ship.userData.maxHealth = 2;
    }
    ship.position.set(0, 0, reducedMotion ? -110 : -200).applyEuler(flightOrientation).add(camera.position);
    // The ship gently descends into the path; the closer asteroid approaches straight along it.
    const offset = reducedMotion ? 7 : 28;
    ship.userData.tutorialEntry = new THREE.Vector3(0, ship.userData.type.asteroid ? 0 : offset, -offset * 1.5)
      .applyEuler(flightOrientation);
    ship.position.add(ship.userData.tutorialEntry);
    if (!ship.userData.type.asteroid) setShipOpacity(ship, 0);
    constrainShipToBoundary(ship);
    ship.userData.previousPosition.copy(ship.position);
    ship.userData.courseVelocity.copy(flightMotion).multiplyScalar(.85);
  }
  function updateFlightTutorial() {
    if (!isFlightActive() || !tutorial.active) return;
    if (tutorial.takeCheckpointRetry(gameTime)) {
      // A missed practice checkpoint gets a new attempt on the fixed course axis, not on the pointer's heading.
      const gate = flightRings[0];
      gate.position.copy(camera.position).add(courseWorldOffset);
      gate.position.z = camera.position.z - flightDistanceAt(firstCheckpointTime);
      gate.userData.previous.copy(gate.position);
      gate.userData.resolved = false; gate.visible = true; gate.userData.fadeStart = gameTime;
    }
    if (!tutorial.advance(gameTime)) return;
    if (tutorial.active) { spawnTutorialTarget(); showControlStep(); return; }
    tutorialCompleted = true;
    ships.forEach(ship => { delete ship.userData.tutorialTarget; delete ship.userData.tutorialEntry; });
    // Continue this flight: no clock, motion, weapon, particle or world-offset reset.
    courseStartTime = gameTime;
    arrivals.startAfterTutorial(gameTime);
    crossingAsteroids.start(gameTime);
    // Only the still-hidden encounters and remaining checkpoints move ahead of the ongoing flight.
    const depthShift = camera.position.z - courseWorldOffset.z - courseOrigin.z;
    courseOrigin.z += depthShift;
    encounter.shiftStart(gameTime, depthShift);
    resetFlightRing(true);
    showControlStep();
    playSound('go');
  }
  function setupLevelFleet() {
    const { fleet, capital, capitalPending: scheduled } = roster.forLevel(level);
    capitalShip = capital; capitalPending = scheduled;
    capitalHud.hidden = true;
    clearEnemyBolts();
    ships.forEach(ship => { ship.visible = false; });
    const openingSpeed = levelFlightSpeed(0);
    fleet.slice(0, 2).forEach((ship, slot) => {
      resetShip(ship, true, slot);
      ship.position.z = -550 - slot * Math.max(280, openingSpeed * .85 * 1.5);
    });
    arrivals.reset(fleet.slice(2));
    crossingAsteroids.start(0);
    repair.reset();
    courseWorldOffset.set(0, 0, 0); courseOrigin.copy(camera.position); courseStartTime = 0;
    encounter.reset(level, getAsteroidEncounters(level, reducedMotion));
    resetFlightRing();
    arrivals.prepareRoutes(0, level, encounter.corridorPlan);
    resetFlightBoundary();
  }
  function forecastFlightPosition(position, steps) {
    const step = simulationStep;
    const orientation = flightOrientation.clone(), turn = flightTurn.clone(), drift = flightVelocity.clone();
    const velocity = flightMotion.clone();
    const direction = new THREE.Vector3(0, 0, -1).applyEuler(orientation);
    let forward = Math.max(0, velocity.dot(direction) - drift.x * direction.x - drift.y * direction.y);
    position.copy(camera.position);
    for (let i = 0; i < steps; i++) {
      // Arrivals run after player movement: the rock's first world step is already set.
      position.addScaledVector(velocity, .85 * step);
      const progress = Math.min(1, (gameTime - courseStartTime + (i + 1) * step) / roundDuration);
      forward = physics.advanceFlightMotion(step, { speed: forward, cruiseSpeed: levelFlightSpeed(progress),
        orientation, turn, input: target, drift, velocity, reducedMotion });
    }
  }
  function updateAsteroidShower(dt = 0) {
    const earlyFinale = level === 4 && !capitalPending && !capitalShip?.visible && capitalShip?.userData.health <= 0;
    encounter.update(dt, gameTime, courseStartTime, isFlightActive(), earlyFinale);
  }
  function queueShip(ship) { arrivals.queueShip(ship, gameTime); }
  const impacts = createAsteroidImpacts({ ships, encounter, fragments, reducedMotion, sample: Math.random });
  function collideAsteroids() {
    return isFlightActive() ? impacts.collideRocks(activeAsteroids, gameTime) : 0;
  }
  function collideAsteroidsWithField() {
    return isFlightActive() ? impacts.collideField(activeAsteroids, gameTime) : 0;
  }
  function collideShipsWithAsteroids() {
    if (paused || roundEnded || crashing) return;
    for (const ship of ships) {
      if (!ship.visible || ship.userData.type.asteroid) continue;
      for (const rock of activeAsteroids) {
        if (!rock.visible || !rockHitsShip(rock, ship, crossesHull)) continue;
        rock.userData.health = 0;
        explode(rock.position, 18, false, true, rock.scale.x / 3.2, false);
        queueShip(rock);
        // Only player weapons can damage the boss; its hull still destroys rocks.
        if (ship.userData.type.capital) continue;
        ship.userData.health = 0;
        // Environmental kills do not award score, combo or kill credit.
        explode(ship.position, 65, false, false, ship.scale.x / 2.4, false);
        if (gameTime - ship.userData.lastVisibleTime < .3) playSound('explosion', ship.scale.x);
        queueShip(ship);
        break;
      }
    }
  }
  function canSpawnReinforcements() {
    return isFlightActive() && !encounterRest();
  }
  function updateShipArrivals(dt = 0) {
    if (tutorial.active) return;
    updateAsteroidShower(dt);
    // Existing ships and fields keep moving; only reinforcements take a breather.
    if (!canSpawnReinforcements()) return;
    crossingAsteroids.update(gameTime, difficulty);
    if (capitalPending && gameTime - courseStartTime >= 6) {
      capitalPending = false;
      resetShip(capitalShip);
    }
    arrivals.advance(gameTime, gameTime - courseStartTime, level, encounter.corridorPlan);
  }
  function updateFleet(dt) {
    traffic.snapshotFleet(ships);
    // Decide courses from the same frame state, before moving any fleet member.
    if (!paused && !roundEnded) {
      for (const ship of ships) {
        if (!ship.visible) continue;
        if (ship.userData.type.capital) updateCapitalShip(ship, dt);
        else traffic.updateShipCourse(ship, dt);
      }
    }
    for (const ship of ships) {
      if (roundEnded && !crashDrifting) break;
      if (!ship.visible) continue;
      const previous = ship.userData.previousPosition;
      traffic.moveShip(ship, dt, worldStep, !paused || crashDrifting);
      updateShipHitFlash(ship);
      if (!paused && !ship.userData.collisionHandled && ship.userData.lastVisibleTime > -Infinity && crossesPlayer(ship, previous, ship.position)) {
        collideWith(ship);
        if (crashing) break;
      }
      if (!paused && !ship.userData.collisionHandled && ship.position.z < 0) {
        const relativeVelocity = flightMotion.clone().multiplyScalar(-.85).add(ship.userData.courseVelocity);
        const future = ship.position.clone().addScaledVector(relativeVelocity, 1.6);
        if (crossesPlayer(ship, ship.position, future, 8)) danger = true;
      }
      // Steering can leave a hull visible even after its center passes world Z = 100.
      if (!ship.userData.tutorialTarget && hasPassedCamera(ship)) queueShip(ship);
    }
  }

  function updateRetries() {
    for (const id of ['retry-hud', 'retry-result']) {
      const indicator = document.getElementById(id);
      indicator.setAttribute('aria-label', t('lives', { count: retries }));
      indicator.querySelectorAll('.retry-icons span').forEach((icon, index) => icon.classList.toggle('spent', index >= retries));
    }
    document.querySelector('#retry-result').hidden = !roundEnded;
  }
  let roundEnded = false, difficulty = 0;
  let celebrating = false;
  let crashing = false, crashTime = 0, crashDrifting = false;
  const crashMotion = createCrashMotion({ reducedMotion, flightOrientation, flightTilt, flightViewOffset,
    flightVelocity, flightMotion, flightDirection });
  let shieldHitTime = 0, shieldHitStrength = 1;
  const shieldHit = document.querySelector('#shield-hit');
  const shieldHud = createShieldHud(document, reducedMotion, shield);
  function updateShield(animate = true) {
    shieldHud.set(shield, animate);
    renderShieldHud();
  }
  function damageShield(amount) {
    shield = Math.max(0, shield - amount);
    updateShield();
    shieldHitStrength = hitFlashStrength(amount);
    shieldHitTime = .55; shieldHit.hidden = false;
  }
  function updateShieldAnimation(dt) {
    shieldHud.advance(dt, started && !paused);
  }
  function renderShieldHud() {
    shieldHud.render(paused);
  }
  const repairMarker = document.querySelector('#repair-marker');
  const repair = createRepairPickup({ scene, camera, glow, reducedMotion, flightOrientation, flightMotion, worldStep,
    ships, hasPassedCamera, repairMarker, sample: Math.random });
  function updateRepairPickup(dt) {
    if (!isFlightActive()) { repairMarker.hidden = true; return; }
    if (!repair.update(dt, { needsRepair: shield < 100, duringRest: encounterRest(), viewCamera,
      width: innerWidth, height: innerHeight })) return;
    shield = Math.min(100, shield + 25);
    updateShield();
    showFeedback(t('repaired', { amount: 25 }));
    playSound('reward');
  }
  const checkpoints = createCheckpoints({ scene, camera, reducedMotion, onCrossing: resolveFlightRing,
    flightRingWash: document.querySelector('#flight-ring-wash'), flightRingGuide: document.querySelector('#flight-ring-guide') });
  const flightRings = checkpoints.gates;
  function resetFlightRing(openingComplete = false) {
    const { corridorPlan } = encounter;
    const plan = planCheckpoints({ level, reducedMotion, firstCheckpointTime, roundDuration, flightDistanceAt, levelFlightSpeed,
      openingComplete, corridorPlan, originZ: courseOrigin.z, exitHeightAtCorridor: corridorPlan ? corridorCenter(corridorPlan.length, corridorPlan) : 0 });
    checkpoints.reset(plan, courseOrigin, courseWorldOffset, gameTime, openingComplete);
  }
  function renderFlightRingFeedback() {
    checkpoints.render(gameTime, isFlightActive(), roundEnded || crashing, viewCamera, innerWidth, innerHeight);
  }
  function resolveFlightRing(gate, passed) {
    if (passed) {
      const restored = !tutorial.active ? Math.min(5, 100 - shield) : 0;
      if (restored > 0) {
        shield += restored;
        updateShield();
      }
      if (gate.userData.kind === 'start') completeTutorialStep('checkpoint');
      const reward = restored > 0 ? t('repaired', { amount: restored }) : shield === 100 ? t('shieldFull') : '';
      showFeedback((reward ? `${reward} · ` : '') + t('ringPassed'));
      playSound('checkpoint');
    } else {
      tutorial.missCheckpoint(gameTime);
      damageShield(10);
      showFeedback(t('ringMissed'), true);
      playSound('checkpointMiss');
      if (shield === 0) startCrash(gate);
    }
    return crashing;
  }
  function updateFlightRing() {
    if (isFlightActive()) checkpoints.update(gameTime, worldStep, flightMotion);
  }
  const arrivals = createFleetArrivals({ ships, flightRings, camera, flightMotion, courseOrigin, courseWorldOffset,
    reducedMotion, random, createShip, resetShip, constrainShipToBoundary, shipCruiseSpeed: traffic.shipCruiseSpeed,
    flightDistanceAt, levelFlightSpeed, firstCheckpointTime, roundDuration, progressionTimeScale });
  function updateRingShipArrivals() {
    if (!isFlightActive() || tutorial.active) return;
    arrivals.updateRingShipArrivals(gameTime, gameTime - courseStartTime, level, encounter.corridorPlan);
  }
  const boundary = createFlightBoundary({ scene, camera, reducedMotion, courseWorldOffset, flightMotion, playerHullRadius });
  const flightBoundary = boundary.mesh;
  function resetFlightBoundary() {
    boundary.reset();
    flightViewOffset.set(0, 0);
  }
  function renderFlightBoundaryFeedback() {
    if (!started || roundEnded || crashing) flightBoundary.visible = false;
  }
  function constrainShipToBoundary(ship) {
    if (isFlightActive()) boundary.constrainShip(ship);
  }
  function alignFlightAfterRebound() {
    speed = physics.alignFlightAfterRebound({ velocity: flightMotion, direction: flightDirection,
      orientation: flightOrientation, viewOffset: flightViewOffset, drift: flightVelocity, turn: flightTurn });
  }
  function constrainFlightToBoundary() {
    if (!isFlightActive()) return;
    const outward = boundary.constrainPlayer(worldStep, gameTime, alignFlightAfterRebound);
    if (outward === undefined) return;
    damageShield(10);
    showFeedback(t('shieldLost', { amount: 10 }), true);
    if (shield === 0) {
      startCrash(flightBoundary);
      return;
    }
    if (!reducedMotion) shake = Math.max(shake, .45);
    // Use incoming normal speed, before the rebound; forward/tangential speed is irrelevant.
    playSound(outward >= (reducedMotion ? 15 : 150) ? 'shieldHard' : 'shieldGlance');
  }
  function updateFlightBoundary(dt) {
    if (!started || roundEnded || crashing) {
      flightBoundary.visible = false;
      return;
    }
    if (paused) return;
    boundary.update(dt, gameTime);
  }
  function collideWith(object) {
    if (paused || roundEnded || crashing || object.userData.collisionHandled) return;
    object.userData.collisionHandled = true;
    const damage = collisionDamage(object);
    damageShield(damage);
    showFeedback(t('shieldLost', { amount: damage }), true);
    if (shield === 0) {
      startCrash(object);
      return;
    }
    shake = reducedMotion ? 0 : Math.max(shake, .9 + damage / 60);
    // Push away from the impact; existing steering inertia lets the pilot recover.
    const impulse = Math.max(speed, 180) * (.15 + damage / 200) * (reducedMotion ? .15 : 1);
    const pushX = object.position.x === camera.position.x ? (Math.random() < .5 ? -1 : 1) : Math.sign(camera.position.x - object.position.x);
    const pushY = object.position.y === camera.position.y ? (Math.random() < .5 ? -1 : 1) : Math.sign(camera.position.y - object.position.y);
    if (!object.userData.enemyBolt) {
      flightVelocity.x += pushX * impulse;
      flightVelocity.y += pushY * impulse * .5;
    }
    playSound('hit');
  }
  const successBurst = document.querySelector('#success-burst');
  let successTime = 0;
  let best = 0, lastReward = null, gameTime = 0, shake = 0, flash = 0;
  try { best = Math.max(0, Number(localStorage.getItem('sternflug-highscore')) || 0); } catch {}
  const scoreLabel = document.querySelector('#score');
  let bestAtLevelStart = best;
  const bestLabel = document.querySelector('#best');
  const feedback = document.querySelector('#feedback');
  const feedbackValue = document.querySelector('#feedback-value'), feedbackDetail = document.querySelector('#feedback-detail');
  let feedbackUntil = 0;
  function showFeedback(message, negative = false, bossReward = false) {
    if (!bossReward && gameTime < feedbackUntil && feedback.classList.contains('boss-reward') && feedback.classList.contains('pop')) return;
    feedback.classList.toggle('boss-reward', bossReward);
    // Make the amount prominent, even when localized checkpoint penalties put it last.
    const parts = message.split(' · ');
    const amountIndex = parts.findIndex(part => /^[+−]\d/.test(part));
    if (amountIndex > 0) parts.unshift(...parts.splice(amountIndex, 1));
    feedbackValue.textContent = parts.shift();
    feedbackDetail.textContent = parts.join(' · ');
    feedbackUntil = gameTime + (bossReward ? 3 : 1.2);
    feedback.classList.toggle('negative', negative);
    feedback.classList.remove('pop');
    void feedback.offsetWidth;
    feedback.classList.add('pop');
  }
  function updateScore() {
    scoreLabel.textContent = String(score).padStart(6, '0');
    bestLabel.textContent = String(best).padStart(6, '0');
  }
  function award(ship) {
    if (roundEnded) return;
    lastReward = killReward(ship.userData.type, ship.userData.asteroidTier, gameTime, lastReward);
    const { points, combo } = lastReward;
    kills += 1;
    score += points;
    if (score > best) {
      best = score;
      try { localStorage.setItem('sternflug-highscore', String(best)); } catch {}
    }
    showFeedback('+' + points + (combo > 1 ? ' · COMBO ×' + combo : ' · ' + ship.userData.type.name), false, !!ship.userData.type.capital);
    updateScore();
    if (combo > 1) playSound('reward');
  }
  updateScore();
  const sound = await import('./presentation/audio.js');
  let soundEnabled = true, started = false, hitMarker = 0;
  let updateRestored = false;
  const playSound = sound.playSound;
  const audioNotice = document.querySelector('#audio-notice');
  function audioError(error) {
    console.error(error);
    audioNotice.hidden = false;
    audioNotice.textContent = t('audioError');
  }
  function syncMusic() {
    sound.setPaused(paused || !started || document.hidden);
    sound.setMuted(!soundEnabled);
  }
  async function startGame(withSound = true) {
    if (globalThis.orbitUpdates?.locked) return;
    const button = document.querySelector('#start');
    const label = document.querySelector('#start-label');
    button.disabled = true;
    document.querySelector('#silent-start').disabled = true;
    languagePicker.disabled = true;
    label.dataset.i18n = 'loadingAudio';
    label.textContent = t('loadingAudio');
    let audioTimeout;
    try {
      // Unlock audio first: fullscreen can consume Safari's user activation.
      // Both calls must happen in the click handler, before the first await.
      const audioReady = withSound ? sound.initAudio() : Promise.resolve();
      let fullscreenReady;
      if (fullscreenPreferred && document.fullscreenEnabled && !document.fullscreenElement) {
        fullscreenReady = document.documentElement.requestFullscreen().then(() => {
          // Leave one paint for the resized intro canvas before starting the simulation.
          return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }).catch(error => {
          console.warn('Automatic fullscreen request failed:', error);
        });
      }
      if (withSound) await Promise.race([
        audioReady,
        new Promise((_, reject) => {
          audioTimeout = setTimeout(() => reject(new Error('Audio startup timed out. Retry or start without sound.')), 15000);
        })
      ]);
      if (fullscreenReady) await fullscreenReady;
      soundEnabled = withSound;
      document.querySelector('#sound').setAttribute('aria-pressed', String(withSound));
      document.querySelector('#sound').setAttribute('aria-label', t(withSound ? 'soundOff' : 'soundOn'));
      document.querySelector('#sound').title = t(withSound ? 'soundOff' : 'soundOn');
      // Start at the gameplay FOV: widening it over the first frames looks like reversing.
      camera.fov = reducedMotion ? 70 : 90;
      camera.updateProjectionMatrix();
      started = true; paused = false;
      intro.hide();
      scene.fog.density = .00065;
      const testLevel = localTestLevel();
      if (testLevel !== null) {
        level = testLevel;
        tutorialCompleted = true;
      }
      setupLevelFleet();
      beginFlightTutorial();
      resetSimulationClock();
      playerAim.start();
      document.body.classList.add('playing');
      document.querySelector('#intro').hidden = true;
      audioNotice.hidden = true;
      syncMusic();
      playSound('reward');
      document.activeElement.blur();
    } catch (error) {
      audioError(error);
      label.dataset.i18n = 'retryStart';
      label.textContent = t('retryStart');
      document.querySelector('#silent-start').disabled = false;
    } finally {
      clearTimeout(audioTimeout);
      button.disabled = false;
      languagePicker.disabled = false;
      globalThis.orbitUpdates?.check();
    }
  }
  document.querySelector('#start').addEventListener('click', () => startGame());
  document.querySelector('#silent-start').addEventListener('click', () => startGame(false));
  audioNotice.addEventListener('click', async () => {
    try { await sound.initAudio(); audioNotice.hidden = true; syncMusic(); playSound('shot'); }
    catch (error) { audioError(error); }
  });
  document.addEventListener('pointerdown', () => {
    if (started && soundEnabled) sound.resumeAudio().catch(audioError);
  }, { capture: true });
  document.querySelector('#sound').addEventListener('click', async event => {
    soundEnabled = !soundEnabled;
    const button = event.currentTarget;
    if (soundEnabled) {
      try { await sound.initAudio(); audioNotice.hidden = true; }
      catch (error) { audioError(error); soundEnabled = false; }
    }
    button.setAttribute('aria-pressed', String(soundEnabled));
    button.setAttribute('aria-label', t(soundEnabled ? 'soundOff' : 'soundOn'));
    button.title = t(soundEnabled ? 'soundOff' : 'soundOn');
    syncMusic();
  });
  document.querySelector('.credits').addEventListener('click', event => {
    event.preventDefault();
    if (crashing) return;
    if (started && !paused) togglePause();
    document.querySelector('#audio-credits').showModal();
  });
  const pauseMenu = document.querySelector('#pause-menu');
  const cameraButton = document.querySelector('#camera-view');
  const cockpitHorizon = document.querySelector('#cockpit-horizon');
  const cockpitLaser = document.querySelector('#cockpit-laser');
  const cockpitAux = document.querySelector('#cockpit-aux');
  // Avoid repainting the full-screen SVG when an instrument reading hasn't changed.
  function setInstrument(element, attribute, value) {
    if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
  }
  let savedCameraMode;
  try { savedCameraMode = localStorage.getItem('orbit-rush-view'); } catch {}
  let cameraMode = cameraModeFromPreference(savedCameraMode);
  function syncCameraButton() {
    document.body.dataset.camera = cameraMode;
    const key = nextCameraMode(cameraMode) + 'CameraAction';
    cameraButton.dataset.i18nAriaLabel = cameraButton.dataset.i18nTitle = key;
    cameraButton.setAttribute('aria-label', t(key));
    cameraButton.title = t(key);
  }
  function toggleCameraView() {
    cameraMode = nextCameraMode(cameraMode);
    syncCameraButton();
    try { localStorage.setItem('orbit-rush-view', cameraMode); } catch {}
  }
  syncCameraButton();
  cameraButton.addEventListener('click', toggleCameraView);

  // Keep the original camera at the pilot's position for flight, collisions and weapon origins.
  let viewCamera = camera;
  const playerShip = createPlayerModel();
  scene.add(playerShip);
  updateEngineVisuals(playerShip);

  const flightView = createFlightView(camera, playerShip, reducedMotion);
  function updateCameraView(dt = 0) {
    viewCamera = flightView.update({ chase: started && cameraMode === 'chase', crashing, playerHullRotation, vertical: target.y }, dt);
  }
  const roundDialog = document.querySelector('#round-end');
  const renderClock = createRoundClock(document, roundDuration, () => sound.playCountdownTick());
  function renderRoundClock() {
    renderClock(gameTime - courseStartTime, { level, training: tutorial.active,
      inFlight: started && !crashing && !roundEnded, paused, celebrating });
  }
  function startCrash(ship) {
    if (crashing || roundEnded) return;
    crashing = true; crashTime = 0; crashDrifting = true; paused = true;
    // Read the impact in cockpit space so banked hits tumble and flare on the correct side.
    camera.updateMatrixWorld();
    const localContact = camera.worldToLocal(ship.position.clone());
    crashMotion.begin(speed, localContact);
    controls.reset();
    if (pauseMenu.open) pauseMenu.close();
    showerWarning.hidden = true;
    repair.hide();
    shieldHitStrength = 1; // Losing a life always has full impact, even on a low-shield hit.
    shieldHitTime = .55; shieldHit.hidden = false;
    updateShield(false);
    retries = livesAfterImpact(retries);
    updateRetries();
    projectiles.clear();
    clearEnemyBolts();
    capitalHud.hidden = true;
    flightPath.hidden = true;
    collisionAlert.hidden = true;
    renderRoundClock();
    feedback.classList.remove('pop');
    clearTargetLock();
    document.querySelector('#impact-label').textContent = t(ship.userData.flightRing || ship === flightBoundary ? 'shieldDepleted' : ship.userData.enemyBolt ? 'incomingFire' : 'collision');
    document.querySelector('#impact-label').hidden = false;
    document.querySelector('#flash').classList.add('impact');
    camera.updateMatrixWorld();
    const impact = new THREE.Vector3(localContact.x > 0 ? 3 : -3, -1, -22).applyMatrix4(camera.matrixWorld);
    effects.crashBurst(impact, flightMotion);
    flash = reducedMotion ? 0 : .45;
    shake = reducedMotion ? 0 : 1;
    sound.setAlarm(false);
    syncMusic();
    playSound('explosion', 3, true);
    sound.playEngineFailure(speed);
  }
  function updateCrashFlight(dt) {
    if (crashDrifting && !document.hidden) speed = crashMotion.advance(dt, speed);
  }
  function finishRound(reason = 'time') {
    if (roundEnded) return;
    enterRoundResult(roundOutcome(reason !== 'collision', retries));
    if (celebrating) {
      successTime = 0;
      successBurst.hidden = false;
      playSound('reward');
    }
  }
  function enterRoundResult(outcome) {
    // Also used after restoring a saved result. The impact already consumed a life.
    const crashed = outcome !== 'victory';
    if (pauseMenu.open) pauseMenu.close();
    if (!crashed) gameTime = courseStartTime + roundDuration;
    flightPath.hidden = true;
    collisionAlert.hidden = true;
    dangerVignette.style.opacity = 0;
    dangerVignette.classList.remove('warning');
    sound.setAlarm(false);
    crashing = false; flash = 0; shake = 0;
    shieldHitTime = 0; shieldHit.hidden = true;
    updateShield(false);
    document.querySelector('#impact-label').hidden = true;
    document.querySelector('#flash').classList.remove('impact');
    document.querySelector('#flash').style.opacity = 0;
    roundEnded = true; celebrating = !crashed; paused = crashed;
    controls.reset({ keepPointer: celebrating });
    clearEnemyBolts();
    capitalHud.hidden = true;
    showerWarning.hidden = true;
    if (!crashed) showerGrit.visible = false;
    repair.hide();
    updateRetries();
    renderRoundClock();
    if (crashed && !crashDrifting) speed = 0;
    document.body.classList.toggle('celebrating', celebrating);
    document.body.classList.toggle('defeated', crashed);
    emission = 0; lastReward = null;
    feedback.classList.remove('pop');
    clearTargetLock();
    resetPlayerWeapons();
    hitMarker = 0;
    if (celebrating) ships.forEach(ship => { ship.visible = false; });
    syncMusic();
    showRoundResult(roundDialog, outcome, { level, score, newRecord: score > bestAtLevelStart && score >= best });
    globalThis.orbitUpdates?.check();
  }
  roundDialog.addEventListener('cancel', event => event.preventDefault());
  function restartRound() {
    if (globalThis.orbitUpdates?.locked) return;
    controls.reset();
    if (!roundEnded || crashing) return;
    const outcome = roundOutcome(celebrating, retries);
    const next = nextRoundProgress({ level, score, kills, retries, shield, levelCheckpoint }, outcome);
    ({ level, score, kills, retries, shield, levelCheckpoint } = next);
    if (updateRestored) restoreUserActivation();
    bestAtLevelStart = best;
    lastReward = null; gameTime = 0;
    roundEnded = false; celebrating = false; emission = 0;
    document.body.classList.remove('celebrating', 'defeated');
    successBurst.hidden = true;
    roundDialog.classList.remove('victory');
    difficulty = 0; paused = false; speed = 0;
    shieldHitTime = 0; shieldHit.hidden = true;
    updateShield(false);
    if (roundDialog.open) roundDialog.close();
    if (pauseMenu.open) pauseMenu.close();
    document.querySelector('#pause').setAttribute('aria-pressed', 'false');
    document.querySelector('#pause').setAttribute('aria-label', t('pauseFlight'));
    document.querySelector('#pause').title = t('pauseFlight');
    sound.resumeAudio().catch(audioError);
    syncMusic();
    updateRetries();
    feedback.classList.remove('pop');
    clearFlightEffects();
    resetPlayerFlight();
    setupLevelFleet();
    beginFlightTutorial();
    resetPlayerWeapons();
    clearTargetLock();
    updateScore();
    renderRoundClock();
    playerAim.restart(touchMode);
    document.activeElement.blur();
    resetSimulationClock();
  }
  function restoreUserActivation() {
    // A reload loses audio/fullscreen activation; reacquire both on this deliberate click.
    updateRestored = false;
    if (soundEnabled) sound.initAudio().catch(audioError);
    if (fullscreenPreferred && document.fullscreenEnabled && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(error => console.warn('Fullscreen request failed:', error));
    }
  }

  function clearFlightEffects() {
    effects.clear();
    fragments.clear();
  }
  function resetPlayerFlight() {
    flash = 0; shake = 0;
    flightView.reset();
    target.set(0, 0); flightVelocity.set(0, 0); flightTurn.set(0, 0); flightTilt.set(0, 0, 0); flightViewOffset.set(0, 0);
    flightMotion.set(0, 0, 0);
    flightDirection.set(0, 0, -1); flightOrientation.set(0, 0, 0, 'YXZ');
    worldStep.set(0, 0, 0);
    collisionAlert.hidden = true;
    dangerVignette.style.opacity = 0;
    dangerVignette.classList.remove('warning');
    crashing = false; crashTime = 0; crashDrifting = false;
    crashMotion.reset();
    sound.setAlarm(false);
    document.querySelector('#impact-label').hidden = true;
    camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
    camera.fov = reducedMotion ? 70 : 90;
    camera.updateProjectionMatrix();
  }

  function resetPlayerWeapons() {
    projectiles.clear();
    weapons = createWeapons();
    shotFlashUntil = 0; emptyFlashUntil = 0;
    renderWeaponHud(weapons);
  }

  document.querySelector('#play-again').addEventListener('click', restartRound);
  // Space belongs to gameplay, not the auto-focused result button. Keep Enter/click.
  // Cancel release too, including a key held while the result screen appears.
  for (const name of ['keydown', 'keyup']) {
    document.querySelector('#play-again').addEventListener(name, event => {
      if (event.code === 'Space') event.preventDefault();
    });
  }
  const capitalEncounter = createCapitalEncounter({ scene, glow, camera, reducedMotion, flightMotion, flightDirection, traffic,
    worldStep, pathHitsPlayer, onHit: object => { collideWith(object); return crashing; } });
  const clearEnemyBolts = capitalEncounter.clear;
  function updateCapitalShip(ship, dt) {
    if (!isFlightActive()) return;
    if (capitalEncounter.updateShip(ship, dt, level, gameTime, gameTime - courseStartTime, encounterRest())) playSound('shot');
  }
  function updateEnemyBolts(dt) {
    return started && !paused && !roundEnded && capitalEncounter.updateBolts(dt);
  }
  const projectiles = createPlayerProjectiles({
    scene, glow, camera, flightMotion, ships,
    findWallHit: findShowerLaserHit, onWallHit: damageShowerRock, onShipHit: hitShipWithLaser
  });
  let weapons = createWeapons();
  let shotFlashUntil = 0, emptyFlashUntil = 0;
  const renderWeaponHud = createWeaponHud(document, reticle);
  const targetLock = createTargetLock();
  const renderTargetHud = createTargetHud(document);
  function clearTargetLock() {
    targetLock.clear();
    renderTargetHud(targetLock, viewCamera, innerWidth, innerHeight);
  }
  function updateTargetLock(dt) {
    if (!started || roundEnded || crashing) { targetLock.clear(); return; }
    if (paused) return;
    camera.updateMatrixWorld();
    if (targetLock.update(dt, ships, { camera, viewCamera, mouseAim, width: innerWidth, height: innerHeight, reducedMotion })) {
      playSound('lock');
    }
  }
  const controlHints = document.querySelector('#control-hints');
  const controlTitle = document.querySelector('#control-hints-title');
  const controlInput = document.querySelector('#control-input-label');
  function showControlStep() {
    const step = tutorial.lesson;
    const showingGo = tutorial.showingGo(gameTime);
    if (!step && !showingGo) return;
    controlTitle.textContent = t(showingGo ? 'flightGo' : step.title);
    controlInput.textContent = showingGo ? '' : t(touchMode ? step.touchInput : step.input);
    controlHints.classList.remove('complete', 'finished');
    controlHints.classList.toggle('go', showingGo);
    controlHints.classList.toggle('space-key', !showingGo && step.action === 'heavy');
    controlHints.classList.toggle('checkpoint-step', !showingGo && step.action === 'checkpoint');
  }
  function updateControlHints() {
    const showingGo = tutorial.showingGo(gameTime);
    controlHints.hidden = !isFlightActive() || (!tutorial.active && !showingGo);
    if (controlHints.hidden) return;
    controlHints.classList.toggle('complete', showingGo || tutorial.solved);
    controlHints.classList.toggle('finished', tutorial.fadingFinalHint(gameTime));
    // On touch, keep instructions above the thumb controls rather than chasing the aim.
    const x = touchMode ? innerWidth / 2 : (mouseAim.x * .5 + .5) * innerWidth;
    const y = touchMode ? innerHeight / 2 : (-mouseAim.y * .5 + .5) * innerHeight;
    const width = controlHints.offsetWidth, height = controlHints.offsetHeight;
    const top = !touchMode && y + 64 + height <= innerHeight - 12 ? y + 64 : y - 64 - height;
    controlHints.style.left = `${Math.max(12 + width / 2, Math.min(innerWidth - 12 - width / 2, x))}px`;
    controlHints.style.top = `${Math.max(12, top)}px`;
  }
  function updateCollisionAlert() {
    collisionAlert.hidden = !isFlightActive() || !danger;
  }
  function fireRocket(manualAttempt = false, heavy = false) {
    if (!started || paused || roundEnded) return;
    const result = requestShot(weapons, gameTime, heavy, manualAttempt);
    if (!result) return;
    const now = gameTime * 1000;
    if (result === 'empty') {
      if (!heavy) { emptyFlashUntil = now + 110; shotFlashUntil = 0; }
      playSound('empty');
      return;
    }
    shotFlashUntil = now + 60; emptyFlashUntil = 0;
    renderWeaponHud(weapons);
    playSound('shot');
    camera.updateMatrixWorld();
    updateTargetLock(0);
    const target = targetLock.locked ? targetLock.ship : null;
    const { origin, direction } = aimLaser(camera, viewCamera, mouseAim, flightMotion, target, heavy);
    projectiles.fire(origin, direction, heavy);
  }
  function shatterAsteroid(ship) {
    if (Math.random() < .6) effects.dust(ship);
    else fragments.shatter(ship);
  }
  function applyExplosionShockwave(position, sizeFactor, screenFlash = true) {
    if (!isFlightActive()) return;
    const strength = physics.applyBlastImpulse(position, sizeFactor, {
      playerPosition: camera.position, speed, drift: flightVelocity, reducedMotion });
    if (reducedMotion || strength === 0) return;
    // Keep the strongest kick rather than stacking camera motion from clustered blasts.
    shake = Math.max(shake, Math.min(2.2, strength * 2.2));
    if (screenFlash) flash = Math.max(flash, Math.min(.3, strength * .3));
  }
  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    // Keep the gas giant in the opening sky on narrow screens, too.
    planet.position.x = Math.min(1250, 600 * camera.aspect);
    camera.updateProjectionMatrix();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * ratio);
    canvas.height = Math.round(innerHeight * ratio);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    reticle.style.left = `${(mouseAim.x * .5 + .5) * innerWidth}px`;
    reticle.style.top = `${(-mouseAim.y * .5 + .5) * innerHeight}px`;
  }
  function sprayEmojis(x, y, count) {
    effects.sprayEmojis(x, y, count, viewCamera, innerWidth, innerHeight);
  }
  const playerAim = createPlayerAim({ target, mouseAim, headingPoint, reticle, getCameraMode: () => cameraMode });
  const controls = createPlayerControls({
    canvas, touchRoot: document.querySelector('#touch-controls'), touchMode, aim: playerAim,
    mode() {
      if (!started || paused || crashing || (roundEnded && !celebrating)) return 'inactive';
      return celebrating ? 'victory' : 'flight';
    },
    onFire: (heavy, point) => {
      if (celebrating) sprayEmojis(point?.x ?? (mouseAim.x * .5 + .5) * innerWidth, point?.y ?? (-mouseAim.y * .5 + .5) * innerHeight, 10);
      else fireRocket(true, heavy);
    },
    onPause: togglePause, onView: toggleCameraView, wakeAudio: () => sound.resumeAudio().catch(audioError)
  });
  function updateFlightPointer() {
    if (!started || crashing) return;
    headingPoint.copy(flightDirection);
    if (!headingPoint.lengthSq()) headingPoint.set(0, 0, -1).applyEuler(flightOrientation);
    headingPoint.multiplyScalar(flightPointerDistance).add(camera.position).project(viewCamera);
    if (!paused) playerAim.update();
  }
  async function endRun() {
    if (!started || !paused || globalThis.orbitUpdates?.locked) return;
    document.querySelector('#end-run').disabled = true;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch (error) {
      console.warn('Exiting fullscreen failed:', error);
    }
    // Reload to reset the entire run; localStorage preferences and highscore survive.
    window.location.reload();
  }
  document.querySelector('#end-run').addEventListener('click', endRun);
  function togglePause() {
    if (!started || (roundEnded && !celebrating) || crashing) return;
    paused = !paused;
    if (paused) speed = 0;
    resetSimulationClock();
    controls.reset();
    const button = document.querySelector('#pause');
    button.setAttribute('aria-pressed', String(paused));
    button.setAttribute('aria-label', t(paused ? 'resumeFlight' : 'pauseFlight'));
    button.title = t(paused ? 'resumeFlight' : 'pauseFlight');
    if (paused) {
      pauseMenu.show();
      document.querySelector('#continue-flight').focus();
    } else {
      pauseMenu.close();
      document.activeElement.blur();
      playerAim.resume();
      sound.resumeAudio().catch(audioError);
    }
    syncMusic();
  }
  document.querySelector('#pause').addEventListener('click', togglePause);
  document.querySelector('#continue-flight').addEventListener('click', togglePause);
  pauseMenu.addEventListener('cancel', event => {
    event.preventDefault();
    togglePause();
  });
  // A non-modal pause leaves HUD controls available; handle Escape outside the menu too.
  document.addEventListener('keydown', event => {
    if (event.code !== 'Escape' || !pauseMenu.open || document.querySelector('dialog:modal')) return;
    event.preventDefault();
    if (!event.repeat) togglePause();
  });
  // Holding a gameplay key through pause must not resume or restart the run.
  for (const name of ['keydown', 'keyup']) {
    pauseMenu.addEventListener(name, event => {
      if (event.code === 'Space' || (event.code === 'Escape' && event.repeat)) event.preventDefault();
    });
  }
  const fullscreenButton = document.querySelector('#fullscreen');
  fullscreenButton.hidden = !document.fullscreenEnabled;
  let fullscreenPreferred = true;
  try { fullscreenPreferred = localStorage.getItem('orbit-rush-fullscreen') !== 'false'; } catch {}
  function syncFullscreen() {
    const label = t(fullscreenPreferred ? 'exitFullscreen' : 'enterFullscreen');
    fullscreenButton.setAttribute('aria-pressed', String(fullscreenPreferred));
    fullscreenButton.setAttribute('aria-label', label);
    fullscreenButton.title = label;
  }
  fullscreenButton.addEventListener('click', async () => {
    fullscreenPreferred = !fullscreenPreferred;
    try { localStorage.setItem('orbit-rush-fullscreen', String(fullscreenPreferred)); } catch {}
    syncFullscreen();
    try {
      if (!fullscreenPreferred && document.fullscreenElement) await document.exitFullscreen();
      else if (fullscreenPreferred && started && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch (error) {
      console.warn('Fullscreen request failed:', error);
    }
  });
  syncFullscreen();
  document.addEventListener('visibilitychange', () => {
    resetSimulationClock();
    if (document.hidden) {
      if (started && !paused) togglePause();
      sound.suspendAudio().catch(audioError);
    }
  });
  window.addEventListener('resize', resize);
  resize();
  status.textContent = '';
  document.querySelector('#start').disabled = false;
  document.querySelector('#start-label').dataset.i18n = 'startFlight';
  document.querySelector('#start-label').textContent = t('startFlight');
  updateRetries();
  languagePicker.disabled = false;
  languagePicker.addEventListener('change', event => {
    if (started) return;
    setLanguage(event.target.value);
    applyTranslations();
    updateRetries();
    showControlStep();
    renderWeaponHud(weapons);
    syncFullscreen();
  });
  let danger = false;
  // One fixed tick in execution order. Contacts use the new player position;
  // projectiles see fleet movement, and fragments see projectile impacts.
  function updateSimulation(dt) {
    advanceRoundTimers(dt);
    if (!paused && !roundEnded) advanceWeapons(weapons, gameTime, dt);
    movePlayerAndCamera(dt);
    updateShipArrivals(dt);
    if (crashDrifting && showerGrit.visible) showerGrit.position.addScaledVector(worldStep, .85);
    updateFleet(dt);
    resolveFlightHazards(dt);
    if (roundEnded && !celebrating && !crashDrifting) return;
    updateFiringInput(dt);
    if (!paused) projectiles.update(dt, worldStep);
    updateFlightEffects(dt);
  }

  function advanceRoundTimers(dt) {
    if (!started) intro.update(dt, innerWidth, innerHeight, document.hidden);
    if (crashing && !document.hidden) {
      crashTime += dt;
      if (crashTime >= 2) finishRound('collision');
    }
    updateFlightTutorial(); // Advance lesson stages before this step moves the world.
    updateRingShipArrivals();
    if ((!paused || crashing) && shieldHitTime > 0) shieldHitTime = Math.max(0, shieldHitTime - dt);
    updateShieldAnimation(dt);
    if (!successBurst.hidden && !document.hidden) {
      successTime += dt;
      if (successTime >= 1.4) successBurst.hidden = true;
    }
    if (!paused && !roundEnded) {
      gameTime = tutorial.active ? gameTime + dt : Math.min(courseStartTime + roundDuration, gameTime + dt);
      difficulty = tutorial.active ? 0 : (gameTime - courseStartTime) / roundDuration;
      if (!tutorial.active && gameTime >= courseStartTime + roundDuration - 1e-9) finishRound();
      if (gameTime >= feedbackUntil) feedback.classList.remove('pop');
    }
  }

  function movePlayerAndCamera(dt) {
    if (crashDrifting) updateCrashFlight(dt);
    else if (paused) speed = 0;
    else {
      hitMarker = Math.max(0, hitMarker - dt);
      const cruiseSpeed = celebrating ? (reducedMotion ? 35 : 150) : levelFlightSpeed(difficulty);
      speed = playerFlight.advance(dt, speed, cruiseSpeed);
      camera.rotation.set(flightTilt.x, flightTilt.y, flightTilt.z, 'YXZ');
      // Follow the aircraft, never cosmetic camera shake.
      playerHullRotation.copy(camera.quaternion);
    }
    worldStep.copy(flightMotion).multiplyScalar(paused && !crashDrifting ? 0 : -dt);
    constrainFlightToBoundary();
    if (isFlightActive()) courseWorldOffset.addScaledVector(worldStep, .85);
    if (crashDrifting) camera.rotation.set(flightTilt.x, flightTilt.y, flightTilt.z, 'YXZ');
    if ((!paused || crashing) && shake > 0) {
      shake = Math.max(0, shake - dt * 3);
      camera.rotation.x += random(-.008, .008) * shake;
      camera.rotation.y += random(-.008, .008) * shake;
    }
    flash = Math.max(0, flash - dt * 3);
    updateSpaceBackground(worldStep, level, started, paused, crashDrifting);
    camera.fov = started && !reducedMotion ? 90 : 70;
    camera.updateProjectionMatrix();
    danger = false;
    camera.updateMatrixWorld();
    updateCameraView(paused ? 0 : dt);
    updateFlightPointer();
    viewFrustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(viewCamera.projectionMatrix, viewCamera.matrixWorldInverse));
  }

  function resolveFlightHazards(dt) {
    danger = updateShowerRockCollisions() || danger;
    collideAsteroids();
    collideAsteroidsWithField();
    collideShipsWithAsteroids();
    if (!danger && !paused && !roundEnded) {
      danger = fragments.approaching(flightMotion);
    }
    const incomingFire = updateEnemyBolts(dt);
    if (!tutorial.active) updateRepairPickup(dt);
    updateFlightRing();
    updateFlightBoundary(dt);
    danger = danger || incomingFire;
  }

  function updateFiringInput(dt) {
    updateTargetLock(dt);
    if (!paused && !roundEnded) {
      if (controls.normalHeld) fireRocket();
      if (controls.heavyHeld && weapons.heavyCharge === 1) fireRocket(false, true);
    }
    if (celebrating && !paused && (controls.normalHeld || controls.heavyHeld)) {
      const pointer = controls.pointer;
      emission += dt * (reducedMotion ? 15 : 30);
      const count = Math.floor(emission);
      emission -= count;
      const x = pointer ? pointer.x : (mouseAim.x * .5 + .5) * innerWidth;
      const y = pointer ? pointer.y : (-mouseAim.y * .5 + .5) * innerHeight;
      sprayEmojis(x, y, count);
    }
  }

  function hitShipWithLaser(hit, heavy, damage, position) {
    hitMarker = .16;
    const lessonWeapon = hit.userData.tutorialTarget;
    const correctWeapon = !lessonWeapon || (lessonWeapon === 'heavy') === heavy;
    hit.userData.health -= correctWeapon ? damage : 0;
    if (hit.userData.health <= 0) {
      if (lessonWeapon) completeTutorialStep(lessonWeapon);
      playSound('explosion', hit.scale.x);
      award(hit);
      const explosionScale = hit.scale.x / (hit.userData.type.asteroid ? 3.2 : 2.4);
      explode(hit.position, 65, false, hit.userData.type.asteroid, explosionScale, true, hit.userData.type.capital);
      if (hit.userData.type.asteroid && !lessonWeapon) shatterAsteroid(hit);
      queueShip(hit);
    } else {
      playSound('hit');
      hit.userData.hitFlash = .2;
      updateShipHitFlash(hit);
      explode(position, 12);
    }
  }

  function updateFlightEffects(dt) {
    const moving = !paused || crashDrifting;
    effects.update(dt, worldStep, viewCamera, moving);
    for (const hit of fragments.update(dt, worldStep, moving, !paused && !roundEnded)) collideWith(hit);
  }
  function recordVisibleObjects() {
    // A catch-up step is not a rendered frame: unseen spawns cannot hit us.
    // Once shown, a solid hull stays collidable when it leaves the view beside a wing.
    camera.updateMatrixWorld();
    viewFrustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(viewCamera.projectionMatrix, viewCamera.matrixWorldInverse));
    recordVisibleFleet(ships, viewFrustum, gameTime);
    fragments.recordVisible(gameTime);
  }
  function renderFrame() {
    updateCameraView();
    updateFlightPointer();
    controls.updateTouchHud(weapons.heat, weapons.overheated, weapons.heavyCharge);
    updateControlHints();
    recordVisibleObjects();
    recordVisibleShowerRocks();
    renderRoundClock();
    renderWeaponHud(weapons);
    shieldHit.hidden = shieldHitTime === 0;
    shieldHit.style.opacity = String((reducedMotion ? .35 : 1) * shieldHitStrength * shieldHitTime / .55);
    renderShieldHud();
    const cross = document.querySelector('#hit-cross');
    cross.style.opacity = hitMarker > 0 ? 1 : 0;
    cross.style.left = reticle.style.left || '50%'; cross.style.top = reticle.style.top || '50%';
    reticle.classList.toggle('hit', hitMarker > 0);
    document.querySelector('#flash').style.opacity = flash;
    sound.updateEngine(speed);
    updateCollisionAlert();
    feedback.style.visibility = danger && !paused && !roundEnded && !feedback.classList.contains('boss-reward') && !feedback.classList.contains('negative') ? 'hidden' : 'visible';
    dangerVignette.classList.toggle('warning', danger && !paused && !roundEnded);
    // The crash pulse fades; defeat keeps a static dark-red tint beneath the results.
    const crashTint = Math.min(1, crashTime / .45) * Math.min(1, Math.max(0, (2 - crashTime) / 1.2));
    dangerVignette.style.opacity = roundEnded && !celebrating ? 1
      : crashing ? (reducedMotion ? .3 : .7) * crashTint : danger && !paused && !roundEnded ? .4 : 0;
    sound.setAlarm(danger && !paused && !roundEnded);
    flightPath.hidden = !started || (roundEnded && !celebrating) || crashing;
    if (!flightPath.hidden) {
      flightPath.style.left = `${(headingPoint.x * .5 + .5) * innerWidth}px`;
      flightPath.style.top = `${(-headingPoint.y * .5 + .5) * innerHeight}px`;
    }
    repairMarker.hidden = repairMarker.hidden || paused || roundEnded || crashing;
    renderFlightRingFeedback();
    renderFlightBoundaryFeedback();
    capitalHud.hidden = !isFlightActive() || !capitalShip?.visible;
    if (!capitalHud.hidden) {
      capitalHealth.max = capitalShip.userData.maxHealth;
      capitalHealth.value = Math.max(0, capitalShip.userData.health);
      const charging = capitalShip.userData.gunsCharging;
      capitalHud.classList.toggle('charging', charging);
      capitalState.textContent = t('capitalStatus', { health: capitalShip.userData.health, max: capitalShip.userData.maxHealth, state: t(capitalShip.userData.retreating ? 'capitalRetreating' : charging ? 'capitalCharging' : 'capitalEnemy') });
    }
    updateTargetLock(0);
    reticle.classList.toggle('firing', !paused && !reducedMotion && gameTime * 1000 < shotFlashUntil);
    reticle.classList.toggle('empty', !paused && !reducedMotion && gameTime * 1000 < emptyFlashUntil);
    renderTargetHud(targetLock, viewCamera, innerWidth, innerHeight);
    if (started && cameraMode === 'canopy' && !roundEnded) {
      const bank = THREE.MathUtils.radToDeg(camera.rotation.z);
      setInstrument(cockpitHorizon, 'transform', `rotate(${bank.toFixed(1)}) translate(0 ${(camera.rotation.x * 24).toFixed(1)})`);
      setInstrument(cockpitLaser, 'width', (82 * (1 - weapons.heat / 100)).toFixed(1));
      setInstrument(cockpitAux, 'width', (82 * weapons.heavyCharge).toFixed(1));
    }
    renderer.render(scene, viewCamera);
  }
  function canApplyUpdate() {
    return !renderDiagnostics.failed && !crashing
      && (roundEnded || (!started && !document.querySelector('#start').disabled));
  }
  function captureUpdateCheckpoint() {
    if (!started) return null;
    return { version: 1, level, score, kills, retries, shield, levelCheckpoint: { ...levelCheckpoint },
      celebrating, tutorialCompleted, bestAtLevelStart, soundEnabled, language };
  }
  function restoreUpdateCheckpoint(saved) {
    const counts = [saved.level, saved.score, saved.kills, saved.retries, saved.bestAtLevelStart,
      saved.levelCheckpoint?.score, saved.levelCheckpoint?.kills];
    if (saved.version !== 1 || !counts.every(value => Number.isSafeInteger(value) && value >= 0)
      || saved.level < 1 || saved.retries > 3 || !Number.isFinite(saved.shield) || saved.shield < 0 || saved.shield > 100
      || !['celebrating', 'tutorialCompleted', 'soundEnabled'].every(key => typeof saved[key] === 'boolean')
      || !['en', 'de'].includes(saved.language)) throw new Error('Invalid update checkpoint');
    ({ level, score, kills, retries, shield, levelCheckpoint, celebrating, tutorialCompleted, bestAtLevelStart, soundEnabled } = saved);
    setLanguage(saved.language); applyTranslations();
    languagePicker.querySelector(`input[value="${language}"]`).checked = true;
    document.querySelector('#sound').setAttribute('aria-pressed', String(soundEnabled));
    document.querySelector('#sound').setAttribute('aria-label', t(soundEnabled ? 'soundOff' : 'soundOn'));
    document.querySelector('#sound').title = t(soundEnabled ? 'soundOff' : 'soundOn');
    started = true; updateRestored = true;
    intro.hide();
    scene.fog.density = .00065;
    camera.fov = reducedMotion ? 70 : 90; camera.updateProjectionMatrix();
    document.body.classList.add('playing');
    document.querySelector('#intro').hidden = true;
    setupLevelFleet();
    // Rebuild the result screen, not an active flight; a lost life was already counted before reload.
    enterRoundResult(roundOutcome(celebrating, retries));
    updateScore();
  }
  getRenderState = () => ({
    phase: renderPhase, level, gameTime, started, paused, roundEnded, crashing, reducedMotion, touchMode,
    effects: { particles: effects.particles.length + fragments.rocks.length, shockwaves: effects.shockwaves.length, rockets: projectiles.count, enemyBolts: capitalEncounter.bolts.length },
    visibleShips: ships.filter(ship => ship.visible).length,
    renderer: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, points: renderer.info.render.points,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      pixelRatio: renderer.getPixelRatio(), contextLost: renderer.getContext().isContextLost() }
  });
  stopRendering = () => {
    queueMicrotask(() => renderer.setAnimationLoop(null));
    paused = true; speed = 0;
    sound.suspendAudio().catch(error => console.error('Could not suspend audio after render failure:', error));
    controls.reset();
  };
  resetSimulationClock();
  renderer.setAnimationLoop(time => {
    renderDiagnostics.runFrame(() => {
      const elapsed = Math.max(0, (time - lastFrameTime) / 1000);
      lastFrameTime = time;
      renderPhase = 'simulation';
      simulationClock.advance(elapsed);
      renderPhase = 'render';
      renderFrame();
      renderPhase = 'frame-stats';
      frameStats.sample(time);
    });
  });
  if (renderDiagnostics.failed) stopRendering();
  else globalThis.orbitUpdates?.configure({ canReload: canApplyUpdate,
    capture: captureUpdateCheckpoint, restore: restoreUpdateCheckpoint });
} catch (error) {
  document.querySelector('#intro').hidden = true;
  status.textContent = t('loadError');
  console.error(error);
}
