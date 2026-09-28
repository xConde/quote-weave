import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { getQuoteWeaveIcon } from '../../utils/icons';
import { QuoteWeaveSettings } from '../../models/quote-weave.models';
import { FocusTrapDirective } from '@shared/directives/focus-trap.directive';

@Component({
  selector: 'qw-reading-controls',
  templateUrl: './reading-controls.component.html',
  styleUrls: ['./reading-controls.component.scss'],
  standalone: true,
  imports: [FocusTrapDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadingControlsComponent {
  readonly open = input.required<boolean>();
  readonly settings = input.required<QuoteWeaveSettings>();

  readonly close = output<void>();
  readonly typingSpeedChange = output<number>();
  readonly autoAdvanceChange = output<boolean>();

  private readonly sanitizer = inject(DomSanitizer);
  readonly closeIcon: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(getQuoteWeaveIcon('x', 16));
}
