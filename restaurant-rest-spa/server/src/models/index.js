const { createDishModel } = require('./dish-model');
const { createChefModel } = require('./chef-model');
const { createIngredientModel } = require('./ingredient-model');
const { createReservationModel } = require('./reservation-model');
const { createAdminModel } = require('./admin-model');
const { createCategoryModel } = require('./category-model');

function createModels(db) {
  return {
    dishes: createDishModel(db), chefs: createChefModel(db), ingredients: createIngredientModel(db),
    reservations: createReservationModel(db), admin: createAdminModel(db), categories: createCategoryModel(db)
  };
}

module.exports = { createModels };
