import { setMouseTurn, stickAimPixels } from '../flight/view.js';

// Keep pointer history across menus, but never turn just because Start was clicked.
export function createPlayerAim({ target, mouseAim, headingPoint, reticle, getCameraMode, viewport = window }) {
  let source = null, lastPointer = null;
  function aimAt(x, y) {
    const { innerWidth: width, innerHeight: height } = viewport;
    const px = Math.max(0, Math.min(width, x)), py = Math.max(0, Math.min(height, y));
    mouseAim.set(px / width * 2 - 1, 1 - py / height * 2);
    reticle.style.left = `${px}px`; reticle.style.top = `${py}px`;
  }
  function update() {
    if (source === 'mouse') setMouseTurn(target, mouseAim, getCameraMode(), headingPoint);
    if (source === 'stick') {
      const { x, y } = stickAimPixels(target, getCameraMode(), headingPoint, viewport.innerWidth, viewport.innerHeight);
      aimAt(x, y);
    }
  }
  function mouse({ clientX, clientY }) { source = 'mouse'; aimAt(clientX, clientY); update(); }
  function neutral() { source = null; target.set(0, 0); }
  return {
    update, mouse, neutral,
    remember({ clientX, clientY }) { lastPointer = { clientX, clientY }; },
    stick(x, y) { lastPointer = null; source = 'stick'; target.set(x, y); update(); },
    start() {
      aimAt(lastPointer?.clientX ?? viewport.innerWidth / 2, lastPointer?.clientY ?? viewport.innerHeight / 2);
      neutral();
      if (!lastPointer) source = 'stick';
    },
    resume() { if (lastPointer) mouse(lastPointer); },
    restart(touchMode) {
      if (touchMode) lastPointer = null;
      if (lastPointer) mouse(lastPointer);
      else { source = 'stick'; target.set(0, 0); }
    }
  };
}

export function createPlayerControls({ canvas, touchRoot, touchMode, aim, mode, onFire, onPause, onView, wakeAudio }) {
  let pointer = null, spaceHeld = false;
  const dialogOpen = () => document.querySelector('dialog[open]:not(.victory)');
  const touch = createTouchControls({
    root: touchRoot, onSteer: aim.stick, onFire,
    canPlay: () => touchMode && mode() === 'flight' && !document.hidden && !dialogOpen()
  });
  // A victory keeps an existing mouse drag for painting, never a held weapon key or touch.
  function reset({ keepPointer = false } = {}) {
    const id = pointer?.id;
    if (!keepPointer) {
      pointer = null;
      if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    }
    spaceHeld = false;
    touch.reset();
  }
  window.addEventListener('keydown', event => {
    const current = mode();
    if (event.defaultPrevented || current === 'inactive' || dialogOpen() || event.target.closest('input, textarea, [contenteditable]')) return;
    if (event.code === 'Space') {
      if (current === 'victory' && event.target.closest('button, a')) return;
      event.preventDefault();
      if (!event.repeat) { spaceHeld = true; wakeAudio(); onFire(true); }
    } else if ((event.key === 'v' || event.key === 'V') && !event.repeat
      && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && current === 'flight') {
      event.preventDefault(); onView();
    } else if (event.code === 'Escape' && !event.repeat) {
      event.preventDefault(); onPause();
    }
  });
  window.addEventListener('keyup', event => { if (event.code === 'Space') spaceHeld = false; });

  // Suppress native gestures across the game UI, except links and diagnostic report copying.
  for (const name of ['contextmenu', 'auxclick', 'dblclick', 'dragstart', 'selectstart', 'wheel', 'gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(name, event => {
      if (!event.target.closest('#audio-credits, #render-diagnostics')) event.preventDefault();
    }, { passive: false });
  }
  function ignorePointer(event, current) {
    return (event.pointerType === 'touch' && current !== 'victory') || event.target.closest('#touch-controls');
  }
  // Track primary mouse positions even over menus and HUD controls.
  for (const name of ['pointermove', 'pointerdown']) window.addEventListener(name, event => {
    if (ignorePointer(event, mode()) || !event.isPrimary) return;
    if (event.type !== 'pointerdown' || (event.button === 0 && !event.ctrlKey)) aim.remember(event);
  }, { capture: true });
  canvas.addEventListener('pointerdown', event => {
    const current = mode();
    if (event.pointerType === 'touch' && current !== 'victory') return;
    if (!event.isPrimary || event.button !== 0 || event.ctrlKey) { event.preventDefault(); return; }
    if (pointer || current === 'inactive' || dialogOpen()) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    aim.mouse(event); onFire(false, pointer);
  });
  window.addEventListener('pointermove', event => {
    const current = mode();
    if (ignorePointer(event, current) || !event.isPrimary || (pointer && pointer.id !== event.pointerId)) return;
    if (current === 'inactive' || dialogOpen()) return;
    aim.mouse(event);
    if (pointer) { pointer.x = event.clientX; pointer.y = event.clientY; }
  });
  function stop(event) {
    if (pointer?.id !== event.pointerId) return;
    pointer = null;
    if (event.pointerType !== 'mouse' || event.type === 'pointercancel') aim.neutral();
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, stop);
  document.documentElement.addEventListener('pointerleave', event => {
    if (event.pointerType !== 'touch' && !pointer) aim.neutral();
  });
  window.addEventListener('blur', () => {
    reset(); aim.neutral();
    if (mode() !== 'inactive') onPause();
  });
  return {
    reset, updateTouchHud: touch.update,
    get normalHeld() { return !!pointer || touch.normalHeld; },
    get heavyHeld() { return spaceHeld || touch.heavyHeld; },
    get pointer() { return pointer; }
  };
}

// Independent pointer captures let either thumb steer or fire, in either order.
export function createTouchControls({ root, canPlay, onSteer, onFire }) {
  const joystick = root.querySelector('#touch-joystick');
  const knob = root.querySelector('.joystick-knob');
  const laser = root.querySelector('#touch-laser');
  const power = root.querySelector('#touch-power');
  const held = new Map();
  const meters = [laser, power].map(button => button.querySelector('.touch-charge'));

  function moveStick(event) {
    const rect = joystick.getBoundingClientRect();
    const radius = (rect.width - knob.getBoundingClientRect().width) / 2;
    let x = (event.clientX - rect.left - rect.width / 2) / radius;
    let y = (event.clientY - rect.top - rect.height / 2) / radius;
    const distance = Math.hypot(x, y);
    if (distance > 1) { x /= distance; y /= distance; }
    knob.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
    // Full normalized steering, independent of the viewport and aiming-circle size.
    onSteer(x, -y);
  }

  function release(element) {
    const id = held.get(element);
    if (id === undefined) return;
    held.delete(element);
    element.classList.remove('held');
    if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
    if (element === joystick) {
      knob.style.transform = 'translate(0px, 0px)';
      onSteer(0, 0);
    }
  }

  function reset() {
    for (const element of [...held.keys()]) release(element);
  }

  for (const element of [joystick, laser, power]) {
    element.addEventListener('pointerdown', event => {
      if (!canPlay() || held.has(element) || event.button !== 0 || event.ctrlKey) return;
      event.preventDefault();
      held.set(element, event.pointerId);
      element.setPointerCapture(event.pointerId);
      element.classList.add('held');
      if (element === joystick) moveStick(event);
      else onFire(element === power);
    });
    element.addEventListener('pointermove', event => {
      if (held.get(element) !== event.pointerId) return;
      event.preventDefault();
      if (!canPlay()) { reset(); return; }
      if (element === joystick) moveStick(event);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      element.addEventListener(name, event => {
        if (held.get(element) === event.pointerId) release(element);
      });
    }
    element.addEventListener('contextmenu', event => event.preventDefault());
  }
  // Keyboard/assistive activation fires once; pointer clicks already fired on down.
  for (const button of [laser, power]) button.addEventListener('click', event => {
    if (event.detail === 0 && canPlay()) onFire(button === power);
  });
  window.addEventListener('blur', reset);
  window.addEventListener('resize', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });

  return {
    get normalHeld() { return held.has(laser); },
    get heavyHeld() { return held.has(power); },
    reset,
    update(heat, overheated, heavyEnergy) {
      root.hidden = !canPlay();
      if (root.hidden) { reset(); return; }
      for (const [index, charge] of [1 - heat / 100, heavyEnergy].entries()) {
        meters[index].setAttribute('aria-valuenow', String(Math.round(charge * 100)));
        meters[index].querySelector('.touch-charge-fill').setAttribute('stroke-dashoffset', String(100 - charge * 100));
      }
      // Keep accepting held input during recharge; never disable/cancel a thumb.
      laser.classList.toggle('unavailable', overheated);
      power.classList.toggle('unavailable', heavyEnergy < 1);
    }
  };
}
