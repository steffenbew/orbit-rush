const lessons = [
  { action: 'checkpoint', title: 'checkpointTitle', input: 'steerInput', touchInput: 'touchSteerInput', successDelay: .7 },
  { action: 'laser', title: 'laserTitle', input: 'mouseClick', touchInput: 'touchLaserInput', successDelay: .7 },
  { action: 'heavy', title: 'powerLaserTitle', input: 'spaceKey', touchInput: 'touchPowerInput', successDelay: 1.3 }
];

// Times are flight simulation seconds, never wall time. Only a changed lesson needs world setup.
export function createFlightTutorial() {
  let index = lessons.length, solvedAt = null, retryAt = Infinity, goUntil = 0;
  return {
    get active() { return index < lessons.length; },
    get lesson() { return lessons[index] ?? null; },
    get solved() { return solvedAt !== null; },
    begin(level, alreadyCompleted) {
      index = level === 1 && !alreadyCompleted ? 0 : lessons.length;
      solvedAt = null; retryAt = Infinity; goUntil = 0;
      return this.active;
    },
    complete(action, now) {
      if (this.lesson?.action === action && !this.solved) solvedAt = now;
    },
    missCheckpoint(now) {
      if (this.lesson?.action === 'checkpoint' && !this.solved) retryAt = now + 1.2;
    },
    takeCheckpointRetry(now) {
      if (this.solved || now < retryAt) return false;
      retryAt = Infinity;
      return true;
    },
    advance(now) {
      if (!this.solved || now - solvedAt < this.lesson.successDelay) return false;
      index++; solvedAt = null; retryAt = Infinity;
      if (!this.active) goUntil = now + 1.2;
      return true;
    },
    fadingFinalHint(now) { return this.lesson?.action === 'heavy' && this.solved && now - solvedAt >= .8; },
    showingGo(now) { return now < goUntil; }
  };
}
