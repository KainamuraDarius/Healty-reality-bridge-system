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
  ].filter(Boolean);
}

function viewSettings(){
  const tabs = settingsTabs();
  if(!tabs.find(t=>t[0]===settingsTab) || settingsTab.startsWith('go-')) settingsTab = tabs[0][0];
  const body = { pharmacy: settingsPharmacyHtml, docs: settingsDocsHtml, account: settingsAccountHtml, appearance: settingsAppearanceHtml }[settingsTab]();
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
