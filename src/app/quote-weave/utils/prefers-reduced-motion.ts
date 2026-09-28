/**
 * Synchronous check for the user's prefers-reduced-motion preference.
 * Safe to call from non-DOM contexts (returns false during SSR-style guards).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
