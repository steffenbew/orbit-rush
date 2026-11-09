// Run from the project root: node tests/asteroid-visibility.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const THREE = await import(new URL('assets/vendor/three.module.js', root));
const source = readFileSync(new URL('index.html', root), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
};
const math = Object.create(Math);
math.random = () => .8; // Exercise solid fragments, not the alternate dust-only burst.
const makeGame = (reducedMotion = false) => new Function('THREE', 'Math', 'reducedMotion', `
  const scene = new THREE.Scene(), glow = new THREE.Texture();
  const camera = new THREE.PerspectiveCamera(90, 16 / 9, .03, 14000);
  const worldStep = new THREE.Vector3(), particleView = new THREE.Vector3();
  const ships = [];
  const random = (a, b) => (a + b) / 2, pick = values => values[0];
  let particles = [], paused = false, crashing = false, roundEnded = false, gameTime = 0;
  const hits = [];
  const collideWith = object => { object.userData.collisionHandled = true; hits.push(object); };
  ${section('      const inverseRotation =', '      const mouseAim =')}
  ${section('      const asteroidFragmentShapes =', '      const symbolTextures =')}
  ${section('      function shatterAsteroid(', '      function applyExplosionShockwave(')}
  ${section('      function recordVisibleObjects()', '      function renderFrame()')}
  return {
    scene, camera, hasPassedCamera, shatterAsteroid, hits, render: recordVisibleObjects,
    get particles() { return particles; },
    setPaused: value => { paused = value; },
    step: (dt, render = true) => {
      if (!paused) gameTime += dt;
      camera.updateMatrixWorld();
      viewFrustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      ${section('        const fragmentHits = [];', '      }\n      function recordVisibleObjects()')}
      if (render) recordVisibleObjects();
    }
  };
`)(THREE, math, reducedMotion);

const game = makeGame();
const hull = new THREE.Object3D();
hull.userData.collisionBox = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
game.camera.updateMatrixWorld();
hull.scale.set(10, 10, 150); hull.position.z = 120;
assert.equal(game.hasPassedCamera(hull), false, 'A center behind us is not enough while the hull still reaches the view');
hull.position.z = 260;
assert.equal(game.hasPassedCamera(hull), true, 'Recycle only once the whole hull is safely behind');
hull.scale.setScalar(1); hull.position.set(1000, 0, 120);
game.camera.rotation.y = -.7; game.camera.updateMatrixWorld();
assert.equal(game.hasPassedCamera(hull), false, 'Turning must not recycle a still-visible object using world Z');
game.camera.position.set(100, 50, 20); hull.position.add(game.camera.position); game.camera.updateMatrixWorld();
assert.equal(game.hasPassedCamera(hull), false, 'Cleanup must also account for camera translation');
assert.ok(source.includes('if (hasPassedCamera(ship)) queueShip(ship);'));
console.log('PASS whole-hull recycling, camera turns and camera translation');

for (const reducedMotion of [false, true]) {
  const fragments = makeGame(reducedMotion);
  const asteroid = { scale: { x: 3.2 }, position: new THREE.Vector3(0, 0, -100) };
  fragments.shatterAsteroid(asteroid);
  const particle = fragments.particles[0], rock = particle.object;
  for (const p of fragments.particles) {
    p.vx = p.vy = p.vz = p.spin = 0;
    p.object.position.set(10000, 0, -100);
  }
  rock.position.set(0, 0, -100);
  particle.age = particle.life - .2;
  fragments.step(.1);
  assert.equal(rock.material.transparent, false, 'Rock fragments should render as solid geometry');
  assert.equal(rock.material.opacity, 1, 'The final lifetime fraction must not fade a visible fragment');
  fragments.step(5);
  assert.ok(fragments.particles.includes(particle), 'Visible fragments must survive their old expiry timer');
  assert.equal(rock.parent, fragments.scene);
  assert.equal(rock.material.opacity, 1);

  const age = particle.age, position = rock.position.clone();
  fragments.setPaused(true); fragments.step(5);
  assert.equal(particle.age, age); assert.ok(rock.position.equals(position));
  fragments.setPaused(false);
  rock.position.set(0, 0, 50); rock.scale.setScalar(100);
  fragments.step(0);
  assert.ok(fragments.particles.includes(particle), 'A fragment crossing the camera plane must not be culled by its center');
  rock.scale.setScalar(1); rock.position.set(0, 0, -2);
  fragments.step(1 / 60);
  assert.ok(fragments.hits.includes(rock), 'Retained fragments must remain real collision hazards');

  fragments.camera.rotation.y = -.7;
  rock.position.set(1000, 0, 120); fragments.step(0);
  assert.ok(fragments.particles.includes(particle), 'Visible fragments also survive during turns');
  let disposed = false;
  rock.material.addEventListener('dispose', () => { disposed = true; });
  rock.position.set(-10000, 0, -100); fragments.step(0);
  assert.ok(!fragments.particles.includes(particle), 'Expired fragments should be cleaned up once off-screen');
  assert.equal(rock.parent, null); assert.ok(disposed);

  fragments.camera.rotation.set(0, 0, 0);
  for (let i = 0; i < 10; i++) fragments.shatterAsteroid(asteroid);
  assert.equal(fragments.particles.length, 96, 'Keeping visible fragments must not exceed the existing hard cap');
  for (const p of fragments.particles) {
    p.object.position.set(0, 0, -100); p.age = p.life + 1;
  }
  fragments.step(0); fragments.shatterAsteroid(asteroid);
  assert.equal(fragments.particles.length, 96, 'New bursts must not evict visible old fragments');
  for (const p of fragments.particles) p.object.position.x = 10000;
  fragments.step(0);
  assert.equal(fragments.particles.length, 0, 'Off-screen expiry must free the fragment budget');

  const dust = new THREE.Sprite(new THREE.SpriteMaterial());
  dust.position.set(0, 0, -100); fragments.scene.add(dust);
  fragments.particles.push({ object: dust, kind: 'dust', age: 0, life: 1, baseSize: 1, vx: 0, vy: 0, vz: 0, spin: 0 });
  fragments.step(.5); assert.ok(dust.material.opacity < .5, 'Dust and other transient effects should still fade');
  fragments.step(.6); assert.equal(fragments.particles.length, 0);
}
console.log('PASS opaque visible fragments beyond expiry, pause, collisions, safe cleanup, bounded budget and unchanged dust fades');

const unseen = makeGame();
unseen.shatterAsteroid({scale: {x: 3.2}, position: new THREE.Vector3(0, 0, -100)});
for (const p of unseen.particles) {
  p.vx = p.vy = p.vz = p.spin = 0;
  p.object.position.set(10000, 0, -100);
}
const freshRock = unseen.particles[0].object;
freshRock.scale.setScalar(1); freshRock.position.set(0, 0, -2);
for (let tick = 0; tick < 15; tick++) unseen.step(1 / 60, false);
assert.equal(unseen.hits.length, 0, 'Catch-up ticks must not damage the player with a never-rendered fragment');
assert.equal(freshRock.userData.lastVisibleTime, -Infinity);
unseen.render(); unseen.step(1 / 60, false);
assert.ok(unseen.hits.includes(freshRock), 'The same fragment becomes a real hazard after it has been shown');
console.log('PASS render-only visibility: no unseen fragment hits during a catch-up frame');
