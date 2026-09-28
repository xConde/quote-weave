import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { getQuoteWeaveIcon, QuoteWeaveIconName } from '../../utils/icons';
import { FavoriteQuote } from '../../models/quote-weave.models';
import { FocusTrapDirective } from '@shared/directives/focus-trap.directive';

@Component({
  selector: 'qw-favorites-panel',
  templateUrl: './favorites-panel.component.html',
  styleUrls: ['./favorites-panel.component.scss'],
  standalone: true,
  imports: [FocusTrapDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FavoritesPanelComponent {
  readonly open = input.required<boolean>();
  readonly favorites = input.required<FavoriteQuote[]>();
  readonly loadWarning = input<string | null>(null);

  readonly close = output<void>();
  readonly remove = output<FavoriteQuote>();
  readonly share = output<FavoriteQuote>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly iconCache = new Map<string, SafeHtml>();

  icon(name: QuoteWeaveIconName, size: number): SafeHtml {
    const key = `${name}:${size}`;
    let cached = this.iconCache.get(key);
    if (!cached) {
      cached = this.sanitizer.bypassSecurityTrustHtml(getQuoteWeaveIcon(name, size));
      this.iconCache.set(key, cached);
    }
    return cached;
  }

  categoryClass(category: string): string {
    const normalized = category.toLowerCase().replace(/\s+/g, '-');
    return `category-badge category-${normalized}`;
  }
}
