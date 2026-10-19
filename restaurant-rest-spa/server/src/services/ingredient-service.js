const { HttpError, ValidationError, isPrismaCode, isUniqueFieldError } = require('../lib/errors');
const { isUuid, validateIngredientInput } = require('./validation');

function createIngredientService(model) {
  async function clean(input) {
    const { data, errors } = validateIngredientInput(input);
    if (Object.keys(errors).length) throw new ValidationError(errors);
    return data;
  }
  return {
    listAdmin(query) { return model.listAdmin(query); },
    findById(id) { return isUuid(id) ? model.findById(id) : Promise.resolve(null); },
    async create(input) {
      const data = await clean(input);
      try { return await model.create(data); }
      catch (error) { if (isUniqueFieldError(error, 'name')) throw new ValidationError({ name: 'Tên nguyên liệu này đã tồn tại.' }); throw error; }
    },
    async update(id, input) {
      const data = await clean(input);
      try { return await model.update(id, data); }
      catch (error) {
        if (isPrismaCode(error, 'P2025')) return null;
        if (isUniqueFieldError(error, 'name')) throw new ValidationError({ name: 'Tên nguyên liệu này đã tồn tại.' });
        throw error;
      }
    },
    async remove(id) {
      try { await model.remove(id); return true; }
      catch (error) {
        if (isPrismaCode(error, 'P2025')) return false;
        if (isPrismaCode(error, 'P2003')) throw new HttpError(409, 'Không thể xóa nguyên liệu đang được dùng trong một món ăn.');
        throw error;
      }
    }
  };
}

module.exports = { createIngredientService };
