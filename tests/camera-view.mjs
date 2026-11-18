import assert from 'node:assert/strict';
import { THREE, section } from './helpers/flight-game.mjs';

const camera = new THREE.PerspectiveCamera();
camera.position.set(3, 2, -5);
camera.rotation.set(.2, -.4, 1.3, 'YXZ');
const ship = new THREE.Group();
const view = new Function('camera', 'playerShip', 'THREE', `
  const chaseCamera = camera.clone(), playerHullRotation = camera.quaternion.clone();
  const crashing = false, target = { y: 0 };
  let cameraMode, started, viewCamera, reducedMotion;
  ${section('      const flightPointerDistance =', '      const roundDialog =')}
  return (mode, inFlight, vertical = 0, dt = 0) => {
    target.y = vertical;
    cameraMode = mode; started = inFlight; reducedMotion = camera.fov === 70;
    playerHullRotation.copy(camera.quaternion); updateCameraView(dt); return viewCamera;
  };
`)(camera, ship, THREE);

for (const aspect of [16 / 9, 390 / 844]) for (const fov of [70, 90]) {
  camera.aspect = aspect; camera.fov = fov; camera.updateProjectionMatrix();
  camera.rotation.set(0, 0, 0, 'YXZ');
  const chase = view('chase', true);
  assert.notEqual(chase, camera);
  assert.ok(ship.visible);
  assert.ok(Math.abs(ship.rotation.x - THREE.MathUtils.degToRad(6)) < 1e-8, 'Only the exterior model rests nose-up');
  assert.deepEqual(camera.position.toArray(), [3, 2, -5], 'Changing views must not move the pilot');
  const center = ship.position.clone().project(chase);
  assert.ok(Math.abs(center.x) < 1e-8 && Math.abs(center.y + .5) < .01, 'Frame the ship three-quarters down the screen');
  const cue = new THREE.Vector3(0, 0, -500).add(ship.position).project(chase);
  assert.ok(Math.abs((1 - cue.y) / 2 - .55) < 1e-8, 'Actual forward direction lands 45% from the bottom');
  assert.ok(chase.quaternion.equals(camera.quaternion), 'Lower framing must not tilt the level camera');
  const aim = new THREE.Vector3(.3, -.1, .5);
  assert.ok(aim.clone().unproject(chase).project(chase).distanceTo(aim) < 1e-8, 'Aim rays match the shifted view');
  for (const side of [-1, 1]) {
    // Interceptor engine mounts are at (±3, 0, 8) before the player ship's 1.6× scale.
    const engine = new THREE.Vector3(side * 3, 0, 8).multiplyScalar(1.6).applyQuaternion(ship.quaternion).add(ship.position).project(chase);
    assert.ok(engine.y < -.5 && engine.y > -.75, 'Keep the engines in the lower third, clear of the bottom HUD');
  }
  for (const sign of [-1, 1]) {
    camera.rotation.x = sign * Math.PI / 4;
    const climb = ship.position.clone().project(view('chase', true));
    assert.ok((climb.y - center.y) * sign > .02, 'Climbs and dives shift the ship vertically');
    camera.rotation.set(0, -sign * Math.PI / 4, sign * 1.3, 'YXZ');
    const turn = ship.position.clone().project(view('chase', true));
    assert.ok(turn.x * sign > .01 && Math.abs(turn.x) < .5, 'Banked turns shift the ship toward the turn without leaving the frame');
    camera.rotation.set(0, 0, 0, 'YXZ');
  }
  for (const [mode, inFlight] of [['canopy', true], ['clear', true], ['chase', false]]) {
    assert.equal(view(mode, inFlight), camera);
    assert.equal(ship.visible, false);
  }
}
console.log('PASS chase framing at both FOVs, pilot origin, cockpit selection and unchanged intro');

// Measure the visible nose against the tail, not just the ship center moving on screen.
for (const fov of [70, 90]) {
  camera.aspect = 16 / 9; camera.fov = fov; camera.updateProjectionMatrix();
  const chase = view('chase', true);
  const endY = z => new THREE.Vector3(0, 0, z).applyQuaternion(ship.quaternion).add(ship.position).project(chase).y;
  const silhouette = () => endY(-22) - endY(14);
  const neutral = silhouette(), aim = chase.matrixWorld.clone();
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 30; i++) view('chase', true, sign, 1 / 60);
    assert.ok(sign * (silhouette() - neutral) > (fov === 70 ? .08 : .16), 'Vertical input visibly tips the nose relative to the engines');
    assert.ok(chase.matrixWorld.equals(aim), 'Cosmetic pitch must not move the aim camera');
    for (let i = 0; i < 60; i++) view('chase', true, 0, 1 / 60);
    assert.ok(Math.abs(silhouette() - neutral) < .001, 'Centering smoothly returns the model to its flight orientation');
  }
}
console.log('PASS visible nose-up/down pitch, reduced motion, leveling and unchanged aim');

// The heading marker is projected independently; only the steering origin follows it.
const controls = new Function('THREE', 'camera', 'viewCamera', 'cameraMode', `
  const innerWidth = 1200, innerHeight = 800, started = true, paused = false, crashing = false;
  ${section('      const flightPointerDistance =', '      let visualPitch =')}
  const headingPoint = new THREE.Vector3(), flightDirection = new THREE.Vector3(0, 0, -1);
  const mouseAim = new THREE.Vector2(), target = new THREE.Vector2(), reticle = {style: {}};
  let steeringInput = null;
  ${section('      function steer(event)', '      // Suppress accidental secondary clicks')}
  updateFlightPointer();
  return { headingPoint, target, mouseAim, flightDirection, updateFlightPointer,
    aim: (x, y) => steer({clientX: (1 + x) * 600, clientY: (1 - y) * 400}),
    releaseStick: () => { steeringInput = 'stick'; target.set(0, 0); updateFlightPointer(); } };
`);
camera.updateMatrixWorld();
const chaseControls = controls(THREE, camera, view('chase', true), 'chase');
const { headingPoint: nose, target: turn } = chaseControls;
assert.ok(Math.abs(nose.y + .1) < 1e-8, 'Straight flight is below screen center');
chaseControls.aim(0, -.1);
assert.ok(turn.length() < 1e-9, 'Aiming at the nose applies no turn');
chaseControls.aim(0, 0);
assert.ok(turn.y > 0, 'Screen center is above the nose and pitches up');
chaseControls.aim(0, -.4);
assert.ok(turn.y < 0, 'Below the nose pitches down');
chaseControls.aim(.4, -1);
assert.equal(turn.y, -1, 'Full downward steering is still available');
assert.ok(nose.distanceTo(new THREE.Vector3(0, 0, -500).add(camera.position).project(view('chase', true))) < 1e-9,
  'Moving the green pointer must not drag the nose marker');
chaseControls.flightDirection.set(.1, .1, -1).normalize();
const before = turn.clone();
chaseControls.updateFlightPointer();
assert.notEqual(turn.x, before.x, 'A stationary pointer is relative to the current heading');
chaseControls.releaseStick();
assert.ok(chaseControls.mouseAim.distanceTo(new THREE.Vector2(nose.x, nose.y)) < 1e-9 && turn.length() === 0);
const cockpitControls = controls(THREE, camera, camera, 'canopy');
cockpitControls.aim(0, 0);
assert.equal(cockpitControls.target.length(), 0, 'Cockpit retains centered steering');
console.log('PASS independent nose marker and chase steering neutral, stationary pointer, joystick release and cockpit');

const button = Object.assign(new EventTarget(), { dataset: {}, setAttribute(name, value) { this[name] = value; } });
const body = { dataset: {} }, storage = new Map();
let keydown, dialogOpen = false;
const initialize = new Function('window', 'document', 'localStorage', 't', `
  const started = true, paused = false, crashing = false, roundEnded = false;
  ${section('      const cameraButton =', '      // Keep the original camera')}
  ${section("      window.addEventListener('keydown', event => {", "      window.addEventListener('keyup'")}
`);
const load = () => initialize({ addEventListener: (_, listener) => { keydown = listener; } },
  { body, querySelector: selector => selector === '#camera-view' ? button : dialogOpen },
  { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, key => key);
load();
const pressV = (options = {}) => keydown({ key: 'v', target: { closest: () => null }, preventDefault() {}, ...options });
assert.equal(body.dataset.camera, 'chase');
assert.equal(button.title, 'canopyCameraAction');
button.dispatchEvent(new Event('click'));
assert.equal(body.dataset.camera, 'canopy');
assert.equal(storage.get('orbit-rush-view'), 'canopy');
for (const flag of ['repeat', 'ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
  pressV({ [flag]: true });
  assert.equal(body.dataset.camera, 'canopy');
}
dialogOpen = true; pressV(); assert.equal(body.dataset.camera, 'canopy');
dialogOpen = false; pressV(); assert.equal(body.dataset.camera, 'clear');
assert.equal(button['aria-label'], 'chaseCameraAction');
pressV(); assert.equal(body.dataset.camera, 'chase');
for (const [saved, expected] of [['canopy', 'canopy'], ['cockpit', 'clear'], ['unknown', 'chase']]) {
  storage.set('orbit-rush-view', saved); load(); assert.equal(body.dataset.camera, expected);
}
console.log('PASS toolbar and V cycle three views, announce the next action and restore saved preferences');
