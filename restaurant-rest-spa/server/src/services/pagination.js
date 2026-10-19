const PAGE_SIZE = 10;

function getPage(query = {}) {
  const value = Number.parseInt(query.page, 10);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 100000) : 1;
}

function pageResult(items, total, page, pageSize = PAGE_SIZE) {
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

module.exports = { PAGE_SIZE, getPage, pageResult };
