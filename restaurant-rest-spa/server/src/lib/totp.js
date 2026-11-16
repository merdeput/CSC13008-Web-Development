const crypto = require('node:crypto');

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const CODE_DIGITS = 6;

function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value) {
  const normalized = String(value || '').toUpperCase().replace(/=+$/u, '');
  if (!normalized || /[^A-Z2-7]/u.test(normalized)) throw new Error('Invalid base32 secret.');
  let bits = 0;
  let accumulator = 0;
  const bytes = [];
  for (const character of normalized) {
    accumulator = (accumulator << 5) | BASE32.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function createSecret() {
  return encodeBase32(crypto.randomBytes(20));
}

function codeForStep(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % (10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function matchTotp(secret, code, now = Date.now(), window = 1) {
  if (typeof code !== 'string' || !/^\d{6}$/u.test(code)) return null;
  const currentStep = Math.floor(now / 1000 / STEP_SECONDS);
  for (let offset = -window; offset <= window; offset += 1) {
    const step = currentStep + offset;
    if (step >= 0 && safeEqual(codeForStep(secret, step), code)) return step;
  }
  return null;
}

function otpauthUri(secret, account, issuer = 'Bep Hoi') {
  const label = `${issuer}:${account}`;
  const query = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(CODE_DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${encodeURIComponent(label)}?${query}`;
}

module.exports = { STEP_SECONDS, CODE_DIGITS, encodeBase32, decodeBase32, createSecret, codeForStep, matchTotp, otpauthUri };
