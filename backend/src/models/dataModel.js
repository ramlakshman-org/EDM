import { getAppDb } from '../config/db.js';
import { escapeRegex } from '../utils/escapeRegex.js';

// Mirrors App\Models\Data (mongodb_app 'data' collection) — generic paginated list.
const DEFAULT_COLL = 'data';
const SEARCH_FIELDS = ['name', 'dob', 'age', 'address', 'phone', 'district'];

function buildQuery({ search = {}, withPhoneOnly = false } = {}) {
  const q = {};
  const and = [];
  for (const [k, v] of Object.entries(search)) {
    if (v !== '' && v !== null && v !== undefined) {
      and.push({ [k]: { $regex: escapeRegex(String(v).trim()), $options: 'i' } });
    }
  }
  if (withPhoneOnly) { and.push({ phone: { $nin: ['Null', 'N', '', null] } }); }
  if (and.length) q.$and = and;
  return q;
}

export async function listData({ collection = DEFAULT_COLL, search = {}, withPhoneOnly = false, page = 1, pageSize = 25 } = {}) {
  const db = getAppDb();
  const coll = db.collection(collection);
  const query = buildQuery({ search, withPhoneOnly });
  const skip = (Math.max(1, page) - 1) * pageSize;
  const [rows, total] = await Promise.all([
    coll.find(query).skip(skip).limit(pageSize).toArray(),
    coll.countDocuments(query),
  ]);
  return { rows, total, page: Number(page), pageSize };
}

export { SEARCH_FIELDS };
