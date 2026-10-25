const { HttpError, ValidationError, isPrismaCode } = require('../lib/errors');

function notFound(_req, res) {
  return res.status(404).json({ error: 'Đường dẫn không khả dụng.' });
}

function errorHandler(error, _req, res, _next) {
  if (res.headersSent) return;
  if (error instanceof HttpError) {
    const code = error.code || 'BUSINESS_ERROR';
    if (code === 'NOT_FOUND' || code === 'CONFLICT') {
      return res.status(200).json({ ok: false, error: { code, message: error.message } });
    }
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof ValidationError) {
    return res.status(200).json({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: error.message, fields: error.errors || {} }
    });
  }
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Nội dung gửi lên vượt quá giới hạn cho phép.' });
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dữ liệu JSON không hợp lệ.' });
  if (isPrismaCode(error, 'P2002')) return res.status(200).json({ ok: false, error: { code: 'CONFLICT', message: 'Dữ liệu này đã tồn tại.' } });
  if (isPrismaCode(error, 'P2025')) return res.status(200).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Dữ liệu không khả dụng.' } });
  console.error('API request failed.', error?.name || 'Error', error?.code || '');
  return res.status(500).json({ error: 'Máy chủ chưa thể hoàn tất yêu cầu. Vui lòng thử lại sau.' });
}

module.exports = { notFound, errorHandler };
