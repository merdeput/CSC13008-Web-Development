const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getCookieNames(secure = process.env.NODE_ENV === 'production') {
  return secure
    ? { refresh: '__Host-bephoi.rt', csrf: '__Host-bephoi.csrf' }
    : { refresh: 'bephoi.rt', csrf: 'bephoi.csrf' };
}

function parseCookies(header = '') {
  const cookies = new Map();
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    if (!cookies.has(name)) cookies.set(name, part.slice(separator + 1).trim());
  }
  return cookies;
}

function cookieOptions(secure, maxAge) {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge };
}

function setRefreshCookie(res, token, expiresAt, secure = process.env.NODE_ENV === 'production') {
  const maxAge = Math.max(0, Math.min(REFRESH_TTL_MS, expiresAt.getTime() - Date.now()));
  res.cookie(getCookieNames(secure).refresh, token, cookieOptions(secure, maxAge));
}

function clearAuthCookies(res, secure = process.env.NODE_ENV === 'production') {
  const names = getCookieNames(secure);
  res.clearCookie(names.refresh, cookieOptions(secure, 0));
  res.clearCookie(names.csrf, cookieOptions(secure, 0));
}

function setCsrfCookie(res, token, secure = process.env.NODE_ENV === 'production') {
  res.cookie(getCookieNames(secure).csrf, token, cookieOptions(secure, REFRESH_TTL_MS));
}

module.exports = { REFRESH_TTL_MS, getCookieNames, parseCookies, setRefreshCookie, setCsrfCookie, clearAuthCookies };
