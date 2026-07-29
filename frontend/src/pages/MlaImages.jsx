import { useEffect, useMemo, useState } from 'react';
import api from '../api/client.js';
import { MLA_MEMBERS, PARTIES } from '../data/mlaMembers.js';

// Admin page to upload MLA profile photos (per constituency) and party flags
// (per party). Images go to Cloudinary via the backend and are shown in MLA List.
const readAsBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = reject;
  r.readAsDataURL(file);
});

export default function MlaImages() {
  const [tab, setTab] = useState('profiles');
  const [profiles, setProfiles] = useState({});
  const [flags, setFlags] = useState({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  const load = () => api.get('/mla/images')
    .then(({ data }) => { setProfiles(data.profiles || {}); setFlags(data.flags || {}); })
    .catch((e) => setErr(e.response?.data?.message || 'Failed to load.'));
  useEffect(() => { load(); }, []);

  const pick = async (kind, key, file) => {
    if (!file) return;
    setErr(''); setMsg('');
    if (!file.type.startsWith('image/')) { setErr('Please choose an image file.'); return; }
    if (file.size > 8 * 1024 * 1024) { setErr('Image too large (max 8MB).'); return; }
    const busyKey = `${kind}:${key}`;
    setBusy(busyKey);
    try {
      const fileBase64 = await readAsBase64(file);
      const payload = { filename: file.name, mime: file.type, fileBase64 };
      if (kind === 'profile') {
        const { data } = await api.post('/mla/profile-upload', { ...payload, constituency_no: key });
        if (data.success) { setProfiles((s) => ({ ...s, [key]: data.url })); setMsg('Profile photo uploaded.'); }
        else setErr(data.message || 'Upload failed.');
      } else {
        const { data } = await api.post('/mla/flag-upload', { ...payload, party: key });
        if (data.success) { setFlags((s) => ({ ...s, [key]: data.url })); setMsg('Party flag uploaded.'); }
        else setErr(data.message || 'Upload failed.');
      }
    } catch (e) {
      setErr(e.response?.data?.message || 'Upload failed.');
    } finally { setBusy(''); }
  };

  const removeProfile = async (no) => {
    if (!confirm('Remove this profile photo?')) return;
    await api.delete(`/mla/profile/${no}`).catch(() => {});
    setProfiles((s) => { const c = { ...s }; delete c[no]; return c; });
  };
  const removeFlag = async (party) => {
    if (!confirm('Remove this party flag?')) return;
    await api.delete(`/mla/flag/${party}`).catch(() => {});
    setFlags((s) => { const c = { ...s }; delete c[party]; return c; });
  };

  const filteredMembers = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return MLA_MEMBERS;
    return MLA_MEMBERS.filter(([no, name, member]) =>
      String(no).includes(term) || name.toLowerCase().includes(term) || member.toLowerCase().includes(term));
  }, [q]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>MLA Images</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Upload MLA profile photos (per constituency) and party flags (per party). These appear in the MLA List.
      </p>
      {msg && <div className="alert warn">{msg}</div>}
      {err && <div className="alert err">{err}</div>}

      <div className="tabs" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={tab === 'profiles' ? '' : 'secondary'} onClick={() => setTab('profiles')}>MLA Profile Photos</button>
        <button className={tab === 'flags' ? '' : 'secondary'} onClick={() => setTab('flags')}>Party Flags</button>
      </div>

      {tab === 'flags' && (
        <div className="card">
          <strong>Party Flags</strong>
          <div className="fa-grid" style={{ marginTop: 12 }}>
            {Object.entries(PARTIES).map(([abbr, p]) => {
              const url = flags[abbr];
              const bk = `flag:${abbr}`;
              return (
                <div className="card fa-card" key={abbr}>
                  <div className="fa-head"><strong>{abbr}</strong></div>
                  <div className="muted fa-desc">{p.full}</div>
                  {url ? <img src={url} className="fa-media" alt={abbr} /> : <div className="fa-media fa-empty">No flag</div>}
                  <div className="fa-actions">
                    <input type="file" accept="image/*" disabled={busy === bk} onChange={(e) => pick('flag', abbr, e.target.files?.[0])} />
                    <button disabled={busy === bk}>{busy === bk ? 'Uploading…' : (url ? 'Replace' : 'Upload')}</button>
                    {url && <button className="danger" onClick={() => removeFlag(abbr)}>Delete</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'profiles' && (
        <div className="card">
          <div className="row" style={{ alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, maxWidth: 320 }}><label>Search</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Constituency or member name..." />
            </div>
            <div className="muted" style={{ fontWeight: 600, fontSize: 13, paddingBottom: 10 }}>{filteredMembers.length} constituencies</div>
          </div>

          {/* Desktop Table View */}
          <div className="mla-images-table-wrapper" style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th style={{ width: 64 }}>Photo</th><th>Constituency</th><th>Elected Member</th><th style={{ width: 320 }}>Upload</th></tr></thead>
              <tbody>
                {filteredMembers.map(([no, name, member]) => {
                  const url = profiles[no];
                  const bk = `profile:${no}`;
                  return (
                    <tr key={no}>
                      <td>{url ? <img className="mla-photo" src={url} alt={member} /> : <span className="mla-photo placeholder">{member.charAt(0)}</span>}</td>
                      <td><strong>{no}-{name}</strong></td>
                      <td>{member}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input type="file" accept="image/*" disabled={busy === bk} onChange={(e) => pick('profile', no, e.target.files?.[0])} style={{ fontSize: 12 }} />
                          {busy === bk && <span className="muted">Uploading…</span>}
                          {url && <button className="danger" onClick={() => removeProfile(no)}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="mla-img-mobile-list">
            {filteredMembers.map(([no, name, member]) => {
              const url = profiles[no];
              const bk = `profile:${no}`;
              return (
                <div key={no} className="mla-img-card">
                  <div className="mla-img-card-top">
                    <div className="mla-card-avatar">
                      {url ? (
                        <img className="mla-photo-lg" src={url} alt={member} />
                      ) : (
                        <span className="mla-photo-lg placeholder">{member.charAt(0)}</span>
                      )}
                    </div>
                    <div className="mla-img-card-meta">
                      <div className="mla-constituency">{no} - {name}</div>
                      <div className="mla-member-name">{member}</div>
                    </div>
                  </div>
                  <div className="mla-img-card-action">
                    <input
                      type="file"
                      accept="image/*"
                      disabled={busy === bk}
                      onChange={(e) => pick('profile', no, e.target.files?.[0])}
                    />
                    {busy === bk && <span className="muted" style={{ fontSize: 12 }}>Uploading…</span>}
                    {url && (
                      <button className="danger" onClick={() => removeProfile(no)} style={{ padding: '6px 14px', fontSize: 13 }}>
                        Delete Photo
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {!filteredMembers.length && <div className="muted" style={{ textAlign: 'center', padding: 24 }}>No matches found.</div>}
          </div>

        </div>
      )}
    </div>
  );
}
