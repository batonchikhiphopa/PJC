// api.js — all HTTP calls to backend

const BASE_URL = '';

function getToken() {
  return localStorage.getItem('pjc_token');
}

async function request(method, path, body, options = {}) {
  const authRequired = options.auth !== false;
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (authRequired && token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(BASE_URL + path, opts);
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && authRequired) {
    // Token invalid — clear and reload to login
    localStorage.removeItem('pjc_token');
    window.location.reload();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data;
}

// AUTH
export const auth = {
  login: (email, password) =>
    request('POST', '/auth/login', { email, password }, { auth: false }),
  me: () =>
    request('GET', '/auth/me'),
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
    const query = qs.toString() ? `?${qs}` : '';
    return request('GET', `/applications${query}`);
  },
  dashboard: () => request('GET', '/applications/dashboard'),
  get: (id) => request('GET', `/applications/${id}`),
  create: (data) => request('POST', '/applications', data),
  update: (id, data) => request('PATCH', `/applications/${id}`, data),
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
