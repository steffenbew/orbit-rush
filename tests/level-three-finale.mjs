// The final field must be part of the checkpoint approach, with a flyable route around its core.
import assert from 'node:assert/strict';
import { THREE, makeGame, makeFlightClock, randomState } from './helpers/flight-game.mjs';

for (const reduced of [false, true]) for (const fps of [5, 60, 144]) for (const seed of [123, 456, 789])
for (const evade of [false, true]) {
  randomState.seed = seed;
  const game = makeGame(reduced); game.setLevel(3); game.setupLevelFleet(); game.flightMotion.set(0, 0, 0);
  let time = 0, detailedHits = 0, route = null;
  const clock = makeFlightClock(THREE, game, reduced, dt => {
    time += dt; game.setTime(time);
    let aim = game.flightRings.find(gate => !gate.userData.resolved)?.position.clone();
    if (evade && route) {
      const ahead = reduced ? 0 : game.levelFlightSpeed(time / 45) * .85 * .6;
      const z = game.camera.position.z - game.courseWorldOffset.z - ahead;
      const next = route.findIndex(point => point.z < z), index = next < 0 ? route.length - 1 : next;
      aim = route[index].clone();
      if (!reduced && index > 0) {
        const before = route[index - 1];
        aim.copy(before).lerp(route[index], THREE.MathUtils.clamp((before.z - z) / (before.z - route[index].z), 0, 1));
      }
      aim.add(game.courseWorldOffset);
    }
    if (aim) {
      const delta = aim.sub(game.camera.position), yaw = -Math.atan2(delta.x, -delta.z);
      const pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z)), motion = reduced ? .5 : 1;
      const error = Math.atan2(Math.sin(yaw - game.flightOrientation.y), Math.cos(yaw - game.flightOrientation.y));
      game.target.set(THREE.MathUtils.clamp(-(error * 4 - game.flightTurn.x * .8) / (.9 * motion), -1, 1),
        THREE.MathUtils.clamp(((pitch - game.flightOrientation.x) * 4 - game.flightTurn.y * .8) / (.65 * motion), -1, 1));
    }
    clock.move(dt, time / 45); game.worldStep.copy(game.flightMotion).multiplyScalar(-dt);
    game.courseWorldOffset.addScaledVector(game.worldStep, .85); game.updateFlightRing(); game.camera.updateMatrixWorld();
    // Recycle earlier encounters too, so the final field has the same available pool as real gameplay.
    const fieldRocks = game.fieldGroups.flatMap(group => group.rocks);
    for (const rock of game.showerPool.filter(rock => rock.visible)) {
      const previous = rock.position.clone();
      rock.position.addScaledVector(game.worldStep, .85).addScaledVector(rock.userData.courseVelocity, dt);
      if (fieldRocks.includes(rock) && game.crossesPlayer(rock, previous, rock.position)) detailedHits++;
      if (game.hasPassedCamera(rock)) game.queueShip(rock);
    }
    game.updateAsteroidShower(dt);
    if (game.fieldGroups.length) {
      if (!route) {
        assert.ok(game.fieldGroups[0].rocks.length >= 2, 'The finale contains real detailed obstacles, not an exhausted pool');
        const origin = game.coursePlan().origin;
        route = game.fieldRoute.map(point => point.clone().add(origin));
        const core = game.fieldGroups[0].position.clone().add(origin).add(game.courseWorldOffset);
        const depthToGate = core.z - game.flightRings.at(-2).position.z;
        assert.ok(depthToGate > 0 && depthToGate < game.levelFlightSpeed(37 / 45) * .85 * 2,
          'The remnant sits less than two seconds before the late checkpoint');
      }
      game.recordVisibleObjects(); game.recordVisibleShowerRocks(); game.updateShowerRockCollisions();
    }
  });
  while (time < 42 && game.flightRings.some(gate => !gate.userData.resolved)) clock.frame(1 / fps);
  const context = JSON.stringify({reduced, fps, seed, evade});
  assert.ok(route, `Encounter the final field: ${context}`);
  if (evade || reduced) {
    assert.equal(detailedHits, 0, `Full-hull clearance while steering through the finale: ${context}`);
    assert.equal(game.hits.length, 0, `No debris collisions on the reserved route: ${context}`);
    assert.deepEqual(game.sounds, Array(5).fill('checkpoint'), `Reach all gates without shooting: ${context}`);
    assert.ok(time <= 41, `Keep the finish margin: ${context}`);
  } else {
    assert.ok(detailedHits + game.hits.length > 0, `Aiming straight at the gate must require an evasive correction: ${context}`);
  }
}
console.log('PASS level-three checkpoint/field proximity, real approach hazards and collision-free evasive routes at 5–144 FPS in both motion modes');
