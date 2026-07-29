import { useEffect, useState } from 'react';
import api from '../api/client.js';

export default function FlowImages() {
  const [assets, setAssets] = useState([]);
  const [messages, setMessages] = useState({
    register_welcome_text: '',
    welcome_back_text: '',
    register_success_text: '',
  });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');   // key currently uploading
  const [savingMsgs, setSavingMsgs] = useState(false);
  const [picked, setPicked] = useState({}); // key -> { file, preview }

  const loadAssets = () =>
    api.get('/flow-images')
      .then(({ data }) => setAssets(data.assets || []))
      .catch((e) => setErr(e.response?.data?.message || 'Failed to load assets.'));

  const loadMessages = () =>
    api.get('/flow-images/messages')
      .then(({ data }) => {
        if (data.success && data.messages) {
          setMessages(data.messages);
        }
      })
      .catch((e) => console.error('Failed to load welcome messages:', e));

  useEffect(() => {
    loadAssets();
    loadMessages();
  }, []);

  const pick = (key, file) => {
    setErr(''); setMsg('');
    if (!file) { setPicked((p) => ({ ...p, [key]: null })); return; }
    if (file.size > 10 * 1024 * 1024) { setErr('File too large (max 10MB).'); return; }
    setPicked((p) => ({ ...p, [key]: { file, preview: URL.createObjectURL(file), isVideo: file.type.includes('video') } }));
  };

  const readAsBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const upload = async (key) => {
    const sel = picked[key];
    if (!sel?.file) { setErr('Choose a file first.'); return; }
    setErr(''); setMsg(''); setBusy(key);
    try {
      const fileBase64 = await readAsBase64(sel.file);
      const { data } = await api.post('/flow-images/upload', {
        key, filename: sel.file.name, mime: sel.file.type, fileBase64,
      });
      if (data.success) {
        setMsg(data.message || 'Uploaded.');
        setPicked((p) => ({ ...p, [key]: null }));
        loadAssets();
      } else {
        setErr(data.message || 'Upload failed.');
      }
    } catch (e) {
      setErr(e.response?.data?.message || 'Upload failed.');
    } finally { setBusy(''); }
  };

  const remove = async (key) => {
    if (!confirm('Remove this asset (also deletes it from Cloudinary)?')) return;
    setErr(''); setMsg('');
    try { await api.delete(`/flow-images/${key}`); setMsg('Removed.'); loadAssets(); }
    catch (e) { setErr(e.response?.data?.message || 'Delete failed.'); }
  };

  const handleSaveMessages = async (e) => {
    e.preventDefault();
    setErr(''); setMsg(''); setSavingMsgs(true);
    try {
      const { data } = await api.post('/flow-images/messages', messages);
      if (data.success) {
        setMsg('WhatsApp welcome messages saved successfully! 💬✨');
      } else {
        setErr(data.message || 'Failed to save messages.');
      }
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to save messages.');
    } finally {
      setSavingMsgs(false);
    }
  };

  const renderPreview = (a) => {
    const sel = picked[a.key];
    if (sel?.preview) {
      return sel.isVideo
        ? <video src={sel.preview} className="fa-media" controls />
        : <img src={sel.preview} className="fa-media" alt="preview" />;
    }
    if (a.url) {
      return a.type === 'video'
        ? <video src={a.url} className="fa-media" controls />
        : <img src={a.url} className="fa-media" alt={a.name} />;
    }
    return <div className="fa-media fa-empty">No media uploaded</div>;
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      <h1 style={{ marginTop: 0 }}>WhatsApp Flow Asset & Welcome Message Manager</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Configure header media (videos/images) and customize WhatsApp welcome messages sent to candidates during registration.
      </p>

      {err && <div className="alert err">{err}</div>}
      {msg && <div className="alert warn">{msg}</div>}

      {/* SECTION 1: WELCOME MESSAGES CONTROLLER */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, marginBottom: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>💬</span> WhatsApp Welcome Messages Controller
          </h2>
          <span style={{ fontSize: 12, background: '#e0f2fe', color: '#0369a1', padding: '4px 12px', borderRadius: 980, fontWeight: 600 }}>
            Dynamic Templates
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 0, marginBottom: 20 }}>
          Customize the exact WhatsApp response texts sent to users when they message your bot. Available placeholders: <code>{'{name}'}</code>, <code>{'{username}'}</code>, <code>{'{passcode}'}</code>.
        </p>

        <form onSubmit={handleSaveMessages} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Message 1: Registration Invitation */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontWeight: 700, fontSize: 13.5, color: '#1e293b' }}>
                1. New Candidate Registration Invitation Message (Sent to unregistered users)
              </label>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: (messages.register_welcome_text?.length || 0) > 1000 ? '#dc2626' : '#64748b' }}>
                {messages.register_welcome_text?.length || 0} / 1024 chars
              </span>
            </div>
            <textarea
              rows={4}
              maxLength={1024}
              value={messages.register_welcome_text}
              onChange={(e) => setMessages({ ...messages, register_welcome_text: e.target.value })}
              placeholder="Enter welcome invitation text..."
              style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <span style={{ fontSize: 11.5, color: '#94a3b8', display: 'block', marginTop: 4 }}>
              Sent alongside the <strong>Register Now 🗳️</strong> Meta WhatsApp Flow button.
            </span>
          </div>

          {/* Message 2: Welcome Back */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontWeight: 700, fontSize: 13.5, color: '#1e293b' }}>
                2. Already Registered / Welcome Back Message (Sent to existing members)
              </label>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: (messages.welcome_back_text?.length || 0) > 1000 ? '#dc2626' : '#64748b' }}>
                {messages.welcome_back_text?.length || 0} / 1024 chars
              </span>
            </div>
            <textarea
              rows={4}
              maxLength={1024}
              value={messages.welcome_back_text}
              onChange={(e) => setMessages({ ...messages, welcome_back_text: e.target.value })}
              placeholder="Enter welcome back text..."
              style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <span style={{ fontSize: 11.5, color: '#94a3b8', display: 'block', marginTop: 4 }}>
              Supports placeholders: <code>{'{name}'}</code>, <code>{'{username}'}</code>, <code>{'{passcode}'}</code>.
            </span>
          </div>

          {/* Message 3: Registration Success */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontWeight: 700, fontSize: 13.5, color: '#1e293b' }}>
                3. Registration Success & Login Credentials Confirmation Message
              </label>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: (messages.register_success_text?.length || 0) > 1000 ? '#dc2626' : '#64748b' }}>
                {messages.register_success_text?.length || 0} / 1024 chars
              </span>
            </div>
            <textarea
              rows={4}
              maxLength={1024}
              value={messages.register_success_text}
              onChange={(e) => setMessages({ ...messages, register_success_text: e.target.value })}
              placeholder="Enter registration success text..."
              style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <span style={{ fontSize: 11.5, color: '#94a3b8', display: 'block', marginTop: 4 }}>
              Sent immediately after a candidate completes the Meta WhatsApp Flow form.
            </span>
          </div>

          <div>
            <button
              type="submit"
              disabled={savingMsgs}
              style={{
                background: '#0071e3',
                color: '#ffffff',
                border: 'none',
                borderRadius: 10,
                padding: '10px 24px',
                fontSize: 14,
                fontWeight: 700,
                cursor: savingMsgs ? 'not-allowed' : 'pointer',
                opacity: savingMsgs ? 0.7 : 1,
              }}
            >
              {savingMsgs ? 'Saving Messages...' : '💾 Save Welcome Messages'}
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 2: FLOW MEDIA ASSETS GRID */}
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
        🖼️ WhatsApp Header Media Assets & Party Flags
      </h2>

      <div className="fa-grid">
        {assets.map((a) => {
          const sel = picked[a.key];
          return (
            <div className="card fa-card" key={a.key}>
              <div className="fa-head">
                <strong>{a.name}</strong>
                <span className={`badge ${a.type === 'video' ? 'badge-video' : 'badge-image'}`}>{a.type}</span>
              </div>
              <div className="muted fa-desc">{a.description}</div>
              <code className="fa-key">{a.key}</code>

              {renderPreview(a)}

              <div className="fa-actions">
                <input
                  type="file"
                  accept={a.default_type === 'video' || a.type === 'video' ? 'image/*,video/*' : 'image/*'}
                  onChange={(e) => pick(a.key, e.target.files?.[0])}
                />
                <button disabled={!sel?.file || busy === a.key} onClick={() => upload(a.key)}>
                  {busy === a.key ? 'Uploading…' : a.url ? 'Replace' : 'Upload'}
                </button>
                {a.url && <button className="danger" disabled={busy === a.key} onClick={() => remove(a.key)}>Delete</button>}
              </div>
            </div>
          );
        })}
        {!assets.length && <div className="muted">No flow assets defined.</div>}
      </div>
    </div>
  );
}
