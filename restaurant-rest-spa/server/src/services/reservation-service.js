const { HttpError, ValidationError, isPrismaCode } = require('../lib/errors');
const { isUuid, STATUSES, validateReservationInput, validateReservationFilters } = require('./validation');

const TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED: ['COMPLETED'], COMPLETED: [], CANCELLED: [], NO_SHOW: []
};

function createReservationService(model) {
  return {
    async create(input) {
      const { data, errors } = validateReservationInput(input);
      if (Object.keys(errors).length) throw new ValidationError(errors);
      return model.create({
        customerName: data.customerName, phone: data.phone, email: data.email, guestCount: data.guestCount,
        startsAt: data.startsAt, customerNote: data.customerNote
      });
    },
    listAdmin(query = {}) {
      const filters = validateReservationFilters(query);
      for (const key of ['status', 'from', 'to']) {
        if (query[key] && !filters[key]) throw new ValidationError({ [key]: 'Bộ lọc không hợp lệ.' });
      }
      if (filters.from && filters.to && filters.from > filters.to) throw new ValidationError({ to: 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.' });
      return model.listAdmin({ ...query, ...filters });
    },
    findById(id) { return isUuid(id) ? model.findById(id) : Promise.resolve(null); },
    upcoming(limit) { return model.upcoming(limit); },
    async update(id, input) {
      const { data, errors } = validateReservationInput(input, { admin: true });
      if (Object.keys(errors).length) throw new ValidationError(errors);
      const current = await model.findById(id);
      if (!current) return null;
      if (data.status !== current.status && !TRANSITIONS[current.status]?.includes(data.status)) {
        throw new HttpError(409, 'Trạng thái đặt bàn không thể chuyển theo yêu cầu.');
      }
      const result = await model.update(id, {
        customerName: data.customerName, phone: data.phone, email: data.email,
        guestCount: data.guestCount, startsAt: data.startsAt, status: data.status,
        customerNote: data.customerNote, adminNote: data.adminNote
      });
      if (result?.conflict) throw new HttpError(409, 'Yêu cầu đặt bàn vừa được cập nhật. Tải lại rồi thử lại.');
      return result?.reservation || null;
    },
    async remove(id) {
      try { await model.remove(id); return true; }
      catch (error) { if (isPrismaCode(error, 'P2025')) return false; throw error; }
    },
    count() { return model.count(); }
  };
}

module.exports = { createReservationService, TRANSITIONS };
