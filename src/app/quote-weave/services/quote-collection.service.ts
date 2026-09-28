import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import quoteWeaveContract from '../../../assets/data/quote-weave-contract.json';
import { Quote, QuoteAttributionStatus, QuoteSource } from '../models/quote-weave.models';
import { QUOTES_DATA_URL } from './quote-data.urls';

export type { Quote } from '../models/quote-weave.models';

export type QuoteDataErrorKind = 'empty' | 'malformed';

export class QuoteDataError extends Error {
  constructor(readonly kind: QuoteDataErrorKind) {
    super(kind === 'empty' ? 'The quote collection is empty.' : 'The quote collection is malformed.');
    this.name = 'QuoteDataError';
  }
}

const QUOTE_ID_PATTERN = new RegExp(quoteWeaveContract.quoteIdPattern);
const AUTHOR_ID_PATTERN = new RegExp(quoteWeaveContract.authorIdPattern);
const ATTRIBUTION_STATUSES = new Set<string>(quoteWeaveContract.attributionStatuses);
const DISALLOWED_SOURCE_HOSTS = new Set<string>(quoteWeaveContract.disallowedSourceHosts);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isAttributionStatus(value: unknown): value is QuoteAttributionStatus {
  return typeof value === 'string' && ATTRIBUTION_STATUSES.has(value);
}

function validateSource(value: unknown): QuoteSource | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isNonEmptyString(value['citation'])) {
    throw new QuoteDataError('malformed');
  }

  const stringFields = ['title', 'url', 'translator', 'locator', 'note'] as const;
  for (const field of stringFields) {
    const candidate = value[field];
    if (candidate !== undefined && !isNonEmptyString(candidate)) {
      throw new QuoteDataError('malformed');
    }
  }
  if (
    value['year'] !== undefined &&
    (typeof value['year'] !== 'number' || !Number.isInteger(value['year']) || value['year'] < 1)
  ) {
    throw new QuoteDataError('malformed');
  }
  if (typeof value['url'] === 'string') {
    try {
      const url = new URL(value['url']);
      if (url.protocol !== 'https:' || DISALLOWED_SOURCE_HOSTS.has(url.hostname)) {
        throw new QuoteDataError('malformed');
      }
    } catch {
      throw new QuoteDataError('malformed');
    }
  }

  return {
    citation: value['citation'],
    ...(typeof value['title'] === 'string' ? { title: value['title'] } : {}),
    ...(typeof value['year'] === 'number' ? { year: value['year'] } : {}),
    ...(typeof value['url'] === 'string' ? { url: value['url'] } : {}),
    ...(typeof value['translator'] === 'string' ? { translator: value['translator'] } : {}),
    ...(typeof value['locator'] === 'string' ? { locator: value['locator'] } : {}),
    ...(typeof value['note'] === 'string' ? { note: value['note'] } : {}),
  };
}

export function validateQuoteRecord(value: unknown): Quote {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    !QUOTE_ID_PATTERN.test(value['id']) ||
    typeof value['authorId'] !== 'string' ||
    !AUTHOR_ID_PATTERN.test(value['authorId']) ||
    !isNonEmptyString(value['text']) ||
    !isNonEmptyString(value['author']) ||
    !isNonEmptyString(value['category']) ||
    !isAttributionStatus(value['attributionStatus'])
  ) {
    throw new QuoteDataError('malformed');
  }

  const attributionStatus = value['attributionStatus'];
  const source = validateSource(value['source']);
  if (attributionStatus !== 'unverified' && !source) {
    throw new QuoteDataError('malformed');
  }

  return {
    id: value['id'],
    authorId: value['authorId'],
    text: value['text'],
    author: value['author'],
    category: value['category'],
    attributionStatus,
    ...(source ? { source } : {}),
  };
}

export function validateQuotesPayload(payload: unknown): Quote[] {
  if (!Array.isArray(payload)) {
    throw new QuoteDataError('malformed');
  }
  if (payload.length === 0) {
    throw new QuoteDataError('empty');
  }

  const quotes = payload.map(validateQuoteRecord);
  const ids = new Set<string>();
  const authorById = new Map<string, string>();
  const idByAuthor = new Map<string, string>();
  for (const quote of quotes) {
    if (ids.has(quote.id)) {
      throw new QuoteDataError('malformed');
    }
    ids.add(quote.id);

    const knownAuthor = authorById.get(quote.authorId);
    const knownAuthorId = idByAuthor.get(quote.author);
    if ((knownAuthor && knownAuthor !== quote.author) || (knownAuthorId && knownAuthorId !== quote.authorId)) {
      throw new QuoteDataError('malformed');
    }
    authorById.set(quote.authorId, quote.author);
    idByAuthor.set(quote.author, quote.authorId);
  }
  return quotes;
}

@Injectable()
export class QuoteCollectionService {
  private quotesCache$: Observable<Quote[]> | null = null;

  private _allCategories: string[] = [];
  private _activeCategory: string | null = null;
  private _filteredQuotes: Quote[] = [];
  private _currentIndex = 0;
  private _currentQuote: Quote | null = null;
  private _history: Quote[] = [];

  constructor(private readonly http: HttpClient) {}

  getQuotes(): Observable<Quote[]> {
    if (!this.quotesCache$) {
      this.quotesCache$ = this.http
        .get<unknown>(QUOTES_DATA_URL)
        .pipe(map(validateQuotesPayload), shareReplay({ bufferSize: 1, refCount: false }));
    }
    return this.quotesCache$;
  }

  reloadQuotes(): Observable<Quote[]> {
    this.quotesCache$ = null;
    return this.getQuotes();
  }

  shuffleArray<T>(arr: T[]): T[] {
    const array = [...arr];
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  initWithQuotes(quotes: Quote[]): void {
    this._allCategories = [...new Set(quotes.map((q) => q.category))].sort();
    this._filteredQuotes = [...quotes];
    this._currentIndex = 0;
    this._currentQuote = null;
    this._history = [];
  }

  get allCategories(): string[] {
    return this._allCategories;
  }

  get activeCategory(): string | null {
    return this._activeCategory;
  }

  set activeCategory(category: string | null) {
    this.setCategory(category);
  }

  setCategory(category: string | null): void {
    this._activeCategory = category;
  }

  getFilteredQuotes(): Quote[] {
    return this._filteredQuotes;
  }

  setFilteredQuotes(quotes: Quote[]): void {
    this._filteredQuotes = [...quotes];
    this._currentIndex = 0;
  }

  get currentIndex(): number {
    return this._currentIndex;
  }

  set currentIndex(value: number) {
    this._currentIndex = value;
  }

  get currentQuote(): Quote | null {
    return this._currentQuote;
  }

  get history(): Quote[] {
    return this._history;
  }

  advance(): Quote | null {
    if (this._filteredQuotes.length === 0) return null;
    const quote = this._filteredQuotes[this._currentIndex];
    this._currentIndex = (this._currentIndex + 1) % this._filteredQuotes.length;
    this._currentQuote = quote;
    return quote;
  }

  previous(): Quote | null {
    if (this._history.length === 0) return null;
    const quote = this._history.pop() ?? null;
    this._currentQuote = quote;
    return quote;
  }

  pushHistory(quote: Quote): void {
    this._history.push(quote);
  }
}
