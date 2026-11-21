// Reports page (facility admins only).
// Every report is a definition that returns columns + rows + totals + summary figures.
// One renderer turns that into the on-screen preview, the printed / PDF letterhead page and
// the Excel (CSV) download - so all three always show the same numbers.
//
// Dates follow the rest of the app: the calendar day of todayStr() and of each record's date.

let reportState = { id:'sales-summary', period:'month', anchor:'', from:'', to:'' };

// Reporting periods: a day, a week (Monday–Sunday), a month, a year, or any dates.
// `anchor` is any date inside the chosen period; ◀ ▶ move it one period back / forward.
const REPORT_PERIODS = [['day','Daily'], ['week','Weekly'], ['month','Monthly'], ['year','Annual'], ['custom','Custom']];
const REPORT_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function firstRecordDate(){
  return [...STATE.sales.map(s=>s.date.slice(0,10)), ...STATE.batches.map(b=>b.dateReceived)].filter(Boolean).sort()[0] || todayStr();
}
function reportRange(){
  const t = todayStr(), a = reportState.anchor || t;
  const y = Number(a.slice(0,4)), m = Number(a.slice(5,7)) - 1;
  switch(reportState.period){
    case 'day':   return { from:a, to:a, label: a === t ? 'Today' : a === addDaysStr(t,-1) ? 'Yesterday' : fmtDate(a), kind:'Daily report' };
    case 'week': { const f = startOfWeek(a); return { from:f, to:endOfWeek(a), label: f === startOfWeek(t) ? 'This week' : `Week of ${fmtDate(f)}`, kind:'Weekly report' }; }
    case 'month': { const r = monthRange(m, y); return { from:r.start, to:r.end, label:`${REPORT_MONTHS[m]} ${y}`, kind:'Monthly report' }; }
    case 'year':  return { from:`${y}-01-01`, to:`${y}-12-31`, label:`Year ${y}`, kind:'Annual report' };
  }
  const from = reportState.from || t, to = reportState.to || t;
  return from <= to ? { from, to, label:'Chosen dates', kind:'Report' } : { from:to, to:from, label:'Chosen dates', kind:'Report' };
}
// Move the period one step back (-1) or forward (+1).
function shiftReportPeriod(step){
  const a = reportState.anchor || todayStr();
  const y = Number(a.slice(0,4)), m = Number(a.slice(5,7)) - 1;
  if(reportState.period === 'day') reportState.anchor = addDaysStr(a, step);
  else if(reportState.period === 'week') reportState.anchor = addDaysStr(a, 7*step);
  else if(reportState.period === 'month'){ const d = new Date(Date.UTC(y, m + step, 1)); reportState.anchor = d.toISOString().slice(0,10); }
  else if(reportState.period === 'year') reportState.anchor = `${y + step}-01-01`;
}
// Long periods are shown month by month instead of day by day.
const reportByMonth = r => (Date.parse(r.to) - Date.parse(r.from)) / 864e5 > 62;
const monthLabel = ym => `${REPORT_MONTHS[Number(ym.slice(5,7))-1].slice(0,3)} ${ym.slice(0,4)}`;
function rangeText(r){ return r.from === r.to ? fmtDate(r.from) : `${fmtDate(r.from)} – ${fmtDate(r.to)}`; }

// ---------- small helpers ----------
const paidOf = s => s.amountPaid !== undefined ? num(s.amountPaid) : num(s.total);
const unitsOf = s => s.items.reduce((a,i)=>a+num(i.qty),0);
const costOf = s => s.items.reduce((a,i)=>a+num(i.cost)*num(i.qty),0);
const inRange = (d, r) => d && d >= r.from && d <= r.to;
const pct = (part, whole) => whole ? Math.round(part / whole * 1000) / 10 : null;
function personName(username){ const a = findAccount(username); return a && a.fullName ? a.fullName : (username || '—'); }
function drugName(id){ const d = drugById(id); return d ? d.name : '(removed product)'; }
function sumBy(rows, k){ return rows.reduce((a,r)=>a+num(r[k]),0); }
const fmtS = n => (n < 0 ? '−' : '') + fmt(Math.abs(n)); // signed money for summaries

// ---------- report definitions ----------
// columns: [label, key, type]  type: text | date | code | num | money | pct
const REPORTS = {
  'sales-summary': {
    group:'Sales', title:'Sales summary', icon:'barChart', period:true,
    desc:'Day by day (month by month for a year): number of sales, revenue, money collected and profit.',
    build(r){
      const days = new Map(), byMonth = reportByMonth(r);
      salesInRange(r.from, r.to).forEach(s=>{
        const d = byMonth ? s.date.slice(0,7) : s.date.slice(0,10);
        const x = days.get(d) || { date:d, n:0, units:0, revenue:0, paid:0, cost:0 };
        x.n++; x.units += unitsOf(s); x.revenue += num(s.total); x.paid += paidOf(s); x.cost += costOf(s);
        days.set(d, x);
      });
      const rows = [...days.values()].sort((a,b)=>a.date<b.date?-1:1).map(x=>({ ...x, date: byMonth ? monthLabel(x.date) : x.date, balance:Math.max(0,x.revenue-x.paid), profit:x.revenue-x.cost }));
      const tot = { date:'Total', n:sumBy(rows,'n'), units:sumBy(rows,'units'), revenue:sumBy(rows,'revenue'), paid:sumBy(rows,'paid'), balance:sumBy(rows,'balance'), cost:sumBy(rows,'cost'), profit:sumBy(rows,'profit') };
      return {
        columns:[[byMonth ? 'Month' : 'Date','date','date'],['Sales','n','num'],['Units','units','num'],['Revenue','revenue','money'],['Collected','paid','money'],['Owed','balance','money'],['Cost of goods','cost','money'],['Profit','profit','money']],
        rows, total:rows.length ? tot : null,
        summary:[['Revenue', fmt(tot.revenue)], ['Profit', fmt(tot.profit), pct(tot.profit, tot.revenue) !== null ? `${pct(tot.profit, tot.revenue)}% margin` : ''], ['Collected', fmt(tot.paid), tot.balance ? `${fmt(tot.balance)} still owed` : 'nothing owed'], ['Sales', tot.n.toLocaleString(), tot.n ? `average ${fmt(tot.revenue / tot.n)}` : '']],
        empty:'No sales in this period.'
      };
    }
  },
  'sales-detail': {
    group:'Sales', title:'Sales details', icon:'receipt', period:true,
    desc:'Every sale with patient number, items, who sold it and what was paid.',
    build(r){
      const rows = salesInRange(r.from, r.to).slice().sort((a,b)=>a.date<b.date?-1:1).map(s=>({
        date:s.date.slice(0,10), time:fmtTime(s.date), patient:s.patientNo||'', buyer:s.buyer||'Walk-in', contact:s.buyerContact||'',
        items:s.items.map(i=>`${drugName(i.drugId)} ×${i.qty}`).join(', '), by:personName(s.soldBy),
        total:num(s.total), paid:paidOf(s), balance:Math.max(0, num(s.total)-paidOf(s))
      }));
      return {
        columns:[['Date','date','date'],['Time','time','date'],['Patient no.','patient','code'],['Customer','buyer','text'],['Phone','contact','text'],['Items','items','text'],['Sold by','by','text'],['Total','total','money'],['Paid','paid','money'],['Owed','balance','money']],
        rows, total:rows.length ? { date:'Total', total:sumBy(rows,'total'), paid:sumBy(rows,'paid'), balance:sumBy(rows,'balance') } : null,
        summary:[['Sales', rows.length.toLocaleString()], ['Total', fmt(sumBy(rows,'total'))], ['Paid', fmt(sumBy(rows,'paid'))], ['Owed', fmt(sumBy(rows,'balance'))]],
        empty:'No sales in this period.'
      };
    }
  },
  'product-sales': {
    group:'Sales', title:'Product sales', icon:'pill', period:true,
    desc:'Best sellers: units, revenue, cost and profit for each product.',
    build(r){
      const by = new Map();
      salesInRange(r.from, r.to).forEach(s=> s.items.forEach(i=>{
        const x = by.get(i.drugId) || { name:drugName(i.drugId), unit:(drugById(i.drugId)||{}).unit||'', units:0, revenue:0, cost:0 };
        x.units += num(i.qty); x.revenue += num(i.qty)*num(i.unitPrice); x.cost += num(i.qty)*num(i.cost);
        by.set(i.drugId, x);
      }));
      const rows = [...by.values()].map(x=>({ ...x, profit:x.revenue-x.cost, margin:pct(x.revenue-x.cost, x.revenue) })).sort((a,b)=>b.revenue-a.revenue).map((x,i)=>({ rank:i+1, ...x }));
      const tot = { rank:'', name:'Total', units:sumBy(rows,'units'), revenue:sumBy(rows,'revenue'), cost:sumBy(rows,'cost'), profit:sumBy(rows,'profit') };
      tot.margin = pct(tot.profit, tot.revenue);
      return {
        columns:[['#','rank','num'],['Product','name','text'],['Unit','unit','text'],['Units sold','units','num'],['Revenue','revenue','money'],['Cost','cost','money'],['Profit','profit','money'],['Margin','margin','pct']],
        rows, total:rows.length ? tot : null,
        summary:[['Products sold', rows.length.toLocaleString()], ['Best seller', rows[0] ? rows[0].name : '—', rows[0] ? fmt(rows[0].revenue) : ''], ['Revenue', fmt(tot.revenue)], ['Profit', fmt(tot.profit), tot.margin !== null ? `${tot.margin}% margin` : '']],
        empty:'No products were sold in this period.'
      };
    }
  },
  'staff': {
    group:'Sales', title:'Staff performance', icon:'users', period:true,
    desc:'Sales made by each person who logs in: count, revenue and profit.',
    build(r){
      const by = new Map();
      salesInRange(r.from, r.to).forEach(s=>{
        const k = s.soldBy || '—';
        const x = by.get(k) || { name:personName(k), user:k === '—' ? '' : '@'+k, role:(findAccount(k)||{}).role === 'owner' ? 'Admin' : (findAccount(k) ? 'Staff' : ''), n:0, units:0, revenue:0, paid:0, profit:0 };
        x.n++; x.units += unitsOf(s); x.revenue += num(s.total); x.paid += paidOf(s); x.profit += num(s.total) - costOf(s);
        by.set(k, x);
      });
      const rows = [...by.values()].map(x=>({ ...x, avg:x.n ? x.revenue/x.n : 0 })).sort((a,b)=>b.revenue-a.revenue);
      return {
        columns:[['Name','name','text'],['Username','user','code'],['Role','role','text'],['Sales','n','num'],['Units','units','num'],['Revenue','revenue','money'],['Collected','paid','money'],['Profit','profit','money'],['Average sale','avg','money']],
        rows, total:rows.length ? { name:'Total', n:sumBy(rows,'n'), units:sumBy(rows,'units'), revenue:sumBy(rows,'revenue'), paid:sumBy(rows,'paid'), profit:sumBy(rows,'profit') } : null,
        summary:[['People who sold', rows.length.toLocaleString()], ['Top seller', rows[0] ? rows[0].name : '—', rows[0] ? fmt(rows[0].revenue) : ''], ['Revenue', fmt(sumBy(rows,'revenue'))]],
        empty:'No sales in this period.'
      };
    }
  },

  'profit-loss': {
    group:'Money', title:'Profit & loss', icon:'trendingUp', period:true,
    desc:'A one-page statement: revenue, cost of goods, profit, money collected and spent on stock.',
    build(r){
      const sales = salesInRange(r.from, r.to);
      const revenue = sales.reduce((a,s)=>a+num(s.total),0), cogs = sales.reduce((a,s)=>a+costOf(s),0);
      const collected = sales.reduce((a,s)=>a+paidOf(s),0), owed = Math.max(0, revenue - collected);
      const spent = expenditureInRange(r.from, r.to);
      const gross = revenue - cogs;
      const rows = [
        { line:'Sales revenue (value of goods sold)', amount:revenue },
        { line:'Less: cost of the goods sold', amount:-cogs },
        { line:`Gross profit${pct(gross, revenue)!==null ? ` (${pct(gross, revenue)}% margin)` : ''}`, amount:gross, _strong:true },
        { line:'Money collected from these sales', amount:collected },
        { line:'Still owed by customers on these sales', amount:owed },
        { line:'Money spent on stock received', amount:-spent },
        { line:'Net cash for the period (collected − spent on stock)', amount:collected - spent, _strong:true },
      ];
      return {
        columns:[['Item','line','text'],['Amount','amount','money']], rows, total:null,
        summary:[['Revenue', fmt(revenue)], ['Gross profit', fmt(gross), pct(gross, revenue)!==null ? `${pct(gross, revenue)}% margin` : ''], ['Spent on stock', fmt(spent)], ['Net cash', fmtS(collected - spent), collected - spent < 0 ? 'more spent than collected' : '']],
        note:'Gross profit uses the cost price of the exact batch each item came from. Net cash compares money collected with money spent on new stock in the same period.'
      };
    }
  },
  'payments': {
    group:'Money', title:'Payments received', icon:'banknote', period:true,
    desc:'Every payment taken in the period, including balances paid later on older sales.',
    build(r){
      const rows = [];
      STATE.sales.forEach(s=> (s.paymentHistory||[]).forEach((p,i)=>{
        const d = (p.date||'').slice(0,10);
        if(!inRange(d, r) || !num(p.amount)) return;
        rows.push({ date:d, time:fmtTime(p.date), patient:s.patientNo||'', buyer:s.buyer||'Walk-in', saleDate:s.date.slice(0,10),
          kind: i === 0 && d === s.date.slice(0,10) ? 'At sale' : 'Balance payment', by:personName(p.recordedBy), amount:num(p.amount) });
      }));
      rows.sort((a,b)=> (a.date+a.time) < (b.date+b.time) ? -1 : 1);
      const later = rows.filter(x=>x.kind!=='At sale');
      return {
        columns:[['Date','date','date'],['Time','time','date'],['Patient no.','patient','code'],['Customer','buyer','text'],['Sale date','saleDate','date'],['Type','kind','text'],['Received by','by','text'],['Amount','amount','money']],
        rows, total:rows.length ? { date:'Total', amount:sumBy(rows,'amount') } : null,
        summary:[['Received', fmt(sumBy(rows,'amount'))], ['Payments', rows.length.toLocaleString()], ['Balance payments', fmt(sumBy(later,'amount')), `${later.length} on earlier sales`]],
        empty:'No payments were received in this period.'
      };
    }
  },
  'debtors': {
    group:'Money', title:'Customers who owe', icon:'wallet', period:false,
    desc:'Every sale with a balance still unpaid, oldest first. As of today.',
    build(){
      const t = todayStr();
      const rows = STATE.sales.filter(s=> num(s.total) - paidOf(s) > 0.5).map(s=>({
        date:s.date.slice(0,10), days:Math.max(0, Math.round((Date.parse(t) - Date.parse(s.date.slice(0,10))) / 864e5)),
        patient:s.patientNo||'', buyer:s.buyer||'Walk-in', contact:s.buyerContact||'', total:num(s.total), paid:paidOf(s), balance:num(s.total)-paidOf(s)
      })).sort((a,b)=>a.date<b.date?-1:1);
      const old = rows.filter(x=>x.days>30);
      return {
        columns:[['Sale date','date','date'],['Days owed','days','num'],['Patient no.','patient','code'],['Customer','buyer','text'],['Phone','contact','text'],['Total','total','money'],['Paid','paid','money'],['Owed','balance','money']],
        rows, total:rows.length ? { date:'Total', total:sumBy(rows,'total'), paid:sumBy(rows,'paid'), balance:sumBy(rows,'balance') } : null,
        summary:[['Total owed', fmt(sumBy(rows,'balance'))], ['Sales with a balance', rows.length.toLocaleString()], ['Owed over 30 days', fmt(sumBy(old,'balance')), `${old.length} sale(s)`]],
        empty:'Nobody owes the facility money. 🎉'
      };
    }
  },

  'stock-on-hand': {
    group:'Stock', title:'Stock on hand & value', icon:'package', period:false,
    desc:'Every product with quantity, value at cost and at selling price. As of today.',
    build(){
      const rows = STATE.drugs.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(d=>{
        const bs = STATE.batches.filter(b=>b.drugId===d.id && b.qtyRemaining>0);
        const qty = bs.reduce((a,b)=>a+b.qtyRemaining,0);
        const cost = bs.reduce((a,b)=>a+b.qtyRemaining*b.costPrice,0), sell = bs.reduce((a,b)=>a+b.qtyRemaining*b.sellPrice,0);
        const nextExp = bs.filter(b=>b.expiry).map(b=>b.expiry).sort()[0] || '';
        const status = qty<=0 ? 'Out of stock' : qty<=(d.reorderLevel||0) ? 'Low' : 'In stock';
        return { name:d.name, form:d.form||'', qty, unit:d.unit||'', avg:qty ? cost/qty : 0, cost, sell, exp:nextExp, status };
      });
      return {
        columns:[['Product','name','text'],['Form','form','text'],['In stock','qty','num'],['Unit','unit','text'],['Avg cost','avg','money'],['Value at cost','cost','money'],['Value at selling price','sell','money'],['Next expiry','exp','date'],['Status','status','text']],
        rows, total:rows.length ? { name:'Total', qty:sumBy(rows,'qty'), cost:sumBy(rows,'cost'), sell:sumBy(rows,'sell') } : null,
        summary:[['Products', rows.length.toLocaleString()], ['Value at cost', fmt(sumBy(rows,'cost'))], ['Value at selling price', fmt(sumBy(rows,'sell')), `${fmt(sumBy(rows,'sell')-sumBy(rows,'cost'))} possible profit`], ['Low / out', `${rows.filter(x=>x.status==='Low').length} / ${rows.filter(x=>x.status==='Out of stock').length}`]],
        empty:'No products yet.'
      };
    }
  },
  'stock-received': {
    group:'Stock', title:'Stock received', icon:'truck', period:true,
    desc:'Every delivery recorded: batch, expiry, supplier, quantity and cost.',
    build(r){
      const rows = STATE.batches.filter(b=>inRange(b.dateReceived, r)).sort((a,b)=>a.dateReceived<b.dateReceived?-1:1).map(b=>({
        date:b.dateReceived, name:drugName(b.drugId), batch:b.batchNo||'', exp:b.expiry||'', supplier:b.supplier||'', qty:num(b.qtyReceived), cost:num(b.costPrice), total:num(b.qtyReceived)*num(b.costPrice), sell:num(b.sellPrice)
      }));
      return {
        columns:[['Date','date','date'],['Product','name','text'],['Batch','batch','code'],['Expiry','exp','date'],['Supplier','supplier','text'],['Qty','qty','num'],['Unit cost','cost','money'],['Total cost','total','money'],['Sell price','sell','money']],
        rows, total:rows.length ? { date:'Total', qty:sumBy(rows,'qty'), total:sumBy(rows,'total') } : null,
        summary:[['Deliveries', rows.length.toLocaleString()], ['Units received', sumBy(rows,'qty').toLocaleString()], ['Total cost', fmt(sumBy(rows,'total'))]],
        empty:'No stock was received in this period.'
      };
    }
  },
  'suppliers': {
    group:'Stock', title:'Purchases by supplier', icon:'building', period:true,
    desc:'How much was bought from each supplier, and when you last received from them.',
    build(r){
      const by = new Map();
      STATE.batches.filter(b=>inRange(b.dateReceived, r)).forEach(b=>{
        const k = (b.supplier||'').trim() || '(no supplier recorded)';
        const x = by.get(k.toLowerCase()) || { supplier:k, n:0, products:new Set(), units:0, spent:0, last:'' };
        x.n++; x.products.add(b.drugId); x.units += num(b.qtyReceived); x.spent += num(b.qtyReceived)*num(b.costPrice); if(b.dateReceived > x.last) x.last = b.dateReceived;
        by.set(k.toLowerCase(), x);
      });
      const rows = [...by.values()].map(x=>({ ...x, products:x.products.size })).sort((a,b)=>b.spent-a.spent);
      return {
        columns:[['Supplier','supplier','text'],['Deliveries','n','num'],['Products','products','num'],['Units','units','num'],['Amount spent','spent','money'],['Last delivery','last','date']],
        rows, total:rows.length ? { supplier:'Total', n:sumBy(rows,'n'), units:sumBy(rows,'units'), spent:sumBy(rows,'spent') } : null,
        summary:[['Suppliers', rows.length.toLocaleString()], ['Biggest supplier', rows[0] ? rows[0].supplier : '—', rows[0] ? fmt(rows[0].spent) : ''], ['Total spent', fmt(sumBy(rows,'spent'))]],
        empty:'No stock was received in this period.'
      };
    }
  },
  'expiry': {
    group:'Stock', title:'Expiry report', icon:'hourglass', period:false,
    desc:'Batches already expired or expiring within 90 days, with their value. As of today.',
    build(){
      const rows = STATE.batches.filter(b=>b.qtyRemaining>0 && b.expiry && daysToExpiry(b.expiry)<=90).sort((a,b)=>a.expiry<b.expiry?-1:1).map(b=>{
        const days = daysToExpiry(b.expiry);
        return { name:drugName(b.drugId), batch:b.batchNo||'', exp:b.expiry, days, qty:b.qtyRemaining, value:b.qtyRemaining*b.costPrice,
          status: days<=0 ? 'Expired' : days<=30 ? 'Within 30 days' : 'Within 90 days' };
      });
      const v = f => sumBy(rows.filter(f),'value');
      return {
        columns:[['Product','name','text'],['Batch','batch','code'],['Expiry','exp','date'],['Days left','days','num'],['Qty left','qty','num'],['Value at cost','value','money'],['Status','status','text']],
        rows, total:rows.length ? { name:'Total', qty:sumBy(rows,'qty'), value:sumBy(rows,'value') } : null,
        summary:[['Expired', fmt(v(x=>x.days<=0)), `${rows.filter(x=>x.days<=0).length} batch(es) — remove from shelves`], ['Within 30 days', fmt(v(x=>x.days>0 && x.days<=30))], ['31 – 90 days', fmt(v(x=>x.days>30))]],
        empty:'Nothing expired or expiring within 90 days.'
      };
    }
  },
  'reorder': {
    group:'Stock', title:'Reorder list', icon:'cart', period:false,
    desc:'Products that are low or out of stock, with a suggested order quantity. Take it to your supplier.',
    build(){
      const rows = STATE.drugs.map(d=>{
        const qty = Math.max(0, totalStockQty(d.id)), lvl = num(d.reorderLevel);
        if(!(qty<=0 || (lvl>0 && qty<=lvl))) return null;
        const last = STATE.batches.filter(b=>b.drugId===d.id).sort((a,b)=>a.dateReceived<b.dateReceived?-1:1).slice(-1)[0];
        const target = lvl>0 ? lvl*3 : (last ? num(last.qtyReceived) : 0);
        const order = Math.max(0, target - qty);
        const cost = last ? num(last.costPrice) : 0;
        return { name:d.name, unit:d.unit||'', qty, lvl:lvl||'', order, supplier:last && last.supplier || '', cost, est:order*cost };
      }).filter(Boolean).sort((a,b)=>a.qty-b.qty || a.name.localeCompare(b.name));
      return {
        columns:[['Product','name','text'],['Unit','unit','text'],['In stock','qty','num'],['Reorder level','lvl','num'],['Suggested order','order','num'],['Last supplier','supplier','text'],['Last unit cost','cost','money'],['Estimated cost','est','money']],
        rows, total:rows.length ? { name:'Total', order:sumBy(rows,'order'), est:sumBy(rows,'est') } : null,
        summary:[['Products to order', rows.length.toLocaleString()], ['Out of stock', rows.filter(x=>x.qty<=0).length.toLocaleString()], ['Estimated cost', fmt(sumBy(rows,'est'))]],
        note:'Suggested order = enough to reach 3× the reorder level (or the size of the last delivery when no reorder level is set). Estimated cost uses the last cost price.',
        empty:'Nothing needs reordering right now.'
      };
    }
  },
  'adjustments': {
    group:'Stock', title:'Stock corrections', icon:'edit', period:true,
    desc:'Changes made to stock outside sales: count corrections, damaged items, edits to batches.',
    build(r){
      const rows = [...ROWS.adjustments.values()].filter(a=>!a.deleted && inRange((a.created_at||'').slice(0,10), r)).sort((a,b)=>a.created_at<b.created_at?-1:1).map(a=>{
        const b = STATE.batches.find(x=>x.id===a.batch_id);
        return { date:(a.created_at||'').slice(0,10), name:drugName(a.product_id), batch:b && b.batchNo || '', change:num(a.qty_change), reason:a.reason||'', by:personName(a.adjusted_by) };
      });
      return {
        columns:[['Date','date','date'],['Product','name','text'],['Batch','batch','code'],['Change','change','delta'],['Reason','reason','text'],['By','by','text']],
        rows, total:null,
        summary:[['Corrections', rows.length.toLocaleString()], ['Units added', sumBy(rows.filter(x=>x.change>0),'change').toLocaleString()], ['Units removed', Math.abs(sumBy(rows.filter(x=>x.change<0),'change')).toLocaleString()]],
        empty:'No stock corrections in this period.'
      };
    }
  },
};
const REPORT_GROUPS = ['Sales', 'Money', 'Stock'];

// ---------- formatting ----------
function cellHtml(v, type){
  if(v === undefined || v === null || v === '') return '<span class="subtle">—</span>';
  if(type === 'money') return (v < 0 ? '−' : '') + fmt(Math.abs(v));
  if(type === 'num') return typeof v === 'number' ? v.toLocaleString() : esc(v);
  if(type === 'delta') return `<span class="${v<0?'text-danger':'text-success'} bold">${v>0?'+':v<0?'−':''}${Math.abs(v).toLocaleString()}</span>`;
  if(type === 'pct') return `${v}%`;
  if(type === 'date') return `<span class="mono">${esc(v)}</span>`;
  if(type === 'code') return `<span class="batch-code">${esc(v)}</span>`;
  return esc(v);
}
const isNumType = t => t === 'money' || t === 'num' || t === 'pct' || t === 'delta';

function runReport(){
  const def = REPORTS[reportState.id] || REPORTS['sales-summary'];
  const range = def.period ? reportRange() : { from:todayStr(), to:todayStr(), label:'As of today' };
  return { def, range, out:def.build(range) };
}

// ---------- period controls ----------
function reportPeriodControlsHtml(range){
  const p = reportState.period, a = reportState.anchor || todayStr();
  const y0 = Number(firstRecordDate().slice(0,4)), yNow = Number(todayStr().slice(0,4));
  const years = []; for(let y = yNow; y >= Math.min(y0, yNow); y--) years.push(y);
  const yearSel = (id)=> `<select id="${id}" aria-label="Year">${years.map(y=>`<option ${String(y)===a.slice(0,4)?'selected':''}>${y}</option>`).join('')}</select>`;
  let picker = '';
  if(p === 'day') picker = `<input type="date" id="rpDay" value="${a}" max="${todayStr()}" aria-label="Day">`;
  else if(p === 'week') picker = `<input type="date" id="rpDay" value="${a}" max="${todayStr()}" aria-label="Any day in the week">`;
  else if(p === 'month') picker = `<select id="rpMonth" aria-label="Month">${REPORT_MONTHS.map((n,i)=>`<option value="${i}" ${i===Number(a.slice(5,7))-1?'selected':''}>${n.slice(0,3)}</option>`).join('')}</select>${yearSel('rpYear')}`;
  else if(p === 'year') picker = yearSel('rpYear');
  const atEnd = p !== 'custom' && range.to >= todayStr();
  return `
    <div class="rp-periods" role="group" aria-label="Report period">
      ${REPORT_PERIODS.map(([k,l])=>`<button type="button" class="rp-period ${k===p?'active':''}" data-rp-period="${k}" aria-pressed="${k===p}">${l}</button>`).join('')}
    </div>
    ${p === 'custom' ? `
      <div class="rp-pickrow">
        <div class="field"><label for="rpFrom">From</label><input type="date" id="rpFrom" value="${range.from}" max="${todayStr()}"></div>
        <div class="field"><label for="rpTo">To</label><input type="date" id="rpTo" value="${range.to}"></div>
      </div>` : `
      <div class="rp-pickrow">
        <button type="button" class="btn secondary icon-only" id="rpPrev" aria-label="Previous period" title="Previous">${icon('chevronLeft')}</button>
        <div class="rp-picker">${picker}</div>
        <button type="button" class="btn secondary icon-only" id="rpNext" aria-label="Next period" title="Next" ${atEnd?'disabled':''}>${icon('chevronRight')}</button>
        ${atEnd ? '' : `<button type="button" class="btn ghost small" id="rpNow">${{day:'Today',week:'This week',month:'This month',year:'This year'}[p]}</button>`}
      </div>`}
    <span class="rp-range">${icon('calendar')}<strong>${esc(range.label)}</strong>${range.label === rangeText(range) ? '' : `<span class="nowrap">· ${rangeText(range)}</span>`}</span>`;
}

// ---------- page ----------
function viewReports(){
  const { def, range, out } = runReport();
  const pick = REPORT_GROUPS.map(g=>`
    <div class="rp-group"><div class="rp-group-label">${g}</div>
      ${Object.entries(REPORTS).filter(([,d])=>d.group===g).map(([id,d])=>`
        <button type="button" class="rp-pick ${id===reportState.id?'active':''}" data-report="${id}" ${id===reportState.id?'aria-current="true"':''}>
          ${icon(d.icon)}<span>${d.title}</span>
        </button>`).join('')}
    </div>`).join('');
  return `
  <div class="rp-layout">
    <aside class="panel rp-menu" aria-label="Choose a report">
      <div class="card-header"><h2>${icon('barChart')} Reports</h2></div>
      <label class="sr-only" for="rpSelect">Report</label>
      <select id="rpSelect" class="rp-select">
        ${REPORT_GROUPS.map(g=>`<optgroup label="${g}">${Object.entries(REPORTS).filter(([,d])=>d.group===g).map(([id,d])=>`<option value="${id}" ${id===reportState.id?'selected':''}>${d.title}</option>`).join('')}</optgroup>`).join('')}
      </select>
      <div class="rp-list">${pick}</div>
    </aside>

    <section class="panel rp-main">
      <div class="rp-head">
        <div>
          <span class="rp-kicker">${def.group} report</span>
          <h2>${def.title}</h2>
          <p>${def.desc}</p>
        </div>
        <div class="rp-actions">
          <button class="btn secondary" type="button" id="rpPrint">${icon('printer')} Print</button>
          <button class="btn secondary" type="button" id="rpPdf">${icon('download')} Save as PDF</button>
          <button class="btn cta" type="button" id="rpCsv">${icon('download')} Excel</button>
        </div>
      </div>

      <div class="rp-controls">
        ${def.period ? reportPeriodControlsHtml(range) : `<span class="rp-range">${icon('clock')}As of today, ${fmtDate(todayStr())}</span>`}
      </div>

      ${out.summary && out.summary.length ? `<div class="rp-summary">${out.summary.map(([l,v,sub])=>`<div><span>${l}</span><strong title="${esc(v)}">${esc(v)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`).join('')}</div>` : ''}

      ${out.rows.length === 0 ? emptyState('Nothing to show', out.empty || 'No records for this report.', def.icon, true) : `
      <div class="table-wrap rp-table"><table>
        <thead><tr>${out.columns.map(([h,,t])=>`<th class="${isNumType(t)?'num':''}">${h}</th>`).join('')}</tr></thead>
        <tbody>${out.rows.map(row=>`<tr class="${row._strong?'rp-strong':''}">${out.columns.map(([,k,t])=>`<td class="${isNumType(t)?'num':''}${k==='items'||k==='reason'?' rp-wrap':''}">${cellHtml(row[k], t)}</td>`).join('')}</tr>`).join('')}</tbody>
        ${out.total ? `<tfoot><tr>${out.columns.map(([,k,t],i)=>`<td class="${isNumType(t)?'num':''}">${out.total[k] !== undefined && out.total[k] !== '' ? (i===0 ? `<strong>${esc(out.total[k])}</strong>` : cellHtml(out.total[k], t)) : ''}</td>`).join('')}</tr></tfoot>` : ''}
      </table></div>
      <p class="xsmall subtle mt-2">${out.rows.length.toLocaleString()} row${out.rows.length===1?'':'s'}${out.note ? ` · ${esc(out.note)}` : ''}</p>`}
    </section>
  </div>`;
}

function wireReports(){
  const go = ()=>{ renderTabContent(); };
  document.querySelectorAll('[data-report]').forEach(b=> b.onclick = ()=>{ reportState.id = b.dataset.report; go(); });
  const sel = document.getElementById('rpSelect'); if(sel) sel.onchange = ()=>{ reportState.id = sel.value; go(); };
  document.querySelectorAll('[data-rp-period]').forEach(b=> b.onclick = ()=>{
    const r = reportRange();
    if(b.dataset.rpPeriod === 'custom'){ reportState.from = r.from; reportState.to = r.to > todayStr() ? todayStr() : r.to; }
    else if(reportState.period === 'custom') reportState.anchor = reportState.to || todayStr();
    reportState.period = b.dataset.rpPeriod; go();
  });
  const on = (id, fn)=>{ const el = document.getElementById(id); if(el) el.onclick = fn; };
  on('rpPrev', ()=>{ shiftReportPeriod(-1); go(); });
  on('rpNext', ()=>{ shiftReportPeriod(1); go(); });
  on('rpNow', ()=>{ reportState.anchor = todayStr(); go(); });
  const day = document.getElementById('rpDay'); if(day) day.onchange = ()=>{ if(day.value){ reportState.anchor = day.value; go(); } };
  const mo = document.getElementById('rpMonth'), yr = document.getElementById('rpYear');
  const setMY = ()=>{ const m = mo ? Number(mo.value) : 0; reportState.anchor = `${yr.value}-${String(m+1).padStart(2,'0')}-01`; go(); };
  if(mo) mo.onchange = setMY;
  if(yr) yr.onchange = setMY;
  document.getElementById('rpPrint').onclick = ()=> printReport();
  document.getElementById('rpPdf').onclick = saveReportPdf;
  document.getElementById('rpCsv').onclick = downloadReportCsv;
}

// ---------- print / PDF ----------
// File name used for downloads, e.g. "Hope-Drug-Shop-Sales-summary-2026-11"
function reportFileName(){
  const { def, range } = runReport();
  const id = STATE.settings.identity || {};
  const slug = v => String(v).replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
  const when = !def.period ? todayStr() : reportState.period === 'month' ? range.from.slice(0,7) : reportState.period === 'year' ? range.from.slice(0,4)
    : range.from === range.to ? range.from : `${range.from}_to_${range.to}`;
  return `${slug(id.name || 'Facility')}-${slug(def.title)}-${when}`;
}
// "Save as PDF" uses the phone's / computer's own print screen, which can save a PDF file.
// The page title becomes the suggested file name.
function saveReportPdf(){
  const go = ()=>{
    const old = document.title;
    document.title = reportFileName();
    const back = ()=>{ document.title = old; window.removeEventListener('afterprint', back); };
    window.addEventListener('afterprint', back);
    if(printReport() === false) back();
    setTimeout(back, 60000);
  };
  if(localStorage.getItem('rhb:pdfTipSeen')){ go(); return; }
  openModal(`
    <h2>${icon('download')} Save report as PDF</h2>
    <p>The print screen opens next. To save a file instead of printing:</p>
    <ol class="steps-list">
      <li><strong>Phone:</strong> choose the printer at the top and pick <strong>“Save as PDF”</strong>, then tap the download / PDF button.</li>
      <li><strong>Computer:</strong> set <strong>Destination</strong> (or Printer) to <strong>“Save as PDF”</strong> and press <strong>Save</strong>.</li>
    </ol>
    <p class="xsmall subtle">The file is named <span class="mono">${esc(reportFileName())}.pdf</span>. You can then share it on WhatsApp or email.</p>
    <div class="modal-actions">
      <button class="btn secondary" type="button" id="pdfTipCancel">Cancel</button>
      <button class="btn cta" type="button" id="pdfTipGo">Continue</button>
    </div>`);
  document.getElementById('pdfTipCancel').onclick = closeModal;
  document.getElementById('pdfTipGo').onclick = ()=>{ localStorage.setItem('rhb:pdfTipSeen', '1'); closeModal(); setTimeout(go, 150); };
}
function printReport(){
  const { def, range, out } = runReport();
  if(!out.rows.length){ toast('There is nothing in this report to print or save.', 'error'); return false; }
  const id = STATE.settings.identity || {};
  const me = personName(session.username);
  // Wide reports print sideways so every column fits on the page.
  const landscape = out.columns.length > 7 ? '<style>@page{ size: A4 landscape; }</style>' : '';
  document.getElementById('reportPrintArea').innerHTML = `${landscape}
  <div class="report-doc rp-doc">
    <div class="rp-letterhead">
      ${id.logo ? `<img src="${id.logo}" alt="">` : ''}
      <div>
        <div class="rp-title">${esc(id.name || 'REALITY HEALTH BRIDGE')}</div>
        <div class="rp-sub">${[id.location, id.contact ? 'Tel: '+id.contact : '', id.email].filter(Boolean).map(esc).join(' · ')}</div>
      </div>
    </div>
    <div class="rp-doc-title"><strong>${def.title}</strong><span>${def.period ? `${esc(range.kind)} · ${esc(range.label)}${range.label === rangeText(range) ? '' : ` · ${rangeText(range)}`}` : `As of ${fmtDate(todayStr())}`}</span></div>
    ${out.summary && out.summary.length ? `<div class="rp-doc-summary">${out.summary.map(([l,v,sub])=>`<div><span>${l}</span><strong>${esc(v)}</strong>${sub?`<em>${esc(sub)}</em>`:''}</div>`).join('')}</div>` : ''}
    <table>
      <thead><tr>${out.columns.map(([h,,t])=>`<th class="${isNumType(t)?'rp-num':''}">${h}</th>`).join('')}</tr></thead>
      <tbody>${out.rows.map(row=>`<tr class="${row._strong?'rp-strong':''}">${out.columns.map(([,k,t])=>`<td class="${isNumType(t)?'rp-num':''}">${cellHtml(row[k], t)}</td>`).join('')}</tr>`).join('')}</tbody>
      ${out.total ? `<tfoot><tr>${out.columns.map(([,k,t],i)=>`<td class="${isNumType(t)?'rp-num':''}">${out.total[k] !== undefined && out.total[k] !== '' ? (i===0 ? esc(out.total[k]) : cellHtml(out.total[k], t)) : ''}</td>`).join('')}</tr></tfoot>` : ''}
    </table>
    ${out.note ? `<p class="rp-note">${esc(out.note)}</p>` : ''}
    ${reportSignatureHtml()}
    <div class="rp-foot">Printed ${new Date().toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})} by ${esc(me)} · Reality Health Bridge</div>
  </div>`;
  window.print();
}

// ---------- Excel (CSV) ----------
function csvCell(v){
  if(v === undefined || v === null) return '';
  let s = String(v);
  if(/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = "'" + s; // stop spreadsheet formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
function downloadReportCsv(){
  const { def, range, out } = runReport();
  if(!out.rows.length){ toast('There is nothing in this report to download.', 'error'); return; }
  const id = STATE.settings.identity || {};
  const plain = (v, t)=> v === undefined || v === null ? '' : (t === 'money' ? Math.round(v) : v);
  const lines = [
    [id.name || 'Facility', def.title],
    [def.period ? `${range.kind} - ${range.label}: ${range.from} to ${range.to}` : `As of ${todayStr()}`],
    [],
    out.columns.map(([h,,t])=> t === 'money' ? `${h} (UGX)` : t === 'pct' ? `${h} (%)` : h),
    ...out.rows.map(row=> out.columns.map(([,k,t])=> plain(row[k], t))),
  ];
  if(out.total) lines.push(out.columns.map(([,k,t])=> plain(out.total[k], t)));
  const csv = '﻿' + lines.map(l=>l.map(csvCell).join(',')).join('\r\n');
  const name = reportFileName() + '.csv';
  const file = typeof File !== 'undefined' ? new File([csv], name, { type:'text/csv' }) : null;
  if(isIosStandalone() && file && navigator.canShare && navigator.canShare({ files:[file] })){
    navigator.share({ files:[file], title:def.title }).catch(()=>{});
    return;
  }
  const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 60000);
  toast('Report saved — open it with Excel or Google Sheets.', 'success');
}
