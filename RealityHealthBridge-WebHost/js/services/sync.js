// Sync engine: keeps this device and the server (api/sync.php) in step.
//
//  PUSH  every row with synced = 0 is sent in batches of 200. Rows the server confirms become
//        synced = 1. If the internet drops half way, unconfirmed rows simply stay 0 and go next time.
//  PULL  we send the highest server_seq we have; the server sends everything newer (from all of
//        this pharmacy's devices). We save it and remember the new number.
//  WHEN  on start, when the internet comes back, every 60 s while online, a few seconds after
//        any change, and when "Sync now" is pressed.
//
// Connecting a device to the server (needs internet once):
//  - a pharmacy created/kept on this device is registered automatically (register.php);
//  - a new phone for an existing pharmacy logs in with pharmacy email + username + password (login.php).
const SYNC_BATCH = 200;
const SYNC_EVERY_MS = 60 * 1000;
const SYNC_AFTER_CHANGE_MS = 4000;

const SYNC = {
  running:false, again:false,
  status:'idle',          // idle | syncing | ok | error | offline
  connection:'unknown',   // connected | not_set_up | needs_password | email_taken | device_limit | removed
  lastSyncAt:null, lastError:null, rejected:0,
  pendingRebuild:false, pendingRerender:false, debounce:null,
  current:null,           // the sync run in progress (a promise)
  paused:false            // true while this device is switching facility
};

// ---------------------------------------------------------------- server calls
class ApiError extends Error {
  constructor(status, code, message){ super(message); this.status = status; this.code = code; }
}
function apiBase(){
  const u = (window.RHB_CONFIG && window.RHB_CONFIG.API_URL) || 'api/';
  return new URL(u.endsWith('/') ? u : u + '/', location.href).href;
}
async function apiPost(endpoint, body, token){
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), 45000);
  let res;
  try{
    res = await fetch(apiBase() + endpoint, {
      method:'POST', cache:'no-store', signal:ctrl.signal, body:JSON.stringify(body),
      headers:Object.assign({ 'Content-Type':'application/json' }, token ? { Authorization:'Bearer ' + token } : {})
    });
  }catch(e){ throw new ApiError(0, 'network', 'Could not reach the server. Check the internet connection.'); }
  finally{ clearTimeout(timer); }
  let data = null;
  try{ data = await res.json(); }catch(e){ /* not JSON */ }
  if(!res.ok || !data || data.ok === false){
    throw new ApiError(res.status, (data && data.error) || ('http_' + res.status), (data && data.message) || `Server error (${res.status}).`);
  }
  return data;
}

// A row as the server wants it (no device-only fields).
function rowForServer(r){
  const o = Object.assign({}, r);
  delete o.synced; delete o.server_seq; delete o.sync_error; delete o.login_key; delete o.act_by; delete o.act_key;
  return o;
}
function deviceLabelGuess(){
  const ua = navigator.userAgent || '';
  if(/iPhone|iPad/i.test(ua)) return 'iPhone / iPad';
  if(/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android phone' : 'Android tablet';
  if(/Windows/i.test(ua)) return 'Windows computer';
  if(/Mac/i.test(ua)) return 'Mac computer';
  return 'Computer';
}

// ---------------------------------------------------------------- connection
async function saveSyncInfo(){
  await metaSet('syncInfo', { lastSyncAt:SYNC.lastSyncAt, lastError:SYNC.lastError, connection:SYNC.connection });
}
function setConnection(c){ SYNC.connection = c; updateSyncPill(); }
function mainAdminRow(){
  const owners = liveRows('users').filter(u=>u.role === 'owner');
  return owners.find(u=>u.is_primary) || owners[0] || null;
}
async function rememberLogin(res){
  await metaSet('apiToken', res.token);
  SYNC.connection = 'connected';
  await saveSyncInfo();
}
function connectionFromError(e){
  if(e.code === 'email_taken') return 'email_taken';
  if(e.code === 'already_registered') return 'needs_password';
  if(e.code === 'device_limit') return 'device_limit';
  if(e.code === 'device_other_facility') return 'needs_password';
  return null;
}

// Makes sure this device has a server token. Registers the pharmacy automatically when it can.
async function ensureConnected(){
  if(await metaGet('apiToken')) { SYNC.connection = 'connected'; return true; }
  const fac = FACILITY_ID && ROWS.facilities.get(FACILITY_ID);
  if(!fac || !fac.name){ setConnection('not_set_up'); return false; }
  if(['email_taken','device_limit','removed'].includes(SYNC.connection)) return false; // needs a person to act
  const admin = mainAdminRow();
  if(!admin || !admin.login_key){ setConnection('needs_password'); return false; }
  try{
    const res = await apiPost('register.php', { facility:rowForServer(fac), user:Object.assign(rowForServer(admin), { role:'owner', login_key:admin.login_key }),
      device_id:CURRENT_DEVICE_ID, device_label:deviceLabelGuess(), terms_version:termsVersionForServer() });
    await rememberLogin(res);
    return true;
  }catch(e){
    const c = connectionFromError(e);
    if(c){ SYNC.lastError = e.message; setConnection(c); await saveSyncInfo(); return false; }
    throw e;
  }
}

// System page: an admin types their password to connect this device (when it could not connect by itself).
// Returns 'connected', or 'other_pharmacy' when the email belongs to a pharmacy already on the server.
async function connectWithPassword(username, password){
  const acc = findAccount(username);
  if(!acc || !(await checkPassword(acc, password))) throw new ApiError(401, 'wrong_password', 'That password is not correct.');
  const fac = ROWS.facilities.get(FACILITY_ID);
  const row = ROWS.users.get(acc.id);
  if(!fac || !row) throw new ApiError(400, 'not_set_up', 'Set up the facility profile first.');
  try{
    const loginKey = await pbkdf2B64(password, 'k:' + acc.pwSalt);
    const res = await apiPost('register.php', { facility:rowForServer(fac), user:Object.assign(rowForServer(row), { role:'owner', login_key:loginKey }),
      device_id:CURRENT_DEVICE_ID, device_label:deviceLabelGuess(), terms_version:termsVersionForServer() });
    await rememberLogin(res);
  }catch(e){
    if(e.code !== 'already_registered' && e.code !== 'email_taken') throw e;
    // The pharmacy is already on the server: log in instead.
    const res = await apiPost('login.php', { email:fac.email, username, password, device_id:CURRENT_DEVICE_ID, device_label:deviceLabelGuess() });
    if(res.facility_id !== FACILITY_ID) return 'other_pharmacy';
    await rememberLogin(res);
  }
  syncNow();
  return 'connected';
}

// New phone (or replacing this device's data): log in to a pharmacy that is already on the server
// and download all its records. Anything on this device that is not on the server is replaced.
async function joinPharmacy(email, username, password){
  SYNC.paused = true;                       // no automatic sync may write old records during the switch
  try{
    while(SYNC.running) await SYNC.current;
    return await joinPharmacyNow(email, username, password);
  }finally{ SYNC.paused = false; }
}
async function joinPharmacyNow(email, username, password){
  let res;
  try{
    res = await apiPost('login.php', { email, username, password, device_id:CURRENT_DEVICE_ID, device_label:deviceLabelGuess() });
  }catch(e){
    if(e.code !== 'device_other_facility') throw e;
    resetDeviceId(); // this browser was used for another facility before: take a fresh device id
    res = await apiPost('login.php', { email, username, password, device_id:CURRENT_DEVICE_ID, device_label:deviceLabelGuess() });
  }
  await wipeLocalRecords();
  await storeAnnouncements([]);
  FACILITY_ID = res.facility_id;
  await metaSet('facilityId', FACILITY_ID);
  await metaSet('syncCursor', 0);
  await rememberLogin(res);
  await buildState();
  await syncNow({ force:true });
  if(SYNC.status !== 'ok') throw new ApiError(0, 'sync_failed', 'Logged in, but the download did not finish. Keep the internet on and press Sync now.');
  await buildState();
  return res.user;
}

// ---------------------------------------------------------------- the sync itself
// Records waiting to upload: at most `limit` of them, and at most about SYNC_MAX_BYTES (pictures
// and certificate files are big; they then go up a few per call).
const SYNC_MAX_BYTES = 3 * 1024 * 1024;
function collectPending(limit){
  const out = [];
  let bytes = 0;
  for(const t of SYNC_TABLES){
    const rows = Array.from(ROWS[t].values()).filter(r=>r.synced === 0)
      .sort((a,b)=> a.updated_at < b.updated_at ? -1 : 1);
    for(const r of rows){
      if(out.length >= limit) return out;
      const payload = rowForServer(r);
      if(t === 'users' && r.login_key) payload.login_key = r.login_key;
      if(r.act_key){ payload.act_by = r.act_by; payload.act_key = r.act_key; } // who made the change (see startSession)
      const size = (r.data ? r.data.length : 0) + (r.logo ? r.logo.length : 0) + (r.stamp ? r.stamp.length : 0) + 500;
      if(out.length && bytes + size > SYNC_MAX_BYTES) return out;
      bytes += size;
      out.push({ t, id:r.id, updated_at:r.updated_at, payload });
    }
  }
  return out;
}

async function applySyncResult(sent, res){
  // 1) Confirmations: mark synced = 1, but only if the row was not changed again meanwhile.
  const sentAt = new Map(sent.map(s=>[s.t + '|' + s.id, s.updated_at]));
  const puts = [];
  Object.entries(res.saved || {}).forEach(([t, ids])=> (ids || []).forEach(id=>{
    const cur = ROWS[t] && ROWS[t].get(id);
    if(cur && cur.synced === 0 && cur.updated_at === sentAt.get(t + '|' + id)){
      const r = Object.assign({}, cur, { synced:1 }); delete r.login_key; delete r.sync_error; delete r.act_by; delete r.act_key;
      puts.push([t, r]);
    }
  }));
  Object.entries(res.rejected || {}).forEach(([t, list])=> (list || []).forEach(x=>{
    const cur = x && ROWS[t] && ROWS[t].get(x.id);
    if(cur && cur.synced === 0 && cur.updated_at === sentAt.get(t + '|' + x.id)){
      const r = Object.assign({}, cur, { synced:2, sync_error:String(x.reason || 'rejected') }); // 2 = server refused; kept, not re-sent
      delete r.act_key; delete r.login_key;
      puts.push([t, r]);
    }
  }));
  await commitRows(puts, { fromSync:true });

  // 2) Changes from the server. Keep our own newer, not-yet-uploaded edit if there is one.
  const pulled = [];
  let n = 0;
  Object.entries(res.changes || {}).forEach(([t, rows])=>{
    if(!ROWS[t]) return;
    (rows || []).forEach(remote=>{
      n++;
      const cur = ROWS[t].get(remote.id);
      if(cur && cur.synced === 0 && cur.updated_at > remote.updated_at) return;
      pulled.push([t, Object.assign({}, remote, { synced:1 })]);
    });
  });
  await commitRows(pulled, { fromSync:true });
  return n;
}

function updateClock(serverIso, t0, t1){
  const server = Date.parse(serverIso);
  if(!isFinite(server)) return;
  const offset = server - (t0 + t1) / 2;
  CLOCK_OFFSET = Math.abs(offset) > 30000 ? Math.round(offset) : 0; // only correct clocks that are clearly wrong
  metaSet('clockOffset', CLOCK_OFFSET);
}

async function syncNow(opts = {}){
  if(SYNC.paused && !opts.force) return;
  if(SYNC.running){ SYNC.again = true; return SYNC.current; }
  if(!navigator.onLine){ SYNC.status = 'offline'; updateSyncPill(); return; }
  SYNC.running = true;
  SYNC.current = runSync();
  return SYNC.current;
}
async function runSync(){
  SYNC.status = 'syncing'; updateSyncPill();
  let gotChanges = 0;
  try{
    if(!(await ensureConnected())){ SYNC.status = 'idle'; return; }
    const token = await metaGet('apiToken');
    let cursor = (await metaGet('syncCursor', 0)) || 0;
    for(let round = 0; round < 500; round++){
      const batch = collectPending(SYNC_BATCH);
      const changes = {};
      batch.forEach(b=>{ (changes[b.t] = changes[b.t] || []).push(b.payload); });
      const t0 = Date.now();
      const res = await apiPost('sync.php', { since:cursor, changes,
        device_status:{ pending:pendingCount(), rejected:countRejected(), app_version:RHB_APP_VERSION } }, token);
      updateClock(res.server_time, t0, Date.now());
      gotChanges += await applySyncResult(batch, res);
      if(Array.isArray(res.announcements)) await storeAnnouncements(res.announcements);
      if(Array.isArray(res.notices) && res.notices.includes('email_taken'))
        toast('The new facility email was not saved: another facility already uses it. The rest of the profile was saved.', 'error');
      cursor = res.server_seq;
      await metaSet('syncCursor', cursor);
      if(!res.more && (batch.length === 0 || pendingCount() === 0)) break;
    }
    SYNC.lastSyncAt = new Date().toISOString();
    SYNC.lastError = null;
    SYNC.status = 'ok';
  }catch(e){
    if(e.status === 401){ await metaSet('apiToken', null); SYNC.connection = 'removed'; }
    SYNC.lastError = e.message || String(e);
    SYNC.status = e.code === 'network' ? 'offline' : 'error';
    console.warn('Sync:', e);
  }finally{
    SYNC.rejected = countRejected();
    SYNC.running = false;
    await saveSyncInfo();
    updateSyncPill();
    if(gotChanges) await refreshAfterRemoteChange();
    if(SYNC.again){ SYNC.again = false; setTimeout(()=>syncNow(), 300); }
  }
}

// Called by commitRows after any change made on this device.
function scheduleSync(){
  updateSyncPill();
  clearTimeout(SYNC.debounce);
  SYNC.debounce = setTimeout(()=>syncNow(), SYNC_AFTER_CHANGE_MS);
}
function countRejected(){
  let n = 0; SYNC_TABLES.forEach(t=> ROWS[t].forEach(r=>{ if(r.synced === 2) n++; })); return n;
}

// ---------------------------------------------------------------- showing new data
function modalIsOpen(){ const o = document.getElementById('modalOverlay'); return !!(o && o.classList.contains('active')); }
function userIsTyping(){
  const a = document.activeElement;
  return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && document.getElementById('app').contains(a));
}
// New rows arrived (from the server or another tab). Rebuild what the screens show - but never
// while a dialog is open (it holds the record being edited) or while someone is typing.
async function refreshAfterRemoteChange(){
  if(SYNC.paused) return; // joinPharmacy rebuilds by itself
  if(modalIsOpen()){ SYNC.pendingRebuild = true; return; }
  SYNC.pendingRebuild = false;
  await buildState();
  if(session){
    const acc = findAccount(session.username);
    if(!acc){ toast('Your login was removed by an admin.', 'error'); doLogout(); return; }
    if(acc.role !== session.role){ session.role = acc.role; setSession(session); }
  }
  if(userIsTyping()){ SYNC.pendingRerender = true; return; }
  rerenderAfterSync();
}
function rerenderAfterSync(){
  SYNC.pendingRerender = false;
  if(session) render(); else renderAuth();
}
// modal.js calls this whenever a dialog closes.
function onModalClosed(){ if(SYNC.pendingRebuild) setTimeout(refreshAfterRemoteChange, 0); }

// ---------------------------------------------------------------- status pill
function timeAgo(iso){
  if(!iso) return 'never';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if(s < 60) return 'just now';
  if(s < 3600) return `${Math.floor(s/60)} min ago`;
  if(s < 86400) return `${Math.floor(s/3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
}
function syncStatusInfo(){
  const n = pendingCount();
  const waiting = n ? ` · ${n} record${n===1?'':'s'} waiting` : '';
  const c = SYNC.connection;
  if(c === 'not_set_up') return { cls:'muted', short:'Not connected', text:'Not connected to the server yet' };
  if(c === 'needs_password' || c === 'email_taken' || c === 'device_limit' || c === 'removed'){
    const why = { needs_password:'Connect this device in System', email_taken:'Facility email already on the server — see System',
      device_limit:'Device limit reached — see System', removed:'Logged out of the server — log in again in System' }[c];
    return { cls:'warn', short:'Not connected', text:`${why}${waiting}` };
  }
  if(!navigator.onLine || SYNC.status === 'offline') return { cls:'offline', short:n ? `Offline · ${n}` : 'Offline', text:`Offline – saving on this device${waiting}` };
  if(SYNC.status === 'syncing') return { cls:'busy', short:'Syncing…', text:'Syncing…' };
  if(SYNC.status === 'error') return { cls:'warn', short:'Sync failed', text:`Sync failed – will retry${waiting}` };
  if(!SYNC.lastSyncAt) return { cls:'muted', short:n ? `${n} waiting` : 'Not synced', text:`Not synced yet${waiting}` };
  return { cls:n ? 'busy' : 'ok', short:n ? `${n} waiting` : 'Synced', text:`Last synced ${timeAgo(SYNC.lastSyncAt)}${waiting || ' · all saved'}` };
}
function syncPillHtml(){
  return `<button type="button" class="sync-pill" data-action="sync-now" title="Sync now"></button>`;
}
function updateSyncPill(){
  const info = syncStatusInfo();
  document.querySelectorAll('.sync-pill').forEach(el=>{
    el.className = 'sync-pill is-' + info.cls;
    el.title = info.text + ' — tap to sync now';
    el.innerHTML = `<span class="sync-dot" aria-hidden="true"></span><span class="sp-long">${esc(info.text)}</span><span class="sp-short">${esc(info.short)}</span>`;
  });
  const sys = document.getElementById('sysSyncStatus');
  if(sys) sys.textContent = info.text;
}

// ---------------------------------------------------------------- start-up
async function startSyncEngine(){
  await loadAnnouncements();
  renderAnnouncements();
  const info = await metaGet('syncInfo', null);
  if(info){ SYNC.lastSyncAt = info.lastSyncAt; SYNC.lastError = info.lastError; SYNC.connection = info.connection || 'unknown'; }
  if(await metaGet('apiToken')) SYNC.connection = 'connected';
  SYNC.rejected = countRejected();
  window.addEventListener('online', ()=>{ SYNC.status = 'idle'; syncNow(); });
  window.addEventListener('offline', ()=>{ SYNC.status = 'offline'; updateSyncPill(); });
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState === 'visible') syncNow(); });
  document.addEventListener('click', (e)=>{ const x = e.target.closest('[data-ann-close]'); if(x) dismissAnnouncement(Number(x.dataset.annClose)); });
  document.addEventListener('click', (e)=>{ if(e.target.closest('[data-action="sync-now"]')){ SYNC.connection === 'connected' || SYNC.connection === 'unknown' ? syncNow() : (session && isOwner() ? goTab('system') : syncNow()); } });
  setInterval(()=>{
    updateSyncPill();
    if(SYNC.pendingRerender && !userIsTyping() && !modalIsOpen()) rerenderAfterSync();
  }, 30000);
  setInterval(()=>{ if(navigator.onLine && document.visibilityState === 'visible') syncNow(); }, SYNC_EVERY_MS);
  setTimeout(()=>syncNow(), 1500);
}

// ---------------------------------------------------------------- messages from RHS
// Made on the RHS admin site, delivered with every sync, kept on the device so they show offline too.
let ANNOUNCEMENTS = [];   // [{id, title, body, level, who, dismissible, stamp}]
let ANN_DISMISSED = {};   // id -> stamp of the copy this device closed (a "show again" gives a new stamp)
async function loadAnnouncements(){
  ANNOUNCEMENTS = (await metaGet('announcements', [])) || [];
  ANN_DISMISSED = (await metaGet('annDismissed', {})) || {};
}
async function storeAnnouncements(list){
  const clean = list.filter(a=> a && a.id && a.title).map(a=>({
    id:Number(a.id), title:String(a.title), body:String(a.body || ''),
    level:['info','warning','urgent'].includes(a.level) ? a.level : 'info',
    who:a.who === 'owners' ? 'owners' : 'all', dismissible:a.dismissible !== false, stamp:String(a.stamp || '') }));
  if(JSON.stringify(clean) === JSON.stringify(ANNOUNCEMENTS)) return;
  ANNOUNCEMENTS = clean;
  await metaSet('announcements', clean);
  const keep = {}; // forget "closed" marks of messages that have ended
  clean.forEach(a=>{ if(ANN_DISMISSED[a.id]) keep[a.id] = ANN_DISMISSED[a.id]; });
  ANN_DISMISSED = keep;
  await metaSet('annDismissed', keep);
  renderAnnouncements();
}
function visibleAnnouncements(){
  if(!session) return [];
  return ANNOUNCEMENTS.filter(a=> (a.who !== 'owners' || isOwner()) && !(a.dismissible && ANN_DISMISSED[a.id] === a.stamp));
}
function renderAnnouncements(){
  const box = document.getElementById('annArea');
  if(!box) return;
  const list = visibleAnnouncements();
  box.innerHTML = list.map(a=>{
    const tone = a.level === 'urgent' ? 'danger' : a.level === 'warning' ? 'warning' : 'info';
    return `<div class="alert alert-${tone} ann" data-ann="${a.id}" role="status">${icon(a.level === 'info' ? 'info' : 'alert')}
      <div class="alert-body"><span class="alert-title">${esc(a.title)}</span>${a.body ? `<span class="ann-text">${esc(a.body)}</span>` : ''}<span class="ann-from">From Reality Health System</span></div>
      ${a.dismissible ? `<button class="ann-close" type="button" data-ann-close="${a.id}" aria-label="Close this message" title="Close">×</button>` : ''}</div>`;
  }).join('');
  box.hidden = list.length === 0;
}
async function dismissAnnouncement(id){
  const a = ANNOUNCEMENTS.find(x=> x.id === id);
  if(!a || !a.dismissible) return;
  ANN_DISMISSED[id] = a.stamp;
  await metaSet('annDismissed', ANN_DISMISSED);
  renderAnnouncements();
}
