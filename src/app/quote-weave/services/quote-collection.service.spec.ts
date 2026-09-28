import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Quote, QuoteCollectionService, QuoteDataError } from './quote-collection.service';
import { QUOTES_DATA_URL } from './quote-data.urls';

interface TestDone {
  (): void;
  fail(message?: string | Error): void;
}

const MOCK_QUOTES: Quote[] = [
  {
    id: 'quote-1',
    authorId: 'author-a',
    text: 'First quote',
    author: 'Author A',
    category: 'Philosophy',
    attributionStatus: 'unverified',
  },
  {
    id: 'quote-2',
    authorId: 'author-b',
    text: 'Second quote',
    author: 'Author B',
    category: 'Science',
    attributionStatus: 'unverified',
  },
  {
    id: 'quote-3',
    authorId: 'author-c',
    text: 'Third quote',
    author: 'Author C',
    category: 'Philosophy',
    attributionStatus: 'unverified',
  },
  {
    id: 'quote-4',
    authorId: 'author-d',
    text: 'Fourth quote',
    author: 'Author D',
    category: 'Technology',
    attributionStatus: 'unverified',
  },
  {
    id: 'quote-5',
    authorId: 'author-e',
    text: 'Fifth quote',
    author: 'Author E',
    category: 'Science',
    attributionStatus: 'unverified',
  },
];

describe('QuoteCollectionService', () => {
  let service: QuoteCollectionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [QuoteCollectionService],
    });
    service = TestBed.inject(QuoteCollectionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should start with empty allCategories', () => {
      expect(service.allCategories).toEqual([]);
    });

    it('should start with null activeCategory', () => {
      expect(service.activeCategory).toBeNull();
    });

    it('should start with null currentQuote', () => {
      expect(service.currentQuote).toBeNull();
    });

    it('should start with empty history', () => {
      expect(service.history).toEqual([]);
    });

    it('should start with currentIndex 0', () => {
      expect(service.currentIndex).toBe(0);
    });
  });

  describe('getQuotes()', () => {
    it('should fetch from assets/data/quotes.json', (done: () => void) => {
      service.getQuotes().subscribe((quotes) => {
        expect(quotes.length).toBe(5);
        expect(quotes[0].text).toBe('First quote');
        done();
      });

      const req = httpMock.expectOne(QUOTES_DATA_URL);
      expect(req.request.method).toBe('GET');
      req.flush(MOCK_QUOTES);
    });

    it('should return the same observable reference on subsequent calls', () => {
      const obs1 = service.getQuotes();
      const obs2 = service.getQuotes();

      expect(obs1).toBe(obs2);

      // Subscribe to flush the pending HTTP request created by the first getQuotes() subscription
      obs1.subscribe();
      const req = httpMock.expectOne(QUOTES_DATA_URL);
      req.flush(MOCK_QUOTES);
    });

    it('should replay last value to late subscribers without a new HTTP request', (done: () => void) => {
      // First subscriber kicks off the HTTP request
      service.getQuotes().subscribe();
      const req = httpMock.expectOne(QUOTES_DATA_URL);
      req.flush(MOCK_QUOTES);

      // Late subscriber should receive cached data — no second HTTP call
      service.getQuotes().subscribe((quotes) => {
        expect(quotes.length).toBe(5);
        done();
      });

      httpMock.expectNone(QUOTES_DATA_URL);
    });

    it('rejects an empty payload at the HTTP boundary', (done: TestDone) => {
      service.getQuotes().subscribe({
        next: () => done.fail('Expected empty quote data to be rejected'),
        error: (error: unknown) => {
          expect(error instanceof QuoteDataError).toBeTrue();
          expect((error as QuoteDataError).kind).toBe('empty');
          done();
        },
      });

      httpMock.expectOne(QUOTES_DATA_URL).flush([]);
    });

    it('rejects malformed quote records instead of trusting the JSON cast', (done: TestDone) => {
      service.getQuotes().subscribe({
        next: () => done.fail('Expected malformed quote data to be rejected'),
        error: (error: unknown) => {
          expect(error instanceof QuoteDataError).toBeTrue();
          expect((error as QuoteDataError).kind).toBe('malformed');
          done();
        },
      });

      httpMock.expectOne(QUOTES_DATA_URL).flush([{ text: 'Missing required fields' }]);
    });

    it('rejects quote and author IDs outside the shared stable-ID contract', (done: TestDone) => {
      service.getQuotes().subscribe({
        next: () => done.fail('Expected malformed stable IDs to be rejected'),
        error: (error: unknown) => {
          expect(error instanceof QuoteDataError).toBeTrue();
          done();
        },
      });

      httpMock.expectOne(QUOTES_DATA_URL).flush([{ ...MOCK_QUOTES[0], id: 'temporary-quote', authorId: 'Seneca' }]);
    });

    it('rejects duplicate stable quote IDs', (done: TestDone) => {
      service.getQuotes().subscribe({
        next: () => done.fail('Expected duplicate IDs to be rejected'),
        error: (error: unknown) => {
          expect(error instanceof QuoteDataError).toBeTrue();
          done();
        },
      });

      httpMock.expectOne(QUOTES_DATA_URL).flush([MOCK_QUOTES[0], { ...MOCK_QUOTES[1], id: 'quote-1' }]);
    });

    it('rejects a sourced quote without source metadata', (done: TestDone) => {
      service.getQuotes().subscribe({
        next: () => done.fail('Expected an unsupported sourced attribution to be rejected'),
        error: (error: unknown) => {
          expect(error instanceof QuoteDataError).toBeTrue();
          done();
        },
      });

      httpMock
        .expectOne(QUOTES_DATA_URL)
        .flush([{ ...MOCK_QUOTES[0], attributionStatus: 'sourced', source: undefined }]);
    });

    it('rejects source URLs that are not absolute HTTPS links', (done: TestDone) => {
      service.getQuotes().subscribe({
        next: () => done.fail('Expected an unsafe source URL to be rejected'),
        error: (error: unknown) => {
          expect(error instanceof QuoteDataError).toBeTrue();
          done();
        },
      });

      httpMock.expectOne(QUOTES_DATA_URL).flush([
        {
          ...MOCK_QUOTES[0],
          attributionStatus: 'sourced',
          source: { citation: 'A source', url: 'javascript:alert(1)' },
        },
      ]);
    });

    it('rejects source hosts retired by the shared corpus contract', (done: TestDone) => {
      service.getQuotes().subscribe({
        next: () => done.fail('Expected a retired source host to be rejected'),
        error: (error: unknown) => {
          expect(error instanceof QuoteDataError).toBeTrue();
          done();
        },
      });

      httpMock.expectOne(QUOTES_DATA_URL).flush([
        {
          ...MOCK_QUOTES[0],
          attributionStatus: 'sourced',
          source: { citation: 'A parked transcript', url: 'https://the.hitchcock.zone/wiki/Picture_Parade' },
        },
      ]);
    });

    it('rejects conflicting author identities', (done: TestDone) => {
      service.getQuotes().subscribe({
        next: () => done.fail('Expected conflicting author identities to be rejected'),
        error: (error: unknown) => {
          expect(error instanceof QuoteDataError).toBeTrue();
          done();
        },
      });

      httpMock
        .expectOne(QUOTES_DATA_URL)
        .flush([MOCK_QUOTES[0], { ...MOCK_QUOTES[1], authorId: MOCK_QUOTES[0].authorId }]);
    });

    it('reloadQuotes clears the successful cache and issues a fresh request', () => {
      let firstCount = 0;
      service.getQuotes().subscribe((quotes) => (firstCount = quotes.length));
      httpMock.expectOne(QUOTES_DATA_URL).flush(MOCK_QUOTES);
      expect(firstCount).toBe(5);

      let secondCount = 0;
      service.reloadQuotes().subscribe((quotes) => (secondCount = quotes.length));
      httpMock.expectOne(QUOTES_DATA_URL).flush(MOCK_QUOTES.slice(0, 2));
      expect(secondCount).toBe(2);
    });
  });

  describe('shuffleArray()', () => {
    it('should return an array with the same elements', () => {
      const input = [1, 2, 3, 4, 5];
      const result = service.shuffleArray(input);

      expect(result.length).toBe(input.length);
      expect(result.sort()).toEqual([...input].sort());
    });

    it('should not mutate the original array', () => {
      const input = [1, 2, 3, 4, 5];
      const original = [...input];
      service.shuffleArray(input);

      expect(input).toEqual(original);
    });

    it('should return a different order for large arrays (probabilistic)', () => {
      const input = Array.from({ length: 20 }, (_, i) => i);
      let differentOrderSeen = false;

      for (let attempt = 0; attempt < 10; attempt++) {
        const shuffled = service.shuffleArray(input);
        if (!shuffled.every((v, i) => v === input[i])) {
          differentOrderSeen = true;
          break;
        }
      }

      expect(differentOrderSeen).toBeTrue();
    });

    it('should handle empty arrays', () => {
      expect(service.shuffleArray([])).toEqual([]);
    });

    it('should handle single-element arrays', () => {
      expect(service.shuffleArray(['only'])).toEqual(['only']);
    });
  });

  describe('initWithQuotes()', () => {
    it('should extract unique sorted categories', () => {
      service.initWithQuotes(MOCK_QUOTES);

      expect(service.allCategories).toEqual(['Philosophy', 'Science', 'Technology']);
    });

    it('should set filteredQuotes to all quotes', () => {
      service.initWithQuotes(MOCK_QUOTES);

      expect(service.getFilteredQuotes().length).toBe(MOCK_QUOTES.length);
    });

    it('should reset currentIndex to 0', () => {
      service.initWithQuotes(MOCK_QUOTES);
      service.advance();
      service.advance();

      service.initWithQuotes(MOCK_QUOTES);
      expect(service.currentIndex).toBe(0);
    });

    it('should reset currentQuote to null', () => {
      service.initWithQuotes(MOCK_QUOTES);
      service.advance();

      service.initWithQuotes(MOCK_QUOTES);
      expect(service.currentQuote).toBeNull();
    });

    it('should reset history to empty', () => {
      service.initWithQuotes(MOCK_QUOTES);
      service.pushHistory(MOCK_QUOTES[0]);
      service.pushHistory(MOCK_QUOTES[1]);

      service.initWithQuotes(MOCK_QUOTES);
      expect(service.history).toEqual([]);
    });
  });

  describe('setCategory()', () => {
    it('should update activeCategory', () => {
      service.setCategory('Philosophy');

      expect(service.activeCategory).toBe('Philosophy');
    });

    it('should accept null to clear category', () => {
      service.setCategory('Philosophy');
      service.setCategory(null);

      expect(service.activeCategory).toBeNull();
    });
  });

  describe('activeCategory setter', () => {
    it('should delegate to setCategory', () => {
      service.activeCategory = 'Science';

      expect(service.activeCategory).toBe('Science');
    });
  });

  describe('setFilteredQuotes()', () => {
    it('should update filtered quotes', () => {
      const subset = MOCK_QUOTES.slice(0, 2);
      service.setFilteredQuotes(subset);

      expect(service.getFilteredQuotes()).toEqual(subset);
    });

    it('should reset currentIndex to 0', () => {
      service.initWithQuotes(MOCK_QUOTES);
      service.advance();
      service.advance();

      service.setFilteredQuotes(MOCK_QUOTES.slice(0, 2));
      expect(service.currentIndex).toBe(0);
    });
  });

  describe('advance()', () => {
    beforeEach(() => {
      service.initWithQuotes(MOCK_QUOTES);
    });

    it('should return the first quote on first call', () => {
      const quote = service.advance();

      expect(quote).toEqual(MOCK_QUOTES[0]);
    });

    it('should return sequential quotes on subsequent calls', () => {
      expect(service.advance()).toEqual(MOCK_QUOTES[0]);
      expect(service.advance()).toEqual(MOCK_QUOTES[1]);
      expect(service.advance()).toEqual(MOCK_QUOTES[2]);
    });

    it('should wrap around to the beginning at end of list', () => {
      for (let i = 0; i < MOCK_QUOTES.length; i++) {
        service.advance();
      }

      const wrappedQuote = service.advance();
      expect(wrappedQuote).toEqual(MOCK_QUOTES[0]);
    });

    it('should update currentQuote', () => {
      service.advance();

      expect(service.currentQuote).toEqual(MOCK_QUOTES[0]);
    });

    it('should increment currentIndex after each call', () => {
      expect(service.currentIndex).toBe(0);

      service.advance();
      expect(service.currentIndex).toBe(1);

      service.advance();
      expect(service.currentIndex).toBe(2);
    });

    it('should return null when no filtered quotes', () => {
      service.setFilteredQuotes([]);

      expect(service.advance()).toBeNull();
    });
  });

  describe('previous()', () => {
    beforeEach(() => {
      service.initWithQuotes(MOCK_QUOTES);
    });

    it('should return null when history is empty', () => {
      expect(service.previous()).toBeNull();
    });

    it('should return last pushed history entry', () => {
      service.pushHistory(MOCK_QUOTES[0]);
      service.pushHistory(MOCK_QUOTES[1]);

      const prev = service.previous();
      expect(prev).toEqual(MOCK_QUOTES[1]);
    });

    it('should remove the entry from history after returning it', () => {
      service.pushHistory(MOCK_QUOTES[0]);
      service.pushHistory(MOCK_QUOTES[1]);

      service.previous();
      expect(service.history.length).toBe(1);
      expect(service.history[0]).toEqual(MOCK_QUOTES[0]);
    });

    it('should update currentQuote', () => {
      service.pushHistory(MOCK_QUOTES[2]);

      service.previous();

      expect(service.currentQuote).toEqual(MOCK_QUOTES[2]);
    });

    it('should traverse history in LIFO order', () => {
      service.pushHistory(MOCK_QUOTES[0]);
      service.pushHistory(MOCK_QUOTES[1]);
      service.pushHistory(MOCK_QUOTES[2]);

      expect(service.previous()).toEqual(MOCK_QUOTES[2]);
      expect(service.previous()).toEqual(MOCK_QUOTES[1]);
      expect(service.previous()).toEqual(MOCK_QUOTES[0]);
      expect(service.previous()).toBeNull();
    });
  });

  describe('pushHistory()', () => {
    it('should append quote to history', () => {
      service.pushHistory(MOCK_QUOTES[0]);

      expect(service.history.length).toBe(1);
      expect(service.history[0]).toEqual(MOCK_QUOTES[0]);
    });

    it('should accumulate multiple entries', () => {
      service.pushHistory(MOCK_QUOTES[0]);
      service.pushHistory(MOCK_QUOTES[1]);
      service.pushHistory(MOCK_QUOTES[2]);

      expect(service.history.length).toBe(3);
    });
  });

  describe('currentIndex setter', () => {
    it('should update the index directly', () => {
      service.currentIndex = 3;

      expect(service.currentIndex).toBe(3);
    });
  });
});
