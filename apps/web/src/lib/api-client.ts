import type { ApiErrorBody } from '@readycircle/contracts';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ApiErrorBody['error']['details'],
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/**
 * All requests are made with relative paths (`/api/v1/...`, `/health/...`)
 * so the same code works in development (via the Vite dev-server proxy,
 * see vite.config.ts) and in production (via the Nginx reverse proxy) --
 * the browser never needs to know the API's real host or port.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Only declare a JSON content type when there is actually a body:
  // Fastify rejects bodyless requests that claim `application/json`
  // (FST_ERR_CTP_EMPTY_JSON_BODY), which broke POSTs like publish/regenerate.
  const contentType: Record<string, string> = init.body != null ? { 'Content-Type': 'application/json' } : {};
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { ...contentType, ...init.headers },
  });

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Response body was not JSON; fall through to the generic error below.
    }
    throw new ApiClientError(
      response.status,
      body?.error.code ?? 'unknown_error',
      body?.error.message ?? response.statusText,
      body?.error.details,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
