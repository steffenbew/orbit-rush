// Run from the project root: node tests/intro-fleet.mjs
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
const introStep = section('        if (!started) {', '        if (crashing && !document.hidden)');
for (const [width, height] of [[1280, 720], [1920, 1080], [390, 844], [600, 800]]) {
  for (const reducedMotion of [false, true]) {
    const intro = new Function('THREE', 'innerWidth', 'innerHeight', 'reducedMotion', `
      const scene = new THREE.Scene(), glow = new THREE.Texture();
      const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .03, 14000);
      const random = (a, b) => (a + b) / 2;
      ${section('      const dark =', "      const canvas = document.querySelector('#effects');")}
      // Boot must not read flight state before it is initialized.
      const flightMotion = new THREE.Vector3();
      const document = {hidden: false}, started = false;
      const updateIntroOrbit = () => {};
      return { ships, introFormation, camera, updateIntroShips,
        step: dt => { ${introStep} }, hide: () => { document.hidden = true; } };
    `)(THREE, width, height, reducedMotion);
    const visible = intro.ships.filter(ship => ship.visible);
    assert.equal(visible.length, 4, 'Show all four ship classes on the home screen');
    assert.equal(new Set(visible.map(ship => ship.userData.type)).size, 4);
    assert.ok(visible.every(ship => !ship.userData.type.asteroid));
    assert.ok(visible.every(ship => ship.scale.x === ship.userData.type.scale), 'Every preview retains its full gameplay scale');
    const boss = visible.find(ship => ship.userData.type.capital);
    assert.ok(boss); assert.equal(boss.userData.health, 60);
    assert.equal(intro.ships.filter(ship => ship.userData.type.capital).length, 1);
    const opening = boss.position.clone(), rotation = boss.quaternion.clone();
    intro.step(2);
    assert.equal(boss.position.equals(opening), reducedMotion);
    assert.equal(boss.quaternion.equals(rotation), reducedMotion);
    assert.equal(boss.userData.fireCooldown, 2.8, 'The preview must not run boss attacks');
    intro.hide(); const hiddenPosition = boss.position.clone(); intro.step(2);
    assert.ok(boss.position.equals(hiddenPosition), 'Hidden tabs freeze the preview');
    for (const time of [0, 10, 30, 60, 120]) {
      intro.updateIntroShips(time);
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
      for (let i = 1; i < projectedAreas.length; i++) {
        assert.ok(projectedAreas[i] > projectedAreas[i - 1],
          `Preserve Interceptor < Saucer < Carrier < Leviathan on screen at ${width}×${height}, time=${time}: ${projectedAreas}`);
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
console.log('PASS full gameplay scales, projected size hierarchy, reduced-motion and hidden-tab preview freezes');
assert.match(source, /scene\.fog = new THREE\.FogExp2\('#030711', \.0003\)/);
assert.match(section('      async function startGame(', "      document.querySelector('#start').addEventListener"), /scene\.fog\.density = \.00065;/,
  'The clearer menu fog must not change gameplay visibility');
