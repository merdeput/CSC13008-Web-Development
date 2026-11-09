const { createDishService } = require('./dish-service');
const { createChefService } = require('./chef-service');
const { createIngredientService } = require('./ingredient-service');
const { createReservationService } = require('./reservation-service');
const { createAdminService } = require('./admin-service');
const { createCategoryService } = require('./category-service');
const { createAuthService } = require('../../../../shared/auth/auth-service');

function createServices(models, options = {}) {
  const db = options.db || models.db;
  return {
    dishes: createDishService(models.dishes), chefs: createChefService(models.chefs),
    ingredients: createIngredientService(models.ingredients), reservations: createReservationService(models.reservations),
    admin: createAdminService(models.admin), categories: createCategoryService(models.categories),
    auth: createAuthService(db, options.authOptions)
  };
}

module.exports = { createServices };
