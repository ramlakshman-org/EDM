import { getVoterDb, getAppDb, isAppDbOnline } from '../config/db.js';
import { findById, findWardMainAdmin } from '../models/userModel.js';
import { getAssembly } from '../models/assemblyModel.js';
import { collectionForAc } from '../models/voterModel.js';

// A per-mobile ward user login inherits its booths from the main-admin combination.
async function effectiveBooths(rec) {
  if (!rec) return [];
  if (Array.isArray(rec.booths) && rec.booths.length > 0) {
    return rec.booths;
  }
  if (rec.is_user_login) {
    try {
      const main = await findWardMainAdmin({ district_id: rec.district_id, category_name: rec.category_name, ward_id: rec.ward_id, candidate_type: rec.candidate_type, position: rec.position });
      if (Array.isArray(main?.booths) && main.booths.length > 0) {
        return main.booths;
      }
    } catch { /* ignore */ }
  }
  if (rec.mobile_no) {
    try {
      const db = getAppDb();
      const mob = String(rec.mobile_no).replace(/\D/g, '');
      if (mob) {
        const enq = await db.collection('tbl_enquiry').findOne({ mobile: mob });
        if (enq && Array.isArray(enq.booths) && enq.booths.length > 0) {
          return enq.booths;
        }
      }
    } catch { /* ignore */ }
  }
  return Array.isArray(rec.booths) ? rec.booths : [];
}

const SAMPLE_BOOTHS = 47;
const SAMPLE_VOTERS = 705;

async function wardRecord(req) {
  const u = req.user || {};
  if (u.sub && u.sub !== 'admin') { try { return await findById(u.sub); } catch { /* offline */ } }
  return null;
}

function account(rec, u) {
  return {
    ward_login: rec?.first_name || u?.name || '-',
    body_type: rec?.candidate_type || '-',
    position: rec?.position || '-',
    district: rec?.district_id || '-',
    local_body: rec?.category_name || '-',
    ward_number: rec?.ward_id ?? '-',
    username: rec?.mobile_no || '-',
    paid_status: rec?.paid_status || 'No',
    transaction_id: rec?.transaction_id || null,
  };
}

// GET /ward/home — support multi-assembly booth list and voter counts
export async function home(req, res) {
  const u = req.user || {};
  const rec = await wardRecord(req);
  const booths = await effectiveBooths(rec);

  if (!booths.length) {
    return res.json({
      success: true, isSample: true,
      account: account(rec, u),
      sample: { booths: SAMPLE_BOOTHS, voters: SAMPLE_VOTERS },
    });
  }

  // Group booths by assembly_no
  const defaultAc = rec?.assembly_id;
  const byAssembly = new Map();

  for (const b of booths) {
    let acNo = defaultAc;
    let partNo = null;
    let acName = null;
    let boothName = null;

    if (typeof b === 'object' && b !== null) {
      acNo = b.assembly_no || acNo;
      partNo = parseInt(b.part_no, 10);
      acName = b.assembly_name;
      boothName = b.booth_name;
    } else if (b != null && b !== '') {
      partNo = parseInt(b, 10);
    }

    if (!acNo || Number.isNaN(partNo)) continue;

    if (!byAssembly.has(acNo)) {
      byAssembly.set(acNo, []);
    }
    byAssembly.get(acNo).push({ part_no: partNo, acName, boothName });
  }

  let rows = [];
  const db = getVoterDb();

  for (const [acNo, bList] of byAssembly.entries()) {
    let assembly = null;
    try { assembly = await getAssembly(acNo); } catch { /* offline */ }
    const parts = bList.map((x) => x.part_no);

    try {
      const coll = db.collection(collectionForAc(acNo));
      const agg = await coll.aggregate([
        { $match: { PART_NO: { $in: parts } } },
        { $group: { _id: '$PART_NO', booth_name: { $first: '$BOOTH_NAME' }, voter_count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray();

      const aggMap = new Map(agg.map((r) => [r._id, r]));

      for (const item of bList) {
        const found = aggMap.get(item.part_no);
        rows.push({
          assembly_no: acNo,
          assembly_name: item.acName || assembly?.assembly_name || `Assembly ${acNo}`,
          part_no: item.part_no,
          booth_name: found?.booth_name || item.boothName || `Booth ${item.part_no}`,
          voter_count: found?.voter_count || 0,
        });
      }
    } catch {
      for (const item of bList) {
        rows.push({
          assembly_no: acNo,
          assembly_name: item.acName || assembly?.assembly_name || `Assembly ${acNo}`,
          part_no: item.part_no,
          booth_name: item.boothName || `Booth ${item.part_no}`,
          voter_count: 0,
        });
      }
    }
  }

  res.json({ success: true, isSample: false, account: account(rec, u), booths: rows });
}

// Deterministic sample voter dataset for Preview Mode (705 records).
const FIRST = ['Arun', 'Priya', 'Karthik', 'Deepa', 'Suresh', 'Meena', 'Ravi', 'Lakshmi', 'Vijay', 'Kavya', 'Mohan', 'Divya', 'Ganesh', 'Anitha', 'Bala'];
const LAST = ['Kumar', 'Raj', 'Murugan', 'Devi', 'Selvam', 'Rani', 'Krishnan', 'Priya', 'Nathan', 'Bharathi'];
const REL = ['Father', 'Mother', 'Husband', 'Wife'];

function buildSampleVoters() {
  const rows = [];
  for (let i = 1; i <= SAMPLE_VOTERS; i++) {
    const g = i % 2 === 0 ? 'Female' : 'Male';
    const fn = FIRST[i % FIRST.length];
    const ln = LAST[(i * 3) % LAST.length];
    rows.push({
      _id: `sample_${i}`,
      EPIC_NO: `SMP${String(1000000 + i)}`,
      VOTER_NAME_EN: `${fn} ${ln}`,
      RELATION_NAME_EN: `${LAST[(i * 7) % LAST.length]}`,
      RELATION_TYPE: REL[i % REL.length],
      AGE: 18 + (i % 62),
      MOBILE_NUMBER: `9${String(100000000 + (i * 12345) % 899999999)}`,
      GENDER: g,
      PART_NO: 1 + (i % SAMPLE_BOOTHS),
      HOUSE_NO: String(1 + (i % 250)),
      VOTER_NAME: `${fn} ${ln}`,
    });
  }
  return rows;
}
const SAMPLE_CACHE = buildSampleVoters();

function sampleBoothList() {
  return Array.from({ length: SAMPLE_BOOTHS }, (_, i) => ({
    assembly_no: 0, assembly_name: 'Sample Assembly', part_no: i + 1, booth_name: `Sample Booth ${i + 1}`,
  }));
}

async function wardBooths(rec) {
  const booths = await effectiveBooths(rec);
  if (!booths.length) return { isSample: true, boothList: sampleBoothList() };

  let defaultAc = rec?.assembly_id;
  if (!defaultAc && rec?.mobile_no) {
    try {
      const db = getAppDb();
      const mob = String(rec.mobile_no).replace(/\D/g, '');
      if (mob) {
        const enq = await db.collection('tbl_enquiry').findOne({ mobile: mob });
        if (enq?.assembly_id) defaultAc = enq.assembly_id;
      }
    } catch { /* ignore */ }
  }

  let boothList = [];

  for (const b of booths) {
    let acNo = defaultAc;
    let partNo = null;
    let acName = rec?.assembly_name;
    let boothName = null;

    if (typeof b === 'object' && b !== null) {
      acNo = b.assembly_no || acNo;
      partNo = parseInt(b.part_no, 10);
      acName = b.assembly_name || acName;
      boothName = b.booth_name;
    } else if (b != null && b !== '') {
      partNo = parseInt(b, 10);
    }

    if (!acNo || Number.isNaN(partNo)) continue;

    boothList.push({
      assembly_no: acNo,
      assembly_name: acName || `Assembly ${acNo}`,
      part_no: partNo,
      booth_name: boothName || `Booth ${partNo}`,
    });
  }

  return { isSample: false, boothList };
}

export async function socialMedia(req, res) {
  const rec = await wardRecord(req);
  const { isSample, boothList } = await wardBooths(rec);
  const existingRequests = {};
  if (isAppDbOnline() && rec?._id) {
    try {
      const reqs = await getAppDb().collection('tbl_social_request')
        .find({ ward_user_id: String(rec._id) }).project({ service_type: 1 }).toArray();
      for (const r of reqs) existingRequests[r.service_type] = true;
    } catch { /* ignore */ }
  }
  res.json({ success: true, isSample, boothList, existingRequests });
}

export async function boothSections(req, res) {
  const { assembly_no, part_no, is_sample } = req.query;
  if (is_sample === '1' || is_sample === 1) {
    return res.json([1, 2, 3, 4]);
  }
  try {
    const db = getVoterDb();
    const coll = db.collection(collectionForAc(assembly_no));
    const sections = await coll.distinct('SECTION_NO', { PART_NO: parseInt(part_no, 10) });
    res.json(sections.map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b));
  } catch { res.json([]); }
}

export async function socialMediaRequest(req, res) {
  const rec = await wardRecord(req);
  const b = req.body || {};
  const type = b.service_type;
  if (!['sms', 'voice', 'whatsapp'].includes(type)) {
    return res.status(400).json({ success: false, message: 'Invalid service type.' });
  }
  const allVoters = b.all_voters === '1' || b.all_voters === 1 || b.all_voters === true;
  if (!allVoters && !b.booth) return res.status(400).json({ success: false, message: 'Select a booth or choose All Voters.' });
  if (type === 'sms' && !(b.sms_message_content || '').trim()) return res.status(400).json({ success: false, message: 'SMS message is required.' });
  if (type === 'whatsapp' && !(b.whatsapp_message_content || '').trim()) return res.status(400).json({ success: false, message: 'WhatsApp message is required.' });
  if (!isAppDbOnline()) return res.status(503).json({ success: false, message: 'App database unavailable.' });
  try {
    const hasImg = !!b.has_image || ((type === 'whatsapp' || type === 'sms') && !!b.file_data_url);
    const hasAud = !!b.has_audio || (type === 'voice' && !!b.file_data_url);
    const doc = {
      ward_user_id: rec ? String(rec._id) : null,
      ward_username: rec?.mobile_no || null,
      candidate_mobile: String(rec?.mobile_no || '').replace(/\D/g, '') || null,
      service_type: type,
      all_voters: allVoters,
      booth: allVoters ? null : (b.booth || null),
      section_no: allVoters ? null : (b.section_no || null),
      language: b.language || null,
      message: type === 'sms' ? (b.sms_message_content || '') : type === 'whatsapp' ? (b.whatsapp_message_content || '') : '',
      has_image: hasImg,
      has_audio: hasAud,
      image_url: hasImg && b.file_data_url ? b.file_data_url : null,
      audio_url: hasAud && b.file_data_url ? b.file_data_url : null,
      media_urls: b.file_data_url ? [b.file_data_url] : [],
      file_name: b.file_name || null,
      status: 'Pending',
      created_at: new Date().toISOString(),
    };
    await getAppDb().collection('tbl_social_request').insertOne(doc);
    res.json({ success: true, message: 'Your request has been submitted successfully.' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

export function sampleVoters(req, res) {
  const search = (req.query.search || '').trim().toLowerCase();
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 10);
  let rows = SAMPLE_CACHE;
  if (search) {
    rows = rows.filter((r) =>
      r.EPIC_NO.toLowerCase().includes(search) ||
      r.VOTER_NAME_EN.toLowerCase().includes(search) ||
      String(r.MOBILE_NUMBER).includes(search));
  }
  const total = rows.length;
  const start = (Math.max(1, page) - 1) * pageSize;
  res.json({ success: true, total, page, pageSize, rows: rows.slice(start, start + pageSize) });
}
