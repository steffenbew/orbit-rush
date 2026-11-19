// Keep the accessible value immediate; animate only the fill and its feedback.
export function createShieldHud(document, shield) {
  const shieldHud = document.querySelector('#shield-hud');
  const shieldFill = document.querySelector('#shield-fill');
  let shieldDisplayed = shield, shieldFrom = shield, shieldTween = .25;
  let shieldFeedbackTime = 0, shieldFeedback = '';
  function set(value, animate = true) {
    const change = value - shield;
    shield = value;
    // The accessible value and number are immediate; only the decorative fill interpolates.
    document.querySelector('#shield-energy').value = shield;
    document.querySelector('#shield-value').textContent = `${Math.ceil(shield)}%`;
    shieldHud.classList.toggle('low', shield <= 30);
    if (!animate) {
      shieldDisplayed = shield; shieldTween = .25;
      shieldFeedbackTime = 0; shieldFeedback = '';
    } else if (change !== 0) {
      shieldFrom = shieldDisplayed; shieldTween = 0;
      shieldFeedback = change > 0 ? 'healed' : 'hit';
      shieldFeedbackTime = .55;
    }
  }
  function advance(dt, active) {
    if (!active || document.hidden) return;
    shieldTween = Math.min(.25, shieldTween + dt);
    const progress = shieldTween / .25;
    shieldDisplayed = shieldFrom + (shield - shieldFrom) * (1 - (1 - progress) ** 3);
    shieldFeedbackTime = Math.max(0, shieldFeedbackTime - dt);
  }
  function render(paused) {
    shieldFill.style.transform = `scaleX(${shieldDisplayed / 100})`;
    shieldHud.classList.toggle('hit', shieldFeedbackTime > 0 && shieldFeedback === 'hit');
    shieldHud.classList.toggle('healed', shieldFeedbackTime > 0 && shieldFeedback === 'healed');
    shieldHud.style.animationPlayState = paused || document.hidden ? 'paused' : 'running';
  }
  return { set, advance, render };
}
