import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SharePreviewComponent } from './share-preview.component';

describe('SharePreviewComponent', () => {
  let fixture: ComponentFixture<SharePreviewComponent>;
  let component: SharePreviewComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SharePreviewComponent] }).compileComponents();
    fixture = TestBed.createComponent(SharePreviewComponent);
    component = fixture.componentInstance;
  });

  it('renders nothing when open is false', () => {
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.share-panel')).toBeNull();
    expect(fixture.nativeElement.querySelector('.share-backdrop')).toBeNull();
  });

  it('renders the panel with progress while the image is rendering', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('state', {
      status: 'rendering',
      quote: {
        id: 'quote-a',
        authorId: 'author-a',
        text: 'A quote',
        author: 'Author A',
        category: 'Philosophy',
        attributionStatus: 'unverified',
      },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.share-backdrop')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.share-panel')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('progress')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Making your quote card');
  });

  function setReadyState(): void {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('state', {
      status: 'ready',
      imageUrl: 'blob:fake',
      previewUrl: 'data:image/png;base64,fake',
      quote: {
        id: 'quote-a',
        authorId: 'author-a',
        text: 'A quote',
        author: 'Author A',
        category: 'Philosophy',
        attributionStatus: 'unverified',
      },
    });
  }

  it('renders backdrop and panel with the image when ready', () => {
    setReadyState();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.share-panel')).toBeTruthy();
    expect((fixture.nativeElement.querySelector('img') as HTMLImageElement).src).toContain(
      'data:image/png;base64,fake'
    );
  });

  it('replaces a failed image with a deterministic text card', () => {
    setReadyState();
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    image.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    const fallback = fixture.nativeElement.querySelector('.share-card-fallback');
    expect(fallback).toBeTruthy();
    expect(fallback.getAttribute('role')).toBe('img');
    expect(fallback.textContent).toContain('A quote');
    expect(fallback.textContent).toContain('Author A');
    expect(fallback.textContent).toContain('Attribution status: Not yet verified');
    expect(fallback.getAttribute('aria-label')).toContain('Attribution status: Not yet verified');
    const buttons = fixture.nativeElement.querySelectorAll('.share-action-btn');
    expect(buttons[0].textContent).toContain('Try image again');
    expect(buttons[1].textContent).toContain('Copy quote');

    let retries = 0;
    component.retry.subscribe(() => retries++);
    buttons[0].click();
    expect(retries).toBe(1);
  });

  it('clears a failed preview when a new render begins', () => {
    setReadyState();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('img') as HTMLImageElement).dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(component.failedImageUrl()).not.toBeNull();

    fixture.componentRef.setInput('state', {
      status: 'rendering',
      quote: {
        id: 'quote-a',
        authorId: 'author-a',
        text: 'A quote',
        author: 'Author A',
        category: 'Philosophy',
        attributionStatus: 'unverified',
      },
    });
    fixture.detectChanges();

    expect(component.failedImageUrl()).toBeNull();
  });

  it('keeps sourced provenance in the card alt without repeating a row below it', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('state', {
      status: 'ready',
      imageUrl: 'blob:source-card',
      previewUrl: 'data:image/png;base64,source-card',
      quote: {
        id: 'quote-a',
        authorId: 'author-a',
        text: 'A quote',
        author: 'Author A',
        category: 'Philosophy',
        attributionStatus: 'sourced',
        source: { citation: 'A source, Chapter 2 (1978)', url: 'https://example.com/source' },
      },
    });
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('.share-preview-image img') as HTMLImageElement;
    expect(image.alt).toContain('Source: A source, Chapter 2 (1978)');
    expect(fixture.nativeElement.querySelector('.share-provenance')).toBeNull();
  });

  it('qualifies reported attribution in the card alt', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('state', {
      status: 'ready',
      imageUrl: 'blob:reported-card',
      previewUrl: 'data:image/png;base64,reported-card',
      quote: {
        id: 'quote-a',
        authorId: 'author-a',
        text: 'A quote',
        author: 'Author A',
        category: 'Filmmaking',
        attributionStatus: 'reported',
        source: { citation: 'A reported interview', url: 'https://example.com/interview' },
      },
    });
    fixture.detectChanges();

    const alt = (fixture.nativeElement.querySelector('.share-preview-image img') as HTMLImageElement).alt;
    expect(alt).toContain('Reported attribution: A reported interview');
    expect(alt).not.toContain('Source kept with the card');
  });

  it('omits the native share button when canNativeShare is false', () => {
    setReadyState();
    fixture.componentRef.setInput('canNativeShare', false);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('.share-action-btn');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('Download');
    expect(buttons[1].textContent).toContain('Copy quote');
  });

  it('shows Download, native Share, and Copy when file sharing is supported', () => {
    setReadyState();
    fixture.componentRef.setInput('canNativeShare', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.share-action-btn').length).toBe(3);
  });

  it('emits download when the primary button is clicked', () => {
    setReadyState();
    fixture.detectChanges();
    let count = 0;
    component.download.subscribe(() => count++);
    fixture.nativeElement.querySelector('.share-action-btn--primary').click();
    expect(count).toBe(1);
  });

  it('emits nativeShare when the secondary button is clicked', () => {
    setReadyState();
    fixture.componentRef.setInput('canNativeShare', true);
    fixture.detectChanges();
    let count = 0;
    component.nativeShare.subscribe(() => count++);
    const buttons = fixture.nativeElement.querySelectorAll('.share-action-btn');
    (buttons[1] as HTMLButtonElement).click();
    expect(count).toBe(1);
  });

  it('emits close on backdrop and close button', () => {
    setReadyState();
    fixture.detectChanges();
    let count = 0;
    component.close.subscribe(() => count++);
    fixture.nativeElement.querySelector('.share-backdrop').click();
    fixture.nativeElement.querySelector('.close-btn').click();
    expect(count).toBe(2);
  });

  it('renders an actionable error with retry and copy-text fallback', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('state', {
      status: 'error',
      message: 'Card failed.',
      quote: {
        id: 'quote-a',
        authorId: 'author-a',
        text: 'A quote',
        author: 'Author A',
        category: 'Philosophy',
        attributionStatus: 'unverified',
      },
    });
    let retries = 0;
    let copies = 0;
    component.retry.subscribe(() => retries++);
    component.copyText.subscribe(() => copies++);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
    const buttons = fixture.nativeElement.querySelectorAll('.share-action-btn');
    expect(buttons[0].textContent).toContain('Try again');
    expect(buttons[1].textContent).toContain('Copy quote');
    buttons[0].click();
    buttons[1].click();
    expect(retries).toBe(1);
    expect(copies).toBe(1);
  });

  it('announces copy success', () => {
    setReadyState();
    fixture.componentRef.setInput('copyStatus', 'copied');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.share-copy-feedback').textContent).toContain('Quote copied');
  });

  it('announces an actionable native-share failure', () => {
    setReadyState();
    fixture.componentRef.setInput('nativeShareStatus', 'error');
    fixture.detectChanges();

    const feedback = fixture.nativeElement.querySelector('.share-native-feedback');
    expect(feedback.getAttribute('aria-live')).toBe('polite');
    expect(feedback.textContent).toContain('Sharing didn’t complete');
    expect(feedback.textContent).toContain('Download the card or copy the quote');
  });

  it('announces a capability mismatch with a download and copy fallback', () => {
    setReadyState();
    fixture.componentRef.setInput('nativeShareStatus', 'unavailable');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.share-native-feedback').textContent).toContain(
      'This browser couldn’t share the image'
    );
  });

  it('confirms a completed native share briefly', () => {
    setReadyState();
    fixture.componentRef.setInput('nativeShareStatus', 'shared');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.share-native-feedback').textContent).toContain('Shared.');
  });
});
