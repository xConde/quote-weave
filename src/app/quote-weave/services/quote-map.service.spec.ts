import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import committedMapData from '../../../assets/data/quote-map.json';
import committedQuotesData from '../../../assets/data/quotes.json';
import { calculateQuoteCorpusDigest, QuoteMapService, validateQuoteMapPayload } from './quote-map.service';
import { Quote, QuoteCollectionService, validateQuotesPayload } from './quote-collection.service';
import { QUOTE_MAP_DATA_URL, QUOTES_DATA_URL } from './quote-data.urls';

const MOCK_QUOTES = validateQuotesPayload(committedQuotesData);
const MOCK_MAP = validateQuoteMapPayload(committedMapData, MOCK_QUOTES);
const MOCK_CLUSTERS = MOCK_MAP.clusters;
const MOCK_POINTS = MOCK_MAP.points;

describe('QuoteMapService', () => {
  let service: QuoteMapService;
  let httpMock: HttpTestingController;

  async function waitForIntegrityCheck(): Promise<void> {
    for (let attempt = 0; attempt < 20 && service.status() === 'loading'; attempt++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  async function flush(mapPayload: object = MOCK_MAP, quotes: Quote[] = MOCK_QUOTES): Promise<void> {
    httpMock.expectOne(QUOTE_MAP_DATA_URL).flush(mapPayload);
    httpMock.expectOne(QUOTES_DATA_URL).flush(quotes);
    await waitForIntegrityCheck();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [QuoteMapService, QuoteCollectionService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(QuoteMapService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('accepts the committed corpus and map through the shipped runtime contract', async () => {
    const quotes = validateQuotesPayload(committedQuotesData);
    const map = validateQuoteMapPayload(committedMapData, quotes);

    expect(map.corpusDigest).toBe(await calculateQuoteCorpusDigest(quotes));
    expect(map.generatorVersion).toBe('quote-map-v3');
    expect(map.points.length).toBe(quotes.length);
  });

  it('rejects map metadata from a stale generator contract', () => {
    expect(() =>
      validateQuoteMapPayload(
        {
          ...MOCK_MAP,
          generatorVersion: 'quote-map-v2',
        },
        MOCK_QUOTES
      )
    ).toThrowError();
  });

  it('rejects a matching corpus and review digest outside the shared reviewed contract', () => {
    const staleDigest = `sha256:${'0'.repeat(64)}`;
    expect(() =>
      validateQuoteMapPayload(
        {
          ...MOCK_MAP,
          corpusDigest: staleDigest,
          labelReviewCorpusDigest: staleDigest,
        },
        MOCK_QUOTES
      )
    ).toThrowError();
  });

  it('starts unloaded with empty signals', () => {
    expect(service.loaded()).toBe(false);
    expect(service.status()).toBe('idle');
    expect(service.errorMessage()).toBeNull();
    expect(service.points()).toEqual([]);
    expect(service.clusters()).toEqual([]);
  });

  it('loads and resolves points and clusters', async () => {
    service.load();
    await flush();

    expect(service.loaded()).toBe(true);
    expect(service.status()).toBe('ready');
    expect(service.points().length).toBe(MOCK_QUOTES.length);
    expect(service.clusters().length).toBe(MOCK_CLUSTERS.length);
  });

  it('builds a text thread index from stable quote IDs', async () => {
    service.load();
    await flush();

    expect(service.threads().length).toBe(MOCK_CLUSTERS.length);
    expect(service.threads()[0].cluster).toEqual(MOCK_CLUSTERS[0]);
    expect(service.threads()[0].quotes.map((quote) => quote.id)).toEqual(
      MOCK_POINTS.filter((point) => point.cluster === MOCK_CLUSTERS[0].id).map((point) => point.quoteId)
    );
  });

  it('quoteById returns the quote for a stable ID', async () => {
    service.load();
    await flush();

    const q = service.quoteById(MOCK_QUOTES[1].id);
    expect(q).toEqual(MOCK_QUOTES[1]);
  });

  it('quoteById returns null for an unknown ID', async () => {
    service.load();
    await flush();

    expect(service.quoteById('quote-missing')).toBeNull();
  });

  it('relatedTo returns 6 neighbors for a known quote', async () => {
    service.load();
    await flush();

    const related = service.relatedTo(MOCK_QUOTES[0]);
    const firstNeighborId = MOCK_MAP.neighbors[MOCK_QUOTES[0].id][0];
    expect(related.length).toBe(6);
    expect(related[0].quoteId).toBe(firstNeighborId);
    expect(related[0].quote).toEqual(MOCK_QUOTES.find((quote) => quote.id === firstNeighborId)!);
  });

  it('resolves map relationships when the quote corpus is reordered', async () => {
    service.load();
    httpMock.expectOne(QUOTE_MAP_DATA_URL).flush(MOCK_MAP);
    httpMock.expectOne(QUOTES_DATA_URL).flush([...MOCK_QUOTES].reverse());
    await waitForIntegrityCheck();

    const related = service.relatedTo(MOCK_QUOTES[0]);
    const firstNeighborId = MOCK_MAP.neighbors[MOCK_QUOTES[0].id][0];
    expect(service.quoteById(MOCK_QUOTES[0].id)).toEqual(MOCK_QUOTES[0]);
    expect(related[0].quote).toEqual(MOCK_QUOTES.find((quote) => quote.id === firstNeighborId)!);
  });

  it('relatedTo returns [] for a quote not in the dataset', async () => {
    service.load();
    await flush();

    const unknown: Quote = {
      id: 'quote-unknown',
      authorId: 'author-nobody',
      text: 'Unknown quote',
      author: 'Nobody',
      category: 'X',
      attributionStatus: 'unverified',
    };
    expect(service.relatedTo(unknown)).toEqual([]);
  });

  it('handles HTTP error without throwing and stays unloaded', () => {
    service.load();

    // forkJoin: erroring one request cancels the other automatically
    const requests = httpMock.match(() => true);
    expect(requests.length).toBe(2);
    // Error just one — forkJoin will cancel+error the whole observable
    const mapReq = requests.find((r) => r.request.url.includes('quote-map'));
    expect(mapReq).toBeTruthy();
    mapReq!.error(new ProgressEvent('network error'));
    // The other request is now cancelled — flush it to satisfy httpMock.verify()
    const remaining = requests.filter((r) => r !== mapReq);
    remaining.forEach((r) => {
      if (!r.cancelled) r.flush([]);
    });

    expect(service.loaded()).toBe(false);
    expect(service.status()).toBe('error');
    expect(service.errorMessage()).toContain('could not be loaded');
    expect(service.points()).toEqual([]);
  });

  it('retries cleanly after a failed load', async () => {
    service.load();

    const firstRequests = httpMock.match(() => true);
    firstRequests.find((request) => request.request.url.includes('quote-map'))!.error(new ProgressEvent('offline'));
    firstRequests.find((request) => request.request.url.includes('quotes.json'))!.flush(MOCK_QUOTES);
    expect(service.status()).toBe('error');

    service.load();
    expect(service.status()).toBe('loading');
    expect(service.errorMessage()).toBeNull();

    httpMock.expectOne(QUOTE_MAP_DATA_URL).flush(MOCK_MAP);
    await waitForIntegrityCheck();
    expect(service.status()).toBe('ready');
    expect(service.loaded()).toBe(true);
  });

  it('does not make a second HTTP request when load() is called twice', async () => {
    service.load();
    await flush();

    service.load();
    // No pending requests expected — flush should have satisfied them all
    httpMock.verify();
    expect(service.loaded()).toBe(true);
  });

  it('does not start duplicate requests while the first load is in flight', async () => {
    service.load();
    service.load();

    expect(service.status()).toBe('loading');

    const mapRequest = httpMock.expectOne(QUOTE_MAP_DATA_URL);
    const quoteRequest = httpMock.expectOne(QUOTES_DATA_URL);
    httpMock.expectNone(() => true);
    mapRequest.flush(MOCK_MAP);
    quoteRequest.flush(MOCK_QUOTES);
    await waitForIntegrityCheck();
    expect(service.loaded()).toBe(true);
  });

  it('rejects a map built from different quote content', async () => {
    service.load();
    const editedQuotes = MOCK_QUOTES.map((quote, index) =>
      index === 0 ? { ...quote, text: `${quote.text} changed` } : quote
    );
    await flush(MOCK_MAP, editedQuotes);

    expect(service.status()).toBe('error');
    expect(service.errorMessage()).toContain('integrity check');
    expect(service.points()).toEqual([]);
  });

  it('rejects a cluster layout the renderer does not support', async () => {
    service.load();
    const invalidMap = {
      ...MOCK_MAP,
      clusterCount: 3,
      clusters: MOCK_MAP.clusters.slice(0, 3),
    };
    await flush(invalidMap);

    expect(service.status()).toBe('error');
    expect(service.errorMessage()).toContain('integrity check');
  });
});
