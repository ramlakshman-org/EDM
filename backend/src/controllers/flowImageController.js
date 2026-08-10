import { getAppDb } from '../config/db.js';
import { toObjectId } from '../utils/objectId.js';
import * as cloudinary from '../services/cloudinaryService.js';

// Port of web\admin\FlowImagesController + App\Models\FlowImage.
// Collection app_flow_images: { key, name, type, url, public_id }.
// The set of assets is fixed (registration flow headers + party flags); each
// asset is uploaded to Cloudinary (folder election-flow-assets) then upserted by key.
const COLL = 'app_flow_images';

const FLOW_ASSETS = {
  register_header: {
    name: 'Registration Flow Header (Video/Image)',
    description: 'Contestant registration invitation header. Recommended: Video (mp4, max 5MB) or Image.',
    default_type: 'video',
  },
  welcome_back_header: {
    name: 'Already Registered Header (Image)',
    description: 'Header image shown when an already-registered user sends Hi. Recommended: Image (aspect ratio 1:1 or 8:1).',
    default_type: 'image',
  },
  register_success_header: {
    name: 'Registration Success Header (Image)',
    description: 'Header image shown in the final registration success credentials notification. Recommended: Image.',
    default_type: 'image',
  },
  flag_dmk: { name: 'DMK Flag', description: 'Logo/Flag for Dravida Munnetra Kazhagam', default_type: 'image' },
  flag_aiadmk: { name: 'AIADMK Flag', description: 'Logo/Flag for All India Anna Dravida Munnetra Kazhagam', default_type: 'image' },
  flag_bjp: { name: 'BJP Flag', description: 'Logo/Flag for Bharatiya Janata Party', default_type: 'image' },
  flag_inc: { name: 'INC Flag', description: 'Logo/Flag for Indian National Congress', default_type: 'image' },
  flag_ntk: { name: 'NTK Flag', description: 'Logo/Flag for Naam Tamilar Katchi', default_type: 'image' },
  flag_pmk: { name: 'PMK Flag', description: 'Logo/Flag for Pattali Makkal Katchi', default_type: 'image' },
  flag_vck: { name: 'VCK Flag', description: 'Logo/Flag for Viduthalai Chiruthaigal Katchi', default_type: 'image' },
  flag_mdmk: { name: 'MDMK Flag', description: 'Logo/Flag for Marumalarchi Dravida Munnetra Kazhagam', default_type: 'image' },
  flag_ammk: { name: 'AMMK Flag', description: 'Logo/Flag for Amma Makkal Munnetra Kazhagam', default_type: 'image' },
  flag_dmdk: { name: 'DMDK Flag', description: 'Logo/Flag for Desiya Murpokku Dravida Kazhagam', default_type: 'image' },
  flag_tvk: { name: 'TVK Flag', description: 'Logo/Flag for Tamilaga Vettri Kazhagam', default_type: 'image' },
  flag_independent: { name: 'Independent Flag', description: 'Default flag for Independent Candidates', default_type: 'image' },
  flag_other: { name: 'Other Flag', description: 'Logo/Flag for other political parties', default_type: 'image' },

  // ---- Choose-Service flow assets (WhatsApp self-service menu) ----
  svc_welcome_banner: { name: 'Services: Welcome Banner', description: 'Top banner on the "Choose Service" menu. Recommended: wide image 1000x125 (8:1 ratio).', default_type: 'image' },
  svc_icon_register: { name: 'Services Icon: Register', description: 'Menu icon for Register. Recommended: square image 200x200.', default_type: 'image' },
  svc_icon_credentials: { name: 'Services Icon: My Credentials', description: 'Menu icon for My Credentials (registered users). 200x200.', default_type: 'image' },
  svc_icon_demo: { name: 'Services Icon: Demo', description: 'Menu icon for Demo. 200x200.', default_type: 'image' },
  svc_icon_benefits: { name: 'Services Icon: Benefits', description: 'Menu icon for Benefits. 200x200.', default_type: 'image' },
  svc_icon_faq: { name: 'Services Icon: FAQ', description: 'Menu icon for FAQ. 200x200.', default_type: 'image' },
  svc_icon_website: { name: 'Services Icon: Website', description: 'Menu icon for Website. 200x200.', default_type: 'image' },
  svc_icon_support: { name: 'Services Icon: Support', description: 'Menu icon for Support. 200x200.', default_type: 'image' },
  svc_icon_social: { name: 'Services Icon: Social Media Request', description: 'Menu icon for Social Media Request (registered). 200x200.', default_type: 'image' },
  svc_icon_purchase: { name: 'Services Icon: Purchase / My Plan', description: 'Menu icon for Purchase / My Plan (registered). 200x200.', default_type: 'image' },
  svc_icon_whatsapp: { name: 'Social Icon: WhatsApp', description: 'Social sub-menu icon for WhatsApp broadcast. 200x200.', default_type: 'image' },
  svc_icon_audio: { name: 'Social Icon: Audio SMS', description: 'Social sub-menu icon for Audio SMS. 200x200.', default_type: 'image' },
  svc_icon_sms: { name: 'Social Icon: SMS Broadcast', description: 'Social sub-menu icon for SMS Broadcast. 200x200.', default_type: 'image' },

  svc_demo_video: { name: 'Services: Demo Video', description: 'Demo video sent when the user taps Demo. Recommended: mp4 (max 16MB).', default_type: 'video' },
  svc_website_image: { name: 'Services: Website Message Image', description: 'Header image for the Website message (with Visit Website button). 8:1 or 1.91:1.', default_type: 'image' },
  svc_support_image: { name: 'Services: Support Message Image', description: 'Header image for the Support message (with Call button). 8:1 or 1.91:1.', default_type: 'image' },

  svc_register_banner: { name: 'Services Banner: Register', description: 'Banner shown on the Register screen. 1000x125 (8:1 ratio).', default_type: 'image' },
  svc_benefits_banner: { name: 'Services Banner: Benefits', description: 'Banner shown on the Benefits screen. 1000x125 (8:1 ratio).', default_type: 'image' },
  svc_faq_banner: { name: 'Services Banner: FAQ', description: 'Banner shown on the FAQ screen. 1000x125 (8:1 ratio).', default_type: 'image' },
  svc_social_banner: { name: 'Services Banner: Social Media', description: 'Banner shown on the Social Media Request screens. 1000x125 (8:1 ratio).', default_type: 'image' },
  svc_purchase_banner: { name: 'Services Banner: Purchase / Plan', description: 'Banner shown on the Purchase / My Plan screen. 1000x125 (8:1 ratio).', default_type: 'image' },
  svc_credentials_image: { name: 'Services: Credentials Message Image', description: 'Header image for the My Credentials message. 8:1 or 1.91:1.', default_type: 'image' },
  svc_request_done_header: { name: 'Services: Request Submitted Header', description: 'Header image for the confirmation message sent after a service request is submitted (with a Choose Service button). 8:1 or 1.91:1.', default_type: 'image' },
};

// GET /flow-images — merge the fixed asset list with stored records (by key).
export async function list(req, res) {
  try {
    const stored = await getAppDb().collection(COLL).find({}).toArray();
    const byKey = {};
    for (const s of stored) byKey[s.key] = s;

    const assets = Object.entries(FLOW_ASSETS).map(([key, meta]) => {
      const db = byKey[key];
      return {
        key,
        name: meta.name,
        description: meta.description,
        url: db ? db.url : null,
        type: db ? db.type : meta.default_type,
        public_id: db ? db.public_id : null,
      };
    });
    res.json({ success: true, assets });
  } catch (e) {
    if (e.message === 'APP_DB_OFFLINE') return res.status(503).json({ success: false, message: 'App database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}

// POST /flow-images/upload — { key, filename, mime, fileBase64 }.
// Determines resource type from mime, deletes old Cloudinary asset, uploads new, upserts by key.
export async function upload(req, res) {
  const { key, filename, mime, fileBase64 } = req.body || {};
  if (!key || !fileBase64) return res.status(400).json({ success: false, message: 'key and file are required.' });
  if (!Object.prototype.hasOwnProperty.call(FLOW_ASSETS, key)) {
    return res.status(400).json({ success: false, message: 'Invalid asset key' });
  }

  const resourceType = String(mime || '').includes('video') ? 'video' : 'image';
  // Strip a data: URL prefix if present.
  const b64 = String(fileBase64).replace(/^data:[^;]+;base64,/, '');
  let buffer;
  try {
    buffer = Buffer.from(b64, 'base64');
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid file data.' });
  }

  try {
    const coll = getAppDb().collection(COLL);
    const old = await coll.findOne({ key });
    if (old && old.public_id) {
      await cloudinary.destroy(old.public_id, old.type || 'image');
    }

    const uploadRes = await cloudinary.upload(buffer, filename, resourceType, 'election-flow-assets');

    const doc = {
      key,
      name: FLOW_ASSETS[key].name,
      type: resourceType,
      url: uploadRes.url,
      public_id: uploadRes.public_id,
    };
    await coll.updateOne({ key }, { $set: doc }, { upsert: true });

    res.json({ success: true, message: 'Asset uploaded successfully!', url: doc.url, type: doc.type });
  } catch (e) {
    if (e.message === 'APP_DB_OFFLINE') return res.status(503).json({ success: false, message: 'App database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}

// DELETE /flow-images/:id — id may be the asset key or a Mongo _id.
export async function remove(req, res) {
  const id = req.params.id;
  try {
    const coll = getAppDb().collection(COLL);
    let asset = await coll.findOne({ key: id });
    if (!asset) {
      const oid = toObjectId(id);
      if (oid) asset = await coll.findOne({ _id: oid });
    }
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });

    if (asset.public_id) await cloudinary.destroy(asset.public_id, asset.type || 'image');
    await coll.deleteOne({ _id: asset._id });
    res.json({ success: true, message: 'Asset deleted successfully!' });
  } catch (e) {
    if (e.message === 'APP_DB_OFFLINE') return res.status(503).json({ success: false, message: 'App database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}

const MSG_COLL = 'app_flow_messages';

const DEFAULT_MESSAGES = {
  register_welcome_text: 'Welcome! Register to access constituency insights, voter patterns, campaign tools, and local body election support.\n\nTap the button below to fill out the registration form inside WhatsApp.',
  welcome_back_text: 'Welcome back *{name}*! You are already registered.\n\n🔑 *Username:* `{username}`\n🔒 *Passcode:* `{passcode}`\n\nUse these credentials to log in to the Election Management Dashboard.',
  register_success_text: 'Congratulations *{name}*! 🎉 Your registration has been completed successfully.\n\n🔑 *Username:* `{username}`\n🔒 *Passcode:* `{passcode}`\n\nTap below to log in to your Election Management Dashboard!',

  // ---- Choose-Service flow copy (all admin-editable) ----
  svc_welcome_text: 'Namaste\n\nWelcome to *EDMS* — your Election Data Platform. Tap *Choose Service* below to register, watch a demo, explore benefits & FAQ, visit our website or reach support.',
  svc_menu_heading: 'Select a service',
  svc_demo_text: 'Here is a quick demo of EDMS in action.\n\nTap *Choose Service* to continue exploring.',
  svc_benefits_text: '*Why EDMS?*\n\n• Know your voters — booth & ward level\n• Analyse every ward & booth\n• Identify key voter groups\n• Find strong & weak areas\n• Plan your campaign with data\n• Reach the right voters\n\nWin your election with data, not guesswork.',
  svc_faq_text: '*Frequently Asked Questions*\n\n*Q: What is EDMS?*\nA complete election data & campaign platform for Tamil Nadu local body elections.\n\n*Q: How do I register?*\nTap Choose Service → Register and fill the form.\n\n*Q: Is my data secure?*\nYes — access is role-based and encrypted.',
  svc_website_text: 'Explore everything about EDMS on our website.',
  svc_website_url: 'https://election2026sir.in',
  svc_website_btn: 'Visit Website',
  svc_support_text: 'Need help? Our support team is here for you. Tap below to call us.',
  svc_support_phone: '918106811285',
  svc_support_btn: 'Call Support',
  svc_social_submitted_text: 'Your *{channel}* broadcast request has been received, *{name}*.\n\nOur team will process it shortly.',
  svc_social_already_text: 'You already have a pending *{channel}* request. Our team is processing it — we\'ll update you soon.',
  svc_social_audio_text: 'Your *Audio SMS* request is saved.\n\nPlease reply here with your audio file (mp3) now, and we\'ll attach it to your broadcast.',
  svc_social_audio_received_text: 'Got your audio! Your *Audio SMS* broadcast request is now complete and queued for our team.',
  svc_purchase_intro_text: 'Here is your EDMS plan summary. Tap the payment link to activate your subscription.',
  svc_purchase_link_text: '*EDMS Subscription*\n\nBooths: {booths}\nAmount: ₹{amount} (incl. 18% GST)\n\nTap the secure link below to pay. Your PRO features unlock automatically after payment.',
  svc_purchase_done_text: 'Payment received! Your EDMS subscription is now active. Welcome aboard.',
};

// Text keys the admin may edit via /flow-images/messages.
const EDITABLE_MESSAGE_KEYS = Object.keys(DEFAULT_MESSAGES);

// GET /flow-images/messages — Get current WhatsApp welcome messages
export async function getMessages(req, res) {
  try {
    const docs = await getAppDb().collection(MSG_COLL).find({}).toArray();
    const messages = { ...DEFAULT_MESSAGES };
    for (const d of docs) {
      if (d.key && d.text) {
        messages[d.key] = d.text;
      }
    }
    res.json({ success: true, messages });
  } catch (e) {
    if (e.message === 'APP_DB_OFFLINE') return res.status(503).json({ success: false, message: 'App database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}

// POST /flow-images/messages — Save/Update any editable flow text (welcome
// messages + Choose-Service copy). Accepts any known key present in the body.
export async function saveMessages(req, res) {
  try {
    const body = req.body || {};
    const coll = getAppDb().collection(MSG_COLL);

    let saved = 0;
    for (const key of EDITABLE_MESSAGE_KEYS) {
      if (body[key] !== undefined) {
        await coll.updateOne(
          { key },
          { $set: { key, text: String(body[key]), updated_at: new Date() } },
          { upsert: true }
        );
        saved += 1;
      }
    }

    res.json({ success: true, saved, message: 'Messages saved successfully!' });
  } catch (e) {
    if (e.message === 'APP_DB_OFFLINE') return res.status(503).json({ success: false, message: 'App database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}
