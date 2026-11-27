// Login / sign-up screen.

function roleHintPicker(){
  return `
    <div class="field">
      <span class="label" id="liRoleLabel">Log in as <span class="label-opt">— choose one</span></span>
      <div class="role-pick" role="radiogroup" aria-labelledby="liRoleLabel">
        <input type="radio" name="liRole" id="liRoleOwner" value="owner"><label for="liRoleOwner">${icon('shield')}<strong>Admin</strong></label>
        <input type="radio" name="liRole" id="liRoleStaff" value="staff"><label for="liRoleStaff">${icon('user')}<strong>Staff</strong></label>
      </div>
    </div>`;
}
function selectedRoleHint(){
  const r = document.querySelector('input[name="liRole"]:checked');
  return r ? r.value : '';
}

function renderAuth(){
  const app = document.getElementById('app');
  // A device with no facility on it yet cannot use the normal login: start with the welcome choice.
  if(authMode === 'login' && STATE.accounts.length === 0) authMode = 'welcome';
  if(authMode === 'welcome' || authMode === 'home') return renderLanding();
  // The first person to register on a device becomes the facility's main admin; staff and
  // other admins get their login from an admin (Team page).
  // TODO (later): one facility per device / server accounts — registering is open for now.
  if(authMode === 'join') return renderJoinPharmacy();
  const isSignup = authMode === 'signup';
  const toLoginLink = STATE.accounts.length
    ? `<div class="auth-switch">Already registered on this device? <a id="toLogin" role="button" tabindex="0">Log in</a></div>`
    : `<div class="auth-switch"><a id="toLogin" role="button" tabindex="0">← Back</a></div>`;
  const joinLink = `<div class="auth-switch">Facility already registered on another phone or computer? <a id="toJoin" role="button" tabindex="0">Log in with your facility email</a></div>`;
  const restoreLink = `
    <div class="auth-links">
      <div class="auth-switch mt-0">Have a backup file from this app? <a id="toRestorePreLogin" role="button" tabindex="0">Restore it</a></div>
    </div>
    <input type="file" id="preLoginRestoreInput" accept=".json,.txt,application/json,text/plain" hidden>`;

  const idn = STATE.settings.identity || null;   // facility already on this device (pre-filled)
  const card = isSignup ? `
    <span class="eyebrow">New facility</span>
    <h1>Register your facility</h1>
    ${joinLink}
    <p class="lead">For pharmacies, drug shops, clinics and other health facilities. Enter your facility's details and create <strong>your</strong> login. You become the facility's <strong>super admin</strong>: you see everything, control the facility profile, and create logins for up to ${MAX_STAFF_ACCOUNTS} staff and ${MAX_ADMIN_ACCOUNTS-1} more admins from the <strong>Team</strong> page, choosing what each admin may see.</p>
    <div class="auth-error" id="authError" role="alert"></div>
    <form id="signupForm" novalidate>
      <div class="form-section-title">${icon('building')} Facility details</div>
      ${idn ? `<p class="xsmall subtle" style="margin-top:-6px;">This device already holds <strong>${esc(idn.name)}</strong>'s details — they are filled in below. Change them only if they are wrong.</p>` : ''}
      <div class="form-grid cols-2">
        <div class="field span-all"><label for="rgName">Facility name</label><input type="text" id="rgName" required placeholder="e.g. Hope Drug Shop" value="${esc(idn && idn.name)}"><div class="field-hint">Exactly as on your operating licence — it is printed on receipts.</div></div>
        <div class="field"><label for="rgLocation">Location</label><input type="text" id="rgLocation" required placeholder="e.g. Kamukuzi, Mbarara" value="${esc(idn && idn.location)}"></div>
        <div class="field"><label for="rgPhone">Facility phone</label><input type="tel" id="rgPhone" inputmode="tel" required placeholder="07XX XXX XXX" value="${esc(idn && idn.contact)}"></div>
        <div class="field span-all"><label for="rgEmail">Facility email</label><input type="email" id="rgEmail" required placeholder="facility@example.com" value="${esc(idn && idn.email)}"></div>
        <div class="field span-all"><label for="rgSlogan">Slogan / motto <span class="label-opt">(optional)</span></label><input type="text" id="rgSlogan" placeholder="e.g. Your Health, Our Priority" value="${esc(idn && idn.slogan)}"></div>
        <div class="field span-all"><label for="rgLogo">Facility logo <span class="label-opt">(optional — appears on receipts)</span></label><input type="file" id="rgLogo" accept="image/*"></div>
      </div>
      ${registrationDocsFieldsHtml()}

      <div class="form-section-title">${icon('user')} Your details (super admin)</div>
      <div class="form-grid cols-2">
        <div class="field span-all"><label for="suFullName">Your full name</label><input type="text" id="suFullName" autocomplete="name" placeholder="e.g. Jane Nakato" required></div>
        <div class="field"><label for="suContact">Your phone</label><input type="tel" id="suContact" autocomplete="tel" inputmode="tel" placeholder="07XX XXX XXX" required></div>
        <div class="field"><label for="suEmail">Your email <span class="label-opt">(optional)</span></label><input type="email" id="suEmail" autocomplete="email" placeholder="jane@example.com"></div>
        ${personJobFieldsHtml('su')}
      </div>

      <div class="form-section-title">${icon('key')} Your login</div>
      <div class="field"><label for="suUsername">Username</label><input type="text" id="suUsername" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. jnakato" required></div>
      <div class="form-grid cols-2">
        ${pwField('Password', 'suPassword', { autocomplete: 'new-password', required: true, hint: 'At least 4 characters.' })}
        ${pwField('Confirm password', 'suPassword2', { autocomplete: 'new-password', required: true })}
      </div>
      <label class="perm-tick agree-tick">
        <input type="checkbox" id="rgAgree" required>
        <span>I have read and agree to the ${policyLinksHtml()} on behalf of this facility. I will make sure our staff tell patients that their details are recorded.</span>
      </label>
      <button class="btn btn-lg" type="submit">Register facility ${icon('chevronRight')}</button>
    </form>
    ${toLoginLink}
    ${restoreLink}
  ` : `
    <span class="eyebrow">Welcome back</span>
    <h1>Log in</h1>
    <p class="lead">Sign in to your facility's stock book.</p>
    <div class="auth-error" id="authError" role="alert"></div>
    ${roleHintPicker()}
    <form id="loginForm">
      <div class="field"><label for="liUsername">Username</label><input type="text" id="liUsername" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. jnakato" required></div>
      ${pwField('Password', 'liPassword', { autocomplete: 'current-password', required: true })}
      <button class="btn btn-lg" type="submit">Log in</button>
    </form>
    <p class="auth-foot">Staff member or forgotten your password? Ask your facility's admin — they create logins and reset passwords from the <strong>Team</strong> page.</p>
    <div class="register-cta">
      <div><strong>First time on this phone or computer?</strong><span>If your facility is already registered on another device, log in once with your facility email.</span></div>
      <button class="btn secondary" id="toJoinCta" type="button">${icon('download')} Log in with facility email</button>
    </div>
    <div class="register-cta">
      <div><strong>New facility?</strong><span>Register your pharmacy, drug shop or clinic and become its admin.</span></div>
      <button class="btn secondary" id="toSignup" type="button">${icon('building')} Register your facility</button>
    </div>
    ${restoreLink}
  `;

  app.innerHTML = authLayout(card, { wide: isSignup, home: true });
  wirePasswordToggles();
  wireLinkButtons(app);
  const errBox = document.getElementById('authError');
  function showError(msg){ errBox.textContent = msg; errBox.classList.remove('show'); void errBox.offsetWidth; errBox.classList.add('show'); errBox.scrollIntoView({ block:'nearest', behavior:'smooth' }); }

  const toLogin = document.getElementById('toLogin');
  if(toLogin) toLogin.onclick = ()=>{ authMode = STATE.accounts.length ? 'login' : 'welcome'; renderAuth(); };
  ['toJoin','toJoinCta'].forEach(id=>{ const el = document.getElementById(id); if(el) el.onclick = ()=>{ authMode='join'; renderAuth(); }; });

  if(isSignup){
    wireCombos(app);
    const pickedDocs = wireRegistrationDocs(showError);
    document.getElementById('signupForm').onsubmit = async (e)=>{
      e.preventDefault();
      const val = (id)=> document.getElementById(id).value.trim();
      // Facility
      const pharmacy = { name: val('rgName'), location: val('rgLocation'), contact: val('rgPhone'), email: val('rgEmail'), slogan: val('rgSlogan') };
      // Main admin
      const fullName = val('suFullName'), contact = val('suContact'), email = val('suEmail'), username = val('suUsername');
      const { position, cadre } = readPersonJobFields('su');
      const password = document.getElementById('suPassword').value;
      const password2 = document.getElementById('suPassword2').value;
      if(!pharmacy.name || !pharmacy.location || !pharmacy.contact || !pharmacy.email){ showError('Enter the facility name, location, phone and email.'); return; }
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(pharmacy.email)){ showError('Please enter a valid facility email address.'); return; }
      if(!fullName || !contact){ showError('Enter your full name and phone.'); return; }
      if(!position || !cadre){ showError('Choose or type your position at the facility and your cadre.'); return; }
      if(!username || !password){ showError('Enter a username and password.'); return; }
      if(username.length < 3){ showError('Username should be at least 3 characters.'); return; }
      if(/\s/.test(username)){ showError('Username cannot contain spaces.'); return; }
      if(findAccount(username)){ showError('That username is already taken. Choose a different one.'); return; }
      if(password.length < 4){ showError('Password should be at least 4 characters.'); return; }
      if(password !== password2){ showError('Passwords do not match.'); return; }
      if(!document.getElementById('rgAgree').checked){ showError('Please read the Privacy Policy and Terms of Use, then tick the box to agree.'); return; }

      const submitBtn = e.target.querySelector('[type=submit]');
      submitBtn.classList.add('is-loading');
      const logoFile = document.getElementById('rgLogo').files[0];
      if(logoFile){
        try{ pharmacy.logo = await resizeImageToDataUrl(logoFile); }
        catch(err){ /* logo is optional — continue without it */ }
      }
      const isNewPharmacy = !STATE.settings.identity;

      // 1) Admin account. Only the very first registration on this device is the main admin.
      const account = {username, password, role:'owner', primary: STATE.accounts.length === 0, fullName, contact, email, cadre, position, createdAt: new Date().toISOString()};
      STATE.accounts.push(account);
      await saveAccounts();

      await startSession(account, password); // before the stamp / certificates, so they carry who added them
      // The "I agree" tick: kept on this device and sent with the facility's registration on the server.
      STATE.settings.termsPending = { version:TERMS_VERSION, acceptedAt:new Date().toISOString(), acceptedBy:fullName };
      // 2) Facility profile (+ free trial and registration notice for a brand-new facility)
      const recoveryPassword = await saveFacilityIdentity(pharmacy);
      // 3) Stamp and certificates, if chosen (uploaded with everything else when online)
      try{ await saveRegistrationDocs(pickedDocs(), username); }
      catch(err){ toast(err.message + ' You can add it later in Settings.', 'error'); }
      if(isNewPharmacy){
        await startTrialLicense(pharmacy.name);
        queueRegistrationEmail(recoveryPassword); // emails REALITY HEALTH SYSTEM the new facility + its secret code
      }

      authMode = 'login';
      currentTab = landingTab();
      submitBtn.classList.remove('is-loading');
      showFacilitySavedModal(recoveryPassword, ()=> render());
    };
  } else {
    document.getElementById('toSignup').onclick = ()=>{ authMode='signup'; renderAuth(); };
    document.getElementById('loginForm').onsubmit = async (e)=>{
      e.preventDefault();
      const username = document.getElementById('liUsername').value.trim();
      const password = document.getElementById('liPassword').value;
      const roleHint = selectedRoleHint();
      if(!roleHint){ showError('Choose whether you are logging in as Admin or Staff.'); return; }
      const account = findAccount(username);
      if(!account){
        showError(`“${username}” is not on this device. If your facility was registered on another phone or computer, use “Log in with facility email” below (needs internet this first time).`);
        const cta = document.getElementById('toJoinCta'); if(cta) cta.classList.add('pulse');
        return;
      }
      if(!(await checkPassword(account, password))){ showError('Incorrect password.'); return; }
      if(roleHint && account.role !== roleHint){
        showError(`This account is registered as ${account.role==='owner'?'Admin':'Staff'}, not ${roleHint==='owner'?'Admin':'Staff'}.`);
        return;
      }
      await startSession(account, password);
      currentTab = landingTab();   // admins land on Dashboard, staff on Sell / Dispense
      await render();
    };
  }
  const toRestorePreLogin = document.getElementById('toRestorePreLogin');
  if(toRestorePreLogin){
    toRestorePreLogin.onclick = ()=> document.getElementById('preLoginRestoreInput').click();
    document.getElementById('preLoginRestoreInput').onchange = (e)=>{
      const file = e.target.files[0];
      if(file) restoreBackup(file);
      e.target.value = '';
    };
  }
}

// <a role="button"> links: make Enter/Space activate them like real buttons.
function wireLinkButtons(root=document){
  root.querySelectorAll('a[role="button"]').forEach(a=>{
    a.onkeydown = (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); a.click(); } };
  });
}

// New phone/computer for a facility that is already on the server: log in online once with the
// facility email, download its records, then work offline like any other device.
function renderJoinPharmacy(){
  const app = document.getElementById('app');
  const hasLocal = STATE.accounts.length > 0 || STATE.sales.length > 0;
  app.innerHTML = authLayout(`
    <span class="eyebrow">Existing facility</span>
    <h1>Log in to a facility that is already set up</h1>
    <p class="lead">Use this on a new phone or computer. It needs internet this first time; the facility's records are then downloaded and the device works offline too.</p>
    ${hasLocal ? alertBox('<span class="alert-title">This device already has records</span>This device will switch to the facility\'s records from the server. Always back up your data — download a backup first if you want to keep this device\'s records.', 'warning') : ''}
    <div class="auth-error" id="authError" role="alert"></div>
    <form id="joinForm">
      <div class="field"><label for="jnEmail">Facility email</label><input type="email" id="jnEmail" autocomplete="email" required placeholder="facility@example.com"></div>
      <div class="field"><label for="jnUsername">Your username</label><input type="text" id="jnUsername" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
      ${pwField('Your password', 'jnPassword', { autocomplete:'current-password', required:true })}
      <button class="btn btn-lg" type="submit">${icon('download')} Log in and download records</button>
    </form>
    <div class="auth-switch"><a id="joinBack" role="button" tabindex="0">← Back</a></div>
  `, { home: true });
  wirePasswordToggles();
  wireLinkButtons(app);
  const errBox = document.getElementById('authError');
  const showError = (msg)=>{ errBox.textContent = msg; errBox.classList.remove('show'); void errBox.offsetWidth; errBox.classList.add('show'); };
  document.getElementById('joinBack').onclick = ()=>{ authMode = STATE.accounts.length ? 'login' : 'welcome'; renderAuth(); window.scrollTo(0, 0); };
  document.getElementById('joinForm').onsubmit = async (e)=>{
    e.preventDefault();
    const email = document.getElementById('jnEmail').value.trim();
    const username = document.getElementById('jnUsername').value.trim();
    const password = document.getElementById('jnPassword').value;
    if(!email || !username || !password){ showError('Enter the facility email, your username and password.'); return; }
    if(!navigator.onLine){ showError('This needs internet the first time. Connect and try again.'); return; }
    const btn = e.target.querySelector('[type=submit]');
    btn.classList.add('is-loading');
    try{
      const user = await joinPharmacy(email, username, password);
      await startSession(findAccount(user.username) || user, password);
      authMode = 'login';
      currentTab = landingTab();
      toast('Welcome! The facility\'s records are on this device now.', 'success');
      await render();
    }catch(err){
      btn.classList.remove('is-loading');
      showError(err.message || 'Could not log in.');
    }
  };
}
