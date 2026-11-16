// Fixed encounter pacing and increasingly three-dimensional checkpoint navigation.
import assert from 'node:assert/strict';
import { t } from '../i18n.js';
import { THREE, makeGame, makeFlightClock, randomState, section } from './helpers/flight-game.mjs';

const planFor = new Function('level', 'reducedMotion', `
  ${section('      function getAsteroidEncounters()', '      function flightDistanceAt(')}
  return getAsteroidEncounters();
`);
for (const reduced of [false, true]) for (let level = 1; level <= 100; level++) {
  const plan = planFor(level, reduced);
  assert.deepEqual(planFor(level, reduced), plan, 'No reroll of timing, type, strength, direction or bends');
  assert.deepEqual(plan.map(event => event.kind), level === 1 ? ['field', 'shower']
    : level === 3 ? ['corridor', 'shower', 'field'] : level === 4 ? ['field', 'field'] : ['field', 'shower', 'corridor']);
  for (const event of plan) {
    assert.ok(event.prepare < event.entry - 2 && event.entry < event.exit && event.exit <= (level === 3 ? 38 : 37));
    assert.ok(Number.isInteger(event.strength) && event.strength >= 0 && event.strength <= 2);
    assert.ok(event.shape >= 0 && event.shape <= 2);
  }
  if (level === 1) assert.deepEqual(plan.map(event => [event.prepare, event.entry, event.exit, event.strength]),
    [[6, 12, 17, 0], [18, 24, 32, 0]], 'An earlier gentle field, then a short first shower with a breather and safe approach');
  else assert.equal(plan[0].entry, level < 4 ? 8 : 5, 'Keep later encounter timings unchanged');
  if (level === 2) {
    assert.deepEqual(plan.map(event => [event.kind, event.prepare, event.entry, event.exit, event.strength]),
      [['field', 0, 8, 12, 0], ['shower', 14, 20, 22, 0], ['corridor', 25, 31, 36, 0]],
      'Introduce a gentle corridor near fifteen seconds left, a safe handoff and nine seconds to finish');
    assert.equal(plan[2].shape, 0); assert.equal(plan[2].bend, 0);
  }
  if (level === 3) {
    assert.deepEqual(plan.map(event => [event.kind, event.prepare, event.entry, event.exit, event.strength]),
      reduced ? [['corridor', 0, 8, 13, 1], ['shower', 14, 24, 26, 1], ['field', 27, 35, 37, 1]]
        : [['corridor', 0, 8, 20, 1], ['shower', 20.5, 25, 29, 1], ['field', 29.5, 34, 38, 2]],
      'Tighten normal-mode follow-ups with a denser field; preserve slow-mode cleanup and seven seconds to finish');
    assert.equal(plan[0].shape, 0, 'Level three extends the straight corridor; bends still begin at level five');
    assert.equal(plan[0].strength, 1);
  }
  if (level === 7) assert.equal(plan[2].shape, 2, 'Later corridors include offset exits');
  for (let index = 1; index < plan.length; index++) assert.ok(plan[index - 1].exit < plan[index].prepare, 'Separate encounters with a breather');
  if (level >= 5) {
    assert.ok(plan.slice(1).every((event, index) => event.entry - plan[index].exit <= 9), 'Keep the three phases moving, without overlapping fields');
    if (level % 4 !== 0) assert.ok(plan.slice(1).every(event => event.strength === 2), 'Reach full shower/corridor intensity from level five');
    if (level % 4 === 0) assert.ok(plan.every(event => event.strength < 2), 'Keep later boss combinations lighter');
  }
}
console.log('PASS fields before showers, late level-two corridor, level-three corridor/shower/field finale, first-boss bookends and repeatable plans');

for (const reduced of [false, true]) for (const level of [1, 2, 3, 4, 5, 7, 8, 9, 12, 40, 100]) {
  randomState.seed = 123; // Each scenario is independent of how many random rocks earlier cases created.
  const game = makeGame(reduced); game.setLevel(level); game.setupLevelFleet();
  const gates = game.flightRings, positions = gates.map(gate => gate.position.toArray());
  assert.equal(gates.length, 5);
  if (level === 2) assert.deepEqual(gates.slice(0, 3).map(gate => gate.position.z), [5, 12, 22].map(time => -game.flightDistanceAt(time)),
    'Keep the approved opening field and slalom; move only the 32-second gate to the corridor approach');
  assert.equal(gates[0].position.x, 0); assert.equal(gates[0].position.y, 0, 'Opening/tutorial stays straight');
  assert.ok(gates.some(gate => gate.position.x > 0) && gates.some(gate => gate.position.x < 0));
  if (level < 3) assert.ok(gates.every(gate => Math.abs(gate.position.y) < 1e-8), 'Learn lateral navigation before adding vertical offsets');
  else assert.ok(gates.some(gate => gate.position.y > 0) && gates.some(gate => gate.position.y < 0), 'Climbing and descending start in level three');
  if (level === 1) assert.ok(gates.slice(1, -1).every(gate => Math.abs(gate.position.x) > gate.userData.radius),
    'The first slalom requires corrections rather than passing every gate with straight flight');
  for (let index = 1; index < gates.length; index++) {
    const previous = gates[index - 1], gate = gates[index], dz = previous.position.z - gate.position.z;
    assert.ok(dz >= gate.userData.radius * 3, 'Keep the openings and coronas separate');
    assert.ok(Math.hypot(gate.position.x - previous.position.x, gate.position.y - previous.position.y) / dz < .3,
      'Limit heading changes rather than demanding sharp reversals between checkpoints');
    assert.equal(gate.userData.radius, reduced ? 14 : 80, 'Difficulty comes from placement, not shrinking apertures');
  }
  assert.ok(Math.abs(gates.at(-1).position.z + game.flightDistanceAt(40)) < 1e-8);
  if (level === 3) {
    const field = game.getAsteroidEncounters().at(-1), gate = gates.at(-2);
    assert.equal(gate.position.z, -game.flightDistanceAt(37), 'Move the last steering checkpoint into the field finale');
    assert.ok(gate.position.z <= -game.flightDistanceAt(field.entry) && gate.position.z >= -game.flightDistanceAt(field.exit),
      'The field and checkpoint form one navigation challenge, not two separate stretches');
    assert.ok(Math.abs(gate.position.x) > gate.userData.radius, 'The late gate still demands a lateral correction');
  }
  if (game.corridorPlan) {
    const {origin, length} = game.corridorPlan;
    for (const gate of gates) {
      const depth = origin.z - gate.position.z, clearance = gate.userData.radius * 1.5;
      assert.ok(depth < -clearance || depth > length + clearance, 'Even a future corridor has no checkpoints inside its walls');
    }
    assert.equal(gates.find(gate => gate.userData.kind === 'approach').position.y, 0, 'Approach the corridor opening at its entry height');
    if (reduced && level >= 5) assert.ok(gates[2].position.z > -game.flightDistanceAt(game.getAsteroidEncounters().find(event => event.kind === 'shower').exit),
      'Finish the slow-mode slalom before the shower ends, then settle into the corridor approach');
  }
  game.setupLevelFleet();
  assert.deepEqual(gates.map(gate => gate.position.toArray()), positions, 'Retries preserve the course despite randomized fleet/rock detail');
  assert.equal(game.encounterIndex, 0); assert.equal(game.showerVisible, false);
}
console.log('PASS lateral-to-vertical checkpoint progression, turn clearance, stable retries, straight tutorial, corridor exclusion and finish margin');

// Follow the authored schedules too, not only the generic corridor geometry fixtures.
for (const reduced of [false, true]) for (const level of [1, 2, 3, 4, 5, 7, 8, 40, 100]) for (const fps of ([2, 3].includes(level) ? [5, 60, 144] : [60]))
for (const seed of (level === 3 ? [123, 456, 789] : [123])) {
  randomState.seed = seed;
  const game = makeGame(reduced); game.setLevel(level); game.setupLevelFleet(); game.flightMotion.set(0, 0, 0);
  let time = 0;
  const clock = makeFlightClock(THREE, game, reduced, dt => {
    time += dt; game.setTime(time);
    const next = game.flightRings.find(gate => !gate.userData.resolved);
    if (next) {
      const delta = next.position.clone().sub(game.camera.position);
      const yaw = -Math.atan2(delta.x, -delta.z), pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
      const yawError = Math.atan2(Math.sin(yaw - game.flightOrientation.y), Math.cos(yaw - game.flightOrientation.y));
      const motion = reduced ? .5 : 1;
      game.target.set(
        THREE.MathUtils.clamp(-(yawError * 2 - game.flightTurn.x * .8) / (.9 * motion), -1, 1),
        THREE.MathUtils.clamp(((pitch - game.flightOrientation.x) * 2 - game.flightTurn.y * .8) / (.65 * motion), -1, 1)
      );
    }
    clock.move(dt, time / 45);
    game.worldStep.copy(game.flightMotion).multiplyScalar(-dt);
    game.courseWorldOffset.addScaledVector(game.worldStep, .85);
    game.updateFlightRing();
    game.camera.updateMatrixWorld();
    const previousEncounter = game.encounterIndex;
    game.updateAsteroidShower(dt);
    if (game.encounterIndex !== previousEncounter) assert.ok(game.coursePlan().entry - time >= 4,
      `Keep four seconds of field approach while steering: level=${level}, reduced=${reduced}, fps=${fps}, seed=${seed}, entry=${game.coursePlan().entry}, time=${time}`);
  });
  while (time < 45 && game.flightRings.some(gate => !gate.userData.resolved)) clock.frame(1 / fps);
  assert.deepEqual(game.sounds, Array(5).fill('checkpoint'), `Reach every authored checkpoint: level=${level}, reduced=${reduced}`);
  assert.ok(time <= 41, 'Keep a finish margin with the earlier corridor and stronger slalom');
}
console.log('PASS actual scheduled checkpoints reachable with real steering, including the early corridor and uncapped late speeds');

for (const reduced of [false, true]) for (const level of [1, 2, 3, 4, 5, 7, 8, 9, 10, 40, 100]) {
  randomState.seed = 123;
  const game = makeGame(reduced); game.setLevel(level); game.setupLevelFleet(); game.camera.updateMatrixWorld();
  const events = game.getAsteroidEncounters(), transitions = [], warningTimes = [];
  let speed = 0, previousIndex = -1, previousVisible = false;
  for (let frame = 1; frame <= 45 * 60; frame++) {
    const time = frame / 60;
    game.setTime(time);
    speed += (game.levelFlightSpeed(time / 45) - speed) * (1 - Math.exp(-3 / 60));
    game.flightMotion.set(0, 0, -speed); game.worldStep.set(0, 0, speed / 60);
    game.courseWorldOffset.addScaledVector(game.worldStep, .85);
    game.updateAsteroidShower(1 / 60);
    if (events.length && previousIndex !== game.encounterIndex) {
      if (previousIndex >= 0) assert.equal(previousVisible, false, 'Never replace a still-visible field');
      const event = events[game.encounterIndex], field = game.coursePlan();
      transitions.push(game.encounterIndex);
      assert.ok(event.entry - time >= 4, `Give the next field a safe approach: ${JSON.stringify({level,reduced,time,entry:event.entry,kind:event.kind})}`);
      for (const atExit of [false, true]) {
        const when = atExit ? event.exit : event.entry;
        const plane = field.origin.clone().addScaledVector(field.velocity, when - event.prepare);
        if (atExit) plane.addScaledVector(field.direction, field.length);
        plane.z += game.flightDistanceAt(when);
        assert.ok(Math.abs(plane.dot(field.direction)) < 1e-7, 'Field planes arrive on the planned timeline, not spawn time plus an arbitrary lead');
      }
      previousIndex = game.encounterIndex;
    }
    const announced = events.find(event => time >= event.entry - (event.kind === 'corridor' ? 5 : 4) && time <= event.entry + 1);
    assert.equal(game.warningHidden, !announced, `Five-second corridor/four-second field and shower warning lead and one-second cutoff: level=${level}, reduced=${reduced}, time=${time}`);
    if (announced) assert.ok(game.warningText.includes(t(announced.kind === 'corridor' ? 'asteroidCorridor'
      : announced.kind === 'field' ? 'asteroidField' : 'asteroidShower')), 'Announce the upcoming type even before its geometry is prepared');
    if (!game.warningHidden && frame % 60 === 0) warningTimes.push(time);
    if (frame === 22 * 60) {
      const before = game.coursePlan(); game.setPaused(true); game.updateAsteroidShower(10);
      assert.deepEqual(game.coursePlan(), before); assert.equal(game.warningHidden, true);
      game.setPaused(false);
    }
    previousVisible = game.showerVisible;
    if (time >= 40) assert.equal(game.showerVisible, false, `Clear the instanced field before the finish/countdown: ${JSON.stringify({level,reduced,time,kind:game.coursePlan().kind})}`);
  }
  assert.deepEqual(transitions, events.map((_, index) => index), `Every scheduled phase appears: level=${level}, reduced=${reduced}`);
  for (const event of events) {
    const warningLead = event.kind === 'corridor' ? 5 : 4;
    assert.ok(warningTimes.includes(Math.max(1, event.entry - warningLead)) && warningTimes.includes(event.entry + 1),
      'Warn five seconds ahead for corridors, four for fields/showers, through one second after entry');
  }
  if (!events.length) assert.deepEqual(warningTimes, []);
  game.setupLevelFleet();
  assert.equal(game.encounterIndex, 0); assert.equal(game.showerVisible, false, 'Restart clears the old encounter');
}
console.log('PASS every actual field/shower/corridor phase, spatial arrival times, no visible-field replacement, warning lead, pause and clear final stretch');
