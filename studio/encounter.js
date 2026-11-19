import * as THREE from '../assets/vendor/three.module.js';
import { createAsteroidEncounter } from '../src/course/asteroid-encounter.js';
import { getAsteroidEncounters, roundDuration, firstCheckpointTime } from '../src/course/encounter-plan.js';
import { planCheckpoints } from '../src/course/checkpoints.js';
import { flightDistanceAt, levelFlightSpeed } from '../src/flight/physics.js';
import { simulationStep } from '../src/flight/simulation-clock.js';
import { createPlayerCollision } from '../src/flight/player-collision.js';
import { createShipModels, shipTypes } from '../src/fleet/models.js';

// Freeze a whole authored encounter in course space. Flight normally streams the same
// slices as the pilot approaches and recycles rocks that have already passed.
export function buildEncounter({ scene, level, eventIndex, random, glow }) {
  const courseOrigin = new THREE.Vector3();
  const flight = { level, roundDuration, simulationStep };
  const timing = { roundDuration, firstCheckpointTime,
    flightDistanceAt: time => flightDistanceAt(time, flight),
    levelFlightSpeed: progress => levelFlightSpeed(level, progress) };
  const { createModel, fadeAsteroidShader } = createShipModels(glow, { distanceFade: false });
  const templates = [4, 7].map(slot => createModel(slot, 3));
  let gates;
  const encounter = createAsteroidEncounter({ scene, random, courseOrigin,
    courseWorldOffset: new THREE.Vector3(), ...timing, getGates: () => gates,
    asteroidType: shipTypes[3], fadeAsteroidShader, showerWarning: {}, poolLimit: Infinity,
    playerHullRadius: createPlayerCollision(courseOrigin).playerHullRadius,
    createShip() {
      const rock = createModel(0, 3, templates[Math.floor(random(0, templates.length))]);
      rock.userData.courseVelocity = new THREE.Vector3();
      rock.userData.previousPosition = new THREE.Vector3();
      scene.add(rock);
      return rock;
    },
    resetShip(rock) { rock.visible = true; }
  });
  const events = getAsteroidEncounters(level), event = events[eventIndex];
  encounter.reset(level, events);
  const corridorPlan = encounter.corridorPlan;
  gates = planCheckpoints({ ...timing, level, corridorPlan, originZ: 0,
    exitHeightAtCorridor: corridorPlan ? encounter.corridorCenter(corridorPlan.length, corridorPlan) : 0
  }).map(({ x, y, depth, radius }) => ({ position: new THREE.Vector3(x, y, -depth), userData: { radius } }));
  encounter.select(event);
  encounter.placeEncounter(event.entry, 0);
  encounter.populateSlices(encounter.layout.length);
  encounter.mesh.material.opacity = 1;
  // Frame the formation, not invisible pool members or isolated out-of-phase flybys.
  if (encounter.boulder) scene.remove(encounter.boulder.rock);
  for (const rock of encounter.crossingRocks) scene.remove(rock);
  for (const rock of encounter.pool) if (!rock.visible) scene.remove(rock);
  return scene;
}
