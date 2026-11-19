import Stats from 'stats.js/src/Stats.js';
import './game-tools.css';

export function createGameTools() {
  const label = document.createElement('label');
  label.className = 'test-level';
  label.title = 'Starting level (1–1000). Play skips training.';
  label.textContent = 'Level';
  const levelInput = document.createElement('input');
  levelInput.type = 'number';
  levelInput.id = 'test-level';
  levelInput.inputMode = 'numeric';
  levelInput.min = '1';
  levelInput.max = '1000';
  levelInput.required = true;
  levelInput.placeholder = '1';
  levelInput.value = '1';
  label.append(levelInput);
  document.querySelector('#start').after(label);

  const key = 'orbit-test-level';
  try {
    levelInput.value = sessionStorage.getItem(key) || '1';
    if (!levelInput.validity.valid) levelInput.value = '1';
  } catch { /* Storage is optional. */ }
  levelInput.addEventListener('change', () => {
    if (!levelInput.validity.valid) return;
    try { sessionStorage.setItem(key, levelInput.value); } catch { /* Keep the current selection. */ }
  });

  const link = document.createElement('a');
  link.className = 'studio-link';
  link.href = './studio/';
  link.textContent = 'Model Studio';
  document.querySelector('.intro-secondary').append(link);

  const stats = new Stats();
  stats.dom.id = 'dev-stats';
  stats.dom.removeAttribute('style');
  stats.dom.title = 'Performance monitor · Click to change panel';
  stats.dom.setAttribute('role', 'button');
  stats.dom.setAttribute('aria-label', stats.dom.title);
  stats.dom.tabIndex = 0;
  stats.dom.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      stats.dom.click();
    }
  });
  document.body.append(stats.dom);
  return { levelInput, stats };
}
