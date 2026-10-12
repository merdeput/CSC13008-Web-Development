const { HttpError } = require('../lib/errors');

function notFound(req, res) {
  res.status(404).render('errors/error', {
    pageTitle: 'Không tìm thấy trang',
    status: 404,
    message: 'Trang bạn tìm không có ở đây.'
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) {
    return res.status(error.status).render('errors/error', {
      pageTitle: error.status === 404 ? 'Không tìm thấy' : 'Yêu cầu chưa hoàn tất',
      status: error.status,
      message: error.message
    });
  }

  if (error && error.type === 'entity.too.large') {
    return res.status(413).render('errors/error', {
      pageTitle: 'Biểu mẫu quá lớn', status: 413, message: 'Nội dung gửi lên vượt quá giới hạn cho phép.'
    });
  }
  if (error && error.code === 'P2025') {
    return res.status(404).render('errors/error', {
      pageTitle: 'Không tìm thấy', status: 404, message: 'Dữ liệu cần thao tác không còn tồn tại.'
    });
  }
  if (error && error.code === 'P2003') {
    return res.status(400).render('errors/error', {
      pageTitle: 'Dữ liệu đang được sử dụng', status: 400,
      message: 'Không thể thực hiện thao tác vì dữ liệu này đang được liên kết với món ăn khác.'
    });
  }

  console.error('Request failed:', error && error.message ? error.message : error);
  res.status(500).render('errors/error', {
    pageTitle: 'Có lỗi xảy ra',
    status: 500,
    message: 'Máy chủ chưa thể hoàn tất yêu cầu. Hãy kiểm tra cấu hình cơ sở dữ liệu hoặc thử lại sau.'
  });
}

module.exports = { notFound, errorHandler };
