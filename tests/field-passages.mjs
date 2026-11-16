// Old asteroid tracks through settled debris are real, freely oriented gaps, not painted tunnels.
import assert from 'node:assert/strict';
import { THREE, makeGame, randomState } from './helpers/flight-game.mjs';

const directions = [], variants = new Set();
for (const reduced of [false, true]) for (const level of [1, 2, 5, 6, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35, 38, 41, 59]) {
  // Keep each layout independent of random draws consumed by earlier speed/mode cases.
  randomState.seed = 12345;
  const game = makeGame(reduced); game.setLevel(level); game.setupLevelFleet();
  game.setTime(game.getAsteroidEncounters()[0].prepare); game.updateAsteroidShower(0);
  const group = game.fieldGroups[0], tunnel = group.tunnel;
  assert.equal(Boolean(tunnel), group.diffuse && level % 2 === 1, 'Only some settled fields have an old passage');
  if (group.diffuse) variants.add(Boolean(tunnel));
  if (!tunnel) continue;
  if (!reduced) directions.push(tunnel.direction.clone());
  assert.ok(Math.abs(tunnel.direction.length() - 1) < 1e-8);
  assert.ok(tunnel.radius * .9 > 26, 'Even the narrowest section clears the full player hull');
  const coreOffset = group.position.clone().sub(tunnel.center);
  assert.ok(Math.abs(coreOffset.dot(tunnel.direction)) < 1e-7, 'The scar passes beside the surviving core');
  const origin = game.coursePlan().origin, center = tunnel.center.clone().add(origin);
  const span = game.coursePlan().length;
  const start = center.clone().addScaledVector(tunnel.direction, -span);
  const end = center.clone().addScaledVector(tunnel.direction, span);
  game.playerHullRotation.setFromUnitVectors(new THREE.Vector3(0, 0, -1), tunnel.direction);
  for (const rock of group.rocks) {
    assert.equal(game.crossesPlayer(rock, rock.position.clone().sub(start), rock.position.clone().sub(end)), false,
      `The entire ship fits through the sculpted passage: level=${level}, reduced=${reduced}`);
  }
  // Check the exact instanced mesh, including stretched/rotated shards, along the bore and its inner edges.
  game.grit.updateMatrixWorld(true);
  const impact = game.fieldImpacts[0];
  for (const offset of [new THREE.Vector3(), impact.u.clone().multiplyScalar(26), impact.u.clone().multiplyScalar(-26),
    impact.v.clone().multiplyScalar(26), impact.v.clone().multiplyScalar(-26)]) {
    const ray = new THREE.Raycaster(start.clone().add(offset), tunnel.direction, 0, span * 2);
    assert.equal(ray.intersectObject(game.grit, false).length, 0, 'No rendered fragment obstructs the cleared bore');
  }
  const rim = game.fieldDebris.filter(piece => {
    const delta = piece.position.clone().sub(tunnel.center), along = delta.dot(tunnel.direction);
    const distanceSq = delta.lengthSq() - along * along;
    return distanceSq < (tunnel.radius * 2.2) ** 2;
  });
  assert.ok(rim.length >= (reduced ? 3 : 8), `The passage actually cuts populated debris, rather than empty space beside the field: ${JSON.stringify({level,reduced,rim:rim.length})}`);
}
assert.deepEqual([...variants].sort(), [false, true], 'Keep uncut settled fields as well');
assert.ok(directions.some(direction => Math.abs(direction.z) < .3), 'Include transverse passages');
assert.ok(directions.some(direction => Math.abs(direction.z) > .7), 'Include more forward/backward passages');
assert.ok(directions.some(direction => direction.x > .3) && directions.some(direction => direction.x < -.3));
assert.ok(directions.some(direction => direction.y > .3) && directions.some(direction => direction.y < -.3));
console.log('PASS occasional old passages, full-hull and real-mesh clearance, populated rims and arbitrary 3D orientations in both motion modes');
