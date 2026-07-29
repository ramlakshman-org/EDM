import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';
import { IconEdit } from '../components/Icons.jsx';

// Mirrors admin/pages/wardlogins — ward login list with desktop table and mobile cards layout.
// Detail view lives on /ward-logins/:id, and Booth Management lives on /ward-logins/:id/edit.
export default function WardLogins() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/ward-logins')
      .then(({ data }) => {
        setRows(data.rows || []);
      })
      .catch((e) => setErr(e.response?.data?.message || 'Failed to load ward logins.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const remove = async (id, e) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to delete this Ward Login?')) return;
    try {
      await api.delete(`/ward-logins/${id}`);
      setMsg('Ward login deleted successfully.');
      load();
    } catch (err) {
      setErr(err.response?.data?.message || 'Delete failed.');
    }
  };

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Ward Logins List</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Local-body ward logins (user_group_id = 6). Username = category_w{'{ward}'}; random 6-digit passcode; each holds a list of booths.
      </p>
      {msg && <div className="alert warn">{msg}</div>}
      {err && <div className="alert err">{err}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <strong style={{ fontSize: 16 }}>Ward Logins ({rows.length})</strong>
          <button onClick={() => navigate('/ward-logins/create')}>+ Create Ward Login</button>
        </div>

        {/* Desktop Table View */}
        <div className="ward-table-wrapper" style={{ overflowX: 'auto', width: '100%' }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Body Type</th>
                <th>Position</th>
                <th>District</th>
                <th>Local Body</th>
                <th style={{ whiteSpace: 'nowrap' }}>Ward No</th>
                <th>Username / Mobile</th>
                <th>Password</th>
                <th style={{ whiteSpace: 'nowrap' }}>Total Booths</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10}><Spinner label="Loading ward logins…" /></td></tr>}
              {!loading && rows.map((r) => {
                const id = r._id || r.id;
                return (
                  <tr key={id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/ward-logins/${id}`)}>
                    <td>{r.id ?? '-'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{r.candidate_type || '-'}</td>
                    <td>{r.position || '-'}</td>
                    <td>{r.district || '-'}</td>
                    <td>{r.local_body || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><span className="badge-info" style={{ whiteSpace: 'nowrap' }}>Ward {r.ward_id ?? '-'}</span></td>
                    <td><strong style={{ color: '#0071e3' }}>{r.username}</strong></td>
                    <td><code>{r.passcode}</code></td>
                    <td style={{ whiteSpace: 'nowrap' }}><span className="badge-success" style={{ whiteSpace: 'nowrap' }}>{(r.booths || []).length} Booths</span></td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <button className="secondary" style={{ marginRight: 6, padding: '4px 10px', fontSize: 12 }} onClick={() => navigate(`/ward-logins/${id}/edit`)}>
                        Edit
                      </button>
                      <button className="danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={(e) => remove(id, e)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && !rows.length && <tr><td colSpan={10} className="muted" style={{ textAlign: 'center', padding: 18 }}>No ward logins yet.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="ward-mobile-list">
          {loading && <Spinner label="Loading ward logins…" />}
          {!loading && rows.map((r) => {
            const id = r._id || r.id;
            return (
              <div key={id} className="ward-card-item" onClick={() => navigate(`/ward-logins/${id}`)}>
                <div className="ward-card-head">
                  <div className="ward-title">
                    <strong>{r.description || `Ward ${r.ward_id}`}</strong>
                    <span className="badge-success" style={{ fontSize: 11 }}>{(r.booths || []).length} Booths</span>
                  </div>
                  <span style={{ color: '#94a3b8', fontSize: 18, fontWeight: 700 }}>›</span>
                </div>

                <div className="ward-card-body">
                  <div className="ward-kv">
                    <span className="lbl">Username</span>
                    <span className="val"><strong>{r.username}</strong></span>
                  </div>
                  <div className="ward-kv">
                    <span className="lbl">Passcode</span>
                    <span className="val">
                      <code style={{ background: '#e8f5e9', color: '#2e7d32', fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
                        {r.passcode}
                      </code>
                    </span>
                  </div>
                  <div className="ward-kv">
                    <span className="lbl">Ward No</span>
                    <span className="val"><span className="badge-info">Ward {r.ward_id ?? '-'}</span></span>
                  </div>
                  <div className="ward-kv">
                    <span className="lbl">Body Type</span>
                    <span className="val" style={{ textTransform: 'capitalize' }}>{r.candidate_type || '-'}</span>
                  </div>
                  <div className="ward-kv">
                    <span className="lbl">Position</span>
                    <span className="val">{r.position || '-'}</span>
                  </div>
                  <div className="ward-kv">
                    <span className="lbl">District</span>
                    <span className="val">{r.district || '-'}</span>
                  </div>
                </div>

                <div className="ward-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="secondary" style={{ padding: '6px 14px', fontSize: 12.5 }} onClick={() => navigate(`/ward-logins/${id}/edit`)}>
                    <IconEdit size={14} color="#475569" /> Edit Booths
                  </button>
                  <button className="danger" style={{ padding: '6px 14px', fontSize: 12.5 }} onClick={(e) => remove(id, e)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
          {!loading && !rows.length && <div className="muted" style={{ textAlign: 'center', padding: 24 }}>No ward logins found.</div>}
        </div>

      </div>
    </div>
  );
}
