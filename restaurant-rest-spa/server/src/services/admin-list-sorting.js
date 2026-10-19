function getAdminSort(query, fields, defaultSortBy, defaultDirection) {
  const requestedSort = typeof query.sortBy === 'string' ? query.sortBy : '';
  const sortBy = Object.prototype.hasOwnProperty.call(fields, requestedSort) ? requestedSort : defaultSortBy;
  const requestedDirection = typeof query.sortDirection === 'string' ? query.sortDirection : '';
  const sortDirection = ['asc', 'desc'].includes(requestedDirection) ? requestedDirection : defaultDirection;
  return { sortBy, sortDirection, orderBy: fields[sortBy](sortDirection) };
}

function queryString(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

function getAdminSearch(value) {
  if (typeof value !== 'string') return '';
  return Array.from(value.trim()).slice(0, 100).join('');
}

function createSortLinks({ basePath, sortBy, sortDirection, fields, preserve = {} }) {
  return Object.fromEntries(fields.map((field) => {
    const direction = field === sortBy && sortDirection === 'asc' ? 'desc' : 'asc';
    const query = queryString({ ...preserve, sortBy: field, sortDirection: direction });
    return [field, `${basePath}?${query}`];
  }));
}

function createPaginationQuery(sortBy, sortDirection, preserve = {}) {
  return queryString({ ...preserve, sortBy, sortDirection });
}

function createListControls(basePath, sort, fields, preserve = {}) {
  return {
    sortBy: sort.sortBy,
    sortDirection: sort.sortDirection,
    sortLinks: createSortLinks({ basePath, ...sort, fields, preserve }),
    paginationQuery: createPaginationQuery(sort.sortBy, sort.sortDirection, preserve)
  };
}

module.exports = { getAdminSort, getAdminSearch, createListControls, createPaginationQuery };
