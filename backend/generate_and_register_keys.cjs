const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();

const accessToken = process.env.META_ACCESS_TOKEN;
const phoneId = process.env.META_PHONE_NUMBER_ID || '1159439517249327';

async function generateAndRegister() {
  console.log('1. Generating fresh RSA 2048 keypair...');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  console.log('2. Registering new Public Key on Meta Phone Number ID:', phoneId);
  const res = await fetch(`https://graph.facebook.com/v22.0/${phoneId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ public_key: publicKey })
  });
  const data = await res.json();
  console.log('Meta Registration Result:', data);

  if (data.success) {
    console.log('3. Updating local .env...');
    let envText = fs.readFileSync('.env', 'utf-8');
    const singleLinePriv = privateKey.replace(/\r?\n/g, '\\n');
    const singleLinePub = publicKey.replace(/\r?\n/g, '\\n');

    envText = envText.replace(/FLOW_PRIVATE_KEY="[^"]*"/, `FLOW_PRIVATE_KEY="${singleLinePriv}"`);
    envText = envText.replace(/FLOW_PUBLIC_KEY="[^"]*"/, `FLOW_PUBLIC_KEY="${singleLinePub}"`);
    fs.writeFileSync('.env', envText);
    console.log('Updated backend/.env with fresh keypair!');
  }
}

generateAndRegister().catch(console.error);
