import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { parseCSV } from './csv.js';
import { etISO, etDate, addDays, shortWhen } from './time.js';
import { publish } from './events.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS classes (
  class_id TEXT PRIMARY KEY, date TEXT, weekday TEXT, start_time TEXT, start_iso TEXT, end_iso TEXT,
  class_name TEXT, studio TEXT, studio_note TEXT, instructor TEXT, is_sub INTEGER DEFAULT 0,
  capacity INTEGER, seats_booked INTEGER, seats_left INTEGER, waitlist INTEGER, status TEXT,
  booking_opens_iso TEXT, priority_booking_opens_iso TEXT, schedule_basis TEXT, holiday_note TEXT,
  demo_pinned INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_classes_date ON classes(date);
CREATE TABLE IF NOT EXISTS catalog (
  class_name TEXT PRIMARY KEY, studio TEXT, studio_note TEXT, duration_min INTEGER, duration_basis TEXT,
  intensity TEXT, impact TEXT, heated TEXT, heat_detail TEXT, gear_required TEXT, gear_recommended TEXT,
  beginner_friendly TEXT, good_for TEXT, spoken_aliases TEXT, description TEXT
);
CREATE TABLE IF NOT EXISTS requests (
  request_id TEXT PRIMARY KEY, created_at TEXT, updated_at TEXT,
  request_type TEXT DEFAULT 'booking',
  caller_name TEXT, caller_phone TEXT, is_member TEXT, membership_tier TEXT,
  class_id TEXT, class_name TEXT, class_start_iso TEXT, seat_status_at_request TEXT,
  experience_level TEXT, goals TEXT, questions_asked TEXT, call_summary TEXT,
  needs_followup TEXT DEFAULT 'no', followup_reason TEXT,
  status TEXT DEFAULT 'pending', staff_notes TEXT, source TEXT,
  call_id TEXT, seat_counted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at);
CREATE INDEX IF NOT EXISTS idx_requests_call ON requests(call_id);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, type TEXT, request_id TEXT, message TEXT, meta TEXT
);
`);

// ---------- helpers ----------
const intOrNull = v => (v === '' || v == null ? null : Number(v));
const normStudio = s => {
  const assumed = /assumed|unconfirmed/i.test(s);
  return { studio: s.replace(/\(.*?\)/g, '').replace(/^Unconfirmed\s*/i, '').trim() || 'Sweat+', note: assumed ? 'Studio assumed from class type' : '' };
};
export function seatStatus(seatsLeft) {
  if (seatsLeft == null) return 'holiday_unconfirmed';
  if (seatsLeft <= 0) return 'full';
  if (seatsLeft <= 5) return 'few_left';
  return 'open';
}

// ---------- seeding ----------
function seedClassesAndCatalog() {
  const cat = parseCSV(fs.readFileSync(path.join(config.dataDir, 'class_catalog.csv'), 'utf8'));
  const sched = parseCSV(fs.readFileSync(path.join(config.dataDir, 'schedule_availability.csv'), 'utf8'));
  db.exec('BEGIN');
  db.exec('DELETE FROM catalog; DELETE FROM classes;');
  const ic = db.prepare(`INSERT INTO catalog VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const c of cat) {
    const s = normStudio(c.studio);
    ic.run(c.class_name, s.studio, s.note, intOrNull(c.duration_min), c.duration_basis, c.intensity, c.impact,
      c.heated, c.heat_detail, c.gear_required, c.gear_recommended, c.beginner_friendly, c.good_for, c.spoken_aliases, c.description);
  }
  const ins = db.prepare(`INSERT INTO classes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of sched) {
    const s = normStudio(r.studio);
    const sub = /^SUB:\s*/i.test(r.instructor);
    ins.run(r.class_id, r.date, r.weekday, r.start_time, r.start_iso, r.end_iso || null, r.class_name, s.studio, s.note,
      r.instructor.replace(/^SUB:\s*/i, '') || null, sub ? 1 : 0, intOrNull(r.capacity), intOrNull(r.seats_booked),
      intOrNull(r.seats_left), intOrNull(r.waitlist), r.status, r.booking_opens_iso, r.priority_booking_opens_iso,
      r.schedule_basis, r.holiday_note || null, r.demo_pinned ? 1 : 0);
  }
  db.exec('COMMIT');
}

const FIRST = ['Jordan','Priya','Marcus','Elena','Tom','Aisha','Danny','Sophie','Chris','Mei','Ben','Hannah','Luis','Nora'];
const LAST = ['Test','Nair','Bell','Rossi','Kowalski','Khan','Ortiz','Laurent','Walker','Tanaka','Alvarez','Park','Mendez','Fischer'];

function nextClass(name, fromDate, hhmm) {
  // First upcoming class of this type on/after fromDate, at the given 24h time if possible.
  const now = new Date().toISOString();
  const rows = db.prepare(`SELECT * FROM classes WHERE class_name = ? AND date >= ? AND status != 'holiday_unconfirmed' ORDER BY date, start_iso LIMIT 40`).all(name, fromDate)
    .filter(r => Date.parse(r.start_iso) > Date.parse(now));
  if (hhmm) { const hit = rows.find(r => r.start_iso.slice(11, 16) === hhmm); if (hit) return hit; }
  return rows[0] || null;
}

function seedRequests() {
  const today = etDate();
  const now = Date.now();
  const ago = min => etISO(new Date(now - min * 60000));
  const mk = (i, minsAgo, cls, o) => ({
    request_type: cls ? 'booking' : 'inquiry', created_at: ago(minsAgo), class: cls,
    caller_name: `${FIRST[i]} ${LAST[i]}`, caller_phone: `860-555-01${String(i + 1).padStart(2, '0')}`,
    is_member: 'no', membership_tier: '', experience_level: '', goals: '', questions_asked: '', call_summary: '',
    needs_followup: 'no', followup_reason: '', status: 'pending', staff_notes: '', source: 'voice_agent', ...o
  });
  const seeds = [
    mk(0, 95, nextClass('Yoga Restore', today, '09:15'), { caller_name: 'Jordan Test', experience_level: 'new to yoga', goals: 'relaxation', questions_asked: 'parking; mat rental', call_summary: 'New caller wanted Saturday yoga; none on Saturday. Chose Sunday 9:15 AM Yoga Restore. Asked about parking and mats (both unpublished). Interested in a free trial.', needs_followup: 'yes', followup_reason: 'confirm trial offer; parking question' }),
    mk(1, 180, nextClass('Reform', addDays(today, 1), '09:00'), { experience_level: 'intermediate', goals: 'strength; posture', call_summary: 'Wants the 9:00 AM Reform. Asked to be waitlisted if full.', needs_followup: 'yes', followup_reason: 'waitlist check' }),
    mk(2, 420, nextClass('Box x Bags', addDays(today, 1), null), { is_member: 'yes', membership_tier: 'Standard Plus', experience_level: 'intermediate', goals: 'cardio; stress relief', call_summary: 'Member booking Box x Bags. Asked about glove rental ($5).', status: 'confirmed', seat_counted: 1, source: 'voice_agent' }),
    mk(3, 55, nextClass('Hot Pilates', addDays(today, 1), '08:00'), { experience_level: 'beginner', goals: 'core; toning', questions_asked: 'how hot is the room', call_summary: 'First-timer interested in Hot Pilates. Told it runs up to about 85F and grip socks are encouraged.' }),
    mk(4, 240, null, { is_member: 'yes', membership_tier: 'Standard', questions_asked: 'freeze cost; Thanksgiving hours', call_summary: 'Member asked how much it costs to freeze and whether the club is open on Thanksgiving. Holiday hours are not published.', needs_followup: 'yes', followup_reason: 'confirm holiday hours' }),
    mk(5, 600, nextClass('CS4', addDays(today, 1), '06:05'), { is_member: 'yes', membership_tier: 'Standard', experience_level: 'advanced', goals: 'full body', call_summary: 'Regular booking CS4 at 6:05 AM.', status: 'confirmed', seat_counted: 1 }),
    mk(6, 900, nextClass('Ride', addDays(today, 2), null), { experience_level: 'beginner', goals: 'cardio', call_summary: 'Asked about spin. Booked Ride, then called back to cancel.', status: 'cancelled', staff_notes: 'Caller cancelled by phone.' }),
    mk(7, 1300, null, { questions_asked: 'guest passes; free trial', call_summary: 'Prospective member asked which trial offer applies and how guest passes work. Needs staff to confirm the offer.', needs_followup: 'yes', followup_reason: 'confirm which trial offer applies', source: 'website' }),
    mk(8, 30, nextClass('Reform', addDays(today, 2), '07:00'), { experience_level: 'new to Reform', goals: 'low impact', questions_asked: 'parking', call_summary: 'Wants a 7:00 AM Reform. Asked about parking (not published).', needs_followup: 'yes', followup_reason: 'parking question' }),
    mk(9, 2100, nextClass('Hot Pilates X Strength', addDays(today, 2), null), { is_member: 'yes', membership_tier: 'Premier', experience_level: 'advanced', goals: 'strength; sweat', call_summary: 'Premier member booked a heated strength class.', status: 'confirmed', seat_counted: 1 }),
    mk(10, 1500, null, { questions_asked: 'mat rental; towel service', call_summary: 'Asked whether yoga mats are provided. Not published; towel service is available.', needs_followup: 'yes', followup_reason: 'confirm mat availability' }),
    mk(11, 15, nextClass('Sound Bath Bliss + Stretch', today, null), { experience_level: 'beginner', goals: 'relaxation; recovery', call_summary: 'Interested in the Sunday sound bath. Class length is not published.', source: 'website' }),
  ];
  db.exec('BEGIN');
  db.exec('DELETE FROM requests; DELETE FROM activity;');
  const seq = {};
  for (const s of seeds.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const day = s.created_at.slice(0, 10).replaceAll('-', '');
    seq[day] = (seq[day] || 0) + 1;
    const c = s.class;
    const seatText = c ? `${c.status} (${c.seats_left ?? 'n/a'})` : '';
    const actMsg = `${s.request_type === 'booking' ? 'New booking request' : 'New inquiry'} from ${s.caller_name}: ${c ? `${c.class_name}, ${shortWhen(c.date, c.start_time)}` : 'question for staff'}`;
    db.prepare('INSERT INTO activity (ts,type,request_id,message,meta) VALUES (?,?,?,?,?)').run(s.created_at, 'request_received', `REQ-${day}-${String(seq[day]).padStart(4, '0')}`, actMsg, JSON.stringify({ source: s.source, seeded: true }));
    db.prepare(`INSERT INTO requests (request_id,created_at,updated_at,request_type,caller_name,caller_phone,is_member,membership_tier,class_id,class_name,class_start_iso,seat_status_at_request,experience_level,goals,questions_asked,call_summary,needs_followup,followup_reason,status,staff_notes,source,call_id,seat_counted) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(`REQ-${day}-${String(seq[day]).padStart(4, '0')}`, s.created_at, s.created_at, s.request_type, s.caller_name, s.caller_phone, s.is_member, s.membership_tier,
        c?.class_id ?? null, c?.class_name ?? null, c?.start_iso ?? null, seatText, s.experience_level, s.goals, s.questions_asked, s.call_summary,
        s.needs_followup, s.followup_reason, s.status, s.staff_notes, s.source, null, s.seat_counted || 0);
  }
  db.exec('COMMIT');
}

export function initDb() {
  const n = db.prepare('SELECT COUNT(*) AS n FROM classes').get().n;
  if (!n) { seedClassesAndCatalog(); seedRequests(); addActivity('system', null, 'Demo data loaded'); }
  else if (!db.prepare('SELECT COUNT(*) AS n FROM requests').get().n && !db.prepare('SELECT COUNT(*) AS n FROM activity').get().n) seedRequests();
}

export function resetDemo() {
  seedClassesAndCatalog();
  seedRequests();
  addActivity('system', null, 'Demo data reset to the starting state');
  publish('reset', { at: etISO() });
}

// ---------- activity ----------
export function addActivity(type, requestId, message, meta = null) {
  const ts = etISO();
  const info = db.prepare('INSERT INTO activity (ts,type,request_id,message,meta) VALUES (?,?,?,?,?)').run(ts, type, requestId, message, meta ? JSON.stringify(meta) : null);
  const row = { id: Number(info.lastInsertRowid), ts, type, request_id: requestId, message, meta };
  publish('activity', row);
  return row;
}
export function listActivity(limit = 50) {
  return db.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT ?').all(limit).map(r => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null }));
}

// ---------- classes ----------
const catalogCols = `c.intensity, c.impact, c.heated, c.heat_detail, c.gear_required, c.gear_recommended, c.beginner_friendly, c.good_for, c.description, c.duration_min, c.duration_basis`;
export function listClasses({ from, to, type, studio } = {}) {
  const where = [], args = [];
  if (from) { where.push('k.date >= ?'); args.push(from); }
  if (to) { where.push('k.date <= ?'); args.push(to); }
  if (type) { where.push('k.class_name = ?'); args.push(type); }
  if (studio) { where.push('k.studio = ?'); args.push(studio); }
  const sql = `SELECT k.*, ${catalogCols} FROM classes k LEFT JOIN catalog c ON c.class_name = k.class_name ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY k.start_iso, k.class_name`;
  return db.prepare(sql).all(...args);
}
export function getClass(id) {
  return db.prepare(`SELECT k.*, ${catalogCols} FROM classes k LEFT JOIN catalog c ON c.class_name = k.class_name WHERE k.class_id = ?`).get(id) || null;
}
export function listCatalog() { return db.prepare('SELECT * FROM catalog ORDER BY studio, class_name').all(); }

function setSeats(classId, { seatsDelta = 0, waitDelta = 0 }) {
  const c = db.prepare('SELECT * FROM classes WHERE class_id = ?').get(classId);
  if (!c || c.seats_left == null) return null;
  const seatsLeft = Math.max(0, Math.min(c.capacity, c.seats_left - seatsDelta));
  const booked = Math.max(0, c.capacity - seatsLeft);
  const waitlist = Math.max(0, (c.waitlist || 0) + waitDelta);
  db.prepare('UPDATE classes SET seats_left=?, seats_booked=?, waitlist=?, status=? WHERE class_id=?').run(seatsLeft, booked, waitlist, seatStatus(seatsLeft), classId);
  return getClass(classId);
}

// ---------- requests ----------
export function getRequest(id) { return db.prepare('SELECT * FROM requests WHERE request_id = ?').get(id) || null; }
export function findByCallId(callId) { return callId ? db.prepare('SELECT * FROM requests WHERE call_id = ? ORDER BY created_at DESC LIMIT 1').get(callId) || null : null; }

function nextRequestId(createdIso) {
  const day = createdIso.slice(0, 10).replaceAll('-', '');
  const last = db.prepare(`SELECT request_id FROM requests WHERE request_id LIKE ? ORDER BY request_id DESC LIMIT 1`).get(`REQ-${day}-%`);
  const n = last ? Number(last.request_id.split('-')[2]) + 1 : 1;
  return `REQ-${day}-${String(n).padStart(4, '0')}`;
}

const REQ_FIELDS = ['request_type','caller_name','caller_phone','is_member','membership_tier','class_id','class_name','class_start_iso','seat_status_at_request','experience_level','goals','questions_asked','call_summary','needs_followup','followup_reason','status','staff_notes','source','call_id'];

export function insertRequest(data) {
  const created = etISO();
  const id = nextRequestId(created);
  const row = { needs_followup: 'no', status: 'pending', request_type: 'booking', ...data };
  db.prepare(`INSERT INTO requests (request_id,created_at,updated_at,${REQ_FIELDS.join(',')},seat_counted) VALUES (?,?,?,${REQ_FIELDS.map(() => '?').join(',')},0)`)
    .run(id, created, created, ...REQ_FIELDS.map(f => row[f] ?? null));
  const rec = getRequest(id);
  publish('request.created', rec);
  return rec;
}

export function patchRequest(id, patch) {
  const cur = getRequest(id);
  if (!cur) return null;
  const sets = [], args = [];
  for (const f of REQ_FIELDS) if (f in patch && f !== 'status') { sets.push(`${f}=?`); args.push(patch[f] ?? null); }
  if (sets.length) db.prepare(`UPDATE requests SET ${sets.join(',')}, updated_at=? WHERE request_id=?`).run(...args, etISO(), id);
  return getRequest(id);
}

// Staff status changes, with seat bookkeeping. Returns { request, classRow, note }.
export function setRequestStatus(id, status) {
  const r = getRequest(id);
  if (!r) return null;
  let finalStatus = status, note = '';
  let counted = r.seat_counted;
  db.exec('BEGIN');
  try {
    // Release whatever this request currently holds.
    if (r.class_id && counted === 1) setSeats(r.class_id, { seatsDelta: -1 });
    if (r.class_id && counted === 2) setSeats(r.class_id, { waitDelta: -1 });
    counted = 0;
    if (status === 'confirmed' && r.class_id) {
      const c = db.prepare('SELECT seats_left, status FROM classes WHERE class_id=?').get(r.class_id);
      if (c && c.seats_left == null) { note = 'Holiday schedule unconfirmed; no seat held.'; }
      else if (c && c.seats_left > 0) { setSeats(r.class_id, { seatsDelta: 1 }); counted = 1; }
      else if (c) { setSeats(r.class_id, { waitDelta: 1 }); counted = 2; finalStatus = 'waitlisted'; note = 'Class is full; added to the waitlist.'; }
    } else if (status === 'waitlisted' && r.class_id) {
      setSeats(r.class_id, { waitDelta: 1 }); counted = 2;
    }
    db.prepare('UPDATE requests SET status=?, seat_counted=?, updated_at=? WHERE request_id=?').run(finalStatus, counted, etISO(), id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  const request = getRequest(id);
  const classRow = r.class_id ? getClass(r.class_id) : null;
  return { request, classRow, note };
}

export function listRequests({ status, type, q, followup, limit = 200 } = {}) {
  const where = [], args = [];
  if (status && status !== 'all') { where.push('status = ?'); args.push(status); }
  if (type && type !== 'all') { where.push('request_type = ?'); args.push(type); }
  if (followup === 'yes') where.push(`needs_followup = 'yes'`);
  if (q) {
    where.push(`(caller_name LIKE ? OR caller_phone LIKE ? OR class_name LIKE ? OR questions_asked LIKE ? OR call_summary LIKE ? OR request_id LIKE ?)`);
    for (let i = 0; i < 6; i++) args.push(`%${q}%`);
  }
  return db.prepare(`SELECT * FROM requests ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, request_id DESC LIMIT ?`).all(...args, limit);
}

export function stats() {
  const today = etDate();
  const g = sql => db.prepare(sql).get();
  return {
    total: g('SELECT COUNT(*) n FROM requests').n,
    today: g(`SELECT COUNT(*) n FROM requests WHERE substr(created_at,1,10) = '${today}'`).n,
    pending: g(`SELECT COUNT(*) n FROM requests WHERE status='pending'`).n,
    confirmed: g(`SELECT COUNT(*) n FROM requests WHERE status='confirmed'`).n,
    waitlisted: g(`SELECT COUNT(*) n FROM requests WHERE status='waitlisted'`).n,
    followup: g(`SELECT COUNT(*) n FROM requests WHERE needs_followup='yes' AND status NOT IN ('cancelled','resolved')`).n,
    voice: g(`SELECT COUNT(*) n FROM requests WHERE source='voice_agent'`).n,
    bookings: g(`SELECT COUNT(*) n FROM requests WHERE request_type='booking'`).n,
    inquiries: g(`SELECT COUNT(*) n FROM requests WHERE request_type='inquiry'`).n
  };
}
