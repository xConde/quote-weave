import { HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, of, Subscription } from 'rxjs';
import { catchError, finalize, timeout } from 'rxjs/operators';

export interface WikiResult {
  title: string;
  imageUrl: string | null;
  content: string;
  wikiUrl: string;
}

@Injectable()
export class WikipediaService implements OnDestroy {
  private activeLookup: Subscription | null = null;
  private lookupToken = 0;

  private readonly authorNameMapping: Record<string, string> = {
    Seneca: 'Seneca_the_Younger',
    Plato: 'Plato',
    'Rene Descartes': 'René_Descartes',
    'Marcus Aurelius': 'Marcus_Aurelius',
    Epictetus: 'Epictetus',
    Aristotle: 'Aristotle',
    Socrates: 'Socrates',
    'Arthur C. Clarke': 'Arthur_C._Clarke',
    'Isaac Asimov': 'Isaac_Asimov',
    'Carl Sagan': 'Carl_Sagan',
    'Martin Fowler': 'Martin_Fowler_(software_engineer)',
    'Alan Kay': 'Alan_Kay',
  };

  private readonly cache = new Map<string, WikiResult>();

  readonly wikiResult$ = new BehaviorSubject<WikiResult | null>(null);
  readonly loading$ = new BehaviorSubject<boolean>(false);

  private readonly nonPersonAuthors = [
    'Programming Wisdom',
    'Ancient Wisdom',
    'Filmmaker Wisdom',
    'Stoic Teachings',
    'Anonymous',
    // A multi-author byline has no single biography panel to open.
    'Harold Abelson and Gerald Jay Sussman',
  ];

  constructor(private readonly http: HttpClient) {}

  isRealPerson(authorName: string): boolean {
    return !this.nonPersonAuthors.includes(authorName);
  }

  getWikipediaPageName(authorName: string): string {
    return this.authorNameMapping[authorName] || authorName.replace(/\s+/g, '_');
  }

  lookup(authorName: string): void {
    const pageName = this.getWikipediaPageName(authorName);
    // SECURITY: URL-encode the page name to prevent URL injection
    const encodedPageName = encodeURIComponent(pageName);
    const wikiUrl = `https://en.wikipedia.org/wiki/${encodedPageName}`;
    const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedPageName}`;

    // Serve from cache if available — skip HTTP entirely
    const cached = this.cache.get(authorName);
    if (cached) {
      this.wikiResult$.next(cached);
      return;
    }

    // Cancel any in-flight lookup to prevent out-of-order response race condition.
    // Bumping the token first ensures finalize() from the cancelled lookup
    // (which fires on unsubscribe) doesn't clobber loading state for the new one.
    const myToken = ++this.lookupToken;
    this.activeLookup?.unsubscribe();

    this.loading$.next(true);
    this.wikiResult$.next(null);

    this.activeLookup = this.http
      .get<{
        type?: string;
        title?: string;
        thumbnail?: { source: string };
        originalimage?: { source: string };
        extract_html?: string;
        extract?: string;
      }>(apiUrl)
      .pipe(
        timeout(8000),
        catchError(() =>
          of<{
            type?: string;
            title?: string;
            thumbnail?: { source: string };
            originalimage?: { source: string };
            extract_html?: string;
            extract?: string;
          } | null>(null)
        ),
        finalize(() => {
          if (myToken === this.lookupToken) {
            this.loading$.next(false);
          }
        })
      )
      .subscribe((data) => {
        // Stale response — a newer lookup() has been kicked off.
        if (myToken !== this.lookupToken) return;

        if (data === null) {
          this.wikiResult$.next({
            title: '',
            imageUrl: null,
            content: 'Error loading content.',
            wikiUrl,
          });
          return;
        }

        if (this.isInvalidWikipediaPage(data)) {
          // SECURITY: Escape user-controlled values; Angular's [innerHTML] will also sanitize
          const escapedName = this.escapeHtml(authorName);
          const escapedUrl = this.escapeHtml(wikiUrl);
          const content =
            `<p>Unable to load author information. The Wikipedia page for "${escapedName}" is ambiguous or not available.</p>` +
            `<p>You can try visiting the <a href="${escapedUrl}" target="_blank" rel="noopener noreferrer">Wikipedia page</a> directly to find the correct article.</p>`;
          this.wikiResult$.next({
            title: '',
            imageUrl: null,
            content,
            wikiUrl,
          });
          return;
        }

        // SECURITY: Validate image URL comes from trusted Wikimedia domains
        const rawImageUrl = data.thumbnail?.source ?? data.originalimage?.source ?? null;
        const imageUrl = this.isValidWikimediaImageUrl(rawImageUrl) ? rawImageUrl : null;
        // SECURITY: Let Angular's [innerHTML] binding handle sanitization automatically
        const content = data.extract_html ?? data.extract ?? 'No summary available.';

        const result: WikiResult = {
          title: data.title ?? '',
          imageUrl,
          content,
          wikiUrl,
        };
        this.cache.set(authorName, result);
        this.wikiResult$.next(result);
      });
  }

  close(): void {
    // Bump the token so finalize from the cancelled lookup does not flip
    // loading$ back to false after a new lookup has started, then explicitly
    // settle loading$ here since the cancelled lookup's finalize will be a
    // no-op against the new token.
    this.lookupToken++;
    this.activeLookup?.unsubscribe();
    this.activeLookup = null;
    this.wikiResult$.next(null);
    this.loading$.next(false);
  }

  ngOnDestroy(): void {
    this.activeLookup?.unsubscribe();
  }

  /**
   * SECURITY: Validate that image URL comes from trusted Wikimedia domains
   */
  isValidWikimediaImageUrl(url: string | null): boolean {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      const validDomains = ['upload.wikimedia.org', 'commons.wikimedia.org'];
      return validDomains.some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`));
    } catch {
      return false;
    }
  }

  /**
   * SECURITY: Validate URL points to Wikipedia to prevent open redirect
   */
  isValidWikipediaUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'en.wikipedia.org' || parsed.hostname.endsWith('.wikipedia.org');
    } catch {
      return false;
    }
  }

  escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Validates Wikipedia API response to filter out disambiguation pages,
   * category pages, and other invalid content
   */
  private isInvalidWikipediaPage(data: {
    type?: string;
    title?: string;
    extract_html?: string;
    extract?: string;
  }): boolean {
    if (data.type === 'disambiguation') {
      return true;
    }

    if (data.title?.startsWith('Category:')) {
      return true;
    }

    const extract = data.extract ?? data.extract_html ?? '';
    // Disambiguation markers — match only formal/structural disambiguation
    // language, not stray occurrences of "disambiguation" anywhere in body
    // text. The formal markers always appear within the first ~120 chars.
    const head = extract.slice(0, 200);
    const disambiguationPatterns = [
      /\b(may|can|could)\s+refer\s+to:/i,
      /\(disambiguation\)/i,
      /\bis\s+a\s+disambiguation\s+page\b/i,
    ];

    if (disambiguationPatterns.some((pattern) => pattern.test(head))) {
      return true;
    }

    const plainText = extract.replace(/<[^>]*>/g, '').trim();
    if (plainText.length < 50) {
      return true;
    }

    return false;
  }
}
