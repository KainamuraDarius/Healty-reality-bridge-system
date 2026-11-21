// Derived stock helpers (quantities, value, low stock, expiry).
function drugById(id){ return STATE.drugs.find(x=>x.id===id); }
function batchesForDrug(id){ return STATE.batches.filter(b=>b.drugId===id && b.qtyRemaining>0); }
function totalStockQty(drugId){ return STATE.batches.filter(b=>b.drugId===drugId).reduce((a,b)=>a+b.qtyRemaining,0); }
function sellableBatchesForDrug(id){ return batchesForDrug(id).filter(b=>!isExpired(b)); }
function totalSellableQty(drugId){ return sellableBatchesForDrug(drugId).reduce((a,b)=>a+b.qtyRemaining,0); }
function stockValue(){ return STATE.batches.reduce((a,b)=>a + b.qtyRemaining*b.costPrice, 0); }
function potentialSalesValue(){ return STATE.batches.reduce((a,b)=>a + b.qtyRemaining*b.sellPrice, 0); }
function todaysSales(){ const t=todayStr(); return STATE.sales.filter(s=>s.date.slice(0,10)===t); }
function todaysRevenue(){ return todaysSales().reduce((a,s)=>a+s.total,0); }
function todaysProfit(){ return todaysSales().reduce((a,s)=> a + s.items.reduce((x,it)=>x+(it.unitPrice-it.cost)*it.qty,0), 0); }
function allTimeProfit(){ return STATE.sales.reduce((a,s)=> a + s.items.reduce((x,it)=>x+(it.unitPrice-it.cost)*it.qty,0), 0); }
function lowStockDrugs(){
  return STATE.drugs.filter(d=>{
    const q = totalStockQty(d.id);
    return q <= (d.reorderLevel||0) && q>0;
  });
}
function outOfStockDrugs(){
  return STATE.drugs.filter(d=> totalStockQty(d.id) <= 0);
}
function daysToExpiry(dateStr){
  if(!dateStr) return null;
  const diff = (new Date(dateStr) - new Date(todayStr()));
  return Math.ceil(diff / (1000*60*60*24));
}
function isExpired(batch){
  if(!batch || !batch.expiry) return false;
  const d = daysToExpiry(batch.expiry);
  return d !== null && d <= 0;
}

function expiringBatches(days=90){
  return STATE.batches.filter(b=>{
    if(b.qtyRemaining<=0 || !b.expiry) return false;
    const d = daysToExpiry(b.expiry);
    return d !== null && d <= days;
  }).sort((a,b)=> new Date(a.expiry)-new Date(b.expiry));
}
