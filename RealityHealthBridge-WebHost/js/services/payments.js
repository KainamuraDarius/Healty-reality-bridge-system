// Online subscription payments (MTN Mobile Money / Airtel Money through Nylon Pay).
// The app only ASKS the server to start a payment and then asks how it is going. The server sets
// the price, talks to Nylon Pay, and renews the licence once Nylon Pay confirms the money arrived
// (api/nylonpay.php). The phone never grants itself a licence.
const PAY_PENDING_KEY = 'rhb:pendingPayment';   // a payment still waiting, so it can be followed up after a reload

async function startOnlinePayment(kind, packageKey, phone){
  if(!navigator.onLine) throw new ApiError(0, 'offline', 'Paying needs internet. Connect and try again.');
  const token = await metaGet('apiToken');
  if(!token) throw new ApiError(0, 'not_connected', 'This device is not connected to the server yet. Open System → Devices & sync first.');
  const res = await apiPost('pay-start.php', { kind, package:packageKey, phone,
    act_by:(session && session.uid) || '', act_key:(session && session.ak) || '' }, token);
  localStorage.setItem(PAY_PENDING_KEY, JSON.stringify({ ref:res.payment.reference, at:Date.now(), facility:FACILITY_ID }));
  return res.payment;
}
async function checkOnlinePayment(ref){
  const token = await metaGet('apiToken');
  const res = await apiPost('pay-status.php', { reference:ref }, token);
  if(['successful','failed','cancelled'].includes(res.payment.status)) localStorage.removeItem(PAY_PENDING_KEY);
  return res.payment;
}
function pendingPaymentRef(){
  try{
    const p = JSON.parse(localStorage.getItem(PAY_PENDING_KEY) || 'null');
    if(!p || p.facility !== FACILITY_ID || Date.now() - p.at > 24*3600*1000){ localStorage.removeItem(PAY_PENDING_KEY); return null; }
    return p.ref;
  }catch(e){ return null; }
}
// The payment succeeded on the server: fetch the new licence now instead of waiting for the next sync.
async function receivePaidLicence(){
  await syncNow({ force:true });
  await buildState();
}
