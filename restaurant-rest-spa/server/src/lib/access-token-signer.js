const crypto = require('node:crypto');

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signAccessToken({ userId, sessionId }, config, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const header = { alg: 'HS256', typ: 'at+jwt' };
  const payload = {
    sub: userId,
    iss: config.issuer,
    aud: config.audience,
    iat: issuedAt,
    exp: issuedAt + 15 * 60,
    jti: crypto.randomUUID(),
    sid: sessionId
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', config.secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

module.exports = { signAccessToken };
