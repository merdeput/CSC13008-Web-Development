const express = require('express');
const { createAdminHandlers } = require('../handlers/admin-handlers');
const asyncHandler = require('../lib/async-handler');

function createAdminRouter(services) {
  const router = express.Router();
  const h = createAdminHandlers(services);
  const wrap = (handler) => asyncHandler(handler);

  router.get('/dashboard', wrap(h.overview));

  router.get('/dishes/options', wrap(h.dishOptions));
  router.get('/dishes', wrap(h.dishList));
  router.post('/dishes', wrap(h.dishCreate));
  router.get('/dishes/:id', wrap(h.dishDetail));
  router.patch('/dishes/:id', wrap(h.dishUpdate));
  router.delete('/dishes/:id', wrap(h.dishDelete));

  router.get('/chefs/options', wrap(h.chefOptions));
  router.get('/chefs', wrap(h.chefList));
  router.post('/chefs', wrap(h.chefCreate));
  router.get('/chefs/:id', wrap(h.chefDetail));
  router.patch('/chefs/:id', wrap(h.chefUpdate));
  router.delete('/chefs/:id', wrap(h.chefDelete));

  router.get('/ingredients', wrap(h.ingredientList));
  router.post('/ingredients', wrap(h.ingredientCreate));
  router.get('/ingredients/:id', wrap(h.ingredientDetail));
  router.patch('/ingredients/:id', wrap(h.ingredientUpdate));
  router.delete('/ingredients/:id', wrap(h.ingredientDelete));

  router.get('/reservations', wrap(h.reservationList));
  router.get('/reservations/:id', wrap(h.reservationDetail));
  router.patch('/reservations/:id', wrap(h.reservationUpdate));
  router.delete('/reservations/:id', wrap(h.reservationDelete));
  return router;
}

module.exports = { createAdminRouter };
