import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export default function Subscriptions() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('subscriptions'); // 'subscriptions' | 'pending-qr'
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Pending QR payments state
  const [utrRows, setUtrRows] = useState([]);
  const [utrLoading, setUtrLoading] = useState(false);
  const [utrErr, setUtrErr] = useState('');
  const [utrActionLoading, setUtrActionLoading] = useState(null);
  const [utrFilter, setUtrFilter] = useState('pending');

  const loadUtrPayments = (status = utrFilter) => {
    setUtrLoading(true);
    setUtrErr('');
    api.get(`/payments/pending-utrs?status=${status}&limit=100`)
      .then(({ data }) => setUtrRows(data.rows || []))
      .catch((e) => setUtrErr(e.response?.data?.message || 'Failed to load QR payments.'))
      .finally(() => setUtrLoading(false));
  };

  const handleUtrAction = async (utr_id, action) => {
    if (!window.confirm(`${action === 'approve' ? 'Approve' : 'Reject'} this payment?`)) return;
    setUtrActionLoading(utr_id);
    try {
      const { data } = await api.post('/payments/approve-utr', { utr_id, action });
      if (data.success) {
        setUtrRows((prev) => prev.map((r) => String(r._id) === utr_id ? { ...r, status: action === 'approve' ? 'approved' : 'rejected' } : r));
      } else {
        alert(data.message || 'Action failed.');
      }
    } catch (e) {
      alert(e.response?.data?.message || 'Error processing action.');
    } finally {
      setUtrActionLoading(null);
    }
  };

  useEffect(() => {
    if (activeTab === 'pending-qr') loadUtrPayments();
  }, [activeTab]);

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
      <h1 style={{ marginTop: 0, fontSize: 'clamp(16px, 4.5vw, 28px)' }}>Subscriptions &amp; Payment History</h1>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e5e5e7' }}>
        {[
          { id: 'subscriptions', label: '💳 Paid Subscriptions' },
          { id: 'pending-qr', label: `📲 Pending QR Payments${utrRows.filter(r => r.status === 'pending').length ? ` (${utrRows.filter(r => r.status === 'pending').length})` : ''}` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 14,
              color: activeTab === tab.id ? '#0071e3' : '#6e6e73',
              borderBottom: activeTab === tab.id ? '2px solid #0071e3' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {err && <div className="alert warn">{err}</div>}

      {/* Pending QR Payments Tab */}
      {activeTab === 'pending-qr' && (
        <div>
          {utrErr && <div className="alert warn">{utrErr}</div>}

          <div className="card">
            <div className="row" style={{ alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
              <div>
                <label>Filter by Status</label>
                <select value={utrFilter} onChange={(e) => { setUtrFilter(e.target.value); loadUtrPayments(e.target.value); }}>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="all">All</option>
                </select>
              </div>
              <button onClick={() => loadUtrPayments()} style={{ marginBottom: 0 }}>Refresh</button>
              <div className="muted" style={{ fontWeight: 600, fontSize: 13, paddingBottom: 8 }}>{utrRows.length} records</div>
            </div>

            {utrLoading ? <Spinner label="Loading QR payments…" /> : (
              <>
                {/* Desktop Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Mobile</th>
                        <th>Name</th>
                        <th>UTR / Transaction ID</th>
                        <th>Amount (₹)</th>
                        <th>Booths</th>
                        <th>Submitted</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {utrRows.map((r) => (
                        <tr key={String(r._id)}>
                          <td><strong>{r.mobile_no || '-'}</strong></td>
                          <td>{r.user_name || '-'}</td>
                          <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0071e3' }}>{r.utr}</span></td>
                          <td><strong style={{ color: '#16a34a' }}>₹{fmt(r.amount)}</strong></td>
                          <td>{r.booth_count || '-'}</td>
                          <td style={{ fontSize: 12, color: '#6e6e73' }}>{r.submitted_at ? new Date(r.submitted_at).toLocaleString('en-IN') : '-'}</td>
                          <td>
                            <span style={{
                              padding: '3px 10px', borderRadius: 980, fontSize: 11, fontWeight: 700,
                              background: r.status === 'approved' ? '#dcfce7' : r.status === 'rejected' ? '#fee2e2' : '#fef9c3',
                              color: r.status === 'approved' ? '#15803d' : r.status === 'rejected' ? '#b91c1c' : '#a16207',
                            }}>
                              {r.status === 'approved' ? '✓ Approved' : r.status === 'rejected' ? '✗ Rejected' : '⏳ Pending'}
                            </span>
                          </td>
                          <td>
                            {r.status === 'pending' ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  onClick={() => handleUtrAction(String(r._id), 'approve')}
                                  disabled={utrActionLoading === String(r._id)}
                                  style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 980, cursor: 'pointer' }}
                                >
                                  {utrActionLoading === String(r._id) ? '…' : '✓ Approve'}
                                </button>
                                <button
                                  onClick={() => handleUtrAction(String(r._id), 'reject')}
                                  disabled={utrActionLoading === String(r._id)}
                                  style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 980, cursor: 'pointer' }}
                                >
                                  ✗ Reject
                                </button>
                              </div>
                            ) : (
                              <span className="muted" style={{ fontSize: 12 }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!utrRows.length && (
                        <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 20 }}>No {utrFilter === 'all' ? '' : utrFilter} QR payment submissions found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab !== 'pending-qr' && <></> /* spacer — main subscriptions tab below */}

      {activeTab === 'subscriptions' && <div className="tiles">
        <div className="tile green"><div>Total Subscriptions</div><h3>{fmt(filtered.length)}</h3></div>
        <div className="tile blue"><div>Total Revenue (₹)</div><h3>₹{fmt(totalRevenue)}</h3></div>
      </div>}

      {activeTab === 'subscriptions' && <div className="card">
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

      </div>}
    </div>
  );
}
