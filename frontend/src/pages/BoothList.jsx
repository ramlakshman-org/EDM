import { useEffect, useState } from 'react';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';

export default function BoothList() {
  const [assemblies, setAssemblies] = useState([]);
  const [assemblyId, setAssemblyId] = useState('');
  const [booths, setBooths] = useState([]);
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
    setAssemblyId(id); setBooths([]); setErr('');
    if (!id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/booths', { params: { assemblyId: id } });
      setBooths(data.booths || []);
    } catch (e) { setErr(e.response?.data?.message || 'Failed to load booths.'); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Booth List</h1>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, maxWidth: 320 }}>
            <label>Assembly</label>
            <select value={assemblyId} onChange={(e) => load(e.target.value)}>
              <option value="">Select Assembly</option>
              {assemblies.map((a) => <option key={a.assembly_no} value={a.assembly_no}>{a.assembly_no} - {a.assembly_name}</option>)}
            </select>
          </div>
          <div className="muted" style={{ fontWeight: 600, fontSize: 13, paddingBottom: 8 }}>{booths.length} booths</div>
        </div>

        {err && <div className="alert err">{err}</div>}

        {/* Desktop Table View */}
        <div className="booth-table-wrapper" style={{ overflowX: 'auto', width: '100%' }}>
          <table>
            <thead><tr><th style={{ width: 80 }}>Part No</th><th>Booth Name</th><th>Section</th><th style={{ width: 130 }}>GPS Status</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={4}><Spinner label="Loading booths…" /></td></tr> : (<>
                {booths.map((b) => (
                  <tr key={b.part_no}>
                    <td><span className="assembly-no-badge">#{b.part_no}</span></td>
                    <td><strong>{b.booth_name}</strong></td>
                    <td>{b.section_name || '-'}</td>
                    <td>
                      {b.has_coords
                        ? <span className="badge-success">Available</span>
                        : <span className="badge-info" style={{ background: '#ef4444', color: '#fff' }}>Not Available</span>}
                    </td>
                  </tr>
                ))}
                {!booths.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 18 }}>No booths.</td></tr>}
              </>)}
            </tbody>
          </table>
        </div>

        {/* Mobile View Cards */}
        <div className="booth-mobile-list">
          {loading ? (
            <Spinner label="Loading booths…" />
          ) : (
            <>
              {booths.map((b) => (
                <div key={b.part_no} className="booth-card-item">
                  <div className="booth-card-head">
                    <span className="assembly-no-badge">Part #{b.part_no}</span>
                    {b.has_coords ? (
                      <span className="badge-success" style={{ fontSize: 11 }}>GPS Available</span>
                    ) : (
                      <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10 }}>No GPS</span>
                    )}
                  </div>
                  <div className="booth-name-title">{b.booth_name}</div>
                  {b.section_name && b.section_name !== '-' && (
                    <div className="booth-section-info">
                      <span className="lbl">Section:</span> {b.section_name}
                    </div>
                  )}
                </div>
              ))}
              {!booths.length && <div className="muted" style={{ textAlign: 'center', padding: 24 }}>No booths found for this assembly.</div>}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
