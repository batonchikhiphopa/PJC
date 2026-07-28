// app.js — main orchestration

import { checkSession, initLoginScreen, logout } from './auth.js';
import { companies as companiesApi, applications as appsApi, notes as notesApi } from './api.js';
import {
  state,
  setCompanies,
  setDetailApplication,
  setPage,
} from './state.js';
import {
  el, showEl, setHtml, openModal, closeModal,
  statusBadge, formatDate, formatDateTime, toDateTimeLocalValue,
  showLoading, showDetailPanel, hideDetailPanel,
  alertError, escapeHtml, escapeAttr, safeExternalUrl, statusLabel,
  clearFormErrors, confirmAction, showFormErrors, showToast,
  STATUS_COLORS, ALL_STATUSES
} from './ui.js';

let applicationsCompanyLoadError = '';
let appHasStarted = false;
let appEventsBound = false;
let searchTimer = null;

const PAGE_ROUTES = {
  dashboard: '/app/dashboard',
  applications: '/app/applications',
  companies: '/app/companies',
};

window.addEventListener('pjc:unauthorized', () => {
  if (appHasStarted) window.location.reload();
});

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

function actionTiming(value) {
  if (!value) {
    return { label: 'No deadline', tone: 'unscheduled' };
  }

  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) {
    return { label: 'No deadline', tone: 'unscheduled' };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  if (deadline < now) {
    return { label: `Overdue · ${formatDateTime(value)}`, tone: 'overdue' };
  }

  if (deadline < startOfTomorrow) {
    return { label: `Today · ${formatDateTime(value)}`, tone: 'today' };
  }

  return { label: formatDateTime(value), tone: 'upcoming' };
}

function refreshCurrentPage() {
  if (state.detailApplicationId) {
    return openApplicationDetail(state.detailApplicationId, { historyMode: 'none' });
  }
  if (state.currentPage === 'dashboard') return loadDashboard();
  if (state.currentPage === 'applications') return loadApplicationsPage();
  if (state.currentPage === 'companies') return loadCompaniesPage();
}

function writeHistory(url, mode, stateData = {}) {
  if (mode === 'none') return;
  if (mode === 'replace') {
    window.history.replaceState(stateData, '', url);
  } else {
    window.history.pushState(stateData, '', url);
  }
}

async function renderCurrentRoute() {
  const detailMatch = window.location.pathname.match(/^\/app\/applications\/([1-9]\d*)$/);
  if (detailMatch) {
    await navigateTo('applications', { historyMode: 'none' });
    await openApplicationDetail(Number(detailMatch[1]), { historyMode: 'none' });
    return;
  }

  const page = Object.entries(PAGE_ROUTES)
    .find(([, route]) => route === window.location.pathname)?.[0];

  if (page) {
    await navigateTo(page, { historyMode: 'none' });
    return;
  }

  await navigateTo('dashboard', { historyMode: 'replace' });
}

function closeDetailRoute() {
  if (window.history.state?.returnUrl) {
    window.history.back();
  } else {
    navigateTo('applications', { historyMode: 'replace' });
  }
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
  appHasStarted = true;
  showEl('app');
  el('sidebar-email').textContent = user.email;

  if (!appEventsBound) {
    appEventsBound = true;
    document.querySelectorAll('.nav-item').forEach(link => {
      link.addEventListener('click', event => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        navigateTo(link.dataset.page);
      });
    });

    el('logout-btn').addEventListener('click', logout);
    el('modal-close').addEventListener('click', closeModal);
    el('modal-overlay').addEventListener('click', event => {
      if (event.target === el('modal-overlay')) closeModal();
    });
    el('detail-close').addEventListener('click', closeDetailRoute);
    window.addEventListener('popstate', renderCurrentRoute);
  }

  renderCurrentRoute();
}

async function navigateTo(page, { historyMode = 'push' } = {}) {
  const route = PAGE_ROUTES[page] || PAGE_ROUTES.dashboard;
  writeHistory(route, historyMode);
  setPage(page);
  setDetailApplication(null);
  document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
  const link = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (link) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }
  document.querySelectorAll('.nav-item:not(.active)').forEach(item => {
    item.removeAttribute('aria-current');
  });

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  el(`page-${page}`).classList.add('active');

  hideDetailPanel();

  if (page === 'dashboard') return loadDashboard();
  if (page === 'applications') return loadApplicationsPage();
  if (page === 'companies') return loadCompaniesPage();
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
  const nextActions = Array.isArray(data.nextActions) ? data.nextActions : [];
  const nextActionCount = Number(data.nextActionCount ?? nextActions.length);
  const actionSummary = nextActions.reduce((summary, item) => {
    const timing = actionTiming(item.nextActionAt);
    if (timing.tone === 'overdue') summary.overdue += 1;
    if (timing.tone === 'today') summary.today += 1;
    if (timing.tone === 'unscheduled') summary.unscheduled += 1;
    return summary;
  }, { overdue: 0, today: 0, unscheduled: 0 });
  actionSummary.overdue = Number(data.overdueActionCount ?? actionSummary.overdue);
  actionSummary.unscheduled = Number(data.unscheduledActionCount ?? actionSummary.unscheduled);

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

  let companyHtml = perCompany.length === 0
    ? '<div style="color:var(--text2);font-size:13px">No data yet</div>'
    : perCompany.map(c => `
      <div class="company-row">
        <span>${escapeHtml(c.companyName)}</span>
        <span class="company-count">${Number(c.count || 0)}</span>
      </div>`).join('');

  let recentHtml = recent.length === 0
    ? '<div style="color:var(--text2);font-size:13px;padding:12px 0">No applications yet</div>'
    : `<div class="table-wrap"><table>
        <thead><tr><th>Title</th><th>Company</th><th>Status</th><th>Applied</th></tr></thead>
        <tbody>${recent.map(a => `
          <tr data-id="${escapeAttr(a.id)}" class="app-row-click" tabindex="0" role="link" aria-label="Open ${escapeAttr(a.title)}">
            <td data-label="Title">${escapeHtml(a.title)}</td>
            <td data-label="Company">${escapeHtml(a.company?.name || '-')}</td>
            <td data-label="Status">${statusBadge(a.status || 'wishlist')}</td>
            <td data-label="Applied">${formatDate(a.appliedAt || a.createdAt)}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;

  const nextActionsHtml = nextActions.length === 0
    ? `<div class="empty-state compact">
        <strong>No next actions planned</strong>
        Add a next action and deadline to an application to build your daily queue.
      </div>`
    : `<div class="action-list">${nextActions.map(item => {
        const timing = actionTiming(item.nextActionAt);
        return `
          <button class="action-item app-row-click" data-id="${escapeAttr(item.id)}">
            <span class="action-state action-state-${escapeAttr(timing.tone)}"></span>
            <span class="action-content">
              <strong>${escapeHtml(item.nextAction)}</strong>
              <span>${escapeHtml(item.title)} · ${escapeHtml(item.company?.name || '-')}</span>
            </span>
            <span class="action-deadline action-deadline-${escapeAttr(timing.tone)}">${escapeHtml(timing.label)}</span>
          </button>`;
      }).join('')}</div>`;

  setHtml('dashboard-content', `
    <div class="workflow-summary">
      <div>
        <span class="workflow-eyebrow">Your queue</span>
        <h3>${actionSummary.overdue > 0
          ? `${actionSummary.overdue} overdue action${actionSummary.overdue === 1 ? '' : 's'}`
          : actionSummary.today > 0
            ? `${actionSummary.today} action${actionSummary.today === 1 ? '' : 's'} due today`
            : 'You are on track'}</h3>
        <p>${nextActionCount} active next action${nextActionCount === 1 ? '' : 's'} · ${actionSummary.unscheduled} without a deadline</p>
      </div>
      <button class="btn btn-primary" id="dashboard-new-application">+ New Application</button>
    </div>
    <div class="section-card action-section">
      <div class="section-heading">
        <h4>Next Actions</h4>
        <span>${nextActionCount} planned</span>
      </div>
      ${nextActionsHtml}
    </div>
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

  el('dashboard-new-application').onclick = async () => {
    try {
      const list = await companiesApi.list();
      setCompanies(list);
      applicationsCompanyLoadError = '';
      openApplicationForm(null);
    } catch (err) {
      setCompanies([]);
      applicationsCompanyLoadError = getErrorMessage(err, 'Companies could not be loaded');
      openApplicationForm(null);
    }
  };

  document.querySelectorAll('.app-row-click').forEach(row => {
    row.addEventListener('click', () => openApplicationDetail(Number(row.dataset.id)));
    if (row.tagName !== 'BUTTON') {
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openApplicationDetail(Number(row.dataset.id));
        }
      });
    }
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
    const applicationCount = Number(c._count?.applications || 0);
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
          <span>${applicationCount} application${applicationCount === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div class="company-card-actions">
        <button class="btn btn-ghost btn-edit-company" data-id="${escapeAttr(c.id)}">Edit</button>
        <button class="btn btn-danger btn-delete-company" data-id="${escapeAttr(c.id)}"
          ${applicationCount > 0 ? 'disabled title="Remove all applications before deleting this company"' : ''}>
          Delete
        </button>
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
    btn.addEventListener('click', () => {
      const company = list.find(c => c.id === Number(btn.dataset.id));
      deleteCompany(company);
    });
  });
}

function openCompanyForm(company) {
  const isEdit = !!company;
  openModal(isEdit ? 'Edit Company' : 'New Company', `
    <div id="co-form-error" class="alert alert-error hidden" role="alert"></div>
    <div class="field"><label for="co-name">Name *</label><input id="co-name" type="text" value="${isEdit ? escapeAttr(company.name) : ''}" /></div>
    <div class="field"><label for="co-website">Website</label><input id="co-website" type="url" value="${isEdit && company.website ? escapeAttr(company.website) : ''}" placeholder="https://" /></div>
    <div class="field"><label for="co-location">Location</label><input id="co-location" type="text" value="${isEdit && company.location ? escapeAttr(company.location) : ''}" /></div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="co-cancel">Cancel</button>
      <button class="btn btn-primary" id="co-save">${isEdit ? 'Save Changes' : 'Create Company'}</button>
    </div>
  `);

  el('co-cancel').onclick = closeModal;
  const companySaveButton = el('co-save');
  companySaveButton.onclick = async () => {
    const name = el('co-name').value.trim();
    const website = el('co-website').value.trim();
    const location = el('co-location').value.trim();
    clearFormErrors();
    if (!name) {
      showFormErrors(
        { message: 'Company name is required', details: [{ field: 'body.name', message: 'Company name is required' }] },
        { errorId: 'co-form-error', fieldMap: { 'body.name': 'co-name' } },
      );
      return;
    }
    if (website && !safeExternalUrl(website)) {
      showFormErrors(
        { message: 'Website is invalid', details: [{ field: 'body.website', message: 'Website must start with http:// or https://' }] },
        { errorId: 'co-form-error', fieldMap: { 'body.website': 'co-website' } },
      );
      return;
    }

    companySaveButton.disabled = true;
    try {
      const payload = {
        name,
        website: website || null,
        location: location || null,
      };

      if (isEdit) {
        await companiesApi.update(company.id, payload);
      } else {
        await companiesApi.create(payload);
      }
      closeModal();
      showToast(isEdit ? 'Company updated' : 'Company created');
      await loadCompaniesPage();
    } catch (err) {
      showFormErrors(err, {
        errorId: 'co-form-error',
        fieldMap: {
          'body.name': 'co-name',
          'body.website': 'co-website',
          'body.location': 'co-location',
        },
      });
    } finally {
      if (companySaveButton.isConnected) {
        companySaveButton.disabled = false;
      }
    }
  };
}

async function deleteCompany(company) {
  if (!company) return;
  const accepted = await confirmAction({
    title: 'Delete company?',
    message: `${company.name} has no applications and will be permanently deleted.`,
    confirmLabel: 'Delete company',
    danger: true,
  });
  if (!accepted) return;

  try {
    await companiesApi.delete(company.id);
    showToast('Company deleted');
    await loadCompaniesPage();
  } catch (err) {
    showToast(getErrorMessage(err, 'Company could not be deleted'), 'error');
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

  hydrateApplicationFilters();
  el('new-application-btn').onclick = () => openApplicationForm(null);
  el('apply-filters-btn').onclick = () => applyFilters();
  el('filter-search').oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => applyFilters(), 250);
  };
  el('filter-search').onkeydown = event => {
    if (event.key === 'Enter') {
      clearTimeout(searchTimer);
      applyFilters();
    }
  };
  ['filter-status', 'filter-company', 'filter-archived', 'filter-sort'].forEach(id => {
    el(id).onchange = () => applyFilters();
  });

  await applyFilters({ updateUrl: false });
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

function hydrateApplicationFilters() {
  const query = new URLSearchParams(window.location.search);
  el('filter-search').value = query.get('search') || '';
  el('filter-status').value = query.get('status') || '';
  el('filter-company').value = query.get('companyId') || '';
  el('filter-archived').value = query.get('archived') || 'active';
  el('filter-sort').value = query.get('sort') || 'updated_desc';
}

function applicationFilters() {
  const search = el('filter-search').value.trim();
  const status = el('filter-status').value;
  const companyId = el('filter-company').value;
  const archived = el('filter-archived').value;
  const sort = el('filter-sort').value;
  const params = { archived, sort };
  if (search) params.search = search;
  if (status) params.status = status;
  if (companyId) params.companyId = companyId;
  return params;
}

function syncApplicationFilterUrl(params) {
  if (window.location.pathname !== PAGE_ROUTES.applications) return;
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.companyId) query.set('companyId', params.companyId);
  if (params.archived !== 'active') query.set('archived', params.archived);
  if (params.sort !== 'updated_desc') query.set('sort', params.sort);
  const suffix = query.toString() ? `?${query}` : '';
  writeHistory(`${PAGE_ROUTES.applications}${suffix}`, 'replace');
}

function applyFilters({ updateUrl = true } = {}) {
  const params = applicationFilters();
  if (updateUrl) syncApplicationFilterUrl(params);
  return fetchAndRenderApplications(params);
}

async function fetchAndRenderApplications(params) {
  showLoading('applications-list');
  el('applications-list').setAttribute('aria-busy', 'true');
  try {
    const list = await appsApi.list(params);
    renderApplicationsList(list);
  } catch (err) {
    setHtml('applications-list', alertError(getErrorMessage(err, 'Failed to load applications')));
  } finally {
    el('applications-list').removeAttribute('aria-busy');
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

  setHtml('applications-list', warningHtml + list.map(a => {
    const quickStatusOptions = ALL_STATUSES.map(status =>
      `<option value="${escapeAttr(status)}" ${a.status === status ? 'selected' : ''}>${escapeHtml(statusLabel(status))}</option>`
    ).join('');

    return `
    <div class="app-card" data-id="${escapeAttr(a.id)}">
      <a class="app-card-left app-card-open" data-id="${escapeAttr(a.id)}" href="/app/applications/${escapeAttr(a.id)}" aria-label="Open ${escapeAttr(a.title)}">
        <div class="app-card-title-row">
          <div class="app-card-title">${escapeHtml(a.title)}</div>
          ${a.archivedAt ? '<span class="badge badge-archived">Archived</span>' : ''}
        </div>
        <div class="app-card-meta">
          <span>${escapeHtml(a.company?.name || 'Unknown company')}</span>
          ${statusBadge(a.status || 'wishlist')}
          ${a.salary ? `<span>Salary ${escapeHtml(a.salary)}</span>` : ''}
          ${a.appliedAt ? `<span>Applied ${formatDate(a.appliedAt)}</span>` : ''}
          ${a.source ? `<span>Source ${escapeHtml(a.source)}</span>` : ''}
        </div>
        ${a.nextAction ? (() => {
          const timing = actionTiming(a.nextActionAt);
          return `<div class="app-next-action">
            <span>${escapeHtml(a.nextAction)}</span>
            <span class="action-deadline action-deadline-${escapeAttr(timing.tone)}">${escapeHtml(timing.label)}</span>
          </div>`;
        })() : ''}
      </a>
      <div class="app-card-actions">
        ${a.archivedAt ? '' : `
          <label class="sr-only" for="quick-status-${escapeAttr(a.id)}">Change status for ${escapeHtml(a.title)}</label>
          <select class="quick-status" id="quick-status-${escapeAttr(a.id)}" data-id="${escapeAttr(a.id)}" aria-label="Change status for ${escapeAttr(a.title)}">
            ${quickStatusOptions}
          </select>
        `}
        <button class="btn btn-ghost btn-edit-app" data-id="${escapeAttr(a.id)}">Edit</button>
        ${a.archivedAt
          ? `<button class="btn btn-secondary btn-restore-app" data-id="${escapeAttr(a.id)}">Restore</button>`
          : `<button class="btn btn-secondary btn-archive-app" data-id="${escapeAttr(a.id)}">Archive</button>`}
      </div>
    </div>`;
  }).join(''));

  document.querySelectorAll('.app-card-open').forEach(link => {
    link.addEventListener('click', event => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      openApplicationDetail(Number(link.dataset.id));
    });
    link.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openApplicationDetail(Number(link.dataset.id));
      }
    });
  });

  document.querySelectorAll('.btn-edit-app').forEach(btn => {
    btn.addEventListener('click', async () => {
      const app = list.find(a => a.id === Number(btn.dataset.id));
      openApplicationForm(app);
    });
  });

  document.querySelectorAll('.btn-archive-app').forEach(btn => {
    btn.addEventListener('click', () => archiveApplication(Number(btn.dataset.id)));
  });

  document.querySelectorAll('.btn-restore-app').forEach(btn => {
    btn.addEventListener('click', () => archiveApplication(Number(btn.dataset.id), true));
  });

  document.querySelectorAll('.quick-status').forEach(select => {
    select.addEventListener('change', () => {
      updateApplicationStatus(Number(select.dataset.id), select.value, select);
    });
  });
}

async function updateApplicationStatus(id, status, select) {
  select.disabled = true;
  try {
    await appsApi.update(id, { status });
    showToast(`Status changed to ${statusLabel(status)}`);
    await applyFilters({ updateUrl: false });
  } catch (err) {
    showToast(getErrorMessage(err, 'Status could not be changed'), 'error');
    await applyFilters({ updateUrl: false });
  } finally {
    if (select.isConnected) select.disabled = false;
  }
}

function openApplicationForm(app) {
  const isEdit = !!app;
  const companiesOptions = state.companies.map(c =>
    `<option value="${escapeAttr(c.id)}" ${isEdit && app.companyId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
  ).join('');

  const statusOptions = ALL_STATUSES.map(s =>
    `<option value="${escapeAttr(s)}" ${(isEdit && app.status === s) || (!isEdit && s === 'wishlist') ? 'selected' : ''}>${escapeHtml(statusLabel(s))}</option>`
  ).join('');

  openModal(isEdit ? 'Edit Application' : 'New Application', `
    <div id="ap-form-error" class="alert alert-error hidden" role="alert"></div>
    ${applicationsCompanyLoadError && !isEdit ? alertError(`Existing companies could not be loaded: ${applicationsCompanyLoadError}. You can still create a new one.`) : ''}
    <div class="field"><label for="ap-title">Job Title *</label><input id="ap-title" type="text" value="${isEdit ? escapeAttr(app.title) : ''}" /></div>
    <div class="field" id="ap-company-select-field"><label for="ap-company">Company *</label>
      <select id="ap-company" ${isEdit ? 'disabled' : ''}><option value="">Select company...</option>${companiesOptions}</select>
      ${isEdit ? '<div class="field-hint">Company is locked after creation.</div>' : ''}
    </div>
    ${!isEdit ? `
      <button type="button" class="inline-company-toggle" id="ap-new-company-toggle">+ Create a company here</button>
      <div id="ap-new-company-fields" class="inline-company-fields hidden">
        <div class="field"><label for="ap-company-name">Company name *</label><input id="ap-company-name" type="text" /></div>
        <div class="form-row">
          <div class="field"><label for="ap-company-website">Website</label><input id="ap-company-website" type="url" placeholder="https://" /></div>
          <div class="field"><label for="ap-company-location">Location</label><input id="ap-company-location" type="text" /></div>
        </div>
      </div>
    ` : ''}
    <div class="form-row">
      <div class="field"><label for="ap-status">Status</label>
        <select id="ap-status">${statusOptions}</select>
      </div>
      <div class="field"><label for="ap-salary">Salary</label>
        <input id="ap-salary" type="text" value="${isEdit && app.salary ? escapeAttr(app.salary) : ''}" placeholder="e.g. 70k" />
      </div>
    </div>
    <div class="field"><label for="ap-joburl">Job URL</label>
      <input id="ap-joburl" type="url" value="${isEdit && app.jobUrl ? escapeAttr(app.jobUrl) : ''}" placeholder="https://" />
    </div>
    <div class="field"><label for="ap-applied">Applied At</label>
      <input id="ap-applied" type="date" value="${isEdit && app.appliedAt ? escapeAttr(String(app.appliedAt).substring(0,10)) : ''}" />
    </div>
    <div class="form-section-title">Next action</div>
    <div class="field"><label for="ap-next-action">What needs to happen next?</label>
      <input id="ap-next-action" type="text" value="${isEdit && app.nextAction ? escapeAttr(app.nextAction) : ''}" placeholder="Follow up with recruiter" />
    </div>
    <div class="field"><label for="ap-next-action-at">Deadline</label>
      <input id="ap-next-action-at" type="datetime-local" value="${isEdit ? escapeAttr(toDateTimeLocalValue(app.nextActionAt)) : ''}" />
    </div>
    <div class="form-section-title">Contact &amp; source</div>
    <div class="form-row">
      <div class="field"><label for="ap-contact-name">Contact name</label>
        <input id="ap-contact-name" type="text" value="${isEdit && app.contactName ? escapeAttr(app.contactName) : ''}" />
      </div>
      <div class="field"><label for="ap-contact-email">Contact email</label>
        <input id="ap-contact-email" type="email" value="${isEdit && app.contactEmail ? escapeAttr(app.contactEmail) : ''}" />
      </div>
    </div>
    <div class="form-row">
      <div class="field"><label for="ap-contact-phone">Contact phone</label>
        <input id="ap-contact-phone" type="tel" value="${isEdit && app.contactPhone ? escapeAttr(app.contactPhone) : ''}" />
      </div>
      <div class="field"><label for="ap-source">Source</label>
        <input id="ap-source" type="text" value="${isEdit && app.source ? escapeAttr(app.source) : ''}" placeholder="LinkedIn, referral…" />
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="ap-cancel">Cancel</button>
      <button class="btn btn-primary" id="ap-save">${isEdit ? 'Save Changes' : 'Create Application'}</button>
    </div>
  `);

  let useNewCompany = !isEdit && state.companies.length === 0;
  const setCompanyMode = enabled => {
    useNewCompany = enabled;
    el('ap-new-company-fields').classList.toggle('hidden', !enabled);
    el('ap-company-select-field').classList.toggle('hidden', enabled);
    el('ap-company').disabled = enabled;
    el('ap-new-company-toggle').textContent = enabled
      ? '← Choose an existing company'
      : '+ Create a company here';
  };

  if (!isEdit) {
    el('ap-new-company-toggle').onclick = () => setCompanyMode(!useNewCompany);
    setCompanyMode(useNewCompany);
    if (state.companies.length === 0) {
      el('ap-new-company-toggle').classList.add('hidden');
    }
  }

  const applicationFieldMap = {
    'body.title': 'ap-title',
    'body.companyId': 'ap-company',
    'body.company.name': 'ap-company-name',
    'body.company.website': 'ap-company-website',
    'body.company.location': 'ap-company-location',
    'body.status': 'ap-status',
    'body.salary': 'ap-salary',
    'body.jobUrl': 'ap-joburl',
    'body.appliedAt': 'ap-applied',
    'body.nextAction': 'ap-next-action',
    'body.nextActionAt': 'ap-next-action-at',
    'body.contactName': 'ap-contact-name',
    'body.contactEmail': 'ap-contact-email',
    'body.contactPhone': 'ap-contact-phone',
    'body.source': 'ap-source',
  };
  const displayApplicationError = error => showFormErrors(error, {
    errorId: 'ap-form-error',
    fieldMap: applicationFieldMap,
  });
  const localApplicationError = (field, message) => ({
    message,
    details: [{ field, message }],
  });

  el('ap-cancel').onclick = closeModal;
  const applicationSaveButton = el('ap-save');
  applicationSaveButton.onclick = async () => {
    const title = el('ap-title').value.trim();
    const companyId = Number(el('ap-company').value);
    const status = el('ap-status').value;
    const salary = el('ap-salary').value.trim();
    const jobUrl = el('ap-joburl').value.trim();
    const appliedAt = el('ap-applied').value;
    const nextAction = el('ap-next-action').value.trim();
    const nextActionAt = el('ap-next-action-at').value;
    const contactName = el('ap-contact-name').value.trim();
    const contactEmail = el('ap-contact-email').value.trim();
    const contactPhone = el('ap-contact-phone').value.trim();
    const source = el('ap-source').value.trim();

    clearFormErrors();
    el('ap-form-error').classList.add('hidden');
    if (!title) {
      displayApplicationError(localApplicationError('body.title', 'Title is required'));
      return;
    }
    if (!isEdit && !useNewCompany && !companyId) {
      displayApplicationError(localApplicationError('body.companyId', 'Choose a company or create a new one'));
      return;
    }
    if (jobUrl && !safeExternalUrl(jobUrl)) {
      displayApplicationError(localApplicationError('body.jobUrl', 'Job URL must start with http:// or https://'));
      return;
    }

    const payload = {
      title,
      status,
      salary: salary || null,
      jobUrl: jobUrl || null,
      appliedAt: appliedAt ? new Date(appliedAt).toISOString() : null,
      nextAction: nextAction || null,
      nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : null,
      contactName: contactName || null,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      source: source || null,
    };

    if (!isEdit && useNewCompany) {
      const name = el('ap-company-name').value.trim();
      const website = el('ap-company-website').value.trim();
      const location = el('ap-company-location').value.trim();

      if (!name) {
        displayApplicationError(localApplicationError('body.company.name', 'Company name is required'));
        return;
      }
      if (website && !safeExternalUrl(website)) {
        displayApplicationError(localApplicationError('body.company.website', 'Company website must start with http:// or https://'));
        return;
      }

      payload.company = { name };
      if (website) payload.company.website = website;
      if (location) payload.company.location = location;
    } else if (!isEdit) {
      payload.companyId = companyId;
    }

    applicationSaveButton.disabled = true;
    const wasDetailOpen = state.detailApplicationId === app?.id;
    try {
      if (isEdit) {
        await appsApi.update(app.id, payload);
      } else {
        await appsApi.create(payload);
        if (useNewCompany) {
          const companiesList = await companiesApi.list();
          setCompanies(companiesList);
          populateCompanyFilter(companiesList);
        }
      }
      closeModal();
      showToast(isEdit ? 'Application updated' : 'Application created');
      if (wasDetailOpen) {
        await openApplicationDetail(app.id, { historyMode: 'none' });
      } else {
        await refreshCurrentPage();
      }
    } catch (err) {
      displayApplicationError(err);
    } finally {
      if (applicationSaveButton.isConnected) {
        applicationSaveButton.disabled = false;
      }
    }
  };
}

async function archiveApplication(id, restore = false) {
  const wasDetailOpen = state.detailApplicationId === id;
  try {
    if (restore) {
      await appsApi.restore(id);
    } else {
      await appsApi.archive(id);
    }
    showToast(restore ? 'Application restored' : 'Application archived');
    if (wasDetailOpen) {
      closeDetailRoute();
    } else {
      await refreshCurrentPage();
    }
  } catch (err) {
    showToast(getErrorMessage(err, 'Application could not be updated'), 'error');
  }
}

async function deleteApplication(id) {
  const accepted = await confirmAction({
    title: 'Delete application permanently?',
    message: 'The application, its status history, and all notes will be deleted. This cannot be undone.',
    confirmLabel: 'Delete permanently',
    danger: true,
  });
  if (!accepted) return;

  const wasDetailOpen = state.detailApplicationId === id;
  try {
    await appsApi.delete(id);
    showToast('Application permanently deleted');
    if (wasDetailOpen) {
      closeDetailRoute();
    } else {
      await refreshCurrentPage();
    }
  } catch (err) {
    showToast(getErrorMessage(err, 'Application could not be deleted'), 'error');
  }
}

// ===== APPLICATION DETAIL =====
async function openApplicationDetail(id, { historyMode = 'push' } = {}) {
  if (historyMode !== 'none') {
    const returnUrl = `${window.location.pathname}${window.location.search}`;
    writeHistory(
      `/app/applications/${id}`,
      historyMode,
      { returnUrl },
    );
  }
  setDetailApplication(id);
  showDetailPanel('Loading...', '<div class="loading">Loading...</div>');

  try {
    const [app, notesList, companiesList] = await Promise.all([
      appsApi.get(id),
      notesApi.list(id),
      state.companies.length ? Promise.resolve(state.companies) : companiesApi.list(),
    ]);

    if (state.companies.length === 0) setCompanies(companiesList);
    const companyName = app.company?.name
      || state.companies.find(c => c.id === app.companyId)?.name
      || '-';

    el('detail-title').textContent = app.title;
    el('detail-body').innerHTML = buildDetailBody(app, companyName, notesList);

    bindDetailEvents(app, notesList);
  } catch (err) {
    el('detail-title').textContent = 'Application unavailable';
    el('detail-body').innerHTML = alertError(getErrorMessage(err, 'Failed to load application'));
  }
}

function buildDetailBody(app, companyName, notesList) {
  const jobLink = app.jobUrl
    ? renderExternalLink(app.jobUrl, 'Open link') || `<span>${escapeHtml(app.jobUrl)}</span>`
    : '';
  const contactEmail = app.contactEmail
    ? `<a href="mailto:${escapeAttr(app.contactEmail)}">${escapeHtml(app.contactEmail)}</a>`
    : '-';
  const contactPhone = app.contactPhone
    ? `<a href="tel:${escapeAttr(app.contactPhone)}">${escapeHtml(app.contactPhone)}</a>`
    : '-';
  const timing = actionTiming(app.nextActionAt);
  const history = Array.isArray(app.statusHistory) ? app.statusHistory : [];

  return `
    ${app.archivedAt ? '<div class="archive-banner">This application is archived.</div>' : ''}
    <div class="next-action-card ${app.nextAction ? '' : 'is-empty'}">
      <div>
        <div class="detail-field-label">Next action</div>
        <div class="next-action-title">${app.nextAction ? escapeHtml(app.nextAction) : 'No next action planned'}</div>
      </div>
      ${app.nextAction
        ? `<span class="action-deadline action-deadline-${escapeAttr(timing.tone)}">${escapeHtml(timing.label)}</span>`
        : ''}
    </div>

    <div class="detail-meta">
      <div><div class="detail-field-label">Company</div><div class="detail-field-value">${escapeHtml(companyName)}</div></div>
      <div><div class="detail-field-label">Status</div><div class="detail-field-value">${statusBadge(app.status || 'wishlist')}</div></div>
      <div><div class="detail-field-label">Salary</div><div class="detail-field-value">${app.salary ? escapeHtml(app.salary) : '-'}</div></div>
      <div><div class="detail-field-label">Applied At</div><div class="detail-field-value">${formatDate(app.appliedAt)}</div></div>
      <div><div class="detail-field-label">Source</div><div class="detail-field-value">${app.source ? escapeHtml(app.source) : '-'}</div></div>
      <div><div class="detail-field-label">Contact</div><div class="detail-field-value">${app.contactName ? escapeHtml(app.contactName) : '-'}</div></div>
      <div><div class="detail-field-label">Contact email</div><div class="detail-field-value">${contactEmail}</div></div>
      <div><div class="detail-field-label">Contact phone</div><div class="detail-field-value">${contactPhone}</div></div>
      ${jobLink ? `<div><div class="detail-field-label">Job URL</div><div class="detail-field-value">${jobLink}</div></div>` : ''}
      <div><div class="detail-field-label">Created</div><div class="detail-field-value">${formatDate(app.createdAt)}</div></div>
    </div>

    <div class="detail-actions">
      <button class="btn btn-secondary" id="detail-edit-app">Edit Application</button>
      <button class="btn btn-secondary" id="detail-archive-app">${app.archivedAt ? 'Restore' : 'Archive'}</button>
      <button class="btn btn-danger detail-delete" id="detail-delete-app">Delete permanently</button>
    </div>

    <div class="history-section">
      <h4>Status history</h4>
      <div class="status-timeline">${renderStatusHistory(history)}</div>
    </div>

    <div class="notes-section">
      <h4>Notes (${Number(notesList.length || 0)})</h4>
      <div id="notes-list">${renderNotes(notesList)}</div>
      <div class="note-add-form">
        <div id="note-error" class="alert alert-error hidden" role="alert"></div>
        <label class="sr-only" for="note-new-content">Add a note</label>
        <textarea id="note-new-content" placeholder="Add a note..."></textarea>
        <button class="btn btn-primary" id="note-add-btn">Add Note</button>
      </div>
    </div>
  `;
}

function renderStatusHistory(history) {
  if (history.length === 0) {
    return '<div class="empty-inline">No status changes recorded yet.</div>';
  }

  return history.map(item => `
    <div class="status-history-item">
      <span class="timeline-dot" style="background:${STATUS_COLORS[item.toStatus] || STATUS_COLORS.wishlist}"></span>
      <div>
        <strong>${item.fromStatus
          ? `${escapeHtml(statusLabel(item.fromStatus))} → ${escapeHtml(statusLabel(item.toStatus))}`
          : `Started as ${escapeHtml(statusLabel(item.toStatus))}`}</strong>
        <span>${formatDateTime(item.changedAt)}</span>
      </div>
    </div>
  `).join('');
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
  el('detail-edit-app').onclick = () => {
    openApplicationForm(app);
  };

  el('detail-archive-app').onclick = () => archiveApplication(app.id, Boolean(app.archivedAt));
  el('detail-delete-app').onclick = () => deleteApplication(app.id);

  el('note-add-btn').onclick = async () => {
    const content = el('note-new-content').value.trim();
    el('note-error').classList.add('hidden');
    if (!content) {
      el('note-error').textContent = 'Note cannot be empty';
      el('note-error').classList.remove('hidden');
      el('note-new-content').focus();
      return;
    }
    el('note-add-btn').disabled = true;
    try {
      await notesApi.create({ content, applicationId: app.id });
      el('note-new-content').value = '';
      const updated = await notesApi.list(app.id);
      setHtml('notes-list', renderNotes(updated));
      bindNoteEvents(app, updated);
      showToast('Note added');
    } catch (err) {
      el('note-error').textContent = getErrorMessage(err, 'Note could not be added');
      el('note-error').classList.remove('hidden');
    } finally {
      el('note-add-btn').disabled = false;
    }
  };

  bindNoteEvents(app, notesList);
}

function bindNoteEvents(app, notesList) {
  document.querySelectorAll('.btn-delete-note').forEach(btn => {
    btn.addEventListener('click', async () => {
      const accepted = await confirmAction({
        title: 'Delete note?',
        message: 'This note will be permanently deleted.',
        confirmLabel: 'Delete note',
        danger: true,
      });
      if (!accepted) return;

      try {
        await notesApi.delete(Number(btn.dataset.id));
        const updated = await notesApi.list(app.id);
        setHtml('notes-list', renderNotes(updated));
        bindNoteEvents(app, updated);
        showToast('Note deleted');
      } catch (err) {
        showToast(getErrorMessage(err, 'Note could not be deleted'), 'error');
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
        <div id="note-edit-error-${noteId}" class="alert alert-error hidden" role="alert"></div>
        <label class="sr-only" for="note-edit-${noteId}">Edit note</label>
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
        if (!newContent) {
          el(`note-edit-error-${noteId}`).textContent = 'Note cannot be empty';
          el(`note-edit-error-${noteId}`).classList.remove('hidden');
          return;
        }
        try {
          await notesApi.update(noteId, { content: newContent });
          const updated = await notesApi.list(app.id);
          setHtml('notes-list', renderNotes(updated));
          bindNoteEvents(app, updated);
          showToast('Note updated');
        } catch (err) {
          el(`note-edit-error-${noteId}`).textContent = getErrorMessage(err, 'Note could not be updated');
          el(`note-edit-error-${noteId}`).classList.remove('hidden');
        }
      };
    });
  });
}

// ===== INIT =====
boot();
