import bcrypt from 'bcryptjs';
import { signToken, revokeToken } from '../middleware/auth.js';
import { findByCredentials, nextUserId, existsByMobile, insertUser, blankUser, findWardMainAdmin, maxUserId } from '../models/userModel.js';
import { isAppDbOnline, getAppDb } from '../config/db.js';
import { ROLES, ROLE_NAME, roleHome } from '../constants/roles.js';
import { watiConfigured, sendWatiCredentials, sendWatiTemplate } from '../services/watiService.js';

// Set the JWT as an HttpOnly cookie so it can't be read/stolen by JavaScript
// (XSS). Secure in production; SameSite=Strict since the SPA and API share an
// origin. A token is still returned in the JSON body for backward compatibility.
const AUTH_COOKIE_MAX_AGE = 40 * 60 * 1000; // aligns with JWT TTL
function setAuthCookie(res, token) {
  res.cookie('edm_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: AUTH_COOKIE_MAX_AGE,
    path: '/',
  });
}

// Mirrors LoginController@submitLogin: match tbl_user by mobile_no + password_str,
// then route by user_group_id. Keeps an admin/admin bootstrap for first use.
export async function login(req, res) {
  const username = (req.body?.username ?? req.body?.email ?? '').toString().trim();
  const password = (req.body?.password ?? '').toString().trim();
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }

  // Bootstrap super admin (emergency access even with no app DB / no users yet).
  // Only enabled when a STRONG, non-default admin password is configured — the
  // old `admin`/`admin` default is rejected so it can't be used as a backdoor.
  const bootUser = process.env.ADMIN_USERNAME;
  const bootPass = process.env.ADMIN_PASSWORD;
  const bootstrapEnabled = !!bootUser && !!bootPass && bootPass.length >= 12
    && bootPass.toLowerCase() !== 'admin' && bootUser.toLowerCase() !== 'admin';
  if (bootstrapEnabled && username === bootUser && password === bootPass) {
    const claims = { sub: 'admin', name: 'Super Admin', group_id: ROLES.SUPER_ADMIN };
    const token = signToken(claims);
    setAuthCookie(res, token);
    return res.json({
      success: true,
      token,
      user: { name: 'Super Admin', group_id: ROLES.SUPER_ADMIN, role: 'Super Admin', home: roleHome(ROLES.SUPER_ADMIN) },
    });
  }

  if (!isAppDbOnline()) {
    return res.status(503).json({ success: false, message: 'App database unavailable. Use the admin bootstrap login or configure MONGO_APP_URL.' });
  }

  try {
    const user = await findByCredentials(username, password);
    if (!user) return res.status(401).json({ success: false, message: 'Invalid login or password.' });
    if (Number(user.is_active ?? 1) !== 1 && Number(user.user_group_id) !== ROLES.MLA) {
      return res.status(403).json({ success: false, message: 'Your account is deactivated.' });
    }

    const groupId = Number(user.user_group_id || 0);
    // Booth logins (group 4) need at least one booth — accept either a single
    // booth_id (booth agents) OR a booths[] array (registered candidates who
    // cover many booths). Previously only booth_id was checked, which wrongly
    // blocked candidates whose booths live in the array.
    const hasAnyBooth = !!user.booth_id || (Array.isArray(user.booths) && user.booths.length > 0);
    if (groupId === ROLES.BOOTH && !hasAnyBooth) {
      return res.status(403).json({ success: false, message: 'Must have at least one booth for login access.' });
    }

    const hasBooths = Array.isArray(user.booths) && user.booths.length > 0;
    const claims = {
      sub: String(user._id),
      name: user.first_name || user.mobile_no,
      group_id: groupId,
      assembly_id: user.assembly_id ?? null,
      booth_id: user.booth_id ?? null,
      ward_id: user.ward_id ?? null,
      mobile: String(user.mobile_no || '').replace(/\D/g, ''),
    };
    const token = signToken(claims);
    setAuthCookie(res, token);
    return res.json({
      success: true,
      token,
      user: {
        name: claims.name,
        first_name: user.first_name || claims.name,
        group_id: groupId,
        role: ROLE_NAME[groupId] || 'User',
        assembly_id: claims.assembly_id,
        booth_id: claims.booth_id,
        ward_id: claims.ward_id,
        has_booths: hasBooths,
        home: roleHome(groupId),
        mobile: claims.mobile,
        mobile_no: claims.mobile,
        district_id: user.district_id,
        category_name: user.category_name,
        candidate_type: user.candidate_type,
        booths: user.booths || [],
        paid_status: user.paid_status || 'No',
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Login failed: ' + e.message });
  }
}

// ─── WhatsApp OTP verification (via WATI) for public registration ───
const OTP_TTL_MS = 10 * 60 * 1000;          // code valid for 10 minutes
const OTP_VERIFIED_TTL_MS = 30 * 60 * 1000; // verified state valid for 30 minutes
const OTP_MAX_ATTEMPTS = 5;

// POST /auth/send-otp — generate a 6-digit code, store it, and deliver via WATI.
export async function sendOtp(req, res) {
  const mobile = String(req.body?.mobile || '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(mobile)) {
    return res.status(400).json({ success: false, message: 'Enter a valid 10-digit WhatsApp number.' });
  }
  if (!isAppDbOnline()) {
    return res.status(503).json({ success: false, message: 'Service temporarily unavailable. Please try again shortly.' });
  }
  if (!watiConfigured()) {
    return res.status(501).json({ success: false, message: 'OTP service is not configured.' });
  }
  try {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const now = Date.now();
    await getAppDb().collection('tbl_otp').updateOne(
      { mobile },
      {
        $set: {
          mobile, code,
          expires_at: new Date(now + OTP_TTL_MS).toISOString(),
          verified: false, verified_at: null, attempts: 0,
          updated_at: new Date().toISOString(),
        },
        $setOnInsert: { created_at: new Date().toISOString() },
      },
      { upsert: true },
    );
    const templateName = process.env.WATI_OTP_TEMPLATE || 'edms_otp';
    // Param name differs by template type: Authentication templates use "1"
    // (the {{1}} code var), our Utility template uses "code".
    const otpParam = process.env.WATI_OTP_PARAM || 'code';
    await sendWatiTemplate({ mobile, templateName, parameters: [{ name: otpParam, value: code }] });
    return res.json({ success: true, message: 'OTP sent to your WhatsApp number.' });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Could not send OTP: ' + e.message });
  }
}

// POST /auth/verify-otp — check the code and mark the number verified.
export async function verifyOtp(req, res) {
  const mobile = String(req.body?.mobile || '').replace(/\D/g, '');
  const otp = String(req.body?.otp || '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(mobile) || !otp) {
    return res.status(400).json({ success: false, message: 'WhatsApp number and OTP are required.' });
  }
  try {
    const coll = getAppDb().collection('tbl_otp');
    const rec = await coll.findOne({ mobile });
    if (!rec) return res.status(400).json({ success: false, message: 'Please request an OTP first.' });
    if ((rec.attempts || 0) >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ success: false, message: 'Too many attempts. Please request a new OTP.' });
    }
    if (new Date(rec.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
    }
    if (String(rec.code) !== otp) {
      await coll.updateOne({ mobile }, { $inc: { attempts: 1 } });
      return res.status(400).json({ success: false, message: 'Incorrect OTP. Please try again.' });
    }
    await coll.updateOne({ mobile }, { $set: { verified: true, verified_at: new Date().toISOString() } });
    return res.json({ success: true, message: 'WhatsApp number verified.' });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
}

// Public candidate registration — mirrors the /register flow on the landing page.
// Creates a tbl_user (ward-scoped by default) and returns generated credentials.
export async function register(req, res) {
  const b = req.body || {};
  const fullName = (b.full_name || b.firstname || '').toString().trim();
  const mobile = (b.mobile || b.mobile_no || '').toString().replace(/\D/g, '');
  if (!fullName || !mobile) {
    return res.status(400).json({ success: false, message: 'Full name and mobile number are required.' });
  }
  if (!/^\d{10}$/.test(mobile)) {
    return res.status(400).json({ success: false, message: 'Enter a valid 10-digit mobile number.' });
  }
  if (!isAppDbOnline()) {
    return res.status(503).json({ success: false, message: 'Registration is temporarily unavailable. Please try again shortly.' });
  }
  try {
    const db = getAppDb();

    // Require a recently verified OTP for this WhatsApp number.
    const otpRec = await db.collection('tbl_otp').findOne({ mobile });
    const verifiedRecent = otpRec?.verified && otpRec.verified_at
      && (Date.now() - new Date(otpRec.verified_at).getTime() < OTP_VERIFIED_TTL_MS);
    if (!verifiedRecent) {
      return res.status(403).json({ success: false, message: 'Please verify your WhatsApp number with the OTP first.' });
    }

    const passcode = String(Math.floor(100000 + Math.random() * 900000));
    const district = b.district || '';
    const bodyType = b.body_type || '';
    const position = b.position || '';
    const localBody = b.union_or_municipality || b.panchayat_or_corporation || '';
    const wardNoRaw = b.ward_number || b.ward_id || '';
    const cleanWard = String(wardNoRaw).replace(/[^0-9]/g, '') || String(wardNoRaw);

    const assemblyId = b.assembly_id ? Number(b.assembly_id) : null;
    const assemblyName = b.assembly_name || '';
    const rawBooths = Array.isArray(b.booths) ? b.booths : [];

    const boothObjects = rawBooths.map((bNo) => ({
      assembly_no: assemblyId,
      part_no: Number(bNo),
    }));

    // 1) Upsert enquiry record (feeds the admin Registrations page — mirrors tbl_enquiry).
    const enquiry = {
      full_name: fullName, firstname: fullName, mobile,
      district, role: b.role || '', affiliation: b.affiliation || '', party: b.party || '',
      body_type: bodyType, position,
      union_or_municipality: b.union_or_municipality || '',
      panchayat_or_corporation: b.panchayat_or_corporation || '',
      ward_number: cleanWard, passcode,
      assembly_id: assemblyId,
      assembly_name: assemblyName,
      booths: rawBooths,
      booth_count: rawBooths.length,
    };
    const existingEnq = await db.collection('tbl_enquiry').findOne({ mobile });
    if (existingEnq) await db.collection('tbl_enquiry').updateOne({ mobile }, { $set: enquiry });
    else await db.collection('tbl_enquiry').insertOne({ ...enquiry, created_at: new Date().toISOString() });

    // 2) User login account (Multi-booths Candidate Login - Group 11 / 4 or 6)
    const assignedGroupId = rawBooths.length > 0 ? ROLES.BOOTH_ALT : (cleanWard ? ROLES.WARD : ROLES.BOOTH_ALT);
    const userExists = await db.collection('tbl_user').findOne({ mobile_no: mobile });
    if (!userExists) {
      const id = (await maxUserId()) + 1;
      await db.collection('tbl_user').insertOne({
        ...blankUser(), id, user_group_id: assignedGroupId,
        first_name: fullName, mobile_no: mobile, password_str: passcode, password: await bcrypt.hash(passcode, 10),
        district_id: district, category_name: localBody, ward_id: cleanWard,
        candidate_type: bodyType, position, is_user_login: true,
        assembly_id: assemblyId, assembly_name: assemblyName,
        booths: boothObjects,
      });
    } else {
      await db.collection('tbl_user').updateOne({ mobile_no: mobile }, { $set: {
        user_group_id: assignedGroupId,
        password_str: passcode, password: await bcrypt.hash(passcode, 10), district_id: district, category_name: localBody,
        ward_id: cleanWard, candidate_type: bodyType, position, first_name: fullName,
        assembly_id: assemblyId, assembly_name: assemblyName,
        booths: boothObjects,
        is_user_login: true,
      } });
    }

    // Consume the verified OTP so it can't be reused.
    await db.collection('tbl_otp').deleteOne({ mobile }).catch(() => {});

    // Deliver login credentials over WhatsApp via WATI (approved template).
    // Best-effort and non-blocking — never fail registration if WATI is down.
    if (watiConfigured()) {
      sendWatiCredentials({ mobile, name: fullName, username: mobile, passcode })
        .catch((e) => console.error('[WATI web registration]', e.message));
    }

    return res.json({ success: true, message: 'Registration successful!', username: mobile, passcode });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Registration failed: ' + e.message });
  }
}

export async function me(req, res) {
  try {
    const db = getAppDb();
    let dbUser = null;
    if (req.user?.sub && req.user.sub !== 'admin') {
      try { dbUser = await findById(req.user.sub); } catch { /* ignore */ }
    }
    const groupId = Number(req.user?.group_id || 0);
    const mobileNo = dbUser?.mobile_no || req.user?.mobile || '';
    return res.json({
      success: true,
      user: {
        ...req.user,
        mobile_no: mobileNo,
        mobile: mobileNo,
        first_name: dbUser?.first_name || req.user?.name || '',
        district_id: dbUser?.district_id || dbUser?.district || '',
        category_name: dbUser?.category_name || '',
        candidate_type: dbUser?.candidate_type || dbUser?.position || '',
        paid_status: dbUser?.paid_status || 'No',
        booths: dbUser?.booths || [],
        assembly_id: dbUser?.assembly_id || req.user?.assembly_id,
        assembly_name: dbUser?.assembly_name || '',
        role: ROLE_NAME[groupId] || 'User',
        home: roleHome(groupId),
      },
    });
  } catch (e) {
    return res.json({
      success: true,
      user: {
        ...req.user,
        role: ROLE_NAME[req.user?.group_id] || 'User',
        home: roleHome(req.user?.group_id),
      },
    });
  }
}

// POST /auth/refresh — slide the session. Called by the frontend only on genuine
// user activity (throttled), so background polling can't keep an idle session
// alive. Re-issues a fresh token from the already-verified claims.
export async function refresh(req, res) {
  const claims = { ...(req.user || {}) };
  // Drop JWT-managed fields so signToken can set fresh iat/exp/jti.
  delete claims.iat;
  delete claims.exp;
  delete claims.nbf;
  delete claims.jti;
  const token = signToken(claims);
  setAuthCookie(res, token);
  return res.json({ success: true, token });
}

// POST /auth/logout — revoke the current token server-side so it can't be reused
// even before it expires.
export async function logout(req, res) {
  try {
    await revokeToken(req.user?.jti, req.user?.exp);
  } catch (e) {
    // best-effort; the client clears its token regardless
  }
  res.clearCookie('edm_token', { path: '/' });
  return res.json({ success: true });
}
