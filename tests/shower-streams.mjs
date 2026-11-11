// The stream must sweep across the screen, not merely have a nonzero world velocity.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const THREE = await import(new URL('assets/vendor/three.module.js', root));
const source = readFileSync(new URL('index.html', root), 'utf8');
const from = source.indexOf('          showerPending = false;');
const to = source.indexOf('          seedShowerGrit();', from);
assert.ok(from > 0 && to > from);
const initialize = source.slice(from, to);
const selection = initialize.match(/const roll = random\(0, 1\);\s*const course = [^;]+;/);
assert.ok(selection, 'Exercise the production weighted direction choice');
const choose = new Function('random', selection[0] + '\nreturn course;');
const counts = [0, 0, 0, 0];
for (let sample = 0; sample < 1000; sample++) counts[choose(() => (sample + .5) / 1000)]++;
assert.deepEqual(counts, [400, 400, 100, 100], 'Keep 40/40/10/10: front-left/right plus shallow front-below/above');
for (const [roll, expected] of [[0, 0], [.4, 1], [.8, 2], [.9, 3], [1 - Number.EPSILON, 3]]) {
  assert.equal(choose(() => roll), expected);
}
console.log('PASS unchanged shower distribution: 40% front-right, 40% front-left, 10% front-below, 10% front-above');
function field(course, speed, reducedMotion, width = 1280, height = 720, yaw = 0, pitch = 0, corridor = false) {
  return new Function('THREE', 'selectedCourse', 'speed', 'reducedMotion', 'width', 'height', 'yaw', 'pitch', 'showerCorridor', `
    const random = (a, b) => a === 0 && b === 1 ? [.2, .6, .85, .95][selectedCourse] : (a + b) / 2;
    const camera = new THREE.PerspectiveCamera(reducedMotion ? 70 : 100, width / height, .03, 14000);
    const flightOrientation = new THREE.Euler(pitch, yaw, 0, 'YXZ');
    const flightMotion = new THREE.Vector3(0, 0, -speed).applyEuler(flightOrientation);
    // Simulate velocity left over from a previous rain event.
    const showerVelocity = new THREE.Vector3(99, -22, 33), showerDirection = new THREE.Vector3(), showerOrigin = new THREE.Vector3();
    const showerRotation = new THREE.Quaternion(), showerPreviousOrigin = new THREE.Vector3();
    const level = 1, count = 9, maxShowerRocks = 144, showerStart = 0, showerEnd = 18, showerStrength = 2;
    let showerPending = true, showerLength, showerSpacing, showerObstacleSpacing, nextShowerObstacle, showerHalfGap, showerHalfWidth, showerBend = 1.15;
    ${initialize}
    camera.rotation.copy(flightOrientation); camera.updateMatrixWorld();
    return {camera, velocity: showerVelocity, direction: showerDirection, origin: showerOrigin,
      rotation: showerRotation, heading: new THREE.Quaternion().setFromEuler(flightOrientation), flightMotion, lead, approachSpeed};
  `)(THREE, course, speed, reducedMotion, width, height, yaw, pitch, corridor);
}
for (const reduced of [false, true]) for (const speed of [35, 300, 1100]) for (let course = 0; course < 4; course++) {
  const fixed = field(course, speed, reduced, 1280, 720, -.7, .3, true);
  assert.equal(fixed.velocity.lengthSq(), 0, 'The corridor clears any previous rain velocity');
  assert.ok(fixed.rotation.angleTo(fixed.heading) < 1e-7, 'Keep the corridor aligned with the deployment heading, not a rain direction');
  assert.ok(fixed.direction.distanceTo(new THREE.Vector3(0, 0, -1).applyQuaternion(fixed.heading)) < 1e-8);
  assert.ok(fixed.origin.distanceTo(fixed.direction.clone().multiplyScalar(fixed.lead)) < 1e-8,
    'The fixed passage has no sideways rain crossing offset');
  assert.ok(Math.abs(fixed.approachSpeed - speed * .85) < 1e-8, 'Corridor pacing depends on player travel only');
}
console.log('PASS the corridor stays fixed, aligned and free of previous rain velocity or crossing offsets');
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
    assert.ok(rotated.velocity.clone().applyQuaternion(rotated.heading.clone().invert()).distanceTo(velocity) < 1e-8,
      'Directions are relative to the deployment heading, not hard-coded world axes');
  }
}
console.log('PASS unchanged side streams, shallow frontal above/below approaches, distant deployment and rotated headings');
console.log(`PASS visible directional screen-space travel in portrait/landscape and reduced motion, 5–144 FPS (${Math.min(...measured).toFixed(0)}+ px/s)`);
