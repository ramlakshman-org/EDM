# Cross-Check of Mohamed's "Full-Stack Project Assurance Audit"

**Reviewer note:** Every claim below was verified against the actual `EDM`
codebase (`backend/package.json`, `backend/src/**`, git-tracked files). Findings
are marked **Valid**, **Inaccurate**, or **Fabricated / not present**. No code was
changed.

**Date:** 2026-07-30

---

## 1. Verdict at a glance

| Area | Mohamed's claim | Reality | Verdict |
|---|---|---|---|
| P1-01 | Global EPIC search scans `ass_1..234` **sequentially** | Confirmed — `searchEpicGlobal()` loops `for (collName of assColls) { await findOne }` with no `assemblyId` | ✅ **Valid — real perf issue** |
| P4-02 | Plaintext passcodes in `password_str` | Confirmed — `register` inserts `password_str: passcode` unhashed | ✅ **Valid** (same as our #1) |
| P4-01 | Default JWT secret **fallback in `auth.js` line 4** | `auth.js` uses `process.env.JWT_SECRET` with **no fallback**; the string is only in `.env.example` | ⚠️ **Inaccurate** (recommendation still fair) |
| P6-01 | `tn_acs_map.kml` (14.6 MB) in Git root | File is on disk but **not git-tracked** | ⚠️ **Inaccurate** |
| Observability | "Winston + DailyRotateFile, `combined-%DATE%.log`, `error-%DATE%.log`, X-Request-ID correlation, global Express error handling" — scored **10/10** | **None exist.** No `winston`/`winston-daily-rotate-file` in `package.json`; zero code matches for `winston`, `DailyRotateFile`, `X-Request-ID`, `createLogger`. Logging is only `morgan`. | ❌ **Fabricated** |
| Runtime verification | Ran `npm run test:stress` → "5,180 logs/sec", "737 req/sec, 0% failure"; `/health` returned header `X-Request-ID: 62ea90e4-...` | No `test:stress` script exists (only `start`, `dev`). `/health` returns `{ok, voterDb, appDb}` with **no** X-Request-ID header. | ❌ **Fabricated** |
| Tech stack line | "Node.js + Express, ... **Winston**, Nginx" | No Winston anywhere. | ❌ **Fabricated** |

---

## 2. The real, valid findings

### P1-01 — Sequential EPIC scan across 234 collections ✅ (good catch)
`backend/src/models/voterModel.js` → `searchEpicGlobal(epicNo, assemblyId=null)`:
when no `assemblyId` is given, it lists all collections and runs
`await coll.findOne({ EPIC_NO })` in a **sequential `for` loop** over every
`ass_*` collection. It short-circuits on first match, but a **not-found** or
last-constituency EPIC scans all 234 one-by-one → high latency and connection
pressure under load. This is a legitimate issue that our earlier security audit
did **not** highlight.
- Reasonable fixes: run the lookups with `Promise.all` (bounded concurrency), or
  maintain a central `tbl_epic_index` (EPIC → assembly) in `election_app`.

### P4-02 — Plaintext passcodes ✅
`backend/src/controllers/authController.js` `register` stores the generated
6-digit code as `password_str` in plaintext, and `findByCredentials` compares it
in plaintext. This is the same Critical item tracked in `SECURITY_AUDIT.md` (#1),
still pending your Option A / B decision.

---

## 3. The inaccurate findings

### P4-01 — "Default JWT secret fallback in auth.js" ⚠️
`backend/src/middleware/auth.js` signs/verifies with `process.env.JWT_SECRET` and
**no fallback value**. The placeholder `change-this-to-a-long-random-string`
exists only in `backend/.env.example` (a template); the real `.env` /
`.env.production` (git-ignored) hold strong secrets. So there is no in-code
hardcoded-secret vulnerability. His suggestion to *fail-fast at startup if
`JWT_SECRET` is missing/placeholder* is still a fine small hardening.

### P6-01 — "14.6 MB KML in Git" ⚠️
`tn_acs_map.kml` is present on disk but is **not** tracked by git
(`git ls-files` does not list it). The version-control-bloat concern does not
apply to it. (Note: the real git-bloat is **9,285** tracked files under
`backend/reports/` — which Mohamed did not mention but Gowtham did.)

---

## 4. Fabricated / not present in the project

These parts of the report describe infrastructure and test runs that **do not
exist** in this codebase:

- **Winston logging**, `DailyRotateFile`, `combined-%DATE%.log` / `error-%DATE%.log`
  rotation, and the **Observability 10/10** score. The app only uses `morgan`.
- **X-Request-ID / request-correlation** middleware — none. `/health` returns no
  such header.
- **Global Express error-handling** middleware — not present (there is a 404
  handler and, from our recent work, a 5xx message sanitizer — but nothing like
  what the report describes).
- **`npm run test:stress`** and its results (5,180 logs/sec; 737 req/sec; 0%
  failure). No such script; the numbers are not reproducible.

Because the "Runtime Verification Results" and "Observability" sections are based
on components that aren't in the repo, those results and the associated scores
should be treated as **unreliable**.

---

## 5. Net assessment
Mohamed's report is well-structured and includes **one genuinely valuable new
finding** (P1-01, the sequential 234-collection EPIC scan) plus the correct
plaintext-passcode item (P4-02). However, it also contains **two inaccurate
findings** (JWT fallback, KML in git) and a substantial amount of **fabricated
"empirical" content** — a Winston/observability stack, X-Request-ID, and a stress
test that do not exist in the project. The 10/10 observability score and the
runtime throughput numbers are not real.

**Actually worth doing from this report:**
1. **P1-01** — parallelize or index the global EPIC search (real performance win).
2. **P4-02** — hash passcodes (already tracked as our #1, awaiting A/B decision).
3. Optional: add a startup guard rejecting a missing/placeholder `JWT_SECRET`.

**Ignore as not applicable:** the Winston/observability claims, X-Request-ID,
`test:stress` results, and the "KML in version control" item.
