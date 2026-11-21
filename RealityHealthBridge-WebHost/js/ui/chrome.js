// Shared page chrome: theme toggle, install button, and the split layout used by
// every screen shown outside the main app (login, facility setup, lock screens).

function themeToggleBtn(){
  return `<button type="button" class="icon-btn theme-toggle" data-action="toggle-theme" title="Light / dark mode" aria-label="Switch between light and dark mode">${icon('moon')}${icon('sun')}</button>`;
}
function installBtn(){
  return `<button type="button" class="btn secondary btn-sm" data-action="install">${icon('download')}<span>Install app</span></button>`;
}

const AUTH_FEATURES = [
  ['package', 'Stock, batches & expiry', 'Every delivery recorded with batch number and expiry — ready for NDA inspection.'],
  ['pill', 'Fast dispensing', 'First-expiry-first-out sales with printed receipts and patient numbers.'],
  ['barChart', 'Clear finances', 'Daily, weekly and monthly income, spending and profit at a glance.']
];

// Wraps a card in the two-column auth layout (brand panel on wide screens).
function authLayout(cardHtml, opts = {}){
  return `
    <div class="corner-actions">${opts.home ? `<button type="button" class="btn secondary btn-sm corner-home" data-action="go-home" title="About Reality Health Bridge">${icon('home')}<span>Home</span></button>` : ''}${installBtn()}${themeToggleBtn()}</div>
    <div class="auth-wrap">
      <aside class="auth-aside" aria-hidden="true">
        <div class="auth-aside-brand">
          <img src="${RHB_LOGO}" alt="">
          <div><strong>Reality Health Bridge</strong><span>Stock · Sales · Price book</span></div>
        </div>
        <div>
          <span class="auth-kicker"><i></i>For pharmacies, drug shops &amp; clinics</span>
          <h2>Every batch tracked.<br><span>Every shilling</span> accounted for.</h2>
          <ul class="auth-features">
            ${AUTH_FEATURES.map(([ic, t, d])=>`<li><span class="feat-ic">${icon(ic)}</span><span><strong>${t}</strong>${d}</span></li>`).join('')}
          </ul>
        </div>
        <div class="auth-receipt">
          <div><span>Receipt</span><span>26-11-A-0142</span></div>
          <div><span>Amoxicillin 500mg × 2</span><span>12,000</span></div>
          <div><span>ORS sachet × 4</span><span>2,000</span></div>
          <div class="ar-total"><span>TOTAL</span><span>UGX 14,000</span></div>
        </div>
        <div class="auth-aside-foot">${supportLineText()}</div>
      </aside>
      <main class="auth-main">
        <div class="auth-card${opts.wide ? ' wide' : ''}">
          <div class="mobile-brand">
            <img src="${RHB_LOGO}" alt="">
            <div><strong>REALITY HEALTH BRIDGE</strong><span>Health facility stock book</span></div>
          </div>
          ${cardHtml}
        </div>
      </main>
    </div>
  `;
}
