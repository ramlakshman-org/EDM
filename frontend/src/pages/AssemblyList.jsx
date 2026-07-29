import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';

export default function AssemblyList() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(null); // assembly_no being generated
  const [loading, setLoading] = useState(true);

  // Merge assemblies (for voter totals) with MLA credentials (username/passcode).
  const load = () => {
    setLoading(true);
    return Promise.all([
      api.get('/assemblies'),
      api.get('/assembly-credentials').catch(() => ({ data: { rows: [] } })),
    ])
      .then(([a, c]) => {
        const creds = {};
        for (const r of c.data.rows || []) creds[String(r.assembly_no)] = r;
        setRows((a.data.assemblies || []).map((x) => ({
          ...x,
          username: creds[String(x.assembly_no)]?.username || '-',
          passcode: creds[String(x.assembly_no)]?.passcode || '-',
        })));
      })
      .catch((e) => setErr(e.response?.data?.message || 'Failed to load assemblies.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const generate = async (no) => {
    setErr(''); setMsg(''); setBusy(no);
    try {
      const { data } = await api.post(`/assembly-credentials/${no}/generate`);
      if (data.success) { setMsg(`Generated credentials for assembly ${no}: ${data.username} / ${data.passcode}`); await load(); }
      else setErr(data.message || 'Generation failed.');
    } catch (e) { setErr(e.response?.data?.message || 'Generation failed.'); }
    finally { setBusy(null); }
  };

  const filtered = rows.filter((a) =>
    !q || String(a.assembly_no).includes(q) || (a.assembly_name || '').toLowerCase().includes(q.toLowerCase())
  );

  const hasCred = (v) => v && v !== '-';

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Assemblies</h1>
      {msg && <div className="alert warn">{msg}</div>}
      {err && <div className="alert err">{err}</div>}
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, maxWidth: 320 }}><label>Search</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Constituency No. or name..." />
          </div>
          <div className="muted" style={{ fontWeight: 600, fontSize: 13, paddingBottom: 10 }}>{filtered.length} assemblies</div>
        </div>

        {loading ? (
          <Spinner label="Loading assemblies…" />
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="assembly-table-wrapper" style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>No.</th><th>Name</th><th>District</th><th>Total Voters</th><th>Username</th><th>Passcode</th><th></th></tr></thead>
                <tbody>
                  {filtered.map((a) => {
                    const missing = !hasCred(a.username) || !hasCred(a.passcode);
                    return (
                      <tr key={a.assembly_no}>
                        <td>{a.assembly_no}</td><td>{a.assembly_name}</td><td>{a.district || '-'}</td>
                        <td>{Number(a.total_voters || 0).toLocaleString('en-IN')}</td>
                        <td>{hasCred(a.username) ? <strong>{a.username}</strong> : <span className="muted">—</span>}</td>
                        <td>{hasCred(a.passcode) ? <code style={{ background: '#e8f5e9', color: '#2e7d32', fontWeight: 700 }}>{a.passcode}</code> : <span className="muted">—</span>}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {missing && (
                            <button className="success" disabled={busy === a.assembly_no} onClick={() => generate(a.assembly_no)} style={{ marginRight: 8 }}>
                              {busy === a.assembly_no ? 'Generating…' : 'Generate'}
                            </button>
                          )}
                          <Link to={`/assemblies/${a.assembly_no}`}><button>Details</button></Link>
                        </td>
                      </tr>
                    );
                  })}
                  {!filtered.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 18 }}>No assemblies.</td></tr>}
                </tbody>
              </table>
            </div>

            {/* Mobile View Cards */}
            <div className="assembly-mobile-list">
              {filtered.map((a) => {
                const missing = !hasCred(a.username) || !hasCred(a.passcode);
                return (
                  <Link key={a.assembly_no} to={`/assemblies/${a.assembly_no}`} className="assembly-card-item">
                    <div className="assembly-card-head">
                      <div className="assembly-title">
                        <span className="assembly-no-badge">#{a.assembly_no}</span>
                        <strong>{a.assembly_name}</strong>
                      </div>
                      <span style={{ color: '#94a3b8', fontSize: 18, fontWeight: 700 }}>›</span>
                    </div>
                    <div className="assembly-card-body">
                      <div className="assembly-kv">
                        <span className="lbl">Username</span>
                        <span className="val">{hasCred(a.username) ? <strong>{a.username}</strong> : <span className="muted">—</span>}</span>
                      </div>
                      <div className="assembly-kv">
                        <span className="lbl">Passcode</span>
                        <span className="val">
                          {hasCred(a.passcode) ? (
                            <code style={{ background: '#e8f5e9', color: '#2e7d32', fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
                              {a.passcode}
                            </code>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </span>
                      </div>
                    </div>
                    {missing && (
                      <div className="assembly-card-actions" onClick={(e) => e.preventDefault()}>
                        <button className="success" disabled={busy === a.assembly_no} onClick={(e) => { e.preventDefault(); generate(a.assembly_no); }}>
                          {busy === a.assembly_no ? 'Generating…' : 'Generate Credentials'}
                        </button>
                      </div>
                    )}
                  </Link>
                );
              })}
              {!filtered.length && <div className="muted" style={{ textAlign: 'center', padding: 24 }}>No assemblies found.</div>}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
