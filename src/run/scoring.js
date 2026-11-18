const comboWindows = [0, 2.5, 1.8, 1.2, .8, .8];

// Measure gaps in simulation time: a pause doesn't break the streak.
// Combo affects only the next kill, so it needs no per-frame expiry timer.
export function killReward(type, asteroidTier, time, previous = null) {
  const combo = previous && time - previous.time < comboWindows[previous.combo]
    ? Math.min(previous.combo + 1, 5) : 1;
  const points = type.points * (type.asteroid ? asteroidTier : 1) * combo;
  return { points, combo, time };
}
