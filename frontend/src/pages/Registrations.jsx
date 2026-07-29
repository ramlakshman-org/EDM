import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';
import Pagination from '../components/Pagination.jsx';
import { IconCall, IconMail, IconWhatsApp, IconAudio, IconView, IconEdit } from '../components/Icons.jsx';

// Mirrors the admin Registrations page (tbl_enquiry) — candidate sign-ups with
// district / position / body-type filters, generated passcode, social-media
// broadcast request icons, and per-row actions (view / edit / call / whatsapp).
const wa = (m) => { const d = String(m || '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };

// Compact icon for a requested social service (matches the detail page colours).
function ReqIcon({ type }) {
  if (type === 'sms') {
    return (
      <span title="SMS request" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: '#fef2f0', border: '1px solid #ffccbc', margin: '0 2px' }}>
        <IconMail size={15} color="#d85028" />
      </span>
    );
  }
  if (type === 'voice') {
    return (
      <span title="Audio SMS request" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: '#fdeded', border: '1px solid #fca5a5', margin: '0 2px' }}>
        <IconAudio size={15} color="#e53935" />
      </span>
    );
  }
  if (type === 'whatsapp') {
    return (
      <span title="WhatsApp request" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: '#eefbf3', border: '1px solid #a7f3d0', margin: '0 2px' }}>
        <IconWhatsApp size={17} color="#25D366" />
      </span>
    );
  }
  return null;
}

export default function Registrations() {
  const navigate = useNavigate();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, pageSize: 20 });
  const [f, setF] = useState({ search: '', district: '', position: '', body_type: '' });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = async (page = 1) => {
    setErr(''); setLoading(true);
    try {
      const { data } = await api.get('/registrations', { params: { ...f, page, pageSize: 20 } });
      setData(data);
    } catch (e) { setErr(e.response?.data?.message || 'Unable to load registrations.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(1); /* eslint-disable-next-line */ }, []);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Registrations</h1>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 140 }}><label>Search</label><input value={f.search} onChange={set('search')} placeholder="name / mobile" /></div>
          <div style={{ flex: 1, minWidth: 120 }}><label>District</label><input value={f.district} onChange={set('district')} placeholder="District" /></div>
          <div style={{ flex: 1, minWidth: 150 }}><label>Position</label>
            <select value={f.position} onChange={set('position')}>
              <option value="">All</option><option>Corporation</option><option>Municipality</option><option>Town Panchayat</option>
              <option>Village Panchayat Ward Member</option><option>Village Panchayat President</option>
              <option>Panchayat Union Ward Member</option><option>District Panchayat Ward Member</option>
            </select></div>
          <div style={{ flex: 1, minWidth: 120 }}><label>Body Type</label>
            <select value={f.body_type} onChange={set('body_type')}><option value="">All</option><option value="urban">Urban</option><option value="rural">Rural</option></select>
          </div>
          <button onClick={() => load(1)} disabled={loading} style={{ height: 42 }}>{loading ? 'Loading…' : 'Filter'}</button>
        </div>

        {err && <div className="alert err">{err}</div>}
        <div className="muted" style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Count: {data.total.toLocaleString('en-IN')}</div>

        {/* Desktop Table View */}
        <div className="reg-table-wrapper" style={{ overflowX: 'auto', width: '100%' }}>
          <table>
            <thead><tr>
              <th style={{ whiteSpace: 'nowrap' }}>Name</th>
              <th style={{ whiteSpace: 'nowrap' }}>Mobile</th>
              <th style={{ whiteSpace: 'nowrap' }}>District</th>
              <th style={{ whiteSpace: 'nowrap' }}>Assembly</th>
              <th style={{ whiteSpace: 'nowrap' }}>Position</th>
              <th style={{ whiteSpace: 'nowrap' }}>Booths / Ward</th>
              <th style={{ whiteSpace: 'nowrap' }}>Passcode</th>
              <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>Requests</th>
              <th style={{ whiteSpace: 'nowrap' }}>Registered</th>
              <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>Action</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10}><Spinner label="Loading registrations…" /></td></tr>}
              {!loading && data.rows.map((r) => {
                const id = r._id || r.id;
                const boothCount = Array.isArray(r.booths) && r.booths.length > 0 ? r.booths.length : (Array.isArray(r.selected_booths) ? r.selected_booths.length : (r.booth_count || 0));
                const assText = r.assembly_name || r.assembly ? `${r.assembly_id ? `[No.${r.assembly_id}] ` : ''}${r.assembly_name || r.assembly}` : (r.assembly_id ? `Assembly ${r.assembly_id}` : '-');
                return (
                  <tr key={id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                        <button className="linklike" onClick={() => navigate(`/registrations/view/${id}`)} style={{ whiteSpace: 'nowrap' }}>
                          {r.full_name}
                        </button>
                        {r.paid_status === 'Yes' && (
                          <span title="PRO Member" style={{ fontSize: 15, cursor: 'pointer', lineHeight: 1 }}>👑</span>
                        )}
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.mobile}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.district}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{assText}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.position || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {boothCount > 0 ? (
                        <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 12 }}>
                          {boothCount} Booths
                        </span>
                      ) : (
                        r.ward_number || '-'
                      )}
                    </td>
                    <td>{r.passcode && r.passcode !== '-' ? <code style={{ background: '#e8f5e9', color: '#2e7d32', fontWeight: 700 }}>{r.passcode}</code> : <span className="muted">—</span>}</td>
                    <td style={{ textAlign: 'center' }}>
                      {r.requests?.length
                        ? <span className="req-icons">{r.requests.map((t, i) => <ReqIcon key={i} type={t} />)}</span>
                        : <span className="muted">None</span>}
                    </td>
                    <td>{r.created_at}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} className="act-cell">
                      {r.mobile && r.mobile !== '-' && (
                        <>
                          <a className="act-btn" title="Call" href={`tel:+91${String(r.mobile).replace(/\D/g, '')}`}><IconCall size={18} color="#d85028" /></a>
                          <a className="act-btn wa-btn" title="WhatsApp" target="_blank" rel="noreferrer" href={`https://api.whatsapp.com/send?phone=${wa(r.mobile)}`}><IconWhatsApp size={18} color="#25D366" /></a>
                        </>
                      )}
                      <button className="act-btn" title="View" onClick={() => navigate(`/registrations/view/${id}`)} style={{ background: 'none', border: 'none', padding: 0 }}><IconView size={18} color="#d85028" /></button>
                      <button className="act-btn" title="Edit" onClick={() => navigate(`/registrations/edit/${id}`)} style={{ background: 'none', border: 'none', padding: 0 }}><IconEdit size={18} color="#d85028" /></button>
                    </td>
                  </tr>
                );
              })}
              {!loading && !data.rows.length && <tr><td colSpan={11} className="muted" style={{ textAlign: 'center', padding: 18 }}>No registrations.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards / List View */}
        <div className="reg-mobile-list">
          {loading && <Spinner label="Loading registrations…" />}
          {!loading && data.rows.map((r) => {
            const id = r._id || r.id;
            const mob = String(r.mobile || '').replace(/\D/g, '');
            return (
              <div key={id} className="reg-list-item" onClick={() => navigate(`/registrations/view/${id}`)}>
                <div className="reg-list-info">
                  <div className="reg-list-name-row" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                    <strong style={{ whiteSpace: 'nowrap' }}>{r.full_name}</strong>
                    {r.paid_status === 'Yes' && (
                      <span title="PRO Member" style={{ fontSize: 15, lineHeight: 1 }}>👑</span>
                    )}
                    {r.passcode && r.passcode !== '-' && (
                      <code style={{ background: '#e8f5e9', color: '#2e7d32', fontWeight: 700, padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>
                        {r.passcode}
                      </code>
                    )}
                  </div>
                  <div className="reg-list-meta">
                    <span>{r.mobile || '-'}</span>
                    {r.district && <span> · {r.district}</span>}
                  </div>
                </div>

                <div className="reg-list-actions" onClick={(e) => e.stopPropagation()}>
                  {mob && mob !== '-' && (
                    <>
                      <a className="reg-icon-btn call" title="Call" href={`tel:+91${mob}`}>
                        <IconCall size={18} color="#0071e3" />
                      </a>
                      <a className="reg-icon-btn wa" title="WhatsApp" target="_blank" rel="noreferrer" href={`https://api.whatsapp.com/send?phone=${wa(r.mobile)}`}>
                        <IconWhatsApp size={19} color="#25D366" />
                      </a>
                    </>
                  )}
                  <button className="reg-icon-btn view" title="View Details" onClick={() => navigate(`/registrations/view/${id}`)}>
                    <IconView size={18} color="#0071e3" />
                  </button>
                </div>
              </div>
            );
          })}
          {!loading && !data.rows.length && <div className="muted" style={{ textAlign: 'center', padding: 24 }}>No registrations found.</div>}
        </div>


        {/* Pagination Component */}
        <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={load} />

      </div>
    </div>
  );
}
