/** Standard API response envelope */
export interface ApiResponse<T> {
  data: T
  meta?: PaginationMeta
}

export interface PaginationMeta {
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface PaginationQuery {
  page?: number
  pageSize?: number
}

/** Every service operation that writes data receives this context */
export interface RequestContext {
  tenantId: string
  userId: string
  ipAddress?: string
  userAgent?: string
}

/** Standard error shape returned by the API */
export interface ApiError {
  code: string
  message: string
  field?: string
  details?: unknown
}

export type SortOrder = 'asc' | 'desc'
