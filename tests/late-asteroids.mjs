// Isolated, initially stationary remnants after level one's introductory shower.
import assert from 'node:assert/strict';
import { THREE, makeGame, makeFlightClock } from './helpers/flight-game.mjs';

const layout = game => game.lateAsteroids.map(({rock, time}) => ({time,
  position: rock.position.toArray(), rotation: rock.quaternion.toArray(), size: rock.scale.x}));
for (const reduced of [false, true]) {
  const game = makeGame(reduced); game.setupLevelFleet();
  game.setTime(28.99); game.updateAsteroidShower(0);
  assert.equal(game.lateAsteroids.length, 0);
  game.setTime(29); game.updateAsteroidShower(0);
  assert.deepEqual(game.lateAsteroids.map(entry => entry.time), [35, 37.5]);
  const original = layout(game), count = game.showerPool.length;
  const route = new THREE.Line3(game.flightRings.at(-2).position, game.flightRings.at(-1).position);
  for (const [index, {rock, time}] of game.lateAsteroids.entries()) {
    assert.ok(rock.visible); assert.equal(rock.userData.courseVelocity.lengthSq(), 0, 'No inherited shower drift');
    assert.equal(rock.scale.x, [2.8, 1.3][index] * (reduced ? .35 : 1));
    assert.equal(rock.userData.health, [3, 2][index]); assert.equal(rock.userData.maxHealth, rock.userData.health);
    assert.ok(Math.abs(rock.position.z + game.flightDistanceAt(time)) < 1e-7, 'Fixed world depth matches the late pass time');
    const sphere = rock.userData.collisionBox.getBoundingSphere(new THREE.Sphere());
    const radius = (sphere.radius + sphere.center.length()) * rock.scale.x;
    const closest = route.closestPointToPoint(rock.position, true, new THREE.Vector3());
    assert.ok(rock.position.distanceTo(closest) >= radius + 26 + (reduced ? 14 : 40), 'A clear full-hull route passes the isolated remnant');
    for (const gate of game.flightRings) assert.ok(rock.position.distanceTo(gate.position) >= radius + gate.userData.radius * 1.5 + 26, 'Checkpoint openings and approach remain clear');
    assert.ok(game.crossesPlayer(rock, rock.position.clone().add(new THREE.Vector3(0, 0, -300)), rock.position.clone().add(new THREE.Vector3(0, 0, 300)), 0, rock.position), 'The remnant is a real collidable asteroid');
    const position = rock.position.clone(), rotation = rock.quaternion.clone();
    game.worldStep.set(10, 20, 30); game.moveShip(rock, 1 / 60);
    assert.ok(rock.position.distanceTo(position.addScaledVector(game.worldStep, .85)) < 1e-7);
    assert.ok(rock.quaternion.equals(rotation), 'World travel does not make stationary rocks tumble');
  }
  assert.ok(game.lateAsteroids[0].rock.position.distanceTo(game.lateAsteroids[1].rock.position) > (reduced ? 130 : 1000), 'Separate encounters, not a late cluster');
  game.worldStep.set(0, 0, 0);
  for (const {rock} of game.lateAsteroids) game.queueShip(rock);
  game.setTime(40); game.updateAsteroidShower(0);
  assert.equal(game.lateAsteroids.length, 2);
  assert.ok(game.lateAsteroids.every(({rock}) => !rock.visible && !game.queue.includes(rock)), 'Destroyed/passed remnants do not respawn as regular reinforcements');
  game.setTime(0); game.setupLevelFleet(); game.updateAsteroidShower(0);
  assert.equal(game.lateAsteroids.length, 0, 'Retry clears the late-object schedule');
  game.setTime(29); game.updateAsteroidShower(0);
  assert.deepEqual(layout(game), original, 'Retry preserves placement, sizes and orientation');
  assert.equal(game.showerPool.length, count, 'Reuse the existing event pool');
}
for (const [setter, inactive, active] of [['setStarted', false, true], ['setPaused', true, false], ['setRoundEnded', true, false], ['setCrashing', true, false]]) {
  const game = makeGame(); game.setupLevelFleet(); game.setTime(29); game[setter](inactive);
  game.updateAsteroidShower(1); assert.equal(game.lateAsteroids.length, 0);
  game[setter](active); game.updateAsteroidShower(0); assert.equal(game.lateAsteroids.length, 2);
}
for (const level of [2, 3, 4, 6]) {
  const game = makeGame(); game.setLevel(level); game.setupLevelFleet(); game.setTime(29); game.updateAsteroidShower(0);
  assert.equal(game.lateAsteroids.length, 0, 'Do not add late rocks to other levels or boss fights');
}
{
  const game = makeGame(); game.setupLevelFleet(); game.setCourseStart(50);
  game.setTime(78.99); game.updateAsteroidShower(0); assert.equal(game.lateAsteroids.length, 0);
  game.setTime(79); game.updateAsteroidShower(0); assert.equal(game.lateAsteroids.length, 2, 'Tutorial time is not course time');
}
console.log('PASS two separated late remnants, size-aware durability, stationary placement, checkpoint clearance, lifecycle guards and stable pooled retries');

// Actual flight/steering through the closing route; no immunity or shooting needed for these rocks.
for (const reduced of [false, true]) for (const fps of [5, 60, 144]) {
  const game = makeGame(reduced); game.setupLevelFleet(); game.flightMotion.set(0, 0, 0);
  let time = 0, hits = 0;
  const clock = makeFlightClock(game, dt => {
    time += dt; game.setTime(time);
    const next = game.flightRings.find(gate => !gate.userData.resolved);
    if (next) {
      const delta = next.position.clone().sub(game.camera.position);
      const yaw = -Math.atan2(delta.x, -delta.z), pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
      const error = Math.atan2(Math.sin(yaw - game.flightOrientation.y), Math.cos(yaw - game.flightOrientation.y));
      const motion = reduced ? .5 : 1;
      game.target.set(THREE.MathUtils.clamp(-(error * 4 - game.flightTurn.x * .8) / (.9 * motion), -1, 1),
        THREE.MathUtils.clamp(((pitch - game.flightOrientation.x) * 4 - game.flightTurn.y * .8) / (.65 * motion), -1, 1));
    }
    clock.move(dt, time / 45); game.worldStep.copy(game.flightMotion).multiplyScalar(-dt);
    game.courseWorldOffset.addScaledVector(game.worldStep, .85); game.camera.updateMatrixWorld();
    game.updateAsteroidShower(dt);
    for (const rock of game.showerPool.filter(rock => rock.visible)) {
      const previous = rock.position.clone(); game.moveShip(rock, dt);
      if (game.lateAsteroids.some(entry => entry.rock === rock) && game.crossesPlayer(rock, previous, rock.position)) hits++;
      if (game.hasPassedCamera(rock)) game.queueShip(rock);
    }
    game.updateFlightRing();
  });
  while (time < 42) clock.frame(1 / fps);
  assert.equal(game.lateAsteroids.length, 2);
  assert.equal(hits, 0, `Closing route remains clear: reduced=${reduced}, fps=${fps}`);
  assert.ok(game.lateAsteroids.every(({rock}) => !rock.visible), 'Full hulls clear before the countdown');
  assert.deepEqual(game.sounds, Array(5).fill('checkpoint'));
}
console.log('PASS full-inertia closing flight past the late stationary rocks, final checkpoint and cleanup at 5–144 FPS');
