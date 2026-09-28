import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { IdeaMapComponent } from './idea-map.component';
import {
  QuoteMapCluster,
  QuoteMapLoadState,
  QuoteMapPoint,
  QuoteMapService,
  QuoteMapThread,
} from '../../services/quote-map.service';
import { signal } from '@angular/core';
import { Quote } from '../../services/quote-collection.service';

const MOCK_CLUSTERS: QuoteMapCluster[] = [
  { id: 0, label: 'Fate & Acceptance', blurb: 'Blurb A', count: 34 },
  { id: 1, label: 'Mind & Perception', blurb: 'Blurb B', count: 40 },
];

const MOCK_POINTS: QuoteMapPoint[] = [
  { quoteId: 'quote-0', lx: -0.2, ly: 0.3, cluster: 0 },
  { quoteId: 'quote-1', lx: 0.5, ly: -0.6, cluster: 1 },
];

const MOCK_QUOTES: Quote[] = [
  {
    id: 'quote-0',
    authorId: 'author-a',
    text: 'The obstacle becomes part of the road.',
    author: 'Author A',
    category: 'Stoicism',
    attributionStatus: 'unverified',
  },
  {
    id: 'quote-1',
    authorId: 'author-b',
    text: 'Attention changes what we are able to notice.',
    author: 'Author B',
    category: 'Philosophy',
    attributionStatus: 'unverified',
  },
];

const MOCK_THREADS: QuoteMapThread[] = [
  { cluster: MOCK_CLUSTERS[0], quotes: [MOCK_QUOTES[0]] },
  { cluster: MOCK_CLUSTERS[1], quotes: [MOCK_QUOTES[1]] },
];

function createMapServiceSpy(): {
  spy: jasmine.SpyObj<QuoteMapService>;
  clustersSignal: ReturnType<typeof signal<QuoteMapCluster[]>>;
  pointsSignal: ReturnType<typeof signal<QuoteMapPoint[]>>;
  loadedSignal: ReturnType<typeof signal<boolean>>;
  statusSignal: ReturnType<typeof signal<QuoteMapLoadState>>;
  errorSignal: ReturnType<typeof signal<string | null>>;
  threadsSignal: ReturnType<typeof signal<QuoteMapThread[]>>;
} {
  const clustersSignal = signal<QuoteMapCluster[]>([]);
  const pointsSignal = signal<QuoteMapPoint[]>([]);
  const loadedSignal = signal<boolean>(false);
  const statusSignal = signal<QuoteMapLoadState>('idle');
  const errorSignal = signal<string | null>(null);
  const threadsSignal = signal<QuoteMapThread[]>([]);

  const spy = jasmine.createSpyObj<QuoteMapService>('QuoteMapService', [
    'load',
    'quoteById',
    'relatedTo',
    'neighborsOf',
  ]);
  spy.quoteById.and.callFake((quoteId: string) => ({
    id: quoteId,
    authorId: 'author-author',
    text: `Quote ${quoteId}`,
    author: 'Author',
    category: 'Stoicism',
    attributionStatus: 'unverified',
  }));
  spy.neighborsOf.and.returnValue([]);

  Object.defineProperty(spy, 'clusters', { get: () => clustersSignal.asReadonly(), configurable: true });
  Object.defineProperty(spy, 'points', { get: () => pointsSignal.asReadonly(), configurable: true });
  Object.defineProperty(spy, 'loaded', { get: () => loadedSignal.asReadonly(), configurable: true });
  Object.defineProperty(spy, 'status', { get: () => statusSignal.asReadonly(), configurable: true });
  Object.defineProperty(spy, 'errorMessage', { get: () => errorSignal.asReadonly(), configurable: true });
  Object.defineProperty(spy, 'threads', { get: () => threadsSignal.asReadonly(), configurable: true });

  return { spy, clustersSignal, pointsSignal, loadedSignal, statusSignal, errorSignal, threadsSignal };
}

describe('IdeaMapComponent', () => {
  let fixture: ComponentFixture<IdeaMapComponent>;
  let component: IdeaMapComponent;
  let mapServiceSpy: jasmine.SpyObj<QuoteMapService>;
  let clustersSignal: ReturnType<typeof signal<QuoteMapCluster[]>>;
  let pointsSignal: ReturnType<typeof signal<QuoteMapPoint[]>>;
  let loadedSignal: ReturnType<typeof signal<boolean>>;
  let statusSignal: ReturnType<typeof signal<QuoteMapLoadState>>;
  let errorSignal: ReturnType<typeof signal<string | null>>;
  let threadsSignal: ReturnType<typeof signal<QuoteMapThread[]>>;

  beforeEach(async () => {
    const created = createMapServiceSpy();
    mapServiceSpy = created.spy;
    clustersSignal = created.clustersSignal;
    pointsSignal = created.pointsSignal;
    loadedSignal = created.loadedSignal;
    statusSignal = created.statusSignal;
    errorSignal = created.errorSignal;
    threadsSignal = created.threadsSignal;

    await TestBed.configureTestingModule({
      imports: [IdeaMapComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
      .overrideProvider(QuoteMapService, { useValue: mapServiceSpy })
      .compileComponents();

    fixture = TestBed.createComponent(IdeaMapComponent);
    component = fixture.componentInstance;
  });

  function setReady(): void {
    clustersSignal.set(MOCK_CLUSTERS);
    pointsSignal.set(MOCK_POINTS);
    threadsSignal.set(MOCK_THREADS);
    loadedSignal.set(true);
    statusSignal.set('ready');
  }

  it('renders no DOM when open is false', () => {
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.idea-map-panel')).toBeNull();
    expect(fixture.nativeElement.querySelector('.idea-map-backdrop')).toBeNull();
  });

  it('renders the panel and backdrop when open is true', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.idea-map-panel')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.idea-map-backdrop')).toBeTruthy();
  });

  it('renders the panel header with title and close button', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.idea-map-title').textContent).toContain('Threads');
    expect(fixture.nativeElement.querySelector('.idea-map-close-btn')).toBeTruthy();
  });

  it('calls load() on the map service when opened', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(mapServiceSpy.load).toHaveBeenCalled();
  });

  it('emits close when the backdrop is clicked', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const captured: void[] = [];
    component.close.subscribe(() => captured.push(undefined));
    fixture.nativeElement.querySelector('.idea-map-backdrop').click();
    expect(captured.length).toBe(1);
  });

  it('emits close when the close button is clicked', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const captured: void[] = [];
    component.close.subscribe(() => captured.push(undefined));
    fixture.nativeElement.querySelector('.idea-map-close-btn').click();
    expect(captured.length).toBe(1);
  });

  it('renders legend items for each cluster', () => {
    setReady();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.legend-item');
    expect(items.length).toBe(MOCK_CLUSTERS.length);
    expect(items[0].textContent).toContain('Fate & Acceptance');
    expect(items[1].textContent).toContain('Mind & Perception');
    expect(items[0].textContent).toContain('lines');
    expect(fixture.nativeElement.querySelector('.directory-intro h4').textContent.trim()).toBe('Choose a thread');
    expect(fixture.nativeElement.querySelector('.directory-intro').textContent).toContain(
      'gathers a few lines that sit well together'
    );
    expect(fixture.nativeElement.querySelector('.directory-kicker')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Ring marks');
    expect(fixture.nativeElement.textContent).not.toContain('Thread index / 04');
  });

  it('highlights a cluster when its legend item is clicked', () => {
    setReady();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('.legend-item');
    items[0].click();
    fixture.detectChanges();

    expect(component.highlightedCluster()).toBe(0);
    expect(items[0].classList.contains('is-highlighted')).toBe(true);
    expect(items[1].classList.contains('is-dimmed')).toBe(true);
  });

  it('keeps the chosen thread open when its legend item is clicked again', () => {
    setReady();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('.legend-item');
    items[0].click();
    items[0].click();
    fixture.detectChanges();

    expect(component.highlightedCluster()).toBe(0);
  });

  it('shows loading indicator when not loaded', () => {
    loadedSignal.set(false);
    statusSignal.set('loading');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.idea-map-body').classList).not.toContain('has-directory');
    expect(fixture.nativeElement.querySelector('.canvas-wrapper')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.map-status').textContent).toContain('Loading the quote threads');
  });

  it('hides loading indicator when loaded', () => {
    setReady();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.map-status')).toBeNull();
  });

  it('shows an honest error and retries from the failed state', () => {
    statusSignal.set('error');
    errorSignal.set('The idea map could not be loaded. Check your connection and try again.');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]');
    expect(fixture.nativeElement.querySelector('.idea-map-body').classList).not.toContain('has-directory');
    expect(fixture.nativeElement.querySelector('.canvas-wrapper')).toBeTruthy();
    expect(alert.textContent).toContain('The map did not load');
    expect(alert.textContent).toContain('could not be loaded');

    mapServiceSpy.load.calls.reset();
    alert.querySelector('.map-retry-btn').click();
    expect(mapServiceSpy.load).toHaveBeenCalledTimes(1);
  });

  it('keeps button semantics and uses list elements for quote threads', () => {
    setReady();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const legend = fixture.nativeElement.querySelector('.cluster-legend');
    const button = legend.querySelector('.legend-item');
    expect(legend.tagName).toBe('UL');
    expect(button.parentElement.tagName).toBe('LI');
    expect(button.getAttribute('role')).toBeNull();
  });

  it('exposes quote excerpts and authors after a thread is chosen', () => {
    setReady();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.legend-item').click();
    fixture.detectChanges();

    const quoteButton = fixture.nativeElement.querySelector('.thread-quote');
    expect(quoteButton.textContent).toContain(MOCK_QUOTES[0].text);
    expect(quoteButton.textContent).toContain(MOCK_QUOTES[0].author);
    expect(quoteButton.getAttribute('aria-label')).toContain(`Read quote by ${MOCK_QUOTES[0].author}`);
  });

  it('keeps the complete quote in each thread choice accessible name', () => {
    const longQuote: Quote = {
      ...MOCK_QUOTES[0],
      text: 'A complete accessible name must preserve this entire quotation even when the visible editorial excerpt is intentionally shortened for the compact thread directory.',
    };
    setReady();
    threadsSignal.set([
      { cluster: MOCK_CLUSTERS[0], quotes: [longQuote] },
      { cluster: MOCK_CLUSTERS[1], quotes: [MOCK_QUOTES[1]] },
    ]);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.legend-item').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.thread-quote').getAttribute('aria-label')).toBe(
      `Read quote by ${longQuote.author}: ${longQuote.text}`
    );
  });

  it('explains and marks the quote currently open in the reader', () => {
    setReady();
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('currentQuote', MOCK_QUOTES[0]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.current-quote-key')).toBeNull();

    const current = fixture.nativeElement.querySelector('.thread-quote.is-current');
    expect(current).toBeTruthy();
    expect(current.getAttribute('aria-current')).toBe('true');
    expect(current.textContent).toContain('Reading now');
    expect(current.querySelector('.current-quote-ring')).toBeTruthy();
  });

  it('opens the current quote thread instead of leaving the directory empty', () => {
    setReady();
    fixture.componentRef.setInput('currentQuote', MOCK_QUOTES[1]);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    expect(component.highlightedCluster()).toBe(1);
    expect(fixture.nativeElement.querySelector('.thread-empty')).toBeNull();
    expect(fixture.nativeElement.querySelector('.thread-directory section').getAttribute('aria-label')).toBe(
      'Mind & Perception'
    );
    expect(fixture.nativeElement.querySelector('.thread-directory-header')).toBeNull();
    expect(fixture.nativeElement.querySelector('.thread-quote.is-current')).toBeTruthy();
  });

  it('selects a quote with Enter from the thread index and closes the map', () => {
    setReady();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.legend-item').click();
    fixture.detectChanges();

    const selected: Quote[] = [];
    let closeCount = 0;
    component.selectQuote.subscribe((quote) => selected.push(quote));
    component.close.subscribe(() => closeCount++);

    const quoteButton = fixture.nativeElement.querySelector('.thread-quote');
    quoteButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(selected).toEqual([MOCK_QUOTES[0]]);
    expect(closeCount).toBe(1);
  });

  it('does not emit selectQuote when canvas has no rendered size (headless)', () => {
    // In headless Chrome the canvas clientWidth/Height is 0, so hitTest returns null.
    // This test verifies the component handles that gracefully (no throw, no output).
    setReady();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const selectedQuotes: unknown[] = [];
    component.selectQuote.subscribe((q) => selectedQuotes.push(q));

    const canvas = fixture.nativeElement.querySelector('canvas');
    expect(canvas).toBeTruthy();

    // clientWidth is 0 in headless — hitTest will short-circuit and not resolve a quote
    const fakeEvent = { offsetX: 0, offsetY: 0 } as MouseEvent;
    expect(() => component.onCanvasClick(fakeEvent)).not.toThrow();
  });

  it('onCanvasPointerLeave hides tooltip', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    // Force tooltip visible
    component.tooltip.set({
      visible: true,
      x: 10,
      y: 10,
      text: 'T',
      author: 'A',
      clusterLabel: 'C',
      quoteId: 'quote-0',
    });
    component.onCanvasPointerLeave();
    expect(component.tooltip().visible).toBe(false);
  });

  it('clusterColor returns a non-empty string for each cluster id 0–6', () => {
    for (let i = 0; i < 7; i++) {
      const color = component.clusterColor(i);
      expect(typeof color).toBe('string');
      expect(color.length).toBeGreaterThan(0);
    }
  });

  it('draws same-cluster stitches with the thread dash pattern, then resets canvas dash/cap before dots and the "you are here" ring', () => {
    // Regression test for the red-thread rendering path: every other spec
    // stubs neighborsOf() to return [], so the stitching branch (and the
    // ctx.setLineDash/lineCap reset it depends on) never ran in CI before
    // this test existed. Two points sharing a cluster, placed close enough
    // to clear the maxLink distance filter, forces the same-cluster
    // ("red stitch") branch to fire and leave dash/cap state dirty ahead of
    // the dots and "you are here" ring, which must render solid.
    const points: QuoteMapPoint[] = [
      { quoteId: 'quote-0', lx: 0, ly: 0, cluster: 0 },
      { quoteId: 'quote-1', lx: 0.05, ly: 0.05, cluster: 0 },
    ];
    mapServiceSpy.neighborsOf.and.callFake((quoteId: string) => (quoteId === 'quote-0' ? ['quote-1'] : []));
    clustersSignal.set(MOCK_CLUSTERS);
    pointsSignal.set(points);
    threadsSignal.set(MOCK_THREADS);
    loadedSignal.set(true);
    statusSignal.set('ready');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const wrapper = fixture.nativeElement.querySelector('.canvas-wrapper') as HTMLDivElement;
    Object.defineProperty(wrapper, 'clientWidth', { value: 600, configurable: true });
    Object.defineProperty(wrapper, 'clientHeight', { value: 400, configurable: true });

    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    expect(ctx).toBeTruthy();
    if (!ctx) return;
    const dashSpy = spyOn(ctx, 'setLineDash').and.callThrough();

    // Bypass the async entrance animation (real requestAnimationFrame ticks
    // aren't deterministic in a synchronous spec) and draw one frame at full
    // opacity by calling the private draw() method directly.
    const instance = component as unknown as { entranceProgress: number; draw: () => void };
    instance.entranceProgress = 1;
    instance.draw();

    expect(dashSpy).toHaveBeenCalledWith([3, 2.5]);
    expect(ctx.getLineDash()).toEqual([]);
    expect(ctx.lineCap).toBe('butt');
    expect(ctx.letterSpacing).toBe('0px');
  });

  it("guarantees a full-strength settle paint once the entrance animation completes, independent of the step loop's own final frame landing", async () => {
    // Regression test for a first-open bug: the map could render stuck at a
    // dim, early-entrance alpha indefinitely, only recovering to full
    // strength the instant something unrelated (e.g. a legend click)
    // triggered a fresh draw. entranceProgress itself reached 1 correctly —
    // the step loop's OWN last draw() call was the single point of failure
    // for actually presenting that final frame (droppable by the browser
    // under page-load paint contention, or by any thrown exception). The fix
    // routes a guaranteed settle draw through the independent scheduleDraw()
    // path once the animation completes, so the final full-strength paint
    // never depends on that one frame landing. This asserts the guarantee
    // directly: draw() must be called at entranceProgress===1 more than
    // once — the step loop's own last frame, AND the guaranteed settle draw.
    setReady();
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();

    // Opening triggers the ONE natural entrance run synchronously via the
    // constructor's effect (its first requestAnimationFrame is scheduled but
    // cannot have fired yet — we're still on the same synchronous call
    // stack). Size the canvas and install the spy before yielding to any
    // frame, so every draw of this single entrance is captured and counted
    // (a second, manually-triggered entrance here would race the natural one
    // and produce a false-positive pass regardless of the fix).
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const wrapper = fixture.nativeElement.querySelector('.canvas-wrapper') as HTMLDivElement;
    Object.defineProperty(wrapper, 'clientWidth', { value: 600, configurable: true });
    Object.defineProperty(wrapper, 'clientHeight', { value: 400, configurable: true });

    const instance = component as unknown as { draw: () => void; entranceProgress: number };
    const easeAtEachDraw: number[] = [];
    const originalDraw = instance.draw.bind(instance);
    spyOn(instance, 'draw').and.callFake(() => {
      originalDraw();
      easeAtEachDraw.push(instance.entranceProgress);
    });

    const deadline = performance.now() + 1200;
    while (performance.now() < deadline) {
      await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    }

    const fullStrengthDrawCount = easeAtEachDraw.filter((ease) => ease === 1).length;
    expect(fullStrengthDrawCount).toBeGreaterThanOrEqual(2);
  });

  it('srSummary contains cluster names when loaded', () => {
    setReady();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const summary = component.srSummary();
    expect(summary).toContain('Threads: 2 quotes arranged along 2 loose routes');
    expect(summary).toContain('Fate & Acceptance');
    expect(summary).toContain('Mind & Perception');
    expect(summary).not.toContain('semantic similarity');
  });
});
