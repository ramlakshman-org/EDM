import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import Spinner from '../components/Spinner.jsx';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
const boothUrl = (no, part) => '/report-files/' + [`Booth_Reports`, `ASS ${no} Booth Reports`, `Booth_${part}_Report.html`].map(encodeURIComponent).join('/');

// Booth Report — scoped to the login's assembly. Per-booth gender breakdown +
// in-page viewer for each booth's HTML report.
export default function BoothReport() {
  const { user } = useAuth();
  const isAdmin = Number(user?.group_id || 1) === 1;

  const [assemblies, setAssemblies] = useState([]);
  const [assemblyId, setAssemblyId] = useState('');
  const [data, setData] = useState(null);
  const [htmlBooths, setHtmlBooths] = useState(new Set());
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // In-page HTML report viewer state
  const [activeReport, setActiveReport] = useState(null);

  const load = async (id) => {
    setErr(''); setLoading(true); setData(null); setActiveReport(null);
    try {
      const params = isAdmin && id ? { assemblyId: id } : {};
      const { data } = await api.get('/reports/booth', { params });
      setData(data);
      try {
        const { data: bl } = await api.get('/reports/booth-report-list', { params });
        setHtmlBooths(new Set((bl.booths || []).map(Number)));
      } catch { setHtmlBooths(new Set()); }
    } catch (e) { setErr(e.response?.data?.message || 'Unable to load booth report.'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (isAdmin) api.get('/assemblies').then(({ data }) => setAssemblies(data.assemblies || [])).catch(() => {});
    else load();
    // eslint-disable-next-line
  }, []);

  const openInlineReport = (partNo, boothName) => {
    if (!data) return;
    const url = boothUrl(data.assembly_no, partNo);
    setActiveReport({
      url,
      partNo,
      boothName,
      assemblyNo: data.assembly_no,
      assemblyName: data.assembly_name,
    });
  };

  if (activeReport) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <button className="secondary" onClick={() => setActiveReport(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            ← <span className="btn-text-desktop">Back to Booth List</span>
          </button>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
            Booth {activeReport.partNo} Report — {activeReport.boothName}
          </h2>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #cbd5e1', overflow: 'hidden', height: 'calc(100vh - 160px)', minHeight: 600 }}>
          <iframe
            src={activeReport.url}
            title={`Booth ${activeReport.partNo} Report`}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Booth Report</h1>
      {isAdmin && (
        <div className="card">
          <div className="row">
            <div><label>Assembly</label>
              <select value={assemblyId} onChange={(e) => { setAssemblyId(e.target.value); load(e.target.value); }}>
                <option value="">Select Assembly</option>
                {assemblies.map((a) => <option key={a.assembly_no} value={a.assembly_no}>{a.assembly_no} - {a.assembly_name}</option>)}
              </select></div>
          </div>
        </div>
      )}
      {loading && <Spinner label="Loading report…" />}
      {err && <div className="alert warn">{err}</div>}

      {data && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>{data.assembly_no} — {data.assembly_name} · {data.district}</p>
          <div className="tiles">
            <div className="tile green"><div>Total</div><h3>{fmt(data.totals.total)}</h3></div>
            <div className="tile orange"><div>Male</div><h3>{fmt(data.totals.male)}</h3></div>
            <div className="tile blue"><div>Female</div><h3>{fmt(data.totals.female)}</h3></div>
            <div className="tile red"><div>Other</div><h3>{fmt(data.totals.other)}</h3></div>
          </div>

          <div className="card">
            {/* Desktop Table View */}
            <div className="booth-report-table-wrapper" style={{ overflowX: 'auto', width: '100%' }}>
              <table>
                <thead><tr><th>Booth</th><th>Name</th><th>Total</th><th>Male</th><th>Female</th><th>Other</th><th>Report</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.part_no}>
                      <td><span className="assembly-no-badge">#{r.part_no}</span></td>
                      <td><strong>{r.booth_name}</strong></td>
                      <td>{fmt(r.total)}</td>
                      <td>{fmt(r.male)}</td>
                      <td>{fmt(r.female)}</td>
                      <td>{fmt(r.other)}</td>
                      <td>
                        {htmlBooths.has(Number(r.part_no)) ? (
                          <button className="secondary" onClick={() => openInlineReport(r.part_no, r.booth_name)}>
                            Open
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!data.rows.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 18 }}>No booth data.</td></tr>}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="booth-report-mobile-list">
              {data.rows.map((r) => (
                <div key={r.part_no} className="booth-report-card">
                  <div className="booth-report-card-head">
                    <span className="assembly-no-badge" style={{ background: '#0071e3', color: '#ffffff', padding: '4px 10px', fontSize: 12 }}>
                      Booth #{r.part_no}
                    </span>
                    {htmlBooths.has(Number(r.part_no)) ? (
                      <button className="secondary" onClick={() => openInlineReport(r.part_no, r.booth_name)} style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>
                        Open Report
                      </button>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>No Report</span>
                    )}
                  </div>

                  <div className="booth-report-card-name">
                    {r.booth_name}
                  </div>

                  <div className="booth-report-stats-grid">
                    <div className="stat-box">
                      <span className="stat-lbl">Total</span>
                      <span className="stat-val total">{fmt(r.total)}</span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-lbl">Male</span>
                      <span className="stat-val male">{fmt(r.male)}</span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-lbl">Female</span>
                      <span className="stat-val female">{fmt(r.female)}</span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-lbl">Other</span>
                      <span className="stat-val other">{fmt(r.other)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {!data.rows.length && <div className="muted" style={{ textAlign: 'center', padding: 18 }}>No booth data found.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
