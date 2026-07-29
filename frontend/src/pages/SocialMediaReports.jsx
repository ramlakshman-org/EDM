import { useEffect, useState } from 'react';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';

// Ward Social Media Reports — SMS / Voice Call / WhatsApp message history
// (tbl_sms_report via /messaging/reports).
const TABS = [
  { key: 'Text', label: 'SMS Report' },
  { key: 'Audio', label: 'Voice Call Report' },
  { key: 'WhatsApp', label: 'WhatsApp Report' },
];

export default function SocialMediaReports() {
  const [type, setType] = useState('Text');
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = (t) => {
    setErr(''); setLoading(true);
    api.get('/messaging/reports', { params: { type: t } })
      .then(({ data }) => setRows(data.rows || []))
      .catch((e) => { setErr(e.response?.data?.message || 'Unable to load reports.'); setRows([]); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(type); /* eslint-disable-next-line */ }, [type]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Social Media Reports</h1>
      
      {/* Report Type Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {TABS.map((t) => (
          <button key={t.key} className={type === t.key ? '' : 'secondary'} onClick={() => setType(t.key)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600 }}>
            {t.label}
          </button>
        ))}
      </div>

      {err && <div className="alert warn">{err}</div>}
      
      <div style={{ color: '#d9534f', fontWeight: 700, margin: '4px 0 12px', fontSize: 13, lineHeight: 1.4 }}>
        Note : The Report in this Area will only be Published if minimum 1,00,000 (SMS, Voice Call, Whatsapp) are sent
      </div>

      <div className="card">
        {/* Desktop Table View */}
        <div className="sm-reports-table-wrapper" style={{ overflowX: 'auto', width: '100%' }}>
          <table>
            <thead><tr><th>Type</th><th>Message</th><th>Sender / To</th><th>Numbers</th><th>Date</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5}><Spinner label="Loading reports…" /></td></tr> : (<>
                {rows.map((r) => (
                  <tr key={r._id}>
                    <td><span className="badge-info">{r.message_type || type}</span></td>
                    <td><strong>{r.message || '-'}</strong></td>
                    <td>{r.sender_id || r.to || '-'}</td>
                    <td><strong style={{ color: '#0071e3' }}>{r.total_number ?? '-'}</strong></td>
                    <td>{r.created_at || '-'}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 18 }}>No reports.</td></tr>}
              </>)}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="sm-reports-mobile-list">
          {loading && <Spinner label="Loading reports…" />}
          {!loading && rows.map((r, idx) => (
            <div key={r._id || idx} className="sm-report-card-item">
              <div className="sm-report-card-head">
                <span className="badge-info" style={{ fontWeight: 700, fontSize: 11.5 }}>
                  {r.message_type || type}
                </span>
                <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                  {r.created_at || '-'}
                </span>
              </div>

              {r.message && (
                <div style={{ fontSize: 13, color: '#1e293b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', marginTop: 2, lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {r.message}
                </div>
              )}

              <div className="sm-report-card-grid">
                <div className="sm-report-kv">
                  <span className="lbl">Sender / To</span>
                  <span className="val">{r.sender_id || r.to || '-'}</span>
                </div>
                <div className="sm-report-kv">
                  <span className="lbl">Total Numbers</span>
                  <span className="val" style={{ color: '#0071e3', fontWeight: 700 }}>{r.total_number ?? '-'}</span>
                </div>
              </div>
            </div>
          ))}
          {!loading && !rows.length && <div className="muted" style={{ textAlign: 'center', padding: 20 }}>No reports found.</div>}
        </div>
      </div>
    </div>
  );
}
