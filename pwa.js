// Keep verified releases together, but switch at a safe point instead of waiting for every tab to close.
if (window.isSecureContext && 'serviceWorker' in navigator) {
  const workers = navigator.serviceWorker;
  const resumeKey = `orbit-rush:update:${new URL('./', window.location.href).pathname}`;
  let registration, game, lock = null, retryTimer, reloading = false;

  function check() {
    clearTimeout(retryTimer);
    if (!registration?.waiting || !workers.controller) return;
    if (!lock && game?.canReload()) registration.waiting.postMessage({ type: 'orbit:check-update' });
    // Also notice another game window closing; no permanent polling without a pending update.
    retryTimer = setTimeout(check, 5000);
  }

  function unlock() {
    if (!lock) return;
    clearTimeout(lock.timer);
    for (const [button, disabled] of lock.buttons) button.disabled = disabled;
    lock = null;
    try { sessionStorage.removeItem(resumeKey); } catch {}
  }

  window.orbitUpdates = {
    get locked() { return !!lock; },
    check,
    configure(adapter) {
      try {
        const saved = sessionStorage.getItem(resumeKey);
        sessionStorage.removeItem(resumeKey);
        if (saved) adapter.restore(JSON.parse(saved));
      } catch (error) { console.warn('Could not restore the run after updating:', error); }
      game = adapter;
      check();
    }
  };

  workers.addEventListener('message', event => {
    const { type, id } = event.data || {};
    if (type === 'orbit:cancel-update') {
      if (lock?.id === id && lock.worker === event.source) unlock();
      return;
    }
    if (type !== 'orbit:prepare-update' || event.source !== registration?.waiting || !event.ports[0]) return;
    let ready = false;
    if (!lock && workers.controller && game?.canReload()) {
      try {
        const checkpoint = game.capture();
        // A blocked session store must defer the update, never discard a completed run.
        if (checkpoint) sessionStorage.setItem(resumeKey, JSON.stringify(checkpoint));
        const buttons = [...document.querySelectorAll('#start, #silent-start, #play-again, #end-run, #language')]
          .map(button => [button, button.disabled]);
        for (const [button] of buttons) button.disabled = true;
        lock = { id, worker: event.source, buttons, timer: setTimeout(() => {
          // Recover if the waiting worker disappears or never commits. Once activation starts, await reload.
          if (lock?.id === id && ['installed', 'redundant'].includes(lock.worker.state)) unlock();
        }, 5000) };
        ready = true;
      } catch (error) { console.warn('Update deferred; the run could not be saved:', error); }
    }
    event.ports[0].postMessage({ ready });
  });

  workers.addEventListener('controllerchange', () => {
    // Initial installation/local development must not reload an uncontrolled or running page.
    if (!lock || reloading) return;
    reloading = true;
    clearTimeout(retryTimer);
    clearTimeout(lock.timer);
    window.location.reload();
  });

  async function refresh() {
    if (!registration || document.hidden) return;
    try { await registration.update(); } catch {} // Offline play remains available.
    check();
  }
  window.addEventListener('pageshow', refresh);
  window.addEventListener('online', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('load', async () => {
    try {
      registration = await workers.register('./sw.js', { updateViaCache: 'none' });
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', check);
      });
      registration.installing?.addEventListener('statechange', check);
      check();
    } catch (error) { console.warn('Orbit Rush offline setup failed:', error); }
  });
}
