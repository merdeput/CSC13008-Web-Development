const { createDishService } = require('./dish-service');
const { createChefService } = require('./chef-service');
const { createIngredientService } = require('./ingredient-service');
const { createReservationService } = require('./reservation-service');
const { createAdminService } = require('./admin-service');

function createServices(models) {
  return {
    dishes: createDishService(models.dishes), chefs: createChefService(models.chefs),
    ingredients: createIngredientService(models.ingredients), reservations: createReservationService(models.reservations),
    admin: createAdminService(models.admin)
  };
}

module.exports = { createServices };
