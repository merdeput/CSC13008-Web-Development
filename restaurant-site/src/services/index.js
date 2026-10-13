const { createDishService } = require('./dish-service');
const { createChefService } = require('./chef-service');
const { createIngredientService } = require('./ingredient-service');
const { createReservationService } = require('./reservation-service');
const { createAdminService } = require('./admin-service');

function createServices(db) {
  return {
    dishes: createDishService(db),
    chefs: createChefService(db),
    ingredients: createIngredientService(db),
    reservations: createReservationService(db),
    admin: createAdminService(db)
  };
}

module.exports = { createServices };
