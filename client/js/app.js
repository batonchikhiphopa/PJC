// app.js — main orchestration

import { checkSession, initLoginScreen, logout } from './auth.js';
import { companies as companiesApi, applications as appsApi, notes as notesApi } from './api.js';
import { state, setCompanies } from './state.js';
import {
  el, showEl, hideEl, setHtml, openModal, closeModal,
  statusBadge, formatDate, showLoading, showDetailPanel, hideDetailPanel,
  alertError, escapeHtml, escapeAttr, safeExternalUrl, statusLabel,
  STATUS_COLORS, ALL_STATUSES
} from './ui.js';

let applicationsCompanyLoadError = '';

function getErrorMessage(err, fallback = 'Something went wrong') {
  return err?.message || fallback;
}

function renderExternalLink(url, label = url) {
  const safeUrl = safeExternalUrl(url);
  if (!safeUrl) return '';

  return `<a href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">${escapeHtml(label)}</a>`;
}

function renderWebsite(value) {
  if (!value) return '';

  return renderExternalLink(value, value) || `<span>${escapeHtml(value)}</span>`;
}

// ===== BOOT =====
async function boot() {
  const user = await checkSession();
  if (!user) {
    initLoginScreen(startApp);
    showEl('login-screen');
  } else {
    startApp(user);
  }
}

function startApp(user) {
  showEl('app');
  el('sidebar-email').textContent = user.email;

  // Nav
  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(link.dataset.page);
    });
  });

  el('logout-btn').addEventListener('click', logout);
  el('modal-close').addEventListener('click', closeModal);
  el('modal-overlay').addEventListener('click', e => {
    if (e.target === el('modal-overlay')) closeModal();
  });
  el('detail-close').addEventListener('click', hideDetailPanel);

  // Initial page
  navigateTo('dashboard');
}

function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
  const link = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (link) link.classList.add('active');

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  el(`page-${page}`).classList.add('active');

  hideDetailPanel();

  if (page === 'dashboard') loadDashboard();
  if (page === 'applications') loadApplicationsPage();
  if (page === 'companies') loadCompaniesPage();
}

// ===== DASHBOARD =====
async function loadDashboard() {
  showLoading('dashboard-content');
  try {
    const data = await appsApi.dashboard();
    renderDashboard(data);
  } catch (err) {
    setHtml('dashboard-content', alertError(getErrorMessage(err, 'Failed to load dashboard')));
  }
}

function renderDashboard(data) {
  const total = Number(data.totalApplications || 0);
  const counts = data.countsByStatus || {};
  const perCompany = Array.isArray(data.applicationsPerCompany) ? data.applicationsPerCompany : [];
  const recent = Array.isArray(data.recentApplications) ? data.recentApplications : [];

  // Stats cards
  let statsHtml = `<div class="stats-grid">
    <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">${total}</div></div>`;
  for (const s of ALL_STATUSES) {
    const count = Number(counts[s] || 0);
    if (count > 0) {
      statsHtml += `<div class="stat-card">
        <div class="stat-label">${escapeHtml(statusLabel(s))}</div>
        <div class="stat-value" style="color:${STATUS_COLORS[s]}">${count}</div>
      </div>`;
    }
  }
  statsHtml += '</div>';

  // Status bars
  let barsHtml = ALL_STATUSES.map(s => {
    const count = Number(counts[s] || 0);
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `<div class="status-bar-row">
      <span class="status-bar-label">${escapeHtml(statusLabel(s))}</span>
      <div class="status-bar-track">
        <div class="status-bar-fill" style="width:${pct}%;background:${STATUS_COLORS[s]}"></div>
      </div>
      <span class="status-bar-count">${count}</span>
    </div>`;
  }).join('');

  // Per company
  let companyHtml = perCompany.length === 0
    ? '<div style="color:var(--text2);font-size:13px">No data yet</div>'
    : perCompany.map(c => `
      <div class="company-row">
        <span>${escapeHtml(c.companyName)}</span>
        <span class="company-count">${Number(c.count || 0)}</span>
      </div>`).join('');

  // Recent apps
  let recentHtml = recent.length === 0
    ? '<div style="color:var(--text2);font-size:13px;padding:12px 0">No applications yet</div>'
    : `<div class="table-wrap"><table>
        <thead><tr><th>Title</th><th>Company</th><th>Status</th><th>Applied</th></tr></thead>
        <tbody>${recent.map(a => `
          <tr data-id="${escapeAttr(a.id)}" class="app-row-click">
            <td>${escapeHtml(a.title)}</td>
            <td>${escapeHtml(a.company?.name || '-')}</td>
            <td>${statusBadge(a.status || 'wishlist')}</td>
            <td>${formatDate(a.appliedAt || a.createdAt)}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;

  setHtml('dashboard-content', `
    ${statsHtml}
    <div class="dashboard-grid">
      <div class="section-card">
        <h4>By Status</h4>
        <div class="status-bars">${barsHtml}</div>
      </div>
      <div class="section-card">
        <h4>By Company</h4>
        <div class="company-list">${companyHtml}</div>
      </div>
    </div>
    <div class="section-card" style="margin-top:20px">
      <h4>Recent Applications</h4>
      ${recentHtml}
    </div>
  `);

  // Clicking a recent app row opens detail
  document.querySelectorAll('.app-row-click').forEach(row => {
    row.addEventListener('click', () => openApplicationDetail(Number(row.dataset.id)));
  });
}

// ===== COMPANIES PAGE =====
async function loadCompaniesPage() {
  showLoading('companies-list');
  try {
    const list = await companiesApi.list();
    setCompanies(list);
    renderCompaniesList(list);
  } catch (err) {
    setHtml('companies-list', alertError(getErrorMessage(err, 'Failed to load companies')));
  }

  el('new-company-btn').onclick = () => openCompanyForm(null);
}

function renderCompaniesList(list) {
  if (list.length === 0) {
    setHtml('companies-list', '<div class="empty-state"><strong>No companies yet</strong>Add your first company to get started.</div>');
    return;
  }

  setHtml('companies-list', list.map(c => {
    const websiteHtml = renderWebsite(c.website);
    const locationHtml = c.location ? `<span>${escapeHtml(c.location)}</span>` : '';
    const detailsHtml = websiteHtml || locationHtml
      ? `${websiteHtml}${locationHtml}`
      : '<span>No details</span>';

    return `
    <div class="company-card" data-id="${escapeAttr(c.id)}">
      <div class="company-card-info">
        <div class="company-card-name">${escapeHtml(c.name)}</div>
        <div class="company-card-meta">
          ${detailsHtml}
        </div>
      </div>
      <div class="company-card-actions">
        <button class="btn btn-ghost btn-edit-company" data-id="${escapeAttr(c.id)}">Edit</button>
        <button class="btn btn-danger btn-delete-company" data-id="${escapeAttr(c.id)}">Delete</button>
      </div>
    </div>`;
  }).join(''));

  document.querySelectorAll('.btn-edit-company').forEach(btn => {
    btn.addEventListener('click', () => {
      const company = list.find(c => c.id === Number(btn.dataset.id));
      openCompanyForm(company);
    });
  });

  document.querySelectorAll('.btn-delete-company').forEach(btn => {
    btn.addEventListener('click', () => deleteCompany(Number(btn.dataset.id)));
  });
}

function openCompanyForm(company) {
  const isEdit = !!company;
  openModal(isEdit ? 'Edit Company' : 'New Company', `
    <div class="field"><label>Name *</label><input id="co-name" type="text" value="${isEdit ? escapeAttr(company.name) : ''}" /></div>
    <div class="field"><label>Website</label><input id="co-website" type="url" value="${isEdit && company.website ? escapeAttr(company.website) : ''}" placeholder="https://" /></div>
    <div class="field"><label>Location</label><input id="co-location" type="text" value="${isEdit && company.location ? escapeAttr(company.location) : ''}" /></div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="co-cancel">Cancel</button>
      <button class="btn btn-primary" id="co-save">${isEdit ? 'Save Changes' : 'Create Company'}</button>
    </div>
  `);

  el('co-cancel').onclick = closeModal;
  el('co-save').onclick = async () => {
    const name = el('co-name').value.trim();
    const website = el('co-website').value.trim();
    const location = el('co-location').value.trim();
    if (!name) { alert('Company name is required'); return; }
    if (website && !safeExternalUrl(website)) {
      alert('Website must start with http:// or https://');
      return;
    }

    el('co-save').disabled = true;
    try {
      const payload = { name };
      if (website) payload.website = website;
      if (location) payload.location = location;

      if (isEdit) {
        await companiesApi.update(company.id, payload);
      } else {
        await companiesApi.create(payload);
      }
      closeModal();
      loadCompaniesPage();
    } catch (err) {
      alert(err.message);
    } finally {
      el('co-save').disabled = false;
    }
  };
}

async function deleteCompany(id) {
  if (!confirm('Delete this company? All its applications will also be deleted.')) return;
  try {
    await companiesApi.delete(id);
    loadCompaniesPage();
  } catch (err) {
    alert(err.message);
  }
}

// ===== APPLICATIONS PAGE =====
async function loadApplicationsPage() {
  showLoading('applications-list');

  // Load companies for filter dropdown and form
  try {
    const list = await companiesApi.list();
    setCompanies(list);
    populateCompanyFilter(list);
    applicationsCompanyLoadError = '';
  } catch (err) {
    applicationsCompanyLoadError = getErrorMessage(err, 'Companies could not be loaded');
    setCompanies([]);
    populateCompanyFilter([]);
  }

  el('new-application-btn').onclick = () => openApplicationForm(null);
  el('apply-filters-btn').onclick = applyFilters;

  await fetchAndRenderApplications({});
}

function populateCompanyFilter(list) {
  const sel = el('filter-company');
  // Keep first "All companies" option
  while (sel.options.length > 1) sel.remove(1);
  list.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
}

function applyFilters() {
  const status = el('filter-status').value;
  const companyId = el('filter-company').value;
  const params = {};
  if (status) params.status = status;
  if (companyId) params.companyId = companyId;
  fetchAndRenderApplications(params);
}

async function fetchAndRenderApplications(params) {
  showLoading('applications-list');
  try {
    const list = await appsApi.list(params);
    renderApplicationsList(list);
  } catch (err) {
    setHtml('applications-list', alertError(getErrorMessage(err, 'Failed to load applications')));
  }
}

function renderApplicationsList(list) {
  const warningHtml = applicationsCompanyLoadError
    ? alertError(`Companies could not be loaded: ${applicationsCompanyLoadError}`)
    : '';

  if (list.length === 0) {
    setHtml('applications-list', `${warningHtml}<div class="empty-state"><strong>No applications</strong>Create your first application or adjust your filters.</div>`);
    return;
  }

  const companiesMap = Object.fromEntries(state.companies.map(c => [c.id, c.name]));

  setHtml('applications-list', warningHtml + list.map(a => `
    <div class="app-card" data-id="${escapeAttr(a.id)}">
      <div class="app-card-left">
        <div class="app-card-title">${escapeHtml(a.title)}</div>
        <div class="app-card-meta">
          <span>${escapeHtml(companiesMap[a.companyId] || 'Unknown company')}</span>
          ${statusBadge(a.status || 'wishlist')}
          ${a.salary ? `<span>Salary ${escapeHtml(a.salary)}</span>` : ''}
          ${a.appliedAt ? `<span>Applied ${formatDate(a.appliedAt)}</span>` : ''}
        </div>
      </div>
      <div class="app-card-actions">
        <button class="btn btn-ghost btn-edit-app" data-id="${escapeAttr(a.id)}">Edit</button>
        <button class="btn btn-danger btn-delete-app" data-id="${escapeAttr(a.id)}">Delete</button>
      </div>
    </div>`).join(''));

  // Click card (not buttons) opens detail
  document.querySelectorAll('.app-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      openApplicationDetail(Number(card.dataset.id));
    });
  });

  document.querySelectorAll('.btn-edit-app').forEach(btn => {
    btn.addEventListener('click', async () => {
      const app = list.find(a => a.id === Number(btn.dataset.id));
      openApplicationForm(app);
    });
  });

  document.querySelectorAll('.btn-delete-app').forEach(btn => {
    btn.addEventListener('click', () => deleteApplication(Number(btn.dataset.id)));
  });
}

function openApplicationForm(app) {
  const isEdit = !!app;
  if (!isEdit && state.companies.length === 0) {
    openModal('New Application', `
      ${alertError(applicationsCompanyLoadError || 'Add a company before creating an application.')}
      <div class="form-actions">
        <button class="btn btn-secondary" id="ap-cancel">Close</button>
      </div>
    `);
    el('ap-cancel').onclick = closeModal;
    return;
  }

  const companiesOptions = state.companies.map(c =>
    `<option value="${escapeAttr(c.id)}" ${isEdit && app.companyId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
  ).join('');

  const statusOptions = ALL_STATUSES.map(s =>
    `<option value="${escapeAttr(s)}" ${isEdit && app.status === s ? 'selected' : ''}>${escapeHtml(statusLabel(s))}</option>`
  ).join('');

  openModal(isEdit ? 'Edit Application' : 'New Application', `
    <div class="field"><label>Job Title *</label><input id="ap-title" type="text" value="${isEdit ? escapeAttr(app.title) : ''}" /></div>
    <div class="field"><label>Company *</label>
      <select id="ap-company" ${isEdit ? 'disabled' : ''}><option value="">Select company...</option>${companiesOptions}</select>
      ${isEdit ? '<div class="field-hint">Company is locked after creation.</div>' : ''}
    </div>
    <div class="form-row">
      <div class="field"><label>Status</label>
        <select id="ap-status"><option value="">Select status</option>${statusOptions}</select>
      </div>
      <div class="field"><label>Salary</label>
        <input id="ap-salary" type="text" value="${isEdit && app.salary ? escapeAttr(app.salary) : ''}" placeholder="e.g. 70k" />
      </div>
    </div>
    <div class="field"><label>Job URL</label>
      <input id="ap-joburl" type="url" value="${isEdit && app.jobUrl ? escapeAttr(app.jobUrl) : ''}" placeholder="https://" />
    </div>
    <div class="field"><label>Applied At</label>
      <input id="ap-applied" type="date" value="${isEdit && app.appliedAt ? escapeAttr(String(app.appliedAt).substring(0,10)) : ''}" />
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="ap-cancel">Cancel</button>
      <button class="btn btn-primary" id="ap-save">${isEdit ? 'Save Changes' : 'Create Application'}</button>
    </div>
  `);

  el('ap-cancel').onclick = closeModal;
  el('ap-save').onclick = async () => {
    const title = el('ap-title').value.trim();
    const companyId = Number(el('ap-company').value);
    const status = el('ap-status').value;
    const salary = el('ap-salary').value.trim();
    const jobUrl = el('ap-joburl').value.trim();
    const appliedAt = el('ap-applied').value;

    if (!title) { alert('Title is required'); return; }
    if (!isEdit && !companyId) { alert('Company is required'); return; }
    if (jobUrl && !safeExternalUrl(jobUrl)) {
      alert('Job URL must start with http:// or https://');
      return;
    }

    const payload = { title };
    if (!isEdit) payload.companyId = companyId;
    if (status) payload.status = status;
    if (salary) payload.salary = salary;
    if (jobUrl) payload.jobUrl = jobUrl;
    if (appliedAt) payload.appliedAt = new Date(appliedAt).toISOString();

    el('ap-save').disabled = true;
    try {
      if (isEdit) {
        await appsApi.update(app.id, payload);
      } else {
        await appsApi.create(payload);
      }
      closeModal();
      if (isEdit && !el('detail-panel').classList.contains('hidden')) {
        await openApplicationDetail(app.id);
      }
      applyFilters();
    } catch (err) {
      alert(err.message);
    } finally {
      el('ap-save').disabled = false;
    }
  };
}

async function deleteApplication(id) {
  if (!confirm('Delete this application?')) return;
  try {
    await appsApi.delete(id);
    applyFilters();
  } catch (err) {
    alert(err.message);
  }
}

// ===== APPLICATION DETAIL =====
async function openApplicationDetail(id) {
  showDetailPanel('Loading...', '<div class="loading">Loading...</div>');

  try {
    const [app, notesList, companiesList] = await Promise.all([
      appsApi.get(id),
      notesApi.list(id),
      state.companies.length ? Promise.resolve(state.companies) : companiesApi.list(),
    ]);

    if (state.companies.length === 0) setCompanies(companiesList);
    const companyName = state.companies.find(c => c.id === app.companyId)?.name || '-';

    el('detail-title').textContent = app.title;
    el('detail-body').innerHTML = buildDetailBody(app, companyName, notesList);

    bindDetailEvents(app, notesList);
  } catch (err) {
    el('detail-body').innerHTML = alertError(getErrorMessage(err, 'Failed to load application'));
  }
}

function buildDetailBody(app, companyName, notesList) {
  const jobLink = app.jobUrl
    ? renderExternalLink(app.jobUrl, 'Open link') || `<span>${escapeHtml(app.jobUrl)}</span>`
    : '';

  return `
    <div class="detail-meta">
      <div><div class="detail-field-label">Company</div><div class="detail-field-value">${escapeHtml(companyName)}</div></div>
      <div><div class="detail-field-label">Status</div><div class="detail-field-value">${statusBadge(app.status || 'wishlist')}</div></div>
      <div><div class="detail-field-label">Salary</div><div class="detail-field-value">${app.salary ? escapeHtml(app.salary) : '-'}</div></div>
      <div><div class="detail-field-label">Applied At</div><div class="detail-field-value">${formatDate(app.appliedAt)}</div></div>
      ${jobLink ? `<div><div class="detail-field-label">Job URL</div><div class="detail-field-value">${jobLink}</div></div>` : ''}
      <div><div class="detail-field-label">Created</div><div class="detail-field-value">${formatDate(app.createdAt)}</div></div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:28px">
      <button class="btn btn-secondary" id="detail-edit-app">Edit Application</button>
      <button class="btn btn-danger" id="detail-delete-app">Delete</button>
    </div>

    <div class="notes-section">
      <h4>Notes (${Number(notesList.length || 0)})</h4>
      <div id="notes-list">${renderNotes(notesList)}</div>
      <div class="note-add-form">
        <textarea id="note-new-content" placeholder="Add a note..."></textarea>
        <button class="btn btn-primary" id="note-add-btn">Add Note</button>
      </div>
    </div>
  `;
}

function renderNotes(notesList) {
  if (notesList.length === 0) return '<div style="color:var(--text2);font-size:13px;padding:8px 0">No notes yet.</div>';
  return notesList.map(n => `
    <div class="note-card" data-note-id="${escapeAttr(n.id)}">
      <div class="note-content" id="note-content-${escapeAttr(n.id)}">${escapeHtml(n.content)}</div>
      <div class="note-footer">
        <span class="note-date">${formatDate(n.createdAt)}</span>
        <div class="note-actions">
          <button class="btn btn-ghost btn-edit-note" data-id="${escapeAttr(n.id)}" style="padding:4px 8px;font-size:12px">Edit</button>
          <button class="btn btn-danger btn-delete-note" data-id="${escapeAttr(n.id)}" style="padding:4px 8px;font-size:12px">Delete</button>
        </div>
      </div>
    </div>`).join('');
}

function bindDetailEvents(app, notesList) {
  // Edit app
  el('detail-edit-app').onclick = () => {
    openApplicationForm(app);
  };

  // Delete app
  el('detail-delete-app').onclick = async () => {
    if (!confirm('Delete this application?')) return;
    try {
      await appsApi.delete(app.id);
      hideDetailPanel();
      applyFilters();
    } catch (err) {
      alert(err.message);
    }
  };

  // Add note
  el('note-add-btn').onclick = async () => {
    const content = el('note-new-content').value.trim();
    if (!content) return;
    el('note-add-btn').disabled = true;
    try {
      await notesApi.create({ content, applicationId: app.id });
      el('note-new-content').value = '';
      const updated = await notesApi.list(app.id);
      setHtml('notes-list', renderNotes(updated));
      bindNoteEvents(app, updated);
    } catch (err) {
      alert(err.message);
    } finally {
      el('note-add-btn').disabled = false;
    }
  };

  bindNoteEvents(app, notesList);
}

function bindNoteEvents(app, notesList) {
  document.querySelectorAll('.btn-delete-note').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this note?')) return;
      try {
        await notesApi.delete(Number(btn.dataset.id));
        const updated = await notesApi.list(app.id);
        setHtml('notes-list', renderNotes(updated));
        bindNoteEvents(app, updated);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  document.querySelectorAll('.btn-edit-note').forEach(btn => {
    btn.addEventListener('click', () => {
      const noteId = Number(btn.dataset.id);
      const note = notesList.find(n => n.id === noteId);
      if (!note) return;

      const contentEl = el(`note-content-${noteId}`);
      const original = note.content;

      contentEl.innerHTML = `
        <textarea id="note-edit-${noteId}" style="width:100%;margin-bottom:8px">${escapeHtml(original)}</textarea>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-note-save" data-id="${noteId}" style="padding:5px 12px;font-size:12px">Save</button>
          <button class="btn btn-secondary btn-note-cancel" data-id="${noteId}" style="padding:5px 12px;font-size:12px">Cancel</button>
        </div>
      `;

      document.querySelector(`.btn-note-cancel[data-id="${noteId}"]`).onclick = () => {
        contentEl.textContent = original;
      };

      document.querySelector(`.btn-note-save[data-id="${noteId}"]`).onclick = async () => {
        const newContent = el(`note-edit-${noteId}`).value.trim();
        if (!newContent) return;
        try {
          await notesApi.update(noteId, { content: newContent });
          const updated = await notesApi.list(app.id);
          setHtml('notes-list', renderNotes(updated));
          bindNoteEvents(app, updated);
        } catch (err) {
          alert(err.message);
        }
      };
    });
  });
}

// ===== INIT =====
boot();
