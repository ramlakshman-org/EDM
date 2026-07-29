import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export default function AssemblyDetail() {
  const { no } = useParams();
  const [d, setD] = useState(null);
  const [cred, setCred] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    Promise.all([
      api.get(`/assemblies/${no}`),
      api.get('/assembly-credentials').catch(() => ({ data: { rows: [] } })),
    ])
      .then(([a, c]) => {
        setD(a.data);
        const found = (c.data.rows || []).find((r) => String(r.assembly_no) === String(no));
        setCred(found || null);
      })
      .catch((e) => setErr(e.response?.data?.message || 'Failed to load details.'));
  };

  useEffect(() => { load(); }, [no]);

  const generate = async () => {
    setErr(''); setMsg(''); setBusy(true);
    try {
      const { data } = await api.post(`/assembly-credentials/${no}/generate`);
      if (data.success) {
        setMsg(`Generated credentials for assembly ${no}: ${data.username} / ${data.passcode}`);
        await load();
      } else setErr(data.message || 'Generation failed.');
    } catch (e) {
      setErr(e.response?.data?.message || 'Generation failed.');
    } finally { setBusy(false); }
  };

  if (err) return <div><div className="alert err">{err}</div><Link to="/assemblies" className="btn-link">← Back to Assemblies</Link></div>;
  if (!d) return <Spinner label="Loading assembly details…" />;

  const a = d.assembly;
  const username = cred?.username || '-';
  const passcode = cred?.passcode || '-';
  const hasCred = username !== '-' && passcode !== '-';

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Link to="/assemblies" className="btn-link" style={{ fontSize: 14 }}>← Back to Assemblies</Link>
      </div>
      <h1 style={{ marginTop: 0 }}>Assembly #{a.assembly_no} — {a.assembly_name}</h1>
      {msg && <div className="alert warn">{msg}</div>}

      {/* Login Credentials Card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0 }}>Assembly Login Credentials</h3>
          {!hasCred && (
            <button className="success" disabled={busy} onClick={generate}>
              {busy ? 'Generating…' : 'Generate Credentials'}
            </button>
          )}
        </div>
        <div className="ass-detail-grid">
          <div className="ass-detail-kv">
            <span className="lbl">Username</span>
            <span className="val">{hasCred ? <strong>{username}</strong> : <span className="muted">Not generated</span>}</span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">Passcode</span>
            <span className="val">
              {hasCred ? (
                <code style={{ background: '#e8f5e9', color: '#2e7d32', fontWeight: 700, padding: '4px 10px', borderRadius: 6, fontSize: 14 }}>
                  {passcode}
                </code>
              ) : (
                <span className="muted">Not generated</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Assembly Info & Stored Counts Card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: 14 }}>Constituency Information &amp; Stored Counts</h3>
        <div className="ass-detail-grid cols-3">
          <div className="ass-detail-kv">
            <span className="lbl">Total Voters</span>
            <span className="val">{fmt(a.total_voters)}</span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">Male Voters</span>
            <span className="val">{fmt(a.male_voters)}</span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">Female Voters</span>
            <span className="val">{fmt(a.female_voters)}</span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">Other Voters</span>
            <span className="val">{fmt(a.third_gender_voters ?? a.other_voters)}</span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">District</span>
            <span className="val">{a.district || '-'}</span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">Collection Name</span>
            <span className="val"><code>{a.table_name || `ass_${a.assembly_no}`}</code></span>
          </div>
        </div>
      </div>

      {/* Live Gender Counts Card */}
      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 14 }}>Live Voter Database Counts</h3>
        {d.liveCounts ? (
          <div className="ass-detail-grid cols-4">
            <div className="ass-detail-kv">
              <span className="lbl">Total Voters</span>
              <span className="val">{fmt(d.liveCounts.total)}</span>
            </div>
            <div className="ass-detail-kv">
              <span className="lbl">Male Voters</span>
              <span className="val">{fmt(d.liveCounts.male)}</span>
            </div>
            <div className="ass-detail-kv">
              <span className="lbl">Female Voters</span>
              <span className="val">{fmt(d.liveCounts.female)}</span>
            </div>
            <div className="ass-detail-kv">
              <span className="lbl">Other Voters</span>
              <span className="val">{fmt(d.liveCounts.other)}</span>
            </div>
          </div>
        ) : <div className="alert warn">Voter database is unreachable — live counts unavailable.</div>}
      </div>
    </div>
  );
}
