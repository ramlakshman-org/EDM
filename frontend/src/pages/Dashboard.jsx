import { useEffect, useState } from 'react';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [online, setOnline] = useState(true);
  const [epic, setEpic] = useState('');
  const [result, setResult] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    api.get('/dashboard/stats').then(({ data }) => {
      if (data.success) { setStats(data.stats); setOnline(data.voterDbOnline); }
    }).catch(() => {});
  }, []);

  const search = async (e) => {
    e.preventDefault();
    setSearching(true); setResult(null);
    try {
      const { data } = await api.get('/dashboard/search-epic', { params: { epic } });
      setResult(data);
    } catch { setResult({ success: false, message: 'Search failed.' }); }
    finally { setSearching(false); }
  };

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>
      {!online && <div className="alert warn">Live voter database is currently unreachable — counts below are the last known stored totals.</div>}
      <div className="tiles">
        <div className="tile green"><div>Total Voters</div><h3>{stats ? fmt(stats.totalVoters) : '…'}</h3></div>
        <div className="tile orange"><div>Male Voters</div><h3>{stats ? fmt(stats.maleVoters) : '…'}</h3></div>
        <div className="tile blue"><div>Female Voters</div><h3>{stats ? fmt(stats.femaleVoters) : '…'}</h3></div>
        <div className="tile red"><div>Other Voters</div><h3>{stats ? fmt(stats.otherVoters) : '…'}</h3></div>
      </div>

      <div className="card" style={{ maxWidth: 680 }}>
        <h2 style={{ marginTop: 0, marginBottom: 14 }}>Global EPIC Search</h2>
        <form onSubmit={search} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-mid-gray)' }}>EPIC Number</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                placeholder="e.g. TAU3799640"
                value={epic}
                onChange={(e) => setEpic(e.target.value)}
                style={{
                  width: '100%',
                  height: 44,
                  padding: '0 16px 0 40px',
                  borderRadius: 12,
                  fontSize: 15,
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none', fontSize: 15 }}>
                🔍
              </span>
            </div>
            <button
              type="submit"
              disabled={searching || !epic.trim()}
              style={{
                height: 44,
                padding: '0 24px',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
                background: '#0071e3',
                color: '#fff',
                border: 'none',
                cursor: searching ? 'not-allowed' : 'pointer',
              }}
            >
              🔍 {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
        </form>
        {searching && <Spinner label="Searching…" />}
        {!searching && result && (
          result.success ? (
            <table>
              <tbody>
                <tr><th>EPIC</th><td>{result.voter.EPIC_NO}</td></tr>
                <tr><th>Name (EN)</th><td>{result.voter.VOTER_NAME_EN}</td></tr>
                <tr><th>Name (TA)</th><td>{result.voter.VOTER_NAME}</td></tr>
                <tr><th>Relation Type</th><td>{result.voter.RELATION_TYPE}</td></tr>
                <tr><th>Assembly</th><td>{result.assembly_name} (#{result.voter.ASSEMBLY_NO})</td></tr>
                <tr><th>Part / Age / Gender</th><td>{result.voter.PART_NO} / {result.voter.AGE} / {result.voter.GENDER}</td></tr>
                <tr><th>Found in</th><td>{result.elapsed_ms} ms</td></tr>
              </tbody>
            </table>
          ) : <div className="alert err">{result.message || 'Not found.'}</div>
        )}
      </div>
    </div>
  );
}
