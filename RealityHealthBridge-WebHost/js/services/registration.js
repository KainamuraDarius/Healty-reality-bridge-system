// Registration email to REALITY HEALTH SYSTEM (queued while offline).
// ---------- Registration email to REALITY HEALTH BRIDGE ----------
// When a NEW facility profile is created, its details and secret code are emailed to the RHB owner
// (address is set inside the email service, see apps-script/Code.gs). If the device is offline the
// message waits in a queue and is sent automatically the moment the internet is back.
const REG_QUEUE_KEY = 'rhb:regEmailQueue';
function regEmailUrl(){ return (window.RHB_CONFIG && window.RHB_CONFIG.REGISTRATION_EMAIL_URL) || ''; }
function readRegQueue(){ try{ return JSON.parse(localStorage.getItem(REG_QUEUE_KEY) || '[]'); }catch(e){ return []; } }
function writeRegQueue(q){ try{ localStorage.setItem(REG_QUEUE_KEY, JSON.stringify(q)); }catch(e){} }
function queueRegistrationEmail(secretCode){
  const id = STATE.settings.identity || {};
  const lic = STATE.settings.license || {};
  const item = {
    action:'facility_registered', facilityId:id.syncId || uid(), facilityName:id.name, location:id.location,
    contact:id.contact, email:id.email, secretCode, trialEnds: lic.trial ? lic.expiryDate : '',
    registeredAt:new Date().toISOString()
  };
  const q = readRegQueue();
  if(!q.some(x=>x.facilityId===item.facilityId)) q.push(item);
  writeRegQueue(q);
  flushRegistrationEmails();
}
let regFlushing = false;
async function flushRegistrationEmails(){
  const mailUrl = regEmailUrl(); const mailOn = !!mailUrl && mailUrl.indexOf('PASTE_')!==0;
  if(!mailOn || regFlushing) return;
  regFlushing = true;
  try{
    for(const item of readRegQueue()){
      if(mailOn && !item.emailed){
        try{
          const r = await fetch(mailUrl, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(item) });
          const j = await r.json(); if(j && (j.ok || j.duplicate)) item.emailed = true;
        }catch(e){ /* offline: try again later */ }
      }
      const done = !!item.emailed;
      const q = readRegQueue().filter(x=>x.facilityId!==item.facilityId);
      if(!done) q.push(item);
      writeRegQueue(q);
    }
  } finally { regFlushing = false; }
}
window.addEventListener('online', flushRegistrationEmails);
window.addEventListener('load', ()=>setTimeout(flushRegistrationEmails, 4000));
