import { t } from './i18n.js';

const waiting = '— FPS · — ms';

export function createFrameStats(hud, search, inactiveStatus) {
  const enabled = new URLSearchParams(search).has('test');
  hud.hidden = !enabled;
  let lastTime = null, elapsed = 0, count = 0;

  function show(label) {
    if (hud.textContent !== label) hud.textContent = label;
  }
  function clear(status) {
    lastTime = null; elapsed = 0; count = 0;
    show(status ? t(status) : waiting);
  }
  function reset() {
    if (enabled) clear(inactiveStatus());
  }
  function sample(time) {
    if (!enabled) return;
    const status = inactiveStatus();
    if (status) { clear(status); return; }
    if (lastTime === null) { lastTime = time; show(waiting); return; }

    // Render timestamps are milliseconds. A long stall counts in full, unlike a physics tick.
    const interval = time - lastTime;
    lastTime = time;
    if (interval <= 0) return;
    elapsed += interval; count++;
    if (elapsed < 1000) return;
    const ms = elapsed / count, fps = count * 1000 / elapsed;
    show(`${fps.toFixed(fps < 10 ? 1 : 0)} FPS · ${ms.toFixed(ms < 100 ? 1 : 0)} ms`);
    elapsed = 0; count = 0;
  }
  return { reset, sample };
}
