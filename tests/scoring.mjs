// Run from the project root: node tests/scoring.mjs
import { css, game as source } from './helpers/app-source.mjs';
import assert from 'node:assert/strict';
import { t, setLanguage } from '../src/presentation/i18n.js';
import { killReward } from '../src/run/scoring.js';
import { shipTypes as types } from '../src/fleet/models.js';
setLanguage('en');

const from = source.indexOf('  function award(ship)');
const to = source.indexOf('  updateScore();\n  const sound', from);
assert.ok(from >= 0 && to > from);
const awardCode = source.slice(from, to);
const feedbackCode = source.slice(source.indexOf('  let feedbackUntil ='), source.indexOf('  function updateScore()'));
const expireCode = source.match(/if \(gameTime >= feedbackUntil\)[^\n]*/)[0];
function makeGame(storageBlocked = false) {
  return new Function('killReward', 'storageBlocked', 't', `
    let score = 0, best = 0, kills = 0, lastReward = null, gameTime = 0, roundEnded = false;
    const sounds = [], saved = [];
    const classes = new Set(), feedbackValue = {textContent: ''}, feedbackDetail = {textContent: ''};
    const feedback = {classList: {contains: key => classes.has(key), add: key => classes.add(key), remove: key => classes.delete(key),
      toggle: (key, value) => value ? classes.add(key) : classes.delete(key)}, offsetWidth: 0};
    ${feedbackCode}
    const localStorage = {setItem: (...args) => { if (storageBlocked) throw new Error('Blocked'); saved.push(args); }};
    const updateScore = () => {}, playSound = sound => sounds.push(sound);
    ${awardCode}
    return { award, time: value => { gameTime = value; }, end: () => { roundEnded = true; },
      penalty: amount => showFeedback(t('shieldLost', { amount }), true),
      checkpoint: (passed, restored = 0) => showFeedback(passed
        ? (restored > 0 ? t('repaired', {amount: restored}) : t('shieldFull')) + ' · ' + t('ringPassed') : t('ringMissed'), !passed),
      expire: () => { ${expireCode} },
      state: () => ({score, best, kills, lastReward, value: feedbackValue.textContent, detail: feedbackDetail.textContent,
        feedback: [feedbackValue.textContent, feedbackDetail.textContent].filter(Boolean).join(' · '), negative: classes.has('negative'),
        active: classes.has('pop'), until: feedbackUntil, sounds, saved}) };
  `)(killReward, storageBlocked, t);
}
const target = (type, tier = 0) => ({userData: {type, asteroidTier: tier, health: 0}});
const rock = types.find(type => type.asteroid);
for (const tier of [1, 2, 3]) {
  assert.equal(killReward(rock, tier, 0).points, tier * 100);
}
for (const [index, health, points] of [[0, 3, 400], [1, 4, 600], [2, 5, 900], [4, 60, 10000]]) {
  assert.equal(types[index].health, health);
  assert.equal(killReward(types[index], 0, 0).points, points, 'Harder ship classes must pay larger rewards');
  if (index < 3) assert.ok(points > rock.points * 3, 'Fighting mobile ships should beat farming even the largest rock');
}
assert.equal(types[4].health / 3, 20, 'The boss now needs twenty power-laser hits instead of ten');
console.log('PASS size-based asteroid rewards, escalating ship rewards and 60-HP/10,000-point Leviathan');

for (const [combo, window] of [[1, 2.5], [2, 1.8], [3, 1.2], [4, .8], [5, .8]]) {
  const previous = { combo, time: 0 };
  const active = killReward(rock, 2, window - .001, previous);
  assert.equal(active.combo, Math.min(5, combo + 1));
  assert.equal(active.points, 200 * active.combo);
  assert.equal(killReward(rock, 2, window, previous).combo, 1, 'The window excludes its exact endpoint');
}
const game = makeGame();
game.award(target(rock, 2)); game.time(1); game.award(target(types[0]));
assert.equal(game.state().score, 200 + 2 * 400);
assert.equal(game.state().kills, 2);
assert.equal(game.state().feedback, '+800 · COMBO ×2');
assert.deepEqual(game.state().sounds, ['reward']);
assert.equal(game.state().best, game.state().score);
assert.deepEqual(game.state().saved.at(-1), ['sternflug-highscore', String(game.state().score)]);
const before = game.state(); game.end(); game.award(target(types[4]));
assert.deepEqual(game.state(), before, 'No score after the round ends');
const blocked = makeGame(true); blocked.award(target(rock, 3));
assert.equal(blocked.state().score, 300, 'Blocked storage must not prevent rewards');
console.log('PASS unchanged combo multiplier/cap/expiry, score feedback, highscore persistence and end-of-round guard');

const bossReward = makeGame();
bossReward.award(target(types[4]));
assert.equal(bossReward.state().until, 3);
bossReward.time(.5); bossReward.penalty(10);
assert.equal(bossReward.state().value, '+10000', 'Shield notices cannot overwrite the boss reward');
bossReward.award(target(types[0]));
assert.equal(bossReward.state().value, '+10000', 'Other kills cannot overwrite the boss reward');
assert.ok(bossReward.state().score > 10000, 'Other rewards still add points');
bossReward.time(3.01); bossReward.expire(); bossReward.penalty(10);
assert.equal(bossReward.state().negative, true, 'Normal feedback resumes after the boss reward');
const visibilityCode = source.match(/feedback\.style\.visibility = [^;]+;/)[0];
const rewardHud = {style: {}, classList: {contains: key => key === 'boss-reward'}};
new Function('feedback', 'danger', 'paused', 'roundEnded', visibilityCode)(rewardHud, true, false, false);
assert.equal(rewardHud.style.visibility, 'visible', 'Collision warnings cannot hide boss rewards');
console.log('PASS boss reward duration, notification priority and visibility during danger');

const penalties = makeGame();
penalties.time(10); penalties.penalty(10); penalties.expire();
assert.equal(penalties.state().feedback, '−10 SHIELD');
assert.equal(penalties.state().negative, true); assert.equal(penalties.state().active, true);
assert.equal(penalties.state().score, 0); assert.equal(penalties.state().kills, 0);
assert.equal(penalties.state().lastReward, null);
penalties.time(11); penalties.expire(); assert.equal(penalties.state().active, true, 'Penalty lifetime is independent of the last kill');
penalties.time(11.21); penalties.expire(); assert.equal(penalties.state().active, false);
penalties.penalty(30); penalties.award(target(types[0]));
assert.equal(penalties.state().negative, false, 'A later reward restores the positive color');
assert.equal(penalties.state().score, 400);
assert.ok(penalties.state().feedback.startsWith('+400'));
setLanguage('de'); penalties.penalty(12); assert.equal(penalties.state().feedback, '−12 SCHILD'); setLanguage('en');
assert.ok(css.includes('#feedback.negative { color: #ff7b86;'));
assert.ok(source.includes("!feedback.classList.contains('negative') ? 'hidden' : 'visible'"), 'Danger warnings must not hide penalty feedback');
console.log('PASS localized red penalty feedback, independent lifetime, unchanged score/combo, visible during danger and positive-color restoration');

for (const locale of ['en', 'de']) {
  setLanguage(locale);
  const feedback = makeGame();
  assert.equal(t('ringPassed'), 'CHECKPOINT', 'Keep checkpoint confirmation short in both languages');
  assert.equal(t('shieldFull'), locale === 'de' ? '100% SCHILD' : '100% SHIELD');
  for (const restored of [5, 3, 0]) {
    feedback.checkpoint(true, restored);
    assert.equal(feedback.state().value, restored ? t('repaired', {amount: restored}) : t('shieldFull'),
      'Show actual repair or 100% shield as the main value—never checkpoint points');
    assert.equal(feedback.state().detail, t('ringPassed'));
    assert.equal(feedback.state().negative, false);
  }
  feedback.checkpoint(false);
  assert.equal(feedback.state().value, t('shieldLost', {amount: 10}), 'Promote the damage amount even when the translation puts it last');
  assert.ok(feedback.state().detail.includes('CHECKPOINT'));
  assert.equal(feedback.state().negative, true);
  feedback.penalty(25);
  assert.equal(feedback.state().detail, '', 'A plain damage notification clears the previous context');
  feedback.award(target(types[4]));
  assert.equal(feedback.state().value, '+10000');
  assert.equal(feedback.state().detail, types[4].name, 'Keep the complete ship name as secondary context');
  assert.equal(feedback.state().negative, false);
}
setLanguage('en');
console.log('PASS prominent reward/damage values, complete secondary context, localized checkpoint penalties and single-message replacement');
