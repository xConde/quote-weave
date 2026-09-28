/**
 * Phosphor Icons for Quote Weave
 * Lightweight SVG icons using Phosphor Icons design system
 * https://phosphoricons.com/
 *
 * Icons use fill="currentColor" for CSS color inheritance
 */

export type QuoteWeaveIconName =
  | 'pause'
  | 'arrow-down'
  | 'x'
  | 'heart'
  | 'heart-fill'
  | 'funnel'
  | 'share'
  | 'download'
  | 'sliders'
  | 'keyboard'
  | 'map';

/**
 * Get SVG markup for a Phosphor Icon
 * All icons use currentColor for theme compatibility
 */
export function getQuoteWeaveIcon(name: QuoteWeaveIconName, size = 20): string {
  // SECURITY: Validate and sanitize size parameter to prevent injection
  const safeSize = Math.max(1, Math.min(256, Math.floor(Number(size) || 20)));

  const icons: Record<QuoteWeaveIconName, string> = {
    // Pause - for paused indicator
    pause: `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 256 256" fill="currentColor"><path d="M216,48V208a16,16,0,0,1-16,16H160a16,16,0,0,1-16-16V48a16,16,0,0,1,16-16h40A16,16,0,0,1,216,48ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Z"/></svg>`,

    // Arrow Down - for resume button
    'arrow-down': `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,149.66l-72,72a8,8,0,0,1-11.32,0l-72-72a8,8,0,0,1,11.32-11.32L120,196.69V40a8,8,0,0,1,16,0V196.69l58.34-58.35a8,8,0,0,1,11.32,11.32Z"/></svg>`,

    // X - for close button
    x: `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>`,

    // Heart outline - for unfavorited state
    heart: `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 256 256" fill="currentColor"><path d="M178,32c-20.65,0-38.73,8.88-50,23.89C116.73,40.88,98.65,32,78,32A62.07,62.07,0,0,0,16,94c0,70,103.79,126.66,108.21,129a8,8,0,0,0,7.58,0C136.21,220.66,240,164,240,94A62.07,62.07,0,0,0,178,32Zm-50,174.8C109.74,196.16,32,147.69,32,94A46.06,46.06,0,0,1,78,48c19.45,0,35.78,10.36,42.6,27a8,8,0,0,0,14.8,0c6.82-16.67,23.15-27,42.6-27a46.06,46.06,0,0,1,46,46C224,147.61,146.27,196.15,128,206.8Z"/></svg>`,

    // Heart filled - for favorited state
    'heart-fill': `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 256 256" fill="currentColor"><path d="M240,94c0,70-103.79,126.66-108.21,129a8,8,0,0,1-7.58,0C119.79,220.66,16,164,16,94A62.07,62.07,0,0,1,78,32c20.65,0,38.73,8.88,50,23.89C139.27,40.88,157.35,32,178,32A62.07,62.07,0,0,1,240,94Z"/></svg>`,

    // Funnel - for category filter
    funnel: `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 256 256" fill="currentColor"><path d="M230.6,49.53A15.81,15.81,0,0,0,216,40H40A16,16,0,0,0,28.19,65.78l.09.10L96,139.21V208a16,16,0,0,0,24.87,13.32l32-21.34A16,16,0,0,0,160,186.67V139.21l67.74-73.43A15.8,15.8,0,0,0,230.6,49.53ZM143.94,128a8,8,0,0,0-1.94,5.21v53.46l-32,21.33V133.21a8,8,0,0,0-1.94-5.21L40,56H216Z"/></svg>`,

    // Share - for share button (Phosphor share-network)
    share: `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66,109.66l-48,48a8,8,0,0,1-11.32-11.32L204.69,112H165a88.21,88.21,0,0,0-85.23,65.31,8,8,0,0,1-15.5-4A104.27,104.27,0,0,1,165,96H204.69L170.34,61.66a8,8,0,0,1,11.32-11.32l48,48A8,8,0,0,1,229.66,109.66ZM192,208H40V88a8,8,0,0,0-16,0V216a8,8,0,0,0,8,8H192a8,8,0,0,0,0-16Z"/></svg>`,

    // Download - for download button (Phosphor download-simple)
    download: `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 256 256" fill="currentColor"><path d="M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z"/></svg>`,

    // Sliders - for reading controls / settings (Phosphor sliders-horizontal)
    sliders: `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 256 256" fill="currentColor"><path d="M40,88H73a32,32,0,0,0,62,0H216a8,8,0,0,0,0-16H135a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16Zm64-24A16,16,0,1,1,88,80,16,16,0,0,1,104,64ZM216,168H183a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16H121a32,32,0,0,0,62,0h33a8,8,0,0,0,0-16Zm-64,24a16,16,0,1,1,16-16A16,16,0,0,1,152,192Z"/></svg>`,

    // Keyboard - for keyboard shortcuts help (Phosphor keyboard)
    keyboard: `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 256 256" fill="currentColor"><path d="M224,48H32A16,16,0,0,0,16,64V192a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V64A16,16,0,0,0,224,48ZM32,192V64H224V192Zm32-96H80a8,8,0,0,1,0-16H64a8,8,0,0,1,0,16Zm48,0H112a8,8,0,0,1,0-16h16a8,8,0,0,1,0,16Zm48,0H160a8,8,0,0,1,0-16h16a8,8,0,0,1,0,16Zm48,0H208a8,8,0,0,1,0-16h16a8,8,0,0,1,0,16ZM64,136H80a8,8,0,0,1,0,16H64a8,8,0,0,1,0-16Zm48,0h16a8,8,0,0,1,0,16H112a8,8,0,0,1,0-16Zm48,0h16a8,8,0,0,1,0,16H160a8,8,0,0,1,0-16Zm48,0h16a8,8,0,0,1,0,16H208a8,8,0,0,1,0-16Zm-112,32h64a8,8,0,0,1,0,16H96a8,8,0,0,1,0-16Z"/></svg>`,

    // Map (folded map) — the Idea Map control. Phosphor "map-trifold".
    map: `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 256 256" fill="currentColor"><path d="M228.92,49.69a8,8,0,0,0-6.86-1.45L160.93,63.52,99.58,32.84a8,8,0,0,0-5.52-.6l-64,16A8,8,0,0,0,24,56V200a8,8,0,0,0,9.94,7.76l61.13-15.28,61.35,30.68A8,8,0,0,0,160,224a8.15,8.15,0,0,0,1.94-.24l64-16A8,8,0,0,0,232,200V56A8,8,0,0,0,228.92,49.69ZM104,52.94l48,24V203.06l-48-24ZM40,62.25l48-12v127.5l-48,12Zm176,131.5-48,12V78.25l48-12Z"/></svg>`,
  };

  return icons[name] || icons.pause;
}
