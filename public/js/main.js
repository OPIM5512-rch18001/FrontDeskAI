import { $, $$, api, icon, esc } from './util.js';
import { setImages, hydratePhotos } from './art.js';
import * as site from './site.js';
import * as staff from './staff.js';

const ctx = { config: { phone: '', today: '', now: '' }, images: {} };
let cleanup = null;
let shellMode = null;

export function modeToggle(mode) {
  return `<div class="mode-toggle" data-mode="${mode}" role="group" aria-label="Switch between customer and staff view">
    <span class="knob"></span>
    <button type="button" data-go="customer" aria-pressed="${mode === 'customer'}">${icon('users', 15)} Customer</button>
    <button type="button" data-go="staff" aria-pressed="${mode === 'staff'}">${icon('grid', 15)} Staff</button>
  </div>`;
}
function wireToggle(scope) {
  $$('.mode-toggle [data-go]', scope).forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.go === 'staff' ? '#/staff' : '#/'; }));
}

const NAV = [['/', 'Home'], ['/classes', 'Classes'], ['/membership', 'Membership'], ['/faq', 'FAQ']];

function customerShell() {
  document.body.className = 'mode-customer' + (document.body.classList.contains('present') ? ' present' : '');
  $('#app').innerHTML = `
  <header class="site-header" id="hdr"><div class="wrap hdr">
    <a class="brand" href="#/" aria-label="Club Studio home"><b><i></i>Club Studio</b><small>Powered by <em>FrontDesk AI</em></small></a>
    <nav class="nav" id="nav" aria-label="Main">${NAV.map(([p, l]) => `<a href="#${p}" data-p="${p}">${l}</a>`).join('')}</nav>
    <div class="hdr-right">${modeToggle('customer')}<a class="btn btn-primary btn-sm btn-call" href="#/classes">${icon('cal', 16)} Book a class</a><button class="menu-btn" id="menu" aria-label="Menu" aria-expanded="false">${icon('down', 20)}</button></div>
  </div></header>
  <main id="main-wrap"></main><div id="footer"></div>`;
  wireToggle($('#app'));
  $('#menu').onclick = () => { const n = $('#nav'); const o = n.classList.toggle('open'); $('#menu').setAttribute('aria-expanded', o); };
  const onScroll = () => $('#hdr')?.classList.toggle('scrolled', scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  $('#footer').innerHTML = site.footer(ctx);
}

function mount(wrapSel) {
  const wrap = $(wrapSel);
  const main = document.createElement('div');
  main.id = 'main'; main.tabIndex = -1;
  wrap.replaceChildren(main);
  return main;
}

async function route() {
  const dlg = $('#modal'); if (dlg?.open) dlg.close();
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  const params = new URLSearchParams(qs || '');
  const isStaff = path.startsWith('/staff');
  const mode = isStaff ? 'staff' : 'customer';
  if (mode !== shellMode) {
    shellMode = mode;
    if (isStaff) staff.shell(ctx, modeToggle('staff'), wireToggle); else customerShell();
  }
  if (isStaff) {
    const sub = path.replace(/^\/staff\/?/, '') || 'overview';
    const root = mount('#staff-content');
    staff.setActive(sub);
    cleanup = await staff.view(sub, root, ctx);
  } else {
    $$('#nav a').forEach(a => a.removeAttribute('aria-current'));
    const key = NAV.find(([p]) => p === path)?.[0] || '/';
    $(`#nav a[data-p="${key}"]`)?.setAttribute('aria-current', 'page');
    $('#nav')?.classList.remove('open');
    const root = mount('#main-wrap');
    window.scrollTo({ top: 0 });
    const view = { '/': site.home, '/classes': site.classes, '/membership': site.membership, '/faq': site.faq }[key];
    cleanup = await view(root, ctx, params);
    document.title = `${{ '/': 'Home', '/classes': 'Classes', '/membership': 'Membership', '/faq': 'FAQ' }[key]} · Club Studio · Powered by FrontDesk AI`;
  }
}

async function boot() {
  if (location.search.includes('still')) document.documentElement.classList.add('still'); // screenshots: no motion
  try {
    ctx.config = await api('/api/config');
    ctx.images = await api('/api/images'); setImages(ctx.images);
  } catch (e) { console.warn('Could not load config', e); }
  window.addEventListener('hashchange', route);
  route();
}
boot();
