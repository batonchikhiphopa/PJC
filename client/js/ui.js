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

export function formatDateTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toDateTimeLocalValue(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const pad = value => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
}

let modalReturnFocus = null;
let pendingConfirmation = null;
let detailReturnFocus = null;

function modalFocusableElements() {
  return [...el('modal').querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
  )].filter(element => !element.closest('.hidden'));
}

function handleModalKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal();
    return;
  }

  if (event.key !== 'Tab') return;
  const focusable = modalFocusableElements();
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function openModal(title, bodyHtml) {
  if (!el('modal-overlay').classList.contains('hidden')) {
    closeModal();
  }

  modalReturnFocus = document.activeElement;
  el('modal-title').textContent = title;
  el('modal-body').innerHTML = bodyHtml;
  el('app').setAttribute('inert', '');
  el('detail-panel').setAttribute('inert', '');
  showEl('modal-overlay');
  document.addEventListener('keydown', handleModalKeydown);

  requestAnimationFrame(() => {
    const focusable = modalFocusableElements();
    const bodyFocusTarget = el('modal-body').querySelector(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]',
    );
    (bodyFocusTarget || focusable[0] || el('modal')).focus();
  });
}

export function closeModal() {
  document.removeEventListener('keydown', handleModalKeydown);
  hideEl('modal-overlay');
  el('modal-body').innerHTML = '';
  el('app').removeAttribute('inert');
  el('detail-panel').removeAttribute('inert');
  if (pendingConfirmation) {
    const resolve = pendingConfirmation;
    pendingConfirmation = null;
    resolve(false);
  }
  if (modalReturnFocus?.isConnected) {
    modalReturnFocus.focus();
  }
  modalReturnFocus = null;
}

export function confirmAction({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
}) {
  return new Promise(resolve => {
    openModal(title, `
      <p class="confirm-message">${escapeHtml(message)}</p>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="confirm-cancel">Cancel</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-accept">${escapeHtml(confirmLabel)}</button>
      </div>
    `);
    pendingConfirmation = resolve;
    el('confirm-cancel').onclick = closeModal;
    el('confirm-accept').onclick = () => {
      const finish = pendingConfirmation;
      pendingConfirmation = null;
      closeModal();
      finish(true);
    };
  });
}

export function clearFormErrors(container = el('modal-body')) {
  container.querySelectorAll('.field-error').forEach(error => error.remove());
  container.querySelectorAll('[aria-invalid="true"]').forEach(field => {
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
  });
}

export function showFormErrors(error, { errorId, fieldMap = {} }) {
  const container = el('modal-body');
  clearFormErrors(container);
  const details = Array.isArray(error?.details) ? error.details : [];
  let mappedCount = 0;

  for (const detail of details) {
    const fieldId = fieldMap[detail.field];
    const field = fieldId ? el(fieldId) : null;
    if (!field) continue;

    const errorElement = document.createElement('div');
    errorElement.className = 'field-error';
    errorElement.id = `${fieldId}-error`;
    errorElement.textContent = detail.message;
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', errorElement.id);
    field.insertAdjacentElement('afterend', errorElement);
    mappedCount += 1;
  }

  const generalError = el(errorId);
  if (generalError) {
    generalError.textContent = error?.message || 'Something went wrong';
    generalError.classList.toggle('hidden', mappedCount > 0 && mappedCount === details.length);
  }

  const firstInvalid = container.querySelector('[aria-invalid="true"]');
  if (firstInvalid) firstInvalid.focus();
}

export function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button type="button" aria-label="Dismiss notification">✕</button>
  `;
  const remove = () => toast.remove();
  toast.querySelector('button').onclick = remove;
  el('toast-region').appendChild(toast);
  setTimeout(remove, 4500);
}

export function showLoading(id) {
  setHtml(id, '<div class="loading">Loading...</div>');
}

export function showDetailPanel(titleText, bodyHtml) {
  detailReturnFocus = document.activeElement;
  el('detail-title').textContent = titleText;
  el('detail-body').innerHTML = bodyHtml;
  showEl('detail-panel');
  requestAnimationFrame(() => el('detail-title').focus());
}

export function hideDetailPanel() {
  hideEl('detail-panel');
  if (detailReturnFocus?.isConnected) detailReturnFocus.focus();
  detailReturnFocus = null;
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
