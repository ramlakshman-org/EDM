import { getAppDb } from '../config/db.js';
import { listTemplates, createTemplate, sendTemplateMessage, uploadTemplateHeaderHandle, sendText, sendUrlButtonMessage, sendMediaMessage, sendFlowMessage } from '../services/whatsappService.js';
import { saveCrmMessage } from './whatsappController.js';
import { resolveWindow } from './crmController.js';
import { ROLES } from '../constants/roles.js';

function isCrmAgent(req) {
  return Number(req.user?.group_id) === ROLES.CRM_AGENT;
}

// Download a stored flow asset (image/video) and upload it to Meta to obtain a
// header handle for creating a media-header template.
async function headerHandleFromAsset(db, key) {
  const asset = await db.collection('app_flow_images').findOne({ key });
  if (!asset?.url) return null;
  const url = String(asset.url).replace(/^http:\/\//, 'https://');
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get('content-type') || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
  const handle = await uploadTemplateHeaderHandle(buf, mime, key);
  const format = (asset.type === 'video' || mime.includes('video')) ? 'VIDEO' : 'IMAGE';
  return { handle, format };
}

// Pick a public media URL for a media-header template. Prefer the flow asset the
// template was designed around; fall back to the EDM logo which is always
// reachable. Guards against type mismatch (e.g. an image header + a video asset).
async function resolveTemplateHeaderMedia(db, name, expectType = 'image') {
  const DEFAULT = 'https://tnedms.com/EDM.png';
  const keyByName = {
    edms_welcome: 'welcome_back_header',
    edms_reg_flow: 'register_header',
  };
  try {
    const key = keyByName[name];
    if (key) {
      const a = await db.collection('app_flow_images').findOne({ key });
      if (a?.url) {
        const url = String(a.url).replace(/^http:\/\//, 'https://');
        const isVideo = a.type === 'video' || /\.mp4($|\?)/i.test(url);
        // Only reuse the asset when its kind matches the header format.
        if ((expectType === 'video') === isVideo) return url;
      }
    }
  } catch (e) {
    console.warn('[resolveTemplateHeaderMedia]', e.message);
  }
  return DEFAULT;
}

// Pull the header/body/buttons out of a template's components for display.
function extractText(components = []) {
  const header = components.find((c) => c.type === 'HEADER');
  const body = components.find((c) => c.type === 'BODY');
  const btns = components.find((c) => c.type === 'BUTTONS');
  return {
    header: header?.format === 'TEXT' ? (header.text || '') : '',
    header_format: header?.format || null,
    body: body?.text || '',
    buttons: (btns?.buttons || []).map((b) => ({ type: b.type, text: b.text, url: b.url || null })),
  };
}

// Our default templates map to stored flow-asset images so the preview can show
// the real header image (Meta only returns an opaque handle, not a URL).
const HEADER_ASSET_BY_TEMPLATE = {
  edms_reg_flow: 'register_header',
  edms_welcome: 'welcome_back_header',
};

/**
 * GET /api/crm/templates — Live list of WhatsApp templates with status.
 */
export async function list(req, res) {
  try {
    const templates = await listTemplates();

    // Resolve preview image URLs for our known media-header templates.
    let assetUrl = {};
    try {
      const keys = Object.values(HEADER_ASSET_BY_TEMPLATE);
      const assets = await getAppDb().collection('app_flow_images').find({ key: { $in: keys } }).toArray();
      assets.forEach((a) => { assetUrl[a.key] = a.url; });
    } catch { /* ignore */ }

    const shaped = templates.map((t) => {
      const parts = extractText(t.components);
      let header_image_url = null;
      if (parts.header_format && parts.header_format !== 'TEXT') {
        const key = HEADER_ASSET_BY_TEMPLATE[t.name];
        if (key && assetUrl[key]) header_image_url = String(assetUrl[key]).replace(/^http:\/\//, 'https://');
      }
      return {
        name: t.name,
        status: t.status, // APPROVED | PENDING | REJECTED | ...
        category: t.category,
        language: t.language,
        rejected_reason: t.rejected_reason || null,
        ...parts,
        header_image_url,
      };
    });
    return res.json({ success: true, templates: shaped });
  } catch (err) {
    console.error('[Template list Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to list templates.' });
  }
}

/**
 * POST /api/crm/templates — Create/submit a template for approval. Admin only.
 * Body: { name, header, body, category, language }
 */
export async function create(req, res) {
  try {
    let { name, header, body, category, language, headerType, headerImageBase64, headerImageMime, headerImageFilename } = req.body || {};
    if (!name || !body || !String(body).trim()) {
      return res.status(400).json({ success: false, message: 'Template name and body are required.' });
    }
    // Meta requires lowercase alphanumeric + underscore names.
    name = String(name).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 512);
    if (!name) return res.status(400).json({ success: false, message: 'Invalid template name.' });

    // Optional image header — upload the photo to Meta to obtain a header handle.
    let headerFormat = 'TEXT';
    let headerHandle = null;
    if (headerType === 'image' && headerImageBase64) {
      const b64 = String(headerImageBase64).replace(/^data:[^;]+;base64,/, '');
      const buf = Buffer.from(b64, 'base64');
      headerHandle = await uploadTemplateHeaderHandle(buf, headerImageMime || 'image/jpeg', headerImageFilename || 'header.jpg');
      headerFormat = 'IMAGE';
    }

    const result = await createTemplate({
      name,
      category: category || 'MARKETING',
      language: language || 'en',
      headerText: headerFormat === 'IMAGE' ? '' : (header || ''),
      headerFormat,
      headerHandle,
      bodyText: body,
    });

    return res.json({
      success: true,
      message: `Template '${name}' submitted to WhatsApp for approval.`,
      id: result.id,
      status: result.status || 'PENDING',
      name,
    });
  } catch (err) {
    console.error('[Template create Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to create template.' });
  }
}

/**
 * POST /api/crm/templates/setup-defaults — Create the standard credential &
 * registration templates so they can be sent once approved (used automatically
 * when the messaging window is closed). Admin only. Idempotent-ish: re-running
 * after approval will error per-template (already exists), which we report.
 */
export async function setupDefaults(req, res) {
  try {
    const db = getAppDb();
    const loginUrl = process.env.PORTAL_LOGIN_URL || 'https://tnedms.com/login';
    const registerUrl = process.env.PORTAL_REGISTER_URL || 'https://tnedms.com/register';
    const results = {};

    // Registration template — uses the REAL EDMS register message + its image header.
    try {
      const regMsg = await db.collection('app_flow_messages').findOne({ key: 'register_welcome_text' });
      const regBody = (regMsg?.text || '').trim() ||
        'Welcome! Register to access constituency insights, voter patterns and campaign tools for local body elections.\n\nTap the button below to complete your registration.';
      const regHeader = await headerHandleFromAsset(db, 'register_header');
      const flowId = process.env.WHATSAPP_FLOW_ID || '1003285115645097';
      const r = await createTemplate({
        name: 'edms_reg_flow',
        category: 'MARKETING',
        language: 'en',
        headerFormat: regHeader ? regHeader.format : 'TEXT',
        headerHandle: regHeader ? regHeader.handle : null,
        headerText: regHeader ? '' : 'Candidate Registration',
        bodyText: regBody,
        // CTA is a WhatsApp Flow button — opens the in-WhatsApp registration form.
        buttons: [{ type: 'FLOW', text: 'Register Now', flowId, navigateScreen: 'WELCOME' }],
      });
      results.edms_reg_flow = r.status || 'PENDING';
    } catch (e) {
      results.edms_reg_flow = 'ERROR: ' + e.message;
    }

    // Login template — welcome-back image header + a compliant "log in" body.
    // (WhatsApp forbids embedding the passcode in a template — authentication content.)
    try {
      const lbHeader = await headerHandleFromAsset(db, 'welcome_back_header');
      const r = await createTemplate({
        name: 'edms_welcome',
        category: 'UTILITY',
        language: 'en',
        headerFormat: lbHeader ? lbHeader.format : 'TEXT',
        headerHandle: lbHeader ? lbHeader.handle : null,
        headerText: lbHeader ? '' : 'Login Access',
        bodyText: 'Welcome back {{1}}! 👋\n\nYou are registered on EDMS. Tap the button below to log in to your Election Management Dashboard.',
        bodyExample: ['Bhanu'],
        buttons: [{ type: 'URL', text: 'Login Now', url: loginUrl }],
      });
      results.edms_welcome = r.status || 'PENDING';
    } catch (e) {
      results.edms_welcome = 'ERROR: ' + e.message;
    }

    return res.json({
      success: true,
      message: 'Default templates submitted with your real message + image header. They must be approved by WhatsApp before they can be sent outside the window.',
      results,
    });
  } catch (err) {
    console.error('[Template setupDefaults Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to set up default templates.' });
  }
}

/**
 * POST /api/crm/conversations/:phone/send-template — Send an approved template.
 * Works regardless of the messaging window. Body: { name, language, bodyParams, preview }
 */
export async function sendToContact(req, res) {
  try {
    const db = getAppDb();
    const { phone } = req.params;
    const { name, language, bodyParams, headerParams, preview } = req.body || {};
    const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);
    const targetPhone = String(phone).replace(/\D/g, '');

    if (!name) return res.status(400).json({ success: false, message: 'Template name is required.' });

    // Agents may only message their assigned conversations.
    if (isCrmAgent(req)) {
      const conv = await db
        .collection('tbl_crm_conversation')
        .findOne({ clean_mobile: cleanMobile }, { projection: { assigned_agent_id: 1 } });
      if (!conv || String(conv.assigned_agent_id) !== String(req.user.sub)) {
        return res.status(403).json({ success: false, message: 'This conversation is not assigned to you.' });
      }
    }

    // Look up the template definition so we send EXACTLY the params it expects.
    // WhatsApp rejects with (#132000) when the count doesn't match: a media header
    // needs its image/video at send time, and each {{n}} body var needs a value.
    let tplDef = null;
    try {
      const all = await listTemplates();
      tplDef = all.find((t) => t.name === name && String(t.language) === String(language || 'en')) || all.find((t) => t.name === name);
    } catch (e) {
      console.warn('[sendToContact] Could not fetch template definition:', e.message);
    }

    const langCode = tplDef?.language || language || 'en';
    const comps = tplDef?.components || [];
    const headerComp = comps.find((c) => c.type === 'HEADER');
    const bodyComp = comps.find((c) => c.type === 'BODY');
    const countVars = (txt) => (txt ? (txt.match(/\{\{\s*\d+\s*\}\}/g) || []).length : 0);
    const bodyVarCount = countVars(bodyComp?.text);

    // Contact name used to fill {{1}} (and any extra body vars) by default.
    const [user, enquiry, conv] = await Promise.all([
      db.collection('tbl_user').findOne({ mobile_no: cleanMobile }),
      db.collection('tbl_enquiry').findOne({ mobile: cleanMobile }),
      db.collection('tbl_crm_conversation').findOne({ clean_mobile: cleanMobile }),
    ]);
    const contactName = (user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : (enquiry?.full_name || enquiry?.firstname)) || conv?.contact_name || 'there';

    // Body params: keep caller-provided values only if the count already matches,
    // otherwise auto-fill each variable with the contact's name.
    let finalBody = Array.isArray(bodyParams) ? bodyParams.filter((v) => v != null).map(String) : [];
    if (finalBody.length !== bodyVarCount) {
      finalBody = Array.from({ length: bodyVarCount }, () => contactName);
    }

    // Header: media header -> supply the image/video link; text header -> its vars.
    let headerImageUrl = null;
    let headerMediaType = 'image';
    let finalHeaderParams = Array.isArray(headerParams) ? headerParams.map(String) : [];
    if (headerComp) {
      const fmt = String(headerComp.format || 'TEXT').toUpperCase();
      if (fmt === 'IMAGE' || fmt === 'VIDEO' || fmt === 'DOCUMENT') {
        headerMediaType = fmt.toLowerCase();
        headerImageUrl = await resolveTemplateHeaderMedia(db, name, headerMediaType);
      } else if (fmt === 'TEXT') {
        const hVars = countVars(headerComp.text);
        if (finalHeaderParams.length !== hVars) finalHeaderParams = Array.from({ length: hVars }, () => contactName);
      }
    }

    // Fill {{n}} placeholders so the body reads naturally in chat + free-form send.
    const fillVars = (txt, vals) => {
      let out = txt || '';
      (vals || []).forEach((val, i) => {
        out = out.replace(new RegExp(`\\{\\{\\s*${i + 1}\\s*\\}\\}`, 'g'), val);
      });
      return out;
    };
    const filledBody = fillVars(bodyComp?.text || '', finalBody) || preview || `[Template: ${name}]`;
    const headerTextFilled = (headerComp && String(headerComp.format || '').toUpperCase() === 'TEXT')
      ? fillVars(headerComp.text || '', finalHeaderParams)
      : null;
    const buttonsComp = comps.find((c) => c.type === 'BUTTONS');
    const urlBtn = (buttonsComp?.buttons || []).find((b) => String(b.type).toUpperCase() === 'URL');
    const flowBtn = (buttonsComp?.buttons || []).find((b) => String(b.type).toUpperCase() === 'FLOW');

    // Metadata shared by both paths so the chat renders the sent template in the
    // rich "template view" style (header image + body + button). A Flow button is
    // rendered like the registration CTA; otherwise a URL button.
    const richMeta = {
      action: 'sent_template',
      template_name: name,
      headerUrl: headerImageUrl || undefined,
      headerType: headerImageUrl ? headerMediaType : undefined,
      headerText: headerTextFilled || undefined,
      ...(flowBtn
        ? { flowCta: flowBtn.text || 'Register Now' }
        : { btnText: urlBtn?.text || undefined, btnUrl: urlBtn?.url || undefined }),
    };

    // Decide how to send based on the WhatsApp messaging window:
    //   • window OPEN  -> send the same content as a FREE, look-alike message from
    //                     our code (no template charge), rendered like the template.
    //   • window CLOSED -> send the real approved (billed) template.
    const win = await resolveWindow(db, cleanMobile, conv);
    let result;
    let sentAs;

    if (win.window_active) {
      sentAs = 'freeform';
      if (flowBtn) {
        // Window open + Flow button -> send the native interactive Flow (free) so
        // tapping the CTA opens the in-WhatsApp form, matching the template.
        result = await sendFlowMessage(targetPhone, {
          flowId: flowBtn.flow_id,
          flowCta: flowBtn.text || 'Register Now',
          bodyText: filledBody,
          headerText: headerTextFilled || name,
          headerUrl: headerImageUrl,
          headerType: headerImageUrl ? headerMediaType : 'text',
          flowToken: `register_${targetPhone}`,
        });
      } else if (urlBtn?.url) {
        result = await sendUrlButtonMessage(targetPhone, {
          bodyText: filledBody,
          headerText: headerTextFilled || name,
          btnText: urlBtn.text || 'Open',
          btnUrl: urlBtn.url,
          headerUrl: headerImageUrl,
          headerType: headerImageUrl ? headerMediaType : 'text',
        });
      } else if (headerImageUrl) {
        result = await sendMediaMessage(targetPhone, { mediaUrl: headerImageUrl, mediaType: headerMediaType, caption: filledBody });
      } else {
        result = await sendText(targetPhone, filledBody);
      }
    } else {
      sentAs = 'template';
      try {
        result = await sendTemplateMessage(targetPhone, {
          name,
          language: langCode,
          bodyParams: finalBody,
          headerParams: finalHeaderParams,
          headerImageUrl,
          headerMediaType,
          flowButton: flowBtn ? { index: 0, flowToken: `register_${targetPhone}` } : null,
        });
      } catch (err) {
        // A template can't be sent without billing on the WhatsApp Business
        // account — surface a clear, actionable message instead of Meta's raw error.
        const isBilling = err.code === 131042
          || err.code === 131044
          || /payment method|payment|billing|not been set up to pay/i.test(err.message || '');
        if (isBilling) {
          return res.status(402).json({
            success: false,
            code: 'no_payment_method',
            message: 'Cannot send the template — your WhatsApp Business account has no payment method set up. Add one in Meta Business Settings → WhatsApp Manager → Billing & payments, then try again.',
          });
        }
        throw err;
      }
    }

    await saveCrmMessage({
      phone: targetPhone,
      direction: 'outgoing',
      type: 'template',
      body: filledBody,
      waMessageId: result?.messages?.[0]?.id,
      contactName,
      metadata: { ...richMeta, sent_as: sentAs },
    });

    return res.json({
      success: true,
      sent_as: sentAs,
      message: sentAs === 'freeform'
        ? `Template "${name}" sent as a live message (window open — no template charge).`
        : `Template "${name}" sent.`,
      result,
    });
  } catch (err) {
    console.error('[Template sendToContact Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to send template.' });
  }
}
