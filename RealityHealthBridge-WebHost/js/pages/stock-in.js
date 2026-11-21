// Stock In page: record deliveries / restocks, and (admin) edit or delete batches.

function viewStockIn(){
  const recent = STATE.batches.slice().reverse().slice(0,50);
  return `
  <div class="si-layout">
  <div class="panel">
    <div class="card-header"><h2>${icon('truck')} Record stock in</h2><span class="hint">New delivery or restock from a supplier</span></div>
    <form id="stockInForm" autocomplete="off">
      <div class="form-section-title"><span class="step-n">1</span>Product</div>
      <div class="form-grid">
        <div class="field span-all" style="max-width:640px;">
          <label for="siDrugName">Drug / product name</label>
          <input list="drugNames" id="siDrugName" name="drugName" placeholder="Start typing, e.g. Panadol 500mg" required>
          <datalist id="drugNames">${STATE.drugs.map(d=>`<option value="${esc(d.name)}">`).join('')}</datalist>
          <div class="field-hint" id="siExistingHint">Pick an existing product to add a new batch, or type a new name to create one.</div>
        </div>
        <div class="field">
          <label for="siForm">Form / product type</label>
          ${comboHtml({ id:'siForm', name:'form', groups:DRUG_FORMS, aliases:FORM_ALIASES, extra:customCatalogValues('form', DRUG_FORMS), placeholder:'Type e.g. tab, syrup, cream' })}
        </div>
        <div class="field">
          <label for="siUnit">Unit / package (how you count &amp; sell it)</label>
          ${comboHtml({ id:'siUnit', name:'unit', groups:DRUG_UNITS, aliases:UNIT_ALIASES, extra:customCatalogValues('unit', DRUG_UNITS), placeholder:'Type e.g. tab, blister, bottle' })}
          <div class="field-hint">Type a few letters to find it, or type a new word.</div>
        </div>
        <div class="field">
          <label for="siPackSize">Strength / pack size <span class="label-opt">(optional)</span></label>
          <input type="text" id="siPackSize" name="packSize" placeholder="e.g. 500mg, 10 x 10, 100ml">
        </div>
        <div class="field">
          <label for="siReorder">Reorder level</label>
          <input type="number" id="siReorder" name="reorderLevel" min="0" inputmode="numeric" placeholder="e.g. 20">
          <div class="field-hint">Alert when stock falls to this.</div>
        </div>
      </div>

      <div class="form-section-title"><span class="step-n">2</span>Batch</div>
      <div class="form-grid">
        <div class="field">
          <label for="siBatchNo">Batch no.</label>
          <input type="text" id="siBatchNo" name="batchNo" placeholder="e.g. B-2026-114">
        </div>
        <div class="field">
          <label for="siExpiry">Expiry date</label>
          <input type="date" id="siExpiry" name="expiry">
          <div class="field-hint text-danger" id="siExpiryWarn" hidden>This date has already passed — expired stock cannot be sold.</div>
        </div>
        <div class="field">
          <label for="siSupplier">Supplier</label>
          <input type="text" id="siSupplier" name="supplier" placeholder="e.g. Kampala Pharma Wholesalers">
        </div>
      </div>

      <div class="form-section-title"><span class="step-n">3</span>Quantity &amp; price</div>
      <div class="form-grid">
        <div class="field">
          <label for="siQty">Quantity received</label>
          <input type="number" id="siQty" name="qty" min="1" inputmode="numeric" required>
        </div>
        <div class="field">
          <label for="siCost">Cost price per unit (UGX)</label>
          <input type="number" id="siCost" name="costPrice" min="0" step="1" inputmode="numeric" required>
        </div>
        <div class="field">
          <label for="siSell">Selling price per unit (UGX)</label>
          <input type="number" id="siSell" name="sellPrice" min="0" step="1" inputmode="numeric" required>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn cta btn-lg" type="submit">${icon('plus')} Add stock</button>
        <button class="btn ghost" type="reset">Clear form</button>
      </div>
    </form>
  </div>

  <aside class="si-side" aria-label="Preview of this batch">
    <div class="batch-label" id="siLabel">
      <div class="bl-head"><span>Batch label</span><em id="blForm">Tablet</em></div>
      <strong class="bl-name" id="blName">New product</strong>
      <dl class="bl-grid">
        <div><dt>Batch</dt><dd id="blBatch">—</dd></div>
        <div><dt>Expiry</dt><dd id="blExpiry">—</dd></div>
        <div><dt>Quantity</dt><dd id="blQty">—</dd></div>
        <div><dt>Supplier</dt><dd id="blSupplier">—</dd></div>
      </dl>
      <div id="siPreview" class="bl-money" hidden></div>
    </div>
    <p class="si-tip">${icon('info')}<span>The label fills in as you type. Sales always use the batch that expires first.</span></p>
  </aside>
  </div>

  <div class="panel">
    <div class="card-header"><h2>${icon('package')} Recent stock-in entries</h2><span class="hint">${STATE.batches.length} batches on file${STATE.batches.length>50?' · showing latest 50':''}</span></div>
    ${STATE.batches.length===0 ? emptyState('No stock recorded yet', 'Batches you add above will be listed here.', 'truck', true) : `
    <div class="table-wrap"><table>
      <thead><tr><th>Received</th><th>Product</th><th>Batch</th><th>Expiry</th><th class="num">Qty in</th><th class="num">Left</th><th class="num">Cost</th><th class="num">Sell</th><th>Supplier</th>${can('records')?'<th><span class="sr-only">Actions</span></th>':''}</tr></thead>
      <tbody>
      ${recent.map(b=>{
        const d = drugById(b.drugId);
        const expired = isExpired(b);
        return `<tr>
          <td class="nowrap mono">${b.dateReceived}</td>
          <td class="cell-strong">${d?esc(d.name):'—'}</td>
          <td>${b.batchNo ? `<span class="batch-code">${esc(b.batchNo)}</span>` : '—'}</td>
          <td class="nowrap">${b.expiry ? `<span class="exp-chip ${expired?'over':(daysToExpiry(b.expiry)<=90?'soon':'')}">${b.expiry}</span>` : '—'}${expired?' <span class="tag out plain">Expired</span>':''}</td>
          <td class="num">${b.qtyReceived}</td>
          <td class="num">${b.qtyRemaining}</td>
          <td class="num">${fmt(b.costPrice)}</td>
          <td class="num">${fmt(b.sellPrice)}</td>
          <td>${esc(b.supplier)||'—'}</td>
          ${can('records') ? `<td class="actions"><div class="row-actions">
            <button class="btn small secondary" data-edit-batch="${b.id}" type="button" aria-label="Edit batch">${icon('edit')} Edit</button>
            <button class="btn small danger-soft" data-delete-batch="${b.id}" type="button" aria-label="Delete batch">${icon('trash')}</button>
          </div></td>` : ''}
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>`}
  </div>
  `;
}

// ---------- Owner-only: edit stock batch ----------
function openEditBatchModal(batchId){
  const b = STATE.batches.find(x=>x.id===batchId);
  if(!b) return;
  const d = drugById(b.drugId);
  openModal(`
    <h2>Edit stock entry</h2>
    <p>${d?esc(d.name):'Drug'} · received ${b.dateReceived}</p>
    <div class="form-grid cols-2">
      <div class="field"><label for="ebBatchNo">Batch no.</label><input type="text" id="ebBatchNo" value="${esc(b.batchNo)}"></div>
      <div class="field"><label for="ebExpiry">Expiry date</label><input type="date" id="ebExpiry" value="${esc(b.expiry)}"></div>
      <div class="field"><label for="ebCost">Cost price (per unit)</label><input type="number" id="ebCost" min="0" step="1" value="${b.costPrice}"></div>
      <div class="field"><label for="ebSell">Selling price (per unit)</label><input type="number" id="ebSell" min="0" step="1" value="${b.sellPrice}"></div>
      <div class="field"><label for="ebQtyReceived">Qty received (original)</label><input type="number" id="ebQtyReceived" min="0" value="${b.qtyReceived}"></div>
      <div class="field"><label for="ebQtyRemaining">Qty remaining now</label><input type="number" id="ebQtyRemaining" min="0" value="${b.qtyRemaining}"></div>
      <div class="field span-all"><label for="ebSupplier">Supplier</label><input type="text" id="ebSupplier" value="${esc(b.supplier)}"></div>
    </div>
    <div class="modal-actions">
      <button class="btn secondary" type="button" id="ebCancel">Cancel</button>
      <button class="btn" type="button" id="ebSave">Save changes</button>
    </div>
  `);
  document.getElementById('ebCancel').onclick = closeModal;
  document.getElementById('ebSave').onclick = async ()=>{
    b.batchNo = document.getElementById('ebBatchNo').value.trim();
    b.expiry = document.getElementById('ebExpiry').value || '';
    b.costPrice = Number(document.getElementById('ebCost').value)||0;
    b.sellPrice = Number(document.getElementById('ebSell').value)||0;
    b.qtyReceived = Math.max(0, Number(document.getElementById('ebQtyReceived').value)||0);
    const wantedRemaining = Math.max(0, Number(document.getElementById('ebQtyRemaining').value)||0);
    b.supplier = document.getElementById('ebSupplier').value.trim();
    await saveBatches();
    await recordStockCorrection(b, wantedRemaining, 'Edited on Stock In page');
    toast('Stock entry updated.', 'success');
    closeModal();
    renderTabContent();
    renderTabs();
  };
}

function wireStockIn(){
  const sf = document.getElementById('stockInForm');
  if(sf){
    const $ = (id)=>document.getElementById(id);
    wireCombos(sf); // type-to-search Form and Unit pickers

    // Existing product: show what's on file and prefill from its latest batch.
    const nameInput = $('siDrugName'), hint = $('siExistingHint');
    const defaultHint = hint.innerHTML;
    nameInput.oninput = ()=>{
      const name = nameInput.value.trim().toLowerCase();
      const drug = name && STATE.drugs.find(d=>d.name.toLowerCase()===name);
      const wasLocked = $('siForm').disabled;
      $('siForm').disabled = $('siUnit').disabled = $('siPackSize').disabled = !!drug;
      if(drug){
        // an existing product keeps its form / unit / pack size: show them in the locked boxes
        $('siForm').value = drug.form || ''; $('siUnit').value = drug.unit || ''; $('siPackSize').value = drug.packSize || '';
      } else if(wasLocked){
        $('siForm').value = $('siUnit').value = $('siPackSize').value = '';
      }
      if(drug){
        const last = STATE.batches.filter(b=>b.drugId===drug.id).slice(-1)[0];
        hint.innerHTML = `<span class="tag info plain">Existing product</span> ${esc(drug.form)} · counted in ${esc(drug.unit)}${drug.packSize?` · ${esc(drug.packSize)}`:''} · ${totalStockQty(drug.id)} in stock. This adds a new batch.`;
        if(!$('siReorder').value && drug.reorderLevel) $('siReorder').placeholder = `Currently ${drug.reorderLevel}`;
        if(last){
          if(!$('siCost').value) $('siCost').value = last.costPrice;
          if(!$('siSell').value) $('siSell').value = last.sellPrice;
          if(!$('siSupplier').value && last.supplier) $('siSupplier').value = last.supplier;
        }
      } else {
        hint.innerHTML = defaultHint;
        $('siReorder').placeholder = 'e.g. 20';
      }
      updatePreview();
    };

    // Live margin preview + expiry warning
    function updatePreview(){
      const qty = Number($('siQty').value)||0, cost = Number($('siCost').value), sell = Number($('siSell').value);
      const box = $('siPreview');
      if(!$('siCost').value || !$('siSell').value){ box.hidden = true; return; }
      const margin = sell - cost;
      const pct = cost > 0 ? Math.round(margin / cost * 100) : null;
      box.hidden = false;
      box.innerHTML = `
        <div class="line"><span>Margin per unit</span><span class="${margin<0?'text-danger':'text-success'}">${margin<0?'-':''}${fmt(Math.abs(margin))}${pct!==null?` (${pct}%)`:''}</span></div>
        ${qty ? `<div class="line"><span>Total cost of this delivery</span><span>${fmt(qty*cost)}</span></div>
        <div class="line"><span>Value at selling price</span><span>${fmt(qty*sell)}</span></div>` : ''}
        ${margin<0 ? `<div class="line text-danger"><span>${icon('alert')} Selling price is below cost.</span></div>` : ''}`;
    }
    ['siQty','siCost','siSell'].forEach(id=> $(id).addEventListener('input', updatePreview));
    // Batch label beside the form
    function updateLabel(){
      const v = id => ($(id) && $(id).value || '').trim();
      const known = STATE.drugs.find(d=>d.name.toLowerCase()===v('siDrugName').toLowerCase());
      const unit = known ? known.unit : v('siUnit');
      const form = known ? known.form : v('siForm');
      const pack = known ? known.packSize : v('siPackSize');
      $('blName').textContent = v('siDrugName') || 'New product';
      $('blForm').textContent = [form, pack].filter(Boolean).join(' · ') || '—';
      $('blBatch').textContent = v('siBatchNo') || '—';
      const exp = v('siExpiry'), days = exp ? daysToExpiry(exp) : null;
      $('blExpiry').textContent = exp || '—';
      $('blExpiry').className = days === null ? '' : days <= 0 ? 'bad' : days <= 90 ? 'soon' : '';
      $('blQty').textContent = v('siQty') ? `${Number(v('siQty')).toLocaleString()} ${unit}` : '—';
      $('blSupplier').textContent = v('siSupplier') || '—';
    }
    sf.addEventListener('input', updateLabel); sf.addEventListener('change', updateLabel);
    sf.addEventListener('reset', ()=> setTimeout(updateLabel, 0));
    updateLabel();
    $('siExpiry').onchange = ()=>{ const v = $('siExpiry').value; $('siExpiryWarn').hidden = !(v && daysToExpiry(v) <= 0); };
    sf.addEventListener('reset', ()=> setTimeout(()=>{ nameInput.oninput(); $('siExpiryWarn').hidden = true; }, 0));

    sf.onsubmit = async (e)=>{
      e.preventDefault();
      // disabled selects are left out of FormData; the existing product's values are used then
      const fd = new FormData(sf);
      const name = (fd.get('drugName')||'').trim();
      if(!name){ toast('Enter the drug / product name.', 'error'); nameInput.focus(); return; }
      if(!fd.get('qty') || Number(fd.get('qty'))<=0){ toast('Enter the quantity received.', 'error'); $('siQty').focus(); return; }
      if(fd.get('costPrice')==='' || fd.get('sellPrice')===''){ toast('Enter both the cost and selling price.', 'error'); return; }
      let drug = STATE.drugs.find(d=>d.name.toLowerCase()===name.toLowerCase());
      if(!drug){
        const form = matchListWord((fd.get('form')||'').trim(), DRUG_FORMS, customCatalogValues('form', DRUG_FORMS));
        const unit = matchListWord((fd.get('unit')||'').trim(), DRUG_UNITS, customCatalogValues('unit', DRUG_UNITS));
        if(!form){ toast('Type the form / product type (e.g. Tablet, Syrup).', 'error'); $('siForm').focus(); return; }
        if(!unit){ toast('Type the unit / package you count it in (e.g. Tabs, Bottles).', 'error'); $('siUnit').focus(); return; }
        drug = {
          id: uid(), name, form, unit, packSize: (fd.get('packSize')||'').trim(),
          reorderLevel: Number(fd.get('reorderLevel'))||0
        };
        STATE.drugs.push(drug);
        await saveDrugs();
      } else if(fd.get('reorderLevel')){
        drug.reorderLevel = Number(fd.get('reorderLevel'));
        await saveDrugs();
      }
      const qty = Number(fd.get('qty'));
      const batch = {
        id: uid(), drugId: drug.id, batchNo: (fd.get('batchNo')||'').trim(),
        expiry: fd.get('expiry') || '', costPrice: Number(fd.get('costPrice')),
        sellPrice: Number(fd.get('sellPrice')), qtyReceived: qty, qtyRemaining: qty,
        dateReceived: todayStr(), supplier: (fd.get('supplier')||'').trim()
      };
      STATE.batches.push(batch);
      await saveBatches();
      toast(`Stocked ${qty} ${drug.unit} of ${drug.name}`, 'success');
      sf.reset();
      renderTabContent();
      renderTabs();
      const again = document.getElementById('siDrugName');
      if(again) again.focus({ preventScroll: true });
    };
  }

  // Owner-only: edit / delete a stock-in batch
  document.querySelectorAll('[data-edit-batch]').forEach(b=>{
    b.onclick = ()=>{
      if(!can('records')) return;
      openEditBatchModal(b.dataset.editBatch);
    };
  });
  document.querySelectorAll('[data-delete-batch]').forEach(b=>{
    b.onclick = ()=>{
      if(!can('records')) return;
      const batch = STATE.batches.find(x=>x.id===b.dataset.deleteBatch);
      if(!batch) return;
      const d = drugById(batch.drugId);
      confirmDialog('Delete stock entry?',
        `Delete the ${batch.qtyReceived}-unit batch of <strong>${d?esc(d.name):'this drug'}</strong>${batch.batchNo?` (Batch ${esc(batch.batchNo)})`:''} received on ${batch.dateReceived}? This cannot be undone.`,
        async ()=>{
          STATE.batches = STATE.batches.filter(x=>x.id!==batch.id);
          await saveBatches();
          toast('Stock entry deleted.', 'success');
          renderTabContent();
          renderTabs();
        }, 'Delete');
    };
  });
}
