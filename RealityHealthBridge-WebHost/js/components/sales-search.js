// Sales search (patient name, IP no., contact, diagnosis, items).
// Filters table rows in place, so typing never loses focus.
let salesSearchText = '';
function salesSearchBar(tableId){
  return `<div class="search-bar"><div class="input-icon">${icon('search')}<input type="search" data-table-filter="${tableId}" aria-label="Search transactions" placeholder="Search name, patient no. (e.g. 26-10-0001), contact or diagnosis…" value="${esc(salesSearchText)}"></div></div>`;
}
function salesNoMatch(tableId){
  return `<div id="${tableId}NoMatch" hidden>${emptyState('No matching transactions', 'Try a different name, number or diagnosis.', 'search', true)}</div>`;
}
function applySalesFilter(input){
  const table = document.getElementById(input.getAttribute('data-table-filter'));
  if(!table) return;
  const q = input.value.trim().toLowerCase();
  let shown = 0;
  table.querySelectorAll('tbody tr').forEach(tr=>{
    const match = !q || tr.textContent.toLowerCase().includes(q);
    tr.style.display = match ? '' : 'none';
    if(match) shown++;
  });
  const wrap = table.closest('.table-wrap');
  if(wrap) wrap.hidden = !!(q && shown===0);
  const nm = document.getElementById(table.id + 'NoMatch');
  if(nm) nm.hidden = !(q && shown===0);
}

function wireSalesSearch(){
  document.querySelectorAll('[data-table-filter]').forEach(inp=>{
    inp.oninput = ()=>{ salesSearchText = inp.value; applySalesFilter(inp); };
    applySalesFilter(inp);
  });
}
