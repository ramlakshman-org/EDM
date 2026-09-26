import { Link } from 'react-router-dom';

export default function TermsAndConditions() {
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
            <Link to="/privacy" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link to="/faq" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'none' }}>FAQ</Link>
            <Link to="/register" style={{ fontSize: 13, color: '#FF9933', textDecoration: 'none', fontWeight: 600 }}>Register →</Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 860, margin: '0 auto', padding: '48px 6vw 80px' }}>
        <div style={{ marginBottom: 32 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#FF9933', fontWeight: 700 }}>Legal</span>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: '#ffffff', margin: '8px 0 4px', letterSpacing: '-0.5px' }}>Terms &amp; Conditions</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Last Updated: September 2026</p>
        </div>

        <div style={{ background: '#0E2340', border: '1px solid #1e3a5f', borderRadius: 12, padding: '32px 36px', lineHeight: 1.8, fontSize: 15 }}>
          <p style={{ marginTop: 0 }}>
            Welcome to <strong style={{ color: '#ffffff' }}>tnedms.com</strong>. By accessing or using this website, you agree to the following Terms &amp; Conditions.
          </p>

          {[
            {
              n: '1', title: 'Purpose of Website',
              body: 'This website provides information and/or digital services relating to election data, electoral information and SIR-2026-related activities.',
            },
            {
              n: '2', title: 'Information Accuracy',
              body: 'We make reasonable efforts to provide accurate and updated information. However, we do not guarantee that all information is complete, current or error-free.',
            },
            {
              n: '3', title: 'No Official Government Affiliation',
              body: 'Unless expressly stated otherwise, this website is not an official website of the Election Commission of India or any government department. Users should verify official election-related information through the appropriate government/ECI sources.',
            },
            {
              n: '4', title: 'User Responsibility',
              body: 'Users are responsible for providing accurate information and using the website only for lawful purposes.',
            },
            {
              n: '5', title: 'Third-Party Links',
              body: 'The website may contain links to third-party websites. We are not responsible for the content, privacy practices or availability of such external websites.',
            },
            {
              n: '6', title: 'Intellectual Property',
              body: 'Website content, design, graphics, logos and other materials are protected by applicable intellectual-property laws unless otherwise stated.',
            },
            {
              n: '7', title: 'Limitation of Liability',
              body: 'We shall not be liable for any direct or indirect loss arising from the use of, or reliance upon, information or services available through this website.',
            },
            {
              n: '8', title: 'Changes to Terms',
              body: 'We reserve the right to update these Terms & Conditions at any time. Changes will be effective when published on this page.',
            },
            {
              n: '9', title: 'Contact',
              body: 'For questions regarding these Terms & Conditions, please contact us through the contact details provided on the website.',
            },
          ].map((sec) => (
            <div key={sec.n} style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#FF9933', margin: '0 0 6px' }}>
                {sec.n}. {sec.title}
              </h2>
              <p style={{ margin: 0, color: '#cbd5e1' }}>{sec.body}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 16 }}>
          <Link to="/privacy" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'underline' }}>Privacy Policy</Link>
          <Link to="/register" style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'underline' }}>Back to Register</Link>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #303f9f', padding: '24px 6vw', textAlign: 'center', fontSize: 12.5, color: '#64748b' }}>
        © 2026 <strong style={{ color: '#94a3b8' }}>Election Data Management</strong> — Political Consulting &amp; Election Campaign Management ·{' '}
        <span style={{ color: '#475569' }}>tnedms.com</span>
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', gap: 16 }}>
          <Link to="/terms" style={{ color: '#64748b', textDecoration: 'none' }}>Terms &amp; Conditions</Link>
          <Link to="/privacy" style={{ color: '#64748b', textDecoration: 'none' }}>Privacy Policy</Link>
          <Link to="/faq" style={{ color: '#64748b', textDecoration: 'none' }}>FAQ</Link>
        </div>
      </footer>
    </div>
  );
}
