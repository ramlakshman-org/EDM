import crypto from 'crypto';

// Port of app/Services/CloudinaryService.php — signed server-side upload/delete.
// Uses global fetch/FormData/Blob (Node 18+).

// Timeout wrapper (uploads/deletes) so a Cloudinary stall can't hang a worker.
const _fetch = globalThis.fetch;
const fetch = (url, opts = {}) => _fetch(url, { signal: AbortSignal.timeout(30000), ...opts });

function creds() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary configuration missing in env');
  }
  return { cloudName, apiKey, apiSecret };
}

// Cloudinary signature: sort params alphabetically, join key=value with &, append secret, sha1.
function sign(params, apiSecret) {
  const signString = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&') + apiSecret;
  return crypto.createHash('sha1').update(signString).digest('hex');
}

/**
 * Upload a file buffer to Cloudinary.
 * @param {Buffer} buffer file contents
 * @param {string} filename original file name
 * @param {'image'|'video'} resourceType
 * @param {string} folder
 * @returns {Promise<{url:string, public_id:string}>}
 */
export async function upload(buffer, filename, resourceType = 'image', folder = 'election-flow-assets') {
  const { cloudName, apiKey, apiSecret } = creds();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign({ folder, timestamp }, apiSecret);

  const form = new FormData();
  form.append('file', new Blob([buffer]), filename || 'upload');
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('signature', signature);

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
  const res = await fetch(url, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Failed to upload file to Cloudinary: ${data?.error?.message || res.statusText}`);
  }
  return { url: data.secure_url, public_id: data.public_id };
}

/**
 * Delete an asset from Cloudinary. Returns true on success (best-effort).
 */
export async function destroy(publicId, resourceType = 'image') {
  if (!publicId) return false;
  let cloudName, apiKey, apiSecret;
  try { ({ cloudName, apiKey, apiSecret } = creds()); } catch { return false; }
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign({ public_id: publicId, timestamp }, apiSecret);

  const form = new FormData();
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('public_id', publicId);
  form.append('signature', signature);

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`;
  try {
    const res = await fetch(url, { method: 'POST', body: form });
    return res.ok;
  } catch {
    return false;
  }
}
