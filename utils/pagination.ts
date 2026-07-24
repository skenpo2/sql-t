import type { Request } from 'express';

export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Parse ?page & ?limit from a request, clamped to sane bounds. */
export function getPagination(req: Request): Pagination {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? ''), 10) || 1);
  const rawLimit =
    Number.parseInt(String(req.query.limit ?? ''), 10) || DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit));
  return { page, limit, offset: (page - 1) * limit };
}

/** Wrap a page of rows with pagination metadata. */
export function paginated<T>(data: T[], total: number, p: Pagination) {
  return {
    data,
    pagination: {
      page: p.page,
      limit: p.limit,
      total,
      totalPages: Math.ceil(total / p.limit),
    },
  };
}
