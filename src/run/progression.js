// Run rules only. The flight owns its clock and scene; a saved result is not a new impact.
export function livesAfterImpact(lives) {
  return Math.max(0, lives - 1);
}

export function roundOutcome(won, lives) {
  return won ? 'victory' : lives > 0 ? 'retry' : 'gameover';
}

export function newRun() {
  return { level: 1, score: 0, kills: 0, retries: 3, shield: 100, levelCheckpoint: { score: 0, kills: 0 } };
}

// A checkpoint is taken on entry to a level. Retries never advance it.
export function nextRoundProgress(current, outcome) {
  if (outcome === 'victory') {
    return { ...current, level: current.level + 1, levelCheckpoint: { score: current.score, kills: current.kills } };
  }
  if (outcome === 'retry') {
    return { ...current, ...current.levelCheckpoint, shield: 100 };
  }
  if (outcome === 'gameover') return newRun();
  throw new Error(`Unknown round outcome: ${outcome}`);
}
