// Run from the project root: node tests/flight-environments.mjs
import assert from 'node:assert/strict';
import { THREE, source, section, randomState, makeGame, makeFlightClock, assertShipInsideBoundary, moveRock } from './helpers/flight-game.mjs';

// Reinforcements enter from far ahead, never as nearby diagonal ambushes.
for (const reducedMotion of [false, true]) {
  const arrivals = makeGame(reducedMotion);
  arrivals.camera.position.set(20, -10, 5);
  arrivals.flightOrientation.set(.2, -.4, 0, 'YXZ');
  arrivals.flightMotion.set(0, 0, -400).applyEuler(arrivals.flightOrientation);
  for (const ship of arrivals.ships.slice(0, 3)) {
    for (let sample = 0; sample < 30; sample++) {
      arrivals.resetShip(ship);
      const data = ship.userData;
      assert.ok(ship.position.distanceTo(arrivals.camera.position) >= (reducedMotion ? 1200 : 3800) - 1e-8,
        'Bringing angled arrivals inside the shield must preserve their distant fade');
      assert.ok(ship.position.z < arrivals.camera.position.z, 'Arrivals remain ahead along the protected course');
      assertShipInsideBoundary(arrivals, ship);
      assert.ok(data.previousPosition.equals(ship.position), 'Reuse must not cause a swept teleport');
      assert.equal(data.courseVelocity.length(), 0, 'Far traffic must approach before matching player speed');
      assert.equal(data.health, data.type.health);
      ship.traverse(part => {
        if (!part.isMesh || part.userData.engineExhaust) return;
        assert.equal(part.material.onBeforeCompile, arrivals.fadeShipShader, 'Every hull panel and engine core must fade at distance');
        assert.equal(part.material.alphaHash, true);
        assert.equal(part.material.transparent, false);
        assert.equal(part.material.depthWrite, true);
      });
      for (const flame of data.flames) {
        assert.equal(flame.material.opacity, 0, 'No engine glow may reveal a distant spawn');
        assert.ok(flame.userData.plume.children.every(ribbon => ribbon.material.opacity === 0));
      }
      arrivals.camera.updateMatrixWorld();
      ship.position.copy(arrivals.camera.position).addScaledVector(data.cruiseDirection, reducedMotion ? 1050 : 3100);
      assert.equal(arrivals.targetInfo(ship), null, 'Target brackets must not reveal still-fading arrivals');
      ship.position.copy(arrivals.camera.position).addScaledVector(data.cruiseDirection, 500);
      assert.ok(arrivals.targetInfo(ship), 'Nearby traffic must remain targetable');
      arrivals.updateEngineVisuals(ship);
      assert.ok(data.flames.every(flame => flame.material.opacity > 0), 'Nearby engines must remain visible');
    }
    arrivals.resetShip(ship, true);
    assert.ok(ship.position.z > -1200, 'Keep the two opening targets and intro formation');
  }
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  arrivals.fadeShipShader(shader);
  assert.ok(shader.fragmentShader.includes(reducedMotion ? 'smoothstep(900.0, 1200.0' : 'smoothstep(2600.0, 3600.0'));
}
console.log('PASS distant forward arrivals, heading/translation, whole-model fades, hidden spawn glows and unchanged opening formation');

for (const reducedMotion of [false, true]) {
  for (const level of [1, 7]) for (const fps of [5, 60, 144]) for (const aspect of [390 / 844, 16 / 9]) {
    // Compare the same traffic across frame rates, independent of earlier debris counts.
    randomState.seed = 12345;
    const flight = makeGame(reducedMotion);
    flight.setLevel(level); flight.setPressure(1 - Math.exp(-(level - 1) / 4));
    flight.flightMotion.set(0, 0, -flight.levelFlightSpeed(0));
    flight.camera.aspect = aspect; flight.camera.updateProjectionMatrix();
    const traffic = flight.ships.slice(0, 3);
    traffic.forEach(ship => flight.resetShip(ship));
    const entered = new Set(), seenAt = new Map();
    let time = 0;
    const clock = makeFlightClock(THREE, flight, reducedMotion, dt => {
      time += dt; flight.setTime(time);
      clock.move(dt, time / 45);
      for (const ship of traffic) {
        flight.updateShipCourse(ship, dt);
        ship.position.addScaledVector(flight.flightMotion, -.85 * dt).addScaledVector(ship.userData.courseVelocity, dt);
        const data = ship.userData, depth = -ship.position.z;
        if (depth <= 180) continue; // Final passes intentionally stop lane correction.
        assert.ok(Math.abs(ship.position.x - data.lane) <= 60, 'Cruising should stay near its original lane, including inertial overshoot');
        assert.ok(Math.abs(ship.position.y - data.height) <= 27, 'Vertical course changes must stay gentle, including inertial overshoot');
        assert.ok(Math.abs(data.courseVelocity.x) <= (reducedMotion ? 9 : 35));
      }
    });
    for (let frame = 0; frame < fps * 40; frame++) {
      clock.frame(1 / fps);
      for (const ship of traffic) {
        const depth = -ship.position.z;
        if (depth < (reducedMotion ? 900 : 2600) && !seenAt.has(ship)) seenAt.set(ship, time);
        if (depth < (reducedMotion ? 350 : 1100) && !entered.has(ship)) {
          entered.add(ship);
          assert.ok(time - seenAt.get(ship) > 3 * (reducedMotion ? 1 : 1.15 / 1.86),
            'Preserve the visible approach distance while traversing it at the faster cruise speed');
        }
      }
      if (entered.size === traffic.length) break;
    }
    assert.equal(entered.size, traffic.length,
      `Distant arrivals must reach the playable area within a level (level=${level}, fps=${fps}, reduced=${reducedMotion}, aspect=${aspect})`);
  }
}
console.log('PASS mostly straight, gradual approaches within the level at 5–144 FPS, portrait/landscape and reduced motion');


for (const reducedMotion of [false, true]) {
  const confined = makeGame(reducedMotion);
  confined.setLevel(4); confined.setupLevelFleet();
  const traffic = [...confined.ships.slice(0, 3), confined.capital];
  for (const ship of traffic) for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    confined.resetShip(ship, true);
    confined.courseWorldOffset.set(420, -170, 900);
    confined.flightBoundaryOrigin.set(30, -20, 40);
    ship.position.copy(confined.flightBoundaryOrigin).add(confined.courseWorldOffset)
      .add(new THREE.Vector3(Math.cos(angle) * confined.flightBoundaryRadii.x * .98,
        Math.sin(angle) * confined.flightBoundaryRadii.y * .98, -800));
    ship.quaternion.setFromEuler(new THREE.Euler(.2, -.35, .15));
    ship.userData.courseVelocity.set(Math.cos(angle) * 4000, Math.sin(angle) * 4000, -400);
    const depth = ship.position.z, health = ship.userData.health;
    // Include a large step, shared sideways world motion and a non-zero course origin.
    confined.worldStep.set(-80, 40, 100);
    confined.courseWorldOffset.addScaledVector(confined.worldStep, .85);
    confined.moveShip(ship, .2);
    assertShipInsideBoundary(confined, ship);
    assert.equal(ship.position.z, depth + 85 - 80, 'Containment must preserve forward travel');
    assert.equal(ship.userData.courseVelocity.z, -400);
    assert.equal(ship.userData.health, health, 'NPC boundary contact does not damage ships');
    assert.equal(confined.shield, 100, 'NPC boundary contact must not damage the player');
  }
}
console.log('PASS whole-hull fleet containment on every shield face, high-speed movement and shared world offsets');

for (const reducedMotion of [false, true]) {
  const confined = makeGame(reducedMotion);
  confined.setLevel(4); confined.setupLevelFleet();
  confined.courseWorldOffset.set(100, -70, 600);
  for (const ship of [...confined.ships.slice(0, 3), confined.capital]) {
    for (const pitch of [-Math.PI / 4, 0, Math.PI / 4]) for (const yaw of [-65, 0, 65]) {
      confined.flightOrientation.set(pitch, yaw * Math.PI / 180, 0, 'YXZ');
      confined.resetShip(ship);
      assertShipInsideBoundary(confined, ship);
      assert.ok(ship.userData.previousPosition.equals(ship.position), 'Constrain arrivals before recording collision history');
      assert.ok(ship.position.distanceTo(confined.camera.position) >= (reducedMotion ? 1200 : 3800),
        'Even sharply turned arrivals stay beyond the fade, including the full-size dreadnought');
      for (let step = 0; step < 120; step++) {
        if (ship.userData.type.capital) confined.updateCapitalShip(ship, 1 / 60);
        else confined.updateShipCourse(ship, 1 / 60);
        confined.moveShip(ship, 1 / 60);
        assertShipInsideBoundary(confined, ship);
      }
    }
  }
  confined.resetRingShips();
  const runner = confined.ringShips[0], route = runner.userData.ringRoute;
  // Force a route beyond the wall to cover spline overshoot and corrected route bookkeeping.
  route.curve.points.forEach(point => { point.x += confined.flightBoundaryRadii.x * 2; });
  for (let step = 0; step < 120; step++) {
    confined.worldStep.set(-2, 1, 5);
    confined.courseWorldOffset.addScaledVector(confined.worldStep, .85);
    confined.updateShipCourse(runner, 1 / 60); confined.moveShip(runner, 1 / 60);
    assertShipInsideBoundary(confined, runner);
    assert.ok(runner.position.clone().sub(confined.courseWorldOffset).distanceTo(route.position) < 1e-8,
      'Constrained route traffic must retain the actual course-space position without accumulating drift');
  }
  const ship = confined.ships[0];
  ship.position.set(10000, 10000, -500); ship.userData.courseVelocity.set(50, 50, -400);
  for (const [setter, inactive] of [['setPaused', true], ['setRoundEnded', true], ['setCrashing', true], ['setStarted', false]]) {
    const position = ship.position.clone(), velocity = ship.userData.courseVelocity.clone();
    confined[setter](inactive); confined.constrainShipToBoundary(ship);
    assert.ok(ship.position.equals(position) && ship.userData.courseVelocity.equals(velocity), 'Inactive states must not constrain ships');
    confined[setter](!inactive);
  }
  const rock = confined.ships[4]; rock.visible = true; rock.position.copy(ship.position);
  confined.constrainShipToBoundary(rock);
  assert.ok(rock.position.equals(ship.position), 'Asteroid streams and corridors are not confined by the NPC shield');
}
console.log('PASS extreme-heading arrivals, sustained NPC maneuvers, reduced-motion dreadnought clearance and lifecycle isolation');

const pacing = makeGame(); pacing.setLevel(4); pacing.setupLevelFleet();
for (const [start, end] of [[10, 15], [28, 33]]) {
  assert.equal(pacing.encounterRest(start - .01), false);
  assert.equal(pacing.encounterRest(start), true);
  assert.equal(pacing.encounterRest(end), false);
  const queueLength = pacing.queue.length;
  const existing = pacing.ships.filter(ship => ship.visible && !ship.userData.shower);
  for (const time of [start, end - .01]) {
    pacing.setTime(time); pacing.updateShipArrivals();
    assert.equal(pacing.queue.length, queueLength, 'Reinforcements should wait through the breather');
    assert.ok(existing.every(ship => ship.visible), 'Pacing must not remove existing visible threats');
  }
  pacing.setTime(end); pacing.updateShipArrivals();
  assert.equal(pacing.queue.length, queueLength - 1, 'Resume with one arrival, not a catch-up wave');
  pacing.updateShipArrivals();
  assert.equal(pacing.queue.length, queueLength - 1);
}
pacing.resetShip(pacing.capital); pacing.clearEnemyBolts();
pacing.capital.position.set(0, -50, -1500);
pacing.capital.userData.fireCooldown = 0; pacing.capital.userData.lastVisibleTime = 12;
pacing.setTime(12); pacing.updateCapitalShip(pacing.capital, 1 / 60);
assert.equal(pacing.enemyBolts.length, 0, 'The boss also holds new volleys during a breather');
assert.ok(pacing.capital.userData.fireCooldown >= .7, 'Resuming must leave a readable charging period');
pacing.setTime(15); pacing.capital.userData.lastVisibleTime = 15;
pacing.updateCapitalShip(pacing.capital, 1 / 60);
assert.equal(pacing.enemyBolts.length, 0);
console.log('PASS reinforcement breaks, existing-threat continuity, single arrivals and fair boss-volley resumption');

for (const reducedMotion of [false, true]) {
  const bends = makeGame(reducedMotion);
  for (const level of [1, 20]) for (const shape of [1, 2]) for (const sign of [-1, 1]) {
    bends.setLevel(level); bends.setupLevelFleet();
    const field = bends.shower(true, 2, shape, sign);
    assert.equal(Math.abs(bends.corridorCenter(0)), 0, 'Keep a straight, readable entry');
    assert.ok(Math.abs(bends.corridorCenter(field.length * .5)) > field.gap * (reducedMotion ? .2 : .5));
    assert.ok(Math.abs(bends.corridorCenter(field.length) - (shape === 1 ? 0 : field.bend)) < 1e-8);
    assert.ok(Math.abs(field.bend) <= field.gap * (reducedMotion ? .45 : 1.15) + 1e-8);
    const inverse = field.rotation.clone().invert();
    for (let slice = 0; slice < 7; slice++) {
      if (slice) {
        bends.worldStep.set(0, 0, field.length / 6 / .85);
        for (const rock of field.pool.filter(rock => rock.visible)) {
          rock.position.addScaledVector(bends.worldStep, .85);
          if (bends.hasPassedCamera(rock)) bends.queueShip(rock);
        }
        bends.updateAsteroidShower();
      }
      for (const rock of field.pool.filter(rock => rock.visible)) {
        const local = rock.position.clone().sub(field.origin).applyQuaternion(inverse);
        const radius = rock.userData.type.radius * rock.scale.x;
        const offset = Math.abs(local.y - bends.corridorCenter(-local.z));
        if (rock.userData.corridorObstacle) {
          assert.ok(offset <= field.gap * .35 + 1e-7, 'Interior hazards must stay in the curved flight passage');
          assert.ok(Math.abs(local.x) + radius + 40 < field.width / 2, 'Natural groups leave lateral escape routes');
          if (reducedMotion) assert.ok(offset + radius <= field.gap - 4 + 1e-7, 'Reduced-motion obstacles stay small');
        } else {
          assert.ok(offset - radius >= field.gap - 1e-7, 'Both curved walls must retain the full narrow passage');
        }
        assert.ok(rock.userData.courseVelocity.equals(field.velocity), 'A bent layout keeps its shared stream, never following the player');
      }
    }
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    for (let i = 0; i < field.grit.count; i += 47) {
      field.grit.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
      assert.ok(Math.abs(position.y - bends.corridorCenter(-position.z)) - Math.max(scale.x, scale.y, scale.z) >= field.gap + 6 - 1e-4,
        'Both dense ring layers must follow the curve without covering the narrow opening');
    }
    const center = bends.corridorCenter(field.length * .5);
    bends.flightOrientation.set(.3, -.6, 0); bends.target.set(1, 1); bends.worldStep.set(0, 0, 0);
    bends.updateAsteroidShower();
    assert.equal(bends.corridorCenter(field.length * .5), center, 'The planned bend must not retarget steering');
    bends.flightOrientation.set(0, 0, 0);
  }
}
console.log('PASS fixed arcing/offset corridors, coherent background geometry, full-length clearance and gentler reduced-motion bends');

const passageTiers = new Set(), passageScales = new Set();
let passageCount = 0, centerThreats = 0, scatteredObstacles = 0, oversizedWalls = 0, slalomGroups = 0;
const laterLanes = new Set();
for (const reducedMotion of [false, true]) for (const level of [1, 4, 5, 20]) for (const shape of [0, 1, 2]) for (const strength of [0, 1, 2]) {
  const hazards = makeGame(reducedMotion), speed = reducedMotion ? 40 : 400;
  hazards.flightMotion.set(0, 0, -speed);
  hazards.setLevel(level); hazards.setupLevelFleet();
  const field = hazards.shower(true, strength, shape);
  const approachSpeed = field.length / (field.end - field.entry);
  const lead = hazards.flightDistanceAt(field.entry);
  assert.ok(field.pool.every(rock => !rock.userData.corridorObstacle), 'Leave the first entry slice clear');
  assert.equal(field.obstacleSpacing, Math.max(260, approachSpeed * (reducedMotion ? 3.6 : [2.2, 1.8, 1.5][strength]) * (level >= 5 ? .5 : 1)));
  for (const rock of field.pool.filter(rock => rock.visible)) {
    const baseScale = [.35, 1.3, 2.8][rock.userData.asteroidTier - 1];
    assert.ok(rock.scale.x >= baseScale * .75 && rock.scale.x <= baseScale * 1.35);
    if (rock.scale.x > 2.8) oversizedWalls++;
  }
  const slalom = level >= 5 && !reducedMotion;
  let count = 0, boulders = 0, groups = 0, lastDepth = -Infinity;
  for (let travel = 100; travel <= lead + field.length + 300; travel += 100) {
    // These are fixed field rocks, not targeted reinforcements: the formation survives breathers.
    hazards.setTime(12);
    hazards.worldStep.copy(field.direction).multiplyScalar(-100 / .85);
    for (const rock of field.pool.filter(rock => rock.visible)) {
      rock.position.addScaledVector(hazards.worldStep, .85);
      if (hazards.hasPassedCamera(rock)) hazards.queueShip(rock);
    }
    hazards.updateAsteroidShower();
    const spawned = field.pool.filter(rock => rock.visible && rock.userData.corridorObstacle && rock.userData.courseAge === 0);
    assert.ok(spawned.length <= (slalom ? 6 : 1), 'Loose clusters stay small, never full-width walls');
    spawned.sort((a, b) => a.position.dot(field.direction) - b.position.dot(field.direction));
    if (slalom && spawned.length) {
      assert.equal(spawned.length, 6, 'Each cluster contains six mixed-size rocks');
      groups++; slalomGroups++;
      const points = spawned.map(rock => rock.position.clone().sub(field.origin).applyQuaternion(field.rotation.clone().invert()));
      assert.ok(points.every(point => Math.abs(point.x) <= 420), 'Keep clusters inside the corridor, not edge-to-edge');
      assert.ok(points.at(-1).z < points[0].z - 20, 'Clusters have depth rather than forming a flat row');
      assert.equal(new Set(spawned.map(rock => rock.userData.asteroidTier)).size, 3, 'Every cluster mixes small, medium and large rocks');
    }
    for (const [index, rock] of spawned.entries()) {
      count++;
      if (rock.scale.x === 5) {
        boulders++;
        assert.equal(rock.userData.asteroidTier, 3);
        assert.equal(rock.userData.health, 5, 'Landmark-sized boulders stay shootable with five normal hits');
      }
      const local = rock.position.clone().sub(field.origin).applyQuaternion(field.rotation.clone().invert());
      const radius = rock.userData.type.radius * rock.scale.x;
      assert.ok(-local.z - lastDepth >= (index > 0 ? 0 : field.obstacleSpacing * .9) - 1e-7, 'Keep shallow depth separation within groups and recovery room between them');
      lastDepth = -local.z;
      const offsetY = local.y - hazards.corridorCenter(-local.z);
      const laneWidth = level >= 5 ? (reducedMotion ? 90 : 420) : (reducedMotion ? 30 : 100);
      assert.ok(Math.abs(local.x) <= laneWidth, 'Keep obstacles inside the lateral corridor lanes');
      if (level >= 5 && !reducedMotion) laterLanes.add(Math.abs(local.x) < 100 ? 0 : Math.sign(local.x));
      assert.ok(Math.abs(offsetY) <= field.gap * .35 + 1e-7);
      if (reducedMotion) assert.ok(Math.abs(offsetY) + radius <= field.gap - 4 + 1e-7);
      else {
        passageCount++; passageTiers.add(rock.userData.asteroidTier); passageScales.add(rock.scale.x.toFixed(2));
        if (Math.abs(local.x) > 30) scatteredObstacles++;
        if (hazards.crossesPlayer(rock, new THREE.Vector3(local.x, offsetY, -100), new THREE.Vector3(local.x, offsetY, 100))) centerThreats++;
      }
      assert.ok(rock.position.distanceTo(hazards.camera.position) >= lead - 100, 'No nearby pop-in: interior rocks get the same distant lead as the walls');
      assert.ok(rock.userData.previousPosition.equals(rock.position), 'Placement must not create a swept teleport');
      assert.ok(rock.userData.courseVelocity.equals(field.velocity), 'Interior rocks travel with the walls, never homing toward the pilot');
      assert.equal(rock.userData.health, Math.max(rock.userData.asteroidTier, Math.ceil(rock.scale.x)));
      assert.ok(rock.userData.asteroidTier <= (reducedMotion ? 1 : 3));
      assert.ok(radius <= (reducedMotion ? .35 : level >= 5 ? 5 : 2.8 * 1.2) * rock.userData.type.radius + 1e-8, 'Keep even the largest passage boulders dodgeable');
      assert.ok(hazards.ships.includes(rock) && rock.userData.collisionParts.length > 0, 'Gap rocks must use the real shooting/collision pipeline');
      const position = rock.position.clone();
      hazards.updateShipCourse(rock, .3);
      rock.position.set(0, 0, -100); hazards.camera.updateMatrixWorld();
      assert.ok(hazards.targetInfo(rock), 'A close interior rock must be shootable, not decorative');
      assert.ok(hazards.crossesPlayer(rock, new THREE.Vector3(0, 0, -100), new THREE.Vector3(0, 0, 100)), 'Flying into a gap rock must hit its actual hull');
      const dodge = radius + 30;
      for (const side of [-1, 1]) {
        assert.equal(hazards.crossesPlayer(rock, new THREE.Vector3(side * dodge, 0, -100), new THREE.Vector3(side * dodge, 0, 100)), false,
          'Both lateral dodges must remain clear, including around large passage boulders');
      }
      rock.position.copy(position);
    }
  }
  // Each scheduled hazard can wait up to one full randomized wall-slice step.
  const fittingObstacles = field.length > field.spacing * 2.4 + field.obstacleSpacing * 1.2 ? 2 : field.length > field.spacing * 1.2 ? 1 : 0;
  assert.ok(count >= fittingObstacles, `Place every obstacle that fits before the guaranteed finish: level=${level}, reduced=${reducedMotion}, shape=${shape}, strength=${strength}, count=${count}, expected=${fittingObstacles}, length=${field.length}, spacing=${field.spacing}, obstacles=${field.obstacleSpacing}`);
  if (slalom) { assert.equal(groups, 3); assert.equal(count, 18, 'Three natural clusters replace random obstacles, without extras'); }
  assert.equal(boulders, slalom ? 2 : 0, 'Retain two landmark-sized boulders among the mixed-size clusters');
  assert.ok(field.pool.length <= hazards.maxShowerRocks, 'Clusters share the original bounded pool without an extra allowance');
  const nextObstacle = hazards.nextShowerObstacle, origin = field.origin.clone();
  hazards.setPaused(true); hazards.updateAsteroidShower();
  assert.equal(hazards.nextShowerObstacle, nextObstacle);
  assert.ok(field.origin.equals(origin), 'Pause freezes obstacle placement and the field');
  hazards.setPaused(false); hazards.setupLevelFleet();
  assert.equal(hazards.nextShowerObstacle, hazards.showerSpacing, 'Retry preplans the next encounter with fresh obstacle state');
  const free = hazards.shower(false, strength);
  assert.ok(free.pool.filter(rock => rock.visible).every(rock => !rock.userData.corridorObstacle), 'Pooled rocks must clear corridor roles when reused in free showers');
}
assert.deepEqual([...passageTiers].sort(), [1, 2, 3], 'Passage hazards must include small, medium and large rocks');
assert.ok(passageScales.size > 30 && oversizedWalls > 20, 'Both the passage and walls need noticeable size variety');
assert.ok(centerThreats > 0, 'Some natural obstacles still intersect the center lane');
assert.ok(slalomGroups > 0, 'Later corridors actually generate loose clusters');
assert.deepEqual([...laterLanes].sort(), [-1, 0, 1], 'Later obstacles span the left, middle and right of the passage, not a centerline queue');
assert.ok(scatteredObstacles > passageCount * .15, 'Not every obstacle should line up in the central lane');
console.log('PASS varied small/medium/large passage hazards, larger walls, real central threats, lateral dodges, distant lead, pause and reuse');

for (const reducedMotion of [false, true]) for (const corridor of [false, true]) {
  const motion = makeGame(reducedMotion);
  motion.setupLevelFleet(); motion.flightOrientation.set(.2, -.4, 0, 'YXZ');
  const inverse = new THREE.Quaternion(); // Field axes belong to the fixed course, not the player's turn.
  const field = motion.shower(corridor, 2);
  const stream = field.velocity.clone().applyQuaternion(inverse);
  const streamSpeed = corridor ? 0 : Math.max(reducedMotion ? 50 : 220, motion.levelFlightSpeed(field.entry / 45) * .85 * .9);
  assert.ok(Math.abs(stream.length() - streamSpeed) < 1e-8);
  if (!corridor) {
    if (Math.abs(stream.x) > 1e-8) assert.ok(Math.hypot(stream.x, stream.y) > streamSpeed * .8, 'Side streams keep their strong transverse motion');
    else assert.ok(stream.z > 0 && Math.abs(Math.abs(stream.y) / stream.z - .2) < 1e-8, 'Above/below streams approach from ahead at a shallow angle');
  }
  const spinSigns = [0, 0, 0, 0, 0, 0], speedRatios = [];
  let moving = 0, rotating = 0, slowMoving = 0, fastMoving = 0;
  // The player changes heading; newly released rocks must still use the original field axes.
  motion.flightOrientation.set(-.5, .8, 0, 'YXZ');
  for (let sample = 0; sample < 240; sample++) {
    const rock = motion.eventAsteroid(), data = rock.userData;
    const local = data.courseVelocity.clone().applyQuaternion(inverse);
    const rotates = !reducedMotion && data.courseVelocity.lengthSq() > 25;
    if (local.lengthSq() > 0) moving++;
    if (corridor) {
      assert.equal(data.courseVelocity.lengthSq(), 0, 'Corridor walls and obstacles must not inherit rain movement');
    } else {
      const ratio = local.length() / stream.length();
      speedRatios.push(ratio);
      assert.ok(local.clone().normalize().dot(stream.clone().normalize()) > 1 - 1e-12, 'Rain rocks share one direction');
      assert.ok(ratio >= .9 - 1e-8 && ratio <= 1.1 + 1e-8, 'Free rocks vary speed by at most ten percent');
    }
    for (const axis of [0, 1, 2]) {
      assert.ok(Math.abs(local.getComponent(axis)) <= streamSpeed * 1.1 + 1e-8, 'Speed variation stays bounded');
      const spin = data.spin.getComponent(axis);
      if (spin && rotates) spinSigns[axis * 2 + (spin > 0 ? 1 : 0)]++;
    }
    const spin = data.spin.length();
    assert.ok(reducedMotion ? spin === 0 : spin >= .04 - 1e-8 && spin <= .6 + 1e-8,
      'Potential tumbling rates must remain varied across pool reuse');
    const rotation = rock.quaternion.clone();
    moveRock(rock, 1, false, reducedMotion);
    assert.equal(!rock.quaternion.equals(rotation), rotates,
      'Tumbling follows actual drift speed and respects reduced motion');
    if (rotates) {
      rotating++;
      assert.ok(spin > 0, 'Noticeably drifting rocks must also rotate');
      if (spin < .14) slowMoving++;
      if (spin > .35) fastMoving++;
    }
    assert.notEqual(data.spin, motion.ships[4].userData.spin, 'Shared geometry must not share mutable spin vectors');
    const velocity = data.courseVelocity.clone();
    motion.target.set(-1, 1); motion.updateShipCourse(rock, .5);
    assert.ok(data.courseVelocity.equals(velocity), 'Drift must not follow later steering');
    motion.queueShip(rock);
  }
  assert.equal(moving, corridor ? 0 : 240, 'Only free showers stream; corridor rocks stay fixed');
  if (!corridor) assert.ok(Math.min(...speedRatios) < .95 && Math.max(...speedRatios) > 1.05, 'Retain subtle speed variation in free showers');
  if (!reducedMotion && !corridor) {
    assert.ok(slowMoving > rotating * .1 && fastMoving > rotating * .3,
      'Rotating rocks retain a noticeable mix of slow turns and faster tumbling');
    assert.ok(spinSigns.every(count => count > 40), 'Actively tumbling rocks need varied axes');
  }

  const rock = field.pool.find(rock => rock.visible && (corridor || reducedMotion || rock.userData.courseVelocity.lengthSq() > 25));
  const position = rock.position.clone(), rotation = rock.rotation.clone();
  let reference;
  for (const fps of [5, 30, 60, 144]) {
    rock.position.copy(position); rock.rotation.copy(rotation);
    for (let frame = 0; frame < fps * 4; frame++) moveRock(rock, 1 / fps, false, reducedMotion);
    const expected = position.clone().addScaledVector(rock.userData.courseVelocity, 4);
    assert.ok(rock.position.distanceTo(expected) < 1e-8, 'The rendered rock must actually travel with its assigned velocity');
    if (!reference) reference = { position: rock.position.clone(), quaternion: rock.quaternion.clone() };
    assert.ok(rock.position.distanceTo(reference.position) < 1e-8 && rock.quaternion.angleTo(reference.quaternion) < 1e-7,
      'Drift and tumbling must be frame-rate independent');
  }
  assert.equal(rock.quaternion.angleTo(new THREE.Quaternion().setFromEuler(rotation)) > 1e-4,
    !reducedMotion && rock.userData.courseVelocity.lengthSq() > 25,
    'Actual tumbling requires noticeable drift, never camera-relative travel alone');
  const pausedPosition = rock.position.clone(), pausedRotation = rock.quaternion.clone();
  moveRock(rock, 5, true, reducedMotion);
  assert.ok(rock.position.equals(pausedPosition) && rock.quaternion.equals(pausedRotation), 'Pause freezes drift and rotation together');

  motion.setupLevelFleet();
  const nextField = motion.shower(!corridor, 2), reused = nextField.pool.filter(rock => rock.visible);
  if (!corridor) {
    assert.equal(nextField.velocity.lengthSq(), 0, 'Switching to the corridor clears the previous stream');
    assert.ok(reused.every(rock => rock.userData.courseVelocity.lengthSq() === 0), 'Reused rain rocks become stationary corridor rocks');
  }
  else assert.ok(reused.every(rock => rock.userData.courseVelocity.clone().normalize().dot(nextField.velocity.clone().normalize()) > 1 - 1e-12), 'Reused corridor rocks must join the new free-shower stream');
  for (const rock of reused) {
    const rotation = rock.quaternion.clone();
    moveRock(rock, 1, false, reducedMotion);
    assert.equal(!rock.quaternion.equals(rotation), !reducedMotion && rock.userData.courseVelocity.lengthSq() > 25,
      'Pool reuse must apply the new drift speed, not the previous field’s rotation behavior');
  }
}

const game = makeGame();
const driftRock = game.ships[4];
driftRock.userData.spin.set(.1, -.2, .3);
for (const reducedMotion of [false, true]) for (const paused of [false, true]) {
  for (const fps of [5, 30, 60, 144]) for (const speed of [0, .1, 4.99, 5, 5.01, 12]) {
    for (const direction of [[1, 0, 0], [0, -1, 0], [0, 0, 1], [.6, .8, 0]]) {
      driftRock.position.set(0, 0, 0); driftRock.rotation.set(.2, -.3, .1);
      driftRock.userData.courseVelocity.set(...direction).multiplyScalar(speed);
      const rotation = driftRock.quaternion.clone();
      for (let frame = 0; frame < fps * 4; frame++) moveRock(driftRock, 1 / fps, paused, reducedMotion);
      assert.equal(!driftRock.quaternion.equals(rotation), speed > 5 && !paused && !reducedMotion,
        'Rotation cutoff must include exactly 5 units/s, in every direction and at every frame rate');
      const expected = driftRock.userData.courseVelocity.clone().multiplyScalar(paused ? 0 : 4);
      assert.ok(driftRock.position.distanceTo(expected) < 1e-8, 'The rotation cutoff must not alter drift');
    }
  }
}
console.log('PASS coherent shower drift, subtle free-rock speed variation, individual tumbling, 5–144 FPS, reduced motion, pause and reuse');

assert.match(source, /updateShipArrivals\(dt\);/, 'The simulation must pass elapsed time into shower movement');
for (const reducedMotion of [false, true]) for (const corridor of [false, true]) for (const fps of [5, 30, 60, 144]) {
  const motion = makeGame(reducedMotion); motion.setupLevelFleet();
  motion.flightOrientation.set(.2, -.4, 0, 'YXZ');
  const field = motion.shower(corridor, 2, corridor ? 1 : 0);
  const origin = field.origin.clone(), velocity = field.velocity.clone(), travel = new THREE.Vector3();
  const tracked = field.pool.filter(rock => rock.visible).map(rock => ({rock, position: rock.position.clone()}));
  motion.flightOrientation.set(-.5, .8, 0, 'YXZ');
  for (let frame = 0; frame < fps * 6; frame++) {
    const dt = 1 / fps;
    // First prove intrinsic motion with a stationary player, then add player travel.
    motion.worldStep.set(0, 0, 0);
    if (frame >= fps * 2) motion.worldStep.set(-20 * dt, 10 * dt, 90 * dt);
    travel.addScaledVector(motion.worldStep, .85);
    motion.setTime(field.start + (frame + 1) * dt);
    motion.updateShipArrivals(dt);
    for (const {rock} of tracked) {
      rock.position.addScaledVector(motion.worldStep, .85);
      moveRock(rock, dt, false, reducedMotion);
    }
    if (frame === fps * 2 - 1) {
      if (corridor) assert.ok(field.origin.equals(origin), 'The corridor has no intrinsic movement');
      else assert.ok(field.origin.distanceTo(origin) > (reducedMotion ? 15 : 60), 'Rain moves even without player travel');
    }
    assert.ok(field.grit.position.equals(field.origin), 'Instanced rocks and their collision origin move together');
    assert.ok(field.velocity.equals(velocity), 'Later steering must not redirect the stream');
  }
  assert.ok(field.origin.distanceTo(origin.clone().add(travel).addScaledVector(velocity, 6)) < 1e-8);
  for (const {rock, position} of tracked) {
    assert.ok(rock.position.distanceTo(position.clone().add(travel).addScaledVector(rock.userData.courseVelocity, 6)) < 1e-8);
    if (corridor) assert.ok(rock.position.clone().sub(field.origin).distanceTo(position.clone().sub(origin)) < 1e-8,
      'The whole corridor translates without narrowing or shearing its curved safe passage');
  }
  const before = field.origin.clone();
  motion.setPaused(true); motion.updateShipArrivals(2);
  assert.ok(field.origin.equals(before));
  motion.setPaused(false); motion.setRoundEnded(true); motion.updateShipArrivals(2);
  assert.ok(field.origin.equals(before), 'Round end freezes the field as well as individual rocks');
}
console.log('PASS directional rain versus fixed corridor at 5–144 FPS, steering independence, corridor gaps, pause and round end');

for (const reducedMotion of [false, true]) {
  const repairs = makeGame(reducedMotion); repairs.setupLevelFleet();
  repairs.ships.forEach(ship => { ship.visible = false; }); repairs.camera.updateMatrixWorld();
  repairs.setShield(50); repairs.setRepairPending(true); repairs.setTime(9.99);
  repairs.updateRepairPickup(0); assert.equal(repairs.repairPickup.visible, false);
  repairs.setTime(10); repairs.setPaused(true); repairs.updateRepairPickup(0);
  assert.equal(repairs.repairPickup.visible, false, 'Pause cannot spawn or collect a repair');
  repairs.setPaused(false); repairs.updateRepairPickup(0);
  assert.equal(repairs.repairPickup.visible, true); assert.equal(repairs.repairPending, false);
  assert.ok(Math.abs(repairs.repairPickup.position.x) > 18, 'The pickup should require a small optional detour');
  assert.equal(repairs.repairMarker.hidden, false);
  const position = repairs.repairPickup.position.clone(), rotation = repairs.repairRing.rotation.z;
  repairs.worldStep.set(0, 0, 140); repairs.setPaused(true); repairs.updateRepairPickup(1);
  assert.ok(repairs.repairPickup.position.equals(position)); assert.equal(repairs.repairRing.rotation.z, rotation);
  repairs.setPaused(false); repairs.setCrashing(true); repairs.updateRepairPickup(1);
  assert.equal(repairs.shield, 50, 'Repairs cannot revive a crashed ship');
  repairs.setCrashing(false); repairs.setRoundEnded(true); repairs.updateRepairPickup(1);
  assert.ok(repairs.repairPickup.position.equals(position)); repairs.setRoundEnded(false);
  repairs.repairPickup.position.set(0, 0, -60); repairs.updateRepairPickup(1 / 60);
  assert.equal(repairs.shield, 75, 'Swept collection must work even when a frame crosses the pickup');
  assert.equal(repairs.repairPickup.visible, false);
  assert.deepEqual(repairs.messages.at(-1), {message: '+25 SCHILD', negative: false}, 'Repairs use the same action feedback as checkpoints');
  assert.deepEqual(repairs.sounds, ['reward']); repairs.updateRepairPickup(0);
  assert.deepEqual(repairs.sounds, ['reward'], 'Collection must happen only once');
  repairs.resetRepairPickup(); repairs.setRepairPending(true); repairs.setShield(100); repairs.worldStep.set(0, 0, 0);
  repairs.updateRepairPickup(0); assert.equal(repairs.repairPickup.visible, false, 'Save the opportunity while shield is full');
  repairs.setShield(90); repairs.setTime(28); repairs.updateRepairPickup(0);
  repairs.repairPickup.position.set(0, 0, -60); repairs.worldStep.set(0, 0, 140); repairs.updateRepairPickup(1 / 60);
  assert.equal(repairs.shield, 100, 'The pickup still caps shield at 100');
  assert.deepEqual(repairs.messages.at(-1), {message: '+25 SCHILD', negative: false},
    'Collection feedback matches the +25 pickup label even when part of the repair exceeds the cap');
  repairs.resetRepairPickup(); repairs.setRepairPending(true); repairs.setShield(50); repairs.worldStep.set(0, 0, 0);
  repairs.updateRepairPickup(0); repairs.repairPickup.position.set(100, 0, 200); repairs.updateRepairPickup(0);
  assert.equal(repairs.repairPickup.visible, false); assert.equal(repairs.shield, 50, 'Missed pickups do not repair automatically');
  repairs.setTime(29); repairs.updateRepairPickup(0); assert.equal(repairs.repairPickup.visible, false, 'A missed pickup does not respawn');
  repairs.setupLevelFleet();
  assert.equal(repairs.repairPickup.visible, false); assert.equal(repairs.repairMarker.hidden, true);
  assert.equal(repairs.scene.children.filter(object => object === repairs.repairPickup).length, 1, 'Reuse one pickup model across attempts');
}
const litRockShader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
game.asteroidShader(litRockShader);
assert.ok(litRockShader.fragmentShader.includes('totalEmissiveRadiance += vec3(0.7, 0.8, 1.0)'));
assert.ok(litRockShader.fragmentShader.includes('smoothstep(450.0, 1600.0, length(vViewPosition))'));
assert.ok(litRockShader.fragmentShader.includes('1.0 - smoothstep(2600.0, 3600.0, length(vViewPosition))'));
assert.equal((litRockShader.fragmentShader.match(/diffuseColor.a \*=/g) || []).length, 1, 'Edge lighting must not add a near fade');
console.log('PASS optional bounded shield repairs, swept collection, cap, pause/results/reset and surface-only asteroid lighting');

// Complete 45-second runs, not just a promise that a crossing has nonzero velocity.
// Isolate scheduled crossings so ring/regular-fleet hits cannot hide a harmless threat schedule.
const unattended = [], evasive = [];
let totalCrossings = 0, totalDangerousCrossings = 0;
for (const reducedMotion of [false, true]) for (const fps of [5, 60, 144]) for (let trial = 0; trial < 4; trial++) {
  for (const dodge of [false, true]) {
    randomState.seed = 8000 + trial;
    const flight = makeGame(reducedMotion); flight.setupLevelFleet();
    flight.flightMotion.set(0, 0, -flight.levelFlightSpeed(0));
    let ticks = 0, hits = 0, shownCrossings = 0, dangerousCrossings = 0, dodgeAt = Infinity;
    const spawns = new Map();
    const clock = makeFlightClock(THREE, flight, reducedMotion, dt => {
      const time = ticks * dt; flight.setTime(time);
      flight.updateCollisionHazard();
      for (const rock of flight.hazardPool) {
        if (!rock.visible) continue;
        if (spawns.get(rock) !== rock.userData.spawn) {
          spawns.set(rock, rock.userData.spawn); shownCrossings++;
          if (rock.userData.dangerousCrossing) dangerousCrossings++;
          dodgeAt = time + .5;
        }
        const previous = rock.position.clone();
        flight.updateShipCourse(rock, dt);
        rock.position.addScaledVector(flight.flightMotion, -.85 * dt);
        moveRock(rock, dt, false, reducedMotion);
        if (!rock.userData.collisionHandled && rock.userData.lastVisibleTime > -Infinity
          && flight.crossesPlayer(rock, previous, rock.position)) {
          hits++; rock.userData.collisionHandled = true;
        }
        if (flight.hasPassedCamera(rock)) flight.queueShip(rock);
      }
      if (dodge && time >= dodgeAt) {
        flight.target.y = flight.target.y > 0 ? -.8 : .8;
        dodgeAt = Infinity;
      }
      ticks++;
      clock.move(dt, ticks * dt / 45);
    });
    for (let frame = 0; frame < fps * 45; frame++) {
      clock.frame(1 / fps);
      flight.recordVisibleObjects(); // Only actual display frames grant collision eligibility.
    }
    assert.ok(shownCrossings >= 3 && shownCrossings <= 6,
      'Long approaches may occupy the two-rock pool longer; retain repeated encounters without catch-up bursts');
    totalCrossings += shownCrossings; totalDangerousCrossings += dangerousCrossings;
    (dodge ? evasive : unattended).push(hits);
  }
}
// Longer approaches mean fewer completed crossings at low speed; verify the random mix across runs.
assert.ok(totalDangerousCrossings > totalCrossings * .3 && totalDangerousCrossings < totalCrossings * .8,
  'Sampled runs must retain a mix of dangerous crossings and near-passes');
assert.ok(unattended.reduce((sum, hits) => sum + hits, 0) >= unattended.length,
  `Uncorrected flight must still meet real hazards despite the longer warning distance: ${unattended}`);
assert.ok(evasive.reduce((sum, hits) => sum + hits, 0) < unattended.reduce((sum, hits) => sum + hits, 0) * .35,
  `Readable fixed trajectories must remain avoidable: straight=${unattended}, evasive=${evasive}`);
console.log(`PASS full-level collision chance at 5–144 FPS: straight ${unattended.join('/')} hits; evasive ${evasive.join('/')}`);
