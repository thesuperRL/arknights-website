/**
 * API base URL for requests. Empty string = same origin (local dev with proxy).
 * Set VITE_API_BASE when building for GitHub Pages (e.g. https://your-backend.onrender.com).
 */
export function getApiBase(): string {
  const base = import.meta.env.VITE_API_BASE;
  return typeof base === 'string' ? base.replace(/\/$/, '') : '';
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
 * Resolve image path for img src. When API base is set (e.g. GitHub Pages),
 * images are loaded from the backend so operator images work.
 */
export function getImageUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith('http')) return path;
  const base = getApiBase();
  return base ? base + (path.startsWith('/') ? path : '/' + path) : path;
}
