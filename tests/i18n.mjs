// Run from the project root: node tests/i18n.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as i18n from '../i18n.js';

const { messages, detectLanguage, setLanguage, t, applyTranslations } = i18n;
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const runtimeModulePath = source.match(/from '(\.\/i18n\.js[^']*)'/)[1];
const runtimeModuleUrl = new URL(runtimeModulePath, new URL('../index.html', import.meta.url));
assert.ok(runtimeModuleUrl.searchParams.has('v'), 'The page bypasses the previously cached translation module');
const runtimeI18n = await import(runtimeModuleUrl);
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing section: ${start}`);
  return source.slice(from, to);
};
for (const [locale, shower, corridor] of [
  ['en', 'ASTEROID SHOWER', 'ASTEROID CORRIDOR'],
  ['de', 'ASTEROIDEN-SCHAUER', 'ASTEROIDEN-KORRIDOR']
]) {
  setLanguage(locale);
  assert.equal(t('asteroidShower'), shower);
  assert.equal(t('flightGo'), locale === 'en' ? 'GO!' : 'LOS!', 'Localized tutorial-to-flight announcement');
  runtimeI18n.setLanguage(locale);
  assert.equal(runtimeI18n.t('flightGo'), t('flightGo'), 'The actual page import includes the tutorial handoff message');
  assert.equal(t('asteroidCorridor'), corridor, 'Use the clear corridor name without an extra ring label');
}
assert.ok(source.includes('data-i18n="asteroidShower">ASTEROIDEN-SCHAUER</span>'), 'Initial markup also uses the hyphenated German label');
const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.de).sort());
for (const key of Object.keys(messages.en)) {
  assert.ok(messages.en[key].trim() && messages.de[key].trim());
  assert.deepEqual(placeholders(messages.en[key]), placeholders(messages.de[key]), `Matching placeholders: ${key}`);
  for (const locale of ['de', 'en']) {
    setLanguage(locale);
    const values = Object.fromEntries(placeholders(messages[locale][key]).map(name => [name, 42]));
    assert.ok(!/undefined|\{\w+\}/.test(t(key, values)), `Complete interpolation: ${locale}.${key}`);
  }
}
for (const [browser, expected] of [
  ['de', 'de'], ['de-DE', 'de'], ['de-AT', 'de'], ['DE-ch', 'de'],
  ['en-US', 'en'], ['fr-FR', 'en'], [undefined, 'en'], ['deutsch', 'en']
]) assert.equal(detectLanguage(browser), expected);
console.log('PASS complete German/English dictionaries, matching placeholders and regional browser-language detection');

class Element extends EventTarget {
  textContent = '';
  value = '';
  disabled = false;
  attributes = {};
  dataset = {};
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
}
function makeDocument() {
  const elements = [];
  for (const tag of source.matchAll(/<[^!/>][^>]*\bdata-i18n(?:=|-)[^>]*>/g)) {
    const element = new Element();
    for (const [, name, value] of tag[0].matchAll(/([\w-]+)="([^"]*)"/g)) {
      element.attributes[name] = value;
      if (name === 'data-i18n') element.dataset.i18n = value;
      if (name.startsWith('data-i18n')) assert.ok(messages.en[value], `Known static key: ${value}`);
    }
    elements.push(element);
  }
  const picker = elements.find(element => element.attributes.id === 'language');
  const radios = Object.fromEntries(['en', 'de'].map(value => {
    const radio = new Element(); radio.value = value; radio.checked = false;
    return [value, radio];
  }));
  picker.querySelector = selector => radios[selector.match(/value="(en|de)"/)[1]];
  return {
    documentElement: { lang: '' }, elements, picker, radios,
    querySelector: selector => elements.find(element => element.attributes.id === selector.slice(1)),
    querySelectorAll: selector => elements.filter(element => selector.slice(1, -1) in element.attributes)
  };
}
for (const locale of ['en', 'de']) {
  setLanguage(locale);
  const document = makeDocument();
  applyTranslations(document);
  assert.equal(document.documentElement.lang, locale);
  for (const element of document.elements) {
    if (element.dataset.i18n) assert.equal(element.textContent, messages[locale][element.dataset.i18n]);
    for (const attribute of ['aria-label', 'title']) {
      const key = element.getAttribute('data-i18n-' + attribute);
      if (key) assert.equal(element.getAttribute(attribute), messages[locale][key]);
    }
  }
  assert.equal(document.querySelector('#start-label').textContent, messages[locale].loadingSpace);
  assert.equal(document.querySelector('#effects').attributes['aria-label'], messages[locale].controls);
}
assert.ok(source.includes('data-i18n="creditsComboChanges"'));
assert.ok(!source.includes('data-i18n="creditsEffectsChanges"') && !source.includes('data-i18n="creditsMusicChanges"'));
console.log('PASS translated static text, accessibility labels, tooltips, document language and preserved credits links');

function makeLanguagePicker(browserLanguage, fallbackLanguage = 'en-US') {
  const document = makeDocument(), updates = [];
  document.picker.setAttribute = function (name, value) {
    if (name === 'data-ready') {
      const expected = detectLanguage(browserLanguage || fallbackLanguage);
      assert.equal(document.documentElement.lang, expected, 'Apply browser language before revealing the picker');
      assert.equal(document.radios[expected].checked, true, 'Select the correct radio before revealing the picker');
    }
    this.attributes[name] = value;
  };
  const game = new Function('document', 'navigator', 'i18n', 'updates', `
    let language, started = false;
    const detectLanguage = i18n.detectLanguage;
    const setLanguage = value => { i18n.setLanguage(value); language = value; };
    const applyTranslations = () => i18n.applyTranslations(document);
    ${section('    setLanguage(detectLanguage(', "    const status = document.querySelector('#status');")}
    const updateRetries = () => updates.push('lives');
    const showControlStep = () => updates.push('tutorial'), updateHeavyHud = () => updates.push('power');
    const updateWeaponHud = () => updates.push('laser'), syncFullscreen = () => updates.push('fullscreen');
    ${section("      languagePicker.addEventListener('change'", '      let danger =')}
    return { start: () => { started = true; } };
  `)(document, {languages: [browserLanguage], language: fallbackLanguage}, i18n, updates);
  assert.equal(document.picker.getAttribute('data-ready'), '', 'Reveal the picker after initialization');
  return { document, updates, game };
}
function chooseLanguage(document, value) {
  for (const radio of Object.values(document.radios)) radio.checked = radio.value === value;
  const event = new Event('change');
  Object.defineProperty(event, 'target', {value: document.radios[value]});
  document.picker.dispatchEvent(event);
}
for (const browser of ['de-DE', 'de-AT', 'de-CH']) {
  const { document, updates, game } = makeLanguagePicker(browser);
  assert.equal(document.radios.de.checked, true);
  assert.equal(document.radios.en.checked, false);
  assert.equal(document.documentElement.lang, 'de');
  // A ready start button must not revert to its loading label on language change.
  document.querySelector('#start-label').dataset.i18n = 'startFlight';
  chooseLanguage(document, 'en');
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(document.querySelector('#start-label').textContent, 'START FLIGHT');
  assert.deepEqual(updates, ['lives', 'tutorial', 'power', 'laser', 'fullscreen']);
  assert.equal(makeLanguagePicker(browser).document.radios.de.checked, true, 'A new page load preselects the browser language again');
  game.start(); chooseLanguage(document, 'de');
  assert.equal(document.documentElement.lang, 'en', 'Hidden start-screen controls cannot change an active run');
}
assert.equal(makeLanguagePicker('en-US').document.radios.en.checked, true);
assert.equal(makeLanguagePicker('fr-FR').document.radios.en.checked, true);
assert.equal(makeLanguagePicker(undefined, 'de-DE').document.radios.de.checked, true, 'Use navigator.language when the language list is unavailable');
assert.ok(!source.includes('orbit-rush-language'), 'Previously saved choices must not override browser detection');
const intro = section('  <section id="intro"', '  <button id="audio-notice"');
assert.ok(intro.indexOf('id="language"') > intro.indexOf('id="start"'), 'Place the language pill below the logo and play button');
assert.ok(!intro.match(/<fieldset id="language"[^>]*>/)[0].includes('data-ready'), 'Initial HTML must not reveal an uninitialized picker');
assert.ok(source.includes('.language-picker:not([data-ready]) { visibility: hidden; }'), 'Reserve layout space while hiding the picker until browser language is ready');
const startButton = intro.match(/<button id="start"[\s\S]*?<\/button>/)[0];
assert.ok(startButton.includes('aria-labelledby="start-label"') && startButton.includes('href="#i-play"') && startButton.includes('aria-hidden="true"'));
assert.ok(intro.includes('<span id="start-label"'), 'Localized loading status also names the play button');
assert.ok(!source.includes("document.querySelector('#start').textContent"), 'Changing language or loading state must preserve the play icon');
assert.ok(!messages.en.startFlight.includes('↗') && !messages.de.startFlight.includes('↗'));
assert.ok(!intro.includes('<select'), 'Use a two-option pill instead of a dropdown');
assert.equal((intro.match(/type="radio" name="language"/g) || []).length, 2, 'Native radios provide keyboard selection and checked state');
assert.match(source, /\.language-picker input:focus-visible \+ span/);
assert.match(source, /\.language-selection \{[^}]*position: absolute;[^}]*clip-path: inset\(0 50% 0 0 round 999px\);[^}]*transition: clip-path \.45s cubic-bezier/, 'One clipped selection layer slides without shifting layout');
assert.ok(source.includes('.language-picker:has(input[value="de"]:checked) .language-selection { clip-path: inset(0 0 0 50% round 999px); }'), 'Native checked state controls the sliding selection');
assert.ok(intro.includes('<div class="language-selection" aria-hidden="true"><span lang="en">English</span><span lang="de">Deutsch</span></div>'), 'Decorative dark text is clipped together with the mint background, without duplicate accessible labels');
assert.ok(!source.includes('transition: color .25s'), 'Text contrast follows the pill position, never a word-wide fade');
assert.ok(source.includes('transition: clip-path .45s cubic-bezier(.22, 1, .36, 1);'), 'Language movement settles without overshoot');
assert.ok(source.includes('.language-selection { transition: none; }'), 'Language animation respects reduced motion');
assert.ok(source.includes('.language-picker:disabled .language-selection { transition: none; }'), 'Automatic language selection during loading must not slide');
console.log('PASS browser-language preselection on each load, manual switching, native pill controls and active-run guard');

// Exercise actual result-copy logic for every outcome in both languages.
const resultCode = section('        if (roundEnded) return;\n        if (pauseMenu.open)', '        flightPath.hidden = true;');
for (const locale of ['en', 'de']) {
  setLanguage(locale);
  for (const [reason, lives, titleKey, buttonKey, reasonKey] of [
    ['timeout', 3, 'levelComplete', 'nextLevel', 'victoryReason'],
    ['collision', 2, 'lifeLost', 'retryLevel', 'retryReason'],
    ['collision', 0, 'gameOver', 'newRunLevel', 'gameOverReason']
  ]) {
    const elements = new Map();
    const document = { querySelector: selector => {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    } };
    new Function('document', 't', 'reason', 'retries', `
      const roundEnded = false, pauseMenu = {open: false}, crashing = true;
      const roundDialog = {dataset: {}}, roundDuration = 45, courseStartTime = 0, level = 4;
      let gameTime = 10;
      ${resultCode}
    `)(document, t, reason, lives);
    assert.equal(elements.get('#round-title').textContent, t(titleKey));
    assert.equal(elements.get('#play-again span').textContent, t(buttonKey, {level: buttonKey === 'nextLevel' ? 5 : 4}));
    assert.equal(elements.get('#round-reason').textContent, t(reasonKey));
  }
  assert.equal(t('collisionWarning'), locale === 'en' ? 'COLLISION COURSE!' : 'KOLLISIONSKURS!');
  assert.equal(t('countdown', {seconds: 3}).includes('3'), true);
  assert.equal(t('powerLaserTitle').includes('3×'), true, 'Translations preserve the actual damage multiplier');
}
setLanguage('en');
assert.equal(t('capitalStatus', {health: 9, max: 30, state: t('capitalCharging')}), '9 / 30 ARMOR · GUNS CHARGING');
assert.equal(t('repaired', {amount: 25}), '+25 SHIELD');
assert.ok(source.includes('score.toLocaleString(language)'), 'Final scores use the selected language');
console.log('PASS localized victory/retry/game-over results, parameterized HUD text and locale-aware score formatting');
