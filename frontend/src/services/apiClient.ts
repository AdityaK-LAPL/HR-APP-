import type { ApiErrorResponse } from '@/types/api';

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code: string = 'unknown_error', status: number = 500, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// Read non-httpOnly csrf_token cookie set by FastAPI backend on login/refresh
export function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const API_BASE = '/api/v1';

// Toggle mock mode state in localStorage or memory
export const isMockModeActive = (): boolean => {
  const stored = localStorage.getItem('opsflow_mock_mode');
  if (stored !== null) return stored === 'true';
  // Default to true for now since backend Postgres is pending connection
  return true;
};

export const setMockModeActive = (active: boolean): void => {
  localStorage.setItem('opsflow_mock_mode', active ? 'true' : 'false');
};

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined | null>;
}

export async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, headers: customHeaders, ...fetchOptions } = options;

  let url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const method = (fetchOptions.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  if (fetchOptions.body && typeof fetchOptions.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Include X-CSRF-Token for state-changing requests per docs/api-contract.md
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const response = await fetch(url, {
    ...fetchOptions,
    method,
    headers,
    credentials: 'include', // Cookie auth
  });

  if (!response.ok) {
    let errorData: ApiErrorResponse | null = null;
    try {
      errorData = await response.json();
    } catch {
      // Non-JSON response
    }

    const code = errorData?.error?.code || `http_${response.status}`;
    const message = errorData?.error?.message || `Request failed with status ${response.status}`;
    throw new ApiError(message, code, response.status);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const apiClient = {
  get: <T>(endpoint: string, options?: RequestOptions) => 
    apiRequest<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string, options?: RequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: 'DELETE' }),
};
