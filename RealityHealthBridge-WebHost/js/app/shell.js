// App shell: root render (with licence/device gates), sidebar + top bar, navigation, logout.

// ---------- Page registry ----------
// Every page lives in its own file under js/pages/ and exposes a view (returns HTML)
// and an optional wire function (attaches its event handlers after rendering).
const PAGES = {
  dashboard: { label:'Dashboard',       short:'Home',      icon:'home',      view:()=>viewDashboard(), wire:()=>wireDashboard() },
  stockin:   { label:'Stock In',        short:'Stock In',  icon:'truck',     view:()=>viewStockIn(),   wire:()=>wireStockIn() },
  sell:      { label:'Sell / Dispense', short:'Sell',      icon:'pill',      view:()=>viewSell(),      wire:()=>wireSell() },
  inventory: { label:'Inventory',       short:'Inventory', icon:'package',   view:()=>viewInventory(), wire:()=>wireInventory() },
  sales:     { label:'Sales Log',       short:'Sales',     icon:'receipt',   view:()=>viewSalesLog(),  wire:()=>wireSalesLog() },
  expiry:    { label:'Expiry Watch',    short:'Expiry',    icon:'hourglass', view:()=>viewExpiry(),    wire:()=>{} },
  reports:   { label:'Reports',         short:'Reports',   icon:'barChart',  view:()=>viewReports(),   wire:()=>wireReports(), ownerOnly:true, perm:'reports' },
  team:      { label:'Team',            short:'Team',      icon:'users',     view:()=>viewTeam(),      wire:()=>wireTeam(),    ownerOnly:true },
  finance:   { label:'Finance',         short:'Finance',   icon:'wallet',    view:()=>viewFinance(),   wire:()=>wireFinance(), ownerOnly:true, perm:'finance' },
  system:    { label:'System',          short:'System',    icon:'shield',    view:()=>viewSystem(),    wire:()=>wireSystem(),  ownerOnly:true },
  settings:  { label:'Settings',        short:'Settings',  icon:'settings',  view:()=>viewSettings(),  wire:()=>wireSettings() }
};
const NAV_ORDER = ['dashboard','sell','stockin','inventory','sales','expiry','reports','team','finance','system','settings'];
const NAV_PRIMARY = ['dashboard','sell','stockin','inventory']; // shown on the phone's bottom bar; the rest live under "More"
// Sidebar groups (desktop). Pages a role can't open are left out.
const NAV_GROUPS = [['Counter', ['dashboard','sell','stockin']], ['Records', ['inventory','sales','expiry','reports']], ['Manage', ['team','finance','system','settings']]];
const isOwner = () => !!(session && session.role==='owner');
// May the logged-in person open this page? Admin-only pages, plus the super admin's ticks (perm).
const pageAllowed = id => !!PAGES[id] && (!PAGES[id].ownerOnly || isOwner()) && (!PAGES[id].perm || can(PAGES[id].perm));
// "SUPER ADMIN" / "ADMIN" / "STAFF" chip
const roleChipHtml = () => `<span class="role-chip ${isOwner()?'owner':''}">${isOwner() ? (isSuperAdmin() ? 'SUPER ADMIN' : 'ADMIN') : 'STAFF'}</span>`;
// Where each role lands after logging in: admins see the Dashboard, staff go straight to selling.
const landingTab = () => isOwner() ? 'dashboard' : 'sell';

// ---------- Render root ----------
async function render(){
  const app = document.getElementById('app');
  const lic = licenseStatus();
  if(STATE.settings.suspended){
    app.innerHTML = renderSuspendedScreen(STATE.settings.suspended);
    attachSuspendedScreenHandlers();
    return;
  }
  if(lic.configured && !lic.active){
    app.innerHTML = renderLockScreen(lic);
    attachLockScreenHandlers(lic);
    return;
  }
  const devStat = deviceStatus();
  if(devStat.gated){
    app.innerHTML = renderDeviceLockScreen(devStat);
    attachDeviceLockScreenHandlers();
    return;
  }
  if(!devStat.registered){
    if(session.role !== 'owner'){
      app.innerHTML = renderDeviceNeedsAdminScreen();
      attachDeviceNeedsAdminScreenHandlers();
      return;
    }
    await registerThisDeviceIfRoom();
  }
  if(!STATE.settings.identity){
    app.innerHTML = renderFacilitySetupScreen();
    attachFacilitySetupHandlers();
    return;
  }
  if(PAGES[currentTab] && !pageAllowed(currentTab)) currentTab = 'dashboard';

  const SHOW_NEAR_EXPIRY_BANNER = true; // warn 7 days before the trial / subscription ends
  const renewLink = can('subscription') ? ` <a data-goto="system" role="button" tabindex="0">Open System to renew →</a>` : '';
  const nearExpiryBanner = lic.inGrace
    ? alertBox(`<span class="alert-title">${lic.trial ? 'Your free trial has ended' : `Subscription for ${esc(lic.facility)} has expired`}</span>Expired on ${lic.expiryDate}. You have <strong>${lic.graceDaysLeft} day(s)</strong> left before the app locks. ${can('subscription') ? '' : 'Tell your super admin to renew it.'}${renewLink}`, 'danger')
    : (SHOW_NEAR_EXPIRY_BANNER && lic.configured && lic.active && lic.daysLeft!==null && lic.daysLeft>=0 && lic.daysLeft<=7)
      ? alertBox(`${lic.trial ? 'Your free trial' : `Subscription for <strong>${esc(lic.facility)}</strong>`} ends in <strong>${lic.daysLeft} day(s)</strong> (${lic.expiryDate}). ${can('subscription') ? (lic.trial ? 'Pick a package to keep going.' : '') : 'Ask your super admin to renew it.'}${renewLink}`, 'warning', 'clock')
      : '';
  const idn = STATE.settings.identity;
  const myAcc = findAccount(session.username) || {};
  const displayName = myAcc.fullName || session.username;
  const roleChip = roleChipHtml();
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar" aria-label="Main menu">
        <div class="side-brand">
          <img src="${RHB_LOGO}" alt="">
          <div class="side-brand-text"><strong>Reality Health Bridge</strong><span>Stock &amp; sales book</span></div>
        </div>
        <div class="side-facility">
          ${idn && idn.logo ? `<img src="${idn.logo}" alt="">` : `<span class="side-facility-ic">${icon('building')}</span>`}
          <div><strong>${esc(idn.name)}</strong><span>${esc(idn.location || 'Facility')}</span></div>
        </div>
        <nav class="tabs" id="tabs" aria-label="Pages"></nav>
        <div class="side-user">
          <div class="side-user-row">
            <span class="avatar">${esc(initials(displayName))}</span>
            <div style="min-width:0;">
              <div class="side-user-name">${esc(displayName)}</div>
              <div class="side-user-meta">${roleChip}<span>@${esc(session.username)}</span></div>
            </div>
          </div>
          <button class="side-btn js-logout" type="button">${icon('logout')}Log out</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="topbar-left">
            ${idn && idn.logo ? `<img class="facility-logo" src="${idn.logo}" alt="">` : ''}
            <div class="topbar-titles">
              <div class="topbar-eyebrow">${esc(idn.name)}${idn.slogan ? ` <span class="subtle">· ${esc(idn.slogan)}</span>` : ''}</div>
              <h1 id="pageTitle">${PAGES[currentTab] ? PAGES[currentTab].label : ''}</h1>
            </div>
          </div>
          <div class="topbar-right">
            <span class="topbar-date">${new Date().toLocaleDateString('en-GB',{weekday:'long', day:'numeric', month:'long', year:'numeric'})}</span>
            ${syncPillHtml()}
            ${installBtn()}
            ${themeToggleBtn()}
          </div>
        </header>
        <div class="content">
          ${nearExpiryBanner ? `<div class="banner-area">${nearExpiryBanner}</div>` : ''}
          ${termsBannerHtml() ? `<div class="banner-area">${termsBannerHtml()}</div>` : ''}
          <div id="annArea" class="banner-area" hidden></div>
          <div id="tabContent"></div>
          <div class="footer-note">Keep this book updated daily — NDA inspections check stock, batch &amp; expiry records.</div>
        </div>
      </div>
    </div>
    <nav class="bottom-nav" id="bottomNav" aria-label="Main menu"></nav>
  `;
  renderTabs();
  renderTabContent();
  updateSyncPill();
  renderAnnouncements();
  document.querySelectorAll('.js-logout').forEach(b=> b.onclick = doLogout);
  wireLinkButtons(app);
}

function doLogout(){
  closeModal();
  clearSession();
  session = null;
  saleCart = [];
  resetSaleDraft();
  currentTab = 'dashboard';
  authMode = 'login';
  renderAuth();
}
// ---------- Navigation ----------
function navTabs(){
  return NAV_ORDER.filter(pageAllowed).map(id => [id, PAGES[id].label]);
}
function tabBadge(id){
  if(id==='expiry') return expiringBatches(90).length;
  if(id==='inventory') return lowStockDrugs().length + outOfStockDrugs().length;
  return 0;
}
function goTab(id){
  if(!pageAllowed(id)) return;
  currentTab = id;
  closeModal();
  renderTabs();
  renderTabContent();
  window.scrollTo({ top: 0 });
}
function renderTabs(){
  const tabs = navTabs();
  const badge = (n)=> n ? `<span class="badge-count" aria-label="${n} need attention">${n}</span>` : '';
  const el = document.getElementById('tabs');
  if(el){
    const allowed = new Set(tabs.map(t=>t[0]));
    const tabBtn = id => `<button class="tab ${currentTab===id?'active':''}" data-tab="${id}" type="button" ${currentTab===id?'aria-current="page"':''}>${icon(PAGES[id].icon)}<span class="tab-lb">${PAGES[id].label}</span>${badge(tabBadge(id))}</button>`;
    el.innerHTML = NAV_GROUPS.map(([name, ids])=>{
      const mine = ids.filter(id=>allowed.has(id));
      return mine.length ? `<div class="tab-group"><div class="side-section-label">${name}</div>${mine.map(tabBtn).join('')}</div>` : '';
    }).join('');
    el.querySelectorAll('.tab').forEach(b=>{ b.onclick = ()=> goTab(b.dataset.tab); });
  }
  const bn = document.getElementById('bottomNav');
  if(bn){
    const moreIds = tabs.map(t=>t[0]).filter(i=>!NAV_PRIMARY.includes(i));
    const moreBadge = moreIds.reduce((a,i)=>a+tabBadge(i),0);
    bn.innerHTML = NAV_PRIMARY.map(id=>
      `<button class="bn-item ${currentTab===id?'active':''}" data-tab="${id}" type="button" ${currentTab===id?'aria-current="page"':''}><span class="bn-ic-wrap">${icon(PAGES[id].icon)}</span><span class="bn-lb">${PAGES[id].short}</span>${badge(tabBadge(id))}</button>`
    ).join('') + `<button class="bn-item ${moreIds.includes(currentTab)?'active':''}" id="bnMore" type="button" aria-haspopup="dialog"><span class="bn-ic-wrap">${icon('grid')}</span><span class="bn-lb">More</span>${badge(moreBadge)}</button>`;
    bn.querySelectorAll('[data-tab]').forEach(b=>{ b.onclick = ()=> goTab(b.dataset.tab); });
    document.getElementById('bnMore').onclick = openMoreSheet;
  }
}
// Phone "More" menu: the rest of the sections plus the user's own account actions.
function openMoreSheet(){
  const more = navTabs().filter(([id])=>!NAV_PRIMARY.includes(id));
  const acc = findAccount(session.username) || {};
  const displayName = acc.fullName || session.username;
  openModal(`
    <h2>Menu</h2>
    <div class="sheet-list">
      ${more.map(([id,label])=>{
        const n = tabBadge(id);
        return `<button class="sheet-item ${currentTab===id?'active':''}" type="button" data-sheet-tab="${id}">${icon(PAGES[id].icon)}<span>${label}</span>${n?`<span class="badge-count">${n}</span>`:''}</button>`;
      }).join('')}
    </div>
    <div class="sheet-account">
      <div class="sheet-user">
        <span class="avatar">${esc(initials(displayName))}</span>
        <div><div class="bold">${esc(displayName)}</div><div class="row xsmall muted">${roleChipHtml()}@${esc(session.username)}</div></div>
      </div>
      <button class="sheet-item danger" type="button" id="sheetLogoutBtn">${icon('logout')}<span>Log out</span></button>
    </div>
  `);
  document.getElementById('modalOverlay').classList.add('sheet');
  document.querySelectorAll('[data-sheet-tab]').forEach(b=>{ b.onclick = ()=> goTab(b.getAttribute('data-sheet-tab')); });
  document.getElementById('sheetLogoutBtn').onclick = doLogout;
}

function renderTabContent(){
  const c = document.getElementById('tabContent');
  if(!c) return;
  const page = PAGES[currentTab];
  if(!page || !pageAllowed(currentTab)){ currentTab = 'dashboard'; return renderTabContent(); }
  const title = document.getElementById('pageTitle');
  if(title) title.textContent = page.label;
  document.title = `${page.label} · Reality Health Bridge`;
  c.innerHTML = page.view();
  attachHandlers();
  makeTablesStackable(c);
  wirePasswordToggles(c);
  wireLinkButtons(c);
}

// ---------- Event handlers ----------
// Shared handlers run on every page; each page then wires its own.
function attachHandlers(){
  wireSalesSearch();
  const page = PAGES[currentTab];
  if(page && page.wire) page.wire();
}

// Any element with data-goto="<page>" navigates there (used by banners, quick actions, empty states).
document.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-goto]');
  if(el && session){ e.preventDefault(); goTab(el.getAttribute('data-goto')); }
});
