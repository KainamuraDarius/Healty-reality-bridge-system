// Privacy policy and terms of use (privacy.html, terms.html at the top of the site).
//
// - Registering a facility needs the "I agree" tick. The device keeps it (settings.termsPending)
//   and sends it with the facility's first registration on the server (register.php).
// - The server keeps which version the facility agreed to, when and by whom, and sends it to all
//   the facility's devices (facilities.terms_*, here STATE.settings.terms).
// - A facility that registered before the policy existed (or after it changed) sees a banner;
//   only its super admin can agree (Settings -> Privacy, or the banner).
// When the policy or terms change in a way people must agree to again, change TERMS_VERSION here
// AND in api/lib.php, and update the date at the top of both pages.
const TERMS_VERSION = '2026-11-27';
const PRIVACY_URL = 'privacy.html';
const TERMS_URL = 'terms.html';

// The current agreement ({version, acceptedAt, acceptedBy}) or null if the current version was not agreed to.
function termsAgreement(){
  const s = STATE.settings || {};
  if(s.terms && s.terms.version === TERMS_VERSION) return s.terms;
  if(s.termsPending && s.termsPending.version === TERMS_VERSION) return s.termsPending;
  return null;
}
// Sent with register.php: the version this device's person agreed to, or ''.
function termsVersionForServer(){
  const a = termsAgreement();
  return a ? a.version : '';
}
async function rememberTermsAgreed(byName){
  STATE.settings.termsPending = { version:TERMS_VERSION, acceptedAt:new Date().toISOString(), acceptedBy:byName || '' };
  await saveSettings();
}
function policyLinksHtml(){
  return `<a href="${PRIVACY_URL}" target="_blank" rel="noopener">Privacy Policy</a> and <a href="${TERMS_URL}" target="_blank" rel="noopener">Terms of Use</a>`;
}
function isSuperAdminNow(){
  const me = typeof currentAccount === 'function' ? currentAccount() : null;
  return !!(me && isMainAdmin(me));
}

async function privacyCall(body){
  if(!navigator.onLine) throw new ApiError(0, 'offline', 'This needs internet. Connect and try again.');
  const token = await metaGet('apiToken');
  if(!token) throw new ApiError(0, 'not_connected', 'This device is not connected to the server yet. Open System → Devices & sync first.');
  return apiPost('privacy.php', Object.assign(body, { act_by:(session && session.uid) || '', act_key:(session && session.ak) || '' }), token);
}

// Banner at the top of every page for the super admin until the current version is agreed to.
function termsBannerHtml(){
  if(termsAgreement() || !isSuperAdminNow()) return '';
  return alertBox(`<span class="alert-title">Please read and agree to our Privacy Policy and Terms of Use</span>They explain how REALITY HEALTH SYSTEM stores and protects your facility's and your patients' records, and what we and you each agree to. <a data-terms-open role="button" tabindex="0">Read and agree →</a>`, 'info', 'shield');
}

// "Read and agree" window. onDone() runs after agreeing.
function openTermsModal(onDone){
  const me = currentAccount() || {};
  openModal(`
    <h2>${icon('shield')} Privacy Policy and Terms of Use</h2>
    <p>Please open and read both before you agree. They explain what records REALITY HEALTH SYSTEM keeps for your facility, how we protect them, who can see them, how long we keep them, and how to ask us to delete them.</p>
    <div class="privacy-docs">
      <a class="btn secondary" href="${PRIVACY_URL}" target="_blank" rel="noopener">${icon('shield')} Privacy Policy</a>
      <a class="btn secondary" href="${TERMS_URL}" target="_blank" rel="noopener">${icon('fileText')} Terms of Use</a>
    </div>
    <label class="perm-tick agree-tick mt">
      <input type="checkbox" id="termsAgreeTick">
      <span>I have read and agree to the Privacy Policy and Terms of Use on behalf of <strong>${esc((STATE.settings.identity || {}).name || 'my facility')}</strong>, and our staff will tell patients that their details are recorded.</span>
    </label>
    <div class="modal-actions">
      <button class="btn secondary" type="button" id="termsLater">Later</button>
      <button class="btn" type="button" id="termsAgreeBtn" disabled>${icon('check')} I agree</button>
    </div>`);
  const tick = document.getElementById('termsAgreeTick'), btn = document.getElementById('termsAgreeBtn');
  tick.onchange = ()=>{ btn.disabled = !tick.checked; };
  document.getElementById('termsLater').onclick = closeModal;
  btn.onclick = async ()=>{
    btn.disabled = true;
    try{
      const who = me.fullName || me.username || '';
      if(await metaGet('apiToken')){
        const res = await privacyCall({ action:'accept', terms_version:TERMS_VERSION });
        if(res.terms) STATE.settings.terms = { version:res.terms.version, acceptedAt:res.terms.accepted_at, acceptedBy:res.terms.accepted_by };
      }
      await rememberTermsAgreed(who); // also sent with the registration if this device is not on the server yet
      closeModal();
      toast('Thank you. Your agreement is saved.', 'success');
      if(typeof syncNow === 'function') syncNow();
      if(onDone) onDone(); else render();
    }catch(err){
      btn.disabled = false;
      toast(err.message || 'Could not save. Please try again.', 'error');
    }
  };
}

document.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-terms-open]');
  if(el){ e.preventDefault(); openTermsModal(); }
});
document.addEventListener('keydown', (e)=>{
  if((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-terms-open]')){ e.preventDefault(); openTermsModal(); }
});
