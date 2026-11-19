import * as initialCatalog from './catalog.js';
import { createStage, isValidView } from './stage.js';
import { createObjectPicker } from './object-picker.js';

const $ = id => document.getElementById(id);
const level = $('level'), timingSelect = $('timing-select');
// Remember the view when possible; blocked storage or a stale session must not prevent inspection.
let saved;
try { saved = JSON.parse(sessionStorage.getItem('orbit-studio')); } catch { /* Start with the default view. */ }
const savedView = isValidView(saved?.view) ? saved.view : null;
let library = initialCatalog, entries, entry, seed = saved?.seed ?? 4;
let stage;
let currentLevel = Number(saved?.level ?? 2);
// Restore open Studio tabs saved before repeated encounters shared a picker entry.
const oldEncounter = /^(field|shower|corridor)-(\d+)$/.exec(saved?.id);
let occurrence = saved?.occurrence ?? (oldEncounter ? Number(oldEncounter[2]) - 1 : 0);

const picker = createObjectPicker({
  onSelect: selectEntry,
  previewParams: item => [item.phases ? library.nearestLevel(item.phases, currentLevel) : 1, item.reroll ? seed : 4, item.id === entry?.id ? occurrence : 0],
  buildPreview: (...args) => library.buildPreview(...args)
});

function loadCatalog(id, viewMode) {
  entries = library.catalog();
  picker.setEntries(entries);
  selectEntry(id, viewMode);
}

function selectEntry(id, viewMode = 'home') {
  entry = entries.find(candidate => candidate.id === id) ?? entries[0];
  picker.select(entry);
  level.disabled = !entry.phases;
  $('level-timing').hidden = !entry.phases;
  const previous = currentLevel;
  if (entry.phases) {
    currentLevel = library.nearestLevel(entry.phases, previous);
    level.value = currentLevel;
    level.setAttribute('aria-describedby', 'level-timing');
    const times = entry.phases.get(Math.min(currentLevel, library.recurringLevel));
    if (!times[occurrence]) occurrence = 0;
    $('timing-text').textContent = times.length === 1 ? times[0].timing : '';
    timingSelect.hidden = times.length === 1;
    if (!timingSelect.hidden) {
      timingSelect.replaceChildren(...times.map(({ timing }, i) => new Option(timing, i)));
      timingSelect.value = occurrence;
    }
  } else {
    level.value = '';
    level.removeAttribute('aria-describedby');
    occurrence = 0;
  }
  $('prev-level').disabled = !entry.phases || nextLevel(-1) === undefined;
  $('next-level').disabled = !entry.phases || nextLevel(1) === undefined;
  $('level-note').textContent = previous === currentLevel ? '' : `Showing level ${currentLevel} for ${entry.label}.`;
  $('reroll').hidden = !entry.reroll;
  $('title').textContent = entry.label;
  $('source').textContent = entry.source;
  refresh(viewMode);
}
function refresh(viewMode) {
  try {
    stage.show(library.buildPreview(entry, currentLevel, seed, occurrence), viewMode, entry.profile);
    $('error').hidden = true;
  } catch (error) {
    showError(error);
  }
}
function showError(error) {
  $('error').textContent = error.message;
  $('error').hidden = false;
  console.error(error);
}
try {
  stage = createStage(document.querySelector('canvas'), savedView, $('reset'));
  loadCatalog(oldEncounter?.[1] ?? saved?.id ?? 'player', savedView ? 'keep' : 'home');
} catch (error) {
  document.querySelector('aside').inert = true;
  showError(error);
}

function nextLevel(delta) {
  return library.adjacentLevel(entry.phases, currentLevel, delta, Number(level.max));
}
function setLevel(next) {
  if (next === undefined) return;
  currentLevel = next;
  selectEntry(entry.id, 'relative');
}
$('prev-level').onclick = () => setLevel(nextLevel(-1));
$('next-level').onclick = () => setLevel(nextLevel(1));
level.onchange = () => {
  const value = level.valueAsNumber;
  if (!Number.isFinite(value)) { level.value = currentLevel; return; }
  setLevel(Math.max(Number(level.min), Math.min(Number(level.max), Math.round(value))));
};
level.onkeydown = e => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  setLevel(nextLevel(e.key === 'ArrowUp' ? 1 : -1));
};
timingSelect.onchange = () => { occurrence = Number(timingSelect.value); refresh('relative'); };
$('reroll').onclick = () => { seed = (seed + 1) >>> 0; refresh('keep'); };

function save() {
  if (!entry) return;
  try { sessionStorage.setItem('orbit-studio', JSON.stringify({ id: entry.id, level: currentLevel, occurrence, seed, view: stage.view })); }
  catch { /* Session persistence is optional. */ }
}
window.addEventListener('pagehide', save);
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', save);
  import.meta.hot.accept('./catalog.js', updated => {
    if (updated && entry) { library = updated; loadCatalog(entry.id, 'keep'); }
  });
}
