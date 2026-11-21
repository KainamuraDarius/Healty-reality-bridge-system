// Finance page (admins only; staff are blocked by role).
let financeDate = todayStr();
let financeWeekOf = todayStr();
let financeMonth = new Date().getMonth();
let financeYear = new Date().getFullYear();
let financePeriod = 'day'; // 'day' | 'week' | 'month'
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function moneyRow(label, value, opts={}){
  const cls = value < 0 ? 'text-danger' : (opts.neutral ? '' : 'text-success');
  return `<div class="line${opts.total?' total':''}"><span>${label}</span><span class="${cls}">${value<0?'-':''}${fmt(Math.abs(value))}</span></div>`;
}

function financePeriodPanel(key, title, startDate, endDate, dateControlsHtml){
  const exp = expenditureInRange(startDate, endDate);
  const inc = incomeInRange(startDate, endDate);
  const rev = revenueInRange(startDate, endDate);
  const bal = outstandingBalanceInRange(startDate, endDate);
  const profit = profitInRange(startDate, endDate);
  const net = inc - exp;
  const rows = batchesInRange(startDate, endDate);
  const sales = salesInRange(startDate, endDate);
  const tableId = `finSalesTable_${key}`;
  return `
  <div class="panel">
    <div class="finance-controls">${dateControlsHtml}</div>
    <div class="stats">
      ${statCard('Income received', fmt(inc), 'banknote', 'success', `${sales.length} sale(s)`)}
      ${statCard('Spent on restocking', fmt(exp), 'truck', 'warning', `${rows.length} batch(es)`)}
      ${statCard(net>=0 ? 'Net profit' : 'Net loss', `${net<0?'-':''}${fmt(Math.abs(net))}`, net>=0 ? 'trendingUp' : 'trendingDown', net>=0 ? 'success' : 'danger', 'income minus restocking', net>=0 ? 'good' : 'warn')}
    </div>
    <div class="summary finance-breakdown">
      ${moneyRow('Invoiced revenue (goods sold)', rev, {neutral:true})}
      ${moneyRow('Margin on goods sold', profit, {neutral:true})}
      ${bal>0 ? moneyRow('Still owed by customers', bal, {neutral:true}) : ''}
    </div>
    <div class="grid-2 mt-5">
      <div>
        <h3>Stock received <span class="hint">${rows.length}</span></h3>
        ${rows.length===0 ? emptyState('', 'No stock received in this period.', 'truck', true) : `
        <div class="table-wrap"><table class="table-compact"><thead><tr><th>Date</th><th>Product</th><th class="num">Qty</th><th class="num">Cost</th></tr></thead><tbody>
        ${rows.map(b=>{const d=drugById(b.drugId);return `<tr><td class="nowrap mono">${b.dateReceived}</td><td>${d?esc(d.name):'—'}</td><td class="num">${b.qtyReceived}</td><td class="num">${fmt(b.qtyReceived*b.costPrice)}</td></tr>`;}).join('')}
        </tbody></table></div>`}
      </div>
      <div>
        <div class="row-between mb-3"><h3 class="mb-0">Sales made <span class="hint">${sales.length}</span></h3>
        ${sales.length ? `<button class="btn secondary small" type="button" data-print-finance-report data-start="${startDate}" data-end="${endDate}" data-title="${esc(title)} Sales Report">${icon('printer')} Print report</button>` : ''}</div>
        ${sales.length===0 ? emptyState('', 'No sales in this period.', 'receipt', true) : `
        ${salesSearchBar(tableId)}<div class="table-wrap"><table id="${tableId}" class="table-compact"><thead><tr><th>Date</th><th>Customer</th><th>Diagnosis</th><th class="num">Total</th><th class="num">Paid</th></tr></thead><tbody>
        ${sales.map(s=>`<tr><td class="nowrap mono">${s.date.slice(0,10)}</td><td><span class="cell-strong">${esc(s.buyer)||'Walk-in'}</span><span class="cell-sub">${s.patientNo ? `<span class="mono nowrap">${esc(s.patientNo)}</span>` : ''}${s.buyerContact?` · <span class="nowrap">${esc(s.buyerContact)}</span>`:''}</span></td><td>${esc(s.diagnosis)||'—'}</td><td class="num">${fmt(s.total)}</td><td class="num">${fmt(s.amountPaid!==undefined?s.amountPaid:s.total)}</td></tr>`).join('')}
        </tbody></table></div>${salesNoMatch(tableId)}`}
      </div>
    </div>
  </div>
  `;
}

function viewFinance(){
  // The super admin, and admins the super admin ticked "Finance" for; nobody else reaches this page.
  if(!can('finance')){
    return `
    <div class="panel finance-lock">
      <span class="empty-icon">${icon('lock')}</span>
      <h2>Finance is not open to you</h2>
      <p class="muted">Income, spending and profit figures are visible to the super admin, and to admins the super admin allows.</p>
    </div>
    `;
  }
  const mr = monthRange(financeMonth, financeYear);
  const thisYear = new Date().getFullYear();
  let yearOptions = '';
  for(let y=thisYear-4; y<=thisYear+1; y++) yearOptions += `<option value="${y}" ${y===financeYear?'selected':''}>${y}</option>`;
  const allNet = incomeAllTime() - expenditureAllTime();
  const periodPill = (key,label)=> `<button class="pill ${financePeriod===key?'active':''}" type="button" data-fin-period="${key}" aria-pressed="${financePeriod===key}">${label}</button>`;

  let periodHtml = '';
  if(financePeriod==='day'){
    periodHtml = financePeriodPanel('day', financeDate===todayStr() ? 'Today' : fmtDate(financeDate), financeDate, financeDate,
      `<div class="field"><label for="financeDateInput">Date</label><input type="date" id="financeDateInput" value="${financeDate}"></div>`);
  } else if(financePeriod==='week'){
    const ws = startOfWeek(financeWeekOf), we = endOfWeek(financeWeekOf);
    periodHtml = financePeriodPanel('week', `Week ${ws} to ${we}`, ws, we,
      `<div class="field"><label for="financeWeekInput">Any date in the week</label><input type="date" id="financeWeekInput" value="${financeWeekOf}"></div>
       <div class="finance-range">${icon('calendar')} Mon ${fmtDate(ws)} – Sun ${fmtDate(we)}</div>`);
  } else {
    periodHtml = financePeriodPanel('month', `${MONTH_NAMES[financeMonth]} ${financeYear}`, mr.start, mr.end,
      `<div class="field"><label for="financeMonthInput">Month</label><select id="financeMonthInput">${MONTH_NAMES.map((m,i)=>`<option value="${i}" ${i===financeMonth?'selected':''}>${m}</option>`).join('')}</select></div>
       <div class="field"><label for="financeYearInput">Year</label><select id="financeYearInput">${yearOptions}</select></div>`);
  }

  return `
  <div class="page-head">
    <div><h2>All-time overview</h2><p>Since you started using Reality Health Bridge.</p></div>
  </div>
  <div class="stats">
    ${statCard('All-time income', fmt(incomeAllTime()), 'banknote', 'success')}
    ${statCard('All-time spending', fmt(expenditureAllTime()), 'truck', 'warning')}
    ${statCard(`All-time ${allNet>=0?'profit':'loss'}`, `${allNet<0?'-':''}${fmt(Math.abs(allNet))}`, allNet>=0 ? 'trendingUp' : 'trendingDown', allNet>=0 ? 'success' : 'danger', '', allNet>=0 ? 'good' : 'warn')}
    ${statCard('Owed by customers', fmt(outstandingBalanceAllTime()), 'wallet', 'violet')}
  </div>

  <div class="page-head mt-5">
    <div><h2>By period</h2><p>Pick a day, week or month to see what came in and went out.</p></div>
    <div class="pill-row mb-0" role="group" aria-label="Period">
      ${periodPill('day','Day')}${periodPill('week','Week')}${periodPill('month','Month')}
    </div>
  </div>
  ${periodHtml}
  `;
}

function wireFinance(){
  document.querySelectorAll('[data-fin-period]').forEach(p=>{
    p.onclick = ()=>{ financePeriod = p.dataset.finPeriod; renderTabContent(); };
  });
  const financeDateInput = document.getElementById('financeDateInput');
  if(financeDateInput) financeDateInput.onchange = ()=>{ financeDate = financeDateInput.value || todayStr(); renderTabContent(); };
  const financeWeekInput = document.getElementById('financeWeekInput');
  if(financeWeekInput) financeWeekInput.onchange = ()=>{ financeWeekOf = financeWeekInput.value || todayStr(); renderTabContent(); };
  const financeMonthInput = document.getElementById('financeMonthInput');
  if(financeMonthInput) financeMonthInput.onchange = ()=>{ financeMonth = Number(financeMonthInput.value); renderTabContent(); };
  const financeYearInput = document.getElementById('financeYearInput');
  if(financeYearInput) financeYearInput.onchange = ()=>{ financeYear = Number(financeYearInput.value); renderTabContent(); };
  document.querySelectorAll('[data-print-finance-report]').forEach(btn=>{
    btn.onclick = ()=>{
      const sales = salesInRange(btn.dataset.start, btn.dataset.end);
      printSalesReport(sales, btn.dataset.title);
    };
  });
}
