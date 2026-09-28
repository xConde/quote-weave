import { TestBed } from '@angular/core/testing';
import { FavoritesService } from './favorites.service';
import { FavoriteQuote, Quote } from '../models/quote-weave.models';

const STORAGE_KEY = 'quote-weave-favorites';

const mockQuote: Quote = {
  id: 'quote-jobs',
  authorId: 'author-steve-jobs',
  text: 'The only way to do great work is to love what you do.',
  author: 'Steve Jobs',
  category: 'Motivation',
  attributionStatus: 'unverified',
};

const mockQuote2: Quote = {
  id: 'quote-einstein',
  authorId: 'author-albert-einstein',
  text: 'In the middle of every difficulty lies opportunity.',
  author: 'Albert Einstein',
  category: 'Wisdom',
  attributionStatus: 'unverified',
};

describe('FavoritesService', () => {
  let service: FavoritesService;
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};

    spyOn(localStorage, 'getItem').and.callFake((key: string): string | null => store[key] ?? null);
    spyOn(localStorage, 'setItem').and.callFake((key: string, value: string): void => {
      store[key] = value;
    });
    spyOn(localStorage, 'removeItem').and.callFake((key: string): void => {
      delete store[key];
    });

    TestBed.configureTestingModule({
      providers: [FavoritesService],
    });

    service = TestBed.inject(FavoritesService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('addFavorite', () => {
    it('should add a quote to favorites', () => {
      service.addFavorite(mockQuote);
      const favorites = service.getFavorites();
      expect(favorites.length).toBe(1);
      expect(favorites[0].text).toBe(mockQuote.text);
      expect(favorites[0].author).toBe(mockQuote.author);
      expect(favorites[0].category).toBe(mockQuote.category);
    });

    it('should not add duplicate favorites', () => {
      service.addFavorite(mockQuote);
      service.addFavorite(mockQuote);
      expect(service.getFavorites().length).toBe(1);
    });

    it('should assign a non-empty id to the added favorite', () => {
      service.addFavorite(mockQuote);
      const favorites = service.getFavorites();
      expect(favorites[0].id).toBeTruthy();
    });

    it('should record savedAt as a timestamp', () => {
      const before = Date.now();
      service.addFavorite(mockQuote);
      const after = Date.now();
      const saved = service.getFavorites()[0].savedAt;
      expect(saved).toBeGreaterThanOrEqual(before);
      expect(saved).toBeLessThanOrEqual(after);
    });
  });

  describe('removeFavorite', () => {
    it('should remove a favorite by id', () => {
      service.addFavorite(mockQuote);
      const id = service.getFavorites()[0].id;
      service.removeFavorite(id);
      expect(service.getFavorites().length).toBe(0);
    });

    it('should do nothing when id does not exist', () => {
      service.addFavorite(mockQuote);
      service.removeFavorite('nonexistent-id');
      expect(service.getFavorites().length).toBe(1);
    });
  });

  describe('toggleFavorite', () => {
    it('should add a quote and report durable persistence when not yet favorited', () => {
      const result = service.toggleFavorite(mockQuote);
      expect(result).toEqual({ favorited: true, persistence: 'durable', changed: true });
      expect(service.getFavorites().length).toBe(1);
    });

    it('should remove a quote and report durable persistence when already favorited', () => {
      service.addFavorite(mockQuote);
      const result = service.toggleFavorite(mockQuote);
      expect(result).toEqual({ favorited: false, persistence: 'durable', changed: true });
      expect(service.getFavorites().length).toBe(0);
    });

    it('should toggle back and forth correctly', () => {
      expect(service.toggleFavorite(mockQuote).favorited).toBe(true);
      expect(service.toggleFavorite(mockQuote).favorited).toBe(false);
      expect(service.toggleFavorite(mockQuote).favorited).toBe(true);
      expect(service.getFavorites().length).toBe(1);
    });
  });

  describe('isFavorite', () => {
    it('should return false for a quote not in favorites', () => {
      expect(service.isFavorite(mockQuote)).toBe(false);
    });

    it('should return true after adding a quote', () => {
      service.addFavorite(mockQuote);
      expect(service.isFavorite(mockQuote)).toBe(true);
    });

    it('should return false after removing a quote', () => {
      service.addFavorite(mockQuote);
      const id = service.getFavorites()[0].id;
      service.removeFavorite(id);
      expect(service.isFavorite(mockQuote)).toBe(false);
    });

    it('should distinguish between different quotes', () => {
      service.addFavorite(mockQuote);
      expect(service.isFavorite(mockQuote)).toBe(true);
      expect(service.isFavorite(mockQuote2)).toBe(false);
    });
  });

  describe('favoritesCount signal', () => {
    it('should start at 0', () => {
      expect(service.favoritesCount()).toBe(0);
    });

    it('should increment when a favorite is added', () => {
      service.addFavorite(mockQuote);
      expect(service.favoritesCount()).toBe(1);
    });

    it('should decrement when a favorite is removed', () => {
      service.addFavorite(mockQuote);
      const id = service.getFavorites()[0].id;
      service.removeFavorite(id);
      expect(service.favoritesCount()).toBe(0);
    });

    it('should reflect multiple additions correctly', () => {
      service.addFavorite(mockQuote);
      service.addFavorite(mockQuote2);
      expect(service.favoritesCount()).toBe(2);
    });

    it('should not change count when toggling an existing favorite off and on', () => {
      service.addFavorite(mockQuote);
      expect(service.favoritesCount()).toBe(1);
      service.toggleFavorite(mockQuote);
      expect(service.favoritesCount()).toBe(0);
      service.toggleFavorite(mockQuote);
      expect(service.favoritesCount()).toBe(1);
    });
  });

  describe('localStorage persistence', () => {
    it('should persist favorites to localStorage on add', () => {
      service.addFavorite(mockQuote);
      expect(localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, jasmine.any(String));
      const stored = store[STORAGE_KEY];
      const parsed: FavoriteQuote[] = JSON.parse(stored) as FavoriteQuote[];
      expect(parsed.length).toBe(1);
      expect(parsed[0].author).toBe(mockQuote.author);
    });

    it('should persist favorites to localStorage on remove', () => {
      service.addFavorite(mockQuote);
      const id = service.getFavorites()[0].id;
      service.removeFavorite(id);
      const stored = store[STORAGE_KEY];
      const parsed: FavoriteQuote[] = JSON.parse(stored) as FavoriteQuote[];
      expect(parsed.length).toBe(0);
    });

    it('should load existing favorites from localStorage on construction', () => {
      const existingFavorite: FavoriteQuote = {
        id: 'quote-abc123',
        authorId: 'author-author',
        text: 'Preloaded quote',
        author: 'Author',
        category: 'Category',
        attributionStatus: 'unverified',
        savedAt: 1700000000000,
      };
      store[STORAGE_KEY] = JSON.stringify([existingFavorite]);

      // Recreate service so constructor runs with pre-seeded store
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [FavoritesService] });
      const newService = TestBed.inject(FavoritesService);

      expect(newService.getFavorites().length).toBe(1);
      expect(newService.getFavorites()[0].id).toBe('quote-abc123');
      expect(newService.favoritesCount()).toBe(1);
    });

    it('migrates a deployed favorite onto the new stable quote and author IDs', () => {
      store[STORAGE_KEY] = JSON.stringify([
        {
          id: '6244fac1',
          text: mockQuote.text,
          author: mockQuote.author,
          category: mockQuote.category,
          savedAt: 1700000000000,
        },
      ]);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [FavoritesService] });
      const newService = TestBed.inject(FavoritesService);
      const migrated = newService.getFavorites()[0];

      expect(migrated.id).toBe('quote-8df3444b');
      expect(migrated.authorId).toBe('author-steve-jobs');
      expect(migrated.attributionStatus).toBe('unverified');
    });
  });

  describe('corrupt localStorage data handling', () => {
    it('should start fresh when localStorage contains invalid JSON', () => {
      store[STORAGE_KEY] = 'NOT_VALID_JSON{{{{';

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [FavoritesService] });
      const newService = TestBed.inject(FavoritesService);

      expect(newService.getFavorites().length).toBe(0);
      expect(newService.favoritesCount()).toBe(0);
      expect(newService.loadStatus()).toBe('invalid');
      expect(newService.loadWarning()).toContain('could not read the saved quotes');
    });

    it('treats an empty stored string as invalid data rather than a never-used list', () => {
      store[STORAGE_KEY] = '';

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [FavoritesService] });
      const newService = TestBed.inject(FavoritesService);

      expect(newService.getFavorites()).toEqual([]);
      expect(newService.loadStatus()).toBe('invalid');
    });

    it('should start fresh when localStorage contains a non-array JSON value', () => {
      store[STORAGE_KEY] = JSON.stringify({ notAnArray: true });

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [FavoritesService] });
      const newService = TestBed.inject(FavoritesService);

      expect(newService.getFavorites().length).toBe(0);
      expect(newService.loadStatus()).toBe('invalid');
      expect(newService.loadWarning()).toContain('started with an empty list');
    });

    it('should skip invalid items and keep valid ones when array has mixed data', () => {
      const validItem: FavoriteQuote = {
        id: 'quote-a11d',
        authorId: 'author-author',
        text: 'Valid quote',
        author: 'Author',
        category: 'Cat',
        attributionStatus: 'unverified',
        savedAt: 1700000000000,
      };
      const invalidItem = { id: 123, text: null };
      store[STORAGE_KEY] = JSON.stringify([validItem, invalidItem]);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [FavoritesService] });
      const newService = TestBed.inject(FavoritesService);

      expect(newService.getFavorites().length).toBe(1);
      expect(newService.getFavorites()[0].id).toBe('quote-a11d');
      expect(newService.loadStatus()).toBe('partial');
      expect(newService.loadWarning()).toContain('A few saved quotes could not be read');
    });

    it('keeps one copy and reports a partial load when saved IDs are duplicated', () => {
      const duplicate: FavoriteQuote = {
        id: 'quote-dedade',
        authorId: 'author-author',
        text: 'One copy',
        author: 'Author',
        category: 'Cat',
        attributionStatus: 'unverified',
        savedAt: 1700000000000,
      };
      store[STORAGE_KEY] = JSON.stringify([duplicate, duplicate]);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [FavoritesService] });
      const newService = TestBed.inject(FavoritesService);

      expect(newService.getFavorites()).toEqual([duplicate]);
      expect(newService.loadStatus()).toBe('partial');
    });

    it('does not migrate a malformed foundation record as a legacy favorite', () => {
      store[STORAGE_KEY] = JSON.stringify([
        {
          id: 'quote-broken',
          authorId: 'author-author',
          text: 'Broken provenance',
          author: 'Author',
          category: 'Cat',
          attributionStatus: 'sourced',
          savedAt: 1700000000000,
        },
      ]);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [FavoritesService] });
      const newService = TestBed.inject(FavoritesService);

      expect(newService.getFavorites()).toEqual([]);
      expect(newService.loadStatus()).toBe('invalid');
    });

    it('applies the live quote contract to current-schema favorites', () => {
      const invalidCurrentRecords = [
        {
          id: 'abc123',
          authorId: 'author-author',
          text: 'Bad stable ID',
          author: 'Author',
          category: 'Cat',
          attributionStatus: 'unverified',
          savedAt: 1700000000000,
        },
        {
          id: 'quote-abc123',
          authorId: 'Bad Author ID',
          text: 'Bad author ID',
          author: 'Author',
          category: 'Cat',
          attributionStatus: 'unverified',
          savedAt: 1700000000000,
        },
        {
          id: 'quote-abc123',
          authorId: 'author-author',
          text: 'Disallowed source',
          author: 'Author',
          category: 'Cat',
          attributionStatus: 'sourced',
          source: { citation: 'Bad source', url: 'https://the.hitchcock.zone/wiki/Bad_source' },
          savedAt: 1700000000000,
        },
      ];

      for (const record of invalidCurrentRecords) {
        store[STORAGE_KEY] = JSON.stringify([record]);
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [FavoritesService] });
        const newService = TestBed.inject(FavoritesService);

        expect(newService.getFavorites()).toEqual([]);
        expect(newService.loadStatus()).toBe('invalid');
      }
    });

    it('reports browser storage as unavailable when getItem throws', () => {
      (localStorage.getItem as jasmine.Spy).and.throwError('SecurityError');

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [FavoritesService] });
      const newService = TestBed.inject(FavoritesService);

      expect(newService.getFavorites()).toEqual([]);
      expect(newService.loadStatus()).toBe('unavailable');
      expect(newService.loadWarning()).toContain('not available from this browser');
    });

    it('keeps a load warning separate from a later durable write result', () => {
      store[STORAGE_KEY] = '{broken-json';

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [FavoritesService] });
      const newService = TestBed.inject(FavoritesService);

      const result = newService.addFavorite(mockQuote);

      expect(result.persistence).toBe('durable');
      expect(newService.loadStatus()).toBe('invalid');
      expect(newService.loadWarning()).toContain('could not read the saved quotes');
    });
  });

  describe('localStorage QuotaExceededError handling', () => {
    it('keeps an added favorite for the session and reports when storage is full', () => {
      (localStorage.setItem as jasmine.Spy).and.throwError('QuotaExceededError');

      const result = service.addFavorite(mockQuote);

      expect(result).toEqual({ favorited: true, persistence: 'session-only', changed: true });
      expect(service.getFavorites().length).toBe(1);
      expect(service.favoritesCount()).toBe(1);
    });

    it('keeps a removal for the session and reports when storage cannot be updated', () => {
      service.addFavorite(mockQuote);
      const durablyStored = store[STORAGE_KEY];
      (localStorage.setItem as jasmine.Spy).and.throwError('SecurityError');

      const result = service.removeFavorite(mockQuote.id);

      expect(result).toEqual({ favorited: false, persistence: 'session-only', changed: true });
      expect(service.getFavorites()).toEqual([]);
      expect(service.favoritesCount()).toBe(0);
      expect(store[STORAGE_KEY]).toBe(durablyStored);
      expect((JSON.parse(store[STORAGE_KEY]) as FavoriteQuote[]).length).toBe(1);
    });
  });
});
