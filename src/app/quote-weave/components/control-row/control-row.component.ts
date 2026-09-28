import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { getQuoteWeaveIcon, QuoteWeaveIconName } from '../../utils/icons';

@Component({
  selector: 'qw-control-row',
  templateUrl: './control-row.component.html',
  styleUrls: ['./control-row.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlRowComponent {
  readonly favoritesCount = input.required<number>();
  readonly activeCategory = input<string | null>(null);
  readonly favoritesActive = input<boolean>(false);
  readonly categoryBrowserActive = input<boolean>(false);
  readonly readingControlsActive = input<boolean>(false);
  readonly keyboardHelpActive = input<boolean>(false);

  readonly ideaMapActive = input<boolean>(false);

  readonly toggleFavorites = output<void>();
  readonly toggleCategoryBrowser = output<void>();
  readonly toggleReadingControls = output<void>();
  readonly toggleKeyboardHelp = output<void>();
  readonly toggleIdeaMap = output<void>();

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
}
