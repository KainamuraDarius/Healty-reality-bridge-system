// Facility identity (set up once by the first admin).
// ---------- Facility Identity (set up once by the first admin) ----------
// Changing this value invalidates every recovery password already written down by clients.
const FACILITY_RECOVERY_SECRET = 'RHB-FACILITY-RECOVERY-2026';
function computeRecoveryPassword(identity){
  const raw = FACILITY_RECOVERY_SECRET + '|' + (identity.name||'').trim().toLowerCase() + '|' + (identity.email||'').trim().toLowerCase();
  let hash = 0;
  for(let i=0;i<raw.length;i++){ hash = ((hash*31) + raw.charCodeAt(i)) >>> 0; }
  const code = hash.toString(36).toUpperCase().padStart(8,'0').slice(0,8);
  return `${code.slice(0,4)}-${code.slice(4,8)}`;
}
async function saveFacilityIdentity(identity){
  const prior = STATE.settings.identity || {};
  STATE.settings.identity = {
    name: identity.name.trim(), slogan: (identity.slogan||'').trim(),
    location: (identity.location||'').trim(), contact: (identity.contact||'').trim(),
    email: (identity.email||'').trim(),
    logo: identity.logo !== undefined ? identity.logo : prior.logo, // keep existing logo unless a new one was uploaded
    stamp: identity.stamp !== undefined ? identity.stamp : prior.stamp, // the stamp is changed with setFacilityStamp()
    stampUpdatedAt: identity.stamp !== undefined ? nowIso() : prior.stampUpdatedAt,
    profileUpdatedAt: nowIso(), // the server takes the profile with the newest time, from the super admin only
    syncId: prior.syncId || FACILITY_ID // the facility id shared by every device of this pharmacy (set in saveSettings)
  };
  await saveSettings();
  return computeRecoveryPassword(STATE.settings.identity);
}
