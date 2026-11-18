// Turns what a caller said ("spin on Saturday around 9") into a real class row.
import { db, listClasses } from './db.js';
import { etDate, addDays, weekdayOf, prettyDate } from './time.js';

const norm = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

let aliasIndex = null;
export function rebuildAliases() { aliasIndex = null; }
function aliases() {
  if (aliasIndex) return aliasIndex;
  const idx = new Map(); // normalized alias -> Set(class_name)
  const add = (a, name) => { a = norm(a); if (!a) return; if (!idx.has(a)) idx.set(a, new Set()); idx.get(a).add(name); };
  for (const c of db.prepare('SELECT class_name, spoken_aliases FROM catalog').all()) {
    add(c.class_name, c.class_name);
    for (const a of (c.spoken_aliases || '').split('|')) add(a, c.class_name);
  }
  // Extra things callers say that map to several classes.
  const extra = {
    yoga: ['Yoga Flow', 'Yoga Restore'], pilates: ['Reform', 'Hot Pilates', 'Pilates X Strength'],
    hiit: ['Hot HIIT Sculpt', 'CS4'], 'box x lift': ['Box x Lift'], 'x lift': ['Box x Lift'], restore: ['Yoga Restore', 'Candlelight Restore']
  };
  for (const [a, names] of Object.entries(extra)) for (const n of names) add(a, n);
  aliasIndex = idx;
  return idx;
}

export function resolveTypes(name) {
  const n = norm(name);
  if (!n) return [];
  const idx = aliases();
  if (idx.has(n)) return [...idx.get(n)];
  const hits = new Set();
  for (const [a, names] of idx) if (a.includes(n) || (a.length > 3 && n.includes(a))) names.forEach(x => hits.add(x));
  return [...hits];
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

export function parseDate(input, today = etDate()) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  let m;
  if ((m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const year = today.slice(0, 4);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/))) {
    const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : year;
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  for (let i = 0; i < 12; i++) {
    const re = new RegExp(`${MONTHS[i].slice(0, 3)}[a-z]*\\.?\\s+(\\d{1,2})`);
    if ((m = s.match(re))) return `${year}-${String(i + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (/\btoday\b/.test(s)) return today;
  if (/\btomorrow\b/.test(s)) return addDays(today, 1);
  for (let i = 0; i < 7; i++) {
    if (s.includes(DAYS[i])) {
      for (let k = 0; k < 7; k++) { const d = addDays(today, k); if (weekdayOf(d).toLowerCase() === DAYS[i]) return d; }
    }
  }
  return null;
}

// Returns a list of possible minutes-after-midnight (a bare "8" could be 8 AM or 8 PM).
export function parseTime(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  if (/noon/.test(s)) return [720];
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/);
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2] || 0);
  const mer = m[3] ? m[3][0] : null;
  if (h > 23 || min > 59) return null;
  if (mer === 'p' && h < 12) h += 12;
  if (mer === 'a' && h === 12) h = 0;
  if (mer || h >= 13 || h === 0) return [h * 60 + min];
  if (h === 12) return [720 + min, min];
  return [h * 60 + min, (h + 12) * 60 + min];
}

const minutesOf = iso => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));

export function describeClass(c) {
  return `${c.class_name} on ${prettyDate(c.date)} at ${c.start_time}`;
}

/**
 * @returns {{kind:'matched'|'ambiguous'|'none'|'past'|'holiday', cls?:object, options?:object[], reason?:string}}
 */
export function resolveClass({ class_id, class_name, class_date, class_time }) {
  const now = Date.now();
  if (class_id) {
    const c = db.prepare('SELECT * FROM classes WHERE class_id = ?').get(String(class_id).trim());
    if (c) return finish(c, now);
  }
  const types = resolveTypes(class_name);
  if (!types.length) return { kind: 'none', reason: class_name ? `I don't recognize a class called "${class_name}".` : 'No class was specified.' };
  const date = parseDate(class_date);
  if (!date) return { kind: 'none', reason: 'No date was given.', types };

  let rows = listClasses({ from: date, to: date }).filter(c => types.includes(c.class_name));
  if (!rows.length) return { kind: 'none', reason: `No ${types.join(' / ')} class is scheduled on ${prettyDate(date)}.`, types, date };

  const t = parseTime(class_time);
  if (t) {
    const exact = rows.filter(c => t.includes(minutesOf(c.start_iso)));
    const near = exact.length ? exact : rows.filter(c => t.some(x => Math.abs(x - minutesOf(c.start_iso)) <= 20));
    if (near.length) rows = near;
    else return { kind: 'ambiguous', options: rows, reason: `No ${types.join(' / ')} class starts at that time on ${prettyDate(date)}.` };
  }
  if (rows.length === 1) return finish(rows[0], now);
  return { kind: 'ambiguous', options: rows, reason: 'More than one class matches.' };
}

function finish(c, now) {
  if (Date.parse(c.start_iso) <= now) return { kind: 'past', cls: c };
  if (c.status === 'holiday_unconfirmed') return { kind: 'holiday', cls: c };
  return { kind: 'matched', cls: c };
}
