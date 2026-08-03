# Cross-Check of PRE_LAUNCH_FIXES.md

**Reviewer note:** All 12 findings were verified against the actual `EDM` codebase
and the live droplet. This report is **substantially more accurate** than the two
earlier ones — every finding checks out. No code was changed.

**Date:** 2026-07-30

---

## Verdict: all 12 findings are accurate

| # | Finding | Report status | My verification | Verdict |
|---|---|---|---|---|
| 1 | Plaintext password storage & leakage | CONFIRMED | `findByCredentials` compares `password_str` plaintext; `userController.list` returns `passcode: u.password_str` | ✅ **Accurate** |
| 2 | Hardcoded bootstrap admin bypass | CONFIRMED | `login()` accepts `ADMIN_USERNAME`/`ADMIN_PASSWORD`; **droplet `.env` = `admin`/`admin`** | ✅ **Accurate — LIVE & exploitable now** |
| 3 | Auth rate limiting | VERIFIED ACTIVE | `authLimiter` present on `/auth/login` + `/auth/register` | ✅ **Accurate** |
| 4 | Missing backend RBAC | CONFIRMED | Only `authRequired` gates protected routes; **no** `requireRole`/role checks in `routes` or `middleware` | ✅ **Accurate** |
| 5 | Mass-assignment privilege escalation | CONFIRMED | `update()` spreads `req.body` and maps `group_id → user_group_id` into the DB update | ✅ **Accurate** |
| 6 | Regex sanitization (ReDoS) | VERIFIED ACTIVE | `escapeRegex()` applied in userModel/crmController/voterModel | ✅ **Accurate** |
| 7 | JWT in localStorage | CONFIRMED | `AuthContext`/`client.js` store & read `edm_token` from `localStorage` | ✅ **Accurate** |
| 8 | Hardcoded ₹1 test-payment bypass | CONFIRMED | `TEST_MOBILE='8106811285'` → returns ₹1 for all tiers in `calculateWardPricing` | ✅ **Accurate** |
| 9 | Missing startup env validation | CONFIRMED | `server.js` calls `app.listen()` without validating `JWT_SECRET`/Mongo URLs | ✅ **Accurate** |
| 10 | Unbounded `.toArray()` queries | CONFIRMED | `assemblyCredentials`, `list`, payments/subscriptions use `.find({}).toArray()` with no paging | ✅ **Accurate** |
| 11 | Frontend route role protection | VERIFIED ACTIVE | `RequireRole` exists in `App.jsx` with `allowedGroups` + group-1 bypass | ✅ **Accurate** (client-side only — see note) |
| 12 | No timeout on external HTTP | CONFIRMED | `fetch()` to Razorpay/Meta has no `signal`/timeout | ✅ **Accurate** |

---

## Most urgent (exploitable on the live system today)

1. **#2 — `admin` / `admin` bootstrap login is LIVE.** Verified the droplet `.env`
   still has the default `ADMIN_USERNAME=admin` and `ADMIN_PASSWORD=admin`. Anyone
   can log in as **Super Admin** right now. This should be changed immediately
   (rotate to strong values, or remove the bypass).
2. **#4 + #5 together = trivial privilege escalation.** There is no backend role
   enforcement (#4), and `PUT /users/:id` blindly applies `req.body` (#5). Any
   authenticated user (even a booth worker) can call the update endpoint, set
   `group_id: 1` on their own record, re-login, and become Super Admin.
3. **#8 — ₹1 payment bypass** for mobile `8106811285` is compiled into production
   pricing.
4. **#1 — plaintext passwords / passcode leakage** (the item already tracked as our
   security-audit #1, still pending your A/B decision).

---

## Accuracy notes / nuances (report is right, with extra context)

- **#1:** `create()`, `update()`, and `generateCredentials()` already ALSO write a
  bcrypt `password` field — but authentication still uses the plaintext
  `password_str`, and `password_str` is still returned in JSON. So the hashing
  groundwork exists but isn't used for login; the finding stands.
- **#11:** `RequireRole` is genuinely active, but it is a **client-side** guard
  only — it does not protect the API. Real protection needs backend RBAC (#4).
  The report correctly treats these as separate items.
- **Path references** in the report point to `d:/Downloads/EDM-main/...` (a
  separate clone) and the line numbers don't match this working copy, but the
  findings match by content.

---

## Comparison with the two earlier reports
- **Gowtham's report:** ~half inaccurate/outdated (claimed missing `src/`, KML in
  git, hardcoded JWT secret); missed the webhook issues.
- **Mohamed's report:** 2 real items but a large fabricated observability/stress-test
  section (Winston, X-Request-ID, `test:stress` — none exist).
- **This report (PRE_LAUNCH_FIXES.md):** **the most reliable of the three** — all 12
  findings verified accurate, and it surfaced genuinely important items the others
  (and my initial security audit) missed: the **admin/admin backdoor (#2)**,
  **missing backend RBAC (#4)**, **mass-assignment escalation (#5)**, and the
  **₹1 payment bypass (#8)**.

---

## Recommended fix order (if you want these done)
1. **#2** rotate/remove `admin`/`admin` bootstrap (immediate, tiny change).
2. **#5 + #4** whitelist update fields + add `requireRole` on sensitive routes
   (stops privilege escalation).
3. **#8** remove the `TEST_MOBILE` ₹1 override.
4. **#1** hash passcodes (Option A/B — pending your decision).
5. **#9 / #10 / #12** env validation, pagination caps, fetch timeouts.
6. **#7** move JWT to HttpOnly cookies (larger change; schedule deliberately).

Items **#3, #6, #11 are already in place** — no action needed.
