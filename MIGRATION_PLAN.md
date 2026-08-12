# EDM — Migration Plan
**From:** 142.93.10.77 (current server)  
**To:** 129.212.233.215 (main DigitalOcean droplet)  
**Estimated time:** ~3 hours active work across 2 days  
**Risk:** Zero downtime — old server stays live until DNS cutover

---

## Golden Rule
Old server (142.93.10.77) stays fully live until Phase 5 DNS cutover.  
Both servers hit the same MongoDB, so rollback at any point = flip the DNS record back.

---

## Phase 1 — Fix all issues in the fork
**Where:** `ramlakshman-org/EDM` (local + push)  
**Time:** ~45 min  
**Risk:** Zero — old server untouched

- [ ] **1.1** Remove hardcoded ₹1 test price  
  `backend/src/controllers/registrationController.js:208`  
  Delete: `amount: reg.mobile === '8106811285' ? 1 : 2360`  
  Replace with: `amount: 2360`

- [ ] **1.2** Remove hardcoded WhatsApp verify token fallback  
  `backend/src/controllers/whatsappController.js:12`  
  Remove the `|| 'election2026_verification_token'` fallback — crash if not set in `.env`

- [ ] **1.3** Fix `edm_nginx.conf`  
  - Port 80 block: add `return 301 https://$host$request_uri;`  
  - Add gzip block (same as main server nginx.conf)  
  - Confirm `proxy_pass` port matches `PORT` in production `.env`  
  - Add proxy timeouts: `proxy_connect_timeout 10s; proxy_send_timeout 30s; proxy_read_timeout 30s;`

- [ ] **1.4** Complete `.env.example` — add all missing vars  
  Currently missing: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,  
  `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_VERIFY_TOKEN`, `META_APP_SECRET`,  
  `WATI_ACCESS_TOKEN`, `WATI_API_URL`, `WATI_OTP_TEMPLATE`,  
  `OBLIGR_TOKEN`, `RAZORPAY_WEBHOOK_SECRET`, `NODE_ENV`

- [ ] **1.5** Add rate limiting to messaging send endpoints  
  `backend/src/routes/index.js` — add `express-rate-limit` (10 sends/user/min) on `/api/messaging/*` POST routes

- [ ] **1.6** Reduce JSON body limit 15MB → 1MB  
  `backend/src/server.js:31`  
  Change: `express.json({ limit: '15mb', ...` → `express.json({ limit: '1mb', ...`

- [ ] **1.7** Create `ecosystem.config.cjs`  
  ```js
  module.exports = {
    apps: [{
      name: 'edm-backend',
      script: 'src/server.js',
      cwd: '/var/www/edm/backend',
      env_file: '/var/www/edm/backend/.env',
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M',
      error_file: '/root/.pm2/logs/edm-error.log',
      out_file: '/root/.pm2/logs/edm-out.log',
    }]
  };
  ```

- [ ] **1.8** Push all changes (one commit per fix)
  ```bash
  git push origin main
  ```

---

## Phase 2 — Deploy to new server (shadow — not public yet)
**Where:** SSH into 129.212.233.215  
**Time:** ~20 min  
**Risk:** Zero — no nginx, not publicly reachable

```bash
# Clone the fork
cd /var/www
git clone https://github.com/ramlakshman-org/EDM.git edm

# Create .env (fill all values)
cp /var/www/edm/backend/.env.example /var/www/edm/backend/.env
nano /var/www/edm/backend/.env

# Set PORT=5002 (5000=bjptn, 5001=bjp-localbody)
# Fill: JWT_SECRET, MONGO_VOTER_URL, MONGO_APP_URL, all integrations

# Install backend
cd /var/www/edm/backend
npm install

# Build frontend
cd /var/www/edm/frontend
npm install
npm run build

# Start with PM2
cd /var/www/edm
pm2 start ecosystem.config.cjs

# Verify it started
pm2 status
curl http://localhost:5002/health
```

Expected: `{"ok":true,"voterDb":true,"appDb":true}`

---

## Phase 3 — Full testing (via direct IP access)
**Where:** Browser hitting `http://129.212.233.215:5002`  
**Time:** ~60 min  
**Sign-off required before moving to Phase 4**

### Auth
- [ ] Login with super admin credentials
- [ ] Login with wrong password — must get locked after 5 attempts
- [ ] OTP flow — receive OTP, verify, login
- [ ] Token expiry — wait 40 min (or set JWT_EXPIRES_IN=1m), confirm session expires
- [ ] Logout — confirm token is revoked (JTI denylist)

### Voter Search
- [ ] EPIC exact search — returns correct voter
- [ ] EPIC prefix search — returns list
- [ ] Name search (English + Tamil)
- [ ] Mobile prefix search
- [ ] Age filter, gender filter, has_mobile filter
- [ ] Pagination — page 1, page 2, last page
- [ ] Global search across all 234 assemblies — must be fast (listCollections cache working)

### Role-Based Access
- [ ] Super Admin — sees all assemblies, all data
- [ ] MP login — sees assigned assembly only
- [ ] Booth login — sees only assigned booth voters
- [ ] Ward login — sees only assigned ward booths
- [ ] Cross-scope test: booth user cannot access another booth's data

### Core Modules
- [ ] Dashboard stats load correctly (voter totals, gender counts)
- [ ] Assemblies list — all 234 load, detail page works
- [ ] Booths — filter by assembly, detail with voter count
- [ ] Reports — Assembly report opens, Booth report opens, charts render
- [ ] Users — create user, assign role, update, delete

### Registrations + Payments
- [ ] Registration form submits correctly
- [ ] Razorpay payment in test mode (use Razorpay test card)
- [ ] Verify ₹1 shortcut is gone — amount must be ₹2,360
- [ ] Razorpay webhook arrives and is verified (check logs)

### WhatsApp + SMS
- [ ] Send one WhatsApp message to a test number — confirm delivery
- [ ] Send one SMS to a test number — confirm delivery
- [ ] Rate limiting: send 11 messages in 1 minute — 11th must be rejected

### Performance
- [ ] 50 concurrent EPIC searches using k6 or artillery
  ```bash
  # Install k6 if not present
  sudo apt-get install k6
  k6 run /var/www/edm/k6-epic-test.js
  ```
- [ ] PM2 memory during load test must stay under 400MB
- [ ] MongoDB RAM must not spike above 80% (6.2 GB)

### Health + Monitoring
- [ ] `GET /health` returns `{"ok":true,"voterDb":true,"appDb":true}`
- [ ] PM2 restart count = 0 after all tests

---

## Phase 4 — Nginx + SSL setup (still no DNS change)
**Where:** 129.212.233.215  
**Time:** ~15 min

```bash
# Copy nginx config
cp /var/www/edm/edm_nginx.conf /etc/nginx/sites-available/edm
ln -s /etc/nginx/sites-available/edm /etc/nginx/sites-enabled/edm

# Test config
nginx -t

# Get SSL cert (Certbot) — domain must point to this server OR use standalone challenge
# If DNS still points to old server, use: --webroot (old server) or DNS challenge
certbot --nginx -d election2026sir.in -d www.election2026sir.in

# Reload nginx
nginx -s reload
```

### Test via /etc/hosts override (on your local machine)
Add to `C:\Windows\System32\drivers\etc\hosts`:
```
129.212.233.215  election2026sir.in www.election2026sir.in
```
Now browse `https://election2026sir.in` — it hits the new server, everyone else still hits the old one.

- [ ] HTTPS loads correctly
- [ ] HTTP redirects to HTTPS
- [ ] Login works
- [ ] Voter search works
- [ ] Remove the /etc/hosts line when done

---

## Phase 5 — DNS Cutover
**Time:** 30 min active + 24 hr TTL wait  
**Do at:** 2:00 AM IST (minimum active users)

### 24 hours before cutover
- [ ] Log into domain registrar
- [ ] Lower TTL on `election2026sir.in` A record from current → **300 seconds (5 min)**
- [ ] Confirm TTL is live: `nslookup election2026sir.in 8.8.8.8`

### At cutover (2:00 AM IST)
- [ ] Change A record: `election2026sir.in` → `129.212.233.215`
- [ ] Change A record: `www.election2026sir.in` → `129.212.233.215`
- [ ] Wait 5–10 minutes for propagation
- [ ] Confirm: `nslookup election2026sir.in 8.8.8.8` shows `129.212.233.215`
- [ ] Open `https://election2026sir.in` — login, do one voter search, confirm all good
- [ ] Watch PM2 logs for 30 minutes: `pm2 logs edm-backend --lines 100`

### Rollback (if anything is wrong)
Change A record back to `142.93.10.77` — propagates in 5 minutes. Zero data loss.

---

## Phase 6 — Decommission old server
**When:** 72 hours after cutover with zero issues  
**Time:** ~10 min

- [ ] SSH into old server (142.93.10.77)
- [ ] Backup `.env` file: copy all values to a secure note
- [ ] Backup nginx config: `cat /etc/nginx/sites-enabled/edm`
- [ ] Confirm new server PM2 shows 0 restarts and stable memory
- [ ] Destroy 142.93.10.77 droplet from DigitalOcean dashboard
- [ ] Save the monthly server cost 💰

---

## Issues Fixed in This Migration

| # | Issue | File | Severity |
|---|---|---|---|
| 1 | Hardcoded ₹1 test price | registrationController.js:208 | 🔴 Critical |
| 2 | Hardcoded WhatsApp verify token | whatsappController.js:12 | 🔴 Critical |
| 3 | No HTTP→HTTPS redirect | edm_nginx.conf | 🔴 Critical |
| 4 | Missing 12+ env vars in .env.example | .env.example | 🔴 Critical |
| 5 | No rate limit on messaging endpoints | routes/index.js | 🟡 High |
| 6 | JSON body limit 15MB | server.js:31 | 🟡 High |
| 7 | No PM2 ecosystem config | (new file) | 🟡 High |
| 8 | No gzip in nginx | edm_nginx.conf | 🟡 High |
| 9 | listCollections cache missing | voterModel.js | 🔴 Critical (already fixed in fork) |
| 10 | No maxPoolSize on MongoDB | db.js | 🟡 High (already fixed in fork) |

---

## Quick Reference

| Item | Value |
|---|---|
| New server IP | 129.212.233.215 |
| Old server IP | 142.93.10.77 |
| EDM port on new server | 5002 |
| Fork repo | github.com/ramlakshman-org/EDM |
| Health endpoint | https://election2026sir.in/health |
| PM2 app name | edm-backend |
| App path on server | /var/www/edm |
