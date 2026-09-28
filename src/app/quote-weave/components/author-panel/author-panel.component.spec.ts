import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthorPanelComponent } from './author-panel.component';

describe('AuthorPanelComponent', () => {
  let fixture: ComponentFixture<AuthorPanelComponent>;
  let component: AuthorPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AuthorPanelComponent] }).compileComponents();
    fixture = TestBed.createComponent(AuthorPanelComponent);
    component = fixture.componentInstance;
  });

  it('renders nothing when open is false', () => {
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.wiki-panel')).toBeNull();
  });

  it('renders backdrop and panel when open', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.wiki-backdrop')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.wiki-panel')).toBeTruthy();
  });

  it('shows the loading skeleton AND the real header when loading is true', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.wiki-skeleton')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.wiki-skeleton .skeleton-line')).toBeTruthy();
    // Header is ALWAYS visible — close button must always be reachable.
    expect(fixture.nativeElement.querySelector('.wiki-header')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.wiki-header .close-btn')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.wiki-content')).toBeNull();
  });

  it('shows a placeholder "Loading…" title in the header while loading', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('loading', true);
    fixture.componentRef.setInput('title', null);
    fixture.detectChanges();
    const h4 = fixture.nativeElement.querySelector('.wiki-header h4');
    expect(h4.classList.contains('wiki-header-loading')).toBe(true);
    expect(h4.textContent).toContain('Loading');
  });

  it('shows a fallback header title when loading is false but no title arrived (error state)', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('title', null);
    fixture.componentRef.setInput('content', 'Error loading content.');
    fixture.detectChanges();
    const h4 = fixture.nativeElement.querySelector('.wiki-header h4');
    expect(h4.classList.contains('wiki-header-fallback')).toBe(true);
    // User can still close the panel even when the API failed.
    expect(fixture.nativeElement.querySelector('.wiki-header .close-btn')).toBeTruthy();
  });

  it('shows the real title in the header when loading is false and title is set', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('title', 'Albert Einstein');
    fixture.detectChanges();
    const h4 = fixture.nativeElement.querySelector('.wiki-header h4');
    expect(h4.textContent).toContain('Albert Einstein');
    expect(h4.classList.contains('wiki-header-loading')).toBe(false);
    expect(h4.classList.contains('wiki-header-fallback')).toBe(false);
  });

  it('shows author image and HTML content when content is set', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('imageUrl', '/img.jpg');
    fixture.componentRef.setInput('content', '<p>Bio</p>');
    fixture.detectChanges();
    const content = fixture.nativeElement.querySelector('.wiki-content');
    expect(content).toBeTruthy();
    expect(content.querySelector('img').getAttribute('src')).toBe('/img.jpg');
    expect(content.innerHTML).toContain('<p>Bio</p>');
  });

  it('omits the wiki-content block when content is empty', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('content', null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.wiki-content')).toBeNull();
  });

  it('emits close on backdrop click', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    let count = 0;
    component.close.subscribe(() => count++);
    fixture.nativeElement.querySelector('.wiki-backdrop').click();
    expect(count).toBe(1);
  });

  it('emits close on close-btn click', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('title', 'X');
    fixture.detectChanges();
    let count = 0;
    component.close.subscribe(() => count++);
    fixture.nativeElement.querySelector('.close-btn').click();
    expect(count).toBe(1);
  });

  it('emits close on close-btn click EVEN during loading state (key UX guarantee)', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    let count = 0;
    component.close.subscribe(() => count++);
    fixture.nativeElement.querySelector('.close-btn').click();
    expect(count).toBe(1);
  });

  it('emits openWikipediaHome when the wiki logo button is clicked', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('title', 'X');
    fixture.detectChanges();
    let count = 0;
    component.openWikipediaHome.subscribe(() => count++);
    fixture.nativeElement.querySelector('.wiki-logo-btn').click();
    expect(count).toBe(1);
  });

  it('Wikipedia button has a clear label and visible text', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('.wiki-logo-btn') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBe('Open Wikipedia');
    expect(btn.textContent).toContain('Wikipedia');
  });
});
