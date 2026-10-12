function createAdminService(db) {
  return {
    async overview() {
      const [dishCount, chefCount, reservationCount] = await Promise.all([
        db.dish.count(), db.chef.count(), db.reservation.count()
      ]);
      return { dishCount, chefCount, reservationCount };
    }
  };
}

module.exports = { createAdminService };
