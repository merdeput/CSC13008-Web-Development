const crypto = require('node:crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLAIMS = new Set(['sub', 'iss', 'aud', 'iat', 'exp', 'jti', 'sid']);

function decodeJsonSegment(segment) {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;
  const decoded = Buffer.from(segment, 'base64url');
  if (decoded.toString('base64url') !== segment) return null;
  try {
    const value = JSON.parse(decoded.toString('utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function verifyAccessToken(token, config, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return null;

  const header = decodeJsonSegment(parts[0]);
  if (!header || header.alg !== 'HS256' || header.typ !== 'at+jwt' || Object.keys(header).some((key) => !['alg', 'typ'].includes(key))) return null;

  const suppliedSignature = Buffer.from(parts[2], 'base64url');
  if (suppliedSignature.toString('base64url') !== parts[2]) return null;
  const expectedSignature = crypto.createHmac('sha256', config.secret).update(`${parts[0]}.${parts[1]}`).digest();
  if (suppliedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(suppliedSignature, expectedSignature)) return null;

  const claims = decodeJsonSegment(parts[1]);
  if (!claims || Object.keys(claims).some((key) => !CLAIMS.has(key))) return null;
  const nowSeconds = Math.floor(now / 1000);
  if (!UUID.test(claims.sub || '') || !UUID.test(claims.sid || '') || !UUID.test(claims.jti || '')) return null;
  if (claims.iss !== config.issuer || claims.aud !== config.audience) return null;
  if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)) return null;
  if (claims.iat > nowSeconds + 30 || claims.exp <= nowSeconds || claims.exp <= claims.iat) return null;
  if (claims.exp - claims.iat !== 15 * 60) return null;

  return claims;
}

module.exports = { verifyAccessToken };
