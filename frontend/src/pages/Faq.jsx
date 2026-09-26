import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';

const FAQ_DATA = [
  {
    cat: "நிறுவனம் பற்றி",
    en: "About Us",
    items: [
      { q: "Election Data Management என்றால் என்ன?", a: "Election Data Management என்பது அரசியலுக்கு வர விரும்பும் வேட்பாளர்களுக்கு முழுமையான Political Consulting & Election Campaign Management சேவைகளை வழங்கும் நிறுவனம்.\n\nCandidate Profiling, Political Branding, Website Development, Social Media Management, WhatsApp Automation, Mobile App Development, Survey & Research, Voter Data Analysis, Campaign Strategy, Video Production, Election Day War Room Management போன்ற அனைத்து தேர்தல் தொடர்பான சேவைகளையும் ஒரே இடத்தில் வழங்குகிறோம்." },
      { q: "உங்கள் நிறுவனத்தின் முக்கிய நோக்கம் என்ன?", a: "எங்களின் நோக்கம் வெறும் Digital Marketing செய்வது அல்ல. மக்களுக்கு சேவை செய்ய விரும்பும் வேட்பாளர்களை தொழில்முறை முறையில் மக்களிடம் கொண்டு சேர்த்து, அவர்களின் அரசியல் பயணத்தை திட்டமிட்ட முறையில் உருவாக்குவதே எங்களின் முக்கிய நோக்கம்." },
      { q: "யார் உங்கள் சேவைகளைப் பெறலாம்?", a: "சுயேட்சை வேட்பாளர்கள் · ஊராட்சி மன்ற தலைவர் வேட்பாளர்கள் · வார்டு உறுப்பினர் வேட்பாளர்கள் · பேரூராட்சி வேட்பாளர்கள் · நகராட்சி வேட்பாளர்கள் · மாநகராட்சி வேட்பாளர்கள் · மாவட்ட ஊராட்சி உறுப்பினர்கள் · அரசியல் கட்சிகள் · சட்டமன்ற (MLA) வேட்பாளர்கள் · நாடாளுமன்ற (MP) வேட்பாளர்கள்." },
      { q: "நான் முதல் முறையாக தேர்தலில் போட்டியிடப் போகிறேன். எனக்கு உதவ முடியுமா?", a: "கண்டிப்பாக. முதல் முறையாக தேர்தலில் போட்டியிடும் வேட்பாளர்களுக்கு தேர்தல் நடைமுறைகள், Campaign Planning, Candidate Branding, Digital Promotion, Voter Communication மற்றும் Election Day Management வரை முழுமையான வழிகாட்டுதலை வழங்குகிறோம்." },
      { q: "அரசியலில் எந்த அனுபவமும் இல்லை. இருந்தாலும் உங்கள் சேவையைப் பெற முடியுமா?", a: "ஆம். அரசியலில் அனுபவம் இல்லாத பலர் மக்களுக்கு சேவை செய்ய வேண்டும் என்ற எண்ணத்துடன் அரசியலுக்கு வருகிறார்கள். அவர்களுக்கு தேவையான அரசியல் திட்டமிடல், பிரச்சார மேலாண்மை மற்றும் தொழில்நுட்ப ஆதரவை வழங்குவதே எங்கள் பணி." },
      { q: "சுயேட்சை வேட்பாளர்களுக்கும் சேவை இருக்கிறதா?", a: "ஆம். சுயேட்சை வேட்பாளர்களுக்காக தனிப்பட்ட Branding, Website, Social Media, Campaign Strategy, Survey, Volunteer Management, WhatsApp Automation மற்றும் Election Day Support போன்ற முழுமையான சேவைகளை வழங்குகிறோம்." }
    ]
  },
  {
    cat: "தேர்தலில் நுழைவது",
    en: "Getting Started",
    items: [
      { q: "தேர்தலில் போட்டியிட என்னென்ன Documents தேவை?", a: "Nomination Form · Passport Size Photo · Voter ID · Aadhaar · Address Proof · Affidavit · Deposit Receipt · தேவையான பிற ஆவணங்கள். தேர்தல் ஆணைய விதிமுறைகளுக்கு ஏற்ப தயாரிக்க வேண்டும். அதற்கான வழிகாட்டுதலையும் வழங்குகிறோம்." },
      { q: "Nomination Filing-ல் உதவுவீர்களா?", a: "ஆம். Nomination Filing செய்யும் முன் தேவையான ஆவணங்கள் சரியாக உள்ளதா என்பதை சரிபார்க்கவும், Form Filling தொடர்பான வழிகாட்டுதலையும் வழங்குகிறோம்." },
      { q: "எந்த Ward அல்லது Constituency-ல் போட்டியிட வேண்டும் என்பதை எப்படி தேர்வு செய்வது?", a: "எல்லா Ward-லும் போட்டியிடுவது சரியான முடிவு இல்லை. Survey Reports, மக்கள் ஆதரவு, Voter Data, Political Situation, Ground Feedback போன்றவற்றை ஆய்வு செய்து எந்த Ward அல்லது Constituency உங்களுக்கு ஏற்றது என்பதை திட்டமிட உதவுகிறோம்." },
      { q: "தேர்தலுக்கு எவ்வளவு முன்பே Campaign ஆரம்பிக்க வேண்டும்?", a: "சிறந்த Campaign-க்கு குறைந்தது 3 முதல் 6 மாதங்களுக்கு முன்பே திட்டமிடுவது நல்லது. அதனால் Branding, Survey, Social Media Presence, Volunteer Network மற்றும் Public Awareness ஆகியவற்றை படிப்படியாக உருவாக்க முடியும்." },
      { q: "Election Campaign-க்கு ஒரு Checklist தருவீர்களா?", a: "ஆம். Candidate Profile · Professional Photos · Website · Social Media Pages · WhatsApp Business Setup · Campaign Logo & Tagline · Volunteer Team · Survey Plan · Campaign Calendar · Election Manifesto · Public Meeting Plan · Campaign Videos · Contact Database." },
      { q: "தேர்தலுக்கு 90 நாட்களுக்கு முன் என்ன செய்ய வேண்டும்?", a: "Candidate Branding · Website Launch · Social Media Setup · Survey & Research · Volunteer Recruitment · Campaign Theme · Photo & Video Shoot · Public Introduction · Digital Campaign Planning போன்ற அடிப்படை பணிகளை தொடங்க வேண்டும்." },
      { q: "தேர்தலுக்கு 30 நாட்களுக்கு முன் என்ன செய்ய வேண்டும்?", a: "கடைசி 30 நாட்கள் மிகவும் முக்கியமானவை. Door-to-Door Campaign · Public Meetings · Daily Social Media Updates · WhatsApp Communication · Booth Preparation · Volunteer Coordination · Voter Awareness ஆகியவற்றில் முழு கவனம் செலுத்த வேண்டும்." }
    ]
  },
  {
    cat: "Branding & Digital",
    en: "Branding & Presence",
    items: [
      { q: "Candidate Profiling என்றால் என்ன?", a: "ஒரு வேட்பாளரின் கல்வி, அனுபவம், சமூகப்பணி, சாதனைகள், Vision மற்றும் மக்களுக்கு வழங்க விரும்பும் திட்டங்களை Professional முறையில் மக்களிடம் அறிமுகப்படுத்தும் செயல்முறையே Candidate Profiling. இது மக்கள் மனதில் நம்பிக்கையை உருவாக்க உதவுகிறது." },
      { q: "Political Branding ஏன் முக்கியம்?", a: "ஒரு வேட்பாளரை மக்கள் நினைவில் வைத்துக்கொள்ள Branding மிகவும் முக்கியமானது. Logo, Colour Theme, Tagline, Professional Photos, Consistent Design மற்றும் Public Image ஆகியவை ஒரு வலுவான Political Brand உருவாக்க உதவும்." },
      { q: "எனக்காக தனிப்பட்ட Website உருவாக்குவீர்களா?", a: "ஆம். உங்கள் Profile, Vision, Achievements, Gallery, News, Events, Volunteer Registration, Contact Details போன்ற அனைத்து தகவல்களும் இடம்பெறும் Professional Website உருவாக்குகிறோம்." },
      { q: "Website எவ்வளவு நாளில் Ready ஆகும்?", a: "பொதுவாக 3 முதல் 7 வேலை நாட்களுக்குள் Website தயார் செய்ய முடியும். Custom Features அல்லது Mobile App Integration இருந்தால் கூடுதல் கால அவகாசம் தேவைப்படலாம்." },
      { q: "Social Media Management செய்வீர்களா?", a: "ஆம். Facebook, Instagram, YouTube, X (Twitter) உள்ளிட்ட அனைத்து Social Media Platforms-ல் Professional Setup, Daily Content, Reels, Shorts, Posters, Videos மற்றும் Campaign Management சேவைகளை வழங்குகிறோம்." },
      { q: "WhatsApp Automation என்றால் என்ன?", a: "Auto Reply · AI Chatbot · Volunteer Registration · Campaign Updates · Event Notifications · Public Enquiry Handling போன்ற சேவைகளை தானியங்கி முறையில் வழங்க முடியும்." },
      { q: "WhatsApp Bulk Messaging செய்ய முடியுமா?", a: "ஆம். WhatsApp Business Platform-க்கு ஏற்ப Template Messages, Broadcast Campaigns மற்றும் Campaign Communication Solutions வழங்குகிறோம். சட்ட விதிமுறைகள் மற்றும் Platform Policies-க்கு இணங்க செயல்படுகிறோம்." },
      { q: "Mobile App உருவாக்க முடியுமா?", a: "ஆம். Candidate App, Volunteer App மற்றும் Campaign Management App ஆகியவற்றை Android மற்றும் iOS தளங்களுக்கு உருவாக்குகிறோம்." }
    ]
  },
  {
    cat: "Survey & Voter Data",
    en: "Research & Data",
    items: [
      { q: "Survey & Opinion Poll நடத்துவீர்களா?", a: "ஆம். Opinion Poll · Door-to-Door Survey · Public Feedback Collection · Issue-Based Survey · Voter Sentiment Analysis போன்ற சேவைகளை வழங்குகிறோம்." },
      { q: "Voter Data Analysis என்றால் என்ன?", a: "Ward, Booth மற்றும் வாக்காளர் தகவல்களை ஆய்வு செய்து Campaign-ஐ திட்டமிட உதவும் ஒரு செயல்முறை. Booth-wise Analysis · Ward Performance · Priority Areas · Voter Segmentation · Campaign Focus Areas போன்றவற்றை அறிந்து, நேரம் மற்றும் வளங்களை சரியான இடங்களில் பயன்படுத்த முடியும்." }
    ]
  },
  {
    cat: "Campaign Strategy & Content",
    en: "Strategy & Content",
    items: [
      { q: "Election Strategy என்றால் என்ன?", a: "ஒரு வேட்பாளர் எப்போது, எங்கு, யாரை, எப்படி சந்திக்க வேண்டும், எந்த பிரச்சினைகளை முன்னிலைப்படுத்த வேண்டும், எந்த பகுதிகளில் அதிக கவனம் செலுத்த வேண்டும் என்பதை திட்டமிடும் செயல்முறையாகும்." },
      { q: "Campaign Plan தயாரித்து தருவீர்களா?", a: "ஆம். Campaign Calendar · Public Meetings · Door-to-Door Visits · Social Media Schedule · Volunteer Activities · Special Events · Daily Campaign Plan அடங்கிய முழுமையான Campaign Roadmap-ஐ உருவாக்குகிறோம்." },
      { q: "Election Manifesto தயாரித்து தருவீர்களா?", a: "ஆம். உங்கள் Vision, தொகுதியின் தேவைகள் மற்றும் மக்களின் எதிர்பார்ப்புகளை அடிப்படையாகக் கொண்டு Professional Election Manifesto தயாரித்து வழங்குகிறோம்." }
    ]
  },
  {
    cat: "Volunteer & Booth Management",
    en: "Ground Operations",
    items: [
      { q: "Volunteer Management எப்படி செய்வீர்கள்?", a: "Volunteer Registration முதல் Team Allocation வரை அனைத்தையும் திட்டமிட்ட முறையில் நிர்வகிக்க உதவுகிறோம். Area-wise Assignment · Daily Tasks · Attendance Tracking · Internal Communication ஆகிய வசதிகளும் வழங்கப்படுகின்றன." },
      { q: "Booth Committee அமைக்க உதவுவீர்களா?", a: "ஆம். ஒவ்வொரு Booth-க்கும் தேவையான Planning, Team Structure, பொறுப்புகள் பிரித்தல் மற்றும் Coordination தொடர்பாக வழிகாட்டுகிறோம்." }
    ]
  },
  {
    cat: "War Room & AI",
    en: "Election Day & Tech",
    items: [
      { q: "Election War Room என்றால் என்ன?", a: "தேர்தல் பிரச்சாரம் மற்றும் தேர்தல் நாளில் நடைபெறும் முக்கிய செயல்பாடுகளை ஒருங்கிணைத்து கண்காணிக்கும் மையமாகும். Booth Monitoring · Volunteer Coordination · Live Updates · Issue Tracking." },
      { q: "AI Technology தேர்தல் Campaign-க்கு எப்படி உதவும்?", a: "Content Ideas · Speech Drafts · Social Media Content Planning · FAQ Automation · Chat Assistance · Data Analysis · Campaign Planning போன்ற பணிகளை வேகமாகவும் திறமையாகவும் செய்ய AI உதவுகிறது." }
    ]
  },
  {
    cat: "Why Choose Us",
    en: "Why Choose Us",
    items: [
      { q: "Election Data Management-ஐ ஏன் தேர்வு செய்ய வேண்டும்?", a: "நாங்கள் ஒரு Digital Marketing Agency மட்டும் அல்ல. Political Consulting, Candidate Branding, Website Development, Mobile App, Social Media Management, WhatsApp Automation, AI Solutions, Survey & Research, Voter Data Analysis, Campaign Strategy, Video Production, Election War Room Support — தேர்தலுக்குத் தேவையான அனைத்து சேவைகளும் ஒரே இடத்தில்." }
    ]
  }
];

export default function Faq() {
  const [activeCat, setActiveCat] = useState('ALL');
  const [search, setSearch] = useState('');
  const [openItems, setOpenItems] = useState({});

  const toggleItem = (key) => {
    setOpenItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredData = useMemo(() => {
    const term = search.trim().toLowerCase();
    return FAQ_DATA.map((c) => {
      if (activeCat !== 'ALL' && activeCat !== c.cat) return null;
      const items = c.items.filter(
        (it) => !term || it.q.toLowerCase().includes(term) || it.a.toLowerCase().includes(term)
      );
      if (items.length === 0) return null;
      return { ...c, items };
    }).filter(Boolean);
  }, [activeCat, search]);

  return (
    <div style={{ minHeight: '100vh', background: '#0d1642', color: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Noto Sans Tamil", sans-serif' }}>
      
      {/* Top Tricolor Accent Bar */}
      <div style={{ height: 4, background: 'linear-gradient(90deg, #FF9933 0%, #FF9933 33.33%, #FFFFFF 33.33%, #FFFFFF 66.66%, #138808 66.66%, #138808 100%)', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000 }} />

      {/* MASTHEAD HEADER */}
      <header style={{ borderBottom: '3px double #FF9933', background: 'linear-gradient(180deg, #1a237e 0%, #0d1642 100%)', padding: '32px 6vw 36px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #303f9f', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', color: '#FF9933', fontWeight: 700 }}>
            EDM · GAZETTE OF CAMPAIGNS · EST. FOR ELECTION 2026
          </div>
          <Link
            to="/register"
            style={{
              color: '#FF9933',
              textDecoration: 'none',
              fontWeight: 700,
              border: '1px solid #FF9933',
              borderRadius: 6,
              padding: '6px 16px',
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255,153,51,0.1)',
            }}
          >
            ← Back to Register / பதிவு பக்கம்
          </Link>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <svg width="48" height="48" viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="26" r="24" stroke="#FF9933" strokeWidth="1.5" />
              <circle cx="26" cy="26" r="19" stroke="#FF9933" strokeWidth="1" />
              <path d="M26 14 L29 23 L38 23 L31 29 L34 38 L26 32 L18 38 L21 29 L14 23 L23 23 Z" fill="#FF9933" />
            </svg>
            <div>
              <div style={{ fontSize: 13, letterSpacing: '0.18em', color: '#FF9933', fontWeight: 800, textTransform: 'uppercase' }}>
                Election Data Management 2026
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Political Consulting &amp; Election Campaign Management
              </div>
            </div>
          </div>
          <p style={{ fontStyle: 'italic', color: '#cbd5e1', fontSize: 15, margin: 0, maxWidth: 420, textAlign: 'right' }}>
            "அரசியலில் வெற்றி என்பது ஒரு நாள் நிகழ்வு அல்ல; அது திட்டமிட்ட பயணம்."
          </p>
        </div>

        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, margin: '24px 0 0', color: '#ffffff' }}>
          அடிக்கடி கேட்கப்படும் <span style={{ color: '#FF9933' }}>கேள்விகள் (FAQ)</span>
        </h1>
      </header>

      {/* EVM CATEGORY PANEL */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '34px 6vw 10px' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.16em', color: '#FF9933', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>பிரிவு தேர்வு செய்யவும் — EVM Panel</span>
        </div>

        <div style={{ background: 'linear-gradient(180deg, #122A4A, #0C1F38)', border: '1px solid #303f9f', borderRadius: 12, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <button
            onClick={() => setActiveCat('ALL')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: activeCat === 'ALL' ? 'linear-gradient(180deg, #1B3A61, #122A4A)' : '#0E2340',
              border: activeCat === 'ALL' ? '1px solid #FF9933' : '1px solid #303f9f',
              borderRadius: 8,
              padding: '10px 12px',
              cursor: 'pointer',
              color: '#ffffff',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 11, color: activeCat === 'ALL' ? '#FF9933' : '#7C8FAE', width: 22, height: 22, borderRadius: '50%', border: '1px solid #303f9f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>00</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>அனைத்தும்<br/><span style={{ fontSize: 10, color: '#94a3b8' }}>All Sections</span></span>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: activeCat === 'ALL' ? '#dc2626' : '#3A4A63', marginLeft: 'auto', boxShadow: activeCat === 'ALL' ? '0 0 8px 2px rgba(220,38,38,0.75)' : 'none' }} />
          </button>

          {FAQ_DATA.map((c, idx) => {
            const active = activeCat === c.cat;
            return (
              <button
                key={c.cat}
                onClick={() => setActiveCat(c.cat)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: active ? 'linear-gradient(180deg, #1B3A61, #122A4A)' : '#0E2340',
                  border: active ? '1px solid #FF9933' : '1px solid #303f9f',
                  borderRadius: 8,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  color: '#ffffff',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 11, color: active ? '#FF9933' : '#7C8FAE', width: 22, height: 22, borderRadius: '50%', border: '1px solid #303f9f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{String(idx + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{c.cat}<br/><span style={{ fontSize: 10, color: '#94a3b8' }}>{c.en}</span></span>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: active ? '#dc2626' : '#3A4A63', marginLeft: 'auto', boxShadow: active ? '0 0 8px 2px rgba(220,38,38,0.75)' : 'none' }} />
              </button>
            );
          })}
        </div>
      </div>

      {/* SEARCH BAR */}
      <div style={{ maxWidth: 1180, margin: '20px auto 0', padding: '0 6vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0E2340', border: '1px solid #303f9f', borderRadius: 10, padding: '12px 16px' }}>
          <span style={{ fontSize: 18, color: '#7C8FAE' }}>🔍</span>
          <input
            type="text"
            placeholder="கேள்வியில் தேடுங்கள்... (Search FAQ topics, e.g. Website, Booth, Survey, Nomination)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: 'none', border: 'none', outline: 'none', color: '#ffffff', fontSize: 14, width: '100%', fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* FAQ QUESTIONS LIST ACCORDION */}
      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '26px 6vw 80px' }}>
        {filteredData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8', fontSize: 16 }}>
            இந்த தேடலுக்கு பொருந்தும் கேள்விகள் இல்லை — WhatsApp மூலம் நேரடியாக கேளுங்கள்.
          </div>
        ) : (
          filteredData.map((c, ci) => (
            <div key={c.cat} style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#FF9933', margin: '24px 0 16px', display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span>{c.cat}</span>
                <span style={{ fontSize: 14, fontStyle: 'italic', color: '#94a3b8', fontWeight: 400 }}>{c.en}</span>
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {c.items.map((it, ii) => {
                  const itemKey = `${c.cat}-${ii}`;
                  const isOpen = !!openItems[itemKey];
                  const serialNo = `Q.${String(ci + 1).padStart(2, '0')}${String(ii + 1).padStart(2, '0')}`;

                  return (
                    <div
                      key={itemKey}
                      style={{
                        background: '#ffffff',
                        color: '#111827',
                        borderRadius: 8,
                        display: 'grid',
                        gridTemplateColumns: '74px 1fr',
                        overflow: 'hidden',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                      }}
                    >
                      {/* Ticket Stub */}
                      <div style={{ background: '#f8fafc', borderRight: '2px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 4px', position: 'relative' }}>
                        <span style={{ fontSize: 8, letterSpacing: '0.08em', color: '#8b5cf6', fontWeight: 700, textTransform: 'uppercase' }}>Ballot No.</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#1a237e', marginTop: 2 }}>{serialNo}</span>
                      </div>

                      {/* Ticket Body */}
                      <div style={{ padding: '16px 20px' }}>
                        <div
                          onClick={() => toggleItem(itemKey)}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: 14, cursor: 'pointer', userSelect: 'none' }}
                        >
                          <span
                            style={{
                              flexShrink: 0,
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              border: '2px solid #1a237e',
                              display: 'flex',
                              alignItems: 'center',
                              justify: 'center',
                              background: isOpen ? '#1a237e' : 'transparent',
                              color: isOpen ? '#ffffff' : '#1a237e',
                              fontWeight: 800,
                              fontSize: 14,
                              transition: 'all 0.2s ease',
                            }}
                          >
                            {isOpen ? '▲' : '▼'}
                          </span>
                          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.5, color: '#0f172a', paddingTop: 2 }}>
                            {it.q}
                          </p>
                        </div>

                        {isOpen && (
                          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #cbd5e1' }}>
                            <div style={{ fontSize: 14.5, lineHeight: 1.75, color: '#334155', whiteSpace: 'pre-line' }}>
                              {it.a}
                            </div>
                            <div style={{ marginTop: 12 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#16a34a', border: '1px solid #16a34a', borderRadius: 4, padding: '3px 10px', textTransform: 'uppercase', background: '#f0fdf4' }}>
                                ✓ Verified Answer
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </main>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid #303f9f', padding: '24px 6vw', textAlign: 'center', fontSize: 12.5, color: '#94a3b8' }}>
        © 2026 <strong style={{ color: '#cbd5e1' }}>Election Data Management</strong> — Political Consulting &amp; Election Campaign Management · tnedms.com
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', gap: 20 }}>
          <Link to="/terms" style={{ color: '#64748b', textDecoration: 'none' }}>Terms &amp; Conditions</Link>
          <Link to="/privacy" style={{ color: '#64748b', textDecoration: 'none' }}>Privacy Policy</Link>
          <Link to="/register" style={{ color: '#64748b', textDecoration: 'none' }}>Register</Link>
        </div>
      </footer>
    </div>
  );
}
