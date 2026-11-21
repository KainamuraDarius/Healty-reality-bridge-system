// Open this function's address ONCE in a browser, after MOMO_SUBSCRIPTION_KEY is set in
// Netlify's environment variables. It creates the API User + API Key the other functions
// need and shows them so you can save them as MOMO_API_USER and MOMO_API_KEY.
// Safe to revisit: the API User uses a fixed reference ID, so it is never duplicated.
const crypto = require('crypto');

function baseUrl(env) {
  return env === 'production' ? 'https://momodeveloper.mtn.com' : 'https://sandbox.momodeveloper.mtn.com';
}
function stableReferenceId(subscriptionKey) {
  const h = crypto.createHash('sha256').update('rhb-momo-user|' + subscriptionKey).digest('hex');
  return [h.slice(0, 8), h.slice(8, 12), '4' + h.slice(13, 16),
          ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20), h.slice(20, 32)].join('-');
}

exports.handler = async function () {
  try {
    const env = process.env.MOMO_ENV || 'sandbox';
    const subscriptionKey = process.env.MOMO_SUBSCRIPTION_KEY;
    const callbackHost = process.env.MOMO_CALLBACK_HOST || 'example.netlify.app';
    if (!subscriptionKey) {
      return { statusCode: 400, body: 'Set MOMO_SUBSCRIPTION_KEY in Netlify environment variables first, then reload this page.' };
    }
    const referenceId = stableReferenceId(subscriptionKey);
    const url = baseUrl(env);

    const createUser = await fetch(`${url}/v1_0/apiuser`, {
      method: 'POST',
      headers: { 'X-Reference-Id': referenceId, 'Ocp-Apim-Subscription-Key': subscriptionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerCallbackHost: callbackHost })
    });
    if (!createUser.ok && createUser.status !== 409) {
      return { statusCode: 500, body: `Could not create the API user (HTTP ${createUser.status}): ${await createUser.text()}` };
    }
    const createKey = await fetch(`${url}/v1_0/apiuser/${referenceId}/apikey`, {
      method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey }
    });
    if (!createKey.ok) {
      return { statusCode: 500, body: `Could not create an API key (HTTP ${createKey.status}): ${await createKey.text()}` };
    }
    const keyData = await createKey.json();
    return {
      statusCode: 200, headers: { 'Content-Type': 'text/html' },
      body: `<html><body style="font-family:sans-serif;padding:24px;max-width:620px;margin:auto;">
        <h2>MoMo setup — save these in Netlify</h2>
        <p>Site settings &rarr; Environment variables &rarr; add:</p>
        <p><b>MOMO_API_USER</b><br><code style="background:#eee;padding:6px;display:block;word-break:break-all;">${referenceId}</code></p>
        <p><b>MOMO_API_KEY</b><br><code style="background:#eee;padding:6px;display:block;word-break:break-all;">${keyData.apiKey}</code></p>
        <p>Then trigger a new deploy. Environment: <b>${env}</b>.</p>
        <p style="color:#888;font-size:13px;">Do this once and keep these values private.</p></body></html>`
    };
  } catch (err) {
    return { statusCode: 500, body: 'Setup failed: ' + err.message };
  }
};
