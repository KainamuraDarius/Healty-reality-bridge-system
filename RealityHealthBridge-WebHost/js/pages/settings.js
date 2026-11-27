// Settings page (everyone): the pharmacy's profile (admins), your own account and password,
// and how the app looks. Moved here from System so System is about the subscription,
// backups, devices and support.
let settingsTab = '';

function settingsTabs(){
  return [
    isOwner() && ['pharmacy', 'Facility profile', 'building', 'Name, logo and contacts on receipts'],
    isOwner() && ['docs', 'Stamp & certificates', 'stamp', 'Stamp on printouts, operating licences'],
    can('subscription') && ['go-plan', 'Subscription & plans', 'card', 'In System → Subscription'],
    can('backup') && ['go-backup', 'Data backup', 'database', 'In System → Backup'],
    ['account', 'My account', 'user', 'Your details and password'],
    ['appearance', 'Appearance', 'sun', 'Light or dark screen'],
    ['feedback', 'Feedback & rating', 'star', 'Rate the app, tell us what to improve'],
    ['privacy', 'Privacy', 'shield', 'Privacy policy, terms, deleting your data'],
  ].filter(Boolean);
}

function viewSettings(){
  const tabs = settingsTabs();
  if(!tabs.find(t=>t[0]===settingsTab) || settingsTab.startsWith('go-')) settingsTab = tabs[0][0];
  const body = { pharmacy: settingsPharmacyHtml, docs: settingsDocsHtml, account: settingsAccountHtml, appearance: settingsAppearanceHtml, feedback: settingsFeedbackHtml, privacy: settingsPrivacyHtml }[settingsTab]();
  return `
  <div class="set-layout">
    <nav class="panel set-nav" aria-label="Settings sections">
      ${tabs.map(([id, label, ic, sub])=>`
        <button type="button" class="set-tab ${id===settingsTab?'active':''} ${id.startsWith('go-')?'is-link':''}" data-set-tab="${id}" ${id===settingsTab?'aria-current="page"':''}>
          <span class="set-tab-ic">${icon(ic)}</span><span><strong>${label}</strong><small>${sub}</small></span>${id.startsWith('go-') ? icon('arrowRight') : ''}
        </button>`).join('')}
    </nav>
    <div class="set-body">${body}</div>
  </div>`;
}

// ---------- Facility profile (admins) ----------
// The SUPER ADMIN (who registered the facility) owns the profile and changes it here; the server
// only accepts profile changes made by them (api/lib.php merge_facility). Other admins see it
// read-only. REALITY HEALTH SYSTEM can still fix it from the admin site in an emergency.
function settingsPharmacyHtml(){
  return isSuperAdmin() ? settingsPharmacyFormHtml() : settingsPharmacyViewHtml();
}
function settingsPharmacyViewHtml(){
  const id = STATE.settings.identity || {};
  const row = (label, v)=> `<div><dt>${label}</dt><dd>${v ? esc(v) : '<span class="subtle">—</span>'}</dd></div>`;
  return `
  <section class="panel">
    <div class="card-header"><h2>${icon('building')} Facility profile</h2><span class="hint">${icon('lock')} Only the super admin can change it</span></div>
    <div class="set-split">
      <div>
        <div class="prof-head">
          ${id.logo ? `<img src="${id.logo}" alt="Facility logo" class="prof-logo">` : `<span class="prof-logo logo-empty">${icon('building')}</span>`}
          <div><h3>${esc(id.name || '—')}</h3>${id.slogan ? `<p>${esc(id.slogan)}</p>` : ''}</div>
        </div>
        <dl class="acct-details">${row('Location', id.location)}${row('Phone', id.contact)}${row('Facility email', id.email)}</dl>
        ${alertBox(`<span class="alert-title">Need to change something?</span>The facility's name, contacts and logo are changed by the facility's <strong>super admin</strong>${mainAdmin() ? ` (${esc(mainAdmin().fullName || mainAdmin().username)})` : ''}. Every device updates by itself.`, 'info', 'info')}
        ${can('backup') ? `<div class="recovery-box">
          <div><strong>${icon('key')} Recovery password</strong><p class="xsmall subtle">Needed to restore a backup file. Keep it private.</p></div>
          <button type="button" class="btn small secondary" id="showRecoveryBtn">${icon('eye')} Show</button>
        </div>` : ''}
      </div>
      <aside class="set-preview" aria-label="Receipt preview">
        <span class="set-preview-label">How your receipts start</span>
        <div class="receipt-doc">${receiptHeaderPreview(id)}</div>
      </aside>
    </div>
  </section>`;
}
function settingsPharmacyFormHtml(){
  const id = STATE.settings.identity || {};
  return `
  <section class="panel">
    <div class="card-header"><h2>${icon('building')} Facility profile</h2><span class="hint">${icon('shield')} You are the super admin</span></div>
    <p class="muted small" style="margin-top:-6px;">Only you can change these details. They print on every receipt and report, and every device of the facility updates by itself. Changing the <strong>name or email</strong> also changes the facility's recovery password.</p>
    <div class="set-split">
      <form id="facilityProfileForm">
        <div class="form-grid cols-2">
          <div class="field span-all"><label for="fpName">Facility name</label><input type="text" id="fpName" value="${esc(id.name)}" required></div>
          <div class="field span-all"><label for="fpSlogan">Slogan / motto <span class="label-opt">(optional)</span></label><input type="text" id="fpSlogan" value="${esc(id.slogan)}"></div>
          <div class="field"><label for="fpLocation">Location</label><input type="text" id="fpLocation" value="${esc(id.location)}" required></div>
          <div class="field"><label for="fpContact">Phone</label><input type="tel" id="fpContact" value="${esc(id.contact)}" required></div>
          <div class="field span-all"><label for="fpEmail">Facility email</label><input type="email" id="fpEmail" value="${esc(id.email)}" required></div>
          <div class="field span-all">
            <label for="fpLogo">Logo <span class="label-opt">(optional — square pictures look best)</span></label>
            <div class="logo-row">
              ${id.logo ? `<img src="${id.logo}" alt="Current logo" class="logo-preview" id="fpLogoPreview">` : `<span class="logo-preview logo-empty" id="fpLogoPreview">${icon('building')}</span>`}
              <input type="file" id="fpLogo" accept="image/*">
            </div>
          </div>
        </div>
        <button class="btn cta" type="submit">${icon('check')} Save profile</button>
        <div class="recovery-box mt-4">
          <div><strong>${icon('key')} Recovery password</strong><p class="xsmall subtle">Needed to restore a backup file. Keep it private.</p></div>
          <button type="button" class="btn small secondary" id="showRecoveryBtn">${icon('eye')} Show</button>
        </div>
      </form>
      <aside class="set-preview" aria-label="Receipt preview">
        <span class="set-preview-label">Receipt preview</span>
        <div class="receipt-doc" id="fpPreview">${receiptHeaderPreview(id)}</div>
      </aside>
    </div>
  </section>`;
}
function receiptHeaderPreview(id){
  return `
    ${id.logo ? `<div class="rc-logo"><img src="${id.logo}" alt=""></div>` : ''}
    <div class="rc-title">${esc(id.name || 'Your facility')}</div>
    ${id.slogan ? `<div class="rc-sub">${esc(id.slogan)}</div>` : ''}
    <div class="rc-sub">${esc(id.location || '')}${id.contact ? ` · Tel: ${esc(id.contact)}` : ''}</div>
    <div class="rc-kind">Receipt</div>
    <hr>
    <div class="rc-row"><span>Paracetamol × 2</span><span>1,000</span></div>
    <div class="rc-row"><span>ORS sachet × 3</span><span>1,500</span></div>
    <hr>
    <div class="rc-row rc-total"><span>TOTAL</span><span>UGX 2,500</span></div>
    <div class="rc-foot">Thank you · get well soon</div>`;
}

// ---------- My account (everyone) ----------
function settingsAccountHtml(){
  const acc = findAccount(session.username) || {};
  const name = acc.fullName || session.username;
  const row = (label, v)=> `<div><dt>${label}</dt><dd>${v ? esc(v) : '<span class="subtle">—</span>'}</dd></div>`;
  return `
  <section class="panel">
    <div class="acct-card">
      <span class="avatar acct-avatar">${esc(initials(name))}</span>
      <div class="acct-main">
        <h2>${esc(name)}</h2>
        <div class="row xsmall">${roleChipHtml()}<span class="mono">@${esc(session.username)}</span></div>
      </div>
    </div>
    <dl class="acct-details">
      ${row('Access', isOwner() ? (isMainAdmin(acc) ? 'Super admin — sees and controls everything' : `Admin — ${permsOf(acc).length ? PERMISSIONS.filter(p=>permsOf(acc).includes(p[0])).map(p=>p[1]).join(', ') : 'no extra areas allowed yet'}`) : 'Staff')}${row('Position', acc.position)}${row('Cadre', acc.cadre)}${row('Phone', acc.contact)}${row('Email', acc.email)}${row('Facility', (STATE.settings.identity||{}).name)}
    </dl>
    <p class="xsmall subtle mb-0">${isOwner() ? 'Change names, positions and contacts of everyone (including yourself) on the <a data-goto="team" role="button" tabindex="0">Team</a> page.' : 'To change your name, position or phone, ask your facility admin.'}</p>
  </section>

  <section class="panel">
    <div class="card-header"><h2>${icon('key')} Change my password</h2></div>
    <form id="changeOwnPasswordForm">
      <div class="form-grid cols-3">
        ${pwField('Current password', 'copCurrent', { required: true, autocomplete: 'current-password' })}
        ${pwField('New password', 'copNew', { required: true, autocomplete: 'new-password' })}
        ${pwField('Confirm new password', 'copConfirm', { required: true, autocomplete: 'new-password' })}
      </div>
      <p class="xsmall subtle">Use at least 4 characters. The new password works on every device of this facility after they sync.</p>
      <button class="btn" type="submit">${icon('key')} Update my password</button>
    </form>
  </section>`;
}

// ---------- Appearance (everyone) ----------
function settingsAppearanceHtml(){
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const opt = (v, label, sub)=> `
    <button type="button" class="theme-opt ${cur===v?'active':''}" data-set-theme="${v}" aria-pressed="${cur===v}">
      <span class="theme-mock ${v}"><i></i><b></b><b></b><b></b></span>
      <span><strong>${label}</strong><small>${sub}</small></span>
    </button>`;
  return `
  <section class="panel">
    <div class="card-header"><h2>${icon('sun')} Appearance</h2><span class="hint">This device only</span></div>
    <div class="theme-opts">
      ${opt('light', 'Light', 'Best in a bright shop or daylight')}
      ${opt('dark', 'Dark', 'Easier on the eyes at night, saves battery')}
    </div>
  </section>`;
}

function wireSettings(){
  document.querySelectorAll('[data-set-tab]').forEach(b=> b.onclick = ()=>{
    const t = b.dataset.setTab;
    if(t === 'go-plan' || t === 'go-backup'){ sysTab = t === 'go-plan' ? 'plan' : 'backup'; goTab('system'); return; } // shortcuts to System
    settingsTab = t; renderTabContent();
  });
  document.querySelectorAll('[data-set-theme]').forEach(b=> b.onclick = ()=>{ setTheme(b.dataset.setTheme); renderTabContent(); });

  if(settingsTab === 'docs') wireSettingsDocs();
  if(settingsTab === 'feedback') wireSettingsFeedback();
  if(settingsTab === 'privacy') wireSettingsPrivacy();
  const rec = document.getElementById('showRecoveryBtn');
  if(rec) rec.onclick = ()=>{
    const pw = computeRecoveryPassword(STATE.settings.identity || {});
    rec.outerHTML = `<span class="code-box recovery-code">${esc(pw)}</span>`;
  };
  const form = document.getElementById('facilityProfileForm');
  if(form){
    // live receipt preview while typing
    const v = id => document.getElementById(id).value.trim();
    let logo = (STATE.settings.identity || {}).logo || '';
    const preview = ()=>{ document.getElementById('fpPreview').innerHTML = receiptHeaderPreview({ name:v('fpName'), slogan:v('fpSlogan'), location:v('fpLocation'), contact:v('fpContact'), logo }); };
    form.addEventListener('input', preview);
    document.getElementById('fpLogo').onchange = async (e)=>{
      const f = e.target.files[0]; if(!f) return;
      try{ logo = await resizeImageToDataUrl(f); preview(); }catch(err){ toast('Could not read that image.', 'error'); }
    };
    form.onsubmit = async (e)=>{
      e.preventDefault();
      const name = v('fpName'), slogan = v('fpSlogan'), location = v('fpLocation'), contact = v('fpContact'), email = v('fpEmail');
      if(!name || !location || !contact || !email){ toast('Name, location, phone and a facility email are required.', 'error'); return; }
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){ toast('Please enter a valid facility email address.', 'error'); return; }
      const payload = { name, slogan, location, contact, email };
      const logoFile = document.getElementById('fpLogo').files[0];
      if(logoFile){
        try{ payload.logo = await resizeImageToDataUrl(logoFile); }
        catch(err){ toast('Could not read that image — profile saved without changing the logo.'); }
      }
      const recoveryPassword = await saveFacilityIdentity(payload);
      openModal(`
        <h2>Facility profile saved</h2>
        <p>Your facility's standard recovery password is now:</p>
        <div class="code-box">${recoveryPassword}</div>
        <p class="xsmall">Write this down — the previous recovery password no longer works.</p>
        <div class="modal-actions"><button class="btn" id="facilityProfileCloseBtn" type="button">Done</button></div>
      `);
      document.getElementById('facilityProfileCloseBtn').onclick = ()=>{ closeModal(); render(); };
      if(SYNC.connection === 'email_taken'){ SYNC.connection = 'unknown'; syncNow(); } // try connecting with the corrected details
    };
  }

  const pw = document.getElementById('changeOwnPasswordForm');
  if(pw){
    pw.onsubmit = async (e)=>{
      e.preventDefault();
      const current = document.getElementById('copCurrent').value;
      const next = document.getElementById('copNew').value;
      const confirmPw = document.getElementById('copConfirm').value;
      const acc = findAccount(session.username);
      if(!acc || !(await checkPassword(acc, current))){ toast('Current password is incorrect.', 'error'); return; }
      if(next.length < 4){ toast('New password should be at least 4 characters.', 'error'); return; }
      if(next !== confirmPw){ toast('New passwords do not match.', 'error'); return; }
      acc.password = next;
      await saveAccounts();
      await refreshSessionKey(acc, next);
      toast('Your password has been updated.', 'success');
      renderTabContent();
    };
  }
}

// ---------- Feedback & rating (everyone) ----------
// Goes straight to REALITY HEALTH SYSTEM (api/feedback.php); their super admins read it on the
// RHS admin site. Needs internet: nothing is stored on the device.
const FEEDBACK_STARS = ['', 'Very poor', 'Poor', 'Okay', 'Good', 'Excellent'];
const FEEDBACK_TYPES = [['general', 'General feedback'], ['idea', 'Suggestion / idea'], ['problem', 'Problem / something not working'], ['praise', 'Something I like']];
const FEEDBACK_MAX = 2000;

function feedbackStarsHtml(n, cls = ''){
  return `<span class="fb-stars-show ${cls}" role="img" aria-label="${n} out of 5 stars">${[1,2,3,4,5].map(i=>`<span class="${i<=n?'on':''}">${icon('star')}</span>`).join('')}</span>`;
}
function settingsFeedbackHtml(){
  return `
  <section class="panel">
    <div class="card-header"><h2>${icon('star')} Feedback &amp; rating</h2><span class="hint">Goes to REALITY HEALTH SYSTEM</span></div>
    <p class="small subtle">How is Reality Health Bridge working for you? Your rating and comments help us fix problems and decide what to build next. The RHS team reads every message.</p>
    <form id="feedbackForm" novalidate>
      <fieldset class="fb-rate">
        <legend class="label">Your rating</legend>
        <div class="fb-stars" id="fbStars">
          ${[1,2,3,4,5].map(n=>`
          <label class="fb-star" data-fb-star="${n}" title="${FEEDBACK_STARS[n]}">
            <input type="radio" name="fbRating" value="${n}" class="sr-only">${icon('star')}<span class="sr-only">${n} star${n>1?'s':''} — ${FEEDBACK_STARS[n]}</span>
          </label>`).join('')}
          <span class="fb-star-label" id="fbStarLabel" aria-live="polite">Tap a star</span>
        </div>
      </fieldset>
      <div class="form-grid cols-2">
        <div class="field"><label for="fbType">What is it about?</label>
          <select id="fbType">${FEEDBACK_TYPES.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div>
      </div>
      <div class="field">
        <label for="fbMessage">Your feedback <span class="subtle" id="fbMsgNote">(optional)</span></label>
        <textarea id="fbMessage" rows="5" maxlength="${FEEDBACK_MAX}" placeholder="What do you like? What is hard to use, missing or not working?"></textarea>
        <div class="field-hint"><span id="fbCount">0</span> / ${FEEDBACK_MAX} · sent with your name, your role and the facility name</div>
      </div>
      <button class="btn" type="submit" id="fbSend">${icon('message')} Send feedback</button>
    </form>
  </section>

  <section class="panel">
    <div class="card-header"><h2>${icon('clock')} Feedback you sent</h2></div>
    <div id="fbHistory"><p class="small subtle">Loading…</p></div>
  </section>`;
}

async function feedbackCall(body){
  if(!navigator.onLine) throw new ApiError(0, 'offline', 'Sending feedback needs internet. Connect and try again.');
  const token = await metaGet('apiToken');
  if(!token) throw new ApiError(0, 'not_connected', 'This device is not connected to the server yet. Open System → Devices & sync first.');
  return apiPost('feedback.php', Object.assign(body, { act_by:(session && session.uid) || '', act_key:(session && session.ak) || '' }), token);
}

async function loadFeedbackHistory(){
  const box = document.getElementById('fbHistory');
  if(!box) return;
  try{
    const res = await feedbackCall({ action:'list' });
    if(!document.body.contains(box)) return;
    const types = Object.fromEntries(FEEDBACK_TYPES);
    box.innerHTML = !res.feedback.length
      ? `<p class="small subtle mb-0">You have not sent any feedback yet.</p>`
      : `<ul class="fb-list">${res.feedback.map(f=>`
          <li>
            <div class="fb-list-head">${feedbackStarsHtml(f.rating, 'small')}<span class="fb-type">${esc(types[f.category] || 'General feedback')}</span>
              <span class="xsmall subtle">${f.created_at ? `${fmtDate(f.created_at)}, ${fmtTime(f.created_at)}` : ''}</span>
              ${f.seen ? `<span class="xsmall fb-seen">${icon('check')} Read by RHS</span>` : ''}</div>
            ${f.message ? `<p class="small mb-0">${esc(f.message).replace(/\n/g, '<br>')}</p>` : ''}
          </li>`).join('')}</ul>`;
  }catch(e){
    if(document.body.contains(box)) box.innerHTML = `<p class="small subtle mb-0">${esc(e.message || 'Could not load your feedback.')}</p>`;
  }
}

function wireSettingsFeedback(){
  const form = document.getElementById('feedbackForm');
  if(!form) return;
  let rating = 0;
  const stars = [...form.querySelectorAll('[data-fb-star]')];
  const paint = (n)=>{
    stars.forEach(s=> s.classList.toggle('on', +s.dataset.fbStar <= n));
    document.getElementById('fbStarLabel').textContent = n ? `${FEEDBACK_STARS[n]} (${n}/5)` : 'Tap a star';
  };
  stars.forEach(s=>{
    s.onmouseenter = ()=> paint(+s.dataset.fbStar);
    s.querySelector('input').onchange = (e)=>{ rating = +e.target.value; paint(rating); };
  });
  document.getElementById('fbStars').onmouseleave = ()=> paint(rating);

  const msg = document.getElementById('fbMessage'), type = document.getElementById('fbType');
  msg.oninput = ()=>{ document.getElementById('fbCount').textContent = msg.value.length; };
  type.onchange = ()=>{ document.getElementById('fbMsgNote').textContent = type.value === 'problem' ? '(please describe it)' : '(optional)'; };

  form.onsubmit = async (e)=>{
    e.preventDefault();
    const message = msg.value.trim();
    if(!rating){ toast('Please choose from 1 to 5 stars.', 'error'); return; }
    if(type.value === 'problem' && !message){ toast('Please describe the problem so we can fix it.', 'error'); msg.focus(); return; }
    const btn = document.getElementById('fbSend');
    btn.disabled = true;
    try{
      await feedbackCall({ action:'send', rating, category:type.value, message, app_version:RHB_APP_VERSION });
      toast('Thank you! Your feedback was sent to REALITY HEALTH SYSTEM.', 'success');
      form.reset(); rating = 0; paint(0); msg.oninput(); type.onchange();
      loadFeedbackHistory();
    }catch(err){
      toast(err.message || 'Could not send your feedback. Please try again.', 'error');
    }finally{ btn.disabled = false; }
  };
  loadFeedbackHistory();
}

// ---------- Privacy (js/services/privacy.js) ----------
function settingsPrivacyHtml(){
  const a = termsAgreement(), sup = isSuperAdminNow();
  const when = a && a.acceptedAt ? `${fmtDate(a.acceptedAt)}` : '';
  return `
  <section class="panel">
    <div class="card-header"><h2>${icon('shield')} Privacy Policy &amp; Terms of Use</h2></div>
    <div class="privacy-docs">
      <a class="btn secondary" href="${PRIVACY_URL}" target="_blank" rel="noopener">${icon('shield')} Privacy Policy</a>
      <a class="btn secondary" href="${TERMS_URL}" target="_blank" rel="noopener">${icon('fileText')} Terms of Use</a>
    </div>
    ${a
      ? alertBox(`<span class="alert-title">Agreed</span>${a.acceptedBy ? esc(a.acceptedBy) + ' agreed' : 'Agreed'} for the facility${when ? ' on ' + esc(when) : ''} (version ${esc(a.version)}).`, 'success', 'checkCircle')
      : sup
        ? alertBox(`<span class="alert-title">Not agreed yet</span>Please read both, then agree for your facility. <a data-terms-open role="button" tabindex="0">Read and agree →</a>`, 'warning')
        : alertBox(`<span class="alert-title">Not agreed yet</span>Your facility's super admin needs to read and agree to them.`, 'info')}
  </section>

  <section class="panel">
    <div class="card-header"><h2>${icon('lock')} Your facility's data, in short</h2></div>
    <ul class="privacy-facts small">
      <li><strong>What is kept:</strong> your facility profile, staff logins, stock, sales and payments, and patient details your staff type in (name, phone, diagnosis — all optional).</li>
      <li><strong>Who can see it:</strong> only your facility's logins. REALITY HEALTH SYSTEM staff look at it only to support you, fix a problem or when the law requires. We never sell it.</li>
      <li><strong>Where:</strong> on your devices and on our server in Uganda, over a secure (https) connection. Passwords are never stored in readable form.</li>
      <li><strong>How long:</strong> while your facility uses the app, and 12 months after your subscription ends, so you can come back. Then it is deleted.</li>
      <li><strong>Your copy:</strong> download a full backup any time from System → Backup.</li>
    </ul>
  </section>

  <section class="panel" id="privacyDelete">
    <div class="card-header"><h2>${icon('trash')} Delete your facility's data</h2><span class="hint">Super admin only</span></div>
    ${sup ? `<div id="privacyDeleteBody"><p class="small subtle">Loading…</p></div>`
          : `<p class="small subtle mb-0">Only your facility's super admin can ask REALITY HEALTH SYSTEM to delete the facility's data.</p>`}
  </section>`;
}

function privacyDeleteFormHtml(){
  const idn = STATE.settings.identity || {}, me = currentAccount() || {};
  return `
    <p class="small">Ask REALITY HEALTH SYSTEM to permanently delete your facility's records from our server: the profile, logins, stock, sales, patient details and certificates. We will call or email you to confirm it is really you, then delete within 30 days. Records of payments to RHS are kept as the law requires.</p>
    ${alertBox('<span class="alert-title">This cannot be undone</span>Download a backup first (System → Backup) if you want to keep a copy. After deletion, the app stops working for every login of this facility.', 'danger')}
    <form id="privacyDeleteForm" novalidate>
      <div class="form-grid cols-2">
        <div class="field span-all"><label for="pdContact">Phone or email we should use to confirm</label>
          <input type="text" id="pdContact" required value="${esc(me.contact || idn.contact || '')}"></div>
        <div class="field span-all"><label for="pdReason">Why are you leaving? <span class="label-opt">(optional)</span></label>
          <textarea id="pdReason" rows="3" maxlength="2000"></textarea></div>
      </div>
      <label class="perm-tick agree-tick"><input type="checkbox" id="pdSure"><span>I understand all of <strong>${esc(idn.name || 'this facility')}</strong>'s records will be deleted from the server for good.</span></label>
      <button class="btn danger mt" type="submit" id="pdSend" disabled>${icon('trash')} Ask RHS to delete our data</button>
    </form>`;
}

async function loadPrivacyDelete(){
  const box = document.getElementById('privacyDeleteBody');
  if(!box) return;
  let res;
  try{ res = await privacyCall({ action:'status' }); }
  catch(e){
    if(document.body.contains(box)) box.innerHTML = `<p class="small subtle mb-0">${esc(e.message || 'Could not load.')} You can also call or WhatsApp ${esc(RHS_PHONE)} or email ${esc(RHS_EMAIL)}.</p>`;
    return;
  }
  if(!document.body.contains(box)) return;
  if(res.terms){ // the server's record is the real one
    STATE.settings.terms = { version:res.terms.version, acceptedAt:res.terms.accepted_at, acceptedBy:res.terms.accepted_by };
  }
  const r = res.request;
  if(r){
    box.innerHTML = alertBox(`<span class="alert-title">Deletion requested</span>${esc(r.user_name || 'You')} asked on ${esc(fmtDate(r.created_at))}. REALITY HEALTH SYSTEM will contact you on <strong>${esc(r.contact)}</strong> to confirm, then delete the data within 30 days.`, 'warning', 'clock')
      + `<button class="btn secondary" type="button" id="pdCancel">Cancel the request</button>`;
    document.getElementById('pdCancel').onclick = ()=> confirmDialog('Cancel the request?', 'Your facility\'s data will be kept and you can keep using the app.', async ()=>{
      try{ await privacyCall({ action:'cancel_delete' }); toast('Request cancelled. Your data is kept.', 'success'); }
      catch(e){ toast(e.message || 'Could not cancel. Please try again.', 'error'); }
      loadPrivacyDelete();
    }, 'Cancel the request', false);
    return;
  }
  box.innerHTML = privacyDeleteFormHtml();
  const sure = document.getElementById('pdSure'), send = document.getElementById('pdSend');
  sure.onchange = ()=>{ send.disabled = !sure.checked; };
  document.getElementById('privacyDeleteForm').onsubmit = (e)=>{
    e.preventDefault();
    const contact = document.getElementById('pdContact').value.trim(), reason = document.getElementById('pdReason').value.trim();
    if(!contact){ toast('Enter a phone number or email we can use to confirm.', 'error'); return; }
    confirmDialog('Ask RHS to delete all your data?', 'REALITY HEALTH SYSTEM will contact you to confirm before anything is deleted.', async ()=>{
      send.disabled = true;
      try{
        await privacyCall({ action:'request_delete', contact, reason });
        toast('Request sent. RHS will contact you to confirm.', 'success');
      }catch(err){ toast(err.message || 'Could not send. Please try again.', 'error'); }
      loadPrivacyDelete();
    }, 'Send request');
  };
}

function wireSettingsPrivacy(){
  loadPrivacyDelete();
}
