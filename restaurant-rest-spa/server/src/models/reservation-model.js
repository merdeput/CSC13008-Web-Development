const crypto = require('node:crypto');
const { PAGE_SIZE, getPage, pageResult } = require('../services/pagination');
const { getAdminSort } = require('../services/admin-list-sorting');

const reservationAdminSorts = {
  referenceCode: (direction) => [{ referenceCode: direction }, { id: 'asc' }],
  customerName: (direction) => [{ customerName: direction }, { id: 'asc' }],
  startsAt: (direction) => [{ startsAt: direction }, { createdAt: 'desc' }, { id: 'asc' }],
  guestCount: (direction) => [{ guestCount: direction }, { startsAt: 'desc' }, { id: 'asc' }],
  status: (direction) => [{ status: direction }, { startsAt: 'desc' }, { id: 'asc' }]
};

function referenceCode() { return `BH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; }

function createReservationModel(db) {
  return {
    async create(data) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          return await db.reservation.create({ data: { ...data, referenceCode: referenceCode(), status: 'PENDING' } });
        } catch (error) {
          if (error?.code !== 'P2002' || attempt === 5) throw error;
        }
      }
    },
    async listAdmin(query = {}) {
      const page = getPage(query);
      const sort = getAdminSort(query, reservationAdminSorts, 'startsAt', 'desc');
      const where = {};
      if (query.status) where.status = query.status;
      if (query.from || query.to) {
        where.startsAt = {};
        if (query.from) where.startsAt.gte = new Date(`${query.from}T00:00:00+07:00`);
        if (query.to) where.startsAt.lt = new Date(`${query.to}T00:00:00+07:00`);
      }
      const [items, total] = await Promise.all([
        db.reservation.findMany({ where, orderBy: sort.orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
        db.reservation.count({ where })
      ]);
      return { ...pageResult(items, total, page), filters: { status: query.status || '', from: query.from || '', to: query.to || '' }, sortBy: sort.sortBy, sortDirection: sort.sortDirection };
    },
    findById(id) { return db.reservation.findUnique({ where: { id } }); },
    async upcoming(limit = 8) {
      return db.reservation.findMany({ where: { startsAt: { gte: new Date() }, status: { in: ['PENDING', 'CONFIRMED'] } }, orderBy: { startsAt: 'asc' }, take: limit });
    },
    async update(id, data) {
      return db.$transaction(async (tx) => {
        const current = await tx.reservation.findUnique({ where: { id } });
        if (!current) return null;
        const updated = await tx.reservation.updateMany({ where: { id, status: current.status }, data });
        if (!updated.count) return { conflict: true };
        return { reservation: await tx.reservation.findUnique({ where: { id } }) };
      });
    },
    remove(id) { return db.reservation.delete({ where: { id } }); },
    count() { return db.reservation.count(); }
  };
}

module.exports = { createReservationModel };
