export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
}

export interface PaginationParams {
  page?: number;
  page_size?: number;
}
