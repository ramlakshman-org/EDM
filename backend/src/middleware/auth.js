import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getAppDb, isAppDbOnline } from '../config/db.js';

const DENYLIST_COLL = 'tbl_token_denylist';

export function signToken(payload) {
  // Each token carries a unique id (jti) so it can be individually revoked on
  // logout via the denylist below.
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '40m',
    jwtid: crypto.randomUUID(),
  });
}

// Revoke a token by its jti until it would have expired anyway. A TTL index on
// expireAt lets MongoDB auto-purge entries, keeping the denylist small.
export async function revokeToken(jti, expSeconds) {
  if (!jti || !isAppDbOnline()) return;
  const db = getAppDb();
  const col = db.collection(DENYLIST_COLL);
  await col.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
  const expireAt = new Date((Number(expSeconds) || 0) * 1000 || Date.now() + 3600 * 1000);
  await col.updateOne({ jti }, { $set: { jti, expireAt } }, { upsert: true });
}

// Mirrors the Laravel `adminauth` middleware — protects the admin API.
export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Not authenticated.' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Reject tokens that were explicitly logged out (server-side revocation).
    if (decoded.jti && isAppDbOnline()) {
      const denied = await getAppDb()
        .collection(DENYLIST_COLL)
        .findOne({ jti: decoded.jti }, { projection: { _id: 1 } });
      if (denied) return res.status(401).json({ success: false, message: 'Session ended. Please log in again.' });
    }
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  }
}
