function createAdminService(model) {
  return { overview() { return model.overview(); } };
}

module.exports = { createAdminService };
