import { ComponentFixture, TestBed } from '@angular/core/testing';
import { KeyboardHelpComponent } from './keyboard-help.component';

describe('KeyboardHelpComponent', () => {
  let fixture: ComponentFixture<KeyboardHelpComponent>;
  let component: KeyboardHelpComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [KeyboardHelpComponent] }).compileComponents();
    fixture = TestBed.createComponent(KeyboardHelpComponent);
    component = fixture.componentInstance;
  });

  it('renders no DOM when open is false', () => {
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.keyboard-help-panel')).toBeNull();
  });

  it('renders backdrop and panel when open', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.keyboard-help-backdrop')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.keyboard-help-panel')).toBeTruthy();
  });

  it('emits close when backdrop is clicked', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    let emitted = false;
    component.close.subscribe(() => (emitted = true));
    fixture.nativeElement.querySelector('.keyboard-help-backdrop').click();
    expect(emitted).toBe(true);
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
