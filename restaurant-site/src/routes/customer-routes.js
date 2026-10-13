const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../lib/async-handler');
const { requireCsrf } = require('../middleware/csrf');
const { createCustomerController } = require('../controllers/customer-controller');

function createCustomerRouter(services) {
  const router = express.Router();
  const controller = createCustomerController(services);
  const reservationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(_req, res) {
      return res.status(429).render('errors/error', {
        pageTitle: 'Gửi yêu cầu quá nhanh', status: 429,
        message: 'Bạn đã gửi nhiều yêu cầu trong thời gian ngắn. Vui lòng đợi một lúc rồi thử lại.'
      });
    }
  });

  router.get('/', asyncHandler(controller.home));
  router.get('/menu', asyncHandler(controller.menu));
  router.get('/dishes/:id', asyncHandler(controller.dishDetail));
  router.get('/chefs', asyncHandler(controller.chefs));
  router.get('/reservations/new', controller.reservationForm);
  router.post('/reservations', reservationLimiter, requireCsrf, asyncHandler(controller.createReservation));
  return router;
}

module.exports = { createCustomerRouter };
