import { computed, Injectable, OnDestroy, signal, Signal, WritableSignal } from '@angular/core';
import { FavoriteQuote, Quote } from '../models/quote-weave.models';
import { validateQuoteRecord } from './quote-collection.service';

const STORAGE_KEY = 'quote-weave-favorites';

export type FavoritePersistence = 'durable' | 'session-only';
export type FavoriteLoadStatus = 'ready' | 'partial' | 'invalid' | 'unavailable';

/**
 * Favorite mutations always take effect for the current reader session. The
 * persistence field tells the caller whether that state also reached browser
 * storage and will survive a reload.
 */
export interface FavoriteMutationResult {
  favorited: boolean;
  persistence: FavoritePersistence;
  changed: boolean;
}

function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  // Convert to unsigned 32-bit and then to hex string
  return (hash >>> 0).toString(16);
}

function legacyQuoteId(text: string, author: string): string {
  return `quote-${hashString(text + '\x00' + author)}`;
}

function legacyAuthorId(author: string): string {
  const slug = author
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug ? `author-${slug}` : 'author-unknown';
}

@Injectable()
export class FavoritesService implements OnDestroy {
  readonly favoritesCount: WritableSignal<number> = signal(0);

  private readonly _loadStatus = signal<FavoriteLoadStatus>('ready');
  readonly loadStatus: Signal<FavoriteLoadStatus> = this._loadStatus.asReadonly();
  readonly loadWarning = computed<string | null>(() => {
    switch (this._loadStatus()) {
      case 'partial':
        return 'A few saved quotes could not be read. Everything else is still here.';
      case 'invalid':
        return 'I could not read the saved quotes on this device. This visit started with an empty list.';
      case 'unavailable':
        return 'Saved quotes are not available from this browser right now. Anything new may only last for this visit.';
      default:
        return null;
    }
  });

  private favorites: Map<string, FavoriteQuote> = new Map();
  private persistence: FavoritePersistence = 'durable';

  constructor() {
    this.loadFromStorage();
  }

  ngOnDestroy(): void {
    this.favorites.clear();
  }

  addFavorite(quote: Quote): FavoriteMutationResult {
    if (this.favorites.has(quote.id)) {
      return { favorited: true, persistence: this.persistence, changed: false };
    }
    const favorite: FavoriteQuote = {
      ...quote,
      ...(quote.source ? { source: { ...quote.source } } : {}),
      savedAt: Date.now(),
    };
    this.favorites.set(quote.id, favorite);
    this.favoritesCount.set(this.favorites.size);
    return { favorited: true, persistence: this.persistToStorage(), changed: true };
  }

  removeFavorite(id: string): FavoriteMutationResult {
    if (!this.favorites.has(id)) {
      return { favorited: false, persistence: this.persistence, changed: false };
    }
    this.favorites.delete(id);
    this.favoritesCount.set(this.favorites.size);
    return { favorited: false, persistence: this.persistToStorage(), changed: true };
  }

  toggleFavorite(quote: Quote): FavoriteMutationResult {
    if (this.favorites.has(quote.id)) {
      return this.removeFavorite(quote.id);
    }
    return this.addFavorite(quote);
  }

  isFavorite(quote: Quote): boolean {
    return this.favorites.has(quote.id);
  }

  getFavorites(): FavoriteQuote[] {
    return Array.from(this.favorites.values()).sort((a, b) => b.savedAt - a.savedAt);
  }

  private loadFromStorage(): void {
    let raw: string | null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage itself is unavailable. Keep the in-memory reader usable, but
      // do not present the empty list as proof that the user never saved one.
      this.favorites.clear();
      this.favoritesCount.set(0);
      this.persistence = 'session-only';
      this._loadStatus.set('unavailable');
      return;
    }

    // `null` means the key has never been written. An empty string is stored
    // data too, but it is not a valid serialized favorites list.
    if (raw === null) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.markStoredListInvalid();
      return;
    }

    if (!Array.isArray(parsed)) {
      this.markStoredListInvalid();
      return;
    }

    let ignoredCount = 0;
    for (const item of parsed) {
      const favorite = this.parseFavoriteQuote(item);
      if (favorite && !this.favorites.has(favorite.id)) {
        this.favorites.set(favorite.id, favorite);
      } else {
        ignoredCount++;
      }
    }
    this.favoritesCount.set(this.favorites.size);
    if (ignoredCount > 0) {
      this._loadStatus.set(this.favorites.size > 0 ? 'partial' : 'invalid');
    }
  }

  private markStoredListInvalid(): void {
    this.favorites.clear();
    this.favoritesCount.set(0);
    this._loadStatus.set('invalid');
  }

  private persistToStorage(): FavoritePersistence {
    try {
      const data = JSON.stringify(Array.from(this.favorites.values()));
      localStorage.setItem(STORAGE_KEY, data);
      this.persistence = 'durable';
    } catch {
      // Preserve the user's action in memory, but tell the caller that it will
      // not survive a reload so the UI can report the degraded state honestly.
      this.persistence = 'session-only';
    }
    return this.persistence;
  }

  private parseFavoriteQuote(item: unknown): FavoriteQuote | null {
    if (typeof item !== 'object' || item === null) {
      return null;
    }
    const obj = item as Record<string, unknown>;
    if (
      !this.isNonEmptyString(obj['id']) ||
      !this.isNonEmptyString(obj['text']) ||
      !this.isNonEmptyString(obj['author']) ||
      !this.isNonEmptyString(obj['category']) ||
      typeof obj['savedAt'] !== 'number' ||
      !Number.isFinite(obj['savedAt']) ||
      obj['savedAt'] < 0
    ) {
      return null;
    }

    // A partially-written foundation record must not masquerade as a legacy
    // favorite. Legacy records had none of these provenance fields.
    if (obj['authorId'] !== undefined || obj['attributionStatus'] !== undefined || obj['source'] !== undefined) {
      try {
        const quote = validateQuoteRecord(obj);
        return { ...quote, savedAt: obj['savedAt'] };
      } catch {
        return null;
      }
    }

    // Pre-foundation favorites stored only a text/author hash and display
    // fields. Rebuild the new stable IDs deterministically so deployed users do
    // not lose saved quotes when this schema lands. Provenance cannot be
    // recovered from that legacy payload, so it stays explicitly unverified.
    return {
      id: legacyQuoteId(obj['text'], obj['author']),
      authorId: legacyAuthorId(obj['author']),
      text: obj['text'],
      author: obj['author'],
      category: obj['category'],
      attributionStatus: 'unverified',
      savedAt: obj['savedAt'],
    };
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }
}
