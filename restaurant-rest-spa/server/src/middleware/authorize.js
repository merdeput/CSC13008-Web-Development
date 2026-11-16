function forbidden(res) {
  return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' } });
}
function authorize(req, res, next) {
  const { role, chefId } = req.auth.user;
  if (!['viewer', 'editor', 'admin'].includes(role)) return forbidden(res);
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (role === 'admin') return next();
  if (role !== 'editor') return forbidden(res);
  if (req.method === 'POST') {
    if (req.path === '/dishes') {
      if (!chefId) return forbidden(res);
      req.body = { ...req.body, chefId, isPublished: false };
    }
    // Chef creation must not silently reassign existing dishes.
    if (req.path === '/chefs' && Object.hasOwn(req.body || {}, 'dishIds')) return forbidden(res);
    return next();
  }
  if (req.method === 'PATCH' && /^\/dishes\/[^/]+$/.test(req.path)) {
    if (!chefId || Object.hasOwn(req.body || {}, 'chefId') || Object.hasOwn(req.body || {}, 'isPublished') || Object.hasOwn(req.body || {}, 'status')) return forbidden(res);
    return next();
  }
  return forbidden(res);
}
module.exports = { authorize, forbidden };
