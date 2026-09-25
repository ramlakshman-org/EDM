import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', color: '#e2e8f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Tricolor Bar */}
      <div style={{ height: 4, background: 'linear-gradient(90deg, #FF9933 33.33%, #ffffff 33.33%, #ffffff 66.66%, #138808 66.66%)' }} />

      {/* Header */}
      <header style={{ background: '#0E2340', borderBottom: '1px solid #303f9f', padding: '14px 6vw' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/register" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <img src="/EDM.png" alt="EDM" style={{ height: 40, objectFit: 'contain' }} />
          </Link>
          <div style={{ display: 'flex', gap: 16 }}>
            <Link to="/terms" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none' }}>Terms &amp; Conditions</Link>
            <Link to="/faq" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none' }}>FAQ</Link>
            <Link to="/register" style={{ fontSize: 13, color: '#FF9933', textDecoration: 'none', fontWeight: 600 }}>Register →</Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 860, margin: '0 auto', padding: '48px 6vw 80px' }}>
        <div style={{ marginBottom: 32 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#FF9933', fontWeight: 700 }}>Legal</span>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: '#ffffff', margin: '8px 0 4px', letterSpacing: '-0.5px' }}>Privacy Policy</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Last Updated: September 2026</p>
        </div>

        <div style={{ background: '#0E2340', border: '1px solid #1e3a5f', borderRadius: 12, padding: '32px 36px', lineHeight: 1.8, fontSize: 15 }}>
          <p style={{ marginTop: 0, color: '#cbd5e1' }}>
            At <strong style={{ color: '#ffffff' }}>election2026sir.in</strong>, we respect your privacy and are committed to protecting the information you provide to us.
          </p>

          {[
            {
              title: 'Information We Collect',
              body: 'We may collect information such as your name, mobile number, email address, location, electoral-related information and other details that you voluntarily submit through our website.',
            },
            {
              title: 'How We Use Information',
              items: [
                'Provide requested services and information.',
                'Respond to enquiries and support requests.',
                'Maintain and improve our website and services.',
                'Communicate with users regarding relevant services or updates.',
                'Comply with applicable legal and regulatory requirements.',
              ],
            },
            {
              title: 'Data Protection',
              body: 'We take reasonable technical and organisational measures to protect personal information from unauthorised access, misuse, alteration or disclosure.',
            },
            {
              title: 'Sharing of Information',
              body: 'We do not sell or rent personal information. Information may be shared with service providers, authorities or other parties where necessary to provide requested services, comply with legal obligations, or protect our rights and users.',
            },
            {
              title: 'Cookies',
              body: 'Our website may use cookies or similar technologies to improve functionality, analyse website usage and enhance user experience.',
            },
            {
              title: 'Third-Party Websites',
              body: 'Our website may contain links to third-party websites. We are not responsible for the privacy practices or content of those websites.',
            },
            {
              title: 'Data Retention',
              body: 'We retain personal information only for as long as reasonably necessary for the purposes for which it was collected or as required by applicable law.',
            },
            {
              title: 'Your Rights',
              body: 'Subject to applicable law, you may request access to, correction of, or deletion of your personal information by contacting us.',
            },
            {
              title: 'Policy Updates',
              body: 'We may update this Privacy Policy from time to time. The updated version will be published on this page with the revised date.',
            },
            {
              title: 'Contact Us',
              body: 'For privacy-related questions or requests, please contact us using the contact details provided on election2026sir.in.',
            },
          ].map((sec) => (
            <div key={sec.title} style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#FF9933', margin: '0 0 6px' }}>{sec.title}</h2>
              {sec.items ? (
                <ul style={{ margin: '4px 0 0', paddingLeft: 20, color: '#cbd5e1' }}>
                  {sec.items.map((item) => <li key={item} style={{ marginBottom: 4 }}>{item}</li>)}
                </ul>
              ) : (
                <p style={{ margin: 0, color: '#cbd5e1' }}>{sec.body}</p>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 16 }}>
          <Link to="/terms" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'underline' }}>Terms &amp; Conditions</Link>
          <Link to="/register" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'underline' }}>Back to Register</Link>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #303f9f', padding: '24px 6vw', textAlign: 'center', fontSize: 12.5, color: '#64748b' }}>
        © 2026 <strong style={{ color: '#94a3b8' }}>Election Data Management</strong> — Political Consulting &amp; Election Campaign Management ·{' '}
        <span style={{ color: '#475569' }}>election2026sir.in</span>
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', gap: 16 }}>
          <Link to="/terms" style={{ color: '#64748b', textDecoration: 'none' }}>Terms &amp; Conditions</Link>
          <Link to="/privacy" style={{ color: '#64748b', textDecoration: 'none' }}>Privacy Policy</Link>
          <Link to="/faq" style={{ color: '#64748b', textDecoration: 'none' }}>FAQ</Link>
        </div>
      </footer>
    </div>
  );
}
