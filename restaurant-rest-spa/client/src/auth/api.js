import {
  ApiError,
  clearAccessToken,
  clearCsrfToken,
  invalidatePrivateCache,
  request,
  restoreWithRefresh,
  setAccessToken,
  getAccessToken
} from './http.js';

function accessTokenFrom(data) { return data?.accessToken || data?.accessJwt || null; }
function userFrom(data) {
  if (data?.user && typeof data.user === 'object') return data.user;
  if (data && typeof data === 'object' && (data.id || data.email)) {
    const { id, email, role, name } = data;
    return { id, email, role, name };
  }
  return null;
}

async function login(credentials) {
  const data = await request('/api/auth/login', { method: 'POST', body: credentials, retry401: false });
  const token = accessTokenFrom(data);
  if (!token) throw new ApiError('The login response did not include an access token.', 502, { code: 'ACCESS_TOKEN_MISSING' });
  setAccessToken(token);
  clearCsrfToken();
  let user;
  try {
    user = userFrom(data) || userFrom(await request('/api/auth/me', { protected: false, accessToken: token }));
    if (!user) throw new ApiError('The current-user response did not include a user.', 502, { code: 'USER_MISSING' });
  } catch (error) {
    clearAccessToken();
    throw error;
  }
  invalidatePrivateCache({ reload: true });
  return user;
}

async function logout() {
  const token = getAccessToken();
  try {
    await request('/api/auth/logout', {
      method: 'POST', body: {}, protected: false, accessToken: token || undefined, retry401: false
    });
  } finally {
    clearAccessToken();
    clearCsrfToken();
    invalidatePrivateCache();
  }
}

export const authApi = {
  register: (input) => request('/api/auth/register', { method: 'POST', body: input, retry401: false }),
  verifyEmail: (input) => request('/api/auth/verify-email', { method: 'POST', body: input, retry401: false }),
  resendOtp: (input) => request('/api/auth/resend-otp', { method: 'POST', body: input, retry401: false }),
  login,
  forgotPassword: (input) => request('/api/auth/forgot-password', { method: 'POST', body: input, retry401: false }),
  resetPassword: (input) => request('/api/auth/reset-password', { method: 'POST', body: input, retry401: false }),
  logout,
  restore: restoreWithRefresh
};

export { userFrom };
