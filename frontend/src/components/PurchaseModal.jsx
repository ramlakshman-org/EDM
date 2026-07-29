import { useState, useEffect } from 'react';
import api from '../api/client.js';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

const TEST_MOBILE = '8106811285';

function calculateTier(count, mobile = '') {
  const c = Math.max(1, parseInt(count, 10) || 1);

  // Test override — ₹1, no GST for all tiers
  if (String(mobile).replace(/\D/g, '') === TEST_MOBILE) {
    return { boothCount: c, base: 1, gst: 0, total: 1, label: 'Test Tier (₹1)', isTest: true };
  }

  let base = 2000;
  let label = '1 Booth Plan';
  if (c > 25) {
    base = 25000;
    label = 'Above 25 Booths Plan';
  } else if (c > 10) {
    base = 10000;
    label = '11 to 25 Booths Plan';
  } else if (c > 1) {
    base = 5000;
    label = '2 to 10 Booths Plan';
  }
  const gst = Math.round(base * 0.18);
  const total = base + gst;
  return { boothCount: c, base, gst, total, label, isTest: false };
}

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function PurchaseModal({ open, onClose, onSuccess, user, accountInfo, boothCount = 1, isSample = false }) {
  const [email, setEmail] = useState(user?.email || '');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [successData, setSuccessData] = useState(null);

  const count = Math.max(1, Number(boothCount || 1));
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.name || accountInfo?.ward_login || 'Candidate';

  const getDynamicMobile = () => {
    let m = user?.mobile_no || user?.mobile || user?.username || accountInfo?.mobile || accountInfo?.mobile_no || accountInfo?.username || '';
    if (!m || m === '-' || String(m).replace(/\D/g, '').length < 10) {
      try {
        const stored = JSON.parse(localStorage.getItem('edm_user') || '{}');
        m = stored?.mobile_no || stored?.mobile || stored?.username || m;
      } catch { /* ignore */ }
    }
    if (!m || m === '-' || String(m).replace(/\D/g, '').length < 10) {
      try {
        const token = localStorage.getItem('edm_token');
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]));
          m = payload?.mobile || payload?.mobile_no || payload?.sub || m;
        }
      } catch { /* ignore */ }
    }
    const clean = String(m || '').replace(/\D/g, '').slice(-10);
    return clean.length === 10 ? clean : (m || '-');
  };

  const mobile = getDynamicMobile();
  const pricing = calculateTier(count, mobile);


  useEffect(() => {
    if (open) {
      setErr('');
      setSuccessData(null);
    }
  }, [open]);

  if (!open) return null;

  const verifyPayment = async (razorpay_payment_id, razorpay_order_id, razorpay_signature) => {
    try {
      const verifyRes = await api.post('/payments/verify-ward-payment', {
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
        email: email.trim(),
        booth_count: count,
      });
      if (verifyRes.data.success) {
        setSuccessData(verifyRes.data);
        if (onSuccess) onSuccess(verifyRes.data);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  };

  const pollPaymentStatus = async (order_id) => {
    // Poll Razorpay order status up to 10 times (every 2s = ~20s total)
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const { data } = await api.post('/payments/check-order-status', { order_id });
        if (data.paid) {
          setSuccessData({
            success: true,
            transaction_id: data.transaction_id || 'N/A',
            amount: data.amount || pricing.total,
          });
          if (onSuccess) onSuccess(data);
          setLoading(false);
          return;
        }
      } catch { /* ignore */ }
    }
    setLoading(false);
  };

  const handlePay = async () => {
    setErr('');
    setLoading(true);
    try {
      const sdkLoaded = await loadRazorpayScript();
      if (!sdkLoaded) {
        setErr('Unable to load Razorpay SDK. Please check your internet connection.');
        setLoading(false);
        return;
      }

      const { data } = await api.post('/payments/ward-order', { booth_count: count });
      if (!data.success || (!data.order && !data.payment_link_url)) {
        setErr(data.message || 'Failed to create payment order.');
        setLoading(false);
        return;
      }

      // Hosted Payment Link (rzp.io) — bypasses domain whitelist restrictions (vijya-hospital method)
      if (data.payment_link_url) {
        window.location.href = data.payment_link_url;
        return;
      }
    } catch (e) {
      setErr(e.response?.data?.message || e.message || 'Error initiating payment.');
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif',
      }}
    >
      <style>{`
        @keyframes appleSpinnerRot {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <div
        className="modal-card"
        style={{
          background: '#ffffff',
          borderRadius: 24,
          maxWidth: 480,
          width: '100%',
          overflow: 'hidden',
          boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.06)',
          animation: 'appleModalPop 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Light Apple Header Bar */}
        <div
          style={{
            background: '#ffffff',
            color: '#1d1d1f',
            padding: '20px 24px 16px',
            position: 'relative',
            borderBottom: '1px solid #e5e5e7',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 36 }}>
            <span style={{ fontSize: 22 }}>{isSample ? 'ℹ️' : '👑'}</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.3px' }}>
                {isSample ? 'Sample Data Notice' : 'Unlock PRO Ward Subscription'}
              </h3>
              <span style={{ fontSize: 12, color: '#86868b', fontWeight: 500 }}>Election Data Management</span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 18,
              right: 18,
              background: '#e5e5ea',
              border: 'none',
              color: '#3a3a3c',
              width: 30,
              height: 30,
              borderRadius: '50%',
              fontSize: 18,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#d1d1d6'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#e5e5ea'}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: 24, maxHeight: '80vh', overflowY: 'auto' }}>
          
          {/* CASE A: Sample Data Mode */}
          {isSample ? (
            <div style={{ textAlign: 'center', padding: '12px 4px 8px' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  background: '#e0f2fe',
                  color: '#0284c7',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  margin: '0 auto 16px',
                }}
              >
                ℹ️
              </div>

              <h3 style={{ margin: '0 0 10px', fontSize: 19, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.4px' }}>
                Notice
              </h3>

              <p style={{ margin: '0 0 24px', fontSize: 14.5, color: '#424245', lineHeight: 1.55, fontWeight: 500 }}>
                This is sample data. Once the Government releases the official data, it will be updated immediately.
              </p>

              <button
                type="button"
                onClick={onClose}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  borderRadius: 980,
                  fontSize: 15,
                  fontWeight: 600,
                  background: '#f5f5f7',
                  color: '#1d1d1f',
                  border: '1px solid rgba(0, 0, 0, 0.1)',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#e8e8ed'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#f5f5f7'}
              >
                Close
              </button>
            </div>
          ) : (
            /* CASE B: Real/Assigned Data */
            <div>
              {err && <div className="alert err" style={{ marginBottom: 16 }}>{err}</div>}

              {successData ? (
                /* Apple Confirmation Screen */
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <div style={{ width: 60, height: 60, background: '#dcfce7', color: '#15803d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 14px' }}>
                    ✓
                  </div>
                  <h2 style={{ margin: '0 0 6px', fontSize: 21, color: '#1d1d1f', fontWeight: 800, letterSpacing: '-0.4px' }}>Payment Successful!</h2>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fef3c7', color: '#92400e', fontWeight: 700, fontSize: 12.5, padding: '4px 14px', borderRadius: 980, marginBottom: 18 }}>
                    <span>👑</span> PRO Access Unlocked
                  </div>

                  <div style={{ background: '#f5f5f7', border: '1px solid rgba(0, 0, 0, 0.06)', borderRadius: 16, padding: 16, textAlign: 'left', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#86868b' }}>Transaction ID:</span>
                      <strong style={{ fontFamily: 'monospace', color: '#1d1d1f' }}>{successData.transaction_id}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#86868b' }}>Amount Paid:</span>
                      <strong style={{ color: '#15803d', fontSize: 15 }}>₹{fmt(successData.amount || pricing.total)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#86868b' }}>Booths Covered:</span>
                      <strong>{count} Booths</strong>
                    </div>
                  </div>

                  <button
                    className="primary"
                    onClick={() => { onClose(); window.location.reload(); }}
                    style={{ width: '100%', padding: '12px 20px', borderRadius: 980, fontSize: 15, fontWeight: 600, background: 'linear-gradient(180deg, #0077ed 0%, #0066cc 100%)', color: '#fff', border: 'none', cursor: 'pointer' }}
                  >
                    Continue to Dashboard
                  </button>
                </div>
              ) : (
                /* Purchase Form */
                <div>
                  {/* Candidate Info */}
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#86868b', fontWeight: 700 }}>
                      Candidate Information
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11.5, fontWeight: 600, color: '#515154', marginBottom: 4, display: 'block' }}>
                          Name 🔒
                        </label>
                        <input
                          type="text"
                          value={name}
                          disabled
                          style={{ background: '#f5f5f7', color: '#1d1d1f', fontWeight: 600, cursor: 'not-allowed', border: '1px solid rgba(0, 0, 0, 0.08)', borderRadius: 10, padding: '8px 12px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11.5, fontWeight: 600, color: '#515154', marginBottom: 4, display: 'block' }}>
                          Mobile Number 🔒
                        </label>
                        <input
                          type="text"
                          value={mobile}
                          disabled
                          style={{ background: '#f5f5f7', color: '#1d1d1f', fontWeight: 600, cursor: 'not-allowed', border: '1px solid rgba(0, 0, 0, 0.08)', borderRadius: 10, padding: '8px 12px' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Optional Email Input */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: '#515154', marginBottom: 4, display: 'block' }}>
                      Email Address <span style={{ color: '#86868b' }}>(Optional)</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="candidate@example.com"
                      style={{ border: '1px solid rgba(0, 0, 0, 0.12)', borderRadius: 10, padding: '8px 12px', width: '100%' }}
                    />
                  </div>

                  {/* Constituency & Booth Details */}
                  <div style={{ background: '#f5f5f7', border: '1px solid rgba(0, 0, 0, 0.06)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: 12, color: '#1d1d1f', fontWeight: 700 }}>
                      Constituency &amp; Booth Details
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontSize: 12 }}>
                      <div><span style={{ color: '#86868b' }}>Local Body Type:</span> <strong style={{ color: '#1d1d1f', textTransform: 'capitalize' }}>{accountInfo?.body_type || user?.candidate_type || user?.body_type || 'Local Body'}</strong></div>
                      <div><span style={{ color: '#86868b' }}>District:</span> <strong style={{ color: '#1d1d1f' }}>{accountInfo?.district || user?.district_id || user?.district || '-'}</strong></div>
                      <div><span style={{ color: '#86868b' }}>Assembly:</span> <strong style={{ color: '#1d1d1f' }}>{accountInfo?.assembly_name || user?.assembly_name ? `${accountInfo?.assembly_id || user?.assembly_id ? `[No.${accountInfo?.assembly_id || user?.assembly_id}] ` : ''}${accountInfo?.assembly_name || user?.assembly_name}` : (accountInfo?.local_body || user?.category_name || '-')}</strong></div>
                      <div><span style={{ color: '#86868b' }}>Selected Booths:</span> <strong style={{ color: '#1d1d1f' }}>{count} Booth{count > 1 ? 's' : ''}</strong></div>
                    </div>
                  </div>

                  {/* Dynamic Pricing Box */}
                  <div style={{ background: '#f0f7ff', border: '1px solid #bae6fd', borderRadius: 16, padding: 16, marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0369a1' }}>{pricing.label}</span>
                        <div style={{ fontSize: 12, color: '#0284c7', fontWeight: 600 }}>Ward Total: {count} Booth{count > 1 ? 's' : ''}</div>
                      </div>
                      <span style={{ background: '#0284c7', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12 }}>
                        Tier {count > 25 ? '4' : count > 10 ? '3' : count > 1 ? '2' : '1'}
                      </span>
                    </div>

                    <div style={{ borderTop: '1px dashed #bae6fd', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#424245' }}>
                        <span>Base Plan Price:</span>
                        <strong>₹{fmt(pricing.base)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#424245' }}>
                        <span>GST ({pricing.isTest ? '0%' : '18%'}):</span>
                        <strong>₹{fmt(pricing.gst)}</strong>
                      </div>
                      <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: '#1d1d1f' }}>
                        <span>Total Payable Amount:</span>
                        <span style={{ color: '#0077ed' }}>₹{fmt(pricing.total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={loading}
                      style={{ flex: 1, padding: 12, borderRadius: 980, fontWeight: 600, background: '#f5f5f7', color: '#1d1d1f', border: '1px solid rgba(0, 0, 0, 0.08)', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handlePay}
                      disabled={loading}
                      style={{
                        flex: 2,
                        padding: 12,
                        borderRadius: 980,
                        fontWeight: 600,
                        fontSize: 14.5,
                        background: 'linear-gradient(180deg, #0077ed 0%, #0066cc 100%)',
                        color: '#ffffff',
                        border: 'none',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        boxShadow: '0 2px 8px rgba(0, 119, 237, 0.35)',
                        opacity: loading ? 0.85 : 1,
                      }}
                    >
                      {loading ? (
                        <>
                          <span
                            style={{
                              width: 16,
                              height: 16,
                              border: '2px solid rgba(255, 255, 255, 0.35)',
                              borderTopColor: '#ffffff',
                              borderRadius: '50%',
                              display: 'inline-block',
                              animation: 'appleSpinnerRot 0.6s linear infinite',
                            }}
                          />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>💳 Pay ₹{fmt(pricing.total)} via Razorpay</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
