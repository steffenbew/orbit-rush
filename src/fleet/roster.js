import { shipTypes } from './models.js';

// Slot identities are also used by the intro formation and tutorial targets.
export const initialFleetTypes = [0, 1, 2, 0, 3, 2, 0, 3];

// Keep allocated hulls across levels and retries. A roster is the ordered list
// for one level; when each member spawns is a separate decision.
export function createFleetRoster(ships, allocate) {
  const base = [0, 3, 4, 1, 2, 6, 5, 7].map(index => ships[index]);
  const bonusRocks = [], bonusShips = [];
  let capital = ships.find(ship => ship.userData.type.capital) ?? null;

  function forLevel(level) {
    const size = level + 2;
    while (base.length < size) base.push(allocate([3, 0, 1, 3, 2][(base.length - 8) % 5]));
    const fleet = base.slice(0, size);
    const regular = fleet.filter(ship => !ship.userData.type.asteroid);
    const rockCount = size - regular.length;
    const extraRocks = Math.round((rockCount + Math.ceil(level / 2) + 3) * 1.3) - rockCount;
    while (bonusRocks.length < extraRocks) {
      const rock = allocate(3);
      rock.userData.stationary = bonusRocks.length < 3;
      bonusRocks.push(rock);
    }
    const capitalPending = level >= 4 && level % 4 === 0;
    if (capitalPending && !capital) capital = allocate(4);
    // Preserve the two-ship opening and interleave extras with the scheduled arrivals.
    bonusRocks.slice(0, extraRocks).forEach((rock, i) => fleet.splice(3 + i * 2, 0, rock));

    const previousCount = regular.length + Math.round(regular.length * .2) + 3;
    const extraShips = Math.round(previousCount * 1.3) - regular.length;
    // A new run must not inherit classes unlocked on the previous run.
    const eligible = bonusShips.filter(ship => regular.some(other => other.userData.type === ship.userData.type));
    while (eligible.length < extraShips) {
      const template = regular[eligible.length % regular.length];
      const ship = allocate(shipTypes.indexOf(template.userData.type));
      bonusShips.push(ship); eligible.push(ship);
    }
    eligible.slice(0, extraShips).forEach((ship, i) => fleet.splice(3 + i * 3, 0, ship));
    return { fleet, capital, capitalPending };
  }
  return { forLevel, get capital() { return capital; } };
}
