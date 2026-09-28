import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { getQuoteWeaveIcon, QuoteWeaveIconName } from '../../utils/icons';
import { FocusTrapDirective } from '@shared/directives/focus-trap.directive';
import { Quote } from '../../services/quote-collection.service';
import { quoteProvenance, ShareCardState } from '../../services/share-card-renderer.service';

export type ShareCopyStatus = 'idle' | 'copied' | 'error';
export type NativeShareStatus = 'idle' | 'shared' | 'unavailable' | 'error';

@Component({
  selector: 'qw-share-preview',
  templateUrl: './share-preview.component.html',
  styleUrls: ['./share-preview.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FocusTrapDirective],
})
export class SharePreviewComponent {
  readonly open = input.required<boolean>();
  readonly state = input<ShareCardState>({ status: 'idle' });
  readonly canNativeShare = input<boolean>(false);
  readonly copyStatus = input<ShareCopyStatus>('idle');
  readonly nativeShareStatus = input<NativeShareStatus>('idle');
  readonly failedImageUrl = signal<string | null>(null);

  readonly close = output<void>();
  readonly download = output<void>();
  readonly nativeShare = output<void>();
  readonly retry = output<void>();
  readonly copyText = output<void>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly iconCache = new Map<string, SafeHtml>();

  constructor() {
    effect(() => {
      if (this.state().status !== 'ready' && this.failedImageUrl() !== null) {
        this.failedImageUrl.set(null);
      }
    });
  }

  icon(name: QuoteWeaveIconName, size: number): SafeHtml {
    const key = `${name}:${size}`;
    let cached = this.iconCache.get(key);
    if (!cached) {
      cached = this.sanitizer.bypassSecurityTrustHtml(getQuoteWeaveIcon(name, size));
      this.iconCache.set(key, cached);
    }
    return cached;
  }

  markPreviewFailed(imageUrl: string): void {
    this.failedImageUrl.set(imageUrl);
  }

  shareCardProvenance(quote: Quote): string {
    const provenance = quoteProvenance(quote);
    return `${provenance.textLabel}: ${provenance.detail}`;
  }

  shareCardAlt(quote: Quote): string {
    return `Quote card. “${quote.text}”, by ${quote.author}. ${this.shareCardProvenance(quote)}.`;
  }
}
