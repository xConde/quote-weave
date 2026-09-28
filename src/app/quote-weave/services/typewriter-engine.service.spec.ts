import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { QUOTE_HISTORY_LIMIT, TypewriterEngineService } from './typewriter-engine.service';
import { Quote } from './quote-collection.service';

const quote = (id: string, text: string, author: string, category: string): Quote => ({
  id: `quote-${id}`,
  authorId: `author-${author.toLowerCase()}`,
  text,
  author,
  category,
  attributionStatus: 'unverified',
});
const QUOTE_A = quote('a', 'abc', 'A', 'philosophy');
const QUOTE_B = quote('b', 'de', 'B', 'stoicism');
const QUOTE_C = quote('c', 'fg', 'C', 'programming');

/**
 * Build a well-typed MediaQueryList-shaped object for matchMedia spies.
 * The `addListener`/`removeListener` members are deprecated but still part of
 * the MediaQueryList interface; we provide no-op implementations to satisfy the
 * type without casting individual call sites.
 */
function makeMediaQueryList(matches: boolean, media: string): MediaQueryList {
  const mql: MediaQueryList = {
    matches,
    media,
    onchange: null,
    addEventListener: () => {
      /* noop */
    },
    removeEventListener: () => {
      /* noop */
    },
    addListener: () => {
      /* noop */
    },
    removeListener: () => {
      /* noop */
    },
    dispatchEvent: () => false,
  };
  return mql;
}

describe('TypewriterEngineService', () => {
  let service: TypewriterEngineService;
  let pool: Quote[];
  let typingSpeed: number;
  let autoAdvance: boolean;

  beforeEach(() => {
    pool = [QUOTE_A, QUOTE_B, QUOTE_C];
    typingSpeed = 50;
    autoAdvance = true;

    TestBed.configureTestingModule({ providers: [TypewriterEngineService] });
    service = TestBed.inject(TypewriterEngineService);
    service.configure({
      getTypingSpeedMs: () => typingSpeed,
      getAutoAdvance: () => autoAdvance,
      getActivePool: () => pool,
    });
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  describe('initial state', () => {
    it('exposes empty initial signals', () => {
      expect(service.displayedText()).toBe('');
      expect(service.currentQuote()).toBeNull();
      expect(service.typingComplete()).toBe(false);
      expect(service.previousQuotes()).toEqual([]);
      expect(service.autoCyclePaused()).toBe(false);
      expect(service.userManuallyScrolled()).toBe(false);
      expect(service.isInitialAnimation()).toBe(true);
    });

    it('throws if used before configure()', () => {
      const fresh = new TypewriterEngineService();
      expect(() => fresh.startNext()).toThrowError(/configure\(\)/);
    });
  });

  describe('startNext()', () => {
    it('types one character at a time at the configured speed', fakeAsync(() => {
      service.startNext();
      expect(service.currentQuote()).toEqual(QUOTE_A);
      expect(service.displayedText()).toBe('a');
      tick(typingSpeed);
      expect(service.displayedText()).toBe('ab');
      tick(typingSpeed);
      expect(service.displayedText()).toBe('abc');
      service.ngOnDestroy(); // clear pending auto-advance
    }));

    it('marks typingComplete when the full quote is rendered', fakeAsync(() => {
      service.startNext();
      tick(typingSpeed * 10);
      expect(service.typingComplete()).toBe(true);
      expect(service.displayedText()).toBe('abc');
      service.ngOnDestroy();
    }));

    it('clears isInitialAnimation after first quote completes', fakeAsync(() => {
      service.startNext();
      tick(typingSpeed * 10);
      expect(service.isInitialAnimation()).toBe(false);
      service.ngOnDestroy();
    }));

    it('appends previous quote to history when starting the next', fakeAsync(() => {
      service.startNext();
      tick(typingSpeed * 10);
      service.startNext();
      expect(service.previousQuotes()).toEqual([QUOTE_A]);
      expect(service.currentQuote()).toEqual(QUOTE_B);
      service.ngOnDestroy();
    }));

    it('is a no-op when paused', () => {
      service.pause();
      service.startNext();
      expect(service.currentQuote()).toBeNull();
    });

    it('is a no-op when pool is empty', () => {
      pool = [];
      service.startNext();
      expect(service.currentQuote()).toBeNull();
    });
  });

  describe('auto-advance', () => {
    it('advances to the next quote after pause-after-typed when enabled', fakeAsync(() => {
      service.startNext();
      tick(typingSpeed * 10);
      tick(2000);
      expect(service.currentQuote()).toEqual(QUOTE_B);
      service.ngOnDestroy();
    }));

    it('does not advance when getAutoAdvance returns false', fakeAsync(() => {
      autoAdvance = false;
      service.startNext();
      tick(typingSpeed * 10 + 2000);
      expect(service.currentQuote()).toEqual(QUOTE_A);
      service.ngOnDestroy();
    }));
  });

  describe('skip()', () => {
    it('jumps to next quote when not paused', fakeAsync(() => {
      service.startNext();
      tick(typingSpeed); // partial type
      service.skip();
      expect(service.currentQuote()).toEqual(QUOTE_B);
      service.ngOnDestroy();
    }));

    it('resumes from pause without advancing', fakeAsync(() => {
      service.startNext();
      tick(typingSpeed); // partial type — displayedText='a'
      service.pause();
      const beforeQuote = service.currentQuote();
      service.skip();
      expect(service.currentQuote()).toBe(beforeQuote);
      expect(service.autoCyclePaused()).toBe(false);
      service.ngOnDestroy();
    }));
  });

  describe('goToPrevious()', () => {
    it('restores the most recent history entry', fakeAsync(() => {
      service.startNext();
      tick(typingSpeed * 10);
      service.startNext();
      tick(typingSpeed * 10);
      // Now at QUOTE_B with history [QUOTE_A]
      service.goToPrevious();
      expect(service.currentQuote()).toEqual(QUOTE_A);
      expect(service.previousQuotes()).toEqual([]);
      service.ngOnDestroy();
    }));

    it('is a no-op when history is empty', () => {
      service.goToPrevious();
      expect(service.currentQuote()).toBeNull();
    });

    it('returns forward to the quote that was left, including across pool wrap', fakeAsync(() => {
      autoAdvance = false;
      service.startNext();
      service.startNext();
      service.startNext();
      expect(service.currentQuote()).toEqual(QUOTE_C);

      service.goToPrevious();
      expect(service.currentQuote()).toEqual(QUOTE_B);
      service.advance();
      expect(service.currentQuote()).toEqual(QUOTE_C);

      service.advance();
      expect(service.currentQuote()).toEqual(QUOTE_A);
      service.ngOnDestroy();
    }));

    it('bounds retained history during a long reading session', () => {
      autoAdvance = false;
      pool = Array.from({ length: QUOTE_HISTORY_LIMIT + 5 }, (_, index) =>
        quote(String(index), `quote text ${index}`, `Author ${index}`, 'philosophy')
      );

      for (let index = 0; index < QUOTE_HISTORY_LIMIT + 5; index++) {
        service.startNext();
      }

      expect(service.previousQuotes().length).toBe(QUOTE_HISTORY_LIMIT);
      expect(service.previousQuotes()[0]).toEqual(pool[4]);
      service.ngOnDestroy();
    });
  });

  describe('advance()', () => {
    it('moves to another quote even when scroll-paused', fakeAsync(() => {
      service.startNext();
      service.pause();
      service.advance();
      expect(service.currentQuote()).toEqual(QUOTE_B);
      expect(service.autoCyclePaused()).toBe(false);
      expect(service.userManuallyScrolled()).toBe(false);
      service.ngOnDestroy();
    }));
  });

  describe('pauseForPanel + resumeFromPanelClose (Phase 2 red-team)', () => {
    it('pauseForPanel does not set userManuallyScrolled', () => {
      service.pauseForPanel();
      expect(service.autoCyclePaused()).toBe(true);
      expect(service.userManuallyScrolled()).toBe(false);
    });

    it('resumeFromPanelClose un-pauses when user has not scrolled', fakeAsync(() => {
      service.startNext();
      tick(typingSpeed); // partial type
      service.pauseForPanel();
      service.resumeFromPanelClose();
      tick(typingSpeed * 10);
      expect(service.displayedText()).toBe('abc');
      service.ngOnDestroy();
    }));

    it('resumeFromPanelClose stays paused when user previously scrolled away', fakeAsync(() => {
      service.startNext();
      tick(typingSpeed);
      service.pause(); // hard pause from scroll
      const stoppedAt = service.displayedText();
      service.pauseForPanel(); // user opened panel after scrolling
      service.resumeFromPanelClose(); // panel closed
      // Hard pause flags should keep typing stopped.
      tick(typingSpeed * 10);
      expect(service.displayedText()).toBe(stoppedAt);
      expect(service.userManuallyScrolled()).toBe(true);
    }));

    it('keeps the completed quote in place when auto-advance is off', fakeAsync(() => {
      autoAdvance = false;
      service.startNext();
      tick(typingSpeed * 10);
      const completedQuote = service.currentQuote();
      service.pauseForPanel();

      service.resumeFromPanelClose();
      tick(3000);

      expect(service.currentQuote()).toBe(completedQuote);
      expect(service.autoCyclePaused()).toBeFalse();
    }));

    it('gives a completed quote a fresh reading interval when auto-advance is on', fakeAsync(() => {
      service.startNext();
      tick(typingSpeed * 10);
      const completedQuote = service.currentQuote();
      service.pauseForPanel();

      service.resumeFromPanelClose();
      tick(1999);
      expect(service.currentQuote()).toBe(completedQuote);
      tick(1);
      expect(service.currentQuote()).not.toBe(completedQuote);
    }));

    it('resume() (hard) clears userManuallyScrolled', fakeAsync(() => {
      service.startNext();
      tick(typingSpeed);
      service.pause();
      service.resume();
      expect(service.userManuallyScrolled()).toBe(false);
      service.ngOnDestroy();
    }));
  });

  describe('pause / resume', () => {
    it('pause() stops typing in place', fakeAsync(() => {
      service.startNext();
      tick(typingSpeed); // displayedText='a'
      service.pause();
      const stoppedAt = service.displayedText();
      tick(typingSpeed * 10);
      expect(service.displayedText()).toBe(stoppedAt);
      service.ngOnDestroy();
    }));

    it('resume() continues typing the same quote', fakeAsync(() => {
      service.startNext();
      tick(typingSpeed);
      service.pause();
      service.resume();
      tick(typingSpeed * 10);
      expect(service.displayedText()).toBe('abc');
      service.ngOnDestroy();
    }));

    it('pause() is idempotent (does not re-clear timers when already paused)', () => {
      service.pause();
      const first = service.userManuallyScrolled();
      service.pause();
      expect(service.userManuallyScrolled()).toBe(first);
    });
  });

  describe('prefers-reduced-motion (Phase 3)', () => {
    it('renders the full quote at once when prefers-reduced-motion is set', fakeAsync(() => {
      // Jasmine auto-restores the spy after this spec so later specs are
      // not polluted — eliminates the manual save/restore ordering flake.
      spyOn(window, 'matchMedia').and.callFake((q: string) =>
        makeMediaQueryList(q.includes('prefers-reduced-motion'), q)
      );

      service.startNext();
      // No tick needed — reduced-motion path sets the full text synchronously
      // and immediately marks typing complete.
      expect(service.displayedText()).toBe('abc');
      expect(service.typingComplete()).toBe(true);

      service.ngOnDestroy();
    }));
  });

  describe('resetForNewPool()', () => {
    it('clears history, displayedText, currentQuote, and pause flags', fakeAsync(() => {
      service.startNext();
      tick(typingSpeed * 10);
      service.startNext();
      tick(typingSpeed);
      service.pause();
      service.resetForNewPool();
      expect(service.previousQuotes()).toEqual([]);
      expect(service.currentQuote()).toBeNull();
      expect(service.displayedText()).toBe('');
      expect(service.autoCyclePaused()).toBe(false);
      expect(service.userManuallyScrolled()).toBe(false);
    }));
  });

  describe('resumeAfterVisibilityChange()', () => {
    it('continues mid-quote typing when no timers are active', fakeAsync(() => {
      service.startNext();
      tick(typingSpeed); // displayedText='a'
      service.ngOnDestroy(); // clear all timers (simulates throttled setTimeout)
      service.resumeAfterVisibilityChange();
      tick(typingSpeed * 10);
      expect(service.displayedText()).toBe('abc');
      service.ngOnDestroy();
    }));

    it('does nothing when paused', fakeAsync(() => {
      service.pause();
      service.resumeAfterVisibilityChange();
      tick(2000);
      expect(service.currentQuote()).toBeNull();
    }));
  });

  describe('resetAutoAdvanceTimer()', () => {
    it('reschedules auto-advance from now', fakeAsync(() => {
      service.startNext();
      tick(typingSpeed * 10); // typingComplete=true, auto-advance scheduled
      tick(1500); // 500ms left in original schedule
      service.resetAutoAdvanceTimer();
      tick(1500); // would have fired by now under original; doesn't with reset
      expect(service.currentQuote()).toEqual(QUOTE_A);
      tick(500); // hits 2000ms mark from reset
      expect(service.currentQuote()).toEqual(QUOTE_B);
      service.ngOnDestroy();
    }));

    it('does nothing when not yet typing-complete', fakeAsync(() => {
      service.startNext();
      service.resetAutoAdvanceTimer();
      tick(typingSpeed);
      expect(service.displayedText().length).toBeGreaterThan(0);
      service.ngOnDestroy();
    }));
  });
});
