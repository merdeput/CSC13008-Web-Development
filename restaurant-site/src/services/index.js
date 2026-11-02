const { createDishService } = require('./dish-service');
const { createCategoryService } = require('./category-service');
const { createChefService } = require('./chef-service');
const { createIngredientService } = require('./ingredient-service');
const { createReservationService } = require('./reservation-service');
const { createAdminService } = require('./admin-service');
const { createAuthService } = require('./auth-service');

function createServices(db) {
  return {
    dishes: createDishService(db),
    categories: createCategoryService(db),
    chefs: createChefService(db),
    ingredients: createIngredientService(db),
    reservations: createReservationService(db),
    admin: createAdminService(db),
    auth: createAuthService(db)
  };
}

module.exports = { createServices };
