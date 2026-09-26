import crypto from 'crypto';
import { getAppDb } from '../config/db.js';
import { findById, updateUser } from '../models/userModel.js';

const RAZORPAY_KEY = process.env.RAZORPAY_KEY;
const RAZORPAY_SECRET = process.env.RAZORPAY_SECRET;

// Timeout wrapper for outbound Razorpay calls (avoids hung workers on outages).
const _fetch = globalThis.fetch;
const fetch = (url, opts = {}) => _fetch(url, { signal: AbortSignal.timeout(15000), ...opts });

// Calculate Ward subscription pricing based on booth count:
//   - 1 Booth: 2,000 + 18% GST (360) = 2,360
//   - 2 - 10 Booths: 5,000 + 18% GST (900) = 5,900
//   - 11 - 25 Booths: 10,000 + 18% GST (1,800) = 11,800
//   - Above 25 Booths: 25,000 + 18% GST (4,500) = 29,500
export function calculateWardPricing(boothCount = 1, mobile = '') {
  const count = Math.max(1, parseInt(boothCount, 10) || 1);

  let basePrice = 2000;
  let tierLabel = '1 Booth Tier';

  if (count > 25) {
    basePrice = 25000;
    tierLabel = 'Above 25 Booths Tier';
  } else if (count > 10) {
    basePrice = 10000;
    tierLabel = '11 to 25 Booths Tier';
  } else if (count > 1) {
    basePrice = 5000;
    tierLabel = '2 to 10 Booths Tier';
  }

  const gst = Math.round(basePrice * 0.18);
  const totalAmount = basePrice + gst;
  const amountPaise = totalAmount * 100;

  return {
    boothCount: count,
    basePrice,
    gst,
    gstRate: '18%',
    totalAmount,
    amountPaise,
    tierLabel,
  };
}

// GET /payments/ward-pricing?boothCount=N — returns calculated pricing tier details
export async function getWardPricingApi(req, res) {
  const count = Number(req.query.boothCount || 1);
  // Pass logged-in user mobile for test override
  const mobile = req.user?.mobile || req.user?.username || '';
  const pricing = calculateWardPricing(count, mobile);
  res.json({ success: true, pricing, razorpay_key: RAZORPAY_KEY });
}

// GET /payments/check-paid — returns whether the current user has paid and transaction details
export async function checkPaid(req, res) {
  try {
    const userId = req.user?.sub;
    if (!userId || userId === 'admin') {
      return res.json({ success: true, paid: false });
    }
    const userRec = await findById(userId);
    if (!userRec) return res.json({ success: true, paid: false });

    if (userRec.paid_status === 'Yes') {
      const db = getAppDb();
      const payment = userRec.transaction_id
        ? await db.collection('tbl_payment').findOne({ payment_id: userRec.transaction_id })
        : null;
      const mobileNum = req.user?.mobile || '';
      const pricing = calculateWardPricing(1, mobileNum);
      return res.json({
        success: true,
        paid: true,
        transaction_id: userRec.transaction_id || null,
        amount: payment ? (Number(payment.amount) > 1000 ? Number(payment.amount) / 100 : Number(payment.amount)) : pricing.totalAmount,
      });
    }

    res.json({ success: true, paid: false });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}


// GET /payments/subscriptions — paid MLA (group 3) and Ward (group 6) users
export async function subscriptions(req, res) {
  try {
    const db = getAppDb();
    // Pagination with a hard ceiling to avoid loading the whole collection.
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const users = await db.collection('tbl_user')
      .find({ paid_status: 'Yes', user_group_id: { $in: [3, 6] } })
      .sort({ updated_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // Only fetch the payment records for the users on this page.
    const userIds = users.map((u) => String(u._id));
    const txnIds = users.map((u) => String(u.transaction_id)).filter(Boolean);
    const [assemblies, payments] = await Promise.all([
      db.collection('tbl_assembly_consitituency').find({}).toArray(),
      db.collection('tbl_payment').find({ $or: [{ user_id: { $in: userIds } }, { payment_id: { $in: txnIds } }] }).toArray(),
    ]);

    const mobiles = users.map((u) => u.mobile_no).filter(Boolean);
    const enquiries = mobiles.length
      ? await db.collection('tbl_enquiry').find({ mobile: { $in: mobiles } }).toArray()
      : [];
    const enqByMobile = Object.fromEntries(enquiries.map((e) => [String(e.mobile).replace(/\D/g, ''), e]));

    const asmById = Object.fromEntries(assemblies.map((a) => [String(a.assembly_no), a]));
    const payByTxn = Object.fromEntries(payments.map((p) => [String(p.payment_id), p]));
    const payByUser = Object.fromEntries(payments.map((p) => [String(p.user_id), p]));

    const rows = users.map((u) => {
      const isWard = Number(u.user_group_id) === 6;
      const a = asmById[String(u.assembly_id)];
      const p = payByTxn[String(u.transaction_id)] || payByUser[String(u._id)];

      let assemblyName = a?.assembly_name || '-';
      let district = a?.district || u.district_id || '-';

      if (isWard) {
        assemblyName = [u.candidate_type, u.category_name, u.ward_id ? `Ward ${u.ward_id}` : null].filter(Boolean).join(' - ') || 'Ward Login';
        district = u.district_id || a?.district || '-';
      }

      const rawAmount = p
        ? (Number(p.amount) === 100 || Number(p.amount) === 1 ? 1 : (Number(p.amount) > 1000 ? Number(p.amount) / 100 : Number(p.amount)))
        : (isWard ? 2360 : 25000);

      const cleanMob = String(u.mobile_no || '').replace(/\D/g, '');
      const enq = enqByMobile[cleanMob];
      const targetId = enq ? String(enq._id) : String(u._id);

      let localBodyType = u.candidate_type || enq?.position || (enq?.body_type ? (enq.body_type.charAt(0).toUpperCase() + enq.body_type.slice(1)) : null) || (isWard ? 'Urban' : 'Assembly');

      return {
        _id: targetId,
        user_id: u._id,
        name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.mobile_no || 'User',
        mobile_no: u.mobile_no,
        email: u.email || '-',
        user_group_id: u.user_group_id,
        role_label: isWard ? 'Ward User' : 'MLA',
        local_body_type: localBodyType,
        assembly_id: u.assembly_id || '-',
        assembly_name: assemblyName,
        district,
        booth_count: p?.booth_count || (Array.isArray(u.booths) ? u.booths.length : 1),
        transaction_id: u.transaction_id || p?.payment_id || '-',
        amount: rawAmount,
        payment_date: p?.created_at ? p.created_at.split('T')[0] : (u.updated_at ? u.updated_at.split('T')[0] : '-'),
      };
    });

    res.json({ success: true, subscriptions: rows, page, limit });
  } catch (e) {
    if (e.message === 'APP_DB_OFFLINE') return res.status(503).json({ success: false, message: 'App database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}

// Raw payment ledger (tbl_payment).
export async function payments(req, res) {
  try {
    const db = getAppDb();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const rows = await db.collection('tbl_payment')
      .find({}).sort({ created_at: -1 })
      .skip((page - 1) * limit).limit(limit).toArray();
    res.json({ success: true, payments: rows, page, limit });
  } catch (e) {
    if (e.message === 'APP_DB_OFFLINE') return res.status(503).json({ success: false, message: 'App database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}

// Order creation for generic payments
export async function createOrder(req, res) {
  const amount = Number(req.body?.amount || 0);
  if (!amount) return res.status(400).json({ success: false, message: 'amount (in paise) is required.' });

  try {
    const auth = Buffer.from(`${RAZORPAY_KEY}:${RAZORPAY_SECRET}`).toString('base64');
    const resp = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency: req.body.currency || 'INR', receipt: req.body.receipt || `rcpt_${Date.now()}` }),
    });
    const order = await resp.json();
    if (!resp.ok) return res.status(resp.status).json({ success: false, message: order?.error?.description || 'Razorpay error.' });
    res.json({ success: true, order, key: RAZORPAY_KEY });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

// POST /payments/ward-order — create Razorpay order & hosted payment link (rzp.io) for Ward User subscription
export async function createWardOrder(req, res) {
  try {
    const boothCount = Number(req.body?.booth_count || 1);
    const mobile = req.user?.mobile || req.user?.username || '';
    const pricing = calculateWardPricing(boothCount, mobile);

    const auth = Buffer.from(`${RAZORPAY_KEY}:${RAZORPAY_SECRET}`).toString('base64');
    
    // 1. Create standard Razorpay order
    const resp = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: pricing.amountPaise,
        currency: 'INR',
        receipt: `ward_rcpt_${Date.now()}`,
        notes: {
          booth_count: pricing.boothCount,
          tier: pricing.tierLabel,
          user_id: req.user?.sub || '',
        },
      }),
    });

    const order = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ success: false, message: order?.error?.description || 'Razorpay order creation failed.' });
    }

    // 2. Create Hosted Payment Link (rzp.io) — works across ANY domain without domain lock
    let paymentLinkUrl = null;
    let paymentLinkId = null;
    try {
      const origin = req.headers.origin || 'https://tnedms.com';
      const rawMobile = String(mobile || req.user?.mobile || req.user?.username || '').replace(/\D/g, '');
      const formattedContact = rawMobile.length === 10 ? `+91${rawMobile}` : (rawMobile ? `+${rawMobile}` : undefined);
      
      let userRec = null;
      if (req.user?.sub && req.user?.sub !== 'admin') {
        try { userRec = await findById(req.user.sub); } catch { /* ignore */ }
      }
      const userName = [userRec?.first_name, userRec?.last_name].filter(Boolean).join(' ') || req.user?.name || 'Ward Candidate';
      const userEmail = userRec?.email || req.user?.email || (rawMobile ? `${rawMobile}@election2026.in` : undefined);

      const plinkResp = await fetch('https://api.razorpay.com/v1/payment_links', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: pricing.amountPaise,
          currency: 'INR',
          accept_partial: false,
          description: `Ward Subscription (${pricing.boothCount} Booths)`,
          reference_id: order.id || `ref_${Date.now()}`,
          customer: {
            name: userName,
            contact: formattedContact,
            email: userEmail,
          },
          notes: {
            booth_count: pricing.boothCount,
            user_id: req.user?.sub || '',
          },
          callback_url: `${origin}/ward/dashboard?payment=success&order_id=${order.id || ''}`,
          callback_method: 'get',
        }),
      });
      const plinkData = await plinkResp.json();
      if (plinkResp.ok && plinkData.short_url) {
        const contactClean = rawMobile || '';
        const nameClean = encodeURIComponent(userName);
        const emailClean = userEmail ? encodeURIComponent(userEmail) : '';

        paymentLinkUrl = `${plinkData.short_url}?contact=${contactClean}&name=${nameClean}&email=${emailClean}`;
        paymentLinkId = plinkData.id;
      }
    } catch { /* ignore */ }

    res.json({
      success: true,
      order,
      payment_link_url: paymentLinkUrl,
      payment_link_id: paymentLinkId,
      key: RAZORPAY_KEY,
      pricing,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

// POST /payments/verify-ward-payment — verify signature & mark user as paid
export async function verifyWardPayment(req, res) {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, email, booth_count } = req.body || {};

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing Razorpay payment parameters.' });
    }

    // Verify HMAC SHA256 Signature
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid Razorpay payment signature.' });
    }

    const userId = req.user?.sub;
    let userRec = null;
    if (userId && userId !== 'admin') {
      try { userRec = await findById(userId); } catch { /* ignore */ }
    }

    const count = Number(booth_count || (Array.isArray(userRec?.booths) ? userRec.booths.length : 1));
    const pricing = calculateWardPricing(count);

    // Update user record in DB: paid_status = 'Yes', transaction_id = payment_id, optional email
    if (userId && userId !== 'admin') {
      const updateData = {
        paid_status: 'Yes',
        transaction_id: razorpay_payment_id,
      };
      if (email && email.trim()) {
        updateData.email = email.trim();
      }
      await updateUser(userId, updateData);
    }

    // Save payment record in tbl_payment collection for payment history / admin ledger
    const db = getAppDb();
    const paymentDoc = {
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      user_id: userId || null,
      user_group_id: userRec?.user_group_id || 6,
      user_name: userRec ? [userRec.first_name, userRec.last_name].filter(Boolean).join(' ') : (req.user?.name || 'Ward Candidate'),
      mobile_no: userRec?.mobile_no || req.user?.username || '',
      email: email || userRec?.email || '',
      district_id: userRec?.district_id || '',
      category_name: userRec?.category_name || '',
      ward_id: userRec?.ward_id || '',
      candidate_type: userRec?.candidate_type || '',
      booth_count: pricing.boothCount,
      base_amount: pricing.basePrice,
      gst_amount: pricing.gst,
      amount: pricing.amountPaise,
      currency: 'INR',
      status: 'Paid',
      created_at: new Date().toISOString(),
    };

    await db.collection('tbl_payment').insertOne(paymentDoc);

    res.json({
      success: true,
      message: 'Payment verified successfully! PRO features unlocked.',
      transaction_id: razorpay_payment_id,
      amount: pricing.totalAmount,
      pricing,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

// POST /payments/webhook — Razorpay webhook (no auth, raw body, HMAC verified)
export async function razorpayWebhook(req, res) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || RAZORPAY_SECRET;
    const signature = req.headers['x-razorpay-signature'] || '';
    // Verify over the EXACT raw bytes Razorpay signed (not a re-serialized body).
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));

    // Reject when the signature is missing — never skip verification.
    if (!signature) {
      return res.status(400).json({ success: false, message: 'Missing webhook signature.' });
    }
    const expectedSig = crypto.createHmac('sha256', webhookSecret).update(raw).digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
    }

    const event = req.body?.event;
    const paymentEntity = req.body?.payload?.payment?.entity;

    if (event === 'payment.captured' && paymentEntity) {
      const { id: payment_id, order_id, contact, notes } = paymentEntity;
      const db = getAppDb();

      // Find user by order_id in tbl_payment or by mobile
      let userRec = null;
      const mobile = String(contact || '').replace(/\D/g, '');
      if (mobile) {
        userRec = await db.collection('tbl_user').findOne({ mobile_no: mobile });
      }

      if (userRec && userRec.paid_status !== 'Yes') {
        const mobile_str = String(userRec.mobile_no || '');
        const pricing = calculateWardPricing(
          Array.isArray(userRec.booths) ? userRec.booths.length : 1,
          mobile_str
        );
        await db.collection('tbl_user').updateOne(
          { _id: userRec._id },
          { $set: { paid_status: 'Yes', transaction_id: payment_id } }
        );
        // Save payment doc if not already saved
        const exists = await db.collection('tbl_payment').findOne({ payment_id });
        if (!exists) {
          await db.collection('tbl_payment').insertOne({
            payment_id,
            order_id,
            user_id: String(userRec._id),
            user_group_id: userRec.user_group_id || 6,
            user_name: [userRec.first_name, userRec.last_name].filter(Boolean).join(' '),
            mobile_no: mobile,
            email: userRec.email || '',
            district_id: userRec.district_id || '',
            category_name: userRec.category_name || '',
            ward_id: userRec.ward_id || '',
            candidate_type: userRec.candidate_type || '',
            booth_count: pricing.boothCount,
            base_amount: pricing.basePrice,
            gst_amount: pricing.gst,
            amount: pricing.amountPaise,
            currency: 'INR',
            status: 'Paid',
            source: 'webhook',
            created_at: new Date().toISOString(),
          });
        }
      }
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[webhook]', e.message);
    res.status(500).json({ success: false });
  }
}


// POST /payments/check-order-status — frontend polls this or calls on callback to detect payment

// POST /payments/check-order-status — frontend polls this or calls on callback to detect payment
export async function checkOrderStatus(req, res) {
  try {
    const { order_id, payment_link_id } = req.body || {};
    const userId = req.user?.sub;
    let userRec = null;
    if (userId && userId !== 'admin') {
      try { userRec = await findById(userId); } catch { /* ignore */ }
    }

    const auth = Buffer.from(`${RAZORPAY_KEY}:${RAZORPAY_SECRET}`).toString('base64');
    let captured = null;
    let payment_id = null;
    let amountPaise = 0;

    // 1. Try order payments
    if (order_id) {
      try {
        const resp = await fetch(`https://api.razorpay.com/v1/orders/${order_id}/payments`, {
          headers: { Authorization: `Basic ${auth}` },
        });
        const rzData = await resp.json();
        const match = (rzData.items || []).find((p) => p.status === 'captured' || p.status === 'authorized');
        if (match) {
          captured = match;
          payment_id = match.id;
          amountPaise = match.amount;
        }
      } catch { /* ignore */ }
    }

    // 2. Try payment_link status
    if (!captured && payment_link_id) {
      try {
        const resp = await fetch(`https://api.razorpay.com/v1/payment_links/${payment_link_id}`, {
          headers: { Authorization: `Basic ${auth}` },
        });
        const plData = await resp.json();
        if (plData.status === 'paid') {
          captured = plData;
          payment_id = plData.id;
          amountPaise = plData.amount_paid || plData.amount;
        }
      } catch { /* ignore */ }
    }

    // 3. Fallback: Search recent captured payments for user ID or mobile
    if (!captured && (userId || userRec?.mobile_no)) {
      try {
        const resp = await fetch('https://api.razorpay.com/v1/payments?count=20', {
          headers: { Authorization: `Basic ${auth}` },
        });
        const pData = await resp.json();
        const mobileNorm = userRec?.mobile_no ? String(userRec.mobile_no).replace(/\D/g, '') : '';
        const uidStr = String(userId || userRec?._id || '');

        const match = (pData.items || []).find((p) => {
          if (p.status !== 'captured' && p.status !== 'authorized') return false;
          const pNoteUid = String(p.notes?.user_id || '');
          const pContact = String(p.contact || '').replace(/\D/g, '');
          return (uidStr && pNoteUid === uidStr) || (mobileNorm && pContact.length >= 10 && mobileNorm.includes(pContact.slice(-10)));
        });

        if (match) {
          captured = match;
          payment_id = match.id;
          amountPaise = match.amount;
        }
      } catch { /* ignore */ }
    }

    if (!captured) {
      return res.json({ success: true, paid: false });
    }

    // Payment captured — now verify and update user
    if (userRec) {
      const mobile = String(userRec.mobile_no || req.user?.mobile || '');
      const count = Array.isArray(userRec.booths) ? userRec.booths.length : 1;
      const pricing = calculateWardPricing(count, mobile);
      await updateUser(String(userRec._id), { paid_status: 'Yes', transaction_id: payment_id });

      const db = getAppDb();
      const exists = await db.collection('tbl_payment').findOne({ payment_id });
      if (!exists) {
        await db.collection('tbl_payment').insertOne({
          payment_id,
          order_id: order_id || captured.order_id || '-',
          user_id: String(userRec._id),
          user_group_id: userRec.user_group_id || 6,
          user_name: [userRec.first_name, userRec.last_name].filter(Boolean).join(' ') || 'Ward Candidate',
          mobile_no: mobile,
          email: userRec.email || '',
          district_id: userRec.district_id || '',
          category_name: userRec.category_name || '',
          ward_id: userRec.ward_id || '',
          candidate_type: userRec.candidate_type || '',
          booth_count: pricing.boothCount,
          base_amount: pricing.basePrice,
          gst_amount: pricing.gst,
          amount: (amountPaise === 100) ? 1 : (amountPaise > 1000 ? Math.round(amountPaise / 100) : amountPaise),
          currency: 'INR',
          status: 'Paid',
          source: 'order-poll',
          created_at: new Date().toISOString(),
        });
      }
    }

    res.json({
      success: true,
      paid: true,
      transaction_id: payment_id,
      amount: amountPaise / 100,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

// POST /payments/submit-utr — ward user submits UTR after QR payment
export async function submitUtr(req, res) {
  try {
    const { utr, booth_count } = req.body || {};
    const userId = req.user?.sub;

    if (!utr || String(utr).trim().length < 6) {
      return res.status(400).json({ success: false, message: 'Please enter a valid UTR / Transaction ID.' });
    }

    const db = getAppDb();

    // Prevent duplicate UTR submissions
    const existing = await db.collection('tbl_utr_payments').findOne({ utr: String(utr).trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'This UTR has already been submitted.' });
    }

    let userRec = null;
    if (userId && userId !== 'admin') {
      try { userRec = await findById(userId); } catch { /* ignore */ }
    }

    const count = Number(booth_count || (Array.isArray(userRec?.booths) ? userRec.booths.length : 1));
    const mobile = String(userRec?.mobile_no || req.user?.mobile || req.user?.username || '');
    const pricing = calculateWardPricing(count, mobile);

    await db.collection('tbl_utr_payments').insertOne({
      utr: String(utr).trim(),
      user_id: userId || null,
      user_name: [userRec?.first_name, userRec?.last_name].filter(Boolean).join(' ') || 'Ward Candidate',
      mobile_no: mobile,
      district_id: userRec?.district_id || '',
      category_name: userRec?.category_name || '',
      ward_id: userRec?.ward_id || '',
      candidate_type: userRec?.candidate_type || '',
      booth_count: pricing.boothCount,
      amount: pricing.totalAmount,
      status: 'pending',
      submitted_at: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Payment submitted. Admin will verify and activate your account within 24 hours.' });
  } catch (e) {
    if (e.message === 'APP_DB_OFFLINE') return res.status(503).json({ success: false, message: 'App database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}

// GET /payments/pending-utrs — admin lists pending QR payment submissions
export async function pendingUtrs(req, res) {
  try {
    const db = getAppDb();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const statusFilter = req.query.status || 'pending';

    const query = statusFilter === 'all' ? {} : { status: statusFilter };
    const rows = await db.collection('tbl_utr_payments')
      .find(query)
      .sort({ submitted_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    const total = await db.collection('tbl_utr_payments').countDocuments(query);

    res.json({ success: true, rows, total, page, limit });
  } catch (e) {
    if (e.message === 'APP_DB_OFFLINE') return res.status(503).json({ success: false, message: 'App database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}

// POST /payments/approve-utr — admin approves or rejects a QR payment
export async function approveUtr(req, res) {
  try {
    const { utr_id, action } = req.body || {};
    if (!utr_id || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'utr_id and action (approve/reject) are required.' });
    }

    const db = getAppDb();
    const { ObjectId } = await import('mongodb');
    const utrDoc = await db.collection('tbl_utr_payments').findOne({ _id: new ObjectId(utr_id) });

    if (!utrDoc) return res.status(404).json({ success: false, message: 'UTR record not found.' });
    if (utrDoc.status !== 'pending') {
      return res.status(400).json({ success: false, message: `This UTR is already ${utrDoc.status}.` });
    }

    if (action === 'reject') {
      await db.collection('tbl_utr_payments').updateOne(
        { _id: new ObjectId(utr_id) },
        { $set: { status: 'rejected', reviewed_at: new Date().toISOString() } }
      );
      return res.json({ success: true, message: 'UTR rejected.' });
    }

    // Approve — mark user as paid and save payment record
    if (utrDoc.user_id && utrDoc.user_id !== 'admin') {
      await updateUser(String(utrDoc.user_id), { paid_status: 'Yes', transaction_id: utrDoc.utr });
    }

    const paymentDoc = {
      payment_id: utrDoc.utr,
      order_id: 'QR-PAYMENT',
      user_id: utrDoc.user_id || null,
      user_group_id: 6,
      user_name: utrDoc.user_name || '',
      mobile_no: utrDoc.mobile_no || '',
      email: '',
      district_id: utrDoc.district_id || '',
      category_name: utrDoc.category_name || '',
      ward_id: utrDoc.ward_id || '',
      candidate_type: utrDoc.candidate_type || '',
      booth_count: utrDoc.booth_count || 1,
      base_amount: 0,
      gst_amount: 0,
      amount: utrDoc.amount || 0,
      currency: 'INR',
      status: 'Paid',
      source: 'qr-utr',
      created_at: new Date().toISOString(),
    };
    await db.collection('tbl_payment').insertOne(paymentDoc);

    await db.collection('tbl_utr_payments').updateOne(
      { _id: new ObjectId(utr_id) },
      { $set: { status: 'approved', reviewed_at: new Date().toISOString() } }
    );

    res.json({ success: true, message: 'Payment approved. User account activated.' });
  } catch (e) {
    if (e.message === 'APP_DB_OFFLINE') return res.status(503).json({ success: false, message: 'App database unavailable.' });
    res.status(500).json({ success: false, message: e.message });
  }
}
