const crypto = require('node:crypto');

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signAccessToken({ userId, sessionId, stage }, config, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const pendingMfa = stage === 'mfa_pending';
  const header = { alg: 'HS256', typ: 'at+jwt' };
  const payload = {
    sub: userId,
    iss: config.issuer,
    aud: config.audience,
    iat: issuedAt,
    exp: issuedAt + (pendingMfa ? 5 * 60 : 15 * 60),
    jti: crypto.randomUUID(),
    sid: sessionId
  };
  if (pendingMfa) payload.stage = stage;
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', config.secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

module.exports = { signAccessToken };
