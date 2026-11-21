// Expiry Watch page: batches with stock left, soonest expiry first.
function viewExpiry(){
  const batches = STATE.batches.filter(b=>b.qtyRemaining>0 && b.expiry).slice().sort((a,b)=>new Date(a.expiry)-new Date(b.expiry));
  const bucket = (fn)=> batches.filter(b=>fn(daysToExpiry(b.expiry)));
  const expired = bucket(d=>d<=0), soon = bucket(d=>d>0 && d<=30), later = bucket(d=>d>30 && d<=90);
  const valueAt = (list)=> list.reduce((a,b)=>a+b.qtyRemaining*b.costPrice,0);
  return `
  <div class="stats">
    ${statCard('Expired (still on shelf)', expired.length, 'xCircle', expired.length ? 'danger' : 'success', expired.length ? `${fmt(valueAt(expired))} at cost — remove from sale` : 'nothing expired', expired.length ? 'warn' : '')}
    ${statCard('Expiring within 30 days', soon.length, 'alert', soon.length ? 'danger' : 'success', soon.length ? `${fmt(valueAt(soon))} at cost` : 'none')}
    ${statCard('Expiring in 31–90 days', later.length, 'hourglass', later.length ? 'warning' : 'success', later.length ? `${fmt(valueAt(later))} at cost` : 'none')}
  </div>
  <div class="panel">
    <div class="card-header"><h2>${icon('hourglass')} Expiry watch</h2><span class="hint">Soonest expiry first</span></div>
    ${batches.length===0 ? emptyState('No expiry dates recorded', 'Add an expiry date when you record stock to track it here.', 'calendar', true) : `
    <div class="table-wrap"><table>
      <thead><tr><th>Product</th><th>Batch</th><th>Expiry date</th><th class="num">Qty left</th><th class="num">Value (cost)</th><th>Status</th></tr></thead>
      <tbody>
      ${batches.map(b=>{
        const d = drugById(b.drugId);
        const days = daysToExpiry(b.expiry);
        let status = `<span class="tag ok">OK · ${days}d</span>`;
        let cls = '';
        if(days<=0){ status = `<span class="tag out">Expired</span>`; cls='expiry-over'; }
        else if(days<=30){ status = `<span class="tag out">Expires in ${days}d</span>`; cls='expiry-over'; }
        else if(days<=90){ status = `<span class="tag low">Expires in ${days}d</span>`; cls='expiry-soon'; }
        return `<tr>
          <td class="cell-strong">${d?esc(d.name):'—'}</td>
          <td>${b.batchNo ? `<span class="batch-code">${esc(b.batchNo)}</span>` : '—'}</td>
          <td class="nowrap"><span class="exp-chip ${days<=30?'over':days<=90?'soon':''}">${b.expiry}</span></td>
          <td class="num">${b.qtyRemaining}${d?` <span class="subtle">${esc(d.unit)}</span>`:''}</td>
          <td class="num">${fmt(b.qtyRemaining*b.costPrice)}</td>
          <td>${status}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>`}
  </div>
  `;
}
