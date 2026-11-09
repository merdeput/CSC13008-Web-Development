export class ApiError extends Error {
  constructor(message, status, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = details.code;
    this.fields = details.fields || {};
  }
}

// The access JWT intentionally lives only in this module's JavaScript memory.
let accessToken = null;
let csrfToken = null;
let csrfPromise = null;
let refreshPromise = null;

export function getAccessToken() { return accessToken; }
export function setAccessToken(value) { accessToken = typeof value === 'string' && value ? value : null; }
export function clearAccessToken() { accessToken = null; }

export function isUnauthorized(error) {
  return error?.status === 401 || [
    'UNAUTHENTICATED', 'ACCESS_TOKEN_EXPIRED', 'TOKEN_EXPIRED', 'SESSION_EXPIRED',
    'REFRESH_EXPIRED', 'REFRESH_TOKEN_EXPIRED', 'REFRESH_TOKEN_INVALID', 'INVALID_REFRESH_TOKEN', 'NO_REFRESH_TOKEN'
  ].includes(error?.code);
}

function announceSessionExpired() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('auth-session-expired'));
}

function announceSessionUnavailable(message) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('auth-session-unavailable', { detail: { message } }));
}

export function invalidatePrivateCache({ reload = false } = {}) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('private-cache-invalidated', { detail: { reload } }));
}

function toApiError(payload, status) {
  const error = payload?.error;
  if (error && typeof error === 'object') {
    return new ApiError(error.message || 'The request could not be completed.', status, error);
  }
  return new ApiError(typeof error === 'string' ? error : 'The server could not complete the request. Please try again.', status);
}

async function send(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (options.accessToken) headers.set('Authorization', `Bearer ${options.accessToken}`);
  if (options.csrfToken) headers.set('X-CSRF-Token', options.csrfToken);

  let response;
  try {
    response = await fetch(path, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
      signal: options.signal,
      credentials: options.credentials || 'include'
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Could not connect to the server. Check your connection and try again.', 0, { code: 'NETWORK_ERROR' });
  }

  let payload;
  try { payload = await response.json(); }
  catch { throw new ApiError('The server returned an unreadable response.', response.status, { code: 'INVALID_RESPONSE' }); }
  if (!response.ok || payload?.ok !== true) throw toApiError(payload, response.status);
  return payload.data;
}

async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = send('/api/auth/csrf').then((data) => {
      const value = data?.csrfToken || data?.token;
      if (typeof value !== 'string' || !value) throw new ApiError('The server did not provide a CSRF token.', 502, { code: 'CSRF_TOKEN_MISSING' });
      csrfToken = value;
      return value;
    }).finally(() => { csrfPromise = null; });
  }
  return csrfPromise;
}

function extractAccessToken(data) {
  return data?.accessToken || data?.accessJwt || null;
}

async function performRefresh() {
  // A refresh cookie may have rotated in another tab, so obtain a current CSRF value.
  csrfToken = null;
  const token = await getCsrfToken();
  const data = await send('/api/auth/refresh', { method: 'POST', body: {}, csrfToken: token });
  const nextToken = extractAccessToken(data);
  if (!nextToken) throw new ApiError('The refresh response did not include an access token.', 502, { code: 'ACCESS_TOKEN_MISSING' });
  setAccessToken(nextToken);
  csrfToken = null;
  return nextToken;
}

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const run = () => performRefresh();
    // A browser lock also serializes refresh-cookie rotation across tabs where supported.
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      return navigator.locks.request('bephoi-auth-refresh', { mode: 'exclusive' }, run);
    }
    return run();
  })().catch((error) => {
    if (isUnauthorized(error)) clearAccessToken();
    throw error;
  }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function isProtectedPath(path) {
  return /^\/?api\/admin(?:\/|$)/.test(String(path).replace(/^https?:\/\/[^/]+\//, ''));
}

export async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const needsCsrf = options.csrf === true || (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && options.csrf !== false);
  const csrfHeader = needsCsrf ? await getCsrfToken() : null;
  const protectedRequest = options.protected === true || (options.protected !== false && isProtectedPath(path));
  const initialToken = options.accessToken || (protectedRequest ? getAccessToken() : null);
  const sendOptions = { ...options, method, csrfToken: csrfHeader, accessToken: initialToken };

  try {
    return await send(path, sendOptions);
  } catch (error) {
    if (!protectedRequest || options.retry401 === false || !isUnauthorized(error)) throw error;
    let nextToken;
    try {
      nextToken = getAccessToken() !== initialToken && getAccessToken()
        ? getAccessToken()
        : await refreshAccessToken();
    } catch (refreshError) {
      clearAccessToken();
      invalidatePrivateCache();
      if (isUnauthorized(refreshError)) {
        announceSessionExpired();
        throw new ApiError('Your session has expired. Please sign in again.', 401, { code: 'SESSION_EXPIRED', cause: refreshError });
      }
      const message = 'Could not verify your session because the server is unavailable. Retry when your connection is back.';
      announceSessionUnavailable(message);
      throw new ApiError(message, refreshError?.status || 0, { code: 'SESSION_UNAVAILABLE', cause: refreshError });
    }
    try {
      return await send(path, { ...sendOptions, accessToken: nextToken });
    } catch (retryError) {
      if (isUnauthorized(retryError)) {
        clearAccessToken();
        invalidatePrivateCache();
        announceSessionExpired();
        throw new ApiError('Your session has expired. Please sign in again.', 401, { code: 'SESSION_EXPIRED' });
      }
      throw retryError;
    }
  }
}

export async function restoreWithRefresh() {
  clearAccessToken();
  let token;
  try { token = await refreshAccessToken(); }
  catch (error) {
    if (isUnauthorized(error)) return null;
    throw error;
  }
  try { return await request('/api/auth/me', { protected: false, accessToken: token }); }
  catch (error) {
    if (isUnauthorized(error)) {
      clearAccessToken();
      return null;
    }
    throw error;
  }
}

export function clearCsrfToken() { csrfToken = null; }
