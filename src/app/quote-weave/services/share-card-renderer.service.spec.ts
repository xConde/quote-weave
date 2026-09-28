import { TestBed } from '@angular/core/testing';
import { formatQuoteShareText, ShareCardRendererService } from './share-card-renderer.service';
import { Quote } from './quote-collection.service';

describe('ShareCardRendererService', () => {
  let service: ShareCardRendererService;
  let shareDescriptor: PropertyDescriptor | undefined;
  let canShareDescriptor: PropertyDescriptor | undefined;
  const sampleQuote: Quote = {
    id: 'quote-sample',
    authorId: 'author-test-author',
    text: 'Sample quote.',
    author: 'Test Author',
    category: 'philosophy',
    attributionStatus: 'unverified',
  };
  const sourcedQuote: Quote = {
    ...sampleQuote,
    attributionStatus: 'sourced',
    source: {
      citation: 'A careful source, Chapter 3 (1978)',
      url: 'https://example.com/source',
    },
  };
  const reportedQuote: Quote = {
    ...sourcedQuote,
    attributionStatus: 'reported',
  };

  beforeEach(() => {
    shareDescriptor = Object.getOwnPropertyDescriptor(navigator, 'share');
    canShareDescriptor = Object.getOwnPropertyDescriptor(navigator, 'canShare');
    TestBed.configureTestingModule({ providers: [ShareCardRendererService] });
    service = TestBed.inject(ShareCardRendererService);
  });

  afterEach(() => {
    service.clear();
    restoreNavigatorProperty('share', shareDescriptor);
    restoreNavigatorProperty('canShare', canShareDescriptor);
  });

  function setNavigatorProperty(name: 'share' | 'canShare', value: unknown): void {
    Object.defineProperty(navigator, name, { configurable: true, writable: true, value });
  }

  function restoreNavigatorProperty(name: 'share' | 'canShare', descriptor: PropertyDescriptor | undefined): void {
    if (descriptor) {
      Object.defineProperty(navigator, name, descriptor);
    } else {
      Reflect.deleteProperty(navigator, name);
    }
  }

  it('initializes in the idle state', () => {
    expect(service.state()).toEqual({ status: 'idle' });
  });

  it('requires navigator.canShare to accept image files before exposing native share', () => {
    const share = jasmine.createSpy('share').and.resolveTo();
    const canShare = jasmine.createSpy('canShare').and.returnValue(false);
    setNavigatorProperty('share', share);
    setNavigatorProperty('canShare', canShare);

    expect(service.canNativeShare).toBeFalse();
    expect(canShare).toHaveBeenCalledWith({ files: [jasmine.any(File)] });

    canShare.and.returnValue(true);
    expect(service.canNativeShare).toBeTrue();
  });

  it('render() keeps a blob URL for export and a CSP-safe data URL for preview', async () => {
    await service.render(sampleQuote);
    const state = service.state();
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.quote).toEqual(sampleQuote);
    expect(state.imageUrl).toMatch(/^blob:/);
    expect(state.previewUrl).toMatch(/^data:image\/png/);
  });

  it('render() falls back to default palette for unknown categories', async () => {
    const unknown: Quote = { ...sampleQuote, category: 'unknown-category' };
    await service.render(unknown);
    const state = service.state();
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.quote.category).toBe('unknown-category');
  });

  it('draws source provenance into the exported image', async () => {
    const fillTextSpy = spyOn(CanvasRenderingContext2D.prototype, 'fillText').and.callThrough();

    await service.render(sourcedQuote);

    const drawnText = fillTextSpy.calls.allArgs().map(([text]) => text);
    expect(drawnText.filter((text) => text === 'SOURCE').length).toBe(1);
    expect(drawnText.filter((text) => text === sourcedQuote.source!.citation).length).toBe(1);
    expect(drawnText.some((text) => text === 'QUOTE WEAVE')).toBeTrue();
    expect(drawnText.some((text) => text === 'THE SLOW READER')).toBeTrue();
    expect(drawnText.some((text) => text === 'KEEP THE LINE. FOLLOW THE THREAD.')).toBeTrue();
  });

  it('keeps citation and source URL in shared text', () => {
    const text = formatQuoteShareText(sourcedQuote);

    expect(text).toContain(sourcedQuote.source!.citation);
    expect(text).toContain(sourcedQuote.source!.url!);
  });

  it('keeps a reported attribution qualified in text and image exports', async () => {
    const fillTextSpy = spyOn(CanvasRenderingContext2D.prototype, 'fillText').and.callThrough();

    await service.render(reportedQuote);

    expect(formatQuoteShareText(reportedQuote)).toContain('Reported attribution:');
    expect(fillTextSpy.calls.allArgs().some(([text]) => text === 'REPORTED VIA')).toBeTrue();
    expect(fillTextSpy.calls.allArgs().some(([text]) => text === 'SOURCE')).toBeFalse();
  });

  it('clear() revokes the blob URL and clears state', async () => {
    await service.render(sampleQuote);
    const rendered = service.state();
    expect(rendered.status).toBe('ready');
    if (rendered.status !== 'ready') return;
    const url = rendered.imageUrl;
    const revokeSpy = spyOn(URL, 'revokeObjectURL');
    service.clear();
    expect(revokeSpy).toHaveBeenCalledWith(url);
    expect(service.state()).toEqual({ status: 'idle' });
  });

  it('clear() is a no-op when state is already idle', () => {
    const revokeSpy = spyOn(URL, 'revokeObjectURL');
    service.clear();
    expect(revokeSpy).not.toHaveBeenCalled();
    expect(service.state()).toEqual({ status: 'idle' });
  });

  it('render() revokes previous blob URL when called twice', async () => {
    await service.render(sampleQuote);
    const first = service.state();
    expect(first.status).toBe('ready');
    if (first.status !== 'ready') return;
    const firstUrl = first.imageUrl;
    const revokeSpy = spyOn(URL, 'revokeObjectURL').and.callThrough();
    await service.render({ ...sampleQuote, text: 'Different text' });
    expect(revokeSpy).toHaveBeenCalledWith(firstUrl);
    const second = service.state();
    expect(second.status).toBe('ready');
    if (second.status !== 'ready') return;
    expect(second.imageUrl).not.toBe(firstUrl);
  });

  it('moves to an actionable error state when canvas.toBlob returns null', async () => {
    spyOn(HTMLCanvasElement.prototype, 'toBlob').and.callFake((callback: BlobCallback) => callback(null));

    await service.render(sampleQuote);

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.quote).toEqual(sampleQuote);
    expect(state.message).toContain('could not be made');
  });

  it('ignores a stale late toBlob failure after a newer render succeeds', async () => {
    const callbacks: BlobCallback[] = [];
    spyOn(HTMLCanvasElement.prototype, 'toBlob').and.callFake((callback: BlobCallback) => {
      callbacks.push(callback);
    });
    spyOn(URL, 'createObjectURL').and.returnValue('blob:newer');

    const older = service.render(sampleQuote);
    const newerQuote = { ...sampleQuote, id: 'quote-newer', text: 'Newer' };
    const newer = service.render(newerQuote);
    callbacks[1](new Blob(['new'], { type: 'image/png' }));
    await newer;
    callbacks[0](null);
    await older;

    const state = service.state();
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.quote.id).toBe('quote-newer');
  });

  it('render() invoked twice in parallel does not leak the loser blob URL', async () => {
    const createdUrls: string[] = [];
    const revoked: string[] = [];
    spyOn(URL, 'createObjectURL').and.callFake((blob: Blob) => {
      const url = `blob:fake-${createdUrls.length}-${blob.size}`;
      createdUrls.push(url);
      return url;
    });
    spyOn(URL, 'revokeObjectURL').and.callFake((url: string) => {
      revoked.push(url);
    });
    // Fire both renders nearly simultaneously, await both
    const a = service.render(sampleQuote);
    const b = service.render({ ...sampleQuote, text: 'B' });
    await Promise.all([a, b]);

    // Whichever URLs were created, all but the final state's URL must have
    // been revoked. No outstanding URLs leak.
    const state = service.state();
    const finalUrl = state.status === 'ready' ? state.imageUrl : undefined;
    const leaked = createdUrls.filter((u) => u !== finalUrl && !revoked.includes(u));
    expect(leaked).toEqual([]);
  });

  it('render() that loses a race against clear() does not leave state populated', async () => {
    const a = service.render(sampleQuote);
    service.clear();
    await a;
    expect(service.state()).toEqual({ status: 'idle' });
  });

  it('download() does nothing when state is null', () => {
    const appendSpy = spyOn(document.body, 'appendChild');
    service.download();
    expect(appendSpy).not.toHaveBeenCalled();
  });

  it('download() creates a sanitized filename anchor and clicks it', async () => {
    await service.render({ ...sampleQuote, author: 'Hello World!' });
    const anchorClicks: HTMLAnchorElement[] = [];
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      anchorClicks.push(this);
    };
    try {
      service.download();
    } finally {
      HTMLAnchorElement.prototype.click = original;
    }
    expect(anchorClicks.length).toBe(1);
    expect(anchorClicks[0].download).toBe('hello-world-quote.png');
    const state = service.state();
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(anchorClicks[0].href).toBe(state.imageUrl);
  });

  it('nativeShare() reports unavailable when no card is ready', async () => {
    const fetchSpy = spyOn(window, 'fetch');
    const result = await service.nativeShare();
    expect(result).toBe('unavailable');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('nativeShare() treats closing the operating-system share sheet as cancellation', async () => {
    setNavigatorProperty('canShare', jasmine.createSpy('canShare').and.returnValue(true));
    setNavigatorProperty(
      'share',
      jasmine.createSpy('share').and.rejectWith(new DOMException('Cancelled', 'AbortError'))
    );
    await service.render(sampleQuote);
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(new Blob(['x'], { type: 'image/png' }))));
    const shareSpy = navigator.share as jasmine.Spy;
    const result = await service.nativeShare();

    expect(result).toBe('cancelled');
    expect(shareSpy).toHaveBeenCalled();
    expect(shareSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({ text: jasmine.stringMatching(/Attribution status: Not yet verified/) })
    );
  });

  it('does not invoke native share when canShare rejects the generated file', async () => {
    const shareSpy = jasmine.createSpy('share').and.resolveTo();
    const canShareSpy = jasmine.createSpy('canShare').and.returnValues(true, false);
    setNavigatorProperty('share', shareSpy);
    setNavigatorProperty('canShare', canShareSpy);
    await service.render(sampleQuote);
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(new Blob(['x'], { type: 'image/png' }))));

    const result = await service.nativeShare();

    expect(result).toBe('unavailable');
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('reports a non-cancellation native-share failure', async () => {
    setNavigatorProperty('canShare', jasmine.createSpy('canShare').and.returnValue(true));
    setNavigatorProperty('share', jasmine.createSpy('share').and.rejectWith(new TypeError('Share target failed')));
    await service.render(sampleQuote);
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(new Blob(['x']))));

    expect(await service.nativeShare()).toBe('error');
  });

  it('reports a blob fetch failure instead of invoking the share sheet', async () => {
    const shareSpy = jasmine.createSpy('share').and.resolveTo();
    setNavigatorProperty('canShare', jasmine.createSpy('canShare').and.returnValue(true));
    setNavigatorProperty('share', shareSpy);
    await service.render(sampleQuote);
    spyOn(window, 'fetch').and.rejectWith(new TypeError('Blob unavailable'));

    expect(await service.nativeShare()).toBe('error');
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('reports a non-success blob response instead of invoking the share sheet', async () => {
    const shareSpy = jasmine.createSpy('share').and.resolveTo();
    setNavigatorProperty('canShare', jasmine.createSpy('canShare').and.returnValue(true));
    setNavigatorProperty('share', shareSpy);
    await service.render(sampleQuote);
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(null, { status: 404 })));

    expect(await service.nativeShare()).toBe('error');
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('reports when the operating-system share sheet completes', async () => {
    const shareSpy = jasmine.createSpy('share').and.resolveTo();
    setNavigatorProperty('canShare', jasmine.createSpy('canShare').and.returnValue(true));
    setNavigatorProperty('share', shareSpy);
    await service.render(sampleQuote);
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(new Blob(['x']))));

    expect(await service.nativeShare()).toBe('shared');
    expect(shareSpy).toHaveBeenCalled();
  });
});
