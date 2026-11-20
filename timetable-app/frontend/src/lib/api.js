const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.field = data.field;
    err.unscheduled = data.unscheduled;
    err.existing = data.existing;
    throw err;
  }
  return data;
}

export const api = {
  categories: () => request('/categories'),
  entries: (date) => request(`/entries?date=${encodeURIComponent(date)}`),
  createEntry: (body) => request('/entries', { method: 'POST', body }),
  updateEntry: (id, body) => request(`/entries/${id}`, { method: 'PATCH', body }),
  deleteEntry: (id) => request(`/entries/${id}`, { method: 'DELETE' }),
  clearDay: (date) => request(`/day?date=${encodeURIComponent(date)}`, { method: 'DELETE' }),
  generate: (body) => request('/generate', { method: 'POST', body }),
  templates: () => request('/templates'),
  saveTemplate: (body) => request('/templates', { method: 'POST', body }),
  deleteTemplate: (id) => request(`/templates/${id}`, { method: 'DELETE' }),
  copyDay: (body) => request('/copy', { method: 'POST', body }),
  summary: (from, to) => request(`/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  exportUrl: (date) => `${BASE}/export?date=${encodeURIComponent(date)}`,
};
