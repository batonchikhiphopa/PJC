// api.js — all HTTP calls to backend

const BASE_URL = '';

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = Array.isArray(details) ? details : [];
  }
}

async function request(method, path, body, options = {}) {
  const authRequired = options.auth !== false;
  const opts = {
    method,
    credentials: 'same-origin',
    headers: {},
  };

  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(BASE_URL + path, opts);
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && authRequired) {
    window.dispatchEvent(new Event('pjc:unauthorized'));
  }

  if (!res.ok) {
    const firstDetail = Array.isArray(data.error?.details)
      ? data.error.details[0]?.message
      : '';
    const message = typeof data.error === 'string'
      ? data.error
      : firstDetail || data.error?.message;
    throw new ApiError(message || `HTTP ${res.status}`, {
      status: res.status,
      code: data.error?.code,
      details: data.error?.details,
    });
  }

  return data;
}

// AUTH
export const auth = {
  login: (email, password) =>
    request('POST', '/auth/login', { email, password }, { auth: false }),
  me: () =>
    request('GET', '/auth/me'),
  logout: () =>
    request('POST', '/auth/logout', undefined, { auth: false }),
};

// USERS
export const users = {
  create: (email, password) =>
    request('POST', '/users', { email, password }, { auth: false }),
};

// COMPANIES
export const companies = {
  list: () => request('GET', '/companies'),
  get: (id) => request('GET', `/companies/${id}`),
  create: (data) => request('POST', '/companies', data),
  update: (id, data) => request('PATCH', `/companies/${id}`, data),
  delete: (id) => request('DELETE', `/companies/${id}`),
};

// APPLICATIONS
export const applications = {
  list: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.companyId) qs.set('companyId', params.companyId);
    if (params.archived) qs.set('archived', params.archived);
    if (params.search) qs.set('search', params.search);
    if (params.sort) qs.set('sort', params.sort);
    const query = qs.toString() ? `?${qs}` : '';
    return request('GET', `/applications${query}`);
  },
  dashboard: () => request('GET', '/applications/dashboard'),
  get: (id) => request('GET', `/applications/${id}`),
  create: (data) => request('POST', '/applications', data),
  update: (id, data) => request('PATCH', `/applications/${id}`, data),
  archive: (id) => request('POST', `/applications/${id}/archive`),
  restore: (id) => request('POST', `/applications/${id}/restore`),
  delete: (id) => request('DELETE', `/applications/${id}`),
};

// NOTES
export const notes = {
  list: (applicationId) =>
    request('GET', `/notes?applicationId=${applicationId}`),
  create: (data) => request('POST', '/notes', data),
  update: (id, data) => request('PATCH', `/notes/${id}`, data),
  delete: (id) => request('DELETE', `/notes/${id}`),
};
