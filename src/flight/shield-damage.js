const asteroidDamage = [15, 30, 50];

export function collisionDamage({ userData, scale }) {
  if (userData.enemyBolt) return 12;
  const { type, asteroidTier } = userData;
  if (!type) return Math.min(18, Math.max(6, Math.round(scale.x * 4))); // Loose fragment
  if (type.asteroid) return asteroidDamage[asteroidTier - 1];
  if (type.capital) return 85;
  if (type.name === 'INTERCEPTOR') return 30;
  if (type.name === 'NOVA SAUCER') return 45;
  return 60;
}

// Keep light hits readable; at 50 damage the red flash reaches full strength.
export function hitFlashStrength(damage) {
  return .7 + .3 * Math.min(1, damage / 50);
}
