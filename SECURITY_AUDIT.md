# EDM — Code & Security Audit Report

**Scope:** Full codebase (backend Node/Express/MongoDB + frontend React/Vite)
**Type:** Read-only static analysis. **No code was changed.**
**Date:** 2026-07-29

---

## How the audit was performed

Equivalent checks to SonarQube / CodeQL / Semgrep were run manually plus tooling:

- **Dependency CVE scan** — `npm audit` on `backend/` and `frontend/`.
- **Manual static analysis** emulating Semgrep/CodeQL/Sonar rule classes:
  injection (NoSQL/command/XSS), authentication, authorization, secrets
  management, webhook signature verification, cryptography, error handling,
  and insecure configuration.

> To run these continuously, a Semgrep or CodeQL GitHub Action (or a SonarQube
> scan) can be wired into CI. That requires the git remote / CI setup.

---

## Summary

| Severity | Count | Items |
|---|---|---|
| 🔴 Critical | 2 | Plaintext passwords; Razorpay webhook signature bypass |
| 🟠 High | 1 | WhatsApp/Meta webhook has no payload signature verification |
| 🟡 Medium | 5 | No login rate limit; no security headers; frontend dep CVEs; verbose errors; PII in logs |
| 🟢 Low | 6 | ReDoS via regex; CORS fallback; weak RSA padding fallback; client-only logout; large components; (backend deps clean) |

- **Backend `npm audit`: 0 vulnerabilities.**
- **Frontend `npm audit`: 4 (3 moderate, 1 high)** — react-router open redirect (non-breaking fix) + esbuild/vite dev-server-only.

---

## 🔴 Critical

### 1. Passwords stored & compared in plaintext
- **File:** `backend/src/models/userModel.js` → `findByCredentials`
- **Detail:** Login matches `{ password_str: password }` directly — no hashing.
  `bcrypt` is imported in `authController.js` but never used for verification.
  Passcodes are likewise stored/displayed in plaintext.
- **Impact:** A database leak exposes every user's password/passcode. No
  defense-in-depth on the most sensitive data.
- **Recommended fix:** Hash with `bcrypt` (cost ≥ 10); migrate existing
  `password_str` values (hash-on-next-login or a one-time migration);
  verify with `bcrypt.compare`.

### 2. Razorpay webhook signature bypass → fraudulent "paid" upgrade
- **File:** `backend/src/controllers/paymentController.js` → `razorpayWebhook`
- **Detail:**
  ```js
  if (signature && expectedSig !== signature) { return 400 }
  ```
  When the `x-razorpay-signature` header is **absent**, verification is skipped
  and the handler sets `paid_status: 'Yes'` for the mobile in the payload.
  Additionally `req.rawBody` is never captured (no `verify` in `express.json`),
  so the HMAC is computed over a re-serialized body and won't match genuine
  Razorpay payloads either — verification is broken in both directions.
- **Impact:** Anyone can POST a forged `payment.captured` event (no signature)
  and unlock PRO/paid access for any phone number, with no payment.
- **Recommended fix:** Capture the raw body (`express.json({ verify })`),
  **reject when the signature is missing**, and compare with
  `crypto.timingSafeEqual`.

---

## 🟠 High

### 3. WhatsApp/Meta webhook has no payload signature verification
- **File:** `backend/src/controllers/whatsappController.js` → `webhookHandler`
- **Detail:** POST events are processed without verifying the
  `X-Hub-Signature-256` HMAC. The GET verify-token only protects the initial
  subscription handshake, not incoming events.
- **Impact:** Anyone who knows the webhook URL can inject fake inbound messages,
  spoof delivery statuses, reopen 24/72h messaging windows, and trigger flow
  logic.
- **Recommended fix:** Verify `X-Hub-Signature-256` against `META_APP_SECRET`
  over the raw request body; reject on mismatch.

---

## 🟡 Medium

### 4. No rate limiting / lockout on `/auth/login`
- **File:** `backend/src/routes/index.js`, `authController.login`
- **Impact:** Combined with plaintext comparison, brute-force/credential-stuffing
  is easy. No account lockout or throttling.
- **Fix:** Add `express-rate-limit` on auth routes; consider lockout/backoff.

### 5. No security headers (helmet not used)
- **File:** `backend/src/server.js`
- **Impact:** Missing HSTS, X-Content-Type-Options, frame protection, etc.
- **Fix:** `app.use(helmet())`.

### 6. Frontend dependency CVEs (`npm audit`)
- `react-router` / `react-router-dom` 6.x — **open redirect** advisory
  (GHSA-wrjc-x8rr-h8h6) + SSR deserialize issue (SSR path unused here).
  **Fixable non-breaking** via `npm audit fix`.
- `esbuild` ≤ 0.24.2 / `vite` — moderate advisory, **dev-server only**
  (does not affect the production build). Full fix needs `vite@8` (breaking).

### 7. Verbose error messages returned to clients
- **Files:** most controllers (`res.status(500).json({ message: err.message })`)
- **Impact:** Internal error/stack details leak to clients.
- **Fix:** Return generic messages; log details server-side only.

### 8. Full webhook payloads logged (PII)
- **File:** `backend/src/controllers/whatsappController.js`
  (`console.log(JSON.stringify(body, null, 2))`)
- **Impact:** Phone numbers and message content (PII) written to logs.
- **Fix:** Redact/limit logging in production.

---

## 🟢 Low / Code smells

- **ReDoS:** raw user input passed into `{ $regex }` without escaping
  (`userModel.listUsers`, CRM `listConversations`).
- **CORS** falls back to `'*'` if `CLIENT_ORIGIN` is unset (prod sets it today).
- **Flow crypto** accepts an `RSA_PKCS1_PADDING` fallback (weaker than OAEP) —
  `backend/src/services/flowCryptoService.js`.
- **JWT logout** is client-side only (acceptable given the 40-minute TTL).
- **Very large components** — `frontend/src/pages/CrmInbox.jsx` (~1600 lines)
  hurts maintainability.
- **Backend dependencies:** `npm audit` reports **0 vulnerabilities**.

---

## ✅ Reviewed and found solid (not vulnerable)

- **XSS mitigated** — `formatWhatsappText` HTML-escapes `& < >` before applying
  formatting; the PDF export uses `escapeHtml`.
- **NoSQL operator injection** on login blocked by `String()` coercion of inputs.
- **Ward-payment verify** endpoint (`verifyWardPayment`) uses a correct HMAC check.
- **Agent authorization** (`agentCanAccess`) restricts agents to their assigned
  conversations.
- **Cloudinary** uses signed server-side uploads.
- **Secrets hygiene** — `.env` and `.env.production` are gitignored (not in repo);
  only `.env.example` is tracked.

---

## Recommended fix order

1. **#2** Razorpay webhook bypass — money/entitlement impact, small fix.
2. **#1** Password hashing — needs a migration plan for existing users.
3. **#3** Meta webhook signature verification.
4. **#4 / #5 / #6** — login rate limit + `helmet` + `npm audit fix` (react-router).

> No changes have been made. Awaiting go-ahead on which items to implement.

---

## Remediation status (2026-07-29)

Fixed & deployed (Medium + Low batch; the two Critical items were intentionally left for a separate change):

| # | Finding | Status |
|---|---|---|
| 4 | No login rate limit | ✅ `express-rate-limit` on `/auth/login` + `/auth/register` (20 / 15 min) |
| 5 | No security headers | ✅ `helmet` enabled (HSTS, nosniff, X-Frame-Options SAMEORIGIN, etc.); `trust proxy` set |
| 7 | Verbose 5xx errors | ✅ Global 5xx message sanitizer (generic message in production) |
| 8 | PII in logs | ✅ Webhook payload dump gated to non-production; phone numbers masked |
| Low | ReDoS via `$regex` | ✅ `escapeRegex()` applied to all user-input regex queries (crm, users, registrations, voters, data) |
| Low | CORS `'*'` fallback | ✅ Falls back to the configured domain, never `'*'` |
| Low | Weak RSA PKCS#1 padding fallback | ✅ Removed; OAEP only |
| Low | Client-only logout | ✅ Server-side revocation — tokens carry a `jti`, `/auth/logout` denylists it (Mongo TTL), `authRequired` rejects revoked tokens; frontend calls it |
| Low | Large component | ➖ Partially — pure helpers extracted to `frontend/src/utils/chatHelpers.js`; a full component split is recommended as a separate refactor |

**Frontend dependency CVEs (#6):** upgraded `react-router-dom` to the latest patched **6.30.4**. Remaining audit entries are the **SSR `deserializeErrors`** advisory (applies only to React Router SSR/framework mode — **not used** by this client-side SPA) and an open-redirect whose only fix is a **breaking React Router v7 upgrade** (recommended as a separate, tested change). `esbuild`/`vite` advisory is **dev-server only** and does not affect the production build.

**Still open (Critical — not in this batch, awaiting go-ahead):**
1. Plaintext passwords (needs a hashing migration plan).
2. Razorpay webhook signature bypass.
3. (High) WhatsApp/Meta webhook signature verification.

**Verification:** backend deployed to `142.93.10.77`, pm2 online; helmet headers confirmed live; rate-limit headers present; login → logout → token-reuse returns 401 (revocation confirmed); frontend rebuilt and deployed.

---

## Remediation status — Critical/High batch (2026-07-29)

| # | Finding | Status |
|---|---|---|
| 2 | Razorpay webhook signature bypass | ✅ Fixed & deployed — raw body captured, missing signature rejected, timing-safe HMAC compare over exact bytes. **Action needed:** set `RAZORPAY_WEBHOOK_SECRET` in the droplet `.env` to match the secret configured on the Razorpay dashboard webhook. |
| 3 | WhatsApp/Meta webhook signature | ✅ Fixed & deployed — `X-Hub-Signature-256` HMAC verified against `META_APP_SECRET` over the raw body; unsigned/invalid requests rejected (401). Kill-switch `WHATSAPP_VERIFY_SIGNATURE=false` disables it if the secret is ever misconfigured. |
| 1 | Plaintext passwords | ⏳ Pending a decision — see below. |

**Verified:** unsigned Meta webhook → 401; correctly-signed → 200; wrong signature → 401; unsigned Razorpay → 400.

### #1 Passwords — why it needs a decision
`password_str` is used **both** as the login credential **and** as the passcode that is shown to admins (CRM panel, registrations list, team list, booth logins) and sent to candidates. Truly removing plaintext means the passcode can no longer be shown back. Two viable approaches:

- **Option A — Encrypt at rest (recommended, non-breaking):** store the passcode AES-256-GCM-encrypted (key in env), authenticate with a bcrypt hash. Admins can still view/resend passcodes (decrypted on demand); a raw DB dump no longer exposes them. Requires a one-time migration of `tbl_user.password_str` + `tbl_enquiry.passcode`.
- **Option B — Hash only (strongest, changes workflow):** bcrypt-hash the credential, stop showing passcodes; "resend" resets to a new random passcode shown once. Team can no longer see existing passcodes.

Both use login-time migration so no user is locked out during rollout.
