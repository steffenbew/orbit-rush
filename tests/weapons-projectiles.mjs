import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../assets/vendor/three.module.js';
import { createPlayerProjectiles } from '../src/weapons/projectiles.js';
import { playerLaserSpeed } from '../src/weapons/rules.js';

const vector = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function setup(ships = [], wallDepth = Infinity) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), flightMotion = vector();
  const hits = [];
  const projectiles = createPlayerProjectiles({
    scene, camera, flightMotion, ships, glow: new THREE.Texture(),
    findWallHit(from, to, hullDistance) {
      const depth = from.z + wallDepth;
      return depth >= 0 && depth < hullDistance && to.z <= -wallDepth ? 'wall' : null;
    },
    onWallHit: (wall, damage) => hits.push({ target: wall, damage }),
    onShipHit: (ship, heavy, damage) => hits.push({ target: ship, damage })
  });
  return { scene, flightMotion, hits, projectiles };
}

test('both beams travel at the predicted speed plus world motion, then clear from the scene', () => {
  const { scene, projectiles, flightMotion } = setup();
  const dt = 1 / 60, drift = vector(1, 2, 3);
  for (const speed of [35, 180, 600, 1200]) for (const heavy of [false, true]) {
    flightMotion.set(.4 * speed, .1 * speed, -speed);
    const expected = (flightMotion.length() + 420) * (heavy ? 1.25 : 1.5);
    assert.equal(playerLaserSpeed(flightMotion, heavy), expected);
    projectiles.fire(vector(), vector(0, 0, -1), heavy);
    projectiles.update(dt, drift);
    assert.equal(projectiles.count, 1);
    assert.ok(scene.children[0].position.distanceTo(vector(1, 2, 3 - expected * dt)) < 1e-9);
    projectiles.clear();
    assert.equal(projectiles.count, 0);
    assert.equal(scene.children.length, 0);
  }
});

test('a swept shot hits the wall only if it is in front of the ship surface', () => {
  const ship = new THREE.Group();
  ship.position.z = -100;
  ship.userData.type = { radius: 10 };
  for (const [depth, target] of [[70, 'wall'], [95, ship]]) for (const heavy of [false, true]) {
    const { projectiles, hits, scene } = setup([ship], depth);
    projectiles.fire(vector(), vector(0, 0, -1), heavy);
    projectiles.update(.3, vector()); // Cross both obstacles in a single tick.
    assert.deepEqual(hits, [{ target, damage: heavy ? 3 : 1 }]);
    assert.equal(scene.children.length, 0);
    projectiles.update(.3, vector());
    assert.equal(hits.length, 1);
  }
});

test('a capital ship needs a mesh hit; an empty corner does not block a shot', () => {
  const ship = new THREE.Group();
  ship.userData.type = { radius: 20, capital: true };
  ship.position.z = -90;
  ship.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial()));
  const { projectiles, hits } = setup([ship], 120);
  for (const x of [15, 0]) {
    projectiles.fire(vector(x), vector(0, 0, -1), false);
    projectiles.update(.25, vector());
  }
  assert.deepEqual(hits.map(h => h.target), ['wall', ship]);
});

test('unspent shots expire by age or range without reporting a hit', () => {
  const { projectiles, hits, scene } = setup();
  for (const [dt, worldStep] of [[8.01, vector()], [.01, vector(7000)]]) {
    projectiles.fire(vector(), vector(0, 0, -1), false);
    projectiles.update(dt, worldStep);
    assert.equal(projectiles.count, 0); assert.equal(scene.children.length, 0);
  }
  assert.deepEqual(hits, []);
});
