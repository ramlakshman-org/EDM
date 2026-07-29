import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const STATUS_LABELS = {
  interested: 'Interested',
  not_interested: 'Not Interested',
  call_completed: 'Call Complete',
  first_call_complete: '1st Call Done',
  second_call_complete: '2nd Call Done',
  third_call_complete: '3rd Call Done',
  switch_off: 'Switch Off',
  not_answered: 'Not Answered',
  will_call_back: 'Will Call Back',
  none: '-',
};

const STATUS_COLORS = {
  interested: '#16a34a',
  not_interested: '#dc2626',
  call_completed: '#2563eb',
  switch_off: '#d97706',
  not_answered: '#64748b',
  will_call_back: '#0284c7',
  none: '#94a3b8',
};

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// Compute [from,to] ISO strings for a named period
function rangeFor(period, customFrom, customTo) {
  const now = new Date();
  const end = customTo ? new Date(customTo + 'T23:59:59') : now;
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today') return [startToday.toISOString(), now.toISOString()];
  if (period === 'week') { const d = new Date(startToday); d.setDate(d.getDate() - 6); return [d.toISOString(), now.toISOString()]; }
  if (period === 'month') { const d = new Date(startToday); d.setDate(d.getDate() - 29); return [d.toISOString(), now.toISOString()]; }
  if (period === 'range') return [customFrom ? new Date(customFrom + 'T00:00:00').toISOString() : undefined, end.toISOString()];
  return [undefined, undefined];
}

export default function TeamReports() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const [from, to] = rangeFor(period, customFrom, customTo);
    api.get('/crm/team-report', { params: { from, to } })
      .then(({ data }) => { if (data.success) setRows(data.rows || []); })
      .catch((e) => console.error('team-report', e))
      .finally(() => setLoading(false));
  }, [period, customFrom, customTo]);

  useEffect(() => {
    // For custom range, only load when both dates chosen
    if (period === 'range' && (!customFrom || !customTo)) { setLoading(false); return; }
    load();
  }, [period, customFrom, customTo, load]);

  const fmt = (d) => (d ? new Date(d).toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
  const periodLabel = { today: 'Today', week: 'Last 7 Days', month: 'Last 30 Days', range: `${customFrom || '…'} to ${customTo || '…'}` }[period];

  const downloadPdf = () => {
    const now = new Date().toLocaleString();
    const statusCell = (r) => {
      if (r.status_timeline && r.status_timeline.length) {
        return r.status_timeline.map((h) => `<div style="margin-bottom:3px">• <strong>${STATUS_LABELS[h.status] || h.status}</strong> <span style="color:#64748b">— ${h.at ? new Date(h.at).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>${h.note ? `<div style="color:#64748b;font-size:11px;margin-left:12px;font-style:italic">“${escapeHtml(h.note)}”</div>` : ''}</div>`).join('');
      }
      return '-';
    };
    const bodyRows = rows.map((r, i) => `
      <tr><td>${i + 1}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.mobile)}</td>
      <td>${r.is_registered ? 'Registered' : 'Unregistered'}</td>
      <td>${statusCell(r)}</td><td>${fmt(r.last_activity)}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Lead Report</title>
      <style>@page{size:A4 landscape;margin:14mm;}body{font-family:Arial,sans-serif;color:#0f172a;padding:10px;}h1{font-size:20px;margin:0 0 4px;}
      .sub{color:#64748b;font-size:12px;margin-bottom:14px;}table{width:100%;border-collapse:collapse;font-size:12px;}
      th,td{border:1px solid #cbd5e1;padding:7px 9px;text-align:left;vertical-align:top;}th{background:#0071e3;color:#fff;}
      tr:nth-child(even){background:#f8fafc;}</style></head><body>
      <h1>WhatsApp CRM — Lead Report</h1>
      <div class="sub">Team Member: <strong>${escapeHtml(user?.name || 'Team')}</strong> · Period: ${escapeHtml(periodLabel)} · Generated: ${now} · Total: ${rows.length}</div>
      <table><thead><tr><th>#</th><th>Name</th><th>Mobile</th><th>Registration</th><th>Status</th><th>Last Activity</th></tr></thead>
      <tbody>${bodyRows}</tbody></table><script>window.onload=function(){window.print();}</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to download the PDF.'); return; }
    w.document.write(html); w.document.close();
  };

  const periods = [['today', 'Today'], ['week', 'Weekly'], ['month', 'Monthly'], ['range', 'Date Range']];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: '#0f172a' }}>My Lead Report</h1>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 14 }}>{periodLabel} · {rows.length} lead(s) · follow-up status reflects this period</p>
        </div>
        <button type="button" onClick={downloadPdf} disabled={!rows.length}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: rows.length ? 'pointer' : 'not-allowed', opacity: rows.length ? 1 : 0.6 }}>
          <DownloadIcon /> Download PDF
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {periods.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setPeriod(key)}
            style={{ padding: '8px 16px', borderRadius: 980, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: period === key ? '1px solid #0071e3' : '1px solid #cbd5e1',
              background: period === key ? '#0071e3' : '#fff', color: period === key ? '#fff' : '#334155' }}>
            {label}
          </button>
        ))}
        {period === 'range' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }} />
            <span style={{ color: '#94a3b8', fontSize: 13 }}>to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }} />
          </div>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Loading report…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>
            {period === 'range' && (!customFrom || !customTo) ? 'Select a start and end date.' : 'No leads in this period.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  {['#', 'Name', 'Mobile', 'Registration', 'Follow-up Status', 'Last Activity'].map((h) => (
                    <th key={h} style={{ padding: '11px 14px', color: '#64748b', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{i + 1}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>{r.name}</td>
                    <td style={{ padding: '10px 14px', color: '#475569' }}>{r.mobile}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 980, background: r.is_registered ? '#fffbeb' : '#f1f5f9', color: r.is_registered ? '#b45309' : '#64748b' }}>
                        {r.is_registered ? 'Registered' : 'Unregistered'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {(r.status_timeline && r.status_timeline.length) ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {r.status_timeline.map((h, k) => (
                            <div key={k}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <span style={{ width: 8, height: 8, borderRadius: 999, background: STATUS_COLORS[h.status] || '#0071e3', flexShrink: 0 }} />
                                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>{STATUS_LABELS[h.status] || h.status}</span>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>{h.at ? new Date(h.at).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                              </div>
                              {h.note && (
                                <div style={{ fontSize: 11.5, color: '#64748b', marginLeft: 15, marginTop: 1, fontStyle: 'italic' }}>
                                  <i className="fa-solid fa-quote-left" style={{ fontSize: 8, marginRight: 4, color: '#cbd5e1' }} />{h.note}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12.5, color: '#94a3b8' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#64748b' }}>{fmt(r.last_activity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
