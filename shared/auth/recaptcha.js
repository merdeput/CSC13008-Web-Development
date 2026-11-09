const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

function getAllowedHostnames() {
  return (process.env.RECAPTCHA_ALLOWED_HOSTNAMES || '')
    .split(',')
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
}

function isRecaptchaConfigured() {
  return Boolean(process.env.RECAPTCHA_SITE_KEY && process.env.RECAPTCHA_SECRET_KEY && getAllowedHostnames().length);
}

async function verifyRecaptcha(token) {
  if (!isRecaptchaConfigured()) throw new Error('Registration security is not configured.');
  if (typeof token !== 'string' || !token.trim()) return false;

  const payload = new URLSearchParams({ secret: process.env.RECAPTCHA_SECRET_KEY, response: token });
  let response;
  try {
    response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload,
      signal: AbortSignal.timeout(7000)
    });
  } catch {
    throw new Error('Registration security is temporarily unavailable. Please try again.');
  }
  if (!response.ok) throw new Error('Registration security is temporarily unavailable. Please try again.');

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Registration security is temporarily unavailable. Please try again.');
  }
  const allowedHostnames = getAllowedHostnames();
  if (result.success !== true) {
    console.warn('[auth] reCAPTCHA verification rejected', {
      errorCodes: Array.isArray(result['error-codes']) ? result['error-codes'] : []
    });
    return false;
  }
  if (typeof result.hostname !== 'string' || !allowedHostnames.includes(result.hostname.toLowerCase())) {
    console.warn('[auth] reCAPTCHA hostname rejected', { hostname: result.hostname || null });
    return false;
  }
  return true;
}

module.exports = { getAllowedHostnames, isRecaptchaConfigured, verifyRecaptcha };
