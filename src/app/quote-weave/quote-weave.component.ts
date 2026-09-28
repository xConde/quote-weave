import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  Injector,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { QuoteCollectionService, QuoteDataError } from './services/quote-collection.service';
import { WikipediaService, WikiResult } from './services/wikipedia.service';
import { FavoritesService } from './services/favorites.service';
import { QuoteSettingsService } from './services/quote-settings.service';
import { NativeShareResult, ShareCardRendererService } from './services/share-card-renderer.service';
import { TypewriterEngineService } from './services/typewriter-engine.service';
import { QuoteMapService } from './services/quote-map.service';
import { KeyboardHelpComponent } from './components/keyboard-help/keyboard-help.component';
import { ReadingControlsComponent } from './components/reading-controls/reading-controls.component';
import { CategoryBrowserComponent, CategorySummary } from './components/category-browser/category-browser.component';
import { FavoritesPanelComponent } from './components/favorites-panel/favorites-panel.component';
import {
  NativeShareStatus,
  ShareCopyStatus,
  SharePreviewComponent,
} from './components/share-preview/share-preview.component';
import { AuthorPanelComponent } from './components/author-panel/author-panel.component';
import { ControlRowComponent } from './components/control-row/control-row.component';
import { QuotesStreamComponent } from './components/quotes-stream/quotes-stream.component';
import { IdeaMapComponent } from './components/idea-map/idea-map.component';
import { FavoriteQuote, Quote } from './models/quote-weave.models';

@Component({
  selector: 'quote-weave',
  templateUrl: './quote-weave.component.html',
  styleUrls: ['./quote-weave.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    KeyboardHelpComponent,
    ReadingControlsComponent,
    CategoryBrowserComponent,
    FavoritesPanelComponent,
    SharePreviewComponent,
    AuthorPanelComponent,
    ControlRowComponent,
    QuotesStreamComponent,
    IdeaMapComponent,
  ],
  providers: [
    QuoteCollectionService,
    WikipediaService,
    FavoritesService,
    QuoteSettingsService,
    ShareCardRendererService,
    TypewriterEngineService,
    QuoteMapService,
  ],
})
export class QuoteWeaveComponent implements OnInit, OnDestroy {
  private readonly settingsService = inject(QuoteSettingsService);
  private readonly shareCardService = inject(ShareCardRendererService);
  private readonly engine = inject(TypewriterEngineService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  // Quote collection — populated after the HTTP load
  readonly quotes = signal<Quote[]>([]);

  // Panel-open signals — keyboard router + template both read these
  readonly panelOpen = signal(false);
  readonly showContainer = signal(false);
  readonly showCategoryBrowser = signal(false);
  readonly showFavorites = signal(false);
  readonly showReadingControls = signal(false);
  readonly showKeyboardHelp = signal(false);
  readonly showSharePreview = signal(false);
  readonly showIdeaMap = signal(false);
  readonly quoteLoadState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly quoteLoadError = signal<string | null>(null);
  readonly shareCopyStatus = signal<ShareCopyStatus>('idle');
  readonly nativeShareStatus = signal<NativeShareStatus>('idle');
  readonly favoritePersistenceNotice = signal<string | null>(null);

  // Favorites + Wikipedia derived state
  readonly cachedFavorites = signal<FavoriteQuote[]>([]);
  readonly loadingWiki = signal(false);
  readonly wikiContent = signal<string | null>(null);
  readonly authorImageUrl = signal<string | null>(null);
  readonly authorTitle = signal<string | null>(null);
  readonly wikipediaUrl = signal<string | null>(null);

  private readonly quoteMapService = inject(QuoteMapService);

  // Service-driven readonly aliases
  readonly settings = this.settingsService.settings;
  readonly favoriteLoadWarning = this.favoritesService.loadWarning;
  readonly shareCardState = this.shareCardService.state;
  readonly canNativeShare = this.shareCardService.canNativeShare;
  readonly displayedText = this.engine.displayedText;
  readonly currentQuoteData = this.engine.currentQuote;
  readonly typingComplete = this.engine.typingComplete;
  readonly canGoBack = this.engine.canGoBack;
  readonly autoCyclePaused = this.engine.autoCyclePaused;
  readonly userManuallyScrolled = this.engine.userManuallyScrolled;
  readonly isInitialAnimation = this.engine.isInitialAnimation;

  // Derived signals
  readonly isAnyPanelOpen = computed(
    () =>
      this.panelOpen() ||
      this.showSharePreview() ||
      this.showFavorites() ||
      this.showCategoryBrowser() ||
      this.showReadingControls() ||
      this.showKeyboardHelp() ||
      this.showIdeaMap()
  );

  /** Up to 3 semantically-related quotes for the current quote. */
  readonly relatedQuotes = computed(() => {
    const quote = this.currentQuoteData();
    if (!quote || !this.quoteMapService.loaded()) return [];
    return this.quoteMapService.relatedTo(quote).slice(0, 3);
  });

  readonly categorySummaries = computed<CategorySummary[]>(() => {
    const quotes = this.quotes();
    return this.quoteCollection.allCategories.map((category) => ({
      category,
      count: quotes.filter((q) => q.category === category).length,
    }));
  });

  // Bound function references passed to QuotesStreamComponent inputs (stable
  // identity prevents OnPush input-changed thrash in the child).
  readonly isFavoriteFn = (q: Quote): boolean => this.favoritesService.isFavorite(q);
  readonly isRealPersonFn = (author: string): boolean => this.wikipediaService.isRealPerson(author);

  private shareOpenedFromFavorites = false;

  constructor(
    private readonly quoteCollection: QuoteCollectionService,
    private readonly wikipediaService: WikipediaService,
    readonly favoritesService: FavoritesService
  ) {
    this.engine.configure({
      getTypingSpeedMs: () => this.settings().typingSpeedMs,
      getAutoAdvance: () => this.settings().autoAdvance,
      getActivePool: () => this.getActivePool(),
    });
  }

  private getActivePool(): Quote[] {
    return this.quoteCollection.activeCategory ? this.quoteCollection.getFilteredQuotes() : this.quotes();
  }

  get activeCategory(): string | null {
    return this.quoteCollection.activeCategory;
  }

  ngOnInit(): void {
    // Eagerly load the atlas so relatedTo() returns neighbors even before the
    // IdeaMap panel is opened. load() is idempotent — the service guards against
    // double-loading internally, so the IdeaMapComponent's own effect calling
    // load() when the panel opens is harmless.
    this.quoteMapService.load();

    this.refreshFavorites();

    this.loadQuotes(false);

    fromEvent(document, 'visibilitychange')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (document.visibilityState === 'visible') {
          this.engine.resumeAfterVisibilityChange();
        }
      });

    this.wikipediaService.loading$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((loading) => {
      this.loadingWiki.set(loading);
    });

    this.wikipediaService.wikiResult$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: WikiResult | null) => {
        if (result === null) {
          this.wikiContent.set(null);
          this.authorTitle.set(null);
          this.authorImageUrl.set(null);
          if (!this.panelOpen()) {
            this.wikipediaUrl.set(null);
          }
        } else {
          this.authorTitle.set(result.title || null);
          this.authorImageUrl.set(result.imageUrl);
          this.wikiContent.set(result.content);
          this.wikipediaUrl.set(result.wikiUrl);
        }
      });
  }

  retryQuoteLoad(): void {
    this.loadQuotes(true);
  }

  private loadQuotes(reload: boolean): void {
    this.showContainer.set(false);
    this.quoteLoadState.set('loading');
    this.quoteLoadError.set(null);

    const quotes$ = reload ? this.quoteCollection.reloadQuotes() : this.quoteCollection.getQuotes();
    quotes$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        if (data.length === 0) {
          this.handleQuoteLoadError(new QuoteDataError('empty'));
          return;
        }
        const shuffled = this.quoteCollection.shuffleArray(data);
        this.quotes.set(shuffled);
        this.quoteCollection.initWithQuotes(shuffled);
        this.quoteLoadState.set('ready');
        // Establish the complete leaf before revealing it. The typewriter can
        // then work inside an already-sized editorial frame instead of first
        // painting an empty card and expanding it section by section.
        this.engine.startNext();
        this.showContainer.set(true);
      },
      error: (error: unknown) => {
        this.handleQuoteLoadError(error);
      },
    });
  }

  private handleQuoteLoadError(error: unknown): void {
    this.quotes.set([]);
    this.showContainer.set(false);
    this.quoteLoadState.set('error');
    this.quoteLoadError.set(this.quoteLoadErrorMessage(error));
  }

  private quoteLoadErrorMessage(error: unknown): string {
    if (error instanceof QuoteDataError && error.kind === 'empty') {
      return 'The quote file loaded, but it did not contain any quotes.';
    }
    if (error instanceof QuoteDataError) {
      return 'The quote file did not pass its format check, so I stopped before showing unreliable data.';
    }
    return 'The quote file could not be reached. Check your connection and try again.';
  }

  ngOnDestroy(): void {
    this.shareCardService.clear();
  }

  // ---------------------------------------------------------------------------
  // Keyboard router
  // ---------------------------------------------------------------------------

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const target = event.target as Element;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.hasAttribute('contenteditable')) {
      return;
    }

    const key = event.key;

    if (key === 'Escape') {
      if (this.panelOpen()) {
        event.stopPropagation();
        this.closePanel();
        return;
      }
      if (this.showSharePreview()) {
        event.stopPropagation();
        this.closeSharePreview();
        return;
      }
      if (this.showFavorites()) {
        event.stopPropagation();
        this.closeFavorites();
        return;
      }
      if (this.showCategoryBrowser()) {
        event.stopPropagation();
        this.closeCategoryBrowser();
        return;
      }
      if (this.showReadingControls()) {
        event.stopPropagation();
        this.closeReadingControls();
        return;
      }
      if (this.showKeyboardHelp()) {
        event.stopPropagation();
        this.closeKeyboardHelp();
        return;
      }
      if (this.showIdeaMap()) {
        event.stopPropagation();
        this.closeIdeaMap();
        return;
      }
      return;
    }

    // Preserve browser and operating-system shortcuts. Without this guard,
    // Cmd/Ctrl+C opened Shelves, Cmd/Ctrl+F toggled the saved state, and
    // Cmd/Ctrl+S opened Pace while the browser handled the same chord.
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (this.showKeyboardHelp() && key !== '?' && key !== 'Tab' && key !== 'Shift') {
      this.closeKeyboardHelp();
    }

    const anyPanelOpen = this.isAnyPanelOpen();

    switch (key) {
      case 'ArrowRight':
      case ' ':
        if (!anyPanelOpen) {
          event.preventDefault();
          this.skipToNextQuote();
        }
        break;

      case 'ArrowLeft':
        if (!anyPanelOpen) {
          event.preventDefault();
          this.goToPreviousQuote();
        }
        break;

      case 'f':
      case 'F': {
        const currentQuote = this.currentQuoteData();
        if (!anyPanelOpen && this.typingComplete() && currentQuote) {
          this.toggleFavorite(currentQuote);
        }
        break;
      }

      case 'c':
      case 'C':
        if (!anyPanelOpen || this.showCategoryBrowser()) {
          this.toggleCategoryBrowser();
        }
        break;

      case 's':
      case 'S':
        if (!anyPanelOpen || this.showReadingControls()) {
          this.toggleReadingControls();
        }
        break;

      case '?':
        if (!anyPanelOpen || this.showKeyboardHelp()) {
          this.toggleKeyboardHelp();
        }
        break;

      default:
        break;
    }
  }

  skipToNextQuote(): void {
    this.engine.skip();
  }

  goToPreviousQuote(): void {
    this.engine.goToPrevious();
  }

  showAnotherQuote(): void {
    this.engine.advance();
  }

  // ---------------------------------------------------------------------------
  // Reading controls
  // ---------------------------------------------------------------------------

  toggleReadingControls(): void {
    if (this.showReadingControls()) {
      this.closeReadingControls();
      return;
    }
    this.dismissOpenPanels();
    this.showReadingControls.set(true);
    this.engine.pauseForPanel();
  }

  closeReadingControls(): void {
    this.showReadingControls.set(false);
    this.resumeIfNoPanelsOpen();
    this.returnFocusToControl('.settings-btn');
  }

  setTypingSpeed(ms: number): void {
    this.settingsService.setTypingSpeed(ms);
  }

  setAutoAdvance(enabled: boolean): void {
    this.settingsService.setAutoAdvance(enabled);
  }

  // ---------------------------------------------------------------------------
  // Share / Download
  // ---------------------------------------------------------------------------

  async openSharePreview(quote: Quote): Promise<void> {
    this.shareOpenedFromFavorites = this.showFavorites();
    this.dismissOpenPanels();
    this.showSharePreview.set(true);
    this.shareCopyStatus.set('idle');
    this.nativeShareStatus.set('idle');
    this.engine.pauseForPanel();
    await this.shareCardService.render(quote);
  }

  closeSharePreview(): void {
    const returnToSaved = this.shareOpenedFromFavorites;
    this.shareOpenedFromFavorites = false;
    this.showSharePreview.set(false);
    this.shareCardService.clear();
    this.shareCopyStatus.set('idle');
    this.nativeShareStatus.set('idle');
    this.resumeIfNoPanelsOpen();
    if (returnToSaved) this.returnFocusToControl('.favorites-btn');
  }

  retryShareImage(): Promise<void> {
    const state = this.shareCardState();
    if (state.status !== 'error' && state.status !== 'ready') return Promise.resolve();
    this.shareCopyStatus.set('idle');
    this.nativeShareStatus.set('idle');
    return this.shareCardService.render(state.quote);
  }

  downloadShareImage(): void {
    this.shareCardService.download();
  }

  async nativeShare(): Promise<void> {
    this.nativeShareStatus.set('idle');
    const result: NativeShareResult = await this.shareCardService.nativeShare();
    if (result !== 'cancelled') {
      this.nativeShareStatus.set(result);
    }
  }

  async copyShareText(): Promise<void> {
    this.shareCopyStatus.set((await this.shareCardService.copyText()) ? 'copied' : 'error');
  }

  // ---------------------------------------------------------------------------
  // Wikipedia / Author panel
  // ---------------------------------------------------------------------------

  openAuthorWiki(authorName: string): void {
    this.dismissOpenPanels();
    this.panelOpen.set(true);
    this.engine.pauseForPanel();
    this.loadingWiki.set(true);
    this.wikiContent.set(null);
    this.wikipediaService.lookup(authorName);
    const pageName = this.wikipediaService.getWikipediaPageName(authorName);
    const encodedPageName = encodeURIComponent(pageName);
    this.wikipediaUrl.set(`https://en.wikipedia.org/wiki/${encodedPageName}`);
  }

  getWikipediaPageName(authorName: string): string {
    return this.wikipediaService.getWikipediaPageName(authorName);
  }

  openWikipediaHome(): void {
    const url = this.wikipediaUrl();
    if (url && this.wikipediaService.isValidWikipediaUrl(url)) {
      window.open(url, '_blank');
    }
  }

  closePanel(): void {
    this.panelOpen.set(false);
    this.wikiContent.set(null);
    this.authorTitle.set(null);
    this.authorImageUrl.set(null);
    this.wikipediaUrl.set(null);
    this.wikipediaService.close();
    this.resumeIfNoPanelsOpen();
  }

  // ---------------------------------------------------------------------------
  // Panel coordination
  // ---------------------------------------------------------------------------

  private dismissOpenPanels(): void {
    if (this.panelOpen()) {
      this.panelOpen.set(false);
      this.wikiContent.set(null);
      this.authorTitle.set(null);
      this.authorImageUrl.set(null);
      this.wikipediaUrl.set(null);
      this.wikipediaService.close();
    }
    this.showCategoryBrowser.set(false);
    this.showReadingControls.set(false);
    this.showKeyboardHelp.set(false);
    this.showIdeaMap.set(false);
    if (this.showFavorites()) {
      this.showFavorites.set(false);
    }
    if (this.showSharePreview()) {
      this.showSharePreview.set(false);
      this.shareCardService.clear();
      this.shareOpenedFromFavorites = false;
    }
  }

  private resumeIfNoPanelsOpen(): void {
    if (!this.isAnyPanelOpen()) {
      this.engine.resumeFromPanelClose();
    }
  }

  toggleCategoryBrowser(): void {
    if (this.showCategoryBrowser()) {
      this.closeCategoryBrowser();
      return;
    }
    this.dismissOpenPanels();
    this.showCategoryBrowser.set(true);
    this.engine.pauseForPanel();
  }

  closeCategoryBrowser(): void {
    this.showCategoryBrowser.set(false);
    this.resumeIfNoPanelsOpen();
    this.returnFocusToControl('.filter-btn');
  }

  toggleKeyboardHelp(): void {
    if (this.showKeyboardHelp()) {
      this.closeKeyboardHelp();
      return;
    }
    this.dismissOpenPanels();
    this.showKeyboardHelp.set(true);
    this.engine.pauseForPanel();
  }

  closeKeyboardHelp(): void {
    this.showKeyboardHelp.set(false);
    this.resumeIfNoPanelsOpen();
    this.returnFocusToControl('.help-btn');
  }

  toggleFavorites(): void {
    if (this.showFavorites()) {
      this.closeFavorites();
      return;
    }
    this.dismissOpenPanels();
    this.showFavorites.set(true);
    this.engine.pauseForPanel();
  }

  closeFavorites(): void {
    this.showFavorites.set(false);
    this.resumeIfNoPanelsOpen();
    this.returnFocusToControl('.favorites-btn');
  }

  refreshFavorites(): void {
    this.cachedFavorites.set(this.favoritesService.getFavorites());
  }

  toggleFavorite(quote: Quote): void {
    this.engine.resetAutoAdvanceTimer();
    const result = this.favoritesService.toggleFavorite(quote);
    if (result.persistence === 'durable') {
      this.favoritePersistenceNotice.set(null);
    } else if (result.changed) {
      this.favoritePersistenceNotice.set(
        result.favorited
          ? 'Saved for this visit only. Browser storage is unavailable.'
          : 'Removed for this visit only. Browser storage is unavailable.'
      );
    }
    this.refreshFavorites();
  }

  selectCategory(category: string | null): void {
    this.quoteCollection.setCategory(category);
    const pool = category === null ? this.quotes() : this.quotes().filter((quote) => quote.category === category);
    this.quoteCollection.setFilteredQuotes(this.quoteCollection.shuffleArray(pool));
    this.engine.resetForNewPool();
    this.showCategoryBrowser.set(false);
    this.engine.startNext();
    this.returnFocusToControl('.filter-btn');
  }

  // ---------------------------------------------------------------------------
  // Idea Map
  // ---------------------------------------------------------------------------

  toggleIdeaMap(): void {
    if (this.showIdeaMap()) {
      this.closeIdeaMap();
      return;
    }
    this.dismissOpenPanels();
    this.showIdeaMap.set(true);
    this.engine.pauseForPanel();
  }

  closeIdeaMap(): void {
    this.showIdeaMap.set(false);
    this.resumeIfNoPanelsOpen();
    this.returnFocusToControl('.idea-map-btn');
  }

  /**
   * Focus return for panels triggered from the control row (WCAG 2.4.3).
   * The control row is removed from the DOM while a panel is open, so the
   * focus trap's restore-by-reference no-ops (its stored button is destroyed).
   * Instead, focus the freshly rendered trigger button after the next render.
   * If another panel opened in the meantime the control row is absent and
   * this is a no-op, which is the desired behavior.
   */
  private returnFocusToControl(selector: string): void {
    afterNextRender(
      () => {
        this.elementRef.nativeElement.querySelector<HTMLElement>(selector)?.focus();
      },
      { injector: this.injector }
    );
  }

  /**
   * Jump the engine to a specific quote (from related chips or Threads).
   * A cross-shelf destination clears the active shelf first; otherwise the
   * next action would snap back into a pool that excludes the quote on screen.
   */
  jumpToQuote(quote: Quote): void {
    const activeCategory = this.activeCategory;
    if (activeCategory !== null && quote.category !== activeCategory) {
      this.quoteCollection.setCategory(null);
      this.quoteCollection.setFilteredQuotes(this.quoteCollection.shuffleArray(this.quotes()));
    }
    this.engine.jumpTo(quote);
  }
}
