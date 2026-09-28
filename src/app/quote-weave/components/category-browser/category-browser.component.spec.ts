import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CategoryBrowserComponent, CategorySummary } from './category-browser.component';

const SUMMARIES: CategorySummary[] = [
  { category: 'Programming', count: 50 },
  { category: 'Philosophy', count: 30 },
  { category: 'Stoicism', count: 20 },
];

describe('CategoryBrowserComponent', () => {
  let fixture: ComponentFixture<CategoryBrowserComponent>;
  let component: CategoryBrowserComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CategoryBrowserComponent] }).compileComponents();
    fixture = TestBed.createComponent(CategoryBrowserComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('categories', SUMMARIES);
    fixture.componentRef.setInput('totalCount', 100);
  });

  it('renders no DOM when open is false', () => {
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.category-browser')).toBeNull();
  });

  it('renders pills for All + each category when open', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const pills = fixture.nativeElement.querySelectorAll('.category-pill');
    expect(pills.length).toBe(SUMMARIES.length + 1); // +1 for "All"
    expect(pills[0].textContent).toContain('All');
    expect(pills[0].textContent).toContain('100');
  });

  it('marks the active pill', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('activeCategory', 'Philosophy');
    fixture.detectChanges();
    const active = fixture.nativeElement.querySelectorAll('.is-active');
    expect(active.length).toBe(1);
    expect(active[0].textContent).toContain('Philosophy');
    expect(active[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('emits select(null) when "All" is clicked', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const captured: (string | null)[] = [];
    component.select.subscribe((v) => captured.push(v));
    fixture.nativeElement.querySelectorAll('.category-pill')[0].click();
    expect(captured).toEqual([null]);
  });

  it('emits select(category) when a category pill is clicked', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const captured: (string | null)[] = [];
    component.select.subscribe((v) => captured.push(v));
    fixture.nativeElement.querySelectorAll('.category-pill')[2].click(); // Philosophy
    expect(captured).toEqual(['Philosophy']);
  });

  it('emits close on backdrop and close button', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const captured: void[] = [];
    component.close.subscribe(() => captured.push(undefined));
    fixture.nativeElement.querySelector('.category-backdrop').click();
    fixture.nativeElement.querySelector('.close-btn').click();
    expect(captured.length).toBe(2);
  });

  it('categoryClass produces normalized slug', () => {
    expect(component.categoryClass('Science Fiction')).toBe('category-badge category-science-fiction');
  });

  it('does not inherit inline badge spacing on category pills', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const categoryPill = fixture.nativeElement.querySelector('.category-pill.category-badge');
    expect(getComputedStyle(categoryPill).marginLeft).toBe('0px');
  });
});
