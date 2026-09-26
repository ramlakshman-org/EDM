// WATI (WhatsApp BSP) integration.
//
// Used ONLY to deliver login credentials after registration (web or the in-app
// WhatsApp flow). These are business-initiated messages to users who have no
// open 24h session on the WATI number, so WhatsApp requires an APPROVED TEMPLATE
// (free-form text is not allowed). Create the template in the WATI dashboard and
// set its name via WATI_CREDENTIALS_TEMPLATE.
//
// Env:
//   WATI_ENDPOINT              e.g. https://live-mt-server.wati.io/10214360
//   WATI_ACCESS_TOKEN          the Bearer JWT (with or without the "Bearer " prefix)
//   WATI_CREDENTIALS_TEMPLATE  approved template name (default: edms_credentials)

// Timeout wrapper so a WATI stall can't hang a worker.
const _fetch = globalThis.fetch;
const fetch = (url, opts = {}) => _fetch(url, { signal: AbortSignal.timeout(15000), ...opts });

function cfg() {
  const endpoint = (process.env.WATI_ENDPOINT || '').replace(/\/+$/, '');
  const token = process.env.WATI_ACCESS_TOKEN || '';
  return { endpoint, token };
}

export function watiConfigured() {
  const { endpoint, token } = cfg();
  return !!(endpoint && token);
}

// WATI expects the full international number (E.164 without '+'), e.g. 918106811285.
function toWatiNumber(mobile) {
  const d = String(mobile || '').replace(/\D/g, '');
  return d.length === 10 ? `91${d}` : d;
}

/**
 * Send an approved template message via WATI.
 * @param {{ mobile:string, templateName:string, parameters?:Array<{name:string,value:string}>, broadcastName?:string }} opts
 */
export async function sendWatiTemplate({ mobile, templateName, parameters = [], broadcastName }) {
  const { endpoint, token } = cfg();
  if (!endpoint || !token) throw new Error('WATI not configured (WATI_ENDPOINT / WATI_ACCESS_TOKEN)');
  const number = toWatiNumber(mobile);
  if (!number) throw new Error('Invalid recipient mobile for WATI');

  const auth = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  const url = `${endpoint}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(number)}`;
  const body = {
    template_name: templateName,
    broadcast_name: broadcastName || `${templateName}_${Date.now()}`,
    parameters,
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  // WATI returns { result: true, ... } on success; surface a useful error otherwise.
  if (!resp.ok || data?.result === false || data?.ok === false) {
    throw new Error(data?.info || data?.message || `WATI HTTP ${resp.status}`);
  }
  return data;
}

/**
 * Send login credentials via the approved credentials template.
 * The WATI template must define these NAMED body variables:
 *   {{name}}, {{username}}, {{passcode}}
 */
export async function sendWatiCredentials({ mobile, name, username, passcode }) {
  const templateName = process.env.WATI_CREDENTIALS_TEMPLATE || 'edms_login_v1';
  // edms_login_v1 has three body variables (labels baked into the values so the
  // static text stays generic and Meta-approved):
  //   detail_one = login link, detail_two = name/user id, detail_three = password.
  const loginLink = process.env.WATI_LOGIN_LINK || 'https://tnedms.com/login';
  const parameters = [
    { name: 'detail_one', value: `Login: ${loginLink}` },
    { name: 'detail_two', value: `User ID: ${String(username || '')}` },
    { name: 'detail_three', value: `Password: ${String(passcode || '')}` },
  ];
  return sendWatiTemplate({ mobile, templateName, parameters });
}
