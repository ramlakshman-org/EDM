import bcrypt from 'bcryptjs';
import { getAppDb } from '../config/db.js';
import { sendWactoText } from '../services/wactoService.js';
import { blankUser, maxUserId } from '../models/userModel.js';
import { ROLES } from '../constants/roles.js';

// ── Known values from EDMS-WhatsApp-v2 WACTO chatbot ──────────────────────────

const ROLE_VALUES = new Set(['Candidate', 'Booth Agent', 'Party Worker', 'Party Leader']);

const PARTY_VALUES = new Set([
  'TVK', 'DMK', 'AIADMK', 'BJP', 'INC', 'NTK', 'PMK', 'VCK', 'MDMK',
  'AMMK', 'DMDK', 'AISMK', 'Naam Tamilar Katchi', 'Other Party', 'Independent',
]);

const BODY_TYPE_VALUES = new Set(['Rural', 'Urban']);

const POSITION_VALUES = new Set([
  // Rural
  'VP Ward Member', 'VP President', 'PU Ward Member', 'DP Ward Member',
  // Urban
  'Town Panchayat', 'Municipality', 'Corporation',
]);

const DISTRICT_VALUES = new Set([
  'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri',
  'Dindigul', 'Erode', 'Kallakurichi', 'Kanchipuram', 'Kanyakumari', 'Karur',
  'Krishnagiri', 'Madurai', 'Mayiladuthurai', 'Nagapattinam', 'Namakkal', 'Nilgiris',
  'Perambalur', 'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga',
  'Tenkasi', 'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli',
  'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur', 'Vellore',
  'Viluppuram', 'Virudhunagar',
]);

// Navigation items to ignore (pure UI nav — carry no data)
const NAV_ITEMS = new Set([
  'More Districts', 'More Assemblies', 'More Parties', 'Button 1',
]);

const SESSION_TTL_MS = 30 * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractSelection(msg) {
  if (msg.type === 'interactive') {
    const iv = msg.interactive;
    if (iv?.type === 'list_reply') return iv.list_reply?.title?.trim() || null;
    if (iv?.type === 'button_reply') return iv.button_reply?.title?.trim() || null;
  }
  if (msg.type === 'text') return msg.text?.body?.trim() || null;
  return null;
}

function toMobile10(waPhone) {
  const d = String(waPhone).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 10) return d;
  return d;
}

// ── Session update logic ───────────────────────────────────────────────────────

function applySelection(session, text) {
  if (ROLE_VALUES.has(text)) { session.role = text; return; }
  if (text === 'Yes, have a party') { session.party_affiliation = 'yes'; return; }
  if (text === 'No, Independent') { session.party_affiliation = 'no'; session.party = 'Independent'; return; }
  if (PARTY_VALUES.has(text) && text !== 'Independent') { session.party = text; return; }
  if (BODY_TYPE_VALUES.has(text)) { session.body_type = text; return; }
  if (POSITION_VALUES.has(text)) { session.position = text; return; }
  if (DISTRICT_VALUES.has(text)) { session.district = text; session.assembly = null; return; }
  // If district is already set and text doesn't match any known category → it's an assembly
  if (session.district && !DISTRICT_VALUES.has(text)) { session.assembly = text; return; }
}

function isComplete(session) {
  return !!(session.role && session.body_type && session.position && session.district && session.assembly);
}

// ── Registration on completion ─────────────────────────────────────────────────

async function completeRegistration(phone, session, contactName) {
  const mobile = toMobile10(phone);
  const fullName = contactName || session.contact_name || mobile;
  const passcode = String(Math.floor(100000 + Math.random() * 900000));
  const db = getAppDb();

  try {
    const enquiry = {
      full_name: fullName, firstname: fullName, mobile,
      role: session.role, party: session.party || 'Independent',
      body_type: session.body_type, position: session.position,
      district_id: session.district, assembly_name: session.assembly,
      passcode, source: 'whatsapp_bot',
    };

    const existing = await db.collection('tbl_enquiry').findOne({ mobile });
    if (existing) {
      await db.collection('tbl_enquiry').updateOne({ mobile }, { $set: enquiry });
    } else {
      await db.collection('tbl_enquiry').insertOne({ ...enquiry, created_at: new Date().toISOString() });
    }

    const userExists = await db.collection('tbl_user').findOne({ mobile_no: mobile });
    if (!userExists) {
      const id = (await maxUserId()) + 1;
      await db.collection('tbl_user').insertOne({
        ...blankUser(), id,
        user_group_id: ROLES.BOOTH_ALT,
        first_name: fullName, mobile_no: mobile,
        password_str: passcode,
        password: await bcrypt.hash(passcode, 10),
        district_id: session.district,
        candidate_type: session.body_type,
        position: session.position,
        is_user_login: true,
      });
    } else {
      await db.collection('tbl_user').updateOne({ mobile_no: mobile }, {
        $set: {
          password_str: passcode,
          password: await bcrypt.hash(passcode, 10),
          first_name: fullName,
          district_id: session.district,
          is_user_login: true,
        },
      });
    }

    // Send credentials as plain text (within 24h window — user just chatted)
    const credText = `✅ *Registration Complete!*\n\n🎉 Welcome to EDMS, *${fullName}*!\n\n🔑 *Username:* \`${mobile}\`\n🔒 *Passcode:* \`${passcode}\`\n\n📱 Login at: https://tnedms.com/login\n\n_Save these credentials. Do not share them._`;
    await sendWactoText(phone, credText);

    console.log(`[WACTO Bot] Registered ${mobile} (${fullName}) via WhatsApp chatbot`);
  } catch (e) {
    console.error('[WACTO Bot] Registration failed:', e.message);
    await sendWactoText(phone, 'Sorry, registration failed. Please try again or visit https://tnedms.com/register').catch(() => {});
  }
}

// ── Main webhook handler ───────────────────────────────────────────────────────

export async function handleWactoWebhook(req, res) {
  res.sendStatus(200); // Acknowledge immediately

  try {
    const change = req.body?.entry?.[0]?.changes?.[0]?.value;
    if (!change?.messages?.length) return;

    const msg = change.messages[0];
    const phone = msg.from;
    const contactName = change.contacts?.[0]?.profile?.name || '';

    const selected = extractSelection(msg);
    if (!selected) return;

    // Ignore navigation-only items (pure pagination, no data value)
    if (NAV_ITEMS.has(selected)) return;

    // Skip plain text "ok" acknowledgements
    if (msg.type === 'text' && selected.toLowerCase() === 'ok') return;
    // Skip "Hi", "Hello", etc. (root menu triggers)
    if (msg.type === 'text' && selected.length < 20 && !DISTRICT_VALUES.has(selected)) return;

    const db = getAppDb();
    const coll = db.collection('tbl_wacto_sessions');

    // Expire old sessions
    let session = await coll.findOne({ phone });
    if (session?.updated_at) {
      const age = Date.now() - new Date(session.updated_at).getTime();
      if (age > SESSION_TTL_MS) session = null;
    }
    if (!session) {
      session = { phone, contact_name: contactName };
    }

    applySelection(session, selected);
    session.updated_at = new Date();
    if (contactName) session.contact_name = contactName;

    await coll.updateOne({ phone }, { $set: session }, { upsert: true });

    if (isComplete(session)) {
      await coll.deleteOne({ phone });
      await completeRegistration(phone, session, contactName);
    }
  } catch (e) {
    console.error('[WACTO Webhook]', e.message);
  }
}
