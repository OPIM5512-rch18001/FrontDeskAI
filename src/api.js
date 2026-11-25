import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import {
  listClasses, getClass, listCatalog, listRequests, getRequest, stats, listActivity, resetDemo
} from './db.js';
import { submitRequest, staffUpdate, runSimulation, handleRetellEvent } from './service.js';
import { parseDate, resolveClass } from './matcher.js';
import { addClient, clientCount } from './events.js';
import { etISO, etDate } from './time.js';

const staffPassword = process.env.STAFF_PASSWORD;
const staffToken = randomBytes(32).toString('hex');
const staffCookie = 'frontdesk_staff';
const staffPaths = new Set(['/api/requests', '/api/stats', '/api/activity', '/api/stream', '/api/simulate', '/api/admin/reset']);

function equalSecret(actual, expected) {
  const left = Buffer.from(typeof actual === 'string' ? actual : '');
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function staffSignedIn(req) {
  const entry = (req.headers.cookie || '').split(';').map(item => item.trim())
    .find(item => item.startsWith(`${staffCookie}=`));
  return equalSecret(entry?.slice(staffCookie.length + 1), staffToken);
}

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) { reject(new Error('Body too large')); req.destroy(); } });
    req.on('end', () => {
      if (!data.trim()) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(Object.assign(new Error('Invalid JSON body'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

// Optional API key: only enforced when API_KEY is set.
function authorized(req, url) {
  if (!config.apiKey) return true;
  const h = req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return h === config.apiKey || url.searchParams.get('api_key') === config.apiKey;
}

export async function handleApi(req, res, url) {
  const p = url.pathname.replace(/\/+$/, '');
  const m = req.method;
  if (m === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,x-api-key,Authorization' });
    return res.end();
  }
  const q = Object.fromEntries(url.searchParams);

  try {
    if (p === '/api/staff/session') {
      if (m === 'GET') return json(res, 200, { signedIn: !staffPassword || staffSignedIn(req) });
      if (m === 'POST') {
        if (staffPassword && !equalSecret((await readBody(req))?.password, staffPassword)) {
          return json(res, 401, { error: 'Incorrect staff password.' });
        }
        const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' || process.env.CODESPACES === 'true';
        res.setHeader('Set-Cookie', `${staffCookie}=${staffToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure ? '; Secure' : ''}`);
        return json(res, 200, { signedIn: true });
      }
    }
    if (staffPassword && (staffPaths.has(p) || p.startsWith('/api/requests/')) && !staffSignedIn(req)) {
      return json(res, 401, { error: 'Staff sign-in required.' });
    }

    // ----- public reads -----
    if (m === 'GET' && p === '/api/health') return json(res, 200, { ok: true, time: etISO(), liveClients: clientCount() });
    if (m === 'GET' && p === '/api/config') return json(res, 200, {
      phone: config.phone, phoneConfigured: !!config.phone, club: config.club, apiKeyRequired: !!config.apiKey, today: etDate(), now: etISO()
    });
    if (m === 'GET' && p === '/api/catalog') return json(res, 200, listCatalog());
    if (m === 'GET' && p === '/api/classes') return json(res, 200, listClasses({ from: q.from, to: q.to, type: q.type, studio: q.studio }));
    if (m === 'GET' && p.startsWith('/api/classes/')) {
      const c = getClass(decodeURIComponent(p.slice(13)));
      return c ? json(res, 200, c) : json(res, 404, { error: 'Class not found' });
    }
    if (m === 'GET' && p === '/api/images') {
      let files = [];
      try { files = fs.readdirSync(path.join(config.publicDir, 'img')).filter(f => /\.(jpe?g|png|webp|avif)$/i.test(f)); } catch {}
      return json(res, 200, Object.fromEntries(files.map(f => [path.parse(f).name, `/img/${f}`])));
    }

    // ----- live stream -----
    if (m === 'GET' && p === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'Access-Control-Allow-Origin': '*' });
      res.write(`retry: 2000\nevent: hello\ndata: ${JSON.stringify({ at: etISO() })}\n\n`);
      addClient(res);
      return;
    }

    // ----- staff dashboard (open access in this dev build) -----
    if (m === 'GET' && p === '/api/requests') return json(res, 200, listRequests({ status: q.status, type: q.type, q: q.q, followup: q.followup }));
    if (m === 'GET' && p.startsWith('/api/requests/')) {
      const r = getRequest(decodeURIComponent(p.slice(14)));
      return r ? json(res, 200, { ...r, class: r.class_id ? getClass(r.class_id) : null }) : json(res, 404, { error: 'Request not found' });
    }
    if (m === 'PATCH' && p.startsWith('/api/requests/')) {
      const out = staffUpdate(decodeURIComponent(p.slice(14)), await readBody(req));
      return out ? json(res, 200, out) : json(res, 404, { error: 'Request not found' });
    }
    if (m === 'GET' && p === '/api/stats') return json(res, 200, stats());
    if (m === 'GET' && p === '/api/activity') return json(res, 200, listActivity(Number(q.limit) || 50));
    if (m === 'POST' && p === '/api/simulate') {
      const body = await readBody(req);
      return json(res, 200, runSimulation(body.kind || q.kind || 'booking', { instant: !!body.instant }));
    }
    if (m === 'POST' && p === '/api/admin/reset') { resetDemo(); return json(res, 200, { ok: true }); }

    // ----- website visitors (no API key; the browser can't keep one secret) -----
    if (m === 'POST' && p === '/api/website/requests') {
      const body = await readBody(req);
      const out = submitRequest(body, { source: 'website' });
      return json(res, out.http, out.body);
    }

    // ----- agent-facing endpoints (API key enforced if configured) -----
    if (p === '/api/bookings' || p === '/api/availability' || p === '/api/retell/webhook') {
      if (!authorized(req, url)) return json(res, 401, { success: false, message: 'Missing or invalid API key.' });
      if (m === 'POST' && p === '/api/bookings') {
        const out = submitRequest(await readBody(req), { source: 'voice_agent' });
        return json(res, out.http, out.body);
      }
      if (m === 'GET' && p === '/api/bookings') return json(res, 200, listRequests({ status: q.status, type: q.type, q: q.q }));
      if (p === '/api/availability' && (m === 'GET' || m === 'POST')) {
        const args = m === 'GET' ? q : (await readBody(req));
        const a = args.args || args;
        const slim = c => ({ class_id: c.class_id, class_name: c.class_name, date: c.date, weekday: c.weekday, start_time: c.start_time, seats_left: c.seats_left, waitlist: c.waitlist, status: c.status, instructor: c.instructor });
        const className = a.class_name || a.class;
        const classDate = a.class_date || a.date;
        if (!a.class_id && !String(className || '').trim() && !a.class_time && !a.time) {
          const date = parseDate(classDate);
          if (!date) return json(res, 200, { result: 'none', message: 'Ask which day the caller prefers.' });
          const now = Date.now();
          const open = listClasses({ from: date, to: date })
            .filter(c => Date.parse(c.start_iso) > now && c.status !== 'holiday_unconfirmed' && c.seats_left > 0);
          if (!open.length) return json(res, 200, { result: 'none', date, message: 'No upcoming classes have openings that day.' });
          const first = open.find(c => c.start_iso.slice(11, 16) >= '08:00') || open[0];
          const later = open.filter(c => c.start_iso > first.start_iso);
          const second = later.find(c => c.start_iso.slice(11, 16) >= '16:00' && c.class_name !== first.class_name)
            || later.find(c => c.class_name !== first.class_name) || later[0] || open.find(c => c !== first);
          return json(res, 200, { result: 'options', date, options: (second ? [first, second] : [first]).map(slim) });
        }
        const r = resolveClass({ class_id: a.class_id, class_name: className, class_date: classDate, class_time: a.class_time || a.time });
        return json(res, 200, { result: r.kind, class: r.cls ? slim(r.cls) : undefined, options: r.options?.slice(0, 8).map(slim), message: r.reason });
      }
      if (m === 'POST' && p === '/api/retell/webhook') {
        handleRetellEvent(await readBody(req));
        res.writeHead(204); return res.end();
      }
    }
    return json(res, 404, { error: 'Not found' });
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    return json(res, status, { success: false, error: e.message || 'Server error' });
  }
}
