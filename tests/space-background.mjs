// Run from the project root: node tests/space-background.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const THREE = await import(new URL('assets/vendor/three.module.js', root));
const source = readFileSync(new URL('index.html', root), 'utf8');
const background = source.slice(source.indexOf('      // One world-aligned sky:'),
  source.indexOf('      // Three original silhouettes:'));
assert.ok(background.includes('function updateSpaceBackground()'));

const makeSky = (reducedMotion = false) => {
  let seed = 14767;
  const math = Object.create(Math);
  math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return new Function('THREE', 'Math', 'reducedMotion', `
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(90, 16 / 9, .03, 14000);
  const worldStep = new THREE.Vector3();
  let started = false, paused = true;
  const random = (a, b) => a + Math.random() * (b - a);
  const pick = items => items[0];
  // CanvasTexture only needs a canvas reference for these geometry-only tests.
  const document = { createElement: () => ({ getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}
  }) }) };
  ${background}
  return { scene, camera, distantSky, galaxy, stars, starPositions, starGeometry,
    flightDust, dustPositions, dustGeometry, dustColors, dustSizes,
    middleStars, middlePositions, middleGeometry, middleParallax, worldStep, updateSpaceBackground,
    setStarted: value => started = value, setPaused: value => paused = value };
`)(THREE, math, reducedMotion);
};

const visibility = distance => THREE.MathUtils.smoothstep(distance, 3000, 4000)
  * (1 - THREE.MathUtils.smoothstep(distance, 6000, 6500));
function assertUniformSpace(sky, stage) {
  const shells = Array(10).fill(0), cones = Array(6).fill(0), moments = [0, 0, 0];
  const count = sky.starPositions.length / 3, radius = 6500;
  for (let i = 0; i < sky.starPositions.length; i += 3) {
    const xyz = sky.starPositions.subarray(i, i + 3), distance = Math.hypot(...xyz);
    assert.ok(Number.isFinite(distance) && distance <= radius + .001, stage + ': bounded star volume');
    shells[Math.min(9, Math.floor((distance / radius) ** 3 * 10))]++;
    for (let axis = 0; axis < 3; axis++) {
      moments[axis] += xyz[axis] ** 2 / (radius * radius * count);
      if (Math.abs(xyz[axis]) / distance > .85) {
        cones[axis * 2 + (xyz[axis] > 0 ? 1 : 0)] += visibility(distance);
      }
    }
  }
  assert.ok(shells.every(n => n > count / 10 * .65 && n < count / 10 * 1.35),
    `${stage}: equal-volume depth bands must have similar density, not a shell: ${shells}`);
  assert.ok(moments.every(value => value > .16 && value < .24),
    `${stage}: the field must fill all three axes, not a flattened disc: ${moments}`);
  assert.ok(Math.min(...cones) > 100 && Math.max(...cones) / Math.min(...cones) < 1.6,
    `${stage}: visible star density must stay balanced in all six viewing directions: ${cones}`);
}

const sky = makeSky();
const originalStars = sky.starPositions.slice();
const cloudPositions = sky.distantSky.children.filter(child => child.isSprite).map(cloud => cloud.position.clone());
assert.equal(sky.stars.parent, sky.galaxy.parent);
assert.equal(sky.starGeometry.attributes.position.version, 0);
assert.equal(sky.stars.material.fog, false);
assert.equal(sky.starGeometry.boundingSphere.radius, 6500);
let front = 0, back = 0;
for (let i = 0; i < sky.starPositions.length; i += 3) {
  const star = new THREE.Vector3().fromArray(sky.starPositions, i);
  assert.ok(star.length() <= 6500.001);
  if (star.z < 0) front++; else back++;
}
assert.ok(front > 1000 && back > 1000, 'Stars must surround the camera in all viewing directions');
assertUniformSpace(sky, 'Initial field');
assert.ok(sky.dustPositions.length / 3 >= 2000, 'The near star stream must remain dense');
assert.ok(sky.flightDust.material.size >= 5 && sky.flightDust.material.opacity >= .7);
assert.ok(sky.middlePositions.length / 3 >= 1000);
assert.ok(Math.min(...sky.middleParallax) >= .21 && Math.max(...sky.middleParallax) <= .56);
assert.ok(Math.max(...sky.middleParallax) - Math.min(...sky.middleParallax) > .25);
assert.ok(Math.min(...sky.dustSizes) < .7 && Math.max(...sky.dustSizes) > 1.4);
assert.ok(Math.max(...sky.dustColors) - Math.min(...sky.dustColors) > .45);
assert.equal(sky.flightDust.material.vertexColors, true);
assert.equal(sky.dustGeometry.getAttribute('starSize').count, sky.dustPositions.length / 3);
console.log('PASS uniform 3D star volume across depths and all viewing axes, with unchanged middle/foreground layers');

const renderState = () => {
  sky.updateSpaceBackground();
  sky.scene.updateMatrixWorld(true); sky.camera.updateMatrixWorld(true);
};
const projectStar = () => sky.stars.localToWorld(new THREE.Vector3().fromArray(sky.starPositions, 0)).project(sky.camera);
renderState(); assert.deepEqual(sky.starPositions, originalStars, 'The intro must not drift');
sky.setStarted(true); sky.setPaused(false);
sky.starPositions.set([1000, 500, -5300], 0);
sky.middlePositions.set([100, 50, -2000], 0);
sky.dustPositions.set([100, 50, -1000], 0);
sky.worldStep.set(-20, 12, 50);
sky.camera.position.set(350, -90, -1500);
renderState();
assert.ok(sky.distantSky.position.equals(sky.camera.position), 'Keep a camera-relative anchor, not a distant offset that grows forever');
assert.equal(sky.starGeometry.attributes.position.version, 1);
for (let axis = 0; axis < 3; axis++) {
  const farDelta = sky.starPositions[axis] - [1000, 500, -5300][axis];
  const middleDelta = sky.middlePositions[axis] - [100, 50, -2000][axis];
  const nearDelta = sky.dustPositions[axis] - [100, 50, -1000][axis];
  assert.ok(Math.abs(nearDelta - sky.worldStep.getComponent(axis)) < .001);
  assert.ok(Math.abs(middleDelta - nearDelta * sky.middleParallax[0]) < .001);
  assert.ok(Math.abs(farDelta - nearDelta * .025) < .001, 'Far stars must move at just 2.5% of flight movement');
  assert.ok(Math.abs(farDelta) < Math.abs(middleDelta) && Math.abs(middleDelta) < Math.abs(nearDelta));
}
const beforeApproach = projectStar();
sky.worldStep.set(0, 0, 600); renderState();
const afterApproach = projectStar();
assert.ok(afterApproach.x > beforeApproach.x && afterApproach.y > beforeApproach.y,
  'Forward flight must slowly spread off-center stars outward, not merely change their brightness');
assert.ok(afterApproach.distanceTo(beforeApproach) < .001, 'The far-layer approach must remain subtle');
assert.deepEqual(sky.stars.scale.toArray(), [1, 1, 1], 'No pulsing or global zoom animation');
console.log('PASS 2.5% distant travel, gentle middle parallax, full-speed foreground and subtle projected approach');

sky.worldStep.set(0, 0, 0);
const starsBeforeTurning = sky.starPositions.slice();
const bandDirection = new THREE.Vector3(.2, .1, -1).normalize().multiplyScalar(6000);
const projectBand = () => sky.galaxy.localToWorld(bandDirection.clone()).project(sky.camera);
const initialStar = projectStar(), initialBand = projectBand();
for (const rotation of [[.2, 0, 0], [0, -.35, 0], [0, 0, -.6], [.2, -.35, -.6]]) {
  sky.camera.rotation.set(...rotation, 'YXZ'); renderState();
  assert.ok(projectStar().distanceTo(initialStar) > .01, 'Stars must respond to camera yaw, pitch and bank');
  assert.ok(projectBand().distanceTo(initialBand) > .01, 'The horizon must share the same camera rotations');
  assert.deepEqual(sky.distantSky.quaternion.toArray(), [0, 0, 0, 1]);
  assert.deepEqual(sky.stars.quaternion.toArray(), [0, 0, 0, 1]);
}
assert.deepEqual(sky.starPositions, starsBeforeTurning, 'Turning alone must not relocate stars');
assert.deepEqual(sky.distantSky.children.filter(child => child.isSprite).map(cloud => cloud.position), cloudPositions);
console.log('PASS common yaw/pitch/bank response with calm nebulae and no counter-rotating sky');

sky.camera.position.set(0, 0, 0); sky.camera.rotation.set(0, 0, 0); renderState();
assert.ok(projectStar().distanceTo(initialStar) < 1e-10);
const before = sky.dustPositions.slice(), middleBefore = sky.middlePositions.slice(), farBefore = sky.starPositions.slice();
sky.worldStep.set(-20, 12, 50); sky.setPaused(true); renderState();
assert.deepEqual(sky.dustPositions, before); assert.deepEqual(sky.middlePositions, middleBefore);
assert.deepEqual(sky.starPositions, farBefore, 'Pause must freeze the new distant drift');
sky.setPaused(false); renderState();
assert.notDeepEqual(sky.dustPositions, before); assert.notDeepEqual(sky.middlePositions, middleBefore);
assert.notDeepEqual(sky.starPositions, farBefore);
assert.equal(sky.flightDust.visible, true); assert.equal(sky.middleStars.visible, true);
sky.setStarted(false); const introStars = sky.starPositions.slice(); renderState();
assert.equal(sky.flightDust.visible, false); assert.equal(sky.middleStars.visible, false);
assert.deepEqual(sky.starPositions, introStars);
console.log('PASS all three layers freeze on pause, resume correctly, and leave the intro calm');

sky.setStarted(true); sky.worldStep.set(20, 20, 20);
sky.middlePositions.set([2399, 1599, 3999], 0); renderState();
assert.ok(sky.middlePositions[0] >= -2400 && sky.middlePositions[0] < -2300);
assert.ok(sky.middlePositions[1] >= -1600 && sky.middlePositions[1] < -1500);
assert.ok(sky.middlePositions[2] >= -4000 && sky.middlePositions[2] < -3900);
sky.worldStep.set(-20, -20, -20);
sky.middlePositions.set([-2399, -1599, -3999], 0); renderState();
assert.ok(sky.middlePositions[0] <= 2400 && sky.middlePositions[0] > 2300);
assert.ok(sky.middlePositions[1] <= 1600 && sky.middlePositions[1] > 1500);
assert.ok(sky.middlePositions[2] <= 4000 && sky.middlePositions[2] > 3900);
console.log('PASS surrounding middle-layer recycling in every direction');

// Near and middle stars must cover both sides of the old z=70 cutoff.
const surrounding = makeSky();
for (const positions of [surrounding.middlePositions, surrounding.dustPositions]) {
  let ahead = 0, behind = 0;
  for (let i = 2; i < positions.length; i += 3) {
    if (positions[i] < -100) ahead++;
    if (positions[i] > 100) behind++;
  }
  assert.ok(ahead > positions.length / 3 * .4 && behind > positions.length / 3 * .4,
    'Turning must not expose an empty rear half of the moving star field');
}
for (const [points, varying] of [[sky.middleStars, 'middleVisibility'], [sky.flightDust, 'dustVisibility']]) {
  const shader = {vertexShader: THREE.ShaderLib.points.vertexShader, fragmentShader: THREE.ShaderLib.points.fragmentShader};
  points.material.onBeforeCompile(shader);
  for (const axis of ['x', 'y', 'z']) assert.ok(shader.vertexShader.includes(`abs(position.${axis})`));
  assert.ok(shader.fragmentShader.includes(`diffuseColor.a *= ${varying};`));
}
for (const sign of [-1, 1]) {
  sky.dustPositions.set([0, 0, sign * 2099], 0);
  sky.worldStep.set(0, 0, sign * 20); renderState();
  assert.ok(sky.dustPositions[2] * sign < -2000, 'Near stars wrap behind the camera as well as ahead');
}
console.log('PASS front/rear star coverage, soft fades on all faces, and near-star recycling');

const shader = {vertexShader: THREE.ShaderLib.points.vertexShader, fragmentShader: THREE.ShaderLib.points.fragmentShader};
sky.stars.material.onBeforeCompile(shader);
assert.ok(shader.vertexShader.includes('smoothstep(3000.0, 4000.0, starDistance)'));
assert.ok(shader.vertexShader.includes('1.0 - smoothstep(6000.0, 6500.0, starDistance)'));
assert.ok(shader.fragmentShader.includes('diffuseColor.a *= farStarVisibility;'));
assert.equal(visibility(5500), 1); assert.equal(visibility(2500), 0);
assert.ok(visibility(3500) > 0 && visibility(3500) < 1);
assert.ok(visibility(6250) > 0 && visibility(6250) < 1);
for (const axis of [0, 1, 2]) {
  for (const sign of [-1, 1]) {
    const position = new THREE.Vector3().setComponent(axis, sign * 6499.9);
    position.toArray(sky.starPositions, 0);
    sky.worldStep.set(0, 0, 0).setComponent(axis, sign * 20); renderState();
    const wrapped = new THREE.Vector3().fromArray(sky.starPositions, 0);
    assert.ok(wrapped.getComponent(axis) * sign < 0);
    assert.ok(Math.abs(wrapped.length() - 6500) < .001);
    assert.ok(visibility(position.length()) < 1e-6 && visibility(wrapped.length()) < 1e-6,
      'Both ends of a recycle must be invisible, including when looking sideways or behind');
  }
}
console.log('PASS soft near/far fades and invisible recycling on every axis');

test('no disc/ring or directional density holes after five minutes of flight', {
  skip: process.env.ORBIT_TEST_FULL !== '1' && 'Run ./run test:full for the starfield soak'
}, () => {
  const longFlight = makeSky(), geometry = longFlight.stars.geometry, positions = longFlight.starPositions;
  longFlight.setStarted(true); longFlight.setPaused(false);
  // Five minutes at high speed: straight, sustained diagonal, then opposite steering.
  // Checking only a fresh level missed the shell/ring artifact seen after several levels.
  for (let tick = 0; tick < 18000; tick++) {
    const phase = Math.floor(tick / 6000);
    longFlight.worldStep.set(phase === 0 ? 0 : phase === 1 ? -18 : 18,
      phase === 0 ? 0 : phase === 1 ? 10 : -10, 20);
    longFlight.updateSpaceBackground();
    if ((tick + 1) % 3000 === 0) assertUniformSpace(longFlight, `Long flight, tick ${tick + 1}`);
  }
  assert.equal(longFlight.starPositions, positions); assert.equal(longFlight.stars.geometry, geometry);
  assert.equal(longFlight.starGeometry.attributes.position.count, 3500, 'Do not allocate a growing star field');
});

const reduced = makeSky(true);
reduced.setStarted(true); reduced.setPaused(false); reduced.worldStep.set(10, 5, 100);
const reducedDust = reduced.dustPositions.slice(), reducedMiddle = reduced.middlePositions.slice(), reducedFar = reduced.starPositions.slice();
reduced.updateSpaceBackground();
assert.equal(reduced.flightDust.visible, false); assert.equal(reduced.middleStars.visible, false);
assert.deepEqual(reduced.dustPositions, reducedDust); assert.deepEqual(reduced.middlePositions, reducedMiddle);
assert.deepEqual(reduced.starPositions, reducedFar); assert.equal(reduced.starGeometry.attributes.position.version, 0);
assert.equal(reduced.distantSky.visible, true);
console.log('PASS reduced motion preserves the static sky and disables all travel parallax');
