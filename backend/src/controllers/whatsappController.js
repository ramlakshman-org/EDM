import { getAppDb, getVoterDb } from '../config/db.js';
import { sendText, sendFlowMessage, sendUrlButtonMessage, getMediaInfo, downloadMediaBytes } from '../services/whatsappService.js';
import * as cloudinary from '../services/cloudinaryService.js';
import { decryptRequest, encryptResponse, getFlowPrivateKey } from '../services/flowCryptoService.js';
import { URBAN_POSITIONS, RURAL_POSITIONS, districtsFor } from '../constants/localBodies.js';
import { ROLES } from '../constants/roles.js';
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
  const res = await fetch(url);
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
    const body = req.body;
    console.log('[WhatsApp Webhook Event Received]:', JSON.stringify(body, null, 2));

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

      console.log(`[WhatsApp Webhook Message] From: ${phone}, ProfileName: ${profileName}, Type: ${message.type}, Body: ${textBody}`);

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

        await handleFlowResponse(phone, flowPayload);
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
    } else if (action === 'INIT' || !screen) {
      responseObj = {
        version: '3.0',
        screen: 'WELCOME',
        data: {},
      };
    } else if (screen === 'WELCOME') {
      const isAffiliated = data.affiliation === 'affiliated';
      if (isAffiliated) {
        responseObj = {
          version: '3.0',
          screen: 'PARTY_SELECT',
          data: {
            full_name: data.full_name || '',
            role: data.role || '',
            affiliation: data.affiliation || '',
            party_options: await buildPartyOptions(db),
          },
        };
      } else {
        responseObj = {
          version: '3.0',
          screen: 'LOCAL_BODY_SELECT',
          data: {
            full_name: data.full_name || '',
            role: data.role || '',
            affiliation: data.affiliation || 'independent',
            party: 'Independent',
          },
        };
      }
    } else if (screen === 'PARTY_SELECT') {
      responseObj = {
        version: '3.0',
        screen: 'LOCAL_BODY_SELECT',
        data: {
          full_name: data.full_name || '',
          role: data.role || '',
          affiliation: data.affiliation || 'affiliated',
          party: data.party || 'BJP',
        },
      };
    } else if (screen === 'LOCAL_BODY_SELECT') {
      // Position options mirror the web register page exactly:
      // urban -> Town Panchayat / Municipality / Corporation (3 options)
      // rural -> 4 panchayat-level positions.
      const isUrban = data.body_type === 'urban';
      const positionOptions = (isUrban ? URBAN_POSITIONS : RURAL_POSITIONS).map((p) => ({ id: p, title: p }));

      responseObj = {
        version: '3.0',
        screen: 'POSITION_SELECT',
        data: {
          full_name: data.full_name || '',
          role: data.role || '',
          affiliation: data.affiliation || '',
          party: data.party || 'Independent',
          body_type: data.body_type || 'urban',
          position_options: positionOptions,
        },
      };
    } else if (screen === 'POSITION_SELECT') {
      // Districts depend on the chosen position (same rule as the web page):
      // urban positions restrict to districts that have that body type; rural
      // positions span all districts.
      const districtList = districtsFor(data.position);

      responseObj = {
        version: '3.0',
        screen: 'DISTRICT_SELECT',
        data: {
          full_name: data.full_name || '',
          role: data.role || '',
          affiliation: data.affiliation || '',
          party: data.party || 'Independent',
          body_type: data.body_type || 'urban',
          position: data.position || '',
          district_options: districtList.map((d) => ({ id: d, title: d })),
        },
      };
    } else if (screen === 'DISTRICT_SELECT') {
      // Assemblies for the chosen district, straight from tbl_assembly_consitituency.
      // Option id = assembly_no (the reliable key used to fetch booths next).
      const selectedDistrict = String(data.district || '').trim();
      let assemblyOptions = [];
      try {
        const assemblies = await assembliesForDistrict(db, selectedDistrict);
        assemblyOptions = assemblies.slice(0, MAX_FLOW_OPTIONS).map((a) => ({
          id: String(a.assembly_no),
          title: `No. ${a.assembly_no} - ${a.assembly_name || 'Assembly'}`.slice(0, 100),
        }));
      } catch (e) {
        console.error('[Flow Endpoint Assembly Fetch Error]:', e.message);
      }

      responseObj = {
        version: '3.0',
        screen: 'ASSEMBLY_SELECT',
        data: {
          full_name: data.full_name || '',
          role: data.role || '',
          affiliation: data.affiliation || '',
          party: data.party || 'Independent',
          body_type: data.body_type || 'urban',
          position: data.position || '',
          district: selectedDistrict,
          assembly_options: assemblyOptions.length > 0 ? assemblyOptions : [{ id: '0', title: 'No assemblies found' }],
        },
      };
    } else if (screen === 'ASSEMBLY_SELECT') {
      // data.assembly_name holds the selected assembly_no (the option id). Pull
      // the real booths for that assembly from the voter DB.
      const selectedAssemblyNo = data.assembly_name || '';
      const boothOptions = await boothOptionsForAssembly(selectedAssemblyNo);

      responseObj = {
        version: '3.0',
        screen: 'BOOTH_SELECT',
        data: {
          full_name: data.full_name || '',
          role: data.role || '',
          affiliation: data.affiliation || '',
          party: data.party || 'Independent',
          body_type: data.body_type || 'urban',
          position: data.position || '',
          district: data.district || '',
          assembly_name: selectedAssemblyNo,
          booth_options: boothOptions,
        },
      };
    } else if (screen === 'BOOTH_SELECT') {
      // assembly_name holds the assembly_no; resolve its display name for the summary.
      const assemblyDisplay = await assemblyNameByNo(db, data.assembly_name);
      // booth_numbers is a multi-select array from the CheckboxGroup.
      const selectedBooths = normalizeBooths(data.booth_numbers);
      const boothLabel = summarizeBooths(selectedBooths);
      // Render the summary as a Markdown table for the RichText component.
      const summaryText = buildSummaryTable({
        full_name: data.full_name,
        role: data.role,
        affiliation: data.affiliation,
        party: data.party,
        body_type: data.body_type,
        position: data.position,
        district: data.district,
        assembly: assemblyDisplay,
        booths: boothLabel,
      });

      responseObj = {
        version: '3.0',
        screen: 'SUMMARY_SUBMIT',
        data: {
          full_name: data.full_name || '',
          role: data.role || '',
          affiliation: data.affiliation || '',
          party: data.party || 'Independent',
          body_type: data.body_type || 'urban',
          position: data.position || '',
          district: data.district || '',
          assembly_name: data.assembly_name || '',
          booth_numbers: selectedBooths,
          summary_text: summaryText,
        },
      };
    } else {
      responseObj = {
        version: '3.0',
        screen: 'WELCOME',
        data: {},
      };
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
