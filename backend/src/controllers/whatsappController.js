import crypto from 'crypto';
import { getAppDb, getVoterDb } from '../config/db.js';
import { sendText, sendFlowMessage, sendUrlButtonMessage, getMediaInfo, downloadMediaBytes } from '../services/whatsappService.js';
import * as cloudinary from '../services/cloudinaryService.js';
import { decryptRequest, encryptResponse, getFlowPrivateKey } from '../services/flowCryptoService.js';
import { watiConfigured, sendWatiCredentials } from '../services/watiService.js';
import { URBAN_POSITIONS, RURAL_POSITIONS, districtsFor } from '../constants/localBodies.js';
import { ROLES } from '../constants/roles.js';
import { calculateWardPricing } from './paymentController.js';
import bcrypt from 'bcryptjs';

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'election2026_verification_token';

// --- Party flag images for the PARTY_SELECT flow screen ---
// WhatsApp Flow RadioButtonsGroup items support an inline `image` field, but it
// must be RAW base64 image bytes (not a URL). The whole data_exchange response
// payload is capped at ~300KB, so we pull small Cloudinary thumbnails and cache
// their base64 in memory to avoid re-downloading on every request.
const PARTY_FLAG_KEYS = {
  BJP: 'flag_bjp',
  DMK: 'flag_dmk',
  AIADMK: 'flag_aiadmk',
  INC: 'flag_inc',
  NTK: 'flag_ntk',
  PMK: 'flag_pmk',
  VCK: 'flag_vck',
  TVK: 'flag_tvk',
  Independent: 'flag_independent',
  Other: 'flag_other',
};

const BASE_PARTY_OPTIONS = [
  { id: 'BJP', title: 'BJP (Bharatiya Janata Party)' },
  { id: 'DMK', title: 'DMK' },
  { id: 'AIADMK', title: 'AIADMK' },
  { id: 'INC', title: 'INC (Congress)' },
  { id: 'NTK', title: 'Naam Tamilar Katchi (NTK)' },
  { id: 'PMK', title: 'PMK' },
  { id: 'VCK', title: 'VCK' },
  { id: 'TVK', title: 'TVK (Tamilaga Vettri Kazhagam)' },
  { id: 'Independent', title: 'Independent' },
  { id: 'Other', title: 'Other Party' },
];

const _flagImageCache = new Map(); // flagKey -> { url, b64, at }
const FLAG_IMAGE_TTL = 10 * 60 * 1000; // 10 minutes

// Rewrite a Cloudinary URL to a small, low-weight thumbnail so several flags
// together stay well under the 300KB per-response limit.
function toFlagThumbUrl(url) {
  if (!url) return url;
  let u = String(url).replace('http://', 'https://');
  if (u.includes('/upload/')) {
    u = u.replace('/upload/', '/upload/w_72,h_72,c_fit,q_auto:eco,f_jpg/');
  }
  return u;
}

async function fetchImageBase64(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`image fetch failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString('base64');
}

// Build the party_options array, attaching a base64 flag thumbnail (`image`)
// to any party that has an uploaded flag in app_flow_images. Parties without an
// uploaded flag simply render without a thumbnail.
async function buildPartyOptions(db) {
  const options = BASE_PARTY_OPTIONS.map((o) => ({ ...o }));
  try {
    const keys = Object.values(PARTY_FLAG_KEYS);
    const docs = await db.collection('app_flow_images').find({ key: { $in: keys } }).toArray();
    const byKey = {};
    for (const d of docs) byKey[d.key] = d;

    await Promise.all(options.map(async (opt) => {
      const key = PARTY_FLAG_KEYS[opt.id];
      const doc = key && byKey[key];
      if (!doc || !doc.url) return;
      try {
        const cached = _flagImageCache.get(key);
        let b64;
        if (cached && cached.url === doc.url && Date.now() - cached.at < FLAG_IMAGE_TTL) {
          b64 = cached.b64;
        } else {
          b64 = await fetchImageBase64(toFlagThumbUrl(doc.url));
          _flagImageCache.set(key, { url: doc.url, b64, at: Date.now() });
        }
        if (b64) opt.image = b64;
      } catch (e) {
        console.error(`[Party flag image ${opt.id}]:`, e.message);
      }
    }));
  } catch (e) {
    console.error('[buildPartyOptions Error]:', e.message);
  }
  return options;
}

// --- District -> Assembly -> Booth cascade helpers (mirror the web register page) ---
const ASSEMBLY_COLL = 'tbl_assembly_consitituency';
const MAX_FLOW_OPTIONS = 200; // WhatsApp Flow data-source item cap

// Assemblies belonging to a district (tolerant match, same rule as the web page).
async function assembliesForDistrict(db, district) {
  const all = await db.collection(ASSEMBLY_COLL).find({}).sort({ assembly_no: 1 }).toArray();
  const q = String(district || '').toLowerCase().trim();
  if (!q) return all;
  const matched = all.filter((a) => {
    const d = String(a.district || '').toLowerCase().trim();
    return d && (d.includes(q) || q.includes(d));
  });
  return matched.length ? matched : all;
}

// Resolve an assembly's display name from its assembly_no.
async function assemblyNameByNo(db, assemblyNo) {
  const no = parseInt(assemblyNo, 10);
  if (Number.isNaN(no)) return String(assemblyNo || '');
  const a = await db.collection(ASSEMBLY_COLL).findOne({ assembly_no: no });
  return a ? (a.assembly_name || `Assembly ${no}`) : String(assemblyNo);
}

// Distinct booths (PART_NO) for an assembly straight from the voter DB, matching
// BoothController@getBoothbyAssembly. Falls back to a generic 1..40 list if the
// voter DB is unreachable. Capped to the Flow option limit.
async function boothOptionsForAssembly(assemblyNo) {
  const options = [{ id: 'All Booths', title: 'All Booths in Constituency' }];
  const no = parseInt(assemblyNo, 10);
  if (Number.isNaN(no)) {
    for (let i = 1; i <= 40; i++) options.push({ id: `Booth ${i}`, title: `Booth Number ${i}` });
    return options;
  }
  try {
    const vdb = getVoterDb();
    const coll = vdb.collection(`ass_${no}`);
    const parts = await coll.aggregate([
      { $group: { _id: '$PART_NO', booth: { $first: '$BOOTH_NAME' } } },
      { $sort: { _id: 1 } },
    ]).toArray();
    const valid = parts.filter((p) => p._id !== null && p._id !== undefined && p._id !== '');
    for (const p of valid) {
      if (options.length >= MAX_FLOW_OPTIONS) break;
      const boothName = String(p.booth || '').trim();
      const title = boothName ? `Booth ${p._id} - ${boothName}` : `Booth ${p._id}`;
      options.push({ id: String(p._id), title: title.slice(0, 100) });
    }
    if (options.length === 1) {
      // No booths found in voter DB — provide a sensible generic fallback.
      for (let i = 1; i <= 40; i++) options.push({ id: `Booth ${i}`, title: `Booth Number ${i}` });
    }
  } catch (e) {
    console.error(`[boothOptionsForAssembly ass_${no}]:`, e.message);
    for (let i = 1; i <= 40; i++) options.push({ id: `Booth ${i}`, title: `Booth Number ${i}` });
  }
  return options;
}

// Every booth part number for an assembly (uncapped) — used to expand an
// "All Booths" selection into the full booth list on registration.
async function allBoothPartNumbers(assemblyNo) {
  const no = parseInt(assemblyNo, 10);
  if (Number.isNaN(no)) return [];
  try {
    const vdb = getVoterDb();
    const coll = vdb.collection(`ass_${no}`);
    const parts = await coll.distinct('PART_NO');
    return parts
      .filter((p) => p !== null && p !== undefined && p !== '')
      .map((p) => String(p))
      .sort((a, b) => Number(a) - Number(b));
  } catch (e) {
    console.error(`[allBoothPartNumbers ass_${no}]:`, e.message);
    return [];
  }
}

// Normalize the CheckboxGroup selection (array of booth ids) into an array.
function normalizeBooths(value) {
  if (Array.isArray(value)) return value.map((x) => String(x));
  if (value === undefined || value === null || value === '') return [];
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

// Friendly labels for the summary table.
const ROLE_LABELS = {
  planning: 'Planning to Contest',
  confirmed: 'Confirmed Candidate',
  team: 'Campaign Team Member',
  functionary: 'Party Functionary',
};
const AFFILIATION_LABELS = { affiliated: 'Affiliated with a party', independent: 'Independent' };
const BODY_TYPE_LABELS = { urban: 'Urban Local Body', rural: 'Rural Local Body' };

// Build a Markdown table (rendered by the RichText component on the summary screen).
// Pipe/newline chars in values are neutralised so they don't break the table.
function buildSummaryTable(v) {
  const esc = (s) => String(s ?? '-').replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim() || '-';
  const rows = [
    ['👤 Name', v.full_name],
    ['🎭 Role', ROLE_LABELS[v.role] || v.role],
    ['🤝 Affiliation', AFFILIATION_LABELS[v.affiliation] || v.affiliation],
    ['🚩 Party', v.party || 'Independent'],
    ['🏛️ Position', v.position],
    ['🏙️ Body Type', BODY_TYPE_LABELS[v.body_type] || v.body_type],
    ['📍 District', v.district],
    ['🗳️ Assembly', v.assembly],
    ['📌 Booth(s)', v.booths],
  ];
  const table = ['| Field | Value |', '| --- | --- |', ...rows.map(([f, val]) => `| ${f} | ${esc(val)} |`)].join('\n');
  return `# Registration Summary\n\nPlease review your details below, then tap **Submit Registration**.\n\n${table}`;
}

// Human-readable summary of the selected booths for the confirmation screen.
function summarizeBooths(list) {
  if (!list || !list.length) return 'None selected';
  if (list.includes('All Booths')) return 'All Booths in Constituency';
  const labels = list.map((id) => (/^\d+$/.test(String(id)) ? `Booth ${id}` : String(id)));
  if (labels.length <= 10) return labels.join(', ');
  return `${labels.slice(0, 10).join(', ')} + ${labels.length - 10} more (${labels.length} total)`;
}

/**
 * GET /api/whatsapp/webhook — Meta Webhook Verification
 */
export function webhookVerification(req, res) {
  const mode = req.query['hub.mode'] || req.query['hub_mode'];
  const token = req.query['hub.verify_token'] || req.query['hub_verify_token'];
  const challenge = req.query['hub.challenge'] || req.query['hub_challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] Verification successful!');
    return res.status(200).type('text/plain').send(challenge);
  }

  console.warn('[WhatsApp Webhook] Verification failed. Token mismatch.');
  return res.status(403).send('Forbidden');
}

/**
 * Active CRM team members (user_group_id = CRM_AGENT, is_active = 1), in a
 * stable order. New members get a higher `id`, so they naturally join the end
 * of the rotation and are included in round-robin automatically.
 */
export async function getActiveAgents(db) {
  const agents = await db
    .collection('tbl_user')
    .find({ user_group_id: ROLES.CRM_AGENT, is_active: 1 })
    .sort({ id: 1, _id: 1 })
    .toArray();
  return agents.map((a) => ({
    id: String(a._id),
    name: [a.first_name, a.last_name].filter(Boolean).join(' ') || a.mobile_no || 'Agent',
  }));
}

/**
 * Pick the next CRM agent in round-robin order. A pointer to the last-assigned
 * agent is persisted in tbl_crm_settings so assignment continues across
 * requests/restarts. Returns null when no active agents exist.
 */
export async function assignAgentRoundRobin(db) {
  const agents = await getActiveAgents(db);
  if (!agents.length) return null;

  const state = await db.collection('tbl_crm_settings').findOne({ _id: 'round_robin' });
  const lastId = state?.last_agent_id || null;

  let idx = 0;
  if (lastId) {
    const pos = agents.findIndex((a) => a.id === String(lastId));
    idx = pos === -1 ? 0 : (pos + 1) % agents.length;
  }
  const agent = agents[idx];

  await db.collection('tbl_crm_settings').updateOne(
    { _id: 'round_robin' },
    { $set: { last_agent_id: agent.id, updated_at: new Date() } },
    { upsert: true }
  );
  return agent;
}

/**
 * Helper to save CRM message & update conversation thread
 */
// Record a delivery-status receipt on the matching outgoing message. Detects
// the "no payment method / billing" failure so the CRM can prompt to add a card.
async function updateMessageDeliveryStatus(st) {
  const db = getAppDb();
  const id = st?.id;
  if (!id) return;
  const status = st.status || 'sent'; // sent | delivered | read | failed
  const set = { 'metadata.delivery_status': status, 'metadata.delivery_status_at': new Date() };

  if (status === 'failed') {
    const err = (Array.isArray(st.errors) && st.errors[0]) || {};
    const detail = err.error_data?.details || err.title || err.message || '';
    const paymentIssue = err.code === 131042 || err.code === 131044
      || /payment|billing|eligibil|not been set up to pay|method/i.test(detail);
    set['metadata.delivery_error'] = paymentIssue ? 'no_payment_method' : (detail || 'failed');
    set['metadata.delivery_error_detail'] = detail || '';
    console.warn(`[delivery failed] msg ${id}: ${detail} (payment=${paymentIssue})`);
  }

  await db.collection('tbl_crm_message').updateOne({ wa_message_id: id }, { $set: set });
}

export async function saveCrmMessage({ phone, direction, type, body, waMessageId, metadata = {}, contactName = null, referral = null }) {
  try {
    const db = getAppDb();
    const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);
    const now = new Date();

    // Insert message into tbl_crm_message (persist ad referral on incoming so we
    // can compute the 24h/72h messaging window from the user's last message).
    await db.collection('tbl_crm_message').insertOne({
      phone: String(phone).replace(/\D/g, ''),
      clean_mobile: cleanMobile,
      direction, // 'incoming' or 'outgoing'
      type, // 'text', 'interactive', 'flow_response'
      body,
      wa_message_id: waMessageId || null,
      metadata: referral ? { ...metadata, referral } : metadata,
      created_at: now,
    });

    // Check user registration status for conversation header
    let isRegistered = false;
    let name = null;

    const user = await db.collection('tbl_user').findOne({ mobile_no: cleanMobile });
    const enquiry = await db.collection('tbl_enquiry').findOne({ mobile: cleanMobile });

    if (user || enquiry) {
      isRegistered = true;
      name = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : (enquiry?.full_name || enquiry?.firstname);
    }

    if (!name || name.trim() === '') {
      if (contactName && !contactName.startsWith('User ')) {
        name = contactName;
      } else {
        // Check existing conversation contact_name
        const existingConv = await db.collection('tbl_crm_conversation').findOne({ clean_mobile: cleanMobile });
        if (existingConv?.contact_name && !existingConv.contact_name.startsWith('User ')) {
          name = existingConv.contact_name;
        } else {
          name = `User ${cleanMobile.slice(-4)}`;
        }
      }
    }

    // Round-robin assignment only when the conversation is first created, so a
    // contact stays with one agent and isn't reshuffled on every message.
    const existingConvo = await db
      .collection('tbl_crm_conversation')
      .findOne({ clean_mobile: cleanMobile }, { projection: { _id: 1 } });

    const onInsert = { status: 'open', created_at: now };
    if (!existingConvo) {
      const agent = await assignAgentRoundRobin(db);
      if (agent) {
        onInsert.assigned_agent_id = agent.id;
        onInsert.assigned_agent_name = agent.name;
        onInsert.assigned_at = now;
        onInsert.assigned_by = 'round_robin';
      }
    }

    const setFields = {
      phone: String(phone).replace(/\D/g, ''),
      clean_mobile: cleanMobile,
      contact_name: name,
      is_registered: isRegistered,
      last_message: body,
      last_message_at: now,
      updated_at: now,
    };

    // Every inbound message (re)opens the WhatsApp messaging window, based on the
    // user's last message: 72h if it arrived from a Click-to-WhatsApp ad
    // (message has a referral), otherwise the standard 24h for a direct "hi".
    if (direction === 'incoming') {
      const isAd = !!referral;
      const windowHours = isAd ? 72 : 24;
      setFields.last_inbound_at = now;
      setFields.window_source = isAd ? 'ad' : 'direct';
      setFields.window_hours = windowHours;
      setFields.window_expires_at = new Date(now.getTime() + windowHours * 3600 * 1000);
    }

    // Upsert conversation thread in tbl_crm_conversation
    await db.collection('tbl_crm_conversation').updateOne(
      { clean_mobile: cleanMobile },
      {
        $set: setFields,
        $setOnInsert: onInsert,
        $inc: { unread_count: direction === 'incoming' ? 1 : 0 },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error('[saveCrmMessage Error]:', err);
  }
}

/**
 * Helper to fetch uploaded Flow Image/Video asset from app_flow_images collection
 */
async function getFlowAsset(key) {
  try {
    const db = getAppDb();
    const asset = await db.collection('app_flow_images').findOne({ key });
    if (asset && asset.url) {
      let url = String(asset.url);
      if (url.startsWith('http://')) {
        url = url.replace('http://', 'https://');
      }
      return {
        headerUrl: url,
        headerType: asset.type || (url.includes('.mp4') ? 'video' : 'image'),
      };
    }
  } catch (err) {
    console.error(`[getFlowAsset Error for ${key}]:`, err);
  }
  return { headerUrl: null, headerType: 'text' };
}

/**
 * Helper to fetch dynamic welcome message text from app_flow_messages
 */
export async function getFlowMessageText(key, defaultText, replacements = {}) {
  try {
    const db = getAppDb();
    const doc = await db.collection('app_flow_messages').findOne({ key });
    let text = (doc && doc.text) ? doc.text : defaultText;

    for (const [placeholder, val] of Object.entries(replacements)) {
      text = text.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), val || '');
    }

    return text;
  } catch (err) {
    console.error(`[getFlowMessageText Error for ${key}]:`, err);
  }
  let text = defaultText;
  for (const [placeholder, val] of Object.entries(replacements)) {
    text = text.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), val || '');
  }
  return text;
}

/**
 * Handle incoming greeting ("Hi", "Hello") or general messages
 */
async function handleGreeting(phone, textBody, profileName = null) {
  const db = getAppDb();
  const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);
  console.log(`[WhatsApp Bot] Handling greeting from ${phone} (Clean: ${cleanMobile}, Profile: ${profileName})`);

  // Check if user exists in tbl_user or tbl_enquiry
  let user = await db.collection('tbl_user').findOne({
    $or: [
      { mobile_no: cleanMobile, is_user_login: true },
      { mobile_no: cleanMobile },
      { mobile_no: `91${cleanMobile}` },
    ]
  });

  let enquiry = await db.collection('tbl_enquiry').findOne({ mobile: cleanMobile });

  // Auto-bridge: if user exists in tbl_enquiry but not in tbl_user as login, auto-create user login!
  if (!user && enquiry) {
    console.log(`[WhatsApp Bot] Auto-creating login for enquiry record: ${cleanMobile}`);
    const passcode = enquiry.passcode || String(Math.floor(100000 + Math.random() * 900000));
    const fullName = enquiry.full_name || enquiry.firstname || 'Candidate';
    const district = enquiry.district || '-';
    const localBody = enquiry.panchayat_or_corporation || enquiry.union_or_municipality || '-';
    const wardNo = enquiry.ward_number || '-';

    const maxIdUser = await db.collection('tbl_user').find({}).sort({ id: -1 }).limit(1).toArray();
    const nextId = (maxIdUser[0]?.id || 30000) + 1;

    await db.collection('tbl_user').insertOne({
      id: nextId,
      first_name: fullName,
      last_name: '',
      email: `${cleanMobile}@election2026.in`,
      mobile_no: cleanMobile,
      password: await bcrypt.hash(passcode, 10),
      password_str: passcode,
      user_group_id: 6,
      status: 'Active',
      paid_status: enquiry.paid_status || 'No',
      district,
      local_body: localBody,
      ward_id: wardNo,
      is_user_login: true,
      created_at: new Date().toISOString(),
    });

    user = await db.collection('tbl_user').findOne({ mobile_no: cleanMobile, is_user_login: true });
  }

  // New behavior: send the "Choose Service" menu flow. The endpoint builds the
  // menu based on registration / purchase state. Falls back to the old direct
  // messages if the services flow isn't configured.
  if (SERVICES_FLOW_ID) {
    try {
      // Message header (the media on the "Choose Service" bubble) varies by state:
      // new user -> Registration Flow Header; registered -> Already Registered Header.
      const registered = !!(user || enquiry);
      const header = await getFlowAsset(registered ? 'welcome_back_header' : 'register_header');
      const bodyText = await getFlowMessageText('svc_welcome_text', 'Namaste\n\nWelcome to EDMS. Tap *Choose Service* below.');
      const res = await sendServicesMenuFlow(phone, header);
      await saveCrmMessage({
        phone,
        direction: 'outgoing',
        type: 'interactive',
        body: bodyText,
        waMessageId: res?.messages?.[0]?.id,
        contactName: (user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : null) || profileName || `User ${cleanMobile.slice(-4)}`,
        metadata: { action: 'sent_services_menu', headerUrl: header?.headerUrl, headerType: header?.headerUrl ? (header.headerType || 'image') : 'text', flowCta: 'Choose Service' },
      });
      return;
    } catch (e) {
      console.error('[WhatsApp Bot] services menu flow failed, falling back:', e.message);
    }
  }

  if (user) {
    // User is registered -> Send Login Credentials
    const passcode = user.password_str || cleanMobile;
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'User';

    const defaultWbText = `Welcome back *{name}*! You are already registered.\n\n🔑 *Username:* \`{username}\`\n🔒 *Passcode:* \`{passcode}\`\n\nUse these credentials to log in to the Election Management Dashboard.`;
    const bodyText = await getFlowMessageText('welcome_back_text', defaultWbText, {
      name,
      username: cleanMobile,
      passcode,
    });

    const wbAsset = await getFlowAsset('welcome_back_header');

    const res = await sendUrlButtonMessage(phone, {
      bodyText,
      headerText: 'Welcome Back',
      btnText: 'Login Now',
      btnUrl: 'https://election2026sir.in/login',
      headerUrl: wbAsset.headerUrl,
      headerType: wbAsset.headerType,
    });

    await saveCrmMessage({
      phone,
      direction: 'outgoing',
      type: 'interactive',
      body: bodyText,
      waMessageId: res?.messages?.[0]?.id,
      contactName: name,
      metadata: {
        action: 'sent_credentials',
        passcode,
        username: cleanMobile,
        headerUrl: wbAsset.headerUrl,
        headerType: wbAsset.headerType,
        headerText: 'Welcome Back',
        btnText: 'Login Now',
        btnUrl: 'https://election2026sir.in/login',
      },
    });
  } else {
    // User is NOT registered -> Send Meta WhatsApp Flow Registration Invitation
    const defaultRegText = `Welcome! Register to access constituency insights, voter patterns, campaign tools, and local body election support.\n\nTap the button below to fill out the registration form inside WhatsApp.`;
    const bodyText = await getFlowMessageText('register_welcome_text', defaultRegText);

    const regAsset = await getFlowAsset('register_header');

    const res = await sendFlowMessage(phone, {
      flowCta: 'Register Now 🗳️',
      bodyText,
      headerText: 'Candidate Registration',
      flowToken: `register_${cleanMobile}`,
      headerUrl: regAsset.headerUrl,
      headerType: regAsset.headerType,
    });

    await saveCrmMessage({
      phone,
      direction: 'outgoing',
      type: 'interactive',
      body: bodyText,
      waMessageId: res?.messages?.[0]?.id,
      contactName: profileName || `User ${cleanMobile.slice(-4)}`,
      metadata: {
        action: 'sent_registration_flow',
        headerUrl: regAsset.headerUrl,
        headerType: regAsset.headerType,
        headerText: 'Candidate Registration',
        flowCta: 'Register Now 🗳️',
      },
    });
  }
}

/**
 * Handle completed Meta WhatsApp Flow registration payload
 */
async function handleFlowResponse(phone, payload) {
  const db = getAppDb();
  console.log('[WhatsApp Flow Submission Payload]:', payload);

  const rawMobile = payload.mobile || phone;
  const cleanMobile = String(rawMobile).replace(/\D/g, '').slice(-10);
  const fullName = payload.full_name || payload.name || 'Candidate';
  const district = payload.district || '';
  const bodyType = payload.body_type || payload.category_name || payload.constituency_type || '';
  const position = payload.position || '';
  const localBody = payload.local_body_name || payload.local_body || '';
  const wardNo = payload.ward_number || payload.ward_no || payload.ward_id || '';
  // The flow's assembly dropdown carries the assembly_no in the assembly_name field.
  const assemblyNo = payload.assembly_no || payload.assembly_id || payload.assembly || payload.assembly_name || '';
  // Flow sends booth_numbers[] (multi-select CheckboxGroup); web sends booths[].
  let booths = [];
  if (Array.isArray(payload.booth_numbers)) booths = payload.booth_numbers.map(String);
  else if (Array.isArray(payload.booths)) booths = payload.booths.map(String);
  else if (payload.booth_numbers) booths = String(payload.booth_numbers).split(',').map((s) => s.trim()).filter(Boolean);
  else if (payload.booths) booths = String(payload.booths).split(',').map((s) => s.trim()).filter(Boolean);
  else if (payload.booth_number && payload.booth_number !== 'All Booths') booths = [String(payload.booth_number)];

  // "All Booths" means the whole constituency — expand to every real booth so
  // the saved record holds all booths (mirrors the web "Select All").
  if (booths.some((b) => String(b).toLowerCase() === 'all booths')) {
    const allParts = await allBoothPartNumbers(assemblyNo);
    booths = allParts.length ? allParts : ['All Booths'];
  }

  const passcode = String(Math.floor(100000 + Math.random() * 900000));
  const nowStr = new Date().toISOString();

  // 1. Save or update record in tbl_enquiry
  await db.collection('tbl_enquiry').updateOne(
    { mobile: cleanMobile },
    {
      $set: {
        mobile: cleanMobile,
        full_name: fullName,
        district,
        district_id: district,
        body_type: bodyType,
        category_name: bodyType,
        position,
        panchayat_or_corporation: localBody,
        ward_number: wardNo,
        ward_id: wardNo,
        assembly_id: assemblyNo,
        booths: booths,
        passcode,
        updated_at: nowStr,
      },
      $setOnInsert: {
        created_at: nowStr,
        paid_status: 'No',
      },
    },
    { upsert: true }
  );

  // 2. Create login in tbl_user if not exists or update existing user
  let user = await db.collection('tbl_user').findOne({ mobile_no: cleanMobile });
  if (!user) {
    const maxIdUser = await db.collection('tbl_user').find({}).sort({ id: -1 }).limit(1).toArray();
    const nextId = (maxIdUser[0]?.id || 30000) + 1;

    await db.collection('tbl_user').insertOne({
      id: nextId,
      first_name: fullName,
      last_name: '',
      email: `${cleanMobile}@election2026.in`,
      mobile_no: cleanMobile,
      password: await bcrypt.hash(passcode, 10),
      password_str: passcode,
      user_group_id: 4,
      group_id: 4,
      status: 'Active',
      paid_status: 'No',
      district,
      district_id: district,
      local_body: localBody,
      ward_id: wardNo,
      assembly_id: assemblyNo,
      booths: booths,
      candidate_type: bodyType,
      category_name: bodyType,
      position,
      is_user_login: true,
      created_at: nowStr,
    });
  } else {
    await db.collection('tbl_user').updateOne(
      { mobile_no: cleanMobile },
      {
        $set: {
          first_name: fullName,
          district,
          district_id: district,
          local_body: localBody,
          ward_id: wardNo,
          assembly_id: assemblyNo || user.assembly_id,
          booths: booths.length > 0 ? booths : user.booths,
          candidate_type: bodyType,
          category_name: bodyType,
          position,
          updated_at: nowStr,
        },
      }
    );
  }

  // 3. Send WhatsApp Confirmation with Login Credentials
  const defaultSuccessText = `Congratulations *{name}*! 🎉 Your registration has been completed successfully.\n\n🔑 *Username:* \`{username}\`\n🔒 *Passcode:* \`{passcode}\`\n\nTap below to log in to your Election Management Dashboard!`;
  const confirmBody = await getFlowMessageText('register_success_text', defaultSuccessText, {
    name: fullName,
    username: cleanMobile,
    passcode,
  });

  const succAsset = await getFlowAsset('register_success_header');

  const res = await sendUrlButtonMessage(phone, {
    bodyText: confirmBody,
    headerText: 'Registration Complete',
    btnText: 'Login Now',
    btnUrl: 'https://election2026sir.in/login',
    headerUrl: succAsset.headerUrl,
    headerType: succAsset.headerType,
  });

  await saveCrmMessage({
    phone,
    direction: 'outgoing',
    type: 'interactive',
    body: confirmBody,
    waMessageId: res?.messages?.[0]?.id,
    contactName: fullName,
    metadata: {
      action: 'flow_registration_success',
      passcode,
      username: cleanMobile,
      headerUrl: succAsset.headerUrl,
      headerType: succAsset.headerType,
      headerText: 'Registration Complete',
      btnText: 'Login Now',
      btnUrl: 'https://election2026sir.in/login',
    },
  });

  // Also deliver credentials via WATI (approved template) — best-effort.
  if (watiConfigured()) {
    sendWatiCredentials({ mobile: cleanMobile, name: fullName, username: cleanMobile, passcode })
      .catch((e) => console.error('[WATI flow registration]', e.message));
  }
}

/**
 * Download an incoming WhatsApp media message and re-host it on Cloudinary so
 * the CRM can display / offer it for download. Returns null on failure.
 */
async function processIncomingMedia(message) {
  try {
    const kind = message.type; // image | video | audio | document | sticker | voice
    const obj = message[kind] || {};
    if (!obj.id) return null;

    const info = await getMediaInfo(obj.id);
    const buffer = await downloadMediaBytes(info.url);
    const mime = obj.mime_type || info.mime_type || 'application/octet-stream';

    const mediaType = mime.includes('image') ? 'image'
      : mime.includes('video') ? 'video'
      : mime.includes('audio') ? 'audio' : 'document';
    const resourceType = mediaType === 'image' ? 'image' : mediaType === 'video' ? 'video' : 'auto';

    const ext = (mime.split('/')[1] || 'bin').split(';')[0];
    const filename = obj.filename || `${kind}_${Date.now()}.${ext}`;

    const uploaded = await cloudinary.upload(buffer, filename, resourceType, 'crm-incoming');

    return {
      mediaUrl: uploaded.url,
      mediaType,
      mime,
      filename,
      caption: obj.caption || '',
    };
  } catch (e) {
    console.error('[processIncomingMedia Error]:', e.message);
    return null;
  }
}

/**
 * POST /api/whatsapp/webhook — Meta Webhook Events & Flow Response Receiver
 */
export async function webhookHandler(req, res) {
  try {
    // Verify the request really came from Meta: X-Hub-Signature-256 is an HMAC of
    // the raw body keyed with the app secret. Only enforced when the secret is
    // configured (so the webhook keeps working until META_APP_SECRET is set).
    const appSecret = process.env.META_APP_SECRET;
    const verifyEnabled = (process.env.WHATSAPP_VERIFY_SIGNATURE ?? 'true') !== 'false';
    if (appSecret && verifyEnabled) {
      const sig = req.headers['x-hub-signature-256'] || '';
      const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
      const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex');
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        console.warn('[WhatsApp Webhook] Signature verification failed — rejecting.');
        return res.status(401).json({ success: false });
      }
    } else {
      console.warn('[WhatsApp Webhook] META_APP_SECRET not set — signature check skipped.');
    }

    const body = req.body;
    // Avoid logging full payloads (phone numbers + message content = PII) in
    // production; keep verbose dumps for local debugging only.
    if (process.env.NODE_ENV !== 'production') {
      console.log('[WhatsApp Webhook Event]:', JSON.stringify(body));
    }

    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    const profileName = value?.contacts?.[0]?.profile?.name || null;

    // ---- Delivery status receipts (sent / delivered / read / FAILED) ----
    // Templates sent outside the window are "accepted" by the send API but can
    // still fail delivery (e.g. no payment method on the WABA). That only shows
    // up here, so we record it on the message for the CRM to surface.
    const statuses = value?.statuses;
    if (Array.isArray(statuses) && statuses.length) {
      for (const st of statuses) {
        try { await updateMessageDeliveryStatus(st); } catch (e) { console.error('[delivery status]', e.message); }
      }
    }

    if (message) {
      const phone = message.from;
      const msgId = message.id;
      const textBody = message.text?.body || '';

      const maskedPhone = String(phone || '').replace(/^(\d{2})\d+(\d{2})$/, '$1****$2');
      console.log(`[WhatsApp Webhook Message] From: ${maskedPhone}, Type: ${message.type}`);

      // Save incoming message in CRM
      let type = message.type || 'text';
      let incomingBody = textBody;

      // Check if it's a Meta Flow completion reply
      const nfmReply = message.interactive?.nfm_reply;
      if (nfmReply && nfmReply.response_json) {
        console.log('[WhatsApp Webhook] Received Meta Flow Response JSON!');
        type = 'flow_response';
        const flowPayload = typeof nfmReply.response_json === 'string' ? JSON.parse(nfmReply.response_json) : nfmReply.response_json;
        incomingBody = `Submitted Flow Registration: ${flowPayload.full_name || profileName || 'Candidate'} (${flowPayload.mobile || phone})`;

        await saveCrmMessage({
          phone,
          direction: 'incoming',
          type,
          body: incomingBody,
          waMessageId: msgId,
          contactName: flowPayload.full_name || profileName,
          metadata: { flowPayload },
          referral: message.referral || null,
        });

        // Route Choose-Service completions (social request / purchase) separately
        // from the registration flow, which shares this endpoint.
        if (flowPayload.kind === 'social_request' || flowPayload.kind === 'purchase') {
          await handleServicesComplete(phone, flowPayload);
        } else if (flowPayload.kind === 'svc_info' && flowPayload.action) {
          // Deferred action: the user tapped Close on an INFO screen — now send
          // the chat message they asked for (credentials / register / demo / …).
          await handleServicesInfoAction(phone, flowPayload.action);
        } else if (flowPayload.full_name || flowPayload.mobile) {
          await handleFlowResponse(phone, flowPayload);
        } else {
          // Benefits / FAQ / Info screens complete with an empty payload — no action.
          console.log('[WhatsApp Webhook] Flow completed with no actionable payload.');
        }
      } else if (['image', 'video', 'audio', 'document', 'sticker', 'voice'].includes(message.type)) {
        // Incoming multimedia — download from Meta, store on Cloudinary, render in CRM.
        const media = await processIncomingMedia(message);
        const kind = message.type === 'voice' ? 'audio' : message.type;
        await saveCrmMessage({
          phone,
          direction: 'incoming',
          type: kind,
          body: media?.caption || '',
          waMessageId: msgId,
          contactName: profileName,
          referral: message.referral || null,
          metadata: media ? { mediaUrl: media.mediaUrl, mediaType: media.mediaType, mime: media.mime, filename: media.filename } : {},
        });

        // If this is an audio/voice message and the contact has a social request
        // awaiting an audio file, attach it and mark the request ready.
        if ((kind === 'audio') && media?.mediaUrl) {
          try { await attachAudioToPendingRequest(phone, media); } catch (e) { console.error('[svc audio attach]', e.message); }
        }
      } else {
        // Standard text or interactive message
        await saveCrmMessage({
          phone,
          direction: 'incoming',
          type,
          body: incomingBody || '[Interactive Message]',
          waMessageId: msgId,
          contactName: profileName,
          referral: message.referral || null,
        });

        await handleGreeting(phone, textBody, profileName);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[WhatsApp Webhook Processing Error]:', err);
    return res.status(200).json({ success: true }); // Always return 200 to Meta
  }
}

// ─────────────────── "Choose Service" flow (separate published flow) ───────────────────
const SERVICES_FLOW_ID = process.env.SERVICES_FLOW_ID || '';

// Fetch a Cloudinary image, resized via URL transform, as raw base64 (Flow Image
// components need base64, not a URL). Returns '' on any failure (icon optional).
async function cloudinaryB64(url, w, h) {
  if (!url) return '';
  try {
    let u = String(url).replace(/^http:\/\//, 'https://');
    if (u.includes('/upload/')) u = u.replace('/upload/', `/upload/w_${w},h_${h},c_fill,q_70,f_jpg/`);
    const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return '';
    return Buffer.from(await res.arrayBuffer()).toString('base64');
  } catch { return ''; }
}

function svcPhoneFromToken(token) {
  return String(token || '').replace(/^svc_/, '').replace(/\D/g, '').slice(-10);
}

// Download a flow-uploaded media item (DocumentPicker/PhotoPicker returns
// { id, mime_type, sha256, file_name }) via the Graph media API and re-host it
// on Cloudinary. Returns { url, mime, filename } or null.
async function downloadFlowMediaToCloudinary(item) {
  try {
    const id = item?.id || item?.media_id;
    if (!id) return null;
    const info = await getMediaInfo(String(id));
    const buffer = await downloadMediaBytes(info.url);
    const mime = item.mime_type || info.mime_type || 'application/octet-stream';
    const resourceType = mime.includes('image') ? 'image' : mime.includes('video') ? 'video' : 'auto';
    const filename = item.file_name || `flow_${Date.now()}`;
    const uploaded = await cloudinary.upload(buffer, filename, resourceType, 'social-requests');
    return { url: uploaded.url, mime, filename };
  } catch (e) {
    console.error('[downloadFlowMediaToCloudinary]', e.message);
    return null;
  }
}

// Build the service menu, varying by registration / purchase state.
async function buildServicesMenu(db, { registered, purchased }) {
  const defs = [];
  if (!registered) {
    defs.push({ id: 'register', title: 'Register', description: 'Create your EDMS account', icon: 'svc_icon_register' });
  } else {
    defs.push({ id: 'credentials', title: 'My Credentials', description: 'Get your login details', icon: 'svc_icon_credentials' });
    defs.push({ id: 'social', title: 'Social Media Request', description: 'WhatsApp / Audio / SMS broadcast', icon: 'svc_icon_social' });
    defs.push({ id: 'purchase', title: purchased ? 'My Plan' : 'Purchase', description: purchased ? 'View your subscription' : 'Activate your subscription', icon: 'svc_icon_purchase' });
  }
  defs.push({ id: 'demo', title: 'Demo', description: 'Watch a quick demo', icon: 'svc_icon_demo' });
  defs.push({ id: 'benefits', title: 'Benefits', description: 'Why EDMS', icon: 'svc_icon_benefits' });
  defs.push({ id: 'faq', title: 'FAQ', description: 'Common questions', icon: 'svc_icon_faq' });
  defs.push({ id: 'website', title: 'Website', description: 'Visit our website', icon: 'svc_icon_website' });
  defs.push({ id: 'support', title: 'Support', description: 'Talk to our team', icon: 'svc_icon_support' });

  return Promise.all(defs.map(async (d) => {
    const item = { id: d.id, title: d.title, description: d.description };
    const asset = await getFlowAsset(d.icon);
    if (asset?.headerUrl) {
      const b64 = await cloudinaryB64(asset.headerUrl, 200, 200);
      if (b64) item.image = b64;
    }
    return item;
  }));
}

// Send the Choose-Service menu flow (used by greeting + to re-open the menu).
// `headerAsset` optionally overrides the message header media (state-based:
// register_header for new users, welcome_back_header for registered users).
async function sendServicesMenuFlow(phone, headerAsset = null) {
  const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);
  const banner = headerAsset || await getFlowAsset('svc_welcome_banner');
  const bodyText = await getFlowMessageText('svc_welcome_text', 'Namaste\n\nWelcome to EDMS. Tap *Choose Service* below.');
  return sendFlowMessage(phone, {
    flowId: SERVICES_FLOW_ID,
    flowCta: 'Choose Service',
    flowAction: 'data_exchange',
    bodyText,
    headerText: banner?.headerUrl ? undefined : 'EDMS',
    headerUrl: banner?.headerUrl || null,
    headerType: banner?.headerUrl ? (banner.headerType || 'image') : 'text',
    flowToken: `svc_${cleanMobile}`,
    footerText: 'EDMS',
  });
}

// Send the (existing) registration flow to a contact.
async function sendRegisterFlowTo(phone) {
  const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);
  const bodyText = await getFlowMessageText('register_welcome_text', 'Tap the button below to register.');
  const regAsset = await getFlowAsset('register_header');
  const res = await sendFlowMessage(phone, {
    flowCta: 'Register Now 🗳️',
    bodyText,
    headerText: 'Candidate Registration',
    flowToken: `register_${cleanMobile}`,
    headerUrl: regAsset.headerUrl,
    headerType: regAsset.headerType,
  });
  await saveCrmMessage({ phone: String(phone).replace(/\D/g, ''), direction: 'outgoing', type: 'interactive', body: bodyText, waMessageId: res?.messages?.[0]?.id, metadata: { action: 'sent_registration_flow', headerUrl: regAsset.headerUrl, headerType: regAsset.headerType, flowCta: 'Register Now 🗳️' } });
}

// Send the login-credentials message to a registered contact.
async function sendCredentialsTo(phone) {
  const db = getAppDb();
  const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);
  const user = await db.collection('tbl_user').findOne({ mobile_no: cleanMobile });
  const enquiry = await db.collection('tbl_enquiry').findOne({ mobile: cleanMobile });
  const name = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : (enquiry?.full_name || enquiry?.firstname || 'User');
  const passcode = user?.password_str || enquiry?.passcode || cleanMobile;
  const bodyText = await getFlowMessageText('welcome_back_text',
    'Welcome back *{name}*! You are already registered.\n\n🔑 *Username:* `{username}`\n🔒 *Passcode:* `{passcode}`\n\nUse these to log in.',
    { name, username: cleanMobile, passcode });
  const wbAsset = await getFlowAsset('welcome_back_header');
  const res = await sendUrlButtonMessage(phone, {
    bodyText, headerText: 'Welcome Back', btnText: 'Login Now', btnUrl: 'https://election2026sir.in/login',
    headerUrl: wbAsset.headerUrl, headerType: wbAsset.headerType,
  });
  await saveCrmMessage({ phone: String(phone).replace(/\D/g, ''), direction: 'outgoing', type: 'interactive', body: bodyText, waMessageId: res?.messages?.[0]?.id, contactName: name, metadata: { action: 'sent_credentials', passcode, username: cleanMobile, headerUrl: wbAsset.headerUrl, headerType: wbAsset.headerType, btnText: 'Login Now', btnUrl: 'https://election2026sir.in/login' } });
}

// Send Demo (video + Choose Service CTA), Website (image + URL button), Support (image + Choose Service CTA + phone in body).
async function sendServiceContent(phone, kind) {
  const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);
  if (kind === 'demo') {
    const v = await getFlowAsset('svc_demo_video');
    const body = await getFlowMessageText('svc_demo_text', 'Here is a quick demo of EDMS.');
    await sendFlowMessage(phone, { flowId: SERVICES_FLOW_ID, flowCta: 'Choose Service', flowAction: 'data_exchange', bodyText: body, headerUrl: v.headerUrl || null, headerType: v.headerUrl ? 'video' : 'text', headerText: v.headerUrl ? undefined : 'EDMS Demo', flowToken: `svc_${cleanMobile}`, footerText: 'EDMS' });
  } else if (kind === 'website') {
    const img = await getFlowAsset('svc_website_image');
    const body = await getFlowMessageText('svc_website_text', 'Explore EDMS on our website.');
    const url = await getFlowMessageText('svc_website_url', 'https://election2026sir.in');
    const btn = await getFlowMessageText('svc_website_btn', 'Visit Website');
    await sendUrlButtonMessage(phone, { bodyText: body, headerText: img.headerUrl ? undefined : 'EDMS', btnText: btn, btnUrl: url, headerUrl: img.headerUrl, headerType: img.headerUrl ? 'image' : 'text' });
  } else if (kind === 'support') {
    const img = await getFlowAsset('svc_support_image');
    const phoneNo = await getFlowMessageText('svc_support_phone', '918106811285');
    let body = await getFlowMessageText('svc_support_text', 'Need help? Our team is here for you.');
    body += `\n\nCall us: +${String(phoneNo).replace(/\D/g, '')}`;
    await sendFlowMessage(phone, { flowId: SERVICES_FLOW_ID, flowCta: 'Choose Service', flowAction: 'data_exchange', bodyText: body, headerUrl: img.headerUrl || null, headerType: img.headerUrl ? 'image' : 'text', headerText: img.headerUrl ? undefined : 'EDMS Support', flowToken: `svc_${cleanMobile}`, footerText: 'EDMS' });
  }
}

// INFO terminal screen. `action` (optional) is echoed back in the flow's
// completion payload so the webhook can send the corresponding chat message
// only after the user taps Close (not while the INFO screen is still open).
const INFO = (title, body, action = '') => ({ version: '3.0', screen: 'INFO', data: { info_title: title, info_body: body, action } });

// Perform a deferred INFO action once the flow has closed.
async function handleServicesInfoAction(phone, action) {
  try {
    if (action === 'credentials') return await sendCredentialsTo(phone);
    if (action === 'demo') return await sendServiceContent(phone, 'demo');
    if (action === 'website') return await sendServiceContent(phone, 'website');
    if (action === 'support') return await sendServiceContent(phone, 'support');
  } catch (e) {
    console.error('[svc info action]', action, e.message);
  }
}

// Main services-flow handler (token prefix svc_). Returns a { version, screen, data } response.
async function handleServicesFlow({ action, screen, data, flow_token, db }) {
  const cleanMobile = svcPhoneFromToken(flow_token);
  const phone = cleanMobile;
  const user = await db.collection('tbl_user').findOne({ mobile_no: cleanMobile });
  const enquiry = await db.collection('tbl_enquiry').findOne({ mobile: cleanMobile });
  const registered = !!(user || enquiry);
  const purchased = String(user?.paid_status || enquiry?.paid_status || 'No').toLowerCase() === 'yes';

  // INIT (or no screen) → main menu
  if (action === 'INIT' || !screen) {
    const banner = await getFlowAsset('svc_welcome_banner');
    const bannerB64 = banner?.headerUrl ? await cloudinaryB64(banner.headerUrl, 1000, 125) : '';
    const heading = await getFlowMessageText('svc_menu_heading', 'Select a service');
    return {
      version: '3.0',
      screen: 'SERVICE_SELECT',
      data: {
        welcome_banner: bannerB64,
        has_welcome_banner: !!bannerB64,
        menu_heading: heading,
        services: await buildServicesMenu(db, { registered, purchased }),
      },
    };
  }

  // Registration screens run inside this flow (Register option). Delegate to the
  // shared registration logic; SUMMARY_SUBMIT completes with the registration
  // payload, which the webhook routes to handleFlowResponse.
  if (REGISTRATION_SCREENS.has(screen)) {
    const resp = await registrationScreenResponse({ action, screen, data, db });
    if (resp) return resp;
  }

  if (action === 'data_exchange' && screen === 'SERVICE_SELECT') {
    const sel = data?.selected_service;

    // Register opens the registration screens inside this same flow.
    if (sel === 'register') return { version: '3.0', screen: 'WELCOME', data: {} };
    // These send a chat message; defer the send to flow completion (on Close) by
    // echoing the action in the INFO payload — the webhook sends it afterwards.
    if (sel === 'credentials') return INFO('Your Credentials', 'Tap Close and your login details will be sent to you in the chat.', 'credentials');
    if (sel === 'demo') return INFO('Demo', 'Tap Close and your demo will be sent to you in the chat.', 'demo');
    if (sel === 'website') return INFO('Website', 'Tap Close and our website link will be sent to you in the chat.', 'website');
    if (sel === 'support') return INFO('Support', 'Tap Close and our support details will be sent to you in the chat.', 'support');

    if (sel === 'benefits') {
      const b = await getFlowAsset('svc_benefits_banner');
      return { version: '3.0', screen: 'BENEFITS', data: { banner: b?.headerUrl ? await cloudinaryB64(b.headerUrl, 1000, 125) : '', has_banner: !!b?.headerUrl, content: await getFlowMessageText('svc_benefits_text', 'EDMS benefits.') } };
    }
    if (sel === 'faq') {
      const b = await getFlowAsset('svc_faq_banner');
      return { version: '3.0', screen: 'FAQ', data: { banner: b?.headerUrl ? await cloudinaryB64(b.headerUrl, 1000, 125) : '', has_banner: !!b?.headerUrl, content: await getFlowMessageText('svc_faq_text', 'FAQ.') } };
    }

    if (sel === 'social') {
      if (!registered) return INFO('Register first', 'Please register before sending a social media request.');
      const b = await getFlowAsset('svc_social_banner');
      const chan = async (id, title, desc, icon) => { const it = { id, title, description: desc }; const a = await getFlowAsset(icon); if (a?.headerUrl) { const x = await cloudinaryB64(a.headerUrl, 200, 200); if (x) it.image = x; } return it; };
      return {
        version: '3.0', screen: 'SOCIAL_SELECT',
        data: {
          banner: b?.headerUrl ? await cloudinaryB64(b.headerUrl, 1000, 125) : '', has_banner: !!b?.headerUrl,
          channels: [
            await chan('whatsapp', 'WhatsApp', 'WhatsApp broadcast', 'svc_icon_whatsapp'),
            await chan('audio', 'Audio SMS', 'Voice call broadcast', 'svc_icon_audio'),
            await chan('sms', 'SMS Broadcast', 'Text SMS broadcast', 'svc_icon_sms'),
          ],
        },
      };
    }

    if (sel === 'purchase') {
      const b = await getFlowAsset('svc_purchase_banner');
      const bannerB64 = b?.headerUrl ? await cloudinaryB64(b.headerUrl, 1000, 125) : '';
      const booths = Array.isArray(user?.booths) ? user.booths.length : 0;
      if (purchased) {
        const planText = `Status: ✅ Active\nBooths: ${booths || '-'}\nAssembly: ${user?.assembly_name || user?.assembly_id || '-'}`;
        return { version: '3.0', screen: 'PURCHASE', data: { banner: bannerB64, has_banner: !!bannerB64, plan_title: 'Your EDMS Plan', plan_text: planText, cta_label: 'Close' } };
      }
      const intro = await getFlowMessageText('svc_purchase_intro_text', 'Activate your EDMS subscription.');
      const planText = `${intro}\n\nTap below and we'll send your secure payment link in the chat.`;
      return { version: '3.0', screen: 'PURCHASE', data: { banner: bannerB64, has_banner: !!bannerB64, plan_title: 'EDMS Subscription', plan_text: planText, cta_label: 'Get Payment Link' } };
    }

    return INFO('EDMS', 'Please type *hi* to open the menu again.');
  }

  if (action === 'data_exchange' && screen === 'SOCIAL_SELECT') {
    const channel = data?.social_channel;
    // Already-requested guard: if an open request exists for this channel, show
    // the "already requested" screen instead of opening the form again.
    if (['whatsapp', 'audio', 'sms'].includes(channel)) {
      const open = await db.collection('tbl_social_request').findOne({ mobile: cleanMobile, channel, status: { $in: OPEN_REQUEST_STATUSES } });
      if (open) {
        const already = await getFlowMessageText('svc_social_already_text',
          'You already have a pending *{channel}* request. Our team is processing it — we\'ll update you soon.',
          { channel: channel.toUpperCase() });
        return INFO('Already Requested', already);
      }
    }
    const name = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : (enquiry?.full_name || enquiry?.firstname || '');
    const audience_options = [
      { id: 'all', title: 'All Voters' },
      { id: 'booth', title: 'By Booth' },
      { id: 'section', title: 'By Section' },
    ];
    // Note: Flow Dropdown items must have a non-empty id — use 'all' as the
    // "no filter" sentinel (normalized back to '' on submission).
    let booth_options = [{ id: 'all', title: 'All Booths' }];
    try {
      const asmNo = user?.assembly_id || enquiry?.assembly_id;
      if (asmNo) {
        const bo = await boothOptionsForAssembly(String(asmNo));
        if (Array.isArray(bo) && bo.length) booth_options = booth_options.concat(bo.slice(0, 100));
      }
    } catch { /* ignore */ }
    const section_options = [{ id: 'all', title: 'All Sections' }];
    const base = { init_name: name, init_phone: `91${cleanMobile}`, audience_options, booth_options, section_options };
    if (channel === 'whatsapp') return { version: '3.0', screen: 'WA_FORM', data: base };
    if (channel === 'audio') return { version: '3.0', screen: 'AUDIO_FORM', data: base };
    if (channel === 'sms') return { version: '3.0', screen: 'SMS_FORM', data: { ...base, language_options: [{ id: 'ta', title: 'Tamil' }, { id: 'en', title: 'English' }, { id: 'te', title: 'Telugu' }, { id: 'hi', title: 'Hindi' }] } };
    return INFO('EDMS', 'Please type *hi* to open the menu again.');
  }

  // Fallback
  return INFO('EDMS', 'Please type *hi* to open the menu again.');
}

// Statuses that count as an open request for the "already requested" guard.
const OPEN_REQUEST_STATUSES = ['pending', 'awaiting_audio', 'processing'];

// Create a Razorpay hosted payment link (rzp.io) for a Ward subscription and
// return its URL. Mirrors paymentController.createWardOrder's link creation so
// the existing payment.captured webhook auto-marks the user paid.
async function createServicesPaymentLink({ mobile, name, email, boothCount, userId }) {
  const key = process.env.RAZORPAY_KEY;
  const secret = process.env.RAZORPAY_SECRET;
  if (!key || !secret) return { url: null, pricing: calculateWardPricing(boothCount) };
  const pricing = calculateWardPricing(boothCount, mobile);
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const rawMobile = String(mobile || '').replace(/\D/g, '');
  const contact = rawMobile.length === 10 ? `+91${rawMobile}` : (rawMobile ? `+${rawMobile}` : undefined);
  const resp = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: pricing.amountPaise,
      currency: 'INR',
      accept_partial: false,
      description: `EDMS Ward Subscription (${pricing.boothCount} Booths)`,
      reference_id: `wa_${rawMobile}_${Date.now()}`,
      customer: { name: name || 'EDMS Candidate', contact, email: email || (rawMobile ? `${rawMobile}@election2026.in` : undefined) },
      notes: { booth_count: pricing.boothCount, user_id: userId || '', source: 'whatsapp_flow' },
      callback_url: 'https://election2026sir.in/ward/dashboard?payment=success',
      callback_method: 'get',
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await resp.json();
  if (!resp.ok || !data.short_url) throw new Error(data?.error?.description || 'payment link failed');
  const nameEnc = encodeURIComponent(name || 'EDMS Candidate');
  return { url: `${data.short_url}?contact=${rawMobile}&name=${nameEnc}`, pricing };
}

/**
 * Handle a completed Choose-Service submission (social media request or purchase).
 */
async function handleServicesComplete(phone, payload) {
  const db = getAppDb();
  const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);
  const user = await db.collection('tbl_user').findOne({ mobile_no: cleanMobile });
  const enquiry = await db.collection('tbl_enquiry').findOne({ mobile: cleanMobile });
  const name = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : (enquiry?.full_name || enquiry?.firstname || 'User');

  // ─── Purchase ───
  if (payload.kind === 'purchase') {
    if (String(user?.paid_status || enquiry?.paid_status || 'No').toLowerCase() === 'yes') {
      await sendText(phone, `You already have an active EDMS subscription, *${name}*.`);
      return;
    }
    const boothCount = Array.isArray(user?.booths) ? user.booths.length : 1;
    try {
      const { url, pricing } = await createServicesPaymentLink({
        mobile: cleanMobile, name, email: user?.email, boothCount, userId: user ? String(user._id) : '',
      });
      if (!url) { await sendText(phone, 'Payment is temporarily unavailable. Please try again later or contact support.'); return; }
      const intro = await getFlowMessageText('svc_purchase_link_text',
        '*EDMS Subscription*\n\nBooths: {booths}\nAmount: ₹{amount} (incl. 18% GST)\n\nTap the secure link below to pay. Your PRO features unlock automatically after payment.',
        { booths: pricing.boothCount, amount: pricing.totalAmount.toLocaleString('en-IN') });
      await sendUrlButtonMessage(phone, { bodyText: intro, headerText: 'EDMS Subscription', btnText: 'Pay Now', btnUrl: url, headerType: 'text' });
      await saveCrmMessage({ phone: cleanMobile, direction: 'outgoing', type: 'interactive', body: intro, contactName: name, metadata: { action: 'sent_payment_link', paymentUrl: url, booth_count: pricing.boothCount, amount: pricing.totalAmount } });
    } catch (e) {
      console.error('[svc purchase]', e.message);
      await sendText(phone, 'Sorry, we could not generate your payment link right now. Please try again shortly.');
    }
    return;
  }

  // ─── Social media request ───
  if (payload.kind === 'social_request') {
    const channel = payload.channel || 'whatsapp';
    // Already-requested guard: one open request per channel.
    const open = await db.collection('tbl_social_request').findOne({ mobile: cleanMobile, channel, status: { $in: OPEN_REQUEST_STATUSES } });
    if (open) {
      const already = await getFlowMessageText('svc_social_already_text',
        'You already have a pending *{channel}* request. Our team is processing it — we\'ll update you soon.',
        { channel: channel.toUpperCase() });
      await sendText(phone, already);
      return;
    }

    const isAudio = channel === 'audio';
    const audienceAll = (payload.audience || 'all') === 'all';
    const booth = (payload.booth && payload.booth !== 'all') ? payload.booth : '';
    const section = (payload.section && payload.section !== 'all') ? payload.section : '';

    // Download any flow-uploaded media (image/audio) and re-host on Cloudinary so
    // the admin registration view can preview/download it.
    const docsArr = Array.isArray(payload.document) ? payload.document : (payload.document ? [payload.document] : []);
    const hasAttachment = docsArr.length > 0;
    const media_urls = [];
    let image_url = null, audio_url = '', file_name = null, has_image = false, has_audio = false;
    for (const it of docsArr) {
      const m = await downloadFlowMediaToCloudinary(it);
      if (!m) continue;
      media_urls.push(m.url);
      file_name = file_name || m.filename;
      if (m.mime.includes('audio')) { has_audio = true; audio_url = audio_url || m.url; }
      else { has_image = true; image_url = image_url || m.url; }
    }

    // Store using the schema the admin registration view expects (candidate_mobile,
    // service_type, message_content, booth_no/section_no, media_urls…) while also
    // keeping mobile/channel for the internal already-requested guard.
    const doc = {
      mobile: cleanMobile,
      candidate_mobile: cleanMobile,
      ward_username: cleanMobile,
      name: payload.req_name || name,
      channel,
      service_type: isAudio ? 'voice' : channel,
      audience: payload.audience || 'all',
      all_voters: audienceAll,
      booth,
      booth_no: audienceAll ? 'All' : (booth || null),
      section,
      section_no: section || null,
      language: payload.language || '',
      content: payload.content || '',
      message_content: payload.content || '',
      document: docsArr.length ? docsArr : null,
      media_urls,
      image_url,
      audio_url,
      has_image,
      has_audio,
      file_name,
      assembly_id: user?.assembly_id || enquiry?.assembly_id || '',
      user_id: user ? String(user._id) : '',
      // Audio without an in-flow upload still falls back to a chat follow-up.
      status: (isAudio && !hasAttachment) ? 'awaiting_audio' : 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.collection('tbl_social_request').insertOne(doc);

    if (isAudio && !hasAttachment) {
      // No in-flow audio — prompt for a chat follow-up (plain text, no CTA).
      const confirm = await getFlowMessageText('svc_social_audio_text',
        'Your *Audio SMS* request is saved.\n\nPlease reply here with your audio file (mp3) now, and we\'ll attach it to your broadcast.');
      await sendText(phone, confirm);
      await saveCrmMessage({ phone: cleanMobile, direction: 'outgoing', type: 'text', body: confirm, contactName: doc.name, metadata: { action: 'social_request_created', channel, status: doc.status } });
      return;
    }
    // Submitted — confirmation with a header image + Choose Service button.
    const confirm = await getFlowMessageText('svc_social_submitted_text',
      'Your *{channel}* broadcast request has been received, *{name}*.\n\nOur team will process it shortly.',
      { channel: channel.toUpperCase(), name: doc.name });
    await sendServiceMenuReply(phone, confirm, 'svc_request_done_header');
    await saveCrmMessage({ phone: cleanMobile, direction: 'outgoing', type: 'interactive', body: confirm, contactName: doc.name, metadata: { action: 'social_request_created', channel, status: doc.status } });
    return;
  }
}

// Send a message with an admin-managed header image, a body and a Choose Service
// button that re-opens the services menu flow. Used for post-action confirmations.
async function sendServiceMenuReply(phone, bodyText, headerKey) {
  const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);
  const hdr = headerKey ? await getFlowAsset(headerKey) : null;
  return sendFlowMessage(phone, {
    flowId: SERVICES_FLOW_ID,
    flowCta: 'Choose Service',
    flowAction: 'data_exchange',
    bodyText,
    headerUrl: hdr?.headerUrl || null,
    headerType: hdr?.headerUrl ? (hdr.headerType || 'image') : 'text',
    headerText: hdr?.headerUrl ? undefined : 'EDMS',
    flowToken: `svc_${cleanMobile}`,
    footerText: 'EDMS',
  });
}

// Attach an incoming audio/voice file to the contact's audio request awaiting one.
async function attachAudioToPendingRequest(phone, media) {
  const db = getAppDb();
  const cleanMobile = String(phone).replace(/\D/g, '').slice(-10);
  const pending = await db.collection('tbl_social_request').findOne(
    { mobile: cleanMobile, channel: 'audio', status: 'awaiting_audio' },
    { sort: { created_at: -1 } }
  );
  if (!pending) return;
  await db.collection('tbl_social_request').updateOne(
    { _id: pending._id },
    { $set: { audio_url: media.mediaUrl, audio_mime: media.mime || '', has_audio: true, media_urls: [media.mediaUrl], file_name: media.filename || 'audio_message.mp3', status: 'pending', updated_at: new Date().toISOString() } }
  );
  const msg = await getFlowMessageText('svc_social_audio_received_text',
    'Got your audio! Your *Audio SMS* broadcast request is now complete and queued for our team.');
  await sendText(phone, msg);
  await saveCrmMessage({ phone: cleanMobile, direction: 'outgoing', type: 'text', body: msg, metadata: { action: 'social_audio_attached', requestId: String(pending._id) } });
}

// Registration-flow screen logic, shared by the standalone registration flow
// endpoint and the "Register" path inside the Choose-Service flow. Returns the
// { version, screen, data } response for a given registration screen, or null.
async function registrationScreenResponse({ action, screen, data = {}, db }) {
  if (action === 'INIT' || !screen) {
    return { version: '3.0', screen: 'WELCOME', data: {} };
  }
  if (screen === 'WELCOME') {
    const isAffiliated = data.affiliation === 'affiliated';
    if (isAffiliated) {
      return {
        version: '3.0', screen: 'PARTY_SELECT',
        data: { full_name: data.full_name || '', role: data.role || '', affiliation: data.affiliation || '', party_options: await buildPartyOptions(db) },
      };
    }
    return {
      version: '3.0', screen: 'LOCAL_BODY_SELECT',
      data: { full_name: data.full_name || '', role: data.role || '', affiliation: data.affiliation || 'independent', party: 'Independent' },
    };
  }
  if (screen === 'PARTY_SELECT') {
    return {
      version: '3.0', screen: 'LOCAL_BODY_SELECT',
      data: { full_name: data.full_name || '', role: data.role || '', affiliation: data.affiliation || 'affiliated', party: data.party || 'BJP' },
    };
  }
  if (screen === 'LOCAL_BODY_SELECT') {
    const isUrban = data.body_type === 'urban';
    const positionOptions = (isUrban ? URBAN_POSITIONS : RURAL_POSITIONS).map((p) => ({ id: p, title: p }));
    return {
      version: '3.0', screen: 'POSITION_SELECT',
      data: { full_name: data.full_name || '', role: data.role || '', affiliation: data.affiliation || '', party: data.party || 'Independent', body_type: data.body_type || 'urban', position_options: positionOptions },
    };
  }
  if (screen === 'POSITION_SELECT') {
    const districtList = districtsFor(data.position);
    return {
      version: '3.0', screen: 'DISTRICT_SELECT',
      data: { full_name: data.full_name || '', role: data.role || '', affiliation: data.affiliation || '', party: data.party || 'Independent', body_type: data.body_type || 'urban', position: data.position || '', district_options: districtList.map((d) => ({ id: d, title: d })) },
    };
  }
  if (screen === 'DISTRICT_SELECT') {
    const selectedDistrict = String(data.district || '').trim();
    let assemblyOptions = [];
    try {
      const assemblies = await assembliesForDistrict(db, selectedDistrict);
      assemblyOptions = assemblies.slice(0, MAX_FLOW_OPTIONS).map((a) => ({ id: String(a.assembly_no), title: `No. ${a.assembly_no} - ${a.assembly_name || 'Assembly'}`.slice(0, 100) }));
    } catch (e) {
      console.error('[Flow Endpoint Assembly Fetch Error]:', e.message);
    }
    return {
      version: '3.0', screen: 'ASSEMBLY_SELECT',
      data: { full_name: data.full_name || '', role: data.role || '', affiliation: data.affiliation || '', party: data.party || 'Independent', body_type: data.body_type || 'urban', position: data.position || '', district: selectedDistrict, assembly_options: assemblyOptions.length > 0 ? assemblyOptions : [{ id: '0', title: 'No assemblies found' }] },
    };
  }
  if (screen === 'ASSEMBLY_SELECT') {
    const selectedAssemblyNo = data.assembly_name || '';
    const boothOptions = await boothOptionsForAssembly(selectedAssemblyNo);
    return {
      version: '3.0', screen: 'BOOTH_SELECT',
      data: { full_name: data.full_name || '', role: data.role || '', affiliation: data.affiliation || '', party: data.party || 'Independent', body_type: data.body_type || 'urban', position: data.position || '', district: data.district || '', assembly_name: selectedAssemblyNo, booth_options: boothOptions },
    };
  }
  if (screen === 'BOOTH_SELECT') {
    const assemblyDisplay = await assemblyNameByNo(db, data.assembly_name);
    const selectedBooths = normalizeBooths(data.booth_numbers);
    const boothLabel = summarizeBooths(selectedBooths);
    const summaryText = buildSummaryTable({
      full_name: data.full_name, role: data.role, affiliation: data.affiliation, party: data.party,
      body_type: data.body_type, position: data.position, district: data.district, assembly: assemblyDisplay, booths: boothLabel,
    });
    return {
      version: '3.0', screen: 'SUMMARY_SUBMIT',
      data: { full_name: data.full_name || '', role: data.role || '', affiliation: data.affiliation || '', party: data.party || 'Independent', body_type: data.body_type || 'urban', position: data.position || '', district: data.district || '', assembly_name: data.assembly_name || '', booth_numbers: selectedBooths, summary_text: summaryText },
    };
  }
  return null;
}

// Registration screens reachable inside the Choose-Service flow.
const REGISTRATION_SCREENS = new Set(['WELCOME', 'PARTY_SELECT', 'LOCAL_BODY_SELECT', 'POSITION_SELECT', 'DISTRICT_SELECT', 'ASSEMBLY_SELECT', 'BOOTH_SELECT']);

/**
 * POST /api/whatsapp-flow-endpoint — Meta Flow Dynamic Data Exchange Endpoint
 */
export async function flowEndpoint(req, res) {
  let isEncrypted = false;
  let aesKey, initialVector;
  let requestData = req.body || {};

  try {
    // 1. Check if request is encrypted by Meta Flow
    if (requestData.encrypted_flow_data && requestData.encrypted_aes_key && requestData.initial_vector) {
      isEncrypted = true;
      const decrypted = decryptRequest(requestData, getFlowPrivateKey());
      requestData = decrypted.decryptedBody || {};
      aesKey = decrypted.aesKey;
      initialVector = decrypted.initialVector;
      console.log('[WhatsApp Flow Endpoint] Decrypted Meta request:', JSON.stringify(requestData));
    } else {
      console.log('[WhatsApp Flow Endpoint] Received unencrypted request:', JSON.stringify(requestData));
    }

    const { action, screen, data = {}, flow_token } = requestData;
    const db = getAppDb();
    let responseObj;

    // Meta Health Check Ping
    if (action === 'ping') {
      responseObj = {
        version: '3.0',
        data: {
          status: 'active',
        },
      };
    } else if (String(flow_token || '').startsWith('svc_')) {
      // "Choose Service" menu flow — separate from the registration flow.
      responseObj = await handleServicesFlow({ action, screen, data, flow_token, db });
    } else {
      // Standalone registration flow (shared screen logic).
      responseObj = await registrationScreenResponse({ action, screen, data, db })
        || { version: '3.0', screen: 'WELCOME', data: {} };
    }

    if (isEncrypted && aesKey && initialVector) {
      const encryptedResponse = encryptResponse(responseObj, aesKey, initialVector);
      return res.status(200).type('text/plain').send(encryptedResponse);
    }

    return res.status(200).json(responseObj);
  } catch (err) {
    console.error('[WhatsApp Flow Endpoint Error]:', err);
    return res.status(500).json({ error: err.message || 'Flow endpoint error' });
  }
}
