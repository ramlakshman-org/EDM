import { useState, useEffect } from 'react';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';

export default function TeamManagement() {
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState({
    total_leads: 0,
    interested: 0,
    not_interested: 0,
    calls_completed: 0,
    pro_users: 0,
    total_team_members: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    mobile: '',
    password: '',
  });
  const [modalErr, setModalErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [distributing, setDistributing] = useState(false);

  const handleDistribute = async (reassignAll = false) => {
    const confirmMsg = reassignAll
      ? 'Rebalance ALL WhatsApp conversations evenly across active team members? This reassigns every lead.'
      : 'Distribute all unassigned WhatsApp conversations across active team members (round-robin)?';
    if (!window.confirm(confirmMsg)) return;
    setDistributing(true);
    try {
      const { data } = await api.post('/crm/distribute-leads', { reassign_all: reassignAll });
      if (data.success) {
        setActionMsg(data.message || 'Leads distributed successfully.');
        fetchTeamData();
      } else {
        setActionMsg(data.message || 'Distribution failed.');
      }
    } catch (err) {
      setActionMsg(err.response?.data?.message || 'Failed to distribute leads.');
    } finally {
      setDistributing(false);
    }
  };

  const fetchTeamData = async () => {
    try {
      setLoading(true);
      const [memRes, statsRes] = await Promise.all([
        api.get('/team/members'),
        api.get('/team/stats'),
      ]);

      if (memRes.data.success) {
        setMembers(memRes.data.members || []);
      }
      if (statsRes.data.success) {
        setStats(statsRes.data.stats || {});
      }
    } catch (err) {
      console.error('Failed to load team data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamData();
  }, []);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({ name: '', username: '', mobile: '', password: '' });
    setModalErr('');
    setShowModal(true);
  };

  const handleOpenEdit = (m) => {
    setEditingId(m.id);
    setFormData({
      name: m.name,
      username: m.username,
      mobile: m.mobile,
      password: m.password_str,
    });
    setModalErr('');
    setShowModal(true);
  };

  const handleSubmitModal = async (e) => {
    e.preventDefault();
    setModalErr('');

    if (!formData.name.trim() || !formData.username.trim() || !formData.password.trim()) {
      setModalErr('Name, Username, and Password are required.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        // Edit existing member
        const { data } = await api.put(`/team/members/${editingId}`, formData);
        if (data.success) {
          setActionMsg('Team member updated successfully!');
          setShowModal(false);
          fetchTeamData();
        } else {
          setModalErr(data.message || 'Failed to update member.');
        }
      } else {
        // Create new member
        const { data } = await api.post('/team/members', formData);
        if (data.success) {
          setActionMsg(data.message || 'New team member created successfully!');
          setShowModal(false);
          fetchTeamData();
        } else {
          setModalErr(data.message || 'Failed to create member.');
        }
      }
    } catch (err) {
      setModalErr(err.response?.data?.message || 'Server error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (m) => {
    try {
      const newStatus = !m.is_active;
      await api.put(`/team/members/${m.id}`, { is_active: newStatus });
      setActionMsg(`Account status updated for ${m.name}`);
      fetchTeamData();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleDeleteMember = async (m) => {
    if (!window.confirm(`Are you sure you want to delete team member credentials for '${m.name}'?`)) return;
    try {
      await api.delete(`/team/members/${m.id}`);
      setActionMsg(`Deleted team member ${m.name}`);
      fetchTeamData();
    } catch (err) {
      console.error('Failed to delete team member:', err);
    }
  };

  const filteredMembers = members.filter((m) => {
    const s = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(s) ||
      m.username.toLowerCase().includes(s) ||
      m.mobile.includes(s)
    );
  });

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      
      {/* HEADER TITLE */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a237e', margin: 0 }}>
            👥 CRM Team &amp; Performance Stats
          </h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
            Create separate CRM login credentials for each team member and monitor live lead handling stats.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => handleDistribute(false)}
            disabled={distributing}
            title="Assign all unassigned WhatsApp conversations across active team members in round-robin"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 700, border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', cursor: distributing ? 'not-allowed' : 'pointer', opacity: distributing ? 0.6 : 1 }}
          >
            🔀 {distributing ? 'Distributing…' : 'Distribute Leads'}
          </button>
          <button
            className="gov-btn"
            onClick={handleOpenCreate}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 700 }}
          >
            ➕ Add New Team Member
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className="alert success" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{actionMsg}</span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setActionMsg('')}>✕</button>
        </div>
      )}

      {/* OVERALL STATS CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        {/* Active Pro Users */}
        <div style={{ background: '#ffffff', border: '1px solid #ddd6fe', borderRadius: 12, padding: '20px 24px', boxShadow: '0 2px 4px rgba(124,58,237,0.06)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#7c3aed', letterSpacing: '0.05em' }}>
            ⭐ Active Pro Users
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#7c3aed', marginTop: 6 }}>
            {stats.pro_users || 0}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            Candidates with active paid subscription
          </div>
        </div>

        {/* Calls Completed */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#2563eb', letterSpacing: '0.05em' }}>
            📞 Total Calls Done
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#2563eb', marginTop: 6 }}>
            {stats.calls_completed || 0}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            1st, 2nd &amp; 3rd calls completed
          </div>
        </div>

        {/* Interested */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#16a34a', letterSpacing: '0.05em' }}>
            🟢 Intrested (ஆர்வமுள்ளவர்)
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#16a34a', marginTop: 6 }}>
            {stats.interested || 0}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            High-intent candidate leads
          </div>
        </div>

        {/* Not Interested */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#dc2626', letterSpacing: '0.05em' }}>
            🔴 Not Intrested
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#dc2626', marginTop: 6 }}>
            {stats.not_interested || 0}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            Declined or cold contacts
          </div>
        </div>

        {/* Switch Off / Not Answered */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#d97706', letterSpacing: '0.05em' }}>
            📱 Unreachable / Call Back
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#d97706', marginTop: 6 }}>
            {(stats.switch_off || 0) + (stats.not_answered || 0) + (stats.will_call_back || 0)}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            Switch off, no answer &amp; call backs
          </div>
        </div>
      </div>

      {/* SEARCH AND TEAM TABLE SECTION */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Team Members Credentials &amp; Activity
          </h2>

          <div style={{ minWidth: 260 }}>
            <input
              type="text"
              placeholder="Search team member..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, width: '100%' }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
        ) : filteredMembers.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
            No team members found. Click <strong>Add New Team Member</strong> to create credentials.
          </div>
        ) : (
          <div style={{ padding: 18, background: '#f8fafc', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
            {filteredMembers.map((m) => {
              const palette = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
              const initial = (m.name || '#').trim().charAt(0).toUpperCase();
              const avatarBg = palette[(m.name || '0').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) % palette.length];
              const calls = (m.stats?.first_call_complete || 0) + (m.stats?.second_call_complete || 0) + (m.stats?.third_call_complete || 0) + (m.stats?.call_completed || 0);
              const tiles = [
                { label: 'Interested', value: m.stats?.interested || 0, color: '#16a34a', bg: '#f0fdf4' },
                { label: 'Not Interested', value: m.stats?.not_interested || 0, color: '#dc2626', bg: '#fef2f2' },
                { label: 'Calls Done', value: calls, color: '#2563eb', bg: '#eff6ff' },
                { label: 'PRO Users', value: m.stats?.pro_users || 0, color: '#7c3aed', bg: '#f5f3ff' },
              ];
              return (
                <div key={m.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 46, height: 46, borderRadius: '50%', background: avatarBg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 19, flexShrink: 0 }}>{initial}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15.5, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
                        <button onClick={() => handleToggleStatus(m)} title="Toggle status"
                          style={{ padding: '2px 9px', borderRadius: 980, fontSize: 10.5, fontWeight: 800, border: 'none', cursor: 'pointer', background: m.is_active ? '#dcfce7' : '#fee2e2', color: m.is_active ? '#166534' : '#991b1b' }}>
                          {m.is_active ? 'Active' : 'Off'}
                        </button>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>CRM Agent · {m.mobile || 'no mobile'}</div>
                    </div>
                  </div>

                  {/* Credentials */}
                  <div style={{ marginTop: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '9px 12px', display: 'flex', gap: 18, fontSize: 12.5 }}>
                    <div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>User</div><div style={{ fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>{m.username}</div></div>
                    <div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Pass</div><div style={{ fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>{m.password_str}</div></div>
                  </div>

                  {/* Stat tiles */}
                  <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {tiles.map((t) => (
                      <div key={t.label} style={{ background: t.bg, borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: t.color, lineHeight: 1 }}>{t.value}</div>
                        <div style={{ fontSize: 9.5, fontWeight: 700, color: '#64748b', marginTop: 4 }}>{t.label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                    Switch off {m.stats?.switch_off || 0} · No answer {m.stats?.not_answered || 0} · Call back {m.stats?.will_call_back || 0}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button onClick={() => handleOpenEdit(m)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      ✏️ Edit
                    </button>
                    <button onClick={() => handleDeleteMember(m)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE / EDIT TEAM MEMBER MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{editingId ? 'Edit Team Member Credentials' : 'Create New Team Member Credentials'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmitModal} style={{ padding: 24 }}>
              {modalErr && <div className="alert err" style={{ marginBottom: 16 }}>{modalErr}</div>}

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Arun Kumar"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                  required
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  Username (For CRM Login)
                </label>
                <input
                  type="text"
                  placeholder="e.g. arun_crm"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                  required
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  Mobile Number
                </label>
                <input
                  type="text"
                  maxLength={10}
                  placeholder="10-digit mobile number"
                  value={formData.mobile}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value.replace(/\D/g, '') })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  Password / Passcode
                </label>
                <input
                  type="text"
                  placeholder="Set login passcode"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowModal(false)}
                  style={{ padding: '10px 16px', borderRadius: 8 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="gov-btn"
                  disabled={submitting}
                  style={{ padding: '10px 20px', borderRadius: 8 }}
                >
                  {submitting ? 'Saving…' : editingId ? 'Update Credentials' : 'Create Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
