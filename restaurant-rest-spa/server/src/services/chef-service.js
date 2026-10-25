const { HttpError, ValidationError, isPrismaCode } = require('../lib/errors');
const { isUuid, validateChefInput } = require('./validation');


function createChefService(model) {
  return {
    listPublished() { return model.listPublished(); },
    listAdmin(query) { return model.listAdmin(query); },
    formOptions() { return model.formOptions(); },
    async findById(id) { return isUuid(id) ? model.findById(id) : null; },
    async create(input) {
      const { data, errors } = validateChefInput(input);
      if (Object.keys(errors).length) throw new ValidationError(errors);
      if (data.dishIds?.length && await model.countDishesByIds(data.dishIds) !== data.dishIds.length) {
        throw new ValidationError({ dishIds: 'Một hoặc nhiều món đã không còn khả dụng.' });
      }
      return model.create(data);
    },
    async update(id, input) {
      const { data, errors } = validateChefInput(input);
      if (Object.keys(errors).length) throw new ValidationError(errors);
      if (data.dishIds?.length && await model.countDishesByIds(data.dishIds) !== data.dishIds.length) {
        throw new ValidationError({ dishIds: 'Một hoặc nhiều món đã không còn khả dụng.' });
      }
      try { return await model.update(id, data); }
      catch (error) { if (isPrismaCode(error, 'P2025')) return null; throw error; }
    },
    async remove(id) {
      try { await model.remove(id); return true; }
      catch (error) { if (isPrismaCode(error, 'P2025')) return false; if (isPrismaCode(error, 'P2003')) throw new HttpError(409, 'Không thể xóa dữ liệu đang được sử dụng.'); throw error; }
    }
  };
}

module.exports = { createChefService };
