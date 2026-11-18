import { config } from './config.js';

const tz = config.timezone;

// Parts of a Date in the club's timezone (America/New_York).
export function etParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'long'
  });
  const o = Object.fromEntries(f.formatToParts(d).map(p => [p.type, p.value]));
  if (o.hour === '24') o.hour = '00';
  return o;
}

export function etDate(d = new Date()) {
  const p = etParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

// ISO string with the correct Eastern offset, e.g. 2026-12-03T10:05:00-05:00
export function etISO(d = new Date()) {
  const p = etParts(d);
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offMin = Math.round((local - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  const sign = offMin >= 0 ? '+' : '-';
  const a = Math.abs(offMin);
  const oh = String(Math.floor(a / 60)).padStart(2, '0');
  const om = String(a % 60).padStart(2, '0');
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${sign}${oh}:${om}`;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function prettyDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const mon = ['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1];
  return `${weekdayOf(dateStr)}, ${mon} ${d}`;
}

export function shortWhen(dateStr, startTime) {
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(dateStr.slice(5, 7)) - 1];
  return `${weekdayOf(dateStr).slice(0, 3)} ${mon} ${Number(dateStr.slice(8, 10))}${startTime ? ', ' + startTime : ''}`;
}
