const { HttpError } = require('./errors');

async function verifyRecaptcha(token, options = {}) {
  if (typeof token !== 'string' || !token.trim()) return false;
  const secret = options.secret ?? process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) throw new HttpError(503, 'reCAPTCHA chưa được cấu hình trên máy chủ.', { code: 'CAPTCHA_UNAVAILABLE' });
  const params = new URLSearchParams({ secret, response: token });
  if (options.remoteIp) params.set('remoteip', options.remoteIp);
  let result;
  try {
    const response = await (options.fetch || fetch)('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`siteverify returned ${response.status}`);
    result = await response.json();
  } catch {
    throw new HttpError(503, 'Không thể xác minh reCAPTCHA lúc này.', { code: 'CAPTCHA_UNAVAILABLE' });
  }
  if (result?.success !== true) return false;
  const allowed = String(options.allowedHostnames ?? process.env.RECAPTCHA_ALLOWED_HOSTNAMES ?? '')
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(String(result.hostname || '').toLowerCase())) return false;
  return true;
}

module.exports = { verifyRecaptcha };
