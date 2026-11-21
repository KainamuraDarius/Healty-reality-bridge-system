// Backup / restore.
// Methods (all shown in System > Backup):
//   1. Server copy  - automatic, through Sync (see sync.js).
//   2. Backup file  - downloaded to this device.
//   3. Send a copy  - the phone's share sheet: Google Drive, WhatsApp, Gmail, Bluetooth...
//   + Restore from a backup file (here or before login).
function backupPayload(){
  return {
    app:'REALITY HEALTH BRIDGE', exportedAt: new Date().toISOString(),
    drugs: STATE.drugs, batches: STATE.batches, sales: STATE.sales,
    accounts: STATE.accounts, settings: STATE.settings
  };
}
function backupFileName(ext = 'json'){
  const name = ((STATE.settings.identity || {}).name || 'Facility').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'Facility';
  return `RHB-Backup-${name}-${todayStr()}.${ext}`;
}
function backupJson(){ return JSON.stringify(backupPayload(), null, 2); }

async function markBackedUp(where){
  STATE.settings.lastBackupDate = todayStr();
  STATE.settings.lastBackupLocation = where;
  await saveSettings();
  if(typeof currentTab !== 'undefined' && currentTab === 'system') renderTabContent();
}

// iPhone/iPad apps opened from the home screen cannot save downloads - they must share instead.
function isIosStandalone(){
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && (window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
}

// The share sheet only accepts some file types (Chrome refuses .json), so fall back to .txt.
// The text inside is the same; Restore reads either.
function backupShareFile(){
  if(typeof File === 'undefined' || !navigator.canShare) return null;
  const json = backupJson();
  const asJson = new File([json], backupFileName('json'), { type:'application/json' });
  try{ if(navigator.canShare({ files:[asJson] })) return asJson; }catch(e){}
  const asText = new File([json], backupFileName('txt'), { type:'text/plain' });
  try{ if(navigator.canShare({ files:[asText] })) return asText; }catch(e){}
  return null;
}
function canShareBackup(){ return !!backupShareFile(); }

// ---------- Method 2: download a file ----------
function exportBackup(){
  if(isIosStandalone() && canShareBackup()){ shareBackup(); return; }
  try{
    const blob = new Blob([backupJson()], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = backupFileName('json'); a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    // Releasing the file straight away cancels the download on some browsers - wait first.
    setTimeout(()=> URL.revokeObjectURL(url), 60000);
  }catch(e){
    console.error(e); toast('Could not create the backup file on this device.', 'error'); return;
  }
  markBackedUp('Backup file');
  toast('Backup file saved to Downloads. Keep a copy somewhere else too — Google Drive, email or a USB drive.', 'success');
}

// ---------- Method 3: send a copy (Google Drive, WhatsApp, email...) ----------
async function shareBackup(){
  const file = backupShareFile();
  if(!file){ showSendBackupHelp(); return; }
  try{
    await navigator.share({ files:[file], title:'Facility backup', text:`Backup of ${(STATE.settings.identity||{}).name || 'the facility'} — ${todayStr()}` });
  }catch(e){
    if(e && e.name === 'AbortError') return; // they closed the share sheet
    console.error(e); showSendBackupHelp(); return;
  }
  markBackedUp('Sent copy');
  toast('Backup copy sent.', 'success');
}

// ---------- Cloud: Google Drive and MEGA ----------
// Phones: the share sheet hands the file to the Drive / MEGA app (no passwords in this app).
// Computers: save the file, open the cloud site in a new tab, and show the 3 short steps.
// Google Drive can also upload directly, when RHS has set a Google sign-in key (google-drive.js).
const CLOUDS = {
  drive: { name:'Google Drive', site:'https://drive.google.com/drive/my-drive', upload:'press <strong>+ New → File upload</strong>', app:'Drive' },
  mega:  { name:'MEGA',         site:'https://mega.nz/fm',                     upload:'press <strong>Upload</strong> (or drag the file into the page)', app:'MEGA' },
};
const isTouchPhone = ()=> !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

async function cloudBackup(key){
  const c = CLOUDS[key]; if(!c) return;
  if(key === 'drive' && googleClientId()){ uploadBackupToDrive(); return; }
  const file = backupShareFile();
  if(file && isTouchPhone()){
    try{
      await navigator.share({ files:[file], title:`Facility backup → ${c.name}`, text:`Backup of ${(STATE.settings.identity||{}).name || 'the facility'} — ${todayStr()}` });
      await markBackedUp(c.name);
      toast(`Backup sent. In the list, ${c.app === 'Drive' ? 'choose Drive' : 'choose MEGA'} and save it.`, 'success');
      return;
    }catch(e){ if(e && e.name === 'AbortError') return; }
  }
  showCloudSteps(key);
}
function showCloudSteps(key){
  const c = CLOUDS[key];
  openModal(`
    <h2>${icon('cloud')} Back up to ${c.name}</h2>
    <p>Three quick steps. Your ${c.name} password is typed on ${c.name}'s own site, never in this app.</p>
    <ol class="cloud-steps">
      <li><span>1</span><div><strong>Save the backup file</strong><p>It goes to this device's Downloads folder.</p><button class="btn small" type="button" id="cloudSaveBtn">${icon('download')} Save backup file</button></div></li>
      <li><span>2</span><div><strong>Open ${c.name}</strong><p>Log in there if it asks.</p><a class="btn small secondary" href="${c.site}" target="_blank" rel="noopener" id="cloudOpenBtn">${icon('cloud')} Open ${c.name} ↗</a></div></li>
      <li><span>3</span><div><strong>Upload the file</strong><p>In ${c.name}, ${c.upload} and pick <em>${esc(backupFileName('json'))}</em> from Downloads.</p></div></li>
    </ol>
    <div class="modal-actions">
      <button class="btn secondary" type="button" id="cloudCloseBtn">Close</button>
      <button class="btn cta" type="button" id="cloudDoneBtn">${icon('checkCircle')} I've uploaded it</button>
    </div>
  `);
  document.getElementById('cloudCloseBtn').onclick = closeModal;
  document.getElementById('cloudSaveBtn').onclick = ()=>{ exportBackup(); document.getElementById('cloudSaveBtn').innerHTML = `${icon('check')} Saved`; };
  document.getElementById('cloudDoneBtn').onclick = async ()=>{ closeModal(); await markBackedUp(c.name); toast(`Noted: backed up to ${c.name} today.`, 'success'); };
}

// Computers (and old phones) have no share sheet: download the file, then explain the next step.
function showSendBackupHelp(){
  openModal(`
    <h2>${icon('cloud')} Save a copy online</h2>
    <p>This device can't send files straight to other apps, so we'll save the backup file first. Then:</p>
    <ol class="steps-list">
      <li><strong>Google Drive:</strong> open <a href="https://drive.google.com" target="_blank" rel="noopener">drive.google.com</a>, press <em>New → File upload</em> and pick the file from Downloads.</li>
      <li><strong>Email:</strong> write an email to yourself and attach the file.</li>
      <li><strong>USB drive:</strong> copy the file from Downloads onto the USB drive.</li>
    </ol>
    <div class="modal-actions">
      <button class="btn secondary" id="sendHelpCloseBtn" type="button">Close</button>
      <button class="btn" id="sendHelpDownloadBtn" type="button">${icon('download')} Save backup file</button>
    </div>
  `);
  document.getElementById('sendHelpCloseBtn').onclick = closeModal;
  document.getElementById('sendHelpDownloadBtn').onclick = ()=>{ closeModal(); exportBackup(); };
}

// ---------- Restore ----------
function applyRestoredBackup(data){
  confirmDialog('Restore backup?', `This replaces all current data on this device with the backup from ${data.exportedAt ? new Date(data.exportedAt).toLocaleString('en-GB') : 'the file'}. This cannot be undone.`, async ()=>{
    // The file's settings are older than this device's - keep the newer "last backup" note.
    const keep = { date:STATE.settings.lastBackupDate, where:STATE.settings.lastBackupLocation };
    try{
      await importOldFormatData(data, { replace:true, reason:'Stock count from restored backup' });
      if(keep.date && !(STATE.settings.lastBackupDate >= keep.date)){
        STATE.settings.lastBackupDate = keep.date; STATE.settings.lastBackupLocation = keep.where;
        await saveSettings();
      }
    }catch(e){
      console.error(e); toast('Could not restore that backup on this device.', 'error'); return;
    }
    toast('Backup restored. Log in with any account from the restored facility.', 'success');
    if(session){
      await render();
    } else {
      // Restoring before login (e.g. setting up a new device): send them to the login
      // screen with the restored accounts now available, rather than crashing on a
      // null session inside render().
      clearSession(); session = null; authMode = 'login'; renderAuth();
    }
  }, 'Restore', true);
}
async function restoreBackup(file){
  let data;
  try{ data = JSON.parse(await file.text()); }
  catch(e){ toast('Could not read that file — choose a backup file made by this app (RHB-Backup-….json or .txt).', 'error'); return; }
  if(!data || !Array.isArray(data.drugs) || !Array.isArray(data.batches) || !Array.isArray(data.sales)){
    toast('That file does not look like a backup made by this app.', 'error'); return;
  }
  const backupIdentity = data.settings && data.settings.identity;
  if(backupIdentity && backupIdentity.name){
    const expected = computeRecoveryPassword(backupIdentity);
    openModal(`
      <h2>Confirm recovery password</h2>
      <p>This backup belongs to <strong>${esc(backupIdentity.name)}</strong>. Enter that facility's standard recovery password to continue.</p>
      <div class="field"><label for="restorePwInput">Recovery password</label><input type="text" id="restorePwInput" placeholder="XXXX-XXXX" autocapitalize="characters" autocomplete="off" spellcheck="false" style="letter-spacing:.1em;font-weight:700;"></div>
      <div class="auth-error" id="restorePwError" role="alert"></div>
      <div class="modal-actions">
        <button class="btn secondary" id="restorePwCancelBtn" type="button">Cancel</button>
        <button class="btn" id="restorePwConfirmBtn" type="button">Confirm &amp; restore</button>
      </div>
    `);
    document.getElementById('restorePwCancelBtn').onclick = closeModal;
    document.getElementById('restorePwInput').onkeydown = (e)=>{ if(e.key==='Enter') document.getElementById('restorePwConfirmBtn').click(); };
    document.getElementById('restorePwConfirmBtn').onclick = ()=>{
      const entered = document.getElementById('restorePwInput').value.trim().toUpperCase();
      if(entered !== expected){
        const err = document.getElementById('restorePwError');
        err.textContent = 'That recovery password does not match this backup.';
        err.classList.add('show');
        return;
      }
      closeModal();
      applyRestoredBackup(data);
    };
  } else {
    applyRestoredBackup(data);
  }
}
