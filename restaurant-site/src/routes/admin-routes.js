const express = require('express');
const asyncHandler = require('../lib/async-handler');
const { requireCsrf } = require('../middleware/csrf');
const { createAdminController } = require('../controllers/admin-controller');

function createAdminRouter(services) {
  const router = express.Router();
  const controller = createAdminController(services);
  router.use((_req, res, next) => {
    res.locals.layout = 'layouts/admin';
    next();
  });

  router.get('/', asyncHandler(controller.overview));

  router.get('/dishes', asyncHandler(controller.dishList));
  router.get('/dishes/new', asyncHandler(controller.dishNew));
  router.post('/dishes', requireCsrf, asyncHandler(controller.dishCreate));
  router.get('/dishes/:id', asyncHandler(controller.dishDetail));
  router.get('/dishes/:id/edit', asyncHandler(controller.dishEdit));
  router.patch('/dishes/:id', requireCsrf, asyncHandler(controller.dishUpdate));
  router.get('/dishes/:id/delete', asyncHandler(controller.dishDeleteConfirm));
  router.delete('/dishes/:id', requireCsrf, asyncHandler(controller.dishDelete));

  router.get('/chefs', asyncHandler(controller.chefList));
  router.get('/chefs/new', asyncHandler(controller.chefNew));
  router.post('/chefs', requireCsrf, asyncHandler(controller.chefCreate));
  router.get('/chefs/:id', asyncHandler(controller.chefDetail));
  router.get('/chefs/:id/edit', asyncHandler(controller.chefEdit));
  router.patch('/chefs/:id', requireCsrf, asyncHandler(controller.chefUpdate));
  router.get('/chefs/:id/delete', asyncHandler(controller.chefDeleteConfirm));
  router.delete('/chefs/:id', requireCsrf, asyncHandler(controller.chefDelete));

  router.get('/ingredients', asyncHandler(controller.ingredientList));
  router.get('/ingredients/new', asyncHandler(controller.ingredientNew));
  router.post('/ingredients', requireCsrf, asyncHandler(controller.ingredientCreate));
  router.get('/ingredients/:id/edit', asyncHandler(controller.ingredientEdit));
  router.patch('/ingredients/:id', requireCsrf, asyncHandler(controller.ingredientUpdate));
  router.get('/ingredients/:id/delete', asyncHandler(controller.ingredientDeleteConfirm));
  router.delete('/ingredients/:id', requireCsrf, asyncHandler(controller.ingredientDelete));
  router.get('/ingredients/:id', asyncHandler(controller.ingredientDetail));

  router.get('/reservations', asyncHandler(controller.reservationList));
  router.get('/reservations/:id', asyncHandler(controller.reservationDetail));
  router.get('/reservations/:id/edit', asyncHandler(controller.reservationEdit));
  router.patch('/reservations/:id', requireCsrf, asyncHandler(controller.reservationUpdate));
  router.get('/reservations/:id/delete', asyncHandler(controller.reservationDeleteConfirm));
  router.delete('/reservations/:id', requireCsrf, asyncHandler(controller.reservationDelete));
  return router;
}

module.exports = { createAdminRouter };
