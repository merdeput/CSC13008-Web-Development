import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OTP_RESEND_COOLDOWN_MS,
  formatCountdown,
  getResendCooldownUntil,
  maskEmail,
  otpDigits,
  passwordMetrics,
  passwordPolicyMessage,
  retryDurationFromError,
  startResendCooldown
} from '../src/auth/ui-helpers.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test('password guidance enforces the shared length, UTF-8 byte, and composition policy', () => {
  assert.equal(passwordMetrics('short').valid, false);
  assert.equal(passwordMetrics('Abcdefghij1!').valid, true);
  assert.equal(passwordMetrics('Ábcdefghij١!').valid, true);
  assert.equal(passwordMetrics('😀'.repeat(12)).valid, false);
  assert.equal(passwordMetrics('😀'.repeat(32)).withinByteLimit, true);
  assert.equal(passwordMetrics('😀'.repeat(33)).withinByteLimit, false);
  assert.equal(passwordMetrics('abcdefghijkl1!').hasUppercase, false);
  assert.equal(passwordMetrics('abcdefghijkl1!').hasNumber, true);
  assert.equal(passwordMetrics('abcdefghijkl1!').hasSpecialCharacter, true);
  assert.match(passwordPolicyMessage(passwordMetrics('abcdefghijkl1!')), /chữ hoa/);
});

test('OTP input sanitation supports numeric paste, leading zeroes, and exactly six digits', () => {
  assert.equal(otpDigits('12 34-56'), '123456');
  assert.equal(otpDigits('001234'), '001234');
  assert.equal(otpDigits('123456789'), '123456');
  assert.equal(otpDigits('code'), '');
});

test('email masking keeps the destination recognizable without showing the full local part', () => {
  assert.equal(maskEmail('people@example.test'), 'p•••e@example.test');
  assert.equal(maskEmail('a@example.test'), 'a•••@example.test');
  assert.equal(maskEmail('invalid'), '');
});

test('countdown formatting rounds up and keeps the mm:ss display stable', () => {
  assert.equal(formatCountdown(0), '00:00');
  assert.equal(formatCountdown(1), '00:01');
  assert.equal(formatCountdown(60_000), '01:00');
  assert.equal(formatCountdown(14 * 60_000 + 31_001), '14:32');
});

test('OTP resend cooldown survives a React remount through tab-scoped presentation state', () => {
  const storage = createStorage();
  const now = Date.now();
  const deadline = startResendCooldown(storage, now);
  assert.equal(deadline, now + OTP_RESEND_COOLDOWN_MS);
  assert.equal(getResendCooldownUntil(storage), deadline);
  assert.equal(getResendCooldownUntil(storage, deadline), 0);
});

test('login lockout countdown only activates from a server-provided retry duration', () => {
  assert.equal(retryDurationFromError({ code: 'LOGIN_LOCKED' }), 0);
  assert.equal(retryDurationFromError({ code: 'LOGIN_INVALID', retryAfterMs: 10_000 }), 10_000);
  assert.equal(retryDurationFromError({ code: 'LOGIN_LOCKED', retryAfterMs: -1 }), 0);
});
