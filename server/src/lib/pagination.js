export function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function buildWhere(conditions) {
  const active = conditions.filter(([, value]) => value !== undefined && value !== null && value !== '');
  return {
    clause: active.length ? `WHERE ${active.map(([sql]) => sql).join(' AND ')}` : '',
    params: active.map(([, value]) => value),
  };
}
