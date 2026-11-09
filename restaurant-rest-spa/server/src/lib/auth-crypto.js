const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const PASSWORD_BYTES = 64;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.isBuffer(left) ? left : Buffer.from(String(left));
  const b = Buffer.isBuffer(right) ? right : Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, PASSWORD_BYTES, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

async function verifyPassword(password, encoded) {
  if (typeof encoded !== 'string') return false;
  const [scheme, salt, expectedHex, extra] = encoded.split('$');
  if (scheme !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(expectedHex || '') || extra !== undefined) return false;
  const actual = await scrypt(password, salt, PASSWORD_BYTES, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return safeEqual(actual, Buffer.from(expectedHex, 'hex'));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmacHex(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function makeOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function signAccessToken(user, config) {
  if (!config?.secret || Buffer.byteLength(config.secret) < 32) throw new Error('JWT_ACCESS_SECRET must contain at least 32 bytes.');
  const nowSeconds = Math.floor((config.now ?? Date.now()) / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: user.id,
    role: user.role,
    ver: user.authVersion,
    iss: config.issuer || 'restaurant-rest-spa',
    aud: config.audience || 'restaurant-rest-spa-client',
    iat: nowSeconds,
    exp: nowSeconds + (config.ttlSeconds || 900),
    jti: crypto.randomUUID()
  };
  const content = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', config.secret).update(content).digest('base64url');
  return `${content}.${signature}`;
}

function verifyAccessToken(token, config) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !config?.secret || Buffer.byteLength(config.secret) < 32) return null;
  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { return null; }
  if (header?.alg !== 'HS256' || header?.typ !== 'JWT') return null;
  const expected = crypto.createHmac('sha256', config.secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (!safeEqual(parts[2], expected)) return null;
  const nowSeconds = Math.floor((config.now ?? Date.now()) / 1000);
  if (!Number.isInteger(payload?.iat) || !Number.isInteger(payload?.exp) || payload.exp <= nowSeconds) return null;
  if (payload.nbf !== undefined && (!Number.isInteger(payload.nbf) || payload.nbf > nowSeconds)) return null;
  if (payload.iss !== (config.issuer || 'restaurant-rest-spa')) return null;
  const audience = config.audience || 'restaurant-rest-spa-client';
  if (!(payload.aud === audience || (Array.isArray(payload.aud) && payload.aud.includes(audience)))) return null;
  if (typeof payload.sub !== 'string' || typeof payload.role !== 'string' || !Number.isInteger(payload.ver)) return null;
  return payload;
}

module.exports = { hashPassword, verifyPassword, sha256, hmacHex, makeOpaqueToken, signAccessToken, verifyAccessToken, safeEqual };
