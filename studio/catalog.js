import * as THREE from '../assets/vendor/three.module.js';
import { createShipModels, shipTypes } from '../src/fleet/models.js';
import { createFleetVisuals } from '../src/fleet/visuals.js';
import { createEnemyBoltBuilder } from '../src/fleet/capital-ship.js';
import { createPlayerProjectiles } from '../src/weapons/projectiles.js';
import { createRepairPickup } from '../src/course/repair-pickup.js';
import { createCheckpoints } from '../src/course/checkpoints.js';
import { createFlightBoundary } from '../src/course/boundary.js';
import { createFragments } from '../src/course/fragments.js';
import { getAsteroidEncounters } from '../src/course/encounter-plan.js';
import { createPlanet } from '../src/presentation/planet.js';
import { createGlowTexture } from '../src/presentation/space-background.js';
import { createIntroBelt } from '../src/presentation/intro.js';
import { buildEncounter } from './encounter.js';

function shipModel({ glow, camera, seed }, typeIndex) {
  const models = createShipModels(glow, { distanceFade: false });
  const ship = typeIndex === undefined ? models.createPlayerModel() : models.createModel(seed % 10000, typeIndex);
  ship.visible = true;
  ship.userData.hitFlash = 0;
  ship.userData.engineThrust = .4;
  createFleetVisuals(camera).updateEngineVisuals(ship);
  return ship;
}

function belt({ camera, glow, sample }) {
  const models = createShipModels(glow);
  const geometries = [4, 7].map(slot => models.createModel(slot, 3).children[0].geometry);
  const orbit = createIntroBelt({ camera, geometries, sample });
  orbit.update(0, 1280, 720);
  return orbit.mesh;
}

function boundary({ scene, camera }) {
  // Show a lit segment, rather than the invisible membrane of an idle flight.
  camera.far = 900;
  const shield = createFlightBoundary({ scene, camera, courseWorldOffset: new THREE.Vector3() });
  shield.reset();
  shield.mesh.visible = true;
  shield.mesh.material.uniforms.strength.value = 1;
  shield.mesh.material.uniforms.warningPoint.value.set(shield.radii.x, 0, 0);
  return shield.mesh;
}

function fragments({ scene, random, sample }) {
  const debris = createFragments({ scene, random, pick: items => items[Math.floor(sample() * items.length)] });
  debris.shatter({ scale: new THREE.Vector3(3.2, 3.2, 3.2), position: new THREE.Vector3() });
  return scene;
}

const fleetSource = 'fleet/models.js';
function item(id, label, group, source, build, reroll = false) {
  return { id, label, group, source: `src/${source}`, build, reroll };
}
const objects = [
  item('player', 'Player interceptor', 'Fleet', fleetSource, ctx => shipModel(ctx)),
  ...shipTypes.map((type, index) => item(type.name.toLowerCase().replaceAll(' ', '-'),
    type.name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()), type.asteroid ? 'Course objects' : 'Fleet',
    fleetSource, ctx => shipModel(ctx, index), !!type.asteroid)),
  item('checkpoint', 'Checkpoint ring', 'Course objects', 'course/checkpoints.js', ({ scene }) => {
    const [gate] = createCheckpoints({ scene }).gates;
    gate.visible = true;
    return gate;
  }),
  item('repair', 'Shield repair pickup', 'Course objects', 'course/repair-pickup.js', ({ scene, glow }) => {
    const { mesh } = createRepairPickup({ scene, glow });
    mesh.visible = true;
    return mesh;
  }),
  item('boundary', 'Flight boundary', 'Course objects', 'course/boundary.js', boundary),
  ...['Laser', 'Power laser'].map((label, i) => item(i ? 'power-laser' : 'laser', label, 'Projectiles', 'weapons/projectiles.js', ({ scene, glow }) => {
    createPlayerProjectiles({ scene, glow }).fire(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), !!i);
    return scene;
  })),
  item('enemy-bolt', 'Dreadnought bolt', 'Projectiles', 'fleet/capital-ship.js', ({ glow }) => createEnemyBoltBuilder(glow)()),
  item('planet', 'Ringed planet', 'Scenery', 'presentation/planet.js', createPlanet),
  item('belt', 'Title-screen asteroid belt', 'Scenery', 'presentation/intro.js', belt, true),
  item('fragments', 'Shattered asteroid', 'Scenery', 'course/fragments.js', fragments, true)
];

// Levels 1–4 have their own timelines. Later levels vary the layout, not the phase order or times.
export const recurringLevel = 5;

export function catalog() {
  const names = { field: 'Asteroid field', shower: 'Crossing shower', corridor: 'Corridor' };
  const encounters = Object.entries(names).map(([kind, label]) => {
    const phases = new Map();
    for (let level = 1; level <= recurringLevel; level++) {
      const times = getAsteroidEncounters(level).flatMap((event, index) => event.kind === kind
        ? [{ index, timing: `${event.entry}–${event.exit}s` }] : []);
      if (times.length) phases.set(level, times);
    }
    const entry = item(kind, label, 'Level encounters',
      kind === 'field' ? 'course/asteroid-field.js' : 'course/asteroid-encounter.js',
      ctx => buildEncounter({ ...ctx, eventIndex: phases.get(Math.min(ctx.level, recurringLevel))[ctx.occurrence].index }), true);
    return { ...entry, phases, profile: kind === 'corridor' };
  });
  return [...objects, ...encounters];
}

export function nearestLevel(phases, preferred) {
  if (phases.has(Math.min(preferred, recurringLevel))) return preferred;
  let nearest = phases.keys().next().value;
  for (const level of phases.keys()) {
    if (Math.abs(level - preferred) < Math.abs(nearest - preferred)) nearest = level;
  }
  return nearest;
}

export function adjacentLevel(phases, level, delta, maxLevel) {
  const next = level + delta;
  if (level >= recurringLevel && next >= recurringLevel && phases.has(recurringLevel)) {
    return next <= maxLevel ? next : undefined;
  }
  const levels = [...phases.keys()];
  return levels[levels.indexOf(level) + delta];
}

export function buildPreview(entry, level, seed, occurrence = 0, glow = createGlowTexture()) {
  // Local sampler: inspecting or rerolling a layout never touches the game's RNG.
  let state = seed;
  const sample = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  return entry.build({ scene: new THREE.Group(), camera: new THREE.PerspectiveCamera(70, 16 / 9),
    glow, level, seed, occurrence, sample, random: (min, max) => min + (max - min) * sample() });
}
