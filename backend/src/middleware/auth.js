import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getAppDb, isAppDbOnline } from '../config/db.js';
import { ROLES } from '../constants/roles.js';

const DENYLIST_COLL = 'tbl_token_denylist';

// Role gate. Super Admin (group 1) always passes; otherwise the caller's
// group_id must be in the allowed list. Use after `authRequired`.
export function requireRole(...allowedGroups) {
  const allowed = allowedGroups.map(Number);
  return (req, res, next) => {
    const g = Number(req.user?.group_id);
    if (g === ROLES.SUPER_ADMIN || allowed.includes(g)) return next();
    return res.status(403).json({ success: false, message: 'You do not have permission to perform this action.' });
  };
}

// Convenience: Super-Admin-only access.
export const adminOnly = requireRole(ROLES.SUPER_ADMIN);

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

// Extract the JWT from the HttpOnly cookie (preferred) or the Authorization
// header (backward-compatible). No cookie-parser dependency needed.
export function tokenFromRequest(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)edm_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Mirrors the Laravel `adminauth` middleware — protects the admin API.
export async function authRequired(req, res, next) {
  const token = tokenFromRequest(req);
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
