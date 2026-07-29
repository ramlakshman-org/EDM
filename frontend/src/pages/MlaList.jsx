import { useEffect, useMemo, useState } from 'react';
import api from '../api/client.js';
import { MLA_MEMBERS, PARTIES } from '../data/mlaMembers.js';

// MLA List — official Tamil Nadu Legislative Assembly members by constituency,
// with party flags pulled from the Flow Images library (app_flow_images).
export default function MlaList() {
  const [flagMap, setFlagMap] = useState({});      // party abbr -> flag url
  const [profileMap, setProfileMap] = useState({}); // constituency_no -> profile url
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get('/mla/images')
      .then(({ data }) => { setFlagMap(data.flags || {}); setProfileMap(data.profiles || {}); })
      .catch(() => {});
  }, []);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return MLA_MEMBERS;
    return MLA_MEMBERS.filter(([no, name, member, abbr]) => {
      const party = PARTIES[abbr]?.full || abbr;
      return (
        String(no).includes(term) ||
        name.toLowerCase().includes(term) ||
        member.toLowerCase().includes(term) ||
        abbr.toLowerCase().includes(term) ||
        party.toLowerCase().includes(term)
      );
    });
  }, [q]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>MLA List</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Elected members of the Tamil Nadu Legislative Assembly by constituency.
      </p>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, maxWidth: 320 }}><label>Search</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Constituency, member or party..." />
          </div>
          <div className="muted" style={{ fontWeight: 600, fontSize: 13, paddingBottom: 10 }}>{rows.length} constituencies</div>
        </div>

        {/* Desktop Table View */}
        <div className="mla-table-wrapper" style={{ overflowX: 'auto' }}>
          <table className="mla-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>SL.NO</th>
                <th style={{ width: 64 }}>Photo</th>
                <th>No. &amp; Name of the Assembly Constituency</th>
                <th>Name of the Elected Member</th>
                <th>Party Affiliation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([no, name, member, abbr], i) => {
                const p = PARTIES[abbr] || { full: abbr };
                const flagUrl = flagMap[abbr];
                const photoUrl = profileMap[no];
                return (
                  <tr key={no}>
                    <td>{i + 1}</td>
                    <td>
                      {photoUrl
                        ? <img className="mla-photo" src={photoUrl} alt={member} />
                        : <span className="mla-photo placeholder">{member.charAt(0)}</span>}
                    </td>
                    <td><strong>{no}-{name}</strong></td>
                    <td>{member}</td>
                    <td>
                      <span className="party-cell">
                        {flagUrl
                          ? <img className="party-flag" src={flagUrl} alt={abbr} title={p.full} />
                          : <span className="party-flag placeholder" title={p.full}>{abbr.slice(0, 3)}</span>}
                        <span>
                          <span className="party-abbr">{abbr}</span>
                          <span className="party-full">{p.full}</span>
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 18 }}>No matches found.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="mla-mobile-list">
          {rows.map(([no, name, member, abbr], i) => {
            const p = PARTIES[abbr] || { full: abbr };
            const flagUrl = flagMap[abbr];
            const photoUrl = profileMap[no];
            return (
              <div key={no} className="mla-card-item">
                <div className="mla-card-avatar">
                  {photoUrl ? (
                    <img className="mla-photo-lg" src={photoUrl} alt={member} />
                  ) : (
                    <span className="mla-photo-lg placeholder">{member.charAt(0)}</span>
                  )}
                  <span className="mla-slno">#{i + 1}</span>
                </div>
                <div className="mla-card-info">
                  <div className="mla-constituency">{no} - {name}</div>
                  <div className="mla-member-name">{member}</div>
                  <div className="mla-party-badge">
                    {flagUrl ? (
                      <img className="party-flag-sm" src={flagUrl} alt={abbr} />
                    ) : (
                      <span className="party-flag-sm placeholder">{abbr.slice(0, 3)}</span>
                    )}
                    <span className="party-text">
                      <strong>{abbr}</strong> · {p.full}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {!rows.length && <div className="muted" style={{ textAlign: 'center', padding: 24 }}>No matches found.</div>}
        </div>
      </div>
    </div>
  );
}
