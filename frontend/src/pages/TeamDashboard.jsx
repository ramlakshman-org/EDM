import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import BarChart from '../components/BarChart.jsx';
import PieChart from '../components/PieChart.jsx';

const STATUS_LABELS = {
  interested: 'Interested',
  not_interested: 'Not Interested',
  call_completed: 'Call Complete',
  switch_off: 'Switch Off',
  not_answered: 'Not Answered',
  will_call_back: 'Will Call Back',
};
const STATUS_COLORS = {
  interested: '#16a34a',
  not_interested: '#dc2626',
  call_completed: '#2563eb',
  switch_off: '#d97706',
  not_answered: '#64748b',
  will_call_back: '#0284c7',
};

function Icon({ path, size = 22, color = '#0f172a' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}
const ICONS = {
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  thumbUp: <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />,
  thumbDown: <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />,
  star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />,
  phoneCall: <><path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></>,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  report: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></>,
};

export default function TeamDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/crm/team-stats')
      .then(({ data }) => { if (data.success) setStats(data.stats); })
      .catch((e) => console.error('team-stats', e))
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { key: 'total', label: 'Total Users', icon: ICONS.users, color: '#0071e3', bg: '#eff6ff' },
    { key: 'interested', label: 'Interested', icon: ICONS.thumbUp, color: '#16a34a', bg: '#f0fdf4' },
    { key: 'not_interested', label: 'Not Interested', icon: ICONS.thumbDown, color: '#dc2626', bg: '#fef2f2' },
    { key: 'pro', label: 'PRO Users', icon: ICONS.star, color: '#7c3aed', bg: '#f5f3ff' },
    { key: 'calls_today', label: 'Calls Completed Today', icon: ICONS.phoneCall, color: '#0284c7', bg: '#ecfeff' },
    { key: 'calls_total', label: 'Overall Calls Completed', icon: ICONS.phone, color: '#0f766e', bg: '#f0fdfa' },
  ];

  const days = stats?.calls_last_7_days || [];
  const breakdown = stats?.status_breakdown || [];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: '#0f172a' }}>Team Dashboard</h1>
        <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 14 }}>
          Welcome back, <strong>{user?.name}</strong> — here's your lead overview.
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 22 }}>
        {cards.map((c) => (
          <div key={c.key} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon path={c.icon} color={c.color} size={22} />
              </div>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: c.color, lineHeight: 1, marginTop: 14 }}>
              {loading ? '…' : (stats?.[c.key] ?? 0)}
            </div>
            <div style={{ fontSize: 12.5, color: '#475569', fontWeight: 700, marginTop: 6 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 22 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Calls Completed — Last 7 Days</h3>
          {days.length ? (
            <BarChart labels={days.map((d) => d.label)} data={days.map((d) => d.count)} colors={days.map(() => '#0284c7')} height={220} />
          ) : <div style={{ color: '#94a3b8', fontSize: 13, padding: 20 }}>No data</div>}
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Lead Status Breakdown</h3>
          {breakdown.some((b) => b.count > 0) ? (
            <PieChart
              labels={breakdown.filter((b) => b.count > 0).map((b) => STATUS_LABELS[b.status] || b.status)}
              data={breakdown.filter((b) => b.count > 0).map((b) => b.count)}
              colors={breakdown.filter((b) => b.count > 0).map((b) => STATUS_COLORS[b.status] || '#0071e3')}
              height={240}
            />
          ) : <div style={{ color: '#94a3b8', fontSize: 13, padding: 20, textAlign: 'center' }}>No status data yet</div>}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Link to="/crm" style={{ textDecoration: 'none', flex: 1, minWidth: 240 }}>
          <div style={{ background: 'linear-gradient(135deg,#0071e3,#4f46e5)', color: '#fff', borderRadius: 16, padding: 22, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon path={ICONS.chat} color="#fff" size={24} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Open WhatsApp CRM</div>
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>Chat with your assigned leads</div>
            </div>
          </div>
        </Link>
        <Link to="/team/reports" style={{ textDecoration: 'none', flex: 1, minWidth: 240 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a', borderRadius: 16, padding: 22, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon path={ICONS.report} color="#0f172a" size={24} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>View Reports</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>See your lead report &amp; download PDF</div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
