// Pure, stateless helpers extracted from CrmInbox.jsx to keep that component
// smaller and to make these reusable/testable in isolation.

export const EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😎','🤩','🥳','👍','🙏','👏','🙌','💪','🔥','✅','❌','⭐','🎉','❤️','🧡','💚','💙','💜','🚀','📞','📱','📅','📍','🗳️','🏛️','💯','🤝','👋','😅','😇','🤔','😢','😡'];

// WhatsApp-style day separator label (Today / Yesterday / weekday / date).
export function dayLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today - that) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function isMediaMsg(m) {
  const meta = m?.metadata || {};
  return !!(meta.mediaUrl || meta.action === 'sent_media');
}

export function mediaUrlOf(m) {
  const meta = m?.metadata || {};
  return meta.mediaUrl || (meta.action === 'sent_media' ? meta.headerUrl : null);
}

// Download a (possibly cross-origin) media url as a file.
export async function downloadFile(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || url.split('/').pop().split('?')[0] || 'download';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch {
    window.open(url, '_blank');
  }
}

// Render WhatsApp-style text: HTML-escapes first (XSS-safe), then applies
// *bold* and `code` formatting. Returns an HTML string for dangerouslySetInnerHTML.
export function formatWhatsappText(txt, isOutBubble = false) {
  if (!txt) return '';
  let s = String(txt)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  s = s.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
  const codeBg = isOutBubble ? 'rgba(255,255,255,0.22)' : '#e8f5e9';
  const codeColor = isOutBubble ? '#ffffff' : '#008069';
  const codeBorder = isOutBubble ? '1px solid rgba(255,255,255,0.3)' : '1px solid #c8e6c9';
  s = s.replace(/`(.*?)`/g, `<code style="background:${codeBg};color:${codeColor};border:${codeBorder};padding:2px 6px;border-radius:4px;font-family:monospace;font-weight:700;display:inline-block;margin:2px 2px;">$1</code>`);
  return s;
}
