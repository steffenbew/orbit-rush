// Shattered-body debris fields, contrasting size spectra and real non-shooting navigation.
import assert from 'node:assert/strict';
import { THREE, makeGame, makeFlightClock, randomState } from './helpers/flight-game.mjs';

const layout = game => game.fieldGroups.map(group => ({position: group.position.toArray(), passage: group.passage.toArray(),
  coreRadius: group.coreRadius, blocking: group.blocking, axis: group.axis, shape: group.shape, angle: group.angle, diffuse: group.diffuse,
  tunnel: group.tunnel && {center: group.tunnel.center.toArray(), direction: group.tunnel.direction.toArray(), radius: group.tunnel.radius},
  pockets: group.pockets.map(pocket => ({center: pocket.center.toArray(), spread: pocket.spread.toArray(),
    weight: pocket.weight, sizePower: pocket.sizePower, sizeScale: pocket.sizeScale}))}));
for (const reduced of [false, true]) for (const level of [1, 2, 4, 5, 8, 9, 11, 12, 17, 20, 100]) for (const seed of [123, 456, 789]) {
  randomState.seed = seed;
  const game = makeGame(reduced); game.setLevel(level); game.setupLevelFleet(); game.camera.updateMatrixWorld();
  for (const event of game.getAsteroidEncounters().filter(event => event.kind === 'field')) {
    game.showerPool.forEach(rock => { rock.visible = false; });
    game.selectAsteroidEncounter(event); game.setTime(event.prepare); game.worldStep.set(0, 0, 0); game.updateAsteroidShower(0);
    const planned = layout(game), origin = game.coursePlan().origin, scale = reduced ? .35 : 1;
    const rocks = game.fieldGroups.flatMap(group => group.rocks), debris = game.fieldDebris;
    const diffuse = game.fieldGroups[0].diffuse;
    assert.ok(game.fieldGroups.length >= 1 && game.fieldGroups.length <= 3);
    assert.equal(game.grit.count, debris.length);
    if (level === 1 && !reduced) {
      assert.ok(debris.length <= 140 && rocks.length <= 9, 'The first field uses fewer pieces, not a compressed wall');
      const fullReach = Math.min(900, game.coursePlan().length * .3);
      assert.ok(Math.abs(game.fieldImpacts[0].drift.length() - fullReach * .65) < 1e-7, 'Shorten introductory debris reach by 35% without enlarging its rocks');
    }
    assert.ok(debris.length >= (reduced ? 12 : 90) && debris.length <= 300, `A continuous debris volume: level=${level}, reduced=${reduced}, count=${debris.length}`);
    assert.ok(rocks.length >= (reduced ? 2 : 4) && rocks.length <= 27, 'Detailed chunks are distributed across the wider field');
    const sizes = rocks.map(rock => rock.scale.x / scale);
    assert.ok(sizes.every(size => size >= (diffuse ? .45 : 1.1) - 1e-7 && size <= (diffuse ? 4.6 : 3.78) + 1e-7), 'Directional sizes stay unchanged; settled fields gain contrast without monoliths');
    assert.ok(rocks.some(rock => rock.userData.asteroidTier === 3));
    if (diffuse) {
      assert.ok(sizes.filter(size => size > 2.8 + 1e-7).length <= 2, 'Only the surviving core and one optional larger remnant dominate');
      assert.ok(game.fieldGroups[0].pockets.length >= 3 && game.fieldGroups[0].pockets.length <= 5);
    } else assert.ok(rocks.some(rock => rock.userData.asteroidTier === 2));
    const small = debris.filter(piece => piece.size <= (reduced ? 2 : 6)).length;
    if (!diffuse) {
      assert.ok(small / debris.length >= .3 && small / debris.length <= (reduced ? 1 : .8), 'Directional fragment spectrum stays unchanged');
      assert.ok(debris.some(piece => piece.size < (reduced ? .7 : 1.5)) && debris.some(piece => piece.size > (reduced ? 1 : 15)), 'Both tiny chips and substantial fragments are present');
    }
    assert.ok(debris.every(piece => piece.size <= (reduced ? 7 : 26)), 'Fragment sizes stay inside the existing collision broadphase limits');
    const extent = game.grit.boundingBox.getSize(new THREE.Vector3());
    assert.ok(Math.max(extent.x, extent.y, extent.z) > (reduced ? 60 : 300) && Math.max(extent.x, extent.y) < (reduced ? 600 : 2400), 'Rotated debris keeps a moderate three-dimensional footprint');
    assert.ok(extent.z < game.coursePlan().length, 'The impact remains inside its encounter');
    assert.equal(diffuse, level > 1 && (level + Math.floor(event.entry / 16)) % 3 === 2, 'Both young and aged fields follow a retry-stable plan');
    assert.equal(game.fieldImpacts.length, diffuse || game.fieldGroups[0].shape === 0 ? 1 : 2);
    for (const impact of game.fieldImpacts) assert.ok(rocks.some(rock => rock.position.distanceTo(impact.source.clone().add(origin)) < 1e-6), 'Each impact has a visible surviving core, not an arbitrary cloud origin');
    const impactLayout = game.fieldImpacts.map(impact => ({source: impact.source.toArray(), drift: impact.drift.toArray(), rays: impact.rays.map(ray => ray.toArray())}));
    let nearFilaments = 0;
    for (const piece of debris) {
      const impact = game.fieldImpacts[piece.impact];
      const distance = Math.min(...impact.rays.map(ray => {
        const offset = piece.position.clone().sub(impact.source).addScaledVector(ray, -piece.travel);
        return Math.hypot(offset.dot(impact.u) / (impact.width * piece.travel), offset.dot(impact.v) / (impact.height * piece.travel));
      }));
      if (distance < .18) nearFilaments++;
      assert.ok(piece.travel > 0 && piece.travel <= impact.age, 'Every fragment has a common impact origin and outward travel');
    }
    if (diffuse) {
      const impact = game.fieldImpacts[0];
      const distances = debris.map(piece => piece.position.distanceTo(impact.source));
      assert.ok(Math.max(...distances) > (reduced ? 90 : impact.drift.length() * .55), `Keep the wider footprint despite local bunching: ${JSON.stringify({level,reduced,seed,max:Math.max(...distances),reach:impact.drift.length()})}`);
      for (const axis of [impact.u, impact.v, impact.drift.clone().normalize()]) {
        const projections = debris.map(piece => piece.position.clone().sub(impact.source).dot(axis));
        assert.ok(Math.max(...projections) - Math.min(...projections) > impact.drift.length() * .15, 'Pockets retain depth on every axis without requiring symmetric populations');
      }
    } else {
      assert.ok(nearFilaments / debris.length > (reduced ? .3 : .45), `Uneven strands: ${JSON.stringify({level,reduced,entry:event.entry,nearFilaments,total:debris.length})}`);
    }
    if (game.fieldImpacts.length === 2) {
      const [first, second] = game.fieldImpacts;
      assert.ok(first.source.distanceTo(second.source) > 30 && second.age < first.age, 'A secondary hit originates on a different surviving piece');
      assert.ok(debris.some(piece => piece.impact === 1), 'The second strike has its own smaller fan');
    }
    assert.ok(Number.isFinite(game.grit.boundingSphere.radius) && game.grit.boundingSphere.radius > 0);
    const bodies = [];
    for (const rock of rocks) {
      assert.equal(rock.userData.courseVelocity.lengthSq(), 0);
      assert.equal(rock.userData.health, Math.max(rock.userData.asteroidTier, Math.ceil(rock.scale.x / scale)), 'Durability follows size, not a three-hit cap');
      assert.equal(rock.userData.maxHealth, rock.userData.health);
      const sphere = rock.userData.collisionBox.getBoundingSphere(new THREE.Sphere());
      bodies.push({point: rock.position.clone().sub(origin), radius: (sphere.radius + sphere.center.length()) * rock.scale.x});
      const bounds = rock.userData.collisionBox.clone().applyMatrix4(rock.matrix).translate(origin.clone().negate());
      assert.ok(game.grit.boundingBox.clone().expandByScalar(1e-7).containsBox(bounds), 'Cleanup includes every detailed, rotated hull');
    }
    bodies.push(...debris.map(piece => ({point: piece.position, radius: piece.size * 1.7})));
    let closestDebrisMargin = Infinity;
    for (let index = 0; index < bodies.length; index++) {
      const {point, radius} = bodies[index], margin = reduced ? 14 : 40;
      for (const gate of game.flightRings) assert.ok(point.clone().add(origin).distanceTo(gate.position) >= radius + gate.userData.radius * 1.5 + 26 - 1e-7,
        'Checkpoint openings, approaches and glow stay clear');
      for (let i = 1; i < game.fieldRoute.length; i++) {
        const closest = new THREE.Line3(game.fieldRoute[i - 1], game.fieldRoute[i]).closestPointToPoint(point, true, new THREE.Vector3());
        assert.ok(point.distanceTo(closest) >= radius + 26 + margin - 1e-7, 'A full-hull channel passes through all debris, not only the detailed chunks');
        if (index >= rocks.length) closestDebrisMargin = Math.min(closestDebrisMargin, point.distanceTo(closest) - radius - 26);
      }
      const tunnel = game.fieldGroups[0].tunnel;
      if (tunnel) {
        const offset = point.clone().sub(tunnel.center), along = offset.dot(tunnel.direction);
        const width = tunnel.radius * (1 + .1 * Math.sin(along / (tunnel.radius * 2) + game.fieldGroups[0].angle));
        assert.ok(offset.lengthSq() - along * along >= (width + radius * 1.05) ** 2 - 1e-7, 'The old passage clears complete boulders and instanced fragments');
      }
      for (let other = 0; other < index; other++) assert.ok(point.distanceTo(bodies[other].point) >= radius + bodies[other].radius + (diffuse ? 1 : 4) * scale - 1e-7,
        'Close neighbours are allowed, but complete collision hulls never overlap');
    }
    if (!reduced) {
      if (level === 2) assert.ok(game.fieldGroups.some(group => group.blocking), 'The field introduction includes an evasive route');
      for (const group of game.fieldGroups.filter(group => group.blocking)) {
        const anchor = group.rocks[0], center = group.position.clone().add(origin);
        assert.ok(game.crossesPlayer(anchor, center.clone().add(new THREE.Vector3(0, 0, -300)), center.clone().add(new THREE.Vector3(0, 0, 300)), 0, center),
          'Dense remnants physically block the direct course');
      }
    }
    if (!reduced && level === 2) assert.ok(closestDebrisMargin < 100, 'Fragments still approach the narrow escape route');
    if (!reduced && level === 9) assert.ok(game.fieldGroups.some(group => group.axis === 'y'));
    const detail = debris.slice(0, 10).map(piece => [...piece.position.toArray(), piece.size]);
    rocks.forEach(rock => { rock.visible = false; }); game.selectAsteroidEncounter(event); game.updateAsteroidShower(0);
    assert.deepEqual(layout(game), planned, 'Retries retain the cloud shape, dense remnants and reserved channels');
    assert.deepEqual(game.fieldImpacts.map(impact => ({source: impact.source.toArray(), drift: impact.drift.toArray(), rays: impact.rays.map(ray => ray.toArray())})), impactLayout, 'Impact origins and plume directions repeat');
    assert.notDeepEqual(game.fieldDebris.slice(0, 10).map(piece => [...piece.position.toArray(), piece.size]), detail, 'Individual debris details may vary');
  }
}
console.log('PASS debris volumes, contrasting settled sizes, separated bodies, clear channels/checkpoints and fixed retry layouts');

for (const reduced of [false, true]) for (const level of [1, 2, 3, 4, 5, 7, 8, 9, 20]) {
  const game = makeGame(reduced); game.setLevel(level); game.setupLevelFleet(); game.updateAsteroidShower(0);
  const landmark = game.fieldBoulder;
  if (level === 1 || level === 3 || level % 4 === 0) { assert.equal(landmark, null, 'No extra boulders in boss fights or the corridor-only level'); continue; }
  const [opening, next] = game.getAsteroidEncounters(), {rock, time} = landmark;
  assert.ok(time >= opening.exit + 3 && time <= next.entry - 3, 'A single larger remnant occupies the quiet gap, not a new field');
  assert.equal(rock.scale.x, 5 * (reduced ? .35 : 1));
  assert.equal(rock.userData.health, 5); assert.equal(rock.userData.maxHealth, 5, 'Largest current boulders take five hits in either motion mode');
  assert.equal(rock.userData.courseVelocity.lengthSq(), 0);
  assert.ok(!game.fieldGroups.some(group => group.rocks.includes(rock)), 'The cloud handoff does not wait for the later standalone boulder');
  const sphere = rock.userData.collisionBox.getBoundingSphere(new THREE.Sphere());
  const radius = (sphere.radius + sphere.center.length()) * rock.scale.x;
  for (const gate of game.flightRings) assert.ok(rock.position.distanceTo(gate.position) >= radius + gate.userData.radius * 1.5 + 26, 'Larger landmarks leave checkpoints clear');
  const before = rock.position.clone(), rotation = rock.quaternion.clone();
  game.selectAsteroidEncounter(next); game.worldStep.set(10, 20, 30); game.moveShip(rock, 1 / 60);
  assert.ok(rock.position.distanceTo(before.clone().addScaledVector(game.worldStep, .85)) < 1e-7);
  assert.ok(rock.quaternion.equals(rotation), 'Starting the next shower does not make the landmark tumble or drift');
  game.setupLevelFleet(); game.updateAsteroidShower(0);
  assert.equal(game.fieldBoulder.time, time); assert.deepEqual(game.fieldBoulder.rock.position, before, 'Retry restores the same gap placement');
}
console.log('PASS occasional larger gap boulders, stable retries, stationary motion and clear boss/checkpoint sections');

// Follow the authored channel using real steering. No firing, teleporting or damage immunity.
// Fast: every level/motion mode at 60 FPS, then vary FPS and seeds independently
// on settled (2), vertical (9) and late/boss (20) layouts. Full retains the entire matrix.
const full = process.env.ORBIT_TEST_FULL === '1';
let traversals = 0;
for (const reduced of [false, true]) for (const level of [1, 2, 5, 6, 7, 8, 9, 11, 17, 20]) for (const seed of [12, 34, 56]) for (const fps of [5, 60, 144]) {
  const baseline = seed === 12 && fps === 60;
  const representative = [2, 9, 20].includes(level);
  const frameRateEdge = representative && seed === 12;
  const seedVariation = representative && fps === 60;
  if (!full && !baseline && !frameRateEdge && !seedVariation) continue;
  traversals++;
  randomState.seed = seed;
  const game = makeGame(reduced); game.setLevel(level); game.setupLevelFleet(); game.flightMotion.set(0, 0, 0);
  game.setTime(0); game.updateAsteroidShower(0);
  const origin = game.coursePlan().origin.clone();
  const route = game.fieldRoute.length ? game.fieldRoute.map(point => point.clone().add(origin)) : game.flightRings.map(gate => gate.position.clone());
  const rocks = game.fieldGroups.flatMap(group => group.rocks), nextEvent = game.getAsteroidEncounters()[1];
  const landmark = game.fieldBoulder;
  if (landmark) rocks.push(landmark.rock);
  let time = 0, hits = 0, checkingGap = false;
  const clock = makeFlightClock(THREE, game, reduced, dt => {
    if (game.encounterIndex !== 0 && !checkingGap) return;
    time += dt; game.setTime(time);
    // Anticipate bends instead of overshooting each waypoint and demanding a cleared swath around that mistake.
    const ahead = reduced ? 0 : game.levelFlightSpeed(time / 45) * .85 * .6;
    const z = game.camera.position.z - game.courseWorldOffset.z - ahead;
    const next = route.findIndex(point => point.z < z), index = next < 0 ? route.length - 1 : next;
    const aim = route[index].clone();
    if (!reduced && index > 0) {
      const before = route[index - 1];
      aim.copy(before).lerp(route[index], THREE.MathUtils.clamp((before.z - z) / (before.z - route[index].z), 0, 1));
    }
    const delta = aim.add(game.courseWorldOffset).sub(game.camera.position);
    const yaw = -Math.atan2(delta.x, -delta.z), pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z)), motion = reduced ? .5 : 1;
    const error = Math.atan2(Math.sin(yaw - game.flightOrientation.y), Math.cos(yaw - game.flightOrientation.y));
    game.target.set(THREE.MathUtils.clamp(-(error * 4 - game.flightTurn.x * .8) / (.9 * motion), -1, 1),
      THREE.MathUtils.clamp(((pitch - game.flightOrientation.x) * 4 - game.flightTurn.y * .8) / (.65 * motion), -1, 1));
    clock.move(dt, time / 45); game.worldStep.copy(game.flightMotion).multiplyScalar(-dt);
    game.courseWorldOffset.addScaledVector(game.worldStep, .85); game.updateFlightRing(); game.camera.updateMatrixWorld();
    for (const rock of checkingGap ? [landmark.rock] : rocks) {
      const before = rock.position.clone(); rock.position.addScaledVector(game.worldStep, .85);
      if (game.crossesPlayer(rock, before, rock.position)) hits++;
    }
    if (!checkingGap) {
      game.updateAsteroidShower(dt); game.recordVisibleObjects(); game.recordVisibleShowerRocks(); game.updateShowerRockCollisions();
      if (!rocks.length && game.fieldGroups.length) {
        rocks.push(...game.fieldGroups.flatMap(group => group.rocks));
        route.splice(0, route.length, ...game.fieldRoute.map(point => point.clone().add(origin)));
      }
    }
  });
  while (time < nextEvent.entry && game.encounterIndex === 0) clock.frame(1 / fps);
  assert.ok(rocks.length > 0, 'The field was encountered before the shower');
  assert.equal(game.encounterIndex, 1, 'The whole cloud clears before the next encounter');
  assert.ok(nextEvent.entry - time >= 4, `Preserve approach time: level=${level}, reduced=${reduced}, lead=${nextEvent.entry - time}`);
  // Continue through the isolated gap boulder without introducing the next shower's random traffic.
  if (landmark) { checkingGap = true; while (time < landmark.time + 2) clock.frame(1 / fps); }
  assert.equal(hits, 0, `Navigate detailed chunks and gap boulders without shooting: level=${level}, reduced=${reduced}, seed=${seed}, fps=${fps}`);
  assert.equal(game.hits.length, 0, `Navigate instanced debris without shooting: level=${level}, reduced=${reduced}, seed=${seed}, fps=${fps}`);
  assert.ok(!game.sounds.includes('checkpointMiss'));
}
assert.equal(traversals, full ? 180 : 44);
console.log(`PASS ${traversals} non-shooting traversals through the complete cloud, real inertia and safe phase handoffs at 5–144 FPS`);

for (const reduced of [false, true]) {
  const game = makeGame(reduced); game.setupLevelFleet(); game.updateAsteroidShower(0);
  const [introduction, firstShower] = game.getAsteroidEncounters();
  assert.deepEqual([introduction.prepare, introduction.entry, introduction.exit], [6, 12, 17]);
  assert.deepEqual([firstShower.kind, firstShower.prepare, firstShower.entry, firstShower.exit, firstShower.strength], ['shower', 18, 24, 32, 0]);
  for (const time of [0, 5, 5.99]) {
    game.setTime(time); game.updateAsteroidShower(0);
    assert.equal(game.grit.visible, false, 'Keep the opening clear of formations');
    assert.equal(game.fieldGroups.length, 0);
    assert.equal(game.warningHidden, true);
  }
  game.setTime(introduction.prepare); game.updateAsteroidShower(0);
  assert.ok(game.grit.visible && game.fieldGroups.length > 0, 'Prepare the earlier field with six seconds of approach');
  assert.equal(game.fieldShower.length, 0, 'Introduce field and shower separately, not as a mixed encounter');
  assert.equal(game.fieldBoulder, null, 'Leave the introductory breather free of extra boulders');
  const firstLayout = layout(game);
  game.setTime(0); game.setupLevelFleet(); game.updateAsteroidShower(0);
  assert.equal(game.grit.visible, false, 'Retry restores the clear opening');
  game.setTime(introduction.prepare); game.updateAsteroidShower(0);
  assert.deepEqual(layout(game), firstLayout, 'Retry preserves the later formation');
  game.setTime(0); game.setLevel(2); game.setupLevelFleet();
  const [opening] = game.getAsteroidEncounters();
  game.updateAsteroidShower(0); const original = layout(game);
  assert.equal(game.fieldGroups[0].diffuse, true, 'Level two introduces an older diffuse remnant after the compact first field');
  game.setTime(0); game.flightRings[0].position.z -= 20000; game.flightRings[0].userData.resolved = true;
  game.showerPool.forEach(rock => { rock.visible = false; });
  game.selectAsteroidEncounter(opening); game.updateAsteroidShower(0);
  assert.deepEqual(layout(game), original, 'Tutorial history cannot shift the cloud or its safe channels');
  assert.deepEqual([opening.entry, opening.exit], [8, 12]);
  for (const level of [2, 3]) {
    game.setLevel(level); game.setupLevelFleet();
    for (let i = 0; i <= 100; i++) assert.equal(Math.abs(game.corridorCenter(game.corridorPlan.length * i / 100, game.corridorPlan)), 0);
  }
  game.setLevel(5); game.setupLevelFleet(); assert.notEqual(game.corridorPlan.shape, 0);
}
console.log('PASS delayed field introduction, straight first corridor and tutorial/retry consistency');
