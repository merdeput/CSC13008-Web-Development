export const PASSWORD_MIN_CODE_POINTS = 12;
export const PASSWORD_MAX_BYTES = 128;
export const OTP_LENGTH = 6;
export const OTP_RESEND_COOLDOWN_MS = 60_000;

export function passwordMetrics(value) {
  const password = typeof value === 'string' ? value : '';
  const bytes = new TextEncoder().encode(password).length;
  const codePoints = Array.from(password).length;
  return {
    bytes,
    codePoints,
    longEnough: codePoints >= PASSWORD_MIN_CODE_POINTS,
    withinByteLimit: bytes <= PASSWORD_MAX_BYTES,
    hasUppercase: /\p{Lu}/u.test(password),
    hasNumber: /\p{Nd}/u.test(password),
    hasSpecialCharacter: /[^\p{L}\p{M}\p{N}\s]/u.test(password),
    valid: codePoints >= PASSWORD_MIN_CODE_POINTS
      && bytes <= PASSWORD_MAX_BYTES
      && /\p{Lu}/u.test(password)
      && /\p{Nd}/u.test(password)
      && /[^\p{L}\p{M}\p{N}\s]/u.test(password)
  };
}

export function passwordPolicyMessage(metrics) {
  if (!metrics.longEnough) return 'Mật khẩu cần có ít nhất 12 ký tự.';
  if (!metrics.withinByteLimit) return 'Mật khẩu không được dài quá 128 byte.';
  const missing = [];
  if (!metrics.hasUppercase) missing.push('một chữ hoa');
  if (!metrics.hasNumber) missing.push('một chữ số');
  if (!metrics.hasSpecialCharacter) missing.push('một ký tự đặc biệt');
  return missing.length ? `Mật khẩu cần có ít nhất ${missing.join(', ').replace(/, ([^,]*)$/, ' và $1')}.` : '';
}

export function otpDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, OTP_LENGTH);
}

export function maskEmail(value) {
  const email = String(value || '').trim();
  const separator = email.lastIndexOf('@');
  if (separator < 1) return '';
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  if (!domain) return '';
  const visibleLocal = local.length > 2 ? `${local[0]}•••${local.at(-1)}` : `${local[0]}•••`;
  return `${visibleLocal}@${domain}`;
}

export function formatCountdown(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(Number(milliseconds || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function retryDurationFromError(error) {
  const value = Number(error?.retryAfterMs);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 24 * 60 * 60 * 1000) : 0;
}

const RESEND_UNTIL_KEY = 'bephoi:otp-resend-until';

export function getResendCooldownUntil(storage, now = Date.now()) {
  try {
    const target = storage || globalThis.sessionStorage;
    const value = Number(target?.getItem(RESEND_UNTIL_KEY));
    if (Number.isFinite(value) && value > now) return value;
    target?.removeItem(RESEND_UNTIL_KEY);
  } catch {
    // Storage can be unavailable in private browsing. The server still owns the cooldown.
  }
  return 0;
}

export function startResendCooldown(storage, now = Date.now(), durationMs = OTP_RESEND_COOLDOWN_MS) {
  const requestedDuration = Number(durationMs);
  const cooldownMs = Number.isFinite(requestedDuration) && requestedDuration > 0
    ? Math.min(Math.ceil(requestedDuration), 24 * 60 * 60 * 1000)
    : OTP_RESEND_COOLDOWN_MS;
  const until = now + cooldownMs;
  try { (storage || globalThis.sessionStorage)?.setItem(RESEND_UNTIL_KEY, String(until)); } catch {
    // The cooldown is a presentation hint; API limits remain authoritative.
  }
  return until;
}
