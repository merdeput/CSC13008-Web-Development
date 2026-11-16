const { getCookieNames, parseCookies } = require('../lib/auth-cookies');

function requireCookieSession({ tokenSessions, secureCookies }) {
  return async (req, res, next) => {
    try {
      const token = parseCookies(req.headers.cookie).get(getCookieNames(secureCookies).refresh);
      const session = token ? await tokenSessions.findActiveCookieSession(token) : null;
      if (!session) return res.status(401).json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
      req.auth = session;
      return next();
    } catch (error) { return next(error); }
  };
}
module.exports = { requireCookieSession };
