// Stationary fields, readable/flyable bends and the first boss's bounded combat phase.
import assert from 'node:assert/strict';
import { THREE, t, makeGame, makeFlightClock, moveRock } from './helpers/flight-game.mjs';
import { createAsteroidEncounter } from '../src/course/asteroid-encounter.js';
import { getAsteroidEncounters } from '../src/course/encounter-plan.js';

// The tutorial can move the start before a single field or companion has been spawned.
for (const level of [2, 3]) {
  const encounter = createAsteroidEncounter({ scene: new THREE.Scene(), courseOrigin: new THREE.Vector3(),
    roundDuration: 45, levelFlightSpeed: () => 400, flightDistanceAt: time => time * 340, showerWarning: {} });
  const events = getAsteroidEncounters(level);
  encounter.reset(level, events);
  assert.equal(encounter.kind, events[0].kind);
  const opening = encounter.layout.origin.z, corridor = encounter.corridorPlan.origin.z;
  encounter.shiftStart(51, -1200);
  assert.equal(encounter.layout.origin.z, opening - 1200);
  assert.equal(encounter.corridorPlan.origin.z, corridor - 1200, 'Shift the corridor once, even when it is the opening');
  assert.equal(encounter.timing.entry, 51 + events[0].entry);
  assert.equal(encounter.mesh.visible, false);
  assert.equal(encounter.pool.length, 0);
}

{
  const game = makeGame(); game.setLevel(2); game.setupLevelFleet(); game.camera.updateMatrixWorld();
  game.setTime(1); game.updateAsteroidShower(0);
  const field = game.coursePlan();
  assert.equal(field.kind, 'field'); assert.equal(field.velocity.lengthSq(), 0);
  assert.equal(field.direction.distanceTo(new THREE.Vector3(0, 0, -1)), 0);
  assert.equal(field.origin.x, 0); assert.equal(field.origin.y, 0, 'No leftover shower crossing offset');
  assert.ok(game.warningText.includes(t('asteroidField')));
  assert.ok(game.grit.count >= 90, 'A broad stationary debris cloud surrounds the detailed chunks');
  const rocks = game.showerPool.filter(rock => rock.visible);
  assert.ok(rocks.length > 0);
  for (const rock of rocks) {
    const before = {position: rock.position.clone(), rotation: rock.quaternion.clone()};
    assert.equal(rock.userData.courseVelocity.lengthSq(), 0);
    moveRock(rock, 1, false);
    assert.ok(rock.position.equals(before.position)); assert.ok(rock.quaternion.equals(before.rotation), 'Fixed rocks do not tumble');
  }
  const origin = game.grit.position.clone();
  game.worldStep.set(12, -4, 80); game.courseWorldOffset.addScaledVector(game.worldStep, .85);
  game.setTime(2); game.updateAsteroidShower(1);
  assert.ok(game.grit.position.distanceTo(origin.addScaledVector(game.worldStep, .85)) < 1e-8,
    'The field moves on screen only because the player flies through it');
  game.setLevel(2);
  const shower = game.getAsteroidEncounters()[1]; game.selectAsteroidEncounter(shower);
  assert.ok(game.coursePlan().velocity.length() > 0); assert.ok(game.warningText.includes(t('asteroidShower')));
  game.setLevel(2); game.selectAsteroidEncounter(game.getAsteroidEncounters()[0]);
  assert.equal(game.coursePlan().velocity.lengthSq(), 0, 'Field reuse clears the previous shower stream');
  rocks[0].visible = false;
  const reused = game.eventAsteroid(); assert.equal(reused, rocks[0]); assert.equal(reused.userData.courseVelocity.lengthSq(), 0);
}
console.log('PASS stationary field geometry, distinct labels, fixed rotation, world anchoring and shower-to-field reuse');

for (const fps of [5, 60, 144]) {
  const game = makeGame(); game.setLevel(4); game.setupLevelFleet();
  game.setTime(6); game.updateShipArrivals();
  const boss = game.capital, health = boss.userData.health;
  assert.ok(boss.visible); boss.position.set(0, -50, -1800);
  boss.userData.lastVisibleTime = 27; boss.userData.fireCooldown = 0;
  game.setTime(27); game.updateCapitalShip(boss, 1 / fps);
  const fired = game.enemyBolts.length;
  assert.ok(fired > 0, 'The combat phase still fires');
  game.setTime(28); game.setPaused(true); game.updateCapitalShip(boss, 10);
  assert.equal(boss.userData.retreating, false, 'Pause cannot start the retreat');
  game.setPaused(false); game.updateCapitalShip(boss, 1 / fps);
  assert.equal(boss.userData.retreating, true); assert.equal(boss.userData.gunsCharging, false);
  const departure = boss.position.clone(), velocity = boss.userData.courseVelocity.clone();
  game.setPaused(true); game.updateCapitalShip(boss, 10);
  assert.ok(boss.userData.courseVelocity.equals(velocity));
  game.setPaused(false);
  for (let frame = 1; frame <= Math.ceil(4.1 * fps); frame++) {
    const dt = 1 / fps; game.setTime(28 + frame * dt);
    game.updateCapitalShip(boss, dt);
    if (boss.visible) boss.position.addScaledVector(game.flightMotion, -.85 * dt).addScaledVector(boss.userData.courseVelocity, dt);
  }
  assert.equal(boss.visible, false); assert.equal(boss.userData.arrivalOpacity, 0);
  assert.ok(boss.position.z < departure.z - 5000, 'Fly away before fading, never teleport out');
  assert.equal(game.enemyBolts.length, fired, 'Retreat never fires another volley');
  assert.equal(boss.userData.health, health); assert.equal(game.explosions.length, 0, 'Escape is not destruction');
  assert.ok(!game.queue.includes(boss), 'No boss respawn or kill reward for a retreat');
  game.setupLevelFleet(); game.setTime(6); game.updateShipArrivals();
  assert.equal(game.capital, boss); assert.equal(boss.userData.retreating, false);
  assert.equal(boss.userData.arrivalOpacity, 1); assert.equal(boss.userData.health, 60);
  game.setLevel(8); game.setupLevelFleet(); game.setTime(6); game.updateShipArrivals();
  game.setTime(30); game.updateCapitalShip(boss, 1 / fps);
  assert.equal(boss.userData.retreating, false, 'Later boss combinations retain their full combat phase');
}
console.log('PASS first-boss combat, smooth non-firing retreat, no kill/reward, pause, full-health retry and later-boss isolation at 5–144 FPS');

{
  const game = makeGame(); game.setLevel(4); game.setupLevelFleet();
  const planned = game.getAsteroidEncounters();
  assert.deepEqual(planned.map(event => [event.entry, event.exit]), [[5, 8], [32, 37]]);
  game.setTime(6); game.updateShipArrivals();
  game.capital.userData.health = 0; game.queueShip(game.capital);
  game.setTime(12); game.courseWorldOffset.z = game.flightDistanceAt(12);
  game.worldStep.z = game.courseWorldOffset.z / .85; game.updateAsteroidShower(1 / 60);
  game.worldStep.set(0, 0, 0); game.updateAsteroidShower(1 / 60);
  assert.equal(game.encounterIndex, 1);
  assert.equal(game.coursePlan().entry, 18, 'An early kill brings the field forward with six seconds of approach');
  assert.equal(game.coursePlan().end, 37, 'The earlier finale lasts longer instead of leaving dead time');
  game.setupLevelFleet();
  assert.deepEqual(game.getAsteroidEncounters(), planned, 'Retry restores the deterministic baseline, not the previous kill timing');
}
console.log('PASS stationary warm-up/aftermath, early-kill extension with safe lead and clean retry');

for (const level of [2, 3, 5, 7, 8]) {
  const game = makeGame(); game.setLevel(level); game.setupLevelFleet(); game.flightMotion.set(0, 0, 0);
  const plan = game.corridorPlan;
  if (level <= 3) {
    assert.equal(plan.shape, 0, 'Keep the first two corridors straight');
    assert.equal(plan.gap, (level === 2 ? 52 : 45), 'The level-two introduction has the widest opening');
  }
  else assert.ok(Math.abs(plan.bend) > plan.gap * 1.5, 'Later bends exceed the opening: straight flight cannot ignore them');
  assert.equal(Math.abs(game.corridorCenter(0, plan)), 0);
  assert.equal(Math.abs(game.corridorCenter(plan.length * .09, plan)), 0, 'Leave a straight lead-in');
  if (level <= 3) assert.equal(Math.abs(game.corridorCenter(plan.length * .5, plan)), 0);
  else assert.ok(Math.abs(game.corridorCenter(plan.length * .5, plan)) > plan.gap * .75);
  let time = 0, minimumClearance = Infinity, corridorFrames = 0;
  const clock = makeFlightClock(game, dt => {
    time += dt; game.setTime(time);
    const next = game.flightRings.find(gate => !gate.userData.resolved);
    const depth = plan.origin.z + game.courseWorldOffset.z - game.camera.position.z;
    const approach = game.flightRings.find(gate => gate.userData.kind === 'approach');
    let aim = next?.position.clone();
    if (approach.userData.resolved && depth < plan.length) {
      const lookAhead = game.levelFlightSpeed(time / 45) * .85 * .8;
      aim = plan.origin.clone().add(game.courseWorldOffset);
      aim.y += game.corridorCenter(depth + lookAhead, plan); aim.z = game.camera.position.z - lookAhead;
    }
    if (aim) {
      const delta = aim.sub(game.camera.position), yaw = -Math.atan2(delta.x, -delta.z);
      const pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
      const yawError = Math.atan2(Math.sin(yaw - game.flightOrientation.y), Math.cos(yaw - game.flightOrientation.y));
      game.target.set(THREE.MathUtils.clamp(-(yawError * 4 - game.flightTurn.x * .8) / .9, -1, 1),
        THREE.MathUtils.clamp(((pitch - game.flightOrientation.x) * 4 - game.flightTurn.y * .8) / .65, -1, 1));
    }
    clock.move(dt, time / 45); game.worldStep.copy(game.flightMotion).multiplyScalar(-dt);
    game.courseWorldOffset.addScaledVector(game.worldStep, .85); game.updateFlightRing();
    for (const probe of game.playerHull) {
      const point = probe.center.clone().applyQuaternion(game.playerHullRotation).add(game.camera.position);
      const localDepth = plan.origin.z + game.courseWorldOffset.z - point.z;
      if (localDepth < 0 || localDepth > plan.length) continue;
      const center = plan.origin.y + game.courseWorldOffset.y + game.corridorCenter(localDepth, plan);
      minimumClearance = Math.min(minimumClearance, plan.gap - Math.abs(point.y - center) - probe.radius);
      corridorFrames++;
    }
  });
  while (time < 45 && game.flightRings.some(gate => !gate.userData.resolved)) clock.frame(1 / 60);
  assert.ok(corridorFrames > 500);
  assert.ok(minimumClearance > 0, `Full hull can follow the stronger bend: level=${level}, clearance=${minimumClearance}`);
  assert.deepEqual(game.sounds, Array(5).fill('checkpoint'), 'Curve-following still reaches every checkpoint');
  assert.ok(time <= 41.5, `Keep at least 3.5 seconds of finish margin after the longer curved route: level=${level}, time=${time}`);
}
console.log('PASS readable bends with straight lead-ins and real-inertia full-hull traversal');
