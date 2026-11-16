const express = require('express');
const asyncHandler = require('../lib/async-handler');
const { requireCookieSession } = require('../middleware/require-cookie-session');
const { isUuid } = require('../services/validation');

// TEMPORARY: only mounted with an explicit opt-in in development.
function createDevRoleRouter({ db, tokenSessions, secureCookies, csrfMiddleware }) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
      return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Local connections only.' } });
    }
    return next();
  }, requireCookieSession({ tokenSessions, secureCookies }));
  router.get('/', asyncHandler(async (_req, res) => {
    const chefs = await db.chef.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, data: { chefs } });
  }));
  router.post('/', csrfMiddleware.requireTrustedOrigin, csrfMiddleware.requireCsrf, asyncHandler(async (req, res) => {
    const { role, chefId } = req.body || {};
    if (!['viewer', 'editor', 'admin'].includes(role) || (role === 'editor' && !isUuid(chefId))) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_ROLE_ASSIGNMENT', message: 'Choose a valid role and a chef for editor.' } });
    }
    if (role === 'editor' && !await db.chef.findUnique({ where: { id: chefId }, select: { id: true } })) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_ROLE_ASSIGNMENT', message: 'The selected chef does not exist.' } });
    }
    const user = await db.user.update({ where: { id: req.auth.user.id }, data: { role, chefId: role === 'editor' ? chefId : null }, select: { id: true, email: true, role: true, chefId: true } });
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, data: user });
  }));
  return router;
}
module.exports = { createDevRoleRouter };
