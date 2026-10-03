/**
 * Centralized API configuration and resilient fetch wrapper for XENA AI frontend
 */

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // Always use same-origin relative paths on AI Studio Cloud Run (*.run.app), Vercel, or localhost
    if (
      host.endsWith('.run.app') ||
      host.endsWith('vercel.app') ||
      host === 'localhost' ||
      host === '127.0.0.1'
    ) {
      return '';
    }
  }

  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    let clean = envUrl.trim().replace(/\/$/, '');
    if (clean.endsWith('/api')) {
      clean = clean.slice(0, -4);
    }
    return clean;
  }
  return '';
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * Normalizes an API endpoint path to include the base URL if configured.
 */
export function getApiUrl(endpoint: string): string {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    return path;
  }
  return `${baseUrl}${path}`;
}

/**
 * Resilient fetch wrapper that applies API base URL, common headers, and automatic
 * retry on transient network errors (e.g., 'Failed to fetch' during server restarts).
 */
export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
  maxRetries: number = 3
): Promise<Response> {
  const url = getApiUrl(endpoint);
  const headers = new Headers(options.headers || {});

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const retryDelays = [350, 750, 1400];
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url, {
        ...options,
        headers,
      });
    } catch (err: any) {
      lastError = err;
      if (options.signal?.aborted || attempt === maxRetries) {
        throw err;
      }
      const delay = retryDelays[attempt] || 1500;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
