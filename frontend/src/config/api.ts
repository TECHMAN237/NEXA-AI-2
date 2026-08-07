/**
 * Centralized API configuration for XENA AI frontend
 */

const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    let clean = envUrl.trim().replace(/\/$/, '');
    if (clean.endsWith('/api')) {
      clean = clean.slice(0, -4);
    }
    // On Vercel deployment with vercel.json rewrite, prefer relative paths to avoid cross-origin issues
    if (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app')) {
      return '';
    }
    return clean;
  }
  return '';
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * Normalizes an API endpoint path to include the base URL if configured.
 * Example: getApiUrl('/api/reminders') => 'https://nexa-ai-2-eo01.onrender.com/api/reminders' (if VITE_API_URL set)
 * or '/api/reminders' (if relative/vercel rewrite)
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
 * Standard fetch wrapper that applies API base URL and common headers.
 */
export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = getApiUrl(endpoint);
  const headers = new Headers(options.headers || {});

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
