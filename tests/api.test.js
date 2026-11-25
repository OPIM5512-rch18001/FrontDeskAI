import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const procs = [];

async function start(port, env = {}) {
  const db = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fd-')), 'test.db');
  const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], { cwd: root, env: { ...process.env, PORT: String(port), DB_PATH: db, ...env }, stdio: 'ignore' });
  procs.push(p);
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return `http://127.0.0.1:${port}`; } catch {} await new Promise(r => setTimeout(r, 150)); }
  throw new Error('server did not start');
}
after(() => procs.forEach(p => p.kill()));

const post = (base, url, body, headers = {}) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: r.status === 204 ? null : await r.json() }));
const patch = (base, url, body) => fetch(base + url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
const get = (base, url) => fetch(base + url).then(r => r.json());

let base, upcoming;
before(async () => {
  base = await start(3901);
  const today = (await get(base, '/api/config')).today;
  const all = await get(base, `/api/classes?from=${today}`);
  upcoming = all.filter(c => Date.parse(c.start_iso) > Date.now() + 3600e3 && c.seats_left != null);
});

test('health and config', async () => {
  assert.equal((await get(base, '/api/health')).ok, true);
  const c = await get(base, '/api/config');
  assert.equal(c.phoneConfigured, true);
  assert.equal(c.phone, '(860) 750-8999');
});

test('availability can suggest open classes for a day without a class preference', async () => {
  const c = upcoming.find(x => x.seats_left > 0);
  const r = await post(base, '/api/availability', { args: { class_date: c.date } });
  assert.equal(r.status, 200);
  assert.equal(r.body.result, 'options');
  assert.ok(r.body.options.length > 0 && r.body.options.length <= 2);
  assert.ok(r.body.options.every(option => option.date === c.date && option.seats_left > 0));
  const past = await post(base, '/api/availability', { class_date: '2000-01-01' });
  assert.equal(past.body.result, 'none');
});

test('flat payload creates a pending booking request for the matched class', async () => {
  const c = upcoming.find(x => x.class_name === 'Reform' && x.seats_left > 2);
  const r = await post(base, '/api/bookings', { caller_name: 'Test One', caller_phone: '860-555-0001', class_name: 'reformer', class_date: c.date, class_time: c.start_time });
  assert.equal(r.status, 200); assert.equal(r.body.success, true);
  assert.equal(r.body.status, 'pending'); assert.equal(r.body.request_type, 'booking');
  assert.equal(r.body.class.class_id, c.class_id);
  assert.match(r.body.message, /not a confirmed booking/);
});

test('Retell-wrapped payload (name/args/call) works and a repeat call_id updates the same request', async () => {
  const c = upcoming.find(x => x.class_name === 'Box x Bags');
  const wrap = args => ({ name: 'submit_booking_request', args, call: { call_id: 'call_t1', from_number: '+18605550123' } });
  const first = await post(base, '/api/bookings', wrap({ caller_name: 'Wrapped', class_name: 'boxing', class_date: c.date }));
  const same = upcoming.filter(x => x.class_name === 'Box x Bags' && x.date === c.date);
  if (same.length > 1) { assert.equal(first.body.success, false); assert.equal(first.body.needs_clarification, true); assert.ok(first.body.options.length > 1); }
  const pick = same[0];
  const second = await post(base, '/api/bookings', wrap({ caller_name: 'Wrapped', class_name: 'boxing', class_date: pick.date, class_time: pick.start_time }));
  assert.equal(second.body.success, true); assert.equal(second.body.updated_existing, true);
  assert.equal(second.body.request_id, first.body.request_id);
  const rec = await get(base, '/api/requests/' + second.body.request_id);
  assert.equal(rec.caller_phone, '+18605550123');       // taken from the call object
  assert.equal(rec.needs_followup, 'no');               // resolved ambiguity clears the flag
  assert.equal(rec.request_type, 'booking');
});

test('camelCase / alias field names are accepted', async () => {
  const c = upcoming.find(x => x.class_name === 'CS4');
  const r = await post(base, '/api/bookings', { callerName: 'Alias Person', phoneNumber: '860-555-0002', preferredClass: 'circuit', preferredDate: c.date, preferredTime: c.start_time });
  assert.equal(r.body.success, true); assert.equal(r.body.class.class_name, 'CS4');
});

test('a class that already started is saved as an inquiry, not a booking', async () => {
  const past = (await get(base, '/api/classes?from=2026-11-06&to=2026-11-06'))[0];
  const r = await post(base, '/api/bookings', { caller_name: 'Late Larry', class_id: past.class_id });
  assert.equal(r.body.request_type, 'inquiry'); assert.match(r.body.message, /already started/);
});

test('missing caller name asks the agent for it and saves nothing', async () => {
  const before = (await get(base, '/api/stats')).total;
  const r = await post(base, '/api/bookings', { class_name: 'Reform' });
  assert.equal(r.body.success, false);
  assert.equal((await get(base, '/api/stats')).total, before);
});

test('question-only request is saved as an inquiry for staff', async () => {
  const r = await post(base, '/api/bookings', { caller_name: 'Q Asker', questions_asked: 'Is there parking?' });
  assert.equal(r.body.request_type, 'inquiry'); assert.equal(r.body.success, true);
  const rec = await get(base, '/api/requests/' + r.body.request_id);
  assert.equal(rec.needs_followup, 'yes');
});

test('staff confirm reduces seats, cancel restores them; full class goes to the waitlist', async () => {
  const c = upcoming.find(x => x.class_name === 'CS4' && x.seats_left > 4);
  const r = await post(base, '/api/bookings', { caller_name: 'Seat Tester', class_id: c.class_id });
  const id = r.body.request_id;
  let out = await patch(base, '/api/requests/' + id, { status: 'confirmed' });
  assert.equal(out.request.status, 'confirmed'); assert.equal(out.class.seats_left, c.seats_left - 1);
  out = await patch(base, '/api/requests/' + id, { status: 'cancelled' });
  assert.equal(out.class.seats_left, c.seats_left);

  const full = upcoming.find(x => x.seats_left === 0);
  if (full) {
    const f = await post(base, '/api/bookings', { caller_name: 'Waiter', class_id: full.class_id });
    assert.match(f.body.message, /full/);
    const o = await patch(base, '/api/requests/' + f.body.request_id, { status: 'confirmed' });
    assert.equal(o.request.status, 'waitlisted'); assert.equal(o.class.waitlist, (full.waitlist || 0) + 1);
  }
});

test('simulate (instant) creates a request tagged as simulation', async () => {
  const r = await post(base, '/api/simulate', { kind: 'booking', instant: true });
  assert.equal(r.body.result.success, true);
  const rec = await get(base, '/api/requests/' + r.body.result.request_id);
  assert.equal(rec.source, 'simulation');
});

test('live stream pushes new requests', async () => {
  const res = await fetch(base + '/api/stream');
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  await post(base, '/api/bookings', { caller_name: 'Stream Test', questions_asked: 'hello' });
  const t0 = Date.now();
  while (!buf.includes('event: request.created') && Date.now() - t0 < 4000) { const { value } = await reader.read(); buf += dec.decode(value); }
  await reader.cancel();
  assert.match(buf, /event: request\.created/); assert.match(buf, /Stream Test/);
});

test('reset restores seat counts and sample data', async () => {
  await post(base, '/api/admin/reset', {});
  const s = await get(base, '/api/stats');
  assert.equal(s.total, 12);
  const c = upcoming.find(x => x.class_name === 'CS4' && x.seats_left > 4);
  assert.equal((await get(base, '/api/classes/' + c.class_id)).seats_left, c.seats_left);
});

test('API key is enforced on agent endpoints only when API_KEY is set', async () => {
  const b2 = await start(3902, { API_KEY: 'secret123' });
  const body = { caller_name: 'Keyed', questions_asked: 'hi' };
  assert.equal((await post(b2, '/api/bookings', body)).status, 401);
  assert.equal((await post(b2, '/api/bookings', body, { 'x-api-key': 'wrong' })).status, 401);
  assert.equal((await post(b2, '/api/bookings', body, { 'x-api-key': 'secret123' })).status, 200);
  assert.equal((await post(b2, '/api/bookings', body, { authorization: 'Bearer secret123' })).status, 200);
  assert.equal((await post(b2, '/api/bookings?api_key=secret123', body)).status, 200);
  assert.equal((await post(b2, '/api/website/requests', body)).status, 200);   // website form needs no key
  assert.equal((await get(b2, '/api/config')).apiKeyRequired, true);
});

test('static pages are served, and unknown API paths 404', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/css/base.css')).status, 200);
  assert.equal((await fetch(base + '/api/nope')).status, 404);
  assert.equal((await fetch(base + '/../server.js')).status === 200, false);
});

test('Retell-only listener shares the staff database and excludes staff routes', async () => {
  const key = 'integration-test-key';
  const local = await start(3903, { API_KEY: key, RETELL_PORT: '3904' });
  const agent = 'http://127.0.0.1:3904';
  const payload = { args: { caller_name: 'Demo Caller', caller_phone: '860-555-0142', questions_asked: 'Do you offer parking?' }, call: { call_id: 'demo-call-1' } };
  assert.equal((await fetch(agent + '/api/requests', { headers: { 'x-api-key': key } })).status, 404);
  assert.equal((await fetch(agent + '/api/admin/reset', { method: 'POST', headers: { 'x-api-key': key } })).status, 404);
  assert.equal((await fetch(agent + '/')).status, 404);
  assert.equal((await fetch(agent + '/api/bookings', { method: 'POST' })).status, 401);
  const first = await post(agent, '/api/bookings', payload, { 'x-api-key': key });
  assert.equal(first.body.status, 'pending');
  const repeat = await post(agent, '/api/bookings', payload, { 'x-api-key': key });
  assert.equal(repeat.body.request_id, first.body.request_id);
  assert.equal((await get(local, '/api/requests/' + first.body.request_id)).caller_name, 'Demo Caller');
});

test('public visitors see customer pages and signed-in staff share the same requests', async () => {
  const host = await start(3905, { STAFF_PASSWORD: 'password', API_KEY: 'test-agent-key' });
  assert.equal((await fetch(host)).status, 200);
  assert.equal((await fetch(host + '/api/classes')).status, 200);
  assert.deepEqual(await get(host, '/api/staff/session'), { signedIn: false });
  for (const route of ['/api/requests', '/api/stats', '/api/activity', '/api/stream']) {
    assert.equal((await fetch(host + route)).status, 401);
  }
  assert.equal((await post(host, '/api/admin/reset', {})).status, 401);
  assert.equal((await post(host, '/api/staff/session', { password: 'wrong' })).status, 401);

  const signIn = async () => {
    const res = await fetch(host + '/api/staff/session', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'password' }),
    });
    assert.equal(res.status, 200);
    return res.headers.get('set-cookie').split(';')[0];
  };
  const [first, second] = await Promise.all([signIn(), signIn()]);
  const saved = await post(host, '/api/bookings', { caller_name: 'Shared Demo Test', questions_asked: 'Class question' }, { 'x-api-key': 'test-agent-key' });
  const id = saved.body.request_id;
  assert.ok(id);
  for (const cookie of [first, second]) {
    const response = await fetch(host + '/api/requests/' + id, { headers: { cookie } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).caller_name, 'Shared Demo Test');
  }

  const classRow = (await get(host, `/api/classes?from=${(await get(host, '/api/config')).today}`))
    .find(c => Date.parse(c.start_iso) > Date.now() && c.seats_left > 0);
  const headers = { 'content-type': 'application/json', 'x-api-key': 'test-agent-key' };
  const call = { call_id: 'delete-test-call', from_number: '860-555-0159' };
  await post(host, '/api/retell/webhook', { event: 'call_started', call }, headers);
  const booking = await post(host, '/api/bookings', { call, args: { caller_name: 'Delete Test', class_id: classRow.class_id } }, headers);
  const path = '/api/requests/' + booking.body.request_id;
  const confirmed = await fetch(host + path, {
    method: 'PATCH', headers: { cookie: first, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'confirmed' }),
  });
  assert.equal((await confirmed.json()).class.seats_left, classRow.seats_left - 1);
  assert.equal((await fetch(host + path, { method: 'DELETE' })).status, 401);
  const response = await fetch(host + path, { method: 'DELETE', headers: { cookie: first } });
  assert.equal(response.status, 200);
  const deleted = await response.json();
  assert.equal(deleted.class.seats_left, classRow.seats_left);
  assert.ok(deleted.activityIds.length >= 3);
  assert.equal((await fetch(host + path, { headers: { cookie: second } })).status, 404);
  assert.equal((await fetch(host + path, { method: 'DELETE', headers: { cookie: second } })).status, 404);
  const activity = await fetch(host + '/api/activity', { headers: { cookie: second } }).then(res => res.json());
  assert.ok(activity.every(a => a.request_id !== deleted.requestId && a.meta?.call_id !== call.call_id));
  const another = await post(host, '/api/bookings', { caller_name: 'Next Request', questions_asked: 'Class question' }, headers);
  assert.notEqual(another.body.request_id, deleted.requestId);
});
