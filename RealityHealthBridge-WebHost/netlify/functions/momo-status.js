// The app calls this every few seconds after momo-pay to learn whether the payer approved.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

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
  try {
    const env = process.env.MOMO_ENV || 'sandbox';
    const subscriptionKey = process.env.MOMO_SUBSCRIPTION_KEY;
    const referenceId = (event.queryStringParameters || {}).referenceId;
    if (!subscriptionKey) throw new Error('Online payment is not set up yet.');
    if (!/^[0-9a-fA-F-]{36}$/.test(referenceId || '')) throw new Error('A valid referenceId is required.');
    const token = await getAccessToken(env, subscriptionKey);
    const res = await fetch(`${baseUrl(env)}/collection/v1_0/requesttopay/${referenceId}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'X-Target-Environment': env, 'Ocp-Apim-Subscription-Key': subscriptionKey }
    });
    if (!res.ok) throw new Error(`Could not check the payment (HTTP ${res.status}).`);
    const data = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify({ status: data.status }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
