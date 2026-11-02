const asyncHandler = require('../lib/async-handler');

function clearSession(req, res) {
  return new Promise((resolve) => {
    if (!req.session) return resolve();
    req.session.destroy(() => {
      const name = req.app.locals.sessionCookieName || 'bephoi.sid';
      res.clearCookie(name, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
      resolve();
    });
  });
}

function requireAuthenticated(services) {
  return asyncHandler(async (req, res, next) => {
    const userId = req.session && req.session.userId;
    if (!userId) {
      return res.redirect(303, `/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
    }

    const absoluteExpiry = Number(req.session.authExpiresAt || 0);
    const user = absoluteExpiry > Date.now() ? await services.auth.findById(userId) : null;
    if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
      await clearSession(req, res);
      return res.redirect(303, '/login');
    }

    res.locals.authUser = { id: user.id, email: user.email, role: user.role };
    next();
  });
}

module.exports = { requireAuthenticated };
