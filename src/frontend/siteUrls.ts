/**
 * External site URLs for cross-linking (e.g. randomizer subdomain).
 * Set VITE_RANDOMIZER_URL when building for production with a custom subdomain.
 */
export function getRandomizerUrl(): string {
  const url = import.meta.env.VITE_RANDOMIZER_URL;
  if (typeof url === 'string' && url.trim()) {
    return url.trim().replace(/\/$/, '');
  }
  return 'https://thesuperrl.github.io/arknights-randomizer';
}
