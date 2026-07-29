import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';
import { IconEdit } from '../components/Icons.jsx';

export default function WardDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ward, setWard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/ward-logins')
      .then(({ data }) => {
        const found = (data.rows || []).find((r) => String(r._id) === String(id) || String(r.id) === String(id));
        if (found) setWard(found);
        else setErr('Ward login not found.');
      })
      .catch((e) => setErr(e.response?.data?.message || 'Failed to load ward login details.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner label="Loading ward details…" />;
  if (err) return <div><div className="alert err">{err}</div><Link to="/ward-logins" className="btn-link">← Back to Ward Logins</Link></div>;

  const r = ward || {};

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="secondary" onClick={() => navigate('/ward-logins')} title="Back to Ward Logins" style={{ padding: '6px 12px', fontSize: 18, lineHeight: 1, fontWeight: 700 }}>←</button>
          <h1 style={{ margin: 0, fontSize: 20 }}>{r.description || `Ward ${r.ward_id}`}</h1>
        </div>
        <button onClick={() => navigate(`/ward-logins/${id}/edit`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <IconEdit size={16} color="#fff" /> <span className="btn-text-desktop">Edit Booths</span>
        </button>
      </div>

      {/* Ward Info Grid */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: 14 }}>Ward Login Details</h3>
        <div className="ass-detail-grid cols-3">
          <div className="ass-detail-kv">
            <span className="lbl">Username</span>
            <span className="val"><strong>{r.username}</strong></span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">Passcode</span>
            <span className="val">
              <code style={{ background: '#e8f5e9', color: '#2e7d32', fontWeight: 700, padding: '4px 8px', borderRadius: 6 }}>
                {r.passcode}
              </code>
            </span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">Ward No</span>
            <span className="val"><span className="badge-info">Ward {r.ward_id ?? '-'}</span></span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">Body Type</span>
            <span className="val" style={{ textTransform: 'capitalize' }}>{r.candidate_type || '-'}</span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">Position</span>
            <span className="val">{r.position || '-'}</span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">District</span>
            <span className="val">{r.district || '-'}</span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">Local Body</span>
            <span className="val">{r.local_body || '-'}</span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">Total Booths</span>
            <span className="val"><span className="badge-success">{(r.booths || []).length} Booths</span></span>
          </div>
        </div>
      </div>

      {/* Added Booths Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Assembly Booths Added to this Ward</h3>
          <button className="secondary ward-manage-btn" onClick={() => navigate(`/ward-logins/${id}/edit`)}>
            <span className="ward-manage-btn-text">+ Add / Manage Booths</span>
            <span className="ward-manage-btn-icon">+</span>
          </button>
        </div>

        {/* Desktop Table View */}
        <div className="booth-table-wrapper" style={{ overflowX: 'auto', width: '100%' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 100 }}>Assembly No</th>
                <th>Assembly Name</th>
                <th style={{ width: 90 }}>Booth No</th>
                <th>Booth Name / Address</th>
              </tr>
            </thead>
            <tbody>
              {(r.booths || []).map((b, i) => (
                <tr key={`${b.assembly_no}-${b.part_no}-${i}`}>
                  <td><span className="assembly-no-badge">#{b.assembly_no}</span></td>
                  <td>{b.assembly_name}</td>
                  <td><span className="assembly-no-badge">#{b.part_no}</span></td>
                  <td><strong>{b.booth_name}</strong></td>
                </tr>
              ))}
              {!(r.booths || []).length && (
                <tr>
                  <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                    No booths assigned to this ward yet. Click "Edit Booths" to add booths.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="booth-mobile-list">
          {(r.booths || []).map((b, i) => (
            <div key={`${b.assembly_no}-${b.part_no}-${i}`} className="booth-card-item">
              <div className="booth-card-head">
                <span className="assembly-no-badge">AC #{b.assembly_no}</span>
                <span className="badge-success" style={{ fontSize: 11, padding: '4px 10px' }}>
                  Booth #{b.part_no}
                </span>
              </div>
              <div className="booth-name-title">{b.booth_name}</div>
              <div className="booth-section-info">
                <span className="lbl">Assembly:</span> {b.assembly_name}
              </div>
            </div>
          ))}
          {!(r.booths || []).length && (
            <div className="muted" style={{ textAlign: 'center', padding: 24 }}>
              No booths assigned to this ward yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
