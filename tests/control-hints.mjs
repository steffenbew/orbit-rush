// Run from the project root: node tests/control-hints.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { t, setLanguage } from '../i18n.js';
setLanguage('de');
const THREE = await import('../assets/vendor/three.module.js');
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}
const makeGame = () => new Function('THREE', 't', `
  const elements = new Map();
  const document = {querySelector(selector) {
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector, {hidden: true, textContent: '', offsetWidth: 220, offsetHeight: 64, style: {}, classes,
        classList: {add: key => classes.add(key), remove: (...keys) => keys.forEach(key => classes.delete(key)),
          toggle: (key, active) => active ? classes.add(key) : classes.delete(key)}});
    }
    return elements.get(selector);
  }};
  let started = true, paused = false, crashing = false, roundEnded = false, level = 1, gameTime = 0, difficulty = 0;
  let lastKill = -Infinity, combo = 0, lastShot = -Infinity, lastEmptyAttempt = -Infinity, lastHeatShot = 0;
  let shotFlashUntil = 0, emptyFlashUntil = 0, heavyEnergy = 1, weaponHeat = 0, overheated = false, hitMarker = 0;
  let spawnQueue = [], normalStarts = 0, courseStartTime = 0, tutorialReinforcements = 0;
  let nextShipTime = 2, nextHazardTime = 0, showerStart = 9, showerEnd = 25;
  const progressionTimeScale = 1.5, hazardStartDelay = 4, firstCheckpointTime = 5;
  const courseOrigin = new THREE.Vector3(), showerCourseOrigin = new THREE.Vector3(0, 0, -3000);
  const heatPerShot = 10, reducedMotion = false, innerWidth = 1000, innerHeight = 800;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), rockets = [], repairPickup = {visible: false};
  const flightMotion = new THREE.Vector3(0, 0, -334), flightOrientation = new THREE.Euler(0, 0, 0, 'YXZ');
  const courseWorldOffset = new THREE.Vector3(), worldStep = new THREE.Vector3(), mouseAim = new THREE.Vector2();
  const flightDistanceAt = time => time * 280;
  const ships = Array.from({length: 8}, (_, index) => {
    const ship = new THREE.Group(); ship.userData = {type: {asteroid: index === 4, radius: 20}, hull: {opacity: 1},
      health: 3, previousPosition: new THREE.Vector3(), courseVelocity: new THREE.Vector3(),
      collisionBox: new THREE.Box3(new THREE.Vector3(-20, -20, -20), new THREE.Vector3(20, 20, 20))};
    return ship;
  });
  const flightRings = Array.from({length: 5}, () => { const gate = new THREE.Group();
    gate.userData = {resolved: false, previous: new THREE.Vector3()}; return gate; });
  const resetShip = ship => { ship.visible = true; ship.userData.health = 3; };
  const setShipOpacity = (ship, opacity) => { ship.userData.arrivalOpacity = opacity; };
  const constrainShipToBoundary = () => {}; // Real fleet containment is covered by flight-dynamics.mjs.
  const queueShip = ship => { ship.visible = false; };
  const sounds = [], playSound = kind => sounds.push(kind), award = () => {}, explode = () => {}, updateShipHitFlash = () => {};
  const feedbackMessages = [], showFeedback = message => feedbackMessages.push(message);
  const shatterAsteroid = () => { throw new Error('Tutorial asteroid must not create dangerous fragments'); };
  const updateScore = () => {}, updateHeavyHud = () => {}, updateWeaponHud = () => {};
  function setupLevelFleet() {
    normalStarts++;
    ships.forEach((ship, index) => { ship.visible = index < 2; });
    flightRings.forEach(gate => { gate.visible = true; gate.userData.resolved = false; });
    courseWorldOffset.set(0, 0, 0);
  }
  let ringShipsPending = false;
  const resetFlightRing = openingComplete => {
    flightRings.forEach((gate, index) => {
      if (openingComplete && index === 0) return;
      gate.visible = true; gate.userData.resolved = false;
    });
  };
  ${section('      let tutorialStage =', '      function setupLevelFleet(')}
  ${section('      const controlHints =', '      function fireRocket(')}
  ${section('      function fireRocket(', '        camera.updateMatrixWorld();')}
  }
  beginFlightTutorial(); updateControlHints();
  return {
    ships, gates: flightRings, courseWorldOffset, worldStep, flightOrientation, rockets, feedbackMessages, sounds,
    hints: controlHints, title: controlTitle, input: controlInput, fireRocket,
    state: () => ({stage: tutorialStage, completed: tutorialCompleted, completedAt: tutorialStepCompletedAt, time: gameTime, courseStartTime, normalStarts}),
    action(action) {
      if (action === 'checkpoint' && started && !paused && !crashing && !roundEnded && tutorialStage === 0) {
        flightRings[0].visible = false; flightRings[0].userData.resolved = true;
      }
      completeTutorialStep(action);
    },
    markCombat() { combo = 2; lastKill = gameTime; lastShot = gameTime; lastHeatShot = gameTime; weaponHeat = 40; },
    combat: () => ({combo, lastKill, lastShot, lastHeatShot, weaponHeat}),
    aim(x, y) { mouseAim.set(x, y); updateControlHints(); },
    mode(name) { started = name !== 'intro'; paused = name === 'pause'; crashing = name === 'crash'; roundEnded = name === 'result'; },
    tick(dt) { if (started && !paused && !crashing && !roundEnded) gameTime += dt;
      updateFlightTutorial(); updateControlHints(); },
    retry() { setupLevelFleet(); beginFlightTutorial(); updateControlHints(); },
    miss() { flightRings[0].visible = false; flightRings[0].userData.resolved = true; tutorialRetryAt = gameTime + 1.2; },
    weapons(heat, energy) { overheated = heat; heavyEnergy = energy; },
    hit(ship, heavy) {
      const hit = ship, rocket = {heavy, damage: heavy ? 3 : 1, object: {position: new THREE.Vector3()}};
      ${section('          if (hit) {', '          // Long-range capital retreats')}
    }
  };
`)(THREE, t);

const game = makeGame();
assert.equal(game.title.textContent, t('checkpointTitle'));
assert.equal(game.input.textContent, t('steerInput'));
assert.equal(game.ships.filter(ship => ship.visible).length, 0, 'No ship or asteroid before the checkpoint lesson');
assert.equal(game.gates.filter(gate => gate.visible).length, 1, 'One uncluttered practice checkpoint');
assert.ok(game.hints.classes.has('checkpoint-step'));
game.aim(.4, .25); assert.equal(game.hints.style.left, '700px'); assert.equal(game.hints.style.top, '364px');
game.aim(1, -1); assert.equal(game.hints.style.left, '878px'); assert.equal(game.hints.style.top, '672px');
game.aim(-1, 1); assert.equal(game.hints.style.left, '122px'); assert.equal(game.hints.style.top, '64px');
game.fireRocket(true); game.fireRocket(true, true); game.action('laser'); game.action('heavy');
assert.equal(game.state().stage, 0); assert.equal(game.state().completedAt, null, 'Firing cannot skip checkpoint training');
for (const mode of ['intro', 'pause', 'crash', 'result']) {
  game.mode(mode); game.tick(10); game.action('checkpoint');
  assert.equal(game.hints.hidden, true); assert.equal(game.state().completedAt, null);
}
game.mode('flight'); game.action('checkpoint'); game.tick(.3);
assert.ok(game.hints.classes.has('complete')); assert.ok(game.ships.every(ship => !ship.visible));
game.mode('pause'); game.tick(20); assert.equal(game.state().stage, 0, 'Success delay freezes with the simulation');
game.mode('flight'); game.tick(.41);
assert.equal(game.state().stage, 1); assert.equal(game.title.textContent, t('laserTitle'));
assert.equal(game.input.textContent, t('mouseClick')); assert.equal(game.ships.filter(ship => ship.visible).length, 1);
const asteroid = game.ships.find(ship => ship.visible);
assert.ok(asteroid.userData.type.asteroid, 'The asteroid is the first shooting target');
assert.equal(asteroid.userData.tutorialTarget, 'laser');
game.fireRocket(true); game.tick(.1);
assert.equal(game.state().completedAt, null, 'The lesson requires destroying the actual target, not just clicking');
game.hit(asteroid, true); assert.equal(asteroid.userData.health, 2, 'Wrong weapon cannot bypass the normal-laser lesson');
game.hit(asteroid, false); assert.equal(game.state().completedAt, null);
game.hit(asteroid, false); assert.equal(asteroid.visible, false); game.tick(.71);
assert.equal(game.state().stage, 2); assert.equal(game.title.textContent, t('powerLaserTitle'));
assert.equal(game.input.textContent, t('spaceKey')); assert.ok(game.hints.classes.has('space-key'));
assert.equal(game.ships.filter(ship => ship.visible).length, 1);
const ship = game.ships.find(ship => ship.visible);
assert.equal(ship.userData.type.asteroid, false); assert.equal(ship.userData.health, 3);
assert.equal(ship.userData.tutorialTarget, 'heavy');
game.hit(ship, false); assert.equal(ship.userData.health, 3, 'The practice ship teaches the spacebar heavy laser');
game.hit(ship, true); assert.equal(ship.visible, false, 'One heavy hit destroys the three-health ship');
game.tick(.81); assert.ok(game.hints.classes.has('finished'));
assert.deepEqual(game.feedbackMessages, [], 'Wait until the tutorial finishes before announcing GO');
game.worldStep.set(3, -2, 5); game.courseWorldOffset.set(-100, 20, 6000);
game.markCombat(); const combat = game.combat(), previousTime = game.state().time;
const projectile = {object: new THREE.Group()}; game.rockets.push(projectile);
game.tick(.61);
assert.equal(game.state().stage, 3); assert.equal(game.state().completed, true);
assert.deepEqual(game.feedbackMessages, [], 'GO no longer appears in the top feedback banner');
assert.equal(game.title.textContent, t('flightGo'));
assert.equal(game.sounds.filter(kind => kind === 'go').length, 1, 'One bing when GO appears');
assert.equal(game.input.textContent, '', 'The GO prompt has no stale mouse/spacebar instruction');
assert.ok(game.hints.classes.has('go') && !game.hints.classes.has('finished'));
assert.equal(game.state().time, previousTime + .61, 'Simulation time must continue, not restart');
assert.equal(game.state().courseStartTime, game.state().time, 'Only the remaining timed encounters get an offset');
assert.equal(game.state().normalStarts, 0, 'Completing training must not set up a second fleet');
assert.equal(game.hints.hidden, false); assert.ok(game.ships.every(ship => !ship.visible));
assert.deepEqual(game.combat(), combat, 'Preserve weapon heat, cooldowns and combo history');
assert.deepEqual(game.rockets, [projectile], 'Do not delete live projectiles at the transition');
assert.ok(game.courseWorldOffset.equals(new THREE.Vector3(-100, 20, 6000)), 'Preserve the continuous world position');
assert.equal(game.gates[0].visible, false, 'Do not insert a second opening checkpoint after completing the lesson');
assert.equal(game.gates.at(-1).visible, true); assert.ok(game.ships.every(ship => !ship.userData.tutorialTarget));
game.aim(.4, .25);
assert.equal(game.hints.style.left, '700px'); assert.equal(game.hints.style.top, '364px', 'GO follows the cursor like the tutorial hints');
game.aim(1, -1);
assert.equal(game.hints.style.left, '878px'); assert.equal(game.hints.style.top, '672px', 'GO remains inside the screen near its edges');
game.tick(.6); assert.equal(game.hints.hidden, false);
for (const mode of ['pause', 'intro', 'crash', 'result']) {
  game.mode(mode); game.tick(10); assert.equal(game.hints.hidden, true);
}
game.mode('flight'); game.tick(.59); assert.equal(game.hints.hidden, false, 'Inactive states do not consume the GO duration');
game.tick(.02); assert.equal(game.hints.hidden, true, 'GO disappears after 1.2 active seconds');
game.tick(1); assert.equal(game.hints.hidden, true, 'GO does not reappear later in the flight');
game.retry(); assert.equal(game.state().stage, 3); assert.equal(game.hints.hidden, true, 'Completed tutorial stays dismissed on retry/new run');
assert.deepEqual(game.feedbackMessages, [], 'No duplicate GO announcement in the top banner');
assert.equal(game.sounds.filter(kind => kind === 'go').length, 1, 'No repeat bing on updates, pause/resume or retry');
const quickRetry = makeGame();
for (const [action, delay] of [['checkpoint', .71], ['laser', .71], ['heavy', 1.41]]) {
  quickRetry.action(action); quickRetry.tick(delay);
}
assert.equal(quickRetry.hints.hidden, false);
quickRetry.retry(); assert.equal(quickRetry.hints.hidden, true, 'Restarting during GO clears the pending cursor announcement');
console.log('PASS checkpoint → normal-laser asteroid → spacebar ship → GO, ordered visibility and simulation-timed hints');

const practice = makeGame(), first = practice.gates[0];
practice.courseWorldOffset.set(-40, 20, 1500); practice.flightOrientation.y = 1;
practice.miss(); practice.tick(1.19); assert.equal(first.visible, false);
practice.tick(.02); assert.equal(practice.gates[0], first); assert.equal(first.visible, true);
assert.equal(first.position.x, -40); assert.equal(first.position.y, 20); assert.equal(first.position.z, -1400);
assert.equal(practice.state().stage, 0); assert.ok(practice.ships.every(ship => !ship.visible));
practice.action('checkpoint'); practice.tick(.71); practice.retry();
assert.equal(practice.state().stage, 0); assert.ok(practice.ships.every(ship => !ship.visible), 'An interrupted tutorial restarts safely');
assert.ok(source.includes("if (gate.userData.kind === 'start') completeTutorialStep('checkpoint');"));
assert.ok(section('      function updateShipArrivals(', '      function updateRetries(').includes('if (tutorialStage < 3)'));
assert.ok(section('      async function startGame(', "      document.querySelector('#start')").includes('beginFlightTutorial();'));
assert.ok(!section('      function fireRocket(', '        camera.updateMatrixWorld();').includes('completeTutorialStep'));
assert.ok(source.includes('if (tutorialStage === 3 && gameTime >= courseStartTime + roundDuration - 1e-9) finishRound();'));
const markup = section('  <aside id="control-hints"', '  <div id="flight-state"');
assert.ok(markup.includes('role="status"') && markup.includes('aria-atomic="true"'));
assert.ok(markup.includes('data-i18n="checkpointTitle"'));
assert.ok(source.includes('#control-hints.checkpoint-step #control-mouse { display: none; }'));
assert.ok(source.includes('#control-hints.checkpoint-step #control-cursor { display: block; }'));
assert.ok(markup.includes('<use href="#i-cursor-click"/>'));
assert.ok(source.indexOf('        updateFlightTutorial(); // Advance lesson stages') < source.indexOf('        if (started && !paused && !roundEnded && !crashing) courseWorldOffset.addScaledVector(worldStep, .85);'));
assert.match(source, /#control-hints\.space-key #control-input \{[^}]*min-width: 170px/);
assert.match(source, /#control-hints \{[^}]*pointer-events: none/);
assert.ok(source.includes('#control-hints.go #control-input { display: none; }'), 'Hide the key graphic as well as its text during GO');
assert.match(source, /prefers-reduced-motion: reduce\) \{ #control-hints \{ transition: none/);
console.log('PASS missed-checkpoint retry without heading tracking, interrupted/completed retries, no early enemies, no timer expiry, accessible pointer hints');
