// Dashboard page.

function greeting(){
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// Today band at the top of the home page (admins and staff).
function dashHero(firstName, figureLabel, figure, figureSub){
  const name = STATE.settings.identity ? STATE.settings.identity.name : 'your facility';
  const day = new Date().toLocaleDateString('en-GB',{ weekday:'long', day:'numeric', month:'short', year:'numeric' });
  return `
  <section class="dash-hero">
    <div class="dash-hero-copy">
      <span class="dash-date">${esc(day)}</span>
      <h2>${greeting()}, ${esc(firstName)}</h2>
      <p>Here's ${esc(name)} today.</p>
      <div class="dash-hero-actions">
        <button class="btn cta" type="button" data-goto="sell">${icon('plus')} New sale</button>
        <button class="btn dash-glass" type="button" data-goto="stockin">${icon('truck')} Stock in</button>
      </div>
    </div>
    <div class="dash-hero-figure">
      <span>${figureLabel}</span>
      <strong>${figure}</strong>
      <em>${figureSub}</em>
    </div>
  </section>`;
}
// "Needs attention" as a short action list: out of stock, low stock, expiring.
function attentionListHtml(low, out, exp){
  const n = low.length + out.length + exp.length;
  if(n === 0) return emptyState('All good', 'No low stock or expiring items.', 'checkCircle', true);
  const item = (tone, ic, name, sub, tag, goto)=> `<button class="att-item" type="button" data-goto="${goto}"><span class="att-ic ${tone}">${icon(ic)}</span><span class="att-txt"><strong>${name}</strong><small>${sub}</small></span><span class="tag ${tone==='danger'?'out':'low'}">${tag}</span></button>`;
  const rows = [
    ...out.map(d=> item('danger', 'xCircle', esc(d.name), 'Restock to sell again', 'Out', 'inventory')),
    ...low.map(d=> item('warning', 'alert', esc(d.name), `Reorder level ${d.reorderLevel||0}`, `${totalStockQty(d.id)} left`, 'inventory')),
    ...exp.slice(0,6).map(b=>{ const d = drugById(b.drugId), days = daysToExpiry(b.expiry);
      return item(days<=0 ? 'danger' : 'warning', 'hourglass', d ? esc(d.name) : '—', `Batch <span class="mono">${esc(b.batchNo)||'—'}</span> · ${b.qtyRemaining} left`, days<=0 ? 'Expired' : `${days}d`, 'expiry'); })
  ];
  return `<div class="att-list">${rows.join('')}</div>`;
}

function viewDashboard(){
  if(!isOwner()) return viewStaffHome();
  const low = lowStockDrugs(), out = outOfStockDrugs(), exp = expiringBatches(30);
  const today = todaysSales();
  const acc = findAccount(session.username) || {};
  const firstName = (acc.fullName || session.username).split(' ')[0];
  const attention = low.length + out.length + exp.length;
  const isEmpty = STATE.drugs.length === 0;
  const money = can('finance'); // profit, cost and stock value: super admin, or ticked "Finance"

  return `
  ${dashHero(firstName, "Today's sales", fmt(todaysRevenue()), `${today.length} sale${today.length===1?'':'s'}${money ? ` · ${fmt(todaysProfit())} profit` : ''}`)}

  ${isSuperAdmin() && staffAccounts().length===0 && partnerAdmins().length===0 ? alertBox(`<span class="alert-title">Add your team</span>Create a login for each person who dispenses or sells (up to ${MAX_STAFF_ACCOUNTS} staff), and up to ${MAX_PARTNER_ADMINS()} more admins, such as a co-owner or manager. You choose what each admin may see. Every sale then shows who made it. <a data-goto="team" role="button" tabindex="0">Go to Team →</a>`, 'info', 'users') : ''}

  ${isEmpty ? `
  <div class="panel onboarding">
    ${emptyState('Your stock book is empty', 'Start by recording your first delivery under <strong>Stock In</strong>. Once stock is in, you can sell, print receipts and track expiry.', 'package')}
    <div class="row" style="justify-content:center;"><button class="btn cta" type="button" data-goto="stockin">${icon('plus')} Record first stock</button></div>
  </div>` : ''}

  <div class="stats">
    ${money ? statCard("Today's profit", fmt(todaysProfit()), 'trendingUp', 'success', today.length ? `${Math.round(todaysProfit() / Math.max(1, todaysRevenue()) * 100)}% of today's sales` : 'no sales yet') : ''}
    ${money ? statCard('Stock value (cost)', fmt(stockValue()), 'package', 'violet', `${fmt(potentialSalesValue())} at selling price`) : ''}
    ${statCard('Low / out of stock', `${low.length} / ${out.length}`, 'alert', (low.length+out.length)>0 ? 'danger' : 'success', 'products needing restock', (low.length+out.length)>0 ? 'warn' : '')}
    ${statCard('Expiring in 30 days', exp.length, 'hourglass', exp.length>0 ? 'warning' : 'success', 'batches with stock left', exp.length>0 ? 'amber' : '')}
  </div>

  <div class="two-col">
    <div class="panel">
      <div class="card-header"><h2>${icon('receipt')} Today's transactions</h2><span class="hint">${today.length} sale(s)</span></div>
      ${today.length===0 ? emptyState('No sales yet today', 'Sales you record under <a data-goto="sell" role="button" tabindex="0">Sell / Dispense</a> will appear here.', 'receipt', true) :
        `${salesSearchBar('dashSalesTable')}<div class="table-wrap"><table id="dashSalesTable"><thead><tr><th>Time</th><th>Customer</th><th>Items</th><th>Diagnosis</th><th class="num">Total</th></tr></thead><tbody>
        ${today.slice().reverse().map(s=>`
          <tr>
            <td class="nowrap mono">${fmtTime(s.date)}</td>
            <td><span class="cell-strong">${esc(s.buyer)||'Walk-in'}</span><span class="cell-sub mono">${s.patientNo ? esc(s.patientNo) : ''}${s.buyerContact ? ' · ' + esc(s.buyerContact) : ''}</span></td>
            <td>${saleItemsText(s)}</td>
            <td>${esc(s.diagnosis)||'—'}</td>
            <td class="num">${fmt(s.total)}</td>
          </tr>`).join('')}
        </tbody></table></div>${salesNoMatch('dashSalesTable')}`}
    </div>
    <div class="panel">
      <div class="card-header"><h2>${icon('alert')} Needs attention</h2>${attention ? `<span class="hint">${attention}</span>` : ''}</div>
      ${attentionListHtml(low, out, exp)}
    </div>
  </div>

  <div class="panel">
    <div class="card-header"><h2>${icon('barChart')} All-time summary</h2><span class="hint">since the first record</span></div>
    <dl class="ledger-row">
      <div><dt>Sales revenue</dt><dd>${fmt(STATE.sales.reduce((a,s)=>a+s.total,0))}</dd><small>${STATE.sales.length} sales</small></div>
      ${money ? `<div><dt>Profit (margin)</dt><dd class="good">${fmt(allTimeProfit())}</dd><small>from batch cost prices</small></div>` : ''}
      <div><dt>Stock received</dt><dd>${STATE.batches.reduce((a,b)=>a+b.qtyReceived,0).toLocaleString()} <span>units</span></dd><small>${STATE.batches.length} batches</small></div>
      <div><dt>Units sold</dt><dd>${STATE.sales.reduce((a,s)=>a+s.items.reduce((x,i)=>x+i.qty,0),0).toLocaleString()} <span>units</span></dd><small>dispensed to patients</small></div>
    </dl>
  </div>
  `;
}

function wireDashboard(){ /* quick actions use data-goto (handled in shell.js) */ }

// Staff home: the day's work at a glance — no profit, stock value or other finance figures.
function viewStaffHome(){
  const low = lowStockDrugs(), out = outOfStockDrugs(), exp = expiringBatches(30);
  const today = todaysSales();
  const mine = today.filter(s=>s.soldBy===session.username);
  const unitsToday = today.reduce((a,s)=>a+s.items.reduce((x,i)=>x+i.qty,0),0);
  const acc = findAccount(session.username) || {};
  const firstName = (acc.fullName || session.username).split(' ')[0];
  const attention = low.length + out.length + exp.length;
  return `
  ${dashHero(firstName, 'My sales today', String(mine.length), `${today.length} sale${today.length===1?'':'s'} by everyone today`)}

  <div class="stats">
    ${statCard('Items sold today', unitsToday.toLocaleString(), 'cart', 'violet', 'units dispensed')}
    ${statCard('Low / out of stock', `${low.length} / ${out.length}`, 'alert', (low.length+out.length)>0 ? 'danger' : 'success', 'tell your admin to restock', (low.length+out.length)>0 ? 'warn' : '')}
    ${statCard('Expiring in 30 days', exp.length, 'hourglass', exp.length>0 ? 'warning' : 'success', 'sell these first', exp.length>0 ? 'amber' : '')}
  </div>

  <div class="two-col">
    <div class="panel">
      <div class="card-header"><h2>${icon('receipt')} Today's sales</h2><span class="hint">${today.length}</span></div>
      ${today.length===0 ? emptyState('No sales yet today', 'Sales recorded under <a data-goto="sell" role="button" tabindex="0">Sell / Dispense</a> appear here.', 'receipt', true) :
        `${salesSearchBar('dashSalesTable')}<div class="table-wrap"><table id="dashSalesTable"><thead><tr><th>Time</th><th>Customer</th><th>Items</th><th>Sold by</th><th class="num">Total</th></tr></thead><tbody>
        ${today.slice().reverse().map(s=>`
          <tr>
            <td class="nowrap mono">${fmtTime(s.date)}</td>
            <td><span class="cell-strong">${esc(s.buyer)||'Walk-in'}</span><span class="cell-sub mono">${esc(s.patientNo)||''}</span></td>
            <td>${saleItemsText(s)}</td>
            <td>${esc(s.soldBy)||'—'}</td>
            <td class="num">${fmt(s.total)}</td>
          </tr>`).join('')}
        </tbody></table></div>${salesNoMatch('dashSalesTable')}`}
    </div>
    <div class="panel">
      <div class="card-header"><h2>${icon('alert')} Needs attention</h2>${attention ? `<span class="hint">${attention}</span>` : ''}</div>
      ${attentionListHtml(low, out, exp)}
    </div>
  </div>
  `;
}
