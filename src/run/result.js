import { t, language } from '../presentation/i18n.js';

const copy = {
  victory: { icon: 'trophy', title: 'levelComplete', actionIcon: 'next', action: 'nextLevel', reason: 'victoryReason' },
  retry: { icon: 'heart-broken', title: 'lifeLost', actionIcon: 'restart', action: 'retryLevel', reason: 'retryReason' },
  gameover: { icon: 'stop', title: 'gameOver', actionIcon: 'play', action: 'newRunLevel', reason: 'gameOverReason' }
};

// Presentation only: reopening a saved result must never apply its gameplay consequences.
export function showRoundResult(dialog, outcome, { level, score, newRecord }) {
  const text = copy[outcome];
  const find = selector => dialog.querySelector(selector);
  dialog.dataset.outcome = outcome;
  dialog.classList.toggle('victory', outcome === 'victory');
  find('#round-symbol use').setAttribute('href', '#i-' + text.icon);
  find('#round-outcome').textContent = t('levelNumber', { level });
  find('#round-title').textContent = t(text.title);
  find('#round-reason').textContent = t(text.reason);
  find('#play-again use').setAttribute('href', '#i-' + text.actionIcon);
  find('#play-again span').textContent = t(text.action, { level: outcome === 'victory' ? level + 1 : level });
  find('#final-score').textContent = score.toLocaleString(language);
  find('#new-record').hidden = !newRecord;
  dialog.show();
  find('#play-again').focus();
}
