const { isRecaptchaConfigured } = require('./recaptcha');

function registrationAvailable() {
  return isRecaptchaConfigured()
    && Boolean(process.env.RESEND_API_KEY)
    && Boolean(process.env.EMAIL_FROM)
    && Boolean(process.env.OTP_HMAC_SECRET && Buffer.byteLength(process.env.OTP_HMAC_SECRET) >= 32);
}

function loginAvailable() {
  return isRecaptchaConfigured()
    && Boolean(process.env.LOGIN_COUNTER_HMAC_SECRET && Buffer.byteLength(process.env.LOGIN_COUNTER_HMAC_SECRET) >= 32);
}

function passwordResetAvailable() {
  return isRecaptchaConfigured()
    && Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.PUBLIC_BASE_URL);
}

function validEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPassword(password) {
  return typeof password === 'string' && Array.from(password).length >= 12 && Buffer.byteLength(password, 'utf8') <= 128;
}

module.exports = { registrationAvailable, loginAvailable, passwordResetAvailable, validEmail, validPassword };
