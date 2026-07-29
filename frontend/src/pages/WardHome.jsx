import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';
import PurchaseModal from '../components/PurchaseModal.jsx';
import VoterDetailModal from '../components/VoterDetailModal.jsx';
import Pagination from '../components/Pagination.jsx';
import { IconCall, IconMail, IconWhatsApp, IconView } from '../components/Icons.jsx';

import { useAuth } from '../context/AuthContext.jsx';

const digits = (s) => String(s || '').replace(/\D/g, '');

export default function WardHome() {
  const navigate = useNavigate();
  const { updateUserData } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showPay, setShowPay] = useState(false);
  const [detailVoter, setDetailVoter] = useState(null);

  // Sample data state
  const [sv, setSv] = useState({ rows: [], total: 0, page: 1, pageSize: 25, q: '' });
  const [sampleLoading, setSampleLoading] = useState(false);

  const loadHome = () => {
    setLoading(true);
    return api.get('/ward/home')
      .then(({ data }) => setData(data))
      .catch((e) => setErr(e.response?.data?.message || 'Failed to load ward dashboard.'))
      .finally(() => setLoading(false));
  };

  const loadSample = (page = 1) => {
    setSampleLoading(true);
    const params = new URLSearchParams({ page, pageSize: sv.pageSize, search: sv.q });
    api.get(`/ward/sample-voters?${params.toString()}`)
      .then(({ data }) => {
        if (data.success) {
          setSv((prev) => ({ ...prev, rows: data.rows || data.voters || [], total: data.total || 0, page }));
        }
      })
      .catch(() => {})
      .finally(() => setSampleLoading(false));
  };


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order_id') || params.get('razorpay_order_id');
    const plinkId = params.get('razorpay_payment_link_id');
    const isSuccess = params.get('payment') === 'success' || params.get('razorpay_payment_link_status') === 'paid';

    if (isSuccess || orderId || plinkId) {
      api.post('/payments/check-order-status', { order_id: orderId, payment_link_id: plinkId })
        .then(({ data: resData }) => {
          if (resData?.paid || resData?.success) {
            if (updateUserData) updateUserData({ paid_status: 'Yes' });
            window.dispatchEvent(new CustomEvent('payment-updated', { detail: { paid: true } }));
          }
          return loadHome();
        })
        .catch(() => loadHome())
        .finally(() => {
          window.history.replaceState({}, document.title, window.location.pathname);
        });
    } else {
      loadHome();
    }
  }, []);

  useEffect(() => {
    if (data?.isSample || data?.is_sample) {
      loadSample(1);
    }
  }, [data]);

  const handleSampleSearch = (e) => {
    e.preventDefault();
    loadSample(1);
  };

  if (loading) return <Spinner label="Loading ward home…" />;
  if (err) return <div className="alert err">{err}</div>;

  const user = data?.account || data?.user || {};
  const isSample = Boolean(data?.isSample ?? data?.is_sample);
  const assigned = data?.booths || data?.assigned_booths || [];
  const count = user.booth_count || assigned.length || (isSample ? 47 : 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Ward Dashboard</h1>
        {user.paid_status !== 'Yes' && isSample ? (
          <button
            className="primary"
            onClick={() => setShowPay(true)}
            style={{
              background: '#0071e3',
              borderRadius: 980,
              padding: '8px 20px',
              fontSize: 14,
              fontWeight: 700,
              boxShadow: '0 2px 8px rgba(0, 113, 227, 0.3)',
            }}
          >
            BUY
          </button>
        ) : null}
      </div>

      {isSample && (
        <div className="alert warn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <strong>Dataset:</strong> Demonstration records containing <strong>47 sample booths</strong> and <strong>705 total voters</strong>. Use the table below to preview search, filters, and voter contact actions.
          </div>
        </div>
      )}

      {/* Account Info Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0, marginBottom: 14 }}>Ward Account Details</h3>
        <div className="ass-detail-grid cols-3">
          <div className="ass-detail-kv">
            <span className="lbl">Candidate Name</span>
            <span className="val"><strong>{user.ward_login || user.first_name || 'Ward Login'}</strong></span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">Local Body Type</span>
            <span className="val" style={{ textTransform: 'capitalize' }}>{user.body_type || user.candidate_type || '-'}</span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">District</span>
            <span className="val">{user.district || user.district_id || '-'}</span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">Local Body</span>
            <span className="val">{user.local_body || user.category_name || '-'}</span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">Ward Number</span>
            <span className="val"><span className="badge-info">Ward {user.ward_number ?? user.ward_id ?? '-'}</span></span>
          </div>
          <div className="ass-detail-kv">
            <span className="lbl">Assigned Booths Count</span>
            <span className="val"><span className="badge-success">{count} Booths</span></span>
          </div>
        </div>
      </div>


      {/* Assigned Booths Section */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Assigned Booths</h3>
          <span className="badge-info">{assigned.length} Total Booths</span>
        </div>

        {/* Desktop Table View */}
        <div className="booth-table-wrapper" style={{ overflowX: 'auto', width: '100%' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 110 }}>Assembly No</th>
                <th>Assembly Name</th>
                <th style={{ width: 90 }}>Booth No</th>
                <th>Booth Name / Address</th>
                <th style={{ width: 120 }}>Total Voters</th>
                <th style={{ width: 90 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {assigned.map((b, i) => (
                <tr key={`${b.assembly_no}-${b.part_no}-${i}`}>
                  <td><span className="assembly-no-badge">#{b.assembly_no}</span></td>
                  <td>{b.assembly_name || `Assembly ${b.assembly_no}`}</td>
                  <td><span className="assembly-no-badge">#{b.part_no}</span></td>
                  <td><strong>{b.booth_name || `Booth ${b.part_no}`}</strong></td>
                  <td><strong style={{ color: '#0071e3' }}>{Number(b.voter_count || 0).toLocaleString('en-IN')}</strong></td>
                  <td>
                    <button
                      className="secondary"
                      onClick={() => navigate(`/voters?boothId=${b.part_no}&assemblyId=${b.assembly_no}`)}
                      style={{ padding: '4px 10px', fontSize: 12 }}
                    >
                      View Voters
                    </button>
                  </td>
                </tr>
              ))}
              {!assigned.length && (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                    {isSample ? 'Sample data mode active — no real booths assigned yet.' : 'No booths assigned to this ward account yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="booth-mobile-list">
          {assigned.map((b, i) => (
            <div key={`${b.assembly_no}-${b.part_no}-${i}`} className="booth-card-item">
              <div className="booth-card-head">
                <span className="assembly-no-badge">AC #{b.assembly_no}</span>
                <span className="badge-success" style={{ fontSize: 11, padding: '4px 10px' }}>
                  Booth #{b.part_no}
                </span>
              </div>
              <div className="booth-name-title">{b.booth_name || `Booth ${b.part_no}`}</div>
              <div className="booth-section-info">
                <span className="lbl">Assembly:</span> {b.assembly_name || `Assembly ${b.assembly_no}`}
              </div>
              <button
                className="secondary"
                onClick={() => navigate(`/voters?boothId=${b.part_no}&assemblyId=${b.assembly_no}`)}
                style={{ width: '100%', marginTop: 4, fontSize: 13 }}
              >
                View Voters →
              </button>
            </div>
          ))}
          {!assigned.length && (
            <div className="muted" style={{ textAlign: 'center', padding: 20 }}>
              {isSample ? 'Sample data mode active — no real booths assigned yet.' : 'No booths assigned to this ward account yet.'}
            </div>
          )}
        </div>
      </div>

      {/* Sample Data Preview Table (Only shown in Sample Mode) */}
      {isSample && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ margin: 0 }}>Sample Voters Database (Combined List)</h3>
          </div>

          <form onSubmit={handleSampleSearch} className="row" style={{ gap: 10, marginBottom: 16, alignItems: 'flex-end' }}>
            <div style={{ flex: 1, maxWidth: 360 }}>
              <label>Search</label>
              <input
                type="text"
                placeholder="EPIC / name / mobile..."
                value={sv.q}
                onChange={(e) => setSv({ ...sv, q: e.target.value })}
              />
            </div>
            <button type="submit" disabled={sampleLoading}>
              {sampleLoading ? 'Searching…' : 'Search'}
            </button>
          </form>

          <div style={{ fontSize: 13, color: '#666', marginBottom: 12, fontWeight: 600 }}>
            Count: {sv.total.toLocaleString('en-IN')} voters
          </div>

          {/* Desktop Table View */}
          <div className="sample-voter-table-wrapper" style={{ overflowX: 'auto', width: '100%' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 100 }}>EPIC No</th>
                  <th style={{ width: 70 }}>Part</th>
                  <th style={{ width: 70 }}>SL No</th>
                  <th>Voter Name</th>
                  <th>Relation Name</th>
                  <th style={{ width: 60 }}>Age</th>
                  <th style={{ width: 70 }}>Gender</th>
                  <th>Mobile Number</th>
                  <th style={{ width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sv.rows.map((v) => {
                  const mob = String(v.MOBILE_NUMBER || '').replace(/\D/g, '');
                  const hasMob = mob.length >= 10;
                  const d = digits(mob);
                  return (
                    <tr key={v._id}>
                      <td><span className="assembly-no-badge">{v.EPIC_NO}</span></td>
                      <td>#{v.PART_NO || 1}</td>
                      <td>#{v.SLNO || 1}</td>
                      <td><strong>{v.VOTER_NAME_EN}</strong></td>
                      <td>{v.RELATION_NAME_EN} ({v.RELATION_TYPE || 'S/o'})</td>
                      <td>{v.AGE}</td>
                      <td>{v.GENDER}</td>
                      <td>{v.MOBILE_NUMBER || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {hasMob && (
                            <>
                              <a className="act-btn" title="Call" href={`tel:+${d}`}><IconCall size={16} color="#0071e3" /></a>
                              <a className="act-btn" title="SMS" href={`sms:+${d}`}><IconMail size={16} color="#0071e3" /></a>
                              <a className="act-btn wa-btn" title="WhatsApp" target="_blank" rel="noreferrer" href={`https://wa.me/${d}`}><IconWhatsApp size={17} color="#25D366" /></a>
                            </>
                          )}
                          <button className="act-btn" title="View Details" onClick={() => setDetailVoter(v)} style={{ background: 'none', border: 'none', padding: 0 }}>
                            <IconView size={16} color="#0071e3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!sv.rows.length && <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 16 }}>No records found.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="sample-voter-mobile-list">
            {sv.rows.map((v) => {
              const mob = String(v.MOBILE_NUMBER || '').replace(/\D/g, '');
              const hasMob = mob.length >= 10;
              const d = digits(mob);
              return (
                <div key={v._id} className="voter-card-item">
                  <div className="voter-card-top">
                    <div className="voter-epic-badge" onClick={() => setDetailVoter(v)}>
                      {v.EPIC_NO}
                    </div>
                    <div className="voter-part-slno">
                      Part #{v.PART_NO || 1} · SL #{v.SLNO || 1}
                    </div>
                  </div>

                  <div className="voter-card-main" onClick={() => setDetailVoter(v)}>
                    <div className="voter-name">{v.VOTER_NAME_EN}</div>
                    {v.RELATION_NAME_EN && (
                      <div className="voter-sub-info">R/O: {v.RELATION_NAME_EN} ({v.RELATION_TYPE || 'S/o'})</div>
                    )}
                    <div className="voter-meta-tags">
                      <span className="voter-tag">{v.AGE} yrs</span>
                      <span className="voter-tag">{v.GENDER}</span>
                      {hasMob ? (
                        <span className="voter-tag mob">{v.MOBILE_NUMBER}</span>
                      ) : (
                        <span className="voter-tag no-mob">No Mobile</span>
                      )}
                    </div>
                  </div>

                  <div className="voter-card-actions">
                    {hasMob ? (
                      <>
                        <a className="voter-act-btn call" title="Call" href={`tel:+${d}`}>
                          <IconCall size={16} color="#0071e3" /> Call
                        </a>
                        <a className="voter-act-btn sms" title="SMS" href={`sms:+${d}`}>
                          <IconMail size={16} color="#0071e3" /> SMS
                        </a>
                        <a className="voter-act-btn wa" title="WhatsApp" target="_blank" rel="noreferrer" href={`https://wa.me/${d}`}>
                          <IconWhatsApp size={17} color="#25D366" /> WA
                        </a>
                      </>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>No Mobile</span>
                    )}
                    <button className="voter-act-btn view" onClick={() => setDetailVoter(v)}>
                      <IconView size={16} color="#0071e3" /> View
                    </button>
                  </div>
                </div>
              );
            })}
            {!sv.rows.length && <div className="muted" style={{ textAlign: 'center', padding: 20 }}>No records found.</div>}
          </div>

          <Pagination page={sv.page} total={sv.total} pageSize={sv.pageSize} onPage={loadSample} />
        </div>
      )}

      {/* Purchase Modal */}
      <PurchaseModal
        open={showPay}
        onClose={() => setShowPay(false)}
        user={user}
        accountInfo={data}
        boothCount={count}
        isSample={isSample}
      />

      {/* Voter Detail Modal */}
      {detailVoter && (
        <VoterDetailModal voter={detailVoter} onClose={() => setDetailVoter(null)} />
      )}
    </div>
  );
}
