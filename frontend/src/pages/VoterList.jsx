import { useEffect, useState } from 'react';
import VoterDetailModal from '../components/VoterDetailModal.jsx';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import Spinner from '../components/Spinner.jsx';
import Pagination from '../components/Pagination.jsx';
import { IconCall, IconMail, IconWhatsApp, IconView } from '../components/Icons.jsx';

// Roles that may pick any assembly (mirrors VoterController: 1 SuperAdmin, 2 MP, 7 Telecaller, 10 DSA).
const CHOOSE_ROLES = [1, 2, 7, 10];

// Normalise a mobile to a 91-prefixed digit string for tel/sms/whatsapp links.
const digits = (m) => {
  let d = String(m || '').replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  return d;
};

export default function VoterList() {
  const { user } = useAuth();
  const groupId = Number(user?.group_id || 1);
  const canChoose = CHOOSE_ROLES.includes(groupId);
  const lockedAssembly = canChoose ? '' : String(user?.assembly_id ?? '');
  const isBooth = groupId === 4 || groupId === 11;
  const isWard = groupId === 6;
  const lockedBooth = isBooth ? String(user?.booth_id ?? '') : '';

  const [assemblies, setAssemblies] = useState([]);
  const [f, setF] = useState({
    assemblyId: lockedAssembly, gender: '', min_age: '', max_age: '',
    boothId: lockedBooth, has_mobile: '', search_text: '',
  });
  const [data, setData] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null);
  const [wardSampleMode, setWardSampleMode] = useState(null);

  useEffect(() => {
    // 1. Fetch assemblies list
    api.get('/assemblies').then(({ data }) => {
      const list = data.assemblies || [];
      setAssemblies(list);
      if (canChoose && !f.assemblyId && list.length) {
        const first = String(list[0].assembly_no);
        setF((s) => ({ ...s, assemblyId: first }));
        load(1, first);
      }
    }).catch(() => {});

    // 2. Check Ward mode & auto-load
    if (isWard) {
      api.get('/ward/home')
        .then(({ data }) => {
          if (data.isSample) {
            setWardSampleMode(true);
            setLoading(false);
          } else {
            setWardSampleMode(false);
            load(1);
          }
        })
        .catch(() => {
          setWardSampleMode(false);
          load(1);
        });
    } else if (!canChoose) {
      load(1);
    }
    // eslint-disable-next-line
  }, []);

  const assemblyName = assemblies.find((a) => String(a.assembly_no) === String(f.assemblyId))?.assembly_name;

  const userBoothsList = (data?.scope?.userBooths || user?.booths || []).map((b) => (typeof b === 'object' && b !== null ? parseInt(b.part_no, 10) : parseInt(b, 10))).filter((n) => !Number.isNaN(n));
  const uniqueBooths = [...new Set(userBoothsList)].sort((a, b) => a - b);

  const scopeLabel = isBooth
    ? (uniqueBooths.length > 0 ? `Selected Booths: ${uniqueBooths.join(', ')}` : (lockedBooth ? `Booth ${lockedBooth}` : 'Your assigned booths'))
    : isWard
    ? 'Your ward booths'
    : 'Your assembly';

  const load = async (page = 1, assemblyOverride, boothOverride) => {
    const assemblyId = assemblyOverride ?? f.assemblyId;
    const boothId = boothOverride ?? f.boothId;
    if (canChoose && !assemblyId) { setErr('Please select an assembly.'); return; }
    setErr(''); setLoading(true);
    try {
      const { data } = await api.get('/voters', { params: { ...f, assemblyId, boothId, page, pageSize: 25 } });
      setData(data);
      if (data.scope?.assemblyId && !f.assemblyId) {
        setF((s) => ({ ...s, assemblyId: String(data.scope.assemblyId) }));
      }
    } catch (e) {
      setErr(e.response?.data?.message || 'Unable to load voter data.');
      setData({ rows: [], total: 0, page: 1, pageSize: 25 });
    } finally { setLoading(false); }
  };

  const openDetail = async (row) => {
    setDetail(row);
    try {
      const { data } = await api.get('/voters/detail', { params: { assemblyId: f.assemblyId, id: row._id } });
      if (data.success) setDetail(data.voter);
    } catch { /* keep row data */ }
  };

  if (isWard && wardSampleMode === true) {
    return (
      <div>
        <div className="alert warn" style={{ background: '#fff8e6', border: '1px solid #ffe58f', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 8px', color: '#d48806', fontSize: 16 }}>⚠️ Preview &amp; Demonstration Mode</h3>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: '#595959' }}>
            Your ward account is currently in <b>Preview &amp; Demonstration Mode</b> because polling booths have not been assigned by your system administrator yet. Official constituency voter list access will unlock automatically once your polling booths are assigned.
          </p>
          <div>
            <a href="/ward/dashboard#sample" className="button" style={{ display: 'inline-block', padding: '9px 18px', background: '#2b90d9', color: '#fff', borderRadius: 6, textDecoration: 'none', fontWeight: 600 }}>
              View Sample Data List →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Voters List</h1>
      {!canChoose && (
        <div className="alert warn">
          Scoped to {f.assemblyId ? <strong>{assemblyName ? `${f.assemblyId} - ${assemblyName}` : `Assembly ${f.assemblyId}`}</strong> : <strong>Your assigned booths</strong>} · {scopeLabel}.
        </div>
      )}
      <div className="card">
        <div className="voter-filter-grid">
          {canChoose ? (
            <div className="filter-group fg-assembly">
              <label>Assembly</label>
              <select value={f.assemblyId} onChange={(e) => setF({ ...f, assemblyId: e.target.value })}>
                <option value="">Select Assembly</option>
                {assemblies.map((a) => <option key={a.assembly_no} value={a.assembly_no}>{a.assembly_no} - {a.assembly_name}</option>)}
              </select>
            </div>
          ) : (
            <div className="filter-group fg-assembly">
              <label>Assembly</label>
              <input value={f.assemblyId ? (assemblyName ? `${f.assemblyId} - ${assemblyName}` : f.assemblyId) : 'Assigned Ward Booths'} disabled readOnly style={{ background: '#eef1f6' }} />
            </div>
          )}

          <div className="filter-group fg-gender">
            <label>Gender</label>
            <select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
              <option value="">All</option><option>Male</option><option>Female</option>
            </select>
          </div>

          <div className="filter-group fg-mobile">
            <label>Mobile only</label>
            <select value={f.has_mobile} onChange={(e) => setF({ ...f, has_mobile: e.target.value })}>
              <option value="">All</option><option value="1">With mobile</option>
            </select>
          </div>

          {!isWard && (
            <div className="filter-group fg-booth">
              <label>Booth (Part)</label>
              {isBooth && uniqueBooths.length > 0 ? (
                <select
                  value={f.boothId}
                  onChange={(e) => {
                    const newBooth = e.target.value;
                    setF((s) => ({ ...s, boothId: newBooth }));
                    load(1, f.assemblyId, newBooth);
                  }}
                >
                  <option value="">All Selected Booths ({uniqueBooths.length})</option>
                  {uniqueBooths.map((p) => (
                    <option key={p} value={p}>Booth {p}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={f.boothId}
                  readOnly={isBooth && uniqueBooths.length <= 1}
                  disabled={isBooth && uniqueBooths.length <= 1}
                  style={isBooth && uniqueBooths.length <= 1 ? { background: '#eef1f6' } : {}}
                  placeholder="Part No"
                  onChange={(e) => setF({ ...f, boothId: e.target.value })}
                />
              )}
            </div>
          )}

          <div className="filter-group fg-age-min">
            <label>Min Age</label>
            <input type="number" placeholder="18" value={f.min_age} onChange={(e) => setF({ ...f, min_age: e.target.value })} />
          </div>

          <div className="filter-group fg-age-max">
            <label>Max Age</label>
            <input type="number" placeholder="100" value={f.max_age} onChange={(e) => setF({ ...f, max_age: e.target.value })} />
          </div>

          <div className="filter-group fg-search">
            <label>Search (EPIC / mobile / name)</label>
            <input placeholder="EPIC, mobile or name..." value={f.search_text} onChange={(e) => setF({ ...f, search_text: e.target.value })} />
          </div>

          <div className="filter-group fg-btn">
            <button className="filter-submit-btn" onClick={() => load(1)} disabled={loading}>
              {loading ? 'Loading…' : 'Filter'}
            </button>
          </div>
        </div>
        {err && <div className="alert err" style={{ marginTop: 12 }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 10px' }}>
          <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>Count: {data.total.toLocaleString('en-IN')} voters</span>
        </div>

        {/* Desktop Table View */}
        <div className="voter-table-wrapper" style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr>
              <th>EPIC</th><th>Part No</th><th>SLNO</th><th>Elector Name</th><th>Relation Name</th><th>Mobile</th><th>Age</th><th>Gender</th>
              <th style={{ textAlign: 'center' }}>Call</th><th style={{ textAlign: 'center' }}>SMS</th><th style={{ textAlign: 'center' }}>WA</th><th style={{ textAlign: 'center' }}>View</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={12}><Spinner label="Loading voters…" /></td></tr>}
              {!loading && data.rows.map((v) => {
                const d = digits(v.MOBILE_NUMBER);
                const hasMob = d.length >= 10;
                return (
                  <tr key={v._id}>
                    <td style={{ color: '#2f7bd6', fontWeight: 600 }}>{v.EPIC_NO}</td>
                    <td>{v.PART_NO}</td>
                    <td>{v.SLNO ?? v.ID ?? '-'}</td>
                    <td>{v.VOTER_NAME_EN}</td>
                    <td>{v.RELATION_NAME_EN}</td>
                    <td>{v.MOBILE_NUMBER || '-'}</td>
                    <td>{v.AGE}</td>
                    <td>{v.GENDER}</td>
                    <td className="act-cell">{hasMob ? <a className="act-btn" title="Call" href={`tel:+${d}`}><IconCall size={20} color="#d85028" /></a> : <span className="muted">—</span>}</td>
                    <td className="act-cell">{hasMob ? <a className="act-btn" title="SMS" href={`sms:+${d}`}><IconMail size={20} color="#d85028" /></a> : <span className="muted">—</span>}</td>
                    <td className="act-cell">{hasMob ? <a className="act-btn wa-btn" title="WhatsApp" target="_blank" rel="noreferrer" href={`https://wa.me/${d}`}><IconWhatsApp size={22} /></a> : <span className="muted">—</span>}</td>
                    <td className="act-cell"><button className="act-btn" title="View Details" onClick={() => openDetail(v)} style={{ background: 'none', border: 'none', padding: 0 }}><IconView size={20} color="#d85028" /></button></td>
                  </tr>
                );
              })}
              {!loading && !data.rows.length && <tr><td colSpan={12} className="muted" style={{ textAlign: 'center', padding: 18 }}>No voters loaded.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Mobile Voter Cards View */}
        <div className="voter-mobile-list">
          {loading && <Spinner label="Loading voters…" />}
          {!loading && data.rows.map((v) => {
            const d = digits(v.MOBILE_NUMBER);
            const hasMob = d.length >= 10;
            return (
              <div key={v._id} className="voter-card-item">
                <div className="voter-card-top">
                  <div className="voter-epic-badge" onClick={() => openDetail(v)}>
                    {v.EPIC_NO}
                  </div>
                  <div className="voter-part-slno">
                    Part #{v.PART_NO} · SL #{v.SLNO ?? v.ID ?? '-'}
                  </div>
                </div>

                <div className="voter-card-main" onClick={() => openDetail(v)}>
                  <div className="voter-name">{v.VOTER_NAME_EN}</div>
                  {v.RELATION_NAME_EN && (
                    <div className="voter-sub-info">R/O: {v.RELATION_NAME_EN}</div>
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
                    <span className="muted" style={{ fontSize: 12 }}>No mobile</span>
                  )}
                  <button className="voter-act-btn view" onClick={() => openDetail(v)}>
                    <IconView size={16} color="#0071e3" /> View
                  </button>
                </div>
              </div>
            );
          })}
          {!loading && !data.rows.length && <div className="muted" style={{ textAlign: 'center', padding: 24 }}>No voters loaded.</div>}
        </div>

        <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={load} />
      </div>

      {detail && <VoterDetailModal voter={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
