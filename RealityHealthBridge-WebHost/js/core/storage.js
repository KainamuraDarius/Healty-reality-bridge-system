// Persistence: turns the app's in-memory STATE into database rows (js/core/localdb.js) and back.
//
// The screens keep working with STATE exactly as before (drugs, batches, sales, accounts,
// settings). Each save*() compares STATE with what is stored and writes only the records
// that really changed, marked synced = 0 so the sync can upload them.
//
// Calculated, never stored:
//   batch.qtyRemaining = qty received - sold (current sale items) + adjustments
//   sale.amountPaid    = sum of the sale's payments
const SESSION_KEY_STORAGE = 'pharmtrack_session';

function getSession(){
  try{ return JSON.parse(sessionStorage.getItem(SESSION_KEY_STORAGE)); }catch(e){ return null; }
}
function setSession(s){ sessionStorage.setItem(SESSION_KEY_STORAGE, JSON.stringify(s)); }
function clearSession(){ sessionStorage.removeItem(SESSION_KEY_STORAGE); }

// Log someone in on this device. Besides {username, role} the session keeps:
//   uid - their account id
//   ak  - their "act key", made from the password the same way as the server login key.
// Changes to people, the facility profile, stamp and certificates carry uid + ak so the server
// can check WHO made them (a phone is often shared, so the device's own login is not enough).
// Kept only in this browser tab's sessionStorage and in rows still waiting to upload.
async function startSession(account, password){
  let ak = '';
  if(account.pwSalt && password) ak = await pbkdf2B64(password, 'k:' + account.pwSalt);
  setSession({ username:account.username, role:account.role, uid:account.id || '', ak });
  session = getSession();
  return session;
}
// After changing your own password the act key changes too.
async function refreshSessionKey(account, password){
  if(!session || !account || account.username !== session.username || !account.pwSalt) return;
  session.ak = await pbkdf2B64(password, 'k:' + account.pwSalt);
  setSession(session);
}

// Ids the screens were last given, per table. A save only soft-deletes rows the screens knew
// about, so rows that arrived from another device in the meantime are never deleted by mistake.
const KNOWN = { products:new Set(), stock_batches:new Set(), sales:new Set(), users:new Set(), devices:new Set() };
// Each record exactly as the screens last got it from (or gave it to) the database. A save skips
// records that still match. Two reasons:
//  - speed: saving one new sale does not re-check tens of thousands of old ones;
//  - safety: if newer data arrived from another device while a screen still shows the older copy,
//    the unchanged older copy is never written back over it.
const SIG = { products:new Map(), stock_batches:new Map(), sales:new Map(), users:new Map(), devices:new Map(), facility:null };
const SALE_SIG = SIG.sales;
const batchSig = b => JSON.stringify(Object.assign({}, b, { qtyRemaining:undefined })); // qtyRemaining is calculated
const facilitySig = st => JSON.stringify({ identity:st.identity || null, trialUsed:!!st.trialUsed,
  license:st.license ? Object.assign({}, st.license, { devices:undefined }) : null });

// Settings that belong to the facility (synced). Everything else in STATE.settings stays on this device.
const FACILITY_SETTING_KEYS = ['identity','license','trialUsed','suspended','terms'];

const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const str = v => (v===null || v===undefined) ? '' : String(v);

// ======================================================================
// Rows -> STATE
// ======================================================================
async function buildState(){
  // Products
  STATE.drugs = liveRows('products').map(r=>({
    id:r.id, name:r.name, form:r.form, unit:r.unit, packSize:r.pack_size, reorderLevel:num(r.reorder_level)
  }));
  // Stock batches (qtyRemaining filled in by recomputeStock)
  STATE.batches = liveRows('stock_batches').map(r=>({
    id:r.id, drugId:r.product_id, batchNo:r.batch_no, expiry:r.expiry || '', costPrice:num(r.cost_price),
    sellPrice:num(r.sell_price), qtyReceived:num(r.qty_received), qtyRemaining:0,
    dateReceived:r.date_received || '', supplier:r.supplier
  }));
  // Sales with their current items and all payments
  const itemsBySale = new Map(), paysBySale = new Map();
  ROWS.sale_items.forEach(i=>{ if(!i.deleted){ if(!itemsBySale.has(i.sale_id)) itemsBySale.set(i.sale_id, []); itemsBySale.get(i.sale_id).push(i); } });
  ROWS.sale_payments.forEach(p=>{ if(!p.deleted){ if(!paysBySale.has(p.sale_id)) paysBySale.set(p.sale_id, []); paysBySale.get(p.sale_id).push(p); } });
  STATE.sales = liveRows('sales').sort((a,b)=> a.sale_date < b.sale_date ? -1 : a.sale_date > b.sale_date ? 1 : 0).map(r=>{
    const items = (itemsBySale.get(r.id) || []).filter(i=>i.sale_rev === r.items_rev)
      .sort((a,b)=> a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : (a.id < b.id ? -1 : 1));
    const pays = (paysBySale.get(r.id) || []).sort((a,b)=> a.paid_at < b.paid_at ? -1 : a.paid_at > b.paid_at ? 1 : 0);
    return {
      id:r.id, date:r.sale_date,
      items: items.map(i=>({ drugId:i.product_id, batchId:i.batch_id, qty:num(i.qty), unitPrice:num(i.unit_price), cost:num(i.cost) })),
      total:num(r.total), buyer:r.buyer, patientNo:r.patient_no, buyerContact:r.buyer_contact,
      diagnosis:r.diagnosis, additionalDetails:r.additional_details || '',
      amountPaid: pays.reduce((a,p)=>a+num(p.amount), 0),
      soldBy:r.sold_by, soldByRole:r.sold_by_role,
      paymentHistory: pays.map(p=>({ id:p.id, date:p.paid_at, amount:num(p.amount), recordedBy:p.recorded_by })),
      itemsRev:r.items_rev
    };
  });
  // Accounts
  STATE.accounts = liveRows('users').map(r=>({
    id:r.id, username:r.username, role:r.role, primary:!!r.is_primary, fullName:r.full_name, contact:r.contact,
    email:r.email, cadre:r.cadre, position:r.position || '', permissions:r.permissions || '', createdBy:r.created_by, createdAt:r.created_at, pwSalt:r.pw_salt, pwVerifier:r.pw_verifier
  }));
  // Settings = this device's own settings + the facility row + devices
  const local = await metaGet('local', {});
  const fac = FACILITY_ID ? ROWS.facilities.get(FACILITY_ID) : null;
  const devices = liveRows('devices').map(r=>({ id:r.id, label:r.label, addedDate:r.added_date || '', code:r.device_code || '' }));
  STATE.settings = Object.assign({}, local, {
    identity: fac && fac.name ? { name:fac.name, slogan:fac.slogan, location:fac.location, contact:fac.contact, email:fac.email, logo:fac.logo || undefined,
      stamp:fac.stamp || undefined, stampUpdatedAt:fac.stamp_updated_at || undefined, profileUpdatedAt:fac.profile_updated_at || undefined, syncId:fac.id } : null,
    license: fac && fac.license_expiry ? { facility:fac.license_facility, expiryDate:fac.license_expiry, trial:!!fac.license_trial,
      tier:fac.license_tier || null, maxDevices:num(fac.max_devices) || DEFAULT_MAX_DEVICES, devices,
      updatedAt:fac.license_updated_at || null, source:fac.license_source || '', code:fac.license_code || '' } : null,
    trialUsed: !!(fac && fac.trial_used),
    // Set only by REALITY HEALTH SYSTEM in the admin site.
    suspended: fac && fac.suspended ? { reason:fac.suspended_reason || '' } : null,
    // Privacy policy + terms the facility agreed to (set by the server; js/services/privacy.js).
    terms: fac && fac.terms_version ? { version:fac.terms_version, acceptedAt:fac.terms_accepted_at || '', acceptedBy:fac.terms_accepted_by || '' } : null
  });
  if(!STATE.settings.lastBackupDate) STATE.settings.lastBackupDate = null;

  KNOWN.products = new Set(STATE.drugs.map(d=>d.id));
  KNOWN.stock_batches = new Set(STATE.batches.map(b=>b.id));
  KNOWN.sales = new Set(STATE.sales.map(s=>s.id));
  KNOWN.users = new Set(STATE.accounts.map(a=>a.id));
  KNOWN.devices = new Set(devices.map(d=>d.id));
  SIG.products = new Map(STATE.drugs.map(d=>[d.id, JSON.stringify(d)]));
  SIG.stock_batches = new Map(STATE.batches.map(b=>[b.id, batchSig(b)]));
  SIG.sales.clear(); STATE.sales.forEach(s=> SIG.sales.set(s.id, JSON.stringify(s)));
  SIG.users = new Map(STATE.accounts.map(a=>[a.id, JSON.stringify(a)]));
  SIG.devices = new Map(devices.map(d=>[d.id, JSON.stringify(d)]));
  SIG.facility = fac ? facilitySig(STATE.settings) : null;
  recomputeStock();
}

// qtyRemaining for every batch, from stock received, current sale items and adjustments.
function recomputeStock(){
  const used = new Map();
  ROWS.sale_items.forEach(i=>{
    if(i.deleted) return;
    const sale = ROWS.sales.get(i.sale_id);
    if(!sale || sale.deleted || sale.items_rev !== i.sale_rev) return;
    used.set(i.batch_id, (used.get(i.batch_id) || 0) + num(i.qty));
  });
  ROWS.adjustments.forEach(a=>{
    if(a.deleted) return;
    used.set(a.batch_id, (used.get(a.batch_id) || 0) - num(a.qty_change));
  });
  STATE.batches.forEach(b=>{ b.qtyRemaining = num(b.qtyReceived) - (used.get(b.id) || 0); });
}

// ======================================================================
// STATE -> rows
// ======================================================================
async function saveDrugs(){
  const stamp = nowIso(), puts = [];
  const ids = new Set();
  STATE.drugs.forEach(d=>{
    if(!d.id) d.id = uuid();
    ids.add(d.id);
    if(SIG.products.get(d.id) === JSON.stringify(d)) return; // unchanged
    stageRow('products', { id:d.id, name:str(d.name), form:str(d.form), unit:str(d.unit), pack_size:str(d.packSize),
      reorder_level:num(d.reorderLevel), created_at:d._createdAt }, puts, stamp);
    delete d._createdAt;
    SIG.products.set(d.id, JSON.stringify(d));
  });
  KNOWN.products.forEach(id=>{ if(!ids.has(id)){ stageDelete('products', id, puts, stamp); SIG.products.delete(id); } });
  KNOWN.products = ids;
  await commitRows(puts);
}

async function saveBatches(){
  const stamp = nowIso(), puts = [];
  const ids = new Set();
  STATE.batches.forEach(b=>{
    if(!b.id) b.id = uuid();
    ids.add(b.id);
    if(SIG.stock_batches.get(b.id) === batchSig(b)) return; // unchanged
    stageRow('stock_batches', { id:b.id, product_id:b.drugId, batch_no:str(b.batchNo), expiry:b.expiry || null,
      cost_price:num(b.costPrice), sell_price:num(b.sellPrice), qty_received:num(b.qtyReceived),
      date_received:b.dateReceived || null, supplier:str(b.supplier), created_at:b._createdAt }, puts, stamp);
    delete b._createdAt;
    SIG.stock_batches.set(b.id, batchSig(b));
  });
  KNOWN.stock_batches.forEach(id=>{ if(!ids.has(id)){ stageDelete('stock_batches', id, puts, stamp); SIG.stock_batches.delete(id); } });
  KNOWN.stock_batches = ids;
  await commitRows(puts);
  recomputeStock();
}

async function saveSales(){
  const stamp = nowIso(), puts = [];
  const ids = new Set();
  let itemsBySale = null, paysBySale = null; // built only if some sale actually changed
  const indexChildren = ()=>{
    itemsBySale = new Map(); paysBySale = new Map();
    ROWS.sale_items.forEach(i=>{ if(!i.deleted){ if(!itemsBySale.has(i.sale_id)) itemsBySale.set(i.sale_id, []); itemsBySale.get(i.sale_id).push(i); } });
    ROWS.sale_payments.forEach(p=>{ if(!p.deleted){ if(!paysBySale.has(p.sale_id)) paysBySale.set(p.sale_id, []); paysBySale.get(p.sale_id).push(p); } });
  };
  const itemSig = it => [it.drugId||it.product_id, it.batchId||it.batch_id, num(it.qty), num(it.unitPrice!==undefined?it.unitPrice:it.unit_price), num(it.cost)].join('|');

  STATE.sales.forEach(s=>{
    if(!s.id) s.id = uuid();
    ids.add(s.id);
    if(SALE_SIG.get(s.id) === JSON.stringify(s)) return; // unchanged
    if(!itemsBySale) indexChildren();

    // --- items: a changed list gets a new revision; the old items are soft-deleted
    const stored = ROWS.sales.get(s.id);
    const liveItems = itemsBySale.get(s.id) || [];
    const currentItems = stored ? liveItems.filter(i=>i.sale_rev === stored.items_rev) : [];
    const wanted = (s.items || []).map(itemSig).sort().join('\n');
    const have = currentItems.map(itemSig).sort().join('\n');
    let rev = stored ? stored.items_rev : (s.itemsRev || uuid());
    if(!stored || wanted !== have){
      if(stored) rev = uuid();
      liveItems.forEach(i=> stageDelete('sale_items', i.id, puts, stamp));
      (s.items || []).forEach(it=> stageRow('sale_items', { id:uuid(), sale_id:s.id, sale_rev:rev, product_id:it.drugId,
        batch_id:it.batchId, qty:num(it.qty), unit_price:num(it.unitPrice), cost:num(it.cost) }, puts, stamp));
    }
    s.itemsRev = rev;

    // --- payments: one row per payment. If "amount paid" was edited directly, record the
    //     difference as a correction payment so the total still adds up.
    if(!Array.isArray(s.paymentHistory)) s.paymentHistory = [];
    const paid = s.amountPaid !== undefined ? num(s.amountPaid) : num(s.total);
    const sumHist = s.paymentHistory.reduce((a,p)=>a+num(p.amount), 0);
    if(Math.abs(paid - sumHist) > 0.004){
      s.paymentHistory.push({ id:uuid(), date:stamp, amount:paid - sumHist, recordedBy:(session && session.username) || '' });
    }
    s.amountPaid = paid;
    const payIds = new Set();
    s.paymentHistory.forEach(p=>{
      if(!p.id) p.id = uuid();
      payIds.add(p.id);
      stageRow('sale_payments', { id:p.id, sale_id:s.id, amount:num(p.amount), paid_at:p.date || stamp, recorded_by:str(p.recordedBy) }, puts, stamp);
    });
    (paysBySale.get(s.id) || []).forEach(p=>{ if(!payIds.has(p.id)) stageDelete('sale_payments', p.id, puts, stamp); });

    // --- the sale itself
    stageRow('sales', { id:s.id, sale_date:s.date, patient_no:str(s.patientNo), buyer:str(s.buyer), buyer_contact:str(s.buyerContact),
      diagnosis:str(s.diagnosis), additional_details:str(s.additionalDetails), total:num(s.total), sold_by:str(s.soldBy),
      sold_by_role:str(s.soldByRole), items_rev:rev, created_at:s._createdAt }, puts, stamp);
    delete s._createdAt;
    SALE_SIG.set(s.id, JSON.stringify(s));
  });
  KNOWN.sales.forEach(id=>{ if(!ids.has(id)){ stageDelete('sales', id, puts, stamp); SALE_SIG.delete(id); } });
  KNOWN.sales = ids;
  await commitRows(puts);
  recomputeStock();
}

async function saveAccounts(){
  const stamp = nowIso(), puts = [];
  const ids = new Set();
  for(const a of STATE.accounts){
    if(!a.id) a.id = uuid();
    a.primary = !!a.primary;
    ids.add(a.id);
    if(SIG.users.get(a.id) === JSON.stringify(a)) continue; // unchanged
    let loginKey = null;
    if(typeof a.password === 'string'){            // new or changed password: scramble it now
      const rec = await makePasswordRecord(a.password);
      a.pwSalt = rec.pwSalt; a.pwVerifier = rec.pwVerifier; loginKey = rec.loginKey;
      delete a.password;
    }
    const row = { id:a.id, username:str(a.username), pw_salt:str(a.pwSalt), pw_verifier:str(a.pwVerifier),
      role:a.role === 'owner' ? 'owner' : 'staff', is_primary:a.primary ? 1 : 0, full_name:str(a.fullName),
      contact:str(a.contact), email:str(a.email), cadre:str(a.cadre), position:str(a.position), permissions:a.role === 'owner' ? str(a.permissions) : '', created_by:str(a.createdBy),
      created_at:a.createdAt || undefined };
    if(loginKey) row.login_key = loginKey;          // uploaded once by the sync, then cleared
    stageRow('users', row, puts, stamp);
    SIG.users.set(a.id, JSON.stringify(a));
  }
  KNOWN.users.forEach(id=>{ if(!ids.has(id)){ stageDelete('users', id, puts, stamp); SIG.users.delete(id); } });
  KNOWN.users = ids;
  await commitRows(puts);
}

async function saveSettings(){
  const stamp = nowIso(), puts = [];
  const s = STATE.settings || {};
  // 1) This device's own settings
  const local = {};
  Object.keys(s).forEach(k=>{ if(!FACILITY_SETTING_KEYS.includes(k)) local[k] = s[k]; });
  await metaSet('local', local);

  // 2) Facility row (profile + licence)
  const idn = s.identity, lic = s.license;
  if((idn || lic || s.trialUsed) && SIG.facility !== facilitySig(s)){
    await ensureFacilityId();
    if(idn) idn.syncId = FACILITY_ID;
    stageRow('facilities', { id:FACILITY_ID,
      name:str(idn && idn.name), slogan:str(idn && idn.slogan), location:str(idn && idn.location),
      contact:str(idn && idn.contact), email:str(idn && idn.email), logo:(idn && idn.logo) || null,
      stamp:(idn && idn.stamp) || null, stamp_updated_at:(idn && idn.stampUpdatedAt) || null,
      profile_updated_at:(idn && idn.profileUpdatedAt) || null,
      license_facility:str(lic && lic.facility), license_expiry:(lic && lic.expiryDate) || null,
      license_trial:lic && lic.trial ? 1 : 0, license_tier:str(lic && lic.tier),
      max_devices:num(lic && lic.maxDevices) || DEFAULT_MAX_DEVICES, trial_used:s.trialUsed ? 1 : 0,
      license_updated_at:(lic && lic.updatedAt) || null, license_source:str(lic && lic.source), license_code:str(lic && lic.code) }, puts, stamp);
    SIG.facility = facilitySig(s);
  }
  // 3) Devices list
  if(lic){
    const ids = new Set();
    (lic.devices || []).forEach(d=>{
      ids.add(d.id);
      if(SIG.devices.get(d.id) === JSON.stringify(d)) return; // unchanged
      stageRow('devices', { id:d.id, label:str(d.label), added_date:d.addedDate || null, device_code:str(d.code) }, puts, stamp);
      SIG.devices.set(d.id, JSON.stringify(d));
    });
    KNOWN.devices.forEach(id=>{ if(!ids.has(id)){ stageDelete('devices', id, puts, stamp); SIG.devices.delete(id); } });
    KNOWN.devices = ids;
  }
  await commitRows(puts);
}

// Remove every pharmacy record from this device (used when it joins a pharmacy that is already
// on the server). This device's own settings (theme, counters, backups) are kept.
async function wipeLocalRecords(){
  await ldb.transaction('rw', SYNC_TABLES.map(t=>ldb.table(t)), async ()=>{
    for(const t of SYNC_TABLES) await ldb.table(t).clear();
  });
  SYNC_TABLES.forEach(t=>{ ROWS[t].clear(); RKEYS[t].clear(); });
  Object.values(KNOWN).forEach(set=>set.clear());
  ['products','stock_batches','sales','users','devices'].forEach(t=>SIG[t].clear());
  SIG.facility = null;
  await metaSet('apiToken', null);
  await metaSet('syncCursor', 0);
}

async function ensureFacilityId(){
  if(FACILITY_ID) return FACILITY_ID;
  FACILITY_ID = uuid();
  await metaSet('facilityId', FACILITY_ID);
  return FACILITY_ID;
}

// Stock count correction: makes the batch show `desiredRemaining` by saving an adjustment
// for the difference (never by overwriting a stored number).
async function recordStockCorrection(batch, desiredRemaining, reason){
  recomputeStock();
  const diff = Math.round(num(desiredRemaining) - num(batch.qtyRemaining));
  if(diff === 0) return;
  const stamp = nowIso(), puts = [];
  stageRow('adjustments', { id:uuid(), batch_id:batch.id, product_id:batch.drugId, qty_change:diff,
    reason:str(reason), adjusted_by:(session && session.username) || '' }, puts, stamp);
  await commitRows(puts);
  recomputeStock();
}

// ======================================================================
// Bringing in data in the OLD format: the one-time move from localStorage, and backup files.
// ======================================================================
// replace = true (backup restore): everything not in `data` is deleted on this device.
async function importOldFormatData(data, { replace=false, reason='Opening balance' } = {}){
  const base = Date.now() - 10 * 60 * 1000;
  const at = i => new Date(base + i).toISOString(); // keeps the original order of records

  const settings = Object.assign({}, data.settings || {});
  if(!FACILITY_ID && settings.identity && settings.identity.syncId && /^[A-Za-z0-9_-]{1,36}$/.test(settings.identity.syncId)){
    FACILITY_ID = settings.identity.syncId;
    await metaSet('facilityId', FACILITY_ID);
  }
  delete settings.financePassword;

  // Remember each batch's "qty remaining" from the old data - it is recreated with adjustments.
  const targetRemaining = new Map();
  (data.batches || []).forEach(b=>{ if(b && b.id && b.qtyRemaining !== undefined) targetRemaining.set(b.id, num(b.qtyRemaining)); });

  STATE.drugs = (data.drugs || []).map((d,i)=>Object.assign({}, d, { _createdAt:at(i) }));
  STATE.batches = (data.batches || []).map((b,i)=>Object.assign({}, b, { _createdAt:at(i) }));
  STATE.sales = (data.sales || []).map((s0,i)=>{
    const s = Object.assign({}, s0, { _createdAt:at(i) });
    s.date = s.date || at(i);
    const paid = s.amountPaid !== undefined ? num(s.amountPaid) : num(s.total);
    s.paymentHistory = (Array.isArray(s.paymentHistory) ? s.paymentHistory : []).map(p=>Object.assign({}, p));
    const sumHist = s.paymentHistory.reduce((a,p)=>a+num(p.amount), 0);
    if(Math.abs(paid - sumHist) > 0.004){ // older sales had no payment list: record what was paid, dated on the sale
      s.paymentHistory.unshift({ date:s.date, amount:paid - sumHist, recordedBy:s.soldBy || '' });
    }
    s.amountPaid = paid;
    return s;
  });
  STATE.accounts = (data.accounts || STATE.accounts || []).map(a=>Object.assign({}, a));
  STATE.settings = settings;

  if(replace){
    // Old adjustments are replaced by fresh "opening balance" ones below.
    const stamp = nowIso(), puts = [];
    ROWS.adjustments.forEach(a=> stageDelete('adjustments', a.id, puts, stamp));
    await commitRows(puts);
  } else {
    KNOWN.products.clear(); KNOWN.stock_batches.clear(); KNOWN.sales.clear(); KNOWN.users.clear(); KNOWN.devices.clear();
  }
  await saveSettings();
  await saveDrugs();
  await saveBatches();
  await saveSales();
  await saveAccounts();

  // One adjustment per batch so each shows the same "qty remaining" as in the old data.
  recomputeStock();
  const stamp = nowIso(), puts = [];
  STATE.batches.forEach(b=>{
    if(!targetRemaining.has(b.id)) return;
    const diff = Math.round(targetRemaining.get(b.id) - num(b.qtyRemaining));
    if(diff !== 0) stageRow('adjustments', { id:uuid(), batch_id:b.id, product_id:b.drugId, qty_change:diff,
      reason, adjusted_by:(session && session.username) || '' }, puts, stamp);
  });
  await commitRows(puts);
  await buildState();
}

function readOldLocalStorage(){
  const get = k => { try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }catch(e){ return null; } };
  const data = { drugs:get('pharm:drugs'), batches:get('pharm:batches'), sales:get('pharm:sales'),
                 accounts:get('pharm:accounts'), settings:get('pharm:settings') };
  const any = Object.values(data).some(v=>v && (Array.isArray(v) ? v.length : Object.keys(v).length));
  return any ? data : null;
}

// ======================================================================
// Start-up
// ======================================================================
async function loadState(){
  await ldb.open();
  FACILITY_ID = await metaGet('facilityId', null);
  CLOCK_OFFSET = await metaGet('clockOffset', 0) || 0;

  const moved = await metaGet('migratedFromLocalStorage', null);
  if(!moved){
    // First start with the new storage. If an earlier attempt stopped half way, start clean.
    await ldb.transaction('rw', SYNC_TABLES.map(t=>ldb.table(t)), async ()=>{
      for(const t of SYNC_TABLES) await ldb.table(t).clear();
    });
    await loadAllRows();
    const old = readOldLocalStorage();
    if(old){
      const app = document.getElementById('app');
      if(app) app.innerHTML = `<div class="panel" style="max-width:520px;margin:48px auto;text-align:center;">
        <h2>Updating your records…</h2><p class="muted">Moving your stock and sales into the new storage. This happens once and may take a minute. Please keep the app open.</p></div>`;
      FACILITY_ID = null;
      await importOldFormatData(old, { reason:'Opening balance (moved from old storage)' });
    }
    // The old localStorage copy is left in place as a safety net; it is no longer read.
    await metaSet('migratedFromLocalStorage', { at:new Date().toISOString(), hadData:!!old });
  }
  await loadAllRows();
  await buildState();
}
