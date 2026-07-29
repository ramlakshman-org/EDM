import { useEffect, useState } from 'react';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';

// Mirrors "Booth Wise Login Credentials" (AssemblyController@boothLoginList/Ajax).
export default function BoothLogins() {
  const [assemblies, setAssemblies] = useState([]);
  const [assemblyId, setAssemblyId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/assemblies').then(({ data }) => {
      const list = data.assemblies || [];
      setAssemblies(list);
      if (list.length) load(String(list[0].assembly_no)); // default: first assembly
      else setLoading(false);
    }).catch(() => setLoading(false));
    // eslint-disable-next-line
  }, []);

  const load = async (id) => {
    setAssemblyId(id); setRows([]); setErr('');
    if (!id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/booth-logins', { params: { assembly_id: id } });
      setRows(data.rows || []);
    } catch (e) { setErr(e.response?.data?.message || 'Failed to load booth logins.'); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Booth-wise Logins</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        One login per booth (PART_NO), user_group_id = 4. Passcode = MLA passcode + booth number.
      </p>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="row" style={{ alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, maxWidth: 320 }}>
            <label>Assembly</label>
            <select value={assemblyId} onChange={(e) => load(e.target.value)}>
              <option value="">Select Assembly</option>
              {assemblies.map((a) => <option key={a.assembly_no} value={a.assembly_no}>{a.assembly_no} - {a.assembly_name}</option>)}
            </select>
          </div>
          <div className="muted" style={{ fontWeight: 600, fontSize: 13, paddingBottom: 8 }}>{rows.length} booth logins</div>
        </div>

        {err && <div className="alert err">{err}</div>}

        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 70 }}>Booth</th>
                <th>Username</th>
                <th>Passcode</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3}><Spinner label="Loading booth logins…" /></td></tr>
              ) : (
                <>
                  {rows.map((r) => (
                    <tr key={r.booth_no}>
                      <td><span className="assembly-no-badge">#{r.booth_no}</span></td>
                      <td><strong>{r.username}</strong></td>
                      <td>
                        <code style={{ background: '#e8f5e9', color: '#2e7d32', fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>
                          {r.passcode}
                        </code>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={3} className="muted" style={{ textAlign: 'center', padding: 18 }}>No booth logins for this assembly.</td></tr>}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
