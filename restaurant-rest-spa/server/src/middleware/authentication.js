const { HttpError } = require('../lib/errors');
const { verifyAccessToken } = require('../lib/auth-crypto');

function getJwtConfig(options = {}) {
  const secret = options.jwtSecret || process.env.JWT_ACCESS_SECRET;
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
    throw new HttpError(503, 'Xác thực chưa được cấu hình trên máy chủ.', { code: 'AUTH_UNAVAILABLE' });
  }
  return {
    secret,
    issuer: options.jwtIssuer || process.env.JWT_ISSUER || 'restaurant-rest-spa',
    audience: options.jwtAudience || process.env.JWT_AUDIENCE || 'restaurant-rest-spa-client'
  };
}

function requireAccessToken(db, options = {}) {
  return function authenticate(req, _res, next) {
    Promise.resolve().then(async () => {
      const authorization = req.get('Authorization') || '';
      const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
      const claims = match && verifyAccessToken(match[1], options.jwtConfig || getJwtConfig(options));
      if (!claims) throw new HttpError(401, 'Access token không hợp lệ hoặc đã hết hạn.', { code: 'UNAUTHENTICATED' });

      const user = await db.user.findUnique({
        where: { id: claims.sub },
        select: { id: true, email: true, role: true, status: true, authVersion: true }
      });
      if (!user || user.status !== 'ACTIVE' || user.authVersion !== claims.ver || user.role !== claims.role) {
        throw new HttpError(401, 'Phiên đăng nhập không còn hợp lệ.', { code: 'UNAUTHENTICATED' });
      }
      req.authUser = user;
      next();
    }).catch(next);
  };
}

function requireRole(...roles) {
  return function authorize(req, _res, next) {
    if (!req.authUser) return next(new HttpError(401, 'Đăng nhập là bắt buộc.', { code: 'UNAUTHENTICATED' }));
    if (!roles.includes(req.authUser.role)) return next(new HttpError(403, 'Bạn không có quyền thực hiện thao tác này.', { code: 'FORBIDDEN' }));
    return next();
  };
}

module.exports = { requireAccessToken, requireRole, getJwtConfig };
