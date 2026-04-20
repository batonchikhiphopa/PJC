// ui.js — UI helpers

export function el(id) { return document.getElementById(id); }

export function showEl(id) { el(id).classList.remove('hidden'); }
export function hideEl(id) { el(id).classList.add('hidden'); }

export function setHtml(id, html) { el(id).innerHTML = html; }

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeAttr(value) {
  return escapeHtml(value);
}

export function safeExternalUrl(value) {
  if (!value) return '';

  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function alertError(message) {
  return `<div class="alert alert-error">${escapeHtml(message)}</div>`;
}

export function showError(id, msg) {
  const e = el(id);
  e.textContent = msg;
  e.classList.remove('hidden');
}

export function hideError(id) {
  el(id).classList.add('hidden');
}

export function statusBadge(status) {
  const normalized = ALL_STATUSES.includes(status) ? status : 'wishlist';
  return `<span class="badge badge-${normalized}">${escapeHtml(statusLabel(normalized))}</span>`;
}

export function statusLabel(status) {
  return String(status ?? '').replace('_', ' ');
}

export function formatDate(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function openModal(title, bodyHtml) {
  el('modal-title').textContent = title;
  el('modal-body').innerHTML = bodyHtml;
  showEl('modal-overlay');
}

export function closeModal() {
  hideEl('modal-overlay');
  el('modal-body').innerHTML = '';
}

export function showLoading(id) {
  setHtml(id, '<div class="loading">Loading...</div>');
}

export function showDetailPanel(titleText, bodyHtml) {
  el('detail-title').textContent = titleText;
  el('detail-body').innerHTML = bodyHtml;
  showEl('detail-panel');
}

export function hideDetailPanel() {
  hideEl('detail-panel');
}

// Status colors for bars
export const STATUS_COLORS = {
  wishlist: '#8a8fa8',
  applied: '#5b7fff',
  interview: '#a855f7',
  test_task: '#f5a623',
  offer: '#3ecf8e',
  rejected: '#ff5757',
  ghosted: '#64748b',
};

export const ALL_STATUSES = ['wishlist', 'applied', 'interview', 'test_task', 'offer', 'rejected', 'ghosted'];
