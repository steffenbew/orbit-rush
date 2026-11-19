// Run from the project root: node tests/intro-fleet.mjs
import { readFileSync } from 'node:fs';
import { newRun } from '../src/run/progression.js';
import { createShipModels, shipTypes } from '../src/fleet/models.js';
import { createFleetSpawn } from '../src/fleet/spawn.js';
import { createIntro } from '../src/presentation/intro.js';
import { initialFleetTypes } from '../src/fleet/roster.js';
import { createFleetVisuals, setShipOpacity } from '../src/fleet/visuals.js';
import * as physics from '../src/flight/physics.js';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const THREE = await import(new URL('assets/vendor/three.module.js', root));
const source = readFileSync(new URL('src/main.js', root), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
};
for (const [width, height] of [[1280, 720], [1920, 1080], [390, 844], [600, 800]]) {
  {
    const intro = new Function('createIntro', 'createFleetSpawn', 'initialFleetTypes', 'createFleetVisuals', 'setShipOpacity', 'newRun', 'physics', 'createShipModels', 'shipTypes', 'THREE', 'innerWidth', 'innerHeight', `
      const scene = new THREE.Scene(), glow = new THREE.Texture();
      const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .03, 14000);
      const random = (a, b) => (a + b) / 2;
      const document = {hidden: false, querySelector: () => ({disabled: true})};
      const matchMedia = () => ({matches: false});
      ${section('  const { createModel,', "  const canvas = document.querySelector('#effects');")}
      // Boot must not read flight state before it is initialized.
      const flightMotion = new THREE.Vector3();
      return { ships, camera, step: dt => intro.update(dt, innerWidth, innerHeight, document.hidden),
        hide: () => { document.hidden = true; }, resume: () => { document.hidden = false; } };
    `)(createIntro, createFleetSpawn, initialFleetTypes, createFleetVisuals, setShipOpacity, newRun, physics, createShipModels, shipTypes, THREE, width, height);
    const visible = intro.ships.filter(ship => ship.visible);
    assert.equal(visible.length, 4, 'Show all four ship classes on the home screen');
    assert.equal(new Set(visible.map(ship => ship.userData.type)).size, 4);
    assert.ok(visible.every(ship => !ship.userData.type.asteroid));
    assert.ok(visible.every(ship => ship.scale.x === ship.userData.type.scale), 'Every preview retains its full gameplay scale');
    const boss = visible.find(ship => ship.userData.type.capital);
    assert.ok(boss); assert.equal(boss.userData.health, 60);
    const anchors = visible.map(ship => ship.position.clone().project(intro.camera));
    assert.ok(anchors[0].x < -.5 && anchors[0].y > .6, 'Fighter stays in the upper-left corner');
    assert.ok(anchors[1].x > .4 && anchors[1].y > .6, 'Saucer stays in the upper-right corner');
    assert.ok(anchors[2].x > .4 && anchors[2].y < -.5, 'Carrier stays in the lower-right corner');
    assert.ok(anchors[3].x < -.15 && anchors[3].y < -.45, 'Leviathan stays in the lower-left corner');
    assert.equal(intro.ships.filter(ship => ship.userData.type.capital).length, 1);
    const opening = boss.position.clone(), rotation = boss.quaternion.clone();
    intro.step(2);
    assert.equal(boss.position.equals(opening), false);
    assert.equal(boss.quaternion.equals(rotation), false);
    assert.equal(boss.userData.fireCooldown, 2.8, 'The preview must not run boss attacks');
    intro.hide(); const hiddenPosition = boss.position.clone(); intro.step(2);
    assert.ok(boss.position.equals(hiddenPosition), 'Hidden tabs freeze the preview');
    intro.resume();
    let elapsed = 0;
    for (const time of [0, 10, 30, 60, 120]) {
      intro.step(time - elapsed); elapsed = time;
      intro.camera.updateMatrixWorld(true);
      const projectedAreas = visible.map(ship => {
        ship.updateMatrixWorld(true);
        const box = ship.userData.collisionBox, projected = new THREE.Box2();
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const point = new THREE.Vector3(x, y, z).applyMatrix4(ship.matrixWorld).project(intro.camera);
          projected.expandByPoint(new THREE.Vector2(point.x, point.y));
        }
        const size = projected.getSize(new THREE.Vector2());
        return size.x * size.y;
      });
      assert.ok(projectedAreas[2] > projectedAreas[0], 'The closer fighter remains smaller than the Carrier');
      for (let i = 2; i < projectedAreas.length; i++) {
        assert.ok(projectedAreas[i] > projectedAreas[i - 1],
          `Preserve small ships < Carrier < Leviathan on screen at ${width}×${height}, time=${time}: ${projectedAreas}`);
      }
      assert.ok(projectedAreas[3] > projectedAreas[2] * 2, 'The Leviathan must look substantially larger than the Carrier');
      const bounds = boss.userData.collisionBox;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new THREE.Vector3(x, y, z).applyMatrix4(boss.matrixWorld).project(intro.camera);
        assert.ok(Number.isFinite(point.x + point.y + point.z));
        assert.ok(Math.abs(point.x) < 1.1 && Math.abs(point.y) < 1.1,
          `Keep the boss hull within the preview at ${width}×${height}, time=${time}: ${point.toArray()}`);
      }
    }
  }
}
console.log('PASS four-class home-screen fleet, boss visibility, boot safety, responsive placement and no intro attacks');
console.log('PASS full gameplay scales, projected size hierarchy, hidden-tab preview freezes');
assert.match(source, /scene\.fog = new THREE\.FogExp2\('#030711', \.0003\)/);
assert.match(section('  async function startGame(', "  document.querySelector('#start').addEventListener"), /scene\.fog\.density = \.00065;/,
  'The clearer menu fog must not change gameplay visibility');
