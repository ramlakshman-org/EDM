import crypto from 'crypto';

export function getFlowPrivateKey() {
  const rawKey = process.env.FLOW_PRIVATE_KEY || '';
  return rawKey.replace(/\\n/g, '\n');
}

export function decryptRequest(body, privateKeyPem) {
  const { encrypted_flow_data, encrypted_aes_key, initial_vector } = body;
  const keyPem = privateKeyPem || getFlowPrivateKey();

  const encAesKeyBuffer = Buffer.from(encrypted_aes_key, 'base64');
  let decryptedAesKey = null;

  const paddings = [
    { padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    { padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' },
    { padding: crypto.constants.RSA_PKCS1_PADDING },
  ];

  for (const p of paddings) {
    try {
      const candidate = crypto.privateDecrypt({ key: keyPem, ...p }, encAesKeyBuffer);
      if (candidate && (candidate.length === 16 || candidate.length === 32)) {
        decryptedAesKey = candidate;
        break;
      }
    } catch (e) {
      // try next padding option
    }
  }

  if (!decryptedAesKey) {
    throw new Error('Failed to decrypt AES key: RSA padding mismatch or invalid private key.');
  }

  // Extract IV and Auth Tag
  const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
  const initialVectorBuffer = Buffer.from(initial_vector, 'base64');

  const authTag = flowDataBuffer.subarray(flowDataBuffer.length - 16);
  const encryptedData = flowDataBuffer.subarray(0, flowDataBuffer.length - 16);

  const algo = decryptedAesKey.length === 32 ? 'aes-256-gcm' : 'aes-128-gcm';

  const decipher = crypto.createDecipheriv(algo, decryptedAesKey, initialVectorBuffer);
  decipher.setAuthTag(authTag);

  const decryptedJSON = Buffer.concat([decipher.update(encryptedData), decipher.final()]).toString('utf-8');

  return {
    decryptedBody: JSON.parse(decryptedJSON),
    aesKey: decryptedAesKey,
    initialVector: initialVectorBuffer,
  };
}

export function encryptResponse(responseObj, aesKey, initialVector) {
  // Invert IV for response encryption as per Meta specification
  const flippedIv = Buffer.from(initialVector.map((byte) => ~byte));
  const algo = aesKey.length === 32 ? 'aes-256-gcm' : 'aes-128-gcm';

  const cipher = crypto.createCipheriv(algo, aesKey, flippedIv);
  const responseJsonText = JSON.stringify(responseObj);

  const encryptedData = Buffer.concat([cipher.update(responseJsonText, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([encryptedData, authTag]).toString('base64');
}
