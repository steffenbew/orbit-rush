// Run from the project root: node tests/flight-traffic.mjs
import assert from 'node:assert/strict';
import { THREE, t, source, section, code, math, makeGame, assertShipInsideBoundary, moveRock } from './helpers/flight-game.mjs';

for (const reducedMotion of [false, true]) {
  const traffic = makeGame(reducedMotion);
  // Include retries and a return to level one after the larger fleet has been allocated.
  for (const level of [8, 1, 2, 3, 4, 8, 12, 20, 20, 1]) {
    traffic.setLevel(level);
    traffic.setupLevelFleet();
    const baseTypes = [0, 0, 3, 1, 2, 0, 2, 3];
    while (baseTypes.length < level + 2) baseTypes.push([3, 0, 1, 3, 2][(baseTypes.length - 8) % 5]);
    const baseFleet = baseTypes.slice(0, level + 2);
    const regularCount = baseFleet.filter(type => type !== 3).length;
    const active = [...traffic.ships.filter(ship => ship.visible && !ship.userData.ringRoute), ...traffic.queue];
    assert.equal(new Set(active).size, active.length, 'Every fleet member must be scheduled only once');
    assert.equal(traffic.ships.filter(ship => ship.visible && !ship.userData.ringRoute).length, 2, 'Keep the two regular opening ships');
    assert.equal(traffic.ringShips.filter(ship => ship.visible).length, 0, 'Course traffic must not crowd the opening formation');
    assert.equal(traffic.ships.filter(ship => ship.visible).length, 2, 'Only two ships at level start, including level two');
    assert.equal(active.filter(ship => !ship.userData.type.asteroid && !ship.userData.type.capital).length,
      Math.round((regularCount + Math.round(regularCount * .2) + 3) * 1.3), 'Increase regular ships by about 30% without crowding the opening');
    assert.equal(active.filter(ship => ship.userData.type.asteroid).length,
      Math.round((baseFleet.filter(type => type === 3).length + Math.ceil(level / 2) + 3) * 1.3), 'Increase asteroid arrivals by about 30%');
    const unlocked = ['INTERCEPTOR', 'NOVA SAUCER', 'TITAN CARRIER'].slice(0, Math.min(3, level));
    const regularTypes = new Set(active.filter(ship => !ship.userData.type.asteroid).map(ship => ship.userData.type.name));
    assert.deepEqual([...regularTypes].sort(), [...unlocked].sort(), 'Regular reinforcements respect level-based class unlocks, including a new run');
    traffic.setTime(0);
    traffic.ships.filter(ship => ship.visible && !ship.userData.type.asteroid && !ship.userData.type.capital).forEach(ship => traffic.queueShip(ship));
    traffic.setTime(6); traffic.updateRingShipArrivals();
    const routeShips = traffic.ringShips.filter(ship => ship.visible);
    assert.equal(routeShips.length, 2, 'Only two extra ships accompany the checkpoint path');
    assert.deepEqual(routeShips.map(ship => ship.userData.type.name).sort(), ['INTERCEPTOR', unlocked.at(-1)].sort(),
      'The route pair includes the latest unlocked class, even after returning to level one');
    traffic.setTime(0);
    assert.equal(active.filter(ship => ship.userData.stationary).length, 3, 'Three guaranteed stationary rocks are mixed into arrivals');
    assert.equal(traffic.queue[1].userData.type.asteroid, undefined, 'Extra ships arrive early among the rocks, not only at the end');
    assert.equal(traffic.capitalPending, level >= 4 && level % 4 === 0, 'Keep boss progression unchanged');
    const allocated = traffic.ships.length;
    traffic.setupLevelFleet();
    assert.equal(traffic.ships.length, allocated, 'Reuse the extra ships on retry');
  }
}
console.log('PASS planned fleet counts, three stationary rocks, unchanged two-ship opening/bosses and fleet reuse');

for (const reducedMotion of [false, true]) for (const level of [1, 2, 3, 4, 6, 7, 9, 10, 12, 13, 20]) {
  const traffic = makeGame(reducedMotion); traffic.setLevel(level); traffic.setupLevelFleet();
  const limit = Math.min(6, 2 + Math.floor((level - 1) / 3));
  const activeShips = () => traffic.ships.filter(ship => ship.visible && !ship.userData.type.asteroid && !ship.userData.type.capital);
  traffic.setTime(3); traffic.updateShipArrivals();
  assert.equal(activeShips().length, 2, 'Every level opens with only two ships');
  traffic.setTime(6); traffic.updateRingShipArrivals();
  assert.equal(activeShips().length, 2, 'A timer alone never stacks route traffic onto the opening encounter');
  traffic.flightRings[0].userData.passedAt = 6; traffic.updateRingShipArrivals();
  assert.equal(activeShips().length, 2, 'A checkpoint cannot bypass an uncleared encounter');
  traffic.queueShip(activeShips()[0]);
  traffic.setTime(8.99); traffic.updateRingShipArrivals();
  assert.equal(activeShips().length, 1, 'Wait three seconds after a ship leaves');
  traffic.setTime(9); traffic.updateRingShipArrivals();
  if (limit === 2) {
    assert.equal(activeShips().length, 1, 'Early levels cannot add a pair beside one survivor');
    traffic.queueShip(activeShips()[0]);
    traffic.setTime(11.99); traffic.updateRingShipArrivals();
    assert.equal(activeShips().length, 0);
    traffic.setTime(12); traffic.updateRingShipArrivals();
  }
  assert.equal(traffic.ringShips.filter(ship => ship.visible).length, 2);
  assert.equal(activeShips().length, limit === 2 ? 2 : 3);
  const queuedRocks = traffic.queue.filter(ship => ship.userData.type.asteroid).length;
  traffic.setTime(16); traffic.updateShipArrivals();
  assert.equal(traffic.queue.filter(ship => ship.userData.type.asteroid).length, queuedRocks - 1, 'Waiting for a wave does not block queued rocks');
  assert.equal(activeShips().length, limit === 2 ? 2 : 3, 'Do not top up a still-busy encounter');
  // Isolate ship scheduling after separately verifying that rocks still arrive.
  traffic.queue.splice(0, traffic.queue.length, ...traffic.queue.filter(ship => !ship.userData.type.asteroid));
  traffic.setTime(17); activeShips().slice(1).forEach(ship => traffic.queueShip(ship));
  traffic.setTime(19); traffic.updateShipArrivals();
  assert.equal(activeShips().length, 1, 'A new group waits for the breather, not just a free slot');
  traffic.flightRings[1].userData.passedAt = 19; traffic.updateShipArrivals();
  assert.equal(activeShips().length, 2, 'A newly passed checkpoint can release a ready group early');
  for (const time of [20.5, 22, 23.5, 25]) {
    traffic.setTime(time); traffic.updateShipArrivals();
    assert.ok(activeShips().length <= limit, 'Staggered wave members always respect the level limit');
  }
  assert.equal(activeShips().length, limit, 'The cap grows one slot every three levels, up to six ships');
  traffic.flightRings[2].userData.passedAt = 26;
  traffic.setTime(26); traffic.updateShipArrivals();
  assert.equal(activeShips().length, limit, 'Checkpoints never override the active-ship limit');
  if (limit >= 4) {
    traffic.queueShip(activeShips()[0]);
    traffic.setTime(34); traffic.updateShipArrivals();
    assert.equal(activeShips().length, limit - 1, 'Even after the delay, several survivors block the next group');
  }
}
console.log('PASS two-ship openings, level-scaled wave limits, three-second breathers, checkpoint triggers, no top-ups and asteroid continuity');

for (const reducedMotion of [false, true]) for (const fps of [5, 30, 60, 144]) {
  const still = makeGame(reducedMotion); still.setLevel(3); still.setupLevelFleet();
  const rocks = still.queue.filter(rock => rock.userData.stationary);
  for (const rock of rocks) {
    still.resetShip(rock);
    assert.equal(rock.userData.courseVelocity.length(), 0);
    assert.equal(rock.userData.dangerousCrossing, false);
    assert.ok(rock.position.distanceTo(still.camera.position) >= (reducedMotion ? 900 : 3800));
    const position = rock.position.clone(), rotation = rock.quaternion.clone(), travel = new THREE.Vector3();
    still.flightOrientation.set(.4, -.6, 0, 'YXZ');
    for (let frame = 0; frame < fps * 3; frame++) {
      const dt = 1 / fps;
      still.worldStep.set(-80 * dt, 30 * dt, 350 * dt);
      travel.addScaledVector(still.worldStep, .85);
      still.updateShipCourse(rock, dt);
      rock.position.addScaledVector(still.worldStep, .85); moveRock(rock, dt, false, reducedMotion);
      assert.equal(rock.userData.courseVelocity.length(), 0, 'Later steering never sets stationary rocks in motion');
    }
    assert.ok(rock.position.distanceTo(position.add(travel)) < 1e-8);
    assert.ok(rock.quaternion.equals(rotation), 'Stationary rocks do not tumble');
    still.queueShip(rock); still.resetShip(rock);
    assert.equal(rock.userData.courseVelocity.length(), 0, 'Reused arrivals remain stationary');
    assert.equal(rock.userData.health, rock.userData.asteroidTier, 'Stationary rocks retain real health and collisions');
  }
}
for (const reducedMotion of [false, true]) {
  const tint = makeGame(reducedMotion); tint.setLevel(4); tint.setupLevelFleet();
  const ship = tint.ships[0]; tint.resetShip(ship); ship.position.set(0, 0, -500);
  const material = ship.userData.hull, color = material.color.clone(), opacity = material.opacity;
  ship.userData.hitFlash = .22; tint.updateShipHitFlash(ship);
  const fullRed = material.emissive.r;
  assert.ok(fullRed > 0 && fullRed <= .15, 'The red hit overlay is subtle, not a bright red body');
  ship.userData.hitFlash = .11; tint.updateShipHitFlash(ship);
  assert.ok(Math.abs(material.emissive.r - fullRed / 2) < 1e-9, 'The tint fades smoothly');
  assert.ok(material.color.equals(color)); assert.equal(material.opacity, opacity, 'The hull stays solid underneath the translucent-looking tint');
  ship.userData.hitFlash = 0; tint.updateShipHitFlash(ship); assert.equal(material.emissive.r, 0);
}
console.log('PASS stationary collidable rock arrivals/reuse at 5–144 FPS and soft fading hit tints without transparent hulls');

// The extra course ships must not join the opening formation, especially in level two.
for (const reducedMotion of [false, true]) for (const level of [2, 10]) for (const fps of [5, 60]) {
  const arrivals = makeGame(reducedMotion);
  arrivals.setLevel(level); arrivals.setPressure(1 - Math.exp(-(level - 1) / 4)); arrivals.setupLevelFleet();
  const pool = [...arrivals.ringShips], allocated = arrivals.ships.length;
  assert.equal(arrivals.ships.filter(ship => ship.visible).length, 2);
  arrivals.setTime(2);
  arrivals.ships.filter(ship => ship.visible).forEach(ship => arrivals.queueShip(ship));
  arrivals.setTime(5.99); arrivals.updateRingShipArrivals();
  assert.ok(pool.every(ship => !ship.visible), 'Keep course traffic hidden through the opening checkpoint');
  arrivals.setTime(6);
  for (const [setter, inactive] of [['setPaused', true], ['setRoundEnded', true], ['setCrashing', true], ['setStarted', false]]) {
    arrivals[setter](inactive); arrivals.updateRingShipArrivals();
    assert.ok(pool.every(ship => !ship.visible), 'No pending arrival in an inactive state');
    arrivals[setter](!inactive);
  }
  arrivals.courseWorldOffset.set(120, -30, arrivals.flightDistanceAt(6));
  for (const gate of arrivals.flightRings) {
    gate.position.add(arrivals.courseWorldOffset);
    if (gate.position.z >= 0) { gate.visible = false; gate.userData.resolved = true; }
  }
  arrivals.updateRingShipArrivals();
  assert.deepEqual(arrivals.ringShips, pool); assert.equal(arrivals.ships.length, allocated);
  assert.equal(pool.length, 2, 'Two reusable ships add traffic along the checkpoint route');
  assert.ok(pool.every(ship => ['INTERCEPTOR', 'NOVA SAUCER', 'TITAN CARRIER'].slice(0, Math.min(3, level)).includes(ship.userData.type.name)),
    'Only level-unlocked ship types join route traffic');
  const spacing = arrivals.levelFlightSpeed(6 / 45) * .85;
  const gaps = pool.slice(1).map((ship, index) => (ship.userData.ringRoute.distance - pool[index].userData.ringRoute.distance) / spacing);
  assert.ok(gaps.every(gap => gap >= 1.4 && gap <= 2.2), 'Loose traffic keeps 1.4–2.2 seconds between arrivals');
  assert.ok(Math.abs(gaps[0] - 1.8) > 1e-4, 'Arrival spacing is randomized, not a fixed formation');
  assert.ok(pool.every(ship => ship.visible && ship.userData.arrivalOpacity === 0));
  assert.ok(pool.every(ship => ship.position.distanceTo(arrivals.camera.position) > (reducedMotion ? 150 : 800)),
    'Delayed traffic must leave a safe approach, not teleport into the current flight path');
  const firstArrival = pool[0].position.distanceTo(arrivals.camera.position);
  assert.ok(firstArrival < Math.max(reducedMotion ? 220 : 1200, arrivals.levelFlightSpeed(6 / 45) * .85 * 3.1),
    'The first route ship stays nearby instead of starting beyond the distance fade');
  const routes = pool.map(ship => ship.userData.ringRoute);
  for (let frame = 1; frame <= fps * 12; frame++) {
    const dt = 1 / fps, time = 6 + frame * dt;
    arrivals.setTime(time); arrivals.updateRingShipArrivals();
    arrivals.flightMotion.set(0, 0, -arrivals.levelFlightSpeed(time / 45));
    arrivals.worldStep.copy(arrivals.flightMotion).multiplyScalar(-dt);
    arrivals.courseWorldOffset.addScaledVector(arrivals.worldStep, .85);
    for (const ship of pool) {
      arrivals.updateShipCourse(ship, dt);
      ship.position.addScaledVector(ship.userData.courseVelocity, dt).addScaledVector(arrivals.worldStep, .85);
      assert.ok(ship.position.distanceTo(ship.userData.ringRoute.position.clone().add(arrivals.courseWorldOffset)) < 1e-8);
      if (time < 10) {
        const clearance = time < 7.2 ? (reducedMotion ? 100 : 500) : (reducedMotion ? 30 : 150);
        assert.ok(ship.position.z < -clearance, 'Fade-ins stay clear; visible ships approach without an immediate fly-by');
      }
    }
  }
  pool.forEach((ship, index) => assert.equal(ship.userData.ringRoute, routes[index], 'Activate the pending flight only once'));
}
const trainingTraffic = makeGame(); trainingTraffic.setupLevelFleet(); trainingTraffic.beginFlightTutorial();
trainingTraffic.setTime(30); trainingTraffic.updateRingShipArrivals();
assert.ok(trainingTraffic.ringShips.every(ship => !ship.visible), 'A long tutorial must not trigger the scheduled course ships');
assert.ok(source.indexOf('        updateRingShipArrivals();') < source.indexOf('        if (started && !paused && !roundEnded && !crashing) courseWorldOffset.addScaledVector(worldStep, .85);'),
  'Place delayed routes before applying the next world step');
console.log('PASS two-ship opening, two nearby level-unlocked route ships, pause/lifecycle guards, single activation, high-speed clearance and model reuse');

// Course traffic stays near the real checkpoints, using loose lanes independent of player steering.
for (const reducedMotion of [false, true]) for (const level of [1, 10]) for (const shape of [-1, 0, 1, 2]) for (const fps of [5, 60, 144]) {
  const traffic = makeGame(reducedMotion);
  traffic.setLevel(level); traffic.setPressure(1 - Math.exp(-(level - 1) / 4)); traffic.setupLevelFleet();
  const field = traffic.ringCourse(shape >= 0, Math.max(0, shape));
  const gates = traffic.flightRings.filter(gate => gate.visible).map(gate => ({
    position: gate.position.clone(), normal: gate.userData.normal.clone(), radius: gate.userData.radius
  }));
  const gateState = traffic.flightRings.map(gate => [gate.position.toArray(), gate.visible, gate.userData.resolved]);
  const passes = traffic.ringShips.map(() => new Set());
  const firstGateOffsets = traffic.ringShips.map(ship => ship.userData.ringRoute.curve.points[2].clone().sub(gates[0].position));
  assert.ok(Math.max(...firstGateOffsets.map(point => point.x)) - Math.min(...firstGateOffsets.map(point => point.x)) > gates[0].radius * 1.6,
    'Traffic spans both sides of the checkpoint instead of sharing the same tight route');
  assert.ok(Math.max(...firstGateOffsets.map(point => point.y)) - Math.min(...firstGateOffsets.map(point => point.y)) > 1e-4,
    'Ships use distinct heights as well as lateral lanes');
  const previous = new THREE.Vector3(), local = new THREE.Vector3(), crossing = new THREE.Vector3(), corner = new THREE.Vector3();
  for (let frame = 1; frame <= 45 * fps; frame++) {
    const dt = 1 / fps, time = frame * dt;
    traffic.setTime(time);
    // Vary the player's course. Only the common inverse-world translation may affect the ships.
    traffic.target.set(Math.sin(time), Math.cos(time));
    traffic.flightOrientation.set(.3 * Math.cos(time), time * .1, 0, 'YXZ');
    traffic.worldStep.set(Math.sin(time) * 50 * dt, Math.cos(time) * 20 * dt, traffic.levelFlightSpeed(time / 45) * dt);
    traffic.flightMotion.copy(traffic.worldStep).multiplyScalar(-1 / dt);
    traffic.courseWorldOffset.addScaledVector(traffic.worldStep, .85);
    traffic.ringShips.forEach((ship, index) => {
      previous.copy(ship.position).sub(traffic.courseWorldOffset).addScaledVector(traffic.worldStep, .85);
      traffic.updateShipCourse(ship, dt);
      traffic.moveShip(ship, dt);
      assertShipInsideBoundary(traffic, ship);
      local.copy(ship.position).sub(traffic.courseWorldOffset);
      assert.ok(local.distanceTo(ship.userData.ringRoute.position) < 1e-6, 'Apply inverse-world travel exactly once');
      const depth = field.origin.z - local.z;
      if (shape >= 0 && depth >= 0 && depth <= field.length) {
        assert.ok(Math.abs(local.y - field.origin.y - traffic.corridorCenter(depth)) < field.gap * .65,
          'Course traffic follows the narrow passage instead of clipping through the ceiling or floor');
        const box = ship.userData.collisionBox;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          corner.set(x, y, z).multiply(ship.scale).applyQuaternion(ship.quaternion).add(local);
          const cornerDepth = field.origin.z - corner.z;
          if (cornerDepth >= 0 && cornerDepth <= field.length) {
            assert.ok(Math.abs(corner.y - field.origin.y - traffic.corridorCenter(cornerDepth)) < field.gap,
              'The whole varied-lane hull stays between the corridor ceiling and floor');
          }
        }
      }
      gates.forEach((gate, gateIndex) => {
        const before = previous.clone().sub(gate.position).dot(gate.normal);
        const after = local.clone().sub(gate.position).dot(gate.normal);
        if (before <= 0 || after > 0) return;
        assert.ok(!passes[index].has(gateIndex), 'Each route ship crosses each gate once');
        passes[index].add(gateIndex);
        crossing.lerpVectors(previous, local, before / (before - after)).sub(gate.position);
        const box = ship.userData.collisionBox;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          corner.set(x, y, z).multiply(ship.scale).applyQuaternion(ship.quaternion).add(crossing);
          corner.addScaledVector(gate.normal, -corner.dot(gate.normal));
          assert.ok(corner.length() < gate.radius * 3.5,
            `Traffic stays near the gate: reduced=${reducedMotion}, level=${level}, shape=${shape}, fps=${fps}, ship=${index}, gate=${gateIndex}, radius=${corner.length()}/${gate.radius * 3.5}, time=${time}`);
        }
      });
    });
  }
  passes.forEach(passed => assert.ok(passed.size >= 2,
    'Route ships progress through the course; naturally overtaken ships need not reach the player finish'));
  assert.deepEqual(traffic.flightRings.map(gate => [gate.position.toArray(), gate.visible, gate.userData.resolved]), gateState,
    'NPC passages never move, hide or resolve the player gates');
  assert.equal(traffic.shield, 100, 'NPC passages cannot cost player armor');
  assert.equal(traffic.sounds.length, 0, 'NPC passages do not trigger player rewards or misses');
}
console.log('PASS two level-unlocked ships in loose nearby lanes, corridor paths, independent steering and shared world motion at 5–144 FPS');

// Distant targets must become catchable, and close ones must remain shootable instead of flashing past.
for (const reducedMotion of [false, true]) for (const level of [1, 10]) for (const fps of [5, 60, 144]) {
  const traffic = makeGame(reducedMotion);
  traffic.setLevel(level); traffic.setPressure(1 - Math.exp(-(level - 1) / 4)); traffic.setupLevelFleet();
  traffic.ringCourse(false);
  traffic.setTime(6); traffic.flightMotion.set(0, 0, -traffic.levelFlightSpeed(6 / 45));
  traffic.courseWorldOffset.z = traffic.flightDistanceAt(6);
  traffic.flightRings.forEach(gate => {
    gate.position.add(traffic.courseWorldOffset);
    if (gate.position.z >= 0) gate.userData.resolved = true;
  });
  traffic.resetRingShips(true);
  const regular = traffic.ships.slice(0, 3);
  regular.forEach(ship => traffic.resetShip(ship));
  const targets = [...regular, ...traffic.ringShips.filter(ship => ship.visible)];
  const engagementTime = targets.map(() => 0);
  for (let frame = 1; frame <= 39 * fps; frame++) {
    const dt = 1 / fps, time = 6 + frame * dt;
    traffic.setTime(time); traffic.flightMotion.set(0, 0, -traffic.levelFlightSpeed(time / 45));
    traffic.worldStep.copy(traffic.flightMotion).multiplyScalar(-dt);
    traffic.courseWorldOffset.addScaledVector(traffic.worldStep, .85);
    targets.forEach((ship, index) => {
      traffic.updateShipCourse(ship, dt); traffic.moveShip(ship, dt);
      const depth = -ship.position.z;
      if (depth >= (reducedMotion ? 40 : 150) && depth <= (reducedMotion ? 350 : 1000)) engagementTime[index] += dt;
    });
  }
  engagementTime.forEach((duration, index) => assert.ok(duration >= 3,
    `At least three seconds to engage even a faster passing target: reduced=${reducedMotion}, level=${level}, fps=${fps}, ship=${index}, duration=${duration}`));
}
console.log('PASS catchable distant targets and readable engagement windows for all regular classes and route traffic at low/high speeds');

// A small, nearby finale stays shootable throughout the countdown, including after a long tutorial.
for (const reducedMotion of [false, true]) for (const level of [1, 7, 13]) for (const fps of [5, 60, 144]) for (const offset of [0, 60]) {
  const traffic = makeGame(reducedMotion); traffic.setLevel(level); traffic.setPressure(1 - Math.exp(-(level - 1) / 6)); traffic.setupLevelFleet();
  traffic.setCourseStart(offset); traffic.setTime(offset + 38);
  const activeShips = () => traffic.ships.filter(ship => ship.visible && !ship.userData.type.asteroid && !ship.userData.type.capital);
  activeShips().forEach(ship => traffic.queueShip(ship));
  const planned = new Set(traffic.queue.filter(ship => !ship.userData.type.asteroid)), arrivals = new Set();
  traffic.setTime(offset + 38.49); traffic.updateShipArrivals();
  assert.equal(activeShips().length, 0, 'The finale does not start before its short fade-in lead');
  traffic.setTime(offset + 38.5);
  for (const [setter, inactive] of [['setPaused', true], ['setRoundEnded', true], ['setCrashing', true], ['setStarted', false]]) {
    traffic[setter](inactive); traffic.updateShipArrivals();
    assert.equal(activeShips().length, 0, 'No countdown traffic while inactive');
    traffic[setter](!inactive);
  }
  for (let frame = 0; frame < 6.5 * fps; frame++) {
    const dt = 1 / fps, elapsed = 38.5 + frame * dt;
    traffic.setTime(offset + elapsed); traffic.flightMotion.set(0, 0, -traffic.levelFlightSpeed(elapsed / 45));
    traffic.worldStep.copy(traffic.flightMotion).multiplyScalar(-dt);
    traffic.courseWorldOffset.addScaledVector(traffic.worldStep, .85);
    traffic.updateRingShipArrivals(); traffic.updateShipArrivals();
    assert.ok(activeShips().length <= 2, 'The finale tops up to two, not the larger later-level allowance');
    for (const ship of activeShips()) {
      if (!arrivals.has(ship)) {
        arrivals.add(ship);
        assert.ok(planned.has(ship), 'Reuse a scheduled, level-unlocked regular ship');
        assert.equal(ship.userData.arrivalOpacity, 0, 'Nearby ships fade in instead of popping into view');
        assert.equal(ship.userData.lastVisibleTime, -Infinity);
        assert.equal(traffic.targetInfo(ship), null, 'No target brackets on an invisible arrival');
        assert.ok(ship.position.distanceTo(traffic.camera.position) < (reducedMotion ? 220 : 800));
        assert.ok(ship.userData.previousPosition.equals(ship.position), 'No swept collision from the old distant position');
      }
      traffic.updateShipCourse(ship, dt); traffic.moveShip(ship, dt);
      if (traffic.hasPassedCamera(ship)) traffic.queueShip(ship);
    }
    traffic.camera.updateMatrixWorld();
    if (elapsed >= 40) assert.ok(activeShips().some(ship => traffic.targetInfo(ship)),
      `At least one visible, targetable ship throughout the five-second countdown: reduced=${reducedMotion}, level=${level}, fps=${fps}, elapsed=${elapsed}`);
  }
  assert.equal(arrivals.size, 2, 'Exactly two staggered finale arrivals, not an endless replacement stream');
  activeShips().forEach(ship => traffic.queueShip(ship));
  traffic.setTime(offset + 44.9); traffic.updateShipArrivals();
  assert.equal(activeShips().length, 0, 'Clearing the finale never starts another last-second wave');
  traffic.setTime(0); traffic.setupLevelFleet();
  activeShips().forEach(ship => traffic.queueShip(ship));
  traffic.setTime(38.5); traffic.updateShipArrivals();
  assert.equal(activeShips().length, 1, 'Retry resets the finale budget');
}
for (const level of [1, 13]) {
  const traffic = makeGame(); traffic.setLevel(level); traffic.setupLevelFleet();
  const opening = traffic.ships.filter(ship => ship.visible);
  traffic.setTime(40); traffic.updateShipArrivals();
  assert.deepEqual(traffic.ships.filter(ship => ship.visible && !ship.userData.type.asteroid && !ship.userData.type.capital), opening,
    'Existing ships fill the finale allowance; no extra pair is stacked onto them');
  opening.forEach(ship => traffic.queueShip(ship));
  traffic.setTime(43); traffic.updateShipArrivals();
  assert.equal(traffic.ships.filter(ship => ship.visible && !ship.userData.type.asteroid && !ship.userData.type.capital).length, 0,
    'Do not introduce ships too late to finish fading in and engage');
}
console.log('PASS bounded nearby countdown traffic, full five-second targetability, soft fades, lifecycle guards, tutorial-relative timing and retry reuse');

// Individual passing speeds, with one throttle-varying companion and one steadier companion.
for (const reducedMotion of [false, true]) for (const fps of [5, 60, 144]) {
  const traffic = makeGame(reducedMotion); traffic.setupLevelFleet(); traffic.ringCourse(false);
  const routes = traffic.ringShips.map(ship => ship.userData.ringRoute);
  assert.equal(routes.filter(route => route.throttleAmount > 0).length, 1);
  assert.ok(traffic.ringShips[1].userData.passingSpeed > traffic.ringShips[0].userData.passingSpeed * 1.5,
    'The pair has clearly different passing paces, rather than identical player-matching speed');
  assert.ok(routes.every(route => route.cruiseRatio >= .94 && route.cruiseRatio <= 1.08));
  assert.ok(Math.max(...routes.map(route => route.cruiseRatio)) - Math.min(...routes.map(route => route.cruiseRatio)) > 1e-4,
    'Ships have meaningfully different cruising speeds');
  const samples = routes.map(() => []), forwardSpeed = reducedMotion ? 34 : 340;
  traffic.ringShips.forEach(ship => {
    ship.position.set(0, 0, reducedMotion ? -100 : -500);
    const route = ship.userData.ringRoute;
    route.cruiseSpeed = forwardSpeed - ship.userData.passingSpeed * (2 - route.cruiseRatio);
    ship.userData.courseVelocity.copy(ship.userData.cruiseDirection).multiplyScalar(route.cruiseSpeed);
  });
  for (let frame = 1; frame <= 24 * fps; frame++) {
    const dt = 1 / fps, time = frame * dt;
    traffic.setTime(time);
    traffic.ringShips.forEach((ship, index) => {
      const route = ship.userData.ringRoute, distance = route.distance;
      traffic.flightMotion.copy(ship.userData.cruiseDirection).multiplyScalar(forwardSpeed / .85);
      traffic.updateShipCourse(ship, dt);
      const closingRatio = (forwardSpeed - (route.distance - distance) / dt) / ship.userData.passingSpeed;
      if (time >= 6) samples[index].push(closingRatio);
    });
  }
  samples.forEach((speeds, index) => {
    const min = Math.min(...speeds), max = Math.max(...speeds);
    const baseline = 2 - routes[index].cruiseRatio;
    assert.ok(min > .65 && max < 1.7, 'All ships stay catchable with a bounded relative passing speed');
    if (routes[index].throttleAmount) {
      assert.ok(min < baseline - .12 && max > baseline + .12, 'Active ships visibly throttle down and accelerate');
      const maxStep = Math.max(...speeds.slice(1).map((speed, sample) => Math.abs(speed - speeds[sample])));
      assert.ok(maxStep < .04, `No abrupt speed changes: reduced=${reducedMotion}, fps=${fps}, step=${maxStep}`);
    } else assert.ok(max - min < .01, 'The other companion holds its individual relative cruise pace');
  });
}
console.log('PASS individual passing speeds and smooth independent throttle cycles at 5–144 FPS in both motion modes');

const ringTraffic = makeGame(); ringTraffic.setupLevelFleet(); ringTraffic.resetRingShips();
const runner = ringTraffic.ringShips[0];
for (const [setter, inactive] of [['setPaused', true], ['setRoundEnded', true], ['setCrashing', true], ['setStarted', false]]) {
  const distance = runner.userData.ringRoute.distance, velocity = runner.userData.courseVelocity.clone(), rotation = runner.quaternion.clone();
  ringTraffic[setter](inactive); ringTraffic.updateRingShipCourse(runner, 1);
  assert.equal(runner.userData.ringRoute.distance, distance);
  assert.ok(runner.userData.courseVelocity.equals(velocity) && runner.quaternion.equals(rotation), 'Inactive traffic stays frozen');
  ringTraffic[setter](!inactive);
}
const queueBefore = ringTraffic.queue.length, pool = [...ringTraffic.ringShips];
runner.userData.health = 0; ringTraffic.queueShip(runner);
assert.equal(ringTraffic.queue.length, queueBefore, 'Destroyed course ships do not join ordinary reinforcements');
const retiredDistance = runner.userData.ringRoute.distance;
ringTraffic.updateRingShipCourse(runner, 1);
assert.equal(runner.userData.ringRoute.distance, retiredDistance);
ringTraffic.setTime(20); ringTraffic.updateShipArrivals();
assert.equal(runner.visible, false, 'A destroyed interceptor cannot reappear mid-course');
const allocatedShips = ringTraffic.ships.length;
ringTraffic.setTime(0); ringTraffic.setupLevelFleet();
assert.equal(ringTraffic.ships.length, allocatedShips, 'Retries reuse the same bounded route-ship pool');
assert.deepEqual(ringTraffic.ringShips, pool);
assert.ok(ringTraffic.ringShips.every(ship => !ship.visible && ship.userData.health === ship.userData.type.health && ship.userData.lastVisibleTime === -Infinity),
  'Retry resets the pool but keeps it out of the opening formation');
ringTraffic.flightRings.forEach(gate => { gate.userData.resolved = true; });
ringTraffic.resetRingShips();
assert.ok(ringTraffic.ringShips.every(ship => !ship.visible), 'No route is created when no gates are available');
console.log('PASS ring-traffic lifecycle: pause, intro, crash, results, destruction, no mid-course respawns and bounded retry reuse');

function moveTutorialTarget(game, ship, dt) {
  game.updateShipCourse(ship, dt);
  ship.position.addScaledVector(ship.userData.courseVelocity, dt).addScaledVector(game.flightMotion, -.85 * dt);
}

for (const reducedMotion of [false, true]) for (const aspect of [9 / 16, 16 / 9, 32 / 9]) {
  const entry = makeGame(reducedMotion);
  entry.setupLevelFleet(); entry.beginFlightTutorial();
  entry.camera.aspect = aspect;
  entry.camera.rotation.set(.12, -.2, .06, 'YXZ');
  entry.camera.updateProjectionMatrix(); entry.camera.updateMatrixWorld();
  entry.playerHullRotation.copy(entry.camera.quaternion);
  entry.completeTutorialStep('checkpoint'); entry.setTime(.8); entry.updateFlightTutorial();
  for (const stage of [1, 2]) {
    for (const fps of [5, 30, 60, 144]) {
      entry.flightOrientation.set(.18, -.28, .08, 'YXZ');
      entry.spawnTutorialTarget();
      const ship = entry.ships.find(ship => ship.visible);
      if (stage === 2) {
        assert.equal(ship.userData.arrivalOpacity, 0, 'The nearby ship blends in instead of popping into view');
        moveTutorialTarget(entry, ship, .1);
        assert.ok(ship.userData.arrivalOpacity > 0 && ship.userData.arrivalOpacity < 1);
        entry.resetShip(ship, true);
        assert.equal(ship.userData.arrivalOpacity, 1, 'Reusing a target killed during its fade restores normal opacity');
        entry.spawnTutorialTarget();
      }
      const destination = new THREE.Vector3(0, 0, reducedMotion ? -110 : -200)
        .applyEuler(entry.flightOrientation).add(entry.camera.position);
      const offset = ship.userData.tutorialEntry.clone();
      const duration = reducedMotion ? 3 : 2.4;
      const localOffset = offset.clone().applyQuaternion(new THREE.Quaternion().setFromEuler(entry.flightOrientation).invert());
      assert.ok(Math.abs(localOffset.x) < 1e-8, 'No sideways entrance');
      assert.ok(Math.abs(localOffset.y - (stage === 2 ? (reducedMotion ? 7 : 28) : 0)) < 1e-8,
        'Only the ship has a small downward approach; the asteroid comes straight ahead');
      assert.ok(Math.abs(localOffset.z + (reducedMotion ? 10.5 : 42)) < 1e-8);
      assert.ok(Math.abs(destination.distanceTo(entry.camera.position) - (reducedMotion ? 110 : 200)) < 1e-8, 'Both tutorial targets settle much closer');
      const destinationBearing = destination.clone().sub(entry.camera.position).normalize();
      if (stage === 1) assert.ok(ship.position.clone().sub(entry.camera.position).normalize().distanceTo(destinationBearing) < 1e-8);
      const assertFitsOnScreen = () => {
        ship.updateMatrixWorld(true);
        const bounds = ship.userData.collisionBox;
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          const corner = new THREE.Vector3(x, y, z).applyMatrix4(ship.matrixWorld).project(entry.camera);
          assert.ok(Math.abs(corner.x) < .95 && Math.abs(corner.y) < .95,
            `The larger target must still fit on screen: reduced=${reducedMotion}, aspect=${aspect}, stage=${stage}, corner=${corner.toArray()}`);
        }
      };
      assertFitsOnScreen();
      const advance = seconds => {
        for (let remaining = seconds; remaining > 1e-9;) {
          const dt = Math.min(1 / fps, remaining);
          const previous = ship.position.clone();
          moveTutorialTarget(entry, ship, dt); remaining -= dt;
          assert.equal(entry.crossesPlayer(ship, previous, ship.position), false, 'Closer tutorial targets must still clear the player hull');
        }
      };
      entry.flightMotion.set(80, 30, -350).multiplyScalar(reducedMotion ? .1 : 1);
      advance(duration / 2);
      assert.ok(ship.position.distanceTo(destination.clone().addScaledVector(offset, .5)) < 1e-8,
        'A smooth, frame-rate-independent entrance reaches halfway at half duration');
      const halfway = ship.position.clone().project(entry.camera);
      assert.ok(Math.abs(halfway.x) < .5 && Math.abs(halfway.y) < .5, 'The short trajectory stays near the flight path');
      if (stage === 1) assert.ok(ship.position.clone().sub(entry.camera.position).normalize().distanceTo(destinationBearing) < 1e-8,
        'The asteroid stays on the same straight line throughout its approach');
      if (stage === 2) assert.equal(ship.userData.arrivalOpacity, 1, 'The spawn fade completes well before settling');
      entry.flightOrientation.set(-.2, .3, 0, 'YXZ');
      entry.flightMotion.set(-60, 40, -320).multiplyScalar(reducedMotion ? .1 : 1);
      advance(duration / 2);
      assert.ok(ship.position.distanceTo(destination) < 1e-8, 'Settle at the original shooting position, not the changing heading');
      advance(1);
      assert.ok(ship.position.distanceTo(destination) < 1e-8, 'No overshoot or continued drift after the entrance');
      assertFitsOnScreen();
      assert.equal(entry.tutorialState().stage, stage, 'Entrance motion alone cannot complete a shooting lesson');
    }
    if (stage === 1) {
      entry.queueShip(entry.ships.find(ship => ship.visible)); entry.completeTutorialStep('laser');
      entry.setTime(1.6); entry.updateFlightTutorial();
    }
  }
}
console.log('PASS gentle near-path tutorial trajectories, soft spawn/reuse, no screen-width sweep, stable shooting distance and reduced motion at 5–144 FPS');

for (const reducedMotion of [false, true]) for (const corridor of [false, true]) {
  const lesson = makeGame(reducedMotion);
  lesson.setupLevelFleet(); lesson.ringCourse(corridor, 2);
  const plan = lesson.coursePlan(), runners = [...lesson.ringShips];
  lesson.beginFlightTutorial();
  const queued = [...lesson.queue], boundary = lesson.flightBoundary.position.clone();
  const allocated = lesson.ships.length;
  assert.ok(lesson.ships.every(ship => !ship.visible));
  assert.equal(lesson.flightRings.filter(gate => gate.visible).length, 1);
  lesson.setTime(50); lesson.updateShipArrivals(.1);
  assert.equal(lesson.tutorialState().stage, 0, 'Waiting must not advance the tutorial');
  assert.equal(lesson.hazardPool.length, 0); assert.equal(lesson.showerPool.length, 0);
  assert.ok(lesson.ships.every(ship => !ship.visible), 'No timed enemies or fields leak into the checkpoint lesson');
  lesson.courseWorldOffset.set(-100, 20, 16000);
  lesson.flightRings[0].visible = false; lesson.flightRings[0].userData.resolved = true;
  lesson.flightRings[0].position.set(-100, 20, 400);
  const opening = lesson.flightRings[0].position.clone();
  lesson.completeTutorialStep('checkpoint'); lesson.setTime(50.8); lesson.updateFlightTutorial();
  assert.equal(lesson.tutorialState().stage, 1);
  const target = lesson.ships.find(ship => ship.visible);
  assert.equal(lesson.ships.filter(ship => ship.visible).length, 1);
  assert.equal(target.userData.tutorialTarget, 'laser');
  assert.ok(target.userData.type.asteroid); assert.equal(target.userData.health, 2);
  const position = target.position.clone().sub(target.userData.tutorialEntry);
  lesson.flightMotion.set(100, 20, -300);
  moveTutorialTarget(lesson, target, 3.1);
  assert.ok(target.position.distanceTo(position) < 1e-8, 'Practice target settles into the flight path');
  moveTutorialTarget(lesson, target, .1);
  assert.ok(target.position.distanceTo(position) < 1e-8, 'Practice targets remain at a readable shooting distance after entering');
  lesson.queueShip(target); lesson.completeTutorialStep('laser'); lesson.setTime(51.6); lesson.updateFlightTutorial();
  const ship = lesson.ships.find(ship => ship.visible);
  assert.equal(lesson.tutorialState().stage, 2); assert.ok(!ship.userData.type.asteroid);
  assert.equal(ship.userData.type.name, 'INTERCEPTOR');
  assert.equal(ship.userData.tutorialTarget, 'heavy'); assert.equal(ship.userData.health, 3);
  lesson.queueShip(ship); lesson.completeTutorialStep('heavy'); lesson.setTime(53.1); lesson.updateFlightTutorial();
  assert.equal(lesson.tutorialState().stage, 3); assert.equal(lesson.tutorialState().time, 53.1);
  assert.equal(lesson.tutorialState().courseStartTime, 53.1);
  assert.equal(lesson.tutorialState().completed, true); assert.equal(lesson.shield, 100);
  assert.ok(lesson.courseWorldOffset.equals(new THREE.Vector3(-100, 20, 16000)));
  assert.ok(lesson.flightBoundary.position.equals(boundary), 'The existing boundary is not rebuilt or moved');
  assert.ok(lesson.flightRings[0].position.equals(opening), 'The passed opening checkpoint is never repositioned');
  assert.equal(lesson.flightRings[0].visible, false); assert.equal(lesson.flightRings.at(-1).visible, true);
  assert.equal(lesson.flightRings.filter(gate => !gate.userData.resolved).length, 4, 'Four remaining checkpoints after the training checkpoint');
  assert.ok(lesson.flightRings.slice(1).every(gate => gate.children[0].material.opacity === 0
    && gate.children[1].material.uniforms.brightness.value === 0), 'The remaining checkpoints fade in without a transition flash');
  const continuedPlan = lesson.coursePlan();
  assert.equal(continuedPlan.length, plan.length); assert.equal(continuedPlan.bend, plan.bend);
  assert.equal(continuedPlan.shape, plan.shape, 'No random new field at the transition');
  assert.equal(continuedPlan.start, plan.start + 53.1);
  assert.equal(continuedPlan.end, plan.end + 53.1);
  assert.ok(continuedPlan.origin.equals(plan.origin.clone().add(new THREE.Vector3(0, 0, -16000))));
  assert.deepEqual(lesson.queue, queued, 'Keep the planned fleet, but deploy it gradually');
  assert.deepEqual(lesson.ringShips, runners, 'Reuse the same checkpoint traffic');
  assert.ok(lesson.ships.every(ship => !ship.visible), 'No ship pops in at the handoff; course traffic also waits');
  assert.equal(lesson.ships.length, allocated, 'The tutorial reuses real ships, without growing the fleet');
  assert.ok(lesson.ships.every(ship => !ship.userData.tutorialTarget && !ship.userData.tutorialEntry));

  const handoffOffset = lesson.courseWorldOffset.clone();
  const nextGate = lesson.flightRings.find(gate => !gate.userData.resolved);
  const checkpointDistance = lesson.camera.position.z - nextGate.position.z;
  const advanceToCheckpoint = fraction => {
    const travel = lesson.courseWorldOffset.z - handoffOffset.z;
    lesson.worldStep.set(0, 0, (checkpointDistance * fraction - travel) / .85);
    lesson.courseWorldOffset.addScaledVector(lesson.worldStep, .85);
    lesson.updateFlightRing();
  };
  // Exercise the real movement order on the first continuous frame, including a nonzero world offset.
  lesson.worldStep.set(-5, 2, 15); lesson.courseWorldOffset.addScaledVector(lesson.worldStep, .85);
  const finish = lesson.flightRings.at(-1).position.clone();
  assert.ok(lesson.ringShips.every(ship => !ship.visible), 'The two staggered arrivals come before route traffic');
  lesson.updateFlightRing(.05);
  assert.ok(lesson.flightRings.at(-1).position.distanceTo(finish.addScaledVector(lesson.worldStep, .85)) < 1e-8);
  lesson.setTime(53.59); lesson.updateShipArrivals(.05);
  assert.equal(lesson.queue.length, queued.length, 'No pop-in at the exact handoff');
  const earlyShips = queued.filter(ship => !ship.userData.type.asteroid).slice(0, 2);
  lesson.setTime(55.59); lesson.updateShipArrivals(.05);
  assert.equal(earlyShips[0].visible, false, 'Elapsed time alone must not release the first post-tutorial ship');
  advanceToCheckpoint(1 / 3 - .001); lesson.updateShipArrivals(.05);
  assert.equal(earlyShips[0].visible, false, 'Keep the first third of the checkpoint approach clear');
  advanceToCheckpoint(1 / 3 + .001);
  lesson.flightOrientation.set(.2, -.3, 0, 'YXZ'); // Spawn beside the fixed gate, not along this new heading.
  for (const [slot, ship] of earlyShips.entries()) {
    if (slot > 0) {
      lesson.setTime(55.59 + slot * 3); lesson.updateShipArrivals(.05);
      assert.equal(ship.visible, false, 'The second ship cannot arrive before its three-second gap');
    }
    lesson.setTime(55.6 + slot * 3);
    lesson.setPaused(true); lesson.updateShipArrivals(.05);
    assert.equal(lesson.queue.length, queued.length - slot, 'Pause freezes the post-training arrivals');
    lesson.setPaused(false); lesson.updateShipArrivals(.05);
    assert.equal(lesson.queue.length, queued.length - slot - 1, 'One ship at a time, not a sudden fleet');
    assert.equal(ship.visible, true); assert.equal(ship.userData.arrivalOpacity, 0);
    assertShipInsideBoundary(lesson, ship);
    assert.equal(ship.userData.health, 3, 'Real interceptor health, with no tutorial weapon restriction');
    const offset = ship.position.clone().sub(nextGate.position);
    assert.ok(offset.dot(nextGate.userData.normal) > 0, 'Both ships start before the checkpoint plane, not behind it');
    if (slot === 0) {
      const distance = ship.position.distanceTo(lesson.camera.position);
      assert.ok(distance > (reducedMotion ? 60 : 400) && distance < (reducedMotion ? 190 : 600),
        'The delayed first arrival stays at a readable shooting distance with safe hull clearance');
      assert.ok(distance < nextGate.position.distanceTo(lesson.camera.position),
        'The delayed first ship still arrives before the checkpoint');
    } else {
      assert.ok(offset.length() < (reducedMotion ? 90 : 500), 'The second arrival stays near the next checkpoint');
      assert.ok(Math.abs(offset.dot(ship.userData.courseRight)) > nextGate.userData.radius + (reducedMotion ? 30 : 90),
        'Keep the second silhouette clear of the bright checkpoint rim');
      assert.ok(Math.abs(offset.dot(nextGate.userData.normal) - (reducedMotion ? 70 : 450)) < 1e-8);
    }
    assert.ok(ship.userData.cruiseDirection.equals(nextGate.userData.normal.clone().negate()), 'Follow the checkpoint course, not subsequent player steering');
    assert.equal(lesson.ships.filter(other => other.visible && !other.userData.type.asteroid).length, slot + 1, 'Only these two ships arrive directly after training');
    lesson.recordVisibleObjects();
    assert.equal(ship.userData.lastVisibleTime, -Infinity, 'An invisible arrival cannot deal unseen collision damage');
    assert.equal(lesson.targetInfo(ship), null, 'No brackets over the still-invisible model');
    lesson.updateShipCourse(ship, .6);
    assert.ok(ship.userData.arrivalOpacity > .45 && ship.userData.arrivalOpacity < .55, 'The whole ship fades in smoothly');
    if (slot === 0) assert.ok(lesson.targetInfo(ship), 'The first ship is large enough for immediate targeting once visible');
    lesson.recordVisibleObjects(); assert.equal(ship.userData.lastVisibleTime, 55.6 + slot * 3);
    lesson.updateShipCourse(ship, .6); assert.equal(ship.userData.arrivalOpacity, 1);
  }
  assert.equal(lesson.ships.filter(ship => !ship.userData.scheduledHazard).length, allocated,
    'The two arrivals reuse planned fleet members; independent scheduled hazards keep their own pool');
  lesson.setTime(59.09); lesson.updateRingShipArrivals();
  assert.ok(lesson.ringShips.every(ship => !ship.visible), 'Route traffic waits six active course seconds');
  lesson.setTime(59.1); lesson.updateRingShipArrivals();
  assert.ok(lesson.ringShips.every(ship => !ship.visible), 'The route pair cannot stack onto post-tutorial arrivals');
  lesson.ships.filter(ship => ship.visible && !ship.userData.type.asteroid && !ship.userData.type.capital).forEach(ship => lesson.queueShip(ship));
  const next = lesson.queue[0];
  lesson.setTime(61.59); lesson.updateShipArrivals(.05); assert.equal(next.visible, false);
  lesson.setTime(61.6); lesson.updateShipArrivals(.05); assert.equal(next.visible, true);
  assert.ok(next.position.distanceTo(lesson.camera.position) >= (reducedMotion ? 900 : 3600),
    'Distant rocks keep arriving while ship waves wait');
  lesson.setTime(62.09); lesson.updateRingShipArrivals();
  assert.ok(lesson.ringShips.every(ship => !ship.visible), 'The next pair waits three active seconds');
  lesson.setTime(62.1); lesson.updateRingShipArrivals();
  assert.ok(lesson.ringShips.every(ship => ship.visible && ship.userData.arrivalOpacity === 0));
  assert.ok(lesson.ringShips.every(ship => ship.position.distanceTo(lesson.camera.position) > (reducedMotion ? 150 : 800)));
  lesson.worldStep.set(-5, 2, 15); lesson.courseWorldOffset.addScaledVector(lesson.worldStep, .85);
  for (const ship of lesson.ringShips) {
    const distance = ship.userData.ringRoute.distance;
    lesson.updateShipCourse(ship, .05);
    ship.position.addScaledVector(ship.userData.courseVelocity, .05).addScaledVector(lesson.worldStep, .85);
    assert.ok(ship.position.distanceTo(ship.userData.ringRoute.position.clone().add(lesson.courseWorldOffset)) < 1e-8,
      'Route and rendered position share exactly one world step');
    const cruiseStep = Math.max(lesson.levelFlightSpeed(6 / 45), lesson.flightMotion.length()) * .85 * .05;
    assert.ok(ship.userData.ringRoute.distance - distance <= cruiseStep,
      'Traffic uses current flight speed, not the old elapsed tutorial time');
    assert.ok(ship.userData.arrivalOpacity > 0 && ship.userData.arrivalOpacity < 1);
    ship.traverse(part => {
      if (part.isMesh && !part.userData.engineExhaust) assert.equal(part.material.opacity, ship.userData.arrivalOpacity);
    });
  }
  const continuedRoutes = lesson.ringShips.map(ship => ship.userData.ringRoute);
  lesson.setTime(62.2); lesson.updateRingShipArrivals();
  lesson.ringShips.forEach((ship, index) => assert.equal(ship.userData.ringRoute, continuedRoutes[index], 'The delayed course traffic deploys only once'));
  lesson.setLevel(2); lesson.setTime(0); lesson.setupLevelFleet(); lesson.beginFlightTutorial();
  assert.equal(lesson.tutorialState().stage, 3, 'Completed training is skipped on the next run');
  assert.equal(lesson.flightRings[0].visible, true, 'Ordinary levels still start with a checkpoint');
  assert.equal(lesson.ships.filter(ship => ship.visible).length, 2, 'Level two retains its two-ship opening after training');
  const levelTwoArrival = lesson.queue[0]; lesson.setTime(3); lesson.updateShipArrivals(.05);
  assert.equal(levelTwoArrival.visible, true);
  assert.ok(levelTwoArrival.position.distanceTo(lesson.camera.position) >= (reducedMotion ? 900 : 3600),
    'The nearby post-tutorial arrivals do not repeat in level two');
}
console.log('PASS real guided targets, seamless handoff, two staggered checkpoint arrivals, soft fades, model reuse and ordinary level-two arrivals');

// Production already has the intro boss in the pool before gameplay setup.
const previewCode = code.replace('      const fleetOrder =', '      createShip(ships.length, 4);\n      const fleetOrder =');
const preview = new Function('THREE', 'Math', 'random', 'reducedMotion', 'crossingDanger', 't', previewCode)(
  THREE, math, (a, b) => a + math.random() * (b - a), false, null, t);
const previewBoss = preview.capital;
assert.ok(previewBoss?.userData.type.capital);
assert.equal(previewBoss.scale.x, 6, 'The preview uses the full gameplay model scale');
for (const level of [1, 3, 4, 5, 8]) {
  preview.setLevel(level); preview.setTime(0); preview.setupLevelFleet();
  assert.equal(previewBoss.visible, false, 'Hide the menu boss until its scheduled encounter');
  assert.ok(!preview.queue.includes(previewBoss), 'The menu boss must not enter the regular fleet');
  preview.setTime(6); preview.updateShipArrivals();
  assert.equal(previewBoss.visible, level % 4 === 0);
  assert.equal(preview.capital, previewBoss, 'Reuse the exact preview model');
  assert.equal(preview.ships.filter(ship => ship.userData.type.capital).length, 1);
  if (level % 4 === 0) {
    assert.equal(previewBoss.userData.health, 60);
    assert.equal(previewBoss.scale.x, 6, 'Keep the full model scale when moving from preview to combat');
  }
}
console.log('PASS intro boss reuse, no early-level boss leak, scheduled encounters and restored armor');
