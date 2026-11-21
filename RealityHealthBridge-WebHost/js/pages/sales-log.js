// Sales Log page: every sale, receipts, balance payments and (admin) edit/delete.
let salesLogFilter = 'all'; // 'all' | 'balance'

function viewSalesLog(){
  const all = STATE.sales.slice().reverse();
  const balanceOf = s => Math.max(0, s.total - (s.amountPaid!==undefined ? s.amountPaid : s.total));
  const withBalance = all.filter(s=>balanceOf(s)>0);
  const sales = salesLogFilter==='balance' ? withBalance : all;
  const owed = withBalance.reduce((a,s)=>a+balanceOf(s),0);
  return `
  <div class="panel">
    <div class="card-header">
      <h2>${icon('receipt')} Sales log</h2>
      ${all.length>0 ? `<button class="btn secondary small" id="printSalesReportBtn" type="button">${icon('printer')} Print sales report</button>` : ''}
    </div>
    ${all.length===0 ? `${emptyState('No sales recorded yet', 'Completed sales appear here with receipts you can reprint.', 'receipt', true)}
      <div class="row" style="justify-content:center;"><button class="btn" type="button" data-goto="sell">${icon('plus')} Record a sale</button></div>` : `
    <div class="toolbar mb-0">
      <div class="grow">${salesSearchBar('salesLogTable')}</div>
      <div class="pill-row" role="group" aria-label="Filter">
        <button class="pill ${salesLogFilter==='all'?'active':''}" data-sales-filter="all" type="button">All <span class="pill-count">${all.length}</span></button>
        <button class="pill ${salesLogFilter==='balance'?'active':''}" data-sales-filter="balance" type="button">Owing <span class="pill-count">${withBalance.length}</span></button>
      </div>
    </div>
    ${salesLogFilter==='balance' && withBalance.length ? alertBox(`Customers owe a total of <strong>${fmt(owed)}</strong> across ${withBalance.length} sale(s). Use <strong>Add payment</strong> when they pay.`, 'info', 'wallet') : ''}
    ${sales.length===0 ? emptyState('Nobody owes anything', 'All sales are fully paid.', 'checkCircle', true) : `
    <div class="table-wrap"><table id="salesLogTable">
      <thead><tr><th>Date</th><th>Customer</th><th>Items</th><th>Diagnosis</th><th>Sold by</th><th class="num">Total</th><th class="num">Paid</th>${can('finance')?'<th class="num">Profit</th>':''}<th><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>
      ${sales.map(s=>{
        const profit = s.items.reduce((x,it)=>x+(it.unitPrice-it.cost)*it.qty,0);
        const paid = s.amountPaid!==undefined ? s.amountPaid : s.total;
        const balance = Math.max(0, s.total-paid);
        return `<tr>
          <td class="nowrap"><span class="cell-strong mono">${s.date.slice(0,10)}</span><span class="cell-sub mono">${fmtTime(s.date)}</span></td>
          <td><span class="cell-strong">${esc(s.buyer)||'Walk-in'}</span><span class="cell-sub">${s.patientNo ? `<span class="mono nowrap">${esc(s.patientNo)}</span>` : ''}${s.buyerContact?` · <span class="nowrap">${esc(s.buyerContact)}</span>`:''}</span></td>
          <td>${saleItemsText(s)}</td>
          <td>${esc(s.diagnosis)||'—'}</td>
          <td>${esc(s.soldBy)||'—'}</td>
          <td class="num">${fmt(s.total)}</td>
          <td class="num">${fmt(paid)}<span class="cell-sub">${balance>0?`<span class="balance-tag">Owes ${fmt(balance)}</span>`:`<span class="paid-tag">Paid</span>`}</span></td>
          ${can('finance') ? `<td class="num text-success">${fmt(profit)}</td>` : ''}
          <td class="actions"><div class="row-actions">
            <button class="btn small secondary" data-print-sale="${s.id}" type="button" title="View / print receipt">${icon('printer')} Receipt</button>
            ${balance>0 ? `<button class="btn small" data-add-payment="${s.id}" type="button">${icon('banknote')} Add payment</button>` : ''}
            ${can('records') ? `
            <button class="btn small secondary" data-edit-sale="${s.id}" type="button" aria-label="Edit sale">${icon('edit')}</button>
            <button class="btn small danger-soft" data-delete-sale="${s.id}" type="button" aria-label="Delete sale">${icon('trash')}</button>` : ''}
          </div></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>${salesNoMatch('salesLogTable')}`}`}
  </div>
  `;
}

function openEditSaleModal(saleId){
  const sale = STATE.sales.find(x=>x.id===saleId);
  if(!sale) return;
  openModal(`
    <h2>Edit sale</h2>
    <p>Changing quantities returns or re-deducts stock automatically. Sold on ${fmtDate(sale.date)}.</p>
    <div class="form-grid cols-2">
      <div class="field"><label for="esBuyer">Customer name</label><input type="text" id="esBuyer" value="${esc(sale.buyer)}"></div>
      <div class="field"><label for="esPatientNo">Patient no.</label><input type="text" id="esPatientNo" value="${esc(sale.patientNo)}"><div class="field-hint">Edit only to correct an error.</div></div>
      <div class="field"><label for="esBuyerContact">Phone</label><input type="text" id="esBuyerContact" value="${esc(sale.buyerContact)}"></div>
      <div class="field"><label for="esDiagnosis">Diagnosis / reason</label><input type="text" id="esDiagnosis" value="${esc(sale.diagnosis)}"></div>
      <div class="field span-all"><label for="esAdditionalDetails">Notes</label><textarea id="esAdditionalDetails" rows="2">${esc(sale.additionalDetails)}</textarea></div>
    </div>
    <div class="form-section-title">Items</div>
    <div class="table-wrap"><table class="table-compact">
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th><span class="sr-only">Remove</span></th></tr></thead>
      <tbody id="esItemsBody">
        ${sale.items.map((it,idx)=>{
          const d = drugById(it.drugId);
          return `<tr data-item-idx="${idx}" data-drug-id="${it.drugId}">
            <td class="cell-strong">${d?esc(d.name):'—'}</td>
            <td class="num"><input type="number" class="es-qty" min="0" value="${it.qty}" style="width:80px;min-height:38px;" aria-label="Quantity"></td>
            <td class="num"><input type="number" class="es-price" min="0" step="1" value="${it.unitPrice}" style="width:110px;min-height:38px;" aria-label="Unit price"></td>
            <td class="actions"><button type="button" class="btn small danger-soft" data-es-remove="${idx}" aria-label="Remove item">${icon('trash')}</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
    <div class="field mt-4"><label for="esAmountPaid">Amount paid (UGX)</label><input type="number" id="esAmountPaid" min="0" step="1" value="${sale.amountPaid!==undefined?sale.amountPaid:sale.total}"></div>
    <div class="modal-actions">
      <button class="btn secondary" type="button" id="esCancel">Cancel</button>
      <button class="btn" type="button" id="esSave">Save changes</button>
    </div>
  `, { wide: true });
  document.getElementById('esCancel').onclick = closeModal;
  document.querySelectorAll('[data-es-remove]').forEach(btn=>{
    btn.onclick = ()=>{ btn.closest('tr').remove(); };
  });
  document.getElementById('esSave').onclick = async ()=>{
    // 1) Revert original stock deduction for this sale
    sale.items.forEach(it=>{
      const batch = STATE.batches.find(x=>x.id===it.batchId);
      if(batch) batch.qtyRemaining += it.qty;
    });

    // 2) Read the edited line items
    const rows = Array.from(document.querySelectorAll('#esItemsBody tr'));
    const edited = rows.map(r=>({
      drugId: r.dataset.drugId,
      qty: Number(r.querySelector('.es-qty').value)||0,
      unitPrice: Number(r.querySelector('.es-price').value)||0
    })).filter(it=>it.qty>0);

    // 3) Validate against currently-available non-expired stock (which now includes the reverted qty)
    const neededByDrug = {};
    edited.forEach(it=>{ neededByDrug[it.drugId] = (neededByDrug[it.drugId]||0) + it.qty; });
    let insufficient = null;
    for(const drugId in neededByDrug){
      if(neededByDrug[drugId] > totalSellableQty(drugId)){ insufficient = drugId; break; }
    }
    if(insufficient){
      // Roll back the revert — re-apply the original deduction so stock stays consistent
      sale.items.forEach(it=>{
        const batch = STATE.batches.find(x=>x.id===it.batchId);
        if(batch) batch.qtyRemaining -= it.qty;
      });
      const d = drugById(insufficient);
      toast(`Cannot save — not enough non-expired stock of ${d?d.name:'that drug'} for the edited quantity.`);
      return;
    }

    // 4) Re-deduct stock FEFO for the edited items
    const newItems = [];
    edited.forEach(it=>{
      let remaining = it.qty;
      const batches = sellableBatchesForDrug(it.drugId).sort((a,b)=> (a.expiry||'9999')<(b.expiry||'9999')?-1:1);
      for(const b of batches){
        if(remaining<=0) break;
        const take = Math.min(b.qtyRemaining, remaining);
        b.qtyRemaining -= take;
        remaining -= take;
        newItems.push({drugId:it.drugId, batchId:b.id, qty:take, unitPrice:it.unitPrice, cost:b.costPrice});
      }
    });

    const newTotal = newItems.reduce((a,i)=>a+i.qty*i.unitPrice,0);
    let newPaid = Number(document.getElementById('esAmountPaid').value);
    if(isNaN(newPaid) || newPaid<0) newPaid = 0;
    if(newPaid > newTotal) newPaid = newTotal;

    sale.items = newItems;
    sale.total = newTotal;
    sale.buyer = document.getElementById('esBuyer').value.trim();
    sale.patientNo = document.getElementById('esPatientNo').value.trim();
    sale.buyerContact = document.getElementById('esBuyerContact').value.trim();
    sale.diagnosis = document.getElementById('esDiagnosis').value.trim();
    sale.additionalDetails = document.getElementById('esAdditionalDetails').value.trim();
    sale.amountPaid = newPaid;

    await saveBatches();
    await saveSales();
    toast('Sale updated.', 'success');
    closeModal();
    renderTabContent();
    renderTabs();
  };
}

function wireSalesLog(){
  document.querySelectorAll('[data-sales-filter]').forEach(p=>{
    p.onclick = ()=>{ salesLogFilter = p.dataset.salesFilter; renderTabContent(); };
  });
  // Print receipt for any past sale (any logged-in role)
  document.querySelectorAll('[data-print-sale]').forEach(b=>{
    b.onclick = ()=>{
      const sale = STATE.sales.find(s=>s.id===b.dataset.printSale);
      if(sale) openReceiptModal(sale, { reprint: true });
    };
  });
  // Record a payment toward an outstanding balance (credit / part-paid sale)
  document.querySelectorAll('[data-add-payment]').forEach(b=>{
    b.onclick = ()=> openBalancePaymentModal(b.getAttribute('data-add-payment'));
  });
  const printSalesReportBtn = document.getElementById('printSalesReportBtn');
  if(printSalesReportBtn){
    printSalesReportBtn.onclick = ()=> printSalesReport(STATE.sales.slice().reverse(), 'Sales Report');
  }

  // Super admin, or admins ticked "Edit / delete records": edit / delete a recorded sale
  document.querySelectorAll('[data-edit-sale]').forEach(b=>{
    b.onclick = ()=>{
      if(!can('records')) return;
      openEditSaleModal(b.dataset.editSale);
    };
  });
  document.querySelectorAll('[data-delete-sale]').forEach(b=>{
    b.onclick = ()=>{
      if(!can('records')) return;
      const sale = STATE.sales.find(x=>x.id===b.dataset.deleteSale);
      if(!sale) return;
      confirmDialog('Delete this sale?',
        `Delete the sale of <strong>${fmt(sale.total)}</strong> to ${esc(sale.buyer)||'a walk-in customer'}? The sold stock will be returned to inventory. This cannot be undone.`,
        async ()=>{
          // Return stock to the batches it was deducted from
          sale.items.forEach(it=>{
            const batch = STATE.batches.find(x=>x.id===it.batchId);
            if(batch) batch.qtyRemaining += it.qty;
          });
          STATE.sales = STATE.sales.filter(x=>x.id!==sale.id);
          await saveBatches();
          await saveSales();
          toast('Sale deleted and stock restored.', 'success');
          renderTabContent();
          renderTabs();
        });
    };
  });
}
