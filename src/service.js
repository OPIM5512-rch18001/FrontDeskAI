import {
  db, getClass, getRequest, findByCallId, insertRequest, patchRequest, setRequestStatus,
  addActivity, listClasses
} from './db.js';
import { resolveClass, describeClass } from './matcher.js';
import { etDate, etISO, prettyDate, addDays, shortWhen } from './time.js';
import { publish } from './events.js';

// ---------- normalizing whatever Retell (or a person with curl) sends ----------
const snake = k => String(k).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[\s-]+/g, '_').toLowerCase();
const ALIASES = {
  name: 'caller_name', customer_name: 'caller_name', full_name: 'caller_name', caller: 'caller_name',
  phone: 'caller_phone', phone_number: 'caller_phone', customer_phone: 'caller_phone', caller_number: 'caller_phone',
  class: 'class_name', preferred_class: 'class_name', class_type: 'class_name', class_requested: 'class_name',
  date: 'class_date', preferred_date: 'class_date', class_day: 'class_date', day: 'class_date',
  time: 'class_time', preferred_time: 'class_time', class_start_time: 'class_time', start_time: 'class_time',
  question: 'questions_asked', questions: 'questions_asked', summary: 'call_summary', notes: 'call_summary',
  member: 'is_member', tier: 'membership_tier', experience: 'experience_level', goal: 'goals',
  followup: 'needs_followup', follow_up: 'needs_followup', needs_follow_up: 'needs_followup', followup_needed: 'needs_followup'
};

const str = v => (v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v).trim());
const yesNo = v => (/^(y|yes|true|1)$/i.test(str(v)) ? 'yes' : 'no');

export function normalizePayload(body = {}) {
  const raw = body && typeof body === 'object' ? body : {};
  const argsObj = raw.args && typeof raw.args === 'object' ? raw.args : raw;
  const out = {};
  for (const [k, v] of Object.entries(argsObj)) {
    if (k === 'call' || k === 'args') continue;
    const key = snake(k);
    out[ALIASES[key] || key] = v;
  }
  const call = raw.call && typeof raw.call === 'object' ? raw.call : {};
  const p = {};
  for (const f of ['caller_name','caller_phone','class_id','class_name','class_date','class_time','membership_tier','experience_level','goals','questions_asked','call_summary','followup_reason','staff_notes']) p[f] = str(out[f]);
  p.is_member = out.is_member === undefined ? '' : yesNo(out.is_member);
  p.needs_followup = out.needs_followup === undefined ? '' : yesNo(out.needs_followup);
  p.call_id = str(out.call_id || call.call_id);
  if (!p.caller_phone && call.from_number) p.caller_phone = str(call.from_number);
  if (!p.call_summary && call.call_analysis?.call_summary) p.call_summary = str(call.call_analysis.call_summary);
  return p;
}

// ---------- create / update a request ----------
function classInfo(c) {
  return {
    class_id: c.class_id, class_name: c.class_name, date: c.date, weekday: c.weekday, start_time: c.start_time,
    studio: c.studio, instructor: c.instructor, seats_left: c.seats_left, waitlist: c.waitlist, status: c.status
  };
}
function seatText(c) {
  if (c.seats_left == null) return 'schedule unconfirmed';
  return c.seats_left === 0 ? `full (${c.waitlist || 0} waitlisted)` : `${c.status} (${c.seats_left})`;
}

export function submitRequest(body, { source = 'voice_agent' } = {}) {
  const p = normalizePayload(body);
  if (!p.caller_name) {
    return { http: 200, body: { success: false, needs_clarification: true, message: "I still need the caller's name before I can save this request. Please ask for it, then submit again." } };
  }
  const existing = findByCallId(p.call_id);
  const wantsClass = p.class_id || p.class_name;
  const res = wantsClass ? resolveClass(p) : { kind: 'none', reason: '' };

  const followupReasons = [];
  const rec = {
    caller_name: p.caller_name, caller_phone: p.caller_phone || null, is_member: p.is_member || 'no',
    membership_tier: p.membership_tier || null, experience_level: p.experience_level || null, goals: p.goals || null,
    questions_asked: p.questions_asked || null, call_summary: p.call_summary || null, source
  };
  if (p.call_id) rec.call_id = p.call_id;
  let message, extra = {}, success = true;

  if (res.kind === 'matched') {
    const c = res.cls;
    Object.assign(rec, { request_type: 'booking', class_id: c.class_id, class_name: c.class_name, class_start_iso: c.start_iso, seat_status_at_request: seatText(c) });
    const when = describeClass(c);
    if (c.seats_left === 0) {
      followupReasons.push('class is full: waitlist request');
      message = `Saved a request for ${when}. That class is currently full with ${c.waitlist || 0} on the waitlist, so staff will follow up about the waitlist. This is a request only, not a confirmed booking.`;
    } else {
      message = `Saved a booking request for ${when}. There ${c.seats_left === 1 ? 'is 1 spot' : `are ${c.seats_left} spots`} left right now. A staff member will confirm it; this is a request, not a confirmed booking.`;
    }
    extra.class = classInfo(c);
  } else {
    rec.request_type = 'inquiry';
    const asked = [p.class_name, p.class_date, p.class_time].filter(Boolean).join(' ');
    if (wantsClass && res.kind === 'past') {
      followupReasons.push('requested class has already started');
      message = `${describeClass(res.cls)} has already started, so I couldn't request it. Offer the caller another class. I saved the call as an inquiry for staff.`;
    } else if (wantsClass && res.kind === 'holiday') {
      Object.assign(rec, { class_id: res.cls.class_id, class_name: res.cls.class_name, class_start_iso: res.cls.start_iso, seat_status_at_request: 'schedule unconfirmed' });
      followupReasons.push(`holiday schedule unconfirmed (${res.cls.holiday_note})`);
      message = `The ${res.cls.holiday_note} schedule hasn't been confirmed, so I can't hold a spot. I saved it as an inquiry and staff will follow up.`;
    } else if (wantsClass && res.kind === 'ambiguous') {
      followupReasons.push(`caller needs to pick a class time (${asked})`);
      const options = res.options.slice(0, 6).map(classInfo);
      extra.options = options;
      success = false; extra.needs_clarification = true;
      message = `${res.reason} Ask the caller which one they want: ${options.map(o => `${o.start_time} ${o.class_name} (${o.seats_left ?? 'n/a'} spots left)`).join('; ')}. I saved a placeholder inquiry; submit again with the chosen time and it will update the same request.`;
    } else if (wantsClass) {
      followupReasons.push(`couldn't match a class (${asked})`);
      success = false; extra.needs_clarification = true;
      message = `${res.reason} Ask the caller for the class name and date, then submit again. I saved a placeholder inquiry that will be updated.`;
    } else {
      message = 'Saved the caller\'s question for staff to review. No class was booked.';
    }
  }

  const reasonText = [p.followup_reason, ...followupReasons].filter(Boolean).join('; ');
  rec.needs_followup = (p.needs_followup === 'yes' || followupReasons.length || (p.questions_asked && res.kind === 'none' && !wantsClass)) ? 'yes' : (p.needs_followup || 'no');
  rec.followup_reason = reasonText || null;

  let saved, created;
  if (existing) {
    const merged = {};
    for (const [k, v] of Object.entries(rec)) if (v !== null && v !== '' ) merged[k] = v;
    // A resubmission replaces the follow-up flag so a resolved ambiguity stops showing as needing follow-up.
    merged.needs_followup = rec.needs_followup;
    merged.followup_reason = rec.followup_reason;
    saved = patchRequest(existing.request_id, merged);
    created = false;
    if (existing.seat_counted && rec.class_id && rec.class_id !== existing.class_id) setRequestStatus(existing.request_id, 'pending');
    saved = getRequest(existing.request_id);
    publish('request.updated', saved);
  } else {
    saved = insertRequest(rec);
    created = true;
  }

  const who = saved.caller_name;
  const label = saved.class_id ? `${saved.class_name}, ${shortWhen(saved.class_start_iso.slice(0, 10), getClass(saved.class_id)?.start_time)}` : 'question for staff';
  addActivity(created ? 'request_received' : 'request_updated', saved.request_id,
    `${created ? 'New' : 'Updated'} ${saved.request_type === 'booking' ? 'booking request' : 'inquiry'} from ${who}: ${label}`,
    { source, status: saved.status });

  return { http: 200, body: { success, request_id: saved.request_id, request_type: saved.request_type, status: saved.status, updated_existing: !created, message, ...extra }, record: saved, created };
}

// ---------- staff actions ----------
export function staffUpdate(id, patch) {
  const cur = getRequest(id);
  if (!cur) return null;
  const allowedStatus = ['pending', 'confirmed', 'waitlisted', 'cancelled', 'resolved'];
  const fields = {};
  if ('staff_notes' in patch) fields.staff_notes = str(patch.staff_notes);
  if ('needs_followup' in patch) fields.needs_followup = yesNo(patch.needs_followup);
  if (Object.keys(fields).length) patchRequest(id, fields);
  let note = '';
  if (patch.status && allowedStatus.includes(patch.status) && patch.status !== cur.status) {
    const r = setRequestStatus(id, patch.status);
    note = r.note;
    addActivity('status_changed', id, `${cur.caller_name}'s ${cur.request_type === 'booking' ? 'booking' : 'inquiry'} marked ${r.request.status}${note ? ` (${note})` : ''}`, { from: cur.status, to: r.request.status });
    if (r.classRow) publish('class.updated', r.classRow);
  } else if (Object.keys(fields).length) {
    addActivity('note_updated', id, `Staff updated details on ${cur.caller_name}'s request`);
  }
  const request = getRequest(id);
  publish('request.updated', request);
  return { request, note, class: request.class_id ? getClass(request.class_id) : null };
}

// ---------- simulation (no real phone call needed) ----------
const SIM_NAMES = ['Riley Chen', 'Sam Okafor', 'Avery Johnson', 'Maya Patel', 'Jamie Rivera', 'Taylor Brooks', 'Noah Kim', 'Lena Schmidt', 'Omar Haddad', 'Grace Sullivan'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const fakePhone = () => `860-555-01${String(Math.floor(Math.random() * 90) + 10)}`;

function upcoming(filterFn) {
  const today = etDate();
  const now = Date.now();
  const horizon = addDays(today, 10);
  return listClasses({ from: today, to: horizon }).filter(c => Date.parse(c.start_iso) > now + 3600e3 && c.seats_left != null && filterFn(c));
}

export function buildSimulation(kind = 'booking') {
  const name = pick(SIM_NAMES), phone = fakePhone();
  const base = { caller_name: name, caller_phone: phone };
  if (kind === 'inquiry') {
    return { ...base, questions_asked: pick(['Is there parking at the club?', 'Are yoga mats provided?', 'What are the hours on Thanksgiving?', 'How much is personal training?']), call_summary: 'Caller asked a question the website does not answer. Needs staff follow-up.', needs_followup: 'yes' };
  }
  if (kind === 'full') {
    const c = pick(upcoming(c => c.seats_left === 0).concat(upcoming(c => c.seats_left <= 2))) || pick(upcoming(() => true));
    return { ...base, class_id: c.class_id, experience_level: 'intermediate', goals: 'strength', call_summary: `Caller wants ${c.class_name} at ${c.start_time}. Class is full; wants the waitlist.`, needs_followup: 'yes' };
  }
  const c = pick(upcoming(c => c.seats_left > 3 && !c.holiday_note));
  return { ...base, class_id: c.class_id, is_member: pick(['yes', 'no']), experience_level: pick(['beginner', 'intermediate', 'advanced']), goals: pick(['cardio', 'strength', 'relaxation', 'toning']), call_summary: `Caller booked ${c.class_name} at ${c.start_time} on ${prettyDate(c.date)}.` };
}

export function runSimulation(kind, { instant = false } = {}) {
  const payload = buildSimulation(kind);
  const callId = `sim_${Date.now().toString(36)}`;
  const phone = payload.caller_phone;
  addActivity('call_started', null, `Incoming call from ${phone} (simulated)`, { call_id: callId, simulated: true });
  const finish = () => submitRequest({ ...payload, call_id: callId }, { source: 'simulation' });
  if (instant) return { call_id: callId, result: finish().body };
  setTimeout(() => addActivity('call_progress', null, 'FrontDesk AI is collecting caller details…', { call_id: callId, simulated: true }), 1800);
  setTimeout(finish, 3800);
  return { call_id: callId, scheduled: true, payload };
}

// ---------- Retell lifecycle webhook (optional) ----------
export function handleRetellEvent(body) {
  const { event, call = {} } = body || {};
  if (!event) return;
  const who = call.from_number || 'unknown number';
  if (event === 'call_started') addActivity('call_started', null, `Incoming call from ${who}`, { call_id: call.call_id });
  else if (event === 'call_ended') addActivity('call_ended', null, `Call from ${who} ended`, { call_id: call.call_id });
  else if (event === 'call_analyzed') {
    const existing = findByCallId(call.call_id);
    const summary = call.call_analysis?.call_summary;
    if (existing && summary && !existing.call_summary) {
      patchRequest(existing.request_id, { call_summary: summary });
      publish('request.updated', getRequest(existing.request_id));
    }
    addActivity('call_analyzed', existing?.request_id || null, `Call summary ready${existing ? ` for ${existing.caller_name}` : ''}`, { call_id: call.call_id });
  }
}
