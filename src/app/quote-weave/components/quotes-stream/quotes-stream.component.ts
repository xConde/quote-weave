import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { fromEvent } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { getQuoteWeaveIcon, QuoteWeaveIconName } from '../../utils/icons';
import { Quote } from '../../services/quote-collection.service';
import { TypewriterEngineService } from '../../services/typewriter-engine.service';

// Pause the auto-cycle once the user has scrolled this far up from the bottom.
const SCROLL_THRESHOLD_PX = 80;
// Only auto-resume when the user has scrolled essentially back to the bottom.
// Using the same 80px threshold for resume meant any small scroll-up that
// stayed within 80px of the bottom instantly re-resumed (and re-triggered the
// scroll-to-bottom yank), so the queue never actually stopped. A small resume
// band leaves a "reading" zone in between where the pause holds.
const RESUME_AT_BOTTOM_PX = 12;

@Component({
  selector: 'qw-quotes-stream',
  templateUrl: './quotes-stream.component.html',
  styleUrls: ['./quotes-stream.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuotesStreamComponent implements OnDestroy {
  readonly displayedText = input.required<string>();
  readonly currentQuote = input.required<Quote | null>();
  readonly typingComplete = input.required<boolean>();
  readonly autoCyclePaused = input.required<boolean>();
  readonly isInitialAnimation = input.required<boolean>();
  readonly isAnyPanelOpen = input.required<boolean>();
  readonly canGoBack = input.required<boolean>();
  readonly isFavorite = input.required<(quote: Quote) => boolean>();
  readonly isRealPerson = input.required<(author: string) => boolean>();

  /** Up to 3 related quotes shown after typing completes. Pass [] to hide. */
  readonly relatedQuotes = input<{ quote: Quote; quoteId: string }[]>([]);

  readonly favoriteToggle = output<Quote>();
  readonly sharePreview = output<Quote>();
  readonly openAuthor = output<string>();
  readonly jumpToQuote = output<Quote>();
  readonly previousQuote = output<void>();
  readonly anotherQuote = output<void>();

  /**
   * Drives the live region inside the semantic blockquote. The string is empty
   * while typing is in flight and is populated once when typing completes.
   * Keeping this single accessible copy in the blockquote preserves reading
   * order without making assistive technology announce a duplicate quote.
   */
  readonly liveAnnouncement = computed(() => {
    const quote = this.currentQuote();
    if (!quote || !this.typingComplete()) return '';
    return `“${quote.text}”`;
  });

  private readonly engine = inject(TypewriterEngineService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly iconCache = new Map<string, SafeHtml>();
  private _quotesContainer: ElementRef<HTMLDivElement> | null = null;
  private _scrollListenersAttached = false;

  /** rAF handle for the next-quote scroll reset; -1 means no frame pending. */
  private _pendingScrollFrame = -1;
  private _activeQuoteId: string | null = null;

  @ViewChild('quotesContainer', { static: false })
  set quotesContainerRef(element: ElementRef<HTMLDivElement> | undefined) {
    if (element) {
      this._quotesContainer = element;
      this.setupScrollListeners();
    }
  }

  constructor() {
    effect(() => {
      const quoteId = this.currentQuote()?.id ?? null;
      if (quoteId === null || quoteId === this._activeQuoteId) return;
      this._activeQuoteId = quoteId;

      // The leaf reserves its complete height before typing starts. Reset once
      // for a genuinely new quote; scrolling on every typed character leaves
      // compact viewports staring at the still-hidden source/thread rows.
      if (this._pendingScrollFrame === -1) {
        this._pendingScrollFrame = requestAnimationFrame(() => {
          this._pendingScrollFrame = -1;
          if (this._quotesContainer) {
            this._quotesContainer.nativeElement.scrollTop = 0;
          }
        });
      }
    });
  }

  ngOnDestroy(): void {
    if (this._pendingScrollFrame !== -1) {
      cancelAnimationFrame(this._pendingScrollFrame);
      this._pendingScrollFrame = -1;
    }
  }

  icon(name: QuoteWeaveIconName, size: number): SafeHtml {
    const key = `${name}:${size}`;
    let cached = this.iconCache.get(key);
    if (!cached) {
      cached = this.sanitizer.bypassSecurityTrustHtml(getQuoteWeaveIcon(name, size));
      this.iconCache.set(key, cached);
    }
    return cached;
  }

  sourceLabel(quote: Quote): string {
    if (quote.attributionStatus === 'sourced' && quote.source) {
      return `Source: ${quote.source.citation}`;
    }
    if (quote.attributionStatus === 'reported') {
      return quote.source
        ? `Reported attribution: ${quote.source.citation}`
        : 'Reported attribution: original source not confirmed';
    }
    return 'Attribution not yet verified';
  }

  sourceDetails(quote: Quote): string[] {
    const source = quote.source;
    if (!source) return [];

    const details: string[] = [];
    if (source.translator) details.push(`Translation: ${source.translator}`);
    if (source.locator && !this.sourceTextContains(source.citation, source.locator)) {
      details.push(`Location: ${source.locator}`);
    }
    if (source.note) details.push(source.note);
    return details;
  }

  quoteExcerpt(quote: Quote): string {
    return quote.text;
  }

  private sourceTextContains(citation: string, detail: string): boolean {
    const normalize = (value: string): string =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    return normalize(citation).includes(normalize(detail));
  }

  onAuthorClick(author: string): void {
    if (!this.isRealPerson()(author)) return;
    this.openAuthor.emit(author);
  }

  onAuthorKeydownEnter(author: string): void {
    if (!this.isRealPerson()(author)) return;
    this.openAuthor.emit(author);
  }

  onAuthorKeydownSpace(event: Event, author: string): void {
    if (!this.isRealPerson()(author)) return;
    event.preventDefault();
    this.openAuthor.emit(author);
  }

  onResumeArrow(): void {
    // Immediate scroll (not coalesced) so the arrow tap feels responsive.
    this.scrollToBottom();
    this.engine.resume();
  }

  private setupScrollListeners(): void {
    if (!this._quotesContainer || this._scrollListenersAttached) return;
    this._scrollListenersAttached = true;
    const container = this._quotesContainer.nativeElement;

    fromEvent(container, 'scroll')
      .pipe(debounceTime(50), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.checkScrollPosition());

    fromEvent<WheelEvent>(container, 'wheel')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.onWheel(event));
  }

  private checkScrollPosition(): void {
    if (!this._quotesContainer) return;
    const el = this._quotesContainer.nativeElement;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    if (distanceFromBottom > SCROLL_THRESHOLD_PX) {
      if (!this.engine.autoCyclePaused()) this.engine.pause();
    } else if (
      distanceFromBottom <= RESUME_AT_BOTTOM_PX &&
      (this.engine.autoCyclePaused() || this.engine.userManuallyScrolled())
    ) {
      this.engine.resume();
    }
  }

  private onWheel(event: WheelEvent): void {
    if (event.deltaY >= 0 || !this._quotesContainer) return;
    // Any upward intent pauses the auto-cycle so the reader can catch up —
    // even when the stream fits and nothing actually scrolls. The resume arrow
    // (and, once content overflows, scrolling back to the bottom) is the escape,
    // so pausing here never traps the user.
    this.engine.pause();
  }

  private scrollToBottom(): void {
    if (!this._quotesContainer) return;
    try {
      const el = this._quotesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    } catch {
      // Ignore scroll errors
    }
  }
}
