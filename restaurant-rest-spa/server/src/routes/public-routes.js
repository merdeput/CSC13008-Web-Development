const express = require('express');
const rateLimit = require('express-rate-limit');
const { createPublicHandlers } = require('../handlers/public-handlers');
const asyncHandler = require('../lib/async-handler');

function createPublicRouter(services) {
  const router = express.Router();
  const handlers = createPublicHandlers(services);
  const reservationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
    handler(_req, res) { return res.status(429).json({ ok: false, error: 'Bạn đã gửi nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau.' }); }
  });
  router.get('/home', asyncHandler(handlers.home));
  router.get('/menu', asyncHandler(handlers.menu));
  router.get('/dishes/:id', asyncHandler(handlers.dish));
  router.get('/chefs', asyncHandler(handlers.chefs));
  router.get('/config', handlers.config);
  router.post('/reservations', reservationLimiter, asyncHandler(handlers.createReservation));
  return router;
}

module.exports = { createPublicRouter };
