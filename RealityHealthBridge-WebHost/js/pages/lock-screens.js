// Subscription lock, device-limit lock and new-device screens.

function lockLogoutBtn(id){
  return `<button class="btn ghost w-full mt-4" id="${id}" type="button">${icon('logout')} Log out</button>`;
}

function renderLockScreen(lic){
  const isAdmin = can('subscription'); // super admin, or an admin ticked "Subscription & payments"
  return authLayout(`
    <span class="eyebrow">${lic.trial ? 'Free trial ended' : 'Subscription expired'}</span>
    <h1>Choose a package to continue</h1>
    ${alertBox(lic.trial
      ? `The free trial for <strong>${esc(lic.facility)}</strong> ended on ${lic.expiryDate}. Your data is safe and waiting.`
      : `The subscription for <strong>${esc(lic.facility)}</strong> expired on ${lic.expiryDate} and the ${GRACE_DAYS}-day grace period has passed. Renew to unlock — your data is safe and waiting.`, 'warning', 'lock')}
    ${isAdmin ? packagesAndPayHtml('lock', { compact:true }) : `
      <p class="muted small">Please ask your facility's super admin to renew the subscription. Only the super admin, or an admin they allow, can pay or enter an activation code.</p>
    `}
    <div class="auth-foot"><p>Need help? Contact us:</p>${supportContactsHtml({ compact:true })}</div>
    ${lockLogoutBtn('lockLogoutBtn')}
  `, { wide: true });
}
function attachLockScreenHandlers(lic){
  document.getElementById('lockLogoutBtn').onclick = ()=>{
    clearSession(); session = null; currentTab='dashboard'; authMode='login'; renderAuth();
  };
  if(can('subscription')) wirePackagesAndPay('lock', ()=> render());
}

function renderDeviceLockScreen(devStat){
  const isAdmin = can('devices'); // super admin, or an admin ticked "Devices"
  const lic = STATE.settings.license;
  const devices = (lic && lic.devices) || [];
  return authLayout(`
    <span class="eyebrow">Device limit reached</span>
    <h1>This device isn't activated</h1>
    ${alertBox(`This facility's package allows up to <strong>${lic.maxDevices || DEFAULT_MAX_DEVICES} devices</strong>, and all of them are already in use.`, 'warning', 'smartphone')}
    ${isAdmin ? `
      <p class="muted small">Remove a device below to free a slot for this one. The removed device will stop working until it is re-added.</p>
      <div class="table-wrap" id="deviceLockList">
        <table><tbody>
          ${devices.map(d=>`
            <tr>
              <td><span class="cell-strong">${esc(d.label)}</span><span class="cell-sub">Added ${d.addedDate}</span></td>
              <td class="actions"><button class="btn small danger-soft" type="button" data-remove-device="${esc(d.id)}">${icon('trash')} Remove</button></td>
            </tr>
          `).join('')}
        </tbody></table>
      </div>
    ` : `
      <p class="muted small">Please contact your facility's super admin — they can remove an old device to free a slot for this one.</p>
    `}
    <div class="auth-foot"><p>Need help? Contact us:</p>${supportContactsHtml({ compact:true })}</div>
    ${lockLogoutBtn('deviceLockLogoutBtn')}
  `);
}
function attachDeviceLockScreenHandlers(){
  document.getElementById('deviceLockLogoutBtn').onclick = ()=>{
    clearSession(); session = null; currentTab='dashboard'; authMode='login'; renderAuth();
  };
  document.querySelectorAll('[data-remove-device]').forEach(btn=>{
    btn.onclick = async ()=>{
      await removeDevice(btn.getAttribute('data-remove-device'));
      toast('Device removed. Reloading…', 'success');
      await render();
    };
  });
}

function renderDeviceNeedsAdminScreen(){
  return authLayout(`
    <span class="eyebrow">New device</span>
    <h1>Admin activation needed</h1>
    ${alertBox(`This device hasn't been activated for this facility yet. An <strong>Admin</strong> must log in here first — after that, Staff accounts can use this device normally.`, 'info', 'shield')}
    <p class="muted small">Log out and ask your facility admin to log in on this device, or switch accounts if you're the admin.</p>
    ${lockLogoutBtn('deviceNeedsAdminLogoutBtn')}
  `);
}
function attachDeviceNeedsAdminScreenHandlers(){
  document.getElementById('deviceNeedsAdminLogoutBtn').onclick = ()=>{
    clearSession(); session = null; currentTab='dashboard'; authMode='login'; renderAuth();
  };
}

// Pharmacy suspended by REALITY HEALTH SYSTEM (admin site). Data stays on the device; the sync keeps
// running so the moment RHS lifts the suspension, the app opens again.
function renderSuspendedScreen(susp){
  const idn = STATE.settings.identity || {};
  return authLayout(`
    <span class="eyebrow">Account suspended</span>
    <h1>${esc(idn.name || 'This facility')} is suspended</h1>
    ${alertBox(`REALITY HEALTH SYSTEM has suspended this facility's account${susp.reason ? `: <strong>${esc(susp.reason)}</strong>` : '.'} Your records are safe on this device.`, 'danger', 'lock')}
    <p class="muted">Please contact REALITY HEALTH SYSTEM to restore access. Keep this device connected to the internet — it opens again automatically once the suspension is lifted.</p>
    <div class="auth-foot"><p>Need help? Contact us:</p>${supportContactsHtml({ compact:true })}</div>
    <button class="btn secondary w-full mt-4" id="suspendedCheckBtn" type="button">${icon('refresh')} Check again</button>
    ${lockLogoutBtn('suspendedLogoutBtn')}
  `);
}
function attachSuspendedScreenHandlers(){
  document.getElementById('suspendedCheckBtn').onclick = async ()=>{ await syncNow(); render(); };
  document.getElementById('suspendedLogoutBtn').onclick = ()=>{
    clearSession(); session = null; currentTab = 'dashboard'; authMode = 'login'; renderAuth();
  };
}
