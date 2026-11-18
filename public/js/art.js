// Generated, photo-free visuals: layered gradients + grain, deterministic per slot.
// Drop real photos in /public/img named after a slot (e.g. hero.jpg) and they replace these.
let images = {};
export function setImages(map) { images = map || {}; }

function rng(seed) { let h = 2166136261; for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; }; }

const THEMES = {
  violet: ['#0a0a0c', '#6449e1', '#b5a6ff', '#efebff'],
  night: ['#0a0a0c', '#26262d', '#6449e1', '#8a74f0'],
  paper: ['#efebff', '#d9d0ff', '#6449e1', '#ffffff'],
  mono: ['#16161a', '#3a3a44', '#8a74f0', '#f6f6f9']
};
const SLOT_THEME = { hero: 'violet', cta: 'night', about: 'paper', reform: 'mono', cs4: 'violet', ride: 'night', box: 'mono', sweat: 'violet', membership: 'night' };

export function art(slot, { cls = '', theme, label = '' } = {}) {
  const t = THEMES[theme || SLOT_THEME[slot.split('-').pop()] || SLOT_THEME[slot] || 'violet'];
  const r = rng(slot);
  const id = 'g' + Math.floor(r() * 1e6);
  const blobs = Array.from({ length: 4 }, (_, i) => {
    const cx = 10 + r() * 80, cy = 10 + r() * 80, rad = 24 + r() * 36;
    return `<circle cx="${cx}%" cy="${cy}%" r="${rad}%" fill="${t[1 + (i % 3)]}" opacity="${(0.5 + r() * 0.4).toFixed(2)}" filter="url(#b${id})"/>`;
  }).join('');
  const rings = Array.from({ length: 3 }, (_, i) => {
    const cx = 20 + r() * 60, cy = 20 + r() * 60, rad = 14 + i * 11 + r() * 8;
    return `<circle cx="${cx}%" cy="${cy}%" r="${rad}%" fill="none" stroke="${t[3]}" stroke-opacity="${(0.12 + r() * 0.15).toFixed(2)}" stroke-width="1.2"/>`;
  }).join('');
  const lines = Array.from({ length: 9 }, (_, i) => `<line x1="${-10 + i * 14}%" y1="110%" x2="${30 + i * 14}%" y2="-10%" stroke="${t[3]}" stroke-opacity=".07"/>`).join('');
  return `<div class="art ${cls}" data-slot="${slot}" role="img" aria-label="${label || 'Decorative studio artwork'}">
    <svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" viewBox="0 0 100 100">
      <defs>
        <filter id="b${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
        <filter id="n${id}"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0"/></filter>
      </defs>
      <rect width="100" height="100" fill="${t[0]}"/>
      ${blobs}${lines}${rings}
      <rect width="100" height="100" filter="url(#n${id})" opacity=".18" style="mix-blend-mode:overlay"/>
    </svg></div>`;
}

// Swap generated art for a real photo when one exists in /public/img
export function hydratePhotos(root = document) {
  root.querySelectorAll('.art[data-slot]').forEach(el => {
    const slot = el.dataset.slot;
    const src = images[slot] || images[slot.split('-').pop()];
    if (src && !el.querySelector('.art-photo')) {
      const img = new Image(); img.className = 'art-photo'; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.onload = () => el.append(img);
      img.src = src;
    }
  });
}
