import { getAppDb } from '../config/db.js';
import { toObjectId } from '../utils/objectId.js';

const COLL = 'tbl_user';

// Auth lookup: mobile_no / user_name / email + password_str (string or int), mirroring LoginController.
export async function findByCredentials(loginInput, password) {
  const db = getAppDb();
  const cleanInput = String(loginInput || '').trim();
  const cleanMobile = cleanInput.replace(/\D/g, '').slice(-10);
  const asInt = Number.isNaN(Number(password)) ? null : parseInt(password, 10);

  const queryOr = [
    { user_name: cleanInput },
    { mobile_no: cleanInput },
    { email: cleanInput },
  ];
  if (cleanMobile && cleanMobile.length === 10) {
    queryOr.push({ mobile_no: cleanMobile });
  }

  const passOr = [
    { password_str: password },
    ...(asInt !== null ? [{ password_str: asInt }] : []),
  ];

  return db.collection(COLL).findOne({
    $or: queryOr,
    $and: [{ $or: passOr }],
  });
}

export async function nextUserId() {
  const db = getAppDb();
  const top = await db.collection(COLL).find({}).sort({ id: -1 }).limit(1).next();
  return top ? Number(top.id || 0) + 1 : 1;
}

export async function existsByMobile(mobileNo) {
  const db = getAppDb();
  return !!(await db.collection(COLL).findOne({ mobile_no: mobileNo }, { projection: { _id: 1 } }));
}

export async function listUsers({ search = '', groupId = null, assemblyId = null, limit = 500 } = {}) {
  const db = getAppDb();
  const q = {};
  if (groupId !== null && groupId !== '') q.user_group_id = parseInt(groupId, 10);
  if (assemblyId) q.assembly_id = parseInt(assemblyId, 10);
  if (search) {
    q.$or = [
      { first_name: { $regex: search, $options: 'i' } },
      { mobile_no: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }
  return db.collection(COLL).find(q).limit(limit).toArray();
}

export async function insertUser(doc) {
  const db = getAppDb();
  const res = await db.collection(COLL).insertOne(doc);
  return { _id: res.insertedId, ...doc };
}

export async function insertManyUsers(docs) {
  const db = getAppDb();
  if (!docs.length) return { insertedCount: 0 };
  return db.collection(COLL).insertMany(docs);
}

export async function updateUser(id, data) {
  const db = getAppDb();
  const oid = toObjectId(id);
  await db.collection(COLL).updateOne({ _id: oid }, { $set: { ...data, updated_at: new Date().toISOString() } });
  return db.collection(COLL).findOne({ _id: oid });
}

export async function deleteUser(id) {
  const db = getAppDb();
  return db.collection(COLL).deleteOne({ _id: toObjectId(id) });
}

export async function findById(id) {
  const db = getAppDb();
  return db.collection(COLL).findOne({ _id: toObjectId(id) });
}

// Existing booth logins (group 4) for an assembly -> their booth_ids.
export async function existingBoothIds(assemblyId) {
  const db = getAppDb();
  const rows = await db.collection(COLL)
    .find({ user_group_id: 4, assembly_id: parseInt(assemblyId, 10) })
    .project({ booth_id: 1 })
    .toArray();
  return rows.map((r) => String(r.booth_id));
}

export async function boothLoginsForAssembly(assemblyId) {
  const db = getAppDb();
  return db.collection(COLL)
    .find({ user_group_id: 4, assembly_id: parseInt(assemblyId, 10) })
    .toArray();
}

// MLA (group 3) passcode for an assembly — seeds booth passcodes.
export async function mlaPasscode(assemblyId) {
  const db = getAppDb();
  const mla = await db.collection(COLL).findOne({ user_group_id: 3, assembly_id: parseInt(assemblyId, 10) });
  return mla ? (mla.password_str ?? '123456') : '123456';
}

export async function wardLogins() {
  const db = getAppDb();
  // Only the "main admin" combination records (not the per-mobile user logins).
  return db.collection(COLL).find({ user_group_id: 6, is_user_login: { $ne: true } }).toArray();
}

// Ward-id can be stored as "5", 5, "ward-5" or "Ward 5" — match all forms.
function wardIdVariants(ward) {
  const clean = String(ward ?? '').replace(/[^0-9]/g, '') || String(ward ?? '');
  const out = [clean, `ward-${clean}`, `Ward ${clean}`];
  const n = parseInt(clean, 10);
  if (!Number.isNaN(n)) out.push(n);
  return out;
}

// Find the main ward-admin (combination) record — the dedupe key.
export async function findWardMainAdmin({ district_id, category_name, ward_id, candidate_type, position }) {
  const db = getAppDb();
  return db.collection(COLL).findOne({
    user_group_id: 6,
    is_user_login: { $ne: true },
    district_id,
    category_name,
    candidate_type,
    position,
    ward_id: { $in: wardIdVariants(ward_id) },
  });
}

export async function maxUserId() {
  const db = getAppDb();
  const top = await db.collection(COLL).find({}).sort({ id: -1 }).limit(1).next();
  return top ? Number(top.id || 0) : 0;
}

export { wardIdVariants };

// Counts of users grouped by user_group_id (for the super-admin dashboard).
export async function countsByGroup() {
  const db = getAppDb();
  const agg = await db.collection(COLL).aggregate([
    { $group: { _id: '$user_group_id', c: { $sum: 1 } } },
  ]).toArray();
  const out = {};
  for (const g of agg) out[g._id] = g.c;
  return out;
}

// Users whose parent_id matches (for King/DSA/Tele hierarchical dashboards).
export async function countChildren(parentId) {
  const db = getAppDb();
  return db.collection(COLL).countDocuments({ parent_id: parentId });
}

// A blank tbl_user document with all fields the app expects.
export function blankUser() {
  return {
    id: 0, uuid: '', g_user_id: '', user_group_id: 0, first_name: '', last_name: '',
    email: '', mobile_no: '', voter_id: '', age: '', gender: '', dob: '',
    parliament_id: '', district_id: 0, booth_id: '', assembly_id: 0, assembly_no: 0,
    category_type: '', category_name: '', ward_id: '', password: '', password_str: '',
    parent_id: 0, is_active: 1, profile_status: 0, created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(), paid_status: 'No', candidate_party: '',
    candidate_type: '', position: '',
  };
}
