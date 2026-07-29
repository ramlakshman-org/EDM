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
};

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

// POST /flow-images/messages — Save/Update WhatsApp welcome messages
export async function saveMessages(req, res) {
  try {
    const { register_welcome_text, welcome_back_text, register_success_text } = req.body || {};
    const coll = getAppDb().collection(MSG_COLL);

    const items = [
      { key: 'register_welcome_text', text: register_welcome_text },
      { key: 'welcome_back_text', text: welcome_back_text },
      { key: 'register_success_text', text: register_success_text },
    ];

    for (const item of items) {
      if (item.text !== undefined) {
        await coll.updateOne(
          { key: item.key },
          { $set: { key: item.key, text: String(item.text), updated_at: new Date() } },
          { upsert: true }
        );
      }
    }

    res.json({ success: true, message: 'Welcome messages saved successfully!' });
  } catch (e) {
    if (e.message === 'APP_DB_OFFLINE') return res.status(503).json({ success: false, message: 'App database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}
