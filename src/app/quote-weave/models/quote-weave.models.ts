export type QuoteAttributionStatus = 'sourced' | 'reported' | 'unverified';

/**
 * Citation fields stay structured so the collection can add URLs, editions,
 * translators, and page references without changing the quote contract again.
 * `citation` is the exact short line rendered in the reader today.
 */
export interface QuoteSource {
  citation: string;
  title?: string;
  year?: number;
  url?: string;
  translator?: string;
  locator?: string;
  note?: string;
}

export interface Quote {
  /** Stable identity. Never derive this again after the record is committed. */
  id: string;
  /** Stable author identity shared by every quote from the same author. */
  authorId: string;
  text: string;
  author: string;
  category: string;
  attributionStatus: QuoteAttributionStatus;
  source?: QuoteSource;
}

export interface FavoriteQuote extends Quote {
  savedAt: number; // Date.now() timestamp
}

export interface QuoteWeaveSettings {
  typingSpeedMs: number; // 80 | 50 | 25
  autoAdvance: boolean;
}

export const DEFAULT_SETTINGS: QuoteWeaveSettings = {
  typingSpeedMs: 50,
  autoAdvance: false,
};
