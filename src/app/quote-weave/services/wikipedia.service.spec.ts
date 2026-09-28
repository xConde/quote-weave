import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { WikipediaService, WikiResult } from './wikipedia.service';

describe('WikipediaService', () => {
  let service: WikipediaService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [WikipediaService],
    });
    service = TestBed.inject(WikipediaService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should start with null wikiResult$', () => {
      expect(service.wikiResult$.value).toBeNull();
    });

    it('should start with loading$ false', () => {
      expect(service.loading$.value).toBeFalse();
    });
  });

  describe('isRealPerson()', () => {
    it('should return true for known authors', () => {
      expect(service.isRealPerson('Marcus Aurelius')).toBeTrue();
      expect(service.isRealPerson('Carl Sagan')).toBeTrue();
      expect(service.isRealPerson('Aristotle')).toBeTrue();
    });

    it('should return false for generic attribution sources', () => {
      expect(service.isRealPerson('Programming Wisdom')).toBeFalse();
      expect(service.isRealPerson('Ancient Wisdom')).toBeFalse();
      expect(service.isRealPerson('Filmmaker Wisdom')).toBeFalse();
      expect(service.isRealPerson('Stoic Teachings')).toBeFalse();
      expect(service.isRealPerson('Anonymous')).toBeFalse();
      expect(service.isRealPerson('Harold Abelson and Gerald Jay Sussman')).toBeFalse();
    });

    it('should return true for unknown names not in nonPersonAuthors list', () => {
      expect(service.isRealPerson('Some Unknown Author')).toBeTrue();
    });
  });

  describe('getWikipediaPageName()', () => {
    it('should map Seneca to Seneca_the_Younger', () => {
      expect(service.getWikipediaPageName('Seneca')).toBe('Seneca_the_Younger');
    });

    it('should map Rene Descartes to René_Descartes', () => {
      expect(service.getWikipediaPageName('Rene Descartes')).toBe('René_Descartes');
    });

    it('should map Martin Fowler to disambiguated page', () => {
      expect(service.getWikipediaPageName('Martin Fowler')).toBe('Martin_Fowler_(software_engineer)');
    });

    it('should replace spaces with underscores for unknown authors', () => {
      expect(service.getWikipediaPageName('John Doe')).toBe('John_Doe');
    });

    it('should return single-word names unchanged', () => {
      expect(service.getWikipediaPageName('Plato')).toBe('Plato');
      expect(service.getWikipediaPageName('Aristotle')).toBe('Aristotle');
      expect(service.getWikipediaPageName('Epictetus')).toBe('Epictetus');
      expect(service.getWikipediaPageName('Socrates')).toBe('Socrates');
    });

    it('should map Arthur C. Clarke correctly', () => {
      expect(service.getWikipediaPageName('Arthur C. Clarke')).toBe('Arthur_C._Clarke');
    });
  });

  describe('isValidWikimediaImageUrl()', () => {
    it('should accept upload.wikimedia.org URLs', () => {
      expect(
        service.isValidWikimediaImageUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a.jpg')
      ).toBeTrue();
    });

    it('should accept commons.wikimedia.org URLs', () => {
      expect(service.isValidWikimediaImageUrl('https://commons.wikimedia.org/wiki/File:Example.jpg')).toBeTrue();
    });

    it('should reject URLs from other domains', () => {
      expect(service.isValidWikimediaImageUrl('https://example.com/image.jpg')).toBeFalse();
      expect(service.isValidWikimediaImageUrl('https://wikipedia.org/image.jpg')).toBeFalse();
      expect(service.isValidWikimediaImageUrl('https://evil.com/upload.wikimedia.org/image.jpg')).toBeFalse();
    });

    it('should reject null', () => {
      expect(service.isValidWikimediaImageUrl(null)).toBeFalse();
    });

    it('should reject malformed URLs', () => {
      expect(service.isValidWikimediaImageUrl('not-a-url')).toBeFalse();
    });
  });

  describe('isValidWikipediaUrl()', () => {
    it('should accept en.wikipedia.org URLs', () => {
      expect(service.isValidWikipediaUrl('https://en.wikipedia.org/wiki/Plato')).toBeTrue();
    });

    it('should accept subdomain wikipedia.org URLs', () => {
      expect(service.isValidWikipediaUrl('https://fr.wikipedia.org/wiki/Platon')).toBeTrue();
    });

    it('should reject non-Wikipedia URLs', () => {
      expect(service.isValidWikipediaUrl('https://example.com')).toBeFalse();
      expect(service.isValidWikipediaUrl('https://wikimedia.org')).toBeFalse();
      expect(service.isValidWikipediaUrl('https://evil.com/en.wikipedia.org')).toBeFalse();
    });

    it('should reject malformed URLs', () => {
      expect(service.isValidWikipediaUrl('not-a-url')).toBeFalse();
    });
  });

  describe('escapeHtml()', () => {
    it('should escape < and >', () => {
      expect(service.escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('should escape &', () => {
      expect(service.escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('should escape double quotes', () => {
      expect(service.escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    });

    it('should escape single quotes', () => {
      expect(service.escapeHtml("it's")).toBe('it&#39;s');
    });

    it('should handle XSS payloads', () => {
      const payload = '<img src=x onerror="alert(1)">';
      const escaped = service.escapeHtml(payload);
      expect(escaped).not.toContain('<');
      expect(escaped).not.toContain('>');
      expect(escaped).not.toContain('"');
    });

    it('should return clean strings unchanged', () => {
      expect(service.escapeHtml('Hello World')).toBe('Hello World');
    });
  });

  describe('close()', () => {
    it('should set wikiResult$ to null', () => {
      service.wikiResult$.next({
        title: 'Plato',
        imageUrl: null,
        content: 'Greek philosopher.',
        wikiUrl: 'https://en.wikipedia.org/wiki/Plato',
      });

      service.close();

      expect(service.wikiResult$.value).toBeNull();
    });
  });

  describe('lookup()', () => {
    const mockValidResponse = {
      type: 'standard',
      title: 'Plato',
      thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/plato.jpg' },
      extract_html: '<p>Plato was an Athenian philosopher during the Classical period in Ancient Greece.</p>',
      extract: 'Plato was an Athenian philosopher during the Classical period in Ancient Greece.',
    };

    it('should set loading$ to true during request', () => {
      service.lookup('Plato');

      expect(service.loading$.value).toBeTrue();

      const req = httpMock.expectOne((r) => r.url.includes('wikipedia.org/api/rest_v1'));
      req.flush(mockValidResponse);

      expect(service.loading$.value).toBeFalse();
    });

    it('should set loading$ to false after response', () => {
      service.lookup('Plato');

      const req = httpMock.expectOne((r) => r.url.includes('wikipedia.org/api/rest_v1'));
      req.flush(mockValidResponse);

      expect(service.loading$.value).toBeFalse();
    });

    it('should map response to WikiResult correctly', () => {
      service.lookup('Plato');

      const req = httpMock.expectOne((r) => r.url.includes('wikipedia.org/api/rest_v1'));
      req.flush(mockValidResponse);

      const result = service.wikiResult$.value as WikiResult;
      expect(result).not.toBeNull();
      expect(result.title).toBe('Plato');
      expect(result.imageUrl).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/plato.jpg');
      expect(result.wikiUrl).toContain('en.wikipedia.org/wiki/Plato');
    });

    it('should reject image URLs from non-Wikimedia domains', () => {
      service.lookup('Plato');

      const req = httpMock.expectOne((r) => r.url.includes('wikipedia.org/api/rest_v1'));
      req.flush({
        ...mockValidResponse,
        thumbnail: { source: 'https://evil.com/image.jpg' },
      });

      const result = service.wikiResult$.value as WikiResult;
      expect(result.imageUrl).toBeNull();
    });

    it('should use originalimage if thumbnail is absent', () => {
      service.lookup('Plato');

      const req = httpMock.expectOne((r) => r.url.includes('wikipedia.org/api/rest_v1'));
      req.flush({
        type: mockValidResponse.type,
        title: mockValidResponse.title,
        extract_html: mockValidResponse.extract_html,
        originalimage: {
          source: 'https://upload.wikimedia.org/wikipedia/commons/plato_full.jpg',
        },
      });

      const result = service.wikiResult$.value as WikiResult;
      expect(result.imageUrl).toBe('https://upload.wikimedia.org/wikipedia/commons/plato_full.jpg');
    });

    it('should use authorNameMapping for page name in URL', () => {
      service.lookup('Seneca');

      const req = httpMock.expectOne((r) => r.url.includes('Seneca_the_Younger'));
      req.flush(mockValidResponse);

      expect(req).toBeTruthy();
    });

    it('should set loading$ to false and emit error result on HTTP error', () => {
      service.lookup('Plato');

      const req = httpMock.expectOne((r) => r.url.includes('wikipedia.org/api/rest_v1'));
      req.error(new ProgressEvent('error'));

      expect(service.loading$.value).toBeFalse();
      const result = service.wikiResult$.value as WikiResult;
      expect(result).not.toBeNull();
      expect(result.content).toBe('Error loading content.');
      expect(result.imageUrl).toBeNull();
    });

    describe('disambiguation detection', () => {
      it('should detect disambiguation type', () => {
        service.lookup('Plato');

        const req = httpMock.expectOne((r) => r.url.includes('wikipedia.org/api/rest_v1'));
        req.flush({ type: 'disambiguation', title: 'Plato', extract: 'may refer to: ...' });

        const result = service.wikiResult$.value as WikiResult;
        expect(result.title).toBe('');
        expect(result.content).toContain('ambiguous or not available');
      });

      it('should detect "may refer to:" pattern in extract', () => {
        service.lookup('Smith');

        const req = httpMock.expectOne((r) => r.url.includes('wikipedia.org/api/rest_v1'));
        req.flush({
          type: 'standard',
          title: 'Smith',
          extract: 'Smith may refer to: a blacksmith, or a surname.',
        });

        const result = service.wikiResult$.value as WikiResult;
        expect(result.content).toContain('ambiguous or not available');
      });

      it('should detect Category: titles as invalid', () => {
        service.lookup('Philosophy');

        const req = httpMock.expectOne((r) => r.url.includes('wikipedia.org/api/rest_v1'));
        req.flush({
          type: 'standard',
          title: 'Category:Philosophy',
          extract: 'This is a category page.',
        });

        const result = service.wikiResult$.value as WikiResult;
        expect(result.content).toContain('ambiguous or not available');
      });
    });

    describe('response caching', () => {
      it('should serve cached result on second lookup — no HTTP request', () => {
        service.lookup('Plato');

        const req = httpMock.expectOne((r) => r.url.includes('wikipedia.org/api/rest_v1'));
        req.flush(mockValidResponse);

        const firstResult = service.wikiResult$.value;

        // Second lookup — should come from cache
        service.lookup('Plato');
        httpMock.expectNone((r) => r.url.includes('wikipedia.org/api/rest_v1'));

        expect(service.wikiResult$.value).toEqual(firstResult);
        expect(service.loading$.value).toBeFalse();
      });

      it('should not cache error responses', () => {
        service.lookup('Plato');

        const req1 = httpMock.expectOne((r) => r.url.includes('wikipedia.org/api/rest_v1'));
        req1.error(new ProgressEvent('error'));

        // Second lookup should make a new HTTP request
        service.lookup('Plato');
        const req2 = httpMock.expectOne((r) => r.url.includes('wikipedia.org/api/rest_v1'));
        req2.flush(mockValidResponse);

        expect(service.wikiResult$.value!.title).toBe('Plato');
      });

      it('should cache different authors independently', () => {
        service.lookup('Plato');
        httpMock.expectOne((r) => r.url.includes('Plato')).flush(mockValidResponse);

        service.lookup('Aristotle');
        httpMock
          .expectOne((r) => r.url.includes('Aristotle'))
          .flush({
            ...mockValidResponse,
            title: 'Aristotle',
          });

        // Both should be cached — no new requests
        service.lookup('Plato');
        httpMock.expectNone((r) => r.url.includes('Plato'));
        expect(service.wikiResult$.value!.title).toBe('Plato');

        service.lookup('Aristotle');
        httpMock.expectNone((r) => r.url.includes('Aristotle'));
        expect(service.wikiResult$.value!.title).toBe('Aristotle');
      });
    });

    describe('race conditions (Phase 2 red-team)', () => {
      it('keeps loading$ true after a stale lookup is cancelled mid-flight', () => {
        service.lookup('Plato');
        httpMock.expectOne((r) => r.url.includes('Plato'));
        expect(service.loading$.value).toBeTrue();

        // Second lookup cancels the first. Without the token guard, finalize
        // from the cancelled subscription would flip loading$ to false here.
        service.lookup('Aristotle');
        expect(service.loading$.value).toBeTrue();

        const aristotleReq = httpMock.expectOne((r) => r.url.includes('Aristotle'));
        aristotleReq.flush({ ...mockValidResponse, title: 'Aristotle' });

        expect(service.loading$.value).toBeFalse();
        expect(service.wikiResult$.value!.title).toBe('Aristotle');
      });

      it('cancels the in-flight request when a new lookup starts', () => {
        service.lookup('Plato');
        const platoReq = httpMock.expectOne((r) => r.url.includes('Plato'));

        service.lookup('Aristotle');
        // Plato's request must have been cancelled.
        expect(platoReq.cancelled).toBeTrue();

        const aristotleReq = httpMock.expectOne((r) => r.url.includes('Aristotle'));
        aristotleReq.flush({ ...mockValidResponse, title: 'Aristotle' });
        expect(service.wikiResult$.value!.title).toBe('Aristotle');
      });

      it('close() cancels the in-flight request and resets state', () => {
        service.lookup('Plato');
        const req = httpMock.expectOne((r) => r.url.includes('Plato'));

        service.close();

        expect(req.cancelled).toBeTrue();
        expect(service.wikiResult$.value).toBeNull();
        // close() bumps the token so even if a queued microtask emits stale
        // data later, wikiResult$ stays null and loading$ reflects the close.
        expect(service.loading$.value).toBeFalse();
      });
    });
  });
});
