import { Injectable, signal, Signal } from '@angular/core';
import { Quote } from './quote-collection.service';

export type ShareCardState =
  | { status: 'idle' }
  | { status: 'rendering'; quote: Quote }
  | { status: 'ready'; quote: Quote; imageUrl: string; previewUrl: string }
  | { status: 'error'; quote: Quote; message: string };

export type NativeShareResult = 'shared' | 'cancelled' | 'unavailable' | 'error';

interface CardPalette {
  bg: string;
  accent: string;
  text: string;
}

interface RenderedShareCard {
  blob: Blob;
  previewUrl: string;
}

const CATEGORY_PALETTES: Record<string, CardPalette> = {
  programming: { bg: '#1e2430', accent: '#94a3b8', text: '#e2e8f0' },
  philosophy: { bg: '#2a1f0e', accent: '#fbbf24', text: '#fef3c7' },
  stoicism: { bg: '#1c1917', accent: '#a8a29e', text: '#e7e5e4' },
  'science-fiction': { bg: '#0f1929', accent: '#60a5fa', text: '#dbeafe' },
  filmmaking: { bg: '#2a150a', accent: '#fb923c', text: '#ffedd5' },
};

const DEFAULT_PALETTE: CardPalette = { bg: '#1a1a1a', accent: '#888888', text: '#f0f0f0' };
const SHARE_CARD_RULE_OPACITY_CONFIG = 0.055;
const SHARE_CARD_SUBTITLE_OPACITY_CONFIG = 0.72;
const SHARE_CARD_OPENING_MARK_OPACITY_CONFIG = 0.18;
const SHARE_CARD_PROVENANCE_OPACITY_CONFIG = 0.82;
const SHARE_CARD_TAGLINE_OPACITY_CONFIG = 0.55;

export interface QuoteProvenance {
  label: 'SOURCE' | 'REPORTED VIA' | 'STATUS';
  textLabel: 'Source' | 'Reported attribution' | 'Attribution status';
  detail: string;
}

export function quoteProvenance(quote: Quote): QuoteProvenance {
  if (quote.attributionStatus === 'sourced' && quote.source) {
    return { label: 'SOURCE', textLabel: 'Source', detail: quote.source.citation };
  }
  if (quote.attributionStatus === 'reported' && quote.source) {
    return { label: 'REPORTED VIA', textLabel: 'Reported attribution', detail: quote.source.citation };
  }
  return { label: 'STATUS', textLabel: 'Attribution status', detail: 'Not yet verified' };
}

export function formatQuoteShareText(quote: Quote): string {
  const lines = [`“${quote.text}”`, `— ${quote.author}`];
  const provenance = quoteProvenance(quote);
  lines.push(`${provenance.textLabel}: ${provenance.detail}`);
  if (quote.source?.url) lines.push(quote.source.url);
  return lines.join('\n');
}

@Injectable()
export class ShareCardRendererService {
  private readonly _state = signal<ShareCardState>({ status: 'idle' });
  private renderToken = 0;

  readonly state: Signal<ShareCardState> = this._state.asReadonly();

  /** Native sharing is useful here only when the browser accepts image files. */
  get canNativeShare(): boolean {
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.share !== 'function' ||
      typeof navigator.canShare !== 'function'
    ) {
      return false;
    }

    try {
      const probe = new File([new Uint8Array(0)], 'quote-weave.png', { type: 'image/png' });
      return navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  }

  async render(quote: Quote): Promise<void> {
    const myToken = ++this.renderToken;
    this.revokeCurrentUrl();
    this._state.set({ status: 'rendering', quote });

    try {
      const card = await this.drawCard(quote);
      // A newer render or clear owns the state now. A stale failure must not
      // replace that newer state with an error, either.
      if (myToken !== this.renderToken) return;

      if (!card) {
        this._state.set({
          status: 'error',
          quote,
          message: 'The image card could not be made in this browser.',
        });
        return;
      }

      const imageUrl = URL.createObjectURL(card.blob);
      if (myToken !== this.renderToken) {
        URL.revokeObjectURL(imageUrl);
        return;
      }
      this._state.set({ status: 'ready', quote, imageUrl, previewUrl: card.previewUrl });
    } catch {
      if (myToken === this.renderToken) {
        this._state.set({
          status: 'error',
          quote,
          message: 'The image card could not be made in this browser.',
        });
      }
    }
  }

  clear(): void {
    this.renderToken++;
    this.revokeCurrentUrl();
    this._state.set({ status: 'idle' });
  }

  download(): void {
    const current = this._state();
    if (current.status !== 'ready') return;
    const safeName = (current.quote.author + '-quote').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const a = document.createElement('a');
    a.href = current.imageUrl;
    a.download = `${safeName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async nativeShare(): Promise<NativeShareResult> {
    const current = this._state();
    if (current.status !== 'ready' || !this.canNativeShare) return 'unavailable';
    try {
      const response = await window.fetch(current.imageUrl);
      if (!response.ok) return 'error';
      const blob = await response.blob();
      const file = new File([blob], 'quote-weave.png', { type: 'image/png' });
      const shareData: ShareData = {
        files: [file],
        title: `Quote by ${current.quote.author}`,
        text: formatQuoteShareText(current.quote),
      };
      if (!navigator.canShare(shareData)) return 'unavailable';
      await navigator.share(shareData);
      return 'shared';
    } catch (error: unknown) {
      // Closing the operating-system share sheet is a normal cancellation, not
      // an application failure. Everything else needs honest UI feedback.
      return this.isAbortError(error) ? 'cancelled' : 'error';
    }
  }

  async copyText(): Promise<boolean> {
    const current = this._state();
    if (current.status === 'idle') return false;

    const text = formatQuoteShareText(current.quote);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fall through to the selection-based copy path.
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      textArea.remove();
    }
  }

  private revokeCurrentUrl(): void {
    const current = this._state();
    if (current.status === 'ready') {
      URL.revokeObjectURL(current.imageUrl);
    }
  }

  private isAbortError(error: unknown): boolean {
    if (error instanceof DOMException) return error.name === 'AbortError';
    if (typeof error !== 'object' || error === null || !('name' in error)) return false;
    return error.name === 'AbortError';
  }

  private getPalette(category: string): CardPalette {
    const key = category.toLowerCase().replace(/\s+/g, '-');
    return CATEGORY_PALETTES[key] ?? DEFAULT_PALETTE;
  }

  private wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  private fitLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let candidate = text;
    while (candidate.length > 1 && ctx.measureText(`${candidate}…`).width > maxWidth) {
      candidate = candidate.slice(0, -1);
    }
    return `${candidate.trimEnd()}…`;
  }

  private drawCard(quote: Quote): Promise<RenderedShareCard | null> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 630;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      const colors = this.getPalette(quote.category);
      const W = canvas.width;
      const H = canvas.height;
      const PAD = 72;
      const quoteX = 148;
      const quoteMaxW = W - quoteX - PAD;

      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, W, H);

      // A reading-file card rather than a generic social tile: quiet ruled
      // paper, a stitched archive spine, and one compact provenance footer.
      ctx.fillStyle = colors.text;
      ctx.globalAlpha = SHARE_CARD_RULE_OPACITY_CONFIG;
      for (let ruleY = 126; ruleY < H - 118; ruleY += 42) {
        ctx.fillRect(PAD, ruleY, W - PAD * 2, 1);
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = colors.accent;
      ctx.fillRect(0, 0, 14, H);
      ctx.fillRect(64, 0, 2, H);
      for (let stitchY = 38; stitchY < H - 24; stitchY += 58) {
        ctx.fillRect(52, stitchY, 26, 2);
        ctx.fillRect(64, stitchY - 7, 2, 16);
      }
      ctx.fillRect(PAD, 112, W - PAD * 2, 2);
      ctx.fillRect(PAD, H - 118, W - PAD * 2, 2);

      ctx.font = '700 23px "Courier New", monospace';
      ctx.fillStyle = colors.accent;
      ctx.fillText('QUOTE WEAVE', quoteX, 58);
      ctx.font = '600 15px "Courier New", monospace';
      ctx.fillStyle = colors.text;
      ctx.globalAlpha = SHARE_CARD_SUBTITLE_OPACITY_CONFIG;
      ctx.fillText('THE SLOW READER', quoteX, 88);
      ctx.globalAlpha = 1;

      const category = `READING FILE · ${quote.category.toUpperCase()}`;
      ctx.font = '600 17px "Courier New", monospace';
      const categoryWidth = ctx.measureText(category).width;
      ctx.fillStyle = colors.accent;
      ctx.fillRect(W - PAD - categoryWidth - 30, 34, categoryWidth + 30, 40);
      ctx.fillStyle = colors.bg;
      ctx.fillText(category, W - PAD - categoryWidth - 15, 60);

      let fontSize = 48;
      let quoteLines: string[] = [];
      while (fontSize >= 31) {
        ctx.font = `italic ${fontSize}px Georgia, serif`;
        quoteLines = this.wrapLines(ctx, quote.text, quoteMaxW);
        const projectedHeight = quoteLines.length * fontSize * 1.35;
        if (quoteLines.length <= 5 && projectedHeight <= 260) break;
        fontSize -= 3;
      }
      const lineHeight = Math.round(fontSize * 1.35);
      const quoteHeight = quoteLines.length * lineHeight;
      const yOffset = Math.max(174, 180 + (250 - quoteHeight) / 2);

      ctx.font = 'bold 112px Georgia, serif';
      ctx.fillStyle = colors.accent;
      ctx.globalAlpha = SHARE_CARD_OPENING_MARK_OPACITY_CONFIG;
      ctx.fillText('“', 82, yOffset + 28);
      ctx.globalAlpha = 1;

      ctx.font = `italic ${fontSize}px Georgia, serif`;
      ctx.fillStyle = colors.text;
      let y = yOffset;
      for (const line of quoteLines) {
        ctx.fillText(line, quoteX, y);
        y += lineHeight;
      }

      ctx.font = '600 28px Georgia, serif';
      ctx.fillStyle = colors.accent;
      ctx.fillText(`— ${quote.author}`, quoteX, Math.min(y + 20, H - 148));

      const provenance = quoteProvenance(quote);
      ctx.font = '700 16px "Courier New", monospace';
      ctx.fillStyle = colors.accent;
      ctx.fillText(provenance.label, quoteX, H - 76);
      ctx.font = '400 19px Georgia, serif';
      ctx.fillStyle = colors.text;
      ctx.globalAlpha = SHARE_CARD_PROVENANCE_OPACITY_CONFIG;
      ctx.fillText(this.fitLine(ctx, provenance.detail, W - quoteX - PAD - 150), quoteX + 150, H - 76);
      ctx.globalAlpha = 1;

      ctx.font = '600 13px "Courier New", monospace';
      ctx.fillStyle = colors.text;
      ctx.globalAlpha = SHARE_CARD_TAGLINE_OPACITY_CONFIG;
      ctx.fillText('KEEP THE LINE. FOLLOW THE THREAD.', quoteX, H - 30);
      ctx.globalAlpha = 1;

      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }

        try {
          // The downloadable file retains its short-lived blob URL, while the
          // in-page preview uses a data URL already permitted by the site's
          // narrow CSP. This avoids widening img-src globally for one dialog.
          resolve({ blob, previewUrl: canvas.toDataURL('image/png') });
        } catch {
          resolve(null);
        }
      }, 'image/png');
    });
  }
}
