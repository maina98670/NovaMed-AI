// Lightweight API client. Reads JWT from localStorage and attaches it.
//
// In production (Render: frontend static site + backend web service on separate URLs)
// set VITE_API_URL=https://your-backend.onrender.com in your frontend env vars.
// In local dev, leave VITE_API_URL unset — Vite proxy handles /api → localhost:4000.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const TOKEN_KEY = 'novamed_token';

export function getToken()  { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body)),
  });

  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const msg = (data && data.error) || res.statusText || 'Request failed';
    const err = new Error(msg);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export const api = {
  get:    (p)           => request(p),
  post:   (p, body)     => request(p, { method: 'POST',   body }),
  patch:  (p, body)     => request(p, { method: 'PATCH',  body }),
  put:    (p, body)     => request(p, { method: 'PUT',    body }),
  del:    (p)           => request(p, { method: 'DELETE' }),
  delete: (p)           => request(p, { method: 'DELETE' }),      // alias
  upload: (p, formData) => request(p, { method: 'POST', body: formData, isForm: true }),
};
