import { createThumbnailRenderer } from './stage.js';

export function createObjectPicker({ onSelect, previewParams, buildPreview }) {
  const trigger = document.getElementById('object');
  const list = document.getElementById('object-list');
  let rows = [], frame = 0, thumbnail;
  const isOpen = () => list.matches(':popover-open');

  function setEntries(entries) {
    if (isOpen()) list.hidePopover();
    rows = [];
    list.replaceChildren();
    for (const [name, items] of Map.groupBy(entries, item => item.group)) {
      const group = document.createElement('div'), heading = document.createElement('div');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', name);
      heading.className = 'picker-heading';
      heading.textContent = name;
      group.append(heading);
      for (const item of items) {
        const option = document.createElement('div'), img = new Image();
        img.alt = '';
        option.setAttribute('role', 'option');
        option.tabIndex = -1;
        option.append(img, item.label);
        option.onclick = () => { list.hidePopover(); trigger.focus(); onSelect(item.id); };
        group.append(option);
        rows.push({ item, option, img });
      }
      list.append(group);
    }
  }
  function select(item) {
    trigger.textContent = item.label;
    for (const row of rows) {
      row.option.autofocus = row.item.id === item.id; // Native popover focus on open, before the next keypress.
      row.option.setAttribute('aria-selected', row.option.autofocus);
    }
  }

  function queue() { if (!frame && isOpen()) frame = requestAnimationFrame(drawNext); }
  function drawNext() {
    frame = 0;
    if (!isOpen()) return;
    const bounds = list.getBoundingClientRect();
    const row = rows.find(row => {
      if (!row.pending) return false;
      const rect = row.option.getBoundingClientRect();
      return rect.bottom > bounds.top && rect.top < bounds.bottom;
    });
    if (!row) return;
    row.pending = false;
    try {
      thumbnail ??= createThumbnailRenderer();
      row.img.src = thumbnail(buildPreview(row.item, ...row.params));
    } catch (error) { console.warn(`Thumbnail unavailable: ${row.item.label}`, error); }
    queue();
  }

  function place() {
    const rect = document.getElementById('object-controls').getBoundingClientRect(), gap = 5;
    const below = innerHeight - rect.bottom - gap, above = rect.top - gap;
    const up = below < 300 && above > below;
    Object.assign(list.style, { left: `${rect.left}px`, width: `${rect.width}px`,
      maxHeight: `${Math.min(450, Math.max(0, (up ? above : below) - 6))}px`,
      top: up ? 'auto' : `${rect.bottom + gap}px`, bottom: up ? `${innerHeight - rect.top + gap}px` : 'auto' });
  }
  list.addEventListener('beforetoggle', e => {
    const opening = e.newState === 'open';
    trigger.setAttribute('aria-expanded', opening);
    cancelAnimationFrame(frame); frame = 0;
    if (!opening) return;
    place();
    for (const row of rows) {
      row.params = previewParams(row.item);
      const key = row.params.join(':');
      if (row.key === key) continue;
      row.key = key; row.pending = true; row.img.removeAttribute('src');
    }
    frame = requestAnimationFrame(drawNext);
  });
  list.addEventListener('scroll', queue);
  window.addEventListener('resize', () => { if (isOpen()) { place(); queue(); } });
  trigger.closest('aside').addEventListener('scroll', () => { if (isOpen()) place(); });
  trigger.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); list.showPopover(); }
  };
  let prefix = '', lastTyped = 0;
  list.onkeydown = e => {
    const i = rows.findIndex(row => row.option === document.activeElement);
    let next;
    switch (e.key) {
      case 'ArrowDown': next = rows[Math.min(i + 1, rows.length - 1)]; break;
      case 'ArrowUp': next = rows[Math.max(i - 1, 0)]; break;
      case 'Home': next = rows[0]; break;
      case 'End': next = rows.at(-1); break;
      case ' ': case 'Enter': e.preventDefault(); rows[i]?.option.click(); return;
      case 'Tab': list.hidePopover(); trigger.focus(); return;
      default:
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
        prefix = (e.timeStamp - lastTyped < 600 ? prefix : '') + e.key.toLowerCase();
        lastTyped = e.timeStamp;
        next = rows.find(row => row.item.label.toLowerCase().startsWith(prefix));
    }
    e.preventDefault(); next?.option.focus();
  };
  function step(delta) {
    const i = rows.findIndex(row => row.option.getAttribute('aria-selected') === 'true');
    if (rows.length) onSelect(rows[(i + delta + rows.length) % rows.length].item.id);
  }
  document.getElementById('prev-object').onclick = () => step(-1);
  document.getElementById('next-object').onclick = () => step(1);
  return { setEntries, select };
}
