// Starts an MTN MoMo "request to pay": MTN prompts the payer's phone for their PIN.
// Returns a referenceId that the app then checks with momo-status.
const crypto = require('crypto');
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

function baseUrl(env) {
  return env === 'production' ? 'https://momodeveloper.mtn.com' : 'https://sandbox.momodeveloper.mtn.com';
}
async function getAccessToken(env, subscriptionKey) {
  const apiUser = process.env.MOMO_API_USER, apiKey = process.env.MOMO_API_KEY;
  if (!apiUser || !apiKey) throw new Error('Online payment is not set up yet.');
  const basic = Buffer.from(`${apiUser}:${apiKey}`).toString('base64');
  const res = await fetch(`${baseUrl(env)}/collection/token/`, {
    method: 'POST', headers: { 'Authorization': `Basic ${basic}`, 'Ocp-Apim-Subscription-Key': subscriptionKey }
  });
  if (!res.ok) throw new Error(`Could not authorise with MTN (HTTP ${res.status}).`);
  return (await res.json()).access_token;
}

exports.handler = async function (event) {
  const headers = { ...CORS, 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
  try {
    const env = process.env.MOMO_ENV || 'sandbox';
    const subscriptionKey = process.env.MOMO_SUBSCRIPTION_KEY;
    if (!subscriptionKey) throw new Error('Online payment is not set up yet.');
    const { phone, amount, note } = JSON.parse(event.body || '{}');
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 10 && digits.startsWith('0')) digits = '256' + digits.slice(1); // 07XX... -> 2567XX... (international format MTN expects)
    const value = Number(amount);
    if (digits.length < 9 || !(value > 0)) { const e = new Error('A valid phone number and amount are required.'); e.status = 400; throw e; }

    const token = await getAccessToken(env, subscriptionKey);
    const referenceId = crypto.randomUUID();
    const res = await fetch(`${baseUrl(env)}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`, 'X-Reference-Id': referenceId, 'X-Target-Environment': env,
        'Ocp-Apim-Subscription-Key': subscriptionKey, 'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: String(value),
        currency: env === 'production' ? 'UGX' : 'EUR', // MTN's sandbox only accepts EUR
        externalId: referenceId,
        payer: { partyIdType: 'MSISDN', partyId: digits },
        payerMessage: note || 'Reality Health Bridge', payeeNote: note || 'Reality Health Bridge'
      })
    });
    if (res.status !== 202) throw new Error(`MTN did not accept the request (HTTP ${res.status}).`);
    return { statusCode: 200, headers, body: JSON.stringify({ referenceId }) };
  } catch (err) {
    return { statusCode: err.status || 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
