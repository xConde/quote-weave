import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { getQuoteWeaveIcon } from '../../utils/icons';
import { FocusTrapDirective } from '@shared/directives/focus-trap.directive';

@Component({
  selector: 'qw-keyboard-help',
  templateUrl: './keyboard-help.component.html',
  styleUrls: ['./keyboard-help.component.scss'],
  standalone: true,
  imports: [FocusTrapDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyboardHelpComponent {
  readonly open = input.required<boolean>();
  readonly close = output<void>();

  private readonly sanitizer = inject(DomSanitizer);
  readonly closeIcon: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(getQuoteWeaveIcon('x', 16));

  emitClose(): void {
    this.close.emit();
  }
}
