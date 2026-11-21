// Direct Google Drive upload ("one tap"), used when RHS has saved a Google sign-in key
// (OAuth Web Client ID) on the admin site - see googleClientId() in public-info.js.
// Without a key, backup.js still reaches Google Drive through the phone's share sheet,
// or by saving the file and opening drive.google.com on a computer.
//
// Scope drive.file: the app can only see and change files it created itself - never the rest
// of the person's Drive.
const GOOGLE_CLIENT_ID = '';   // optional built-in key; the admin-site setting is used when this is empty
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FOLDER_NAME = 'Reality Health Bridge backups';
let gDriveToken = null, gDriveTokenUntil = 0;

// Google's sign-in script is loaded only when needed, not on every page load.
function loadGoogleSignIn(){
  if(typeof google!=='undefined' && google.accounts && google.accounts.oauth2) return Promise.resolve(true);
  return new Promise(res=>{
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = ()=> res(true); s.onerror = ()=> res(false);
    document.head.appendChild(s);
  });
}
// Load it in advance on the Backup screen, so the sign-in pop-up opens straight from the tap
// (browsers block pop-ups that open after a delay).
function preloadGoogleSignIn(){ if(googleClientId() && navigator.onLine) loadGoogleSignIn(); }

function requestGoogleDriveAccess(onGranted){
  if(gDriveToken && Date.now() < gDriveTokenUntil){ onGranted(); return; }
  if(typeof google==='undefined' || !google.accounts || !google.accounts.oauth2){
    toast('Google sign-in is still loading — check the internet and tap again.', 'error');
    loadGoogleSignIn();
    return;
  }
  const client = google.accounts.oauth2.initTokenClient({
    client_id: googleClientId(),
    scope: GOOGLE_DRIVE_SCOPE,
    callback: (resp)=>{
      if(resp && resp.access_token){
        gDriveToken = resp.access_token;
        gDriveTokenUntil = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
        onGranted();
      } else toast('Google sign-in was not completed.', 'error');
    },
    error_callback: ()=> toast('Google sign-in was closed or blocked. Allow pop-ups for this site and try again.', 'error')
  });
  client.requestAccessToken();
}

async function driveFetch(url, opts = {}){
  const res = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ 'Authorization': `Bearer ${gDriveToken}` }, opts.headers || {}) }));
  if(res.status === 401){ gDriveToken = null; throw new Error('expired'); }
  return res;
}
// The backups folder, created the first time.
async function driveBackupFolder(){
  const q = encodeURIComponent(`name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await (await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`)).json();
  if(found.files && found.files.length) return found.files[0].id;
  const made = await (await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
  })).json();
  return made.id || null;
}

async function uploadBackupToDrive(){
  if(!googleClientId()){ cloudBackup('drive'); return; }
  if(!navigator.onLine){ toast('You are offline — connect to the internet to upload to Google Drive.', 'error'); return; }
  requestGoogleDriveAccess(async ()=>{
    const filename = backupFileName('json');
    const boundary = 'rhbbackupboundary' + Date.now();
    toast('Uploading to Google Drive…', 'info');
    try{
      const folder = await driveBackupFolder();
      const meta = { name: filename, mimeType: 'application/json' };
      if(folder) meta.parents = [folder];
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`+
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${backupJson()}\r\n`+
        `--${boundary}--`;
      const res = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method:'POST', headers:{ 'Content-Type': `multipart/related; boundary=${boundary}` }, body
      });
      if(!res.ok) throw new Error('upload ' + res.status);
      await markBackedUp('Google Drive');
      toast(`Backup saved in your Google Drive, in the folder “${DRIVE_FOLDER_NAME}”.`, 'success');
    }catch(e){
      if(e.message === 'expired'){ toast('Your Google sign-in expired — tap Upload again.', 'error'); return; }
      console.error(e);
      toast('Google Drive upload failed. Use “Download backup file” instead.', 'error');
    }
  });
}
