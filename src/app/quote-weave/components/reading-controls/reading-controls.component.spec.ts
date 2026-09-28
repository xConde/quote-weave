import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReadingControlsComponent } from './reading-controls.component';
import { DEFAULT_SETTINGS } from '../../models/quote-weave.models';

describe('ReadingControlsComponent', () => {
  let fixture: ComponentFixture<ReadingControlsComponent>;
  let component: ReadingControlsComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ReadingControlsComponent] }).compileComponents();
    fixture = TestBed.createComponent(ReadingControlsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('settings', { ...DEFAULT_SETTINGS });
  });

  it('renders no DOM when open is false', () => {
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.reading-controls-panel')).toBeNull();
  });

  it('renders backdrop and panel when open', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.reading-controls-backdrop')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.reading-controls-panel')).toBeTruthy();
  });

  it('emits typingSpeedChange when a speed pill is clicked', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const captured: number[] = [];
    component.typingSpeedChange.subscribe((v) => captured.push(v));
    const pills = fixture.nativeElement.querySelectorAll('.speed-pill');
    (pills[0] as HTMLButtonElement).click(); // 80
    (pills[2] as HTMLButtonElement).click(); // 25
    expect(captured).toEqual([80, 25]);
  });

  it('emits autoAdvanceChange with the inverted value when the toggle is clicked', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('settings', { ...DEFAULT_SETTINGS, autoAdvance: true });
    fixture.detectChanges();
    const captured: boolean[] = [];
    component.autoAdvanceChange.subscribe((v) => captured.push(v));
    const toggles = fixture.nativeElement.querySelectorAll('.toggle-btn');
    (toggles[0] as HTMLButtonElement).click();
    expect(captured).toEqual([false]);
  });

  it('exposes pressed state for the selected speed and switch state for auto-wander', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('settings', { ...DEFAULT_SETTINGS, typingSpeedMs: 25, autoAdvance: true });
    fixture.detectChanges();
    const pills = fixture.nativeElement.querySelectorAll('.speed-pill');
    expect(pills[2].getAttribute('aria-pressed')).toBe('true');
    expect(fixture.nativeElement.querySelector('.toggle-btn').getAttribute('aria-checked')).toBe('true');
  });

  it('emits close when the close button is clicked', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    let emitted = false;
    component.close.subscribe(() => (emitted = true));
    fixture.nativeElement.querySelector('.close-btn').click();
    expect(emitted).toBe(true);
  });
});
