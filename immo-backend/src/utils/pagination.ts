import type { PaginationMeta, PaginationQuery } from '../types/common.js'

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

export function parsePagination(query: PaginationQuery): { skip: number; take: number; page: number; pageSize: number } {
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE))
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
    page,
    pageSize,
  }
}

export function buildMeta(total: number, page: number, pageSize: number): PaginationMeta {
  return {
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}
