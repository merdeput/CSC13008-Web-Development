const { HttpError } = require('../lib/errors');
const { isUuid } = require('../services/validation');

const NOT_FOUND_MESSAGE = 'Dữ liệu không khả dụng.';

function idOrNotFound(value) {
  if (!isUuid(value)) throw new HttpError(404, NOT_FOUND_MESSAGE);
  return value;
}

function notFoundIfEmpty(value) {
  if (!value) throw new HttpError(404, NOT_FOUND_MESSAGE);
  return value;
}

function createAdminHandlers(services) {
  const sendList = (getData) => async (req, res) => res.json({ ok: true, data: await getData(req) });
  const sendOne = (getData) => async (req, res) => res.json({ ok: true, data: notFoundIfEmpty(await getData(idOrNotFound(req.params.id))) });
  const createOne = (create) => async (req, res) => res.status(201).json({ ok: true, data: await create(req.body || {}) });
  const updateOne = (update) => async (req, res) => res.json({ ok: true, data: notFoundIfEmpty(await update(idOrNotFound(req.params.id), req.body || {})) });
  const deleteOne = (remove) => async (req, res) => {
    if (!await remove(idOrNotFound(req.params.id))) throw new HttpError(404, NOT_FOUND_MESSAGE);
    return res.json({ ok: true, data: { deleted: true } });
  };

  return {
    overview: sendList(async () => {
      const [counts, upcoming] = await Promise.all([services.admin.overview(), services.reservations.upcoming(8)]);
      return { counts, upcoming };
    }),
    dishList: sendList((req) => services.dishes.listAdmin(req.query)),
    dishOptions: sendList(() => services.dishes.formOptions()),
    dishDetail: sendOne((id) => services.dishes.findById(id)),
    dishCreate: createOne((data) => services.dishes.create(data)),
    dishUpdate: updateOne((id, data) => services.dishes.update(id, data)),
    dishDelete: deleteOne((id) => services.dishes.remove(id)),
    chefList: sendList((req) => services.chefs.listAdmin(req.query)),
    chefOptions: sendList(() => services.chefs.formOptions()),
    chefDetail: sendOne((id) => services.chefs.findById(id)),
    chefCreate: createOne((data) => services.chefs.create(data)),
    chefUpdate: updateOne((id, data) => services.chefs.update(id, data)),
    chefDelete: deleteOne((id) => services.chefs.remove(id)),
    ingredientList: sendList((req) => services.ingredients.listAdmin(req.query)),
    ingredientDetail: sendOne((id) => services.ingredients.findById(id)),
    ingredientCreate: createOne((data) => services.ingredients.create(data)),
    ingredientUpdate: updateOne((id, data) => services.ingredients.update(id, data)),
    ingredientDelete: deleteOne((id) => services.ingredients.remove(id)),
    reservationList: sendList((req) => services.reservations.listAdmin(req.query)),
    reservationDetail: sendOne((id) => services.reservations.findById(id)),
    reservationUpdate: updateOne((id, data) => services.reservations.update(id, data)),
    reservationDelete: deleteOne((id) => services.reservations.remove(id))
  };
}

module.exports = { createAdminHandlers };
