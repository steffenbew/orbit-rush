export const simulationStep = 1 / 60;
const maxFrameTime = .25;

// Consume elapsed seconds in whole ticks. Pausing during a tick cancels catch-up,
// so a long frame cannot advance gameplay after a collision or pause.
export function createSimulationClock(tick, isPaused = () => false) {
  let remainder = 0;
  return {
    get remainder() { return remainder; },
    reset() { remainder = 0; },
    advance(elapsed) {
      if (isPaused()) { remainder = 0; return; }
      remainder += Math.min(Math.max(0, elapsed), maxFrameTime);
      while (remainder + 1e-10 >= simulationStep) {
        remainder = Math.max(0, remainder - simulationStep);
        tick(simulationStep);
        if (isPaused()) { remainder = 0; break; }
      }
    }
  };
}
