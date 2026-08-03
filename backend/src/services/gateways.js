// Third-party gateway integrations, mirroring the original app:
//   SMS + Voice  -> Obligr (https://obligr.io/api_v2/...)
//   WhatsApp     -> Meta Graph API (graph.facebook.com)
// Each function only calls out when its keys are configured in .env; otherwise
// it returns { configured: false } so callers can respond 501 without side effects.

// Outbound gateway calls get a timeout so an upstream (Obligr/Meta) outage
// can't hang a worker thread indefinitely.
const _fetch = globalThis.fetch;
const fetch = (url, opts = {}) => _fetch(url, { signal: AbortSignal.timeout(15000), ...opts });

export function smsConfigured() {
  return !!process.env.OBLIGR_TOKEN;
}

export async function sendSms({ message, mobiles, senderId }) {
  if (!smsConfigured()) return { configured: false };
  const sender = senderId || process.env.OBLIGR_SENDER_ID || 'ELETON';
  const body = new URLSearchParams({ sender_id: sender, message, mobile_no: mobiles }).toString();
  const resp = await fetch('https://obligr.io/api_v2/message/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OBLIGR_TOKEN}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  return { configured: true, ok: resp.ok, result: await resp.json().catch(() => ({})) };
}

export async function sendVoice({ callerId, audioUrl, mobiles }) {
  if (!smsConfigured()) return { configured: false };
  const body = new URLSearchParams({ caller_id: callerId, voice_file: audioUrl, mobile_no: mobiles }).toString();
  const resp = await fetch('https://obligr.io/api_v2/voice-call/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OBLIGR_TOKEN}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  return { configured: true, ok: resp.ok, result: await resp.json().catch(() => ({})) };
}

export function whatsappConfigured() {
  return !!(process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID);
}

export async function sendWhatsAppText({ to, text }) {
  if (!whatsappConfigured()) return { configured: false };
  const version = process.env.META_GRAPH_VERSION || 'v22.0';
  const phone = String(to).replace(/\D/g, '');
  const resp = await fetch(`https://graph.facebook.com/${version}/${process.env.META_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', recipient_type: 'individual', to: phone,
      type: 'text', text: { body: text, preview_url: false },
    }),
  });
  return { configured: true, ok: resp.ok, result: await resp.json().catch(() => ({})) };
}
