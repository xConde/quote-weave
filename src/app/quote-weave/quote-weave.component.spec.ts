import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { WritableSignal } from '@angular/core';
import { QuoteWeaveComponent } from './quote-weave.component';
import {
  Quote,
  QuoteCollectionService,
  QuoteDataError,
  validateQuotesPayload,
} from './services/quote-collection.service';
import { WikipediaService } from './services/wikipedia.service';
import { FavoritesService } from './services/favorites.service';
import { QuoteSettingsService } from './services/quote-settings.service';
import { ShareCardRendererService, ShareCardState } from './services/share-card-renderer.service';
import { TypewriterEngineService } from './services/typewriter-engine.service';
import { QuoteMapService } from './services/quote-map.service';
import { QUOTE_MAP_DATA_URL } from './services/quote-data.urls';
import committedMapData from '../../assets/data/quote-map.json';
import committedQuotesData from '../../assets/data/quotes.json';
import { of, Subject, throwError } from 'rxjs';

interface EngineInternals {
  _currentQuote: WritableSignal<Quote | null>;
  _displayedText: WritableSignal<string>;
  _typingComplete: WritableSignal<boolean>;
}

interface ShareCardRendererInternals {
  _state: WritableSignal<ShareCardState>;
}

function setEngineState(
  engine: TypewriterEngineService,
  partial: { currentQuote?: Quote | null; displayedText?: string; typingComplete?: boolean }
): void {
  const internals = engine as unknown as EngineInternals;
  if (partial.currentQuote !== undefined) internals._currentQuote.set(partial.currentQuote);
  if (partial.displayedText !== undefined) internals._displayedText.set(partial.displayedText);
  if (partial.typingComplete !== undefined) internals._typingComplete.set(partial.typingComplete);
}

describe('QuoteWeaveComponent', () => {
  let component: QuoteWeaveComponent;
  let fixture: ComponentFixture<QuoteWeaveComponent>;
  let quoteCollectionService: jasmine.SpyObj<QuoteCollectionService>;
  let favoritesService: FavoritesService;

  const mockQuotes: Quote[] = [
    {
      id: 'quote-one',
      authorId: 'author-one',
      text: 'Test quote one',
      author: 'Author One',
      category: 'Programming',
      attributionStatus: 'unverified',
    },
    {
      id: 'quote-two',
      authorId: 'author-two',
      text: 'Test quote two',
      author: 'Author Two',
      category: 'Philosophy',
      attributionStatus: 'unverified',
    },
  ];

  beforeEach(async () => {
    const quoteCollectionSpy = jasmine.createSpyObj('QuoteCollectionService', [
      'getQuotes',
      'reloadQuotes',
      'shuffleArray',
      'initWithQuotes',
      'advance',
      'previous',
      'pushHistory',
      'getFilteredQuotes',
      'setCategory',
      'setFilteredQuotes',
    ]);

    await TestBed.configureTestingModule({
      imports: [QuoteWeaveComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
      .overrideComponent(QuoteWeaveComponent, {
        set: {
          providers: [
            { provide: QuoteCollectionService, useValue: quoteCollectionSpy },
            WikipediaService,
            FavoritesService,
            QuoteSettingsService,
            ShareCardRendererService,
            TypewriterEngineService,
            QuoteMapService,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(QuoteWeaveComponent);
    component = fixture.componentInstance;
    quoteCollectionService = fixture.debugElement.injector.get(
      QuoteCollectionService
    ) as jasmine.SpyObj<QuoteCollectionService>;
    favoritesService = fixture.debugElement.injector.get(FavoritesService);

    // Default spy behavior
    quoteCollectionService.shuffleArray.and.callFake(<T>(arr: T[]) => arr);
    quoteCollectionService.initWithQuotes.and.stub();
    quoteCollectionService.setCategory.and.stub();
    quoteCollectionService.setFilteredQuotes.and.stub();
    quoteCollectionService.getFilteredQuotes.and.returnValue([]);
    quoteCollectionService.reloadQuotes.and.returnValue(of(mockQuotes));
    // Default activeCategory to null (no active filter)
    Object.defineProperty(quoteCollectionService, 'activeCategory', {
      get: () => null,
      configurable: true,
    });
    // Default allCategories to [] so the categorySummaries getter doesn't crash
    Object.defineProperty(quoteCollectionService, 'allCategories', {
      get: () => [],
      configurable: true,
    });
  });

  afterEach(() => {
    // DisposableTimerCollection and takeUntilDestroyed handle cleanup automatically
    component.ngOnDestroy();
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('presents the collection as a restrained reader archive', () => {
      quoteCollectionService.getQuotes.and.returnValue(of(mockQuotes));
      const engine = fixture.debugElement.injector.get(TypewriterEngineService);
      setEngineState(engine, { currentQuote: mockQuotes[0] });
      fixture.detectChanges();

      const masthead = fixture.nativeElement.querySelector('.reader-masthead');
      expect(masthead.querySelector('h1').textContent).toContain('Quote Weave');
      expect(masthead.querySelector('.edition-subtitle').textContent).toContain('slow reader for borrowed words');
      expect(masthead.querySelector('.edition-note')).toBeNull();
      expect(masthead.querySelector('.edition-category').textContent.trim()).toBe('Programming');
    });

    it('should load quotes on init', fakeAsync(() => {
      quoteCollectionService.getQuotes.and.returnValue(of(mockQuotes));

      component.ngOnInit();
      tick();

      expect(quoteCollectionService.getQuotes).toHaveBeenCalled();
      expect(quoteCollectionService.shuffleArray).toHaveBeenCalledWith(mockQuotes);
      expect(component.quotes()).toEqual(mockQuotes);
    }));

    it('should handle quote loading error', fakeAsync(() => {
      quoteCollectionService.getQuotes.and.returnValue(throwError(() => new Error('Failed to load')));
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      expect(component.quotes()).toEqual([]);
      expect(component.quoteLoadState()).toBe('error');
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('could not be reached');
      expect(fixture.nativeElement.querySelector('.retry-load-btn')).toBeTruthy();
    }));

    it('shows an honest empty-collection error instead of a blank reader', fakeAsync(() => {
      quoteCollectionService.getQuotes.and.returnValue(of([]));
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      expect(component.quoteLoadState()).toBe('error');
      expect(component.showContainer()).toBeFalse();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('did not contain any quotes');
    }));

    it('shows malformed-data recovery copy from the validated service boundary', fakeAsync(() => {
      quoteCollectionService.getQuotes.and.returnValue(throwError(() => new QuoteDataError('malformed')));
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      expect(component.quoteLoadState()).toBe('error');
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('format check');
    }));

    it('retries through a fresh HTTP observable and starts the reader after recovery', fakeAsync(() => {
      quoteCollectionService.getQuotes.and.returnValue(throwError(() => new Error('offline')));
      quoteCollectionService.reloadQuotes.and.returnValue(of(mockQuotes));
      fixture.detectChanges();
      tick();
      fixture.detectChanges();
      expect(component.quoteLoadState()).toBe('error');

      fixture.nativeElement.querySelector('.retry-load-btn').click();
      tick(500);
      fixture.detectChanges();

      expect(quoteCollectionService.reloadQuotes).toHaveBeenCalled();
      expect(component.quoteLoadState()).toBe('ready');
      expect(component.showContainer()).toBeTrue();
      expect(component.quotes()).toEqual(mockQuotes);
    }));

    it('reserves the card footprint with a paper-toned skeleton while quotes are loading', () => {
      const neverResolves = new Subject<Quote[]>();
      quoteCollectionService.getQuotes.and.returnValue(neverResolves.asObservable());
      fixture.detectChanges();

      expect(component.quoteLoadState()).toBe('loading');
      const loadingSection = fixture.nativeElement.querySelector('.loading-state');
      expect(loadingSection).withContext('loading-state section should render').toBeTruthy();
      expect(loadingSection.classList).toContain('loading-state--skeleton');
      expect(fixture.nativeElement.querySelector('.quote-skeleton')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.quote-skeleton-card')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.quote-skeleton-nav')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.quote-skeleton-tools')).toBeTruthy();
      // The accessible loading announcement stays in the DOM (sr-only), not the
      // real quote card — nothing should have popped in yet.
      expect(loadingSection.textContent).toContain('Loading the quote collection');
      expect(fixture.nativeElement.querySelector('qw-quotes-stream')).toBeNull();
    });
  });

  describe('Typewriter delegation to engine', () => {
    let engine: TypewriterEngineService;

    beforeEach(() => {
      component.quotes.set(mockQuotes);
      engine = fixture.debugElement.injector.get(TypewriterEngineService);
    });

    it('skipToNextQuote() delegates to engine.skip()', () => {
      const spy = spyOn(engine, 'skip');
      component.skipToNextQuote();
      expect(spy).toHaveBeenCalled();
    });

    it('goToPreviousQuote() delegates to engine.goToPrevious()', () => {
      const spy = spyOn(engine, 'goToPrevious');
      component.goToPreviousQuote();
      expect(spy).toHaveBeenCalled();
    });

    it('engine signals drive component readonly aliases', () => {
      expect(component.displayedText).toBe(engine.displayedText);
      expect(component.currentQuoteData).toBe(engine.currentQuote);
      expect(component.typingComplete).toBe(engine.typingComplete);
      expect(component.autoCyclePaused).toBe(engine.autoCyclePaused);
      expect(component.isInitialAnimation).toBe(engine.isInitialAnimation);
    });
  });

  // Scroll handling (onWheel, checkScrollPosition, scrollToBottom), category
  // class slug generation (renamed `categoryClass`), real-person author check
  // (renamed `onAuthorKeydownSpace`), and the icon cache all moved into
  // QuotesStreamComponent. Their behavioral coverage lives in
  // components/quotes-stream/quotes-stream.component.spec.ts.

  describe('Wikipedia Integration', () => {
    it('should generate Wikipedia page name from author', () => {
      expect(component.getWikipediaPageName('Albert Einstein')).toBe('Albert_Einstein');
    });

    it('should handle multi-word author names', () => {
      expect(component.getWikipediaPageName('Martin Luther King Jr.')).toBe('Martin_Luther_King_Jr.');
    });

    it('isRealPersonFn delegates to WikipediaService', () => {
      expect(component.isRealPersonFn('Martin Fowler')).toBe(true);
      expect(component.isRealPersonFn('Programming Wisdom')).toBe(false);
    });

    it('should open wiki panel when author link clicked', () => {
      component.openAuthorWiki('Test Author');
      expect(component.panelOpen()).toBe(true);
      expect(component.loadingWiki()).toBe(true);
      expect(component.autoCyclePaused()).toBe(true);
    });

    it('should close panel and resume typing', fakeAsync(() => {
      const engine = fixture.debugElement.injector.get(TypewriterEngineService);
      component.panelOpen.set(true);
      component.wikiContent.set('Some content');
      component.quotes.set(mockQuotes);
      setEngineState(engine, {
        currentQuote: mockQuotes[0],
        displayedText: mockQuotes[0].text,
        typingComplete: true,
      });
      engine.pause();

      component.closePanel();
      tick(100);

      expect(component.panelOpen()).toBe(false);
      expect(component.wikiContent()).toBeNull();
      expect(component.autoCyclePaused()).toBe(false);
      engine.ngOnDestroy();
    }));
  });

  describe('Cleanup', () => {
    it('should clean up resources on destroy', () => {
      // DisposableTimerCollection and takeUntilDestroyed handle cleanup automatically
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });

  describe('favorite persistence feedback', () => {
    beforeEach(() => {
      quoteCollectionService.getQuotes.and.returnValue(of(mockQuotes));
      fixture.detectChanges();
      component.showContainer.set(true);
      component.quoteLoadState.set('ready');
    });

    it('shows honest session-only save and remove notices, then clears them after a durable mutation', () => {
      spyOn(favoritesService, 'toggleFavorite').and.returnValues(
        { favorited: true, persistence: 'session-only', changed: true },
        { favorited: false, persistence: 'session-only', changed: true },
        { favorited: true, persistence: 'durable', changed: true }
      );

      component.toggleFavorite(mockQuotes[0]);
      fixture.detectChanges();
      const notice = fixture.nativeElement.querySelector('.favorite-persistence-notice');
      expect(notice.getAttribute('role')).toBe('status');
      expect(notice.getAttribute('aria-live')).toBe('polite');
      expect(notice.classList.contains('is-visible')).toBeTrue();
      expect(notice.textContent).toContain('Saved for this visit only');

      component.toggleFavorite(mockQuotes[0]);
      fixture.detectChanges();
      expect(notice.textContent).toContain('Removed for this visit only');

      component.toggleFavorite(mockQuotes[0]);
      fixture.detectChanges();
      expect(component.favoritePersistenceNotice()).toBeNull();
      expect(notice.classList.contains('is-visible')).toBeFalse();
    });

    it('binds the saved-data load warning separately from mutation feedback', () => {
      expect(component.favoriteLoadWarning).toBe(favoritesService.loadWarning);
      expect(component.favoritePersistenceNotice()).toBeNull();
    });
  });

  // Note: typewriter behavioral details (race conditions, character duplication,
  // empty quotes, index wrap-around, paused-no-op) live in
  // typewriter-engine.service.spec.ts. The component spec only tests delegation
  // and integration glue.

  // ---------------------------------------------------------------------------
  // Category Browser
  // ---------------------------------------------------------------------------

  describe('Category Browser', () => {
    beforeEach(() => {
      component.quotes.set(mockQuotes);
    });

    it('toggleCategoryBrowser() should flip showCategoryBrowser from false to true', () => {
      expect(component.showCategoryBrowser()).toBe(false);
      component.toggleCategoryBrowser();
      expect(component.showCategoryBrowser()).toBe(true);
    });

    it('toggleCategoryBrowser() should flip showCategoryBrowser from true to false', () => {
      component.showCategoryBrowser.set(true);
      component.toggleCategoryBrowser();
      expect(component.showCategoryBrowser()).toBe(false);
    });

    it('closeCategoryBrowser() should always set showCategoryBrowser to false', () => {
      component.showCategoryBrowser.set(true);
      component.closeCategoryBrowser();
      expect(component.showCategoryBrowser()).toBe(false);
    });

    it('selectCategory() should call setCategory with the chosen category', () => {
      component.selectCategory('Programming');
      expect(quoteCollectionService.setCategory).toHaveBeenCalledWith('Programming');
    });

    it('selectCategory() should close the category browser', () => {
      component.showCategoryBrowser.set(true);
      component.selectCategory('Philosophy');
      expect(component.showCategoryBrowser()).toBe(false);
    });

    it('selectCategory() resets the engine pool and starts the new pool at index 0', () => {
      const engine = fixture.debugElement.injector.get(TypewriterEngineService);
      const resetSpy = spyOn(engine, 'resetForNewPool').and.callThrough();
      const startSpy = spyOn(engine, 'startNext').and.callThrough();
      component.quotes.set(mockQuotes);
      quoteCollectionService.getFilteredQuotes.and.returnValue([mockQuotes[1]]);
      Object.defineProperty(quoteCollectionService, 'activeCategory', {
        get: () => 'Philosophy',
        configurable: true,
      });
      component.selectCategory('Philosophy');
      expect(resetSpy).toHaveBeenCalled();
      expect(startSpy).toHaveBeenCalled();
      // Engine consumed pool[0] which is mockQuotes[1] in the filtered set
      expect(component.currentQuoteData()).toEqual(mockQuotes[1]);
    });

    it('selectCategory() should start typing the next quote immediately', fakeAsync(() => {
      component.quotes.set(mockQuotes);
      component.selectCategory('Programming');
      tick(10);
      expect(component.currentQuoteData()).toBeDefined();
      const engine = fixture.debugElement.injector.get(TypewriterEngineService);
      engine.ngOnDestroy();
    }));

    it('selectCategory(null) restores the shuffled full corpus to the active pool', () => {
      component.quotes.set(mockQuotes);

      component.selectCategory(null);

      expect(quoteCollectionService.shuffleArray).toHaveBeenCalledWith(mockQuotes);
      expect(quoteCollectionService.setFilteredQuotes).toHaveBeenCalledOnceWith(mockQuotes);
    });

    it('selectCategory(category) should call setFilteredQuotes with shuffled filtered quotes', () => {
      component.quotes.set(mockQuotes);
      component.selectCategory('Programming');
      expect(quoteCollectionService.setFilteredQuotes).toHaveBeenCalled();
    });

    it('clears an active shelf before a cross-category Threads or neighbor jump', () => {
      component.quotes.set(mockQuotes);
      Object.defineProperty(quoteCollectionService, 'activeCategory', {
        get: () => 'Programming',
        configurable: true,
      });
      const engine = fixture.debugElement.injector.get(TypewriterEngineService);
      const jumpSpy = spyOn(engine, 'jumpTo');
      quoteCollectionService.setCategory.calls.reset();

      component.jumpToQuote(mockQuotes[1]);

      expect(quoteCollectionService.setCategory).toHaveBeenCalledOnceWith(null);
      expect(quoteCollectionService.shuffleArray).toHaveBeenCalledWith(mockQuotes);
      expect(quoteCollectionService.setFilteredQuotes).toHaveBeenCalledOnceWith(mockQuotes);
      expect(jumpSpy).toHaveBeenCalledOnceWith(mockQuotes[1]);
    });

    it('keeps an active shelf when a Threads or neighbor jump stays in that category', () => {
      Object.defineProperty(quoteCollectionService, 'activeCategory', {
        get: () => 'Programming',
        configurable: true,
      });
      const engine = fixture.debugElement.injector.get(TypewriterEngineService);
      const jumpSpy = spyOn(engine, 'jumpTo');
      quoteCollectionService.setCategory.calls.reset();
      quoteCollectionService.setFilteredQuotes.calls.reset();

      component.jumpToQuote(mockQuotes[0]);

      expect(quoteCollectionService.setCategory).not.toHaveBeenCalled();
      expect(quoteCollectionService.setFilteredQuotes).not.toHaveBeenCalled();
      expect(jumpSpy).toHaveBeenCalledOnceWith(mockQuotes[0]);
    });
  });

  // ---------------------------------------------------------------------------
  // Reading Controls
  // ---------------------------------------------------------------------------

  describe('Reading Controls', () => {
    let store: Record<string, string>;

    beforeEach(() => {
      store = {};
      spyOn(localStorage, 'getItem').and.callFake((key: string): string | null => store[key] ?? null);
      spyOn(localStorage, 'setItem').and.callFake((key: string, value: string): void => {
        store[key] = value;
      });
    });

    it('toggleReadingControls() should flip showReadingControls', () => {
      expect(component.showReadingControls()).toBe(false);
      component.toggleReadingControls();
      expect(component.showReadingControls()).toBe(true);
      component.toggleReadingControls();
      expect(component.showReadingControls()).toBe(false);
    });

    it('closeReadingControls() should set showReadingControls to false', () => {
      component.showReadingControls.set(true);
      component.closeReadingControls();
      expect(component.showReadingControls()).toBe(false);
    });

    it('setTypingSpeed() should delegate to QuoteSettingsService and update the signal', () => {
      component.setTypingSpeed(25);
      expect(component.settings().typingSpeedMs).toBe(25);
    });

    it('setAutoAdvance() should delegate to QuoteSettingsService and update the signal', () => {
      component.setAutoAdvance(false);
      expect(component.settings().autoAdvance).toBe(false);
      component.setAutoAdvance(true);
      expect(component.settings().autoAdvance).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Keyboard Shortcuts
  // ---------------------------------------------------------------------------

  describe('Keyboard Shortcuts', () => {
    function makeKeyEvent(key: string, targetTag = 'BODY', init: KeyboardEventInit = {}): KeyboardEvent {
      const target = document.createElement(targetTag.toLowerCase());
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      Object.defineProperty(event, 'target', { value: target });
      return event;
    }

    beforeEach(() => {
      component.quotes.set(mockQuotes);
    });

    describe('ArrowRight / Space — skipToNextQuote', () => {
      it('ArrowRight calls skipToNextQuote()', () => {
        spyOn(component, 'skipToNextQuote');
        component.onKeydown(makeKeyEvent('ArrowRight'));
        expect(component.skipToNextQuote).toHaveBeenCalled();
      });

      it('Space calls skipToNextQuote()', () => {
        spyOn(component, 'skipToNextQuote');
        component.onKeydown(makeKeyEvent(' '));
        expect(component.skipToNextQuote).toHaveBeenCalled();
      });

      it('ArrowRight does NOT call skipToNextQuote when category browser is open', () => {
        spyOn(component, 'skipToNextQuote');
        component.showCategoryBrowser.set(true);
        component.onKeydown(makeKeyEvent('ArrowRight'));
        expect(component.skipToNextQuote).not.toHaveBeenCalled();
      });
    });

    describe('ArrowLeft — goToPreviousQuote', () => {
      it('ArrowLeft calls goToPreviousQuote()', () => {
        spyOn(component, 'goToPreviousQuote');
        component.onKeydown(makeKeyEvent('ArrowLeft'));
        expect(component.goToPreviousQuote).toHaveBeenCalled();
      });

      it('ArrowLeft does NOT call goToPreviousQuote when wiki panel is open', () => {
        spyOn(component, 'goToPreviousQuote');
        component.panelOpen.set(true);
        component.onKeydown(makeKeyEvent('ArrowLeft'));
        expect(component.goToPreviousQuote).not.toHaveBeenCalled();
      });
    });

    describe('"f" — toggle favorite', () => {
      let engine: TypewriterEngineService;

      beforeEach(() => {
        engine = fixture.debugElement.injector.get(TypewriterEngineService);
      });

      it('f toggles favorite when typingComplete and currentQuoteData is set', () => {
        setEngineState(engine, { typingComplete: true, currentQuote: mockQuotes[0] });
        spyOn(favoritesService, 'toggleFavorite').and.returnValue({
          favorited: true,
          persistence: 'durable',
          changed: true,
        });
        component.onKeydown(makeKeyEvent('f'));
        expect(favoritesService.toggleFavorite).toHaveBeenCalledWith(mockQuotes[0]);
      });

      it('F (uppercase) also toggles favorite', () => {
        setEngineState(engine, { typingComplete: true, currentQuote: mockQuotes[0] });
        spyOn(favoritesService, 'toggleFavorite').and.returnValue({
          favorited: true,
          persistence: 'durable',
          changed: true,
        });
        component.onKeydown(makeKeyEvent('F'));
        expect(favoritesService.toggleFavorite).toHaveBeenCalledWith(mockQuotes[0]);
      });

      it('f does NOT toggle favorite when typingComplete is false', () => {
        setEngineState(engine, { typingComplete: false, currentQuote: mockQuotes[0] });
        spyOn(favoritesService, 'toggleFavorite');
        component.onKeydown(makeKeyEvent('f'));
        expect(favoritesService.toggleFavorite).not.toHaveBeenCalled();
      });

      it('f does NOT toggle favorite when currentQuoteData is null', () => {
        setEngineState(engine, { typingComplete: true, currentQuote: null });
        spyOn(favoritesService, 'toggleFavorite');
        component.onKeydown(makeKeyEvent('f'));
        expect(favoritesService.toggleFavorite).not.toHaveBeenCalled();
      });

      it('f does NOT toggle favorite when a panel is open', () => {
        setEngineState(engine, { typingComplete: true, currentQuote: mockQuotes[0] });
        component.showSharePreview.set(true);
        spyOn(favoritesService, 'toggleFavorite');
        component.onKeydown(makeKeyEvent('f'));
        expect(favoritesService.toggleFavorite).not.toHaveBeenCalled();
      });
    });

    describe('"c" — toggle category browser', () => {
      it('c toggles the category browser', () => {
        spyOn(component, 'toggleCategoryBrowser');
        component.onKeydown(makeKeyEvent('c'));
        expect(component.toggleCategoryBrowser).toHaveBeenCalled();
      });

      it('C (uppercase) also toggles the category browser', () => {
        spyOn(component, 'toggleCategoryBrowser');
        component.onKeydown(makeKeyEvent('C'));
        expect(component.toggleCategoryBrowser).toHaveBeenCalled();
      });

      it('c does NOT toggle when wiki panel is open', () => {
        spyOn(component, 'toggleCategoryBrowser');
        component.panelOpen.set(true);
        component.onKeydown(makeKeyEvent('c'));
        expect(component.toggleCategoryBrowser).not.toHaveBeenCalled();
      });

      it('c does NOT toggle when share preview is open', () => {
        spyOn(component, 'toggleCategoryBrowser');
        component.showSharePreview.set(true);
        component.onKeydown(makeKeyEvent('c'));
        expect(component.toggleCategoryBrowser).not.toHaveBeenCalled();
      });
    });

    describe('"s" — toggle reading controls', () => {
      it('s toggles reading controls', () => {
        spyOn(component, 'toggleReadingControls');
        component.onKeydown(makeKeyEvent('s'));
        expect(component.toggleReadingControls).toHaveBeenCalled();
      });

      it('S (uppercase) also toggles reading controls', () => {
        spyOn(component, 'toggleReadingControls');
        component.onKeydown(makeKeyEvent('S'));
        expect(component.toggleReadingControls).toHaveBeenCalled();
      });

      it('s does NOT toggle when wiki panel is open', () => {
        spyOn(component, 'toggleReadingControls');
        component.panelOpen.set(true);
        component.onKeydown(makeKeyEvent('s'));
        expect(component.toggleReadingControls).not.toHaveBeenCalled();
      });
    });

    describe('"?" — toggle keyboard help', () => {
      it('? sets showKeyboardHelp to true when currently false', () => {
        component.showKeyboardHelp.set(false);
        component.onKeydown(makeKeyEvent('?'));
        expect(component.showKeyboardHelp()).toBe(true);
      });

      it('? sets showKeyboardHelp to false when currently true', () => {
        component.showKeyboardHelp.set(true);
        component.onKeydown(makeKeyEvent('?'));
        expect(component.showKeyboardHelp()).toBe(false);
      });
    });

    describe('Escape — close topmost panel', () => {
      it('Escape closes wiki panel when panelOpen is true', () => {
        component.panelOpen.set(true);
        component.showCategoryBrowser.set(true);
        spyOn(component, 'closePanel');
        component.onKeydown(makeKeyEvent('Escape'));
        expect(component.closePanel).toHaveBeenCalled();
      });

      it('Escape closes share preview when panelOpen is false but showSharePreview is true', () => {
        component.panelOpen.set(false);
        component.showSharePreview.set(true);
        component.showCategoryBrowser.set(true);
        spyOn(component, 'closeSharePreview');
        component.onKeydown(makeKeyEvent('Escape'));
        expect(component.closeSharePreview).toHaveBeenCalled();
      });

      it('Escape closes category browser when it is the topmost panel', () => {
        component.panelOpen.set(false);
        component.showSharePreview.set(false);
        component.showCategoryBrowser.set(true);
        component.showReadingControls.set(true);
        spyOn(component, 'closeCategoryBrowser');
        component.onKeydown(makeKeyEvent('Escape'));
        expect(component.closeCategoryBrowser).toHaveBeenCalled();
      });

      it('Escape closes reading controls when it is the topmost panel', () => {
        component.panelOpen.set(false);
        component.showSharePreview.set(false);
        component.showCategoryBrowser.set(false);
        component.showReadingControls.set(true);
        component.showKeyboardHelp.set(true);
        spyOn(component, 'closeReadingControls');
        component.onKeydown(makeKeyEvent('Escape'));
        expect(component.closeReadingControls).toHaveBeenCalled();
      });

      it('Escape closes keyboard help when it is the only panel open', () => {
        component.panelOpen.set(false);
        component.showSharePreview.set(false);
        component.showCategoryBrowser.set(false);
        component.showReadingControls.set(false);
        component.showKeyboardHelp.set(true);
        component.onKeydown(makeKeyEvent('Escape'));
        expect(component.showKeyboardHelp()).toBe(false);
      });

      it('Escape does NOT call stopPropagation when no panels are open', () => {
        component.panelOpen.set(false);
        component.showSharePreview.set(false);
        component.showCategoryBrowser.set(false);
        component.showReadingControls.set(false);
        component.showKeyboardHelp.set(false);
        const event = makeKeyEvent('Escape');
        spyOn(event, 'stopPropagation');
        component.onKeydown(event);
        expect(event.stopPropagation).not.toHaveBeenCalled();
      });

      it('Escape calls stopPropagation when a panel is closed', () => {
        component.showCategoryBrowser.set(true);
        const event = makeKeyEvent('Escape');
        spyOn(event, 'stopPropagation');
        component.onKeydown(event);
        expect(event.stopPropagation).toHaveBeenCalled();
      });
    });

    describe('Input/Textarea/Select guard', () => {
      it('shortcuts do NOT fire when target is INPUT', () => {
        spyOn(component, 'skipToNextQuote');
        component.onKeydown(makeKeyEvent('ArrowRight', 'INPUT'));
        expect(component.skipToNextQuote).not.toHaveBeenCalled();
      });

      it('shortcuts do NOT fire when target is TEXTAREA', () => {
        spyOn(component, 'skipToNextQuote');
        component.onKeydown(makeKeyEvent('ArrowRight', 'TEXTAREA'));
        expect(component.skipToNextQuote).not.toHaveBeenCalled();
      });

      it('shortcuts do NOT fire when target is SELECT', () => {
        spyOn(component, 'skipToNextQuote');
        component.onKeydown(makeKeyEvent('ArrowRight', 'SELECT'));
        expect(component.skipToNextQuote).not.toHaveBeenCalled();
      });

      it('shortcuts DO fire when target is a DIV (non-input element)', () => {
        spyOn(component, 'skipToNextQuote');
        component.onKeydown(makeKeyEvent('ArrowRight', 'DIV'));
        expect(component.skipToNextQuote).toHaveBeenCalled();
      });

      it('keyboard help shortcut does NOT fire when target is INPUT', () => {
        component.showKeyboardHelp.set(false);
        component.onKeydown(makeKeyEvent('?', 'INPUT'));
        expect(component.showKeyboardHelp()).toBe(false);
      });
    });

    describe('browser and operating-system shortcut guard', () => {
      it('does not toggle a favorite for Cmd/Ctrl+F', () => {
        const engine = fixture.debugElement.injector.get(TypewriterEngineService);
        setEngineState(engine, { typingComplete: true, currentQuote: mockQuotes[0] });
        spyOn(favoritesService, 'toggleFavorite');

        component.onKeydown(makeKeyEvent('f', 'BODY', { metaKey: true }));
        component.onKeydown(makeKeyEvent('f', 'BODY', { ctrlKey: true }));

        expect(favoritesService.toggleFavorite).not.toHaveBeenCalled();
      });

      it('does not open Shelves or Pace for modified C/S shortcuts', () => {
        spyOn(component, 'toggleCategoryBrowser');
        spyOn(component, 'toggleReadingControls');

        component.onKeydown(makeKeyEvent('c', 'BODY', { metaKey: true }));
        component.onKeydown(makeKeyEvent('c', 'BODY', { ctrlKey: true }));
        component.onKeydown(makeKeyEvent('s', 'BODY', { altKey: true }));

        expect(component.toggleCategoryBrowser).not.toHaveBeenCalled();
        expect(component.toggleReadingControls).not.toHaveBeenCalled();
      });
    });

    describe('showKeyboardHelp dismissal on non-? keys', () => {
      it('pressing a non-? key while help is shown dismisses help and still triggers action', () => {
        component.showKeyboardHelp.set(true);
        spyOn(component, 'skipToNextQuote');
        component.onKeydown(makeKeyEvent('ArrowRight'));
        expect(component.showKeyboardHelp()).toBe(false);
        expect(component.skipToNextQuote).toHaveBeenCalled();
      });

      it('Tab does not dismiss help (focus trap navigation)', () => {
        component.showKeyboardHelp.set(true);
        component.onKeydown(makeKeyEvent('Tab'));
        expect(component.showKeyboardHelp()).toBe(true);
      });

      it('Shift does not dismiss help (Shift+Tab navigation)', () => {
        component.showKeyboardHelp.set(true);
        component.onKeydown(makeKeyEvent('Shift'));
        expect(component.showKeyboardHelp()).toBe(true);
      });
    });

    describe('focus return to control row (WCAG 2.4.3)', () => {
      beforeEach(() => {
        quoteCollectionService.getQuotes.and.returnValue(of(mockQuotes));
        component.quotes.set(mockQuotes);
        fixture.detectChanges();
        component.showContainer.set(true);
        component.quoteLoadState.set('ready');
        fixture.detectChanges();
      });

      it('closeFavorites() focuses the favorites button after the control row re-renders', async () => {
        component.toggleFavorites();
        fixture.detectChanges();
        component.closeFavorites();
        fixture.detectChanges();
        await fixture.whenStable();
        const btn = (fixture.nativeElement as HTMLElement).querySelector('.favorites-btn');
        expect(btn).not.toBeNull();
        expect(document.activeElement).toBe(btn);
      });

      it('closeIdeaMap() focuses the idea map button after the control row re-renders', async () => {
        component.toggleIdeaMap();
        fixture.detectChanges();
        component.closeIdeaMap();
        fixture.detectChanges();
        await fixture.whenStable();
        const btn = (fixture.nativeElement as HTMLElement).querySelector('.idea-map-btn');
        expect(btn).not.toBeNull();
        expect(document.activeElement).toBe(btn);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Share / Download
  // ---------------------------------------------------------------------------

  describe('Share / Download', () => {
    let shareCardService: ShareCardRendererService;
    let engine: TypewriterEngineService;

    beforeEach(() => {
      component.quotes.set(mockQuotes);
      shareCardService = fixture.debugElement.injector.get(ShareCardRendererService);
      engine = fixture.debugElement.injector.get(TypewriterEngineService);
      setEngineState(engine, { currentQuote: mockQuotes[0] });
    });

    it('openSharePreview() pauses engine, delegates render, and shows panel', async () => {
      const pauseSpy = spyOn(engine, 'pauseForPanel');
      const renderSpy = spyOn(shareCardService, 'render').and.returnValue(Promise.resolve());

      await component.openSharePreview(mockQuotes[0]);

      expect(pauseSpy).toHaveBeenCalled();
      expect(renderSpy).toHaveBeenCalledWith(mockQuotes[0]);
      expect(component.showSharePreview()).toBe(true);
    });

    it('closes Favorites before sharing from it without briefly resuming the reader', async () => {
      component.showFavorites.set(true);
      engine.pauseForPanel();
      const resumeSpy = spyOn(engine, 'resumeFromPanelClose');
      spyOn(shareCardService, 'render').and.returnValue(Promise.resolve());

      await component.openSharePreview(mockQuotes[0]);

      expect(component.showFavorites()).toBeFalse();
      expect(component.showSharePreview()).toBeTrue();
      expect(component.isAnyPanelOpen()).toBeTrue();
      expect(resumeSpy).not.toHaveBeenCalled();
      expect(engine.autoCyclePaused()).toBeTrue();
    });

    it('returns focus to Saved after sharing from the Saved panel', async () => {
      quoteCollectionService.getQuotes.and.returnValue(of(mockQuotes));
      fixture.detectChanges();
      component.showContainer.set(true);
      component.quoteLoadState.set('ready');
      component.showFavorites.set(true);
      fixture.detectChanges();
      spyOn(shareCardService, 'render').and.returnValue(Promise.resolve());

      await component.openSharePreview(mockQuotes[0]);
      fixture.detectChanges();
      component.closeSharePreview();
      fixture.detectChanges();
      await fixture.whenStable();

      const savedButton = (fixture.nativeElement as HTMLElement).querySelector('.favorites-btn');
      expect(savedButton).not.toBeNull();
      expect(document.activeElement).toBe(savedButton);
    });

    it('does not let a late share render reveal itself over a newer panel', async () => {
      let finishRender: (() => void) | undefined;
      spyOn(shareCardService, 'render').and.returnValue(
        new Promise<void>((resolve) => {
          finishRender = resolve;
        })
      );

      const opening = component.openSharePreview(mockQuotes[0]);
      expect(component.showSharePreview()).toBeTrue();
      component.toggleCategoryBrowser();
      expect(component.showSharePreview()).toBeFalse();
      expect(component.showCategoryBrowser()).toBeTrue();

      finishRender?.();
      await opening;
      expect(component.showSharePreview()).toBeFalse();
      expect(component.showCategoryBrowser()).toBeTrue();
    });

    it('keeps a user-scrolled reader paused after the share panel closes', async () => {
      engine.pause();
      spyOn(shareCardService, 'render').and.returnValue(Promise.resolve());

      await component.openSharePreview(mockQuotes[0]);
      component.closeSharePreview();

      expect(engine.userManuallyScrolled()).toBeTrue();
      expect(engine.autoCyclePaused()).toBeFalse();
    });

    it('closeSharePreview() hides panel and clears the renderer', () => {
      component.showSharePreview.set(true);
      setEngineState(engine, { typingComplete: true });
      const clearSpy = spyOn(shareCardService, 'clear');

      component.closeSharePreview();

      expect(component.showSharePreview()).toBe(false);
      expect(clearSpy).toHaveBeenCalled();
    });

    it('retryShareImage() rerenders a ready card whose preview failed to decode', async () => {
      const rendered = {
        status: 'ready' as const,
        quote: mockQuotes[0],
        imageUrl: 'blob:download',
        previewUrl: 'data:image/png;base64,broken',
      };
      (shareCardService as unknown as ShareCardRendererInternals)._state.set(rendered);
      const renderSpy = spyOn(shareCardService, 'render').and.returnValue(Promise.resolve());

      await component.retryShareImage();

      expect(renderSpy).toHaveBeenCalledWith(mockQuotes[0]);
    });

    it('downloadShareImage() delegates to ShareCardRendererService', () => {
      const downloadSpy = spyOn(shareCardService, 'download');
      component.downloadShareImage();
      expect(downloadSpy).toHaveBeenCalled();
    });

    it('nativeShare() surfaces a non-cancellation failure from ShareCardRendererService', async () => {
      const nativeShareSpy = spyOn(shareCardService, 'nativeShare').and.resolveTo('error');
      await component.nativeShare();
      expect(nativeShareSpy).toHaveBeenCalled();
      expect(component.nativeShareStatus()).toBe('error');
    });

    it('nativeShare() keeps normal share-sheet cancellation quiet', async () => {
      spyOn(shareCardService, 'nativeShare').and.resolveTo('cancelled');
      component.nativeShareStatus.set('error');

      await component.nativeShare();

      expect(component.nativeShareStatus()).toBe('idle');
    });

    it('nativeShare() reports a capability mismatch with fallback UI', async () => {
      spyOn(shareCardService, 'nativeShare').and.resolveTo('unavailable');

      await component.nativeShare();

      expect(component.nativeShareStatus()).toBe('unavailable');
    });
  });

  // ---------------------------------------------------------------------------
  // QuoteMapService DI sharing + relatedTo() (regression for H1 bug)
  // ---------------------------------------------------------------------------

  describe('QuoteMapService — shared instance + relatedTo()', () => {
    it('QuoteWeaveComponent resolves QuoteMapService from the IdeaMapComponent import (shared DI)', () => {
      // IdeaMapComponent is imported (not a child provider), so QuoteMapService
      // resolved inside the IdeaMapComponent tree falls through to the
      // QuoteWeaveComponent injector — the same instance the parent uses.
      // Verify the parent injector has a QuoteMapService (not null). No
      // detectChanges() here: this is a pure DI-resolution check, and triggering
      // ngOnInit would fire load()'s HTTP without flushing it (cross-spec leak).
      const parentMapService = fixture.debugElement.injector.get(QuoteMapService, null);
      expect(parentMapService).not.toBeNull();
    });

    it('ngOnInit() calls load() on the QuoteMapService so relatedTo() can return neighbors', fakeAsync(() => {
      quoteCollectionService.getQuotes.and.returnValue(of([]));
      const mapService = fixture.debugElement.injector.get(QuoteMapService);
      const loadSpy = spyOn(mapService, 'load').and.callThrough();

      component.ngOnInit();
      tick();

      expect(loadSpy).toHaveBeenCalled();
    }));

    it('relatedTo() returns non-empty list after atlas load for a quote that has neighbors', async () => {
      const http = TestBed.inject(HttpTestingController);
      const mapService = fixture.debugElement.injector.get(QuoteMapService);
      const quotes = validateQuotesPayload(committedQuotesData);
      quoteCollectionService.getQuotes.and.returnValue(of(quotes));

      component.ngOnInit();

      http.expectOne(QUOTE_MAP_DATA_URL).flush(committedMapData);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      const related = mapService.relatedTo(quotes[0]);
      const firstNeighborId = Object.entries(committedMapData.neighbors).find(
        ([quoteId]) => quoteId === quotes[0].id
      )![1][0];
      expect(related.length).toBeGreaterThan(0);
      expect(related[0].quote).toEqual(quotes.find((quote) => quote.id === firstNeighborId)!);

      http.verify();
    });
  });
});
