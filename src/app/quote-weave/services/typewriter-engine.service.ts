import { computed, Injectable, OnDestroy, signal, Signal } from '@angular/core';
import { DisposableTimerCollection } from '@shared/utils/disposable-timer';
import { prefersReducedMotion } from '../utils/prefers-reduced-motion';
import { Quote } from './quote-collection.service';

export interface TypewriterEngineConfig {
  /** Returns the current typing speed in milliseconds per character. */
  getTypingSpeedMs: () => number;
  /** Returns whether the engine should auto-advance after a quote completes. */
  getAutoAdvance: () => boolean;
  /** Returns the active pool of quotes the engine cycles through. */
  getActivePool: () => Quote[];
}

const DEFAULT_PAUSE_AFTER_TYPED_MS = 2000;
export const QUOTE_HISTORY_LIMIT = 20;

@Injectable()
export class TypewriterEngineService implements OnDestroy {
  private readonly timers = new DisposableTimerCollection();

  private readonly _displayedText = signal('');
  private readonly _currentQuote = signal<Quote | null>(null);
  private readonly _typingComplete = signal(false);
  private readonly _previousQuotes = signal<Quote[]>([]);
  private readonly _forwardQuotes = signal<Quote[]>([]);
  private readonly _autoCyclePaused = signal(false);
  private readonly _userManuallyScrolled = signal(false);
  private readonly _isInitialAnimation = signal(true);

  readonly displayedText: Signal<string> = this._displayedText.asReadonly();
  readonly currentQuote: Signal<Quote | null> = this._currentQuote.asReadonly();
  readonly typingComplete: Signal<boolean> = this._typingComplete.asReadonly();
  readonly previousQuotes: Signal<Quote[]> = this._previousQuotes.asReadonly();
  readonly canGoBack = computed(() => this._previousQuotes().length > 0);
  readonly autoCyclePaused: Signal<boolean> = this._autoCyclePaused.asReadonly();
  readonly userManuallyScrolled: Signal<boolean> = this._userManuallyScrolled.asReadonly();
  readonly isInitialAnimation: Signal<boolean> = this._isInitialAnimation.asReadonly();

  private currentIndex = 0;
  private config: TypewriterEngineConfig | null = null;

  /** Number of timers currently active — used by visibility-change resume guard. */
  get activeTimerCount(): number {
    return this.timers.activeCount;
  }

  configure(config: TypewriterEngineConfig): void {
    this.config = config;
  }

  /** Begin typing the next quote from the active pool. No-op if paused or pool is empty. */
  startNext(): void {
    const pool = this.requirePool();
    if (this._autoCyclePaused() || this._userManuallyScrolled() || pool.length === 0) return;

    this.timers.clearAll();

    const current = this._currentQuote();
    if (current) {
      this.appendHistory(current);
    }

    const forwardQuotes = this._forwardQuotes();
    const next = forwardQuotes[forwardQuotes.length - 1] ?? pool[this.currentIndex % pool.length];

    if (!next) return;

    if (forwardQuotes.length > 0) {
      this._forwardQuotes.set(forwardQuotes.slice(0, -1));
    }

    const nextIndex = pool.findIndex((quote) => quote.id === next.id);
    if (nextIndex !== -1) {
      this.currentIndex = (nextIndex + 1) % pool.length;
    }

    this._currentQuote.set(next);
    this._displayedText.set('');
    this._typingComplete.set(false);
    this.typeNextCharacter();
  }

  /** Either resume from pause/scroll OR clear timers and jump to next quote. */
  skip(): void {
    if (this._autoCyclePaused() || this._userManuallyScrolled()) {
      this.resume();
    } else {
      this.timers.clearAll();
      this.startNext();
    }
  }

  /** Advance immediately, even when the reader was paused by scrolling. */
  advance(): void {
    this._autoCyclePaused.set(false);
    this._userManuallyScrolled.set(false);
    this.timers.clearAll();
    this.startNext();
  }

  /** Restore the previously-displayed quote from history. No-op when history is empty. */
  goToPrevious(): void {
    const previous = this._previousQuotes();
    if (previous.length === 0) return;

    this.timers.clearAll();

    const prev = previous[previous.length - 1];
    const current = this._currentQuote();
    if (current) {
      this._forwardQuotes.update((quotes) => this.withinHistoryLimit([...quotes, current]));
    }
    this._previousQuotes.set(previous.slice(0, -1));
    this._currentQuote.set(prev);
    this._autoCyclePaused.set(false);
    this._userManuallyScrolled.set(false);
    this._displayedText.set('');
    this._typingComplete.set(false);
    this.typeNextCharacter();
  }

  /**
   * Soft pause — used by panel toggles. Stops typing without claiming the user
   * has scrolled away from the bottom (so closing the panel can resume cleanly).
   */
  pauseForPanel(): void {
    this._autoCyclePaused.set(true);
    this.timers.clearAll();
  }

  /**
   * Hard pause — used by the wheel/scroll handlers when the user moves away
   * from the bottom. Sets both flags so the auto-scroll effect knows to leave
   * the user alone, and resumePanelClose() leaves them paused.
   */
  pause(): void {
    if (this._userManuallyScrolled()) return;
    this._autoCyclePaused.set(true);
    this._userManuallyScrolled.set(true);
    this.timers.clearAll();
  }

  /**
   * Hard resume — clears both pause flags and continues typing. Used by the
   * resume arrow, by skip(), and by checkScrollPosition when the user
   * scrolls back to the bottom.
   */
  resume(): void {
    this._autoCyclePaused.set(false);
    this._userManuallyScrolled.set(false);
    if (!this._typingComplete() && this._currentQuote()) {
      this.typeNextCharacter();
    } else if (this._typingComplete()) {
      this.startNext();
    }
  }

  /**
   * Soft resume — used when a modal panel closes. Clears the auto-cycle pause
   * but does NOT touch userManuallyScrolled, so a user who scrolled away
   * before opening the panel stays paused after closing it.
   */
  resumeFromPanelClose(): void {
    this._autoCyclePaused.set(false);
    if (this._userManuallyScrolled()) return;
    if (!this._typingComplete() && this._currentQuote()) {
      this.typeNextCharacter();
    } else if (this._typingComplete() && this.requireConfig().getAutoAdvance()) {
      // A panel may have been open for any length of time. Give the current
      // quote a fresh reading interval instead of replacing it the instant
      // the panel closes.
      this.scheduleAutoAdvance();
    }
  }

  /**
   * Jump to a specific quote immediately (e.g. from related chips or the idea
   * map). Pushes the currently-displayed quote to history, clears timers, and
   * starts typing the target quote. No-op if quote is null.
   */
  jumpTo(quote: Quote): void {
    this.timers.clearAll();

    const current = this._currentQuote();
    if (current) {
      this.appendHistory(current);
    }
    this._forwardQuotes.set([]);

    // Advance the pool index past the quote we're jumping to so the engine
    // does not replay it immediately when startNext() is called next.
    const pool = this.requirePool();
    const idx = pool.findIndex((candidate) => candidate.id === quote.id);
    if (idx !== -1) {
      this.currentIndex = (idx + 1) % pool.length;
    }

    this._currentQuote.set(quote);
    this._displayedText.set('');
    this._typingComplete.set(false);
    this._autoCyclePaused.set(false);
    this._userManuallyScrolled.set(false);
    this.typeNextCharacter();
  }

  /**
   * Hard reset for a fresh pool (e.g., category switch). Clears history and
   * positions the cursor at index 0 of the new active pool.
   */
  resetForNewPool(): void {
    this.timers.clearAll();
    this._previousQuotes.set([]);
    this._forwardQuotes.set([]);
    this._currentQuote.set(null);
    this.currentIndex = 0;
    this._displayedText.set('');
    this._typingComplete.set(false);
    this._autoCyclePaused.set(false);
    this._userManuallyScrolled.set(false);
  }

  /**
   * Reset the auto-advance timer. Used after a button click so the quote
   * doesn't cycle out from under the user mid-interaction.
   */
  resetAutoAdvanceTimer(): void {
    if (!this._typingComplete() || this._autoCyclePaused()) return;
    if (!this.requireConfig().getAutoAdvance()) return;
    this.timers.clearAll();
    this.scheduleAutoAdvance();
  }

  /**
   * Resume from a tab-visibility-change event. Picks up typing if mid-quote,
   * advances if typing was complete and auto-advance is on.
   */
  resumeAfterVisibilityChange(): void {
    if (this._autoCyclePaused() || this._userManuallyScrolled()) return;
    if (this.timers.activeCount > 0) return;
    if (!this._typingComplete() && this._currentQuote()) {
      this.typeNextCharacter();
    } else if (this._typingComplete() && this.requireConfig().getAutoAdvance()) {
      this.startNext();
    }
  }

  ngOnDestroy(): void {
    this.timers.clearAll();
  }

  private typeNextCharacter(): void {
    const quote = this._currentQuote();
    if (!quote || this._autoCyclePaused() || this._userManuallyScrolled()) return;

    // Reduced-motion: render the full quote at once instead of animating
    // char-by-char. Skips the typewriter effect entirely for accessibility.
    if (prefersReducedMotion() && this._displayedText().length === 0) {
      this._displayedText.set(quote.text);
      this._typingComplete.set(true);
      if (this._isInitialAnimation()) {
        this._isInitialAnimation.set(false);
      }
      this.scheduleAutoAdvance();
      return;
    }

    const currentPos = this._displayedText().length;

    if (currentPos < quote.text.length) {
      this._displayedText.update((t) => t + quote.text.charAt(currentPos));
      this.timers.setTimeout(() => this.typeNextCharacter(), this.requireConfig().getTypingSpeedMs());
      return;
    }

    this._typingComplete.set(true);
    if (this._isInitialAnimation()) {
      this._isInitialAnimation.set(false);
    }
    this.scheduleAutoAdvance();
  }

  private scheduleAutoAdvance(): void {
    this.timers.setTimeout(() => {
      if (this._autoCyclePaused() || this._userManuallyScrolled()) return;
      if (!this.requireConfig().getAutoAdvance()) return;
      this.startNext();
    }, DEFAULT_PAUSE_AFTER_TYPED_MS);
  }

  private requireConfig(): TypewriterEngineConfig {
    if (!this.config) {
      throw new Error('TypewriterEngineService: configure() must be called before use.');
    }
    return this.config;
  }

  private requirePool(): Quote[] {
    return this.requireConfig().getActivePool();
  }

  private appendHistory(quote: Quote): void {
    this._previousQuotes.update((quotes) => this.withinHistoryLimit([...quotes, quote]));
  }

  private withinHistoryLimit(quotes: Quote[]): Quote[] {
    return quotes.length <= QUOTE_HISTORY_LIMIT ? quotes : quotes.slice(-QUOTE_HISTORY_LIMIT);
  }
}
