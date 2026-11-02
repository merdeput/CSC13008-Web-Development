const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const SCRYPT_N = 1 << 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 256 * 1024 * 1024;
const DUMMY_SALT = Buffer.from('bephoi-auth-dummy-salt');
const DUMMY_HASH = Buffer.alloc(KEY_LENGTH);

async function derive(password, salt, n = SCRYPT_N, r = SCRYPT_R, p = SCRYPT_P) {
  return scrypt(password, salt, KEY_LENGTH, {
    N: n,
    r,
    p,
    maxmem: MAX_MEMORY
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await derive(password, salt);
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

async function verifyPassword(password, encodedHash) {
  const parts = typeof encodedHash === 'string' ? encodedHash.split('$') : [];
  const validFormat = parts.length === 6 && parts[0] === 'scrypt';
  const n = validFormat ? Number(parts[1]) : SCRYPT_N;
  const r = validFormat ? Number(parts[2]) : SCRYPT_R;
  const p = validFormat ? Number(parts[3]) : SCRYPT_P;
  const paramsSafe = Number.isInteger(n) && n >= (1 << 14) && n <= (1 << 18)
    && r === SCRYPT_R && p === SCRYPT_P;
  const salt = validFormat && paramsSafe ? Buffer.from(parts[4], 'base64url') : DUMMY_SALT;
  const expected = validFormat && paramsSafe ? Buffer.from(parts[5], 'base64url') : DUMMY_HASH;
  const actual = await derive(password, salt, paramsSafe ? n : SCRYPT_N, SCRYPT_R, SCRYPT_P);
  const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  return Boolean(validFormat && paramsSafe && matches);
}

module.exports = { hashPassword, verifyPassword };
