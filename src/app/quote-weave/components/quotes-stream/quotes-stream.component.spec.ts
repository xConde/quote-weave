import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { QuotesStreamComponent } from './quotes-stream.component';
import { Quote } from '../../services/quote-collection.service';
import { TypewriterEngineService } from '../../services/typewriter-engine.service';

const QUOTE_A: Quote = {
  id: 'quote-a',
  authorId: 'author-a',
  text: 'Sample quote text',
  author: 'Author A',
  category: 'philosophy',
  attributionStatus: 'unverified',
};
const QUOTE_WITH_SOURCE: Quote = {
  ...QUOTE_A,
  id: 'quote-sourced',
  attributionStatus: 'sourced',
  source: {
    citation: 'Collected Letters, volume 2',
    url: 'https://example.com/source',
    translator: 'A. Translator',
    locator: 'Page 42',
    note: 'Spelling follows the first edition.',
  },
};
// ---------------------------------------------------------------------------
// Single audited private-access seam for this spec file.
// ---------------------------------------------------------------------------
interface QuotesStreamTestAccess {
  _quotesContainer: ElementRef<HTMLDivElement> | null;
  _pendingScrollFrame: number;
  quotesContainerRef: ElementRef<HTMLDivElement>;
  checkScrollPosition(): void;
  onWheel(e: WheelEvent): void;
}

const access = (c: QuotesStreamComponent): QuotesStreamTestAccess => c as unknown as QuotesStreamTestAccess;

function setRequiredInputs(
  fixture: ComponentFixture<QuotesStreamComponent>,
  overrides: Partial<{
    displayedText: string;
    currentQuote: Quote | null;
    typingComplete: boolean;
    autoCyclePaused: boolean;
    isInitialAnimation: boolean;
    isAnyPanelOpen: boolean;
    canGoBack: boolean;
  }> = {}
): void {
  fixture.componentRef.setInput('displayedText', overrides.displayedText ?? '');
  fixture.componentRef.setInput('currentQuote', overrides.currentQuote ?? null);
  fixture.componentRef.setInput('typingComplete', overrides.typingComplete ?? false);
  fixture.componentRef.setInput('autoCyclePaused', overrides.autoCyclePaused ?? false);
  fixture.componentRef.setInput('isInitialAnimation', overrides.isInitialAnimation ?? false);
  fixture.componentRef.setInput('isAnyPanelOpen', overrides.isAnyPanelOpen ?? false);
  fixture.componentRef.setInput('canGoBack', overrides.canGoBack ?? false);
  fixture.componentRef.setInput('isFavorite', () => false);
  fixture.componentRef.setInput('isRealPerson', () => true);
}

describe('QuotesStreamComponent', () => {
  let fixture: ComponentFixture<QuotesStreamComponent>;
  let component: QuotesStreamComponent;
  let engine: TypewriterEngineService;

  /** Spy that invokes rAF callbacks synchronously so scroll tests don't need real frames. */
  let rafSpy: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuotesStreamComponent],
      providers: [TypewriterEngineService],
    }).compileComponents();
    fixture = TestBed.createComponent(QuotesStreamComponent);
    component = fixture.componentInstance;
    engine = TestBed.inject(TypewriterEngineService);
    engine.configure({
      getTypingSpeedMs: () => 50,
      getAutoAdvance: () => true,
      getActivePool: () => [],
    });

    // Make requestAnimationFrame invoke its callback synchronously so specs
    // that exercise the coalesced-scroll path don't need real frame flushing.
    rafSpy = spyOn(window, 'requestAnimationFrame').and.callFake((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    rafSpy.calls.reset();
  });

  it('renders empty container when no quote and empty history', () => {
    setRequiredInputs(fixture);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.quotes-container')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.current-quote')).toBeNull();
  });

  it('renders the current quote with typewriter buffer', () => {
    setRequiredInputs(fixture, { currentQuote: QUOTE_A, displayedText: 'Sample', typingComplete: false });
    fixture.detectChanges();
    const current = fixture.nativeElement.querySelector('.current-quote');
    expect(current).toBeTruthy();
    expect(current.textContent).toContain('Sample');
    // Closing quote not yet rendered while typing
    expect(current.querySelector('.typed-text').classList.contains('typing')).toBe(true);
  });

  it('reserves the complete editorial leaf while the quote is still typing', () => {
    setRequiredInputs(fixture, { currentQuote: QUOTE_WITH_SOURCE, displayedText: 'Sample', typingComplete: false });
    fixture.componentRef.setInput('relatedQuotes', [{ quote: QUOTE_A, quoteId: QUOTE_A.id }]);
    fixture.detectChanges();

    const current = fixture.nativeElement.querySelector('.current-quote');
    expect(current.querySelector('.quote-measure').textContent).toContain(QUOTE_WITH_SOURCE.text);
    expect(current.querySelector('.quote-source.is-pending')).toBeTruthy();
    expect(current.querySelector('.related-quotes.is-pending')).toBeTruthy();
    expect(current.querySelector('.related-quotes.is-ready')).toBeNull();
    expect(current.querySelector('.quote-source').getAttribute('aria-hidden')).toBe('true');
    expect(current.querySelector('.quote-source').hasAttribute('inert')).toBeTrue();
    expect(current.querySelector('.related-quotes').hasAttribute('inert')).toBeTrue();
    expect(current.querySelector('.quote-source-details').textContent).toContain('Translation: A. Translator');
    expect(current.querySelector('.related-chip').textContent).toContain(QUOTE_A.text);
    const sourceLink = current.querySelector('.quote-source a') as HTMLAnchorElement;
    const relatedButton = current.querySelector('.related-chip') as HTMLButtonElement;
    sourceLink.focus();
    expect(document.activeElement).not.toBe(sourceLink);
    relatedButton.focus();
    expect(document.activeElement).not.toBe(relatedButton);

    fixture.componentRef.setInput('typingComplete', true);
    fixture.detectChanges();

    expect(current.querySelector('.quote-source.is-pending')).toBeNull();
    expect(current.querySelector('.related-quotes.is-pending')).toBeNull();
    expect(current.querySelector('.related-quotes.is-ready')).toBeTruthy();
    expect(current.querySelector('.quote-source').getAttribute('aria-hidden')).toBeNull();
    expect(current.querySelector('.quote-source').hasAttribute('inert')).toBeFalse();
    expect(current.querySelector('.related-quotes').hasAttribute('inert')).toBeFalse();
    sourceLink.focus();
    expect(document.activeElement).toBe(sourceLink);
  });

  it('reveals nearby threads together without changing their reserved rows', () => {
    const related = [0, 1, 2].map((index) => {
      const quote: Quote = {
        ...QUOTE_A,
        id: `related-${index}`,
        text: `Nearby line ${index + 1}`,
      };
      return { quote, quoteId: quote.id };
    });
    setRequiredInputs(fixture, {
      currentQuote: QUOTE_WITH_SOURCE,
      displayedText: QUOTE_WITH_SOURCE.text,
      typingComplete: true,
    });
    fixture.componentRef.setInput('relatedQuotes', related);
    fixture.detectChanges();

    const section = fixture.nativeElement.querySelector('.related-quotes');
    const cards = Array.from<HTMLElement>(section.querySelectorAll('.related-chip'));
    expect(section.classList).toContain('is-ready');
    expect(cards.map((card) => card.style.animationDelay)).toEqual(['', '', '']);
    expect(cards.every((card) => card.textContent?.includes('Nearby line'))).toBeTrue();
  });

  it('keeps the complete nearby quote in the document', () => {
    const longQuote: Quote = {
      ...QUOTE_A,
      id: 'quote-long',
      text: 'A deliberately long nearby line should wrap naturally instead of disappearing behind a three-line crop.',
    };
    setRequiredInputs(fixture, { currentQuote: QUOTE_A, displayedText: QUOTE_A.text, typingComplete: true });
    fixture.componentRef.setInput('relatedQuotes', [{ quote: longQuote, quoteId: longQuote.id }]);
    fixture.detectChanges();

    const nearbyButton = fixture.nativeElement.querySelector('.related-chip');
    expect(nearbyButton.querySelector('.related-chip-excerpt').textContent.trim()).toBe(
      component.quoteExcerpt(longQuote)
    );
    expect(nearbyButton.getAttribute('aria-label')).toContain(longQuote.text);
  });

  it('shows the resume arrow when paused and no panels open', () => {
    setRequiredInputs(fixture, { autoCyclePaused: true, isAnyPanelOpen: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.resume-arrow-btn')).toBeTruthy();
  });

  it('hides the resume arrow when a panel is open even if paused', () => {
    setRequiredInputs(fixture, { autoCyclePaused: true, isAnyPanelOpen: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.resume-arrow-btn')).toBeNull();
  });

  it('renders explicit Back and Another quote controls', () => {
    setRequiredInputs(fixture, { canGoBack: false });
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('.reader-nav-btn');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent.trim()).toBe('← Earlier');
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].textContent.trim()).toBe('Another quote →');
  });

  it('keeps the attribution dash hidden from assistive technology', () => {
    setRequiredInputs(fixture, { currentQuote: QUOTE_A, displayedText: QUOTE_A.text, typingComplete: true });
    fixture.detectChanges();
    const dash = fixture.nativeElement.querySelector('.current-quote .attribution-dash');
    expect(dash).withContext('attribution dash span must exist for the CSS glyph').toBeTruthy();
    expect(dash.getAttribute('aria-hidden')).toBe('true');
    expect(dash.textContent.trim()).toBe('');
  });

  it('renders an honest attribution note when a quote has no verified source', () => {
    setRequiredInputs(fixture, { currentQuote: QUOTE_A, displayedText: QUOTE_A.text, typingComplete: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.current-quote .quote-source').textContent).toContain(
      'Attribution not yet verified'
    );
  });

  it('keeps translator, non-duplicated locator, and source note beside the citation', () => {
    setRequiredInputs(fixture, {
      currentQuote: QUOTE_WITH_SOURCE,
      displayedText: QUOTE_WITH_SOURCE.text,
      typingComplete: true,
    });
    fixture.detectChanges();
    const details = fixture.nativeElement.querySelector('.quote-source-details');
    expect(details.textContent).toContain('Translation: A. Translator');
    expect(details.textContent).toContain('Location: Page 42');
    expect(details.textContent).toContain('Spelling follows the first edition.');
  });

  it('does not repeat a locator already present in the citation', () => {
    const quote: Quote = {
      ...QUOTE_WITH_SOURCE,
      source: { ...QUOTE_WITH_SOURCE.source!, citation: 'Collected Letters, Page 42' },
    };
    setRequiredInputs(fixture, { currentQuote: quote, displayedText: quote.text, typingComplete: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.quote-source-details').textContent).not.toContain('Location: Page 42');
  });

  it('emits quote navigation actions', () => {
    setRequiredInputs(fixture, { canGoBack: true });
    fixture.detectChanges();
    let previousCount = 0;
    let anotherCount = 0;
    component.previousQuote.subscribe(() => previousCount++);
    component.anotherQuote.subscribe(() => anotherCount++);
    const buttons = fixture.nativeElement.querySelectorAll('.reader-nav-btn');
    buttons[0].click();
    buttons[1].click();
    expect(previousCount).toBe(1);
    expect(anotherCount).toBe(1);
  });

  it('hides quote navigation while a panel is open', () => {
    setRequiredInputs(fixture, { isAnyPanelOpen: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.reader-navigation')).toBeNull();
  });

  it('emits favoriteToggle when the heart on the current quote is clicked', () => {
    setRequiredInputs(fixture, { currentQuote: QUOTE_A, displayedText: QUOTE_A.text, typingComplete: true });
    fixture.detectChanges();
    const captured: Quote[] = [];
    component.favoriteToggle.subscribe((q) => captured.push(q));
    fixture.nativeElement.querySelector('.current-quote .favorite-btn').click();
    expect(captured).toEqual([QUOTE_A]);
  });

  it('emits sharePreview when the share button on the current quote is clicked', () => {
    setRequiredInputs(fixture, { currentQuote: QUOTE_A, displayedText: QUOTE_A.text, typingComplete: true });
    fixture.detectChanges();
    const captured: Quote[] = [];
    component.sharePreview.subscribe((q) => captured.push(q));
    fixture.nativeElement.querySelector('.current-quote .share-btn').click();
    expect(captured).toEqual([QUOTE_A]);
  });

  it('emits openAuthor when a real-person author is clicked', () => {
    setRequiredInputs(fixture, { currentQuote: QUOTE_A, displayedText: QUOTE_A.text, typingComplete: true });
    fixture.detectChanges();
    const captured: string[] = [];
    component.openAuthor.subscribe((a) => captured.push(a));
    fixture.nativeElement.querySelector('.current-quote .author-name').click();
    expect(captured).toEqual([QUOTE_A.author]);
  });

  it('does NOT emit openAuthor when isRealPerson returns false', () => {
    setRequiredInputs(fixture, { currentQuote: QUOTE_A, displayedText: QUOTE_A.text, typingComplete: true });
    fixture.componentRef.setInput('isRealPerson', () => false);
    fixture.detectChanges();
    let count = 0;
    component.openAuthor.subscribe(() => count++);
    fixture.nativeElement.querySelector('.current-quote .author-name').click();
    expect(count).toBe(0);
  });

  it('resume-arrow click resumes the engine', () => {
    setRequiredInputs(fixture, { autoCyclePaused: true, isAnyPanelOpen: false });
    fixture.detectChanges();
    const resumeSpy = spyOn(engine, 'resume');
    fixture.nativeElement.querySelector('.resume-arrow-btn').click();
    expect(resumeSpy).toHaveBeenCalled();
  });

  it('keeps one accessible quote in the semantic blockquote and populates it on completion', () => {
    setRequiredInputs(fixture, { currentQuote: QUOTE_A, displayedText: 'Sample', typingComplete: false });
    fixture.detectChanges();
    expect(component.liveAnnouncement()).toBe('');
    const blockquote = fixture.nativeElement.querySelector('blockquote.quote-text');
    expect(blockquote.getAttribute('aria-live')).toBe('polite');
    expect(blockquote.querySelector('.typed-text').getAttribute('aria-hidden')).toBe('true');
    expect(blockquote.querySelector('.sr-only').textContent.trim()).toBe('');
    expect(fixture.nativeElement.querySelectorAll('[aria-live="polite"]').length).toBe(1);

    fixture.componentRef.setInput('typingComplete', true);
    fixture.detectChanges();
    expect(component.liveAnnouncement()).toBe(`“${QUOTE_A.text}”`);
    expect(blockquote.querySelector('.sr-only').textContent.trim()).toBe(`“${QUOTE_A.text}”`);
    expect(blockquote.getAttribute('aria-atomic')).toBe('true');
  });

  describe('scroll subsystem', () => {
    function makeContainer(scrollHeight: number, scrollTop: number, clientHeight: number): HTMLDivElement {
      const div = document.createElement('div');
      Object.defineProperties(div, {
        scrollHeight: { value: scrollHeight, configurable: true },
        scrollTop: { value: scrollTop, writable: true, configurable: true },
        clientHeight: { value: clientHeight, configurable: true },
      });
      return div;
    }

    it('resets to the top once per quote without following each typed character', () => {
      const queuedFrames = new Map<number, FrameRequestCallback>();
      let nextFrameHandle = 1;
      rafSpy.and.callFake((callback: FrameRequestCallback) => {
        const handle = nextFrameHandle++;
        queuedFrames.set(handle, callback);
        return handle;
      });

      setRequiredInputs(fixture, { currentQuote: QUOTE_A, displayedText: 'S', typingComplete: false });
      fixture.detectChanges();
      const container = makeContainer(1000, 150, 500);
      access(component)._quotesContainer = { nativeElement: container };

      const firstQuoteFrame = access(component)._pendingScrollFrame;
      expect(firstQuoteFrame).toBeGreaterThan(0);
      queuedFrames.get(firstQuoteFrame)!(0);
      expect(container.scrollTop).toBe(0);
      expect(access(component)._pendingScrollFrame).toBe(-1);

      container.scrollTop = 120;
      fixture.componentRef.setInput('displayedText', 'Sample');
      fixture.detectChanges();
      expect(container.scrollTop).toBe(120);
      expect(access(component)._pendingScrollFrame).toBe(-1);

      const nextQuote: Quote = { ...QUOTE_A, id: 'quote-b' };
      fixture.componentRef.setInput('currentQuote', nextQuote);
      fixture.detectChanges();
      const nextQuoteFrame = access(component)._pendingScrollFrame;
      expect(nextQuoteFrame).toBeGreaterThan(firstQuoteFrame);
      queuedFrames.get(nextQuoteFrame)!(16);
      expect(container.scrollTop).toBe(0);
      expect(access(component)._pendingScrollFrame).toBe(-1);
    });

    it('checkScrollPosition pauses engine when distance from bottom > threshold', () => {
      setRequiredInputs(fixture);
      fixture.detectChanges();
      // distance = scrollHeight (1000) - (scrollTop (0) + clientHeight (500)) = 500
      // 500 > 80 threshold → pause
      const container = makeContainer(1000, 0, 500);
      access(component)._quotesContainer = { nativeElement: container };
      const pauseSpy = spyOn(engine, 'pause');
      access(component).checkScrollPosition();
      expect(pauseSpy).toHaveBeenCalled();
    });

    it('checkScrollPosition resumes engine when scrolled back to bottom while paused', () => {
      setRequiredInputs(fixture);
      fixture.detectChanges();
      // scrollTop 500 + clientHeight 500 = scrollHeight 1000 → distance = 0 < threshold
      const container = makeContainer(1000, 500, 500);
      access(component)._quotesContainer = { nativeElement: container };
      // Force engine into hard-paused state so the resume branch fires
      engine.pause();
      const resumeSpy = spyOn(engine, 'resume');
      access(component).checkScrollPosition();
      expect(resumeSpy).toHaveBeenCalled();
    });

    it('onWheel pauses engine when scrolling up in an overflowing stream', () => {
      setRequiredInputs(fixture);
      fixture.detectChanges();
      const container = makeContainer(1000, 500, 500);
      access(component)._quotesContainer = { nativeElement: container };
      const pauseSpy = spyOn(engine, 'pause');
      access(component).onWheel(new WheelEvent('wheel', { deltaY: -100 }));
      expect(pauseSpy).toHaveBeenCalled();
    });

    it('onWheel still pauses on scroll-up even when the stream fits (resume arrow is the escape)', () => {
      setRequiredInputs(fixture);
      fixture.detectChanges();
      // Non-overflowing container (500 === 500): the auto-cycle should still
      // pause so the reader can catch up — the resume arrow unpauses it.
      const container = makeContainer(500, 0, 500);
      access(component)._quotesContainer = { nativeElement: container };
      const pauseSpy = spyOn(engine, 'pause');
      access(component).onWheel(new WheelEvent('wheel', { deltaY: -100 }));
      expect(pauseSpy).toHaveBeenCalled();
    });

    it('onWheel does NOT pause when user scrolls down', () => {
      setRequiredInputs(fixture);
      fixture.detectChanges();
      const pauseSpy = spyOn(engine, 'pause');
      access(component).onWheel(new WheelEvent('wheel', { deltaY: 100 }));
      expect(pauseSpy).not.toHaveBeenCalled();
    });

    it('checkScrollPosition does NOT resume in the mid-scroll dead zone (still reading)', () => {
      setRequiredInputs(fixture);
      fixture.detectChanges();
      // distance = 1000 - (960 + 500)... use a distance between RESUME (12) and
      // pause (80) threshold: scrollHeight 1000, scrollTop 460, clientHeight 500
      // → distance = 40 → neither pause nor resume; the wheel pause holds.
      const container = makeContainer(1000, 460, 500);
      access(component)._quotesContainer = { nativeElement: container };
      engine.pause();
      const resumeSpy = spyOn(engine, 'resume');
      access(component).checkScrollPosition();
      expect(resumeSpy).not.toHaveBeenCalled();
    });

    it('setupScrollListeners is idempotent — re-entry guard prevents double subscriptions', () => {
      setRequiredInputs(fixture);
      fixture.detectChanges();
      // Force the ViewChild setter to fire twice by reassigning. The internal
      // _scrollListenersAttached flag should ensure only one set of listeners
      // is attached; otherwise pause() would fire 2× per wheel event.
      const container = makeContainer(1000, 0, 500);
      // Second assignment should be a no-op for listener attach
      access(component).quotesContainerRef = { nativeElement: container };
      access(component).quotesContainerRef = { nativeElement: container };
      const pauseSpy = spyOn(engine, 'pause');
      container.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
      // If the guard fails, pause would have been called twice
      expect(pauseSpy.calls.count()).toBeLessThanOrEqual(1);
    });
  });
});
