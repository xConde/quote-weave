import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { NgClass } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { getQuoteWeaveIcon } from '../../utils/icons';
import { FocusTrapDirective } from '@shared/directives/focus-trap.directive';

export interface CategorySummary {
  category: string;
  count: number;
}

@Component({
  selector: 'qw-category-browser',
  templateUrl: './category-browser.component.html',
  styleUrls: ['./category-browser.component.scss'],
  standalone: true,
  imports: [NgClass, FocusTrapDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryBrowserComponent {
  readonly open = input.required<boolean>();
  readonly categories = input.required<CategorySummary[]>();
  readonly activeCategory = input<string | null>(null);
  readonly totalCount = input.required<number>();

  readonly close = output<void>();
  readonly select = output<string | null>();

  private readonly sanitizer = inject(DomSanitizer);
  readonly closeIcon: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(getQuoteWeaveIcon('x', 16));

  categoryClass(category: string): string {
    const normalized = category.toLowerCase().replace(/\s+/g, '-');
    return `category-badge category-${normalized}`;
  }
}
