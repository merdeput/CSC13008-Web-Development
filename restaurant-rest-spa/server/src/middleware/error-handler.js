const { HttpError, ValidationError, isPrismaCode } = require('../lib/errors');

function notFound(_req, res) {
  return res.status(404).json({ ok: false, error: 'Đường dẫn không khả dụng.' });
}

function errorHandler(error, _req, res, _next) {
  if (res.headersSent) return;
  if (error instanceof HttpError) return res.status(error.status).json({ ok: false, error: error.message });
  if (error instanceof ValidationError) {
    const detail = Object.values(error.errors || {}).filter((message) => typeof message === 'string').join(' ');
    return res.status(400).json({ ok: false, error: detail ? `${error.message} ${detail}` : error.message });
  }
  if (error?.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'Nội dung gửi lên vượt quá giới hạn cho phép.' });
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'Dữ liệu JSON không hợp lệ.' });
  if (isPrismaCode(error, 'P2002')) return res.status(409).json({ ok: false, error: 'Dữ liệu này đã tồn tại.' });
  if (isPrismaCode(error, 'P2025')) return res.status(404).json({ ok: false, error: 'Dữ liệu không khả dụng.' });
  console.error('API request failed.', error?.name || 'Error', error?.code || '');
  return res.status(500).json({ ok: false, error: 'Máy chủ chưa thể hoàn tất yêu cầu. Vui lòng thử lại sau.' });
}

module.exports = { notFound, errorHandler };
