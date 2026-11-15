// Run from the project root: node tests/flight-rings.mjs
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
const makeGame = (reducedMotion = false) => new Function('THREE', 't', 'reducedMotion', `
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(90, 16 / 9, .03, 14000);
  const sounds = [], crashes = [], messages = [], elements = new Map(), storage = new Map();
  const document = { querySelector(selector) {
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector, { hidden: true, style: {}, textContent: '', classList: {
        remove: key => classes.delete(key), contains: key => classes.has(key),
        toggle: (key, active) => active ? classes.add(key) : classes.delete(key)
      } });
    }
    return elements.get(selector);
  } };
  const innerWidth = 1280, innerHeight = 800;
  const localStorage = {setItem: (key, value) => storage.set(key, value)};
  const shieldHit = document.querySelector('#shield-hit');
  const playSound = name => sounds.push(name), updateShield = () => {}, updateScore = () => {};
  const showFeedback = (message, negative = false) => messages.push({message, negative});
  const startCrash = object => { crashes.push(object); crashing = true; paused = true; };
  let started = true, paused = false, roundEnded = false, crashing = false, celebrating = false;
  let tutorialStage = 3, tutorialRetryAt = 0;
  const completeTutorialStep = () => {};
  let gameTime = 0, difficulty = 0, levelPressure = 0, level = 1, shield = 100, shieldHitTime = 0, hitMarker = 0;
  let score = 0, best = 0, speed = 0;
  const simulationStep = 1 / 60, roundDuration = 45;
  const target = new THREE.Vector2(), flightVelocity = new THREE.Vector2(), flightTurn = new THREE.Vector2(), flightViewOffset = new THREE.Vector2();
  const flightTilt = new THREE.Vector3(), flightOrientation = new THREE.Euler(0, 0, 0, 'YXZ');
  const flightDirection = new THREE.Vector3(0, 0, -1), flightMotion = new THREE.Vector3();
  const playerHullRotation = new THREE.Quaternion(), worldStep = new THREE.Vector3();
  let showerCorridor = false, showerStart = 0, showerEntry = 12, showerEnd = 27, showerShape = 0, showerBend = 1;
  let corridorPlan = null; const showerCourse = 0, showerKind = 'shower';
  let showerLength = 0, showerSpacing = 0, showerObstacleSpacing = 0, nextShowerObstacle = 0, showerHalfGap = 0, showerHalfWidth = 0;
  const showerStrength = 1, maxShowerRocks = 144;
  const showerRotation = new THREE.Quaternion(), showerDirection = new THREE.Vector3(), showerVelocity = new THREE.Vector3();
  const random = (a, b) => (a + b) / 2;
  ${section('      function levelFlightSpeed(', '      let capitalShip =')}
  ${section('      function corridorCenter(', '      function corridorSlope(')}
  ${section('      function planAsteroidShower()', '      function advanceAsteroidShower(')}
  ${section('      function advanceFlightHeading(', '      function updateCollisionHazard(')}
  ${section('      const flightRingWash =', '      function collideWith(')}
  planAsteroidShower(); resetFlightRing();
  return {
    scene, camera, sounds, crashes, messages, target, flightMotion, flightTurn, flightOrientation, worldStep, storage,
    rings: flightRings, core: flightRingCore, halo: flightRingHalo,
    wash: flightRingWash, guide: flightRingGuide,
    resetFlightRing, updateFlightRing, renderFlightRingFeedback,
    planAsteroidShower, corridorCenter, showerCourseOrigin, flightDistanceAt, levelFlightSpeed,
    field: () => ({length: showerLength, gap: showerHalfGap}),
    state: () => ({shield, shieldHitTime, score, best, wash: flightRingWashStrength, time: gameTime}),
    configure(options) {
      if ('time' in options) gameTime = options.time;
      if ('shield' in options) shield = options.shield;
      if ('score' in options) score = options.score;
      if ('best' in options) best = options.best;
      if ('tutorialStage' in options) tutorialStage = options.tutorialStage;
      if ('paused' in options) paused = options.paused;
      if ('started' in options) started = options.started;
      if ('ended' in options) roundEnded = options.ended;
      if ('crashing' in options) crashing = options.crashing;
      if ('corridor' in options) { showerCorridor = options.corridor; showerBend = 1; corridorPlan = null; }
      if ('level' in options) level = options.level;
      if ('shape' in options) showerShape = options.shape;
      if ('pressure' in options) levelPressure = options.pressure;
    },
    move(dt) {
      gameTime += dt; worldStep.copy(flightMotion).multiplyScalar(-dt);
      updateFlightRing(); camera.updateMatrixWorld(); renderFlightRingFeedback();
    },
    fly(dt) {
      gameTime += dt; difficulty = gameTime / roundDuration;
      ${section('        const easing = 1 - Math.exp(-3 * dt);', '        worldStep.copy(flightMotion)')}
      worldStep.copy(flightMotion).multiplyScalar(-dt);
      updateFlightRing(); camera.updateMatrixWorld(); renderFlightRingFeedback();
    }
  };
`)(THREE, t, reducedMotion);


for (const reducedMotion of [false, true]) for (const level of [1, 4, 10]) {
  const game = makeGame(reducedMotion);
  game.configure({level}); game.resetFlightRing();
  game.renderFlightRingFeedback();
  assert.equal(game.messages.length, 0, 'No checkpoint rules banner at level start');
  assert.ok(!source.includes('flight-ring-notice'), 'Checkpoint messages have no duplicate bottom notice');
  assert.equal(game.rings.length, 5);
  assert.equal(game.rings.filter(gate => gate.visible).length, 5, 'Five checkpoints per ordinary level');
  const positions = game.rings.map(gate => gate.position.clone());
  assert.ok(Math.abs(positions[0].z + game.flightDistanceAt(5)) < 1e-8);
  [5, 12, 22, 32, 40].forEach((time, index) => assert.ok(Math.abs(positions[index].z + game.flightDistanceAt(time)) < 1e-8));
  assert.deepEqual(game.rings.map(gate => gate.userData.kind), ['start', 'course', 'course', 'course', 'finish']);
  assert.equal(game.rings.at(-1).children[0].material.opacity, 0, 'A very distant finish must never flash on reset');
  assert.equal(game.rings.at(-1).children[1].material.uniforms.brightness.value, 0);
  game.target.set(1, .5); game.worldStep.set(15, -2, 4); game.updateFlightRing();
  for (let i = 0; i < game.rings.length; i++) {
    assert.ok(game.rings[i].position.distanceTo(positions[i].clone().addScaledVector(game.worldStep, .85)) < 1e-8,
      'Steering never respawns/repositions gates: only common inverse world travel');
  }
  game.resetFlightRing(); game.target.set(0, 0);
  assert.deepEqual(game.rings.map(gate => gate.position.toArray()), positions.map(position => position.toArray()));
  assert.equal(game.rings[0].children[0].geometry.parameters.tube, .075);
  assert.ok(game.halo.fragmentShader.includes('float roughness = .004 * sin'), 'Use tiny surface roughness instead of the large whole-ring wobble');
  assert.ok(game.halo.fragmentShader.includes('grain * .12'), 'Give the laser edge subtle nonuniform thickness');
  assert.ok(game.halo.fragmentShader.includes('filamentRadius'), 'Keep fine moving electrical arcs');
  const coreShader = {uniforms: {}, vertexShader: '#include <begin_vertex>'};
  game.core.onBeforeCompile(coreShader);
  assert.equal(coreShader.uniforms.ringPhase, game.halo.uniforms.phase, 'Core and corona use the same surface animation');
  game.rings.forEach(gate => {
    assert.equal(gate.scale.x, reducedMotion ? 14 : 80, 'Small fixed checkpoint sizes, independent of speed and wider spacing');
    assert.equal(gate.userData.radius, gate.scale.x, 'Crossing aperture matches the smaller visible checkpoint');
  });
  assert.ok(game.halo.fragmentShader.includes('cos(angle - phase)'), 'Keep the rotating energy highlight');
  assert.equal(game.core.fog, false);
  assert.ok(game.halo.fragmentShader.includes('fwidth(distanceToRim)'), 'Distant laser cores retain a minimum pixel width');
  assert.equal(game.halo.depthWrite, false, 'The open center must not occlude ships');
  const radius = game.rings[0].scale.x;
  while (!game.sounds.length && game.state().time < 7) game.fly(1 / 60);
  assert.deepEqual(game.sounds, ['checkpoint']);
  assert.ok(Math.abs(game.state().time - 5) < .04, 'The opening checkpoint arrives after five seconds, with more time to read the instruction');
  assert.equal(game.state().shield, 100); assert.equal(game.state().score, 0, 'Checkpoints award no points');
  assert.deepEqual(game.messages.at(-1), {message: `${t('shieldFull')} · ${t('ringPassed')}`, negative: false}, 'Full shield shows 100% instead of implying healing');
  assert.equal(game.state().best, 0);
  assert.equal(game.storage.size, 0, 'Checkpoint crossings do not write the highscore');
  assert.equal(game.rings[0].visible, false);
  assert.ok(game.rings[0].position.z >= game.camera.position.z, 'Passed ring stays behind, never reappears ahead');
  assert.equal(game.rings[0].scale.x, radius, 'The pulse must not change the opening');
}
console.log('PASS fixed full course at level start, deterministic placement, thick distant gates and no score/highscore on crossing');

function isolateGate(game, x = 0, z = -100, radius = 120) {
  game.rings.forEach(gate => { gate.visible = false; gate.userData.resolved = true; });
  const gate = game.rings[0];
  gate.visible = true; gate.userData.resolved = false; gate.userData.radius = radius;
  gate.userData.normal.set(0, 0, 1); gate.position.copy(game.camera.position).add(new THREE.Vector3(x, 0, z));
  return gate;
}
for (const reducedMotion of [false, true]) for (const kind of ['start', 'course', 'approach', 'finish']) {
  for (const initialShield of [40, 97, 100]) {
    const game = makeGame(reducedMotion), gate = isolateGate(game, 0, -10);
    gate.userData.kind = kind;
    game.configure({shield: initialShield, score: 600, best: 600});
    game.flightMotion.set(0, 0, -200); game.move(.1);
    const restored = Math.min(5, 100 - initialShield);
    assert.equal(game.state().shield, initialShield + restored, 'Regular checkpoints restore up to five shield, capped at 100');
    assert.equal(game.state().score, 600, 'Healing leaves an existing score unchanged');
    assert.equal(game.state().best, 600, 'Healing leaves an existing highscore unchanged');
    assert.equal(game.storage.size, 0, 'Healing never writes the highscore');
    assert.deepEqual(game.messages.at(-1), {
      message: `${restored ? t('repaired', {amount: restored}) : t('shieldFull')} · ${t('ringPassed')}`, negative: false
    }, 'Show actual healing, including the final +3 to reach 100%, or full shield when already full');
    game.flightMotion.negate(); game.move(.2); game.flightMotion.negate(); game.move(.2);
    assert.equal(game.state().shield, initialShield + restored, 'Re-crossing cannot farm shield');
    assert.equal(game.state().score, 600, 'Re-crossing also leaves the score unchanged');
    assert.equal(game.messages.length, 1);
  }
}
for (const reducedMotion of [false, true]) {
  const game = makeGame(reducedMotion);
  game.configure({shield: 60, tutorialStage: 0});
  isolateGate(game, 200, -10);
  game.flightMotion.set(0, 0, -200); game.move(.1);
  assert.equal(game.state().shield, 50, 'Tutorial misses still cost ten shield');
  isolateGate(game, 0, -10); game.move(.1);
  assert.equal(game.state().shield, 50, 'Passing the retried tutorial checkpoint must not heal');
  assert.equal(game.state().score, 0, 'The tutorial checkpoint awards no points either');
  assert.equal(game.state().best, 0);
  assert.equal(game.storage.size, 0);
  assert.equal(game.messages.at(-1).message, t('ringPassed'));
}
console.log('PASS +5 checkpoint shield, cap and actual-heal feedback, no repeat healing and no tutorial healing');

for (const reducedMotion of [false, true]) {
  const game = makeGame(reducedMotion), gate = isolateGate(game);
  const near = reducedMotion ? 400 : 2600, far = reducedMotion ? 700 : 3600;
  gate.position.set(0, 0, -near); game.updateFlightRing();
  assert.equal(gate.children[0].material.opacity, 0, 'Even nearby checkpoints softly activate instead of popping in');
  game.configure({time: .2}); game.updateFlightRing();
  assert.equal(gate.children[1].material.uniforms.brightness.value, .5);
  game.configure({time: .4}); game.updateFlightRing();
  assert.equal(gate.children[1].material.uniforms.brightness.value, 1);
  game.configure({time: 1});
  let previousOpacity = 0;
  for (const distance of [far + 100, far, far - .01, (near + far) / 2, near + .01, near, near - 100]) {
    gate.position.set(0, 0, -distance); game.updateFlightRing();
    const expected = 1 - THREE.MathUtils.smoothstep(distance, near, far);
    assert.ok(Math.abs(gate.children[0].material.opacity - expected * (reducedMotion ? 1 : .9 + .1 * Math.sin(2.7))) < 1e-12);
    assert.equal(gate.children[1].material.uniforms.brightness.value, expected, 'Fade the entire halo, not just its core');
    assert.ok(expected >= previousOpacity && expected >= 0 && expected <= 1);
    assert.equal(gate.visible, true); assert.equal(gate.userData.resolved, false, 'Distance fading must not disable gate logic');
    previousOpacity = expected;
  }
  const later = game.rings[1]; later.visible = true; later.userData.resolved = false;
  later.position.set(0, 0, -(near + far) / 2); game.updateFlightRing();
  assert.equal(later.children[1].material.uniforms.brightness.value, .15, 'Later checkpoints retain their dimmed emphasis while fading');
  game.configure({paused: true}); later.position.z = -far; game.updateFlightRing();
  assert.equal(later.children[1].material.uniforms.brightness.value, .15, 'Pause freezes checkpoint appearance');
  game.configure({paused: false}); game.updateFlightRing();
  assert.equal(later.children[0].material.opacity, 0); assert.equal(later.children[1].material.uniforms.brightness.value, 0);
  gate.position.z = -far - 100; game.updateFlightRing();
  assert.equal(gate.children[0].material.opacity, 0);
  game.flightMotion.set(0, 0, -(far + 200) / .85); game.move(1);
  assert.deepEqual(game.sounds, ['checkpoint', 'checkpoint'], 'A swept crossing still passes each gate, even if the previous frame was fully faded');
  assert.equal(game.state().score, 0);
}
console.log('PASS shared core/halo distance fade, no reset flash, dimmed later gates, fading direction guide, pause and unchanged crossing logic');

for (const fps of [5, 10, 30, 60, 144]) for (const offset of [0, 120, 121]) {
  const game = makeGame(); game.camera.position.set(15, -10, 50);
  const gate = isolateGate(game, 100 + offset);
  game.flightMotion.set(400, 0, -400);
  for (let i = 0; i < Math.ceil(fps * .5); i++) game.move(1 / fps);
  assert.equal(game.state().shield, offset <= 120 ? 100 : 90, 'Interpolate the actual diagonal plane crossing');
  assert.equal(game.state().score, 0);
  assert.deepEqual(game.sounds, [offset <= 120 ? 'checkpoint' : 'checkpointMiss'], 'Resolve the correct outcome only once');
  assert.equal(gate.visible, false);
  game.flightMotion.negate(); game.move(1); game.flightMotion.negate(); game.move(1);
  assert.equal(game.sounds.length, 1);
}
// Gate planes may face any direction, including behind the initial world heading.
for (const yaw of [Math.PI / 2, Math.PI, -1.2]) {
  const game = makeGame(), gate = isolateGate(game);
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
  gate.position.applyQuaternion(rotation); gate.userData.normal.applyQuaternion(rotation);
  game.flightMotion.set(0, 0, -400).applyQuaternion(rotation);
  game.move(.4);
  assert.deepEqual(game.sounds, ['checkpoint'], 'Rotated gates remain passable');
  assert.equal(game.state().score, 0);
}
const lethal = makeGame(); lethal.configure({shield: 7}); isolateGate(lethal, 200, -1);
lethal.flightMotion.set(0, 0, -200); lethal.move(1 / 60);
assert.equal(lethal.state().shield, 0); assert.equal(lethal.crashes.length, 1);
assert.equal(lethal.wash.style.opacity, '0');
console.log('PASS rotated and swept diagonal crossings at 5–144 FPS, one reward/penalty per gate and lethal misses');

for (const reducedMotion of [false, true]) {
  const game = makeGame(reducedMotion), gate = isolateGate(game, 0, -20);
  game.flightMotion.set(0, 0, -200); game.move(.02);
  assert.ok(Number(game.wash.style.opacity) > 0, 'Tint starts while entering the gate');
  assert.equal(game.sounds.length, 0);
  game.move(.1); assert.equal(gate.visible, false);
  assert.equal(gate.userData.passedAt, game.state().time, 'Successful crossings timestamp the ship-wave trigger');
  assert.deepEqual(game.messages.at(-1), {message: `${t('shieldFull')} · ${t('ringPassed')}`, negative: false}, 'Keep successful checkpoint feedback');
  assert.equal(Number(game.wash.style.opacity), reducedMotion ? .25 : 1);
  game.move(.2); assert.ok(Number(game.wash.style.opacity) > 0);
  game.move(.2); assert.equal(game.wash.style.opacity, '0');
  const geometry = gate.children[0].geometry, allocated = game.scene.children.length;
  game.resetFlightRing();
  assert.ok(game.rings.every(gate => gate.userData.passedAt === -Infinity), 'Retries clear old wave triggers');
  assert.equal(game.scene.children.length, allocated, 'A fixed bounded pool, no respawn allocations');
  assert.equal(game.scene.children.filter(object => object.userData.flightRing).length, 5);
  assert.equal(game.rings[0].children[0].geometry, geometry);
}
const miss = makeGame(); isolateGate(miss, 200, -10); miss.flightMotion.set(0, 0, -200); miss.move(.1);
assert.equal(miss.wash.classList.contains('missed'), true);
assert.deepEqual(miss.sounds, ['checkpointMiss'], 'Misses use their dedicated error cue, not the collision hit bank');
assert.ok(miss.rings.every(gate => gate.userData.passedAt === -Infinity), 'Missing a checkpoint does not release a ship wave');
assert.deepEqual(miss.messages.at(-1), {message: t('ringMissed'), negative: true}, 'The top red message includes CHECKPOINT MISSED and the shield penalty');
miss.configure({paused: true}); miss.renderFlightRingFeedback();
assert.equal(miss.wash.style.opacity, '0');
miss.configure({paused: false}); miss.renderFlightRingFeedback(); assert.equal(Number(miss.wash.style.opacity), 1);
const messageCount = miss.messages.length;
miss.resetFlightRing(); assert.equal(miss.state().shield, 90); assert.equal(miss.wash.style.opacity, '0');
miss.renderFlightRingFeedback(); assert.equal(miss.messages.length, messageCount, 'Reset must not introduce a rules banner');
miss.configure({time: 60}); miss.resetFlightRing(true); miss.renderFlightRingFeedback();
assert.equal(miss.messages.length, messageCount, 'No rules banner after the tutorial either');
console.log('PASS cyan crossing wash, red miss, brief fades, reduced motion, paused feedback and bounded reuse');

for (const mode of [{started: false}, {paused: true}, {ended: true}, {crashing: true}]) {
  const game = makeGame(), position = game.rings[0].position.clone();
  game.configure(mode); game.worldStep.set(200, 10, 100); game.updateFlightRing();
  assert.ok(game.rings[0].position.equals(position)); assert.equal(game.sounds.length, 0);
  game.renderFlightRingFeedback(); assert.equal(game.guide.hidden, true);
  if (mode.ended || mode.crashing) assert.ok(game.rings.every(gate => !gate.visible));
}
for (const reducedMotion of [false, true]) for (const shape of [0, 1, 2]) {
  const corridor = makeGame(reducedMotion); corridor.configure({corridor: true, shape});
  corridor.planAsteroidShower(); corridor.resetFlightRing();
  assert.equal(corridor.rings.filter(gate => gate.visible).length, 5, 'Redistribute intermediate checkpoints rather than dropping them in corridor levels');
  assert.ok(corridor.field().length > 0);
  for (const gate of corridor.rings) {
    const depth = corridor.showerCourseOrigin.z - gate.position.z, clearance = gate.userData.radius * 1.5;
    const overlapsCorridor = depth >= -clearance && depth <= corridor.field().length + clearance;
    assert.equal(overlapsCorridor, false, 'No checkpoint or corona overlaps the corridor entrance or exit');
    assert.equal(gate.userData.resolved, false);
  }
  const approach = corridor.rings.find(gate => gate.userData.kind === 'approach');
  assert.ok(approach.position.z > corridor.showerCourseOrigin.z, 'The strategic checkpoint marks the approach to the opening');
  assert.ok(corridor.rings.at(-1).position.z < corridor.showerCourseOrigin.z - corridor.field().length, 'The finish is always beyond the corridor');
  corridor.rings.slice(1).forEach((gate, index) => {
    assert.ok(corridor.rings[index].position.z - gate.position.z >= gate.userData.radius * 3, 'Keep gates ordered and their glows separated');
  });
  assert.equal(corridor.field().gap, reducedMotion ? 30 : 45, 'Strength-1 passage stays navigable without unbounded level-based narrowing');
}
const guide = makeGame(); guide.configure({time: 1});
guide.camera.rotation.y = Math.PI; guide.camera.updateMatrixWorld(); guide.renderFlightRingFeedback();
assert.equal(guide.guide.hidden, false, 'Turning away gives a direction back to the fixed course');
guide.camera.rotation.y = 0; guide.camera.updateMatrixWorld(); guide.renderFlightRingFeedback();
assert.equal(guide.guide.hidden, true);
guide.rings[0].position.set(0, 0, -50000); guide.renderFlightRingFeedback();
assert.equal(guide.guide.hidden, true, 'A distant checkpoint straight ahead must not produce a misleading sideways arrow');
guide.camera.rotation.y = Math.PI; guide.camera.updateMatrixWorld(); guide.renderFlightRingFeedback();
assert.equal(guide.guide.hidden, true, 'Do not advertise completely faded checkpoints with an off-screen arrow');
guide.rings[0].position.set(0, 0, -3100); guide.renderFlightRingFeedback();
assert.equal(guide.guide.hidden, false); assert.equal(Number(guide.guide.style.opacity), .5);
assert.ok(source.includes('        updateFlightRing();'));
assert.ok(source.includes('        renderFlightRingFeedback();'));
assert.ok(source.includes('        resetFlightRing();'));
console.log('PASS lifecycle guards, no gates in any corridor shape, original passage height and off-screen course guide');

// Leave five seconds of finish margin, including an already-moving tutorial handoff.
for (const reducedMotion of [false, true]) for (const level of [1, 4, 10, 40]) for (const cruising of [false, true]) {
  const game = makeGame(reducedMotion); game.configure({level}); game.resetFlightRing();
  const finish = game.rings.at(-1);
  game.rings.slice(0, -1).forEach(gate => { gate.visible = false; gate.userData.resolved = true; });
  if (cruising) game.flightMotion.set(0, 0, -game.levelFlightSpeed(0));
  while (!finish.userData.resolved && game.state().time < 45) game.fly(1 / 60);
  assert.deepEqual(game.sounds, ['checkpoint'], 'The finish must be reachable before the level ends');
  assert.equal(game.state().score, 0);
  const remaining = 45 - game.state().time;
  assert.ok(remaining >= 4.5 && remaining <= 5.5,
    `Finish timing: reduced=${reducedMotion}, level=${level}, cruising=${cruising}, remaining=${remaining}`);
}
console.log('PASS final checkpoint with five seconds to spare at all cruise speeds, from rest and after training');

// A simple heading controller must be able to follow the actual fixed course within the round.
for (const reducedMotion of [false, true]) for (const level of [1, 2, 3, 4, 5, 7, 8, 12, 40, 100]) for (const shape of [0, 1, 2]) {
  const game = makeGame(reducedMotion);
  game.configure({level, corridor: true, shape}); game.planAsteroidShower(); game.resetFlightRing();
  const availableGates = game.rings.filter(gate => gate.visible).length;
  while (game.state().time < 45 && game.rings.some(gate => !gate.userData.resolved)) {
    const next = game.rings.find(gate => !gate.userData.resolved), delta = next.position.clone().sub(game.camera.position);
    const yaw = -Math.atan2(delta.x, -delta.z), pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    const yawError = Math.atan2(Math.sin(yaw - game.flightOrientation.y), Math.cos(yaw - game.flightOrientation.y));
    const motion = reducedMotion ? .5 : 1;
    game.target.set(
      THREE.MathUtils.clamp(-(yawError * 2 - game.flightTurn.x * .8) / (.9 * motion), -1, 1),
      THREE.MathUtils.clamp(((pitch - game.flightOrientation.x) * 2 - game.flightTurn.y * .8) / (.65 * motion), -1, 1)
    );
    game.fly(1 / 60);
  }
  assert.deepEqual(game.sounds, Array(availableGates).fill('checkpoint'), `Entire course must be flyable: level=${level}, shape=${shape}, reduced=${reducedMotion}`);
  assert.equal(game.state().score, 0, 'Even an entire checkpoint course awards no score');
  assert.equal(game.state().shield, 100);
  assert.ok(45 - game.state().time >= 4 && 45 - game.state().time <= 5.5, 'Corridor routes also leave comfortable finish margin');
}
console.log('PASS widely spaced course gates reachable within 45 seconds using real aircraft inertia at early/late speeds and all corridor shapes');
