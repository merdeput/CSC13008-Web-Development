async function request(path, options) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.message || 'Request failed.');
    error.fields = body.error?.fields || {};
    throw error;
  }
  return body.data;
}
export const studentApi = {
  list: () => request('/api/students'),
  create: (student) => request('/api/students', { method: 'POST', body: JSON.stringify(student) }),
  update: (id, student) => request(`/api/students/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(student) }),
  remove: (id) => request(`/api/students/${encodeURIComponent(id)}`, { method: 'DELETE' })
};
