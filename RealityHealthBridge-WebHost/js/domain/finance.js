// Income, expenditure and profit/loss helpers.
// ---------- Income & Profit/Loss helpers (money received & margin from sales) ----------
function salesInRange(startDate, endDate){
  return STATE.sales.filter(s => { const d = s.date.slice(0,10); return d >= startDate && d <= endDate; });
}
function incomeInRange(startDate, endDate){
  // Income = cash actually received (amountPaid), not the invoice total, so instalment sales
  // only count toward income as they're paid off.
  return salesInRange(startDate, endDate).reduce((a,s)=> a + (s.amountPaid!==undefined ? s.amountPaid : s.total), 0);
}
function revenueInRange(startDate, endDate){
  // Revenue = full invoice value of goods sold in the period, regardless of how much was paid.
  return salesInRange(startDate, endDate).reduce((a,s)=>a+s.total,0);
}
function costOfGoodsInRange(startDate, endDate){
  return salesInRange(startDate, endDate).reduce((a,s)=> a + s.items.reduce((x,it)=>x+it.cost*it.qty,0), 0);
}
function profitInRange(startDate, endDate){
  // Profit here is on goods sold (revenue - cost), i.e. margin earned, independent of payment status.
  return salesInRange(startDate, endDate).reduce((a,s)=> a + s.items.reduce((x,it)=>x+(it.unitPrice-it.cost)*it.qty,0), 0);
}
function outstandingBalanceInRange(startDate, endDate){
  return salesInRange(startDate, endDate).reduce((a,s)=> a + Math.max(0, s.total - (s.amountPaid!==undefined?s.amountPaid:s.total)), 0);
}
function netResultInRange(startDate, endDate){
  // Net profit or loss for the period = income received minus money spent restocking in that period.
  return incomeInRange(startDate, endDate) - expenditureInRange(startDate, endDate);
}
function incomeAllTime(){ return STATE.sales.reduce((a,s)=> a + (s.amountPaid!==undefined?s.amountPaid:s.total), 0); }
function outstandingBalanceAllTime(){ return STATE.sales.reduce((a,s)=> a + Math.max(0, s.total-(s.amountPaid!==undefined?s.amountPaid:s.total)), 0); }

// ---------- Expenditure helpers (money spent restocking) ----------
function expenditureInRange(startDate, endDate){
  return STATE.batches
    .filter(b => b.dateReceived >= startDate && b.dateReceived <= endDate)
    .reduce((a,b) => a + b.qtyReceived*b.costPrice, 0);
}
function batchesInRange(startDate, endDate){
  return STATE.batches
    .filter(b => b.dateReceived >= startDate && b.dateReceived <= endDate)
    .slice().sort((a,b)=> a.dateReceived < b.dateReceived ? 1 : -1);
}

function expenditureToday(){ const t = todayStr(); return expenditureInRange(t,t); }
function expenditureThisWeek(){ const t = todayStr(); return expenditureInRange(startOfWeek(t), endOfWeek(t)); }
function expenditureThisMonth(){ const now = new Date(); const r = monthRange(now.getMonth(), now.getFullYear()); return expenditureInRange(r.start, r.end); }
function expenditureAllTime(){ return STATE.batches.reduce((a,b)=>a+b.qtyReceived*b.costPrice,0); }
