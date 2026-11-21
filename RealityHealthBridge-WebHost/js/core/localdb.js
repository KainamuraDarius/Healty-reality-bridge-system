// On-device database (IndexedDB via Dexie). Same tables and columns as MySQL, plus:
//   synced = 0  -> changed on this device, waiting to upload
//   synced = 1  -> the server has it
// `meta` holds this device's own settings (not synced): facility id, patient-number counters,
// last backup date, sync cursor, etc.
//
// ROWS keeps an in-memory copy of every row so the app can read instantly. All writes go
// to IndexedDB first, then ROWS is updated.
const SYNC_TABLES = ['facilities','users','devices','products','stock_batches','sales','sale_items','sale_payments','adjustments','facility_documents'];

const ldb = new Dexie('rhb');
ldb.version(1).stores({
  facilities:    'id, synced',
  users:         'id, synced',
  devices:       'id, synced',
  products:      'id, synced',
  stock_batches: 'id, synced, product_id',
  sales:         'id, synced',
  sale_items:    'id, synced, sale_id',
  sale_payments: 'id, synced, sale_id',
  adjustments:   'id, synced, batch_id',
  meta:          'key'
});
// v2: the facility's operational certificates (pictures / PDFs).
ldb.version(2).stores({ facility_documents: 'id, synced' });

const ROWS = {};   // table -> Map(id -> row)
const RKEYS = {};  // table -> Map(id -> content fingerprint), to spot real changes
SYNC_TABLES.forEach(t=>{ ROWS[t] = new Map(); RKEYS[t] = new Map(); });

let FACILITY_ID = null;  // this device's pharmacy id (meta 'facilityId')
let CLOCK_OFFSET = 0;    // ms to add to this device's clock (set from the server in sync)
let _lastStamp = 0;

// Columns that describe WHEN/WHERE a row was saved rather than WHAT it says.
const ROW_META_FIELDS = new Set(['facility_id','device_id','created_at','updated_at','synced','server_seq','login_key','last_seen_at','sync_error','act_by','act_key']);
// Rows whose changes must say who made them (checked by the server, see startSession()).
const ACT_TABLES = new Set(['users','facilities','facility_documents']);
function stampActor(table, row){
  if(!ACT_TABLES.has(table)) return row;
  if(typeof session !== 'undefined' && session && session.ak && session.uid){ row.act_by = session.uid; row.act_key = session.ak; }
  return row;
}
function rowFingerprint(row){
  return JSON.stringify(Object.keys(row).filter(k=>!ROW_META_FIELDS.has(k)).sort()
    .map(k=>{ const v = row[k]; return [k, (v===null || v===undefined) ? '' : v]; }));
}

// UTC timestamp that always moves forward on this device, even if two saves land in the same ms.
function nowIso(){
  const t = Math.max(Date.now() + CLOCK_OFFSET, _lastStamp + 1);
  _lastStamp = t;
  return new Date(t).toISOString();
}

async function metaGet(key, fallback=null){
  const r = await ldb.meta.get(key);
  return r ? r.value : fallback;
}
async function metaSet(key, value){ await ldb.meta.put({ key, value }); }

async function loadAllRows(){
  for(const t of SYNC_TABLES){
    const rows = await ldb.table(t).toArray();
    ROWS[t] = new Map(rows.map(r=>[r.id, r]));
    RKEYS[t] = new Map(rows.map(r=>[r.id, rowFingerprint(r)]));
  }
}

// Live (not deleted) rows of a table, oldest first.
function liveRows(table){
  return Array.from(ROWS[table].values()).filter(r=>!r.deleted)
    .sort((a,b)=> a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : (a.id < b.id ? -1 : 1));
}

// Build the row to save for `desired` (its content columns), if it differs from what is stored.
// Returns null when nothing changed.
function stageRow(table, desired, puts, stamp){
  const existing = ROWS[table].get(desired.id);
  const merged = Object.assign({}, existing || {}, desired);
  merged.deleted = desired.deleted ? 1 : 0; // saving a record always brings it back if it was deleted
  if(existing && RKEYS[table].get(desired.id) === rowFingerprint(merged) && !desired.login_key) return null;
  merged.facility_id = FACILITY_ID;
  merged.device_id = CURRENT_DEVICE_ID;
  merged.created_at = desired.created_at || (existing && existing.created_at) || stamp;
  merged.updated_at = stamp;
  merged.synced = 0;
  merged.server_seq = (existing && existing.server_seq) || 0;
  stampActor(table, merged);
  puts.push([table, merged]);
  return merged;
}
// Mark a stored row deleted (soft delete - other devices must learn about it).
function stageDelete(table, id, puts, stamp){
  const existing = ROWS[table].get(id);
  if(!existing || existing.deleted) return;
  puts.push([table, stampActor(table, Object.assign({}, existing, { deleted:1, updated_at:stamp, device_id:CURRENT_DEVICE_ID, synced:0 }))]);
}

// Write staged rows to IndexedDB in one transaction, then update the in-memory copy.
// Changes made on this device ask the sync to run soon; other open tabs are told to reload.
async function commitRows(puts, { fromSync=false } = {}){
  if(!puts.length) return;
  const byTable = {};
  puts.forEach(([t, r])=>{ (byTable[t] = byTable[t] || []).push(r); });
  const tables = Object.keys(byTable);
  await ldb.transaction('rw', tables.map(t=>ldb.table(t)), async ()=>{
    for(const t of tables) await ldb.table(t).bulkPut(byTable[t]);
  });
  puts.forEach(([t, r])=>{ ROWS[t].set(r.id, r); RKEYS[t].set(r.id, rowFingerprint(r)); });
  try{ if(TAB_CHANNEL) TAB_CHANNEL.postMessage('rows-changed'); }catch(e){}
  if(!fromSync && typeof scheduleSync === 'function') scheduleSync();
}

// Several tabs of the app open at once: when one saves, the others reload from IndexedDB.
const TAB_CHANNEL = ('BroadcastChannel' in window) ? new BroadcastChannel('rhb-rows') : null;
let _tabReload = null;
if(TAB_CHANNEL) TAB_CHANNEL.onmessage = ()=>{
  clearTimeout(_tabReload);
  _tabReload = setTimeout(async ()=>{
    FACILITY_ID = await metaGet('facilityId', null);
    await loadAllRows();
    if(typeof refreshAfterRemoteChange === 'function') refreshAfterRemoteChange();
  }, 300);
};

// How many records are waiting to upload.
function pendingCount(){
  let n = 0;
  SYNC_TABLES.forEach(t=> ROWS[t].forEach(r=>{ if(r.synced === 0) n++; }));
  return n;
}
