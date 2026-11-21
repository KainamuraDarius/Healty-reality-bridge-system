// Small, dependency-free helpers: formatting, ids, dates, images.
const fmt = n => 'UGX ' + Math.round(n).toLocaleString('en-UG');
const todayStr = () => new Date().toISOString().slice(0,10);

const uid = () => uuid(); // see js/core/crypto.js

// Resize an uploaded image client-side and return a compact data URL — keeps logos
// small so they don't bloat the database or backup files.
function resizeImageToDataUrl(file, maxDim=240, quality=0.85){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w>h){ if(w>maxDim){ h = Math.round(h*maxDim/w); w = maxDim; } }
        else { if(h>maxDim){ w = Math.round(w*maxDim/h); h = maxDim; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0,0,w,h); // flatten any transparency to white
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = ()=>reject(new Error('Could not read that image.'));
      img.src = e.target.result;
    };
    reader.onerror = ()=>reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

function startOfWeek(dateStr){
  const dt = new Date(dateStr);
  const day = dt.getDay();
  const diff = (day===0 ? -6 : 1) - day; // Monday-based week
  dt.setDate(dt.getDate()+diff);
  return dt.toISOString().slice(0,10);
}
function endOfWeek(dateStr){
  const dt = new Date(startOfWeek(dateStr));
  dt.setDate(dt.getDate()+6);
  return dt.toISOString().slice(0,10);
}
function monthRange(month, year){
  // Built in UTC like todayStr(): local-time dates shifted the month by a day in Uganda (UTC+3).
  const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0,10);
  const end = new Date(Date.UTC(year, month+1, 0)).toISOString().slice(0,10);
  return {start, end};
}
// "2026-11-20" + n days, in the same UTC calendar as todayStr()
function addDaysStr(dateStr, n){
  const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0,10);
}

// Escape user-entered text before putting it into HTML (names, notes, etc.).
// Without this, a name like  O"Brien <b>  breaks the page or injects markup.
function esc(v){
  if(v === null || v === undefined) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Initials for avatars: "Jane Nakato" -> "JN"
function initials(name){
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length-1][0] : '')).toUpperCase();
}

// Readable dates
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
