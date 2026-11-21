// First-run facility profile setup.
function renderFacilitySetupScreen(){
  const isAdmin = session && session.role==='owner';
  if(!isAdmin){
    return authLayout(`
      <span class="eyebrow">One more step</span>
      <h1>Almost ready</h1>
      ${alertBox('Your admin needs to finish setting up this facility\'s profile before the app is ready to use. Please check back shortly, or ask your admin to log in.', 'info', 'building')}
      <button class="btn secondary w-full" id="facilitySetupLogoutBtn" type="button">${icon('logout')} Log out</button>
    `);
  }
  return authLayout(`
    <span class="eyebrow">Step 2 of 2 · Facility profile</span>
    <h1>Set up your facility</h1>
    <p class="lead">This name and logo appear throughout the app and on every receipt. It only needs to be done once — and it creates your facility's <strong>recovery password</strong>, used later to restore a backup.</p>
    <div class="auth-error" id="facilitySetupError" role="alert"></div>
    <form id="facilitySetupForm" novalidate>
      <div class="field"><label for="fiName">Facility name</label><input type="text" id="fiName" required placeholder="e.g. Hope Drug Shop"></div>
      <div class="field"><label for="fiSlogan">Slogan / motto <span class="label-opt">(optional)</span></label><input type="text" id="fiSlogan" placeholder="e.g. Your Health, Our Priority"></div>
      <div class="form-grid cols-2">
        <div class="field"><label for="fiLocation">Location</label><input type="text" id="fiLocation" required placeholder="e.g. Kamukuzi, Mbarara"></div>
        <div class="field"><label for="fiContact">Phone</label><input type="tel" id="fiContact" inputmode="tel" required placeholder="07XX XXX XXX"></div>
      </div>
      <div class="field"><label for="fiEmail">Facility email</label><input type="email" id="fiEmail" required autocomplete="email" placeholder="facility@example.com"><div class="field-hint">Required — used to identify your facility with REALITY HEALTH SYSTEM.</div></div>
      <div class="field"><label for="fiLogo">Facility logo <span class="label-opt">(optional)</span></label><input type="file" id="fiLogo" accept="image/*"></div>
      ${registrationDocsFieldsHtml()}
      <button class="btn btn-lg" type="submit">Save &amp; continue ${icon('chevronRight')}</button>
    </form>
  `, { wide: true });
}
function attachFacilitySetupHandlers(){
  const logoutBtn = document.getElementById('facilitySetupLogoutBtn');
  if(logoutBtn){
    logoutBtn.onclick = ()=>{ clearSession(); session = null; currentTab='dashboard'; authMode='login'; renderAuth(); };
    return;
  }
  const form = document.getElementById('facilitySetupForm');
  const errBox = document.getElementById('facilitySetupError');
  const showError = (msg)=>{ errBox.textContent = msg; errBox.classList.remove('show'); void errBox.offsetWidth; errBox.classList.add('show'); errBox.scrollIntoView({ block:'nearest', behavior:'smooth' }); };
  const pickedDocs = wireRegistrationDocs(showError);
  form.onsubmit = async (e)=>{
    e.preventDefault();
    const name = document.getElementById('fiName').value.trim();
    const slogan = document.getElementById('fiSlogan').value.trim();
    const location = document.getElementById('fiLocation').value.trim();
    const contact = document.getElementById('fiContact').value.trim();
    const email = document.getElementById('fiEmail').value.trim();
    if(!name || !location || !contact || !email){
      showError('Facility name, location, phone and a facility email are required.');
      return;
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){
      showError('Please enter a valid facility email address.');
      return;
    }
    const submitBtn = form.querySelector('[type=submit]');
    submitBtn.classList.add('is-loading');
    const logoFile = document.getElementById('fiLogo').files[0];
    let logo = null;
    if(logoFile){
      try{ logo = await resizeImageToDataUrl(logoFile); }
      catch(e){ /* logo is optional — continue without it if it fails to load */ }
    }
    const recoveryPassword = await saveFacilityIdentity({ name, slogan, location, contact, email, logo });
    try{ await saveRegistrationDocs(pickedDocs(), session && session.username); }
    catch(err){ toast(err.message + ' You can add it later in Settings.', 'error'); }
    await startTrialLicense(name);
    queueRegistrationEmail(recoveryPassword); // emails REALITY HEALTH BRIDGE the new facility + its secret code
    submitBtn.classList.remove('is-loading');
    showFacilitySavedModal(recoveryPassword, ()=> render());
  };
}

// Shown once a facility's details are saved (setup screen and Register): the recovery password
// and, for a new facility, the free-trial notice. `onContinue` runs after the user confirms.
function showFacilitySavedModal(recoveryPassword, onContinue){
  openModal(`
    <h2>Facility registered</h2>
    <p>This is your facility's <strong>recovery password</strong>. Write it down and keep it safe — anyone restoring a backup of this facility's data on a new device will be asked for it.</p>
    <div class="code-box">${recoveryPassword}</div>
    <p class="xsmall">It can only be regenerated by entering exactly the same facility name and email again, so store it somewhere safe now.</p>
    ${STATE.settings.license && STATE.settings.license.trial ? alertBox(`Your <strong>free trial</strong> has started — full access until <strong>${STATE.settings.license.expiryDate}</strong>. Pick a package any time from <strong>System</strong> to activate before it ends.`, 'success', 'gift') : ''}
    <div class="modal-actions">
      <button class="btn" id="approvalPinConfirmBtn" type="button">I've written it down — continue</button>
    </div>
  `, { locked: true }); // must confirm they've saved the password, not dismiss it
  document.getElementById('approvalPinConfirmBtn').onclick = async ()=>{ closeModal(); await onContinue(); };
}
