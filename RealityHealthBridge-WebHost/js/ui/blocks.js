// Small reusable UI blocks shared by several pages: empty state, alert, stat card.

// Reusable empty-state block
function emptyState(title, message, iconName = 'info', compact = false){
  return `<div class="empty${compact ? ' compact' : ''}">
    <span class="empty-icon">${icon(iconName)}</span>
    ${title ? `<div class="empty-title">${title}</div>` : ''}
    ${message ? `<div>${message}</div>` : ''}
  </div>`;
}

// Reusable alert/notice block. tone: info | warning | danger | success
function alertBox(html, tone = 'warning', iconName){
  const ic = iconName || ({ info:'info', warning:'alert', danger:'alert', success:'checkCircle' })[tone] || 'info';
  return `<div class="alert alert-${tone}">${icon(ic)}<div class="alert-body">${html}</div></div>`;
}

// Stat card used across Dashboard and Finance.
function statCard(label, value, iconName, tone = '', sub = '', valueClass = ''){
  return `<div class="stat${tone ? ' tone-' + tone : ''}">
    <div class="stat-top"><span class="stat-label">${label}</span><span class="stat-icon">${icon(iconName)}</span></div>
    <div class="stat-value ${valueClass}" title="${esc(String(value).replace(/<[^>]+>/g,''))}">${value}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
  </div>`;
}

function saleItemsText(s){
  return s.items.map(i=>{ const d = drugById(i.drugId); return d ? `${esc(d.name)} ×${i.qty}` : '—'; }).join(', ');
}

// Copies each column header onto its cells (data-label) so tables can reflow into
// labelled cards on phones. Tables with class "no-stack" are left as normal tables.
function makeTablesStackable(root=document){
  root.querySelectorAll('.table-wrap > table:not(.no-stack)').forEach(table=>{
    const heads = Array.from(table.querySelectorAll('thead th')).map(th=>{ const c = th.cloneNode(true); c.querySelectorAll('.sr-only').forEach(x=>x.remove()); return c.textContent.trim(); });
    if(!heads.length) return;
    table.classList.add('stackable');
    table.querySelectorAll('tbody tr').forEach(tr=>{
      Array.from(tr.children).forEach((td,i)=>{ if(heads[i] !== undefined && !td.hasAttribute('data-label')) td.setAttribute('data-label', heads[i]); });
    });
  });
}
