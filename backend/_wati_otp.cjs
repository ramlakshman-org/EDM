const fs = require('fs');
const path = require('path');
function loadEnv() {
  const p = path.join(__dirname, '.env');
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
(async () => {
  loadEnv();
  const endpoint = (process.env.WATI_ENDPOINT || '').replace(/\/+$/, '');
  let token = process.env.WATI_ACCESS_TOKEN || '';
  if (!token.startsWith('Bearer ')) token = 'Bearer ' + token;
  const resp = await fetch(`${endpoint}/api/v1/getMessageTemplates?pageSize=300`, { headers: { Authorization: token } });
  const data = await resp.json();
  const list = data?.messageTemplates || data?.result || data?.data || [];
  console.log('total:', list.length);
  for (const t of list) {
    if (/otp|auth|verif|edms|code/i.test((t.elementName || '') + ' ' + (t.category || ''))) {
      console.log('---');
      console.log('name:', t.elementName, '| category:', t.category, '| status:', t.status, '| lang:', JSON.stringify(t.language));
      console.log('body:', (t.body || '').slice(0, 160));
      console.log('buttons:', JSON.stringify(t.buttons || []));
      console.log('customParams:', JSON.stringify(t.customParams || []));
    }
  }
})().catch((e) => console.error('ERR', e.message));
