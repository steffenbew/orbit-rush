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
