import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import Spinner from '../components/Spinner.jsx';

// Opens a role-scoped Assembly_Reports HTML deliverable (Candidate Briefing /
// Field Operations) — mirrors ReportController@candidateBriefing / fieldOperations.
export default function HtmlReport({ docKey, title }) {
  const { user } = useAuth();
  const isAdmin = Number(user?.group_id || 1) === 1;
  const [assemblies, setAssemblies] = useState([]);
  const [assemblyId, setAssemblyId] = useState('');
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async (id) => {
    setErr(''); setDoc(null); setLoading(true);
    try {
      const params = isAdmin && id ? { assemblyId: id } : {};
      const { data } = await api.get('/reports/documents', { params });
      const found = (data.documents || []).find((d) => d.key === docKey);
      if (!found) setErr('Report not available for this assembly.');
      else if (!found.exists) setErr('This report has not been generated for this assembly.');
      else setDoc(found);
    } catch (e) { setErr(e.response?.data?.message || 'Unable to load report.'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (isAdmin) api.get('/assemblies').then(({ data }) => setAssemblies(data.assemblies || [])).catch(() => {});
    else load();
    // eslint-disable-next-line
  }, [docKey]);

  return (
    <div className="html-report-wrapper" style={{
      height: 'calc(100vh - 48px)',
      display: 'flex',
      flexDirection: 'column',
      background: '#fff',
      overflow: 'hidden'
    }}>
      {isAdmin && (
        <div style={{ padding: '8px 16px', background: '#f5f5f7', borderBottom: '1px solid #e3e7ef', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ margin: 0, fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>Select Assembly:</label>
          <select value={assemblyId} onChange={(e) => { setAssemblyId(e.target.value); load(e.target.value); }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', flex: 1, minWidth: 180 }}>
            <option value="">Select Assembly</option>
            {assemblies.map((a) => <option key={a.assembly_no} value={a.assembly_no}>{a.assembly_no} - {a.assembly_name}</option>)}
          </select>
        </div>
      )}
      {loading && <div style={{ padding: 20 }}><Spinner label="Loading report…" /></div>}
      {err && <div style={{ padding: 20 }}><div className="alert warn">{err}</div></div>}
      {doc && (
        <iframe title={title} src={doc.url} style={{ width: '100%', height: '100%', flex: 1, border: 'none', display: 'block' }} />
      )}
    </div>
  );
}
