const crypto = require('node:crypto');

function attachCsrfToken(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function requireCsrf(req, res, next) {
  const submitted = req.body && req.body._csrf;
  const expected = req.session && req.session.csrfToken;
  if (typeof submitted !== 'string' || typeof expected !== 'string') {
    return res.status(403).render('errors/error', {
      pageTitle: 'Yêu cầu không hợp lệ',
      status: 403,
      message: 'Phiên gửi biểu mẫu đã hết hạn. Vui lòng tải lại trang và thử lại.'
    });
  }
  const submittedBuffer = Buffer.from(submitted);
  const expectedBuffer = Buffer.from(expected);
  if (submittedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(submittedBuffer, expectedBuffer)) {
    return res.status(403).render('errors/error', {
      pageTitle: 'Yêu cầu không hợp lệ',
      status: 403,
      message: 'Mã bảo vệ biểu mẫu không hợp lệ. Vui lòng tải lại trang.'
    });
  }
  next();
}

module.exports = { attachCsrfToken, requireCsrf };
