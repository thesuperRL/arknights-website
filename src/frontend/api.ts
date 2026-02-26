/**
 * API base URL for requests. Empty string = same origin (local dev with proxy).
 * Set VITE_API_BASE when building for GitHub Pages (e.g. https://your-backend.onrender.com).
 * In dev, when unset, use backend directly (http://localhost:3000) to avoid proxy 404s.
 */
export function getApiBase(): string {
  const base = import.meta.env.VITE_API_BASE;
  if (typeof base === 'string' && base) return base.replace(/\/$/, '');
  if (import.meta.env.DEV) return 'http://localhost:3000';
  return '';
}

/**
 * Fetch with API base URL and credentials for cross-origin (GitHub Pages) auth.
 */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = input.startsWith('http') ? input : getApiBase() + input;
  return fetch(url, {
    ...init,
    credentials: 'include',
  });
}

/**
 * Resolve image path for img src.
 * - When API base is set (e.g. separate backend), images are loaded from the backend.
 * - When same origin (e.g. production with base path like /arknights-website/), prefix
 *   with BASE_URL so /images/... becomes /arknights-website/images/... and does not 404.
 */
export function getImageUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith('http')) return path;
  const apiBase = getApiBase();
  if (apiBase) return apiBase + (path.startsWith('/') ? path : '/' + path);
  const baseUrl = (typeof import.meta.env.BASE_URL === 'string' && import.meta.env.BASE_URL) || '';
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  return baseUrl ? baseUrl + (baseUrl.endsWith('/') ? '' : '/') + normalized : path;
}
