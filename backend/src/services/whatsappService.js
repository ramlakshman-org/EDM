const fetch = globalThis.fetch;

function formatPhoneForWhatsApp(to) {
  let phone = String(to || '').replace(/\D/g, '');
  if (phone.length === 10) {
    phone = '91' + phone; // Add 91 country code prefix for 10-digit Indian numbers
  }
  return phone;
}

function getMetaConfig() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const wabaId = process.env.META_WABA_ID;
  const version = process.env.META_GRAPH_VERSION || 'v22.0';

  if (!accessToken || !phoneNumberId) {
    throw new Error('Meta API credentials (META_ACCESS_TOKEN, META_PHONE_NUMBER_ID) missing in environment.');
  }

  return {
    accessToken,
    phoneNumberId,
    wabaId,
    version,
    messagesUrl: `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
  };
}

/**
 * Send a plain text WhatsApp message.
 */
export async function sendText(to, text, replyToMessageId = null) {
  const cfg = getMetaConfig();
  const phone = formatPhoneForWhatsApp(to);

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'text',
    text: {
      body: text,
      preview_url: false,
    },
  };
  // WhatsApp reply threading — quote the original message.
  if (replyToMessageId) {
    payload.context = { message_id: replyToMessageId };
  }

  const res = await fetch(cfg.messagesUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[WhatsApp API Error - sendText]:', data);
    throw new Error(data.error?.message || 'Failed to send WhatsApp text message.');
  }

  return data;
}

/**
 * Send interactive Flow message with registration form.
 */
export async function sendFlowMessage(to, options = {}) {
  const cfg = getMetaConfig();
  const phone = formatPhoneForWhatsApp(to);

  const flowId = options.flowId || process.env.WHATSAPP_FLOW_ID || '1003285115645097';
  const flowCta = options.flowCta || 'Register Now 🗳️';
  const flowToken = options.flowToken || `register_${phone}`;
  const rawBody = options.bodyText || 'Welcome! Register to access constituency insights, voter patterns, campaign tools, and local body election support.\n\nTap the button below to fill out the registration form inside WhatsApp.';
  const bodyText = String(rawBody).slice(0, 1024);
  const footerText = options.footerText || 'Election Data Management';

  const headerType = options.headerType || 'text';
  const headerUrl = options.headerUrl || null;
  const headerText = options.headerText || 'Candidate Registration';

  let header = { type: 'text', text: headerText.slice(0, 60) };
  if (headerType === 'video' && headerUrl) {
    header = { type: 'video', video: { link: headerUrl } };
  } else if (headerType === 'image' && headerUrl) {
    header = { type: 'image', image: { link: headerUrl } };
  }

  const flowStatus = (process.env.WHATSAPP_FLOW_STATUS || 'PUBLISHED').toUpperCase();
  const mode = flowStatus === 'PUBLISHED' ? 'published' : 'draft';

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header,
      body: { text: bodyText },
      footer: { text: footerText.slice(0, 60) },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: flowToken,
          flow_id: flowId,
          flow_cta: flowCta,
          mode,
          flow_action: 'navigate',
          flow_action_payload: {
            screen: 'WELCOME',
          },
        },
      },
    },
  };

  const res = await fetch(cfg.messagesUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[WhatsApp API Error - sendFlowMessage]:', data);
    throw new Error(data.error?.message || 'Failed to send WhatsApp Flow message.');
  }

  return data;
}

/**
 * Send CTA URL button message (e.g. Welcome Back / Login Credentials).
 */
export async function sendUrlButtonMessage(to, options = {}) {
  const cfg = getMetaConfig();
  const phone = formatPhoneForWhatsApp(to);

  const bodyText = String(options.bodyText || '').slice(0, 1024);
  const headerUrl = options.headerUrl || null;
  const headerType = options.headerType || 'text';
  const headerText = options.headerText || 'Login Credentials';
  const btnText = options.btnText || 'Login Now';
  const btnUrl = options.btnUrl || 'https://election2026sir.in/login';

  let header = { type: 'text', text: headerText.slice(0, 60) };
  if (headerType === 'image' && headerUrl) {
    header = { type: 'image', image: { link: headerUrl } };
  } else if (headerType === 'video' && headerUrl) {
    header = { type: 'video', video: { link: headerUrl } };
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      header,
      body: { text: bodyText },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: btnText,
          url: btnUrl,
        },
      },
    },
  };

  const res = await fetch(cfg.messagesUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[WhatsApp API Error - sendUrlButtonMessage]:', data);
    throw new Error(data.error?.message || 'Failed to send WhatsApp button message.');
  }

  return data;
}

/**
 * Send a media message (image / video / document) by public URL.
 * Free-form media — only deliverable inside the 24h/72h messaging window.
 */
export async function sendMediaMessage(to, { mediaUrl, mediaType = 'image', caption = '', filename } = {}) {
  const cfg = getMetaConfig();
  const phone = formatPhoneForWhatsApp(to);
  if (!mediaUrl) throw new Error('mediaUrl is required.');

  const type = mediaType === 'video' ? 'video' : mediaType === 'document' ? 'document' : 'image';
  const mediaObj = { link: mediaUrl };
  if (caption && caption.trim()) mediaObj.caption = caption.trim().slice(0, 1024);
  if (type === 'document' && filename) mediaObj.filename = filename;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type,
    [type]: mediaObj,
  };

  const res = await fetch(cfg.messagesUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('[WhatsApp API Error - sendMediaMessage]:', data);
    throw new Error(data.error?.message || 'Failed to send WhatsApp media message.');
  }
  return data;
}

/**
 * List all message templates on the WhatsApp Business Account, with live status
 * (APPROVED / PENDING / REJECTED) straight from Meta.
 */
export async function listTemplates() {
  const cfg = getMetaConfig();
  if (!cfg.wabaId) throw new Error('META_WABA_ID is missing in environment.');
  const url = `https://graph.facebook.com/${cfg.version}/${cfg.wabaId}/message_templates?fields=name,status,category,language,components,rejected_reason&limit=200`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${cfg.accessToken}` } });
  const data = await res.json();
  if (!res.ok) {
    console.error('[WhatsApp API Error - listTemplates]:', data);
    throw new Error(data.error?.message || 'Failed to list templates.');
  }
  return data.data || [];
}

/**
 * Create (submit for approval) a text template with an optional TEXT header and
 * a BODY. Static text only (no variables) to keep approval straightforward.
 */
/**
 * Upload a sample header image to Meta (resumable upload) and return the media
 * handle required to create an IMAGE-header template.
 */
export async function uploadTemplateHeaderHandle(buffer, mime = 'image/jpeg', filename = 'header') {
  const cfg = getMetaConfig();
  const appId = process.env.META_APP_ID;
  if (!appId) throw new Error('META_APP_ID is missing — required for image header templates.');

  // 1. Start an upload session.
  const params = new URLSearchParams({ file_name: filename, file_length: String(buffer.length), file_type: mime });
  const sessRes = await fetch(`https://graph.facebook.com/${cfg.version}/${appId}/uploads?${params.toString()}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cfg.accessToken}` },
  });
  const sess = await sessRes.json();
  if (!sessRes.ok || !sess.id) {
    console.error('[WhatsApp API Error - upload session]:', sess);
    throw new Error(sess.error?.message || 'Failed to start header media upload.');
  }

  // 2. Upload the bytes; Meta returns the reusable handle in `h`.
  const upRes = await fetch(`https://graph.facebook.com/${cfg.version}/${sess.id}`, {
    method: 'POST',
    headers: { 'Authorization': `OAuth ${cfg.accessToken}`, 'file_offset': '0' },
    body: buffer,
  });
  const up = await upRes.json();
  if (!upRes.ok || !up.h) {
    console.error('[WhatsApp API Error - upload bytes]:', up);
    throw new Error(up.error?.message || 'Failed to upload header media.');
  }
  return up.h;
}

export async function createTemplate({ name, category = 'MARKETING', language = 'en', headerText = '', headerFormat = 'TEXT', headerHandle = null, bodyText, bodyExample = null, buttons = null } = {}) {
  const cfg = getMetaConfig();
  if (!cfg.wabaId) throw new Error('META_WABA_ID is missing in environment.');
  if (!name) throw new Error('Template name is required.');
  if (!bodyText || !bodyText.trim()) throw new Error('Template body is required.');

  const components = [];
  if (headerFormat && headerFormat !== 'TEXT' && headerHandle) {
    // IMAGE / VIDEO / DOCUMENT header — provided via a resumable-upload handle.
    components.push({ type: 'HEADER', format: headerFormat, example: { header_handle: [headerHandle] } });
  } else if (headerText && headerText.trim()) {
    components.push({ type: 'HEADER', format: 'TEXT', text: headerText.trim().slice(0, 60) });
  }

  const bodyComp = { type: 'BODY', text: bodyText.trim().slice(0, 1024) };
  // Body variables ({{1}}, {{2}}...) require sample values for approval.
  if (Array.isArray(bodyExample) && bodyExample.length) {
    bodyComp.example = { body_text: [bodyExample.map((v) => String(v))] };
  }
  components.push(bodyComp);

  // Optional buttons — URL call-to-action OR a WhatsApp Flow launcher.
  if (Array.isArray(buttons) && buttons.length) {
    components.push({
      type: 'BUTTONS',
      buttons: buttons.map((b) => {
        const t = String(b.type || 'URL').toUpperCase();
        if (t === 'FLOW') {
          // Flow button: tapping it opens the in-WhatsApp Flow instead of a link.
          return {
            type: 'FLOW',
            text: String(b.text).slice(0, 25),
            flow_id: String(b.flowId || b.flow_id),
            flow_action: b.flowAction || b.flow_action || 'navigate',
            navigate_screen: b.navigateScreen || b.navigate_screen || 'WELCOME',
          };
        }
        return { type: 'URL', text: String(b.text).slice(0, 25), url: b.url };
      }),
    });
  }

  // allow_category_change lets Meta re-assign the category instead of rejecting
  // with INCORRECT_CATEGORY.
  const payload = { name, category, language, components, allow_category_change: true };
  const url = `https://graph.facebook.com/${cfg.version}/${cfg.wabaId}/message_templates`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('[WhatsApp API Error - createTemplate]:', data);
    throw new Error(data.error?.error_user_msg || data.error?.message || 'Failed to create template.');
  }
  return data; // { id, status, category }
}

/**
 * Send an approved template message. Works regardless of the 24h/72h window.
 */
export async function sendTemplateMessage(to, { name, language = 'en', bodyParams = [], headerParams = [], headerImageUrl = null, headerMediaType = 'image', flowButton = null } = {}) {
  const cfg = getMetaConfig();
  const phone = formatPhoneForWhatsApp(to);
  if (!name) throw new Error('Template name is required.');

  const components = [];
  // A media header (IMAGE / VIDEO / DOCUMENT) must carry the media at send time,
  // supplied by public link — even though the template was approved with a sample.
  if (headerImageUrl) {
    const mt = headerMediaType === 'video' ? 'video' : headerMediaType === 'document' ? 'document' : 'image';
    components.push({ type: 'header', parameters: [{ type: mt, [mt]: { link: headerImageUrl } }] });
  } else if (headerParams.length) {
    components.push({ type: 'header', parameters: headerParams.map((t) => ({ type: 'text', text: String(t) })) });
  }
  if (bodyParams.length) {
    components.push({ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: String(t) })) });
  }
  // When the template's CTA is a Flow button, pass the flow_token (and optional
  // start screen) so the launched Flow can be tied back to this contact.
  if (flowButton) {
    const action = { flow_token: flowButton.flowToken || `register_${phone}` };
    if (flowButton.screen) action.flow_action_data = { ...(flowButton.actionData || {}) };
    components.push({
      type: 'button',
      sub_type: 'flow',
      index: String(flowButton.index != null ? flowButton.index : 0),
      parameters: [{ type: 'action', action }],
    });
  }

  const template = { name, language: { code: language } };
  if (components.length) template.components = components;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'template',
    template,
  };

  const res = await fetch(cfg.messagesUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('[WhatsApp API Error - sendTemplateMessage]:', data);
    const err = new Error(data.error?.message || 'Failed to send template message.');
    err.code = data.error?.code;
    err.metaError = data.error;
    throw err;
  }
  return data;
}

/**
 * Fetch a WhatsApp media object's temporary download URL + mime type by media id.
 */
export async function getMediaInfo(mediaId) {
  const cfg = getMetaConfig();
  const res = await fetch(`https://graph.facebook.com/${cfg.version}/${mediaId}`, {
    headers: { Authorization: `Bearer ${cfg.accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('[WhatsApp API Error - getMediaInfo]:', data);
    throw new Error(data.error?.message || 'Failed to get media info.');
  }
  return data; // { url, mime_type, file_size, id, ... }
}

/**
 * Download the raw bytes of a WhatsApp media URL (requires the bearer token).
 */
export async function downloadMediaBytes(mediaUrl) {
  const cfg = getMetaConfig();
  const res = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${cfg.accessToken}` } });
  if (!res.ok) throw new Error(`Failed to download media (HTTP ${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Send an emoji reaction to a specific message (WhatsApp message reaction).
 * Pass an empty emoji string to remove the reaction.
 */
export async function sendReaction(to, messageId, emoji) {
  const cfg = getMetaConfig();
  const phone = formatPhoneForWhatsApp(to);
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'reaction',
    reaction: { message_id: messageId, emoji: emoji || '' },
  };
  const res = await fetch(cfg.messagesUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('[WhatsApp API Error - sendReaction]:', data);
    throw new Error(data.error?.message || 'Failed to send reaction.');
  }
  return data;
}
