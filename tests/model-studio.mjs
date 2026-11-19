import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../assets/vendor/three.module.js';
import { homeDistance } from '../studio/framing.js';
import { isValidView } from '../studio/stage.js';
import { catalog, nearestLevel, recurringLevel, adjacentLevel, buildPreview } from '../studio/catalog.js';
import { getAsteroidEncounters } from '../src/course/encounter-plan.js';

const glow = new THREE.Texture();
const entries = catalog();
const find = id => entries.find(item => item.id === id);
const build = (level, id, seed = 4, occurrence = 0) => buildPreview(find(id), level, seed, occurrence, glow);

test('each selectable model produces a visible stage with finite bounds', () => {
  assert.equal(new Set(entries.map(e => e.id)).size, entries.length);
  for (const entry of entries) {
    const level = entry.phases ? nearestLevel(entry.phases, 2) : 2;
    const object = buildPreview(entry, level, 4, 0, glow);
    const bounds = new THREE.Box3().setFromObject(object);
    assert.ok(object.visible && !bounds.isEmpty(), entry.id);
    assert.ok(Number.isFinite(bounds.getSize(new THREE.Vector3()).length()), entry.id);
  }
});

test('encounters stay selectable independently of level; only real phases are offered', () => {
  const corridor = find('corridor');
  assert.equal(nearestLevel(corridor.phases, 1), 2);
  assert.equal(nearestLevel(corridor.phases, 4), 3);
  assert.deepEqual([...corridor.phases.keys()], [2, 3, 5]);
  assert.equal(nearestLevel(corridor.phases, 1000), 1000);
  assert.deepEqual(entries.filter(e => e.label.startsWith('Asteroid field')).map(e => e.id), ['field']);
  const encounters = catalog().filter(e => e.phases);
  for (const level of [1, 2, 3, 4, 5, 10, 1000]) {
    const schedule = Math.min(level, recurringLevel);
    const actual = encounters.flatMap(e => (e.phases.get(schedule) ?? []).map(time => ({ kind: e.id, ...time })));
    assert.deepEqual(actual.sort((a, b) => a.index - b.index), getAsteroidEncounters(level).map((e, index) =>
      ({ kind: e.kind, index, timing: `${e.entry}–${e.exit}s` })));
  }
  // Later levels share a timeline, not a fixed level-five model.
  const gritCount = level => build(level, 'corridor').children.find(o => o.isInstancedMesh).count;
  assert.notEqual(gritCount(8), gritCount(5));
  const [opening, finale] = [0, 1].map(i => build(4, 'field', 4, i).children.find(o => o.isInstancedMesh).count);
  assert.ok(opening > 0 && finale > 0);
  assert.notEqual(opening, finale, 'The two times preview different authored fields');
});

test('zooming out does not fade studio hulls, asteroid walls or boulders', () => {
  const scene = build(2, 'corridor');
  const materials = [scene.children.find(o => o.isInstancedMesh).material,
    scene.children.find(o => o.userData.shower).userData.hull, build(2, 'interceptor').userData.hull];
  for (const material of materials) {
    const shader = { fragmentShader: '#include <color_fragment>\n#include <emissivemap_fragment>' };
    material.onBeforeCompile(shader);
    assert.ok(!shader.fragmentShader.includes('diffuseColor.a *='), 'distance fade is a gameplay effect');
  }
});

test('level steps skip missing phases, visit individual late levels, and stop at the limits', () => {
  const corridor = find('corridor').phases;
  for (const [from, step, to] of [[2, -1, undefined], [2, 1, 3], [3, 1, 5], [5, -1, 3],
    [5, 1, 6], [6, -1, 5], [1000, 1, undefined]]) {
    assert.equal(adjacentLevel(corridor, from, step, 1000), to);
  }
  assert.equal(adjacentLevel(find('field').phases, 4, 1, 1000), 5);
});

test('restore only complete, usable camera poses', () => {
  const pose = { yaw: .88, pitch: 1.16, distance: 42, target: [0, 0, -12] };
  assert.ok(isValidView(pose));
  for (const invalid of [null, {}, { yaw: .88, pitch: 1.16, zoom: 1 }, { ...pose, distance: 0 },
    { ...pose, pitch: NaN }, { ...pose, target: null }, { ...pose, target: [0, 0] }, { ...pose, target: [0, Infinity, 0] }]) {
    assert.equal(isValidView(invalid), false);
  }
});

test('home framing uses the visible proportions while keeping the complete hull on screen', () => {
  const fov = 40, model = build(2, 'interceptor');
  model.position.set(17, 42, -2000);
  const bounds = new THREE.Box3().setFromObject(model);
  const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
  const center = bounds.getCenter(new THREE.Vector3());
  const view = { yaw: .88, pitch: 1.16, target: center.toArray() };
  for (const aspect of [.6, 1.5, 2]) {
    const distance = homeDistance(model, radius, aspect, fov, view);
    const camera = new THREE.PerspectiveCamera(fov, aspect, radius * .1, distance + radius * 2);
    camera.position.setFromSphericalCoords(distance, view.pitch, view.yaw).add(center);
    camera.lookAt(center); camera.updateMatrixWorld();
    let extent = 0;
    model.traverseVisible(part => {
      if (!part.isMesh) return;
      const vertices = part.geometry.attributes.position, point = new THREE.Vector3();
      for (let i = 0; i < vertices.count; i++) {
        point.fromBufferAttribute(vertices, i).applyMatrix4(part.matrixWorld).project(camera);
        assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1);
        extent = Math.max(extent, Math.abs(point.x), Math.abs(point.y));
      }
    });
    assert.ok(extent > .6, 'model should fill a useful part of the frame');
  }
});

test('rebuilding a layout preserves the variation; reroll changes debris but not the authored corridor', () => {
  const snapshot = seed => {
    const scene = build(5, 'corridor', seed);
    const grit = scene.children.find(o => o.isInstancedMesh);
    const matrix = new THREE.Matrix4();
    const points = Array.from({ length: grit.count }, (_, i) => {
      grit.getMatrixAt(i, matrix);
      return new THREE.Vector3().setFromMatrixPosition(matrix);
    });
    return { points, grit, boulders: scene.children.filter(o => o.userData.corridorObstacle) };
  };
  const first = snapshot(7), same = snapshot(7), reroll = snapshot(8);
  assert.ok(first.points.length >= 7200 && first.boulders.length > 0);
  assert.deepEqual(same.points, first.points);
  assert.deepEqual(same.boulders.map(b => b.position), first.boulders.map(b => b.position));
  assert.equal(reroll.grit.count, first.grit.count);
  assert.notDeepEqual(reroll.points[0], first.points[0]);
  assert.deepEqual(reroll.grit.position, first.grit.position);
});
