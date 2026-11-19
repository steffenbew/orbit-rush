import * as THREE from '../../assets/vendor/three.module.js';
import { populateAsteroidField } from './asteroid-field.js';
import { planEncounterLayout, corridorHeightAt } from './encounter-plan.js';
import { createDebrisField } from './debris-field.js';
import { t } from '../presentation/i18n.js';

const maxShowerRocks = 144;

export function createAsteroidEncounter({ scene, camera, random, createShip, resetShip, hasPassedCamera,
  flightMotion, worldStep, courseOrigin, courseWorldOffset, getGates, roundDuration, firstCheckpointTime,
  flightDistanceAt, levelFlightSpeed, asteroidType, fadeAsteroidShader, playerHullRadius, crossesPlayer, showerWarning, poolLimit = maxShowerRocks }) {
  let level;
  const showerPool = [];
  let showerStart = Infinity, showerEntry = Infinity, showerEnd = Infinity, showerPending = false;
  let asteroidEncounters = [], asteroidEncounterIndex = 0, activeLayout = null, corridorPlan = null;
  let showerCourse = 0, showerKind = 'shower';
  let asteroidField = null, fieldShower = [], fieldBoulder = null;
  let lateAsteroids = [], lateAsteroidsSeeded = false;
  let showerStrength = 0, showerCorridor = false;
  let showerTravel = 0, nextShowerSlice = 0, showerFadeStart = 0;
  let nextShowerObstacle = Infinity, corridorSlalomGroup = 0;
  // The debris collider retains these live transforms across encounter changes.
  const showerOrigin = new THREE.Vector3(), showerVelocity = new THREE.Vector3(), showerRotation = new THREE.Quaternion();
  function corridorCenter(distance, plan = activeLayout) {
    return corridorHeightAt(distance, plan);
  }
  function corridorRockX() {
    // Overlapping distributions taper to scattered outliers, not a rectangular edge.
    return random(-activeLayout.halfWidth, activeLayout.halfWidth) + random(-550, 550);
  }
  function corridorFringe(x) {
    return THREE.MathUtils.smoothstep(Math.abs(x), activeLayout.halfWidth * .6, activeLayout.halfWidth + 550);
  }
  // Uneven ring layers retain a narrow passage and disperse toward the sides.
  const showerGritMaterial = new THREE.MeshStandardMaterial({
    color: 0x918777, roughness: 1, flatShading: true, alphaHash: true, opacity: 0, depthWrite: true
  });
  // Soften only distant arrivals; nearby rocks must never dissolve as we approach.
  showerGritMaterial.onBeforeCompile = fadeAsteroidShader;
  const maxShowerGritSize = 26;
  const showerGrit = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), showerGritMaterial, 12000);
  showerGrit.visible = false;
  scene.add(showerGrit);
  function seedShowerGrit(gameTime, courseStartTime) {
    const transform = new THREE.Object3D();
    debrisField.clear();
    fieldShower = [];
    asteroidField = showerKind === 'field' ? seedAsteroidField(gameTime, courseStartTime) : null;
    showerGrit.count = showerKind === 'field' ? asteroidField.debris.length : showerCorridor ? [7200, 9600, 12000][showerStrength]
      : [300, 900, 1800][showerStrength];
    for (let i = 0; i < showerGrit.count; i++) {
      const side = i % 2 ? 1 : -1;
      // Mostly small rubble, with a continuous range up to much larger boulders.
      const size = showerKind === 'field' ? asteroidField.debris[i].size
        : showerCorridor ? 4 + Math.pow(random(0, 1), 3) * (maxShowerGritSize - 4) : random(.6, 2);
      const depth = random(-activeLayout.length, 0);
      const x = showerCorridor ? corridorRockX() : random(-activeLayout.halfWidth, activeLayout.halfWidth);
      // Wall rocks stay outside the flight gap; individual hazards also enter the passage.
      const clearance = size * 1.7 * (1 + activeLayout.maxSlope);
      transform.position.set(x, showerCorridor
        ? corridorCenter(-depth) + side * (activeLayout.gap + clearance + random(6, 65 + corridorFringe(x) * 100))
        : random(-700, 700), depth);
      if (showerKind === 'field') transform.position.copy(asteroidField.debris[i].position);
      transform.rotation.set(random(-3, 3), random(-3, 3), random(-3, 3));
      const shard = showerKind === 'field' && random(0, 1) < .3;
      transform.scale.set(size, size * random(shard ? .12 : .4, shard ? .35 : .9), size * random(shard ? 1.4 : 1, 1.7));
      transform.updateMatrix();
      showerGrit.setMatrixAt(i, transform.matrix);
      const rock = { index: i, size, position: transform.position.clone(), seen: false, hit: false,
        health: size < 10 ? 1 : size < 18 ? 2 : 3, destroyed: false };
      debrisField.add(rock);
    }
    showerGrit.instanceMatrix.needsUpdate = true;
    showerGrit.computeBoundingBox();
    // Include the detailed chunks as well as the instanced debris in phase cleanup.
    const fieldBounds = new THREE.Box3();
    for (const group of asteroidField?.groups ?? []) for (const rock of group.rocks) {
      rock.updateMatrix();
      fieldBounds.copy(rock.userData.collisionBox).applyMatrix4(rock.matrix);
      fieldBounds.min.sub(showerOrigin); fieldBounds.max.sub(showerOrigin);
      showerGrit.boundingBox.union(fieldBounds);
    }
    showerGrit.computeBoundingSphere();
    if (showerKind === 'field') showerGrit.boundingBox.getBoundingSphere(showerGrit.boundingSphere);
    showerGrit.quaternion.copy(showerRotation);
    showerGrit.visible = true;
  }
  const showerPreviousOrigin = new THREE.Vector3();
  const debrisField = createDebrisField({ mesh: showerGrit, origin: showerOrigin, rotation: showerRotation, velocity: showerVelocity,
    maxSize: maxShowerGritSize, asteroidType, camera, flightMotion, playerHullRadius, crossesPlayer });
  function eventAsteroid() {
    let rock = showerPool.find(ship => !ship.visible);
    if (!rock) {
      // Instancing supplies the dense solid layers; keep the shootable fleet bounded.
      if (showerPool.length >= poolLimit) return null;
      rock = createShip(3);
      rock.userData.shower = true;
      showerPool.push(rock);
    }
    resetShip(rock, false);
    rock.userData.corridorObstacle = false;
    // Only showers drift; fields and corridors have zero intrinsic velocity.
    // Copy on every reuse so former rain rocks cannot keep drifting through its gap.
    rock.userData.courseVelocity.copy(showerVelocity);
    if (!showerCorridor) rock.userData.courseVelocity.multiplyScalar(random(.9, 1.1));
    return rock;
  }
  function seedAsteroidField(gameTime, courseStartTime) {
    // Use the authored opening rather than the passed tutorial gate.
    const gates = getGates().map((gate, index) => ({ radius: gate.userData.radius,
      position: (index === 0 ? courseOrigin.clone().add(new THREE.Vector3(0, 0, -flightDistanceAt(firstCheckpointTime)))
        : gate.position.clone().sub(courseWorldOffset)).sub(activeLayout.origin) }));
    const phase = Math.floor((showerEntry - courseStartTime) / 16 + 1e-6);
    const field = populateAsteroidField({ gates, level, phase, showerLength: activeLayout.length, showerStrength,
      showerOrigin, playerHullRadius, eventAsteroid, sample: () => random(0, 1) });
    // One larger, isolated remnant in a quiet gap, separate from the cloud's cleanup bounds.
    // Keep boss fights and the final checkpoint stretch free of these extra landmarks.
    const [opening, next] = asteroidEncounters;
    if (!fieldBoulder && showerStart === courseStartTime && level % 4 !== 0 && next
      && opening.kind === 'field' && next.entry - opening.exit >= 6) {
      const rock = eventAsteroid();
      if (rock) {
        const time = (opening.exit + next.entry) / 2;
        rock.scale.setScalar(5);
        rock.userData.asteroidTier = 3;
        rock.userData.health = rock.userData.maxHealth = Math.ceil(rock.scale.x);
        rock.userData.courseVelocity.set(0, 0, 0);
        const point = field.courseAt(flightDistanceAt(time) - flightDistanceAt(showerEntry - courseStartTime));
        point.x += (level % 2 ? 1 : -1) * 210;
        point.y += (level % 3 - 1) * 30;
        rock.position.copy(point).add(showerOrigin);
        rock.rotation.set(random(-Math.PI, Math.PI), random(-Math.PI, Math.PI), random(-Math.PI, Math.PI));
        rock.userData.previousPosition.copy(rock.position);
        fieldBoulder = { rock, time }; // A destroyed or passed landmark is not spawned again.
      }
    }
    if (level >= 6) {
      // A small, simultaneous crossing shower: real moving bodies, not another uniform backdrop.
      const count = 4 + showerStrength * 2;
      const velocity = new THREE.Vector3(showerCourse < 2 ? (showerCourse === 0 ? -1 : 1) : .2,
        showerCourse < 2 ? .15 : (showerCourse === 2 ? -1 : 1), .2).normalize()
        .multiplyScalar(260 + showerStrength * 50);
      for (let i = 0; i < count; i++) {
        const rock = eventAsteroid();
        if (!rock) break;
        const size = [1.3, .65, 2.2][i % 3];
        rock.scale.setScalar(size);
        rock.userData.asteroidTier = Math.min(3, Math.ceil(size));
        rock.userData.health = rock.userData.maxHealth = Math.ceil(size);
        const impact = field.impacts[i % field.impacts.length].source.clone();
        if (i > 1) impact.add(new THREE.Vector3(random(-110, 110), random(-90, 90), random(-80, 80)));
        const arrival = showerEntry + (-impact.z / activeLayout.length) * (showerEnd - showerEntry);
        rock.userData.courseVelocity.copy(velocity).multiplyScalar(1 + i * .06);
        rock.position.copy(impact).add(showerOrigin).addScaledVector(rock.userData.courseVelocity, -(arrival - gameTime));
        rock.userData.previousPosition.copy(rock.position);
        fieldShower.push(rock);
      }
    }
    return field;
  }
  function layoutFor(event) {
    return planEncounterLayout(event, { courseOrigin, level, roundDuration, levelFlightSpeed, flightDistanceAt, maxShowerRocks });
  }
  function selectAsteroidEncounter(event, courseStartTime = 0) {
    showerStart = courseStartTime + event.prepare; showerEntry = courseStartTime + event.entry;
    showerEnd = courseStartTime + event.exit; showerKind = event.kind; showerCorridor = showerKind === 'corridor';
    showerStrength = event.strength; showerCourse = event.direction;
    activeLayout = layoutFor(event);
    if (showerCorridor) corridorPlan = activeLayout;
    showerRotation.copy(activeLayout.rotation); showerVelocity.copy(activeLayout.velocity);
    nextShowerObstacle = activeLayout.firstObstacle; corridorSlalomGroup = 0;
    showerPending = true; showerTravel = 0; nextShowerSlice = 0;
    setAsteroidWarning(showerKind, showerStrength);
  }
  function setAsteroidWarning(kind, strength) {
    const text = '<span aria-hidden="true">' + (kind === 'field' ? '🪨 ' : '☄️ ').repeat(strength + 1)
      + '</span>' + t(kind === 'corridor' ? 'asteroidCorridor' : kind === 'field' ? 'asteroidField' : 'asteroidShower');
    if (showerWarning.innerHTML !== text) showerWarning.innerHTML = text;
  }
  function placeEncounter(gameTime, courseStartTime) {
    showerPending = false; showerFadeStart = gameTime;
    showerOrigin.copy(activeLayout.origin).add(courseWorldOffset).addScaledVector(showerVelocity, gameTime - showerStart);
    showerPreviousOrigin.copy(showerOrigin);
    seedShowerGrit(gameTime, courseStartTime);
    showerGrit.position.copy(showerOrigin);
  }
  function advanceAsteroidShower(dt, gameTime, courseStartTime) {
    const { direction } = activeLayout;
    if (showerPending) placeEncounter(gameTime, courseStartTime);
    else {
      // Move the instanced backdrop and its collision geometry with the same stream.
      showerPreviousOrigin.copy(showerOrigin);
      showerOrigin.addScaledVector(worldStep, .85).addScaledVector(showerVelocity, dt);
      showerTravel -= worldStep.dot(direction) * .85 + showerVelocity.dot(direction) * dt;
      showerGrit.position.copy(showerOrigin);
    }
    showerGritMaterial.opacity = THREE.MathUtils.smoothstep(gameTime - showerFadeStart, 0, .3);
    // Keep the full field until even its trailing edges have passed the camera.
    showerGrit.visible = !hasPassedCamera(showerGrit, showerGrit.boundingBox);
    populateSlices(showerTravel);
  }
  function populateSlices(throughDistance) {
    if (showerKind === 'field') return; // Groups are placed once; no uniformly scattered refill slices.
    const { rocksPerSlice: count, length, gap, halfWidth, spacing, obstacleSpacing } = activeLayout;
    while (nextShowerSlice <= Math.min(throughDistance, length)) {
      for (let i = 0; i < count; i++) {
        const rock = eventAsteroid();
        if (!rock) break;
        const roll = random(0, 1);
        const tier = showerCorridor ? (roll < .15 ? 1 : roll < .45 ? 2 : 3)
          : showerStrength === 0 ? 3 : roll < .6 ? 1 : roll < .9 ? 2 : 3;
        rock.userData.asteroidTier = tier;
        rock.scale.setScalar([.35, 1.3, 2.8][tier - 1] * (showerCorridor ? random(.75, 1.35) : 1));
        rock.userData.health = rock.userData.maxHealth = Math.max(tier, Math.ceil(rock.scale.x));
        const nearCourse = i < Math.ceil(count * .8);
        const x = showerCorridor ? corridorRockX() : nearCourse ? random(-350, 350)
          : random(-halfWidth, halfWidth);
        const side = i % 2 ? 1 : -1;
        const clearance = rock.userData.type.radius * rock.scale.x * (1 + activeLayout.maxSlope);
        const depth = -nextShowerSlice + random(-25, 25);
        const y = showerCorridor ? corridorCenter(-depth) + side * (gap + clearance + random(0, 70 + corridorFringe(x) * 80)) : random(-380, 380);
        rock.position.set(x, y, depth)
          .applyQuaternion(showerRotation).add(showerOrigin);
        rock.rotation.set(random(-Math.PI, Math.PI), random(-Math.PI, Math.PI), random(-Math.PI, Math.PI));
        rock.quaternion.premultiply(showerRotation);
      }
      // Later corridors get three loose clusters, without extra random hazards between them.
      if (showerCorridor && nextShowerSlice >= nextShowerObstacle) {
        const slalom = level >= 5;
        const group = corridorSlalomGroup;
        if (slalom) {
          corridorSlalomGroup++;
          nextShowerObstacle = corridorSlalomGroup < 3 ? length * (.22 + corridorSlalomGroup * .26) : Infinity;
        } else nextShowerObstacle = nextShowerSlice + obstacleSpacing * random(.9, 1.2);
        const side = (level % 2 ? -1 : 1) * (group % 2 ? -1 : 1);
        for (let index = 0; index < (slalom ? 6 : 1); index++) {
          // Loose clouds inside the passage, not transverse walls or prescribed openings.
          const depth = nextShowerSlice + (slalom ? random(0, 240) : 0);
          // Like the ring walls, these belong to the field, not the reinforcement queue.
          const rock = eventAsteroid();
          if (!rock) break;
          const boulder = slalom && index === 0 && group !== 1;
          const roll = random(0, 1);
          const tier = slalom ? [3, 2, 3, 1, 2, 3][index] : roll < .2 ? 1 : roll < .7 ? 2 : 3;
          rock.userData.corridorObstacle = true;
          rock.userData.asteroidTier = tier;
          rock.scale.setScalar(boulder ? 5 : [.35, 1.3, 2.8][tier - 1] * random(.8, 1.2));
          rock.userData.health = rock.userData.maxHealth = Math.max(tier, Math.ceil(rock.scale.x));
          // Large rocks can span the gap vertically, but always leave wide lateral escape routes.
          const verticalRoom = Math.max(0, Math.min(gap * .35, gap - rock.userData.type.radius * rock.scale.x - 4));
          const x = slalom ? side * 180 + random(-240, 240)
            : random(0, 1) < .5 ? random(-20, 20) : random(-100, 100);
          rock.position.set(x, corridorCenter(depth) + random(-verticalRoom, verticalRoom), -depth)
            .applyQuaternion(showerRotation).add(showerOrigin);
          rock.rotation.set(random(-Math.PI, Math.PI), random(-Math.PI, Math.PI), random(-Math.PI, Math.PI));
          rock.quaternion.premultiply(showerRotation);
          rock.userData.previousPosition.copy(rock.position);
        }
      }
      nextShowerSlice += spacing * random(.8, 1.2);
    }
  }
  function seedLateAsteroids() {
    lateAsteroidsSeeded = true;
    const gates = getGates(), from = gates.at(-2).position, to = gates.at(-1).position;
    const startDepth = flightDistanceAt(32), finishDepth = flightDistanceAt(40);
    // Two isolated remnants after level one's shower, not another cloud or moving stream.
    for (const [time, size, side] of [[35, 2.8, 1], [37.5, 1.3, -1]]) {
      const rock = eventAsteroid();
      if (!rock) break;
      rock.scale.setScalar(size);
      rock.userData.asteroidTier = Math.min(3, Math.ceil(size));
      rock.userData.health = rock.userData.maxHealth = Math.ceil(size);
      rock.userData.courseVelocity.set(0, 0, 0); // Never inherit the preceding shower's drift.
      rock.position.lerpVectors(from, to, (flightDistanceAt(time) - startDepth) / (finishDepth - startDepth));
      rock.position.x += side * 130;
      rock.position.y += side * 40;
      rock.rotation.set(time * .31, time * .47, time * .19);
      rock.userData.previousPosition.copy(rock.position);
      lateAsteroids.push({ rock, time });
    }
  }
  function update(dt, gameTime, courseStartTime, active, earlyFinale) {
    if (active) {
      const next = asteroidEncounters[asteroidEncounterIndex + 1];
      // An early first-boss kill extends the finale, without spawning rocks in the player's face.
      if (earlyFinale && next
        && next.prepare > gameTime - courseStartTime) {
        next.prepare = Math.max(12, gameTime - courseStartTime);
        next.entry = next.prepare + 6;
      }
      // Reuse the field only after its trailing rocks have passed; never remove visible obstacles.
      if (next && gameTime - courseStartTime >= next.prepare && !showerGrit.visible) {
        asteroidEncounterIndex++;
        selectAsteroidEncounter(next, courseStartTime);
      }
      if (gameTime >= showerStart) advanceAsteroidShower(dt, gameTime, courseStartTime);
      if (level === 1 && !lateAsteroidsSeeded && gameTime - courseStartTime >= 29) seedLateAsteroids();
    }
    // Corridors get an extra second to line up; warning timing is independent of geometry preparation.
    const next = asteroidEncounters[asteroidEncounterIndex + 1];
    const upcoming = next && gameTime >= courseStartTime + next.entry - (next.kind === 'corridor' ? 5 : 4) ? next : null;
    const warningEntry = upcoming ? courseStartTime + upcoming.entry : showerEntry;
    const warningKind = upcoming ? upcoming.kind : showerKind;
    const warningLead = warningKind === 'corridor' ? 5 : 4;
    showerWarning.hidden = !active || gameTime < warningEntry - warningLead || gameTime > warningEntry + 1;
    if (!showerWarning.hidden) setAsteroidWarning(warningKind, upcoming ? upcoming.strength : showerStrength);
  }
  function reset(forLevel, events, courseStartTime = 0) {
    level = forLevel;
    asteroidEncounters = events; asteroidEncounterIndex = 0; corridorPlan = null;
    asteroidField = null; fieldShower = []; fieldBoulder = null;
    lateAsteroids = []; lateAsteroidsSeeded = false;
    showerStart = showerEntry = showerEnd = Infinity; showerCorridor = false; showerPending = false;
    nextShowerObstacle = Infinity; nextShowerSlice = 0; showerTravel = 0;
    // Checkpoints and route traffic need the future corridor even while the opening shower is active.
    const corridor = asteroidEncounters.find(event => event.kind === 'corridor');
    if (corridor && corridor !== asteroidEncounters[0]) corridorPlan = layoutFor(corridor);
    if (asteroidEncounters.length) selectAsteroidEncounter(asteroidEncounters[0], courseStartTime);
    showerGrit.visible = false;
    debrisField.clear();
    showerWarning.hidden = true;
  }
  function shiftStart(time, depth) {
    showerStart += time; showerEntry += time; showerEnd += time;
    activeLayout.origin.z += depth;
    if (corridorPlan && corridorPlan !== activeLayout) corridorPlan.origin.z += depth;
  }
  return { reset, shiftStart, update, placeEncounter, populateSlices, select: selectAsteroidEncounter, eventAsteroid, corridorCenter,
    mesh: showerGrit, debrisField, pool: showerPool, maxShowerRocks, maxShowerGritSize,
    origin: showerOrigin, previousOrigin: showerPreviousOrigin, rotation: showerRotation, velocity: showerVelocity,
    get course() { return showerCourse; }, get strength() { return showerStrength; },
    get kind() { return showerKind; }, get corridorPlan() { return corridorPlan; },
    get layout() { return activeLayout; }, get index() { return asteroidEncounterIndex; },
    get timing() { return { start: showerStart, entry: showerEntry, end: showerEnd }; },
    get field() { return asteroidField; }, get crossingRocks() { return fieldShower; },
    get boulder() { return fieldBoulder; }, get lateRocks() { return lateAsteroids; },
    get nextObstacle() { return nextShowerObstacle; }
  };
}
