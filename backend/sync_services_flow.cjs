/**
 * Push the local services_flow_schema.json to the existing published Services
 * flow on Meta and re-publish. Dependency-free (uses global fetch/FormData/Blob,
 * Node 18+). Reads creds from process.env, falling back to parsing ./.env.
 *
 * Usage (on the droplet):  node sync_services_flow.cjs
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

(async () => {
  loadEnv();
  const FLOW_ID = process.env.SERVICES_FLOW_ID;
  const TOKEN = process.env.META_ACCESS_TOKEN;
  const VERSION = process.env.META_GRAPH_VERSION || 'v22.0';

  if (!FLOW_ID || !TOKEN) {
    console.error('Missing SERVICES_FLOW_ID or META_ACCESS_TOKEN in environment/.env');
    process.exit(1);
  }

  const json = fs.readFileSync(path.join(__dirname, 'services_flow_schema.json'), 'utf8');

  // 1. Upload the FLOW_JSON asset (updates the flow's draft).
  const fd = new FormData();
  fd.append('name', 'flow.json');
  fd.append('asset_type', 'FLOW_JSON');
  fd.append('file', new Blob([json], { type: 'application/json' }), 'flow.json');

  const upRes = await fetch(`https://graph.facebook.com/${VERSION}/${FLOW_ID}/assets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: fd,
  });
  const upData = await upRes.json();
  console.log('[assets] HTTP', upRes.status, JSON.stringify(upData));
  if (!upRes.ok) process.exit(1);
  if (Array.isArray(upData.validation_errors) && upData.validation_errors.length) {
    const fatal = upData.validation_errors.some((e) => e.error_type !== 'DEPRECATION' && e.is_sdk_warning !== true);
    if (fatal) {
      console.error('[assets] Fatal validation errors — aborting publish.');
      process.exit(1);
    }
  }

  // 2. Publish.
  const pubRes = await fetch(`https://graph.facebook.com/${VERSION}/${FLOW_ID}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const pubData = await pubRes.json();
  console.log('[publish] HTTP', pubRes.status, JSON.stringify(pubData));
  if (!pubRes.ok) process.exit(1);

  console.log('DONE — services flow updated & published.');
})();
