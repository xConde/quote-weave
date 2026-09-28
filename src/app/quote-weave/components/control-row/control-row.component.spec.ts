import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ControlRowComponent } from './control-row.component';

describe('ControlRowComponent', () => {
  let fixture: ComponentFixture<ControlRowComponent>;
  let component: ControlRowComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ControlRowComponent] }).compileComponents();
    fixture = TestBed.createComponent(ControlRowComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('favoritesCount', 0);
  });

  it('renders 5 control buttons', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.favorites-btn')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.filter-btn')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.settings-btn')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.help-btn')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.idea-map-btn')).toBeTruthy();
  });

  it('labels the utility rail separately from quote navigation', () => {
    fixture.detectChanges();
    const label = fixture.nativeElement.querySelector('.reader-tools-label');
    const tools = fixture.nativeElement.querySelector('.control-row');

    expect(label.textContent.trim()).toBe('Reader tools');
    expect(tools.getAttribute('aria-labelledby')).toBe(label.id);
  });

  it('shows a stable saved count even when the shelf is empty', () => {
    fixture.componentRef.setInput('favoritesCount', 0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.favorites-count').textContent).toContain('0');
  });

  it('shows favorites count badge when count is positive', () => {
    fixture.componentRef.setInput('favoritesCount', 7);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.favorites-count').textContent).toContain('7');
  });

  it('reflects activeCategory by toggling filter-btn is-active and showing label', () => {
    fixture.componentRef.setInput('activeCategory', 'philosophy');
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('.filter-btn');
    expect(btn.classList.contains('is-active')).toBe(true);
    expect(fixture.nativeElement.querySelector('.filter-label').textContent).toContain('philosophy');
  });

  it('uses dialog-open state, not the selected shelf, for aria-expanded', () => {
    fixture.componentRef.setInput('activeCategory', 'philosophy');
    fixture.componentRef.setInput('categoryBrowserActive', false);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.filter-btn');
    expect(button.getAttribute('aria-expanded')).toBe('false');

    fixture.componentRef.setInput('activeCategory', null);
    fixture.componentRef.setInput('categoryBrowserActive', true);
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('emits the right output for each button click', () => {
    fixture.detectChanges();
    let favorites = 0;
    let category = 0;
    let reading = 0;
    let help = 0;
    let ideaMap = 0;
    component.toggleFavorites.subscribe(() => favorites++);
    component.toggleCategoryBrowser.subscribe(() => category++);
    component.toggleReadingControls.subscribe(() => reading++);
    component.toggleKeyboardHelp.subscribe(() => help++);
    component.toggleIdeaMap.subscribe(() => ideaMap++);

    fixture.nativeElement.querySelector('.favorites-btn').click();
    fixture.nativeElement.querySelector('.filter-btn').click();
    fixture.nativeElement.querySelector('.settings-btn').click();
    fixture.nativeElement.querySelector('.help-btn').click();
    fixture.nativeElement.querySelector('.idea-map-btn').click();

    expect([favorites, category, reading, help, ideaMap]).toEqual([1, 1, 1, 1, 1]);
  });

  it('reflects each panel-active flag on its button', () => {
    fixture.componentRef.setInput('favoritesActive', true);
    fixture.componentRef.setInput('categoryBrowserActive', true);
    fixture.componentRef.setInput('readingControlsActive', true);
    fixture.componentRef.setInput('keyboardHelpActive', true);
    fixture.componentRef.setInput('ideaMapActive', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.favorites-btn').classList.contains('is-active')).toBe(true);
    expect(fixture.nativeElement.querySelector('.filter-btn').getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('.settings-btn').classList.contains('is-active')).toBe(true);
    expect(fixture.nativeElement.querySelector('.help-btn').classList.contains('is-active')).toBe(true);
    expect(fixture.nativeElement.querySelector('.idea-map-btn').classList.contains('is-active')).toBe(true);
  });

  it('names every tool in visible text instead of relying on icons', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Saved');
    expect(fixture.nativeElement.textContent).toContain('Shelves');
    expect(fixture.nativeElement.textContent).toContain('Pace');
    expect(fixture.nativeElement.textContent).toContain('Keys');
    expect(fixture.nativeElement.textContent).toContain('Threads');
  });
});
