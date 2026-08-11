import { getVoterDb } from '../config/db.js';
import { toObjectId } from '../utils/objectId.js';
import { escapeRegex } from '../utils/escapeRegex.js';

export const collectionForAc = (acNo) => `ass_${parseInt(acNo, 10)}`;

const INT_FIELDS = ['ID', 'ASSEMBLY_NO', 'PART_NO', 'SECTION_NO', 'AGE'];

// Cache listCollections result — avoids a full DB round-trip on every global
// EPIC search. 234 collections, refreshed every 10 minutes.
let _collCache = null;
let _collCacheTs = 0;
const COLL_CACHE_TTL = 10 * 60 * 1000;

async function getAssCollections(db) {
  const now = Date.now();
  if (_collCache && now - _collCacheTs < COLL_CACHE_TTL) return _collCache;
  const all = await db.listCollections().toArray();
  _collCache = all.map((c) => c.name).filter((n) => /^ass_\d+$/.test(n));
  _collCacheTs = now;
  return _collCache;
}

// Build index-friendly filter query:
function buildQuery({ min_age, max_age, boothId, partNos, gender, has_mobile, search_text }) {
  const q = {};
  if (min_age || max_age) {
    q.AGE = {};
    if (min_age) q.AGE.$gte = parseInt(min_age, 10);
    if (max_age) q.AGE.$lte = parseInt(max_age, 10);
  }
  if (Array.isArray(partNos) && partNos.length) {
    q.PART_NO = { $in: partNos.map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n)) };
  } else if (boothId) {
    q.PART_NO = parseInt(boothId, 10);
  }
  if (gender) q.GENDER = gender;
  if (has_mobile === '1' || has_mobile === 1 || has_mobile === true) {
    q.MOBILE_NUMBER = { $nin: ['', null] };
  }

  const term = (search_text || '').trim();
  if (term) {
    const hasLetter = /[A-Za-z]/.test(term);
    const hasDigit = /[0-9]/.test(term);
    const hasSpace = /\s/.test(term);
    if (hasLetter && hasDigit && !hasSpace) {
      const epic = term.toUpperCase();
      q.EPIC_NO = /^[A-Z]{1,4}[0-9]{5,9}$/.test(epic) ? epic : { $regex: '^' + escapeRegex(epic) };
    } else if (hasDigit && !hasLetter && !hasSpace) {
      q.MOBILE_NUMBER = { $regex: '^' + escapeRegex(term) };
    } else {
      const safe = escapeRegex(term);
      q.$or = [
        { VOTER_NAME_EN: { $regex: safe, $options: 'i' } },
        { VOTER_NAME: { $regex: safe } },
        { RELATION_NAME_EN: { $regex: safe, $options: 'i' } },
      ];
    }
  }
  return q;
}

export async function filterVoters(assemblyId, filters, { page = 1, pageSize = 25 } = {}) {
  const db = getVoterDb();
  const coll = db.collection(collectionForAc(assemblyId));
  const query = buildQuery(filters);
  const skip = (Math.max(1, page) - 1) * pageSize;

  const [rows, total] = await Promise.all([
    coll.find(query).sort({ PART_NO: 1, SLNO: 1 }).skip(skip).limit(pageSize).toArray(),
    coll.countDocuments(query),
  ]);
  return { rows, total, page: Number(page), pageSize };
}

// Multi-assembly voter filter for logins with booths across one or more
// assemblies. Paginates at the DATABASE level — it never loads the full result
// set into Node memory (the old version did `.toArray()` on every collection and
// sorted in JS, which was extremely slow for booth logins with many booths).
export async function filterVotersMultiAssembly(scopeMap, filters, { page = 1, pageSize = 25 } = {}) {
  const db = getVoterDb();
  const entries = Object.entries(scopeMap).filter(([, parts]) => parts && parts.length);
  if (!entries.length) {
    return { rows: [], total: 0, page: Number(page), pageSize };
  }

  // Common case (booth/candidate login): all booths are in ONE assembly →
  // a single collection query with DB skip/limit.
  if (entries.length === 1) {
    const [acNo, parts] = entries[0];
    return filterVoters(acNo, { ...filters, partNos: parts }, { page, pageSize });
  }

  // True multi-assembly (e.g. ward across assemblies): count each collection,
  // then fetch only the rows the requested page needs by walking collections in
  // order and applying skip/limit — no full in-memory load.
  const queries = entries.map(([acNo, parts]) => ({
    coll: db.collection(collectionForAc(acNo)),
    query: buildQuery({ ...filters, partNos: parts }),
  }));

  const counts = await Promise.all(queries.map(({ coll, query }) => coll.countDocuments(query)));
  const total = counts.reduce((acc, c) => acc + c, 0);

  const pageNum = Math.max(1, Number(page));
  let skip = (pageNum - 1) * pageSize;
  let need = pageSize;
  const rows = [];

  for (let i = 0; i < queries.length && need > 0; i += 1) {
    const cnt = counts[i];
    if (skip >= cnt) { skip -= cnt; continue; } // entire collection is before this page
    const chunk = await queries[i].coll
      .find(queries[i].query)
      .sort({ PART_NO: 1, SLNO: 1 })
      .skip(skip)
      .limit(need)
      .toArray();
    rows.push(...chunk);
    need -= chunk.length;
    skip = 0;
  }

  return { rows, total, page: pageNum, pageSize };
}

// Gender counts for one booth (PART_NO) within an assembly
export async function genderCountsForParts(assemblyId, partNos) {
  const db = getVoterDb();
  const coll = db.collection(collectionForAc(assemblyId));
  const match = {};
  if (Array.isArray(partNos) && partNos.length) {
    match.PART_NO = { $in: partNos.map((p) => parseInt(p, 10)).filter((n) => !Number.isNaN(n)) };
  }
  const agg = await coll.aggregate([
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $group: { _id: '$GENDER', c: { $sum: 1 } } },
  ]).toArray();
  let total = 0, male = 0, female = 0;
  for (const g of agg) {
    total += g.c;
    if (g._id === 'Male') male = g.c;
    else if (g._id === 'Female') female = g.c;
  }
  return { total, male, female, other: total - male - female };
}

export async function assemblyAnalytics(assemblyId, booth = null, partNos = null) {
  const db = getVoterDb();
  const coll = db.collection(collectionForAc(assemblyId));

  let match = [];
  if (Array.isArray(partNos) && partNos.length > 0) {
    const validParts = partNos
      .map((p) => (typeof p === 'object' && p !== null ? parseInt(p.part_no, 10) : parseInt(p, 10)))
      .filter((n) => !Number.isNaN(n));
    if (validParts.length > 0) {
      match = [{ $match: { PART_NO: { $in: validParts } } }];
    }
  } else if (booth != null && booth !== '') {
    const partNo = parseInt(booth, 10);
    if (!Number.isNaN(partNo)) {
      match = [{ $match: { PART_NO: partNo } }];
    }
  }

  // Single pass over the matched set via $facet (was two separate aggregations
  // = two scans). Computes overall counts and per-booth breakdown together.
  const facet = await coll.aggregate([
    ...match,
    { $facet: {
      counts: [
        { $group: {
            _id: null,
            total: { $sum: 1 },
            male: { $sum: { $cond: [{ $eq: ['$GENDER', 'Male'] }, 1, 0] } },
            female: { $sum: { $cond: [{ $eq: ['$GENDER', 'Female'] }, 1, 0] } },
            youth: { $sum: { $cond: [{ $and: [{ $gte: ['$AGE', 18] }, { $lte: ['$AGE', 35] }] }, 1, 0] } },
            middle: { $sum: { $cond: [{ $and: [{ $gte: ['$AGE', 36] }, { $lte: ['$AGE', 59] }] }, 1, 0] } },
            senior: { $sum: { $cond: [{ $gte: ['$AGE', 60] }, 1, 0] } },
        } },
      ],
      booths: [
        { $group: {
            _id: '$PART_NO',
            booth_name: { $first: '$BOOTH_NAME' },
            latitude: { $first: '$LATITUDE' },
            longitude: { $first: '$LONGITUDE' },
            voter_count: { $sum: 1 },
            male_voters: { $sum: { $cond: [{ $eq: ['$GENDER', 'Male'] }, 1, 0] } },
            female_voters: { $sum: { $cond: [{ $eq: ['$GENDER', 'Female'] }, 1, 0] } },
            other_voters: { $sum: { $cond: [{ $and: [{ $ne: ['$GENDER', 'Male'] }, { $ne: ['$GENDER', 'Female'] }] }, 1, 0] } },
        } },
        { $sort: { _id: 1 } },
      ],
    } },
  ]).toArray();
  const countsAgg = facet[0]?.counts || [];
  const boothsAgg = facet[0]?.booths || [];

  const c = countsAgg[0] || { total: 0, male: 0, female: 0, youth: 0, middle: 0, senior: 0 };
  const other = c.total - c.male - c.female;
  const booths = boothsAgg
    .filter((b) => b._id !== null && b._id !== '')
    .map((b) => ({
      part_no: parseInt(b._id, 10),
      booth_name: b.booth_name || '',
      lat: b.latitude != null && b.latitude !== '' ? parseFloat(b.latitude) : null,
      lng: b.longitude != null && b.longitude !== '' ? parseFloat(b.longitude) : null,
      voter_count: b.voter_count || 0,
      male_voters: b.male_voters || 0,
      female_voters: b.female_voters || 0,
      other_voters: b.other_voters || 0,
    }));

  return {
    total: c.total, male: c.male, female: c.female, other,
    youth: c.youth, middle: c.middle, senior: c.senior,
    booths,
  };
}

export function voterExportCursor(assemblyId, filters, fields) {
  const db = getVoterDb();
  const coll = db.collection(collectionForAc(assemblyId));
  const projection = fields ? Object.fromEntries(fields.map((f) => [f, 1])) : undefined;
  return coll.find(buildQuery(filters), projection ? { projection } : {}).sort({ PART_NO: 1 });
}

export async function updateVoterMobile(assemblyId, id, mobile) {
  const db = getVoterDb();
  let voter = null;
  if (assemblyId) {
    voter = await getVoter(assemblyId, id);
  }
  if (!voter) {
    voter = await getVoterGlobal(id);
  }
  if (!voter) return false;

  const acNo = voter.ASSEMBLY_NO || assemblyId;
  const coll = db.collection(collectionForAc(acNo));
  const oid = toObjectId(id);
  const filter = oid ? { _id: oid } : { EPIC_NO: String(id).toUpperCase() };
  const clean = String(mobile ?? '').trim();
  const res = await coll.updateOne(filter, { $set: { MOBILE_NUMBER: clean } });
  return res.matchedCount > 0;
}

export async function getVoter(assemblyId, id) {
  if (assemblyId) {
    const db = getVoterDb();
    const coll = db.collection(collectionForAc(assemblyId));
    const oid = toObjectId(id);
    const filter = oid ? { _id: oid } : { EPIC_NO: String(id).toUpperCase() };
    return coll.findOne(filter);
  }
  return getVoterGlobal(id);
}

// Search a voter by _id or EPIC_NO globally across all assembly collections (ass_*)
export async function getVoterGlobal(id, assemblyId = null) {
  const db = getVoterDb();
  const oid = toObjectId(id);
  const cleanEpic = String(id || '').trim().toUpperCase();

  const filter = oid ? { _id: oid } : { EPIC_NO: cleanEpic };

  if (assemblyId) {
    try {
      const coll = db.collection(collectionForAc(assemblyId));
      const found = await coll.findOne(filter);
      if (found) return found;
    } catch { /* ignore */ }
  }

  const assColls = await getAssCollections(db);

  for (const collName of assColls) {
    try {
      const coll = db.collection(collName);
      const voter = await coll.findOne(filter);
      if (voter) return voter;
    } catch { /* ignore */ }
  }

  return null;
}

export async function searchEpic(assemblyId, epicNo) {
  const db = getVoterDb();
  const clean = String(epicNo || '').trim().toUpperCase();
  if (assemblyId) {
    const coll = db.collection(collectionForAc(assemblyId));
    return coll.findOne({ EPIC_NO: clean });
  }
  return searchEpicGlobal(clean);
}

export async function searchEpicGlobal(epicNo, assemblyId = null) {
  const db = getVoterDb();
  const clean = String(epicNo || '').trim().toUpperCase();

  if (assemblyId) {
    try {
      const coll = db.collection(collectionForAc(assemblyId));
      const voter = await coll.findOne({ EPIC_NO: clean });
      if (voter) return { voter, assembly_no: parseInt(assemblyId, 10) };
    } catch { /* ignore */ }
    return null;
  }

  const assColls = await getAssCollections(db);

  for (const collName of assColls) {
    try {
      const acNo = parseInt(collName.replace('ass_', ''), 10);
      const coll = db.collection(collName);
      const voter = await coll.findOne({ EPIC_NO: clean });
      if (voter) {
        return { voter, assembly_no: acNo };
      }
    } catch { /* ignore */ }
  }

  return null;
}
