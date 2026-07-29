import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Mirrors the PHP admin login (navy government portal + tricolor bar).
export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const res = await login(username, password);
      if (res.success) nav(res.user?.home || '/dashboard', { replace: true });
      else setErr(res.message || 'Login failed.');
    } catch (e2) {
      setErr(e2.response?.data?.message || 'Login failed.');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div className="tricolor-bar" />
      <div className="gov-login-bg">
        <form className="gov-login-card" onSubmit={submit}>
          <div className="portal-title">Election Data Management</div>
          <div className="portal-sub">Government Portal · Secure Login</div>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <span className="gov-badge">🛡 Secure Access</span>
          </div>
          {err && <div className="alert err">{err}</div>}
          <label>Username / Mobile</label>
          <input placeholder="Enter your username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <label>Password</label>
          <input type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="gov-btn" disabled={loading}>{loading ? 'Signing in…' : 'Login'}</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #cfd8dc', paddingTop: 16, marginTop: 16 }}>
            <span className="muted">Forgot password?</span>
            <Link to="/register" className="gov-link">← Back to Register</Link>
          </div>
          <div className="gov-login-foot">© {new Date().getFullYear()} Election Data Management. All rights reserved.</div>
        </form>
      </div>
    </div>
  );
}
