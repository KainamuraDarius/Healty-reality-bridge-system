// Packages & Pay (shared UI: lock screen + System tab).
// ---------- Packages & Pay (shared UI: lock screen + System tab) ----------
const PLAN_INFO = {
  starter:  { for:'For a drug shop or a single counter', icon:'pill' },
  standard: { for:'For busy facilities with a team', icon:'building' },
};
const PLAN_FEATURES = ['Stock, batches &amp; expiry', 'Sales, receipts &amp; patient numbers', 'Reports, finance &amp; profit', 'Offline use, sync &amp; backups', 'Support by phone &amp; WhatsApp'];

// The plan this pharmacy is on now: 'trial' | 'starter' | 'standard' | null
function currentPlanKey(){
  const lic = licenseStatus();
  if(!lic.configured) return null;
  if(lic.trial) return 'trial';
  return lic.tier && PACKAGES[lic.tier] ? lic.tier : null;
}

// Plan cards + payment. Every choose / renew / upgrade button is a .pay-pkg-card (wired below).
// opts.compact: no free-trial card (lock screen).
function packagesAndPayHtml(prefix, opts = {}){
  const lic = licenseStatus();
  const cur = currentPlanKey();
  const paid = cur === 'starter' || cur === 'standard';
  const hasTier = paid; // used by the activation-code form below
  const money = n => `UGX ${n.toLocaleString()}`;
  const feat = (devices)=> `<ul class="plan-feats"><li>${icon('smartphone')}<span><strong>Up to ${devices}</strong> phones or computers</span></li>${PLAN_FEATURES.map(f=>`<li>${icon('check')}<span>${f}</span></li>`).join('')}</ul>`;

  const trialCard = opts.compact ? '' : `
    <article class="plan-card plan-trial${cur==='trial' ? ' is-current' : (paid ? ' is-used' : '')}">
      ${cur==='trial' ? `<span class="plan-ribbon">Current plan</span>` : ''}
      <div class="plan-top"><span class="plan-ic">${icon('gift')}</span><div><h3>Free trial</h3><p>Try everything before paying</p></div></div>
      <div class="plan-price"><strong>Free</strong><span>${publicTrialDays()} days · every feature</span></div>
      <div class="plan-then">No payment or card needed to start</div>
      ${feat(lic.configured && lic.trial ? lic.maxDevices : DEFAULT_MAX_DEVICES)}
      <div class="plan-cta">${cur==='trial'
        ? `<span class="plan-state">${lic.daysLeft >= 0 ? `${lic.daysLeft} day${lic.daysLeft===1?'':'s'} left` : 'Ended'} — choose a plan to keep going</span>`
        : `<span class="plan-state muted">${paid ? 'Already used' : 'Starts when you register'}</span>`}</div>
    </article>`;

  const planCard = (key)=>{
    const p = PACKAGES[key], info = PLAN_INFO[key] || {}, isCur = cur === key;
    let cta;
    if(isCur) cta = `<button class="btn cta btn-block pay-pkg-card" type="button" data-pkg="${key}" data-renewal="1">${icon('refresh')} Renew · ${money(MONTHLY_FEE)} / 30 days</button>`;
    else if(cur === 'standard' && key === 'starter') cta = `<span class="plan-state muted">To move to Starter, contact us</span>`;
    else if(cur === 'starter' && key === 'standard') cta = `<button class="btn btn-block pay-pkg-card" type="button" data-pkg="${key}" data-renewal="0">${icon('trendingUp')} Upgrade · ${money(p.setupFee)}</button>`;
    else cta = `<button class="btn btn-block ${key==='standard' ? 'cta' : 'secondary'} pay-pkg-card" type="button" data-pkg="${key}" data-renewal="0">Choose ${p.label} · ${money(p.setupFee)}</button>`;
    return `
    <article class="plan-card${isCur ? ' is-current' : ''}${key==='standard' ? ' is-featured' : ''}">
      ${isCur ? `<span class="plan-ribbon">Current plan</span>` : key==='standard' && !paid ? `<span class="plan-ribbon hot">Most popular</span>` : ''}
      <div class="plan-top"><span class="plan-ic">${icon(info.icon || 'package')}</span><div><h3>${p.label}</h3><p>${info.for || ''}</p></div></div>
      <div class="plan-price"><strong>${money(p.setupFee)}</strong><span>one-time setup · first 30 days included</span></div>
      <div class="plan-then">then <strong>${money(MONTHLY_FEE)}</strong> a month</div>
      ${feat(p.devices)}
      <div class="plan-cta">${cta}</div>
    </article>`;
  };

  return `
    <div class="plan-grid${opts.compact ? ' compact' : ''}" id="${prefix}PkgList">${trialCard}${Object.keys(PACKAGES).map(planCard).join('')}</div>
    <div id="${prefix}PayArea" class="pay-area" hidden>
      <div class="pay-summary" id="${prefix}PaySummary"></div>
      <div class="pay-form">
        <div class="field mb-0"><label for="${prefix}MomoPhone">MTN or Airtel Money number</label><input type="tel" id="${prefix}MomoPhone" placeholder="07XX XXX XXX" inputmode="tel" autocomplete="tel"></div>
        <button class="btn cta" id="${prefix}MomoPayBtn" type="button">${icon('smartphone')} <span>Pay now</span></button>
      </div>
      <ol class="pay-steps" id="${prefix}PaySteps" hidden>
        <li data-step="start">Sending the request</li>
        <li data-step="approve">Approve on your phone — enter your Mobile Money PIN</li>
        <li data-step="done">Payment confirmed — plan switched on</li>
      </ol>
      <p id="${prefix}MomoStatus" class="small mt-2" role="status" aria-live="polite"></p>
      <p class="xsmall subtle mt-2 mb-0">${icon('lock')} Paid securely through Nylon Pay to REALITY HEALTH SYSTEM. Your plan switches on by itself as soon as the payment is confirmed, on every device of the facility.</p>
    </div>
    <details class="code-details mt-4">
      <summary>Paid another way (bank, cash, sent money directly)? Enter your activation code</summary>
      <form id="${prefix}CodeForm" class="form-grid mt-3 mb-0">
        <div class="field"><label for="${prefix}CodeFacility">Facility name</label><input type="text" id="${prefix}CodeFacility" value="${esc((lic.configured && lic.facility) || (STATE.settings.identity ? STATE.settings.identity.name : ''))}" required></div>
        <div class="field"><label for="${prefix}CodePackage">Package</label>
          <select id="${prefix}CodePackage">
            <option value="starter" ${hasTier && lic.tier==='starter' ? 'selected':''}>Starter — 2 devices</option>
            <option value="standard" ${hasTier && lic.tier==='standard' ? 'selected':''}>Standard — 5 devices</option>
          </select>
        </div>
        <div class="field"><label for="${prefix}CodeExpiry">New expiry date</label><input type="date" id="${prefix}CodeExpiry" required></div>
        <div class="field"><label for="${prefix}CodeInput">Activation / renewal code</label><input type="text" id="${prefix}CodeInput" placeholder="From REALITY HEALTH SYSTEM" autocapitalize="characters" required></div>
        <div class="auth-error span-all mb-0" id="${prefix}CodeError" role="alert"></div>
        <div class="span-all"><button class="btn secondary" type="submit">${icon('key')} Activate with code</button></div>
      </form>
    </details>
    ${alertBox(`Manual Mobile Money payments go to <strong>${RHS_PHONE}</strong> (name: <strong>${RHS_MOMO_NAME}</strong>). Call ${RHS_PHONE} or email ${RHS_EMAIL} for a code.`, 'info', 'phone')}
  `;
}
function wirePackagesAndPay(prefix, onSuccess){
  const lic = licenseStatus();
  let selected = null; // {key, amount, renewal}
  document.querySelectorAll(`#${prefix}PkgList .pay-pkg-card`).forEach(card=>{
    card.onclick = ()=>{
      document.querySelectorAll(`#${prefix}PkgList .pay-pkg-card`).forEach(c=>{ c.classList.remove('selected'); c.setAttribute('aria-pressed','false'); });
      card.classList.add('selected');
      card.setAttribute('aria-pressed','true');
      const renewal = card.getAttribute('data-renewal')==='1';
      const key = card.getAttribute('data-pkg');
      selected = { key, renewal, amount: renewal ? MONTHLY_FEE : PACKAGES[key].setupFee };
      const payArea = document.getElementById(`${prefix}PayArea`);
      const sum = document.getElementById(`${prefix}PaySummary`);
      if(sum) sum.innerHTML = `<span>${renewal ? 'Renewing' : (currentPlanKey()==='starter' && key==='standard' ? 'Upgrading to' : 'You chose')}</span><strong>${PACKAGES[key].label}${renewal ? ' — 30 more days' : ''}</strong><b>UGX ${selected.amount.toLocaleString()}</b>${renewal ? '' : '<em>includes the first 30 days</em>'}`;
      const btnLabel = document.querySelector(`#${prefix}MomoPayBtn span`); if(btnLabel) btnLabel.textContent = `Pay UGX ${selected.amount.toLocaleString()}`;
      if(payArea){ payArea.hidden = false; payArea.scrollIntoView({ behavior:'smooth', block:'nearest' }); const ph = document.getElementById(`${prefix}MomoPhone`); if(ph) ph.focus({ preventScroll:true }); }
    };
    card.onkeydown = (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); card.click(); } };
  });
  const payBtn = document.getElementById(`${prefix}MomoPayBtn`);
  const statusEl = document.getElementById(`${prefix}MomoStatus`);
  const steps = document.getElementById(`${prefix}PaySteps`);
  const setStep = (step, tone, text)=>{
    if(steps){
      steps.hidden = false;
      const order = ['start','approve','done'];
      steps.querySelectorAll('li').forEach(li=>{
        const i = order.indexOf(li.dataset.step), cur = order.indexOf(step);
        li.className = i < cur || (i === cur && tone === 'ok') ? 'done' : i === cur ? (tone === 'bad' ? 'bad' : 'active') : '';
      });
    }
    if(statusEl){ statusEl.textContent = text || ''; statusEl.className = 'small mt-2 ' + (tone === 'bad' ? 'text-danger' : tone === 'ok' ? 'text-success' : 'muted'); }
  };
  const busy = on => { if(payBtn){ payBtn.disabled = on; payBtn.classList.toggle('is-loading', on); } };
  // Ask the server every 4 seconds for up to 3 minutes. The server renews the plan itself when
  // Nylon Pay confirms, so leaving the screen never loses a payment.
  let polling = null;
  const follow = (ref, amount)=>{
    clearInterval(polling);
    let tries = 0;
    setStep('approve', '', `A request for UGX ${Number(amount||0).toLocaleString()} was sent. Check the phone and enter the Mobile Money PIN.`);
    polling = setInterval(async ()=>{
      if(!document.body.contains(statusEl)){ clearInterval(polling); return; }
      tries++;
      try{
        const p = await checkOnlinePayment(ref);
        if(p.status === 'successful'){
          clearInterval(polling);
          setStep('done', 'ok', `Payment confirmed. Your plan now runs until ${fmtDate(p.licence_until)}.`);
          await receivePaidLicence();
          toast('Payment confirmed — your plan is active.', 'success');
          busy(false);
          setTimeout(onSuccess, 1200);
        } else if(p.status === 'failed' || p.status === 'cancelled'){
          clearInterval(polling); busy(false);
          setStep('approve', 'bad', `The payment did not go through${p.message ? ': ' + p.message : ''}. No money was taken. You can try again.`);
        } else if(p.status === 'on_hold'){
          clearInterval(polling); busy(false);
          setStep('approve', 'bad', 'The payment is being checked. REALITY HEALTH SYSTEM will switch your plan on — or call ' + RHS_PHONE + '.');
        } else if(tries >= 45){
          clearInterval(polling); busy(false);
          setStep('approve', '', 'Still waiting for the approval. If you approved it, your plan switches on by itself within a few minutes — open this page again later.');
        }
      }catch(e){ if(e.code !== 'network'){ clearInterval(polling); busy(false); setStep('approve', 'bad', e.message); } }
    }, 4000);
  };
  if(payBtn){
    payBtn.onclick = async ()=>{
      if(!selected){ toast('Choose a package first.', 'error'); return; }
      const phone = document.getElementById(`${prefix}MomoPhone`).value.trim();
      if(!/^(\+?256|0)?7\d{8}$/.test(phone.replace(/[\s-]/g,''))){ toast('Enter an MTN or Airtel number, e.g. 0772 123456.', 'error'); return; }
      busy(true);
      setStep('start', '', 'Sending the payment request…');
      try{
        const p = await startOnlinePayment(selected.renewal ? 'renewal' : 'setup', selected.key, phone);
        follow(p.reference, p.amount);
      }catch(e){
        busy(false);
        setStep('start', 'bad', e.message);
      }
    };
    // A payment started earlier on this device that has not finished yet: keep following it.
    const pending = pendingPaymentRef();
    if(pending){
      const area = document.getElementById(`${prefix}PayArea`); if(area) area.hidden = false;
      busy(true); follow(pending, 0);
      setStep('approve', '', 'Checking the payment you started earlier…');
    }
  }
  const codeForm = document.getElementById(`${prefix}CodeForm`);
  if(codeForm){
    codeForm.onsubmit = async (e)=>{
      e.preventDefault();
      const facility = document.getElementById(`${prefix}CodeFacility`).value;
      const pkgKey = document.getElementById(`${prefix}CodePackage`).value;
      const expiry = document.getElementById(`${prefix}CodeExpiry`).value;
      const code = document.getElementById(`${prefix}CodeInput`).value;
      const errBox = document.getElementById(`${prefix}CodeError`);
      const sameTier = lic.configured && lic.tier === pkgKey;
      const ok = sameTier ? await renewLicense(expiry, code) : await activatePackageLicense(facility, expiry, pkgKey, code);
      if(!ok){ errBox.textContent = 'That code does not match this facility, package and date.'; errBox.classList.remove('show'); void errBox.offsetWidth; errBox.classList.add('show'); return; }
      toast('Subscription activated.', 'success');
      onSuccess();
    };
  }
}
