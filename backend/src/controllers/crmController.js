import { getAppDb } from '../config/db.js';
import { sendText, sendUrlButtonMessage, sendFlowMessage, sendMediaMessage, sendTemplateMessage, sendReaction } from '../services/whatsappService.js';
import { saveCrmMessage, getFlowMessageText, getActiveAgents, assignAgentRoundRobin } from './whatsappController.js';
import * as cloudinary from '../services/cloudinaryService.js';
import { ROLES } from '../constants/roles.js';
import { escapeRegex } from '../utils/escapeRegex.js';

// Registration template whose CTA is a WhatsApp Flow button (launches the
// in-WhatsApp registration flow). Used when the messaging window is closed.
const REGISTER_FLOW_TEMPLATE = process.env.REGISTER_FLOW_TEMPLATE || 'edms_reg_flow';
// Welcome-back / login-nudge template (image header + Login button, no passcode —
// Meta rejects credentials in templates, so the passcode stays in the in-window msg).
const WELCOME_TEMPLATE = process.env.WELCOME_TEMPLATE || 'edms_welcome';

// A logged-in user is a CRM agent (not admin) when their group is CRM_AGENT.
function isCrmAgent(req) {
  return Number(req.user?.group_id) === ROLES.CRM_AGENT;
}

// The current agent's id (matches assigned_agent_id stored on conversations).
function currentAgentId(req) {
  return String(req.user?.sub || req.user?.id || '');
}

// Guard: a CRM agent may only touch conversations assigned to them. Admins and
// other roles are unrestricted. Returns true if allowed.
async function agentCanAccess(db, req, cleanMobile) {
  if (!isCrmAgent(req)) return true;
  const conv = await db
    .collection('tbl_crm_conversation')
    .findOne({ clean_mobile: cleanMobile }, { projection: { assigned_agent_id: 1 } });
  return !!conv && String(conv.assigned_agent_id) === currentAgentId(req);
}

// Resolve the WhatsApp messaging window for a contact. Uses the fields stored on
// the conversation by saveCrmMessage; falls back to the last incoming message for
// legacy threads that predate window tracking. 72h for ad-sourced, else 24h.
export async function resolveWindow(db, cleanMobile, conv = null) {
  let expiresAt = conv?.window_expires_at || null;
  let source = conv?.window_source || null;
  let hours = conv?.window_hours || null;
  let lastInboundAt = conv?.last_inbound_at || null;

  if (!expiresAt) {
    const lastIn = await db
      .collection('tbl_crm_message')
      .find({ clean_mobile: cleanMobile, direction: 'incoming' })
      .sort({ created_at: -1 })
      .limit(1)
      .next();
    if (lastIn) {
      const isAd = !!(lastIn.metadata && lastIn.metadata.referral);
      hours = isAd ? 72 : 24;
      source = isAd ? 'ad' : 'direct';
      lastInboundAt = lastIn.created_at;
      expiresAt = new Date(new Date(lastIn.created_at).getTime() + hours * 3600 * 1000);
    }
  }

  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : null;
  return {
    window_source: source,
    window_hours: hours,
    last_inbound_at: lastInboundAt,
    window_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    window_active: expiresMs ? expiresMs > Date.now() : false,
  };
}

/**
 * GET /api/crm/conversations — List CRM chat threads
 */
export async function listConversations(req, res) {
  try {
    const db = getAppDb();
    const { search = '', status = 'all', lead_status = 'all', page = 1, limit = 50 } = req.query;

    const query = {};
    // CRM agents only see conversations assigned to them (round-robin owner).
    // Admins and other roles see every conversation.
    if (isCrmAgent(req)) {
      query.assigned_agent_id = currentAgentId(req);
    }
    if (status !== 'all') {
      query.status = status;
    }
    if (lead_status !== 'all') {
      query.lead_status = lead_status;
    }

    if (search.trim()) {
      const s = escapeRegex(search.trim());
      query.$or = [
        { contact_name: { $regex: s, $options: 'i' } },
        { clean_mobile: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
        { last_message: { $regex: s, $options: 'i' } },
      ];
    }

    const total = await db.collection('tbl_crm_conversation').countDocuments(query);
    const conversations = await db
      .collection('tbl_crm_conversation')
      .find(query)
      .sort({ last_message_at: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .toArray();

    // Enrich conversation threads with registration info if available
    const mobiles = conversations.map((c) => c.clean_mobile).filter(Boolean);
    const [users, enquiries] = await Promise.all([
      db.collection('tbl_user').find({ mobile_no: { $in: mobiles } }).toArray(),
      db.collection('tbl_enquiry').find({ mobile: { $in: mobiles } }).toArray(),
    ]);

    const userByMobile = Object.fromEntries(users.map((u) => [u.mobile_no, u]));
    const enquiryByMobile = Object.fromEntries(enquiries.map((e) => [e.mobile, e]));

    const enriched = conversations.map((c) => {
      const u = userByMobile[c.clean_mobile];
      const e = enquiryByMobile[c.clean_mobile];
      const isRegistered = !!(u || e);
      const paidStatus = u?.paid_status || e?.paid_status || 'No';
      const isPro = String(paidStatus).toLowerCase() === 'yes';

      return {
        ...c,
        is_registered: isRegistered,
        paid_status: paidStatus,
        is_pro: isPro,
        district: u?.district || e?.district || '-',
        local_body: u?.local_body || e?.panchayat_or_corporation || e?.union_or_municipality || '-',
        ward_number: u?.ward_id || e?.ward_number || '-',
        position: u?.position || e?.position || '-',
        passcode: u?.password_str || e?.passcode || '-',
      };
    });

    return res.json({
      success: true,
      total,
      page: Number(page),
      conversations: enriched,
    });
  } catch (err) {
    console.error('[CRM listConversations Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch conversations.' });
  }
}

/**
 * GET /api/crm/conversations/:phone — Get chat message history
 */
export async function getConversationHistory(req, res) {
  try {
    const db = getAppDb();
    const { phone } = req.params;
    const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);

    if (!(await agentCanAccess(db, req, cleanMobile))) {
      return res.status(403).json({ success: false, message: 'This conversation is not assigned to you.' });
    }

    // Reset unread count for this thread
    await db.collection('tbl_crm_conversation').updateOne(
      { clean_mobile: cleanMobile },
      { $set: { unread_count: 0 } }
    );

    const messages = await db
      .collection('tbl_crm_message')
      .find({ clean_mobile: cleanMobile })
      .sort({ created_at: 1 })
      .toArray();

    // Fetch flow assets map to attach header images/videos to conversation messages
    const flowAssets = await db.collection('app_flow_images').find({}).toArray();
    const assetMap = {};
    for (const a of flowAssets) {
      if (a.key && a.url) {
        let url = String(a.url).replace(/^http:\/\//, 'https://');
        assetMap[a.key] = {
          headerUrl: url,
          headerType: a.type || (url.includes('.mp4') ? 'video' : 'image'),
        };
      }
    }

    const DEFAULT_HEADER = 'https://tnedms.com/EDM.png';

    const enrichedMessages = messages.map((m) => {
      const meta = m.metadata || {};
      let headerUrl = meta.headerUrl;
      let headerType = meta.headerType;
      let headerText = meta.headerText;

      const txt = m.body || '';

      if (!headerUrl) {
        if (meta.action === 'sent_credentials' || meta.action === 'manual_crm_sent_credentials' || txt.includes('Welcome back') || txt.includes('Passcode')) {
          const wb = assetMap['welcome_back_header'] || assetMap['register_success_header'];
          headerUrl = wb ? wb.headerUrl : DEFAULT_HEADER;
          headerType = wb ? wb.headerType : 'image';
          headerText = headerText || 'Welcome Back';
        } else if (meta.action === 'sent_registration_flow' || txt.includes('Register to access') || txt.includes('Tap the button below')) {
          const reg = assetMap['register_header'];
          headerUrl = reg ? reg.headerUrl : DEFAULT_HEADER;
          headerType = reg ? reg.headerType : 'image';
          headerText = headerText || 'Candidate Registration';
        } else if (meta.action === 'flow_registration_success' || txt.includes('Registration Complete') || txt.includes('registered successfully')) {
          const succ = assetMap['register_success_header'] || assetMap['welcome_back_header'];
          headerUrl = succ ? succ.headerUrl : DEFAULT_HEADER;
          headerType = succ ? succ.headerType : 'image';
          headerText = headerText || 'Registration Complete';
        }
      }

      return {
        ...m,
        metadata: {
          ...meta,
          headerUrl: headerUrl || undefined,
          headerType: headerType || undefined,
          headerText: headerText || undefined,
        },
      };
    });

    // Fetch contact details from tbl_user / tbl_enquiry / tbl_crm_conversation
    const [user, enquiry, conv] = await Promise.all([
      db.collection('tbl_user').findOne({ mobile_no: cleanMobile }),
      db.collection('tbl_enquiry').findOne({ mobile: cleanMobile }),
      db.collection('tbl_crm_conversation').findOne({ clean_mobile: cleanMobile }),
    ]);

    const paidStatus = user?.paid_status || enquiry?.paid_status || 'No';
    const isPro = String(paidStatus).toLowerCase() === 'yes';

    // Resolve assembly name + selected booths (register form now uses
    // District -> Assembly -> Booth(s) instead of ward/local body).
    const assemblyId = user?.assembly_id || enquiry?.assembly_id || null;
    let assemblyName = '-';
    if (assemblyId) {
      const asm = await db.collection('tbl_assembly_consitituency').findOne({ assembly_no: parseInt(assemblyId, 10) });
      assemblyName = asm ? (asm.assembly_name || `Assembly ${assemblyId}`) : String(assemblyId);
    }
    const boothsRaw = user?.booths || enquiry?.booths || [];
    const booths = Array.isArray(boothsRaw) ? boothsRaw.map(String) : (boothsRaw ? [String(boothsRaw)] : []);

    const contact = {
      phone: String(phone).replace(/\D/g, ''),
      clean_mobile: cleanMobile,
      name: user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : (enquiry?.full_name || enquiry?.firstname || conv?.contact_name || `User ${cleanMobile.slice(-4)}`),
      is_registered: !!(user || enquiry),
      paid_status: paidStatus,
      is_pro: isPro,
      district: user?.district || enquiry?.district || '-',
      assembly: assemblyName,
      booths,
      position: user?.position || enquiry?.position || '-',
      passcode: user?.password_str || enquiry?.passcode || '-',
      lead_status: conv?.lead_status || 'none',
      agent_notes: conv?.agent_notes || '',
      assigned_agent_name: conv?.assigned_agent_name || conv?.last_handled_by || '-',
      status_history: Array.isArray(conv?.status_history) ? conv.status_history : [],
    };

    // WhatsApp 24h/72h messaging window (drives the CRM chat timer & lock).
    const windowInfo = await resolveWindow(db, cleanMobile, conv);
    Object.assign(contact, windowInfo);

    return res.json({
      success: true,
      contact,
      messages: enrichedMessages,
    });
  } catch (err) {
    console.error('[CRM getConversationHistory Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch message history.' });
  }
}

/**
 * POST /api/crm/messages/send — Send direct text message from CRM UI
 */
export async function sendMessage(req, res) {
  try {
    const { phone, message } = req.body;
    if (!phone || !message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number and message text are required.' });
    }

    const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);
    const targetPhone = String(phone).replace(/\D/g, '');

    const db = getAppDb();
    if (!(await agentCanAccess(db, req, cleanMobile))) {
      return res.status(403).json({ success: false, message: 'This conversation is not assigned to you.' });
    }

    // Enforce the WhatsApp messaging window — free-form replies are only allowed
    // while the 24h/72h window from the user's last message is still open.
    const conv = await db.collection('tbl_crm_conversation').findOne({ clean_mobile: cleanMobile });
    const win = await resolveWindow(db, cleanMobile, conv);
    // No active window -> locked. This covers both an expired window and a thread
    // where the user has never messaged us (no window was ever opened). Free-form
    // sends are only allowed while the 24h/72h window is open; use a template otherwise.
    if (!win.window_active) {
      return res.status(403).json({
        success: false,
        code: 'window_closed',
        message: 'The WhatsApp messaging window is closed. You can send a free-form message only after the user messages you (within their 24h/72h window). Use a Template to reach out now.',
      });
    }

    // Call WhatsApp Meta API
    const replyTo = req.body.reply_to || null;
    const replyPreview = req.body.reply_preview || null;
    const result = await sendText(targetPhone, message.trim(), replyTo);
    const waMessageId = result?.messages?.[0]?.id;

    // Save message to CRM thread
    await saveCrmMessage({
      phone: targetPhone,
      direction: 'outgoing',
      type: 'text',
      body: message.trim(),
      waMessageId,
      metadata: replyPreview ? { reply_to: replyTo, reply_preview: replyPreview } : {},
    });

    return res.json({
      success: true,
      message: 'WhatsApp message sent successfully.',
      result,
    });
  } catch (err) {
    console.error('[CRM sendMessage Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to send WhatsApp message.' });
  }
}

/**
 * POST /api/crm/send-credentials — Send login credentials button message via WhatsApp
 */
export async function sendCredentials(req, res) {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    const db = getAppDb();
    const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);
    const targetPhone = String(phone).replace(/\D/g, '');

    if (!(await agentCanAccess(db, req, cleanMobile))) {
      return res.status(403).json({ success: false, message: 'This conversation is not assigned to you.' });
    }

    const user = await db.collection('tbl_user').findOne({ mobile_no: cleanMobile });
    const enquiry = await db.collection('tbl_enquiry').findOne({ mobile: cleanMobile });

    if (!user && !enquiry) {
      return res.status(404).json({ success: false, message: 'Candidate registration not found.' });
    }

    const name = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : (enquiry?.full_name || enquiry?.firstname || 'Candidate');
    const passcode = user?.password_str || enquiry?.passcode || cleanMobile;

    // Outside the messaging window, free-form/interactive isn't allowed — fall
    // back to the approved 'login_credentials' template with the live values.
    const credWin = await resolveWindow(db, cleanMobile);
    if (!credWin.window_active) {
      try {
        // edms_welcome has an IMAGE header + one body var ({{1}} = name) — both
        // must be supplied at send time or Meta rejects with (#132000).
        const credAsset = (await db.collection('app_flow_images').findOne({ key: 'welcome_back_header' })) || (await db.collection('app_flow_images').findOne({ key: 'register_success_header' }));
        let credHeaderUrl = credAsset?.url ? String(credAsset.url).replace(/^http:\/\//, 'https://') : 'https://tnedms.com/EDM.png';
        if (credAsset?.type === 'video' || /\.mp4($|\?)/i.test(credHeaderUrl)) credHeaderUrl = 'https://tnedms.com/EDM.png';
        // Window closed: send the approved 'edms_welcome' template (image header +
        // Login button). WhatsApp does not allow the passcode inside a template,
        // so it's a login nudge; the passcode is delivered inside the window.
        const tplResult = await sendTemplateMessage(targetPhone, {
          name: WELCOME_TEMPLATE,
          language: 'en',
          bodyParams: [name],
          headerImageUrl: credHeaderUrl,
        });
        await saveCrmMessage({
          phone: targetPhone,
          direction: 'outgoing',
          type: 'template',
          body: `Welcome back ${name}! 👋\n\nYou are registered on EDMS. Tap the button below to log in to your Election Management Dashboard.`,
          waMessageId: tplResult?.messages?.[0]?.id,
          contactName: name,
          metadata: { action: 'sent_credentials', username: cleanMobile, passcode, headerUrl: credHeaderUrl, headerType: 'image', btnText: 'Login Now', btnUrl: 'https://tnedms.com/login' },
        });
        return res.json({ success: true, message: `Login nudge sent to ${name} via approved template (window closed). The passcode isn't allowed inside templates by WhatsApp — it's shared inside the messaging window.`, result: tplResult });
      } catch (e) {
        const isBilling = e.code === 131042 || e.code === 131044 || /payment method|payment|billing/i.test(e.message || '');
        if (isBilling) {
          return res.status(402).json({ success: false, code: 'no_payment_method', message: 'Cannot send the template — your WhatsApp Business account has no payment method set up. Add one in Meta Business Settings → WhatsApp Manager → Billing & payments, then try again.' });
        }
        return res.status(400).json({ success: false, message: `Window closed and template send failed: ${e.message}. Ensure the '${WELCOME_TEMPLATE}' template is Approved (Templates panel).` });
      }
    }

    const defaultCredText = `Hello *{name}*!\n\nHere are your login credentials for the Election Management Portal:\n\n🔑 *Username:* \`{username}\`\n🔒 *Passcode:* \`{passcode}\`\n\nTap below to sign in:`;
    const bodyText = await getFlowMessageText('welcome_back_text', defaultCredText, {
      name,
      username: cleanMobile,
      passcode,
    });

    const asset = (await db.collection('app_flow_images').findOne({ key: 'welcome_back_header' })) || (await db.collection('app_flow_images').findOne({ key: 'register_success_header' }));
    let headerUrl = asset?.url ? String(asset.url).replace(/^http:\/\//, 'https://') : null;
    let headerType = asset?.type || (headerUrl?.includes('.mp4') ? 'video' : 'image');

    const result = await sendUrlButtonMessage(targetPhone, {
      bodyText,
      headerText: 'Login Credentials',
      btnText: 'Login Now',
      btnUrl: 'https://tnedms.com/login',
      headerUrl,
      headerType: headerUrl ? headerType : 'text',
    });

    await saveCrmMessage({
      phone: targetPhone,
      direction: 'outgoing',
      type: 'interactive',
      body: bodyText,
      waMessageId: result?.messages?.[0]?.id,
      contactName: name,
      metadata: { action: 'manual_crm_sent_credentials', passcode, username: cleanMobile },
    });

    return res.json({
      success: true,
      message: `Credentials sent to ${name} (${cleanMobile}) via WhatsApp!`,
      result,
    });
  } catch (err) {
    console.error('[CRM sendCredentials Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to send credentials.' });
  }
}

/**
 * POST /api/crm/send-flow — Send Meta WhatsApp Flow registration message via WhatsApp
 */
export async function sendFlow(req, res) {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    const db = getAppDb();
    const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);
    const targetPhone = String(phone).replace(/\D/g, '');

    if (!(await agentCanAccess(db, req, cleanMobile))) {
      return res.status(403).json({ success: false, message: 'This conversation is not assigned to you.' });
    }

    // Outside the window the interactive flow can't be sent — fall back to the
    // approved 'candidate_registration' template (Register Now button).
    const flowWin = await resolveWindow(db, cleanMobile);
    if (!flowWin.window_active) {
      try {
        const regHdrAsset = await db.collection('app_flow_images').findOne({ key: 'register_header' });
        let regHeaderUrl = regHdrAsset?.url ? String(regHdrAsset.url).replace(/^http:\/\//, 'https://') : 'https://tnedms.com/EDM.png';
        if (regHdrAsset?.type === 'video' || /\.mp4($|\?)/i.test(regHeaderUrl)) regHeaderUrl = 'https://tnedms.com/EDM.png';

        // The registration template's CTA is a WhatsApp Flow button — tapping it
        // opens the in-WhatsApp registration form.
        const tplResult = await sendTemplateMessage(targetPhone, {
          name: REGISTER_FLOW_TEMPLATE,
          language: 'en',
          headerImageUrl: regHeaderUrl,
          flowButton: { index: 0, flowToken: `register_${targetPhone}` },
        });
        await saveCrmMessage({
          phone: targetPhone,
          direction: 'outgoing',
          type: 'template',
          body: '🗳️ Registration invite sent via template (Register Now).',
          waMessageId: tplResult?.messages?.[0]?.id,
          metadata: { action: 'sent_registration_flow', template_name: REGISTER_FLOW_TEMPLATE, flowCta: 'Register Now', headerUrl: regHeaderUrl, headerType: 'image' },
        });
        return res.json({ success: true, message: 'Registration invite sent via approved template (window closed).', result: tplResult });
      } catch (e) {
        const isBilling = e.code === 131042 || e.code === 131044 || /payment method|payment|billing/i.test(e.message || '');
        if (isBilling) {
          return res.status(402).json({ success: false, code: 'no_payment_method', message: 'Cannot send the template — your WhatsApp Business account has no payment method set up. Add one in Meta Business Settings → WhatsApp Manager → Billing & payments, then try again.' });
        }
        return res.status(400).json({ success: false, message: `Window closed and template send failed: ${e.message}. Ensure a registration template is Approved (Templates panel).` });
      }
    }

    const defaultRegText = `Welcome! Register to access constituency insights, voter patterns, campaign tools, and local body election support.\n\nTap the button below to fill out the registration form inside WhatsApp.`;
    const bodyText = await getFlowMessageText('register_welcome_text', defaultRegText);

    const asset = await db.collection('app_flow_images').findOne({ key: 'register_header' });
    let headerUrl = asset?.url ? String(asset.url).replace(/^http:\/\//, 'https://') : null;
    let headerType = asset?.type || (headerUrl?.includes('.mp4') ? 'video' : 'image');

    const result = await sendFlowMessage(targetPhone, {
      flowCta: 'Register Now 🗳️',
      bodyText,
      headerText: 'Candidate Registration',
      flowToken: `register_${cleanMobile}`,
      headerUrl: headerUrl || undefined,
      headerType: headerUrl ? headerType : 'text',
    });

    await saveCrmMessage({
      phone: targetPhone,
      direction: 'outgoing',
      type: 'interactive',
      body: bodyText,
      waMessageId: result?.messages?.[0]?.id,
      contactName: `User ${cleanMobile.slice(-4)}`,
      metadata: {
        action: 'sent_registration_flow',
        headerUrl,
        headerType: headerUrl ? headerType : 'text',
        headerText: 'Candidate Registration',
        flowCta: 'Register Now 🗳️',
      },
    });

    return res.json({
      success: true,
      message: `WhatsApp Flow registration message sent to ${cleanMobile}!`,
      result,
    });
  } catch (err) {
    console.error('[CRM sendFlow Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to send WhatsApp Flow.' });
  }
}

/**
 * POST /api/crm/conversations/:phone/lead-status — Update CRM Lead Status (interested, not_interested, call_completed, pro_user)
 */
export async function updateLeadStatus(req, res) {
  try {
    const db = getAppDb();
    const { phone } = req.params;
    const { lead_status } = req.body;
    const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);

    const validStatuses = [
      'interested',
      'not_interested',
      'first_call_complete',
      'second_call_complete',
      'third_call_complete',
      'switch_off',
      'not_answered',
      'will_call_back',
      'call_completed',
      'none',
    ];
    if (!validStatuses.includes(lead_status)) {
      return res.status(400).json({ success: false, message: 'Invalid lead status.' });
    }

    if (!(await agentCanAccess(db, req, cleanMobile))) {
      return res.status(403).json({ success: false, message: 'This conversation is not assigned to you.' });
    }

    const agentName = req.user?.name || 'Admin';
    const agentId = currentAgentId(req) || 'admin';

    const note = String(req.body.note || '').trim();
    const updateDoc = {
      lead_status,
      last_handled_by: agentName,
      updated_at: new Date(),
    };
    if (typeof req.body.agent_notes !== 'undefined') {
      updateDoc.agent_notes = String(req.body.agent_notes || '').trim();
    }

    // Preserve the round-robin owner; only claim ownership if none is set yet.
    const existing = await db
      .collection('tbl_crm_conversation')
      .findOne({ clean_mobile: cleanMobile }, { projection: { assigned_agent_id: 1 } });
    if (!existing?.assigned_agent_id) {
      updateDoc.assigned_agent_id = agentId;
      updateDoc.assigned_agent_name = agentName;
    }

    // Append to the status-change history log (every click is recorded, even
    // repeats of the same status — e.g. calling the same lead twice).
    const historyEntry = { status: lead_status, note, by: agentName, at: new Date() };
    await db.collection('tbl_crm_conversation').updateOne(
      { clean_mobile: cleanMobile },
      { $set: updateDoc, $push: { status_history: historyEntry } }
    );

    return res.json({
      success: true,
      message: `Lead status updated to '${lead_status}' by ${agentName}.`,
    });
  } catch (err) {
    console.error('[CRM updateLeadStatus Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to update lead status.' });
  }
}

/**
 * POST /api/crm/conversations/:phone/notes — Update agent notes/comments for candidate
 */
export async function updateLeadNotes(req, res) {
  try {
    const db = getAppDb();
    const { phone } = req.params;
    const { agent_notes } = req.body;
    const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);

    if (!(await agentCanAccess(db, req, cleanMobile))) {
      return res.status(403).json({ success: false, message: 'This conversation is not assigned to you.' });
    }

    const agentName = req.user?.name || 'Admin';
    const agentId = currentAgentId(req) || 'admin';

    const setDoc = {
      agent_notes: String(agent_notes || '').trim(),
      last_handled_by: agentName,
      updated_at: new Date(),
    };
    const existing = await db
      .collection('tbl_crm_conversation')
      .findOne({ clean_mobile: cleanMobile }, { projection: { assigned_agent_id: 1 } });
    if (!existing?.assigned_agent_id) {
      setDoc.assigned_agent_id = agentId;
      setDoc.assigned_agent_name = agentName;
    }

    await db.collection('tbl_crm_conversation').updateOne(
      { clean_mobile: cleanMobile },
      { $set: setDoc }
    );

    return res.json({
      success: true,
      message: 'Agent notes/comments saved successfully!',
    });
  } catch (err) {
    console.error('[CRM updateLeadNotes Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to save notes.' });
  }
}

/**
 * POST /api/crm/conversations/:phone/status — Update thread status (open, resolved, archived)
 */
export async function updateStatus(req, res) {
  try {
    const db = getAppDb();
    const { phone } = req.params;
    const { status } = req.body;
    const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);

    if (!['open', 'resolved', 'archived'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Must be open, resolved, or archived.' });
    }

    if (!(await agentCanAccess(db, req, cleanMobile))) {
      return res.status(403).json({ success: false, message: 'This conversation is not assigned to you.' });
    }

    await db.collection('tbl_crm_conversation').updateOne(
      { clean_mobile: cleanMobile },
      { $set: { status, updated_at: new Date() } }
    );

    return res.json({ success: true, message: `Conversation status updated to ${status}.` });
  } catch (err) {
    console.error('[CRM updateStatus Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to update conversation status.' });
  }
}

/**
 * GET /api/crm/agents — Active CRM agents (for admin assign dropdown). Admin only.
 */
export async function listAgents(req, res) {
  try {
    if (isCrmAgent(req)) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    const db = getAppDb();
    const agents = await getActiveAgents(db);
    return res.json({ success: true, agents });
  } catch (err) {
    console.error('[CRM listAgents Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to list agents.' });
  }
}

/**
 * POST /api/crm/distribute-leads — Distribute conversations across active agents
 * in round-robin. By default only unassigned conversations are distributed;
 * pass { reassign_all: true } to rebalance every conversation. Admin only.
 */
export async function distributeLeads(req, res) {
  try {
    if (isCrmAgent(req)) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    const db = getAppDb();
    const reassignAll = req.body?.reassign_all === true;

    const agents = await getActiveAgents(db);
    if (!agents.length) {
      return res.status(400).json({ success: false, message: 'No active team members to assign leads to. Create/activate a team member first.' });
    }

    const filter = reassignAll
      ? {}
      : { $or: [{ assigned_agent_id: { $exists: false } }, { assigned_agent_id: null }, { assigned_agent_id: '' }] };

    const convos = await db
      .collection('tbl_crm_conversation')
      .find(filter, { projection: { clean_mobile: 1 } })
      .sort({ last_message_at: -1 })
      .toArray();

    if (!convos.length) {
      return res.json({ success: true, message: 'No conversations needed distribution.', assigned: 0, agents: agents.length });
    }

    // Continue rotation from the persisted pointer.
    const state = await db.collection('tbl_crm_settings').findOne({ _id: 'round_robin' });
    let idx = 0;
    if (state?.last_agent_id) {
      const pos = agents.findIndex((a) => a.id === String(state.last_agent_id));
      idx = pos === -1 ? 0 : (pos + 1) % agents.length;
    }

    const perAgent = {};
    const now = new Date();
    const ops = convos.map((c) => {
      const agent = agents[idx % agents.length];
      idx += 1;
      perAgent[agent.name] = (perAgent[agent.name] || 0) + 1;
      return {
        updateOne: {
          filter: { clean_mobile: c.clean_mobile },
          update: {
            $set: {
              assigned_agent_id: agent.id,
              assigned_agent_name: agent.name,
              assigned_at: now,
              assigned_by: 'distribute',
              updated_at: now,
            },
          },
        },
      };
    });

    if (ops.length) await db.collection('tbl_crm_conversation').bulkWrite(ops, { ordered: false });

    // Persist the last-used agent so future auto-assignment continues in order.
    const lastAgent = agents[(idx - 1 + agents.length) % agents.length];
    await db.collection('tbl_crm_settings').updateOne(
      { _id: 'round_robin' },
      { $set: { last_agent_id: lastAgent.id, updated_at: now } },
      { upsert: true }
    );

    return res.json({
      success: true,
      message: `Distributed ${ops.length} conversation(s) across ${agents.length} team member(s).`,
      assigned: ops.length,
      per_agent: perAgent,
    });
  } catch (err) {
    console.error('[CRM distributeLeads Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to distribute leads.' });
  }
}

/**
 * POST /api/crm/conversations/:phone/assign — Manually (re)assign a conversation
 * to a specific active agent. Admin only. Body: { agent_id }.
 */
export async function assignConversation(req, res) {
  try {
    if (isCrmAgent(req)) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    const db = getAppDb();
    const { phone } = req.params;
    const { agent_id } = req.body;
    const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);

    const agents = await getActiveAgents(db);
    const agent = agents.find((a) => a.id === String(agent_id));
    if (!agent) {
      return res.status(400).json({ success: false, message: 'Invalid or inactive team member.' });
    }

    const result = await db.collection('tbl_crm_conversation').updateOne(
      { clean_mobile: cleanMobile },
      {
        $set: {
          assigned_agent_id: agent.id,
          assigned_agent_name: agent.name,
          assigned_at: new Date(),
          assigned_by: 'manual',
          updated_at: new Date(),
        },
      }
    );

    if (!result.matchedCount) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    return res.json({ success: true, message: `Conversation assigned to ${agent.name}.` });
  } catch (err) {
    console.error('[CRM assignConversation Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to assign conversation.' });
  }
}

/**
 * POST /api/crm/conversations/:phone/send-media — Upload an attachment to
 * Cloudinary and send it as a WhatsApp image/video/document. Free-form media,
 * so only allowed while the messaging window is open. Body: { filename, mime, fileBase64, caption }
 */
export async function sendMedia(req, res) {
  try {
    const db = getAppDb();
    const { phone } = req.params;
    const { filename, mime, fileBase64, caption } = req.body || {};
    const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);
    const targetPhone = String(phone).replace(/\D/g, '');

    if (!(await agentCanAccess(db, req, cleanMobile))) {
      return res.status(403).json({ success: false, message: 'This conversation is not assigned to you.' });
    }
    if (!fileBase64) {
      return res.status(400).json({ success: false, message: 'No file provided.' });
    }

    const conv = await db.collection('tbl_crm_conversation').findOne({ clean_mobile: cleanMobile });
    const win = await resolveWindow(db, cleanMobile, conv);
    if (win.window_expires_at && !win.window_active) {
      return res.status(403).json({ success: false, code: 'window_closed', message: 'Messaging window closed — attachments can only be sent while the window is open. Use an approved template instead.' });
    }

    const mimeStr = String(mime || '');
    const isVideo = mimeStr.includes('video');
    const isImage = mimeStr.includes('image');
    const mediaType = isVideo ? 'video' : isImage ? 'image' : 'document';
    const resourceType = isVideo ? 'video' : isImage ? 'image' : 'auto';

    const b64 = String(fileBase64).replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(b64, 'base64');
    const uploaded = await cloudinary.upload(buffer, filename || 'attachment', resourceType, 'crm-attachments');

    const result = await sendMediaMessage(targetPhone, {
      mediaUrl: uploaded.url,
      mediaType,
      caption: caption || '',
      filename,
    });

    await saveCrmMessage({
      phone: targetPhone,
      direction: 'outgoing',
      type: mediaType,
      body: caption || `[${mediaType} attachment]`,
      waMessageId: result?.messages?.[0]?.id,
      metadata: {
        action: 'sent_media',
        headerUrl: uploaded.url,
        headerType: mediaType === 'video' ? 'video' : mediaType === 'image' ? 'image' : undefined,
      },
    });

    return res.json({ success: true, message: 'Attachment sent.', url: uploaded.url });
  } catch (err) {
    console.error('[CRM sendMedia Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to send attachment.' });
  }
}

/**
 * GET /api/crm/team-stats — Dashboard stats for the logged-in team member
 * (their assigned leads). Admins see all. Returns { total, interested,
 * not_interested, pro }.
 */
export async function teamStats(req, res) {
  try {
    const db = getAppDb();
    const filter = isCrmAgent(req) ? { assigned_agent_id: currentAgentId(req) } : {};
    const convos = await db
      .collection('tbl_crm_conversation')
      .find(filter, { projection: { clean_mobile: 1, lead_status: 1, is_registered: 1, status_history: 1 } })
      .toArray();

    const total = convos.length;
    const interested = convos.filter((c) => c.lead_status === 'interested').length;
    const not_interested = convos.filter((c) => c.lead_status === 'not_interested').length;
    const registered = convos.filter((c) => c.is_registered).length;

    let pro = 0;
    const mobiles = convos.map((c) => c.clean_mobile).filter(Boolean);
    if (mobiles.length) {
      pro = await db.collection('tbl_user').countDocuments({ mobile_no: { $in: mobiles }, paid_status: 'Yes' });
    }

    // Status distribution for the chart
    const CHART_STATUSES = ['interested', 'not_interested', 'call_completed', 'switch_off', 'not_answered', 'will_call_back'];
    const status_breakdown = CHART_STATUSES.map((s) => ({ status: s, count: convos.filter((c) => c.lead_status === s).length }));

    // Calls-completed metrics from the status history log
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(startToday); d.setDate(d.getDate() - i);
      last7.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-US', { weekday: 'short' }), count: 0 });
    }
    const last7Map = Object.fromEntries(last7.map((x) => [x.key, x]));
    let calls_today = 0, calls_total = 0;
    for (const c of convos) {
      for (const h of (c.status_history || [])) {
        if (h.status === 'call_completed') {
          calls_total += 1;
          const at = new Date(h.at);
          if (at >= startToday) calls_today += 1;
          const key = at.toISOString().slice(0, 10);
          if (last7Map[key]) last7Map[key].count += 1;
        }
      }
    }
    return res.json({ success: true, stats: { total, interested, not_interested, pro, registered, calls_today, calls_total, status_breakdown, calls_last_7_days: last7.map(({ label, count, key }) => ({ label, count, key })) } });
  } catch (err) {
    console.error('[CRM teamStats Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to load stats.' });
  }
}

/**
 * GET /api/crm/team-report — Lead list for the logged-in team member, used for
 * the report table and PDF export.
 */
export async function teamReport(req, res) {
  try {
    const db = getAppDb();
    const filter = isCrmAgent(req) ? { assigned_agent_id: currentAgentId(req) } : {};
    const { from, to } = req.query;
    const fromMs = from ? new Date(from).getTime() : null;
    const toMs = to ? new Date(to).getTime() : null;
    const hasRange = fromMs !== null || toMs !== null;
    const inRange = (d) => {
      if (!d) return false;
      const t = new Date(d).getTime();
      if (fromMs !== null && t < fromMs) return false;
      if (toMs !== null && t > toMs) return false;
      return true;
    };
    const convos = await db
      .collection('tbl_crm_conversation')
      .find(filter)
      .sort({ last_message_at: -1 })
      .toArray();

    const rows = [];
    for (const c of convos) {
      const history = Array.isArray(c.status_history) ? c.status_history : [];
      const periodChanges = hasRange ? history.filter((h) => inRange(h.at)) : history;
      const activityInRange = hasRange ? inRange(c.last_message_at) : true;
      if (hasRange && periodChanges.length === 0 && !activityInRange) continue;
      const latest = periodChanges.length ? periodChanges[periodChanges.length - 1] : null;
      rows.push({
        name: c.contact_name || `User ${String(c.clean_mobile || '').slice(-4)}`,
        mobile: c.clean_mobile,
        lead_status: latest ? latest.status : (c.lead_status || 'none'),
        status_changes: periodChanges.length,
        status_timeline: periodChanges.map((h) => ({ status: h.status, at: h.at, note: h.note || '', by: h.by || '' })),
        note: latest?.note || '',
        is_registered: !!c.is_registered,
        agent: c.assigned_agent_name || '-',
        last_activity: c.last_message_at || null,
        last_status_at: latest ? latest.at : null,
      });
    }

    return res.json({ success: true, agent: req.user?.name || 'Team', generated_at: new Date(), rows });
  } catch (err) {
    console.error('[CRM teamReport Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to load report.' });
  }
}

/**
 * POST /api/crm/conversations/:phone/react — React to a message with an emoji.
 * Body: { message_id (wamid), emoji }
 */
export async function reactToMessage(req, res) {
  try {
    const db = getAppDb();
    const { phone } = req.params;
    const { message_id, emoji } = req.body || {};
    const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);
    const targetPhone = String(phone).replace(/\D/g, '');

    if (!(await agentCanAccess(db, req, cleanMobile))) {
      return res.status(403).json({ success: false, message: 'This conversation is not assigned to you.' });
    }
    if (!message_id) return res.status(400).json({ success: false, message: 'message_id is required.' });

    await sendReaction(targetPhone, message_id, emoji || '');
    await db.collection('tbl_crm_message').updateOne(
      { wa_message_id: message_id, clean_mobile: cleanMobile },
      { $set: { 'metadata.reaction': emoji || '' } }
    );

    return res.json({ success: true, emoji: emoji || '' });
  } catch (err) {
    console.error('[CRM reactToMessage Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to react.' });
  }
}

// Parse a Cloudinary secure_url into { publicId, resourceType } for deletion.
function cloudinaryInfoFromUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('res.cloudinary.com')) return null;
    const parts = u.pathname.split('/').filter(Boolean); // [cloud, resType, 'upload', (vNNN?), ...publicId, name.ext]
    const resourceType = parts[1];
    const uploadIdx = parts.indexOf('upload');
    if (uploadIdx === -1) return null;
    let rest = parts.slice(uploadIdx + 1);
    if (rest[0] && /^v\d+$/.test(rest[0])) rest = rest.slice(1);
    const publicId = rest.join('/').replace(/\.[^/.]+$/, '');
    return { publicId, resourceType };
  } catch {
    return null;
  }
}

/**
 * DELETE /api/crm/conversations/:phone/clear — Clear a chat: delete all messages
 * and remove this chat's own media from Cloudinary (only crm-incoming /
 * crm-attachments folders — never the shared flow assets). Keeps the contact,
 * lead status and agent assignment.
 */
export async function clearChat(req, res) {
  try {
    const db = getAppDb();
    const { phone } = req.params;
    const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);

    if (!(await agentCanAccess(db, req, cleanMobile))) {
      return res.status(403).json({ success: false, message: 'This conversation is not assigned to you.' });
    }

    const msgs = await db.collection('tbl_crm_message').find({ clean_mobile: cleanMobile }).toArray();

    let deletedMedia = 0;
    for (const m of msgs) {
      const meta = m.metadata || {};
      const url = meta.mediaUrl || (meta.action === 'sent_media' ? meta.headerUrl : null);
      if (!url) continue;
      const info = cloudinaryInfoFromUrl(url);
      // Only remove per-chat uploads, never shared flow-asset headers.
      if (info?.publicId && (info.publicId.startsWith('crm-incoming') || info.publicId.startsWith('crm-attachments'))) {
        const ok = await cloudinary.destroy(info.publicId, info.resourceType || 'image');
        if (ok) deletedMedia += 1;
      }
    }

    await db.collection('tbl_crm_message').deleteMany({ clean_mobile: cleanMobile });
    await db.collection('tbl_crm_conversation').updateOne(
      { clean_mobile: cleanMobile },
      { $set: { last_message: '', unread_count: 0, updated_at: new Date() } }
    );

    return res.json({ success: true, deletedMessages: msgs.length, deletedMedia });
  } catch (err) {
    console.error('[CRM clearChat Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to clear chat.' });
  }
}
