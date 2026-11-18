export function anchorTouchViewport(onSync) {
  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const viewport = window.visualViewport;
      // Do not fight accessibility zoom or its intentional viewport panning.
      if (viewport && viewport.scale !== 1) return;
      if (window.scrollX || window.scrollY || viewport?.offsetLeft || viewport?.offsetTop) window.scrollTo(0, 0);
      onSync();
    });
  }
  for (const name of ['resize', 'orientationchange', 'pageshow']) window.addEventListener(name, schedule);
  for (const name of ['resize', 'scroll']) window.visualViewport?.addEventListener(name, schedule);
  schedule();
}

// Touch buttons must also work while another finger is holding a flight control.
export function bindTouchButtons(buttons) {
  for (const button of buttons) {
    let pointerId = null, suppressTouchClick = false;
    function reset() {
      const id = pointerId;
      pointerId = null;
      if (id !== null && button.hasPointerCapture(id)) button.releasePointerCapture(id);
    }
    button.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch') { suppressTouchClick = false; return; }
      if (button.disabled || pointerId !== null || event.button !== 0 || event.ctrlKey) return;
      event.preventDefault();
      suppressTouchClick = true;
      pointerId = event.pointerId;
      button.setPointerCapture(pointerId);
    });
    button.addEventListener('pointerup', event => {
      if (event.pointerId !== pointerId) return;
      event.preventDefault();
      reset();
      const rect = button.getBoundingClientRect();
      // A drag onto a neighboring button must not activate either action.
      if (!button.disabled && event.clientX >= rect.left && event.clientX < rect.right
        && event.clientY >= rect.top && event.clientY < rect.bottom) button.click();
    });
    for (const name of ['pointercancel', 'lostpointercapture']) {
      button.addEventListener(name, event => { if (event.pointerId === pointerId) reset(); });
    }
    button.addEventListener('click', event => {
      // Our click(), keyboard and assistive activation have detail 0. Suppress only
      // the extra native touch click, including Safari's legacy MouseEvent form.
      if (event.pointerType === 'touch' || (suppressTouchClick && event.detail > 0)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, { capture: true });
    window.addEventListener('blur', reset);
    window.addEventListener('resize', reset);
    document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  }
}
