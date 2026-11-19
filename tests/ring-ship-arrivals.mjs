// Run from the project root: node tests/ring-ship-arrivals.mjs
import assert from 'node:assert/strict';
import { makeGame } from './helpers/flight-game.mjs';

const full = process.env.ORBIT_TEST_FULL === '1';

// A busy encounter can delay route traffic until the corridor is already under or behind the player.
for (const level of [1, 10]) for (const shape of full ? [0, 1, 2] : [2]) {
  for (const progress of full ? [-.01, 0, .02, .5, .99, 1, 1.01] : [0, .5, 1]) {
    const game = makeGame();
    game.setLevel(level); game.setupLevelFleet();
    const field = game.ringCourse(true, shape), depth = field.length * progress;
    game.setTime(30);
    game.courseWorldOffset.set(120, -30, game.camera.position.z - field.origin.z + depth);
    for (const gate of game.flightRings) {
      gate.position.add(game.courseWorldOffset);
      if (gate.position.z >= game.camera.position.z) {
        gate.userData.resolved = true; gate.visible = false;
      }
    }
    const gates = game.flightRings.filter(gate => !gate.userData.resolved);
    assert.ok(gates.length > 0, 'Keep checkpoints ahead so delayed traffic has a route');
    let pool = [...game.ringShips];
    const allocated = game.ships.length;
    const context = `level=${level}, shape=${shape}, progress=${progress}`;
    assert.doesNotThrow(() => game.resetRingShips(true), context);
    assert.deepEqual(game.ringShips.slice(0, pool.length), pool, 'Reuse the original companion models');
    assert.equal(game.ships.length, allocated + (level >= 5 ? 2 : 0), 'Only the two extra corridor companions need new models');
    pool = [...game.ringShips];
    assert.equal(pool.length, level >= 5 ? 4 : 2);

    const startZ = game.camera.position.z - game.courseWorldOffset.z;
    for (const ship of pool) {
      const route = ship.userData.ringRoute, points = route.curve.points;
      assert.ok(ship.visible && ship.userData.arrivalOpacity === 0, 'Delayed companions still fade in');
      assert.ok(Number.isFinite(route.length) && route.length > 0);
      assert.ok(points.every(point => point.z <= startZ + 1e-8), `No waypoints behind the player: ${context}`);
      assert.ok(points.slice(1).every((point, index) => point.z < points[index].z), 'No duplicate or backward corridor knots');
      assert.ok(Math.abs(points[0].z - startZ) < 1e-8, 'The route starts at the current course position');
      if (progress >= 0 && progress < 1) {
        assert.ok(Math.abs(points[0].y - field.origin.y - game.corridorCenter(depth)) < 1e-8,
          'An arrival inside the corridor starts on its remaining centerline');
      }
      if (progress >= 1) {
        assert.equal(points.length, gates.length * 3 + 2, 'Do not reinsert a corridor that is already behind the player');
      }
      for (let sample = 0; sample <= 200; sample++) {
        const point = route.curve.getPointAt(sample / 200), tangent = route.curve.getTangentAt(sample / 200);
        assert.ok([...point.toArray(), ...tangent.toArray()].every(Number.isFinite), `Finite route geometry: ${context}`);
        const corridorDepth = field.origin.z - point.z;
        if (progress < 1 && corridorDepth >= 0 && corridorDepth <= field.length) {
          assert.ok(Math.abs(point.y - field.origin.y - game.corridorCenter(corridorDepth)) < field.gap * .65,
            `Follow the remaining passage, not a straight shortcut through its walls: ${context}`);
        }
      }
    }
    const routes = pool.map(ship => ship.userData.ringRoute);
    const dt = 1 / 60;
    for (let frame = 1; frame <= 180; frame++) {
      const time = 30 + frame * dt;
      game.setTime(time); game.updateRingShipArrivals();
      game.flightMotion.set(0, 0, -game.levelFlightSpeed(time / 45));
      game.worldStep.copy(game.flightMotion).multiplyScalar(-dt);
      game.courseWorldOffset.addScaledVector(game.worldStep, .85);
      for (const ship of pool) {
        game.updateShipCourse(ship, dt); game.moveShip(ship, dt);
        assert.ok([...ship.position.toArray(), ...ship.quaternion.toArray(), ...ship.userData.courseVelocity.toArray()].every(Number.isFinite),
          `Late traffic keeps moving without invalid transforms: ${context}`);
        assert.ok(ship.userData.courseVelocity.z <= 1e-8, 'Spawned companions fly forward along the remaining route');
        assert.ok(ship.position.distanceTo(ship.userData.ringRoute.position.clone().add(game.courseWorldOffset)) < 1e-8,
          'Apply world travel exactly once');
      }
    }
    pool.forEach((ship, index) => {
      assert.equal(ship.userData.ringRoute, routes[index], 'Activate delayed routes only once');
      assert.equal(ship.userData.arrivalOpacity, 1, 'Complete the arrival fade');
    });
  }
}
console.log('PASS late route traffic at corridor entry, inside and after the passage, normal, model reuse and finite forward paths');

const finished = makeGame(); finished.setupLevelFleet(); finished.ringCourse(true);
finished.flightRings.forEach(gate => { gate.userData.resolved = true; gate.visible = false; });
assert.doesNotThrow(() => finished.resetRingShips(true));
assert.ok(finished.ringShips.every(ship => !ship.visible), 'Do not spawn companions after the last checkpoint');
console.log('PASS no route traffic after all checkpoints are resolved');
