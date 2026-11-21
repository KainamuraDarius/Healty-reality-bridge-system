// Subscription / licence / packages and device limits.
// ---------- Subscription / License / Packages ----------
const MAX_ADMIN_ACCOUNTS = 4;   // the super admin + 3 more admins
const MAX_STAFF_ACCOUNTS = 7;
const DEFAULT_MAX_DEVICES = 5; // used only before any package/trial sets a real limit
const GRACE_DAYS = 7;          // after expiry, keep working (with a warning) this many extra days before locking

const PACKAGES = {
  starter:  { key:'starter',  label:'Starter',  devices:2, setupFee:150000 },
  standard: { key:'standard', label:'Standard', devices:5, setupFee:300000 }
};
const MONTHLY_FEE = 20000; // renewal after the first 30 days — the setup fee already covers month one

function computeLicenseCode(facility, expiryDate, maxDevices){
  const raw = LICENSE_SECRET + '|' + facility.trim().toLowerCase() + '|' + expiryDate + '|' + maxDevices;
  let hash = 0;
  for(let i=0;i<raw.length;i++){ hash = ((hash*31) + raw.charCodeAt(i)) >>> 0; }
  return hash.toString(36).toUpperCase();
}
const TRIAL_DAYS = 7;
// Every licence change records when and how it happened. The server uses this to keep licence
// changes apart from profile edits, and to check codes (see api/lib.php merge_facility).
function stampLicense(lic, source, code){
  lic.updatedAt = nowIso();
  lic.source = source;
  lic.code = code || '';
  return lic;
}
function licenseStatus(){
  const lic = STATE.settings.license;
  if(!lic || !lic.expiryDate) return {configured:false, active:true, daysLeft:null};
  const d = daysToExpiry(lic.expiryDate);
  const overdue = (d!==null && d<0) ? Math.abs(d) : 0;
  const inGrace = overdue>0 && overdue<=GRACE_DAYS;
  const hardLocked = overdue>GRACE_DAYS;
  return {
    configured:true, active: !hardLocked, daysLeft:d, expiryDate:lic.expiryDate,
    facility:lic.facility, trial: !!lic.trial, maxDevices: lic.maxDevices || DEFAULT_MAX_DEVICES,
    tier: lic.tier || null, inGrace, graceDaysLeft: inGrace ? (GRACE_DAYS-overdue) : null
  };
}
// First-time or upgrade activation by code: the code is tied to the package's device limit.
async function activatePackageLicense(facility, expiryDate, packageKey, codeEntered){
  const pkg = PACKAGES[packageKey];
  if(!pkg) return false;
  const expected = computeLicenseCode(facility, expiryDate, pkg.devices);
  if(codeEntered.trim().toUpperCase() !== expected) return false;
  const existingDevices = (STATE.settings.license && STATE.settings.license.devices) || [];
  STATE.settings.license = stampLicense({
    facility: facility.trim(), expiryDate, devices: existingDevices,
    trial:false, maxDevices: pkg.devices, tier: pkg.key
  }, 'code', codeEntered.trim().toUpperCase());
  await saveSettings();
  return true;
}
// Monthly renewal by code: keeps the package/device limit already on file, only extends the date.
async function renewLicense(expiryDate, codeEntered){
  const lic = STATE.settings.license;
  if(!lic) return false;
  const expected = computeLicenseCode(lic.facility, expiryDate, lic.maxDevices || DEFAULT_MAX_DEVICES);
  if(codeEntered.trim().toUpperCase() !== expected) return false;
  lic.expiryDate = expiryDate;
  lic.trial = false;
  stampLicense(lic, 'code', codeEntered.trim().toUpperCase());
  await saveSettings();
  return true;
}
// Starts the one-time 7-day free trial automatically when a facility finishes first-ever setup.
// The trial gets the full Standard device limit so facilities can fairly evaluate everything.
async function startTrialLicense(facilityName){
  if(STATE.settings.license || STATE.settings.trialUsed) return; // never overwrite an existing/past trial or a paid license
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + TRIAL_DAYS);
  STATE.settings.license = stampLicense({ facility: facilityName, expiryDate: expiry.toISOString().slice(0,10), devices: [], trial: true, maxDevices: PACKAGES.standard.devices, tier: null }, 'trial');
  STATE.settings.trialUsed = true;
  await saveSettings();
}

// ---------- Device limit (dynamic per facility's purchased package) ----------
function getDeviceId(){
  let id = localStorage.getItem('rhb:deviceId');
  if(!id){ id = 'dev-' + uid(); localStorage.setItem('rhb:deviceId', id); }
  return id;
}
let CURRENT_DEVICE_ID = getDeviceId();
function resetDeviceId(){
  CURRENT_DEVICE_ID = 'dev-' + uid();
  try{ localStorage.setItem('rhb:deviceId', CURRENT_DEVICE_ID); }catch(e){}
}
function deviceStatus(){
  const lic = STATE.settings.license;
  if(!lic || !lic.expiryDate) return {gated:false}; // no license configured yet — don't block
  const cap = lic.maxDevices || DEFAULT_MAX_DEVICES;
  if(!lic.devices) lic.devices = [];
  const mine = lic.devices.find(d=>d.id===CURRENT_DEVICE_ID);
  if(mine) return {gated:false, registered:true, count:lic.devices.length, cap};
  if(lic.devices.length < cap) return {gated:false, registered:false, count:lic.devices.length, cap};
  return {gated:true, registered:false, count:lic.devices.length, cap};
}
async function registerThisDeviceIfRoom(){
  const lic = STATE.settings.license;
  if(!lic || !lic.expiryDate) return;
  const cap = lic.maxDevices || DEFAULT_MAX_DEVICES;
  if(!lic.devices) lic.devices = [];
  if(lic.devices.some(d=>d.id===CURRENT_DEVICE_ID)) return;
  if(lic.devices.length >= cap) return;
  lic.devices.push({ id: CURRENT_DEVICE_ID, label: `Device ${lic.devices.length+1}`, addedDate: todayStr() });
  await saveSettings();
}
async function removeDevice(deviceId){
  const lic = STATE.settings.license;
  if(!lic || !lic.devices) return;
  lic.devices = lic.devices.filter(d=>d.id!==deviceId);
  await saveSettings();
}
async function renameDevice(deviceId, label){
  const lic = STATE.settings.license;
  if(!lic || !lic.devices) return;
  const d = lic.devices.find(x=>x.id===deviceId);
  if(d) d.label = label.trim() || d.label;
  await saveSettings();
}
