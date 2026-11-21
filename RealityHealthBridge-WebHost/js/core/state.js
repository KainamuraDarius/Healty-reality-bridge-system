// Global app state and app-wide constants.
// ---------- App State ----------
// Built from the on-device database by js/core/storage.js; saved back with save*().
let STATE = {
  drugs: [],     // {id, name, form, unit, packSize, reorderLevel}
  batches: [],   // {id, drugId, batchNo, expiry, costPrice, sellPrice, qtyReceived, qtyRemaining*, dateReceived, supplier}
  sales: [],     // {id, date, items:[{drugId,batchId,qty,unitPrice,cost}], total, buyer, patientNo, buyerContact,
                 //  diagnosis, additionalDetails, amountPaid*, paymentHistory:[{id,date,amount,recordedBy}], soldBy, itemsRev}
  accounts: [],  // {id, username, pwSalt, pwVerifier, role, primary, fullName, contact, email, cadre, position} — role 'owner' (Admin) or 'staff'.
                //   cadre = what they trained as (e.g. Nurse); position = their job here (e.g. Administrator).
                 //  Setting `password` on an account makes the next saveAccounts() scramble it.
  settings: {}   // identity + license + trialUsed (shared by the pharmacy) and this device's own settings
};               // * calculated, never stored

let currentTab = 'dashboard';
let saleCart = [];
let session = null;          // {username, role} — current logged-in user, from sessionStorage
let authMode = 'login';      // 'welcome' | 'home' (public home page) | 'login' | 'signup' | 'join' — which screen the auth page shows
// Renewal codes for this app are issued by REALITY HEALTH SYSTEM after payment.
// Changing this value invalidates every code already issued to clients.
const LICENSE_SECRET = 'RHB-ISABIRYE-2026';
