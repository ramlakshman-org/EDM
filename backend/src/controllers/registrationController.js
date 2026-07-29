import { getAppDb } from '../config/db.js';
import { toObjectId } from '../utils/objectId.js';

// Mirrors web\admin\DashboardController@registrations* — candidate registrations
// come from tbl_enquiry; passcode falls back to tbl_user; social broadcast
// requests come from tbl_social_request(s) matched by candidate mobile.

const clean = (m) => String(m || '').replace(/\D/g, '');

// Pull social broadcast requests for a set of cleaned mobiles from both the
// Node collection (tbl_social_request) and any legacy PHP one (tbl_social_requests),
// normalising field names so the frontend has one shape.
async function socialRequestsFor(db, mobiles) {
  const list = [...new Set(mobiles.filter(Boolean))];
  if (!list.length) return {};
  const collections = ['tbl_social_request', 'tbl_social_requests'];
  const out = {};
  for (const name of collections) {
    let docs = [];
    try {
      docs = await db.collection(name)
        .find({ $or: [{ candidate_mobile: { $in: list } }, { ward_username: { $in: list } }] })
        .toArray();
    } catch { docs = []; }
    for (const d of docs) {
      const key = clean(d.candidate_mobile || d.ward_username || '');
      if (!key) continue;
      (out[key] ||= []).push({
        service_type: d.service_type,
        message_content: d.message_content ?? d.message ?? '',
        language: d.language || 'English',
        created_at: d.created_at || null,
        all_voters: d.all_voters ?? (d.booth_no === 'All'),
        booth_no: d.booth_no ?? d.booth ?? null,
        section_no: d.section_no || null,
        media_urls: Array.isArray(d.media_urls) ? d.media_urls : (d.image_url ? [d.image_url] : d.audio_url ? [d.audio_url] : []),
        has_image: !!d.has_image || !!d.image_url,
        has_audio: !!d.has_audio || !!d.audio_url,
        image_url: d.image_url || (Array.isArray(d.media_urls) && d.media_urls[0]) || null,
        audio_url: d.audio_url || (Array.isArray(d.media_urls) && d.media_urls[0]) || null,
      });
    }
  }
  // newest first per mobile
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }
  return out;
}

export async function list(req, res) {
  try {
    const db = getAppDb();
    const q = {};
    if (req.query.district) q.district = req.query.district;
    if (req.query.body_type) q.body_type = req.query.body_type;
    if (req.query.ward_number) q.ward_number = req.query.ward_number;
    if (req.query.position) {
      const p = req.query.position;
      const map = {
        Corporation: ['Corporation', 'Corporation Ward Member'],
        Municipality: ['Municipality', 'Municipality Ward Member'],
        'Town Panchayat': ['Town Panchayat', 'Town Panchayat Ward Member'],
      };
      q.position = map[p] ? { $in: map[p] } : p;
    }
    if (req.query.search) {
      q.$or = [
        { full_name: { $regex: req.query.search, $options: 'i' } },
        { mobile: { $regex: req.query.search, $options: 'i' } },
      ];
    }
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 25);
    const coll = db.collection('tbl_enquiry');
    const [docs, total] = await Promise.all([
      coll.find(q).sort({ created_at: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
      coll.countDocuments(q),
    ]);

    const mobiles = docs.map((d) => clean(d.mobile)).filter(Boolean);

    // Passcode & payment status fallback: look up user logins by mobile in one query.
    const users = mobiles.length
      ? await db.collection('tbl_user').find(
          { mobile_no: { $in: docs.map((d) => d.mobile).filter(Boolean) } },
          { projection: { mobile_no: 1, password_str: 1, paid_status: 1, transaction_id: 1, assembly_id: 1, assembly_name: 1, booths: 1 } },
        ).toArray()
      : [];
    const userByMobile = {};
    for (const u of users) userByMobile[clean(u.mobile_no)] = u;

    const reqByMobile = await socialRequestsFor(db, mobiles);

    res.json({
      success: true, total, page, pageSize,
      rows: docs.map((r) => {
        const cm = clean(r.mobile);
        const uRec = userByMobile[cm];
        const rawBooths = Array.isArray(r.booths) && r.booths.length > 0 ? r.booths : (Array.isArray(r.selected_booths) && r.selected_booths.length > 0 ? r.selected_booths : (Array.isArray(uRec?.booths) ? uRec.booths : []));
        const assId = r.assembly_id || r.assembly_no || uRec?.assembly_id || null;
        const assName = r.assembly_name || r.assembly || uRec?.assembly_name || null;
        return {
          _id: r._id,
          id: r.id ?? null,
          full_name: r.full_name || r.firstname || 'No Name',
          mobile: r.mobile || '-',
          district: r.district || '-',
          position: r.position || '-',
          body_type: r.body_type || '-',
          local_body: r.union_or_municipality || r.panchayat_or_corporation || '-',
          ward_number: r.ward_number || '-',
          assembly_id: assId,
          assembly_name: assName,
          booths: rawBooths,
          booth_count: rawBooths.length || r.booth_count || 0,
          passcode: r.passcode || uRec?.password_str || '-',
          paid_status: uRec?.paid_status || 'No',
          transaction_id: uRec?.transaction_id || null,
          created_at: r.created_at || '-',
          // just the service types for the compact icon column
          requests: (reqByMobile[cm] || []).map((x) => x.service_type),
        };
      }),
    });
  } catch (e) {
    if (e.message === 'APP_DB_OFFLINE') return res.status(503).json({ success: false, message: 'App database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}

// GET /registrations/:id — full registration + its social broadcast requests.
export async function detail(req, res) {
  try {
    const db = getAppDb();
    const coll = db.collection('tbl_enquiry');
    let reg = null;
    const oid = toObjectId(req.params.id);
    if (oid) reg = await coll.findOne({ _id: oid });
    if (!reg && /^\d+$/.test(req.params.id)) reg = await coll.findOne({ id: parseInt(req.params.id, 10) });

    if (!reg) {
      let uDoc = null;
      if (oid) uDoc = await db.collection('tbl_user').findOne({ _id: oid });
      if (!uDoc && /^\d+$/.test(req.params.id)) uDoc = await db.collection('tbl_user').findOne({ id: parseInt(req.params.id, 10) });

      if (uDoc?.mobile_no) {
        reg = await coll.findOne({ mobile: uDoc.mobile_no });
        if (!reg) {
          reg = {
            _id: uDoc._id,
            full_name: [uDoc.first_name, uDoc.last_name].filter(Boolean).join(' ') || uDoc.mobile_no || 'Ward User',
            mobile: uDoc.mobile_no,
            district: uDoc.district_id || '-',
            position: uDoc.candidate_type || 'Ward Member',
            body_type: uDoc.candidate_type ? (['Corporation', 'Municipality', 'Town Panchayat'].includes(uDoc.candidate_type) ? 'urban' : 'rural') : 'urban',
            union_or_municipality: uDoc.category_name || '-',
            panchayat_or_corporation: uDoc.category_name || '-',
            ward_number: uDoc.ward_id || '-',
            created_at: uDoc.created_at || new Date().toISOString(),
          };
        }
      }
    }

    if (!reg) return res.status(404).json({ success: false, message: 'Registration not found.' });

    const reqByMobile = await socialRequestsFor(db, [clean(reg.mobile)]);
    
    // Passcode & Payment lookup
    let passcode = reg.passcode || '';
    let userRec = null;
    let paymentDoc = null;

    if (reg.mobile) {
      userRec = await db.collection('tbl_user').findOne({ mobile_no: reg.mobile });
      if (userRec?.password_str) passcode = userRec.password_str;

      if (userRec?.paid_status === 'Yes' || userRec?.transaction_id) {
        paymentDoc = await db.collection('tbl_payment').findOne({
          $or: [
            { payment_id: userRec.transaction_id },
            { user_id: String(userRec._id) },
            { mobile_no: reg.mobile }
          ]
        });
      }
    }

    res.json({
      success: true,
      registration: {
        ...reg,
        passcode,
        paid_status: userRec?.paid_status || 'No',
        transaction_id: userRec?.transaction_id || paymentDoc?.payment_id || null,
        payment: paymentDoc ? {
          payment_id: paymentDoc.payment_id,
          order_id: paymentDoc.order_id,
          amount: Number(paymentDoc.amount) > 1000 ? Number(paymentDoc.amount) / 100 : Number(paymentDoc.amount),
          status: paymentDoc.status || 'Paid',
          booth_count: paymentDoc.booth_count || (Array.isArray(userRec?.booths) ? userRec.booths.length : 1),
          created_at: paymentDoc.created_at,
        } : (userRec?.paid_status === 'Yes' ? {
          payment_id: userRec.transaction_id || 'Captured',
          amount: reg.mobile === '8106811285' ? 1 : 2360,
          status: 'Paid',
        } : null),
      },
      socialRequests: reqByMobile[clean(reg.mobile)] || [],
    });
  } catch (e) {
    if (e.message === 'APP_DB_OFFLINE') return res.status(503).json({ success: false, message: 'App database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}

// PUT /registrations/:id — update editable candidate fields (mirrors updateRegistration).
export async function update(req, res) {
  try {
    const db = getAppDb();
    const coll = db.collection('tbl_enquiry');
    const oid = toObjectId(req.params.id);
    const filter = oid ? { _id: oid } : (/^\d+$/.test(req.params.id) ? { id: parseInt(req.params.id, 10) } : null);
    if (!filter) return res.status(400).json({ success: false, message: 'Invalid id.' });

    const b = req.body || {};
    const set = {
      firstname: b.full_name || '',
      full_name: b.full_name || '',
      district: b.district || '',
      role: b.role || '',
      affiliation: b.affiliation || '',
      party: b.party || '',
      body_type: b.body_type || '',
      position: b.position || '',
      union_or_municipality: b.union_or_municipality || '',
      panchayat_or_corporation: b.panchayat_or_corporation || '',
      ward_number: b.ward_number || '',
      updated_at: new Date().toISOString(),
    };
    const r = await coll.updateOne(filter, { $set: set });
    if (!r.matchedCount) return res.status(404).json({ success: false, message: 'Registration not found.' });
    res.json({ success: true, message: 'Registration details updated successfully.' });
  } catch (e) {
    if (e.message === 'APP_DB_OFFLINE') return res.status(503).json({ success: false, message: 'App database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}
