import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Texture } from '../assets/vendor/three.module.js';
import { createShipModels, shipTypes } from '../src/fleet/models.js';

test('fleet models can be built without a scene, renderer or running simulation', () => {
  const models = createShipModels(new Texture(), false);
  for (const [index, type] of shipTypes.entries()) {
    const ship = models.createModel(index, index);
    assert.equal(ship.parent, null);
    assert.equal(ship.userData.type, type);
    assert.equal(ship.scale.x, type.scale);
    assert.ok(!ship.userData.collisionBox.isEmpty());
    assert.ok(ship.userData.collisionParts.every(part => part.triangles.length));
  }
  const player = models.createPlayerModel();
  assert.equal(player.parent, null);
  assert.equal(player.visible, false);
  assert.equal(player.userData.type, shipTypes[0]);
});

test('pooled asteroids reuse geometry and collision data, but own their hull material', () => {
  const models = createShipModels(new Texture(), true);
  const type = shipTypes.findIndex(type => type.asteroid);
  const original = models.createModel(4, type), copy = models.createModel(8, type, original);
  assert.equal(copy.children[0].geometry, original.children[0].geometry);
  assert.equal(copy.userData.collisionParts, original.userData.collisionParts);
  assert.notEqual(copy.userData.hull, original.userData.hull);
  assert.equal(copy.userData.hull.onBeforeCompile, original.userData.hull.onBeforeCompile);
});
