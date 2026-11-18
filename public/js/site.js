import { $, $$, esc, api, icon, dayName, dayNum, monthName, longDate, addDays, toast, slug } from './util.js';
import { art, hydratePhotos } from './art.js';
import { CLUB, HOURS, STUDIOS, FEATURED, TIERS, FAQ, FAQ_CATS, DISCLAIMER } from './content.js';

const SCHED_START = '2026-11-06', SCHED_END = '2026-12-31';
const phoneText = ctx => ctx.config.phone || '(555) 000-0000';
const phoneHref = ctx => 'tel:' + (ctx.config.phone || '5550000000').replace(/[^\d+]/g, '');
const clamp = (d, a, b) => (d < a ? a : d > b ? b : d);

// ---------- shared bits ----------
export function intensityLevel(s = '') { s = s.toLowerCase(); return s.includes('high') && s.includes('moderate') ? 3 : s.includes('high') ? 4 : s.includes('moderate') ? 2 : s.includes('low') ? 1 : 2; }
export const meter = s => `<span class="meter" title="Intensity: ${esc(s)}" aria-label="Intensity: ${esc(s)}">${[1, 2, 3, 4].map(i => `<i class="${i <= intensityLevel(s) ? 'on' : ''}"></i>`).join('')}</span>`;
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

function heatTag(c) {
  const h = (c.heated || '').toLowerCase();
  if (h === 'yes') return `<span class="pill warn" title="${esc(c.heat_detail || '')}">${icon('flame', 13)} Heated${c.heat_detail ? ' · ' + esc(c.heat_detail.replace(/up to about /, '≤').replace(/about /, '~').replace(/F\b/g, '°F')) : ''}</span>`;
  if (h.startsWith('warm')) return `<span class="pill outline">${icon('flame', 13)} Warm room</span>`;
  return '';
}
function gearTags(c) {
  const out = [];
  if (c.gear_required) out.push(`<span class="pill dark">${icon('sock', 13)} Required: ${esc(c.gear_required)}</span>`);
  if (c.gear_recommended) out.push(`<span class="pill outline">Suggested: ${esc(c.gear_recommended)}</span>`);
  return out.join('');
}
export function seatBadge(c, past) {
  if (past) return `<span class="pill outline">Past class</span>`;
  if (c.status === 'holiday_unconfirmed') return `<span class="pill warn">${esc(c.holiday_note || 'Holiday')} · schedule unconfirmed</span>`;
  if (c.seats_left === 0) return `<span class="pill dark">Full · ${c.waitlist || 0} waitlisted</span>`;
  if (c.seats_left <= 5) return `<span class="pill solid">Only ${c.seats_left} left</span>`;
  return `<span class="pill accent">${c.seats_left} spots open</span>`;
}
const lengthText = c => (c.duration_min ? `${c.duration_min} min${c.duration_basis === 'assumed' ? ' (est.)' : ''}` : 'Length not published');
const isPast = c => Date.parse(c.start_iso) <= Date.now();

function reveal(root) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .08 });
  $$('.reveal', root).forEach(el => io.observe(el));
}

// ---------- booking modal ----------
export function openBooking(ctx, c) {
  const m = $('#modal');
  const full = c.seats_left === 0;
  m.innerHTML = `<form class="bm" method="dialog" novalidate>
    <div class="bm-head">
      <button type="button" class="bm-close" aria-label="Close">${icon('close', 18)}</button>
      <span class="eyebrow" style="color:#cfc6ff">${full ? 'Waitlist request' : 'Class request'}</span>
      <h2>${esc(c.class_name)}</h2>
      <p>${esc(longDate(c.date))} · ${esc(c.start_time)} · ${esc(c.studio)} studio</p>
    </div>
    <div class="bm-body">
      <div class="row">
        <div class="field"><label for="bm-name">Your name</label><input class="input" id="bm-name" name="caller_name" autocomplete="name" required></div>
        <div class="field"><label for="bm-phone">Phone</label><input class="input" id="bm-phone" name="caller_phone" type="tel" autocomplete="tel" required placeholder="860-555-0100"></div>
      </div>
      <div class="row">
        <div class="field"><label for="bm-mem">Are you a member?</label><select class="select" id="bm-mem" name="is_member"><option value="no">Not yet</option><option value="yes">Yes</option></select></div>
        <div class="field"><label for="bm-exp">Experience</label><select class="select" id="bm-exp" name="experience_level"><option value="">Select…</option><option>New to this</option><option>Some experience</option><option>Experienced</option></select></div>
      </div>
      <div class="field"><label for="bm-q">Anything we should know? <span class="muted">(optional)</span></label><textarea class="textarea" id="bm-q" name="questions_asked" placeholder="Questions, injuries, who you're bringing…"></textarea></div>
      <p class="bm-err" role="alert" style="color:var(--danger);font-size:.85rem;display:none"></p>
      <button class="btn btn-primary" type="submit">${full ? 'Request a waitlist spot' : 'Send my request'} ${icon('arrow', 18)}</button>
      <p class="bm-fine">This sends a request to the front desk team. It is <b>not</b> a confirmed booking until staff confirm it. Prefer to talk? Call FrontDesk AI at <a href="${phoneHref(ctx)}" style="text-decoration:underline">${esc(phoneText(ctx))}</a>.</p>
    </div></form>`;
  const form = $('form', m);
  $('.bm-close', m).onclick = () => m.close();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    const err = $('.bm-err', m);
    if (!fd.caller_name.trim() || !fd.caller_phone.trim()) { err.textContent = 'Please add your name and phone number so staff can reach you.'; err.style.display = 'block'; return; }
    const btn = $('button[type=submit]', m); btn.disabled = true;
    try {
      const out = await api('/api/website/requests', { method: 'POST', body: { ...fd, class_id: c.class_id } });
      m.innerHTML = `<div class="bm-done"><div class="tick">${icon('check', 34, 2.4)}</div>
        <h2 style="font-size:1.8rem">Request received</h2>
        <p style="color:var(--ink-2);max-width:26em">${esc(out.message || 'The team will review it shortly.')}</p>
        <p class="muted" style="font-size:.85rem">Reference ${esc(out.request_id || '')}</p>
        <button class="btn btn-dark" id="bm-ok">Done</button></div>`;
      $('#bm-ok', m).onclick = () => m.close();
    } catch (ex) { err.textContent = ex.message; err.style.display = 'block'; btn.disabled = false; }
  });
  m.showModal();
  m.addEventListener('click', e => { if (e.target === m) m.close(); }, { once: true });
}

// ---------- HOME ----------
export async function home(root, ctx) {
  const today = ctx.config.today;
  const upcoming = await api(`/api/classes?from=${today}&to=${addDays(today, 14)}`).catch(() => []);
  const live = upcoming.filter(c => !isPast(c) && c.seats_left != null);
  const nextOf = name => live.find(c => c.class_name === name && c.seats_left > 0);
  const weekly = key => live.filter(c => c.studio === key && c.date < addDays(today, 7)).length;
  const marquee = ['Reform', 'CS4', 'Ride', 'Box x Bags', 'Hot Pilates', 'Yoga Flow', 'Strength Ride', 'Candlelight Restore', 'Hot HIIT Sculpt', 'Sound Bath Bliss', 'Pilates X Strength', 'CS Strength'];
  const track = [...marquee, ...marquee].map(n => `<span>${esc(n)}</span>`).join('');
  const liveRows = () => {
    const pool = live.filter(c => c.seats_left > 0 && c.seats_left <= 8).slice(0, 12);
    const start = Math.floor(Date.now() / 6000) % Math.max(1, pool.length - 2);
    return pool.slice(start, start + 3).map(c => `<div class="lc-row"><div><strong>${esc(c.class_name)}</strong><small>${esc(dayName(c.date))} ${esc(c.start_time)} · ${esc(c.studio)}</small></div>${seatBadge(c)}</div>`).join('') || '<div class="lc-row"><small>Loading availability…</small></div>';
  };
  root.innerHTML = `
  <section class="hero"><div class="wrap hero-grid">
    <div>
      <span class="eyebrow">${esc(CLUB.place)}, Connecticut · Boutique fitness</span>
      <h1>Find your class. <span class="serif">Skip</span> the hold music.</h1>
      <p class="lead">Reformer, circuit, cycling, boxing and heated studios under one roof, plus an AI front desk that answers the phone, finds you a class and passes your request to the team.</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="${phoneHref(ctx)}">${icon('phone', 18)} Call FrontDesk AI · ${esc(phoneText(ctx))}</a>
        <a class="btn btn-ghost" href="#/classes">See this week’s classes ${icon('arrow', 18)}</a>
      </div>
      <div class="hero-meta"><span>${icon('pin', 18)} ${esc(CLUB.area)}, South Windsor</span><span>${icon('clock', 18)} Weekdays from 5 AM</span><span>${icon('users', 18)} Classes included in every membership</span></div>
    </div>
    <div class="hero-art reveal">
      ${art('hero', { label: 'Abstract violet and black artwork' })}
      <div class="hero-badge"><span>Powered by<br>FrontDesk AI</span></div>
      <div class="live-card"><div class="lc-top"><span class="live-dot">Live availability</span><a href="#/classes" class="muted" style="font-size:.8rem;font-weight:600">All classes →</a></div><div id="lc-rows">${liveRows()}</div></div>
    </div>
  </div></section>
  <div class="marquee" aria-hidden="true"><div class="marquee-track">${track}</div></div>

  <section class="section"><div class="wrap">
    <div class="sec-head reveal"><div><span class="eyebrow">The studios</span><h2>Five studios. One <span class="serif">front desk.</span></h2></div><p>Every studio has its own energy, gear and schedule. Pick the vibe, we’ll find the spot.</p></div>
    <div class="studio-grid">${STUDIOS.map(s => `
      <a class="studio reveal" href="#/classes?studio=${encodeURIComponent(s.key)}">
        ${art(s.slot, { label: s.key + ' studio artwork' })}
        <span class="st-go">${icon('arrow', 18)}</span>
        <div class="st-body"><span class="pill">${esc(s.tag)}</span><h3>${esc(s.key)}</h3><p>${esc(s.blurb)}</p>${weekly(s.key) ? `<p style="margin-top:10px;font-size:.82rem;opacity:.75">${weekly(s.key)} classes in the next 7 days</p>` : ''}</div>
      </a>`).join('')}</div>
  </div></section>

  <section class="section soft"><div class="wrap">
    <div class="sec-head reveal"><div><span class="eyebrow">Featured classes</span><h2>Start with <span class="serif">one of these.</span></h2></div><a class="btn btn-dark" href="#/classes">Browse the full schedule ${icon('arrow', 18)}</a></div>
    <div class="cards" id="featured"></div>
  </div></section>

  <section class="section"><div class="wrap">
    <div class="sec-head reveal"><div><span class="eyebrow">Membership</span><h2>Classes <span class="serif">included.</span></h2></div><p>Month-to-month plans with no initiation or annual fee shown online. Pick how early you want to book.</p></div>
    <div class="tiers">${TIERS.map(tierCard).join('')}</div>
    <p class="muted" style="margin-top:18px;font-size:.85rem">Advertised online rates as of Nov 6, 2026, before tax. <a href="#/membership" style="text-decoration:underline;font-weight:600">Full details →</a></p>
  </div></section>

  <section class="section soft"><div class="wrap">
    <div class="sec-head reveal"><div><span class="eyebrow">FrontDesk AI</span><h2>Just <span class="serif">ask.</span></h2></div><p>Our AI front desk talks like a person. Tell it what you’re after, change your mind, ask follow-ups.</p></div>
    <div class="steps">
      <div class="step reveal"><h3>Call and say what you want</h3><p>“Something low impact on Saturday morning.” No menus to press through, no webpages to hunt across.</p></div>
      <div class="step reveal"><h3>Get answers from approved info</h3><p>Hours, pricing, gear, policies and live class availability, drawn from the club’s published information.</p></div>
      <div class="step reveal"><h3>Staff confirms your request</h3><p>FrontDesk AI saves your request for the team to review. Nothing is booked until a person confirms it.</p></div>
    </div>
  </div></section>

  <section class="section"><div class="wrap">
    <div class="cta-band reveal">
      ${art('cta', { label: 'Abstract dark violet artwork' })}
      <span class="eyebrow" style="color:#cfc6ff">Prefer to talk?</span>
      <h2>Skip the line. Ask <span class="serif">FrontDesk AI.</span></h2>
      <p>Open when the club is: classes, memberships, first-visit questions. It never gets the hold music treatment.</p>
      <div class="phone-big">${esc(phoneText(ctx))}</div>
      <div class="cta-row"><a class="btn btn-light" href="${phoneHref(ctx)}">${icon('phone', 18)} Call now</a><a class="btn btn-ghost" style="border-color:#fff;color:#fff" href="#/classes">Or request a class online</a></div>
    </div>
  </div></section>

  <section class="section" style="padding-top:0"><div class="wrap visit">
    <div class="panel reveal"><span class="eyebrow">Visit</span><h3 style="font-size:1.8rem;margin:10px 0 6px">${esc(CLUB.name)} ${esc(CLUB.place)}</h3><p class="muted">${esc(CLUB.address)}<br>${esc(CLUB.area)}</p><p style="margin-top:14px">First visit? Arrive 15 minutes early and bring water. Reform needs grip socks; Box needs gloves ($5 to rent).</p><a class="btn btn-ghost btn-sm" style="margin-top:18px" href="#/faq">First-visit FAQ ${icon('arrow', 16)}</a></div>
    <div class="panel reveal"><span class="eyebrow">Club hours</span><div style="margin-top:10px">${HOURS.map(h => `<div class="hours-row"><span>${h.d}</span><span>${h.h}</span></div>`).join('')}</div><p class="muted" style="font-size:.82rem;margin-top:10px">Holiday hours aren’t published. Please confirm with the club.</p></div>
  </div></section>`;

  const feat = $('#featured', root);
  feat.innerHTML = FEATURED.map(name => `<article class="cls-card reveal" data-name="${esc(name)}"><div class="loading muted">Loading…</div></article>`).join('');
  const cat = await api('/api/catalog').catch(() => []);
  FEATURED.forEach(name => {
    const c = cat.find(x => x.class_name === name); if (!c) return;
    const n = nextOf(name);
    $(`[data-name="${CSS.escape(name)}"]`, feat).innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center"><span class="studio-tag">${esc(c.studio)}</span>${meter(c.intensity)}</div>
      <h3>${esc(name)}</h3><p>${esc(c.description)}</p>
      <div class="tags">${heatTag(c)}${gearTags(c)}<span class="pill">${esc(lengthText(c))}</span></div>
      <div class="next">${n ? `<div><strong>Next: ${esc(dayName(n.date))} ${esc(n.start_time)}</strong><span class="muted">${n.seats_left} spots open</span></div>` : '<div class="muted">See the schedule for times</div>'}<a class="btn btn-dark btn-sm" href="#/classes?type=${encodeURIComponent(name)}">Find times</a></div>`;
  });
  const lc = $('#lc-rows', root);
  const timer = setInterval(() => { if (!document.body.contains(lc)) return clearInterval(timer); lc.innerHTML = liveRows(); }, 6000);
  reveal(root); hydratePhotos(root);
  return () => clearInterval(timer);
}

function tierCard(t) {
  return `<article class="tier reveal ${t.popular ? 'pop' : ''}">
    ${t.popular ? '<span class="pill solid ribbon">Most popular</span>' : ''}
    <div><h3>${esc(t.name)}</h3><p class="muted" style="margin-top:6px">${esc(t.blurb)}</p></div>
    <div class="price"><b>$${t.price}</b><span>/ month</span></div>
    <ul>${t.features.map(f => `<li>${icon('check', 18, 2.2)}<span>${esc(f)}</span></li>`).join('')}</ul>
    <p class="muted" style="font-size:.85rem">Due when joining online: <b>$${t.upfront}</b> (first + last month, plus tax)</p>
    <p class="note">${esc(t.note)}</p></article>`;
}

// ---------- CLASSES ----------
const cstate = { studio: 'All', tod: 'any', hot: false, beginner: false, type: '', day: '', showEarlier: false };
const dayCache = new Map();
async function classesOn(day) {
  if (!dayCache.has(day)) dayCache.set(day, await api(`/api/classes?from=${day}&to=${day}`));
  return dayCache.get(day);
}

export async function classes(root, ctx, params) {
  const today = ctx.config.today;
  if (params.get('studio')) { cstate.studio = params.get('studio'); cstate.type = ''; }
  if (params.get('type')) { cstate.type = params.get('type'); cstate.studio = 'All'; }
  if (!cstate.day) cstate.day = clamp(today, SCHED_START, SCHED_END);
  dayCache.clear();
  const catalog = await api('/api/catalog').catch(() => []);
  const studios = ['All', ...STUDIOS.map(s => s.key)];

  const days = []; for (let d = SCHED_START; d <= SCHED_END; d = addDays(d, 1)) days.push(d);
  root.innerHTML = `
  <section class="page-head"><div class="wrap">
    <span class="eyebrow">Schedule &amp; class guide</span>
    <h1>Pick your <span class="serif">class.</span></h1>
    <p>Live seat counts, intensity, heat and gear for every class. Request a spot online or ask FrontDesk AI by phone.</p>
  </div></section>
  <section class="wrap" style="padding-bottom:40px">
    <div class="daystrip" id="days" role="group" aria-label="Choose a day">${days.map(d => `<button class="day ${d < today ? 'past' : ''} ${d === today ? 'today' : ''}" data-day="${d}" aria-pressed="${d === cstate.day}"><small>${dayName(d)}</small><b>${dayNum(d)}</b><em>${d === today ? 'TODAY' : (dayNum(d) === 1 || d === SCHED_START ? monthName(d).toUpperCase() : '')}</em></button>`).join('')}</div>
    <div class="filters" id="filters"></div>
    <div class="sched-head"><h2 id="day-title"></h2><span class="muted" id="day-count"></span></div>
    <div class="class-list" id="list" aria-live="polite"></div>
    <p class="sim-note">${icon('sparkle', 16)} Seat counts are simulated for this demo. Classes before today are shown for reference and can’t be requested. Holiday schedules aren’t published and are marked unconfirmed.</p>
  </section>
  <section class="section soft" style="margin-top:40px"><div class="wrap">
    <div class="sec-head"><div><span class="eyebrow">Know before you go</span><h2>The class <span class="serif">guide.</span></h2></div><p>What each class feels like, how hard it is, what to wear and what to bring.</p></div>
    <div class="guide-grid" id="guide"></div>
  </div></section>`;

  const matches = c => {
    if (cstate.studio !== 'All' && c.studio !== cstate.studio) return false;
    if (cstate.type && c.class_name !== cstate.type) return false;
    if (cstate.hot && (c.heated || '').toLowerCase() !== 'yes') return false;
    if (cstate.beginner && !/^yes/i.test(c.beginner_friendly || '')) return false;
    const h = Number(c.start_iso.slice(11, 13));
    if (cstate.tod === 'morning' && h >= 11) return false;
    if (cstate.tod === 'midday' && (h < 11 || h >= 16)) return false;
    if (cstate.tod === 'evening' && h < 16) return false;
    return true;
  };

  function drawFilters() {
    $('#filters', root).innerHTML = `
      ${studios.map(s => `<button class="chip" data-studio="${esc(s)}" aria-pressed="${cstate.studio === s}">${esc(s)}</button>`).join('')}<span class="sep"></span>
      ${['any', 'morning', 'midday', 'evening'].map(t => `<button class="chip" data-tod="${t}" aria-pressed="${cstate.tod === t}">${t === 'any' ? 'Any time' : cap(t)}</button>`).join('')}<span class="sep"></span>
      <button class="chip" data-flag="hot" aria-pressed="${cstate.hot}">${icon('flame', 14)}&nbsp;Heated</button>
      <button class="chip" data-flag="beginner" aria-pressed="${cstate.beginner}">Beginner-friendly</button>
      ${cstate.type ? `<button class="chip on" data-clear-type>Showing: ${esc(cstate.type)} &nbsp;✕</button>` : ''}`;
  }

  async function drawList() {
    const day = cstate.day;
    $('#day-title', root).textContent = longDate(day) + (day === today ? ' · Today' : '');
    $$('.day', root).forEach(b => b.setAttribute('aria-pressed', b.dataset.day === day));
    const all = await classesOn(day);
    const rows = all.filter(matches);
    $('#day-count', root).textContent = `${rows.length} class${rows.length === 1 ? '' : 'es'}${rows.length !== all.length ? ` (filtered from ${all.length})` : ''}`;
    const rowHtml = c => {
      const past = isPast(c), hol = c.status === 'holiday_unconfirmed';
      const label = hol ? 'Ask the club' : c.seats_left === 0 ? 'Join waitlist' : 'Request spot';
      return `<article class="class-row ${past ? 'is-past' : ''}">
        <div class="cr-time"><strong>${esc(c.start_time)}</strong><span>${esc(lengthText(c))}</span></div>
        <div class="cr-main"><h3>${esc(c.class_name)}</h3>
          <div class="sub">${esc(c.studio)} studio${c.instructor ? ` · ${c.is_sub ? 'Sub: ' : ''}${esc(c.instructor)}` : ''}</div>
          <div class="tags">${meter(c.intensity || '')}<span class="pill outline">${esc(cap(c.intensity || ''))}</span>${heatTag(c)}${gearTags(c)}</div></div>
        <div class="cr-seat">${seatBadge(c, past)}</div>
        ${past ? '<span></span>' : `<button class="btn ${hol ? 'btn-ghost' : 'btn-dark'} btn-sm" data-req="${esc(c.class_id)}" ${hol ? 'disabled' : ''}>${label}</button>`}
      </article>`;
    };
    const pastRows = rows.filter(isPast), futureRows = rows.filter(c => !isPast(c));
    // On a day that is partly over, tuck the earlier classes behind a toggle so what's bookable comes first.
    const fold = futureRows.length && pastRows.length;
    $('#list', root).innerHTML = rows.length
      ? (fold ? `<button class="btn btn-ghost btn-sm fold-btn" data-fold aria-expanded="${cstate.showEarlier}">${cstate.showEarlier ? 'Hide' : 'Show'} ${pastRows.length} earlier class${pastRows.length === 1 ? '' : 'es'} today</button>${cstate.showEarlier ? pastRows.map(rowHtml).join('') : ''}${futureRows.map(rowHtml).join('')}` : rows.map(rowHtml).join(''))
      : `<div class="empty"><b>No classes match.</b>Try another day or clear a filter.</div>`;
    hydratePhotos(root);
  }

  function drawGuide() {
    const rows = catalog.filter(c => (cstate.studio === 'All' || c.studio === cstate.studio) && (!cstate.type || c.class_name === cstate.type) && (!cstate.hot || c.heated === 'yes') && (!cstate.beginner || /^yes/i.test(c.beginner_friendly || '')));
    $('#guide', root).innerHTML = rows.map(c => `<article class="guide">
      <div style="display:flex;justify-content:space-between;align-items:center"><span class="studio-tag" style="font-size:.72rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)">${esc(c.studio)}</span>${meter(c.intensity)}</div>
      <h3>${esc(c.class_name)}</h3><p>${esc(c.description)}</p>
      <dl>
        <div><dt>Intensity</dt><dd>${esc(cap(c.intensity))} · ${esc(c.impact)} impact</dd></div>
        <div><dt>Length</dt><dd>${esc(lengthText(c))}</dd></div>
        <div><dt>Heat</dt><dd>${c.heated === 'yes' ? esc('Heated' + (c.heat_detail ? ', ' + c.heat_detail.replace(/F\b/g, '°F') : '')) : /warm/i.test(c.heated) ? 'Warm room' : 'Not heated'}</dd></div>
        <div><dt>Bring</dt><dd>${esc([c.gear_required && 'Required: ' + c.gear_required, c.gear_recommended && 'Suggested: ' + c.gear_recommended].filter(Boolean).join(' · ') || 'Nothing special')}</dd></div>
        <div><dt>Beginners</dt><dd>${esc(cap(c.beginner_friendly))}</dd></div>
        <div><dt>Good for</dt><dd>${esc(c.good_for.replace(/;/g, ','))}</dd></div>
      </dl>
      <p class="also">Also called: ${esc((c.spoken_aliases || '').split('|').slice(0, 4).join(', '))}</p>
      <button class="btn btn-ghost btn-sm" data-type="${esc(c.class_name)}">Find times</button></article>`).join('') || '<div class="empty"><b>No classes match.</b>Clear a filter to see the full guide.</div>';
  }

  drawFilters(); await drawList(); drawGuide();
  $('#days .day[aria-pressed="true"]', root)?.scrollIntoView({ inline: 'center', block: 'nearest' });

  root.addEventListener('click', async e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.day) { cstate.day = t.dataset.day; cstate.showEarlier = false; await drawList(); }
    else if (t.hasAttribute('data-fold')) { cstate.showEarlier = !cstate.showEarlier; await drawList(); }
    else if (t.dataset.studio) { cstate.studio = t.dataset.studio; cstate.type = ''; drawFilters(); await drawList(); drawGuide(); }
    else if (t.dataset.tod) { cstate.tod = t.dataset.tod; drawFilters(); await drawList(); }
    else if (t.dataset.flag) { cstate[t.dataset.flag] = !cstate[t.dataset.flag]; drawFilters(); await drawList(); drawGuide(); }
    else if (t.hasAttribute('data-clear-type')) { cstate.type = ''; drawFilters(); await drawList(); drawGuide(); }
    else if (t.dataset.type) { cstate.type = t.dataset.type; drawFilters(); await drawList(); drawGuide(); $('#filters', root).scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    else if (t.dataset.req) { const c = (await classesOn(cstate.day)).find(x => x.class_id === t.dataset.req); if (c) openBooking(ctx, c); }
  });
  reveal(root);
}

// ---------- MEMBERSHIP ----------
export function membership(root, ctx) {
  const joinFaq = FAQ.filter(f => f.c === 'Pricing & joining' || f.q === 'Can I try the club for free?');
  root.innerHTML = `
  <section class="page-head"><div class="wrap">
    <span class="eyebrow">Membership</span>
    <h1>Classes are <span class="serif">included.</span></h1>
    <p>Three month-to-month plans for ${esc(CLUB.place)}. All of them include boutique classes, up to five different ones a day, subject to class size and availability.</p>
  </div></section>
  <section class="wrap"><div class="tiers">${TIERS.map(tierCard).join('')}</div>
    <p class="muted" style="margin-top:16px;font-size:.85rem">Advertised online rates as of November 6, 2026, before tax. Prices, promo codes and offers can change; the club can confirm what applies to you at ${esc(CLUB.phone)}.</p></section>
  <section class="section"><div class="wrap visit">
    <div class="panel reveal"><span class="eyebrow">Joining costs</span>
      <h3 style="font-size:1.7rem;margin:10px 0 14px">What you pay up front</h3>
      ${TIERS.map(t => `<div class="hours-row"><span>${esc(t.name)} · first + last month</span><span>$${t.upfront}</span></div>`).join('')}
      <p class="muted" style="font-size:.85rem;margin-top:12px">Plus tax. The prepaid last month is used after you cancel. No initiation or annual fee is shown online.</p></div>
    <div class="panel reveal"><span class="eyebrow">Good to know</span>
      <div style="display:grid;gap:14px;margin-top:14px">
        <div><b>One spot per studio per day</b><p class="muted">Book one class per studio daily online; extra classes in the same studio are walk-in if there’s space.</p></div>
        <div><b>Booking windows</b><p class="muted">Classes open 7 days ahead (10 with Priority Booking), one hour after start time.</p></div>
        <div><b>Recovery &amp; training add-ons</b><p class="muted">Recovery packages and personal training cost extra. Prices aren’t published online.</p></div>
        <div><b>Age</b><p class="muted">16 and up, or 13 with a legal guardian who signs.</p></div>
      </div></div>
  </div></section>
  <section class="section soft"><div class="wrap">
    <div class="sec-head"><div><span class="eyebrow">Questions about joining</span><h2>Before you <span class="serif">sign up.</span></h2></div><a class="btn btn-dark" href="#/faq">All FAQs ${icon('arrow', 18)}</a></div>
    <div class="faq-list">${joinFaq.map(f => faqItem(f)).join('')}</div>
  </div></section>
  <section class="section"><div class="wrap"><div class="cta-band reveal">${art('membership', { label: 'Abstract artwork' })}
    <h2>Questions? Ask <span class="serif">FrontDesk AI.</span></h2><p>It knows the plans, the fees and the fine print, and tells you when something isn’t published.</p>
    <div class="cta-row"><a class="btn btn-light" href="${phoneHref(ctx)}">${icon('phone', 18)} ${esc(phoneText(ctx))}</a></div></div></div></section>`;
  reveal(root); hydratePhotos(root);
}

// ---------- FAQ ----------
const faqItem = (f, q = '') => `<details class="faq-item"><summary><span>${hl(f.q, q)}</span><span class="tog">${icon('plus', 16, 2.2)}</span></summary><div class="ans"><p>${hl(f.a, q)}</p><span class="pill outline cat">${esc(f.c)}</span></div></details>`;
function hl(text, q) { const t = esc(text); if (!q) return t; const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'); return t.replace(re, '<mark>$1</mark>'); }

export function faq(root, ctx) {
  let cat = 'All', q = '';
  root.innerHTML = `
  <section class="page-head"><div class="wrap">
    <span class="eyebrow">FAQ</span>
    <h1>Good <span class="serif">questions.</span></h1>
    <p>Hours, pricing, policies, guest passes and classes in one place. If something isn’t published we say so, and FrontDesk AI can pass your question to the team.</p>
  </div></section>
  <section class="wrap" style="padding-bottom:80px">
    <div class="faq-bar">
      <label class="search"><span class="sr">Search the FAQ</span>${icon('search', 20)}<input id="faq-q" type="search" placeholder="Search: parking, cancel, guest pass, grip socks…" autocomplete="off"></label>
      <div class="filters" style="margin:0" id="faq-cats"></div>
    </div>
    <p class="muted" id="faq-count" style="margin-bottom:14px"></p>
    <div class="faq-list" id="faq-list"></div>
  </section>`;
  const draw = () => {
    $('#faq-cats', root).innerHTML = ['All', ...FAQ_CATS].map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${cat === c}">${esc(c)}</button>`).join('');
    const needle = q.trim().toLowerCase();
    const rows = FAQ.filter(f => (cat === 'All' || f.c === cat) && (!needle || (f.q + ' ' + f.a).toLowerCase().includes(needle)));
    $('#faq-count', root).textContent = `${rows.length} answer${rows.length === 1 ? '' : 's'}`;
    $('#faq-list', root).innerHTML = rows.length ? rows.map(f => faqItem(f, needle)).join('') : `<div class="empty"><b>No match for “${esc(q)}”.</b>Ask FrontDesk AI at <a href="${phoneHref(ctx)}" style="text-decoration:underline">${esc(phoneText(ctx))}</a>, or call the club at ${esc(CLUB.phone)}.</div>`;
    if (needle && rows.length === 1) $('details', $('#faq-list', root))?.setAttribute('open', '');
  };
  draw();
  $('#faq-q', root).addEventListener('input', e => { q = e.target.value; draw(); });
  root.addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { cat = b.dataset.cat; draw(); } });
}

// ---------- footer ----------
export function footer(ctx) {
  return `<footer class="site-footer"><div class="wrap">
    <div class="f-grid">
      <div><div class="brand"><b><i></i>Club Studio</b><small>Powered by <em>FrontDesk AI</em></small></div>
        <p style="margin-top:18px;color:rgba(255,255,255,.7);max-width:26em">Boutique fitness in ${esc(CLUB.place)}, with an AI front desk that picks up when you call.</p></div>
      <div class="f-col"><h4>Explore</h4><a href="#/classes">Classes</a><a href="#/membership">Membership</a><a href="#/faq">FAQ</a><a href="#/staff">Staff view</a></div>
      <div class="f-col"><h4>Visit</h4><span>${esc(CLUB.address)}</span><span>Club: ${esc(CLUB.phone)}</span><span>FrontDesk AI: ${esc(phoneText(ctx))}</span></div>
    </div>
    <p class="disclaimer"><b style="color:#fff">Independent class project.</b> ${esc(DISCLAIMER)}</p>
  </div></footer>`;
}
