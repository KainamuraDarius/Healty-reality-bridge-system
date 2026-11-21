// Inventory page: every product with quantity, value and stock status.
let inventoryFilter = 'all';
let inventorySearch = '';

function inventoryRows(){
  let list = STATE.drugs.slice().sort((a,b)=>a.name.localeCompare(b.name));
  if(inventorySearch){
    const q = inventorySearch.toLowerCase();
    list = list.filter(d=>d.name.toLowerCase().includes(q) || (d.form||'').toLowerCase().includes(q));
  }
  if(inventoryFilter==='low') list = list.filter(d=> {const q=totalStockQty(d.id); return q>0 && q<=(d.reorderLevel||0);});
  if(inventoryFilter==='out') list = list.filter(d=> totalStockQty(d.id)<=0);
  return list;
}

function inventoryResultsHtml(){
  const list = inventoryRows();
  if(STATE.drugs.length===0){
    return `${emptyState('No products yet', 'Products are created automatically when you record stock.', 'package', true)}
      <div class="row" style="justify-content:center;"><button class="btn" type="button" data-goto="stockin">${icon('truck')} Record stock</button></div>`;
  }
  if(list.length===0) return emptyState('No products match', 'Try a different search or filter.', 'search', true);
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>Product</th><th class="num">In stock</th><th class="num">Reorder at</th><th class="num">Avg cost</th><th class="num">Sell price</th><th>Next expiry</th><th>Status</th></tr></thead>
      <tbody>
      ${list.map(d=>{
        const batches = STATE.batches.filter(b=>b.drugId===d.id && b.qtyRemaining>0);
        const qty = totalStockQty(d.id);
        const avgCost = batches.length? batches.reduce((a,b)=>a+b.costPrice*b.qtyRemaining,0)/qty : 0;
        const sellPrices = [...new Set(batches.map(b=>b.sellPrice))];
        const nextExp = batches.filter(b=>b.expiry).map(b=>b.expiry).sort()[0];
        const nextDays = nextExp ? daysToExpiry(nextExp) : null;
        let status = `<span class="tag ok">In stock</span>`, level = '';
        if(qty<=0){ status = `<span class="tag out">Out of stock</span>`; level = 'out'; }
        else if(qty<=(d.reorderLevel||0)){ status = `<span class="tag low">Low</span>`; level = 'low'; }
        // bar: full at 3x the reorder level (or at the most ever received in one batch when there's no reorder level)
        const ref = d.reorderLevel ? d.reorderLevel * 3 : Math.max(1, ...STATE.batches.filter(b=>b.drugId===d.id).map(b=>b.qtyReceived));
        const pctFull = Math.max(qty>0 ? 4 : 0, Math.min(100, Math.round(qty / ref * 100)));
        return `<tr>
          <td><span class="cell-strong">${esc(d.name)}</span><span class="cell-sub">${esc(d.form)}${d.packSize ? ` · ${esc(d.packSize)}` : ''}</span></td>
          <td class="num">${qty.toLocaleString()} <span class="subtle">${esc(d.unit)}</span><span class="meter ${level}" aria-hidden="true"><i style="width:${pctFull}%"></i></span></td>
          <td class="num">${d.reorderLevel||'—'}</td>
          <td class="num">${qty>0?fmt(avgCost):'—'}</td>
          <td class="num">${sellPrices.length? sellPrices.map(fmt).join(' / '):'—'}</td>
          <td class="nowrap">${nextExp ? `<span class="exp-chip ${nextDays<=0 ? 'over' : nextDays<=90 ? 'soon' : ''}">${nextExp}</span>` : '—'}</td>
          <td>${status}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>`;
}

function viewInventory(){
  const lowCount = lowStockDrugs().length, outCount = outOfStockDrugs().length;
  const pill = (key, label, n)=> `<button class="pill ${inventoryFilter===key?'active':''}" data-filter="${key}" type="button" aria-pressed="${inventoryFilter===key}">${label}${n!==undefined?` <span class="pill-count">${n}</span>`:''}</button>`;
  const totalUnits = STATE.drugs.reduce((a,d)=>a+Math.max(0,totalStockQty(d.id)),0);
  return `
  <div class="stats">
    ${statCard('Products', STATE.drugs.length.toLocaleString(), 'package', '', `${totalUnits.toLocaleString()} units on the shelves`)}
    ${can('finance') ? statCard('Stock value (cost)', fmt(stockValue()), 'wallet', 'violet', `${fmt(potentialSalesValue())} at selling price`) : ''}
    ${statCard('Low stock', lowCount, 'alert', lowCount ? 'warning' : 'success', lowCount ? 'at or below reorder level' : 'nothing low', lowCount ? 'amber' : '')}
    ${statCard('Out of stock', outCount, 'xCircle', outCount ? 'danger' : 'success', outCount ? 'restock to sell again' : 'all products available', outCount ? 'warn' : '')}
  </div>
  <div class="panel">
    <div class="card-header"><h2>${icon('package')} Inventory</h2><span class="hint">A–Z · ${STATE.drugs.length} products</span></div>
    <div class="toolbar">
      <div class="input-icon grow">${icon('search')}<input type="search" id="invSearch" aria-label="Search products" placeholder="Search product name or form…" value="${esc(inventorySearch)}"></div>
      <div class="pill-row mb-0" role="group" aria-label="Filter">
        ${pill('all','All', STATE.drugs.length)}
        ${pill('low','Low stock', lowCount)}
        ${pill('out','Out of stock', outCount)}
      </div>
    </div>
    <div id="invResults">${inventoryResultsHtml()}</div>
  </div>
  `;
}

function wireInventory(){
  const results = document.getElementById('invResults');
  const invSearch = document.getElementById('invSearch');
  if(invSearch){
    // Only the results re-render, so the search box keeps focus while typing.
    invSearch.oninput = ()=>{ inventorySearch = invSearch.value; results.innerHTML = inventoryResultsHtml(); makeTablesStackable(results); };
  }
  document.querySelectorAll('[data-filter]').forEach(p=>{
    p.onclick = ()=>{
      inventoryFilter = p.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(x=>{ const on = x===p; x.classList.toggle('active', on); x.setAttribute('aria-pressed', on); });
      results.innerHTML = inventoryResultsHtml();
      makeTablesStackable(results);
    };
  });
}
