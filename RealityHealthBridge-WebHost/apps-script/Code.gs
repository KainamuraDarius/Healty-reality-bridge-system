/**
 * REALITY HEALTH BRIDGE - registration email service (Google Apps Script)
 *
 * Every time a NEW facility profile is created in the app, the app sends the facility's details and
 * its secret code here, and this script emails them straight to OWNER_EMAIL.
 * Deploy as a Web app: Execute as "Me", Who has access "Anyone".
 */
const OWNER_EMAIL = 'realityhealthsystem10@gmail.com';
const MAX_PER_HOUR = 40; // protection against someone spamming the public web-app link

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const d = JSON.parse(e.postData.contents);
    if (d.action === 'facility_registered') return out_(notify_(d));
    if (d.action === 'portal_registered') return out_(portal_(d));
    return out_({ ok: false, error: 'Unknown request.' });
  } catch (err) {
    return out_({ ok: false, error: 'Request failed.' });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function doGet() {
  return out_({ ok: true, service: 'Reality Health Bridge registration email service' });
}

function notify_(d) {
  const id = clean_(d.facilityId, 80);
  const name = clean_(d.facilityName, 140);
  const email = clean_(d.email, 160).toLowerCase();
  const code = clean_(d.secretCode, 40);
  const fromPortal = clean_(d.source, 20) === 'portal';
  if (!id || !name || (!code && !fromPortal)) return { ok: false, error: 'Missing details.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'A valid facility email is required.' };

  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('sent:' + id)) return { ok: true, duplicate: true }; // never email the same facility twice

  const cache = CacheService.getScriptCache();
  const used = Number(cache.get('hourCount') || 0);
  if (used >= MAX_PER_HOUR) return { ok: false, error: 'Busy. Try again later.' };

  const rows = [
    ['Facility', name],
    ['Location', clean_(d.location, 160) || '-'],
    ['Contact (phone)', clean_(d.contact, 60) || '-'],
    ['Contact person', clean_(d.contactPerson, 120) || '-'],
    ['Facility type', clean_(d.facilityType, 60) || '-'],
    ['Registered on', fromPortal ? 'Portal' : 'RHB app'],
    ['Facility email', email],
    ['Free trial ends', clean_(d.trialEnds, 20) || '-'],
    ['Facility ID', id],
    ['Registered', clean_(d.registeredAt, 40) || new Date().toISOString()]
  ];
  const text = 'A new facility profile was registered on Reality Health Bridge.\n\n' +
    (code ? 'SECRET CODE: ' + code + '\n\n' : '') + rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\n';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1A1A1A">' +
    '<div style="background:#0B2A6B;color:#fff;padding:16px 20px;font-size:20px;font-weight:bold">REALITY HEALTH BRIDGE</div>' +
    '<p style="font-size:17px;font-weight:bold">New facility profile registered</p>' +
    (code ? '<div style="background:#FFF4DC;border:2px solid #F5A524;border-radius:8px;padding:14px;text-align:center">' +
    '<div style="font-size:14px;font-weight:bold;color:#7A4B00">SECRET CODE</div>' +
    '<div style="font-size:34px;font-weight:bold;letter-spacing:4px;color:#0B2A6B">' + esc_(code) + '</div></div>' : '') +
    '<table style="margin-top:14px;font-size:16px;border-collapse:collapse">' +
    rows.map(function (r) { return '<tr><td style="padding:4px 16px 4px 0;font-weight:bold;color:#0B2A6B">' + r[0] + '</td><td>' + esc_(r[1]) + '</td></tr>'; }).join('') +
    '</table></div>';

  MailApp.sendEmail({
    to: OWNER_EMAIL,
    replyTo: email,
    name: 'Reality Health Bridge',
    subject: 'New facility registered' + (fromPortal ? ' on the portal' : '') + ': ' + name + (code ? ' | Secret code ' + code : ''),
    body: text,
    htmlBody: html
  });
  props.setProperty('sent:' + id, new Date().toISOString());
  cache.put('hourCount', String(used + 1), 3600);
  return { ok: true };
}


// A facility registered on the RHB web portal (not inside the app)
function portal_(d) {
  const email = clean_(d.email, 160).toLowerCase();
  const name = clean_(d.facilityName, 140);
  const code = clean_(d.secretCode, 40);
  if (!name || !code) return { ok: false, error: 'Missing details.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'A valid facility email is required.' };
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('portal:' + email)) return { ok: true, duplicate: true };
  const cache = CacheService.getScriptCache();
  const used = Number(cache.get('hourCount') || 0);
  if (used >= MAX_PER_HOUR) return { ok: false, error: 'Busy. Try again later.' };
  const rows = [['Facility', name], ['Contact person', clean_(d.fullName, 120) || '-'], ['Phone', clean_(d.phone, 60) || '-'],
    ['Facility email', email], ['District / location', clean_(d.location, 160) || '-'], ['Facility type', clean_(d.facilityType, 60) || '-'],
    ['Registered', clean_(d.registeredAt, 40) || new Date().toISOString()]];
  MailApp.sendEmail({
    to: OWNER_EMAIL, replyTo: email, name: 'Reality Health Bridge',
    subject: 'New portal registration: ' + name + ' | Secret code ' + code,
    body: 'A new facility registered on the Reality Health Bridge portal.\n\nSECRET CODE: ' + code + '\n\n' +
          rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\n\nActivate the account in Supabase (profiles table) after approval.\n',
    htmlBody: html_('New portal registration', code, rows)
  });
  props.setProperty('portal:' + email, new Date().toISOString());
  cache.put('hourCount', String(used + 1), 3600);
  return { ok: true };
}

function html_(title, code, rows) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1A1A1A">' +
    '<div style="background:#0B2A6B;color:#fff;padding:16px 20px;font-size:20px;font-weight:bold">REALITY HEALTH BRIDGE</div>' +
    '<p style="font-size:17px;font-weight:bold">' + esc_(title) + '</p>' +
    '<div style="background:#FFF4DC;border:2px solid #F5A524;border-radius:8px;padding:14px;text-align:center">' +
    '<div style="font-size:14px;font-weight:bold;color:#7A4B00">SECRET CODE</div>' +
    '<div style="font-size:34px;font-weight:bold;letter-spacing:4px;color:#0B2A6B">' + esc_(code) + '</div></div>' +
    '<table style="margin-top:14px;font-size:16px;border-collapse:collapse">' +
    rows.map(function (r) { return '<tr><td style="padding:4px 16px 4px 0;font-weight:bold;color:#0B2A6B">' + r[0] + '</td><td>' + esc_(r[1]) + '</td></tr>'; }).join('') +
    '</table></div>';
}

/** Run this once from the editor (Run > testEmail) to grant permission and receive a sample email. */
function testEmail() {
  MailApp.sendEmail({ to: OWNER_EMAIL, name: 'Reality Health Bridge', subject: 'Test: registration email service is working',
    body: 'If you can read this, new facility registrations will reach this inbox.' });
}

function esc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function clean_(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
