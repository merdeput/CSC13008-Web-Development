function createAdminModel(db) {
  return {
    async overview() {
      const [dishCount, chefCount, ingredientCount, reservationCount] = await Promise.all([
        db.dish.count(), db.chef.count(), db.ingredient.count(), db.reservation.count()
      ]);
      return { dishCount, chefCount, ingredientCount, reservationCount };
    }
  };
}

module.exports = { createAdminModel };
