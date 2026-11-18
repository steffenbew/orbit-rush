// Run from the project root: node tests/simulation-timing.mjs
import { readFileSync } from 'node:fs';
import { activeFlightSource } from './helpers/app-source.mjs';
import * as physics from '../src/flight/physics.js';
import { advanceWeapons, createWeapons, requestShot } from '../src/weapons/rules.js';
import { createFrameStats } from '../src/presentation/frame-stats.js';
import { createSimulationClock } from '../src/flight/simulation-clock.js';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const THREE = await import(new URL('assets/vendor/three.module.js', root));
const source = readFileSync(new URL('src/main.js', root), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing source section: ${start}`);
  return source.slice(from, to);
};
const makeGame = (reducedMotion = false, trainingTime = 0) => new Function('createFrameStats', 'createSimulationClock', 'advanceWeapons', 'createWeapons', 'requestShot', 'physics', 'THREE', 'reducedMotion', 'trainingTime', `
  let wallTime = 0, frameCallback, renders = 0, steps = 0;
  const hud = {}, location = {search: '?test'};
  const performance = { now: () => wallTime }, document = { hidden: false, querySelector: () => hud };
  const renderer = { setAnimationLoop: callback => { frameCallback = callback; } };
  const playerFlight = physics.createPlayerFlight(reducedMotion);
  const { target, flightVelocity, flightMotion, flightTurn, flightOrientation } = playerFlight;
  target.set(.6, .2);
  const worldStep = new THREE.Vector3(), distance = new THREE.Vector3();
  const roundDuration = 45, level = 10;
  let started = true, paused = false, crashing = false, crashDrifting = false, roundEnded = false;
  let renderPhase;
  const renderDiagnostics = {failed: false, runFrame: callback => callback()};
  let gameTime = 0, difficulty = 0, speed = 0, feedbackUntil = 0;
  let normalHeld = false, heavyHeld = false;
  const feedback = {classList: {remove() {}}};
  const updateScore = () => {}, renderWeaponHud = () => {};
  const constrainFlightToBoundary = () => {}; // Physical rebounds are covered by flight-boundary.mjs.
  const tutorial = {active: false}; // The timed course begins after the guided tutorial.
  const shots = [];
  let firingHeavy = false;
  const playSound = name => { if (name === 'shot') shots.push({heavy: firingHeavy, time: gameTime}); };
  const finishRound = () => { gameTime = courseStartTime + roundDuration; roundEnded = true; paused = true; };
  ${section('  const frameStats =', '  const progressionTimeScale =')}
  ${activeFlightSource}
  const levelFlightSpeed = progress => physics.levelFlightSpeed(level, reducedMotion, progress);
  const courseWorldOffset = new THREE.Vector3();
  let courseStartTime = 0;
  const weapons = createWeapons();
  let shotFlashUntil = 0, emptyFlashUntil = 0;
  ${section('  function fireRocket(', '    camera.updateMatrixWorld();')}
  }
  gameTime = courseStartTime = trainingTime;
  function updateSimulation(dt) {
    steps++;
    ${section('    if (!paused && !roundEnded) {\n      gameTime =', '  }\n\n  function movePlayerAndCamera')}
    if (!paused && !roundEnded) advanceWeapons(weapons, gameTime, dt);
    if (isFlightActive()) speed = playerFlight.advance(dt, speed, levelFlightSpeed(difficulty));
    ${section('    worldStep.copy(flightMotion)', '    if (crashDrifting) camera.rotation')}
    distance.sub(worldStep);
    if (normalHeld) { firingHeavy = false; fireRocket(); }
    if (heavyHeld && weapons.heavyCharge === 1) { firingHeavy = true; fireRocket(false, true); }
  }
  const renderFrame = () => { renders++; };
  ${section('  resetSimulationClock();\n  renderer.setAnimationLoop(', '} catch (error)')}
  return {
    target, resetSimulationClock, hud,
    beginTraining: () => { tutorial.active = true; },
    frame: dt => { wallTime += dt * 1000; frameCallback(wallTime); },
    elapseWithoutFrame: dt => { wallTime += dt * 1000; },
    setPaused: value => { paused = value; resetSimulationClock(); },
    setHidden: value => { document.hidden = value; resetSimulationClock(); },
    fire: (normal, heavy) => { normalHeld = normal; heavyHeld = heavy; },
    state: () => ({gameTime, speed, velocity: flightVelocity.toArray(), turn: flightTurn.toArray(), orientation: flightOrientation.toArray(), distance: distance.toArray(),
      heat: weapons.heat, overheated: weapons.overheated, heavyEnergy: weapons.heavyCharge, shots, steps, renders, roundEnded, remainder: simulationClock.remainder})
  };
`)(createFrameStats, createSimulationClock, advanceWeapons, createWeapons, requestShot, physics, THREE, reducedMotion, trainingTime);

function advance(game, duration, frameTimes) {
  let elapsed = 0, frame = 0;
  while (duration - elapsed > 1e-9) {
    const dt = Math.min(frameTimes[frame++ % frameTimes.length], duration - elapsed);
    game.frame(dt); elapsed += dt;
  }
}
function simulatedState(game) {
  const {renders, remainder, ...state} = game.state();
  assert.ok(remainder < 1 / 60 + 1e-9);
  return state;
}
const schedules = [5, 10, 15, 20, 30, 60, 120, 144].map(fps => [1 / fps]);
schedules.push([.008, .1, .024, .2, .005, .04]);
for (const reducedMotion of [false, true]) {
  let reference;
  for (const schedule of schedules) {
    const game = makeGame(reducedMotion); game.fire(true, true);
    advance(game, 2, schedule);
    game.target.set(-.6, -.4);
    advance(game, 2, schedule);
    game.target.set(0, 0);
    advance(game, 2, schedule);
    const state = simulatedState(game);
    assert.equal(state.steps, 360, 'Six seconds must always produce 360 physics ticks');
    assert.ok(Math.abs(state.gameTime - 6) < 1e-9);
    if (!reference) reference = state;
    else assert.deepEqual(state, reference, 'Movement, timers, heat and both fire rates must not depend on display FPS');
    const normalShots = state.shots.filter(shot => !shot.heavy);
    assert.equal(normalShots.filter(shot => shot.time < 1.5).length, 15, 'Held normal fire must retain its 15-shot opening burst');
    assert.ok(state.shots.some(shot => shot.heavy), 'Heavy fire must also run on the simulation clock');
    assert.ok(normalShots.every((shot, i) => i === 0 || shot.time - normalShots[i - 1].time >= .1 - 1e-8));
  }
}
console.log('PASS identical flight, level time, braking, cooling and both fire rates at 5–144 FPS and irregular frames');

const monitor = makeGame();
monitor.frame(0); monitor.frame(8);
assert.equal(monitor.state().renders, 2);
assert.equal(monitor.state().steps, 15);
assert.equal(monitor.hud.textContent, '0.1 FPS · 8000 ms', 'Report elapsed render time, not bounded physics catch-up');
monitor.resetSimulationClock();
assert.equal(monitor.hud.textContent, '— FPS · — ms');

const training = makeGame(); training.beginTraining();
advance(training, 46, [1 / 30]);
assert.ok(training.state().gameTime > 45);
assert.equal(training.state().roundEnded, false, 'Waiting at a lesson cannot expire the round');

const paused = makeGame(); paused.fire(true, true); advance(paused, 1, [1 / 60]);
paused.setPaused(true); const before = simulatedState(paused);
paused.frame(20); assert.deepEqual(simulatedState(paused), before, 'Pause must not build a catch-up backlog');
paused.elapseWithoutFrame(20); paused.setPaused(false); paused.frame(1 / 60);
assert.equal(paused.state().steps, before.steps + 1, 'Resume must ignore time spent without animation callbacks');
paused.setHidden(true); const hidden = simulatedState(paused);
paused.frame(20); assert.deepEqual(simulatedState(paused), hidden, 'Hidden tabs must not advance gameplay');
paused.elapseWithoutFrame(20); paused.setHidden(false); paused.frame(1 / 60);
assert.equal(paused.state().steps, hidden.steps + 1);
const partial = makeGame(); partial.frame(1 / 120); assert.equal(partial.state().steps, 0);
partial.resetSimulationClock(); partial.frame(1 / 120); assert.equal(partial.state().steps, 0);
partial.frame(1 / 120); assert.equal(partial.state().steps, 1);
console.log('PASS pause, hidden tabs, clock resets and fractional-frame accumulation without stale catch-up');

const stalled = makeGame(), quarter = makeGame(); stalled.fire(true, true); quarter.fire(true, true);
stalled.frame(8); advance(quarter, .25, [1 / 60]);
assert.deepEqual(simulatedState(stalled), simulatedState(quarter), 'A long stall must cap movement AND timers to the same 250 ms');
assert.equal(stalled.state().steps, 15); assert.equal(stalled.state().renders, 1, 'Catch-up must draw only once');
stalled.frame(1 / 60); assert.equal(stalled.state().steps, 16, 'Discard excess stall time, rather than draining it into later frames');
for (const fps of [5, 10, 20, 60, 144]) for (const trainingTime of [0, 53.1, 180]) {
  const game = makeGame(false, trainingTime);
  advance(game, 44, [1 / fps]); assert.equal(game.state().roundEnded, false);
  advance(game, 1, [1 / fps]);
  assert.equal(game.state().roundEnded, true); assert.equal(game.state().gameTime, trainingTime + 45);
  assert.equal(game.state().steps, 2700, 'A level must end after exactly 45 simulated seconds');
}
assert.equal((section('  function updateSimulation(dt)', '  function recordVisibleObjects()').match(/renderer.render/g) || []).length, 0,
  'Never render inside a catch-up tick');
assert.equal((section('  function updateSimulation(dt)', '  function recordVisibleObjects()').match(/lastVisibleTime = gameTime/g) || []).length, 0,
  'Unrendered catch-up ticks must not authorize collisions with unseen objects');
console.log('PASS bounded long stalls, one render per display frame, exact level duration and rendered-only collision visibility');
