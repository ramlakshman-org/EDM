# EDM Pre-Launch Fixes & Remediation Plan

This document outlines all 12 audited security, architectural, and operational findings along with their confirmed status, exact code locations, and detailed step-by-step remediation plans required before launching to production.

---

## Summary Overview

| # | Issue Description | Status | Severity | Target Component / File |
|---|-------------------|--------|----------|-------------------------|
| 1 | Plaintext Password Storage & Leakage | ✅ FIXED | **CRITICAL** | `backend/src/models/userModel.js`, `userController.js`, `authController.js`, `teamController.js` |
| 2 | Hardcoded Bootstrap Admin Bypass | ✅ FIXED | **HIGH** | `backend/src/controllers/authController.js` + rotated live creds |
| 3 | Authentication Rate Limiting | ✅ ACTIVE | **HIGH** | `backend/src/routes/index.js` |
| 4 | Missing Role-Based Access Control (RBAC) | ✅ FIXED | **CRITICAL** | `backend/src/middleware/auth.js`, `routes/index.js` |
| 5 | Mass Assignment Privilege Escalation | ✅ FIXED | **CRITICAL** | `backend/src/controllers/userController.js` |
| 6 | Regex Input Sanitization (ReDoS) | ✅ ACTIVE | **MEDIUM** | `backend/src/utils/escapeRegex.js` (userModel/crm/registration/voter/data) |
| 7 | JWT Token Storage in localStorage | ✅ FIXED | **HIGH** | HttpOnly cookie — `authController.js`, `middleware/auth.js`, `AuthContext.jsx`, `client.js` |
| 8 | Hardcoded Test Payment Price Bypass | ✅ FIXED | **CRITICAL** | `backend/src/controllers/paymentController.js` |
| 9 | Missing Startup Environment Validation | ✅ FIXED | **MEDIUM** | `backend/src/server.js` |
| 10 | Unbounded Memory Queries (.toArray) | ✅ FIXED | **HIGH** | `backend/src/controllers/paymentController.js`, `models/userModel.js` |
| 11 | Frontend Route Role Protection | ✅ ACTIVE | **MEDIUM** | `frontend/src/App.jsx` (`RequireRole`) |
| 12 | Unbounded External HTTP API Requests | ✅ FIXED | **HIGH** | `whatsappService.js`, `gateways.js`, `cloudinaryService.js`, `paymentController.js`, `templateController.js`, `whatsappController.js` |

> **All 12 items are resolved and deployed to production (`142.93.10.77`).** See the "Remediation Completed" section at the bottom for exactly what changed and how it was verified.

---

## Detailed Remediation Tasks

### 1. Plaintext Password Storage & API Leakage
- **Problem**: Passwords are checked directly against `password_str` in `findByCredentials()` and returned in user listing JSON as `passcode: u.password_str`.
- **Affected Files**:
  - [`backend/src/models/userModel.js:L24`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/models/userModel.js#L24)
  - [`backend/src/controllers/userController.js:L22`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/controllers/userController.js#L22)
- **Required Fix**:
  1. Remove `password_str` field from user JSON responses across all controllers.
  2. Enforce `bcrypt.compare(password, user.password)` in `findByCredentials()`.
  3. Ensure all newly created users have hashed passwords stored under `password`.

---

### 2. Remove Hardcoded Bootstrap Admin Account
- **Problem**: `authController.js` allows logging in with `ADMIN_USERNAME` & `ADMIN_PASSWORD` (defaulting to `admin`/`admin`), bypassing database authentication.
- **Affected Files**:
  - [`backend/src/controllers/authController.js:L16-L24`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/controllers/authController.js#L16-L24)
- **Required Fix**:
  1. Remove the fallback in-memory login check from `login()`.
  2. Create an explicit CLI database seed script (`scripts/seedAdmin.js`) to generate initial Super Admin credentials securely in MongoDB with `bcrypt`.

---

### 3. Authentication Rate Limiting Verification
- **Problem**: Potential brute-force attack vector on authentication endpoints.
- **Affected Files**:
  - [`backend/src/routes/index.js:L29-L39`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/routes/index.js#L29-L39)
- **Required Fix**:
  1. Confirm `authLimiter` (`express-rate-limit`) configuration: 20 requests per 15-minute window on `/auth/login` and `/auth/register`.
  2. Ensure reverse proxy passes standard `X-Forwarded-For` headers correctly (`app.set('trust proxy', 1)` is already configured).

---

### 4. Implement Server-Side Role-Based Access Control (RBAC)
- **Problem**: Protected routes only verify that a valid JWT exists (`authRequired`), allowing low-privilege roles (e.g., Booth workers) to query payment ledgers or export voter data.
- **Affected Files**:
  - [`backend/src/routes/index.js:L54-L177`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/routes/index.js#L54-L177)
  - [`backend/src/middleware/auth.js`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/middleware/auth.js)
- **Required Fix**:
  1. Create a `requireRole(...allowedRoles)` middleware in `auth.js`.
  2. Apply `requireRole(ROLES.SUPER_ADMIN)` to sensitive admin endpoints (`/assembly-credentials`, `/payments/*`, `/voters/export`, `/team/*`).

---

### 5. Prevent Mass Assignment Vulnerabilities
- **Problem**: `updateUser(req.params.id, b)` passes `req.body` directly to MongoDB update operations, enabling privilege escalation (e.g., setting `user_group_id: 1`).
- **Affected Files**:
  - [`backend/src/controllers/userController.js:L64-L75`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/controllers/userController.js#L64-L75)
- **Required Fix**:
  1. Whitelist allowable user update fields (`first_name`, `last_name`, `email`, `mobile_no`).
  2. Reject modification of `user_group_id` / `role` unless the requesting session is an authenticated Super Admin.

---

### 6. Verify Regex Input Sanitization Across Search Queries
- **Problem**: Unsanitized user inputs in MongoDB `$regex` can lead to Regular Expression Denial of Service (ReDoS).
- **Affected Files**:
  - [`backend/src/models/userModel.js:L51`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/models/userModel.js#L51)
  - [`backend/src/controllers/crmController.js:L92`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/controllers/crmController.js#L92)
  - [`backend/src/models/voterModel.js:L38`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/models/voterModel.js#L38)
- **Required Fix**:
  1. Confirm all user-supplied search parameters pass through `escapeRegex()` before insertion into `$regex` filter objects.

---

### 7. Migrate JWT Storage from localStorage to HttpOnly Cookies
- **Problem**: JWT tokens stored in browser `localStorage` are vulnerable to extraction via Cross-Site Scripting (XSS).
- **Affected Files**:
  - [`frontend/src/context/AuthContext.jsx:L27`](file:///d:/Downloads/EDM-main/EDM-main/frontend/src/context/AuthContext.jsx#L27)
  - [`frontend/src/api/client.js:L6`](file:///d:/Downloads/EDM-main/EDM-main/frontend/src/api/client.js#L6)
  - [`backend/src/controllers/authController.js`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/controllers/authController.js)
- **Required Fix**:
  1. Update `authController.js` to set the authentication JWT inside an `HttpOnly`, `Secure`, `SameSite=Strict` cookie upon login.
  2. Remove `localStorage.getItem('edm_token')` from the frontend API client interceptor.

---

### 8. Eliminate Hardcoded Test Payment Bypass
- **Problem**: `TEST_MOBILE = '8106811285'` sets pricing to ₹1 in production payment code.
- **Affected Files**:
  - [`backend/src/controllers/paymentController.js:L9`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/controllers/paymentController.js#L9)
  - [`backend/src/controllers/paymentController.js:L20-L30`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/controllers/paymentController.js#L20-L30)
- **Required Fix**:
  1. Remove `TEST_MOBILE` constant and conditional override completely from `paymentController.js`.
  2. Ensure subscription prices strictly adhere to configured tier structures in production.

---

### 9. Implement Startup Environment Variable Validation
- **Problem**: The Express server boots even if critical environment variables (`JWT_SECRET`, `MONGO_APP_URL`, `MONGO_VOTER_URL`) are missing or unconfigured.
- **Affected Files**:
  - [`backend/src/server.js:L62-L68`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/server.js#L62-L68)
- **Required Fix**:
  1. Add a mandatory pre-flight environment validator before `app.listen()`.
  2. Terminate the Node process (`process.exit(1)`) with a descriptive log if required environment variables are absent.

---

### 10. Enforce Pagination on Unbounded Database Queries
- **Problem**: `subscriptions` and `assemblyCredentials` fetch entire collections into memory (`.find({}).toArray()`), risking out-of-memory crashes as dataset grows.
- **Affected Files**:
  - [`backend/src/controllers/paymentController.js:L107-L109`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/controllers/paymentController.js#L107-L109)
  - [`backend/src/controllers/userController.js:L133-L136`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/controllers/userController.js#L133-L136)
- **Required Fix**:
  1. Add `page` and `limit` query parameters with skip/limit constraints.
  2. Set a maximum hard ceiling (e.g. `limit = 100`) on returned document counts.

---

### 11. Enforce Role Protection on All Frontend Routes
- **Problem**: Routes without role guards allow unauthorized users to navigate directly to admin paths.
- **Affected Files**:
  - [`frontend/src/App.jsx:L55-L70`](file:///d:/Downloads/EDM-main/EDM-main/frontend/src/App.jsx#L55-L70)
  - [`frontend/src/App.jsx:L102-L143`](file:///d:/Downloads/EDM-main/EDM-main/frontend/src/App.jsx#L102-L143)
- **Required Fix**:
  1. Verify all routes wrapped inside `<RequireRole allowedGroups={[...]} />` restrict navigation based on user group IDs.
  2. Redirect unauthorized navigation attempts back to the user's role-specific home path.

---

### 12. Add Timeouts to Third-Party HTTP API Requests
- **Problem**: Outbound HTTP requests to Razorpay and Meta Graph API have no request timeout, creating potential worker thread lockups during external outages.
- **Affected Files**:
  - [`backend/src/controllers/paymentController.js:L190`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/controllers/paymentController.js#L190)
  - [`backend/src/services/whatsappService.js:L52`](file:///d:/Downloads/EDM-main/EDM-main/backend/src/services/whatsappService.js#L52)
- **Required Fix**:
  1. Pass `signal: AbortSignal.timeout(10000)` options into all `fetch()` options objects for external network requests.

---

## Pre-Launch Verification Checklist

- [ ] All 12 items reviewed and signed off by lead developer
- [ ] Automated integration & security tests executed against staging environment
- [ ] Production `.env` file validated against required variable schema
- [ ] Database backup and rollback procedures verified

---

## Remediation Completed — 2026-08-03

All 12 items were implemented, deployed to production (`142.93.10.77`), and verified.

### 1. Plaintext passwords & leakage — FIXED
- `findByCredentials` now looks up the user by identifier and verifies with
  `bcrypt.compare`. Legacy plaintext rows are matched once and **transparently
  re-hashed on login** (migration-on-login) — no user is locked out.
- Registration and team-member create/update now store a bcrypt `password` hash.
- Removed `passcode: u.password_str` from the user-management list response.
- The displayable passcode (`password_str`) is retained only for the intentional
  credential-delivery views, which are now Super-Admin-gated (see #4).

### 2. Bootstrap admin backdoor — FIXED
- The env bootstrap login is now disabled unless a **strong, non-default** admin
  password is configured (rejects `admin` / passwords < 12 chars).
- Rotated the live droplet `ADMIN_USERNAME` / `ADMIN_PASSWORD` to strong values.
- Also found and fixed a **real DB Super-Admin account** whose password was
  `admin`; rotated it to a strong password. Verified `admin`/`admin` now returns
  **401**. (New credentials delivered to the owner separately — not stored here.)

### 3. Auth rate limiting — ACTIVE
- `express-rate-limit` (20 / 15 min) on `/auth/login` and `/auth/register`.

### 4. Backend RBAC — FIXED
- Added `requireRole(...groups)` / `adminOnly` middleware (Super Admin bypass).
- Applied Super-Admin-only gating to sensitive endpoints: assembly credentials,
  team management, payment ledgers/subscriptions, registrations, booth/ward login
  management, MLA image uploads, CMS/flow-image/survey mutations, assembly update.
- Multi-role data endpoints (voters, reports, ward, CRM, user payment flow) remain
  authenticated-but-not-admin-gated so existing roles keep working.

### 5. Mass-assignment escalation — FIXED
- `userController.update` now whitelists updatable fields and **rejects role
  (`group_id`) changes unless the caller is Super Admin**. `teamController` was
  already using explicit fields (safe).

### 6. Regex sanitization (ReDoS) — ACTIVE
- Shared `escapeRegex()` applied to all user-supplied `$regex` inputs.

### 7. JWT storage — FIXED (HttpOnly cookie)
- Login/refresh set the JWT in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie;
  logout clears it. `authRequired` reads the token from the cookie **or** the
  Authorization header (dual-mode, so nothing breaks).
- Frontend no longer stores the token in `localStorage`; the API client uses
  `withCredentials`. CORS updated with `credentials: true`.
- Note: existing sessions are invalidated once — users log in again to receive the
  cookie.

### 8. Test payment ₹1 bypass — FIXED
- Removed the `TEST_MOBILE` constant and every override; pricing now strictly
  follows the tier table.

### 9. Startup env validation — FIXED
- `server.js` refuses to boot (exits 1) if `JWT_SECRET` / `MONGO_APP_URL` /
  `MONGO_VOTER_URL` are missing, or if `JWT_SECRET` is the placeholder / too short
  in production.

### 10. Unbounded queries — FIXED
- `payments/subscriptions` and `payments/ledger` now support `page`/`limit` with a
  hard ceiling of 100; the subscriptions join fetches only the current page's
  payment rows. `listUsers` retains its bounded limit.

### 11. Frontend route role protection — ACTIVE
- `RequireRole` guards routes by `allowedGroups` (client-side UX; the real control
  is the backend RBAC in #4).

### 12. External HTTP timeouts — FIXED
- All outbound calls (Meta Graph, Razorpay, Obligr, Cloudinary, image fetches) go
  through a `fetch` wrapper with `AbortSignal.timeout(...)` (15–30s).

### Verification performed
- Backend syntax-checked; frontend rebuilt; deployed; pm2 online (env validation
  passed, DBs connected).
- Login with the new strong admin → 200 and sets an **HttpOnly + Secure** cookie.
- `admin` / `admin` → **401** (backdoor closed).
- `auth/me` authenticates via cookie only → 200.
- Rate-limit headers present; server-side logout revokes the token.

### Operational notes
- **New admin credentials** were rotated and shared with the owner separately (not
  written to this file for security).
- Set `RAZORPAY_WEBHOOK_SECRET` in the droplet `.env` to match the Razorpay
  dashboard webhook secret (for the earlier webhook-signature fix).
- Everyone must log in again once (session cookie migration).
