import { useState, useEffect, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { EMOJIS, dayLabel, isMediaMsg, mediaUrlOf, downloadFile, formatWhatsappText } from '../utils/chatHelpers.js';

export default function CrmInbox() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAgent = Number(user?.group_id) === 12; // CRM Team Member
  const [conversations, setConversations] = useState([]);
  const [activePhone, setActivePhone] = useState(null);
  const [contact, setContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all', 'unread', 'registered', 'unregistered'
  const [replyText, setReplyText] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  // Templates panel state
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showTplForm, setShowTplForm] = useState(false);
  const [tplForm, setTplForm] = useState({ name: '', header: '', body: '', category: 'MARKETING', language: 'en', headerType: 'text' });
  const [tplHeaderImage, setTplHeaderImage] = useState(null); // { base64, mime, filename }
  const [tplSubmitting, setTplSubmitting] = useState(false);
  const [previewTpl, setPreviewTpl] = useState(null);
  const [selectedTplName, setSelectedTplName] = useState(null);
  const fileInputRef = useRef(null);
  const tplHeaderInputRef = useRef(null);

  const handleTplHeaderImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Header image must be under 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setTplHeaderImage({ base64: reader.result, mime: file.type, filename: file.name });
    reader.readAsDataURL(file);
  };

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const { data } = await api.get('/crm/templates');
      if (data.success) setTemplates(data.templates || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Load templates when panel opens, then poll for live status while open.
  useEffect(() => {
    if (!showTemplates) return;
    fetchTemplates();
    const t = setInterval(fetchTemplates, 15000);
    return () => clearInterval(t);
  }, [showTemplates]);

  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    if (!tplForm.name.trim() || !tplForm.body.trim()) {
      alert('Template name and body are required.');
      return;
    }
    if (tplForm.headerType === 'image' && !tplHeaderImage) {
      alert('Please upload a header photo, or switch the header type to Text/None.');
      return;
    }
    setTplSubmitting(true);
    try {
      const payload = { ...tplForm };
      if (tplForm.headerType === 'image' && tplHeaderImage) {
        payload.headerImageBase64 = tplHeaderImage.base64;
        payload.headerImageMime = tplHeaderImage.mime;
        payload.headerImageFilename = tplHeaderImage.filename;
      }
      const { data } = await api.post('/crm/templates', payload);
      if (data.success) {
        setActionMsg(data.message || 'Template submitted for approval.');
        setTimeout(() => setActionMsg(''), 5000);
        setShowTplForm(false);
        setTplForm({ name: '', header: '', body: '', category: 'MARKETING', language: 'en', headerType: 'text' });
        setTplHeaderImage(null);
        fetchTemplates();
      } else {
        alert(data.message || 'Failed to create template.');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create template.');
    } finally {
      setTplSubmitting(false);
    }
  };

  const handleSetupDefaults = async () => {
    if (!confirm('Create the default Credentials & Registration templates and submit them to WhatsApp for approval? (One-time setup)')) return;
    try {
      const { data } = await api.post('/crm/templates/setup-defaults');
      if (data.success) {
        setActionMsg('Default templates submitted for approval.');
        setTimeout(() => setActionMsg(''), 6000);
        fetchTemplates();
      } else {
        alert(data.message || 'Setup failed.');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to set up default templates.');
    }
  };

  const handleSendTemplate = async (tpl) => {
    if (!activePhone) return;
    if (tpl.status !== 'APPROVED') {
      alert(`This template is ${tpl.status}. Only APPROVED templates can be sent.`);
      return;
    }
    if (!confirm(`Send template "${tpl.name}" to ${contact?.name || activePhone}?`)) return;
    try {
      const { data } = await api.post(`/crm/conversations/${activePhone}/send-template`, {
        name: tpl.name,
        language: tpl.language || 'en',
        preview: `${tpl.header ? tpl.header + '\n\n' : ''}${tpl.body}`,
      });
      if (data.success) {
        setActionMsg(`Template "${tpl.name}" sent! ✅`);
        setTimeout(() => setActionMsg(''), 4000);
        const historyRes = await api.get(`/crm/conversations/${activePhone}`);
        if (historyRes.data.success) setMessages(historyRes.data.messages || []);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to send template.');
    }
  };

  const handleAttachFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activePhone) return;
    if (file.size > 15 * 1024 * 1024) {
      alert('File too large. Max 15 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      setActionMsg('Uploading attachment...');
      try {
        const { data } = await api.post(`/crm/conversations/${activePhone}/send-media`, {
          filename: file.name,
          mime: file.type,
          fileBase64: reader.result,
        });
        if (data.success) {
          setActionMsg('Attachment sent! 📎');
          setTimeout(() => setActionMsg(''), 4000);
          const historyRes = await api.get(`/crm/conversations/${activePhone}`);
          if (historyRes.data.success) setMessages(historyRes.data.messages || []);
        }
      } catch (err) {
        setActionMsg('');
        alert(err.response?.data?.message || 'Failed to send attachment.');
      }
    };
    reader.readAsDataURL(file);
  };

  // Tick every second so the messaging-window countdown updates live.
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Track mobile viewport
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const messagesEndRef = useRef(null);
  const activePhoneRef = useRef(activePhone);

  // Always keep activePhoneRef updated with current state to prevent stale closures
  useEffect(() => {
    activePhoneRef.current = activePhone;
  }, [activePhone]);

  // Initial load & search filter changes
  useEffect(() => {
    api.get('/crm/conversations', { params: { search } })
      .then(({ data }) => {
        if (data.success) {
          const list = data.conversations || [];
          setConversations(list);
          // Only select first conversation if NO active conversation is currently open
          if (!activePhoneRef.current && list.length > 0) {
            const firstPhone = list[0].clean_mobile || list[0].phone;
            setActivePhone(firstPhone);
          }
        }
      })
      .catch((err) => console.error('Failed to load CRM conversations:', err))
      .finally(() => setLoadingList(false));
  }, [search]);

  // When activePhone changes (manually clicked by user or initial)
  useEffect(() => {
    if (!activePhone) return;
    setShowAllBooths(false);
    setLoadingChat(true);
    api.get(`/crm/conversations/${activePhone}`)
      .then(({ data }) => {
        if (data.success) {
          setContact(data.contact);
          setMessages(data.messages || []);
        }
      })
      .catch((err) => console.error('Failed to load chat history:', err))
      .finally(() => setLoadingChat(false));
  }, [activePhone]);

  // Silent Background Polling (Every 5 seconds) — zero UI flickering or tab jumping!
  useEffect(() => {
    const pollInterval = setInterval(() => {
      // 1. Silent refresh conversations list
      api.get('/crm/conversations', { params: { search } })
        .then(({ data }) => {
          if (data.success) {
            setConversations(data.conversations || []);
          }
        })
        .catch(() => {});

      // 2. Silent refresh active message history
      const currentPhone = activePhoneRef.current;
      if (currentPhone) {
        api.get(`/crm/conversations/${currentPhone}`)
          .then(({ data }) => {
            if (data.success) {
              setContact(data.contact);
              setMessages((prevMsgs) => {
                const newMsgs = data.messages || [];
                if (newMsgs.length !== prevMsgs.length || (newMsgs.length > 0 && newMsgs[newMsgs.length - 1]?._id !== prevMsgs[prevMsgs.length - 1]?._id)) {
                  return newMsgs;
                }
                return prevMsgs;
              });
            }
          })
          .catch(() => {});
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [search]);

  // Auto-scroll to latest message when messages array updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const sendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !activePhone || sending) return;
    // Block replies when the WhatsApp messaging window is closed — either expired
    // or never opened (the user has not messaged us). Templates work regardless.
    const winExpMs = contact?.window_expires_at ? new Date(contact.window_expires_at).getTime() : null;
    if (winExpMs == null || winExpMs <= Date.now()) {
      alert('The WhatsApp messaging window is closed. You can send a free-form message only after the user messages you (within their 24h/72h window). To reach out now, use a Template.');
      return;
    }
    setSending(true);
    const txt = replyText.trim();
    setReplyText('');
    setShowEmoji(false);
    const replyPayload = replyingTo
      ? { reply_to: replyingTo.id || null, reply_preview: { author: replyingTo.author, text: replyingTo.text } }
      : {};
    setReplyingTo(null);
    try {
      const { data } = await api.post('/crm/messages/send', {
        phone: activePhone,
        message: txt,
        ...replyPayload,
      });
      if (data.success) {
        // Re-fetch chat history
        const historyRes = await api.get(`/crm/conversations/${activePhone}`);
        if (historyRes.data.success) {
          setMessages(historyRes.data.messages || []);
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to send WhatsApp message.');
    } finally {
      setSending(false);
    }
  };

  const [agentNotes, setAgentNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [statusNote, setStatusNote] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showAllBooths, setShowAllBooths] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null); // { id, author, text }
  const [showEmoji, setShowEmoji] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [openReactId, setOpenReactId] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [activeMobilePanel, setActiveMobilePanel] = useState('list');

  // Start replying to a given message (used by the options menu)
  const startReplyFor = (m) => {
    const meta = m.metadata || {};
    const isOut = m.direction === 'outgoing';
    const mediaUrl = meta.mediaUrl || (meta.action === 'sent_media' ? meta.headerUrl : null);
    const mediaKind = meta.mediaType || (meta.headerType === 'video' ? 'video' : 'image');
    setReplyingTo({
      id: m.wa_message_id || null,
      author: isOut ? 'You' : (contact?.name || 'Contact'),
      text: (m.body || (mediaUrl ? `[${mediaKind}]` : '')).slice(0, 140),
    });
    setOpenMenuId(null);
  };

  const handleClearChat = async () => {
    if (!activePhone) return;
    setClearing(true);
    try {
      const { data } = await api.delete(`/crm/conversations/${activePhone}/clear`);
      if (data.success) {
        setMessages([]);
        setConversations((prev) => prev.map((c) => ((c.clean_mobile || c.phone) === activePhone ? { ...c, last_message: '', unread_count: 0 } : c)));
        setActionMsg(`Chat cleared${data.deletedMedia ? ` · ${data.deletedMedia} media removed` : ''}.`);
        setTimeout(() => setActionMsg(''), 4000);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to clear chat.');
    } finally {
      setClearing(false);
      setShowClearConfirm(false);
    }
  };

  const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  const handleReact = async (m, emoji) => {
    setOpenReactId(null);
    if (!m.wa_message_id) { alert('This message can\u2019t be reacted to.'); return; }
    // optimistic update
    setMessages((prev) => prev.map((x) => (x._id === m._id ? { ...x, metadata: { ...(x.metadata || {}), reaction: emoji } } : x)));
    setOpenReactId(null);
    try {
      await api.post(`/crm/conversations/${activePhone}/react`, { message_id: m.wa_message_id, emoji });
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to react.');
    }
  };
  const [statusModal, setStatusModal] = useState({
    show: false,
    statusKey: '',
    statusLabel: '',
  });

  // Keep agentNotes in sync when active contact changes
  useEffect(() => {
    if (contact) {
      setAgentNotes(contact.agent_notes || '');
    }
  }, [contact?.clean_mobile, contact?.agent_notes]);

  const handleSendCredentials = async () => {
    if (!activePhone) return;
    if (!confirm(`Send WhatsApp login credentials directly to ${contact?.name || activePhone}?`)) return;
    setActionMsg('Sending credentials...');
    try {
      const { data } = await api.post('/crm/send-credentials', { phone: activePhone });
      if (data.success) {
        setActionMsg('Credentials sent successfully! 🔑');
        setTimeout(() => setActionMsg(''), 4000);
        // Refresh chat history
        const historyRes = await api.get(`/crm/conversations/${activePhone}`);
        if (historyRes.data.success) {
          setMessages(historyRes.data.messages || []);
        }
      }
    } catch (err) {
      setActionMsg('');
      alert(err.response?.data?.message || 'Failed to send credentials.');
    }
  };

  const handleSendFlow = async () => {
    if (!activePhone) return;
    if (!confirm(`Send Meta WhatsApp Flow registration message to ${contact?.name || activePhone}?`)) return;
    setActionMsg('Sending WhatsApp Flow...');
    try {
      const { data } = await api.post('/crm/send-flow', { phone: activePhone });
      if (data.success) {
        setActionMsg('WhatsApp Flow sent! 🗳️');
        setTimeout(() => setActionMsg(''), 4000);
        // Refresh chat history
        const historyRes = await api.get(`/crm/conversations/${activePhone}`);
        if (historyRes.data.success) {
          setMessages(historyRes.data.messages || []);
        }
      }
    } catch (err) {
      setActionMsg('');
      alert(err.response?.data?.message || 'Failed to send WhatsApp Flow.');
    }
  };

  const handleSaveNotes = async () => {
    if (!activePhone) return;
    setSavingNotes(true);
    try {
      const { data } = await api.post(`/crm/conversations/${activePhone}/notes`, {
        agent_notes: agentNotes,
      });
      if (data.success) {
        setContact((prev) => (prev ? { ...prev, agent_notes: agentNotes } : prev));
        setActionMsg('Notes saved successfully! 💾');
        setTimeout(() => setActionMsg(''), 3000);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save notes.');
    } finally {
      setSavingNotes(false);
    }
  };

  const requestStatusChange = (statusKey, statusLabel) => {
    setStatusNote('');
    setStatusModal({
      show: true,
      statusKey,
      statusLabel,
    });
  };

  const confirmStatusChange = async () => {
    if (!activePhone || !statusModal.statusKey) return;
    try {
      const { data } = await api.post(`/crm/conversations/${activePhone}/lead-status`, {
        lead_status: statusModal.statusKey,
        note: statusNote,
      });
      if (data.success) {
        setConversations((prev) =>
          prev.map((c) =>
            (c.clean_mobile || c.phone) === activePhone ? { ...c, lead_status: statusModal.statusKey } : c
          )
        );
        setActionMsg(`Lead status updated to ${statusModal.statusLabel}! ✅`);
        setTimeout(() => setActionMsg(''), 4000);
        // Refresh contact so the status history log stays current.
        try {
          const res = await api.get(`/crm/conversations/${activePhone}`);
          if (res.data.success) setContact(res.data.contact);
        } catch { /* ignore */ }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update lead status.');
    } finally {
      setStatusModal({ show: false, statusKey: '', statusLabel: '' });
      setStatusNote('');
    }
  };

  const STATUS_COLORS = {
    interested: '#16a34a',
    not_interested: '#dc2626',
    call_completed: '#2563eb',
    switch_off: '#d97706',
    not_answered: '#64748b',
    will_call_back: '#0284c7',
    none: '#94a3b8',
  };
  // Labels for the status history timeline
  const STATUS_LABELS = {
    interested: '🟢 Interested',
    not_interested: '🔴 Not Interested',
    call_completed: '📞 Call Complete',
    first_call_complete: '📞 1st Call Done',
    second_call_complete: '📞 2nd Call Done',
    third_call_complete: '📞 3rd Call Done',
    switch_off: '📱 Switch Off',
    not_answered: '📵 Not Answered',
    will_call_back: '🔁 Will Call Back',
    none: 'None',
  };

  const filteredConversations = conversations.filter((c) => {
    if (filter === 'unread') return (c.unread_count || 0) > 0;
    if (filter === 'registered') return c.is_registered;
    if (filter === 'unregistered') return !c.is_registered;
    if (filter === 'pro_user') return c.is_pro || c.paid_status === 'Yes' || c.paid_status === 'yes';
    if (filter === 'interested') return c.lead_status === 'interested';
    if (filter === 'not_interested') return c.lead_status === 'not_interested';
    if (filter === 'first_call_complete') return c.lead_status === 'first_call_complete';
    if (filter === 'second_call_complete') return c.lead_status === 'second_call_complete';
    if (filter === 'third_call_complete') return c.lead_status === 'third_call_complete';
    if (filter === 'switch_off') return c.lead_status === 'switch_off';
    if (filter === 'not_answered') return c.lead_status === 'not_answered';
    if (filter === 'will_call_back') return c.lead_status === 'will_call_back';
    return true;
  });

  // ---- WhatsApp messaging window (24h direct / 72h via ads) ----
  const windowExpiresMs = contact?.window_expires_at ? new Date(contact.window_expires_at).getTime() : null;
  const remainingMs = windowExpiresMs != null ? windowExpiresMs - nowTick : null;
  // Locked when the window has expired OR there is no open window at all — e.g.
  // the user has never messaged us, or a legacy thread with no inbound. Only a
  // template can be sent while locked (per WhatsApp's 24h/72h rule).
  const windowLocked = remainingMs == null || remainingMs <= 0;
  const windowNeverOpened = remainingMs == null;
  const windowRed = remainingMs != null && remainingMs > 0 && remainingMs <= 10 * 3600 * 1000;

  // Detect a template/message that Meta accepted but couldn't deliver because the
  // WhatsApp Business account has no payment method — so we can prompt to add one.
  const lastOutgoing = [...messages].reverse().find((m) => m.direction === 'outgoing');
  const paymentFailed = lastOutgoing?.metadata?.delivery_error === 'no_payment_method';
  const fmtRemaining = (ms) => {
    if (ms == null || ms <= 0) return '00h 00m 00s';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  };

  return (
    <div style={isMobile
      ? { display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', background: '#f8fafc', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
      : { display: 'flex', flexDirection: 'column', height: 'calc(100vh / 0.75)', width: 'calc(100vw / 0.75)', background: '#f8fafc', overflow: 'hidden', zoom: 0.75, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
    }>
      
      {/* FULL SCREEN CRM WORKSPACE */}
      <div style={{ display: 'flex', flex: 1, height: '100vh', overflow: 'hidden' }}>
        
        {/* LEFT SIDEBAR: Conversation Threads List */}
        <div style={isMobile
          ? { width: '100%', background: '#ffffff', display: activeMobilePanel === 'list' ? 'flex' : 'none', flexDirection: 'column' }
          : { width: 340, minWidth: 320, background: '#ffffff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }
        }>
          
          {/* Search & Filter Header */}
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => isMobile ? setActiveMobilePanel('list') : navigate(isAgent ? '/team/dashboard' : '/dashboard')}
                title={isMobile ? 'Back to contacts' : 'Back to Dashboard'}
                style={{
                  background: '#f1f5f9',
                  color: '#0f172a',
                  border: '1px solid #cbd5e1',
                  borderRadius: 10,
                  width: 38,
                  height: 38,
                  padding: 0,
                  fontSize: 18,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
              >
                ←
              </button>
              <input
                type="text"
                placeholder="Search name, mobile..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: 4, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
              {[
                ['all', 'All'],
                ['pro_user', '⭐ Active PRO'],
                ['interested', '🟢 Intrested'],
                ['not_interested', '🔴 Not Intrested'],
                ['first_call_complete', '📞 1st Call'],
                ['second_call_complete', '📞 2nd Call'],
                ['third_call_complete', '📞 3rd Call'],
                ['switch_off', '📱 Switch Off'],
                ['not_answered', '🚫 Not Answered'],
                ['will_call_back', '🔄 Call Back'],
                ['unread', 'Unread'],
                ['registered', '👑 Registered'],
                ['unregistered', '📝 Flow'],
              ].map(([key, lbl]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 980,
                    fontSize: 12,
                    fontWeight: 600,
                    border: 'none',
                    background: filter === key ? '#0071e3' : '#f1f5f9',
                    color: filter === key ? '#ffffff' : '#64748b',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation List Scrollable */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingList ? (
              <div style={{ padding: 24 }}><Spinner label="Loading CRM chats..." /></div>
            ) : filteredConversations.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No WhatsApp conversations found.
              </div>
            ) : (
              filteredConversations.map((c) => {
                const active = (c.clean_mobile || c.phone) === activePhone;
                const displayName = c.contact_name || `User ${String(c.clean_mobile || '').slice(-4)}`;
                const initial = (displayName.replace(/[^A-Za-z0-9]/g, '').charAt(0) || '#').toUpperCase();
                const palette = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
                const avatarBg = palette[String(c.clean_mobile || '0').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) % palette.length];
                const unread = c.unread_count > 0;
                return (
                  <div
                    key={c.clean_mobile || c.phone}
                    onClick={() => { setActivePhone(c.clean_mobile || c.phone); if (isMobile) setActiveMobilePanel('chat'); }}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: '11px 14px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      background: active ? '#eff6ff' : '#ffffff',
                      borderLeft: active ? '3px solid #0071e3' : '3px solid transparent',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = '#ffffff'; }}
                  >
                    {/* Avatar */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: 46, height: 46, borderRadius: '50%', background: avatarBg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>
                        {initial}
                      </div>
                      {c.is_registered && (
                        <span title="Registered" style={{ position: 'absolute', bottom: -1, right: -3, background: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>👑</span>
                      )}
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</span>
                        <span style={{ fontSize: 11, color: unread ? '#16a34a' : '#94a3b8', fontWeight: unread ? 700 : 400, flexShrink: 0 }}>
                          {c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0' }}>
                        {c.is_registered ? (
                          <span style={{ fontSize: 10, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: 980, fontWeight: 700 }}>Registered</span>
                        ) : (
                          <span style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', padding: '1px 6px', borderRadius: 980, fontWeight: 600 }}>Unregistered</span>
                        )}
                        {(c.is_pro || String(c.paid_status).toLowerCase() === 'yes') && (
                          <span style={{ fontSize: 10, background: '#f3e8ff', color: '#6b21a8', border: '1px solid #ddd6fe', padding: '1px 6px', borderRadius: 980, fontWeight: 700 }}>⭐ PRO</span>
                        )}
                        <span style={{ fontSize: 11.5, color: '#94a3b8' }}>{c.clean_mobile}</span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12.5, color: unread ? '#334155' : '#94a3b8', fontWeight: unread ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                          {c.last_message || 'No messages'}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {!isAgent && c.assigned_agent_name && c.assigned_agent_name !== '-' && (
                            <span style={{ fontSize: 9.5, background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', padding: '1px 6px', borderRadius: 980, fontWeight: 700 }}>👤 {c.assigned_agent_name}</span>
                          )}
                          {unread && (
                            <span style={{ background: '#22c55e', color: '#fff', fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, borderRadius: 980, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                              {c.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* CENTER PANE: Active Chat Thread & Reply Input */}
        <div style={{ flex: 1, display: isMobile && activeMobilePanel === 'list' ? 'none' : 'flex', flexDirection: 'column', background: '#f8fafc' }}>
          {contact ? (
            <>
              {/* Top Chat Contact Header (Light Theme) */}
              <div style={{ padding: '14px 24px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 16, color: '#0f172a' }}>{contact.name}</strong>
                    {contact.is_registered ? (
                      <span style={{ fontSize: 11, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: 980, fontWeight: 700 }}>
                        👑 Registered Candidate
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 980, fontWeight: 600 }}>
                        📝 Unregistered
                      </span>
                    )}
                    <button
                      type="button"
                      title="Status history"
                      onClick={() => setShowHistory(true)}
                      style={{ position: 'relative', width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#4338ca', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '50%', cursor: 'pointer', flexShrink: 0 }}
                    >
                      <i className="fa-solid fa-clock-rotate-left" style={{ fontSize: 13 }} />
                      {contact.status_history && contact.status_history.length > 0 && (
                        <span style={{ position: 'absolute', top: -5, right: -5, background: '#4338ca', color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 999, minWidth: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{contact.status_history.length}</span>
                      )}
                    </button>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
                    📱 +91 {contact.clean_mobile || contact.phone} {contact.district !== '-' && `· ${contact.district}${contact.assembly && contact.assembly !== '-' ? ` · ${contact.assembly}` : ''}`}
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {actionMsg && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>{actionMsg}</span>}

                  <button type="button" title="Clear chat" onClick={() => setShowClearConfirm(true)}
                    style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="fa-solid fa-trash-can" style={{ fontSize: 15 }} />
                  </button>

                  {/* WhatsApp messaging-window timer / lock indicator */}
                  <span
                    title={windowLocked
                      ? (windowNeverOpened
                        ? 'No open messaging window — the user must message you first. Send a Template to reach out now.'
                        : 'Messaging window closed — the user must message again to reopen the chat.')
                      : (contact.window_source === 'ad' ? 'Came via Ad — 72 hour window' : 'Direct message — 24 hour window')}
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      padding: '6px 12px',
                      borderRadius: 980,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: windowLocked ? '#dc2626' : windowRed ? '#fee2e2' : '#dcfce7',
                      color: windowLocked ? '#ffffff' : windowRed ? '#dc2626' : '#166534',
                      border: `1px solid ${windowLocked ? '#dc2626' : windowRed ? '#fecaca' : '#bbf7d0'}`,
                    }}
                  >
                    {windowLocked
                      ? (windowNeverOpened ? '🔒 Window Closed' : '🔒 Session Closed')
                      : `⏳ ${fmtRemaining(remainingMs)}`}
                    {!windowLocked && (
                      <span style={{ fontSize: 10, opacity: 0.8 }}>
                        ({contact.window_source === 'ad' ? '72h · Ad' : '24h'})
                      </span>
                    )}
                  </span>

                  {/* Register Flow — only for users who have NOT registered yet */}
                  {!contact.is_registered && (
                    <button
                      type="button"
                      onClick={handleSendFlow}
                      style={{
                        background: '#0284c7',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '7px 14px',
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      🗳️ Send Register Flow
                    </button>
                  )}

                  {/* Credentials — only for registered candidates */}
                  {contact.is_registered && (
                    <button
                      onClick={handleSendCredentials}
                      style={{
                        background: '#16a34a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '7px 14px',
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      🔑 Send Credentials
                    </button>
                  )}
                </div>
              </div>

              {/* Chat Messages Feed (Light Theme) */}
              <div style={{ flex: 1, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, backgroundColor: '#efeae2', backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 0)', backgroundSize: '20px 20px' }}>
                {loadingChat ? (
                  <Spinner label="Loading chat history..." />
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 13 }}>
                    No previous messages. Type below to send a WhatsApp message.
                  </div>
                ) : (
                  messages.map((m, idx) => {
                    const isOut = m.direction === 'outgoing';
                    const meta = m.metadata || {};
                    const timeStr = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    const failed = isOut && meta.delivery_status === 'failed';
                    const deliveryMark = isOut
                      ? (failed
                        ? <span style={{ color: '#dc2626', fontWeight: 700 }}> ✕ not delivered</span>
                        : <span style={{ color: '#53bdeb', fontWeight: 700 }}> ✓✓</span>)
                      : null;
                    const prev = messages[idx - 1];
                    const showDate = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();

                    // Media detection (incoming media or outgoing attachment)
                    const mediaUrl = meta.mediaUrl || (meta.action === 'sent_media' ? meta.headerUrl : null);
                    const isMedia = !!mediaUrl;
                    const mediaKind = meta.mediaType || (meta.headerType === 'video' ? 'video' : 'image');

                    const hasHeaderUrl = !!meta.headerUrl;
                    const isRich = !isMedia && (hasHeaderUrl || !!meta.flowCta || !!meta.btnUrl
                      || meta.action === 'sent_registration_flow'
                      || meta.action === 'sent_credentials' || meta.action === 'manual_crm_sent_credentials');

                    let btn = null;
                    if (meta.action === 'sent_registration_flow' || meta.flowCta) {
                      btn = { label: `🗳️ ${meta.flowCta || 'Register Now'}`, href: 'https://tnedms.com/register' };
                    } else if (meta.action === 'sent_credentials' || meta.action === 'manual_crm_sent_credentials' || meta.btnUrl) {
                      btn = { label: `🔗 ${meta.btnText || 'Login Now'}`, href: meta.btnUrl || 'https://tnedms.com/login' };
                    }

                    const quote = meta.reply_preview;
                    const mid = m._id || idx;

                    const quoteBlock = quote ? (
                      <div style={{ borderLeft: '3px solid #0071e3', background: isOut ? 'rgba(0,0,0,0.06)' : '#f1f5f9', borderRadius: 6, padding: '4px 8px', marginBottom: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#0071e3' }}>{quote.author}</div>
                        <div style={{ fontSize: 12, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{quote.text}</div>
                      </div>
                    ) : null;

                    // ---- Build the inner bubble ----
                    let inner;
                    if (isMedia) {
                      inner = (
                        <div style={{ background: isOut ? '#d9fdd3' : '#ffffff', borderRadius: 10, padding: 6, boxShadow: '0 1px 1px rgba(0,0,0,0.13)', maxWidth: 290 }}>
                          {quoteBlock}
                          {mediaKind === 'image' && (
                            <img src={mediaUrl} alt="" onClick={() => window.open(mediaUrl, '_blank')} style={{ maxWidth: '100%', borderRadius: 8, display: 'block', cursor: 'pointer' }} />
                          )}
                          {mediaKind === 'video' && (
                            <video src={mediaUrl} controls style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} />
                          )}
                          {mediaKind === 'audio' && (
                            <audio src={mediaUrl} controls style={{ width: 250, display: 'block' }} />
                          )}
                          {mediaKind === 'document' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#f8fafc', borderRadius: 8 }}>
                              <i className="fa-solid fa-file-lines" style={{ fontSize: 24, color: '#dc2626' }} />
                              <span style={{ fontSize: 12.5, color: '#0f172a', fontWeight: 600, wordBreak: 'break-word' }}>{meta.filename || 'Document'}</span>
                            </div>
                          )}
                          {m.body && <div style={{ fontSize: 13.5, color: '#111b21', padding: '6px 4px 0', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: formatWhatsappText(m.body) }} />}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 4px 0', gap: 8 }}>
                            <button type="button" onClick={() => downloadFile(mediaUrl, meta.filename)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: '#0071e3', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                              <i className="fa-solid fa-download" style={{ fontSize: 12, color: '#0071e3' }} />
                              Download
                            </button>
                            <span style={{ fontSize: 10.5, color: '#667781' }}>{timeStr}{deliveryMark}</span>
                          </div>
                        </div>
                      );
                    } else if (isRich) {
                      inner = (
                        <div style={{ maxWidth: 340, background: '#ffffff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}>
                          {quoteBlock}
                          {hasHeaderUrl && (
                            meta.headerType === 'video'
                              ? <video src={meta.headerUrl} controls style={{ width: '100%', display: 'block', maxHeight: 220, objectFit: 'cover' }} />
                              : <img src={meta.headerUrl} alt="" style={{ width: '100%', display: 'block', maxHeight: 220, objectFit: 'cover' }} />
                          )}
                          {meta.headerText && <div style={{ padding: '10px 14px 0', fontWeight: 800, fontSize: 14.5, color: '#0f172a' }}>📌 {meta.headerText}</div>}
                          <div style={{ padding: '10px 14px', fontSize: 13.5, color: '#111b21', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: formatWhatsappText(m.body) }} />
                          <div style={{ padding: '0 14px 8px', textAlign: 'right', fontSize: 10.5, color: '#8696a0' }}>{timeStr}{deliveryMark}</div>
                          {btn && (
                            <a href={btn.href} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderTop: '1px solid #e9edef', padding: '11px', color: '#00a5f4', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
                              {btn.label}
                            </a>
                          )}
                        </div>
                      );
                    } else {
                      inner = (
                        <div style={{ background: isOut ? '#d9fdd3' : '#ffffff', color: '#111b21', borderRadius: isOut ? '10px 10px 2px 10px' : '10px 10px 10px 2px', padding: '8px 12px', boxShadow: '0 1px 1px rgba(0, 0, 0, 0.13)', fontSize: 14, lineHeight: 1.45 }}>
                          {quoteBlock}
                          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: formatWhatsappText(m.body) }} />
                          <div style={{ textAlign: 'right', fontSize: 10.5, color: '#667781', marginTop: 3, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                            {timeStr}{deliveryMark}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <Fragment key={mid}>
                        {showDate && (
                          <div style={{ alignSelf: 'center', flexShrink: 0, margin: '6px 0', background: '#e2eaf0', color: '#475569', fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 8, boxShadow: '0 1px 1px rgba(0,0,0,0.08)' }}>
                            {dayLabel(m.created_at)}
                          </div>
                        )}
                        <div style={{ alignSelf: isOut ? 'flex-end' : 'flex-start', flexShrink: 0, maxWidth: '78%', display: 'flex', alignItems: 'center', gap: 3, flexDirection: isOut ? 'row-reverse' : 'row' }}>
                          <div style={{ position: 'relative' }}>
                            {inner}
                            {meta.reaction && (
                              <span style={{ position: 'absolute', bottom: -11, [isOut ? 'right' : 'left']: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 999, padding: '1px 6px', fontSize: 13, lineHeight: 1.4, boxShadow: '0 1px 3px rgba(0,0,0,0.18)' }}>{meta.reaction}</span>
                            )}
                          </div>
                          <div style={{ position: 'relative' }}>
                            <button type="button" title="React" onClick={() => { setOpenReactId(openReactId === mid ? null : mid); setOpenMenuId(null); }}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px', borderRadius: 6, lineHeight: 0 }}>
                              <i className="fa-regular fa-face-smile" style={{ fontSize: 16 }} />
                            </button>
                            {openReactId === mid && (
                              <>
                                <div onClick={() => setOpenReactId(null)} style={{ position: 'fixed', inset: 0, zIndex: 55 }} />
                                <div style={{ position: 'absolute', bottom: 28, [isOut ? 'right' : 'left']: 0, zIndex: 60, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 980, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', padding: '5px 8px', display: 'flex', gap: 5, alignItems: 'center', width: 'max-content' }}>
                                  {QUICK_REACTIONS.map((e) => (
                                    <button key={e} type="button" onClick={() => handleReact(m, e)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, padding: 2, lineHeight: 1 }}>{e}</button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                          <div style={{ position: 'relative' }}>
                            <button type="button" title="Options" onClick={() => { setOpenMenuId(openMenuId === mid ? null : mid); setOpenReactId(null); }}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px', borderRadius: 6, lineHeight: 0 }}>
                              <i className="fa-solid fa-chevron-down" style={{ fontSize: 14 }} />
                            </button>
                            {openMenuId === mid && (
                              <>
                                <div onClick={() => setOpenMenuId(null)} style={{ position: 'fixed', inset: 0, zIndex: 55 }} />
                                <div style={{ position: 'absolute', bottom: 28, [isOut ? 'right' : 'left']: 0, zIndex: 60, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', overflow: 'hidden', width: 'max-content', minWidth: 150 }}>
                                  <button type="button" onClick={() => startReplyFor(m)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13.5, color: '#0f172a', fontWeight: 600, textAlign: 'left' }}>
                                    <i className="fa-solid fa-reply" style={{ fontSize: 14, width: 16, textAlign: 'center' }} /> Reply
                                  </button>
                                  {isMedia && (
                                    <button type="button" onClick={() => { downloadFile(mediaUrl, meta.filename); setOpenMenuId(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', border: 'none', borderTop: '1px solid #f1f5f9', background: 'none', cursor: 'pointer', fontSize: 13.5, color: '#0f172a', fontWeight: 600, textAlign: 'left' }}>
                                      <i className="fa-solid fa-download" style={{ fontSize: 14, width: 16, textAlign: 'center' }} /> Download
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply preview banner */}
              {replyingTo && (
                <div style={{ padding: '8px 16px', background: '#eef2ff', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, borderLeft: '3px solid #0071e3', paddingLeft: 8, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#0071e3' }}>Replying to {replyingTo.author}</div>
                    <div style={{ fontSize: 12.5, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyingTo.text}</div>
                  </div>
                  <button type="button" onClick={() => setReplyingTo(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', fontSize: 16, fontWeight: 700 }}>✕</button>
                </div>
              )}

              {/* Payment-method warning — a template was accepted but not delivered */}
              {paymentFailed && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px', background: '#fef3c7', borderTop: '1px solid #fde68a', color: '#92400e', fontSize: 12.5, lineHeight: 1.45 }}>
                  <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 15, marginTop: 1, color: '#d97706' }} />
                  <div>
                    <strong>Message not delivered — no payment method.</strong> Templates sent outside the 24/72h window are billed by WhatsApp. Add a payment card in <strong>Meta Business Settings → WhatsApp Manager → Billing &amp; payments</strong>, then resend.
                  </div>
                </div>
              )}

              {/* Bottom Reply Form (Light Theme) */}
              <form onSubmit={sendReply} style={{ padding: '12px 16px', background: windowLocked ? '#fef2f2' : '#ffffff', borderTop: `1px solid ${windowLocked ? '#fecaca' : '#e2e8f0'}`, display: 'flex', gap: 10, alignItems: 'center', transition: 'background 0.2s ease' }}>
                <input type="file" ref={fileInputRef} onChange={handleAttachFile} style={{ display: 'none' }} accept="image/*,video/*,application/pdf" />
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    type="button"
                    title="Emoji"
                    onClick={() => setShowEmoji((v) => !v)}
                    style={{ width: 42, height: 42, borderRadius: 12, border: '1px solid ' + (windowLocked ? '#fecaca' : '#cbd5e1'), background: showEmoji ? '#e0f2fe' : (windowLocked ? '#fff5f5' : '#f8fafc'), cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <i className="fa-regular fa-face-smile" style={{ fontSize: 20, color: showEmoji ? '#0071e3' : (windowLocked ? '#b91c1c' : '#334155') }} />
                  </button>
                  {showEmoji && (
                    <>
                      <div onClick={() => setShowEmoji(false)} style={{ position: 'fixed', inset: 0, zIndex: 55 }} />
                      <div style={{ position: 'absolute', bottom: 52, left: 0, zIndex: 60, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: 10, width: 292, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2, maxHeight: 210, overflowY: 'auto' }}>
                        {EMOJIS.map((e) => (
                          <button key={e} type="button" onClick={() => setReplyText((t) => t + e)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, padding: 3, borderRadius: 6 }}>{e}</button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  title="Message Templates"
                  onClick={() => setShowTemplates((v) => !v)}
                  style={{
                    width: 42, height: 42, flexShrink: 0, borderRadius: 12,
                    border: '1px solid ' + (showTemplates ? '#0071e3' : (windowLocked ? '#fecaca' : '#cbd5e1')),
                    background: showTemplates ? '#e0f2fe' : (windowLocked ? '#fff5f5' : '#f8fafc'),
                    cursor: 'pointer', fontSize: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <i className="fa-solid fa-layer-group" style={{ fontSize: 19, color: showTemplates ? '#0071e3' : (windowLocked ? '#b91c1c' : '#334155') }} />
                </button>
                <button
                  type="button"
                  title={windowLocked ? 'Attachments need an open window' : 'Attach file'}
                  disabled={windowLocked}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    width: 42, height: 42, flexShrink: 0, borderRadius: 12,
                    border: '1px solid ' + (windowLocked ? '#fecaca' : '#cbd5e1'),
                    background: windowLocked ? '#fff5f5' : '#f8fafc',
                    cursor: windowLocked ? 'not-allowed' : 'pointer', opacity: windowLocked ? 0.6 : 1,
                    fontSize: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <i className="fa-solid fa-paperclip" style={{ fontSize: 20, color: windowLocked ? '#b91c1c' : '#334155' }} />
                </button>
                <input
                  type="text"
                  disabled={windowLocked}
                  placeholder={windowLocked
                    ? '🔒 Session closed — waiting for the user to message again to reopen the chat'
                    : 'Type your WhatsApp reply message... (Press Enter to send)'}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendReply(e);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: windowLocked ? '1px solid #fecaca' : '1px solid #cbd5e1',
                    fontSize: 14.5,
                    outline: 'none',
                    background: windowLocked ? '#fff5f5' : '#f8fafc',
                    color: windowLocked ? '#b91c1c' : '#0f172a',
                    cursor: windowLocked ? 'not-allowed' : 'text',
                  }}
                />
                <button
                  type="submit"
                  disabled={sending || !replyText.trim() || windowLocked}
                  style={{
                    background: windowLocked ? '#dc2626' : '#0071e3',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    padding: '12px 24px',
                    fontWeight: 700,
                    fontSize: 14.5,
                    cursor: sending || !replyText.trim() || windowLocked ? 'not-allowed' : 'pointer',
                    opacity: sending || !replyText.trim() ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {windowLocked ? '🔒 Locked' : sending ? 'Sending...' : '🚀 Send'}
                </button>
              </form>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 48 }}>💬</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Select a WhatsApp contact to start chatting</div>
            </div>
          )}
        </div>

        {/* RIGHT DRAWER: WhatsApp Templates Panel */}
        {showTemplates && !isMobile && (
          <div style={{ width: 340, background: '#ffffff', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>🧩 Message Templates</h3>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>Send anytime — even outside the window</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" title="New template" onClick={() => setShowTplForm((v) => !v)} style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: showTplForm ? '#0f172a' : '#0071e3', color: '#ffffff', cursor: 'pointer', fontSize: 20, fontWeight: 700, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                <button type="button" title="Close" onClick={() => setShowTemplates(false)} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f1f5f9', color: '#334155', cursor: 'pointer', fontSize: 15, fontWeight: 700, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            </div>

            {showTplForm && (
              <form onSubmit={handleCreateTemplate} style={{ padding: 16, borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Create New Template</div>
                <input type="text" placeholder="Template name (e.g. welcome_offer)" value={tplForm.name}
                  onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', marginBottom: 8 }} />

                {/* Header type selector */}
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>HEADER</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {[['none', 'None'], ['text', 'Text'], ['image', '🖼️ Photo']].map(([val, lbl]) => (
                    <button key={val} type="button" onClick={() => setTplForm({ ...tplForm, headerType: val })}
                      style={{ flex: 1, padding: '7px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        border: tplForm.headerType === val ? '1px solid #0071e3' : '1px solid #cbd5e1',
                        background: tplForm.headerType === val ? '#0071e3' : '#ffffff',
                        color: tplForm.headerType === val ? '#ffffff' : '#334155' }}>
                      {lbl}
                    </button>
                  ))}
                </div>

                {tplForm.headerType === 'text' && (
                  <input type="text" placeholder="Header text (short title)" value={tplForm.header}
                    onChange={(e) => setTplForm({ ...tplForm, header: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', marginBottom: 8 }} />
                )}

                {tplForm.headerType === 'image' && (
                  <div style={{ marginBottom: 8 }}>
                    <input type="file" ref={tplHeaderInputRef} accept="image/*" onChange={handleTplHeaderImage} style={{ display: 'none' }} />
                    {tplHeaderImage ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <img src={tplHeaderImage.base64} alt="header" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                        <span style={{ flex: 1, fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tplHeaderImage.filename}</span>
                        <button type="button" onClick={() => setTplHeaderImage(null)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Remove</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => tplHeaderInputRef.current?.click()}
                        style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px dashed #94a3b8', background: '#ffffff', color: '#0071e3', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        📤 Upload Header Photo
                      </button>
                    )}
                  </div>
                )}
                <textarea rows={4} placeholder="Message body..." value={tplForm.body}
                  onChange={(e) => setTplForm({ ...tplForm, body: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit', resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <select value={tplForm.category} onChange={(e) => setTplForm({ ...tplForm, category: e.target.value })}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}>
                    <option value="MARKETING">Marketing</option>
                    <option value="UTILITY">Utility</option>
                  </select>
                  <select value={tplForm.language} onChange={(e) => setTplForm({ ...tplForm, language: e.target.value })}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }}>
                    <option value="en">English (en)</option>
                    <option value="en_US">English US (en_US)</option>
                    <option value="ta">Tamil (ta)</option>
                  </select>
                </div>
                <button type="submit" disabled={tplSubmitting}
                  style={{ width: '100%', padding: '9px', borderRadius: 8, border: 'none', background: '#0071e3', color: '#fff', fontWeight: 700, fontSize: 13, cursor: tplSubmitting ? 'not-allowed' : 'pointer' }}>
                  {tplSubmitting ? 'Submitting…' : 'Submit for Approval'}
                </button>
                <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 6 }}>Meta reviews new templates — status updates automatically below.</div>
              </form>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {loadingTemplates && templates.length === 0 ? (
                <div style={{ padding: 20 }}><Spinner label="Loading templates..." /></div>
              ) : templates.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No templates yet. Tap + to create one.</div>
              ) : (
                templates.map((tpl) => {
                  const status = String(tpl.status || '').toUpperCase();
                  const approved = status === 'APPROVED';
                  const dot = approved ? '#16a34a' : status === 'REJECTED' ? '#dc2626' : '#d97706';
                  return (
                    <div key={tpl.name + tpl.language} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 8px', borderBottom: '1px solid #f1f5f9' }}>
                      <input type="checkbox" checked={selectedTplName === tpl.name}
                        onChange={() => setSelectedTplName(selectedTplName === tpl.name ? null : tpl.name)}
                        style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
                      <button type="button" onClick={() => setPreviewTpl(tpl)} title="Tap to preview full message"
                        style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', wordBreak: 'break-word' }}>{tpl.name}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginLeft: 14 }}>
                          {approved ? 'Approved · tap to preview' : status === 'REJECTED' ? 'Rejected' : 'Pending approval'}
                        </div>
                      </button>
                      <button type="button" title={approved ? 'Send to this contact' : 'Only approved templates can be sent'}
                        disabled={!approved || !activePhone} onClick={() => handleSendTemplate(tpl)}
                        style={{ width: 36, height: 36, borderRadius: 8, border: 'none', flexShrink: 0, fontSize: 16,
                          background: approved && activePhone ? '#16a34a' : '#e2e8f0',
                          color: approved && activePhone ? '#fff' : '#94a3b8',
                          cursor: approved && activePhone ? 'pointer' : 'not-allowed' }}>
                        ➤
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* RIGHT DRAWER: Candidate Profile Dossier */}
        {contact && !showTemplates && !isMobile && (
          <div style={{ width: 350, background: '#f8fafc', borderLeft: '1px solid #e2e8f0', padding: 0, overflowY: 'auto' }}>
            {/* Profile hero */}
            <div style={{ background: 'linear-gradient(135deg, #0071e3 0%, #4f46e5 100%)', padding: '20px 18px 18px', color: '#fff' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '1px', opacity: 0.85, marginBottom: 12 }}>CANDIDATE DOSSIER</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', border: '2px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, fontWeight: 800, flexShrink: 0 }}>
                  {(String(contact.name || '#').replace(/[^A-Za-z0-9]/g, '').charAt(0) || '#').toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contact.name}</div>
                  <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 2 }}>📱 {contact.phone}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 980, background: contact.is_registered ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.22)', color: contact.is_registered ? '#15803d' : '#fff', border: '1px solid rgba(255,255,255,0.5)' }}>
                  {contact.is_registered ? '👑 Registered' : '📝 Flow Sent'}
                </span>
                {(contact.is_pro || String(contact.paid_status).toLowerCase() === 'yes') && (
                  <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 980, background: '#f3e8ff', color: '#6b21a8', border: '1px solid #ddd6fe' }}>⭐ PRO</span>
                )}
              </div>
            </div>

            <div style={{ padding: 16 }}>
              {/* Info cards */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
                {[
                  ['📍', 'District', contact.district],
                  ['🗳️', 'Assembly', contact.assembly],
                  ['🎯', 'Position', contact.position],
                ].map(([icon, label, value], i, arr) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                    <span style={{ fontSize: 11, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', width: 78, flexShrink: 0 }}>{label}</span>
                    <span style={{ fontSize: 13.5, color: '#0f172a', fontWeight: 800, wordBreak: 'break-word', flex: 1 }}>{value || '-'}</span>
                  </div>
                ))}
              </div>

              {/* Selected booths */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px', marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800, letterSpacing: '0.5px', marginBottom: 7 }}>
                  📌 BOOTH(S){contact.booths && contact.booths.length ? ` (${contact.booths.length})` : ''}
                </div>
                {contact.booths && contact.booths.length ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: showAllBooths ? 260 : 104, overflowY: 'auto' }}>
                    {(showAllBooths ? contact.booths : contact.booths.slice(0, 80)).map((b, i) => (
                      <span key={i} style={{ fontSize: 11, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '2px 7px', borderRadius: 6, fontWeight: 700 }}>
                        {/^\d+$/.test(String(b)) ? `Booth ${b}` : b}
                      </span>
                    ))}
                    {contact.booths.length > 80 && (
                      <button
                        type="button"
                        onClick={() => setShowAllBooths((v) => !v)}
                        style={{ fontSize: 11, color: '#0071e3', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '2px 8px', fontWeight: 700, cursor: 'pointer', alignSelf: 'center' }}
                      >
                        {showAllBooths ? '▲ Show less' : `+${contact.booths.length - 80} more`}
                      </button>
                    )}
                  </div>
                ) : (
                  <span style={{ fontSize: 12.5, color: '#94a3b8' }}>-</span>
                )}
              </div>

              {/* Passcode + plan */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
                <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800, letterSpacing: '0.5px', marginBottom: 4 }}>🔒 PASSCODE</div>
                  <code style={{ background: '#e8f5e9', color: '#2e7d32', fontWeight: 800, padding: '3px 8px', borderRadius: 5, fontSize: 13, display: 'inline-block' }}>{contact.passcode || '-'}</code>
                </div>
                <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800, letterSpacing: '0.5px', marginBottom: 4 }}>⭐ PLAN</div>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: (contact.is_pro || String(contact.paid_status).toLowerCase() === 'yes') ? '#6b21a8' : '#64748b' }}>
                    {(contact.is_pro || String(contact.paid_status).toLowerCase() === 'yes') ? 'Active PRO' : 'Free / Trial'}
                  </span>
                </div>
              </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13.5 }}>
              {/* Lead Status Tagging Section */}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                <span style={{ color: '#475569', display: 'block', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.5px', marginBottom: 10 }}>
                  SET LEAD FOLLOW-UP STATUS
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => requestStatusChange('interested', '🟢 Intrested')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: contact.lead_status === 'interested' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                      background: contact.lead_status === 'interested' ? '#dcfce7' : '#ffffff',
                      color: '#166534',
                      fontWeight: 700,
                      fontSize: 11.5,
                      cursor: 'pointer',
                    }}
                  >
                    🟢 Intrested
                  </button>

                  <button
                    type="button"
                    onClick={() => requestStatusChange('not_interested', '🔴 Not Intrested')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: contact.lead_status === 'not_interested' ? '2px solid #dc2626' : '1px solid #cbd5e1',
                      background: contact.lead_status === 'not_interested' ? '#fee2e2' : '#ffffff',
                      color: '#991b1b',
                      fontWeight: 700,
                      fontSize: 11.5,
                      cursor: 'pointer',
                    }}
                  >
                    🔴 Not Intrested
                  </button>

                  <button
                    type="button"
                    onClick={() => requestStatusChange('call_completed', '📞 Call Complete')}
                    style={{
                      gridColumn: '1 / -1',
                      padding: '9px 10px',
                      borderRadius: 8,
                      border: contact.lead_status === 'call_completed' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: contact.lead_status === 'call_completed' ? '#dbeafe' : '#ffffff',
                      color: '#1e40af',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    📞 Call Complete
                  </button>

                  <button
                    type="button"
                    onClick={() => requestStatusChange('switch_off', '📱 Switch Off')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: contact.lead_status === 'switch_off' ? '2px solid #d97706' : '1px solid #cbd5e1',
                      background: contact.lead_status === 'switch_off' ? '#fef3c7' : '#ffffff',
                      color: '#b45309',
                      fontWeight: 700,
                      fontSize: 11.5,
                      cursor: 'pointer',
                    }}
                  >
                    📱 Switch Off
                  </button>

                  <button
                    type="button"
                    onClick={() => requestStatusChange('not_answered', '🚫 Not Answered')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: contact.lead_status === 'not_answered' ? '2px solid #64748b' : '1px solid #cbd5e1',
                      background: contact.lead_status === 'not_answered' ? '#f1f5f9' : '#ffffff',
                      color: '#334155',
                      fontWeight: 700,
                      fontSize: 11.5,
                      cursor: 'pointer',
                    }}
                  >
                    🚫 Not Answered
                  </button>

                  <button
                    type="button"
                    onClick={() => requestStatusChange('will_call_back', '🔄 Will Call Back')}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: contact.lead_status === 'will_call_back' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                      background: contact.lead_status === 'will_call_back' ? '#e0f2fe' : '#ffffff',
                      color: '#0369a1',
                      fontWeight: 700,
                      fontSize: 11.5,
                      cursor: 'pointer',
                    }}
                  >
                    🔄 Will Call Back
                  </button>
                </div>
              </div>

              {/* Agent Note / Response Comment Section */}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: '#64748b', fontSize: 11, fontWeight: 700, letterSpacing: '0.5px' }}>
                    📝 CALL NOTE / COMMENT
                  </span>
                  {!isAgent && contact.assigned_agent_name && (
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>
                      By: {contact.assigned_agent_name}
                    </span>
                  )}
                </div>
                <textarea
                  rows={3}
                  placeholder="Write response note or remarks about candidate..."
                  value={agentNotes}
                  onChange={(e) => setAgentNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 12.5,
                    boxSizing: 'border-box',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  style={{
                    marginTop: 8,
                    width: '100%',
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#0f172a',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: savingNotes ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  {savingNotes ? 'Saving Note…' : '💾 Save Note'}
                </button>
              </div>
            </div>
            </div>
          </div>
        )}
      </div>

      {/* CLEAR CHAT CONFIRMATION */}
      {showClearConfirm && (
        <div className="modal-overlay" onClick={() => setShowClearConfirm(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: '92vw', background: '#fff', borderRadius: 14, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="fa-solid fa-trash-can" style={{ fontSize: 18, color: '#dc2626' }} />
              </div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Clear this chat?</h2>
            </div>
            <p style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.6, margin: '0 0 20px' }}>
              This permanently deletes all messages in the chat with <strong>{contact?.name}</strong> and removes any shared photos, videos and documents from storage. This can’t be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowClearConfirm(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={handleClearChat} disabled={clearing} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: clearing ? 'not-allowed' : 'pointer', opacity: clearing ? 0.6 : 1 }}>
                {clearing ? 'Clearing…' : 'Clear Chat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATE PREVIEW — WhatsApp-style bubble */}
      {previewTpl && (
        <div className="modal-overlay" onClick={() => setPreviewTpl(null)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 380, maxWidth: '92vw', background: '#efeae2', backgroundImage: 'radial-gradient(#d6d0c4 1px, transparent 0)', backgroundSize: '18px 18px', borderRadius: 14, padding: 22, position: 'relative' }}>
            <button onClick={() => setPreviewTpl(null)} style={{ position: 'absolute', top: -14, right: -14, width: 32, height: 32, borderRadius: 999, border: 'none', background: '#0f172a', color: '#fff', cursor: 'pointer', fontSize: 14 }}>✕</button>

            <div style={{ background: '#ffffff', borderRadius: 12, overflowY: 'auto', overflowX: 'hidden', maxHeight: '72vh', boxShadow: '0 2px 10px rgba(0,0,0,0.14)' }}>
              {previewTpl.header_image_url ? (
                <img src={previewTpl.header_image_url} alt="header" style={{ width: '100%', display: 'block', objectFit: 'cover', borderTopLeftRadius: 12, borderTopRightRadius: 12 }} />
              ) : (previewTpl.header_format === 'IMAGE' || previewTpl.header_format === 'VIDEO') ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#64748b', background: '#f1f5f9', fontSize: 13, fontWeight: 700 }}>
                  🖼️ {previewTpl.header_format} header
                </div>
              ) : previewTpl.header ? (
                <div style={{ padding: '12px 14px 0', fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{previewTpl.header}</div>
              ) : null}

              <div style={{ padding: '12px 14px', fontSize: 13.5, color: '#111b21', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{ __html: formatWhatsappText(previewTpl.body) }} />

              <div style={{ padding: '0 14px 8px', textAlign: 'right', fontSize: 10.5, color: '#8696a0' }}>
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>

              {(previewTpl.buttons || []).length > 0 && (
                <div>
                  {previewTpl.buttons.map((b, i) => (
                    <div key={i} style={{ borderTop: '1px solid #e9edef', padding: '11px', textAlign: 'center', color: '#00a5f4', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      🔗 {b.text}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <span style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>{previewTpl.name} · {previewTpl.status}</span>
              <button type="button" disabled={String(previewTpl.status).toUpperCase() !== 'APPROVED' || !activePhone}
                onClick={() => { const t = previewTpl; setPreviewTpl(null); handleSendTemplate(t); }}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 13,
                  background: String(previewTpl.status).toUpperCase() === 'APPROVED' && activePhone ? '#16a34a' : '#cbd5e1',
                  color: '#fff', cursor: String(previewTpl.status).toUpperCase() === 'APPROVED' && activePhone ? 'pointer' : 'not-allowed' }}>
                ➤ Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATUS HISTORY TIMELINE MODAL */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: '94vw', maxHeight: '82vh', background: '#fff', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>🕘 Status History</h2>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{contact?.name} · 📱 {contact?.clean_mobile || contact?.phone}</div>
              </div>
              <button onClick={() => setShowHistory(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f1f5f9', color: '#334155', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
            <div style={{ padding: '22px 22px 6px', overflowY: 'auto' }}>
              {(contact?.status_history && contact.status_history.length) ? (
                [...contact.status_history].reverse().map((h, i, arr) => {
                  const color = STATUS_COLORS[h.status] || '#0071e3';
                  const isFirst = i === 0;
                  const isLast = i === arr.length - 1;
                  const nextColor = STATUS_COLORS[arr[i + 1]?.status] || '#cbd5e1';
                  return (
                    <div key={i} style={{ display: 'flex', gap: 14 }}>
                      {/* Timeline rail */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 22, flexShrink: 0 }}>
                        <span style={{ width: isFirst ? 18 : 14, height: isFirst ? 18 : 14, borderRadius: 999, background: color, boxShadow: isFirst ? `0 0 0 4px ${color}22` : 'none', marginTop: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isFirst && <i className="fa-solid fa-check" style={{ fontSize: 8, color: '#fff' }} />}
                        </span>
                        {!isLast && <span style={{ width: 3, flex: 1, minHeight: 30, marginTop: 3, marginBottom: 3, borderRadius: 3, background: `linear-gradient(${color}, ${nextColor})`, opacity: 0.45 }} />}
                      </div>
                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0, paddingBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{STATUS_LABELS[h.status] || h.status}</span>
                          {isFirst && <span style={{ fontSize: 9.5, fontWeight: 800, color: '#fff', background: color, borderRadius: 980, padding: '2px 8px', letterSpacing: '0.3px' }}>CURRENT</span>}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className="fa-regular fa-clock" style={{ fontSize: 11 }} />
                          {h.at ? new Date(h.at).toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className="fa-regular fa-user" style={{ fontSize: 10 }} /> {h.by || '—'}
                        </div>
                        {h.note && (
                          <div style={{ fontSize: 12.5, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 11px', marginTop: 7, whiteSpace: 'pre-wrap' }}>
                            <i className="fa-solid fa-quote-left" style={{ fontSize: 9, color: '#94a3b8', marginRight: 6 }} />{h.note}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '20px 0' }}>No status changes recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION POPUP MODAL FOR LEAD STATUS UPDATE */}
      {statusModal.show && (
        <div className="modal-overlay" onClick={() => setStatusModal({ show: false, statusKey: '', statusLabel: '' })}>
          <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Confirm Lead Status Update</h2>
              <button className="modal-close" onClick={() => setStatusModal({ show: false, statusKey: '', statusLabel: '' })}>✕</button>
            </div>

            <div style={{ padding: 24 }}>
              <div style={{ fontSize: 14, color: '#334155', marginBottom: 14, lineHeight: 1.5 }}>
                Are you sure you want to set the follow-up status for candidate <strong>{contact?.name}</strong> (📱 {contact?.phone}) to:
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 10, padding: 14, textAlign: 'center', fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 18 }}>
                {statusModal.statusLabel}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
                  Add a note for this update (optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Called, will decide by weekend / Number switched off..."
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>This is saved to the status history log with date &amp; time.</div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setStatusModal({ show: false, statusKey: '', statusLabel: '' })}
                  style={{ padding: '8px 16px', borderRadius: 8 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="gov-btn"
                  onClick={confirmStatusChange}
                  style={{ padding: '8px 20px', borderRadius: 8, fontWeight: 700 }}
                >
                  Confirm &amp; Update Status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
