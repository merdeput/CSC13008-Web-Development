const { createDishService } = require('./dish-service');
const { createChefService } = require('./chef-service');
const { createReservationService } = require('./reservation-service');
const { createAdminService } = require('./admin-service');

function createServices(db) {
  return {
    dishes: createDishService(db),
    chefs: createChefService(db),
    reservations: createReservationService(db),
    admin: createAdminService(db)
  };
}

module.exports = { createServices };
