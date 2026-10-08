import bcrypt from 'bcryptjs';
import { getAppDb } from '../config/db.js';
import { sendWactoText, sendWactoImage, sendWactoImageWithCaption } from '../services/wactoService.js';

const IMG = {
  demo:                 'https://res.cloudinary.com/ajp3dslc/image/upload/v1791185720/edms-bot/edms-demo.jpg',
  benefits:             'https://res.cloudinary.com/ajp3dslc/image/upload/v1791185722/edms-bot/edms-benefits.jpg',
  support:              'https://res.cloudinary.com/ajp3dslc/image/upload/v1791185725/edms-bot/edms-support.jpg',
  social:               'https://res.cloudinary.com/ajp3dslc/image/upload/v1791185728/edms-bot/edms-social.jpg',
  registrationComplete: 'https://res.cloudinary.com/ajp3dslc/image/upload/v1791185730/edms-bot/edms-registration-complete.jpg',
  brand:                'https://res.cloudinary.com/ajp3dslc/image/upload/v1791185739/edms-bot/edms-brand.jpg',
  plans:                'https://res.cloudinary.com/ajp3dslc/image/upload/v1791185741/edms-bot/edms-plans.jpg',
  faq:                  'https://res.cloudinary.com/ajp3dslc/image/upload/v1791185743/edms-bot/edms-faq.jpg',
  credentials:          'https://res.cloudinary.com/ajp3dslc/image/upload/v1791185746/edms-bot/edms-credentials.jpg',
  paymentQr:            'https://res.cloudinary.com/ajp3dslc/image/upload/v1791377127/payment-qr.jpg',
};
import { blankUser, maxUserId } from '../models/userModel.js';
import { ROLES } from '../constants/roles.js';

// ── Known values from EDMS-WhatsApp bilingual chatbot ─────────────────────────

// Language select node sends exactly these two titles
const LANG_VALUES = new Set(['English', 'தமிழ்']);

const ROLE_VALUES = new Set(['Planning to Contest', 'Confirmed Candidate', 'Campaign Team Member', 'Party Functionary']);

const PARTY_VALUES = new Set([
  'TVK', 'DMK', 'AIADMK', 'BJP', 'INC', 'NTK', 'PMK', 'VCK', 'MDMK',
  'AMMK', 'DMDK', 'AISMK', 'Naam Tamilar Katchi', 'Other Party', 'Independent',
]);

const BODY_TYPE_VALUES = new Set(['Rural', 'Urban']);

// Expand abbreviated rural position titles (WhatsApp list rows max 24 chars) to full DB names
const POSITION_FULL_NAME = {
  'VP Ward Member': 'Village Panchayat Ward Member',
  'VP President':   'Village Panchayat President',
  'PU Ward Member': 'Panchayat Union Ward Member',
  'DP Ward Member': 'District Panchayat Ward Member',
};

const POSITION_VALUES = new Set([
  'VP Ward Member', 'VP President', 'PU Ward Member', 'DP Ward Member',
  'Village Panchayat Ward Member', 'Village Panchayat President',
  'Panchayat Union Ward Member', 'District Panchayat Ward Member',
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

// ── Tamil UI text → English DB value maps ─────────────────────────────────────
// DB always stores English values; Tamil input is mapped before writing.

const TAMIL_ROLE_MAP = {
  'உள்ளாட்சித் தேர்தலில் போட்டியிடத் திட்டமிட்டுள்ளேன்': 'Planning to Contest',
  'அதிகாரப்பூர்வ வேட்பாளர்':                              'Confirmed Candidate',
  'களப் பிரச்சாரக் குழு உறுப்பினர்':                      'Campaign Team Member',
  'கட்சி நிர்வாகி / பொறுப்பாளர்':                         'Party Functionary',
  // Short WACTO row titles (WhatsApp list rows max 24 chars)
  'போட்டியிட திட்டம்': 'Planning to Contest',
  'பிரச்சாரக் குழு':   'Campaign Team Member',
  'கட்சி நிர்வாகி':    'Party Functionary',
};

const TAMIL_BODY_TYPE_MAP = {
  'ஊரகப் பகுதி':    'Rural',
  'நகர்ப்புறப் பகுதி': 'Urban',
};

const TAMIL_POSITION_MAP = {
  'கிராம ஊராட்சி வார்டு உறுப்பினர்': 'Village Panchayat Ward Member',
  'கிராம ஊராட்சி தலைவர்':            'Village Panchayat President',
  'ஊராட்சி ஒன்றிய வார்டு உறுப்பினர்': 'Panchayat Union Ward Member',
  'மாவட்ட ஊராட்சி வார்டு உறுப்பினர்': 'District Panchayat Ward Member',
  'பேரூராட்சி':  'Town Panchayat',
  'நகராட்சி':    'Municipality',
  'மாநகராட்சி':  'Corporation',
  // Short WACTO row titles (WhatsApp list rows max 24 chars)
  'கிராம ஊராட்சி உறுப்பினர்': 'Village Panchayat Ward Member',
  'ஒன்றிய வார்டு உறுப்பினர்': 'Panchayat Union Ward Member',
  'மாவட்ட வார்டு உறுப்பினர்': 'District Panchayat Ward Member',
};

// Tamil party affiliation button labels
// (WhatsApp reply buttons max 20 chars — short forms are what WACTO sends)
const TAMIL_AFF_YES = new Set(['ஆம், கட்சி உள்ளது', 'ஆம், கட்சியுடன் இணைந்து செயல்படுகிறேன்']);
const TAMIL_AFF_NO  = new Set(['இல்லை, சுயேச்சை', 'இல்லை, சுயேச்சையாக செயல்படுகிறேன்']);

// Tamil party names that differ from the English WACTO row titles
const TAMIL_PARTY_MAP = {
  'நாம் தமிழர் கட்சி': 'Naam Tamilar Katchi',
  'பிற கட்சிகள்':      'Other Party',
};

// Tamil menu items → English canonical names (Register handled separately)
const TAMIL_MENU_MAP = {
  'எனது கணக்கு விவரங்கள்':         'My Credentials',
  'மாதிரி விளக்கம்':                'Demo',
  'பயன்பாடுகள்':                    'Benefits',
  'அடிக்கடி கேட்கப்படும் கேள்விகள்': 'FAQ',
  'கேள்வி பதில்கள்':                'FAQ',
  'இணையதளம்':                       'Website',
  'உதவி மையம்':                     'Support',
  'திட்டத்தை வாங்க':                'Purchase Plan',
  'சமூக வலைத்தள சேவை':             'Social Media',
};

// Tamil purchase plan display names (for bilingual confirmation messages)
const TAMIL_PLAN_NAMES = {
  '1 Booth':          '1 பூத்',
  'Up to 5 Booths':   '5 பூத் வரை',
  'Up to 10 Booths':  '10 பூத் வரை',
  'Up to 25 Booths':  '25 பூத் வரை',
  'Up to 100 Booths': '100 பூத் வரை',
};

// Navigation items to ignore — pure UI pagination, carry no data
const NAV_ITEMS = new Set([
  'More Districts', 'More Assemblies', 'More Parties', 'Button 1', 'Start Registration',
  // Tamil equivalents
  'மேலும் மாவட்டங்கள்', 'மேலும் சட்டமன்றங்கள்', 'மேலும் கட்சிகள்',
]);

// Top-level menu selections (English canonical names only — Tamil is normalised before lookup)
const MENU_SELECTIONS = new Set([
  'My Credentials', 'Demo', 'Benefits', 'FAQ',
  'Website', 'Support', 'Purchase Plan', 'Social Media',
]);

const SESSION_TTL_MS = 30 * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractSelection(msg) {
  if (msg.type === 'interactive') {
    const iv = msg.interactive;
    if (iv?.type === 'list_reply')   return iv.list_reply?.title?.trim()   || null;
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

// Return ta string when session.lang === 'ta', else en
function msg(session, en, ta) { return session?.lang === 'ta' ? ta : en; }

// Language follows what the user tapped, so it survives session deletion/expiry.
// Shared labels (districts, party codes) return null and keep the current language.
const TAMIL_SCRIPT = /[஀-௿]/;
const ENGLISH_LANG_LABELS = new Set(['English', 'Register', ...MENU_SELECTIONS]);
function langFromLabel(label) {
  if (TAMIL_SCRIPT.test(label)) return 'ta';
  if (ENGLISH_LANG_LABELS.has(label)) return 'en';
  return null;
}

// One bubble (image + caption) — two separate sends can arrive out of order on WhatsApp.
async function sendImageWithText(phone, imageUrl, text) {
  try {
    await sendWactoImageWithCaption(phone, imageUrl, text);
  } catch (e) {
    console.warn('[WACTO Bot] caption send failed, sending separately:', e.message);
    await sendWactoImage(phone, imageUrl);
    await sendWactoText(phone, text);
  }
}

// ── Session update logic ───────────────────────────────────────────────────────

function applySelection(session, text) {
  // Language selection — store lang flag, no registration state change
  if (text === 'English') { session.lang = 'en'; return; }
  if (text === 'தமிழ்')   { session.lang = 'ta'; return; }

  // ── Tamil → English mappings (DB always stores English) ───────────────────
  const tRole = TAMIL_ROLE_MAP[text];
  if (tRole) { session.role = tRole; return; }

  if (TAMIL_AFF_YES.has(text)) { session.party_affiliation = 'yes'; return; }
  if (TAMIL_AFF_NO.has(text))  { session.party_affiliation = 'no'; session.party = 'Independent'; return; }

  const tParty = TAMIL_PARTY_MAP[text];
  if (tParty) { session.party = tParty; return; }

  const tBodyType = TAMIL_BODY_TYPE_MAP[text];
  if (tBodyType) {
    session.body_type = tBodyType;
    session.position = null; session.district = null; session.assembly = null;
    session.booth_count = null; session.booths = null; session.awaiting_booth_numbers = false;
    return;
  }

  const tPosition = TAMIL_POSITION_MAP[text];
  if (tPosition) {
    session.position = tPosition;
    session.district = null; session.assembly = null;
    session.booth_count = null; session.booths = null; session.awaiting_booth_numbers = false;
    return;
  }

  // ── English values (original logic unchanged) ──────────────────────────────
  if (ROLE_VALUES.has(text)) { session.role = text; return; }
  if (text === 'Yes, have a party') { session.party_affiliation = 'yes'; return; }
  if (text === 'No, Independent')   { session.party_affiliation = 'no'; session.party = 'Independent'; return; }
  if (PARTY_VALUES.has(text) && text !== 'Independent') { session.party = text; return; }
  if (BODY_TYPE_VALUES.has(text)) {
    session.body_type = text;
    session.position = null; session.district = null; session.assembly = null;
    session.booth_count = null; session.booths = null; session.awaiting_booth_numbers = false;
    return;
  }
  if (POSITION_VALUES.has(text)) {
    session.position = text;
    session.district = null; session.assembly = null;
    session.booth_count = null; session.booths = null; session.awaiting_booth_numbers = false;
    return;
  }
  // Once role+body_type+position+district are all set, the only remaining step is assembly
  if (session.role && session.body_type && session.position && session.district) {
    session.assembly = text; return;
  }
  if (DISTRICT_VALUES.has(text)) { session.district = text; session.assembly = null; return; }
}

function getRecommendedPlan(boothCount) {
  if (boothCount <= 1) return { name: '1 Booth',           price: '₹2,000'  };
  if (boothCount <= 5) return { name: 'Up to 5 Booths',   price: '₹5,000'  };
  if (boothCount <= 10) return { name: 'Up to 10 Booths', price: '₹10,000' };
  if (boothCount <= 25) return { name: 'Up to 25 Booths', price: '₹25,000' };
  return                       { name: 'Up to 100 Booths', price: '₹50,000' };
}

function isComplete(session) {
  return !!(session.role && session.body_type && session.position && session.district && session.assembly && session.booth_count);
}

// ── Top-level menu handlers ────────────────────────────────────────────────────
// selected is always the English canonical name (normalised by caller)

async function handleMenuSelection(phone, selected, db, coll, session) {
  const mobile = toMobile10(phone);
  const lang   = session?.lang || 'en';

  if (selected === 'My Credentials') {
    const user = await db.collection('tbl_user').findOne({ mobile_no: mobile });
    if (user?.password_str) {
      await sendWactoImage(phone, IMG.credentials);
      await sendWactoText(phone, msg(session,
        `🔑 *Your EDMS Credentials*\n\n📱 *Username:* \`${mobile}\`\n🔒 *Passcode:* \`${user.password_str}\`\n\n📲 Login at: https://tnedms.com/login\n\n_Do not share these credentials._`,
        `🔑 *உங்கள் EDMS கணக்கு விவரங்கள்*\n\n📱 *பயனர்பெயர்:* \`${mobile}\`\n🔒 *கடவுச்சொல்:* \`${user.password_str}\`\n\n📲 உள்நுழைய: https://tnedms.com/login\n\n⚠️ உங்கள் கணக்கு விவரங்களை பாதுகாப்பாக வைத்துக்கொள்ளவும்.`
      ));
    } else {
      await sendWactoText(phone, msg(session,
        `⚠️ No account found for *${mobile}*.\n\nTo register, type *Register* or select *Register* from the menu.`,
        `⚠️ *${mobile}* என்ற மொபைல் எண்ணிற்கு EDMS கணக்கு கண்டறியப்படவில்லை.\n\nபுதிதாகப் பதிவு செய்ய மெனுவில் *பதிவு செய்ய* என்பதைத் தேர்ந்தெடுக்கவும்.`
      ));
    }
    return;
  }

  if (selected === 'Demo')    return;
  if (selected === 'Benefits') return;
  if (selected === 'FAQ')     return;
  if (selected === 'Website') return;

  if (selected === 'Support') {
    await coll.updateOne(
      { phone },
      { $set: { phone, flow: 'support_issue', lang, updated_at: new Date() } },
      { upsert: true }
    );
    await sendWactoText(phone, msg(session,
      '🆘 Please describe your issue or question:',
      '🆘 உங்கள் பிரச்சனை அல்லது கேள்வியை விவரிக்கவும்:'
    ));
    return;
  }

  if (selected === 'Purchase Plan') {
    await coll.updateOne(
      { phone },
      { $set: { phone, flow: 'purchase_select', lang, updated_at: new Date() } },
      { upsert: true }
    );
    await sendWactoText(phone, msg(session,
      `📋 *Select a Plan*\n\nReply with the number of your choice:\n\n1️⃣ 1 Booth — ₹2,000\n2️⃣ Up to 5 Booths — ₹5,000\n3️⃣ Up to 10 Booths — ₹10,000\n4️⃣ Up to 25 Booths — ₹25,000\n5️⃣ Up to 100 Booths — ₹50,000\n\n_(All prices + 18% GST)_`,
      `📋 *திட்டத்தை தேர்ந்தெடுக்கவும்*\n\n1 முதல் 5 வரை எண்ணை உள்ளிடவும்:\n\n1️⃣ 1 பூத் — ₹2,000\n2️⃣ 5 பூத் வரை — ₹5,000\n3️⃣ 10 பூத் வரை — ₹10,000\n4️⃣ 25 பூத் வரை — ₹25,000\n5️⃣ 100 பூத் வரை — ₹50,000\n\n_(அனைத்து விலைகளும் + 18% GST)_`
    ));
    return;
  }

  if (selected === 'Social Media') {
    await coll.updateOne(
      { phone },
      { $set: { phone, flow: 'social_service', lang, updated_at: new Date() } },
      { upsert: true }
    );
    await sendWactoText(phone, msg(session,
      `📣 *Social Media Services*\n\nReply with the number of your choice:\n\n1️⃣ WA Broadcast\n2️⃣ Audio SMS\n3️⃣ SMS Broadcast`,
      `📣 *சமூக வலைத்தள சேவைகள்*\n\n1 முதல் 3 வரை எண்ணை உள்ளிடவும்:\n\n1️⃣ WA Broadcast (வாட்ஸ்அப் பரவல்)\n2️⃣ Audio SMS (ஒலி குறுஞ்செய்தி)\n3️⃣ SMS Broadcast (SMS பரவல்)`
    ));
    return;
  }
}

// ── Registration on completion ─────────────────────────────────────────────────

async function completeRegistration(phone, session, contactName) {
  const mobile  = toMobile10(phone);
  const fullName = contactName || session.contact_name || mobile;
  const passcode = String(Math.floor(100000 + Math.random() * 900000));
  const db = getAppDb();

  try {
    let assembly_id = 0;
    let assembly_no = 0;
    if (session.assembly) {
      const words = session.assembly.replace(/[()]/g, '').trim().split(/\s+/);
      const nameRegex = new RegExp(words.join('.*'), 'i');
      const assemblyDoc = await db.collection('tbl_assembly_consitituency').findOne({ assembly_name: nameRegex });
      if (assemblyDoc) {
        assembly_id = assemblyDoc.assembly_no;
        assembly_no = assemblyDoc.assembly_no;
      }
    }

    const positionFull = POSITION_FULL_NAME[session.position] || session.position;

    const enquiry = {
      full_name: fullName, firstname: fullName, mobile,
      role: session.role, party: session.party || 'Independent',
      body_type: session.body_type, position: positionFull,
      district: session.district, district_id: session.district, assembly_name: session.assembly,
      assembly_id, assembly_no,
      ward_number: session.booth_ward || '',
      booth_count: session.booth_count || 0,
      booths: session.booths || [],
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
        assembly_id, assembly_no,
        candidate_type: session.body_type,
        position: positionFull,
        booth_count: session.booth_count || 0,
        booths: session.booths || [],
        is_user_login: true,
      });
    } else {
      await db.collection('tbl_user').updateOne({ mobile_no: mobile }, {
        $set: {
          password_str: passcode,
          password: await bcrypt.hash(passcode, 10),
          first_name: fullName,
          district_id: session.district,
          assembly_id, assembly_no,
          booth_count: session.booth_count || 0,
          booths: session.booths || [],
          is_user_login: true,
        },
      });
    }

    await sendImageWithText(phone, IMG.registrationComplete, msg(session,
      `✅ *Registration Complete!*\n\n🎉 Welcome to EDMS, *${fullName}*!\n\n🔑 *Username:* \`${mobile}\`\n🔒 *Passcode:* \`${passcode}\`\n\n📱 Login at: https://tnedms.com/login\n\n_Save these credentials. Do not share them._`,
      `🎉 *பதிவு வெற்றிகரமாக முடிந்தது!*\n\nEDMS-க்கு நல்வரவு, *${fullName}*! 🙏\n\n🔑 *பயனர்பெயர்:* \`${mobile}\`\n🔒 *கடவுச்சொல்:* \`${passcode}\`\n\n📲 உள்நுழைய: https://tnedms.com/login\n\n⚠️ உங்கள் கணக்கு விவரங்களை யாருடனும் பகிர வேண்டாம்.`
    ));

    if (session.booth_count) {
      const plan = getRecommendedPlan(session.booth_count);
      await sendImageWithText(phone, IMG.paymentQr, msg(session,
        `━━━━━━━━━━━━━━━━━━\n💰 *Complete Your Payment*\n\nAssembly: *${session.assembly}*\nBooths: *${session.booth_count}*\nAmount: *${plan.price} + 18% GST*\n\n🏦 UPI ID: \`senthilsky2301@okaxis\`\n\nScan the QR above or pay directly to the UPI ID.\n\n📸 After payment, *send your payment screenshot to:*\nwa.me/917092800426\n\n⏱ Access activated within *30 minutes* of confirmation.\n━━━━━━━━━━━━━━━━━━`,
        `━━━━━━━━━━━━━━━━━━\n💰 *கட்டணம் செலுத்துதல்*\n\nசட்டமன்றத் தொகுதி: *${session.assembly}*\nபூத் எண்ணிக்கை: *${session.booth_count}*\nகட்டணம்: *${plan.price} + 18% GST*\n\n🏦 UPI ID: \`senthilsky2301@okaxis\`\n\n📲 மேலே உள்ள QR குறியீட்டை ஸ்கேன் செய்து கட்டணம் செலுத்தவும்.\n\n📸 கட்டணம் செலுத்திய பிறகு, Screenshot-ஐ இந்த எண்ணிற்கு அனுப்பவும்:\nwa.me/917092800426\n\n⏱️ கட்டணம் உறுதிசெய்யப்பட்ட 30 நிமிடங்களுக்குள் அணுகல் செயல்படுத்தப்படும்.\n━━━━━━━━━━━━━━━━━━`
      ));
    }

    console.log(`[WACTO Bot] Registered ${mobile} (${fullName}) via WhatsApp chatbot`);
  } catch (e) {
    console.error('[WACTO Bot] Registration failed:', e.message);
    await sendWactoText(phone, msg(session,
      'Sorry, registration failed. Please try again or visit https://tnedms.com/register',
      'மன்னிக்கவும், பதிவு தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்: https://tnedms.com/register'
    )).catch(() => {});
  }
}

// ── Multi-step flow handler ────────────────────────────────────────────────────

async function handleFlowStep(phone, text, session, coll, db) {
  const mobile = toMobile10(phone);

  // ── Support: 2-step ticket collection ──────────────────────────────────────
  if (session.flow === 'support_issue') {
    await coll.updateOne({ phone }, { $set: { flow: 'support_name', support_issue: text, updated_at: new Date() } });
    await sendWactoText(phone, msg(session,
      `📝 Got it. What is your name? _(type "skip" to skip)_`,
      `📝 புரிந்தது. உங்கள் பெயரை உள்ளிடவும். (தவிர்க்க "skip" என்று டைப் செய்யவும்)`
    ));
    return;
  }

  if (session.flow === 'support_name') {
    const name = text.toLowerCase() === 'skip' ? '' : text;
    await db.collection('tbl_support_tickets').insertOne({
      phone, mobile,
      issue: session.support_issue,
      name,
      created_at: new Date(),
    });
    await coll.deleteOne({ phone });
    await sendWactoText(phone, msg(session,
      `✅ *Support Request Received!*\n\nOur team will respond within *2 hours*.\n\nFor urgent help:\n📞 *+91 99401 36163*\n⏰ 8am – 10pm daily\n\nThank you! 🙏`,
      `✅ *உங்கள் உதவி கோரிக்கை வெற்றிகரமாகப் பெறப்பட்டது!*\n\nஎங்கள் ஆதரவுக் குழு 2 மணி நேரத்திற்குள் உங்களைத் தொடர்புகொள்ளும்.\n\n🚨 அவசர உதவி:\n📞 *+91 99401 36163*\n⏰ தினமும் காலை 8:00 முதல் இரவு 10:00 மணி வரை\n\nநன்றி! 🙏`
    ));
    console.log(`[WACTO Support] Ticket saved for ${mobile}`);
    return;
  }

  // ── Purchase Plan: 2-step (tier select → booth count) ──────────────────────
  if (session.flow === 'purchase_select') {
    const planMap = {
      '1': { name: '1 Booth',           price: '₹2,000',  maxBooths: 1   },
      '2': { name: 'Up to 5 Booths',   price: '₹5,000',  maxBooths: 5   },
      '3': { name: 'Up to 10 Booths',  price: '₹10,000', maxBooths: 10  },
      '4': { name: 'Up to 25 Booths',  price: '₹25,000', maxBooths: 25  },
      '5': { name: 'Up to 100 Booths', price: '₹50,000', maxBooths: 100 },
    };
    const plan = planMap[text];
    if (!plan) {
      await sendWactoText(phone, msg(session,
        `Please reply with *1*, *2*, *3*, *4* or *5* to select a plan.\n\n1️⃣ 1 Booth — ₹2,000\n2️⃣ Up to 5 Booths — ₹5,000\n3️⃣ Up to 10 Booths — ₹10,000\n4️⃣ Up to 25 Booths — ₹25,000\n5️⃣ Up to 100 Booths — ₹50,000`,
        `1 முதல் 5 வரை எண்ணை உள்ளிடவும்:\n\n1️⃣ 1 பூத் — ₹2,000\n2️⃣ 5 பூத் வரை — ₹5,000\n3️⃣ 10 பூத் வரை — ₹10,000\n4️⃣ 25 பூத் வரை — ₹25,000\n5️⃣ 100 பூத் வரை — ₹50,000`
      ));
      return;
    }
    const planTA = TAMIL_PLAN_NAMES[plan.name] || plan.name;
    await coll.updateOne({ phone }, {
      $set: { flow: 'purchase_booths', purchase_plan: plan.name, purchase_price: plan.price, updated_at: new Date() }
    });
    await sendWactoText(phone, msg(session,
      `✅ *${plan.name} — ${plan.price}*\n\nHow many booths do you currently manage?\n_(Enter a number)_`,
      `✅ *${planTA} — ${plan.price}*\n\nநீங்கள் தற்போது எத்தனை பூத் பகுதிகளை நிர்வகிக்கிறீர்கள்?\n\n👉 பூத் எண்ணிக்கையை மட்டும் உள்ளிடவும்.`
    ));
    return;
  }

  if (session.flow === 'purchase_booths') {
    const boothCount = parseInt(text, 10) || text;
    await db.collection('tbl_purchase_interests').insertOne({
      phone, mobile,
      plan: session.purchase_plan,
      price: session.purchase_price,
      booth_count: boothCount,
      created_at: new Date(),
    });
    await coll.deleteOne({ phone });
    const planTA = TAMIL_PLAN_NAMES[session.purchase_plan] || session.purchase_plan;
    await sendWactoText(phone, msg(session,
      `✅ *${session.purchase_plan} — ${session.purchase_price}*\nBooths: *${boothCount}*\n\n💳 *How to Purchase:*\n1. Visit: https://tnedms.com/register\n2. Log in (or register first)\n3. Select your plan & pay via UPI / card / net banking\n\n⏱ Access activated within *30 minutes* of payment.\n📞 Help: *+91 99401 36163*`,
      `✅ *${planTA} — ${session.purchase_price}*\n🗳️ பூத் எண்ணிக்கை: *${boothCount}*\n\n💳 *வாங்கும் நடைமுறை:*\n1️⃣ https://tnedms.com/register இணையதளம் செல்லவும்\n2️⃣ உங்கள் கணக்கில் உள்நுழையவும்\n3️⃣ தேவையான திட்டத்தைத் தேர்ந்தெடுக்கவும்\n4️⃣ UPI / Card / Net Banking மூலம் கட்டணம் செலுத்தவும்\n\n⏱️ கட்டணம் செலுத்திய 30 நிமிடங்களுக்குள் கணக்கு செயல்படுத்தப்படும்.\n📞 உதவி: *+91 99401 36163*`
    ));
    console.log(`[WACTO Purchase] Interest saved for ${mobile} — ${session.purchase_plan} (${boothCount} booths)`);
    return;
  }

  // ── Social Media: 4-step campaign request ──────────────────────────────────
  if (session.flow === 'social_service') {
    const serviceMap = { '1': 'WA Broadcast', '2': 'Audio SMS', '3': 'SMS Broadcast' };
    const service = serviceMap[text] ||
      (['WA Broadcast', 'Audio SMS', 'SMS Broadcast'].includes(text) ? text : null);
    if (!service) {
      await sendWactoText(phone, msg(session,
        `Please reply with *1*, *2* or *3* to select a service:\n\n1️⃣ WA Broadcast\n2️⃣ Audio SMS\n3️⃣ SMS Broadcast`,
        `1, 2 அல்லது 3 என்று உள்ளிடவும்:\n\n1️⃣ WA Broadcast (வாட்ஸ்அப் பரவல்)\n2️⃣ Audio SMS (ஒலி குறுஞ்செய்தி)\n3️⃣ SMS Broadcast (SMS பரவல்)`
      ));
      return;
    }
    await coll.updateOne({ phone }, { $set: { flow: 'social_name', social_service: service, updated_at: new Date() } });
    await sendWactoText(phone, msg(session,
      `✅ *${service}* selected.\n\nYour *name and party*:`,
      `✅ *${service}* தேர்ந்தெடுக்கப்பட்டுள்ளது.\n\nதயவுசெய்து உங்கள் *பெயர் மற்றும் கட்சி விவரங்களை* உள்ளிடவும்:`
    ));
    return;
  }

  if (session.flow === 'social_name') {
    await coll.updateOne({ phone }, { $set: { flow: 'social_message', social_name: text, updated_at: new Date() } });
    await sendWactoText(phone, msg(session,
      `📝 *Message or script* (Tamil/English):`,
      `📝 *செய்தி / Script*\n\nதமிழ் / ஆங்கிலம் — இரண்டிலும் அனுப்பலாம்:`
    ));
    return;
  }

  if (session.flow === 'social_message') {
    await coll.updateOne({ phone }, { $set: { flow: 'social_area', social_message: text, updated_at: new Date() } });
    await sendWactoText(phone, msg(session,
      `📍 *Target area* (district/ward):`,
      `📍 *இலக்கு பகுதி*\n\nமாவட்டம் / சட்டமன்றத் தொகுதி / வார்டு:`
    ));
    return;
  }

  if (session.flow === 'social_area') {
    await db.collection('tbl_campaign_requests').insertOne({
      phone, mobile,
      service: session.social_service,
      name: session.social_name,
      message: session.social_message,
      target_area: text,
      created_at: new Date(),
    });
    await coll.deleteOne({ phone });
    await sendWactoText(phone, msg(session,
      `✅ *Campaign Request Submitted!*\n\n📣 Service: *${session.social_service}*\n\nOur team will contact you within *4 hours* to confirm:\n• Target audience & area\n• Message approval\n• Pricing & schedule\n\n📞 *+91 99401 36163*`,
      `✅ *உங்கள் பிரச்சார சேவை கோரிக்கை சமர்ப்பிக்கப்பட்டது!*\n\n📣 சேவை: *${session.social_service}*\n\nஎங்கள் குழு 4 மணி நேரத்திற்குள் உங்களைத் தொடர்புகொண்டு கீழ்க்கண்டவற்றை உறுதிப்படுத்தும்:\n• இலக்கு மக்கள் மற்றும் பகுதி\n• பிரச்சார செய்தி / உள்ளடக்கம்\n• கட்டணம் மற்றும் சேவை அட்டவணை\n\n📞 *+91 99401 36163*`
    ));
    console.log(`[WACTO Social] Campaign request saved for ${mobile} — ${session.social_service}`);
    return;
  }
}

// ── Main webhook handler ───────────────────────────────────────────────────────

export async function handleWactoWebhook(req, res) {
  res.sendStatus(200); // Acknowledge immediately

  try {
    const change = req.body?.entry?.[0]?.changes?.[0]?.value;
    if (!change?.messages?.length) return;

    const msg_ = change.messages[0];
    const phone = msg_.from;
    const contactName = change.contacts?.[0]?.profile?.name || '';

    const selected = extractSelection(msg_);
    if (!selected) return;

    // Ignore navigation-only items (pure pagination, no data value)
    if (NAV_ITEMS.has(selected)) return;

    // Skip plain text greetings and root menu triggers
    if (msg_.type === 'text') {
      const low = selected.toLowerCase();
      if (low === 'ok' || low === 'hi' || low === 'hello' || low === 'start' || low === 'menu') return;
      if (selected === 'வணக்கம்') return;

      // PAY intent — user wants to complete payment after registration nudge
      if (low === 'pay') {
        const mobile = toMobile10(phone);
        const db = getAppDb();
        const user = await db.collection('tbl_user').findOne({ mobile_no: mobile });
        if (!user) {
          await sendWactoText(phone, `Please register first before purchasing.\n\nType *Register* or select Register from the menu.`);
          return;
        }
        if (user.paid_status === 'Yes') {
          await sendWactoText(phone, `✅ Your EDMS subscription is already active!\n\n📲 Login at: https://tnedms.com/login\nUsername: \`${mobile}\`\nPasscode: \`${user.password_str}\``);
          return;
        }
        const boothCount = user.booth_count || 1;
        const plan = getRecommendedPlan(boothCount);
        await sendWactoImage(phone, IMG.paymentQr);
        await sendWactoText(phone,
          `━━━━━━━━━━━━━━━━━━\n💰 *Complete Your Payment*\n\nBooths: *${boothCount}*\nAmount: *${plan.price} + 18% GST*\n\n🏦 UPI ID: \`senthilsky2301@okaxis\`\n\nScan the QR above or pay directly to the UPI ID.\n\n📸 After payment, *send your payment screenshot to:*\nwa.me/917092800426\n\n⏱ Access activated within *30 minutes* of confirmation.\n━━━━━━━━━━━━━━━━━━`
        );
        return;
      }
    }

    const db   = getAppDb();
    const coll = db.collection('tbl_wacto_sessions');

    // Load session early — needed for language context throughout this request
    let session = await coll.findOne({ phone });
    if (session?.updated_at && Date.now() - new Date(session.updated_at).getTime() > SESSION_TTL_MS) {
      session = null; // expired; will be overwritten on next $set upsert
    }

    const tappedLang = msg_.type === 'interactive' ? langFromLabel(selected) : null;
    if (tappedLang) session = { ...(session || { phone, contact_name: contactName }), lang: tappedLang };

    // Check for active multi-step flow BEFORE menu / registration checks
    if (msg_.type === 'text') {
      // Intercept booth numbers reply during registration
      if (session?.awaiting_booth_numbers) {
        const parts = selected.replace(/[，、]/g, ',').split(',').map(s => s.trim()).filter(Boolean);
        const booths = parts.map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n >= 1 && n <= 500);
        if (!booths.length) {
          await sendWactoText(phone, msg(session,
            `❌ Invalid format. Please reply with numbers only, separated by commas.\n\n✅ Example: \`1, 5, 9\`\n❌ Not valid: \`Booth 1\`, \`1-5\`, \`1 to 5\`\n\nWhich booth numbers do you manage in *${session.assembly}* assembly?`,
            `❌ தவறான வடிவம்!\n\nதயவுசெய்து பூத் எண்களை மட்டும் கமா (,) மூலம் பிரித்து மீண்டும் உள்ளிடவும்.\n\n✅ சரியான எடுத்துக்காட்டு: \`1, 5, 9\`\n❌ தவறான எடுத்துக்காட்டு: \`Booth 1\`, \`1-5\`, \`1 to 5\`\n\n👇 *${session.assembly}* தொகுதிக்கான பூத் எண்களை மீண்டும் உள்ளிடவும்.`
          ));
          return;
        }
        session.booths = booths;
        session.booth_count = booths.length;
        session.awaiting_booth_numbers = false;
        await coll.updateOne({ phone }, { $set: { booths, booth_count: booths.length, awaiting_booth_numbers: false, updated_at: new Date() } });
        if (isComplete(session)) {
          await coll.deleteOne({ phone });
          await completeRegistration(phone, session, contactName);
        }
        return;
      }

      if (session?.flow) {
        await handleFlowStep(phone, selected, session, coll, db);
        return;
      }
    }

    // Normalise Tamil menu items to English canonical names before lookup
    const normalizedSelected = TAMIL_MENU_MAP[selected] || selected;

    // Handle top-level menu options (not part of registration flow)
    if (MENU_SELECTIONS.has(normalizedSelected)) {
      await handleMenuSelection(phone, normalizedSelected, db, coll, session);
      return;
    }

    // Register (English) or பதிவு செய்ய (Tamil) — returning-user shortcut
    if (selected === 'Register' || selected === 'பதிவு செய்ய') {
      const mobile   = toMobile10(phone);
      const existing = await db.collection('tbl_user').findOne({ mobile_no: mobile });
      if (existing?.password_str) {
        await sendWactoImage(phone, IMG.credentials);
        await sendWactoText(phone, msg(session,
          `👋 *Welcome back, ${existing.first_name || mobile}!*\n\nYou're already registered with EDMS.\n\n🔑 *Username:* \`${mobile}\`\n🔒 *Passcode:* \`${existing.password_str}\`\n\n📲 Login at: https://tnedms.com/login\n\n_Need help? Select *Support* from the menu._`,
          `👋 *மீண்டும் நல்வரவு, ${existing.first_name || mobile}!*\n\nநீங்கள் ஏற்கனவே EDMS கணக்கில் பதிவு செய்துள்ளீர்கள்.\n\n🔑 *பயனர்பெயர்:* \`${mobile}\`\n🔒 *கடவுச்சொல்:* \`${existing.password_str}\`\n\n📲 உள்நுழைய: https://tnedms.com/login\n\n_உதவி தேவையா? மெனுவில் *உதவி மையம்* என்பதைத் தேர்ந்தெடுக்கவும்._`
        ));
        return;
      }
      // New user starting registration — wipe stale session, preserve lang
      const savedLang = session?.lang;
      await coll.deleteOne({ phone });
      session = { phone, contact_name: contactName, lang: savedLang || 'en' };
    }

    // Initialise session for new interactions not yet in any session
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
    } else if (session.assembly && !session.booth_count && !session.awaiting_booth_numbers) {
      // Assembly just captured — ask for booth numbers to complete registration
      await coll.updateOne({ phone }, { $set: { awaiting_booth_numbers: true, updated_at: new Date() } });
      await sendWactoText(phone, msg(session,
        `Which booth numbers do you manage in *${session.assembly}* assembly?\n\n📌 *Required format:* Numbers only, separated by commas\n\n✅ Correct: \`1, 5, 9\` or \`12, 15, 20\`\n❌ Wrong: \`Booth 1\`, \`1-5\`, \`1 to 5\`\n\nReply with your booth numbers now.`,
        `🗳️ *${session.assembly}* சட்டமன்றத் தொகுதியில் நீங்கள் எந்தெந்த பூத் எண்களை நிர்வகிக்கிறீர்கள்?\n\n📌 *பூத் எண்களை எண்கள் மட்டும் பயன்படுத்தி, கமா (,) மூலம் பிரித்து அனுப்பவும்.*\n\n✅ சரியான முறை: \`1, 5, 9\` அல்லது \`12, 15, 20\`\n❌ தவறான முறை: \`Booth 1\`, \`1-5\`, \`1 to 5\`\n\n👇 உங்கள் பூத் எண்களை இப்போது உள்ளிடவும்.`
      ));
    }
  } catch (e) {
    console.error('[WACTO Webhook]', e.message);
  }
}
