const asyncHandler = require('../lib/async-handler');
const { verifyAccessToken } = require('../lib/access-token-verifier');

function unauthorized(res) {
  res.set('WWW-Authenticate', 'Bearer');
  return res.status(401).json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'A valid access token is required.' } });
}

function requireAccessToken({ jwtConfig, tokenSessions }) {
  return asyncHandler(async (req, res, next) => {
    const authorization = req.get('Authorization');
    const match = typeof authorization === 'string' && /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization);
    if (!match) return unauthorized(res);

    const claims = verifyAccessToken(match[1], jwtConfig);
    if (!claims) return unauthorized(res);
    const session = await tokenSessions.findActiveSession(claims.sid);
    if (!session || session.user.id !== claims.sub) return unauthorized(res);

    req.auth = { claims, sessionId: session.sessionId, user: session.user };
    return next();
  });
}

module.exports = { requireAccessToken };
