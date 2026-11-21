// Public home page: what visitors see before they log in (a device with no facility on it yet,
// or anyone who taps "Home" on the login screens). Explains the product, prices and support,
// and leads to "Register your facility" or "Log in".
//
// Visual language: the pharmacy's book, rebuilt - ruled ledger lines, printed receipts,
// batch/expiry labels and a blister pack for the steps. Everything drawn is decorative.

const LANDING_FAQ = [
  ['Does it work without internet?', 'Yes. After the first setup, the app runs fully on your phone or computer. Sales and stock you record offline are saved on the device and sent to your other devices when the internet comes back.'],
  ['Can we use it on more than one phone or computer?', ()=> `Yes. The Starter package covers ${PACKAGES.starter.devices} devices and Standard covers ${PACKAGES.standard.devices}. Log in on a new device with your facility email, and your records download to it.`],
  ['What happens when the free trial ends?', ()=> `Pick a package from the System page. If you need a few more days, you keep full access for ${GRACE_DAYS} extra days with a reminder before the app locks. Your records are never deleted.`],
  ['How do we pay?', ()=> `Inside the app with MTN Mobile Money or Airtel Money: choose a plan, enter your number and approve with your PIN — the plan switches on straight away on all your devices. You can also pay ${esc(RHS_MOMO_NAME)} (${esc(RHS_PHONE)}) another way and receive an activation code.`],
  ['Is our data safe?', 'Each facility only ever sees its own records. Passwords are never stored in readable form, records are copied to the server when you are online, and you can download a full backup at any time.'],
  ['How do staff log in?', `The facility admin creates staff logins from the Team page. Staff then log in with their own username and password, with up to ${MAX_STAFF_ACCOUNTS} staff per facility.`]
];

function renderLanding(){
  const app = document.getElementById('app');
  const hasAccounts = STATE.accounts.length > 0;
  const trialDays = publicTrialDays();
  const year = new Date().getFullYear();
  const loginLabel = hasAccounts ? 'Log in' : 'Log in to my facility';
  const links = [['lpWhy','Why switch'],['lpFeatures','Features'],['lpDay','A day with it'],['lpPricing','Pricing'],['lpSupport','Support']];

  app.innerHTML = `
  <div class="lp">
    <a class="lp-skip" href="#lpTop">Skip to content</a>
    <header class="lp-nav" id="lpNav">
      <div class="lp-container lp-nav-inner">
        <a class="lp-brand" href="#lpTop" aria-label="Reality Health Bridge home">
          <img src="${RHB_LOGO}" alt="">
          <span><strong>Reality Health Bridge</strong><small>by REALITY HEALTH SYSTEM</small></span>
        </a>
        <nav class="lp-links" aria-label="Page sections">
          ${links.map(([id, t])=>`<a href="#${id}">${t}</a>`).join('')}
        </nav>
        <div class="lp-nav-actions">
          ${installBtn()}${themeToggleBtn()}
          <button class="btn btn-sm lp-nav-login" type="button" data-lp="login">Log in</button>
          <button class="btn btn-sm lp-nav-cta lp-hide-sm" type="button" data-lp="signup">Start free trial</button>
          <button class="icon-btn lp-menu-btn" type="button" id="lpMenuBtn" aria-expanded="false" aria-controls="lpMenu" aria-label="Open menu">${icon('menu')}</button>
        </div>
      </div>
      <div class="lp-menu" id="lpMenu" hidden>
        <div class="lp-container">
          ${links.map(([id, t])=>`<a href="#${id}">${t}${icon('chevronRight')}</a>`).join('')}
          <div class="lp-menu-cta">
            <span class="lp-menu-install">${installBtn()}</span>
            <button class="btn lp-btn-accent btn-block" type="button" data-lp="signup">Start ${trialDays}-day free trial</button>
            <button class="btn secondary btn-block" type="button" data-lp="login">${loginLabel}</button>
          </div>
        </div>
      </div>
    </header>

    <main id="lpTop">
      <!-- HERO -->
      <section class="lp-hero">
        <div class="lp-container lp-hero-grid">
          <div class="lp-hero-copy">
            <span class="lp-kicker"><i></i>Stock · Sales · Price book — for pharmacies, drug shops &amp; clinics</span>
            <h1>Every batch tracked.<br><span class="lp-mark">Every shilling</span> accounted for.</h1>
            <p class="lp-lead">Reality Health Bridge replaces the paper book at your counter. Record deliveries with batch and expiry, dispense first-expiry-first-out with printed receipts, and see today's profit before you lock up — even when the network is down.</p>
            <div class="lp-cta">
              <button class="btn btn-lg lp-btn-accent" type="button" data-lp="signup">Start your ${trialDays}-day free trial ${icon('arrowRight')}</button>
              <button class="btn btn-lg lp-btn-glass" type="button" data-lp="login">${loginLabel}</button>
            </div>
            <ul class="lp-assure">
              <li>${icon('check')} No card or payment to start</li>
              <li>${icon('check')} Set up in minutes</li>
              <li>${icon('check')} Phones &amp; computers</li>
            </ul>
          </div>
          ${landingHeroArt()}
        </div>
        <div class="lp-container">
          <dl class="lp-ledger" aria-label="At a glance">
            <div><dt>Dispensing</dt><dd>First-expiry-first-out, automatically</dd></div>
            <div><dt>Expiry</dt><dd>Warnings 30, 60 &amp; 90 days ahead</dd></div>
            <div><dt>Devices</dt><dd>Up to ${PACKAGES.standard.devices} per facility, kept in sync</dd></div>
            <div><dt>Network</dt><dd>Keeps selling offline</dd></div>
          </dl>
        </div>
      </section>

      <!-- PAPER BOOK VS APP -->
      <section class="lp-section" id="lpWhy">
        <div class="lp-container">
          <div class="lp-head" data-reveal>
            <span class="lp-eyebrow">Why switch</span>
            <h2>The paper book did its best.<br>Your facility deserves better.</h2>
          </div>
          <div class="lp-versus" data-reveal>
            <div class="lp-vs-old">
              <h3>${icon('edit')} The paper book</h3>
              <ul>
                <li>Expired stock found on the shelf, too late</li>
                <li>Totals added up by hand every evening</li>
                <li>No record of which batch went to which patient</li>
                <li>Prices remembered, or guessed</li>
                <li>One copy, on one desk</li>
              </ul>
            </div>
            <div class="lp-vs-arrow" aria-hidden="true">${icon('arrowRight')}</div>
            <div class="lp-vs-new">
              <h3><img src="${RHB_LOGO}" alt=""> Reality Health Bridge</h3>
              <ul>
                <li>${icon('checkCircle')} Expiry warnings 30, 60 and 90 days ahead</li>
                <li>${icon('checkCircle')} Sales, spending and profit worked out for you</li>
                <li>${icon('checkCircle')} Batch and expiry saved on every sale</li>
                <li>${icon('checkCircle')} One price book every staff member sells from</li>
                <li>${icon('checkCircle')} On every phone and computer, synced and backed up</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- FEATURES (bento) -->
      <section class="lp-section lp-tint" id="lpFeatures">
        <div class="lp-container">
          <div class="lp-head" data-reveal>
            <span class="lp-eyebrow">Features</span>
            <h2>Everything a busy counter needs</h2>
            <p>Built with health workers for the way pharmacies, drug shops and clinics really work.</p>
          </div>
          <div class="lp-bento">
            <article class="lp-tile t-wide" data-reveal>
              <div class="lp-tile-copy">
                <span class="lp-tile-ic">${icon('package')}</span>
                <h3>Stock in by batch</h3>
                <p>Every delivery saved with batch number, expiry, supplier, cost and selling price. You see your margin before you save, and your records are ready for inspection.</p>
              </div>
              <div class="lp-viz lp-viz-batches" aria-hidden="true">
                <div class="vb-row"><span class="vb-name">Amoxicillin 500mg<small>Batch AMX-2311 · 200 caps</small></span><em class="tag-danger">Exp 12 days</em></div>
                <div class="vb-row"><span class="vb-name">Coartem 20/120<small>Batch CT-0924 · 60 packs</small></span><em class="tag-warn">Exp 38 days</em></div>
                <div class="vb-row"><span class="vb-name">Panadol Extra<small>Batch PX-1102 · 40 strips</small></span><em class="tag-ok">Exp 8 months</em></div>
                <div class="vb-margin">Margin on this delivery <strong>+32%</strong></div>
              </div>
            </article>
            <article class="lp-tile t-dark" data-reveal>
              <span class="lp-tile-ic">${icon('wifiOff')}</span>
              <h3>Works offline</h3>
              <p>Network down? Keep selling. Everything goes to your other devices when you are back online.</p>
              <div class="lp-viz lp-viz-offline" aria-hidden="true"><span class="vo-dot"></span>Offline · 3 sales saved<small>Will sync automatically</small></div>
            </article>
            <article class="lp-tile" data-reveal>
              <span class="lp-tile-ic">${icon('hourglass')}</span>
              <h3>Expiry watch</h3>
              <p>See what expires soon and act before it becomes a loss.</p>
              <div class="lp-viz lp-viz-expiry" aria-hidden="true">
                <div><span>30 days</span><b style="--w:28%" class="ve-d"></b><em>4</em></div>
                <div><span>60 days</span><b style="--w:52%" class="ve-w"></b><em>9</em></div>
                <div><span>90 days</span><b style="--w:80%" class="ve-o"></b><em>15</em></div>
              </div>
            </article>
            <article class="lp-tile" data-reveal>
              <span class="lp-tile-ic">${icon('receipt')}</span>
              <h3>Printed receipts</h3>
              <p>Receipts with patient numbers, part-payments and balances owed.</p>
              <div class="lp-viz lp-viz-receipt" aria-hidden="true">
                <div><span>Paracetamol × 2</span><span>1,000</span></div>
                <div><span>ORS sachet × 3</span><span>1,500</span></div>
                <div class="vr-total"><span>Total</span><span>2,500</span></div>
              </div>
            </article>
            <article class="lp-tile" data-reveal>
              <span class="lp-tile-ic">${icon('users')}</span>
              <h3>Team logins</h3>
              <p>Admin and staff each log in. Every sale is saved under the person who made it.</p>
              <div class="lp-viz lp-viz-team" aria-hidden="true">
                <span class="vt-av a1">JN</span><span class="vt-av a2">AK</span><span class="vt-av a3">RM</span>
                <span class="vt-tag">Admin</span><span class="vt-tag s">Staff ×2</span>
              </div>
            </article>
            <article class="lp-tile t-full" data-reveal>
              <div class="lp-tile-copy">
                <span class="lp-tile-ic">${icon('barChart')}</span>
                <h3>A clear money picture</h3>
                <p>Income, spending and profit by day, week and month — worked out from what each batch really cost you, not a guess.</p>
              </div>
              <div class="lp-viz lp-viz-money" aria-hidden="true">
                <div class="vm-stats">
                  <div><span>Sales this week</span><strong>UGX 6.8M</strong></div>
                  <div><span>Profit</span><strong class="pos">UGX 1.9M</strong></div>
                </div>
                <div class="vm-bars">${[42,58,36,70,64,92,76].map((h,i)=>`<b style="--h:${h}%"${i===5?' class="hi"':''}></b>`).join('')}</div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <!-- A DAY AT THE COUNTER -->
      <section class="lp-section" id="lpDay">
        <div class="lp-container">
          <div class="lp-head" data-reveal>
            <span class="lp-eyebrow">A day with Reality Health Bridge</span>
            <h2>From opening to closing time</h2>
          </div>
          <ol class="lp-day">
            <li data-reveal><time>7:45 am</time><span class="lp-day-ic">${icon('truck')}</span><h3>The delivery arrives</h3><p>Record it in Stock In with batch, expiry and prices. Stock levels update everywhere.</p></li>
            <li data-reveal><time>10:30 am</time><span class="lp-day-ic">${icon('pill')}</span><h3>The morning rush</h3><p>Search, add to cart, complete. The oldest safe batch is sold first and the receipt prints.</p></li>
            <li data-reveal><time>2:15 pm</time><span class="lp-day-ic">${icon('wifiOff')}</span><h3>The network drops</h3><p>Nobody notices. Sales keep saving on the device and sync when the network returns.</p></li>
            <li data-reveal><time>7:30 pm</time><span class="lp-day-ic">${icon('trendingUp')}</span><h3>Closing time</h3><p>Open the dashboard: today's sales, profit, balances owed and who sold what. No adding up.</p></li>
          </ol>
        </div>
      </section>

      <!-- STEPS (blister pack) -->
      <section class="lp-section lp-tint" id="lpHow">
        <div class="lp-container lp-how">
          <div class="lp-how-copy" data-reveal>
            <span class="lp-eyebrow">Get started</span>
            <h2>Up and running before your next delivery</h2>
            <p>No installation visit, no special computer. Open the site on the phone or computer you already have.</p>
            <button class="btn btn-lg" type="button" data-lp="signup">Register your facility ${icon('arrowRight')}</button>
          </div>
          <ol class="lp-blister" data-reveal>
            <li><span class="lp-pocket">1</span><div><h3>Register your facility</h3><p>Facility details and your admin login. Your ${trialDays}-day free trial starts straight away.</p></div></li>
            <li><span class="lp-pocket">2</span><div><h3>Add your stock</h3><p>What's on your shelves, with batch, expiry and prices. Add staff from the Team page.</p></div></li>
            <li><span class="lp-pocket">3</span><div><h3>Start selling</h3><p>Dispense, print receipts and follow sales, profit and expiry on any of your devices.</p></div></li>
          </ol>
        </div>
      </section>

      <!-- PRICING (receipts) -->
      <section class="lp-section" id="lpPricing">
        <div class="lp-container">
          <div class="lp-head" data-reveal>
            <span class="lp-eyebrow">Pricing</span>
            <h2>Simple, honest pricing</h2>
            <p>Every feature in every package. Try it all free for ${trialDays} days, then pick the size that fits.</p>
          </div>
          <div class="lp-prices">
            ${['starter','standard'].map(k=>{
              const p = PACKAGES[k], best = k === 'standard';
              return `
              <article class="lp-receipt${best ? ' best' : ''}" data-reveal>
                ${best ? '<span class="lp-badge">Most popular</span>' : ''}
                <header>
                  <h3>${p.label}</h3>
                  <p>${best ? 'For busy facilities with a team' : 'For a drug shop or a single counter'}</p>
                </header>
                <div class="lp-rc-lines">
                  <div><span>Setup, one time</span><span>${fmt(p.setupFee)}</span></div>
                  <div><span>First 30 days</span><span>Included</span></div>
                  <div><span>Phones / computers</span><span>Up to ${p.devices}</span></div>
                  <div class="lp-rc-total"><span>Then monthly</span><span>${fmt(MONTHLY_FEE)}</span></div>
                </div>
                <ul>
                  <li>${icon('check')} Stock, sales, expiry and finances</li>
                  <li>${icon('check')} Admin and staff logins</li>
                  <li>${icon('check')} Offline use, sync and backups</li>
                  <li>${icon('check')} Support by phone, WhatsApp and email</li>
                </ul>
                <button class="btn ${best ? 'lp-btn-accent' : 'secondary'} btn-block" type="button" data-lp="signup">Start free trial</button>
                <span class="lp-rc-foot">Pay by Mobile Money · switched on from our side</span>
              </article>`;
            }).join('')}
          </div>
        </div>
      </section>

      <!-- SUPPORT + FAQ -->
      <section class="lp-section lp-tint" id="lpSupport">
        <div class="lp-container lp-help">
          <div data-reveal>
            <span class="lp-eyebrow">Support</span>
            <h2>Talk to a real person</h2>
            <p class="lp-help-lead">Setting up, paying or training your staff — call, WhatsApp or email us.</p>
            ${supportContactsHtml()}
          </div>
          <div id="lpFaq" data-reveal>
            <span class="lp-eyebrow">Questions</span>
            <h2>Frequently asked</h2>
            <div class="lp-faq">
              ${LANDING_FAQ.map(([q, a])=>`<details><summary>${q}<span class="lp-faq-x" aria-hidden="true"></span></summary><p>${typeof a === 'function' ? a() : a}</p></details>`).join('')}
            </div>
          </div>
        </div>
      </section>

      <!-- CLOSING -->
      <section class="lp-final">
        <div class="lp-container">
          <div class="lp-final-inner" data-reveal>
            <span class="lp-kicker"><i></i>${trialDays} days free · every feature</span>
            <h2>Close the paper book for good.</h2>
            <p>Register today and run tomorrow's counter from your phone.</p>
            <div class="lp-cta">
              <button class="btn btn-lg lp-btn-accent" type="button" data-lp="signup">Register your facility ${icon('arrowRight')}</button>
              <button class="btn btn-lg lp-btn-glass" type="button" data-lp="login">${loginLabel}</button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="lp-footer">
      <div class="lp-container lp-footer-grid">
        <div class="lp-footer-brand">
          <img src="${RHB_LOGO}" alt="">
          <div><strong>Reality Health Bridge</strong><span>The stock, sales and price book for pharmacies, drug shops and clinics.</span></div>
        </div>
        <div>
          <h4>Product</h4>
          <a href="#lpFeatures">Features</a><a href="#lpPricing">Pricing</a><a href="#lpFaq">Questions</a>
        </div>
        <div>
          <h4>Get started</h4>
          <a role="button" tabindex="0" data-lp="signup">Register your facility</a><a role="button" tabindex="0" data-lp="login">Log in</a>
        </div>
        <div>
          <h4>Contact</h4>
          ${supportContacts().slice(0, 3).map(c=>`<div class="lp-footer-contact"><strong>${esc(c.name)}</strong>${c.phone ? `<a href="${esc(telHref(c.phone))}">${esc(c.phone)}</a>` : ''}${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</div>`).join('')}
        </div>
      </div>
      <div class="lp-container lp-footer-bottom">
        <span>© ${year} REALITY HEALTH SYSTEM. All rights reserved.</span>
        <span>Version ${esc(RHB_APP_VERSION)}</span>
      </div>
    </footer>
  </div>`;

  wireLanding(app);
}

function wireLanding(app){
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const menu = document.getElementById('lpMenu'), menuBtn = document.getElementById('lpMenuBtn');
  const setMenu = open=>{ menu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); document.getElementById('lpNav').classList.toggle('menu-open', open); };
  menuBtn.onclick = ()=> setMenu(menu.hidden);

  app.querySelectorAll('[data-lp]').forEach(el=>{
    const go = ()=>{
      const to = el.dataset.lp;
      authMode = to === 'signup' ? 'signup' : (STATE.accounts.length ? 'login' : 'join');
      renderAuth();
      window.scrollTo(0, 0);
    };
    el.onclick = go;
    el.onkeydown = (e)=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } };
  });
  // Section links scroll smoothly without changing the address bar.
  app.querySelectorAll('a[href^="#lp"]').forEach(a=>{
    a.onclick = (e)=>{
      const t = document.getElementById(a.getAttribute('href').slice(1));
      if(!t) return;
      e.preventDefault(); setMenu(false);
      t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block:'start' });
    };
  });

  // Top bar: see-through over the dark hero, solid once the page scrolls.
  const nav = document.getElementById('lpNav');
  const onScroll = ()=>{
    if(!document.body.contains(nav)){ window.removeEventListener('scroll', onScroll); return; }
    nav.classList.toggle('is-solid', window.scrollY > 24);
  };
  window.addEventListener('scroll', onScroll, { passive:true }); onScroll();

  // Sections fade up as they come into view.
  const items = app.querySelectorAll('[data-reveal]');
  if(reduce || !('IntersectionObserver' in window)){ items.forEach(el=> el.classList.add('is-in')); return; }
  app.querySelector('.lp').classList.add('lp-anim');
  const io = new IntersectionObserver(entries=>{
    entries.forEach(en=>{ if(en.isIntersecting){ en.target.classList.add('is-in'); io.unobserve(en.target); } });
  }, { rootMargin:'0px 0px -8% 0px', threshold:.08 });
  items.forEach(el=> io.observe(el));
}

// Hero picture: a phone on the Sell screen, the receipt it printed and a batch label. Decorative.
function landingHeroArt(){
  const cart = [['Amoxicillin 500mg', 'Caps · AMX-2311', '2 × 6,000', '12,000'], ['Coartem 20/120', 'Tabs · CT-0924', '1 × 9,500', '9,500'], ['ORS sachet', 'Sachet · OR-77', '4 × 500', '2,000']];
  return `
  <div class="lp-art" aria-hidden="true">
    <div class="lp-art-receipt">
      <strong>YOUR FACILITY</strong>
      <span>Receipt 26-11-A-0142</span>
      <span>Patient no. P-00318</span>
      <hr>
      ${cart.map(c=>`<div><span>${c[0]}</span><span>${c[3]}</span></div>`).join('')}
      <hr>
      <div class="ar-total"><span>TOTAL</span><span>23,500</span></div>
      <div><span>Paid · Mobile Money</span><span>23,500</span></div>
      <p>Thank you · get well soon</p>
    </div>
    <div class="lp-phone">
      <div class="lp-phone-notch"></div>
      <div class="lp-phone-screen">
        <div class="ph-top"><span>Sell / Dispense</span><em><i></i>Synced</em></div>
        <div class="ph-search">${icon('search')}<span>Search drug or scan…</span></div>
        <div class="ph-cart">
          ${cart.map(c=>`<div class="ph-line"><div><strong>${c[0]}</strong><small>${c[1]}</small></div><div class="ph-amt"><small>${c[2]}</small><strong>${c[3]}</strong></div></div>`).join('')}
        </div>
        <div class="ph-sum"><span>Total</span><strong>UGX 23,500</strong></div>
        <div class="ph-btn">${icon('checkCircle')} Complete sale</div>
        <div class="ph-tabs"><i class="on"></i><i></i><i></i><i></i></div>
      </div>
    </div>
    <div class="lp-art-label"><span>BATCH</span><strong>AMX-2311</strong><span>EXP</span><strong>03 / 2027</strong></div>
    <div class="lp-art-chip">${icon('checkCircle')}<span><strong>Sale saved</strong>FEFO batch used</span></div>
  </div>`;
}
