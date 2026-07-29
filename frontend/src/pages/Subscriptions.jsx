import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export default function Subscriptions() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/payments/subscriptions')
      .then(({ data }) => setRows(data.subscriptions || []))
      .catch((e) => setErr(e.response?.data?.message || 'Unable to load subscriptions.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((r) =>
    !q ||
    (r.name || '').toLowerCase().includes(q.toLowerCase()) ||
    (r.assembly_name || '').toLowerCase().includes(q.toLowerCase()) ||
    (r.district || '').toLowerCase().includes(q.toLowerCase()) ||
    String(r.mobile_no || '').includes(q)
  );

  const totalRevenue = filtered.reduce((t, r) => t + Number(r.amount || 0), 0);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Subscriptions &amp; Payment History</h1>
      {err && <div className="alert warn">{err}</div>}

      <div className="tiles">
        <div className="tile green"><div>Total Subscriptions</div><h3>{fmt(filtered.length)}</h3></div>
        <div className="tile blue"><div>Total Revenue (₹)</div><h3>₹{fmt(totalRevenue)}</h3></div>
      </div>

      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, maxWidth: 320 }}>
            <label>Search Payments</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="name / ward / mobile / district..." />
          </div>
          <div className="muted" style={{ fontWeight: 600, fontSize: 13, paddingBottom: 8 }}>{filtered.length} records</div>
        </div>

        {/* Desktop Table View */}
        <div className="sub-table-wrapper" style={{ overflowX: 'auto', width: '100%' }}>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Mobile</th>
                <th>Local Body Type</th>
                <th>Amount Paid (₹)</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><Spinner label="Loading subscriptions…" /></td></tr>
              ) : (
                <>
                  {filtered.map((r) => {
                    const isWard = r.role_label === 'Ward User' || Number(r.user_group_id) === 6;
                    return (
                      <tr key={r._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/registrations/view/${r._id}`)}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span style={{
                            background: isWard ? '#fffbeb' : '#f0f9ff',
                            color: isWard ? '#b45309' : '#0369a1',
                            border: isWard ? '1px solid #fde68a' : '1px solid #bae6fd',
                            fontWeight: 700,
                            fontSize: 11,
                            padding: '4px 10px',
                            borderRadius: 980,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            whiteSpace: 'nowrap',
                          }}>
                            {isWard ? '👑 Ward User' : '🏛️ MLA'}
                          </span>
                        </td>
                        <td>
                          <button className="linklike" onClick={(e) => { e.stopPropagation(); navigate(`/registrations/view/${r._id}`); }}>
                            {r.name}
                          </button>
                        </td>
                        <td>{r.mobile_no}</td>
                        <td><span style={{ fontWeight: 600, color: 'var(--color-primary-ink)' }}>{r.local_body_type || '-'}</span></td>
                        <td><strong style={{ color: '#16a34a', fontSize: 15 }}>₹{fmt(r.amount)}</strong></td>
                        <td>{r.payment_date || '-'}</td>
                      </tr>
                    );
                  })}
                  {!filtered.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 18 }}>No payment records found.</td></tr>}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="sub-mobile-list">
          {loading ? (
            <Spinner label="Loading subscriptions…" />
          ) : (
            <>
              {filtered.map((r) => {
                const isWard = r.role_label === 'Ward User' || Number(r.user_group_id) === 6;
                return (
                  <div key={r._id} className="sub-card-item" style={{ cursor: 'pointer' }} onClick={() => navigate(`/registrations/view/${r._id}`)}>
                    <div className="sub-card-head">
                      <div className="sub-name-title">
                        <span style={{
                          background: isWard ? '#fffbeb' : '#f0f9ff',
                          color: isWard ? '#b45309' : '#0369a1',
                          border: isWard ? '1px solid #fde68a' : '1px solid #bae6fd',
                          fontWeight: 700,
                          fontSize: 11,
                          padding: '3px 9px',
                          borderRadius: 980,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          marginBottom: 4,
                          width: 'fit-content',
                          whiteSpace: 'nowrap',
                        }}>
                          {isWard ? '👑 Ward User' : '🏛️ MLA'}
                        </span>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#0071e3', textDecoration: 'underline' }}>{r.name}</div>
                        <div style={{ fontSize: 13, color: 'var(--color-mid-gray)', fontWeight: 500, marginTop: 2 }}>
                          📱 {r.mobile_no}
                        </div>
                      </div>
                      <div className="sub-amount-badge">₹{fmt(r.amount)}</div>
                    </div>

                    <div className="sub-card-body">
                      <div className="sub-kv">
                        <span className="lbl">Local Body Type</span>
                        <span className="val">{r.local_body_type || '-'}</span>
                      </div>
                      <div className="sub-kv">
                        <span className="lbl">Date</span>
                        <span className="val">{r.payment_date || (r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '-')}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!filtered.length && <div className="muted" style={{ textAlign: 'center', padding: 24 }}>No subscriptions found.</div>}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
