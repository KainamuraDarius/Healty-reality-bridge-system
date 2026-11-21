// Team page (admins only): the super admin, other admins and staff logins for this facility.
// Only the super admin adds / removes admins and ticks what each one may see (PERMISSIONS).
// Three separate things are recorded for each person:
//   access   - Admin or Staff (what the app lets them do)
//   position - their job here (e.g. Administrator, Dispenser)
//   cadre    - what they trained as (e.g. Nurse, Pharmacist)
// Rules live in js/domain/accounts.js.

function teamMemberRow(a){
  const me = currentAccount();
  const main = isMainAdmin(a);
  const manage = canManageAccount(a);
  const isMe = me && a.username===me.username;
  const badge = main ? '<span class="tag info plain">Super admin</span>'
    : a.role==='owner' ? '<span class="tag sale plain">Admin</span>'
    : '<span class="tag plain">Staff</span>';
  const granted = permsOf(a);
  const access = main ? '<span class="cell-sub">sees everything</span>'
    : a.role==='owner' ? `<span class="perm-chips">${granted.length ? PERMISSIONS.filter(p=>granted.includes(p[0])).map(p=>`<span class="perm-chip">${esc(p[1])}</span>`).join('') : '<span class="cell-sub">basic access only</span>'}</span>` : '';
  return `<tr>
    <td><div class="row" style="flex-wrap:nowrap;"><span class="avatar">${esc(initials(a.fullName||a.username))}</span><div><span class="cell-strong">${esc(a.fullName)||'—'}${isMe?' <span class="tag info plain">you</span>':''}</span><span class="cell-sub">@${esc(a.username)}</span></div></div></td>
    <td>${badge}${access}</td>
    <td>${esc(a.position)||'<span class="subtle">—</span>'}</td>
    <td>${esc(a.cadre)||'<span class="subtle">—</span>'}</td>
    <td>${esc(a.contact)||'—'}${a.email?`<span class="cell-sub">${esc(a.email)}</span>`:''}</td>
    <td class="actions"><div class="row-actions team-actions">
      ${!main && a.role==='owner' && isSuperAdmin() ? `<button class="btn small" type="button" data-perms-account="${esc(a.username)}">${icon('shield')} Permissions</button>` : ''}
      ${manage || isMe ? `<button class="btn small secondary" type="button" data-edit-account="${esc(a.username)}" title="Edit name, position, cadre, phone">${icon('edit')} Edit</button>` : ''}
      ${manage ? `
        <button class="btn small secondary" type="button" data-reset-password="${esc(a.username)}" title="Reset password" aria-label="Reset password of ${esc(a.fullName||a.username)}">${icon('key')}</button>
        <button class="btn small danger-soft" type="button" data-delete-account="${esc(a.username)}" aria-label="Remove ${esc(a.fullName||a.username)}">${icon('trash')}</button>`
      : `<span class="xsmall subtle">${isMe ? 'Password: Settings → My account' : main ? 'Protected' : a.role==='owner' ? 'Super admin only' : 'Needs “Manage staff”'}</span>`}
    </div></td>
  </tr>`;
}

function teamTable(list, emptyTitle, emptyMsg, iconName){
  if(!list.length) return emptyState(emptyTitle, emptyMsg, iconName, true);
  return `<div class="table-wrap"><table>
    <thead><tr><th>Name</th><th>Access</th><th>Position</th><th>Cadre</th><th>Contact</th><th><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${list.map(teamMemberRow).join('')}</tbody>
  </table></div>`;
}

function viewTeam(){
  const me = currentAccount();
  const main = mainAdmin();
  const others = partnerAdmins();
  const staff = staffAccounts();
  const iAmMain = isMainAdmin(me);
  const admins = [main, ...others].filter(Boolean);
  return `
  <div class="page-head">
    <div><h2>Your team</h2><p>Create a login for everyone who works at the facility. Staff don't sign up themselves — you create their account and tell them their username and password.</p></div>
  </div>

  <div class="stats">
    ${statCard('Super admin', esc(main ? (main.fullName || main.username) : '—'), 'shield', '', main && main.position ? `${esc(main.position)} · sees everything` : 'registered the facility · sees everything')}
    ${statCard('Other admins', `${others.length} / ${MAX_PARTNER_ADMINS()}`, 'users', 'violet', 'see what the super admin allows')}
    ${statCard('Staff', `${staff.length} / ${MAX_STAFF_ACCOUNTS}`, 'user', 'success', 'stock, sales & inventory')}
  </div>

  <section class="panel">
    <div class="card-header">
      <h2>${icon('shield')} Admins <span class="hint">super admin + ${others.length} of ${MAX_PARTNER_ADMINS()}</span></h2>
      ${iAmMain ? `<button class="btn small" type="button" data-add-account="owner" ${canAddRole('owner')?'':'disabled'}>${icon('plus')} Add admin</button>` : ''}
    </div>
    <p class="muted small">The <strong>super admin</strong> (who registered the facility) sees and controls everything, including the facility profile. Other admins can sell, record stock and see the team; anything sensitive — finance, reports, editing records, staff, subscription, backups, devices — only if the super admin ticks it under <strong>Permissions</strong>.${iAmMain ? '' : ' Only the super admin can add or remove admins and change permissions.'}</p>
    ${teamTable(admins, 'No admins', '', 'shield')}
  </section>

  <section class="panel">
    <div class="card-header">
      <h2>${icon('user')} Staff <span class="hint">${staff.length} of ${MAX_STAFF_ACCOUNTS}</span></h2>
      ${can('staff') ? `<button class="btn small" type="button" data-add-account="staff" ${canAddRole('staff')?'':'disabled'}>${icon('plus')} Add staff</button>` : ''}
    </div>
    <p class="muted small">Staff can record stock, sell, and view inventory, sales and expiry. They cannot see finance, reports, settings or the team.${can('staff') ? '' : ' Adding or removing staff needs the “Manage staff” permission from the super admin.'}</p>
    ${teamTable(staff, 'No staff yet', 'Add the people who dispense and sell so each person logs in with their own name — every sale then shows who made it.', 'users')}
  </section>
  `;
}

// Position + cadre pickers (type-to-search), shared by the add and edit forms and Register.
function personJobFieldsHtml(prefix, acc = {}){
  return `
    <div class="field"><label for="${prefix}Position">Position at this facility</label>
      ${comboHtml({ id:prefix+'Position', groups:POSITIONS, extra:customAccountValues('position', POSITIONS), value:acc.position||'', placeholder:'e.g. Administrator, Dispenser', required:true })}
      <div class="field-hint">The job they do here.</div></div>
    <div class="field"><label for="${prefix}Cadre">Cadre</label>
      ${comboHtml({ id:prefix+'Cadre', groups:CADRES, aliases:CADRE_ALIASES, extra:customAccountValues('cadre', CADRES), value:acc.cadre||'', placeholder:'e.g. Nurse, Pharmacist', required:true })}
      <div class="field-hint">What they trained as.</div></div>`;
}
function readPersonJobFields(prefix){
  const v = id => (document.getElementById(id).value || '').trim();
  return {
    position: matchListWord(v(prefix+'Position'), POSITIONS, customAccountValues('position', POSITIONS)),
    cadre: matchListWord(v(prefix+'Cadre'), CADRES, customAccountValues('cadre', CADRES))
  };
}

// Create a new Admin/Staff login. `role` is fixed by the button that opened it.
function openAddAccountModal(role){
  if(!canAddRole(role)){
    toast(role==='owner' ? `You can have at most ${MAX_ADMIN_ACCOUNTS} admins (the super admin + 3).` : `You can have at most ${MAX_STAFF_ACCOUNTS} staff accounts.`, 'error');
    return;
  }
  const isAdmin = role==='owner';
  openModal(`
    <h2>${isAdmin ? 'Add admin' : 'Add staff member'}</h2>
    <p>${isAdmin ? 'An admin can sell, record stock and see the team. Tick anything sensitive they may also use — you can change this any time with <strong>Permissions</strong>.' : 'Create a login for a staff member. Tell them their username and password directly.'}</p>
    <div class="auth-error" id="addAccError" role="alert"></div>
    <form id="addAccountForm" novalidate>
      <div class="form-grid cols-2">
        <div class="field span-all"><label for="aaFullName">Full name</label><input type="text" id="aaFullName" required></div>
        <div class="field"><label for="aaContact">Phone</label><input type="tel" id="aaContact" inputmode="tel" required></div>
        <div class="field"><label for="aaEmail">Email <span class="label-opt">(optional)</span></label><input type="email" id="aaEmail"></div>
        ${personJobFieldsHtml('aa')}
        <div class="field span-all"><label for="aaUsername">Username</label><input type="text" id="aaUsername" autocapitalize="none" spellcheck="false" autocomplete="off" required><div class="field-hint">They will type this to log in. At least 3 characters.</div></div>
        ${pwField('Password', 'aaPassword', { required: true, autocomplete: 'new-password', hint: 'At least 4 characters.' })}
        ${pwField('Confirm password', 'aaPassword2', { required: true, autocomplete: 'new-password' })}
      </div>
      ${isAdmin ? `<div class="form-section-title">${icon('shield')} What may this admin use?</div>${permissionTicksHtml([])}` : ''}
      <div class="modal-actions">
        <button class="btn secondary" type="button" id="addAccCancel">Cancel</button>
        <button class="btn" type="submit">${icon('plus')} Create login</button>
      </div>
    </form>
  `, { wide: true });
  wirePasswordToggles(document.getElementById('modalBox'));
  wireCombos(document.getElementById('modalBox'));
  document.getElementById('addAccCancel').onclick = closeModal;
  const err = document.getElementById('addAccError');
  const fail = (m)=>{ err.textContent = m; err.classList.remove('show'); void err.offsetWidth; err.classList.add('show'); };
  document.getElementById('addAccountForm').onsubmit = async (e)=>{
    e.preventDefault();
    const v = (id)=> document.getElementById(id).value.trim();
    const fullName = v('aaFullName'), contact = v('aaContact'), email = v('aaEmail'), username = v('aaUsername');
    const { position, cadre } = readPersonJobFields('aa');
    const password = document.getElementById('aaPassword').value, password2 = document.getElementById('aaPassword2').value;
    if(!fullName || !contact) return fail('Full name and phone are required.');
    if(!position || !cadre) return fail('Choose or type their position and their cadre.');
    if(username.length < 3) return fail('Username should be at least 3 characters.');
    if(/\s/.test(username)) return fail('Username cannot contain spaces.');
    if(findAccount(username)) return fail('That username is already taken.');
    if(password.length < 4) return fail('Password should be at least 4 characters.');
    if(password !== password2) return fail('Passwords do not match.');
    if(!canAddRole(role)) return fail('The limit for this type of account has been reached.');
    const permissions = isAdmin ? readPermissionTicks() : '';
    STATE.accounts.push({ username, password, role, fullName, contact, email, cadre, position, permissions, createdBy: session.username, createdAt: new Date().toISOString() });
    await saveAccounts();
    closeModal();
    openModal(`
      <h2>Login created</h2>
      <p>Give these details to <strong>${esc(fullName)}</strong>. They choose <strong>${isAdmin ? 'Admin' : 'Staff'}</strong> on the login screen.</p>
      <div class="summary">
        <div class="line"><span>Log in as</span><span class="bold">${isAdmin ? 'Admin' : 'Staff'}</span></div>
        <div class="line"><span>Username</span><span class="bold">${esc(username)}</span></div>
        <div class="line"><span>Password</span><span class="bold">the one you just set</span></div>
      </div>
      <div class="modal-actions"><button class="btn" type="button" id="addAccDone">Done</button></div>
    `);
    document.getElementById('addAccDone').onclick = closeModal;
    renderTabContent();
  };
}

// Change someone's name, contacts, position or cadre (not their access or password).
function openEditAccountModal(username){
  const acc = findAccount(username);
  const me = currentAccount();
  if(!acc || !(canManageAccount(acc) || (me && acc.username === me.username))){ toast('You are not allowed to change this person.', 'error'); return; }
  openModal(`
    <h2>Edit details</h2>
    <p>@${esc(acc.username)} · ${isMainAdmin(acc) ? 'Super admin' : acc.role === 'owner' ? 'Admin' : 'Staff'}</p>
    <div class="auth-error" id="editAccError" role="alert"></div>
    <form id="editAccountForm" novalidate>
      <div class="form-grid cols-2">
        <div class="field span-all"><label for="eaFullName">Full name</label><input type="text" id="eaFullName" value="${esc(acc.fullName)}" required></div>
        <div class="field"><label for="eaContact">Phone</label><input type="tel" id="eaContact" inputmode="tel" value="${esc(acc.contact)}" required></div>
        <div class="field"><label for="eaEmail">Email <span class="label-opt">(optional)</span></label><input type="email" id="eaEmail" value="${esc(acc.email)}"></div>
        ${personJobFieldsHtml('ea', acc)}
      </div>
      <div class="modal-actions">
        <button class="btn secondary" type="button" id="editAccCancel">Cancel</button>
        <button class="btn" type="submit">${icon('check')} Save</button>
      </div>
    </form>
  `, { wide: true });
  wireCombos(document.getElementById('modalBox'));
  document.getElementById('editAccCancel').onclick = closeModal;
  const err = document.getElementById('editAccError');
  const fail = (m)=>{ err.textContent = m; err.classList.remove('show'); void err.offsetWidth; err.classList.add('show'); };
  document.getElementById('editAccountForm').onsubmit = async (e)=>{
    e.preventDefault();
    const v = (id)=> document.getElementById(id).value.trim();
    const fullName = v('eaFullName'), contact = v('eaContact'), email = v('eaEmail');
    const { position, cadre } = readPersonJobFields('ea');
    if(!fullName || !contact) return fail('Full name and phone are required.');
    if(!position || !cadre) return fail('Choose or type the position and the cadre.');
    Object.assign(acc, { fullName, contact, email, position, cadre });
    await saveAccounts();
    closeModal();
    toast('Details saved.', 'success');
    renderTabContent();
  };
}

// Tick boxes, one per sensitive area.
function permissionTicksHtml(granted){
  return `<div class="perm-ticks">${PERMISSIONS.map(([k, label, sub])=>`
    <label class="perm-tick"><input type="checkbox" name="perm" value="${k}" ${granted.includes(k)?'checked':''}>
      <span><strong>${esc(label)}</strong><small>${esc(sub)}</small></span></label>`).join('')}</div>`;
}
function readPermissionTicks(){
  return Array.from(document.querySelectorAll('#modalBox input[name="perm"]:checked')).map(i=>i.value).join(',');
}
// Super admin: choose what another admin may use.
function openPermissionsModal(username){
  const acc = findAccount(username);
  if(!acc || !isSuperAdmin() || acc.role !== 'owner' || isMainAdmin(acc)){ toast('Only the super admin can change permissions.', 'error'); return; }
  openModal(`
    <h2>${icon('shield')} Permissions</h2>
    <p>What may <strong>${esc(acc.fullName || acc.username)}</strong> use besides selling, stock in, inventory, sales log and expiry? Untick anything you don't want them to see.</p>
    ${permissionTicksHtml(permsOf(acc))}
    <div class="row mt-2"><button class="btn small ghost" type="button" id="permAll">Tick all</button><button class="btn small ghost" type="button" id="permNone">Untick all</button></div>
    <div class="modal-actions">
      <button class="btn secondary" type="button" id="permCancel">Cancel</button>
      <button class="btn cta" type="button" id="permSave">${icon('check')} Save permissions</button>
    </div>
  `, { wide: true });
  const setAll = v => document.querySelectorAll('#modalBox input[name="perm"]').forEach(i=> i.checked = v);
  document.getElementById('permAll').onclick = ()=> setAll(true);
  document.getElementById('permNone').onclick = ()=> setAll(false);
  document.getElementById('permCancel').onclick = closeModal;
  document.getElementById('permSave').onclick = async ()=>{
    acc.permissions = readPermissionTicks();
    await saveAccounts();
    closeModal();
    toast(`Permissions saved for ${acc.fullName || acc.username}. Their devices update on the next sync.`, 'success');
    renderTabContent();
  };
}

function wireTeam(){
  document.querySelectorAll('[data-perms-account]').forEach(b=>{
    b.onclick = ()=> openPermissionsModal(b.dataset.permsAccount);
  });
  document.querySelectorAll('[data-edit-account]').forEach(b=>{
    b.onclick = ()=> openEditAccountModal(b.dataset.editAccount);
  });
  document.querySelectorAll('[data-add-account]').forEach(b=>{
    b.onclick = ()=> openAddAccountModal(b.dataset.addAccount);
  });
  document.querySelectorAll('[data-delete-account]').forEach(btn=>{
    btn.onclick = ()=>{
      const username = btn.getAttribute('data-delete-account');
      const acc = findAccount(username);
      if(!canManageAccount(acc)){ toast('You are not allowed to remove this account.', 'error'); return; }
      confirmDialog('Remove this login?', `<strong>${esc(acc.fullName||username)}</strong> (@${esc(username)}) will no longer be able to log in. Sales they recorded are kept for your records.`, async ()=>{
        STATE.accounts = STATE.accounts.filter(a=>a.username!==acc.username);
        await saveAccounts();
        toast('Login removed.', 'success');
        renderTabContent();
      }, 'Remove', true);
    };
  });
  document.querySelectorAll('[data-reset-password]').forEach(btn=>{
    btn.onclick = ()=>{
      const username = btn.getAttribute('data-reset-password');
      const target = findAccount(username);
      if(!canManageAccount(target)){ toast('You are not allowed to change this password.', 'error'); return; }
      openModal(`
        <h2>Reset password</h2>
        <p>Set a new password for <strong>@${esc(username)}</strong>. Tell them the new password directly — it is not emailed or texted automatically.</p>
        <form id="resetPwForm">
          ${pwField('New password', 'resetPwInput', { required: true, autocomplete: 'new-password' })}
          ${pwField('Confirm new password', 'resetPwConfirm', { required: true, autocomplete: 'new-password' })}
          <div class="auth-error" id="resetPwError" role="alert"></div>
          <div class="modal-actions"><button class="btn" type="submit">Set new password</button></div>
        </form>
      `);
      wirePasswordToggles(document.getElementById('modalBox'));
      document.getElementById('resetPwForm').onsubmit = async (e)=>{
        e.preventDefault();
        const pw1 = document.getElementById('resetPwInput').value;
        const pw2 = document.getElementById('resetPwConfirm').value;
        const err = document.getElementById('resetPwError');
        if(pw1.length < 4){ err.textContent = 'Password should be at least 4 characters.'; err.classList.add('show'); return; }
        if(pw1 !== pw2){ err.textContent = 'Passwords do not match.'; err.classList.add('show'); return; }
        target.password = pw1;
        await saveAccounts();
        toast(`Password reset for ${username}.`, 'success');
        closeModal();
      };
    };
  });
}
