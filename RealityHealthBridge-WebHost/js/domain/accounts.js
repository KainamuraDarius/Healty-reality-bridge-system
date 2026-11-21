// Accounts: lookup and team rules.
//
// Who can do what:
//  - The SUPER ADMIN is the person who registered the facility ("main admin" / is_primary in code).
//    They see and do everything, own the facility profile, stamp and certificates, and add up to
//    3 more ADMINS and up to 7 STAFF.
//  - Other admins get only what the super admin ticks for them (PERMISSIONS below). Everything
//    not listed there (selling, stock in, inventory, sales log, expiry) is open to every admin.
//  - Only the super admin adds / removes admins and changes their ticks. Nobody can delete the
//    super admin. api/sync.php enforces the same rules on the server.
//  - Access (Admin / Staff) is separate from each person's position and cadre.
//  - Staff never create accounts; their admin creates the login for them.
// Sensitive areas the super admin can open to another admin, one tick each. Keys must match
// api/lib.php ADMIN_PERMISSIONS.
const PERMISSIONS = [
  ['finance',      'Finance & profit figures', 'Finance page, profit, cost of goods and stock value'],
  ['reports',      'Reports',                  'Print, save or download sales, money and stock reports'],
  ['records',      'Edit / delete records',    'Change or delete past sales and stock entries'],
  ['staff',        'Manage staff',             'Add or remove staff and reset staff passwords'],
  ['subscription', 'Subscription & payments',  'Choose a plan, pay, enter activation codes'],
  ['backup',       'Backups & restore',        'Download a full backup (all records) or restore one'],
  ['devices',      'Devices',                  'See and remove the facility\'s phones and computers'],
];
const PERMISSION_KEYS = PERMISSIONS.map(p=>p[0]);
const permsOf = acc => String((acc && acc.permissions) || '').split(',').filter(k=>PERMISSION_KEYS.includes(k));

// May the logged-in person use `perm`? Super admin: always. Other admins: if ticked. Staff: never.
function can(perm){
  const me = currentAccount();
  if(!me || me.role !== 'owner') return false;
  if(isMainAdmin(me)) return true;
  return permsOf(me).includes(perm);
}
const isSuperAdmin = () => isMainAdmin(currentAccount());

function findAccount(username){
  const u = username.trim().toLowerCase();
  return STATE.accounts.find(a=>a.username.toLowerCase()===u);
}

// The main admin: flagged `primary` at registration; older data falls back to the first admin.
function mainAdmin(){
  return STATE.accounts.find(a=>a.primary && a.role==='owner') || STATE.accounts.find(a=>a.role==='owner') || null;
}
function isMainAdmin(acc){
  const m = mainAdmin();
  return !!(acc && m && acc.username === m.username);
}
const MAX_PARTNER_ADMINS = () => MAX_ADMIN_ACCOUNTS - 1;
const partnerAdmins = () => STATE.accounts.filter(a=>a.role==='owner' && !isMainAdmin(a));
const staffAccounts = () => STATE.accounts.filter(a=>a.role==='staff');

// Permission checks for the logged-in user (session) acting on another account.
function currentAccount(){ return session ? findAccount(session.username) : null; }
function canAddRole(role){
  const me = currentAccount();
  if(!me || me.role!=='owner') return false;
  if(role==='owner') return isMainAdmin(me) && partnerAdmins().length < MAX_PARTNER_ADMINS();
  return can('staff') && staffAccounts().length < MAX_STAFF_ACCOUNTS;
}
function canManageAccount(target){
  const me = currentAccount();
  if(!me || me.role!=='owner' || !target) return false;
  if(target.username === me.username) return false;   // own password: use "My password" in System
  if(isMainAdmin(target)) return false;                  // nobody manages the main admin
  if(target.role==='owner') return isMainAdmin(me);      // only the super admin manages other admins
  return can('staff');                                   // staff: super admin, or an admin ticked "Manage staff"
}
