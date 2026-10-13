const crypto = require('node:crypto');
const { HttpError, isPrismaCode, isUniqueFieldError } = require('../lib/errors');
const { PAGE_SIZE, getPage, pageResult } = require('./pagination');
const { getAdminSort } = require('./admin-list-sorting');

const TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: []
};

const reservationAdminSorts = {
  referenceCode: (direction) => [{ referenceCode: direction }, { id: 'asc' }],
  customerName: (direction) => [{ customerName: direction }, { id: 'asc' }],
  startsAt: (direction) => [{ startsAt: direction }, { createdAt: 'desc' }, { id: 'asc' }],
  guestCount: (direction) => [{ guestCount: direction }, { startsAt: 'desc' }, { id: 'asc' }],
  status: (direction) => [{ status: direction }, { startsAt: 'desc' }, { id: 'asc' }]
};

function canTransition(from, to) {
  return from === to || Boolean(TRANSITIONS[from] && TRANSITIONS[from].includes(to));
}

function createReferenceCode() {
  return `BH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function createReservationService(db) {
  async function create(data) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        return await db.reservation.create({
          data: {
            referenceCode: createReferenceCode(),
            customerName: data.customerName,
            phone: data.phone,
            email: data.email,
            guestCount: data.guestCount,
            startsAt: data.startsAt,
            status: 'PENDING',
            customerNote: data.customerNote
          }
        });
      } catch (error) {
        if (isUniqueFieldError(error, 'referenceCode') && attempt < 5) continue;
        throw error;
      }
    }
    throw new HttpError(409, 'Không thể tạo mã yêu cầu. Vui lòng gửi lại sau.');
  }

  async function update(id, data) {
    return db.$transaction(async (tx) => {
      const current = await tx.reservation.findUnique({ where: { id } });
      if (!current) return null;
      if (!canTransition(current.status, data.status)) {
        return { conflict: true, current };
      }
      const result = await tx.reservation.updateMany({
        where: { id, status: current.status },
        data: {
          customerName: data.customerName,
          phone: data.phone,
          email: data.email,
          guestCount: data.guestCount,
          startsAt: data.startsAt,
          status: data.status,
          customerNote: data.customerNote,
          adminNote: data.adminNote
        }
      });
      if (!result.count) return { conflict: true, current: await tx.reservation.findUnique({ where: { id } }) };
      return { reservation: await tx.reservation.findUnique({ where: { id } }) };
    });
  }

  return {
    create,
    update,
    async listAdmin({ page = 1, status = '', from = '', to = '', sortBy, sortDirection } = {}) {
      const current = getPage({ page });
      const sort = getAdminSort({ sortBy, sortDirection }, reservationAdminSorts, 'startsAt', 'desc');
      const where = {};
      if (status) where.status = status;
      if (from || to) {
        where.startsAt = {};
        if (from) where.startsAt.gte = new Date(`${from}T00:00:00+07:00`);
        if (to) where.startsAt.lt = new Date(`${to}T00:00:00+07:00`);
      }
      const [items, total] = await Promise.all([
        db.reservation.findMany({ where, orderBy: sort.orderBy, skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE }),
        db.reservation.count({ where })
      ]);
      return { ...pageResult(items, total, current), filters: { status, from, to }, sortBy: sort.sortBy, sortDirection: sort.sortDirection };
    },
    findById(id) {
      return db.reservation.findUnique({ where: { id } });
    },
    async upcoming(limit = 8) {
      return db.reservation.findMany({
        where: { startsAt: { gte: new Date() }, status: { in: ['PENDING', 'CONFIRMED'] } },
        orderBy: { startsAt: 'asc' }, take: limit
      });
    },
    count() {
      return db.reservation.count();
    },
    remove(id) {
      return db.reservation.delete({ where: { id } }).then(() => true).catch((error) => {
        if (isPrismaCode(error, 'P2025')) return false;
        throw error;
      });
    }
  };
}

module.exports = { createReservationService, canTransition, TRANSITIONS };
