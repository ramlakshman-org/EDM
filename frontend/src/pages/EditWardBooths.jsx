import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';

export default function EditWardBooths() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  // EPIC search state
  const [epic, setEpic] = useState('');
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState(null);
  const [boothErr, setBoothErr] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/ward-logins')
      .then(({ data }) => {
        const found = (data.rows || []).find((r) => String(r._id) === String(id) || String(r.id) === String(id));
        if (found) setDetail(found);
        else setErr('Ward login not found.');
      })
      .catch((e) => setErr(e.response?.data?.message || 'Failed to load ward login details.'))
      .finally(() => setLoading(false));
  }, [id]);

  const searchEpic = async () => {
    const val = epic.trim().toUpperCase();
    if (!val) { setBoothErr('Please enter an EPIC number.'); return; }
    setBoothErr(''); setFound(null); setSearching(true);
    try {
      const { data } = await api.get('/dashboard/search-epic', { params: { epic: val } });
      if (data.success && data.voter) setFound({ voter: data.voter, assembly_name: data.assembly_name });
      else setBoothErr(`No voter found with EPIC number: ${val}`);
    } catch (e) {
      setBoothErr(e.response?.data?.message || 'Search failed.');
    } finally { setSearching(false); }
  };

  const addBooth = () => {
    if (!found?.voter || !detail) return;
    const v = found.voter;
    const booth = {
      assembly_no: parseInt(v.ASSEMBLY_NO, 10),
      assembly_name: found.assembly_name || v.AC_NAME || `AC ${v.ASSEMBLY_NO}`,
      part_no: parseInt(v.PART_NO, 10),
      booth_name: v.BOOTH_NAME || `Booth ${v.PART_NO}`,
    };
    const dupe = (detail.booths || []).some(
      (x) => Number(x.assembly_no) === booth.assembly_no && Number(x.part_no) === booth.part_no
    );
    if (dupe) { setBoothErr('This booth is already added to this ward.'); return; }
    setBoothErr('');
    setDetail((d) => ({ ...d, booths: [...(d.booths || []), booth] }));
    setDirty(true);
    setEpic(''); setFound(null);
  };

  const deleteBooth = (b) => {
    setDetail((d) => ({
      ...d,
      booths: (d.booths || []).filter(
        (x) => !(Number(x.assembly_no) === Number(b.assembly_no) && Number(x.part_no) === Number(b.part_no))
      ),
    }));
    setDirty(true);
  };

  const saveBooths = async () => {
    if (!detail) return;
    setBoothErr(''); setSaving(true); setMsg('');
    try {
      const { data } = await api.post(`/ward-logins/${detail._id || id}/save-booths`, { booths: detail.booths || [] });
      if (data.success) {
        setDetail((d) => ({ ...d, booths: data.booths || d.booths }));
        setDirty(false);
        setMsg('Booths saved successfully.');
      } else setBoothErr(data.message || 'Save failed.');
    } catch (e) {
      setBoothErr(e.response?.data?.message || 'Save failed.');
    } finally { setSaving(false); }
  };

  if (loading) return <Spinner label="Loading ward details…" />;
  if (err) return <div><div className="alert err">{err}</div><Link to="/ward-logins" className="btn-link">← Back to Ward Logins</Link></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="secondary" onClick={() => navigate(`/ward-logins/${id}`)} title="Back to Ward Details" style={{ padding: '6px 12px', fontSize: 18, lineHeight: 1, fontWeight: 700 }}>←</button>
          <h1 style={{ margin: 0, fontSize: 18 }}>Manage Booths — {detail.username} (Ward {detail.ward_id})</h1>
        </div>
        <button className="success" onClick={saveBooths} disabled={!dirty || saving} style={{ height: 38 }}>
          {saving ? 'Saving…' : 'Save Booths'}
        </button>
      </div>

      {msg && <div className="alert warn">{msg}</div>}

      {/* EPIC search card */}
      <div className="card epic-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Add New Booth to Ward — {detail.username}</h2>
        <div className="row" style={{ alignItems: 'flex-end', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label>Enter EPIC Number</label>
            <input value={epic} onChange={(e) => setEpic(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') searchEpic(); }}
              placeholder="e.g. ALF2230738" style={{ width: '100%' }} />
          </div>
          <button onClick={searchEpic} disabled={searching} style={{ height: 42 }}>{searching ? 'Searching…' : 'Search EPIC'}</button>
        </div>
        {boothErr && <div className="alert err" style={{ marginTop: 10 }}>{boothErr}</div>}

        {found && (
          <div className="epic-result" style={{ marginTop: 14 }}>
            <div className="epic-col">
              <h4>Detected Booth</h4>
              <p>
                <strong>Assembly No:</strong> {found.voter.ASSEMBLY_NO}<br />
                <strong>Assembly Name:</strong> {found.assembly_name || found.voter.AC_NAME || `AC ${found.voter.ASSEMBLY_NO}`}<br />
                <strong>Booth / Part No:</strong> {found.voter.PART_NO}<br />
                <strong>Booth Name:</strong> <span style={{ color: '#1565c0', fontWeight: 600 }}>{found.voter.BOOTH_NAME || `Booth ${found.voter.PART_NO}`}</span>
              </p>
              <button className="success" onClick={addBooth}>+ Add Booth</button>
            </div>
            <div className="epic-col">
              <h4>Voter for Confirmation</h4>
              <p>
                <strong>Name:</strong> {found.voter.VOTER_NAME_EN} / {found.voter.VOTER_NAME || ''}<br />
                <strong>Relation:</strong> {(found.voter.RELATION_TYPE || 'Relation')}: {found.voter.RELATION_NAME_EN || ''} / {found.voter.RELATION_NAME || ''}<br />
                <strong>Age/Gender:</strong> {found.voter.AGE} / {found.voter.GENDER}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Assigned booths list */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Assembly Booths in this Ward</h2>
          {dirty && <span className="muted" style={{ color: '#c77700', fontWeight: 600, fontSize: 13 }}>Unsaved changes</span>}
        </div>

        {/* Desktop Table View */}
        <div className="booth-table-wrapper" style={{ overflowX: 'auto', width: '100%' }}>
          <table>
            <thead><tr><th>Assembly No</th><th>Assembly Name</th><th>Booth No</th><th>Booth Name / Address</th><th style={{ textAlign: 'center', width: 90 }}>Action</th></tr></thead>
            <tbody>
              {(detail.booths || []).map((b, i) => (
                <tr key={`${b.assembly_no}-${b.part_no}-${i}`}>
                  <td><span className="assembly-no-badge">#{b.assembly_no}</span></td>
                  <td>{b.assembly_name}</td>
                  <td><span className="assembly-no-badge">#{b.part_no}</span></td>
                  <td><strong>{b.booth_name}</strong></td>
                  <td style={{ textAlign: 'center' }}><button className="danger" onClick={() => deleteBooth(b)} style={{ height: 32, padding: '0 12px', fontSize: 12 }}>Delete</button></td>
                </tr>
              ))}
              {!(detail.booths || []).length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 20 }}>No booths assigned to this ward yet. Use the EPIC search above to add booths.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="booth-mobile-list">
          {(detail.booths || []).map((b, i) => (
            <div key={`${b.assembly_no}-${b.part_no}-${i}`} className="booth-card-item">
              <div className="booth-card-head">
                <span className="assembly-no-badge">AC #{b.assembly_no}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge-success" style={{ fontSize: 11, padding: '4px 10px' }}>Booth #{b.part_no}</span>
                  <button className="danger" onClick={() => deleteBooth(b)} style={{ height: 30, padding: '0 10px', fontSize: 11 }}>Delete</button>
                </div>
              </div>
              <div className="booth-name-title">{b.booth_name}</div>
              <div className="booth-section-info">
                <span className="lbl">Assembly:</span> {b.assembly_name}
              </div>
            </div>
          ))}
          {!(detail.booths || []).length && <div className="muted" style={{ textAlign: 'center', padding: 24 }}>No booths assigned to this ward yet.</div>}
        </div>
      </div>
    </div>
  );
}
