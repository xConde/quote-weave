import { HttpClient } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, switchMap } from 'rxjs';
import quoteWeaveContract from '../../../assets/data/quote-weave-contract.json';
import { Quote, QuoteCollectionService, QuoteDataError } from './quote-collection.service';
import { QUOTE_MAP_DATA_URL } from './quote-data.urls';

const MAP_CONTRACT = quoteWeaveContract.map;

export class QuoteMapDataError extends Error {
  constructor() {
    super('The quote map data is malformed or does not match the quote collection.');
    this.name = 'QuoteMapDataError';
  }
}

export interface QuoteMapPoint {
  quoteId: string;
  /** Position within the quote's own theme (intra-cluster), unit-disk scale. */
  lx: number;
  ly: number;
  cluster: number;
}

export interface QuoteMapCluster {
  id: number;
  label: string;
  blurb: string;
  count: number;
}

export type QuoteMapLoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface QuoteMapThread {
  cluster: QuoteMapCluster;
  quotes: Quote[];
}

interface QuoteMapData {
  schemaVersion: number;
  generatorVersion: string;
  seed: number;
  corpusDigest: string;
  labelReviewCorpusDigest: string;
  model: string;
  modelRevision: string;
  tooling: Record<string, string>;
  clusterCount: number;
  clusters: QuoteMapCluster[];
  points: QuoteMapPoint[];
  neighbors: Record<string, string[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function invalidMap(): never {
  throw new QuoteMapDataError();
}

function canonicalCorpus(quotes: Quote[]): object[] {
  return [...quotes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((quote) => ({
      id: quote.id,
      authorId: quote.authorId,
      text: quote.text,
      author: quote.author,
      category: quote.category,
      attributionStatus: quote.attributionStatus,
      source: quote.source
        ? {
            citation: quote.source.citation,
            ...(quote.source.title !== undefined ? { title: quote.source.title } : {}),
            ...(quote.source.year !== undefined ? { year: quote.source.year } : {}),
            ...(quote.source.url !== undefined ? { url: quote.source.url } : {}),
            ...(quote.source.translator !== undefined ? { translator: quote.source.translator } : {}),
            ...(quote.source.locator !== undefined ? { locator: quote.source.locator } : {}),
            ...(quote.source.note !== undefined ? { note: quote.source.note } : {}),
          }
        : null,
    }));
}

export async function calculateQuoteCorpusDigest(quotes: Quote[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalCorpus(quotes)));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

export function validateQuoteMapPayload(payload: unknown, quotes: Quote[]): QuoteMapData {
  if (!isRecord(payload)) invalidMap();
  if (
    payload['schemaVersion'] !== MAP_CONTRACT.schemaVersion ||
    payload['generatorVersion'] !== MAP_CONTRACT.generatorVersion ||
    payload['seed'] !== MAP_CONTRACT.seed ||
    payload['model'] !== MAP_CONTRACT.modelId ||
    payload['modelRevision'] !== MAP_CONTRACT.modelRevision ||
    typeof payload['corpusDigest'] !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(payload['corpusDigest']) ||
    payload['labelReviewCorpusDigest'] !== payload['corpusDigest'] ||
    payload['labelReviewCorpusDigest'] !== MAP_CONTRACT.labelReviewCorpusDigest ||
    !isRecord(payload['tooling']) ||
    payload['clusterCount'] !== MAP_CONTRACT.clusterCount ||
    !Array.isArray(payload['clusters']) ||
    payload['clusterCount'] !== payload['clusters'].length ||
    !Array.isArray(payload['points']) ||
    payload['points'].length !== quotes.length ||
    !isRecord(payload['neighbors'])
  ) {
    invalidMap();
  }

  const toolingPayload = payload['tooling'];
  const expectedTooling = Object.entries(MAP_CONTRACT.tooling);
  if (Object.keys(toolingPayload).length !== expectedTooling.length) invalidMap();
  const tooling: Record<string, string> = {};
  for (const [dependency, version] of expectedTooling) {
    if (toolingPayload[dependency] !== version) invalidMap();
    tooling[dependency] = version;
  }

  const quoteIds = new Set(quotes.map((quote) => quote.id));
  const clusterIds = new Set<number>();
  const clusters: QuoteMapCluster[] = payload['clusters'].map((value: unknown) => {
    if (
      !isRecord(value) ||
      !Number.isInteger(value['id']) ||
      !isNonEmptyString(value['label']) ||
      !isNonEmptyString(value['blurb']) ||
      !Number.isInteger(value['count']) ||
      (value['count'] as number) < 0 ||
      clusterIds.has(value['id'] as number)
    ) {
      invalidMap();
    }
    const id = value['id'] as number;
    const expectedLabel = MAP_CONTRACT.clusterLabels[id];
    if (!expectedLabel || value['label'] !== expectedLabel.label || value['blurb'] !== expectedLabel.blurb) {
      invalidMap();
    }
    clusterIds.add(id);
    return { id, label: value['label'], blurb: value['blurb'], count: value['count'] as number };
  });
  if (clusters.length !== MAP_CONTRACT.clusterCount || clusters.some((cluster, index) => cluster.id !== index)) {
    invalidMap();
  }

  const pointIds = new Set<string>();
  const pointCountByCluster = new Map<number, number>();
  const points: QuoteMapPoint[] = payload['points'].map((value: unknown) => {
    if (
      !isRecord(value) ||
      !isNonEmptyString(value['quoteId']) ||
      !quoteIds.has(value['quoteId']) ||
      pointIds.has(value['quoteId']) ||
      typeof value['lx'] !== 'number' ||
      !Number.isFinite(value['lx']) ||
      typeof value['ly'] !== 'number' ||
      !Number.isFinite(value['ly']) ||
      !Number.isInteger(value['cluster']) ||
      !clusterIds.has(value['cluster'] as number)
    ) {
      invalidMap();
    }
    const quoteId = value['quoteId'];
    const cluster = value['cluster'] as number;
    pointIds.add(quoteId);
    pointCountByCluster.set(cluster, (pointCountByCluster.get(cluster) ?? 0) + 1);
    return { quoteId, lx: value['lx'], ly: value['ly'], cluster };
  });

  if (pointIds.size !== quoteIds.size) invalidMap();
  for (const cluster of clusters) {
    if (cluster.count !== (pointCountByCluster.get(cluster.id) ?? 0)) invalidMap();
  }

  const neighborsPayload = payload['neighbors'];
  if (Object.keys(neighborsPayload).length !== quoteIds.size) invalidMap();
  const neighbors: Record<string, string[]> = {};
  for (const quoteId of quoteIds) {
    const values = neighborsPayload[quoteId];
    if (
      !Array.isArray(values) ||
      values.length !== MAP_CONTRACT.neighborsPerQuote ||
      !values.every((value): value is string => typeof value === 'string') ||
      new Set(values).size !== values.length ||
      values.includes(quoteId) ||
      values.some((value) => !quoteIds.has(value))
    ) {
      invalidMap();
    }
    neighbors[quoteId] = [...values];
  }

  return {
    schemaVersion: payload['schemaVersion'],
    generatorVersion: payload['generatorVersion'],
    seed: payload['seed'],
    corpusDigest: payload['corpusDigest'],
    labelReviewCorpusDigest: payload['labelReviewCorpusDigest'],
    model: payload['model'],
    modelRevision: payload['modelRevision'],
    tooling,
    clusterCount: payload['clusterCount'],
    clusters,
    points,
    neighbors,
  };
}

@Injectable()
export class QuoteMapService {
  private readonly http = inject(HttpClient);
  private readonly quoteCollection = inject(QuoteCollectionService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _points = signal<QuoteMapPoint[]>([]);
  private readonly _clusters = signal<QuoteMapCluster[]>([]);
  private readonly _quotes = signal<Quote[]>([]);
  private readonly _status = signal<QuoteMapLoadState>('idle');
  private readonly _errorMessage = signal<string | null>(null);

  readonly points = this._points.asReadonly();
  readonly clusters = this._clusters.asReadonly();
  readonly status = this._status.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();
  readonly loaded = computed(() => this._status() === 'ready');

  private _neighbors: Record<string, string[]> = {};

  private readonly _quotesById = computed<Map<string, Quote>>(() => {
    const map = new Map<string, Quote>();
    this._quotes().forEach((quote) => {
      map.set(quote.id, quote);
    });
    return map;
  });

  /**
   * The same map data as the canvas, expressed as ordinary text and controls.
   * This keeps every quote reachable without relying on pointer hit-testing or
   * interpreting the visual plot.
   */
  readonly threads = computed<QuoteMapThread[]>(() => {
    const quotesById = this._quotesById();
    const pointsByCluster = new Map<number, Quote[]>();

    for (const point of this._points()) {
      const quote = quotesById.get(point.quoteId);
      if (!quote) continue;
      const quotes = pointsByCluster.get(point.cluster) ?? [];
      quotes.push(quote);
      pointsByCluster.set(point.cluster, quotes);
    }

    return this._clusters().map((cluster) => ({
      cluster,
      quotes: pointsByCluster.get(cluster.id) ?? [],
    }));
  });

  load(): void {
    // load() is called from component effects. Do not make those effects
    // subscribers to this internal state or a failure would trigger an
    // immediate, silent retry loop before the user can act on the error.
    const status = untracked(this._status);
    if (status === 'ready' || status === 'loading') return;

    this._status.set('loading');
    this._errorMessage.set(null);

    forkJoin({
      mapPayload: this.http.get<unknown>(QUOTE_MAP_DATA_URL),
      quotes: this.quoteCollection.getQuotes(),
    })
      .pipe(
        switchMap(async ({ mapPayload, quotes }) => {
          const map = validateQuoteMapPayload(mapPayload, quotes);
          if (map.corpusDigest !== (await calculateQuoteCorpusDigest(quotes))) invalidMap();
          return { map, quotes };
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ map, quotes }) => {
          this._quotes.set(quotes);
          this._points.set(map.points);
          this._clusters.set(map.clusters);
          this._neighbors = map.neighbors;
          this._status.set('ready');
        },
        error: (error: unknown) => {
          this._points.set([]);
          this._clusters.set([]);
          this._quotes.set([]);
          this._neighbors = {};
          this._status.set('error');
          this._errorMessage.set(
            error instanceof QuoteMapDataError || error instanceof QuoteDataError
              ? 'The idea map data did not pass its integrity check. Try loading it again.'
              : 'The idea map could not be loaded. Check your connection and try again.'
          );
        },
      });
  }

  quoteById(quoteId: string): Quote | null {
    return this._quotesById().get(quoteId) ?? null;
  }

  /** Stable-ID neighbor list for a point, for drawing constellation links. */
  neighborsOf(quoteId: string): string[] {
    return this._neighbors[quoteId] ?? [];
  }

  relatedTo(quote: Quote): { quote: Quote; quoteId: string }[] {
    const neighborIds = this._neighbors[quote.id];
    if (!neighborIds) return [];

    const results: { quote: Quote; quoteId: string }[] = [];
    for (const quoteId of neighborIds) {
      const neighbor = this.quoteById(quoteId);
      if (neighbor) {
        results.push({ quote: neighbor, quoteId });
      }
    }
    return results;
  }
}
