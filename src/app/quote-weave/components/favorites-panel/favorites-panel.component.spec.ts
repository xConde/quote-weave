import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FavoritesPanelComponent } from './favorites-panel.component';
import { FavoriteQuote } from '../../models/quote-weave.models';

const FAV_A: FavoriteQuote = {
  id: 'a',
  authorId: 'author-auth-a',
  text: 'A',
  author: 'Auth A',
  category: 'philosophy',
  attributionStatus: 'unverified',
  savedAt: 1,
};
const FAV_B: FavoriteQuote = {
  id: 'b',
  authorId: 'author-auth-b',
  text: 'B',
  author: 'Auth B',
  category: 'stoicism',
  attributionStatus: 'unverified',
  savedAt: 2,
};

describe('FavoritesPanelComponent', () => {
  let fixture: ComponentFixture<FavoritesPanelComponent>;
  let component: FavoritesPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FavoritesPanelComponent] }).compileComponents();
    fixture = TestBed.createComponent(FavoritesPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('favorites', []);
  });

  it('renders nothing when open is false', () => {
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.favorites-panel')).toBeNull();
  });

  it('renders empty state when favorites list is empty', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.favorites-empty')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.favorites-item').length).toBe(0);
  });

  it('shows a saved-data load warning without claiming the list was never used', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('loadWarning', 'The saved quote list could not be read.');
    fixture.detectChanges();

    const warning = fixture.nativeElement.querySelector('.favorites-storage-warning');
    expect(warning.getAttribute('role')).toBe('status');
    expect(warning.textContent).toContain('could not be read');
    expect(fixture.nativeElement.querySelector('.favorites-empty-title').textContent).toContain(
      'No saved quotes available'
    );
    expect(fixture.nativeElement.textContent).not.toContain('Nothing saved yet');
  });

  it('renders one item per favorite', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('favorites', [FAV_A, FAV_B]);
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.favorites-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Auth A');
    expect(items[1].textContent).toContain('Auth B');
  });

  it('emits remove(fav) when the heart is clicked', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('favorites', [FAV_A]);
    fixture.detectChanges();
    const captured: FavoriteQuote[] = [];
    component.remove.subscribe((f) => captured.push(f));
    fixture.nativeElement.querySelector('.favorite-btn').click();
    expect(captured).toEqual([FAV_A]);
  });

  it('emits share(fav) when the share button is clicked', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('favorites', [FAV_A]);
    fixture.detectChanges();
    const captured: FavoriteQuote[] = [];
    component.share.subscribe((f) => captured.push(f));
    fixture.nativeElement.querySelector('.share-btn').click();
    expect(captured).toEqual([FAV_A]);
  });

  it('emits close on backdrop and close button', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    let count = 0;
    component.close.subscribe(() => count++);
    fixture.nativeElement.querySelector('.favorites-backdrop').click();
    fixture.nativeElement.querySelector('.close-btn').click();
    expect(count).toBe(2);
  });
});
