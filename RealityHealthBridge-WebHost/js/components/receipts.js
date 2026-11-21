// Receipts, balance payments and printable sales reports.
// ---------- Receipts ----------
// "Jane Nakato (Dispenser)": the person's name and their position here; falls back to the
// username and Admin / Staff for people whose login was removed.
function servedByText(username, role){
  if(!username) return '—';
  const a = findAccount(username);
  const who = a && a.fullName ? a.fullName : username;
  const pos = a && a.position ? a.position : (role === 'owner' ? 'Admin' : role === 'staff' ? 'Staff' : '');
  return pos ? `${who} (${pos})` : who;
}
function buildReceiptHtml(sale){
  const balance = Math.max(0, sale.total - (sale.amountPaid!==undefined?sale.amountPaid:sale.total));
  const paid = sale.amountPaid!==undefined ? sale.amountPaid : sale.total;
  const id = STATE.settings.identity;
  return `
  <div class="receipt-doc">
    ${id && id.logo ? `<div class="rc-logo"><img src="${id.logo}" alt=""></div>` : ''}
    <div class="rc-title">${id ? esc(id.name) : 'REALITY HEALTH BRIDGE'}</div>
    ${id && id.slogan ? `<div class="rc-sub">${esc(id.slogan)}</div>` : ''}
    ${id && id.location ? `<div class="rc-sub">${esc(id.location)}</div>` : ''}
    ${id && id.contact ? `<div class="rc-sub">Tel: ${esc(id.contact)}</div>` : ''}
    <div class="rc-kind">Sales receipt</div>
    <hr>
    <div class="rc-row"><span>Date</span><span>${new Date(sale.date).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div>
    <div class="rc-row"><span>Served by</span><span>${esc(servedByText(sale.soldBy, sale.soldByRole))}</span></div>
    <div class="rc-row"><span>Customer</span><span>${esc(sale.buyer)||'Walk-in customer'}</span></div>
    ${sale.patientNo ? `<div class="rc-row"><span>Patient No.</span><span>${esc(sale.patientNo)}</span></div>` : ''}
    ${sale.buyerContact ? `<div class="rc-row"><span>Contact</span><span>${esc(sale.buyerContact)}</span></div>` : ''}
    ${sale.diagnosis ? `<div class="rc-row"><span>Diagnosis</span><span>${esc(sale.diagnosis)}</span></div>` : ''}
    <hr>
    <div class="rc-items">
      ${sale.items.map(it=>{
        const d = drugById(it.drugId);
        return `<div class="rc-row"><span>${d?esc(d.name):'—'} ×${it.qty}${d && d.unit ? ` ${esc(d.unit)}` : ''}</span><span>${fmt(it.qty*it.unitPrice)}</span></div>`;
      }).join('')}
    </div>
    <hr>
    <div class="rc-row rc-total"><span>TOTAL</span><span>${fmt(sale.total)}</span></div>
    <div class="rc-row"><span>Paid</span><span>${fmt(paid)}</span></div>
    ${balance>0 ? `<div class="rc-row rc-balance"><span>BALANCE DUE</span><span>${fmt(balance)}</span></div>` : `<div class="rc-row"><span>Status</span><span>PAID IN FULL</span></div>`}
    ${sale.additionalDetails ? `<hr><div class="rc-extra"><strong>Additional Details:</strong><br>${esc(sale.additionalDetails).replace(/\n/g,'<br>')}</div>` : ''}
    <hr>
    <div class="rc-sign ${STATE.settings.identity && STATE.settings.identity.stamp ? 'has-stamp' : ''}">
      <div class="rc-sign-line">Signature: ______________________</div>
      <div class="rc-sign-line">Date: ${new Date(sale.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
      ${printStampHtml('rc')}
    </div>
    <div class="rc-foot">Thank you for your purchase.<br>Keep this receipt for any queries.</div>
  </div>
  `;
}
function openReceiptModal(sale, opts = {}){
  const balance = Math.max(0, sale.total - (sale.amountPaid!==undefined?sale.amountPaid:sale.total));
  openModal(`
    <h2>${opts.reprint ? 'Receipt' : 'Sale complete'}</h2>
    ${opts.reprint ? '' : alertBox(balance>0 ? `Recorded as a part-payment. <strong>${fmt(balance)}</strong> is still owed.` : 'Recorded as fully paid.', balance>0 ? 'warning' : 'success')}
    ${buildReceiptHtml(sale)}
    <div class="modal-actions">
      <button class="btn secondary" type="button" id="closeReceiptBtn">${opts.reprint ? 'Close' : 'Done'}</button>
      <button class="btn" type="button" id="printReceiptBtn">${icon('printer')} Print receipt</button>
    </div>
  `);
  document.getElementById('closeReceiptBtn').onclick = closeModal;
  document.getElementById('printReceiptBtn').onclick = ()=>{
    document.getElementById('receiptPrintArea').innerHTML = buildReceiptHtml(sale);
    window.print();
  };
}

// ---------- Balance payments (customer returning to pay off a credit sale) ----------
function buildBalancePaymentReceiptHtml(sale, paymentAmount, paymentDate){
  const paidToDate = sale.amountPaid!==undefined ? sale.amountPaid : sale.total;
  const balance = Math.max(0, sale.total - paidToDate);
  const id = STATE.settings.identity;
  return `
  <div class="receipt-doc">
    ${id && id.logo ? `<div class="rc-logo"><img src="${id.logo}" alt=""></div>` : ''}
    <div class="rc-title">${id ? esc(id.name) : 'REALITY HEALTH BRIDGE'}</div>
    ${id && id.slogan ? `<div class="rc-sub">${esc(id.slogan)}</div>` : ''}
    ${id && id.location ? `<div class="rc-sub">${esc(id.location)}</div>` : ''}
    ${id && id.contact ? `<div class="rc-sub">Tel: ${esc(id.contact)}</div>` : ''}
    <div class="rc-kind">Balance payment receipt</div>
    <hr>
    <div class="rc-row"><span>Payment Date</span><span>${new Date(paymentDate).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div>
    <div class="rc-row"><span>Received by</span><span>${esc(servedByText(session.username, session.role))}</span></div>
    <div class="rc-row"><span>Customer</span><span>${esc(sale.buyer)||'Walk-in customer'}</span></div>
    ${sale.patientNo ? `<div class="rc-row"><span>Patient No.</span><span>${esc(sale.patientNo)}</span></div>` : ''}
    ${sale.buyerContact ? `<div class="rc-row"><span>Contact</span><span>${esc(sale.buyerContact)}</span></div>` : ''}
    <hr>
    <div class="rc-row"><span>Original Sale Date</span><span>${new Date(sale.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</span></div>
    <div class="rc-row"><span>Invoice Total</span><span>${fmt(sale.total)}</span></div>
    <div class="rc-row rc-total"><span>PAID TODAY</span><span>${fmt(paymentAmount)}</span></div>
    <div class="rc-row"><span>Total Paid To Date</span><span>${fmt(paidToDate)}</span></div>
    ${balance>0 ? `<div class="rc-row rc-balance"><span>BALANCE REMAINING</span><span>${fmt(balance)}</span></div>` : `<div class="rc-row"><span>Status</span><span>PAID IN FULL</span></div>`}
    <hr>
    <div class="rc-sign ${STATE.settings.identity && STATE.settings.identity.stamp ? 'has-stamp' : ''}">
      <div class="rc-sign-line">Signature: ______________________</div>
      <div class="rc-sign-line">Date: ${new Date(paymentDate).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
      ${printStampHtml('rc')}
    </div>
    <div class="rc-foot">Thank you for your payment.<br>Keep this receipt for any queries.</div>
  </div>
  `;
}
function openBalancePaymentModal(saleId){
  const sale = STATE.sales.find(s=>s.id===saleId);
  if(!sale) return;
  const paidToDate = sale.amountPaid!==undefined ? sale.amountPaid : sale.total;
  const balance = Math.max(0, sale.total - paidToDate);
  if(balance<=0){ toast('This sale is already fully paid.'); return; }
  openModal(`
    <h2>Record balance payment</h2>
    <p>${esc(sale.buyer)||'Walk-in customer'}${sale.patientNo?` (Patient No. ${esc(sale.patientNo)})`:''} — outstanding balance: <strong>${fmt(balance)}</strong></p>
    <div class="field"><label>Amount being paid now (UGX)</label><input type="number" id="balancePayAmount" min="1" max="${balance}" step="1" value="${balance}"></div>
    <div class="auth-error" id="balancePayError" role="alert"></div>
    <div class="modal-actions">
      <button class="btn secondary" type="button" id="balancePayCancelBtn">Cancel</button>
      <button class="btn" type="button" id="balancePayConfirmBtn">${icon('check')} Record payment</button>
    </div>
  `);
  document.getElementById('balancePayCancelBtn').onclick = closeModal;
  document.getElementById('balancePayConfirmBtn').onclick = async ()=>{
    let amount = Number(document.getElementById('balancePayAmount').value);
    const errBox = document.getElementById('balancePayError');
    if(isNaN(amount) || amount<=0){ errBox.textContent='Enter a valid amount.'; errBox.classList.add('show'); return; }
    if(amount > balance){ errBox.textContent=`Cannot exceed the outstanding balance of ${fmt(balance)}.`; errBox.classList.add('show'); return; }
    const paymentDate = new Date().toISOString();
    sale.amountPaid = paidToDate + amount;
    if(!sale.paymentHistory) sale.paymentHistory = [];
    sale.paymentHistory.push({ date: paymentDate, amount, recordedBy: session.username });
    await saveSales();
    closeModal();
    toast('Payment recorded.', 'success');
    const receiptHtml = buildBalancePaymentReceiptHtml(sale, amount, paymentDate);
    openModal(`
      <h2>Payment recorded</h2>
      ${receiptHtml}
      <div class="modal-actions">
        <button class="btn secondary" type="button" id="closeBalanceReceiptBtn">Close</button>
        <button class="btn" type="button" id="printBalanceReceiptBtn">${icon('printer')} Print receipt</button>
      </div>
    `);
    document.getElementById('closeBalanceReceiptBtn').onclick = ()=>{ closeModal(); renderTabContent(); };
    document.getElementById('printBalanceReceiptBtn').onclick = ()=>{
      document.getElementById('receiptPrintArea').innerHTML = receiptHtml;
      window.print();
    };
  };
}

function buildSalesReportHtml(sales, title){
  const id = STATE.settings.identity;
  const totalRevenue = sales.reduce((a,s)=>a+s.total,0);
  const totalPaid = sales.reduce((a,s)=>a+(s.amountPaid!==undefined?s.amountPaid:s.total),0);
  return `
  <div class="report-doc">
    ${id && id.logo ? `<div class="rp-logo"><img src="${id.logo}" alt=""></div>` : ''}
    <div class="rp-title">${id ? esc(id.name) : 'REALITY HEALTH BRIDGE'}</div>
    ${id && id.slogan ? `<div class="rp-sub">${esc(id.slogan)}</div>` : ''}
    ${id && id.location ? `<div class="rp-sub">${esc(id.location)}</div>` : ''}
    ${id && id.contact ? `<div class="rp-sub">Tel: ${esc(id.contact)}</div>` : ''}
    <div class="rp-meta">${title} — printed ${new Date().toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
    <hr>
    <table>
      <thead><tr><th>Date</th><th>Patient / Buyer</th><th>Patient No.</th><th>Contact</th><th>Diagnosis</th><th>Items</th><th class="rp-num">Total</th><th class="rp-num">Paid</th></tr></thead>
      <tbody>
      ${sales.map(s=>{
        const paid = s.amountPaid!==undefined ? s.amountPaid : s.total;
        return `<tr>
          <td>${s.date.slice(0,10)}</td>
          <td>${esc(s.buyer)||'Walk-in'}</td>
          <td>${esc(s.patientNo)||'—'}</td>
          <td>${esc(s.buyerContact)||'—'}</td>
          <td>${esc(s.diagnosis)||'—'}</td>
          <td>${s.items.map(i=>{const d=drugById(i.drugId);return d?`${esc(d.name)} ×${i.qty}`:'—';}).join(', ')}</td>
          <td class="rp-num">${fmt(s.total)}</td>
          <td class="rp-num">${fmt(paid)}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
    <hr>
    <div class="rp-meta rp-totals">Total: ${fmt(totalRevenue)} — Collected: ${fmt(totalPaid)} — ${sales.length} transaction(s)</div>
    ${reportSignatureHtml()}
    <div class="rp-foot">Generated by REALITY HEALTH BRIDGE for ${id ? esc(id.name) : 'this facility'}.</div>
  </div>
  `;
}
function printSalesReport(sales, title){
  if(sales.length===0){ toast('No sales to include in this report.'); return; }
  document.getElementById('reportPrintArea').innerHTML = buildSalesReportHtml(sales, title);
  window.print();
}

// Signature lines + the facility stamp at the end of every printed report.
function reportSignatureHtml(){
  const me = session ? servedByText(session.username, session.role) : '';
  return `<div class="rp-sign">
    <div class="rp-sign-lines">
      <div>Prepared by: <strong>${esc(me)}</strong></div>
      <div>Signature: ______________________________</div>
      <div>Date: ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
    </div>
    ${printStampHtml('rp') ? `<div class="rp-sign-stamp">${printStampHtml('rp')}Official stamp</div>` : ''}
  </div>`;
}
