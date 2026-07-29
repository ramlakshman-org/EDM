import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { IconMail, IconWhatsApp } from '../components/Icons.jsx';

// Speaker Icon for Audio SMS
function IconAudio({ size = 24, color = "#e53935" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

const SERVICES = [
  { key: 'sms', title: 'SMS Broadcast', desc: 'Send targeted text SMS to voter groups', color: '#d85028', bg: '#fef2f0', icon: IconMail, max: 70 },
  { key: 'voice', title: 'Audio SMS', desc: 'Broadcast pre-recorded audio voice messages', color: '#e53935', bg: '#fdeded', icon: IconAudio },
  { key: 'whatsapp', title: 'WhatsApp Broadcast', desc: 'Send rich media image and template broadcasts', color: '#25D366', bg: '#eefbf3', icon: IconWhatsApp, max: 100 },
];

export default function SocialMedia() {
  const [meta, setMeta] = useState({ isSample: false, boothList: [], existingRequests: {} });
  const [service, setService] = useState(null); // active service key for popup modal
  const [form, setForm] = useState({ all_voters: false, booth: '', section_no: '', language: 'English', message: '' });
  const [sections, setSections] = useState([]);
  const [fileName, setFileName] = useState('');
  const [fileObj, setFileObj] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => api.get('/ward/social-media').then(({ data }) => setMeta(data)).catch((e) => setErr(e.response?.data?.message || 'Failed to load.'));
  useEffect(() => { load(); }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFileObj(file);
    setFileName(file.name);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const removeFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFileObj(null);
    setFileName('');
    setPreviewUrl('');
  };

  const openService = (key) => {
    if (meta.existingRequests[key]) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setService(key);
    setForm({ all_voters: false, booth: '', section_no: '', language: 'English', message: '' });
    setSections([]); setFileObj(null); setFileName(''); setPreviewUrl(''); setMsg(''); setErr('');
  };

  const onBoothChange = async (val) => {
    setForm((f) => ({ ...f, booth: val, section_no: '' }));
    setSections([]);
    if (!val) return;
    const [assembly_no, part_no] = val.split('_');
    try {
      const { data } = await api.get('/ward/social-media/booth-sections', { params: { assembly_no, part_no, is_sample: meta.isSample ? 1 : 0 } });
      setSections(Array.isArray(data) ? data : []);
    } catch { setSections([]); }
  };

  const cfg = SERVICES.find((s) => s.key === service);
  const audienceOk = form.all_voters || !!form.booth;
  const msgLen = form.message.trim().length;
  const valid = service && audienceOk && (
    service === 'sms' ? (msgLen > 0 && msgLen <= 70)
      : service === 'voice' ? !!fileName
      : (msgLen > 0 && msgLen <= 100 && !!fileName)
  );

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });

  const submit = async () => {
    setMsg(''); setErr(''); setSubmitting(true);
    try {
      let fileDataUrl = '';
      if (fileObj) {
        fileDataUrl = await fileToBase64(fileObj);
      }
      const payload = {
        service_type: service,
        all_voters: form.all_voters ? '1' : '',
        booth: form.all_voters ? '' : form.booth,
        section_no: form.all_voters ? '' : form.section_no,
        language: form.language,
        sms_message_content: service === 'sms' ? form.message : '',
        whatsapp_message_content: service === 'whatsapp' ? form.message : '',
        has_image: (service === 'whatsapp' || service === 'sms') && !!fileName,
        has_audio: service === 'voice' && !!fileName,
        file_data_url: fileDataUrl,
        file_name: fileName,
      };
      const { data } = await api.post('/ward/social-media/request', payload);
      if (data.success) { setMsg(data.message || 'Request submitted successfully!'); removeFile(); setService(null); load(); }
      else setErr(data.message);
    } catch (e) { setErr(e.response?.data?.message || 'Request failed.'); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ maxWidth: 840, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Social Media Broadcasts</h1>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>
          Select a service to send targeted SMS, Audio, or WhatsApp messages to voters in your ward.
        </p>
      </div>

      {msg && <div className="alert success" style={{ borderRadius: 12, padding: '12px 18px', marginBottom: 16 }}>{msg}</div>}
      {err && <div className="alert err" style={{ borderRadius: 12, padding: '12px 18px', marginBottom: 16 }}>{err}</div>}

      {/* Service Selection Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
        {SERVICES.map((s) => {
          const requested = meta.existingRequests[s.key];
          const isSelected = service === s.key;
          const IconComp = s.icon;
          return (
            <div
              key={s.key}
              onClick={() => openService(s.key)}
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: '20px 18px',
                border: isSelected ? `2px solid ${s.color}` : '1px solid #e2e8f0',
                boxShadow: isSelected ? `0 8px 24px ${s.color}22` : '0 2px 8px rgba(0,0,0,0.04)',
                cursor: requested ? 'not-allowed' : 'pointer',
                opacity: requested ? 0.75 : 1,
                transition: 'all 0.2s ease-in-out',
                display: 'flex',
                flexDirection: 'column',
                justify: 'space-between',
                position: 'relative',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IconComp size={24} color={s.color} />
                  </div>
                  {requested && <span className="badge-success" style={{ borderRadius: 20, padding: '4px 10px', fontSize: 12 }}>✓ Requested</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 4 }}>{s.title}</div>
                <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>{s.desc}</div>
              </div>
              <div style={{ marginTop: 16, textAlign: 'right' }}>
                {!requested && (
                  <button
                    className={isSelected ? '' : 'secondary'}
                    style={{
                      borderRadius: 20,
                      padding: '7px 18px',
                      fontSize: 13,
                      fontWeight: 600,
                      background: isSelected ? s.color : undefined,
                      borderColor: isSelected ? s.color : undefined,
                      color: isSelected ? '#fff' : undefined,
                    }}
                  >
                    {isSelected ? 'Active Form' : 'Select'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Request Form Popup Modal */}
      {service && cfg && (
        <div className="modal-overlay" onClick={() => setService(null)} style={{ padding: 10 }}>
          <div
            className="modal-box sm-modal-box"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 640,
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              borderRadius: 18,
              padding: '18px 16px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            }}
          >
            {/* Header Bar with Service Icon, Title and Close Button */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                marginBottom: 14,
                paddingBottom: 10,
                borderBottom: '1px solid #e2e8f0',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: cfg.bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <cfg.icon size={20} color={cfg.color} />
                </div>
                <h2 style={{ margin: 0, fontSize: 17, color: cfg.color, fontWeight: 700, lineHeight: 1.2 }}>
                  Create {cfg.title} Request
                </h2>
              </div>
              <button className="modal-close" onClick={() => setService(null)} style={{ fontSize: 24, cursor: 'pointer', padding: '0 4px' }}>×</button>
            </div>

            {/* Filter Audience Box */}
            <div className="sm-audience-box" style={{ background: '#f8fafc', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0f172a' }}>Filter Target Audience</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>Select polling booth &amp; section, or send to all</div>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: form.all_voters ? '#e0f2fe' : '#fff', border: form.all_voters ? '1.5px solid #0284c7' : '1px solid #cbd5e1', padding: '6px 12px', borderRadius: 16, color: form.all_voters ? '#0369a1' : '#334155', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <input type="checkbox" checked={form.all_voters} onChange={(e) => setForm({ ...form, all_voters: e.target.checked, booth: '', section_no: '' })} style={{ width: 15, height: 15, accentColor: '#0284c7' }} />
                  <span>All Voters</span>
                </label>
              </div>

              {!form.all_voters && (
                <div className="sm-booth-grid">
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#475569' }}>Select Booth *</label>
                    <select value={form.booth} onChange={(e) => onBoothChange(e.target.value)} style={{ borderRadius: 8, padding: '8px 10px', border: '1px solid #cbd5e1', width: '100%', background: '#fff', fontSize: 13 }}>
                      <option value="">Choose Booth</option>
                      {meta.boothList.map((b) => <option key={`${b.assembly_no}_${b.part_no}`} value={`${b.assembly_no}_${b.part_no}`}>{b.booth_name} (Part {b.part_no})</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#475569' }}>Select Section (Optional)</label>
                    <select value={form.section_no} onChange={(e) => setForm({ ...form, section_no: e.target.value })} style={{ borderRadius: 8, padding: '8px 10px', border: '1px solid #cbd5e1', width: '100%', background: '#fff', fontSize: 13 }}>
                      <option value="">All Sections</option>
                      {sections.map((s) => <option key={s} value={s}>Section {s}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Form Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {service === 'sms' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#475569' }}>Select Language *</label>
                    <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} style={{ borderRadius: 8, padding: '8px 10px', border: '1px solid #cbd5e1', width: '100%', background: '#fff', fontSize: 13 }}>
                      <option>English</option><option>Tamil</option><option>Kannada</option><option>Malayalam</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#475569' }}>Photo Attachment (Optional)</label>
                    {previewUrl ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 10 }}>
                        <img src={previewUrl} alt="Preview" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12.5, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>
                          <div className="muted" style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>Image Selected</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <label style={{ cursor: 'pointer', background: '#e2e8f0', color: '#334155', borderRadius: 14, padding: '5px 10px', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Change
                            <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                          </label>
                          <button type="button" onClick={removeFile} style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: 14, padding: '5px 10px', fontSize: 11.5, fontWeight: 600 }}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <input type="file" accept="image/*" onChange={handleFileChange} style={{ borderRadius: 8, padding: '8px 10px', border: '1px solid #cbd5e1', width: '100%', background: '#fff', fontSize: 12.5 }} />
                    )}
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>SMS Message Content * (max 70 chars)</label>
                      <span style={{ fontSize: 11.5, color: msgLen > 70 ? '#ef4444' : '#64748b', fontWeight: 700 }}>{msgLen} / 70</span>
                    </div>
                    <textarea rows={3} maxLength={70} style={{ width: '100%', borderRadius: 8, padding: 10, border: '1px solid #cbd5e1', fontFamily: 'inherit', resize: 'vertical', fontSize: 13 }} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Type your SMS broadcast message here..." />
                  </div>
                </>
              )}

              {service === 'voice' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#475569' }}>Upload Audio File * (MP3 only)</label>
                  {previewUrl ? (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12.5, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🎵 {fileName}</div>
                          <div className="muted" style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>Audio Ready</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <label style={{ cursor: 'pointer', background: '#e2e8f0', color: '#334155', borderRadius: 14, padding: '5px 10px', fontSize: 11.5, fontWeight: 600 }}>
                            Change
                            <input type="file" accept="audio/mp3,audio/mpeg" onChange={handleFileChange} style={{ display: 'none' }} />
                          </label>
                          <button type="button" onClick={removeFile} style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: 14, padding: '5px 10px', fontSize: 11.5, fontWeight: 600 }}>
                            Delete
                          </button>
                        </div>
                      </div>
                      <audio controls src={previewUrl} style={{ width: '100%', height: 36, borderRadius: 6 }} />
                    </div>
                  ) : (
                    <input type="file" accept="audio/mp3,audio/mpeg" onChange={handleFileChange} style={{ borderRadius: 8, padding: '8px 10px', border: '1px solid #cbd5e1', width: '100%', background: '#fff', fontSize: 12.5 }} />
                  )}
                </div>
              )}

              {service === 'whatsapp' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#475569' }}>WhatsApp Header Image *</label>
                    {previewUrl ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 10 }}>
                        <img src={previewUrl} alt="WhatsApp Header Preview" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12.5, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>
                          <div className="muted" style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>Header Image Selected</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <label style={{ cursor: 'pointer', background: '#e2e8f0', color: '#334155', borderRadius: 14, padding: '5px 10px', fontSize: 11.5, fontWeight: 600 }}>
                            Change
                            <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                          </label>
                          <button type="button" onClick={removeFile} style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: 14, padding: '5px 10px', fontSize: 11.5, fontWeight: 600 }}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <input type="file" accept="image/*" onChange={handleFileChange} style={{ borderRadius: 8, padding: '8px 10px', border: '1px solid #cbd5e1', width: '100%', background: '#fff', fontSize: 12.5 }} />
                    )}
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>WhatsApp Message Content * (max 100 chars)</label>
                      <span style={{ fontSize: 11.5, color: msgLen > 100 ? '#ef4444' : '#64748b', fontWeight: 700 }}>{msgLen} / 100</span>
                    </div>
                    <textarea rows={3} maxLength={100} style={{ width: '100%', borderRadius: 8, padding: 10, border: '1px solid #cbd5e1', fontFamily: 'inherit', resize: 'vertical', fontSize: 13 }} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Type your WhatsApp broadcast message here..." />
                  </div>
                </>
              )}

              {/* Submit Action */}
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={submit}
                  disabled={!valid || submitting}
                  className="sm-submit-btn"
                  style={{
                    borderRadius: 12,
                    padding: '12px 24px',
                    fontSize: 14,
                    fontWeight: 700,
                    background: valid ? cfg.color : '#cbd5e1',
                    borderColor: valid ? cfg.color : '#cbd5e1',
                    boxShadow: valid ? `0 4px 14px ${cfg.color}44` : 'none',
                    cursor: valid ? 'pointer' : 'not-allowed',
                    width: '100%',
                  }}
                >
                  {submitting ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
