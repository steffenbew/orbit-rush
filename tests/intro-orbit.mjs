// Inspect the belt on screen rather than private phases, random samples or shader source.
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three.module.js';
import { createIntro } from '../src/presentation/intro.js';

function preview(width = 1280, height = 720, reducedMotion = false) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, width / height, .03, 14000);
  const ships = Array.from({length:9}, () => {
    const ship = new THREE.Group(); ship.userData.type = {scale:1}; return ship;
  });
  for (const i of [4, 7]) ships[i].add(new THREE.Mesh(new THREE.IcosahedronGeometry(1), new THREE.MeshBasicMaterial()));
  const button = { hovered:false, disabled:false, matches() { return this.hovered; } };
  const hover = { matches:true };
  const intro = createIntro({ scene, camera, ships, reducedMotion, introPlay:button, orbitHover:hover });
  const belt = scene.children[0];
  const step = (dt, hidden = false) => intro.update(dt, width, height, hidden);
  const diameter = Math.min(width * .98, height * 1.2, 1040), tilt = -24 * Math.PI / 180;
  function orbitPoint(rock) {
    const screen = rock.position.clone().project(camera), x = screen.x * width / 2, y = -screen.y * height / 2;
    const u = (x * Math.cos(tilt) + y * Math.sin(tilt)) / (diameter * 350 / 800);
    const v = (-x * Math.sin(tilt) + y * Math.cos(tilt)) / (diameter * 175 / 800);
    assert.ok(Math.abs(screen.x) < 1 && Math.abs(screen.y) < 1);
    assert.ok(Math.hypot(u,v) >= .84 - 1e-8 && Math.hypot(u,v) <= 1.16 + 1e-8);
    return Math.atan2(v,u);
  }
  step(0);
  return { belt, ships, camera, step, button, hover, orbitPoint, hide:intro.hide };
}
const tau = Math.PI * 2, wrap = angle => (angle % tau + tau) % tau;
const orbit = preview(), rocks = orbit.belt.children;
assert.equal(rocks.length, 60);
assert.equal(new Set(rocks.map(rock => rock.material)).size, 60);
const sizes = rocks.map(rock => rock.scale.x / (2 * Math.tan(35 * Math.PI / 180) * 260 / 720 * 1.1) * 11);
assert.equal(sizes.filter(s => s >= 22 && s <= 32).length, 6);
assert.equal(sizes.filter(s => s >= 7 && s < 20).length, 54);
for (const [i, rock] of rocks.entries()) {
  const template = orbit.ships[i % 2 ? 7 : 4].children[0];
  assert.equal(rock.geometry, template.geometry);
  assert.notEqual(rock.material, template.material);
  assert.ok(rock.material.vertexColors && rock.material.flatShading && !rock.material.transparent);
}
const rock = rocks[0], rotation = rock.quaternion.clone(), size = rock.scale.x;
let nearest = Infinity, farthest = 0, brightest = 0, darkest = Infinity;
for (let i = 0; i < 90; i++) {
  orbit.step(1);
  const depth = -rock.position.z, shade = rock.material.color.r;
  nearest = Math.min(nearest, depth); farthest = Math.max(farthest, depth);
  brightest = Math.max(brightest, shade); darkest = Math.min(darkest, shade);
}
assert.equal(rock.scale.x, size);
assert.ok(farthest / nearest > 1.05 && farthest / nearest < 1.12);
assert.ok(Math.abs(darkest / brightest - .92) < .001);
assert.ok(!rock.quaternion.equals(rotation));
for (const [width,height] of [[1280,720], [1920,1080], [390,844], [600,800]]) {
  const orbit = preview(width,height);
  for (let i = 0; i < 30; i++) {
    orbit.step(20);
    const phases = orbit.belt.children.map(orbit.orbitPoint).map(wrap).sort((a,b) => a-b);
    assert.ok(phases.every((p,i) => wrap(phases[(i+1)%60] - p) < .24), 'No empty sector in the tilted orbit');
  }
}
function speed(orbit, dt) {
  const rock = orbit.belt.children[0], before = orbit.orbitPoint(rock);
  orbit.step(dt); return wrap(orbit.orbitPoint(rock) - before) / dt;
}
const idle = tau / 90, tick = 1 / 120;
for (const mode of ['hover', 'disabled', 'touch']) {
  const orbit = preview(), before = speed(orbit, tick);
  assert.ok(Math.abs(before / idle - 1) < .04);
  orbit.button.hovered = true;
  orbit.button.disabled = mode === 'disabled'; orbit.hover.matches = mode !== 'touch';
  const first = speed(orbit, tick);
  if (mode === 'hover') assert.ok(first > before && first < before * 1.05);
  for (let i=0;i<480;i++) orbit.step(tick);
  assert.ok(Math.abs(speed(orbit, tick) / (idle * (mode === 'hover' ? 2 : 1)) - 1) < .04);
  orbit.button.hovered = false;
  for (let i=0;i<600;i++) orbit.step(tick);
  assert.ok(Math.abs(speed(orbit, tick) / idle - 1) < .04);
}
for (const reduced of [false,true]) {
  const orbit = preview(390,844,reduced);
  const frames = orbit.belt.children.map(r => [r.position.clone(),r.quaternion.clone()]);
  orbit.button.hovered = true; orbit.step(10, !reduced);
  orbit.belt.children.forEach((r,i) => {
    assert.ok(r.position.length() > 0 && r.position.equals(frames[i][0]) && r.quaternion.equals(frames[i][1]));
  });
  orbit.hide(); assert.equal(orbit.belt.visible, false);
}
console.log('PASS projected belt coverage and sizing, private shading, geometry reuse, orbit speed, hover and motion guards');
