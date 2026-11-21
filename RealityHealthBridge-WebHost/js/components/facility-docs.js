// The facility's digital stamp and operational certificates.
//
//  - Stamp: one picture, printed on every receipt and report. Stored on the facility row
//    (identity.stamp) and synced to every device. White paper around the stamp is made
//    see-through so it sits on the printout like real ink.
//  - Certificates: operating licences etc. (picture or PDF), stored in facility_documents and
//    synced, so REALITY HEALTH SYSTEM can see them in the admin site.
//
// Both can be uploaded when registering and later by the facility's MAIN admin (Settings →
// Stamp & certificates). Limits must match api/lib.php.
const DOC_MAX_BYTES = 2 * 1024 * 1024;
const DOC_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_CERTIFICATES = 10;

function canEditFacilityDocs(){ return isMainAdmin(currentAccount()); }
function facilityDocuments(){
  return liveRows('facility_documents').filter(d=>d.kind === 'certificate');
}
const fileSizeText = n => n >= 1048576 ? (n/1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n/1024)) + ' KB';

function readFileAsDataUrl(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(r.result);
    r.onerror = ()=> reject(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
}
function loadImage(src){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=> resolve(img);
    img.onerror = ()=> reject(new Error('Could not read that picture.'));
    img.src = src;
  });
}
const dataUrlBytes = d => Math.floor((d.length - d.indexOf(',') - 1) * 3 / 4);

// A certificate file -> a row ready to save. Photos are shrunk (a phone photo of a certificate
// is often 4 MB); PDFs are kept as they are and must be at most 2 MB.
async function readCertificateFile(file){
  const type = (file.type || '').toLowerCase() || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '');
  if(!DOC_TYPES.includes(type)) throw new Error(`“${file.name}” is not a picture or PDF.`);
  let data, mime = type;
  if(type === 'application/pdf'){
    if(file.size > DOC_MAX_BYTES) throw new Error(`“${file.name}” is ${fileSizeText(file.size)}. PDFs can be at most 2 MB — scan it at a lower quality, or take a clear photo instead.`);
    data = await readFileAsDataUrl(file);
  } else {
    const img = await loadImage(await readFileAsDataUrl(file));
    const max = 1800, k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    data = c.toDataURL('image/jpeg', 0.82); mime = 'image/jpeg';
    if(dataUrlBytes(data) > DOC_MAX_BYTES) data = c.toDataURL('image/jpeg', 0.6);
    if(dataUrlBytes(data) > DOC_MAX_BYTES) throw new Error(`“${file.name}” is too large even after shrinking.`);
  }
  const title = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 120) || 'Certificate';
  return { title, file_name:file.name.slice(0, 200), mime, size_bytes:dataUrlBytes(data), data };
}

// A stamp photo -> a see-through PNG of just the ink: near-white pixels become transparent and
// the empty border is cut off. Returns a data URL.
async function prepareStampImage(file){
  if(!/^image\//.test(file.type || '')) throw new Error('The stamp must be a picture (photo or scan).');
  const img = await loadImage(await readFileAsDataUrl(file));
  const max = 420, k = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h), d = px.data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for(let i = 0; i < d.length; i += 4){
    const light = (d[i] + d[i+1] + d[i+2]) / 3;
    const spread = Math.max(d[i], d[i+1], d[i+2]) - Math.min(d[i], d[i+1], d[i+2]);
    // paper: light and colourless. Fade the edge (200-235) so the ink outline stays smooth.
    if(spread < 40 && light > 200){
      d[i+3] = light > 235 ? 0 : Math.min(d[i+3], Math.round((235 - light) / 35 * 255));
    }
    if(d[i+3] > 40){
      const p = i / 4, x = p % w, y = (p - x) / w;
      if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y;
    }
  }
  if(x1 < 0) throw new Error('No stamp was found in that picture — it looks blank. Stamp on white paper and take a clear photo.');
  ctx.putImageData(px, 0, 0);
  const pad = 4; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

// ---------- saving ----------
async function setFacilityStamp(dataUrl){
  if(!STATE.settings.identity) throw new Error('Set up the facility first.');
  STATE.settings.identity.stamp = dataUrl || undefined;
  STATE.settings.identity.stampUpdatedAt = nowIso();
  await saveSettings();
}
async function addFacilityDocument(doc){
  if(facilityDocuments().length >= MAX_CERTIFICATES) throw new Error(`You can keep at most ${MAX_CERTIFICATES} certificates. Remove an old one first.`);
  await ensureFacilityId();
  const stamp = nowIso(), puts = [];
  stageRow('facility_documents', { id:uuid(), kind:'certificate', title:str(doc.title), file_name:str(doc.file_name), mime:doc.mime,
    size_bytes:num(doc.size_bytes), data:doc.data, valid_until:doc.valid_until || null,
    uploaded_by:doc.uploaded_by || (session && session.username) || '' }, puts, stamp);
  await commitRows(puts);
}
async function updateFacilityDocument(id, changes){
  const cur = ROWS.facility_documents.get(id); if(!cur) return;
  const stamp = nowIso(), puts = [];
  stageRow('facility_documents', Object.assign({}, cur, changes, { id }), puts, stamp);
  await commitRows(puts);
}
async function removeFacilityDocument(id){
  const stamp = nowIso(), puts = [];
  stageDelete('facility_documents', id, puts, stamp);
  await commitRows(puts);
}

// Open a certificate to look at it (new tab), or save it where a new tab is not possible.
function openFacilityDocument(id){
  const doc = ROWS.facility_documents.get(id);
  if(!doc || !doc.data){ toast('This file has not finished downloading to this device yet. Sync and try again.', 'error'); return; }
  const bin = atob(doc.data.slice(doc.data.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type:doc.mime }));
  const w = isIosStandalone() ? null : window.open(url, '_blank');
  if(!w){
    const a = document.createElement('a'); a.href = url; a.download = doc.file_name || (doc.title + (doc.mime === 'application/pdf' ? '.pdf' : '.jpg'));
    document.body.appendChild(a); a.click(); a.remove();
  }
  setTimeout(()=> URL.revokeObjectURL(url), 120000);
}

// ---------- printouts ----------
// The stamp beside the signature on receipts and reports (nothing when there is no stamp).
function printStampHtml(kind){
  const id = STATE.settings.identity || {};
  return id.stamp ? `<img class="print-stamp ${kind || ''}" src="${id.stamp}" alt="Facility stamp">` : '';
}

// ---------- registration form: stamp + certificates (both optional) ----------
function registrationDocsFieldsHtml(){
  return `
    <div class="form-section-title">${icon('stamp')} Stamp &amp; certificates</div>
    <p class="xsmall subtle" style="margin-top:-6px;">Optional — you can also add or change these later in <strong>Settings → Stamp &amp; certificates</strong>.</p>
    <div class="form-grid cols-2 reg-docs">
      <div class="field">
        <label for="rgStamp">Digital stamp <span class="label-opt">(printed on receipts &amp; reports)</span></label>
        <input type="file" id="rgStamp" accept="image/*">
        <div class="field-hint">Stamp on clean white paper and take a clear photo from straight above. The white paper is removed for you.</div>
        <div class="stamp-preview" id="rgStampPreview" hidden></div>
      </div>
      <div class="field">
        <label for="rgCerts">Operational certificates <span class="label-opt">(photos or PDF, up to 2 MB each)</span></label>
        <input type="file" id="rgCerts" accept="image/*,application/pdf,.pdf" multiple>
        <div class="field-hint">For example the NDA / Allied Health operating licence or certificate of registration.</div>
        <ul class="doc-list compact" id="rgCertList" hidden></ul>
      </div>
    </div>`;
}
// Wires the registration inputs; returns a function that gives { stamp, certificates } on submit.
function wireRegistrationDocs(showError){
  const picked = { stamp:null, certificates:[] };
  const stampIn = document.getElementById('rgStamp'), certIn = document.getElementById('rgCerts');
  if(!stampIn) return ()=> picked;
  stampIn.onchange = async ()=>{
    const f = stampIn.files[0], box = document.getElementById('rgStampPreview');
    picked.stamp = null; box.hidden = true;
    if(!f) return;
    try{
      picked.stamp = await prepareStampImage(f);
      box.innerHTML = `<img src="${picked.stamp}" alt="Your stamp"><span>${icon('checkCircle')} Stamp ready</span>`;
      box.hidden = false;
    }catch(err){ stampIn.value = ''; showError(err.message); }
  };
  certIn.onchange = async ()=>{
    const list = document.getElementById('rgCertList');
    const files = Array.from(certIn.files || []);
    picked.certificates = [];
    for(const f of files.slice(0, MAX_CERTIFICATES)){
      try{ picked.certificates.push(await readCertificateFile(f)); }
      catch(err){ showError(err.message); }
    }
    list.innerHTML = picked.certificates.map(c=>`<li>${icon(c.mime === 'application/pdf' ? 'fileText' : 'eye')}<span>${esc(c.title)}</span><small>${fileSizeText(c.size_bytes)}</small></li>`).join('');
    list.hidden = !picked.certificates.length;
    if(!picked.certificates.length) certIn.value = '';
  };
  return ()=> picked;
}
async function saveRegistrationDocs(picked, username){
  if(!picked) return;
  if(picked.stamp) await setFacilityStamp(picked.stamp);
  for(const c of picked.certificates) await addFacilityDocument(Object.assign({ uploaded_by:username || '' }, c));
}

// ---------- Settings → Stamp & certificates ----------
function settingsDocsHtml(){
  const id = STATE.settings.identity || {};
  const edit = canEditFacilityDocs();
  const docs = facilityDocuments().sort((a,b)=> a.created_at < b.created_at ? 1 : -1);
  const today = todayStr();
  return `
  <section class="panel">
    <div class="card-header"><h2>${icon('stamp')} Digital stamp</h2><span class="hint">${edit ? 'Printed on every receipt and report' : `${icon('lock')} Only the super admin can change it`}</span></div>
    <div class="stamp-row">
      <div class="stamp-paper">${id.stamp ? `<img src="${id.stamp}" alt="Facility stamp">` : `<span class="stamp-empty">${icon('stamp')}<small>No stamp yet</small></span>`}</div>
      <div class="stamp-help">
        <p class="small">The stamp appears beside the signature on <strong>receipts</strong>, <strong>balance receipts</strong> and every <strong>printed or saved report</strong>.</p>
        <p class="xsmall subtle">Best result: stamp on clean white paper, take a photo from straight above in good light, then upload it. The white paper is removed automatically.</p>
        ${edit ? `
        <div class="row">
          <label class="btn ${id.stamp ? 'secondary' : 'cta'}" for="docStampInput">${icon('upload')} ${id.stamp ? 'Replace stamp' : 'Upload stamp'}</label>
          <input type="file" id="docStampInput" accept="image/*" hidden>
          ${id.stamp ? `<button type="button" class="btn ghost" id="docStampRemove">${icon('trash')} Remove</button>` : ''}
        </div>` : ''}
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="card-header">
      <h2>${icon('fileText')} Operational certificates <span class="hint">${docs.length} of ${MAX_CERTIFICATES}</span></h2>
      ${edit ? `<label class="btn small ${docs.length ? 'secondary' : 'cta'}" for="docCertInput">${icon('plus')} Add certificate</label>
      <input type="file" id="docCertInput" accept="image/*,application/pdf,.pdf" multiple hidden>` : ''}
    </div>
    <p class="muted small">Operating licences and registration certificates of this facility. REALITY HEALTH SYSTEM can see them to confirm the facility. Photos or PDF, up to 2 MB each.</p>
    ${docs.length === 0 ? emptyState('No certificates yet', edit ? 'Add a photo or PDF of your operating licence or registration certificate.' : 'The super admin can add them here.', 'fileText', true) : `
    <ul class="doc-list">
      ${docs.map(d=>{
        const exp = d.valid_until, over = exp && exp < today, soon = exp && !over && daysToExpiry(exp) <= 60;
        return `<li>
          <span class="doc-ic">${icon(d.mime === 'application/pdf' ? 'fileText' : 'eye')}</span>
          <div class="doc-main">
            <strong>${esc(d.title || d.file_name || 'Certificate')}</strong>
            <small>${d.mime === 'application/pdf' ? 'PDF' : 'Photo'} · ${fileSizeText(num(d.size_bytes))} · added ${esc(fmtDate(d.created_at))}${d.synced === 1 ? '' : ' · <span class="text-warning">not uploaded yet</span>'}</small>
            ${exp ? `<span class="exp-chip ${over ? 'over' : soon ? 'soon' : ''}">${over ? 'Expired' : 'Valid until'} ${esc(exp)}</span>` : ''}
          </div>
          <div class="row-actions">
            <button type="button" class="btn small secondary" data-doc-open="${d.id}">${icon('eye')} View</button>
            ${edit ? `<button type="button" class="btn small secondary" data-doc-edit="${d.id}" aria-label="Rename or set expiry">${icon('edit')}</button>
            <button type="button" class="btn small danger-soft" data-doc-del="${d.id}" aria-label="Remove ${esc(d.title)}">${icon('trash')}</button>` : ''}
          </div>
        </li>`;
      }).join('')}
    </ul>`}
  </section>`;
}

function wireSettingsDocs(){
  const st = document.getElementById('docStampInput');
  if(st) st.onchange = async ()=>{
    const f = st.files[0]; if(!f) return;
    try{
      const img = await prepareStampImage(f);
      openModal(`
        <h2>Use this stamp?</h2>
        <p>This is how it will look on receipts and reports.</p>
        <div class="stamp-paper big"><img src="${img}" alt="New stamp"></div>
        <div class="modal-actions">
          <button class="btn secondary" type="button" id="stampCancel">Cancel</button>
          <button class="btn cta" type="button" id="stampOk">${icon('check')} Use this stamp</button>
        </div>`);
      document.getElementById('stampCancel').onclick = closeModal;
      document.getElementById('stampOk').onclick = async ()=>{ await setFacilityStamp(img); closeModal(); toast('Stamp saved. It will print on receipts and reports.', 'success'); renderTabContent(); };
    }catch(err){ toast(err.message, 'error'); }
    st.value = '';
  };
  const rm = document.getElementById('docStampRemove');
  if(rm) rm.onclick = ()=> confirmDialog('Remove the stamp?', 'Receipts and reports will print without a stamp until you upload a new one.', async ()=>{
    await setFacilityStamp(null); toast('Stamp removed.', 'success'); renderTabContent();
  }, 'Remove', true);

  const ci = document.getElementById('docCertInput');
  if(ci) ci.onchange = async ()=>{
    const files = Array.from(ci.files || []); ci.value = '';
    let added = 0;
    for(const f of files){
      try{ await addFacilityDocument(await readCertificateFile(f)); added++; }
      catch(err){ toast(err.message, 'error'); }
    }
    if(added){ toast(`${added} certificate${added === 1 ? '' : 's'} added.`, 'success'); renderTabContent(); }
  };
  document.querySelectorAll('[data-doc-open]').forEach(b=> b.onclick = ()=> openFacilityDocument(b.dataset.docOpen));
  document.querySelectorAll('[data-doc-del]').forEach(b=> b.onclick = ()=>{
    const d = ROWS.facility_documents.get(b.dataset.docDel); if(!d) return;
    confirmDialog('Remove this certificate?', `<strong>${esc(d.title)}</strong> will be removed from this facility on every device.`, async ()=>{
      await removeFacilityDocument(d.id); toast('Certificate removed.', 'success'); renderTabContent();
    }, 'Remove', true);
  });
  document.querySelectorAll('[data-doc-edit]').forEach(b=> b.onclick = ()=>{
    const d = ROWS.facility_documents.get(b.dataset.docEdit); if(!d) return;
    openModal(`
      <h2>Certificate details</h2>
      <form id="docEditForm">
        <div class="field"><label for="deTitle">Name</label><input type="text" id="deTitle" maxlength="200" value="${esc(d.title)}" required placeholder="e.g. NDA operating licence 2026"></div>
        <div class="field"><label for="deValid">Valid until <span class="label-opt">(optional)</span></label><input type="date" id="deValid" value="${esc(d.valid_until || '')}"></div>
        <div class="modal-actions">
          <button class="btn secondary" type="button" id="deCancel">Cancel</button>
          <button class="btn" type="submit">${icon('check')} Save</button>
        </div>
      </form>`);
    document.getElementById('deCancel').onclick = closeModal;
    document.getElementById('docEditForm').onsubmit = async (e)=>{
      e.preventDefault();
      const title = document.getElementById('deTitle').value.trim();
      if(!title){ toast('Enter a name for the certificate.', 'error'); return; }
      await updateFacilityDocument(d.id, { title, valid_until:document.getElementById('deValid').value || null });
      closeModal(); toast('Saved.', 'success'); renderTabContent();
    };
  });
}
