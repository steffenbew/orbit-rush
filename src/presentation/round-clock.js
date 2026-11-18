import { t } from './i18n.js';

// Display course time; advancing the simulation and ending the round belong to main.js.
export function createRoundClock(root, roundDuration, playTick) {
  const clock = root.querySelector('#round-clock'), levelLabel = root.querySelector('#level-label');
  const progress = root.querySelector('#level-progress'), fill = root.querySelector('#level-progress-fill');
  const timeLeft = root.querySelector('#time-left'), countdown = root.querySelector('#end-countdown');
  const number = root.querySelector('#countdown-number'), dots = root.querySelectorAll('.countdown-track i');
  let lastSecond = null;

  return function render(courseTime, { level, training, inFlight, paused, celebrating }) {
    const elapsed = training ? 0 : Math.min(roundDuration, Math.max(0, courseTime));
    const remaining = Math.ceil(roundDuration - elapsed);
    const countingDown = inFlight && !training && remaining > 0 && remaining <= 5;
    timeLeft.textContent = training ? t('training')
      : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    timeLeft.setAttribute('aria-label', timeLeft.textContent);
    levelLabel.textContent = String(level);
    clock.classList.toggle('urgent', remaining <= roundDuration / 3 && !celebrating);
    countdown.hidden = !countingDown;
    if (countingDown) {
      number.textContent = String(remaining);
      dots.forEach((dot, index) => dot.classList.toggle('spent', index < 5 - remaining));
      countdown.setAttribute('aria-label', t('countdown', { seconds: remaining }));
      if (!paused && remaining !== lastSecond) playTick();
    }
    lastSecond = remaining;
    fill.style.transform = `scaleX(${elapsed / roundDuration})`;
    progress.setAttribute('aria-valuenow', elapsed.toFixed(1));
    progress.setAttribute('aria-valuetext', t('progress', { percent: Math.round(elapsed / roundDuration * 100) }));
  };
}
