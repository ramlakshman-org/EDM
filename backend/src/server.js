import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { connectDbs, closeDbs, isVoterDbOnline, isAppDbOnline } from './config/db.js';
import apiRoutes from './routes/index.js';
import { REPORTS_DIR } from './controllers/reportController.js';

const app = express();

// Behind the nginx reverse proxy — required for correct client IP (rate limiting)
// and X-Forwarded-* handling.
app.set('trust proxy', 1);

// Security headers. CSP is disabled because the pre-generated static HTML reports
// use inline scripts + relative asset paths; cross-origin resource policy is
// relaxed so images/reports load from the SPA origin.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS — restrict to the configured client origin (no wildcard fallback).
const clientOrigin = process.env.CLIENT_ORIGIN || 'https://tnedms.com';
app.use(cors({ origin: clientOrigin, credentials: true }));

// Capture the raw body so webhook HMAC signatures (Razorpay, Meta) can be
// verified against the exact bytes that were signed.
app.use(express.json({ limit: '15mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Don't leak internal error detail to clients in production — generic 5xx message.
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    if (process.env.NODE_ENV === 'production' && res.statusCode >= 500
        && payload && typeof payload === 'object' && typeof payload.message === 'string') {
      payload = { ...payload, message: 'Internal server error. Please try again later.' };
    }
    return originalJson(payload);
  };
  next();
});

// Static HTML reports (Assembly_Reports / Booth_Reports). Booth reports load a
// relative lib/ (echarts) so they must be served as files, not inlined.
// Which assembly/booth a user may open is governed by /api/reports/documents.
app.use('/report-files', express.static(REPORTS_DIR));

app.get('/health', (req, res) =>
  res.json({ ok: true, voterDb: isVoterDbOnline(), appDb: isAppDbOnline() })
);

app.use('/api', apiRoutes);

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found.' }));

const PORT = process.env.PORT || 5000;

// Fail fast if critical configuration is missing or left at insecure defaults,
// rather than booting a mis-configured / insecure server.
function validateEnv() {
  const missing = ['JWT_SECRET', 'MONGO_APP_URL', 'MONGO_VOTER_URL'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[edm] FATAL: missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  const secret = process.env.JWT_SECRET;
  const weak = secret === 'change-this-to-a-long-random-string' || secret.length < 16;
  if (weak && process.env.NODE_ENV === 'production') {
    console.error('[edm] FATAL: JWT_SECRET is the placeholder or too short. Set a strong secret (>=16 chars).');
    process.exit(1);
  }
}

(async () => {
  validateEnv();
  await connectDbs();
  const server = app.listen(PORT, () => console.log(`[edm] API listening on http://localhost:${PORT}`));
  const shutdown = async () => { await closeDbs(); server.close(() => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})();
