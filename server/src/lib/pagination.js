const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function readPagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requested = Number.parseInt(query.pageSize, 10) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requested));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

export function pagedResult(rows, total, { page, pageSize }) {
  return { data: rows, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
