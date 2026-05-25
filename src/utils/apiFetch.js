/**
 * apiFetch — drop-in replacement for fetch() that automatically injects the
 * JWT Bearer token for any request to the OncoCast backend.
 *
 * Usage: replace `fetch(url, options)` with `apiFetch(url, options)` in any
 * component that calls /api/ endpoints.  No React context needed — reads the
 * token directly from localStorage (same key used by authStore).
 */

const TOKEN_KEY = "oncocast_token";

export function apiFetch(url, init = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  return fetch(url, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}
