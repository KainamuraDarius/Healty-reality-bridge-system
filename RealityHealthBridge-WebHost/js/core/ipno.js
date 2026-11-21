// IPNO (patient number): YY-MM-D-#### where D is this device's code (A, B, C... given by the
// server), so two devices working offline never create the same number. The sequence restarts
// each month. Before the device has a code (never connected), the old YY-MM-#### form is used.
function thisDeviceCode(){
  const lic = STATE.settings.license;
  const d = lic && (lic.devices || []).find(x=>x.id===CURRENT_DEVICE_ID);
  return d && d.code ? d.code : '';
}
function formatIpno(period, seq){
  const code = thisDeviceCode();
  return `${period}-${code ? code + '-' : ''}${String(seq).padStart(4,'0')}`;
}
function ipnoPeriod(d = new Date()){
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${yy}-${mm}`;
}
function peekNextIpno(){
  const period = ipnoPeriod();
  const seq = ((STATE.settings.ipnoCounters||{})[period] || 0) + 1;
  return formatIpno(period, seq);
}
async function takeNextIpno(){
  const period = ipnoPeriod();
  if(!STATE.settings.ipnoCounters) STATE.settings.ipnoCounters = {};
  const seq = (STATE.settings.ipnoCounters[period] || 0) + 1;
  STATE.settings.ipnoCounters[period] = seq;
  await saveSettings();
  return formatIpno(period, seq);
}
