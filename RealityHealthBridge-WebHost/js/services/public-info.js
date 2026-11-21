// Public details from REALITY HEALTH SYSTEM: support contacts and the free-trial length.
// RHS edits them on the admin site (Settings); the app fetches them from api/public.php when
// online and keeps the last copy on this device, so they also show offline. Until the first
// fetch, the built-in contacts below are used.

const DEFAULT_SUPPORT_CONTACTS = [
  { name:'REALITY HEALTH SYSTEM', role:'Support & payments', phone:RHS_PHONE, email:RHS_EMAIL, whatsapp:true },
  { name:'System owner', role:'System owner', phone:'+256740535992', email:'kainamuradarius@gmail.com', whatsapp:true }
];
const PUBLIC_INFO_KEY = 'rhb:publicInfo';
const PUBLIC_INFO_EVERY_MS = 30 * 60 * 1000;

let PUBLIC_INFO = (function(){
  try{ const v = JSON.parse(localStorage.getItem(PUBLIC_INFO_KEY) || 'null'); if(v && typeof v === 'object') return v; }catch(e){}
  return { contacts:null, trialDays:null, fetchedAt:0 };
})();

function supportContacts(){
  const list = Array.isArray(PUBLIC_INFO.contacts) && PUBLIC_INFO.contacts.length ? PUBLIC_INFO.contacts : DEFAULT_SUPPORT_CONTACTS;
  return list.filter(c => c && c.name && (c.phone || c.email));
}
// Days a new pharmacy gets free (what RHS set on the admin site; the app's own length until known).
function publicTrialDays(){ return PUBLIC_INFO.trialDays || TRIAL_DAYS; }
// Google sign-in key for one-tap Drive backups, set by RHS on the admin site ('' = use the share/steps way).
function googleClientId(){ return (typeof GOOGLE_CLIENT_ID !== 'undefined' && GOOGLE_CLIENT_ID) || PUBLIC_INFO.googleClientId || ''; }

// Fetch the latest details (at most every 30 minutes unless forced). Re-draws the public pages if they changed.
async function refreshPublicInfo(force){
  if(!navigator.onLine) return;
  if(!force && Date.now() - (PUBLIC_INFO.fetchedAt || 0) < PUBLIC_INFO_EVERY_MS) return;
  try{
    const res = await apiPost('public.php', {});
    const next = { contacts:Array.isArray(res.contacts) ? res.contacts : null, trialDays:Number(res.trial_days) || null,
      googleClientId:typeof res.google_client_id === 'string' ? res.google_client_id : '', fetchedAt:Date.now() };
    const changed = JSON.stringify([next.contacts, next.trialDays, next.googleClientId]) !== JSON.stringify([PUBLIC_INFO.contacts, PUBLIC_INFO.trialDays, PUBLIC_INFO.googleClientId]);
    PUBLIC_INFO = next;
    try{ localStorage.setItem(PUBLIC_INFO_KEY, JSON.stringify(next)); }catch(e){}
    if(changed) onPublicInfoChanged();
  }catch(e){ /* offline or server not set up: keep what we have */ }
}
function onPublicInfoChanged(){
  if(typeof userIsTyping === 'function' && userIsTyping()) return;
  if(!session){ if(typeof renderAuth === 'function') renderAuth(); }
  else if(currentTab === 'system' && typeof renderTabContent === 'function' && !modalIsOpen()) renderTabContent();
}

// ---------- links ----------
function phoneDigits(p){ return String(p || '').replace(/[^\d+]/g, ''); }
// WhatsApp needs the full international number without "+": 0789… -> 256789…
function whatsappNumber(p){
  let d = phoneDigits(p).replace(/^\+/, '');
  if(d.startsWith('0')) d = '256' + d.slice(1);
  return d;
}
function telHref(p){ return 'tel:' + phoneDigits(p); }
function waHref(p){ return 'https://wa.me/' + whatsappNumber(p); }

// One short line for footers: "REALITY HEALTH SYSTEM · 0789511736 · mail@…"
function supportLineText(){
  const c = supportContacts()[0];
  return c ? [c.name, c.phone, c.email].filter(Boolean).map(esc).join(' · ') : '';
}

// Contact cards with call / WhatsApp / email buttons.
function supportContactsHtml(opts = {}){
  const list = supportContacts();
  return `<div class="contact-grid${opts.compact ? ' compact' : ''}">${list.map(c=>`
    <div class="contact-card">
      <div class="contact-head">
        <span class="contact-avatar" aria-hidden="true">${esc(initials(c.name))}</span>
        <div><strong>${esc(c.name)}</strong>${c.role ? `<span>${esc(c.role)}</span>` : ''}</div>
      </div>
      <div class="contact-lines">
        ${c.phone ? `<a href="${esc(telHref(c.phone))}" class="contact-line">${icon('phone')}<span>${esc(c.phone)}</span></a>` : ''}
        ${c.email ? `<a href="mailto:${esc(c.email)}" class="contact-line">${icon('mail')}<span>${esc(c.email)}</span></a>` : ''}
      </div>
      <div class="contact-actions">
        ${c.phone ? `<a class="btn secondary btn-sm" href="${esc(telHref(c.phone))}">${icon('phone')} Call</a>` : ''}
        ${c.phone && c.whatsapp ? `<a class="btn secondary btn-sm" href="${esc(waHref(c.phone))}" target="_blank" rel="noopener">${icon('message')} WhatsApp</a>` : ''}
        ${c.email ? `<a class="btn secondary btn-sm" href="mailto:${esc(c.email)}">${icon('mail')} Email</a>` : ''}
      </div>
    </div>`).join('')}</div>`;
}
function initials(name){
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length-1][0] : '')).toUpperCase();
}
