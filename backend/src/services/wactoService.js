/**
 * WACTO BSP — outbound WhatsApp messaging.
 *
 * WACTO wraps Meta's WABA. Outbound sends go to their REST API.
 * Inbound messages (and the Meta Flow endpoint) still arrive via
 * Meta's native webhook — keep whatsappController.js untouched.
 *
 * Env vars required:
 *   WACTO_API_KEY   — bearer token
 *   WACTO_CHANNEL   — phone number used as channel (e.g. 919940136163)
 *   WACTO_BASE_URL  — defaults to https://backend.wacto.ai/api/v1.0
 */

const BASE_URL = process.env.WACTO_BASE_URL || 'https://backend.wacto.ai/api/v1.0';
const TIMEOUT_MS = 15000;

function getKey() { return process.env.WACTO_API_KEY || ''; }
function getChannel() { return process.env.WACTO_CHANNEL || ''; }

export function wactoConfigured() {
  return !!(getKey() && getChannel());
}

function toWaPhone(mobile) {
  const d = String(mobile).replace(/\D/g, '');
  return d.length === 10 ? `91${d}` : d;
}

async function post(path, body) {
  const key = getKey();
  const channel = getChannel();
  if (!key || !channel) throw new Error('WACTO not configured (WACTO_API_KEY / WACTO_CHANNEL missing)');

  const res = await fetch(`${BASE_URL}${path}/${channel}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.message || json?.error || `HTTP ${res.status}`;
    throw new Error(`WACTO API error: ${msg}`);
  }
  return json;
}

/**
 * Send a pre-approved template message.
 *
 * @param {object} opts
 * @param {string}   opts.mobile        — 10-digit mobile (country code added automatically)
 * @param {string}   opts.templateName  — approved template name in WACTO
 * @param {string}   [opts.language]    — BCP-47 locale, default 'en'
 * @param {Array}    [opts.bodyParams]  — ordered array of {{1}}, {{2}} … substitutions
 */
export async function sendWactoTemplate({ mobile, templateName, language = 'en', bodyParams = [] }) {
  const to = toWaPhone(mobile);

  const components = [];
  if (bodyParams.length) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((val) => ({ type: 'text', text: String(val) })),
    });
  }

  return post('/messages/send-template', {
    to,
    template: {
      name: templateName,
      language: { code: language },
      components,
    },
  });
}

/**
 * Send a free-form text message (only within a 24-hour user-initiated window).
 *
 * @param {string} mobile  — 10-digit mobile
 * @param {string} text    — message body
 */
export async function sendWactoText(mobile, text) {
  const to = toWaPhone(mobile);
  return post('/messages/send-text', { to, text });
}

/**
 * Deliver a post-registration WhatsApp message.
 *
 * Template priority (first APPROVED one wins):
 *   1. edms_login_link    — "account active" + Login Now button → tnedms.com/login (PENDING)
 *   2. edms_account_ready — "account active" plain text (PENDING)
 *   3. test               — "Welcome!" stub, no params (APPROVED — always works)
 *
 * Full credential delivery (username + passcode) requires an AUTHENTICATION
 * template, which needs 250 messages sent through the channel first.
 * Credentials are shown on screen at registration in the meantime.
 */
export async function sendWactoCredentials({ mobile, name }) {
  const firstName = String(name || '').split(' ')[0] || 'there';

  // Best option: account active notification + Login Now button
  try {
    return await sendWactoTemplate({
      mobile,
      templateName: 'edms_login_link',
      bodyParams: [firstName],
    });
  } catch (e1) {
    console.warn('[WACTO] edms_login_link failed:', e1.message);
  }

  // Second: plain account-ready notification
  try {
    return await sendWactoTemplate({
      mobile,
      templateName: 'edms_account_ready',
      bodyParams: [firstName],
    });
  } catch (e2) {
    console.warn('[WACTO] edms_account_ready failed:', e2.message);
  }

  // Last resort: always-approved stub
  try {
    return await sendWactoTemplate({ mobile, templateName: 'test' });
  } catch (e3) {
    console.error('[WACTO] all templates failed:', e3.message);
    throw e3;
  }
}
