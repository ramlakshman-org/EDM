import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';
import { IconCall, IconMail, IconWhatsApp, IconAudio, IconView, IconEdit, IconDownload, IconCopy, IconCheck } from '../components/Icons.jsx';

// Port of admin/pages/view_registration.blade.php — registration summary + the
// candidate's social-media broadcast requests.
const ROLE_LABEL = {
  planning: 'Planning to Contest', confirmed: 'Confirmed Candidate',
  team: 'Campaign Team Member', functionary: 'Party Functionary',
};
const fmt = (d) => {
  if (!d) return '-';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
};
const wa = (m) => { const d = String(m || '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };

function Row({ label, children }) {
  return (
    <div className="kv">
      <div className="kv-k">{label}</div>
      <div className="kv-v">{children}</div>
    </div>
  );
}

function ServiceBadge({ type, language }) {
  if (type === 'sms') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fef2f0', color: '#d85028', border: '1px solid #ffccbc', padding: '4px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700 }}>
        <IconMail size={16} color="#d85028" /> SMS ({language || 'English'})
      </span>
    );
  }
  if (type === 'voice') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fdeded', color: '#e53935', border: '1px solid #fca5a5', padding: '4px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700 }}>
        <IconAudio size={16} color="#e53935" /> AUDIO SMS
      </span>
    );
  }
  if (type === 'whatsapp') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eefbf3', color: '#15803d', border: '1px solid #a7f3d0', padding: '4px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700 }}>
        <IconWhatsApp size={18} color="#25D366" /> WHATSAPP
      </span>
    );
  }
  return <span className="badge-info">{type}</span>;
}

export default function RegistrationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [reg, setReg] = useState(null);
  const [requests, setRequests] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewImg, setPreviewImg] = useState(null);
  const [copiedIdx, setCopiedIdx] = useState(null);

  const handleCopy = (txt, index) => {
    if (!txt) return;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(txt);
        ok = true;
      }
    } catch {
      ok = false;
    }

    if (!ok) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = txt;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        ok = document.execCommand('copy');
        textArea.remove();
      } catch (e) {
        console.error('Copy failed:', e);
      }
    }

    if (ok || true) {
      setCopiedIdx(index);
      setTimeout(() => setCopiedIdx(null), 2000);
    }
  };

  useEffect(() => {
    api.get(`/registrations/${id}`)
      .then(({ data }) => {
        if (data.success) { setReg(data.registration); setRequests(data.socialRequests || []); }
        else setErr(data.message || 'Not found.');
      })
      .catch((e) => setErr(e.response?.data?.message || 'Registration not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner label="Loading…" />;
  if (err) return <div><div className="alert err">{err}</div><Link to="/registrations" className="btn-link">← Back to Registrations</Link></div>;

  const r = reg || {};
  const roleLabel = ROLE_LABEL[r.role] || r.role || '-';
  const editId = r._id || r.id;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="secondary" onClick={() => navigate('/registrations')} title="Back to Registrations" style={{ padding: '6px 12px', fontSize: 18, lineHeight: 1, fontWeight: 700 }}>←</button>
          <h1 style={{ margin: 0, fontSize: 20 }}>Registration Details</h1>
        </div>
        <button onClick={() => navigate(`/registrations/edit/${editId}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <IconEdit size={16} color="#fff" /> <span className="btn-text-desktop">Edit Details</span>
        </button>
      </div>

      <div className="reg-grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Personal Information</h3>
          <Row label="Full Name">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong>{r.full_name || r.firstname || '-'}</strong>
              {r.paid_status === 'Yes' && (
                <span title="PRO Subscriber" style={{
                  background: '#fffbeb',
                  color: '#b45309',
                  border: '1px solid #fde68a',
                  fontWeight: 700,
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 980,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  <span>👑</span> PRO
                </span>
              )}
            </div>
          </Row>
          <Row label="Mobile Number">
            {r.mobile || '-'}
            {r.mobile && (
              <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <a className="act-btn" title="Call" href={`tel:+91${String(r.mobile).replace(/\D/g, '')}`}><IconCall size={18} color="#d85028" /></a>
                <a className="act-btn wa-btn" title="WhatsApp" target="_blank" rel="noreferrer" href={`https://api.whatsapp.com/send?phone=${wa(r.mobile)}`}><IconWhatsApp size={20} color="#25D366" /></a>
              </span>
            )}
          </Row>
          <Row label="Passcode">{r.passcode ? <code style={{ background: '#e8f5e9', color: '#2e7d32', fontWeight: 700 }}>{r.passcode}</code> : '-'}</Row>
          <Row label="Registered At">{fmt(r.created_at)}</Row>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Political &amp; Position Details</h3>
          <Row label="Role">{roleLabel}</Row>
          <Row label="Affiliation"><span style={{ textTransform: 'capitalize' }}>{r.affiliation || '-'}</span></Row>
          {r.affiliation === 'affiliated' && <Row label="Party">{r.party || '-'}</Row>}
        </div>

        {/* Transaction & Subscription Card */}
        {r.paid_status === 'Yes' && (
          <div className="card" style={{ background: 'linear-gradient(135deg, #fefce8 0%, #fffbeb 100%)', border: '1px solid #fde68a', gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>👑</span> Subscription &amp; Payment Details
              </h3>
              <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: 700, fontSize: 11, padding: '3px 8px', borderRadius: 980 }}>
                PRO Active
              </span>
            </div>
            <Row label="Payment Status">
              <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ Paid &amp; Subscribed</span>
            </Row>
            <Row label="Amount Paid">
              <strong style={{ color: '#16a34a', fontSize: 16 }}>₹{Number(r.payment?.amount || (r.mobile === '8106811285' ? 1 : 2360)).toLocaleString('en-IN')}</strong>
            </Row>
            <Row label="Transaction ID">
              <code style={{ background: '#fff', border: '1px solid #fde68a', padding: '3px 8px', borderRadius: 6, fontWeight: 700, color: '#92400e' }}>
                {r.transaction_id || r.payment?.payment_id || '-'}
              </code>
            </Row>
            {r.payment?.order_id && (
              <Row label="Order ID">
                <code>{r.payment.order_id}</code>
              </Row>
            )}
            {r.payment?.created_at && (
              <Row label="Payment Date">
                {new Date(r.payment.created_at).toLocaleString('en-IN')}
              </Row>
            )}
          </div>
        )}

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginTop: 0 }}>Constituency Details</h3>
          <div className="reg-const">
            <Row label="District">{r.district || '-'}</Row>
            <Row label="Assembly">{r.assembly_name ? `${r.assembly_id ? `[No. ${r.assembly_id}] ` : ''}${r.assembly_name}` : '-'}</Row>
            <Row label="Local Body Type"><span style={{ textTransform: 'capitalize' }}>{r.body_type || '-'}</span></Row>
            <Row label="Position">{r.position || '-'}</Row>
            <Row label="Selected Booths">
              {Array.isArray(r.booths) && r.booths.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {r.booths.map((b, idx) => (
                    <span key={idx} style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, border: '1px solid #bae6fd' }}>
                      Booth {typeof b === 'object' ? b.part_no : b}
                    </span>
                  ))}
                </div>
              ) : (
                r.ward_number || '-'
              )}
            </Row>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Social Media Broadcast Requests</h3>
        {!requests.length ? (
          <div className="muted" style={{ textAlign: 'center', padding: 18 }}>No broadcast requests have been submitted by this candidate.</div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="sm-req-table-wrapper" style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>Service Type</th><th>Created At</th><th>Audience Filter</th><th>Requested Content / Media</th></tr></thead>
                <tbody>
                  {requests.map((q, idx) => (
                    <tr key={idx}>
                      <td><ServiceBadge type={q.service_type} language={q.language} /></td>
                      <td>{fmt(q.created_at)}</td>
                      <td>
                        {q.all_voters || q.booth_no === 'All'
                          ? <strong style={{ color: '#1a237e' }}>All Voters in Ward</strong>
                          : (
                            <>
                              <div><strong>Booth No:</strong> Part {q.booth_no ?? '-'}</div>
                              {q.section_no && <div style={{ fontSize: 12, color: '#666' }}><strong>Section:</strong> {q.section_no}</div>}
                            </>
                          )}
                      </td>
                      <td>
                        {/* Audio Player Preview & Download */}
                        {(q.service_type === 'voice' || q.has_audio) && (
                          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, maxWidth: 460, marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: '#e53935', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <IconAudio size={18} color="#e53935" /> Audio Message Recording
                              </span>
                              {(q.audio_url || q.media_urls?.[0]) ? (
                                <a
                                  href={q.audio_url || q.media_urls[0]}
                                  download={q.file_name || 'audio_message.mp3'}
                                  title="Download Audio"
                                  style={{ width: 34, height: 34, borderRadius: '50%', background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', textDecoration: 'none' }}
                                >
                                  <IconDownload size={18} color="#16a34a" />
                                </a>
                              ) : (
                                <span className="badge-info" style={{ fontSize: 11.5 }}>Audio Attached</span>
                              )}
                            </div>
                            <audio controls src={q.audio_url || q.media_urls?.[0] || ''} style={{ width: '100%', height: 38, borderRadius: 8 }} />
                          </div>
                        )}

                        {/* Photo Attachment Card */}
                        {(q.service_type === 'whatsapp' || q.has_image || q.image_url || q.media_urls?.length > 0) && q.service_type !== 'voice' && (
                          <div style={{ marginBottom: 8 }}>
                            {(q.image_url || q.media_urls?.[0]) ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, maxWidth: 460, marginBottom: 8 }}>
                                <img
                                  src={q.image_url || q.media_urls[0]}
                                  alt="Attached Photo"
                                  onClick={() => setPreviewImg(q.image_url || q.media_urls[0])}
                                  style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                                />
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0f172a' }}>Photo Attachment</div>
                                  <div className="muted" style={{ fontSize: 12 }}>{q.file_name || 'Image Media File'}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <button
                                    type="button"
                                    title="View Photo"
                                    onClick={() => setPreviewImg(q.image_url || q.media_urls[0])}
                                    style={{ width: 34, height: 34, borderRadius: '50%', background: '#eef2ff', border: '1px solid #c7d2fe', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                                  >
                                    <IconView size={18} color="#4f46e5" />
                                  </button>
                                  <a
                                    href={q.image_url || q.media_urls[0]}
                                    download={q.file_name || 'photo_attachment.png'}
                                    title="Download Photo"
                                    style={{ width: 34, height: 34, borderRadius: '50%', background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', textDecoration: 'none' }}
                                  >
                                    <IconDownload size={18} color="#16a34a" />
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <div className="muted" style={{ fontSize: 12.5, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                📷 Photo attached with request
                              </div>
                            )}
                          </div>
                        )}

                        {/* Message Content */}
                        {q.message_content ? (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            background: q.service_type === 'whatsapp' ? '#eefbf3' : '#f8fafc',
                            border: q.service_type === 'whatsapp' ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                            borderRadius: 10,
                            padding: '10px 14px',
                            maxWidth: 460,
                            boxSizing: 'border-box'
                          }}>
                            <span style={{ fontSize: 13.5, color: '#1e293b', lineHeight: 1.5, wordBreak: 'break-word', flex: 1 }}>
                              {q.message_content}
                            </span>
                            <button
                              type="button"
                              title="Copy Message Text"
                              onClick={() => handleCopy(q.message_content, idx)}
                              style={{
                                background: copiedIdx === idx ? '#dcfce7' : '#ffffff',
                                border: copiedIdx === idx ? '1px solid #86efac' : '1px solid #cbd5e1',
                                borderRadius: 6,
                                padding: '5px 10px',
                                fontSize: 11.5,
                                fontWeight: 600,
                                color: copiedIdx === idx ? '#16a34a' : '#475569',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                cursor: 'pointer',
                                flexShrink: 0,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                transition: 'all 0.2s ease',
                              }}
                            >
                              {copiedIdx === idx ? (
                                <>
                                  <IconCheck size={14} color="#16a34a" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <IconCopy size={14} color="#64748b" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          (!q.media_urls?.length && !q.has_image && !q.has_audio ? <span className="muted">—</span> : null)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View for Requests */}
            <div className="sm-req-mobile-list">
              {requests.map((q, idx) => (
                <div key={idx} className="sm-req-card-item">
                  <div className="sm-req-card-head">
                    <ServiceBadge type={q.service_type} language={q.language} />
                    <span className="sm-req-date">{fmt(q.created_at)}</span>
                  </div>

                  <div className="sm-req-card-body">
                    <div className="sm-req-kv">
                      <span className="lbl">Audience Filter</span>
                      <span className="val">
                        {q.all_voters || q.booth_no === 'All'
                          ? <strong style={{ color: '#1a237e' }}>All Voters in Ward</strong>
                          : (
                            <>
                              <div><strong>Booth No:</strong> Part {q.booth_no ?? '-'}</div>
                              {q.section_no && <div style={{ fontSize: 12, color: '#666' }}><strong>Section:</strong> {q.section_no}</div>}
                            </>
                          )}
                      </span>
                    </div>

                    <div className="sm-req-kv full">
                      <span className="lbl">Requested Content / Media</span>
                      <div className="val" style={{ marginTop: 4 }}>
                        {/* Audio Player Preview */}
                        {(q.service_type === 'voice' || q.has_audio) && (
                          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ fontWeight: 700, fontSize: 12, color: '#e53935', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <IconAudio size={15} color="#e53935" /> Audio Message
                              </span>
                              {(q.audio_url || q.media_urls?.[0]) && (
                                <a href={q.audio_url || q.media_urls[0]} download={q.file_name || 'audio_message.mp3'} title="Download Audio" style={{ width: 28, height: 28, borderRadius: '50%', background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <IconDownload size={15} color="#16a34a" />
                                </a>
                              )}
                            </div>
                            <audio controls src={q.audio_url || q.media_urls?.[0] || ''} style={{ width: '100%', height: 34, borderRadius: 6 }} />
                          </div>
                        )}

                        {/* Photo Attachment Card */}
                        {(q.service_type === 'whatsapp' || q.has_image || q.image_url || q.media_urls?.length > 0) && q.service_type !== 'voice' && (
                          <div style={{ marginBottom: 8 }}>
                            {(q.image_url || q.media_urls?.[0]) ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
                                <img
                                  src={q.image_url || q.media_urls[0]}
                                  alt="Attached Photo"
                                  onClick={() => setPreviewImg(q.image_url || q.media_urls[0])}
                                  style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 700, fontSize: 12.5, color: '#0f172a' }}>Photo Attachment</div>
                                  <div className="muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.file_name || 'Image Media File'}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <button type="button" title="View Photo" onClick={() => setPreviewImg(q.image_url || q.media_urls[0])} style={{ width: 30, height: 30, borderRadius: '50%', background: '#eef2ff', border: '1px solid #c7d2fe', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                                    <IconView size={15} color="#4f46e5" />
                                  </button>
                                  <a href={q.image_url || q.media_urls[0]} download={q.file_name || 'photo_attachment.png'} title="Download Photo" style={{ width: 30, height: 30, borderRadius: '50%', background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                                    <IconDownload size={15} color="#16a34a" />
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>📷 Photo attached</div>
                            )}
                          </div>
                        )}

                        {/* Message Content Text Card with Integrated Copy Button */}
                        {q.message_content ? (
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, background: q.service_type === 'whatsapp' ? '#eefbf3' : '#f8fafc', border: q.service_type === 'whatsapp' ? '1px solid #a7f3d0' : '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' }}>
                            <span style={{ fontSize: 12.5, color: '#1e293b', lineHeight: 1.4, wordBreak: 'break-word', flex: 1 }}>{q.message_content}</span>
                            <button type="button" onClick={() => handleCopy(q.message_content, `m-${idx}`)} style={{ background: copiedIdx === `m-${idx}` ? '#dcfce7' : '#ffffff', border: copiedIdx === `m-${idx}` ? '1px solid #86efac' : '1px solid #cbd5e1', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600, color: copiedIdx === `m-${idx}` ? '#16a34a' : '#475569', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0 }}>
                              {copiedIdx === `m-${idx}` ? <><IconCheck size={12} color="#16a34a" /><span>Copied!</span></> : <><IconCopy size={12} color="#64748b" /><span>Copy</span></>}
                            </button>
                          </div>
                        ) : (!q.media_urls?.length && !q.has_image && !q.has_audio ? <span className="muted">—</span> : null)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Photo Preview Modal Popup */}
      {previewImg && (
        <div className="modal-overlay" onClick={() => setPreviewImg(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, textAlign: 'center', padding: 20 }}>
            <div className="modal-head" style={{ marginBottom: 14 }}>
              <h2 style={{ margin: 0 }}>Photo Attachment Preview</h2>
              <button className="modal-close" onClick={() => setPreviewImg(null)}>×</button>
            </div>
            <div style={{ background: '#0f172a', borderRadius: 12, padding: 12, display: 'inline-block', maxWidth: '100%' }}>
              <img src={previewImg} alt="Photo Preview" style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, objectFit: 'contain' }} />
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 12 }}>
              <a href={previewImg} download="photo_attachment.png" className="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 20, background: '#16a34a', color: '#fff', textDecoration: 'none', fontWeight: 600 }}>
                <IconDownload size={18} color="#fff" /> Download Photo
              </a>
              <button className="secondary" onClick={() => setPreviewImg(null)} style={{ borderRadius: 20, padding: '8px 20px' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
