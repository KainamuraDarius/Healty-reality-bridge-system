// System page (admins): subscription & plans, backups, devices & sync, support.
// (The pharmacy profile and passwords are on the Settings page.)
let sysTab = 'plan';
const SYS_TABS = [['plan','Subscription','card'], ['backup','Backup','database'], ['devices','Devices & sync','smartphone'], ['support','Support','phone']];
// Which tick each tab needs (Support is open to every admin).
const SYS_TAB_PERM = { plan:'subscription', backup:'backup', devices:'devices' };
const sysTabAllowed = t => !SYS_TAB_PERM[t] || can(SYS_TAB_PERM[t]);

function backupAgeDays(){ return STATE.settings.lastBackupDate ? -daysToExpiry(STATE.settings.lastBackupDate) : null; }

// Overview strip: four things an admin checks at a glance; each opens its tab.
function sysOverviewHtml(){
  const lic = licenseStatus(), cur = currentPlanKey();
  const devices = (lic.configured && STATE.settings.license.devices) || [];
  const maxDevices = lic.configured ? lic.maxDevices : DEFAULT_MAX_DEVICES;
  const sync = syncStatusInfo(), age = backupAgeDays();
  const planName = cur === 'trial' ? 'Free trial' : cur ? PACKAGES[cur].label : 'No plan yet';
  const planSub = !lic.configured ? 'Choose a plan below' : lic.inGrace ? `Expired · ${lic.graceDaysLeft} day(s) of grace` : lic.active && lic.daysLeft >= 0 ? `${lic.daysLeft} day${lic.daysLeft===1?'':'s'} left` : 'Expired';
  const planTone = !lic.configured ? '' : lic.inGrace || !lic.active || lic.daysLeft < 0 ? 'bad' : lic.daysLeft <= 7 ? 'warn' : 'ok';
  const tile = (tab, ic, label, value, sub, tone)=> `
    <button type="button" class="sys-tile ${tone||''} ${sysTab===tab?'active':''}" data-sys-tab="${tab}">
      <span class="sys-tile-ic">${icon(ic)}</span>
      <span class="sys-tile-txt"><small>${label}</small><strong>${value}</strong><em>${sub}</em></span>
    </button>`;
  const tiles = [
    sysTabAllowed('plan') && tile('plan', 'card', 'Plan', esc(planName), esc(planSub), planTone),
    sysTabAllowed('devices') && tile('devices', 'smartphone', 'Devices', `${devices.length} of ${maxDevices}`, 'phones &amp; computers in use', devices.length >= maxDevices ? 'warn' : 'ok'),
    sysTabAllowed('devices') && tile('devices', 'refresh', 'Server sync', esc(sync.short), esc(sync.text), sync.cls === 'ok' ? 'ok' : sync.cls === 'warn' ? 'bad' : 'warn'),
    sysTabAllowed('backup') && tile('backup', 'database', 'Last backup', age === null ? 'Never' : age === 0 ? 'Today' : `${age} day${age===1?'':'s'} ago`, esc(STATE.settings.lastBackupLocation || 'back up weekly'), age === null || age > 7 ? 'warn' : 'ok'),
  ].filter(Boolean);
  return tiles.length ? `<div class="sys-overview">${tiles.join('')}</div>` : '';
}

// The plan you're on now, with time left and devices used.
function currentPlanHtml(){
  const lic = licenseStatus(), cur = currentPlanKey();
  if(!lic.configured) return '';
  const devices = (STATE.settings.license.devices) || [];
  const period = cur === 'trial' ? publicTrialDays() : 30;
  const left = Math.max(0, lic.daysLeft || 0);
  const pct = Math.max(lic.daysLeft > 0 ? 4 : 0, Math.min(100, Math.round(left / period * 100)));
  const state = lic.inGrace ? ['Expired', 'bad', `${lic.graceDaysLeft} day(s) of grace before the app locks`]
    : !lic.active || lic.daysLeft < 0 ? ['Locked', 'bad', 'Renew to unlock the app for everyone']
    : lic.daysLeft <= 7 ? ['Ending soon', 'warn', `Ends ${fmtDate(lic.expiryDate)}`]
    : ['Active', 'ok', `Runs until ${fmtDate(lic.expiryDate)}`];
  return `
  <section class="plan-now">
    <div class="plan-now-main">
      <span class="plan-now-kicker">Your plan</span>
      <h2>${cur === 'trial' ? 'Free trial' : cur ? PACKAGES[cur].label : 'Subscription'} <span class="plan-pill ${state[1]}">${state[0]}</span></h2>
      <p>${state[2]}${cur && cur !== 'trial' ? ` · renews at UGX ${MONTHLY_FEE.toLocaleString()} a month` : ''}</p>
      <div class="plan-meter" role="img" aria-label="${left} of ${period} days left"><i class="${state[1]}" style="width:${pct}%"></i></div>
      <div class="plan-meter-txt"><span>${lic.daysLeft >= 0 ? `<strong>${left}</strong> day${left===1?'':'s'} left` : `Expired ${Math.abs(lic.daysLeft)} day(s) ago`}</span><span>${period}-day period</span></div>
    </div>
    <div class="plan-now-side">
      <div><small>Devices</small><strong>${devices.length} <span>/ ${lic.maxDevices}</span></strong></div>
      <div><small>${cur === 'trial' ? 'Then from' : 'Monthly'}</small><strong>UGX ${(cur === 'trial' ? PACKAGES.starter.setupFee : MONTHLY_FEE).toLocaleString()}</strong></div>
      ${cur && cur !== 'trial' ? `<button class="btn cta" type="button" data-plan-renew>${icon('refresh')} Renew now</button>` : `<button class="btn cta" type="button" data-plan-pick>${icon('arrowRight')} Choose a plan</button>`}
    </div>
  </section>`;
}

function viewSystem(){
  if(!sysTabAllowed(sysTab)) sysTab = SYS_TABS.map(t=>t[0]).find(sysTabAllowed);
  const lic = licenseStatus();
  const devices = (lic.configured && STATE.settings.license.devices) || [];
  const maxDevices = lic.configured ? lic.maxDevices : DEFAULT_MAX_DEVICES;
  const age = backupAgeDays();
  let body = '';
  if(sysTab === 'plan'){
    body = `
    ${currentPlanHtml()}
    <section class="panel" id="sysPlans">
      <div class="card-header"><h2>${icon('card')} Plans</h2><span class="hint">Every plan has every feature</span></div>
      <p class="muted small" style="margin-top:-8px;">Plans differ only in how many phones and computers can use the app at the same time.</p>
      ${packagesAndPayHtml('sys')}
    </section>`;
  } else if(sysTab === 'backup'){
    body = `
    ${age===null || age>7 ? alertBox(`<span class="alert-title">Always back up your data</span>${age===null ? 'No backup has been made from this device yet.' : `Your last backup was ${age} days ago.`} It takes a few seconds — we recommend once a week.`, 'info', 'shield') : ''}
    <section class="panel" id="sysBackup">${backupPanelHtml()}</section>`;
  } else if(sysTab === 'devices'){
    body = `
    ${syncPanelHtml()}
    <section class="panel" id="sysDevices">
      <div class="card-header"><h2>${icon('smartphone')} Devices</h2><span class="hint">${devices.length} of ${maxDevices} used${lic.configured && lic.tier && PACKAGES[lic.tier] ? ` · ${PACKAGES[lic.tier].label}` : ''}</span></div>
      ${!lic.configured
        ? emptyState('', 'Choose a plan to start tracking devices.', 'smartphone', true)
        : (devices.length===0
          ? emptyState('', 'No devices registered yet.', 'smartphone', true)
          : `<div class="dev-list">${devices.map(d=>`
              <div class="dev-item">
                <span class="dev-code">${d.code ? esc(d.code) : '—'}</span>
                <div class="dev-main"><input type="text" value="${esc(d.label)}" data-device-rename="${esc(d.id)}" aria-label="Device name"><small>Added ${esc(d.addedDate || '—')}${d.id===CURRENT_DEVICE_ID ? ' · <span class="tag info plain">this device</span>' : ''}</small></div>
                <button class="btn small danger-soft" type="button" data-device-remove="${esc(d.id)}">${icon('trash')} Remove</button>
              </div>`).join('')}</div>`)}
      <p class="xsmall subtle mt-3">Your plan allows up to ${maxDevices} devices at a time. The letter is added to patient numbers made on that device. Removing a device frees its place and logs it out of the server. Rename a device by editing its name.</p>
    </section>`;
  } else {
    body = `
    <section class="panel" id="sysSupport">
      <div class="card-header"><h2>${icon('phone')} Support &amp; contacts</h2><span class="hint">REALITY HEALTH SYSTEM</span></div>
      <p class="muted small">Need help with the app, a payment or your subscription? Call, WhatsApp or email any of these contacts.</p>
      <div class="sys-contacts">${supportContactsHtml()}</div>
      ${isSuperAdmin() ? '' : `<p class="xsmall subtle mt-3">Subscription, backups and devices are shown only if your super admin has allowed them for you (Team page).</p>`}
      <p class="xsmall subtle mt-3">App version ${esc(RHB_APP_VERSION)} · this device ${esc(thisDeviceCode() || '—')}</p>
    </section>`;
  }
  return `
  ${sysOverviewHtml()}
  <nav class="sys-tabs" role="tablist" aria-label="System sections">
    ${SYS_TABS.filter(([id])=>sysTabAllowed(id)).map(([id,label,ic])=>`<button type="button" role="tab" class="sys-tabbtn ${sysTab===id?'active':''}" data-sys-tab="${id}" aria-selected="${sysTab===id}">${icon(ic)}${label}</button>`).join('')}
  </nav>
  ${body}`;
}

function wireSystem(){
  document.querySelectorAll('[data-sys-tab]').forEach(b=> b.onclick = (e)=>{ e.preventDefault(); sysTab = b.dataset.sysTab; renderTabContent(); });
  const pick = (sel)=>{ const el = document.querySelector(sel); if(el){ el.scrollIntoView({ behavior:'smooth', block:'center' }); setTimeout(()=> el.click(), 350); } };
  const renew = document.querySelector('[data-plan-renew]'); if(renew) renew.onclick = ()=> pick('#sysPkgList [data-renewal="1"]');
  const choose = document.querySelector('[data-plan-pick]'); if(choose) choose.onclick = ()=>{ const g = document.getElementById('sysPkgList'); if(g) g.scrollIntoView({ behavior:'smooth', block:'start' }); };
  if(document.getElementById('sysPkgList')) wirePackagesAndPay('sys', ()=>{ renderTabContent(); renderTabs(); });

  // Backup
  const on = (id, fn)=>{ const el = document.getElementById(id); if(el) el.onclick = fn; };
  on('exportBackupBtn', exportBackup);
  on('shareBackupBtn', shareBackup);
  document.querySelectorAll('[data-cloud]').forEach(b=> b.onclick = ()=> cloudBackup(b.dataset.cloud));
  if(document.querySelector('[data-cloud="drive"]')) preloadGoogleSignIn();
  const importBackupInput = document.getElementById('importBackupInput');
  if(importBackupInput){
    importBackupInput.onchange = (e)=>{ const file = e.target.files[0]; if(file) restoreBackup(file); e.target.value = ''; };
  }

  // Devices & sync
  wireSyncPanel();
  document.querySelectorAll('[data-device-remove]').forEach(btn=>{
    btn.onclick = ()=>{
      confirmDialog('Remove this device?', 'It will need to be re-added (using one of the plan\'s device places) the next time it opens the app.', async ()=>{
        await removeDevice(btn.getAttribute('data-device-remove'));
        toast('Device removed.', 'success');
        renderTabContent();
      }, 'Remove', true);
    };
  });
  document.querySelectorAll('[data-device-rename]').forEach(input=>{
    input.onchange = async ()=>{ await renameDevice(input.getAttribute('data-device-rename'), input.value); toast('Device renamed.', 'success'); };
  });
}

// ---------- Server connection & sync ----------
function syncPanelHtml(){
  const c = SYNC.connection;
  const myCode = thisDeviceCode();
  const fac = STATE.settings.identity || {};
  const connectForm = (title, text) => `
    ${alertBox(`<span class="alert-title">${title}</span>${text}`, 'warning', 'cloud')}
    <form id="syncConnectForm" class="mt-3">
      <div class="row" style="align-items:flex-end;">
        <div style="flex:1;min-width:220px;max-width:340px;">${pwField(`Password for @${esc(session.username)}`, 'syncConnectPw', { required:true, autocomplete:'current-password' })}</div>
        <button class="btn" type="submit" style="margin-bottom:var(--sp-4);">${icon('cloud')} Connect this device</button>
      </div>
    </form>`;
  const joinForm = `
    <details class="mt-3" id="syncJoinBox"><summary class="bold">Join the facility that is already on the server</summary>
      <p class="small muted mt-2">Logs this device in to the facility already saved on the server and downloads its records.
      Records that are only on this device are replaced by the server's copy, so <strong>download a backup first</strong> (Backup tab).</p>
      <form id="syncJoinForm">
        <div class="form-grid cols-3">
          <div class="field"><label for="sjEmail">Facility email</label><input type="email" id="sjEmail" value="${esc(fac.email)}" required></div>
          <div class="field"><label for="sjUser">Username</label><input type="text" id="sjUser" value="${esc(session.username)}" autocapitalize="none" required></div>
          ${pwField('Password', 'sjPw', { required:true, autocomplete:'current-password' })}
        </div>
        <button class="btn danger" type="submit">${icon('download')} Replace this device's records and join</button>
      </form>
    </details>`;
  let body = '';
  if(c === 'not_set_up'){
    body = `<p class="small muted mt-3">This device connects to the server automatically once the facility profile is saved and the internet is on.</p>`;
  } else if(c === 'email_taken'){
    body = alertBox(`<span class="alert-title">Another facility on the server uses ${esc(fac.email)}</span>
      If that is <strong>your</strong> facility (set up on another phone), join it below. If not, change the facility email in <a data-goto="settings" role="button" tabindex="0">Settings → Facility profile</a> and press Try again.`, 'warning', 'cloud') + `
      <div class="form-actions"><button class="btn secondary" type="button" id="syncRetryBtn">${icon('refresh')} Try again</button></div>${joinForm}`;
  } else if(c === 'needs_password'){
    body = connectForm('Connect this device to the server', 'Enter your password once so this device can join the server.') + joinForm;
  } else if(c === 'removed'){
    body = connectForm('This device was logged out of the server', 'It was removed by an admin or its login expired. Records are still saved here; enter your password to reconnect.');
  } else if(c === 'device_limit'){
    body = connectForm('Device limit reached', `Your package allows ${STATE.settings.license ? STATE.settings.license.maxDevices : ''} devices. Remove an old device (Devices section, on a connected device) or upgrade, then connect.`);
  }
  return `
  <section class="panel" id="sysSync">
    <div class="card-header"><h2>${icon('refresh')} Server connection &amp; sync</h2>${myCode ? `<span class="hint">This device: <strong>${esc(myCode)}</strong></span>` : ''}</div>
    <p class="mb-0"><strong id="sysSyncStatus">${esc(syncStatusInfo().text)}</strong></p>
    <p class="small muted">Every sale and stock entry is saved on this device first, even with no internet, and is sent to the server automatically when the internet is on — every minute, and right after changes. Other devices of this facility receive it the same way.</p>
    ${SYNC.lastError && SYNC.status === 'error' ? `<p class="xsmall text-danger">Last problem: ${esc(SYNC.lastError)}</p>` : ''}
    ${SYNC.rejected ? alertBox(`<span class="alert-title">${SYNC.rejected} record(s) were refused by the server</span>They stay on this device. Contact REALITY HEALTH SYSTEM if this keeps happening.`, 'warning') : ''}
    ${c === 'connected' || c === 'unknown' ? `<div class="form-actions">
      <button class="btn" id="syncNowBtn" type="button">${icon('refresh')} Sync now</button>
      <button class="btn secondary" id="shareAccessBtn" type="button">${icon('share')} Add another device</button>
    </div>` : ''}
    ${body}
  </section>`;
}

function wireSyncPanel(){
  const syncNowBtn = document.getElementById('syncNowBtn');
  if(syncNowBtn) syncNowBtn.onclick = async ()=>{
    syncNowBtn.classList.add('is-loading');
    await syncNow();
    syncNowBtn.classList.remove('is-loading');
    toast(SYNC.status === 'ok' ? 'Synced.' : (SYNC.lastError || 'Could not sync right now — it will retry.'), SYNC.status === 'ok' ? 'success' : 'error');
    if(currentTab === 'system') renderTabContent();
  };
  const retry = document.getElementById('syncRetryBtn');
  if(retry) retry.onclick = async ()=>{ SYNC.connection = 'unknown'; await syncNow(); renderTabContent(); };

  const shareAccessBtn = document.getElementById('shareAccessBtn');
  if(shareAccessBtn) shareAccessBtn.onclick = ()=>{
    const id = STATE.settings.identity || {};
    const link = location.href.split('#')[0].split('?')[0];
    const lines = [
      `Open this link on the new phone or computer: ${link}`, ``,
      `On the first screen choose "Log in to a facility that is already set up", then enter:`,
      `  Facility email: ${id.email || ''}`, `  Your username and password (the same as on the other devices).`, ``,
      `The new device needs internet the first time. It then downloads the facility's records and works offline too.`,
      `Up to ${(STATE.settings.license && STATE.settings.license.maxDevices) || DEFAULT_MAX_DEVICES} devices can be used for this facility.`
    ];
    window.open(`mailto:?subject=${encodeURIComponent(`Use ${id.name || 'Reality Health Bridge'} on a new device`)}&body=${encodeURIComponent(lines.join('\n'))}`, '_blank');
  };

  const cf = document.getElementById('syncConnectForm');
  if(cf) cf.onsubmit = async (e)=>{
    e.preventDefault();
    const btn = cf.querySelector('[type=submit]'); btn.classList.add('is-loading');
    try{
      const r = await connectWithPassword(session.username, document.getElementById('syncConnectPw').value);
      if(r === 'other_pharmacy'){ SYNC.connection = 'email_taken'; toast('This email belongs to a facility already on the server — see the options below.', 'error'); }
      else toast('This device is now connected to the server.', 'success');
    }catch(err){ toast(err.message || 'Could not connect.', 'error'); }
    btn.classList.remove('is-loading');
    renderTabContent();
  };
  const jf = document.getElementById('syncJoinForm');
  if(jf) jf.onsubmit = (e)=>{
    e.preventDefault();
    const email = document.getElementById('sjEmail').value.trim(), user = document.getElementById('sjUser').value.trim(), pw = document.getElementById('sjPw').value;
    confirmDialog('Replace this device\'s records?', 'This device will use the facility\'s records from the server. Records that are only on this device are replaced, so make sure you have downloaded a backup first.', async ()=>{
      try{
        const u = await joinPharmacy(email, user, pw);
        await startSession(findAccount(u.username) || u, pw);
        toast('Joined. This device now has the facility\'s records from the server.', 'success');
        currentTab = landingTab(); await render();
      }catch(err){ toast(err.message || 'Could not join.', 'error'); }
    }, 'Replace and join', true);
  };
}

// System > Backup: the automatic server copy, cloud (Google Drive, MEGA), a file, and restore.
function backupPanelHtml(){
  const sync = syncStatusInfo();
  const connected = !['not_set_up','needs_password','email_taken','device_limit','removed'].includes(SYNC.connection);
  const last = STATE.settings.lastBackupDate ? `${STATE.settings.lastBackupDate} · ${esc(STATE.settings.lastBackupLocation||'backup file')}` : 'none yet';
  const share = canShareBackup(), phone = isTouchPhone(), oneTap = !!googleClientId();
  const card = (cls, ic, title, body, action)=> `
    <div class="bk-card ${cls}">
      <div class="bk-card-head"><span class="bk-ic">${ic}</span><h3>${title}</h3></div>
      <p>${body}</p>
      <div class="bk-card-act">${action}</div>
    </div>`;
  return `
    <div class="card-header"><h2>${icon('database')} Data backup</h2><span class="hint">Last backup: ${last}</span></div>

    <div class="bk-auto ${connected ? 'ok' : 'warn'}">
      <span class="bk-ic">${icon('cloud')}</span>
      <div><strong>Automatic server copy ${connected ? '· on' : '· not connected'}</strong>
        <p>${connected ? 'Every sale and stock change is copied to the secure server whenever this device is online.' : 'Connect this device to the server and every sale and stock change is copied there automatically.'}</p>
        <span class="backup-status"><span class="sync-dot ${sync.cls}"></span>${esc(sync.text)}</span></div>
      ${connected ? '' : `<button class="btn secondary btn-sm" type="button" data-sys-tab="devices">${icon('refresh')} Connect</button>`}
    </div>

    <h3 class="bk-sub">Keep your own copy <span>— we recommend once a week</span></h3>
    <div class="bk-grid">
      ${card('drive', '<b class="bk-letter">G</b>', 'Google Drive',
        oneTap ? 'One tap: sign in with Google once and the backup is saved in your Drive, in the folder “Reality Health Bridge backups”.'
          : phone ? 'Sends the backup to the Google Drive app on this phone. Choose <strong>Drive</strong> in the list and save.'
          : 'Saves the backup file and opens Google Drive so you can upload it there.',
        `<button class="btn btn-sm" type="button" data-cloud="drive">${icon('upload')} ${oneTap ? 'Upload to Google Drive' : 'Back up to Google Drive'}</button>`)}
      ${card('mega', '<b class="bk-letter">M</b>', 'MEGA',
        phone ? 'Sends the backup to the MEGA app on this phone. Choose <strong>MEGA</strong> in the list and save.'
          : 'Saves the backup file and opens MEGA so you can upload it there. Free MEGA accounts include 20&nbsp;GB.',
        `<button class="btn btn-sm" type="button" data-cloud="mega">${icon('upload')} Back up to MEGA</button>`)}
      ${card('file', icon('download'), 'Backup file', 'A complete copy of your records as one file. Keep it on a USB drive, a computer or in email.',
        `<button class="btn btn-sm secondary" id="exportBackupBtn" type="button">${icon('download')} Download backup file</button>`)}
      ${share ? card('other', icon('share'), 'Other apps', 'WhatsApp, Gmail, Dropbox, OneDrive, Bluetooth — any app on this phone that accepts files.',
        `<button class="btn btn-sm secondary" id="shareBackupBtn" type="button">${icon('share')} Send a copy</button>`) : ''}
    </div>
    <p class="xsmall subtle mt-3">${icon('shield')} Your cloud password is typed only on Google's or MEGA's own pages, never in this app.</p>

    <div class="backup-restore">
      <div><strong>Restore records</strong><p class="small muted">Bring back records from a backup file made by this app (download it from Drive or MEGA first). You'll need the facility's recovery password.</p></div>
      <label class="btn secondary btn-sm" for="importBackupInput">${icon('upload')} Restore from backup file</label>
      <input type="file" id="importBackupInput" accept=".json,.txt,application/json,text/plain" hidden>
    </div>`;
}
