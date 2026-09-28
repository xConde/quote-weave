import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { getQuoteWeaveIcon } from '../../utils/icons';
import { FocusTrapDirective } from '@shared/directives/focus-trap.directive';

@Component({
  selector: 'qw-author-panel',
  templateUrl: './author-panel.component.html',
  styleUrls: ['./author-panel.component.scss'],
  standalone: true,
  imports: [FocusTrapDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthorPanelComponent {
  readonly open = input.required<boolean>();
  readonly loading = input<boolean>(false);
  readonly title = input<string | null>(null);
  readonly imageUrl = input<string | null>(null);
  readonly content = input<string | null>(null);

  readonly close = output<void>();
  readonly openWikipediaHome = output<void>();

  private readonly sanitizer = inject(DomSanitizer);
  readonly closeIcon: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(getQuoteWeaveIcon('x', 16));
}
