import { simulationStep } from '../flight/simulation-clock.js';

const openingDelay = 2, interval = 5 / .75, minimumApproach = 3;

export function createCrossingAsteroids({ flightMotion, levelFlightSpeed, playerHullRadius,
  createShip, resetShip, spawn, forecastFlightPosition }) {
  const rocks = [];
  let nextTime = openingDelay;

  function start(courseStartTime) {
    nextTime = courseStartTime + openingDelay;
  }

  function update(gameTime, difficulty) {
    if (gameTime < nextTime) return;
    const speed = flightMotion.length(), cruise = levelFlightSpeed(difficulty);
    if (speed < cruise * .9) return; // Let speed recover after a pause.

    let rock = rocks.find(rock => !rock.visible);
    if (!rock) {
      if (rocks.length >= 2) return; // Never reposition a visible fly-by.
      rock = createShip(3);
      rock.userData.scheduledHazard = true; // Not a regular fleet reinforcement.
      rocks.push(rock);
    }
    resetShip(rock, false, rock.userData.slot, 3);
    // Even if the pilot is briefly over cruise speed, start beyond the fade boundary.
    const approachSpeed = Math.min(speed, cruise) * .85;
    const distance = spawn.asteroidArrivalDistance(rock) + speed * .85 * .3;
    const steps = Math.ceil(Math.max(minimumApproach, distance / approachSpeed) / simulationStep);
    const approachTime = steps * simulationStep;
    rock.userData.approachTime = approachTime;
    forecastFlightPosition(rock.position, steps);
    spawn.setAsteroidCrossing(rock, approachTime, speed, playerHullRadius);
    rock.userData.previousPosition.copy(rock.position);
    nextTime = gameTime + interval; // Missed intervals never turn into catch-up bursts.
  }

  return { start, update, rocks, get nextTime() { return nextTime; } };
}
