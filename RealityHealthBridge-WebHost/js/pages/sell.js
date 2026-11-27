// Sell / Dispense page: build a cart, take customer details and payment, deduct stock FEFO.

// Customer/payment fields survive cart re-renders (adding/removing items) until the sale completes.
let saleDraft = { buyer:'', buyerContact:'', diagnosis:'', additionalDetails:'', amountPaid:null };
function resetSaleDraft(){ saleDraft = { buyer:'', buyerContact:'', diagnosis:'', additionalDetails:'', amountPaid:null }; }

let sellSearch = '';      // product search text survives re-renders while building a sale
let sellSort = 'top';     // 'top' = most sold first, 'az' = A–Z
let sellLimit = 30;       // how many products the list shows before "Show more"
const SELL_PAGE = 30;

// Price and next expiry come from the batch that expires first (FEFO).
function fefoBatch(drugId){
  return sellableBatchesForDrug(drugId).sort((a,b)=> (a.expiry||'9999')<(b.expiry||'9999')?-1:1)[0] || null;
}

// One pass over all batches: stock and first-expiring batch per product. Rebuilt on every
// Sell render (stock only changes between renders), so the picker stays quick with many products.
let _stockIdx = new Map();
function buildStockIndex(){
  const m = new Map();
  STATE.batches.forEach(b=>{
    if(!(b.qtyRemaining > 0)) return;
    let x = m.get(b.drugId); if(!x){ x = { total:0, sellable:0, fefo:null }; m.set(b.drugId, x); }
    x.total += b.qtyRemaining;
    if(!isExpired(b)){ x.sellable += b.qtyRemaining; if(!x.fefo || (b.expiry||'9999') < (x.fefo.expiry||'9999')) x.fefo = b; }
  });
  _stockIdx = m;
  return m;
}
const sellableOf = id => (_stockIdx.get(id) || {}).sellable || 0;

// Units sold per product over the last 90 days (for "Most sold"). Cached until a sale changes.
let _popKey = '', _popMap = new Map();
function salesPopularity(){
  const key = STATE.sales.length + ':' + (STATE.sales.length ? STATE.sales[STATE.sales.length-1].id : '');
  if(key === _popKey) return _popMap;
  const since = addDaysStr(todayStr(), -90), m = new Map();
  STATE.sales.forEach(s=>{ if(s.date.slice(0,10) >= since) s.items.forEach(i=> m.set(i.drugId, (m.get(i.drugId)||0) + num(i.qty))); });
  _popKey = key; _popMap = m;
  return m;
}

// Products that can be sold, ranked for the picker. Searching: names starting with the text
// first, then a word starting with it, then anywhere (name, form, strength).
function productMatches(q){
  const list = STATE.drugs.filter(d=>sellableOf(d.id)>0);
  q = q.trim().toLowerCase();
  if(q){
    const scored = [];
    list.forEach(d=>{
      const n = d.name.toLowerCase(), extra = `${d.form||''} ${d.packSize||''} ${d.unit||''}`.toLowerCase();
      const score = n.startsWith(q) ? 0 : n.split(/[\s\-\/(]+/).some(w=>w.startsWith(q)) ? 1 : n.includes(q) ? 2 : extra.includes(q) ? 3 : -1;
      if(score >= 0) scored.push([score, d]);
    });
    return scored.sort((a,b)=> a[0]-b[0] || a[1].name.localeCompare(b[1].name)).map(x=>x[1]);
  }
  if(sellSort === 'top'){
    const pop = salesPopularity();
    return list.sort((a,b)=> (pop.get(b.id)||0) - (pop.get(a.id)||0) || a.name.localeCompare(b.name));
  }
  return list.sort((a,b)=> a.name.localeCompare(b.name));
}
function markMatch(text, q){
  const t = String(text), i = q ? t.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if(i < 0) return esc(t);
  return esc(t.slice(0,i)) + '<mark>' + esc(t.slice(i, i+q.length)) + '</mark>' + esc(t.slice(i+q.length));
}
function productRowHtml(d, q, idx){
  const left = sellableOf(d.id);
  const inCart = saleCart.filter(i=>i.drugId===d.id).reduce((a,i)=>a+i.qty,0);
  const b = (_stockIdx.get(d.id) || {}).fefo || null;
  const days = b && b.expiry ? daysToExpiry(b.expiry) : null;
  const avail = left - inCart, none = avail <= 0, low = !none && avail <= (d.reorderLevel||0);
  const sub = [d.form, d.packSize].filter(Boolean).map(esc).join(' · ');
  return `<li role="option" id="prodOpt${idx}" class="prod-row${inCart?' in-cart':''}${none?' is-empty':''}" data-add="${d.id}" data-idx="${idx}" aria-selected="false" ${none?'aria-disabled="true"':''}>
    <span class="pr-name"><strong>${markMatch(d.name, q)}</strong>${sub ? `<small>${sub}</small>` : ''}</span>
    <span class="pr-stock${low?' low':''}${none?' none':''}">${none ? 'None left' : `${avail.toLocaleString()} ${esc(d.unit)}`}</span>
    <span class="pr-exp">${days!==null ? `<span class="exp-chip ${days<=90?'soon':''}">${days<=90 ? days+'d' : b.expiry.slice(0,7)}</span>` : ''}</span>
    <b class="pr-price">${b ? fmt(b.sellPrice) : '—'}</b>
    <span class="pr-add" aria-hidden="true">${inCart ? `<span class="prod-qty">${inCart}</span>` : icon('plus')}</span>
  </li>`;
}
// The list itself: at most sellLimit rows, so the page stays fast with thousands of products.
function productListHtml(){
  const q = sellSearch.trim();
  const all = productMatches(q);
  if(all.length === 0) return `<div class="empty compact"><span class="empty-icon">${icon('search')}</span><div class="empty-title">No product matches “${esc(q)}”</div><div>Check the spelling, or record it under Stock In.</div></div>`;
  const shown = all.slice(0, sellLimit);
  return `<ul class="prod-list" id="prodList" role="listbox" aria-label="Products">${shown.map((d,i)=>productRowHtml(d, q, i)).join('')}</ul>
    <div class="prod-foot-bar">
      <span>${q ? `${all.length.toLocaleString()} match${all.length===1?'':'es'}` : `Showing ${shown.length.toLocaleString()} of ${all.length.toLocaleString()} products`}</span>
      <span class="kbd-hint">↑ ↓ to move · Enter to add · Esc to clear</span>
      ${all.length > shown.length ? `<button type="button" class="btn small secondary" id="prodMore">Show ${Math.min(SELL_PAGE, all.length-shown.length)} more</button>` : ''}
    </div>`;
}

function viewSell(){
  const idx = buildStockIndex();
  const options = STATE.drugs.filter(d=>sellableOf(d.id)>0);
  const blockedByExpiry = STATE.drugs.filter(d=>{ const x = idx.get(d.id); return x && x.total>0 && x.sellable<=0; });
  const cartTotal = saleCart.reduce((a,i)=>a+i.qty*i.unitPrice,0);
  const paidValue = saleDraft.amountPaid === null ? cartTotal : saleDraft.amountPaid;
  const cartCount = saleCart.reduce((a,i)=>a+i.qty,0);
  const hasCustomer = saleDraft.buyer || saleDraft.buyerContact || saleDraft.diagnosis || saleDraft.additionalDetails;
  return `
  <div class="pos">
    <section class="panel pos-products">
      <div class="card-header"><h2>${icon('pill')} Products</h2><span class="hint">${options.length.toLocaleString()} in stock</span></div>
      ${blockedByExpiry.length>0 ? alertBox(`<strong>${blockedByExpiry.map(d=>esc(d.name)).join(', ')}</strong> ${blockedByExpiry.length===1?'has':'have'} only expired stock left and cannot be sold. Please stock in fresh batches.`, 'danger') : ''}
      ${options.length===0 ? `
        ${emptyState('Nothing available to sell', 'Record a delivery under Stock In first — products with non-expired stock will appear here.', 'package', true)}
        <div class="row" style="justify-content:center;"><button class="btn cta" type="button" data-goto="stockin">${icon('truck')} Go to Stock In</button></div>
      ` : `
      <div class="pos-tools">
        <div class="input-icon pos-search">${icon('search')}<input type="search" id="sellSearch" placeholder="Search a drug by name…" autocomplete="off" aria-label="Search products" aria-controls="prodList" aria-autocomplete="list" value="${esc(sellSearch)}"></div>
        <div class="pill-row mb-0" role="group" aria-label="Order">
          <button type="button" class="pill ${sellSort==='top'?'active':''}" data-sell-sort="top" aria-pressed="${sellSort==='top'}">Most sold</button>
          <button type="button" class="pill ${sellSort==='az'?'active':''}" data-sell-sort="az" aria-pressed="${sellSort==='az'}">A–Z</button>
        </div>
      </div>
      <div id="prodResults">${productListHtml()}</div>
      `}
      <details class="how-it-works mt-4">
        <summary class="small muted bold">How pricing &amp; stock deduction work</summary>
        <p class="small muted mt-2">The price fills in from the batch that expires first (First-Expiry-First-Out), but you can change it in the sale.
        When you complete the sale, stock is taken from the soonest-expiring batch first, and profit is calculated using that batch's cost price.
        Expired batches are never offered for sale — if all of a product's stock has expired, it's hidden from the list and flagged above until fresh stock is added.</p>
      </details>
    </section>

    <aside class="pos-sale" id="saleTicket" aria-label="Current sale">
      <div class="panel ticket">
        <div class="ticket-head">
          <div><span class="ticket-kicker">Current sale</span><h2>${saleCart.length ? `${cartCount} item${cartCount===1?'':'s'}` : 'Empty'}</h2></div>
          <span class="ticket-no" title="Patient number, assigned automatically">${icon('user')}<span class="mono" id="patientNoPreview">${peekNextIpno()}</span></span>
        </div>

        ${saleCart.length===0 ? `<div class="ticket-empty">${icon('cart')}<strong>Tap a product to start</strong><span>Items you add appear here. You can change quantity and price until you complete the sale.</span></div>` : `
        <ul class="ticket-lines">
          ${saleCart.map((it,idx)=>{
            const d = drugById(it.drugId);
            const nm = d ? esc(d.name) : 'item';
            return `<li class="tl">
              <div class="tl-top"><strong>${d?esc(d.name):'—'}${d && d.unit ? `<small class="tl-unit">${it.qty} × ${esc(d.unit)}</small>` : ''}</strong><button class="tl-remove" data-remove-cart="${idx}" type="button" aria-label="Remove ${nm}" title="Remove from sale">${icon('trash')}</button></div>
              <div class="tl-row">
                <div class="stepper" role="group" aria-label="Quantity of ${nm}">
                  <button type="button" data-cart-step="${idx}" data-step="-1" aria-label="One less" ${it.qty<=1?'disabled':''}>${icon('minus')}</button>
                  <input type="number" class="cart-input cart-qty" data-cart-qty="${idx}" value="${it.qty}" min="1" step="1" inputmode="numeric" aria-label="Quantity of ${nm}">
                  <button type="button" data-cart-step="${idx}" data-step="1" aria-label="One more">${icon('plus')}</button>
                </div>
                <span class="tl-x">×</span>
                <label class="tl-price"><span class="sr-only">Unit price of ${nm}</span><input type="number" class="cart-input cart-price" data-cart-price="${idx}" value="${it.unitPrice}" min="0" step="1" inputmode="numeric"></label>
                <span class="tl-sub">${fmt(it.qty*it.unitPrice)}</span>
              </div>
            </li>`;
          }).join('')}
        </ul>`}

        <div class="ticket-total"><span>Total due</span><strong>${fmt(cartTotal)}</strong></div>

        <div class="field">
          <label for="amountPaid">Amount paid now (UGX)</label>
          <input type="number" id="amountPaid" min="0" step="1" inputmode="numeric" value="${paidValue}" ${saleCart.length===0?'disabled':''}>
          <div class="field-hint" id="balanceHint">Leave as the full total for a cash sale, or lower it to record a part-payment — the balance prints on the receipt.</div>
        </div>
        <button class="btn cta btn-lg btn-block" id="completeSaleBtn" type="button" ${saleCart.length===0?'disabled':''}>${icon('checkCircle')} Complete sale${saleCart.length?` · ${fmt(cartTotal)}`:''}</button>
        ${saleCart.length ? `<button class="btn ghost btn-block mt-2" id="clearCartBtn" type="button">Clear sale</button>` : ''}

        <details class="ticket-customer"${hasCustomer ? ' open' : ''}>
          <summary>${icon('user')}<span>Customer details <em>optional</em></span>${icon('chevronRight')}</summary>
          <p class="xsmall subtle privacy-hint">${icon('lock')}<span>Only fill in what you need. Patient details stay private to your facility (<a href="${PRIVACY_URL}" target="_blank" rel="noopener">Privacy Policy</a>).</span></p>
          <div class="form-grid cols-2">
            <div class="field"><label for="buyerName">Customer name</label><input type="text" id="buyerName" placeholder="Walk-in customer" autocomplete="off" value="${esc(saleDraft.buyer)}"></div>
            <div class="field"><label for="buyerContact">Phone</label><input type="tel" id="buyerContact" inputmode="tel" placeholder="07XX XXX XXX" autocomplete="off" value="${esc(saleDraft.buyerContact)}"></div>
            <div class="field span-all"><label for="buyerDiagnosis">Diagnosis</label><input type="text" id="buyerDiagnosis" placeholder="e.g. Malaria" value="${esc(saleDraft.diagnosis)}"></div>
            <div class="field span-all"><label for="additionalDetails">Notes for the receipt</label><textarea id="additionalDetails" rows="2" placeholder="e.g. dosage instructions">${esc(saleDraft.additionalDetails)}</textarea></div>
          </div>
        </details>
      </div>
    </aside>
  </div>
  ${saleCart.length ? `<button class="pos-bar" type="button" id="posBar"><span><strong>${cartCount} item${cartCount===1?'':'s'}</strong>${fmt(cartTotal)}</span><span class="pos-bar-go">Review &amp; complete ${icon('arrowRight')}</span></button>` : ''}
  `;
}

function wireSell(){

  // Keep customer/payment fields in the draft as they're typed
  [['buyerName','buyer'],['buyerContact','buyerContact'],['buyerDiagnosis','diagnosis'],['additionalDetails','additionalDetails']].forEach(([id,key])=>{
    const el = document.getElementById(id);
    if(el) el.oninput = ()=>{ saleDraft[key] = el.value; };
  });
  const amountPaidInput = document.getElementById('amountPaid');
  const cartTotalNow = ()=> saleCart.reduce((a,i)=>a+i.qty*i.unitPrice,0);
  function updateBalanceHint(){
    const hint = document.getElementById('balanceHint');
    if(!hint || !amountPaidInput || saleCart.length===0) return;
    const total = cartTotalNow();
    const paid = Number(amountPaidInput.value);
    if(amountPaidInput.value === '' || isNaN(paid)){ hint.innerHTML = 'Enter the amount received.'; return; }
    if(paid >= total){
      hint.innerHTML = paid > total
        ? `<span class="text-warning bold">Change to give: ${fmt(paid-total)}</span> — the receipt records the total as paid in full.`
        : `<span class="text-success bold">Paid in full.</span>`;
    } else {
      hint.innerHTML = `<span class="text-danger bold">Balance due: ${fmt(total-paid)}</span> — recorded as a part-payment.`;
    }
  }
  if(amountPaidInput){
    amountPaidInput.oninput = ()=>{ saleDraft.amountPaid = amountPaidInput.value === '' ? 0 : Number(amountPaidInput.value); updateBalanceHint(); };
    updateBalanceHint();
  }

  // Add one of a product (or one more, if it's already in the sale) at its FEFO price.
  function addProduct(id, fromKeyboard){
    const drug = drugById(id);
    const available = totalSellableQty(id);
    if(available<=0){ toast(`${drug?drug.name:'This drug'} cannot be sold — remaining stock is expired.`, 'error'); return; }
    const alreadyInCart = saleCart.filter(i=>i.drugId===id).reduce((a,i)=>a+i.qty,0);
    if(alreadyInCart + 1 > available){ toast(`No more non-expired ${drug?drug.unit:'units'} of ${drug?drug.name:'this item'} left.`, 'error'); return; }
    const b = fefoBatch(id);
    const price = b ? num(b.sellPrice) : 0;
    const line = saleCart.find(i=>i.drugId===id && i.unitPrice===price);
    if(line) line.qty += 1; else saleCart.push({ drugId:id, qty:1, unitPrice:price });
    saleDraft.amountPaid = null; // new total: assume paid in full
    const list = document.getElementById('prodList'), keep = list ? list.scrollTop : 0;
    renderTabContent();
    const list2 = document.getElementById('prodList'); if(list2) list2.scrollTop = keep;
    if(fromKeyboard){ const si = document.getElementById('sellSearch'); if(si){ si.focus(); si.select(); } }
  }
  const results = document.getElementById('prodResults');
  const search = document.getElementById('sellSearch');
  let active = 0;
  const rows = ()=> results ? [...results.querySelectorAll('[data-add]')] : [];
  const setActive = (i, scroll)=>{
    const r = rows(); if(!r.length) return;
    active = Math.max(0, Math.min(r.length-1, i));
    r.forEach((el,j)=>{ const on = j===active; el.classList.toggle('active', on); el.setAttribute('aria-selected', on); });
    if(search) search.setAttribute('aria-activedescendant', r[active].id);
    if(scroll) r[active].scrollIntoView({ block:'nearest' });
  };
  const refresh = ()=>{ if(!results) return; results.innerHTML = productListHtml(); setActive(0); };
  if(results){
    // one listener for every row (rows are re-drawn as you type)
    results.onclick = (e)=>{
      if(e.target.closest('#prodMore')){ sellLimit += SELL_PAGE; const keep = document.getElementById('prodList').scrollTop; refresh(); document.getElementById('prodList').scrollTop = keep; return; }
      const row = e.target.closest('[data-add]'); if(!row) return;
      if(row.getAttribute('aria-disabled') === 'true'){ toast('None left to add.', 'error'); return; }
      addProduct(row.dataset.add);
    };
    setActive(0);
  }
  document.querySelectorAll('[data-sell-sort]').forEach(b=> b.onclick = ()=>{ sellSort = b.dataset.sellSort; sellLimit = SELL_PAGE; renderTabContent(); });
  if(search){
    search.oninput = ()=>{ sellSearch = search.value; sellLimit = SELL_PAGE; refresh(); };
    search.onkeydown = (e)=>{
      if(e.key === 'ArrowDown'){ e.preventDefault(); setActive(active+1, true); return; }
      if(e.key === 'ArrowUp'){ e.preventDefault(); setActive(active-1, true); return; }
      if(e.key === 'Escape' && search.value){ e.preventDefault(); search.value = ''; sellSearch = ''; refresh(); return; }
      if(e.key !== 'Enter') return;
      e.preventDefault();
      const r = rows()[active];
      if(r && r.getAttribute('aria-disabled') !== 'true') addProduct(r.dataset.add, true);
      else if(r) toast('None left to add.', 'error');
    };
  }
  document.querySelectorAll('[data-cart-step]').forEach(btn=>{
    btn.onclick = ()=>{
      const idx = Number(btn.dataset.cartStep), it = saleCart[idx];
      if(!it) return;
      const input = document.querySelector(`[data-cart-qty="${idx}"]`);
      input.value = it.qty + Number(btn.dataset.step);
      editCartLine(input, 'qty');
    };
  });
  const posBar = document.getElementById('posBar');
  if(posBar){
    const ticket = document.getElementById('saleTicket');
    posBar.onclick = ()=> ticket.scrollIntoView({ behavior:'smooth', block:'start' });
    // The bar is only a shortcut: hide it while the sale itself is on screen.
    if('IntersectionObserver' in window){
      const io = new IntersectionObserver(([en])=>{
        if(!document.body.contains(posBar)){ io.disconnect(); return; }
        posBar.classList.toggle('is-away', en.isIntersecting);
      }, { threshold: .25 });
      io.observe(ticket);
    }
  }
  document.querySelectorAll('[data-remove-cart]').forEach(b=>{
    b.onclick = ()=>{
      const idx = Number(b.dataset.removeCart), it = saleCart[idx];
      if(!it) return;
      const d = drugById(it.drugId);
      saleCart.splice(idx,1); saleDraft.amountPaid = null; renderTabContent();
      toast(`Removed ${d ? d.name : 'item'} from the cart.`, 'info');
    };
  });

  // Edit an item in the cart (quantity or price) - allowed until the sale is completed.
  function editCartLine(input, field){
    const idx = Number(input.dataset[field === 'qty' ? 'cartQty' : 'cartPrice']);
    const it = saleCart[idx];
    if(!it) return;
    const d = drugById(it.drugId);
    const raw = input.value.trim();
    const val = Number(raw);
    const revert = (msg)=>{ toast(msg, 'error'); input.value = field === 'qty' ? it.qty : it.unitPrice; input.focus(); input.select(); };
    if(field === 'qty'){
      if(raw === '' || !Number.isInteger(val) || val < 1) return revert('Quantity must be a whole number of at least 1. To take the item out, use the remove button.');
      const others = saleCart.reduce((a,x,i)=> a + (i !== idx && x.drugId === it.drugId ? x.qty : 0), 0);
      const max = totalSellableQty(it.drugId) - others;
      if(val > max) return revert(`Only ${max} non-expired ${d ? d.unit : 'units'} of ${d ? d.name : 'this item'} available.`);
      if(val === it.qty) return;
      it.qty = val;
    } else {
      if(raw === '' || !(val >= 0)) return revert('Enter a price of 0 or more.');
      if(Math.round(val) === it.unitPrice) return;
      it.unitPrice = Math.round(val);
    }
    saleDraft.amountPaid = null; // the total changed: assume paid in full again
    renderTabContent();
  }
  document.querySelectorAll('[data-cart-qty]').forEach(el=>{
    el.onchange = ()=> editCartLine(el, 'qty');
    el.onkeydown = (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); el.blur(); } };
  });
  document.querySelectorAll('[data-cart-price]').forEach(el=>{
    el.onchange = ()=> editCartLine(el, 'price');
    el.onkeydown = (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); el.blur(); } };
  });
  const clearBtn = document.getElementById('clearCartBtn');
  if(clearBtn) clearBtn.onclick = ()=> confirmDialog('Clear this sale?', 'All items and customer details entered for this sale will be removed.', async ()=>{
    saleCart = []; resetSaleDraft(); sellSearch = ''; sellLimit = SELL_PAGE; renderTabContent();
  }, 'Clear sale');

  const completeBtn = document.getElementById('completeSaleBtn');
  if(completeBtn){
    completeBtn.onclick = async ()=>{
      if(saleCart.length===0) return;
      const buyer = document.getElementById('buyerName').value.trim();
      const buyerContact = document.getElementById('buyerContact').value.trim();
      const diagnosis = document.getElementById('buyerDiagnosis').value.trim();
      const additionalDetails = document.getElementById('additionalDetails').value.trim();
      const cartTotal = saleCart.reduce((a,i)=>a+i.qty*i.unitPrice,0);
      let amountPaid = Number(amountPaidInput.value);
      if(isNaN(amountPaid) || amountPaid<0) amountPaid = 0;
      if(amountPaid > cartTotal) amountPaid = cartTotal;

      // Re-check every item against non-expired stock right before committing —
      // notify and decline the whole sale rather than sell any expired stock.
      for(const item of saleCart){
        const drug = drugById(item.drugId);
        const available = totalSellableQty(item.drugId);
        if(item.qty > available){
          toast(`Sale declined — ${drug?drug.name:'a drug'} in the cart has expired or has insufficient non-expired stock.`, 'error');
          return;
        }
      }

      const saleItems = [];
      for(const item of saleCart){
        let remainingToDeduct = item.qty;
        const batches = sellableBatchesForDrug(item.drugId).sort((a,b)=> (a.expiry||'9999')<(b.expiry||'9999')?-1:1);
        for(const b of batches){
          if(remainingToDeduct<=0) break;
          const take = Math.min(b.qtyRemaining, remainingToDeduct);
          b.qtyRemaining -= take;
          remainingToDeduct -= take;
          saleItems.push({drugId:item.drugId, batchId:b.id, qty:take, unitPrice:item.unitPrice, cost:b.costPrice});
        }
        if(remainingToDeduct > 0){
          // Should not happen given the pre-check above, but never sell expired stock even as a fallback.
          toast(`Sale declined — not enough non-expired stock to fulfil the cart.`, 'error');
          return;
        }
      }
      const total = saleItems.reduce((a,i)=>a+i.qty*i.unitPrice,0);
      const patientNo = await takeNextIpno();
      const saleDate = new Date().toISOString();
      const sale = {
        id:uid(), date:saleDate, items:saleItems, total, buyer, patientNo, buyerContact, diagnosis, additionalDetails,
        amountPaid, soldBy: session.username, soldByRole: session.role,
        paymentHistory: amountPaid>0 ? [{ date: saleDate, amount: amountPaid, recordedBy: session.username }] : []
      };
      STATE.sales.push(sale);
      await saveBatches();
      await saveSales();
      toast(`Sale recorded — ${fmt(total)}`, 'success');
      saleCart = [];
      resetSaleDraft();
      sellSearch = ''; sellLimit = SELL_PAGE;
      renderTabContent();
      renderTabs();
      openReceiptModal(sale);
    };
  }
}
