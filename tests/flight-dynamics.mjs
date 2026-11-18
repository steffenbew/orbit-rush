// Run from the project root: node tests/flight-dynamics.mjs
import assert from 'node:assert/strict';
import { THREE, section, randomState, makeGame, hazardInterval, makeFlightClock } from './helpers/flight-game.mjs';

const full = process.env.ORBIT_TEST_FULL === '1';

const updateFov = new Function('camera', 'started', 'reducedMotion', 'speed', `
  ${section('    camera.fov = started && !reducedMotion', '    danger = false;')}
`);
for (const started of [false, true]) for (const reduced of [false, true]) {
  const camera = new THREE.PerspectiveCamera(110);
  for (const speed of [0, 250, 500, 1000, 3000, 0]) {
    updateFov(camera, started, reduced, speed);
    assert.equal(camera.fov, started && !reduced ? 90 : 70, 'Acceleration and level resets cannot zoom the camera');
  }
}
console.log('PASS fixed gameplay FOV, unchanged menu/reduced-motion FOV and no speed-based zoom');

const game = makeGame();
game.flightMotion.set(0, 0, -400);
const ship = game.ships[0];
game.flightMotion.set(0, 0, -480 * 205 / 180); // Preserve the cruise scenario's relative speed as opening traffic speeds up.
let minSpeed = Infinity, maxSpeed = 0, minSide = Infinity, maxSide = -Infinity;
let minThrust = Infinity, maxThrust = 0;
game.resetShip(ship, true); // Exercise cruising after the distant approach has finished.
for (let frame = 0; frame < 1200; frame++) {
  game.updateShipCourse(ship, 1 / 60);
  const velocity = ship.userData.courseVelocity;
  const forward = velocity.dot(ship.userData.cruiseDirection);
  minSpeed = Math.min(minSpeed, forward); maxSpeed = Math.max(maxSpeed, forward);
  minSide = Math.min(minSide, velocity.x); maxSide = Math.max(maxSide, velocity.x);
  minThrust = Math.min(minThrust, ship.userData.engineThrust); maxThrust = Math.max(maxThrust, ship.userData.engineThrust);
  assert.ok(velocity.toArray().every(Number.isFinite));
}
assert.ok(minSpeed > 0 && maxSpeed - minSpeed > 50, 'Cruising and acceleration must vary');
assert.ok(minSide < -5 && maxSide > 5, 'Ships must still make gentle course changes');
assert.ok(Math.max(Math.abs(minSide), Math.abs(maxSide)) <= 35, 'Ordinary traffic should not sweep across the screen');
assert.ok(maxThrust - minThrust > .3, 'Flight AI acceleration must actually drive the engine visuals');
console.log('PASS cruising, acceleration, thrust response and lateral maneuvers');
game.flightMotion.set(0, 0, -400);

// A direct obstruction produces a lateral avoidance request.
const rock = game.ships[4];
game.resetShip(rock); game.resetShip(ship);
ship.position.set(0, 0, -400); rock.position.set(0, 0, -500);
rock.userData.courseVelocity.set(0, 0, 0); rock.scale.setScalar(1.3);
game.activeAsteroids.push(rock);
const desired = new THREE.Vector3(0, 0, -200);
game.avoidAsteroids(ship, desired);
assert.ok(Math.abs(desired.x) > 1, 'Threatened ships must attempt to dodge');

// Sweep right through an actual hull in one frame, then verify recycling exactly once.
for (const item of game.ships) item.visible = false;
ship.visible = rock.visible = true;
ship.userData.previousPosition.set(0, 0, -400); ship.position.set(0, 0, -600);
rock.userData.previousPosition.copy(rock.position);
const queuedBefore = game.queue.length;
game.collideShipsWithAsteroids();
assert.equal(ship.visible, false); assert.equal(rock.visible, false);
assert.equal(ship.userData.health, 0);
assert.equal(game.queue.length, queuedBefore + 2);
game.collideShipsWithAsteroids();
assert.equal(game.queue.length, queuedBefore + 2);
assert.ok(game.explosions.some(args => args[1] === 65));
console.log('PASS asteroid avoidance, swept collisions, explosions and single recycling');

for (const reducedMotion of [false, true]) {
  const courses = makeGame(reducedMotion);
  const rock = courses.ships[4];
  let left = 0, right = 0, stationary = 0, gentle = 0, diagonal = 0, up = 0, down = 0;
  const sampleCount = 300;
  for (let sample = 0; sample < sampleCount; sample++) {
    courses.flightOrientation.set(.2, -.4, 0, 'YXZ');
    courses.flightMotion.set(0, 0, -400).applyEuler(courses.flightOrientation);
    courses.resetShip(rock);
    const data = rock.userData;
    assert.ok(reducedMotion ? data.spin.lengthSq() === 0 : data.spin.length() >= .04 - 1e-8 && data.spin.length() <= .6 + 1e-8,
      'Loose rocks receive varied potential spin rates, disabled in reduced motion');
    const velocity = data.courseVelocity.clone();
    const lateral = velocity.dot(data.courseRight);
    const vertical = velocity.dot(data.courseUp);
    const speed = courses.flightMotion.length() * .85;
    const movement = reducedMotion ? .25 : 1;
    const time = rock.position.dot(data.cruiseDirection) / speed;
    const crossingSpeed = Math.max(speed * .28 * movement,
      Math.hypot(data.lane, data.height) * (reducedMotion ? 1.5 : 2.5) / time);
    if (velocity.lengthSq() === 0) stationary++;
    else {
      if (lateral < 0) left++; else right++;
      if (vertical < 0) down++; else up++;
      if (Math.abs(lateral) < speed * .1 * movement) {
        gentle++;
        assert.ok(Math.abs(lateral) >= speed * .01 * movement - 1e-8);
        assert.ok(Math.abs(lateral) <= speed * .05 * movement + 1e-8);
        assert.ok(Math.abs(vertical) <= speed * .02 * movement + 1e-8);
      } else {
        diagonal++;
        assert.ok(Math.abs(lateral) >= speed * .1 * movement - 1e-8);
        assert.ok(Math.abs(lateral) <= crossingSpeed + 1e-8);
        assert.ok(Math.abs(vertical) <= crossingSpeed * .5 + 1e-8);
      }
    }
    assert.ok(Math.abs(velocity.dot(data.cruiseDirection)) < 1e-8, 'Drift must follow the spawn heading, not world X');
    const pass = rock.position.clone().addScaledVector(velocity, time)
      .addScaledVector(courses.flightMotion, -.85 * time);
    const intended = data.courseRight.clone().multiplyScalar(data.lane).addScaledVector(data.courseUp, data.height);
    assert.ok(pass.distanceTo(intended) < 1e-8, 'Crossings and background drift must preserve their off-axis pass points');
    assert.ok(data.dangerousCrossing ? intended.length() >= 14 - 1e-8 && intended.length() <= 20 + 1e-8
      : intended.length() >= data.type.radius * rock.scale.x + 12 - 1e-8,
      'Mix real wing intersections with near-passes, without aiming at the camera center');
    if (velocity.lengthSq() <= 25) assert.ok(intended.length() >= 60 - 1e-8, 'Stationary/slow rocks stay outside the central approach lane');
    assert.ok(data.previousPosition.equals(rock.position), 'Spawn compensation must not look like a swept teleport');
    courses.target.set(-1, 1); courses.flightMotion.set(-200, 100, -400);
    courses.flightOrientation.set(-.3, .5, 0, 'YXZ');
    courses.updateShipCourse(rock, .5);
    assert.ok(data.courseVelocity.equals(velocity), 'Asteroids must not steer after the player');
  }
  assert.ok(left > 15 && right > 15 && up > 15 && down > 15,
    'Moving asteroids should retain directional variety');
  assert.ok(stationary > sampleCount * .05 && stationary < sampleCount * .2,
    `Retain some stationary background rocks, got ${stationary}/${sampleCount}`);
  assert.ok(gentle > sampleCount * .15 && gentle < sampleCount * .35,
    `Retain gentle off-axis drift, got ${gentle}/${sampleCount}`);
  assert.ok(diagonal > sampleCount * .5 && diagonal < sampleCount * .8,
    `Close approaches should visibly cross rather than fly head-on, got ${diagonal}/${sampleCount}`);
}
console.log('PASS diagonal loose-rock passes, calm off-axis background rocks, fixed trajectories and reduced motion');

// A nonzero velocity alone is not enough: an exact interception can still have constant screen bearing.
for (const reducedMotion of [false, true]) for (const speed of reducedMotion ? [35, 55] : [180, 600, 1100]) {
  const crossing = makeGame(reducedMotion); crossing.setLevel(3);
  crossing.camera.position.set(20, -10, 5);
  crossing.flightOrientation.set(.2, -.4, 0, 'YXZ');
  crossing.camera.quaternion.setFromEuler(crossing.flightOrientation); crossing.camera.updateMatrixWorld();
  crossing.flightMotion.set(0, 0, -speed).applyEuler(crossing.flightOrientation);
  const rock = crossing.ships[4];
  for (const aspect of [16 / 9, 430 / 932]) for (let sample = 0; sample < 20; sample++) {
    crossing.camera.aspect = aspect; crossing.camera.updateProjectionMatrix(); crossing.resetShip(rock);
    const time = Math.max(3, crossing.asteroidArrivalDistance(rock) / (speed * .85));
    rock.position.copy(crossing.camera.position).addScaledVector(crossing.flightMotion, .85 * time);
    crossing.setAsteroidCrossing(rock, time, false);
    const start = rock.position.clone().project(crossing.camera);
    const middle = rock.position.clone().addScaledVector(rock.userData.courseVelocity, time * .75)
      .addScaledVector(crossing.flightMotion, -.85 * time * .75).project(crossing.camera);
    const end = rock.position.clone().addScaledVector(rock.userData.courseVelocity, time * .9)
      .addScaledVector(crossing.flightMotion, -.85 * time * .9).project(crossing.camera);
    assert.ok(start.x * end.x < 0, 'Crossings must travel from one side of the view to the other');
    assert.ok(Math.abs(middle.x - start.x) > (reducedMotion ? .04 : .08),
      'The trajectory must visibly change screen bearing well before the close pass');
  }
}
console.log('PASS visible screen-space crossings, not constant-bearing impacts, at slow/fast speeds and portrait/landscape');

for (const corridor of [false, true]) {
  game.setupLevelFleet();
  const field = game.shower(corridor, 2);
  const active = field.pool.filter(item => item.visible);
  assert.ok(active.length >= (corridor ? 16 : 9));
  assert.ok(active.every(item => item.userData.hull.transparent && item.userData.hull.opacity === 0));
  if (corridor) assert.ok(active.every(item => item.userData.courseVelocity.equals(field.velocity)), 'Corridor rocks must drift together without closing their safe gaps');
  assert.ok(active.every(item => item.userData.hull.onBeforeCompile === game.asteroidShader),
    'Pooled/cloned materials must keep the distance-fade shader');
  assert.ok(field.width <= 1800, 'Field width must not scale with distant view width');
  assert.ok(field.end - field.entry <= 20, 'Encounter duration excludes its distant approach');
  assert.equal(field.grit.material.transparent, false, 'Instances must not use unsorted transparent blending');
  assert.equal(field.grit.material.alphaHash, true, 'Discard faded samples instead of leaving invisible occluders');
  assert.equal(field.grit.material.depthWrite, true, 'Debris must depth-test against other instances and real rocks');
  const matrix = new THREE.Matrix4(), gritPosition = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  for (let i = 0; i < field.grit.count; i++) {
    field.grit.getMatrixAt(i, matrix); matrix.decompose(gritPosition, rotation, scale);
    assert.ok(Math.max(scale.x, scale.y, scale.z) <= (corridor ? 26 * 1.7 : 3.4) + 1e-5,
      'Corridor boulders stay bounded; free showers retain their fine grit');
    if (corridor) assert.ok(Math.abs(gritPosition.y - game.corridorCenter(-gritPosition.z)) - Math.max(scale.x, scale.y, scale.z) >= field.gap + 6 - 1e-4,
      'Dense ring layers must still leave the full flight slit clear');
  }
  assert.equal(field.grit.material.opacity, 0);
  assert.ok(active.every(item => item.position.distanceTo(game.camera.position) - item.userData.type.radius * item.scale.x > 3600),
    'Slanted streams must still spawn wholly beyond the distance fade');
  const localPosition = rock => rock.position.clone().sub(field.origin).applyQuaternion(field.rotation.clone().invert());
  if (corridor) {
    const walls = active.filter(item => Math.abs(localPosition(item).y) >= field.gap);
    assert.equal(walls.length, 16);
    assert.ok(walls.every(item => Math.abs(localPosition(item).y) - item.userData.type.radius * item.scale.x >= field.gap));
    assert.equal(field.grit.count, 12000);
  } else {
    assert.ok(active.every(item => Math.abs(localPosition(item).y) <= 380), 'Free showers retain their scatter volume along the stream axes');
  }
  const position = field.origin.clone();
  game.setPaused(true); game.worldStep.set(20, 0, 100); game.updateAsteroidShower();
  assert.ok(field.origin.equals(position));
  assert.equal(field.grit.material.opacity, 0, 'Pause must freeze the fade too');
  game.setPaused(false); game.setTime(field.end + .1); game.updateAsteroidShower();
  assert.ok(field.grit.visible, 'The distant tail must not disappear on a timer');
  assert.ok(field.origin.x > position.x, 'The field must move through space with the world');
}
console.log('PASS narrower/shorter fields, transparent arrivals, pause and spatial tail');

for (const reducedMotion of [false, true]) {
  const corridor = makeGame(reducedMotion);
  for (const level of full ? [1, 5, 15, 40] : [1]) {
    for (const strength of [0, 1, 2]) {
      corridor.setLevel(level); corridor.setupLevelFleet();
      const field = corridor.shower(true, strength);
      const expectedGap = reducedMotion ? 34 - strength * 4 : 52 - strength * 7;
      assert.equal(field.gap, expectedGap, 'Passage difficulty is capped by strength, not narrowed indefinitely by level');
      assert.equal(field.width, 1800, 'Keep the core width fixed rather than scaling with the viewport');
      const walls = field.pool.filter(rock => rock.visible);
      assert.equal(walls.length, [8, 12, 16][strength]);
      for (const rock of walls) {
        const local = rock.position.clone().sub(field.origin).applyQuaternion(field.rotation.clone().invert());
        const offset = Math.abs(local.y) - rock.userData.type.radius * rock.scale.x - field.gap;
        const fringe = THREE.MathUtils.smoothstep(Math.abs(local.x), 540, 1450);
        assert.ok(Math.abs(local.x) <= 1450, 'Shootable walls also taper into the side fringe');
        assert.ok(offset >= -1e-8 && offset <= 70 + fringe * 80 + 1e-8,
          'Loosen the ring layers while keeping wall rocks outside the flight gap');
      }
      assert.equal(field.grit.count, [7200, 9600, 12000][strength]);
      assert.equal(field.grit.instanceMatrix.count, 12000, 'Dense layers still use a fixed instance budget');
      const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
      const cells = [Array(64).fill(0), Array(64).fill(0)], sizes = [];
      const density = Array(5).fill(0), outliers = [0, 0];
      let looseCore = 0;
      for (let i = 0; i < field.grit.count; i++) {
        field.grit.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
        const side = i % 2, offset = Math.abs(position.y) - field.gap - scale.x * 1.7;
        assert.equal(Math.sign(position.y), side ? 1 : -1);
        assert.ok(scale.x >= 4 - 1e-5 && scale.x <= 26 + 1e-5);
        const distance = Math.abs(position.x), fringe = THREE.MathUtils.smoothstep(distance, 540, 1450);
        assert.ok(distance <= 1450, 'The scattered fringe stays bounded in world space');
        assert.ok(offset >= 6 - 1e-4 && offset <= 65 + fringe * 100 + 1e-4,
          'Gravel layers gain depth toward the fringes but never enter the flight gap');
        if (distance < 540 && offset > 36) looseCore++;
        density[Math.min(4, Math.floor(distance / 290))]++;
        if (distance > 900) outliers[position.x < 0 ? 0 : 1]++;
        const column = Math.min(7, Math.floor((position.x / (field.width + 1100) + .5) * 8));
        const row = Math.min(7, Math.floor(-position.z / field.length * 8));
        cells[side][row * 8 + column]++;
        sizes.push(scale.x);
      }
      for (const side of cells) {
        assert.equal(side.reduce((sum, count) => sum + count, 0), field.grit.count / 2);
        assert.ok(side.every(count => count > 0), 'Both ring layers must extend through the fringe along the whole field');
        assert.ok(side.every((count, cell) => cell % 8 < 2 || cell % 8 > 5 || count >= 10), 'Keep a recognizable dense ring core');
      }
      assert.ok(outliers.every(count => count > field.grit.count * .05), 'Scatter rocks beyond both old cut-off edges');
      assert.ok(density[0] > density[2] * 1.1 && density[2] > density[3] * 1.3 && density[3] > density[4] * 1.8,
        'Density must taper progressively toward both outer edges, not form another hard wall');
      assert.ok(looseCore > field.grit.count * .15, 'Spread out the central layers too, not just the side fringe');
      assert.ok(Math.max(...sizes) - Math.min(...sizes) > 21, 'Mix small rubble with substantially larger boulders');
      assert.ok(sizes.filter(size => size > 18).length > field.grit.count * .1, 'Large boulders must be common enough to notice');
      assert.ok(sizes.filter(size => size < 10).length > field.grit.count * .6, 'Keep small rubble rather than replacing the entire ring with giants');
    }
  }
}
console.log('PASS uneven ring layers, progressively scattered side fringes, original narrow flight passage and bounded instance budget');

for (const reducedMotion of [false, true]) {
  const fading = makeGame(reducedMotion);
  fading.setupLevelFleet();
  const field = fading.shower(true, 2);
  const rock = field.pool.find(item => item.visible);
  assert.equal(rock.userData.hull.opacity, 0);
  fading.updateShipCourse(rock, .15);
  assert.ok(Math.abs(rock.userData.hull.opacity - .5) < .001);
  fading.updateShipCourse(rock, .15);
  assert.equal(rock.userData.hull.opacity, 1, 'Nearby hazards must become fully solid');
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  fading.fadeAsteroidShader(shader);
  const band = shader.fragmentShader.match(/1\.0 - smoothstep\((\d+)\.0, (\d+)\.0, length\(vViewPosition\)\)/);
  assert.ok(band);
  assert.deepEqual(band.slice(1).map(Number), reducedMotion ? [400, 700] : [2600, 3600]);
  for (const distance of [reducedMotion ? 350 : 650, 250, 100, 10, 0, -10]) {
    assert.equal(1 - THREE.MathUtils.smoothstep(Math.abs(distance), Number(band[1]), Number(band[2])), 1,
      'The real shader must stay fully opaque throughout close approaches and passes');
    rock.position.set(0, 0, -distance);
    fading.updateShipCourse(rock, 1);
    assert.equal(rock.userData.hull.opacity, 1, 'Approaching and passing rocks must not fade out');
    assert.equal(fading.hasPassedCamera(rock), false, 'Keep close rocks until their full hull passes behind');
  }
  fading.queueShip(rock);
  assert.equal(fading.eventAsteroid(), rock, 'Reuse inactive rocks rather than allocate new models');
  assert.equal(rock.userData.hull.opacity, 0, 'Reused rocks must restart the fade');
  fading.setTime(field.start + .15); fading.updateAsteroidShower();
  assert.ok(Math.abs(field.grit.material.opacity - .5) < .001);
}
for (const reducedMotion of [false, true]) {
  const arrivals = makeGame(reducedMotion);
  arrivals.setLevel(3);
  const rock = arrivals.ships[4], tiers = new Set();
  for (const speed of reducedMotion ? [35, 55] : [180, 600, 1100]) {
    arrivals.flightMotion.set(0, 0, -speed);
    for (let sample = 0; sample < 40; sample++) {
      arrivals.resetShip(rock);
      tiers.add(rock.userData.asteroidTier);
      const minimum = arrivals.asteroidArrivalDistance(rock);
      assert.ok(rock.position.dot(rock.userData.cruiseDirection) >= minimum + speed * .85 * .3 - 1e-8);
      assert.equal(rock.userData.hull.opacity, 0);
      const fadeBoundary = reducedMotion ? 700 : 3600;
      assert.ok(minimum - rock.userData.type.radius * rock.scale.x >= fadeBoundary + 200,
        'The whole hull of every size starts beyond the fully invisible distance boundary');
      for (let tick = 0; tick < 18; tick++) {
        arrivals.updateShipCourse(rock, 1 / 60);
        rock.position.addScaledVector(arrivals.flightMotion, -.85 / 60)
          .addScaledVector(rock.userData.courseVelocity, 1 / 60);
      }
      assert.ok(rock.userData.hull.opacity > .999999, 'Every tier must finish its spawn blend in 0.3 seconds');
      assert.ok(rock.position.dot(rock.userData.cruiseDirection) >= minimum - 1e-6,
        'Bigger rocks must still be distant when the spawn blend finishes');
    }
  }
  assert.equal(tiers.size, 3);
  for (const level of [1, 3, 15]) {
    arrivals.setLevel(level); arrivals.setupLevelFleet();
    arrivals.setTime(2); arrivals.flightMotion.set(0, 0, -arrivals.levelFlightSpeed(2 / 45));
    for (let sample = 0; sample < (full ? 30 : 2); sample++) {
      arrivals.setupLevelFleet(); arrivals.updateCollisionHazard();
      const hazard = arrivals.hazardPool.find(rock => rock.visible);
      assert.ok(hazard);
      const time = hazard.userData.approachTime;
      assert.ok(time >= 3 && Math.abs(time * 60 - Math.round(time * 60)) < 1e-8);
      assert.ok(time >= arrivals.asteroidArrivalDistance(hazard) / (-arrivals.flightMotion.z * .85),
        'Even small/reduced-motion threats need a distant approach, not a fixed three-second near spawn');
      const predicted = hazard.position.clone().addScaledVector(hazard.userData.courseVelocity, time);
      assert.ok(predicted.length() >= arrivals.asteroidArrivalDistance(hazard) - 1e-6,
        'Scheduled rocks also need a distant starting point');
      assert.ok(hazard.position.distanceTo(arrivals.camera.position) - hazard.userData.type.radius * hazard.scale.x
        > (reducedMotion ? 700 : 3600), 'Actual scheduled hulls—not only their forecast pass points—start outside visibility');
      assert.equal(arrivals.nextHazardTime, 2 + hazardInterval, 'Longer approaches must not accelerate the reduced spawn cadence');
    }
  }
}
console.log('PASS distant 0.3-second blends for every regular/hazard size, including reduced motion');

const rockShader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
game.fadeAsteroidShader(rockShader);
assert.ok(rockShader.fragmentShader.includes('1.0 - smoothstep(2600.0, 3600.0, length(vViewPosition))'));
assert.ok(rockShader.fragmentShader.includes('if (diffuseColor.a < 0.003) discard;'));
const gritShader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
const shaderField = makeGame(); shaderField.setupLevelFleet();
shaderField.shower(true, 2).grit.material.onBeforeCompile(gritShader);
assert.equal(gritShader.fragmentShader, rockShader.fragmentShader,
  'Background rocks must use the same far-only fade as solid collision rocks, with no close-range dissolve');
console.log('PASS smooth arrivals and reuse, fully solid close passes, no near fade in shower rocks');

for (const corridor of [false, true]) {
  for (const speed of full ? [40, 200, 900] : [corridor ? 40 : 900]) {
    const bounded = makeGame(speed === 40);
    // Fast travel belongs to a fast level: field layout is now fixed before takeoff.
    if (speed === 900) bounded.setLevel(15);
    bounded.flightMotion.set(0, 0, -speed); bounded.camera.aspect = 32 / 9;
    bounded.setupLevelFleet();
    const field = bounded.shower(corridor, 2);
    const start = field.start, seenSpawns = new Map();
    // Authored slow-mode corridors are visible earlier, but still leave four seconds to react.
    const spawnClearance = speed === 40 ? speed * .85 * 4 : 3600;
    let peak = 0;
    for (let frame = 0; frame < 90 * 60; frame++) {
      bounded.setTime(start + frame / 60);
      bounded.worldStep.set(0, 0, speed / 60);
      bounded.updateAsteroidShower(1 / 60);
      const active = field.pool.filter(item => item.visible);
      peak = Math.max(peak, active.length);
      for (const rock of active) {
        if (seenSpawns.get(rock) !== rock.userData.spawn) {
          seenSpawns.set(rock, rock.userData.spawn);
          assert.ok(rock.position.distanceTo(bounded.camera.position) - rock.userData.type.radius * rock.scale.x > spawnClearance,
            `Every shower slice must have safe lead: corridor=${corridor}, speed=${speed}, frame=${frame}, distance=${rock.position.distanceTo(bounded.camera.position) - rock.userData.type.radius * rock.scale.x}`);
        }
        bounded.updateShipCourse(rock, 1 / 60);
        rock.position.addScaledVector(bounded.worldStep, .85).addScaledVector(rock.userData.courseVelocity, 1 / 60);
        if (rock.userData.courseAge <= .3) assert.ok(rock.position.distanceTo(bounded.camera.position)
          - rock.userData.type.radius * rock.scale.x > spawnClearance - speed * .85 * .3, 'Finish the timed blend with the full reaction margin remaining');
        if (bounded.hasPassedCamera(rock)) bounded.queueShip(rock);
      }
    }
    assert.ok(peak > 0 && peak <= bounded.maxShowerRocks);
    assert.ok(field.pool.length <= 144, 'Even slow/ultrawide flights must have a bounded collision pool');
    assert.ok(field.width <= 1800);
    assert.ok(field.pool.length < 144, 'Normal straight flight should not exhaust the pool and create gaps');
    assert.equal(field.grit.visible, false, 'The tail must eventually leave spatially');
    bounded.setupLevelFleet();
    assert.ok(field.pool.every(rock => !rock.visible), 'Retry must hide every pooled rock');
    // Steering can keep old rocks ahead for longer: enforce the hard budget even then.
    for (let i = 0; i < 200; i++) bounded.eventAsteroid();
    assert.equal(field.pool.length, 144);
    assert.equal(bounded.eventAsteroid(), null);
  }
}
console.log('PASS distant shower spawns/blends across all slices, slow/fast flights, ultrawide, reuse and bounded pools');

const turning = makeGame(); turning.setupLevelFleet();
const turningField = turning.shower(true, 2);
turning.camera.rotation.y = -.7; turning.camera.updateMatrixWorld();
turningField.origin.set(4500, 0, turningField.length + 750);
turning.updateAsteroidShower();
assert.ok(turningField.grit.visible, 'Turning can keep the field in view after its original travel-axis cutoff');
const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4()
  .multiplyMatrices(turning.camera.projectionMatrix, turning.camera.matrixWorldInverse));
assert.ok(frustum.intersectsBox(turningField.grit.boundingBox.clone().applyMatrix4(turningField.grit.matrixWorld)),
  'The retained field must really intersect the camera view');
turningField.origin.set(0, 0, turningField.length + 10000);
turning.updateAsteroidShower();
assert.equal(turningField.grit.visible, false, 'A fully passed field should still be cleaned up');
console.log('PASS camera-relative full-field cleanup without visible edges disappearing during turns');

game.setLevel(4); game.setupLevelFleet(); game.activeAsteroids.length = 0;
const boss = game.capital;
game.resetShip(boss);
assert.equal(boss.userData.maxHealth, 60, 'The boss has twice its previous 30-hit armor');
assert.equal(boss.userData.health, boss.userData.maxHealth);
assert.ok(boss.position.z <= -4200);
const materials = boss.userData.flashMaterials;
const flame = boss.userData.flames[0].material;
const flameColor = flame.color.getHex();
const originalHullColor = game.ships[0].userData.hull.color.getHex();
boss.userData.hitFlash = .2; game.updateShipHitFlash(boss);
assert.ok(materials.every(entry => entry.material.color.equals(entry.color.clone().lerp(new THREE.Color(0xff344f), .2 / .22 * .28))),
  'The red hit tint blends with the original material instead of replacing it');
assert.notEqual(flame.color.getHex(), flameColor);
assert.equal(game.ships[0].userData.hull.color.getHex(), originalHullColor);
boss.userData.hitFlash = 0; game.updateShipHitFlash(boss);
assert.equal(flame.color.getHex(), flameColor);
console.log('PASS distant capital arrival and isolated full-model red hit flash, including engines');

let left = Infinity, right = -Infinity, down = Infinity, up = -Infinity, near = Infinity, far = 0;
let attackFrames = 0, maxLateralSpeed = 0;
for (let frame = 0; frame < 1800; frame++) {
  game.updateCapitalShip(boss, 1 / 60);
  boss.position.addScaledVector(boss.userData.courseVelocity, 1 / 60).addScaledVector(game.flightMotion, -.85 / 60);
  maxLateralSpeed = Math.max(maxLateralSpeed, Math.abs(boss.userData.courseVelocity.x));
  if (frame < 900) continue;
  if (-boss.position.z < 2200) attackFrames++;
  left = Math.min(left, boss.position.x); right = Math.max(right, boss.position.x);
  down = Math.min(down, boss.position.y); up = Math.max(up, boss.position.y);
  near = Math.min(near, -boss.position.z); far = Math.max(far, -boss.position.z);
}
assert.ok(left < -100 && right > 100 && up - down > 75 && far - near > 1000);
assert.ok(maxLateralSpeed < 90, 'Sideways maneuvers should leave readable firing opportunities');
assert.ok(attackFrames > 5 * 60, 'The attack phase needs time for slower shots to arrive');
assert.ok(near > 1500 && far > 3100 && far < 3800, `The boss must alternate distant retreats and attack runs, got ${near}–${far}`);
assert.equal(game.enemyBolts.length, 0, 'Off-screen capital ships must not fire');
console.log('PASS capital maneuvers left/right, up/down and near/far without teleporting');

for (const item of game.ships) item.visible = false;
boss.visible = rock.visible = true;
boss.position.set(0, 0, -1500); boss.userData.previousPosition.copy(boss.position);
rock.position.copy(boss.position); rock.userData.previousPosition.copy(rock.position);
rock.scale.setScalar(2.8); rock.userData.asteroidTier = 3;
game.activeAsteroids.push(rock);
game.collideShipsWithAsteroids();
assert.equal(boss.userData.health, boss.userData.maxHealth);
rock.visible = true; game.collideShipsWithAsteroids();
assert.equal(boss.userData.health, boss.userData.maxHealth, 'Asteroids cannot damage boss armor');
assert.equal(rock.visible, false, 'The boss still destroys colliding rocks');
assert.equal(boss.visible, true);
boss.userData.health = 3; rock.visible = true;
const destructionStart = game.explosions.length;
game.collideShipsWithAsteroids();
const capitalExplosion = game.explosions.slice(destructionStart).find(args => args[1] === 65);
assert.equal(capitalExplosion, undefined, 'Asteroids cannot destroy a nearly defeated boss');
assert.equal(boss.userData.health, 3);
assert.equal(boss.visible, true);
game.activeAsteroids.length = 0; game.resetShip(boss);
console.log('PASS capital immunity to environmental damage, including at low health');

for (const engineShip of [game.ships[0], game.ships[1], game.ships[2], boss]) {
  game.resetShip(engineShip);
  engineShip.position.set(0, 0, -500); // Test thrust where the arrival fade has finished.
  const data = engineShip.userData;
  const flame = data.flames[0];
  const core = flame.userData.core;
  const plume = flame.userData.plume;
  const hullBox = data.collisionBox.clone();
  data.courseVelocity.copy(data.cruiseDirection).multiplyScalar(170);
  for (let frame = 0; frame < 120; frame++) game.updateEngineThrust(engineShip, 170, 1 / 60);
  game.updateShipHitFlash(engineShip);
  const cruising = { thrust: data.engineThrust, size: flame.scale.x, length: plume.scale.z,
    light: core.material.emissiveIntensity, opacity: flame.material.opacity };
  let forward = 170;
  for (let frame = 0; frame < 60; frame++) {
    data.courseVelocity.copy(data.cruiseDirection).multiplyScalar(forward + 2);
    game.updateEngineThrust(engineShip, forward, 1 / 60);
    forward += 2;
  }
  game.updateShipHitFlash(engineShip);
  assert.ok(data.engineThrust > .95, 'Actual acceleration must visibly ignite the drives');
  assert.ok(flame.scale.x > cruising.size * 1.3);
  assert.ok(plume.scale.z > cruising.length * 1.6);
  assert.ok(core.material.emissiveIntensity > cruising.light * 1.5);
  assert.ok(flame.material.opacity > cruising.opacity);
  assert.ok(data.collisionBox.equals(hullBox), 'Long flames must not enlarge the collision hull');
  assert.ok(plume.children.every(ribbon => ribbon.userData.engineExhaust));
  let solidParts = 0;
  engineShip.traverse(part => { if (part.isMesh && !part.userData.engineExhaust) solidParts++; });
  assert.equal(data.collisionParts.length, solidParts, 'Exhaust ribbons must be excluded from hull collision geometry');
  const boost = data.engineThrust;
  game.updateEngineThrust(engineShip, forward, 0);
  assert.equal(data.engineThrust, boost, 'Zero-duration frames must not corrupt engine state');
  for (let frame = 0; frame < 180; frame++) game.updateEngineThrust(engineShip, forward, 1 / 60);
  game.updateShipHitFlash(engineShip);
  assert.ok(data.engineThrust < boost - .3, 'Boost must ease off when acceleration stops');
  game.resetShip(engineShip);
  assert.equal(data.engineThrust, .25);
}
console.log('PASS acceleration-driven engine glow, longer exhaust, cooldown and reset on all ship types');

// Boosted exhaust must still join the capital ship\'s full red hit flash.
boss.userData.engineThrust = 1; boss.userData.hitFlash = .2; game.updateShipHitFlash(boss);
assert.ok(boss.userData.flashMaterials.every(entry => entry.material.color.equals(entry.color.clone().lerp(new THREE.Color(0xff344f), .2 / .22 * .28))));
boss.userData.hitFlash = 0; game.updateShipHitFlash(boss);
assert.ok(boss.userData.flashMaterials.every(entry => entry.material.color.equals(entry.color)));
game.resetShip(boss);

boss.position.set(0, -50, -1500); boss.userData.lastVisibleTime = 0;
boss.userData.fireCooldown = 0; game.setTime(0);
game.updateCapitalShip(boss, 1 / 60);
assert.equal(game.enemyBolts.length, 2);
assert.equal(boss.userData.fireCooldown, 3.4, 'Leave a longer gap between volleys');
for (const bolt of game.enemyBolts) {
  assert.ok(Math.abs(bolt.velocity.length() - (400 + 420) * 1.2) < 1e-8);
  assert.equal(bolt.object.children[0].geometry, game.enemyBolts[0].object.children[0].geometry);
  assert.equal(bolt.object.children[0].material.color.getHex(), 0xff3344);
}
const bolt = game.enemyBolts[0];
const position = bolt.object.position.clone();
game.setPaused(true); game.updateEnemyBolts(.5);
assert.ok(bolt.object.position.equals(position));
game.setPaused(false);
// Fixed velocity: later steering must not retarget a projectile.
const velocity = bolt.velocity.clone(); game.flightMotion.x = 200; game.worldStep.set(-2, 0, 4);
game.updateEnemyBolts(.01);
assert.ok(bolt.velocity.equals(velocity));
// Even an artificially large frame must register a laser crossing the player.
game.clearEnemyBolts();
const object = new THREE.Group(); object.position.set(0, 0, -30); object.userData.enemyBolt = true;
game.enemyBolts.push({ object, velocity: new THREE.Vector3(0, 0, 1000), age: 0 });
game.worldStep.set(0, 0, 0); game.updateEnemyBolts(.06);
assert.equal(game.enemyBolts.length, 0); assert.equal(game.hits.length, 1);
console.log('PASS red laser speed, pause, non-homing trajectories and swept laser collisions');

const reduced = makeGame(true);
reduced.setLevel(4); reduced.setupLevelFleet();
reduced.resetShip(reduced.capital); reduced.updateCapitalShip(reduced.capital, .05);
assert.ok(reduced.capital.userData.courseVelocity.toArray().every(Number.isFinite));
reduced.setupLevelFleet();
assert.ok(reduced.ships.filter(item => item.userData.shower || item.userData.type.capital).every(item => !item.visible));
assert.equal(reduced.enemyBolts.length, 0);
console.log('PASS reduced-motion initialization and level reset');

const cadence = makeGame();
for (let level = 1; level <= 16; level++) {
  cadence.setLevel(level); cadence.setTime(0); cadence.setupLevelFleet();
  const expected = level % 4 === 0;
  assert.equal(cadence.capitalPending, expected, `Unexpected boss schedule for level ${level}`);
  assert.ok(!cadence.capital?.visible);
  assert.ok(cadence.queue.every(ship => !ship.userData.type.capital));
  cadence.setTime(5.99); cadence.updateShipArrivals();
  assert.ok(!cadence.capital?.visible, 'Even scheduled bosses must wait for their arrival');
  cadence.setTime(6); cadence.setPaused(true); cadence.updateShipArrivals();
  assert.ok(!cadence.capital?.visible, 'Pause must hold the boss arrival');
  cadence.setPaused(false); cadence.updateShipArrivals();
  assert.equal(!!cadence.capital?.visible, expected);
  assert.equal(cadence.capitalPending, false);
  if (expected) {
    assert.equal(cadence.capital.userData.health, 60);
    const spawn = cadence.capital.userData.spawn;
    cadence.capital.userData.health = 0; cadence.queueShip(cadence.capital);
    cadence.setTime(7.5); cadence.updateShipArrivals();
    assert.equal(cadence.capital.visible, false, 'A defeated boss must not respawn in the same attempt');
    assert.equal(cadence.capital.userData.spawn, spawn);
    // A retry of a boss level restores exactly one fresh encounter.
    cadence.setTime(0); cadence.setupLevelFleet();
    cadence.setTime(6); cadence.updateShipArrivals();
    assert.equal(cadence.capital.visible, true);
    assert.equal(cadence.capital.userData.health, 60);
    assert.equal(cadence.capital.userData.spawn, spawn + 1);
  }
  if (level < 4) assert.equal(cadence.capital, null);
}
assert.equal(cadence.ships.filter(ship => ship.userData.type.capital).length, 1);
console.log('PASS boss only on levels 4/8/12/16, pause, single encounter, retry and model reuse');

const threats = makeGame(false, false); threats.setupLevelFleet();
threats.flightMotion.set(0, 0, -threats.levelFlightSpeed(0));
threats.setTime(1.99); threats.updateCollisionHazard();
assert.equal(threats.hazardPool.length, 0);
threats.setTime(2); threats.updateShipArrivals(); // Exercise the actual arrivals phase at cruise speed.
assert.equal(threats.hazardPool.length, 1);
const hazard = threats.hazardPool[0];
assert.equal(threats.nextHazardTime, 2 + hazardInterval);
assert.equal(hazard.userData.asteroidTier, 1);
assert.equal(hazard.userData.hull.opacity, 0, 'Scheduled threats must also fade in');
const passPoint = hazard.position.clone().addScaledVector(hazard.userData.courseVelocity, hazard.userData.approachTime);
assert.ok(Math.abs(passPoint.x - hazard.userData.lane) < 1e-8 && Math.abs(passPoint.y - hazard.userData.height) < 1e-8,
  'Scheduled crossings must pass beside the forecast flight path, not target the camera');
assert.ok(Math.hypot(passPoint.x, passPoint.y) >= hazard.userData.type.radius * hazard.scale.x + 12);
assert.ok(hazard.position.x * passPoint.x < 0 && hazard.userData.courseVelocity.length() > 5,
  'Every scheduled rock crosses from the opposite side with actual motion');
assert.ok(hazard.position.z < -threats.asteroidArrivalDistance(hazard), 'Even a decelerating forecast must spawn beyond the distant fade boundary');
const fixedPosition = hazard.position.clone();
threats.flightMotion.x = 200; threats.target.x = .5;
threats.setTime(2 + hazardInterval - .01); threats.updateCollisionHazard();
assert.ok(hazard.position.equals(fixedPosition), 'Existing threats must not track steering');
assert.equal(threats.hazardPool.length, 1);
threats.setTime(2 + hazardInterval); threats.setPaused(true); threats.updateCollisionHazard();
assert.equal(threats.hazardPool.length, 1);
threats.setPaused(false); threats.updateCollisionHazard();
assert.equal(threats.hazardPool.length, 2);
const nextCrossing = threats.hazardPool[1];
const nextForecast = new THREE.Vector3();
threats.forecastFlightPosition(nextForecast, Math.round(nextCrossing.userData.approachTime * 60));
const plannedPass = nextForecast.clone().addScaledVector(nextCrossing.userData.courseRight, nextCrossing.userData.lane)
  .addScaledVector(nextCrossing.userData.courseUp, nextCrossing.userData.height);
const actualPass = nextCrossing.position.clone().addScaledVector(nextCrossing.userData.courseVelocity, nextCrossing.userData.approachTime);
assert.ok(actualPass.distanceTo(plannedPass) < 1e-7,
  'The next crossing must follow the aircraft forecast, even when a sustained turn loops past the original world heading');
const queueLength = threats.queue.length;
threats.queueShip(hazard);
assert.equal(threats.queue.length, queueLength, 'Scheduled threats must not join normal respawns');
threats.setTime(12); threats.updateCollisionHazard();
assert.equal(hazard.visible, false, 'No early replacement during the first breather');
const thirdHazardTime = threats.nextHazardTime;
threats.setTime(thirdHazardTime); threats.updateCollisionHazard();
assert.equal(hazard.visible, true);
assert.equal(threats.nextHazardTime, thirdHazardTime + hazardInterval);
const spawn = hazard.userData.spawn;
threats.queueShip(hazard); threats.setTime(32); threats.updateCollisionHazard();
assert.equal(hazard.visible, false, 'The second breather also defers hazards');
threats.setTime(33); threats.updateCollisionHazard();
assert.equal(hazard.userData.spawn, spawn + 1, 'A long frame must not spawn catch-up waves');
assert.equal(threats.nextHazardTime, 33 + hazardInterval);
threats.setTime(33 + hazardInterval); threats.updateCollisionHazard();
assert.equal(threats.hazardPool.length, 2, 'Never grow the pool or teleport an active threat');
assert.equal(hazard.userData.spawn, spawn + 1);
threats.queueShip(hazard); threats.setRoundEnded(true); threats.updateCollisionHazard();
assert.equal(hazard.visible, false);
threats.setRoundEnded(false); threats.setCrashing(true); threats.updateCollisionHazard();
assert.equal(hazard.visible, false);
threats.setCrashing(false); threats.setTime(0); threats.setupLevelFleet();
assert.ok(threats.hazardPool.every(rock => !rock.visible));
assert.equal(threats.nextHazardTime, 2);
threats.setTime(2); threats.flightMotion.set(0, 0, -1); threats.updateCollisionHazard();
assert.ok(threats.hazardPool.every(rock => !rock.visible), 'Do not spawn dangerously close during resume acceleration');
threats.flightMotion.set(0, 0, -threats.levelFlightSpeed(2 / 45)); threats.updateCollisionHazard();
assert.ok(hazard.visible);
console.log('PASS unchanged crossing schedule, distant approaches, fixed courses, pause, reuse and reset');

// The hazard starts travelling on the velocity already computed for this tick.
for (const reducedMotion of [false, true]) {
  const flight = makeGame(reducedMotion), dt = 1 / 60, steps = 180, elapsed = 7;
  flight.setLevel(3); flight.setTime(elapsed);
  flight.camera.position.set(2, -3, 10);
  flight.target.set(.35, -.25); flight.flightTurn.set(.12, -.08);
  flight.flightOrientation.set(.09, -.18, 0, 'YXZ');
  flight.flightVelocity.set(32, -19);
  flight.flightMotion.set(0, 0, -210).applyEuler(flight.flightOrientation).add(new THREE.Vector3(32, -19, 0));
  const actual = flight.camera.position.clone(), forecast = new THREE.Vector3();
  let tick = 0;
  const clock = makeFlightClock(flight, dt => {
    actual.addScaledVector(flight.flightMotion, .85 * dt);
    tick++;
    clock.move(dt, (elapsed + tick * dt) / 45);
  });
  const state = () => [flight.flightOrientation, flight.flightTurn, flight.flightVelocity, flight.flightMotion].map(v => v.toArray());
  const before = state();
  flight.forecastFlightPosition(forecast, steps);
  assert.deepEqual(state(), before, 'Looking ahead must not advance live motion');
  for (let i = 0; i < steps; i++) clock.frame(dt);
  assert.equal(tick, steps);
  assert.ok(actual.distanceTo(forecast) < 1e-8, 'Forecast matches the live path while accelerating, turning and shedding drift');
}

for (const reducedMotion of [false, true]) {
  for (const fps of full ? [5, 30, 60, 144] : [5]) for (const level of full ? [1, 7, 15] : [7]) {
    for (const kick of [false, true]) for (const lane of ['hold', 'intercept', 'evade']) {
      const flight = makeGame(reducedMotion, false), startTime = 2;
      flight.setLevel(level); flight.setupLevelFleet();
      const speed = flight.levelFlightSpeed(startTime / 45);
      flight.flightOrientation.set(.12, -.38, 0, 'YXZ');
      flight.flightMotion.set(0, 0, -speed).applyEuler(flight.flightOrientation);
      if (kick) {
        flight.flightVelocity.set(-speed * .2, speed * .1);
        flight.flightMotion.x += flight.flightVelocity.x; flight.flightMotion.y += flight.flightVelocity.y;
      }
      flight.setTime(startTime); flight.updateCollisionHazard();
      const rock = flight.hazardPool[0];
      assert.ok(rock.visible);
      const passOffset = rock.userData.courseRight.clone().multiplyScalar(rock.userData.lane)
        .addScaledVector(rock.userData.courseUp, rock.userData.height);
      const probe = flight.camera.position.clone();
      if (lane === 'intercept') probe.add(passOffset);
      let hit = false, pointHit = false, ticks = 0;
      const clock = makeFlightClock(flight, dt => {
        if (lane === 'evade' && ticks === 30) flight.target.y = -Math.sign(passOffset.y);
        const previous = rock.position.clone();
        flight.updateShipCourse(rock, dt);
        rock.position.addScaledVector(flight.flightMotion, -.85 * dt).addScaledVector(rock.userData.courseVelocity, dt);
        hit ||= flight.crossesPlayer(rock, previous, rock.position, 0, probe);
        pointHit ||= flight.crossesHull(rock, previous, rock.position, 0, probe);
        ticks++;
        flight.setTime(startTime + ticks * dt);
        clock.move(dt, Math.min(1, (startTime + ticks * dt) / 45));
      });
      for (let frame = 0; frame < Math.ceil(fps * (rock.userData.approachTime + 1)); frame++) clock.frame(1 / fps);
      assert.equal(lane === 'hold' && kick ? pointHit : hit, lane === 'intercept',
        `Aircraft crossing: ${fps} FPS, level=${level}, kick=${kick}, lane=${lane}, reduced=${reducedMotion}`);
    }
  }
}
console.log('PASS aircraft-course forecasts, held-heading near-passes, actual interceptions and inertial evasions');
