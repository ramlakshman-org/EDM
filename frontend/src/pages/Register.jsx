import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { RURAL_POSITIONS, URBAN_POSITIONS, districtsFor, bodiesFor } from '../data/localBodies.js';

const PARTIES = ['DMK', 'AIADMK', 'BJP', 'INC', 'NTK', 'PMK', 'VCK', 'MDMK', 'AMMK', 'DMDK', 'TVK', 'Independent', 'Other'];

const ROLES = {
  en: [
    ['planning', 'Planning to Contest'],
    ['confirmed', 'Confirmed Candidate'],
    ['team', 'Campaign Team Member'],
    ['functionary', 'Party Functionary'],
  ],
  ta: [
    ['planning', 'போட்டியிடத் திட்டமிடுதல்'],
    ['confirmed', 'உறுதிப்படுத்தப்பட்ட வேட்பாளர்'],
    ['team', 'பிரச்சாரக் குழு உறுப்பினர்'],
    ['functionary', 'கட்சி நிர்வாகி'],
  ],
};

// Public Candidate Registration Page with EN/Tamil Toggle and FAQ Link
export default function Register() {
  const [lang, setLang] = useState('ta'); // 'ta' (Tamil) or 'en' (English)
  const [menuOpen, setMenuOpen] = useState(false);
  const [f, setF] = useState({
    full_name: '', mobile: '', role: '', affiliation: '', party: '',
    body_type: '', position: '', district: '', local_body: '', ward_number: '',
  });
  const [done, setDone] = useState(null); // { username, passcode }
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // WhatsApp OTP verification state
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpMsg, setOtpMsg] = useState('');
  const [otpErr, setOtpErr] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  const requestOtp = async () => {
    const ta = lang === 'ta';
    setOtpErr(''); setOtpMsg('');
    if (!/^\d{10}$/.test(f.mobile)) {
      setOtpErr(ta ? 'சரியான 10 இலக்க வாட்ஸ்அப் எண்ணை உள்ளிடவும்.' : 'Enter a valid 10-digit WhatsApp number.');
      return;
    }
    setOtpLoading(true);
    try {
      const { data } = await api.post('/auth/send-otp', { mobile: f.mobile });
      if (data.success) { setOtpSent(true); setOtpMsg(ta ? 'OTP உங்கள் வாட்ஸ்அப்பிற்கு அனுப்பப்பட்டது.' : 'OTP sent to your WhatsApp number.'); }
      else setOtpErr(data.message || 'Failed to send OTP.');
    } catch (e2) {
      setOtpErr(e2.response?.data?.message || (ta ? 'OTP அனுப்ப முடியவில்லை.' : 'Failed to send OTP.'));
    } finally { setOtpLoading(false); }
  };

  const confirmOtp = async () => {
    const ta = lang === 'ta';
    setOtpErr(''); setOtpMsg('');
    if (!otp) { setOtpErr(ta ? 'OTP ஐ உள்ளிடவும்.' : 'Enter the OTP.'); return; }
    setOtpLoading(true);
    try {
      const { data } = await api.post('/auth/verify-otp', { mobile: f.mobile, otp });
      if (data.success) { setOtpVerified(true); setOtpMsg(ta ? 'வாட்ஸ்அப் எண் சரிபார்க்கப்பட்டது ✓' : 'WhatsApp number verified ✓'); }
      else setOtpErr(data.message || 'Incorrect OTP.');
    } catch (e2) {
      setOtpErr(e2.response?.data?.message || (ta ? 'தவறான OTP.' : 'Incorrect OTP.'));
    } finally { setOtpLoading(false); }
  };

  const [allAssemblies, setAllAssemblies] = useState([]);
  const [availableBooths, setAvailableBooths] = useState([]);
  const [loadingBooths, setLoadingBooths] = useState(false);

  // Load assemblies once on mount
  useEffect(() => {
    api.get('/public/assemblies')
      .then(({ data }) => setAllAssemblies(data.assemblies || []))
      .catch(() => {
        api.get('/assemblies')
          .then(({ data }) => setAllAssemblies(data.assemblies || []))
          .catch(() => {});
      });
  }, []);

  // Filter assemblies by district
  const districtAssemblies = useMemo(() => {
    if (!f.district) return [];
    const cleanDist = f.district.toLowerCase().trim();
    const filtered = allAssemblies.filter((a) => String(a.district || '').toLowerCase().trim().includes(cleanDist) || cleanDist.includes(String(a.district || '').toLowerCase().trim()));
    return filtered.length ? filtered : allAssemblies;
  }, [allAssemblies, f.district]);

  // Fetch booths when assembly_id changes
  useEffect(() => {
    if (!f.assembly_id) {
      setAvailableBooths([]);
      return;
    }
    setLoadingBooths(true);
    api.get('/public/booths', { params: { assemblyId: f.assembly_id } })
      .then(({ data }) => setAvailableBooths(data.booths || []))
      .catch(() => {
        api.get('/booths', { params: { assemblyId: f.assembly_id } })
          .then(({ data }) => setAvailableBooths(data.booths || []))
          .catch(() => setAvailableBooths([]));
      })
      .finally(() => setLoadingBooths(false));
  }, [f.assembly_id]);

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const positions = f.body_type === 'urban' ? URBAN_POSITIONS : f.body_type === 'rural' ? RURAL_POSITIONS : [];
  const districts = useMemo(() => (f.position ? districtsFor(f.position) : []), [f.position]);

  // Progress across visible required fields
  const required = ['full_name', 'mobile', 'role', 'affiliation', 'body_type', 'position', 'district', 'assembly_id'];
  const pct = Math.round((required.filter((k) => String(f[k] || '').trim()).length / required.length) * 100);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!otpVerified) {
      setErr(lang === 'ta' ? 'முதலில் உங்கள் வாட்ஸ்அப் எண்ணை OTP மூலம் சரிபார்க்கவும்.' : 'Please verify your WhatsApp number with the OTP first.');
      return;
    }
    if (!f.full_name.trim() || !/^\d{10}$/.test(f.mobile)) {
      setErr(lang === 'ta' ? 'உங்கள் பெயர் மற்றும் 10 இலக்க கைபேசி எண்ணை உள்ளிடவும்.' : 'Enter your name and a valid 10-digit mobile number.');
      return;
    }
    if (!f.assembly_id) {
      setErr(lang === 'ta' ? 'சட்டமன்றத் தொகுதியைத் தேர்ந்தெடுக்கவும்.' : 'Please select an Assembly Constituency.');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        full_name: f.full_name, mobile: f.mobile, role: f.role, affiliation: f.affiliation,
        party: f.party, body_type: f.body_type, position: f.position, district: f.district,
        assembly_id: f.assembly_id, assembly_name: f.assembly_name,
        booths: f.selected_booths || [],
      };
      const { data } = await api.post('/auth/register', payload);
      if (data.success) setDone({ username: data.username, passcode: data.passcode });
      else setErr(data.message || (lang === 'ta' ? 'பதிவு தோல்வியடைந்தது.' : 'Registration failed.'));
    } catch (e2) {
      setErr(e2.response?.data?.message || (lang === 'ta' ? 'பதிவு தோல்வியடைந்தது.' : 'Registration failed.'));
    } finally {
      setLoading(false);
    }
  };

  const isTa = lang === 'ta';

  return (
    <div>
      <div className="tricolor-bar" />

      {/* RESPONSIVE HEADER WITH BURGER MENU */}
      <header className="reg-header-bar">
        <div className="reg-header-inner">
          <Link to="/register" className="reg-brand-link">
            <img src="/EDM.png" alt="EDMS" className="reg-brand-logo" />
          </Link>

          <div className="reg-header-actions">
            {/* ON/OFF Style Language Toggle Switch: EN <-> த */}
            <div
              className="lang-toggle-switch"
              onClick={() => setLang(lang === 'ta' ? 'en' : 'ta')}
              title="Switch Language / மொழியை மாற்றவும்"
              role="button"
              tabIndex={0}
            >
              <span className={`toggle-label ${lang === 'en' ? 'active' : ''}`}>EN</span>
              <div className={`toggle-track ${lang === 'ta' ? 'is-ta' : 'is-en'}`}>
                <div className="toggle-thumb" />
              </div>
              <span className={`toggle-label ${lang === 'ta' ? 'active' : ''}`}>த</span>
            </div>

            {/* Desktop Navigation Links */}
            <div className="desktop-nav-links">
              <Link to="/faq" className="nav-faq-btn">
                ❓ {isTa ? 'கேள்வி-பதில் (FAQ)' : 'FAQ'}
              </Link>
              <Link to="/login" className="nav-login-btn">
                {isTa ? 'உள்நுழைக →' : 'Login →'}
              </Link>
            </div>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              className={`mobile-burger-btn ${menuOpen ? 'active' : ''}`}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle Navigation Menu"
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile Slide-down Menu */}
        {menuOpen && (
          <div className="mobile-dropdown-menu">
            <Link to="/faq" className="mobile-menu-item" onClick={() => setMenuOpen(false)}>
              <span style={{ fontSize: 16 }}>❓</span> {isTa ? 'கேள்வி-பதில் (FAQ)' : 'FAQ'}
            </Link>
            <Link to="/terms" className="mobile-menu-item" onClick={() => setMenuOpen(false)}>
              <span style={{ fontSize: 16 }}>📄</span> {isTa ? 'விதிமுறைகள்' : 'Terms & Conditions'}
            </Link>
            <Link to="/privacy" className="mobile-menu-item" onClick={() => setMenuOpen(false)}>
              <span style={{ fontSize: 16 }}>🔒</span> {isTa ? 'தனியுரிமைக் கொள்கை' : 'Privacy Policy'}
            </Link>
            <Link to="/login" className="mobile-menu-item" onClick={() => setMenuOpen(false)}>
              <span style={{ fontSize: 16 }}>🔑</span> {isTa ? 'உள்நுழைக (Login)' : 'Login →'}
            </Link>
          </div>
        )}
      </header>

      <div className="reg-split">
        {/* HERO LEFT PANEL */}
        <div className="reg-hero">
          <div>
            <div className="eyebrow">
              {isTa ? 'தமிழ்நாடு உள்ளாட்சித் தேர்தல் · 2026' : 'Tamil Nadu Local Body Elections · 2026'}
            </div>
            <h1>
              {isTa ? '2026 உள்ளாட்சி தேர்தலில் வெற்றிக்கான முழுமையான தேர்தல் மேலாண்மை.' : 'Everything you need to contest 2026.'}
            </h1>
            <p>
              {isTa ? 'தொகுதி விவரங்கள், பிரச்சார ஆதாரங்கள் மற்றும் தேர்தல் ஆதரவைப் பெற பதிவு செய்யுங்கள்.' : 'Register to access constituency insights, campaign resources, and election support.'}
            </p>
            <div className="reg-stats">
              <div>
                <div className="n">38</div>
                <div className="l">{isTa ? 'மாவட்டங்கள்' : 'Districts'}</div>
              </div>
              <div>
                <div className="n">2026</div>
                <div className="l">{isTa ? 'தேர்தல் ஆண்டு' : 'Election cycle'}</div>
              </div>
              <div>
                <div className="n">&lt; 2 Mins</div>
                <div className="l">{isTa ? 'பதிவு நேரம்' : 'To register'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* REGISTRATION FORM RIGHT PANEL */}
        <div className="reg-form-wrap">
          <div className="reg-card">
            {!done ? (
              <>
                <div className="progress-head">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                    <span>{isTa ? 'படிவப் பூர்த்தி' : 'Form completion'}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="reg-progress"><div style={{ width: `${pct}%` }} /></div>
                </div>

                <form className="reg-body" onSubmit={submit}>
                  {/* STEP 01 DETAILS */}
                  <div>
                    <span className="reg-step-no">01</span>
                    <span className="reg-step-title">{isTa ? 'உங்கள் விவரங்கள்' : 'Your details'}</span>
                  </div>
                  <div className="reg-field" style={{ marginTop: 12 }}>
                    <label>{isTa ? 'முழு பெயர்' : 'Full name'}</label>
                    <input
                      value={f.full_name}
                      onChange={(e) => set('full_name', e.target.value.replace(/[0-9]/g, ''))}
                      placeholder={isTa ? 'வாக்காளர் அடையாள அட்டைப்படி' : 'As per voter ID'}
                    />
                  </div>
                  <div className="reg-field">
                    <label>{isTa ? 'உங்கள் வாட்ஸ்அப் எண்ணை உள்ளிடவும்' : 'Enter Your WhatsApp Number'}</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={f.mobile}
                        maxLength={10}
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        disabled={otpVerified}
                        onChange={(e) => {
                          set('mobile', e.target.value.replace(/\D/g, '').slice(0, 10));
                          setOtpSent(false); setOtpVerified(false); setOtp(''); setOtpErr(''); setOtpMsg('');
                        }}
                        placeholder={isTa ? '10 இலக்க வாட்ஸ்அப் எண்' : '10-digit WhatsApp number'}
                        style={{ flex: 1 }}
                      />
                      {!otpVerified ? (
                        <button
                          type="button"
                          onClick={requestOtp}
                          disabled={otpLoading || f.mobile.length !== 10}
                          style={{ whiteSpace: 'nowrap', padding: '0 18px', borderRadius: 8, background: '#16a34a', color: '#fff', border: 'none', fontWeight: 700, cursor: (otpLoading || f.mobile.length !== 10) ? 'not-allowed' : 'pointer', opacity: (otpLoading || f.mobile.length !== 10) ? 0.6 : 1 }}
                        >
                          {otpLoading ? '…' : (otpSent ? (isTa ? 'மீண்டும் அனுப்பு' : 'Resend') : (isTa ? 'சரிபார் (Approve)' : 'Approve'))}
                        </button>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#16a34a', fontWeight: 800, padding: '0 10px', whiteSpace: 'nowrap' }}>✓ {isTa ? 'சரிபார்க்கப்பட்டது' : 'Verified'}</span>
                      )}
                    </div>
                  </div>

                  {otpSent && !otpVerified && (
                    <div className="reg-field">
                      <label>{isTa ? 'OTP ஐ உள்ளிடவும்' : 'Enter OTP'}</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          value={otp}
                          maxLength={8}
                          inputMode="numeric"
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                          placeholder={isTa ? 'வாட்ஸ்அப்பில் வந்த குறியீடு' : 'Code sent on WhatsApp'}
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={confirmOtp}
                          disabled={otpLoading || !otp}
                          style={{ whiteSpace: 'nowrap', padding: '0 18px', borderRadius: 8, background: '#0071e3', color: '#fff', border: 'none', fontWeight: 700, cursor: (otpLoading || !otp) ? 'not-allowed' : 'pointer', opacity: (otpLoading || !otp) ? 0.6 : 1 }}
                        >
                          {otpLoading ? '…' : (isTa ? 'உறுதிப்படுத்து' : 'Verify')}
                        </button>
                      </div>
                    </div>
                  )}
                  {otpErr && <div className="alert err" style={{ marginTop: 8 }}>{otpErr}</div>}
                  {otpMsg && <div className="alert" style={{ marginTop: 8, background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: 8, padding: '8px 12px' }}>{otpMsg}</div>}

                  {otpVerified && (<>
                  <div className="reg-sep" />

                  {/* STEP 02 ROLE & AFFILIATION */}
                  <div>
                    <span className="reg-step-no">02</span>
                    <span className="reg-step-title">{isTa ? 'பங்கு மற்றும் இணைப்பு' : 'Role & affiliation'}</span>
                  </div>
                  <div className="reg-field" style={{ marginTop: 12 }}>
                    <label>{isTa ? 'உங்கள் பங்கு' : 'Your role'}</label>
                    <div className="reg-options">
                      {(isTa ? ROLES.ta : ROLES.en).map(([v, lbl]) => (
                        <button
                          type="button"
                          key={v}
                          className={`reg-opt ${f.role === v ? 'active' : ''}`}
                          onClick={() => set('role', v)}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="reg-field">
                    <label>{isTa ? 'அரசியல் சார்பு' : 'Political affiliation'}</label>
                    <div className="reg-options">
                      <button
                        type="button"
                        className={`reg-opt ${f.affiliation === 'affiliated' ? 'active' : ''}`}
                        onClick={() => set('affiliation', 'affiliated')}
                      >
                        {isTa ? 'கட்சி சார்புடையவர்' : 'Affiliated with a party'}
                      </button>
                      <button
                        type="button"
                        className={`reg-opt ${f.affiliation === 'independent' ? 'active' : ''}`}
                        onClick={() => { set('affiliation', 'independent'); set('party', ''); }}
                      >
                        {isTa ? 'சுயேச்சை' : 'Independent'}
                      </button>
                    </div>
                  </div>

                  {f.affiliation === 'affiliated' && (
                    <div className="reg-field">
                      <label>{isTa ? 'அரசியல் கட்சி' : 'Party'}</label>
                      <select value={f.party} onChange={(e) => set('party', e.target.value)}>
                        <option value="">{isTa ? 'கட்சியைத் தேர்ந்தெடுக்கவும்' : 'Select party'}</option>
                        {PARTIES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="reg-sep" />

                  {/* STEP 03 CONSTITUENCY */}
                  <div>
                    <span className="reg-step-no">03</span>
                    <span className="reg-step-title">{isTa ? 'போட்டியிடும் தொகுதி / பகுதி' : 'Your constituency'}</span>
                  </div>
                  <div className="reg-field" style={{ marginTop: 12 }}>
                    <label>{isTa ? 'உள்ளாட்சி அமைப்பு வகை' : 'Local body type'}</label>
                    <div className="reg-options" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <button
                        type="button"
                        className={`reg-opt ${f.body_type === 'rural' ? 'active' : ''}`}
                        onClick={() => setF((s) => ({ ...s, body_type: 'rural', position: '', district: '', assembly_id: '', assembly_name: '', selected_booths: [] }))}
                        style={{ height: '100%', minHeight: 70 }}
                      >
                        {isTa ? 'கிராமப்புற உள்ளாட்சி' : 'Rural Local Body'}<br />
                        <small className="muted">{isTa ? 'ஊராட்சிகள், ஒன்றியங்கள், மாவட்ட ஊராட்சி' : 'Panchayats, Unions, District Panchayat'}</small>
                      </button>
                      <button
                        type="button"
                        className={`reg-opt ${f.body_type === 'urban' ? 'active' : ''}`}
                        onClick={() => setF((s) => ({ ...s, body_type: 'urban', position: '', district: '', assembly_id: '', assembly_name: '', selected_booths: [] }))}
                        style={{ height: '100%', minHeight: 70 }}
                      >
                        {isTa ? 'நகர்ப்புற உள்ளாட்சி' : 'Urban Local Body'}<br />
                        <small className="muted">{isTa ? 'பேரூராட்சிகள், நகராட்சிகள், மாநகராட்சிகள்' : 'Town Panchayats, Municipalities, Corporations'}</small>
                      </button>
                    </div>
                  </div>

                  {!!positions.length && (
                    <div className="reg-field">
                      <label>{isTa ? 'போட்டியிடும் பதவி' : "Position you're contesting"}</label>
                      <select value={f.position} onChange={(e) => setF((s) => ({ ...s, position: e.target.value, district: '', assembly_id: '', assembly_name: '', selected_booths: [] }))}>
                        <option value="">{isTa ? 'பதவியைத் தேர்ந்தெடுக்கவும்' : 'Select position'}</option>
                        {positions.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  )}

                  {!!f.position && (
                    <div className="reg-field">
                      <label>{isTa ? 'மாவட்டம்' : 'District'}</label>
                      <select value={f.district} onChange={(e) => setF((s) => ({ ...s, district: e.target.value, assembly_id: '', assembly_name: '', selected_booths: [] }))}>
                        <option value="">{isTa ? 'மாவட்டத்தைத் தேர்ந்தெடுக்கவும்' : 'Select your district'}</option>
                        {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  )}

                  {!!f.district && (
                    <div className="reg-field">
                      <label>{isTa ? 'சட்டமன்றத் தொகுதி' : 'Assembly Constituency'}</label>
                      <select
                        value={f.assembly_id}
                        onChange={(e) => {
                          const selectedId = e.target.value;
                          const found = allAssemblies.find((a) => String(a.assembly_no) === selectedId);
                          setF((s) => ({
                            ...s,
                            assembly_id: selectedId,
                            assembly_name: found ? found.assembly_name : '',
                            selected_booths: [],
                          }));
                        }}
                      >
                        <option value="">{isTa ? 'சட்டமன்றத் தொகுதியைத் தேர்ந்தெடுக்கவும்' : 'Select Assembly Constituency'}</option>
                        {districtAssemblies.map((a) => (
                          <option key={a.assembly_no} value={a.assembly_no}>
                            No. {a.assembly_no} - {a.assembly_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {!!f.assembly_id && (
                    <div className="reg-field">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label style={{ margin: 0 }}>
                          {isTa ? 'வாக்குச்சாவடிகள் (பாகங்கள்) - பல தேர்வு செய்யலாம்' : 'Select Booths (Multi-Select)'}
                        </label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => {
                              const allPartNos = availableBooths.map((b) => b.part_no);
                              setF((s) => ({ ...s, selected_booths: allPartNos }));
                            }}
                            style={{ padding: '3px 8px', fontSize: 11, borderRadius: 4, background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', cursor: 'pointer', fontWeight: 700 }}
                          >
                            {isTa ? 'அனைத்தும் தேர்வு செய்' : 'Select All'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setF((s) => ({ ...s, selected_booths: [] }))}
                            style={{ padding: '3px 8px', fontSize: 11, borderRadius: 4, background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', cursor: 'pointer', fontWeight: 700 }}
                          >
                            {isTa ? 'அழி' : 'Clear'}
                          </button>
                        </div>
                      </div>

                      {loadingBooths ? (
                        <div style={{ padding: 12, fontSize: 13, color: '#64748b' }}>
                          {isTa ? 'வாக்குச்சாவடிகள் ஏற்றப்படுகின்றன...' : 'Loading polling booths...'}
                        </div>
                      ) : availableBooths.length === 0 ? (
                        <div style={{ padding: 12, fontSize: 13, color: '#94a3b8' }}>
                          {isTa ? 'வாக்குச்சாவடிகள் ஏதும் கிடைக்கவில்லை.' : 'No booths found for this assembly.'}
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#0071e3', marginBottom: 8 }}>
                            {isTa ? `தேர்ந்தெடுக்கப்பட்ட வாக்குச்சாவடிகள்: ${f.selected_booths?.length || 0}` : `Selected Booths: ${f.selected_booths?.length || 0}`}
                          </div>
                          <div
                            style={{
                              maxHeight: 220,
                              overflowY: 'auto',
                              border: '1px solid #cbd5e1',
                              borderRadius: 8,
                              padding: 8,
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                              gap: 6,
                              background: '#fafafa',
                            }}
                          >
                            {availableBooths.map((b) => {
                              const isSelected = (f.selected_booths || []).includes(b.part_no);
                              return (
                                <button
                                  key={b.part_no}
                                  type="button"
                                  onClick={() => {
                                    setF((s) => {
                                      const current = s.selected_booths || [];
                                      const next = current.includes(b.part_no)
                                        ? current.filter((x) => x !== b.part_no)
                                        : [...current, b.part_no];
                                      return { ...s, selected_booths: next };
                                    });
                                  }}
                                  style={{
                                    padding: '6px 8px',
                                    borderRadius: 6,
                                    border: isSelected ? '2px solid #0071e3' : '1px solid #cbd5e1',
                                    background: isSelected ? '#e0f2fe' : '#ffffff',
                                    color: isSelected ? '#0369a1' : '#334155',
                                    fontWeight: isSelected ? 800 : 600,
                                    fontSize: 11.5,
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                  title={`Part ${b.part_no}: ${b.booth_name}`}
                                >
                                  {isSelected ? '✓ ' : ''}Booth {b.part_no}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {err && <div className="alert err" style={{ marginTop: 16 }}>{err}</div>}

                  <button className="reg-submit" disabled={loading}>
                    {loading ? (isTa ? 'செயலாக்கப்படுகிறது…' : 'Processing…') : (isTa ? 'பதிவை முடிக்கவும்' : 'Submit registration')}
                  </button>
                  </>)}
                </form>
              </>
            ) : (
              <div className="reg-success">
                <div style={{ fontSize: 40 }}>✅</div>
                <h2 style={{ margin: '10px 0 4px' }}>
                  {isTa ? 'பதிவு வெற்றிகரமாக முடிந்தது!' : 'Registration Successful!'}
                </h2>
                <p className="muted">
                  {isTa
                    ? 'உங்கள் உள்நுழைவு விவரங்கள் (பயனர் பெயர் & கடவுச்சொல்) உங்கள் வாட்ஸ்அப் எண்ணிற்கு அனுப்பப்பட்டுள்ளன. வாட்ஸ்அப்பைப் பார்க்கவும்.'
                    : 'Your login credentials (username & passcode) have been sent to your WhatsApp number. Please check WhatsApp.'}
                </p>
                <div className="reg-cred" style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                  <span style={{ fontSize: 22 }}>📲</span>
                  <span style={{ fontWeight: 700, color: '#065f46' }}>
                    {isTa ? `+91 ${done.username} க்கு அனுப்பப்பட்டது` : `Sent to +91 ${done.username}`}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <Link to="/login" style={{ flex: 1 }}>
                    <button className="gov-btn" style={{ width: '100%' }}>
                      {isTa ? 'உள்நுழைக' : 'Login Now'}
                    </button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="reg-site-footer">
        <div className="reg-footer-copy">
          © 2026 <strong>Election Data Management</strong> — Political Consulting &amp; Election Campaign Management · election2026sir.in
        </div>
        <div className="reg-footer-links">
          <Link to="/terms">{isTa ? 'விதிமுறைகள்' : 'Terms & Conditions'}</Link>
          <span className="reg-footer-sep">·</span>
          <Link to="/privacy">{isTa ? 'தனியுரிமைக் கொள்கை' : 'Privacy Policy'}</Link>
          <span className="reg-footer-sep">·</span>
          <Link to="/faq">FAQ</Link>
        </div>
      </footer>
    </div>
  );
}
