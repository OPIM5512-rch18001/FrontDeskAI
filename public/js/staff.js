import { $, $$, esc, api, icon, ago, clock, shortDate, longDate, addDays, toast } from './util.js';

// ---------- live state ----------
const S = { requests: [], activity: [], stats: {}, fresh: new Map(), conn: 'connecting', es: null, poll: null, sound: false, subs: new Set(), booted: false };
const emit = (type, data) => S.subs.forEach(fn => { try { fn(type, data); } catch (e) { console.error(e); } });
const subscribe = fn => { S.subs.add(fn); return () => S.subs.delete(fn); };
const FRESH_MS = 14000;

async function loadAll() {
  const [requests, activity, stats] = await Promise.all([api('/api/requests'), api('/api/activity?limit=60'), api('/api/stats')]);
  S.requests = requests; S.activity = activity; S.stats = stats;
  emit('loaded');
  updateNavBadge();
}
async function refreshStats() { S.stats = await api('/api/stats'); emit('stats'); updateNavBadge(); }

function upsert(r) {
  const i = S.requests.findIndex(x => x.request_id === r.request_id);
  if (i >= 0) S.requests[i] = r; else S.requests.unshift(r);
  S.requests.sort((a, b) => (b.created_at.localeCompare(a.created_at)) || b.request_id.localeCompare(a.request_id));
}

function beep() {
  if (!S.sound) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [[880, 0], [1320, .13]].forEach(([f, t]) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(.0001, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(.18, ac.currentTime + t + .02); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + t + .3); o.connect(g).connect(ac.destination); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + .32); });
  } catch {}
}

function connect() {
  if (S.es) return;
  if (location.search.includes('still')) { setConn('live'); return; } // screenshot mode: no open stream
  setConn('connecting');
  const es = new EventSource('/api/stream');
  S.es = es;
  es.addEventListener('hello', () => { setConn('live'); stopPoll(); if (S.booted) loadAll(); S.booted = true; });
  es.addEventListener('request.created', e => {
    const r = JSON.parse(e.data); upsert(r); S.fresh.set(r.request_id, Date.now());
    refreshStats(); emit('created', r); showIncoming(r); beep();
  });
  es.addEventListener('request.updated', e => { const r = JSON.parse(e.data); upsert(r); emit('updated', r); refreshStats(); });
  es.addEventListener('class.updated', e => emit('class', JSON.parse(e.data)));
  es.addEventListener('activity', e => {
    const a = JSON.parse(e.data); S.activity.unshift(a); S.activity.length = Math.min(S.activity.length, 60);
    emit('activity', a);
    if (a.type === 'call_started') showCall(a);
  });
  es.addEventListener('reset', () => { S.fresh.clear(); loadAll(); toast('Demo data reset'); });
  es.onerror = () => { setConn('reconnecting'); startPoll(); };
}
function disconnect() { S.es?.close(); S.es = null; stopPoll(); }
function startPoll() { if (!S.poll) S.poll = setInterval(() => loadAll().catch(() => {}), 4000); }
function stopPoll() { clearInterval(S.poll); S.poll = null; }
function setConn(c) { S.conn = c; const el = $('#conn'); if (el) { el.dataset.state = c; $('span', el).textContent = c === 'live' ? 'Live' : c === 'connecting' ? 'Connecting…' : 'Reconnecting…'; } }

// ---------- formatting ----------
const STATUS = { pending: ['warn', 'Pending'], confirmed: ['ok', 'Confirmed'], waitlisted: ['accent', 'Waitlisted'], cancelled: ['danger', 'Cancelled'], resolved: ['', 'Resolved'] };
const statusPill = s => { const [c, l] = STATUS[s] || ['', s]; return `<span class="pill ${c}">${l}</span>`; };
const SOURCE = { voice_agent: ['accent', 'mic', 'Voice agent'], website: ['', 'cal', 'Website'], simulation: ['outline dashed', 'wand', 'Simulated'] };
const sourcePill = s => { const [c, i, l] = SOURCE[s] || ['', 'inbox', s || 'Other']; return `<span class="pill ${c}">${icon(i, 13)} ${l}</span>`; };
const whenOf = r => (r.class_start_iso ? `${shortDate(r.class_start_iso.slice(0, 10))} · ${clock(r.class_start_iso)}` : '');
const initials = n => (n || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const avatar = n => `<span class="avatar" style="--h:${[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % 360}">${esc(initials(n))}</span>`;

function fmtSeat(t = '') {
  const m = String(t).match(/^(open|few_left|full)(?: \((.+)\))?$/);
  if (!m) return t;
  if (m[1] === 'full') return `full${m[2] ? ' · ' + m[2] : ''}`;
  return m[1] === 'few_left' ? `only ${m[2]} left` : `${m[2]} spots open`;
}
function reqCell(r) {
  if (r.request_type === 'booking' && r.class_name) return `<div class="cell-main">${esc(r.class_name)}</div><div class="cell-sub">${esc(whenOf(r))}${r.seat_status_at_request ? ` · ${esc(fmtSeat(r.seat_status_at_request))}` : ''}</div>`;
  return `<div class="cell-main"><span class="pill outline">Inquiry</span></div><div class="cell-sub clamp">${esc(r.questions_asked || r.call_summary || 'Question for staff')}</div>`;
}
function rowHtml(r, compact = false) {
  const fresh = S.fresh.has(r.request_id) && Date.now() - S.fresh.get(r.request_id) < FRESH_MS;
  return `<tr class="${fresh ? 'row-new' : ''}" data-open="${esc(r.request_id)}" tabindex="0">
    <td><div class="who">${avatar(r.caller_name)}<div><div class="cell-main">${esc(r.caller_name)} ${fresh ? '<span class="pill solid new-badge">NEW</span>' : ''}</div><div class="cell-sub">${esc(r.caller_phone || 'No phone')}${r.is_member === 'yes' ? ` · ${esc(r.membership_tier || 'Member')}` : ''}</div></div></div></td>
    <td>${reqCell(r)}</td>
    <td><div class="stack">${statusPill(r.status)}${compact ? sourcePill(r.source) : ''}</div></td>
    ${compact ? '' : `<td>${r.needs_followup === 'yes' && !['cancelled', 'resolved'].includes(r.status) ? `<span class="pill warn" title="${esc(r.followup_reason || '')}">${icon('flag', 13)} Follow up</span>` : '<span class="muted">—</span>'}</td><td>${sourcePill(r.source)}</td>`}
    <td class="muted nowrap" data-ts="${esc(r.created_at)}">${ago(r.created_at)}</td></tr>`;
}
const THEAD = `<thead><tr><th>Caller</th><th>Request</th><th>Status</th><th>Follow-up</th><th>Source</th><th>Received</th></tr></thead>`;
const THEAD_COMPACT = `<thead><tr><th>Caller</th><th>Request</th><th>Status</th><th>Received</th></tr></thead>`;

const ACT = { request_received: ['inbox', 'accent'], request_updated: ['refresh', ''], status_changed: ['check', 'ok'], call_started: ['phone', 'accent'], call_progress: ['mic', ''], call_ended: ['phone', ''], call_analyzed: ['sparkle', ''], note_updated: ['copy', ''], system: ['sparkle', ''] };
const actHtml = a => { const [i, c] = ACT[a.type] || ['sparkle', '']; return `<li class="act ${a.id === S.activity[0]?.id && Date.now() - Date.parse(a.ts) < 12000 ? 'act-new' : ''}" data-id="${a.id}"><span class="act-ico ${c}">${icon(i, 16)}</span><div><div class="act-msg">${esc(a.message)}</div><div class="cell-sub" data-ts="${esc(a.ts)}">${ago(a.ts)}</div></div></li>`; };

// ---------- shell ----------
const TITLES = {
  overview: ['Overview', 'Everything FrontDesk AI has passed to the team, updating live.'],
  requests: ['Requests', 'Booking requests and inquiries from callers and the website.'],
  schedule: ['Schedule & seats', 'Capacity by class. Seats change when staff confirm a request.'],
  tools: ['Demo tools & connection', 'Simulate a call, reset the demo, and connect the voice agent.']
};
const NAV = [['overview', 'grid', 'Overview'], ['requests', 'inbox', 'Requests'], ['schedule', 'cal', 'Schedule'], ['tools', 'wand', 'Demo tools']];

export function shell(ctx, toggleHtml, wireToggle) {
  document.body.className = 'mode-staff' + (document.body.classList.contains('present') ? ' present' : '');
  $('#app').innerHTML = `<div class="staff-app">
    <aside class="sidebar">
      <a class="s-brand" href="#/staff"><span class="s-mark">${icon('sparkle', 18, 2)}</span><span class="s-name"><b>FrontDesk AI</b><small>Staff console</small></span></a>
      <nav class="s-nav" aria-label="Staff">${NAV.map(([k, i, l]) => `<a href="#/staff${k === 'overview' ? '' : '/' + k}" data-k="${k}">${icon(i, 19)}<span>${l}</span>${k === 'requests' ? '<em class="nav-badge" id="nav-badge" hidden></em>' : ''}</a>`).join('')}</nav>
      <div class="s-foot"><div class="club-card"><b>Club Studio</b><span>South Windsor</span></div><span class="dev-tag">Development build · open access</span></div>
    </aside>
    <div class="staff-main">
      <header class="staff-top">
        <div><h1 id="page-title"></h1><p id="page-sub"></p></div>
        <div class="top-actions">
          <span class="conn" id="conn" data-state="${S.conn}"><i></i><span>Connecting…</span></span>
          <button class="icon-btn" id="snd" aria-pressed="${S.sound}" title="Play a sound when a request arrives">${icon('sparkle', 18)}<span class="sr">Sound</span></button>
          <button class="icon-btn" id="prs" aria-pressed="${document.body.classList.contains('present')}" title="Presentation mode: larger text">${icon('expand', 18)}<span class="sr">Presentation mode</span></button>
          ${toggleHtml}
        </div>
      </header>
      <div id="staff-content"></div>
    </div>
    <div id="incoming" aria-live="assertive"></div>
    <div id="drawer-root"></div>
  </div>`;
  wireToggle($('#app'));
  $('#snd').onclick = e => { S.sound = !S.sound; e.currentTarget.setAttribute('aria-pressed', S.sound); if (S.sound) beep(); toast(S.sound ? 'Sound on' : 'Sound off', 1500); };
  $('#prs').onclick = e => { const on = document.body.classList.toggle('present'); e.currentTarget.setAttribute('aria-pressed', on); };
  connect(); setConn(S.conn);
  if (!S.booted) loadAll().catch(e => toast('Could not load data: ' + e.message));
  else loadAll().catch(() => {});
  clearInterval(S.tick); S.tick = setInterval(tick, 15000);
}
export function setActive(k) {
  $$('.s-nav a').forEach(a => a.classList.toggle('on', a.dataset.k === k));
  const [t, s] = TITLES[k] || TITLES.overview;
  $('#page-title').textContent = t; $('#page-sub').textContent = s;
  document.title = `${t} · FrontDesk AI staff console`;
}
function updateNavBadge() { const b = $('#nav-badge'); if (!b) return; const n = S.stats.pending || 0; b.hidden = !n; b.textContent = n; }
function tick() {
  if (!$('#staff-content')) { clearInterval(S.tick); return; }
  $$('[data-ts]').forEach(el => { if (el.tagName !== 'TR') el.textContent = ago(el.dataset.ts); });
  const now = Date.now(); let expired = false;
  for (const [id, t] of S.fresh) if (now - t > FRESH_MS) { S.fresh.delete(id); expired = true; }
  if (expired) emit('stats');
}

// ---------- incoming banners ----------
let bannerTimer, callTimer;
function showIncoming(r) {
  const el = $('#incoming'); if (!el) return;
  clearTimeout(callTimer);
  const isBooking = r.request_type === 'booking';
  el.innerHTML = `<div class="banner banner-new" role="status"><span class="b-ico">${icon(isBooking ? 'cal' : 'inbox', 24)}</span>
    <div class="b-text"><small>${isBooking ? 'New booking request' : 'New inquiry'} · ${sourcePill(r.source)}</small>
    <b>${esc(r.caller_name)}${r.class_name ? ` → ${esc(r.class_name)}` : ''}</b>
    <span>${r.class_name ? esc(whenOf(r)) : esc(r.questions_asked || 'Question for staff')}</span></div>
    <button class="b-go" data-open="${esc(r.request_id)}">Open</button></div>`;
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { el.innerHTML = ''; }, 9000);
}
function showCall(a) {
  const el = $('#incoming'); if (!el) return;
  el.innerHTML = `<div class="banner banner-call" role="status"><span class="b-ico ring">${icon('phone', 24)}</span>
    <div class="b-text"><small>Incoming call</small><b>${esc(a.message.replace(/^Incoming call from /, '').replace(' (simulated)', ''))}</b><span>FrontDesk AI is on the line${a.meta?.simulated ? ' (simulated)' : ''}…</span></div></div>`;
  clearTimeout(callTimer); callTimer = setTimeout(() => { if ($('.banner-call', el)) el.innerHTML = ''; }, 14000);
}

// ---------- drawer ----------
async function openDrawer(id) {
  const root = $('#drawer-root'); if (!root) return;
  const inc = $('#incoming'); if (inc) inc.innerHTML = ''; // don't let a banner cover the drawer
  const r = S.requests.find(x => x.request_id === id) || await api('/api/requests/' + encodeURIComponent(id));
  let cls = r.class_id ? await api('/api/classes/' + encodeURIComponent(r.class_id)).catch(() => null) : null;
  const render = () => {
    const cur = S.requests.find(x => x.request_id === id) || r;
    const full = cls && cls.seats_left === 0;
    const confirmLabel = cur.request_type === 'inquiry' ? 'Mark resolved' : full ? 'Add to waitlist' : 'Confirm booking';
    const confirmStatus = cur.request_type === 'inquiry' ? 'resolved' : 'confirmed';
    const pct = cls && cls.capacity ? Math.round(((cls.capacity - (cls.seats_left ?? cls.capacity)) / cls.capacity) * 100) : 0;
    root.innerHTML = `<div class="drawer-scrim" data-close></div><aside class="drawer" role="dialog" aria-label="Request ${esc(cur.request_id)}">
      <header class="dr-head"><div><span class="eyebrow">${esc(cur.request_id)} · ${cur.request_type === 'booking' ? 'Booking request' : 'Inquiry'}</span><h2>${esc(cur.caller_name)}</h2></div><button class="icon-btn" data-close aria-label="Close">${icon('close', 18)}</button></header>
      <div class="dr-body">
        <div class="dr-row">${statusPill(cur.status)}${sourcePill(cur.source)}<span class="muted">${ago(cur.created_at)}</span></div>
        <section class="dr-card"><h4>Caller</h4><dl>
          <div><dt>Phone</dt><dd>${esc(cur.caller_phone || '—')}</dd></div>
          <div><dt>Member</dt><dd>${cur.is_member === 'yes' ? 'Yes' + (cur.membership_tier ? ' · ' + esc(cur.membership_tier) : '') : 'Not yet'}</dd></div>
          <div><dt>Experience</dt><dd>${esc(cur.experience_level || '—')}</dd></div>
          <div><dt>Goals</dt><dd>${esc(cur.goals || '—')}</dd></div></dl></section>
        ${cls ? `<section class="dr-card"><h4>Class</h4>
          <div class="cell-main" style="font-size:1.15rem">${esc(cls.class_name)}</div>
          <div class="cell-sub">${esc(longDate(cls.date))} · ${esc(cls.start_time)} · ${esc(cls.studio)}${cls.instructor ? ' · ' + esc(cls.instructor) : ''}</div>
          ${cls.seats_left != null ? `<div class="capbar" aria-label="${pct}% full"><i style="width:${pct}%"></i></div>
          <div class="cap-meta"><span><b>${cls.seats_left}</b> of ${cls.capacity} seats left</span><span>${cls.waitlist || 0} waitlisted</span></div>` : '<p class="muted">Holiday schedule unconfirmed; no seat counts.</p>'}
          <div class="cell-sub" style="margin-top:6px">At time of request: ${esc(cur.seat_status_at_request || '—')}</div></section>` : ''}
        ${cur.questions_asked ? `<section class="dr-card"><h4>Questions asked</h4><p>${esc(cur.questions_asked)}</p></section>` : ''}
        ${cur.call_summary ? `<section class="dr-card"><h4>Call summary</h4><p>${esc(cur.call_summary)}</p></section>` : ''}
        ${cur.needs_followup === 'yes' ? `<section class="dr-card warnbox"><h4>${icon('flag', 14)} Needs follow-up</h4><p>${esc(cur.followup_reason || 'Flagged for staff follow-up')}</p></section>` : ''}
        <section class="dr-card"><h4>Staff notes</h4><textarea class="textarea" id="dr-notes" placeholder="Add a note for the team…">${esc(cur.staff_notes || '')}</textarea></section>
      </div>
      <footer class="dr-foot">
        <button class="btn btn-primary" data-act="${confirmStatus}">${icon('check', 18, 2.2)} ${confirmLabel}</button>
        ${cur.status !== 'pending' ? `<button class="btn btn-ghost" data-act="pending">Reopen</button>` : ''}
        ${cur.status !== 'cancelled' ? `<button class="btn btn-ghost danger" data-act="cancelled">Cancel</button>` : ''}
        <button class="btn btn-ghost" data-flag="${cur.needs_followup === 'yes' ? 'no' : 'yes'}">${cur.needs_followup === 'yes' ? 'Clear flag' : 'Flag follow-up'}</button>
      </footer></aside>`;
    requestAnimationFrame(() => $('.drawer', root)?.classList.add('open'));
  };
  render();
  const off = subscribe(async (type, data) => {
    if (type === 'class' && data.class_id === r.class_id) { cls = data; render(); }
    else if (type === 'updated' && data.request_id === id) { if (r.class_id) cls = await api('/api/classes/' + encodeURIComponent(r.class_id)).catch(() => cls); render(); }
  });
  const close = () => { off(); const d = $('.drawer', root); d?.classList.remove('open'); setTimeout(() => { root.innerHTML = ''; }, 220); };
  root.onclick = async e => {
    if (e.target.closest('[data-close]')) return close();
    const act = e.target.closest('[data-act]'), flag = e.target.closest('[data-flag]');
    if (!act && !flag) return;
    const notes = $('#dr-notes', root)?.value;
    try {
      const body = act ? { status: act.dataset.act, staff_notes: notes } : { needs_followup: flag.dataset.flag, staff_notes: notes };
      const out = await api('/api/requests/' + encodeURIComponent(id), { method: 'PATCH', body });
      upsert(out.request); if (out.class) cls = out.class; emit('updated', out.request); refreshStats(); render();
      if (out.note) toast(out.note);
    } catch (ex) { toast('Could not update: ' + ex.message); }
  };
  root.onfocusout = async e => {
    if (e.target.id !== 'dr-notes') return;
    const cur = S.requests.find(x => x.request_id === id);
    if (cur && (cur.staff_notes || '') !== e.target.value) {
      const out = await api('/api/requests/' + encodeURIComponent(id), { method: 'PATCH', body: { staff_notes: e.target.value } }).catch(() => null);
      if (out) { upsert(out.request); toast('Note saved', 1400); }
    }
  };
  root.onkeydown = e => { if (e.key === 'Escape') close(); };
}
document.addEventListener('click', e => { const t = e.target.closest('[data-open]'); if (t && document.body.classList.contains('mode-staff')) openDrawer(t.dataset.open); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('tr[data-open]')) openDrawer(e.target.dataset.open); });

// ---------- views ----------
export async function view(sub, root, ctx) {
  const fn = { overview, requests, schedule, tools }[sub] || overview;
  return fn(root, ctx);
}

const kpi = (label, key, sub, tone = '') => `<div class="kpi ${tone}" data-kpi="${key}"><span class="kpi-label">${label}</span><b class="kpi-val">0</b><span class="kpi-sub">${sub}</span></div>`;
function setKpis(root) {
  $$('[data-kpi]', root).forEach(el => {
    const v = S.stats[el.dataset.kpi] ?? 0, b = $('.kpi-val', el);
    if (String(v) !== b.textContent) { b.textContent = v; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  });
}

function overview(root) {
  root.innerHTML = `
  <div class="kpis">${kpi('Requests today', 'today', 'bookings + inquiries')}${kpi('Awaiting confirmation', 'pending', 'needs a staff decision', 'warn')}${kpi('Need follow-up', 'followup', 'flagged by FrontDesk AI')}${kpi('Confirmed', 'confirmed', 'seats held')}</div>
  <div class="ov-grid">
    <section class="card"><div class="card-head"><h2>Latest requests</h2><a class="link" href="#/staff/requests">View all ${icon('arrow', 15)}</a></div>
      <div class="tbl-wrap"><table class="tbl compact" id="ov-table">${THEAD_COMPACT}<tbody></tbody></table></div></section>
    <section class="card feed"><div class="card-head"><h2><span class="live-dot">Live activity</span></h2></div><ul class="acts" id="feed"></ul></section>
  </div>`;
  const draw = () => {
    $('#ov-table tbody', root).innerHTML = S.requests.slice(0, 8).map(r => rowHtml(r, true)).join('') || `<tr><td colspan="4" class="empty-cell">No requests yet. Use “Demo tools” to simulate a call.</td></tr>`;
    $('#feed', root).innerHTML = S.activity.slice(0, 14).map(actHtml).join('') || '<li class="muted" style="padding:20px">Waiting for activity…</li>';
    setKpis(root);
  };
  draw();
  const off = subscribe(type => { if (type !== 'class') draw(); });
  return off;
}

function requests(root) {
  const f = { status: 'all', type: 'all', followup: false, q: '' };
  root.innerHTML = `
  <section class="card"><div class="toolbar">
    <label class="search sm"><span class="sr">Search</span>${icon('search', 18)}<input id="rq" type="search" placeholder="Search name, phone, class, question…"></label>
    <div class="seg" id="f-status"></div><div class="seg" id="f-type"></div>
    <button class="chip" id="f-fu" aria-pressed="false">${icon('flag', 14)}&nbsp;Follow-up only</button>
  </div><div class="tbl-wrap"><table class="tbl" id="rq-table">${THEAD}<tbody></tbody></table></div><p class="tbl-foot" id="rq-count"></p></section>`;
  const draw = () => {
    const q = f.q.toLowerCase();
    const rows = S.requests.filter(r => (f.status === 'all' || r.status === f.status) && (f.type === 'all' || r.request_type === f.type) && (!f.followup || r.needs_followup === 'yes') &&
      (!q || [r.caller_name, r.caller_phone, r.class_name, r.questions_asked, r.call_summary, r.request_id].join(' ').toLowerCase().includes(q)));
    $('#rq-table tbody', root).innerHTML = rows.map(r => rowHtml(r)).join('') || `<tr><td colspan="6" class="empty-cell">No requests match these filters.</td></tr>`;
    $('#rq-count', root).textContent = `${rows.length} of ${S.requests.length} requests`;
    const cnt = s => s === 'all' ? S.requests.length : S.requests.filter(r => r.status === s).length;
    $('#f-status', root).innerHTML = ['all', 'pending', 'confirmed', 'waitlisted', 'cancelled'].map(s => `<button data-st="${s}" aria-pressed="${f.status === s}">${s === 'all' ? 'All' : STATUS[s][1]} <em>${cnt(s)}</em></button>`).join('');
    $('#f-type', root).innerHTML = [['all', 'Everything'], ['booking', 'Bookings'], ['inquiry', 'Inquiries']].map(([k, l]) => `<button data-ty="${k}" aria-pressed="${f.type === k}">${l}</button>`).join('');
    $('#f-fu', root).setAttribute('aria-pressed', f.followup);
  };
  draw();
  root.addEventListener('click', e => {
    const st = e.target.closest('[data-st]'), ty = e.target.closest('[data-ty]');
    if (st) f.status = st.dataset.st; else if (ty) f.type = ty.dataset.ty; else if (e.target.closest('#f-fu')) f.followup = !f.followup; else return;
    draw();
  });
  $('#rq', root).addEventListener('input', e => { f.q = e.target.value; draw(); });
  return subscribe(type => { if (type !== 'class') draw(); });
}

async function schedule(root, ctx) {
  let day = ctx.config.today;
  const bounds = ['2026-11-06', '2026-12-31'];
  root.innerHTML = `<section class="card"><div class="card-head"><div class="daynav">
      <button class="icon-btn" id="dprev" aria-label="Previous day">${icon('chevron', 18)}</button><h2 id="dlabel"></h2><button class="icon-btn" id="dnext" aria-label="Next day">${icon('chevron', 18)}</button>
      <button class="chip" id="dtoday">Today</button></div><span class="muted" id="dsum"></span></div>
    <div class="sched" id="sched"></div></section>`;
  const draw = async () => {
    $('#dlabel', root).textContent = longDate(day) + (day === ctx.config.today ? ' · Today' : '');
    const rows = await api(`/api/classes?from=${day}&to=${day}`);
    const by = {}; for (const r of S.requests) if (r.class_id && !['cancelled', 'resolved'].includes(r.status)) (by[r.class_id] ||= []).push(r);
    const seats = rows.reduce((a, c) => a + (c.seats_left || 0), 0);
    $('#dsum', root).textContent = `${rows.length} classes · ${seats} open seats`;
    $('#sched', root).innerHTML = rows.map(c => {
      const reqs = by[c.class_id] || [], pend = reqs.filter(r => r.status === 'pending').length, conf = reqs.filter(r => r.status === 'confirmed').length;
      const pct = c.capacity && c.seats_left != null ? Math.round(((c.capacity - c.seats_left) / c.capacity) * 100) : 0;
      const tone = c.seats_left === 0 ? 'full' : c.seats_left != null && c.seats_left <= 5 ? 'few' : '';
      return `<div class="srow ${Date.parse(c.start_iso) < Date.now() ? 'past' : ''}" data-cid="${esc(c.class_id)}"><div class="s-time"><b>${esc(c.start_time)}</b></div>
        <div><div class="cell-main">${esc(c.class_name)}</div><div class="cell-sub">${esc(c.studio)}${c.instructor ? ' · ' + esc(c.instructor) : ''}</div></div>
        <div class="s-cap">${c.seats_left != null ? `<div class="capbar ${tone}"><i style="width:${pct}%"></i></div><div class="cap-meta"><span><b>${c.seats_left}</b> / ${c.capacity} left</span><span>${c.waitlist || 0} waitlist</span></div>` : `<span class="pill warn">Schedule unconfirmed</span>`}</div>
        <div class="s-req">${pend ? `<span class="pill warn">${pend} pending</span>` : ''}${conf ? `<span class="pill ok">${conf} confirmed</span>` : ''}</div></div>`;
    }).join('') || '<div class="empty-cell">No classes this day.</div>';
  };
  await draw();
  $('#dprev', root).onclick = () => { if (day > bounds[0]) { day = addDays(day, -1); draw(); } };
  $('#dnext', root).onclick = () => { if (day < bounds[1]) { day = addDays(day, 1); draw(); } };
  $('#dtoday', root).onclick = () => { day = ctx.config.today; draw(); };
  return subscribe(async (type, data) => {
    if (type === 'class') { await draw(); const el = $(`[data-cid="${CSS.escape(data.class_id)}"]`, root); el?.classList.add('flash'); }
    else if (type === 'loaded' || type === 'updated' || type === 'created') draw();
  });
}

const copyBtn = id => `<button class="btn btn-ghost btn-sm" data-copy="${id}">${icon('copy', 15)} Copy</button>`;
function tools(root, ctx) {
  const origin = location.origin;
  const curl = `curl -X POST ${origin}/api/bookings \\\n  -H "Content-Type: application/json"${ctx.config.apiKeyRequired ? ' \\\n  -H "x-api-key: YOUR_KEY"' : ''} \\\n  -d '{"caller_name":"Alex Rivera","caller_phone":"860-555-0142","class_name":"Reform","class_date":"${addDays(ctx.config.today, 1)}","class_time":"9:00 AM","goals":"strength","call_summary":"Wants Reform tomorrow at 9."}'`;
  const schema = JSON.stringify({
    name: 'submit_booking_request',
    description: 'Save the caller’s class booking request or question for the Club Studio staff. Call it once you have the caller’s name and what they want. This is a request only, never tell the caller it is confirmed.',
    url: `${origin}/api/bookings`, method: 'POST',
    parameters: { type: 'object', required: ['caller_name'], properties: {
      caller_name: { type: 'string', description: 'Caller’s name' },
      caller_phone: { type: 'string', description: 'Best callback number' },
      class_name: { type: 'string', description: 'Class requested, e.g. Reform, CS4, Ride, Box x Bags, Hot Pilates, Yoga Flow, Yoga Restore. Use the caller’s words if unsure.' },
      class_date: { type: 'string', description: 'Class date as YYYY-MM-DD' },
      class_time: { type: 'string', description: 'Class start time, e.g. 9:15 AM' },
      is_member: { type: 'string', enum: ['yes', 'no'] },
      membership_tier: { type: 'string', description: 'Standard, Standard Plus or Premier, if a member' },
      experience_level: { type: 'string' }, goals: { type: 'string' },
      questions_asked: { type: 'string', description: 'Questions the caller asked that staff should follow up on' },
      call_summary: { type: 'string', description: 'One or two sentences summarizing the call' },
      needs_followup: { type: 'string', enum: ['yes', 'no'] }, followup_reason: { type: 'string' } } } }, null, 2);
  root.innerHTML = `
  <div class="tools-grid">
    <section class="card pad"><h2>${icon('wand', 20)} Simulate an incoming call</h2>
      <p class="muted">Sends the same request the voice agent sends, tagged <span class="pill outline dashed">Simulated</span>. No phone call needed.</p>
      <div class="sim-btns">
        <button class="btn btn-primary" data-sim="booking">${icon('cal', 18)} New booking request</button>
        <button class="btn btn-dark" data-sim="full">${icon('users', 18)} Full class → waitlist</button>
        <button class="btn btn-ghost" data-sim="inquiry">${icon('inbox', 18)} General question</button>
      </div>
      <label class="check"><input type="checkbox" id="instant"> Skip the call animation (instant)</label>
      <p class="muted" style="font-size:.82rem">Normally: incoming call banner, then “collecting details”, then the request appears (about 4 seconds).</p>
    </section>
    <section class="card pad"><h2>${icon('refresh', 20)} Demo controls</h2>
      <p class="muted">Put everything back to the starting state before you present: classes, seat counts, sample requests and the activity feed.</p>
      <button class="btn btn-ghost danger" id="reset">${icon('refresh', 18)} Reset demo data</button>
      <hr>
      <div class="kv"><span>Voice agent requests</span><b id="t-voice">${S.stats.voice ?? 0}</b></div>
      <div class="kv"><span>Live connection</span><b id="t-conn">${S.conn}</b></div>
      <div class="kv"><span>FrontDesk AI phone</span><b>${ctx.config.phoneConfigured ? esc(ctx.config.phone) : '<span class="pill warn">Not set (placeholder showing)</span>'}</b></div>
    </section>
    <section class="card pad wide"><h2>${icon('mic', 20)} Connect the Retell voice agent</h2>
      <p class="muted">Add a <b>custom function</b> to the single-prompt agent. When the caller gives their details, the agent calls this endpoint and reads the reply aloud.</p>
      <div class="kv"><span>Endpoint</span><code id="ep">POST ${esc(origin)}/api/bookings</code>${copyBtn('ep')}</div>
      <div class="kv"><span>API key</span><b>${ctx.config.apiKeyRequired ? 'Required. Send it as header <code>x-api-key</code>' : 'Not required (set API_KEY to turn it on)'}</b></div>
      <div class="kv"><span>Webhook (optional)</span><code id="wh">POST ${esc(origin)}/api/retell/webhook</code>${copyBtn('wh')}</div>
      <div class="kv"><span>Availability (optional)</span><code id="av">GET ${esc(origin)}/api/availability?class_name=Reform&amp;date=YYYY-MM-DD</code>${copyBtn('av')}</div>
      <div class="two">
        <div><h3>Function settings (paste into Retell)</h3><pre id="schema">${esc(schema)}</pre>${copyBtn('schema')}</div>
        <div><h3>Test from a terminal</h3><pre id="curl">${esc(curl)}</pre>${copyBtn('curl')}
          <p class="muted" style="font-size:.82rem;margin-top:10px">Retell must be able to reach this URL. On a laptop, use a tunnel (ngrok / Cloudflare Tunnel) or a hosted deploy. See the README.</p></div>
      </div>
    </section>
  </div>`;
  root.addEventListener('click', async e => {
    const sim = e.target.closest('[data-sim]'), cp = e.target.closest('[data-copy]');
    if (sim) {
      sim.disabled = true;
      try { await api('/api/simulate', { method: 'POST', body: { kind: sim.dataset.sim, instant: $('#instant', root).checked } }); toast('Simulated call started. Watch the Overview.', 2400); } catch (ex) { toast(ex.message); }
      setTimeout(() => { sim.disabled = false; }, 1200);
    } else if (cp) {
      const t = $('#' + cp.dataset.copy, root).textContent.replace(/^(POST|GET) /, '');
      try { await navigator.clipboard.writeText(t); toast('Copied', 1200); } catch { toast('Select the text and copy manually'); }
    } else if (e.target.closest('#reset')) {
      if (confirm('Reset all demo data? This restores classes, seat counts and sample requests.')) { await api('/api/admin/reset', { method: 'POST' }); }
    }
  });
  return subscribe(() => { const c = $('#t-conn', root), v = $('#t-voice', root); if (c) c.textContent = S.conn; if (v) v.textContent = S.stats.voice ?? 0; });
}
