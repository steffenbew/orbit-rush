// Run from the project root: node tests/flight-boundary.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { t, setLanguage } from '../i18n.js';
setLanguage('en');
const root = new URL('../', import.meta.url);
const THREE = await import(new URL('assets/vendor/three.module.js', root));
const source = readFileSync(new URL('index.html', root), 'utf8');
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}
const makeGame = reducedMotion => new Function('THREE', 't', 'reducedMotion', `
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, 16 / 9, .03, 14000);
  const courseWorldOffset = new THREE.Vector3(), flightMotion = new THREE.Vector3(), worldStep = new THREE.Vector3();
  const flightDirection = new THREE.Vector3(0, 0, -1), flightTilt = new THREE.Vector3();
  const flightOrientation = new THREE.Euler(0, 0, 0, 'YXZ'), playerHullRotation = new THREE.Quaternion();
  const flightVelocity = new THREE.Vector2(), flightTurn = new THREE.Vector2(), flightViewOffset = new THREE.Vector2(), target = new THREE.Vector2();
  const playerHullRadius = 26, roundDuration = 45, simulationStep = 1 / 60, level = 1;
  let started = true, paused = false, roundEnded = false, crashing = false, celebrating = false;
  let shield = 100, shieldHitTime = 0, gameTime = 0, levelPressure = 0, difficulty = 0, speed = 0, hitMarker = 0, shake = 0;
  const sounds = [], crashes = [], messages = [], elements = new Map();
  const document = {querySelector(selector) {
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector, {hidden: true, style: {}, textContent: '', classList: {
        remove: key => classes.delete(key), contains: key => classes.has(key),
        toggle: (key, active) => active ? classes.add(key) : classes.delete(key)
      }});
    }
    return elements.get(selector);
  }};
  const shieldHit = document.querySelector('#shield-hit');
  const playSound = name => sounds.push({name, time: gameTime});
  const showFeedback = (message, negative) => messages.push({message, negative});
  const startCrash = object => { crashes.push(object); crashing = true; paused = true; object.visible = false; worldStep.set(0, 0, 0); };
  ${section('      function levelFlightSpeed(', '      const courseWorldOffset =')}
  ${section('      function advanceFlightHeading(', '      function forecastFlightPosition(')}
  ${section('      function updateShield()', '      const repairMarker =')}
  ${section('      const flightBoundaryNotice =', '      function collideWith(')}
  resetFlightBoundary();
  function step(dt, steering = false) {
    if (!paused && !crashing && !roundEnded && started) { gameTime += dt; difficulty = Math.min(1, gameTime / roundDuration); }
    if (steering) {
      ${section('        const easing = 1 - Math.exp(-3 * dt);', '        worldStep.copy(flightMotion)')}
    }
    ${section('        worldStep.copy(flightMotion)', '        if (crashing) camera.rotation')}
    updateFlightBoundary(dt);
  }
  return {
    scene, camera, sounds, crashes, messages, target, flightMotion, flightOrientation, flightTurn, flightVelocity, flightViewOffset, courseWorldOffset, worldStep,
    boundary: flightBoundary, radii: flightBoundaryRadii, notice: flightBoundaryNotice, normal: flightBoundaryNormal,
    uniforms: flightBoundaryMaterial.uniforms, reset: resetFlightBoundary, renderFeedback: renderFlightBoundaryFeedback,
    state: () => ({shield, shieldHitTime, time: gameTime, shake, speed, impactAt: flightBoundaryImpactAt, hud: document.querySelector('#shield-value').textContent}),
    configure(options) {
      if ('started' in options) started = options.started;
      if ('paused' in options) paused = options.paused;
      if ('ended' in options) roundEnded = options.ended;
      if ('crashing' in options) crashing = options.crashing;
      if ('pressure' in options) levelPressure = options.pressure;
      if ('shield' in options) shield = options.shield;
      if ('speed' in options) speed = options.speed;
    },
    place(x, y, z = 0) { courseWorldOffset.set(-x, -y, -z); },
    step: dt => step(dt), fly: dt => step(dt, true)
  };
`)(THREE, t, reducedMotion);

function radius(game) {
  const position = game.courseWorldOffset.clone().negate();
  return Math.hypot(position.x / (game.radii.x - 26), position.y / (game.radii.y - 26));
}
function impact(game, dt = .1) {
  game.place(game.radii.x - 27, 0);
  game.flightMotion.set(100, 0, -400);
  game.step(dt);
}
// Sample selection uses incoming speed into the wall, not forward speed or the rebound.
for (const reducedMotion of [false, true]) {
  const threshold = reducedMotion ? 15 : 150;
  for (const outward of [threshold - 1, threshold, threshold + 1]) {
    for (const forward of [400, 5000]) {
      const game = makeGame(reducedMotion);
      game.place(game.radii.x - 26 - .001, 0);
      game.flightMotion.set(outward, 0, -forward);
      game.step(.01);
      assert.equal(game.sounds.length, 1);
      assert.equal(game.sounds[0].name, outward >= threshold ? 'shieldHard' : 'shieldGlance');
      assert.equal(game.state().shield, 90, 'Sound intensity does not change damage');
    }
  }
}
console.log('PASS shield samples: 001 for glancing, 000 for hard, independent of forward speed');

function separate(game, dt) {
  game.place(0, 0); game.flightMotion.set(0, 0, -400); game.step(dt);
}

for (const reducedMotion of [false, true]) {
  const game = makeGame(reducedMotion), {radii, uniforms} = game;
  assert.deepEqual(radii.toArray(), reducedMotion ? [600, 360] : [1800, 1100]);
  assert.equal(game.boundary.visible, false);
  game.flightMotion.set(0, 0, -400); game.step(.1);
  assert.equal(game.boundary.visible, false); assert.equal(game.notice.hidden, true);
  assert.equal(game.state().shield, 100);
  const rx = radii.x - 26;
  game.flightMotion.set(rx / (.85 * 2), 0, -400); game.step(.1);
  assert.equal(game.boundary.visible, true, 'A projected collision two seconds away reveals the membrane');
  assert.equal(game.notice.textContent, t('boundaryWarning'));
  assert.equal(game.state().shield, 100, 'A warning never damages the ship');
  assert.ok(Math.abs(uniforms.warningPoint.value.x - game.courseWorldOffset.x - radii.x) < 1e-8);
  assert.equal(uniforms.motion.value, reducedMotion ? 0 : 1);
  assert.equal(uniforms.phase.value, reducedMotion ? 0 : game.state().time);
  assert.equal(game.boundary.material.depthWrite, false);
  assert.equal(game.boundary.material.side, THREE.DoubleSide);
  const shader = game.boundary.material.fragmentShader;
  assert.ok(shader.includes('fresnel') && shader.includes('sheen'));
  assert.ok(shader.includes('shieldUv.x * 6.2831853 * 6.0') && Number.isInteger(uniforms.gridScale.value.x),
    'Sheen and hexagons wrap seamlessly around the tube, including floor contacts');
  assert.ok(shader.includes('reveal = smoothstep(0.2, 0.85, strength)') && shader.includes('edge * 0.10'),
    'Larger cells emerge gradually from the soft approach glow');
  assert.ok(shader.includes('impactGlow * (0.12 + edge * 0.075'), 'The contact adds a localized highlight');
  assert.ok(shader.includes('wave < 3') && shader.includes('float(wave) * 0.12') && shader.includes('* 1100.0'),
    'Three delayed wavefronts spread quickly across the surface');
  assert.ok(shader.includes('smoothstep(0.08, 0.8, waveAge)') && shader.includes('ripple *= motion;'));
  assert.ok(!shader.includes('float ripple = contact *'), 'Wave propagation must outlive the contact flash');
  assert.equal(uniforms.contact.value, 0, 'No impact flash, ripple or sparks before contact');
  assert.equal(uniforms.patchSize.value, reducedMotion ? 260 : 1100, 'Default coverage does not expand with speed');
  assert.ok(shader.includes('fieldOffset.xy *= 0.8;'), 'Reveal a modest 25% more shield to either side');
  assert.ok(shader.includes('fieldOffset.z *= 0.15;'), 'Keep the original forward horizon');
  assert.ok(shader.includes('p.y += gridOffset;') && shader.includes('p.y * 0.6'), 'Cells and sheen remain world-anchored when recentering the tube');
  assert.equal(game.boundary.scale.z, game.camera.far * 4);
  const gridAt = worldZ => ((worldZ - game.boundary.position.z) / game.boundary.scale.z + .5)
    * uniforms.gridScale.value.y + uniforms.gridOffset.value;
  const gridBefore = gridAt(-100), travelBefore = game.courseWorldOffset.z;

  impact(game);
  assert.equal(game.state().shield, 90, 'One impact costs ten armor, not a continuous drain');
  assert.equal(game.notice.textContent, t('boundaryContact'));
  assert.deepEqual(game.messages.at(-1), {message: '−10 SHIELD', negative: true});
  assert.ok(game.notice.classList.contains('contact'));
  assert.equal(uniforms.contact.value, 1); assert.equal(uniforms.impactAge.value, 0);
  assert.ok(radius(game) < 1, 'The whole hull remains inside');
  assert.ok(game.flightMotion.x < 0 && game.flightOrientation.y > 0, 'Both velocity and heading point inward');
  assert.equal(game.state().shake, reducedMotion ? 0 : .45);
  const impactPoint = uniforms.impactPoint.value.clone().sub(game.courseWorldOffset);
  assert.ok(Math.abs(gridAt(-100 + game.courseWorldOffset.z - travelBefore) - gridBefore) < 1e-9,
    'The same surface point retains its hexagon coordinates through forward travel');
  game.step(.1);
  assert.ok(uniforms.impactPoint.value.clone().sub(game.courseWorldOffset).distanceTo(impactPoint) < 1e-9,
    'The ripple stays attached to the contacted surface, not the new heading or warning point');
  assert.ok(uniforms.contact.value < 1 && uniforms.contact.value > 0);
  separate(game, .72);
  assert.equal(game.state().shield, 90); assert.equal(game.notice.hidden, true);
  assert.equal(uniforms.contact.value, 0, 'The contact flash disappears within .75 seconds');
  assert.equal(game.boundary.visible, !reducedMotion, 'Travelling ripples remain visible after the contact glow and warning fade');
  game.step(.3); assert.equal(game.boundary.visible, false, 'All wavefronts expire in about 1.1 seconds');
  assert.equal(game.crashes.length, 0);
  const geometry = game.boundary.geometry, material = game.boundary.material, count = game.scene.children.length;
  for (const pressure of [0, .5, 1]) {
    game.configure({pressure}); game.reset();
    assert.equal(game.boundary.geometry, geometry); assert.equal(game.boundary.material, material);
    assert.equal(game.scene.children.length, count);
    assert.equal(game.boundary.visible, false); assert.equal(uniforms.strength.value, 0);
    assert.equal(uniforms.contact.value, 0); assert.equal(uniforms.impactAge.value, 10);
    assert.equal(game.flightViewOffset.length(), 0);
    assert.equal(game.state().shield, 90, 'Level resets do not refill armor');
  }
  game.place(radii.x - 50, 0, -100000); game.flightMotion.set(0, 0, -400); game.step(.1);
  assert.equal(game.boundary.visible, true, 'An untimed tutorial cannot outrun the membrane');
  assert.ok(game.boundary.position.z - game.boundary.scale.z / 2 < game.camera.position.z - game.camera.far);
  assert.ok(game.boundary.position.z + game.boundary.scale.z / 2 > game.camera.position.z + game.camera.far);
}
console.log('PASS extended stable shield coverage, quick ripple fade, world-anchored cells/impacts, reduced motion and bounded reuse');

// The approaching shield is already visible here: entering predictive warning must not shift its horizon.
for (const reducedMotion of [false, true]) for (const forward of [35, 400, 2500, 5000]) {
  const game = makeGame(reducedMotion), sideways = reducedMotion ? 10 : 100;
  const probe = timeToContact => {
    game.place(game.radii.x - 26 - sideways * .85 * (timeToContact + .01), 0);
    game.flightMotion.set(sideways, 0, -forward); game.step(.01);
    return game.uniforms.warningPoint.value.clone();
  };
  const before = probe(3.0001), after = probe(2.9999);
  assert.ok(before.distanceTo(after) < .1, 'No sudden forward extension at the 3-second warning threshold');
  assert.equal(game.uniforms.patchSize.value, reducedMotion ? 260 : 1100, 'The default extent stays fixed even at extreme speed');
  assert.equal(game.boundary.scale.z, game.camera.far * 4);
}
console.log('PASS continuous warning horizon and constant default extent at slow/extreme speeds');

// Earlier visibility for parallel near-wall flight and predicted approaches, without damage.
for (const reducedMotion of [false, true]) {
  const nearby = makeGame(reducedMotion);
  nearby.place(nearby.radii.x - 26 - (reducedMotion ? 100 : 450), 0);
  nearby.flightMotion.set(0, 0, -400);
  nearby.step(.2);
  assert.equal(nearby.boundary.visible, true, 'Show the wall before the old proximity threshold');
  assert.equal(nearby.notice.hidden, false);
  assert.equal(nearby.state().shield, 100);

  const approach = makeGame(reducedMotion);
  const outward = reducedMotion ? 70 : 300;
  approach.place(approach.radii.x - 26 - outward * .85 * 2.9, 0);
  approach.flightMotion.set(outward, 0, -400);
  approach.step(.1);
  assert.equal(approach.boundary.visible, true, 'Reveal a predicted contact before the original 2.5-second threshold');
  assert.equal(approach.notice.hidden, false);
  assert.equal(approach.state().shield, 100);
}
console.log('PASS earlier proximity and predictive warnings without damage');

// Sweep all sides and corners at speeds far above gameplay. No endpoint clamping through the wall.
for (const reducedMotion of [false, true]) for (const fps of [5, 30, 60, 144]) for (let i = 0; i < 16; i++) {
  const game = makeGame(reducedMotion), angle = i * Math.PI / 8;
  game.place(Math.cos(angle) * (game.radii.x - 26) * .8, Math.sin(angle) * (game.radii.y - 26) * .8);
  game.flightMotion.set(Math.cos(angle) * 300000, Math.sin(angle) * 200000, -400000);
  const forward = game.flightMotion.z, start = game.courseWorldOffset.clone();
  game.step(1 / fps);
  assert.ok(radius(game) < 1, `Cannot cross the field: reduced=${reducedMotion}, fps=${fps}, angle=${angle}`);
  assert.ok(game.flightMotion.dot(game.normal) < 0, 'Rebound velocity must point back inside');
  assert.ok(new THREE.Vector3(0, 0, -1).applyEuler(game.flightOrientation).dot(game.normal) < 0);
  assert.ok(Math.abs(game.flightMotion.z - forward) < 1e-8, 'Preserve forward momentum at contact');
  assert.ok(Math.abs(game.worldStep.z + forward / fps) < 1e-8, 'Do not shorten forward travel');
  assert.ok(game.courseWorldOffset.clone().sub(start).distanceTo(game.worldStep.clone().multiplyScalar(.85)) < 1e-8,
    'The corrected step is the single shared displacement for the course and all world objects');
  assert.ok(Math.abs(game.flightOrientation.y) <= Math.PI / 4 && Math.abs(game.flightOrientation.x) <= Math.PI / 4);
  assert.equal(game.state().shield, 90);
}
// Glancing hits near the steering limits must still point inward after heading clamping.
for (const reducedMotion of [false, true]) {
  const game = makeGame(reducedMotion);
  for (let face = 0; face < 24; face++) for (let yaw = -45; yaw <= 45; yaw += 9) for (let pitch = -45; pitch <= 45; pitch += 15) {
    const angle = face * Math.PI / 12, rx = game.radii.x - 26, ry = game.radii.y - 26;
    const normal = new THREE.Vector3(Math.cos(angle) / rx, Math.sin(angle) / ry, 0).normalize();
    game.flightOrientation.set(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ');
    game.flightMotion.set(0, 0, -1000).applyEuler(game.flightOrientation);
    if (game.flightMotion.dot(normal) <= 1) continue;
    game.place(Math.cos(angle) * rx * (1 - 1e-8), Math.sin(angle) * ry * (1 - 1e-8));
    game.flightViewOffset.set(0, 0); game.step(1 / 60);
    assert.ok(game.flightMotion.dot(game.normal) < 0, `Glancing rebound must point inward: face=${face}, yaw=${yaw}, pitch=${pitch}`);
    assert.ok(radius(game) < 1);
  }
}
const glance = makeGame(false);
glance.place(glance.radii.x - 27, 0); glance.flightMotion.set(100, 80, -400);
const incoming = glance.flightMotion.clone(); glance.step(.1);
const tangent = new THREE.Vector3(-glance.normal.y, glance.normal.x, 0);
assert.ok(Math.abs(glance.flightMotion.dot(tangent) - incoming.dot(tangent)) < 1e-8);
assert.ok(Math.abs(glance.flightMotion.dot(glance.normal) + .3 * incoming.dot(glance.normal)) < 1e-8);
console.log('PASS swept high-speed containment on all ellipse faces, forward/tangent momentum, 30% rebound and shared world alignment');

for (const reducedMotion of [false, true]) {
  const game = makeGame(reducedMotion);
  impact(game);
  for (let i = 0; i < 100; i++) impact(game, .02);
  assert.equal(game.state().shield, 90, 'Persistent contact is one impact even after the cooldown expires');
  assert.equal(game.sounds.length, 1);
  separate(game, .1); impact(game);
  assert.equal(game.state().shield, 80, 'A separated fresh impact can damage again');
  separate(game, .1); impact(game);
  assert.equal(game.state().shield, 80, 'Rapid repeat impacts are protected by the .75-second cooldown');
  separate(game, 1); impact(game);
  assert.equal(game.state().shield, 70);
  assert.equal(game.sounds.length, 3);
  assert.ok(/^\d+%$/.test(game.state().hud));

  const before = game.state(), offset = game.courseWorldOffset.clone(), velocity = game.flightMotion.clone();
  const position = game.boundary.position.clone(), phase = game.uniforms.phase.value, age = game.uniforms.impactAge.value;
  game.configure({paused: true}); game.renderFeedback(); game.step(10);
  assert.deepEqual(game.state(), before);
  assert.ok(game.courseWorldOffset.equals(offset)); assert.ok(game.flightMotion.equals(velocity));
  assert.ok(game.boundary.position.equals(position)); assert.equal(game.uniforms.phase.value, phase);
  assert.equal(game.uniforms.impactAge.value, age);
  assert.equal(game.notice.hidden, true); assert.equal(game.boundary.visible, true);
  game.configure({paused: false}); separate(game, 1); game.configure({shield: 10}); impact(game);
  assert.equal(game.state().shield, 0); assert.equal(game.crashes.length, 1);
  assert.equal(game.crashes[0], game.boundary);
  assert.equal(game.boundary.visible, false); assert.equal(game.notice.hidden, true);
  game.step(1); assert.equal(game.crashes.length, 1, 'Use the existing life-loss flow exactly once');

  const smooth = makeGame(reducedMotion);
  smooth.configure({speed: 400}); smooth.place(smooth.radii.x - 27, 0);
  smooth.flightOrientation.y = -Math.PI / 4;
  smooth.fly(1 / 60);
  const heading = smooth.flightOrientation.y, view = smooth.camera.rotation.y;
  assert.ok(heading > 0 && view < 0, 'Bounce redirects the flight without snapping the camera');
  assert.ok(Math.abs(heading + smooth.flightViewOffset.y - view) < 1e-8);
  smooth.fly(1 / 60);
  assert.ok(smooth.camera.rotation.y > view && smooth.camera.rotation.y < heading);
  assert.ok(Math.abs(smooth.camera.rotation.y - view) < .2, 'No abrupt camera turn on the next tick');
  for (let frame = 0; frame < 90; frame++) smooth.fly(1 / 60);
  assert.ok(Math.abs(smooth.camera.rotation.y - smooth.flightOrientation.y) < .001);
  assert.equal(smooth.state().shield, 90, 'Centering holds the inward course instead of immediately hitting again');
}
console.log('PASS per-impact damage, cooldown, no continuous drain, smooth camera recovery, pause and single life loss');

// Exercise actual flight/steering and boundary resolution at the production 60 Hz simulation rate.
for (const reducedMotion of [false, true]) for (const pressure of [0, .5, 1]) {
  let reference;
  for (const fps of [5, 30, 60, 144]) {
    const game = makeGame(reducedMotion); game.configure({pressure}); game.target.set(1, .6);
    let remainder = 0;
    for (let frame = 0; frame < fps * 30; frame++) {
      remainder += 1 / fps;
      while (remainder >= 1 / 60 - 1e-9) {
        game.fly(1 / 60); remainder -= 1 / 60;
        assert.ok(radius(game) <= 1 + 1e-9, 'Even sustained outward steering cannot escape');
        assert.ok(game.flightMotion.z <= 0);
      }
    }
    assert.ok(game.state().shield < 100, 'The route actually exercises a rebound');
    const result = [game.state().shield, game.courseWorldOffset.toArray(), game.flightOrientation.toArray(), game.sounds];
    if (!reference) reference = result;
    else assert.deepEqual(result, reference, 'Boundary physics and damage must not depend on display FPS');
  }
}
for (const inactive of [{started: false}, {ended: true}, {crashing: true}]) {
  const game = makeGame(false); game.place(2000, 0); game.flightMotion.set(400, 0, -400);
  const offset = game.courseWorldOffset.clone(), velocity = game.flightMotion.clone();
  game.configure(inactive); game.step(5);
  assert.equal(game.state().shield, 100); assert.equal(game.crashes.length, 0);
  assert.ok(game.courseWorldOffset.equals(offset)); assert.ok(game.flightMotion.equals(velocity));
  assert.equal(game.boundary.visible, false); assert.equal(game.notice.hidden, true);
}
assert.ok(source.includes('        resetFlightBoundary();'));
assert.ok(source.includes('        updateFlightBoundary(dt);'));
assert.ok(source.includes('        renderFlightBoundaryFeedback();'));
const constrain = source.indexOf('        constrainFlightToBoundary();');
assert.ok(constrain < source.indexOf('courseWorldOffset.addScaledVector(worldStep, .85)', constrain));
assert.ok(constrain < source.indexOf('ship.position.addScaledVector(worldStep, .85)', constrain));
console.log('PASS sustained steering containment, identical 5–144 FPS results, high-level speeds and intro/results/crash isolation');
