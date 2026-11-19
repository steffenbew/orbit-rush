import * as THREE from '../../assets/vendor/three.module.js';
import { shipTypes } from './models.js';
import { setShipOpacity } from './visuals.js';
import { corridorHeightAt } from '../course/encounter-plan.js';

export function createFleetArrivals({ ships, flightRings, camera, flightMotion, courseOrigin, courseWorldOffset,
  random, createShip, resetShip, constrainShipToBoundary, shipCruiseSpeed, flightDistanceAt,
  levelFlightSpeed, firstCheckpointTime, roundDuration, progressionTimeScale }) {
  let spawnQueue = [], nextShipTime = 2 * progressionTimeScale, tutorialReinforcements = 0;
  let shipWaveReadyAt = 0, shipWaveRemaining = 0;
  let countdownShipsSpawned = 0, nextCountdownShipTime = 0;
  function regularShipLimit(level, corridorPlan) {
    return Math.min(6, Math.max(level >= 5 && corridorPlan ? 4 : 2, 2 + Math.floor((level - 1) / 3)));
  }
  function canStartShipWave(gameTime, limit, activeShips, arrivals) {
    return activeShips <= 1 && activeShips + arrivals <= limit
      && (gameTime >= shipWaveReadyAt || flightRings.some(gate => gate.userData.passedAt > shipWaveReadyAt - 3));
  }
  function reset(waiting) {
    spawnQueue = waiting;
    tutorialReinforcements = 0;
    shipWaveReadyAt = 0; shipWaveRemaining = 0;
    countdownShipsSpawned = 0; nextCountdownShipTime = 0;
    nextShipTime = 2 * progressionTimeScale;
  }
  function reserveOpening() {
    spawnQueue.unshift(...ships.filter(ship => ship.visible && !ship.userData.ringRoute));
  }
  function startAfterTutorial(gameTime) {
    nextShipTime = gameTime; tutorialReinforcements = 2;
    ringShipsPending = true;
  }
  function queueShip(ship, gameTime) {
    if (ship.visible && !ship.userData.type.asteroid && !ship.userData.type.capital && !ship.userData.tutorialTarget) {
      shipWaveReadyAt = gameTime + 3;
    }
    ship.visible = false;
    if (!ship.userData.shower && !ship.userData.scheduledHazard && !ship.userData.type.capital && !ship.userData.ringRoute && !ship.userData.tutorialTarget) spawnQueue.push(ship);
  }
  function updateCountdownShips(gameTime, elapsed, limit) {
    // Fade in just before the countdown, not from a distance that takes the rest of the round to reach.
    if (elapsed < roundDuration - 6.5 || elapsed > roundDuration - 3
      || countdownShipsSpawned >= 2 || gameTime < nextCountdownShipTime) return;
    const activeShips = ships.filter(ship => ship.visible && !ship.userData.type.asteroid && !ship.userData.type.capital).length;
    if (activeShips >= Math.min(2, limit)) return;
    const index = spawnQueue.findIndex(ship => !ship.userData.type.asteroid);
    if (index < 0) return;
    const ship = spawnQueue.splice(index, 1)[0];
    resetShip(ship);
    const data = ship.userData;
    data.passingSpeed = Math.min(data.passingSpeed, 55);
    ship.position.copy(camera.position).addScaledVector(data.cruiseDirection, 700)
      .addScaledVector(data.courseRight, (countdownShipsSpawned % 2 ? 1 : -1) * 140)
      .addScaledVector(data.courseUp, 20);
    constrainShipToBoundary(ship);
    const offset = ship.position.clone().sub(camera.position);
    data.lane = offset.dot(data.courseRight); data.height = offset.dot(data.courseUp);
    data.previousPosition.copy(ship.position);
    const forwardSpeed = Math.max(0, flightMotion.dot(data.cruiseDirection)) * .85;
    data.courseVelocity.copy(data.cruiseDirection).multiplyScalar(shipCruiseSpeed(ship, forwardSpeed, data.throttle));
    setShipOpacity(ship, 0);
    countdownShipsSpawned++;
    nextCountdownShipTime = gameTime + 1.75;
  }
  function advance(gameTime, elapsed, level, corridorPlan) {
    const limit = regularShipLimit(level, corridorPlan);
    updateCountdownShips(gameTime, elapsed, limit);
    if (!spawnQueue.length || gameTime < nextShipTime) return;
    if (tutorialReinforcements === 2) {
      // Lead the original arrival point by half a second at the current forward speed.
      const gate = flightRings.find(gate => !gate.userData.resolved);
      const startZ = courseOrigin.z + courseWorldOffset.z;
      const leadDistance = Math.max(0, -flightMotion.z) * .85 * .5;
      if (camera.position.z > startZ - gate.userData.reinforcementDepth + leadDistance) return;
    }
    let index = tutorialReinforcements > 0 ? spawnQueue.findIndex(ship => !ship.userData.type.asteroid) : 0;
    const activeShips = ships.filter(ship => ship.visible && !ship.userData.type.asteroid && !ship.userData.type.capital).length;
    // New groups wait for a mostly cleared encounter and a breather (or a passed checkpoint).
    // Tutorial arrivals are already staggered; rocks and bosses keep their own schedules.
    const waitingForWave = tutorialReinforcements === 0 && (elapsed >= roundDuration - 6.5 || ringShipsPending
      || (shipWaveRemaining === 0 && !canStartShipWave(gameTime, limit, activeShips, 1)));
    if (!spawnQueue[index].userData.type.asteroid && (activeShips >= limit || waitingForWave)) {
      if (tutorialReinforcements > 0) return;
      index = spawnQueue.findIndex(ship => ship.userData.type.asteroid);
      if (index < 0) return;
    }
    const ship = spawnQueue.splice(index, 1)[0];
    if (!ship.userData.type.asteroid && tutorialReinforcements === 0) {
      if (shipWaveRemaining === 0) shipWaveRemaining = limit - activeShips;
      shipWaveRemaining--;
      if (shipWaveRemaining === 0) shipWaveReadyAt = gameTime + 3;
    }
    resetShip(ship);
    if (tutorialReinforcements > 0) {
      // First a close shooting target before the gate, then a separate arrival near the checkpoint.
      const gate = flightRings.find(gate => !gate.userData.resolved), data = ship.userData;
      data.baseRotation.copy(gate.quaternion); ship.quaternion.copy(data.baseRotation);
      data.cruiseDirection.copy(gate.userData.normal).negate();
      data.courseRight.set(1, 0, 0).applyQuaternion(data.baseRotation);
      data.courseUp.set(0, 1, 0).applyQuaternion(data.baseRotation);
      if (tutorialReinforcements === 2) {
        // Reveal the checkpoint shortly after the enemy's 1.2-second fade-in.
        gate.userData.fadeStart = gameTime + 1.4;
        // Preserve shooting distance on the shorter remaining approach, without spawning beyond the gate.
        const fraction = Math.min(.8, 650 / camera.position.distanceTo(gate.position));
        ship.position.copy(camera.position).lerp(gate.position, fraction)
          .addScaledVector(data.courseRight, -60)
          .addScaledVector(data.courseUp, 10);
      } else {
        ship.position.copy(gate.position).addScaledVector(gate.userData.normal, 450)
          .addScaledVector(data.courseRight, 180)
          .addScaledVector(data.courseUp, 25);
      }
      // This checkpoint-relative placement happens after resetShip's boundary check.
      constrainShipToBoundary(ship);
      const offset = ship.position.clone().sub(camera.position);
      data.lane = offset.dot(data.courseRight); data.height = offset.dot(data.courseUp);
      data.previousPosition.copy(ship.position);
      data.courseVelocity.copy(data.cruiseDirection)
        .multiplyScalar(Math.max(0, flightMotion.dot(data.cruiseDirection)) * .85 * data.cruiseRatio);
      setShipOpacity(ship, 0);
      tutorialReinforcements--;
    }
    // No catch-up batches after a slow frame or pause.
    const spacing = tutorialReinforcements > 0 ? 3 : Math.max(.2, 2 - (level - 1) * .25) * progressionTimeScale;
    nextShipTime = gameTime + spacing;
  }
  const ringShips = [], ringShipForward = new THREE.Vector3(0, 0, -1);
  let ringShipsPending = false;
  function updateRingShipArrivals(gameTime, elapsed, level, corridorPlan) {
    if (tutorialReinforcements > 0 || !ringShipsPending
      || elapsed < 6 || elapsed >= roundDuration - 6.5) return;
    const activeShips = ships.filter(ship => ship.visible && !ship.userData.type.asteroid && !ship.userData.type.capital).length;
    const count = level >= 5 && corridorPlan ? 4 : 2;
    if (!canStartShipWave(gameTime, regularShipLimit(level, corridorPlan), activeShips, count)) return;
    resetRingShips(true, elapsed, level, corridorPlan);
    shipWaveReadyAt = gameTime + 3;
  }
  function resetRingShips(distant, elapsed, level, corridorPlan) {
    ringShipsPending = false;
    ringShips.forEach(ship => { ship.visible = false; });
    const gates = flightRings.filter(gate => !gate.userData.resolved);
    if (!gates.length) return;
    // Add extra corridor companions on deployment, not during hidden opening setup.
    const count = distant && level >= 5 && corridorPlan ? 4 : 2;
    const activeShips = [];
    for (let index = 0; index < count; index++) {
      const type = shipTypes[index === 0 ? 0 : index === 1 ? Math.min(2, level - 1) : 1];
      let ship = ringShips.find(ship => ship.userData.type === type && !activeShips.includes(ship));
      if (!ship) {
        ship = createShip(shipTypes.indexOf(type));
        ringShips.push(ship);
      }
      activeShips.push(ship);
    }
    const clearance = Math.min(...gates.map(gate => gate.userData.radius));
    const firstDistance = Math.min(gates[0].position.distanceTo(camera.position), flightDistanceAt(firstCheckpointTime));
    const arrivalDistance = Math.max(900, levelFlightSpeed((elapsed) / roundDuration) * .85 * 2.5);
    activeShips.forEach((ship, index) => {
      resetShip(ship, true);
      // Loose lanes beside and above/below the gates, rather than a single-file procession.
      const lane = (index % 2 ? 1 : -1) * random(.8, 2.8);
      const height = random(-.8, .8);
      const points = gates.flatMap(gate => {
        const center = gate.position.clone().sub(courseWorldOffset).add(
          new THREE.Vector3(lane * gate.userData.radius, height * gate.userData.radius, 0).applyQuaternion(gate.quaternion));
        // Stay near the checkpoint plane without forcing NPCs through the player's opening.
        return [center.clone().addScaledVector(gate.userData.normal, gate.userData.radius * .75), center,
          center.clone().addScaledVector(gate.userData.normal, -gate.userData.radius * .75)];
      });
      const start = camera.position.clone().sub(courseWorldOffset).add(new THREE.Vector3(lane * clearance, height * clearance, 0));
      points.push(start);
      points.sort((a, b) => b.z - a.z);
      // Follow only the remaining passage; a delayed wave may arrive inside or beyond it.
      if (corridorPlan && start.z > corridorPlan.origin.z - corridorPlan.length) {
        const { origin, length, rotation } = corridorPlan;
        const startDepth = origin.z - start.z;
        const entry = points.filter(point => point.z > origin.z).pop() || start;
        const exit = points.find(point => point.z < origin.z - length);
        const entryPadding = Math.min(200, Math.max(0, (entry.z - origin.z) / 2));
        const exitPadding = exit ? Math.min(200, (origin.z - length - exit.z) / 2) : 200;
        if (startDepth >= 0) start.y = origin.y + corridorHeightAt(startDepth, corridorPlan);
        for (let step = -1; step <= 9; step++) {
          const depth = step < 0 ? -entryPadding : step > 8 ? length + exitPadding : length * step / 8;
          if (origin.z - depth >= start.z) continue;
          const x = THREE.MathUtils.lerp(entry.x, exit ? exit.x : entry.x, THREE.MathUtils.clamp(depth / length, 0, 1));
          points.push(new THREE.Vector3(x - origin.x, corridorHeightAt(THREE.MathUtils.clamp(depth, 0, length), corridorPlan), -depth)
            .applyQuaternion(rotation).add(origin));
        }
      }
      points.sort((a, b) => b.z - a.z);
      points.push(points[points.length - 1].clone().add(new THREE.Vector3(0, 0, -flightDistanceAt(8))));
      const curve = new THREE.CatmullRomCurve3(points);
      curve.arcLengthDivisions = 512; // Keep distance-based arrivals accurate with the extra checkpoint knots.
      const length = curve.getLength();
      // Spread traffic over the route instead of bringing in one tight formation.
      const spacing = levelFlightSpeed((elapsed) / roundDuration) * .85;
      const distance = distant ? arrivalDistance + (index * 1.8 + random(0, .4)) * spacing : firstDistance * (.15 + index * .07);
      const data = ship.userData;
      // A lingering companion and a quicker pass, not two ships pacing the player identically.
      data.passingSpeed = random(index === 0 ? 25 : 70, index === 0 ? 45 : 95);
      data.ringRoute = { curve, length, distance, distant, position: curve.getPointAt(distance / length), exit: curve.getTangentAt(1),
        cruiseSpeed: levelFlightSpeed(0) * .85,
        cruiseRatio: random(.94, 1.08), throttleAmount: index === 0 ? .18 : 0,
        throttlePhase: random(0, Math.PI * 2), throttleRate: Math.PI * 2 / random(6, 10) };
      setShipOpacity(ship, distant ? 0 : 1);
      // Fit the complete hull even when turning through the openings.
      const bounds = data.collisionBox.getBoundingSphere(new THREE.Sphere());
      const hullRadius = bounds.radius + bounds.center.length();
      ship.scale.setScalar(Math.min(data.type.scale, clearance * .55 / hullRadius));
      ship.position.copy(data.ringRoute.position).add(courseWorldOffset);
      curve.getTangentAt(distance / length, data.cruiseDirection);
      data.baseRotation.setFromUnitVectors(ringShipForward, data.cruiseDirection);
      ship.quaternion.copy(data.baseRotation);
      data.courseRight.set(1, 0, 0).applyQuaternion(data.baseRotation);
      data.courseUp.set(0, 1, 0).applyQuaternion(data.baseRotation);
      data.courseVelocity.copy(data.cruiseDirection).multiplyScalar(levelFlightSpeed(0) * .85);
      constrainShipToBoundary(ship);
      data.previousPosition.copy(ship.position);
    });
  }
  function prepareRoutes(elapsed, level, corridorPlan) {
    resetRingShips(false, elapsed, level, corridorPlan);
    ringShips.forEach(ship => { ship.visible = false; });
    ringShipsPending = true;
  }
  return { reset, reserveOpening, startAfterTutorial, queueShip, advance, prepareRoutes, resetRingShips, updateRingShipArrivals,
    ringShips, get queue() { return spawnQueue; } };
}
