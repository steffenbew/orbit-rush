// The stream must sweep across the screen, not merely have a nonzero world velocity.
import { getAsteroidEncounters, planEncounterLayout, corridorHeightAt } from '../src/course/encounter-plan.js';
import * as THREE from '../assets/vendor/three.module.js';
import assert from 'node:assert/strict';
const choose = level => getAsteroidEncounters(level, false)[0].direction;
const counts = [0, 0, 0, 0];
for (let level = 1; level <= 1000; level++) counts[choose(level)]++;
assert.deepEqual(counts, [400, 400, 100, 100], 'Keep 40/40/10/10 across the repeating direction cycle');
assert.equal(choose(1), choose(11), 'Directions are repeatable rather than rerolled on retry');
console.log('PASS deterministic shower directions with predominantly lateral approaches');
function field(course, speed, reducedMotion, width = 1280, height = 720, yaw = 0, pitch = 0) {
  const camera = new THREE.PerspectiveCamera(reducedMotion ? 70 : 100, width / height, .03, 14000);
  camera.rotation.set(pitch, yaw, 0, 'YXZ'); camera.updateMatrixWorld();
  const flightMotion = new THREE.Vector3(0, 0, -speed).applyEuler(camera.rotation);
  const layout = planEncounterLayout({ kind: 'shower', direction: course, strength: 2,
    prepare: 0, entry: 12, exit: 30, shape: 0, bend: 0 }, { courseOrigin: camera.position, level: 1, roundDuration: 45,
    reducedMotion, maxShowerRocks: 144, levelFlightSpeed: () => speed, flightDistanceAt: time => time * speed * .85 });
  return { ...layout, camera, flightMotion };
}
// Planning a future corridor must not activate it or change the current event's drift.
for (const reducedMotion of [false, true]) {
  const courseOrigin = new THREE.Vector3(80, -50, 320);
  const speed = reducedMotion ? 35 : 600;
  const flightDistanceAt = time => time * speed * .85;
  const options = { level: 5, reducedMotion, roundDuration: 45, levelFlightSpeed: () => speed,
    flightDistanceAt, courseOrigin, maxShowerRocks: 144 };
  const [fieldEvent, showerEvent, corridorEvent] = getAsteroidEncounters(5, reducedMotion);
  const shower = planEncounterLayout(showerEvent, options);
  const velocity = shower.velocity.clone(), field = planEncounterLayout(fieldEvent, options);
  const corridor = planEncounterLayout(corridorEvent, options);
  assert.ok(velocity.lengthSq() > 0 && shower.velocity.equals(velocity));
  for (const fixed of [field, corridor]) {
    assert.equal(fixed.velocity.lengthSq(), 0);
    assert.ok(fixed.rotation.angleTo(new THREE.Quaternion()) < 1e-7);
    assert.ok(fixed.direction.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-8);
    assert.ok(fixed.origin.distanceTo(courseOrigin.clone().addScaledVector(fixed.direction, flightDistanceAt(fixed.entry))) < 1e-8);
  }
  assert.equal(corridor.length, flightDistanceAt(corridorEvent.exit) - flightDistanceAt(corridorEvent.entry));
  assert.equal(corridor.gap, reducedMotion ? 26 : 38);
  assert.equal(corridor.firstObstacle, reducedMotion ? corridor.spacing : corridor.length * .22);
  assert.equal(corridor.bend, corridorEvent.bend * corridor.gap);
  assert.equal(corridorHeightAt(corridor.length / 2, corridor, reducedMotion), corridor.bend);
  assert.deepEqual(planEncounterLayout(corridorEvent, options), corridor, 'Retries reproduce the layout without scaling the bend twice');
  assert.deepEqual(courseOrigin.toArray(), [80, -50, 320]);
}
console.log('PASS independent field, rain and corridor plans; fixed entry planes, obstacle spacing and repeatable bends');
const measured = [];
for (const reduced of [false, true]) for (const speed of reduced ? [35, 60] : [200, 600, 1100]) {
  for (const [width, height] of [[1280, 720], [390, 844]]) for (let course = 0; course < 4; course++) {
    const stream = field(course, speed, reduced, width, height);
    const velocity = stream.velocity, relative = velocity.clone().addScaledVector(stream.flightMotion, -.85);
    assert.ok(velocity.length() >= (reduced ? 50 : 220) - 1e-8);
    if (course < 2) {
      assert.ok(Math.hypot(velocity.x, velocity.y) > speed * .85 * .7, 'Sideways motion stays unchanged for the front-left/right majority');
      assert.equal(Math.sign(velocity.x), course === 0 ? -1 : 1);
      assert.ok(velocity.z > 0, 'Front-left/right streams also approach from ahead');
    } else {
      assert.equal(velocity.x, 0);
      assert.ok(velocity.z > 0, 'The occasional above/below streams now approach from ahead, not vertically');
      assert.equal(Math.sign(velocity.y), course === 2 ? 1 : -1);
      const angle = THREE.MathUtils.radToDeg(Math.atan2(Math.abs(velocity.y), velocity.z));
      assert.ok(angle >= 10 && angle <= 12, `Keep the intrinsic approach shallow, got ${angle}°`);
      const entryAngle = THREE.MathUtils.radToDeg(Math.atan2(Math.abs(stream.origin.y), -stream.origin.z));
      assert.ok(entryAngle > 0 && entryAngle < 8, 'The field must start slightly above/below the forward view, not at its top or bottom');
      assert.equal(Math.sign(stream.origin.y), -Math.sign(velocity.y), 'The below/above variants enter from the correct side');
    }
    assert.ok(stream.direction.dot(relative.clone().normalize()) < -1 + 1e-10,
      'Lay each field upstream of the actual relative flow so it reaches the flight path');
    assert.ok(stream.origin.length() - 80 > (reduced ? 700 : 3600), 'Directional layouts must preserve distant arrivals');
    let visibleWindows = 0, maxPixelsPerSecond = 0;
    for (let time = 0; time < 45; time += .1) {
      const before = stream.origin.clone().addScaledVector(relative, time);
      const after = before.clone().addScaledVector(relative, .3);
      if (before.length() < (reduced ? 150 : 600) || before.length() > (reduced ? 500 : 1600)) continue;
      const a = before.project(stream.camera), b = after.project(stream.camera);
      if (![a, b].every(p => p.z > -1 && p.z < 1 && Math.abs(p.x) < .9 && Math.abs(p.y) < .9)) continue;
      const displacement = course < 2 ? (b.x - a.x) * Math.sign(velocity.x) * width / 2
        : (b.y - a.y) * Math.sign(velocity.y) * height / 2;
      assert.ok(displacement > 0, 'The visible stream must sweep in its actual direction, not reverse or sit on a constant bearing');
      visibleWindows++; maxPixelsPerSecond = Math.max(maxPixelsPerSecond, displacement / .3);
    }
    assert.ok(visibleWindows > 3, `The stream must spend time visibly crossing the view: course=${course}, speed=${speed}, ${width}×${height}`);
    assert.ok(maxPixelsPerSecond > (reduced ? 12 : 35), `Visible rain needs meaningful screen displacement, got ${maxPixelsPerSecond.toFixed(1)} px/s`);
    measured.push(maxPixelsPerSecond);
    for (const fps of [5, 30, 60, 144]) {
      const point = stream.origin.clone();
      for (let frame = 0; frame < fps * 12; frame++) point.addScaledVector(relative, 1 / fps);
      assert.ok(point.distanceTo(stream.origin.clone().addScaledVector(relative, 12)) < 1e-7);
    }
    const rotated = field(course, speed, reduced, width, height, -.7, .3);
    assert.ok(rotated.velocity.distanceTo(velocity) < 1e-8 && rotated.origin.distanceTo(stream.origin) < 1e-8,
      'Turning the aircraft must not relocate or rotate the preplanned shower');
  }
}
console.log('PASS unchanged side streams, shallow frontal above/below approaches, distant deployment and heading-independent course placement');
console.log(`PASS visible directional screen-space travel in portrait/landscape and reduced motion, 5–144 FPS (${Math.min(...measured).toFixed(0)}+ px/s)`);
