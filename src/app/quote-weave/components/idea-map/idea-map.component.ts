import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  NgZone,
  OnDestroy,
  output,
  signal,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { getQuoteWeaveIcon } from '../../utils/icons';
import { QuoteMapPoint, QuoteMapService } from '../../services/quote-map.service';
import { Quote } from '../../services/quote-collection.service';
import { prefersReducedMotion } from '../../utils/prefers-reduced-motion';
import { FocusTrapDirective } from '@shared/directives/focus-trap.directive';

const CANVAS_PADDING = 56; // room for cartographic labels at the map edges
// A 44px-diameter hit area keeps the visual points usable by touch. Overlaps
// are resolved by nearest-distance in hitTest().
const HIT_RADIUS = 22;
// Deliberate ink marks, not dust: large enough to read as a mark on paper at
// a glance, still small enough to keep 30 of them from crowding a territory.
const DOT_RADIUS = 5;
const DOT_RING_WIDTH = 1.25;
const DOT_RING_ALPHA = 0.45;
const ENTRANCE_MS = 700;

/**
 * Cartographic ink palette — muted, map-territory tints that read as colored
 * regions on both warm paper (day) and dark slate (night). Each is an {r,g,b}
 * so the renderer can mix territory fills, links, and dots at varied alpha
 * without per-frame string work.
 */
interface Rgb {
  r: number;
  g: number;
  b: number;
}
const CLUSTER_RGB: readonly Rgb[] = [
  { r: 197, g: 110, b: 74 }, // terracotta
  { r: 74, g: 121, b: 173 }, // ink blue
  { r: 90, g: 154, b: 104 }, // sage
  { r: 168, g: 104, b: 158 }, // plum
];
// The card art's namesake motif — quotes stitched together with red thread.
// Matches the site-wide CTA red ($fire-red / #d62828 in assets/_variables.scss)
// rather than inventing a new hue; reserved for within-thread stitching only
// so it stays legible as "this belongs to this thread," not a generic accent.
const THREAD_RED: Rgb = { r: 214, g: 40, b: 40 };
// Resting alpha (no thread picked): present enough to read as red thread at
// a glance. Selected: full stitching emphasis. Dimmed: another thread is
// picked, so this one recedes but must never disappear.
const THREAD_ALPHA_REST = 0.55;
const THREAD_ALPHA_SELECTED = 0.95;
const THREAD_ALPHA_DIMMED = 0.3;
const THREAD_STITCH_DASH: readonly [number, number] = [3, 2.5]; // stitch-length dashes
// Territory/dot/label dimming when a different thread is selected. Recedes,
// never disappears — the rest of the map should still read as a map.
const DIM_ALPHA = 0.32;
const rgb = (c: Rgb, a: number): string => `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
const hex = (c: Rgb): string => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

interface ThemeInk {
  ink: string; // primary text color
  inkSoft: string; // muted ink for hairlines
  paper: string; // surface color (for label halos)
  isDark: boolean;
}

/** 2D screen position of a map point in the current draw. */
interface ScreenPoint {
  x: number;
  y: number;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  text: string;
  author: string;
  clusterLabel: string;
  quoteId: string;
}

@Component({
  selector: 'qw-idea-map',
  templateUrl: './idea-map.component.html',
  styleUrls: ['./idea-map.component.scss'],
  standalone: true,
  imports: [FocusTrapDirective],
  encapsulation: ViewEncapsulation.Emulated,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdeaMapComponent implements AfterViewInit, OnDestroy {
  readonly open = input.required<boolean>();
  /** The quote currently being read, marked "you are here" on the map. */
  readonly currentQuote = input<Quote | null>(null);

  readonly selectQuote = output<Quote>();
  readonly close = output<void>();

  private readonly mapService = inject(QuoteMapService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly zone = inject(NgZone);
  private readonly iconCache = new Map<string, SafeHtml>();

  readonly clusters = this.mapService.clusters;
  readonly loaded = this.mapService.loaded;
  readonly status = this.mapService.status;
  readonly errorMessage = this.mapService.errorMessage;
  readonly threads = this.mapService.threads;

  /** Which cluster is highlighted (null = all visible) */
  readonly highlightedCluster = signal<number | null>(null);
  readonly activeThread = computed(() => {
    const clusterId = this.highlightedCluster();
    return clusterId === null ? null : (this.threads().find((thread) => thread.cluster.id === clusterId) ?? null);
  });

  readonly tooltip = signal<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    text: '',
    author: '',
    clusterLabel: '',
    quoteId: '',
  });

  /** SR-only summary generated from cluster data */
  readonly srSummary = computed(() => {
    const clusters = this.clusters();
    if (!clusters.length) return 'Threads loading…';
    const parts = clusters.map((c) => `${c.label} (${c.count})`).join(', ');
    return `Threads: ${this.mapService.points().length} quotes arranged along ${clusters.length} loose routes: ${parts}.`;
  });

  @ViewChild('mapCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasWrapper') wrapperRef!: ElementRef<HTMLDivElement>;

  private resizeObserver: ResizeObserver | null = null;
  private pendingDraw: number | null = null;
  private devicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  // Entrance animation: progress eases 0→1 over ENTRANCE_MS the first time the
  // map is shown with data. Static (1) under reduced motion.
  private entranceStart = 0;
  private entranceProgress = 1;
  private animating = false;
  private hasPlayedEntrance = false;
  private autoSelectedThreadForOpen = false;

  // Cached frame composition (anchors, final dot positions, Voronoi cells),
  // recomputed only when the canvas size changes — not per entrance frame.
  private layout: { w: number; h: number; anchors: ScreenPoint[]; dots: ScreenPoint[]; cells: ScreenPoint[][] } | null =
    null;

  constructor() {
    // Re-draw when data loads, highlighted cluster changes, the current quote
    // moves, or the panel opens.
    effect(() => {
      this.loaded();
      this.highlightedCluster();
      this.currentQuote();
      this.open();
      this.scheduleDraw();
    });

    // Load data when first opened, and play the entrance once data is ready.
    effect(() => {
      if (this.open()) {
        this.mapService.load();
        if (this.loaded() && !this.hasPlayedEntrance) {
          this.hasPlayedEntrance = true;
          this.startEntrance();
        }
      }
    });

    // The directory should answer "where am I?" as soon as it opens. Select
    // the current quote's thread once per opening; subsequent thread choices
    // stay explicit so the directory never falls back to an unexplained blank.
    effect(() => {
      const open = this.open();
      if (!open) {
        this.autoSelectedThreadForOpen = false;
        if (this.highlightedCluster() !== null) this.highlightedCluster.set(null);
        return;
      }

      const current = this.currentQuote();
      const points = this.mapService.points();
      if (!this.loaded() || !current || this.autoSelectedThreadForOpen) return;

      const currentPoint = points.find((point) => point.quoteId === current.id);
      if (currentPoint) {
        this.autoSelectedThreadForOpen = true;
        this.highlightedCluster.set(currentPoint.cluster);
      }
    });
  }

  ngAfterViewInit(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleDraw();
    });
    if (this.wrapperRef) {
      this.resizeObserver.observe(this.wrapperRef.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (this.pendingDraw !== null) {
      cancelAnimationFrame(this.pendingDraw);
    }
  }

  icon(name: Parameters<typeof getQuoteWeaveIcon>[0], size: number): SafeHtml {
    const key = `${name}:${size}`;
    let cached = this.iconCache.get(key);
    if (!cached) {
      cached = this.sanitizer.bypassSecurityTrustHtml(getQuoteWeaveIcon(name, size));
      this.iconCache.set(key, cached);
    }
    return cached;
  }

  clusterColor(clusterId: number): string {
    return hex(CLUSTER_RGB[clusterId % CLUSTER_RGB.length]);
  }

  onLegendClick(clusterId: number): void {
    this.highlightedCluster.set(clusterId);
  }

  onLegendKeydown(event: KeyboardEvent, clusterId: number): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onLegendClick(clusterId);
    }
  }

  retryLoad(): void {
    this.mapService.load();
  }

  quoteExcerpt(text: string): string {
    return text.length > 110 ? `${text.slice(0, 107).trimEnd()}…` : text;
  }

  isCurrentQuote(quote: Quote): boolean {
    return this.currentQuote()?.id === quote.id;
  }

  selectFromDirectory(quote: Quote): void {
    this.close.emit();
    this.selectQuote.emit(quote);
  }

  onQuoteKeydown(event: KeyboardEvent, quote: Quote): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.selectFromDirectory(quote);
  }

  onCanvasClick(event: MouseEvent): void {
    const hit = this.hitTest(event.offsetX, event.offsetY);
    if (!hit) return;
    const quote = this.mapService.quoteById(hit.point.quoteId);
    if (quote) {
      this.close.emit();
      this.selectQuote.emit(quote);
    }
  }

  onCanvasPointerMove(event: PointerEvent): void {
    const hit = this.hitTest(event.offsetX, event.offsetY);
    if (!hit) {
      if (this.tooltip().visible) {
        this.tooltip.set({ ...this.tooltip(), visible: false });
      }
      return;
    }

    const quote = this.mapService.quoteById(hit.point.quoteId);
    if (!quote) return;

    const truncated = quote.text.length > 120 ? quote.text.slice(0, 117) + '…' : quote.text;

    this.tooltip.set({
      visible: true,
      x: hit.canvasX + 12,
      y: hit.canvasY - 8,
      text: truncated,
      author: quote.author,
      // The quote's own category — accurate per-quote, unlike the emergent
      // embedding cluster which can place e.g. an ethics quote in a code theme.
      clusterLabel: quote.category,
      quoteId: hit.point.quoteId,
    });
  }

  onCanvasPointerLeave(): void {
    if (this.tooltip().visible) {
      this.tooltip.set({ ...this.tooltip(), visible: false });
    }
  }

  private hitTest(offsetX: number, offsetY: number): { point: QuoteMapPoint; canvasX: number; canvasY: number } | null {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return null;

    const points = this.mapService.points();
    if (!points.length) return null;

    const { dots } = this.computeLayout(canvas.clientWidth, canvas.clientHeight);

    let bestDist = HIT_RADIUS * HIT_RADIUS;
    let bestPoint: QuoteMapPoint | null = null;
    let bestCX = 0;
    let bestCY = 0;

    for (let i = 0; i < points.length; i++) {
      const dx = offsetX - dots[i].x;
      const dy = offsetY - dots[i].y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestPoint = points[i];
        bestCX = dots[i].x;
        bestCY = dots[i].y;
      }
    }

    if (!bestPoint) return null;
    return { point: bestPoint, canvasX: bestCX, canvasY: bestCY };
  }

  private scheduleDraw(): void {
    if (this.pendingDraw !== null) return;
    // Run draw outside Angular zone to avoid triggering unnecessary CD cycles
    this.zone.runOutsideAngular(() => {
      this.pendingDraw = requestAnimationFrame(() => {
        this.pendingDraw = null;
        this.draw();
      });
    });
  }

  private startEntrance(): void {
    if (prefersReducedMotion()) {
      this.entranceProgress = 1;
      this.scheduleDraw();
      return;
    }
    this.entranceProgress = 0;
    this.entranceStart = 0;
    if (this.animating) return;
    this.animating = true;
    this.zone.runOutsideAngular(() => {
      const step = (ts: number): void => {
        if (this.entranceStart === 0) this.entranceStart = ts;
        const elapsed = ts - this.entranceStart;
        this.entranceProgress = Math.min(1, elapsed / ENTRANCE_MS);
        try {
          this.draw();
        } finally {
          // finally (not catch): a bad frame must not silently swallow the
          // error, but it also must never be the single point of failure for
          // the whole entrance — the reschedule/settle below always runs.
          if (this.entranceProgress < 1) {
            requestAnimationFrame(step);
          } else {
            this.animating = false;
            // The loop's own last frame can be dropped by the browser (paint
            // contention during page load) or throw above; either way the
            // map must not depend on that single draw() call landing. Route
            // the guaranteed full-strength settle paint through the
            // independent scheduleDraw() path so the entrance can never end
            // up stuck dim until something unrelated (e.g. a legend click)
            // happens to trigger the next redraw.
            this.scheduleDraw();
          }
        }
      };
      requestAnimationFrame(step);
    });
  }

  /** Reads the live theme colors off the canvas so the map follows day/night. */
  private resolveInk(canvas: HTMLCanvasElement): ThemeInk {
    const cs = getComputedStyle(canvas);
    const ink = cs.getPropertyValue('--text-color').trim() || '#e8e8e8';
    // The canvas has no fill of its own — the panel's --bg-color shows through
    // every pixel the draw doesn't paint. Halo text against that same color
    // (not --text-area-color, a slightly lighter night-mode surface) so the
    // knockout is a clean cut, not a faint mismatched fringe.
    const paper = cs.getPropertyValue('--bg-color').trim() || '#161718';
    // Decide dark/light from the paper's luminance to pick halo + link strength.
    const isDark = this.luminance(paper) < 0.5;
    return {
      ink,
      inkSoft: ink,
      paper,
      isDark,
    };
  }

  private luminance(color: string): number {
    // Accepts #rgb/#rrggbb/rgb(...) — good enough to branch dark vs light.
    const m = color.match(/\d+(\.\d+)?/g);
    if (color.startsWith('#')) {
      const h = color.slice(1);
      const f = h.length === 3 ? h.split('').map((c) => c + c) : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
      const [r, g, b] = f.map((v) => parseInt(v, 16) / 255);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    if (m && m.length >= 3) {
      return (0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2]) / 255;
    }
    return 0.1;
  }

  /** Normalized theme anchor positions (0..1 in the drawable rect), chosen to
   *  compose a balanced map that fills the frame. Two arrangements: a landscape
   *  spread and a stacked portrait one for narrow/mobile canvases. */
  private anchorsFor(cssW: number, cssH: number): ScreenPoint[] {
    const land: [number, number][] = [
      [0.24, 0.32], // 0 Stoic Resolve
      [0.3, 0.74], // 1 The Examined Mind
      [0.7, 0.26], // 2 Cinema & Story
      [0.58, 0.72], // 3 Wisdom & the Long View
      [0.84, 0.5], // 4 The Craft of Code
    ];
    const port: [number, number][] = [
      [0.32, 0.16],
      [0.66, 0.34],
      [0.32, 0.54],
      [0.66, 0.72],
      [0.34, 0.86],
    ];
    const a = cssH > cssW * 1.1 ? port : land;
    const padX = CANVAS_PADDING;
    const padY = CANVAS_PADDING;
    const w = cssW - padX * 2;
    const h = cssH - padY * 2;
    return a.map(([nx, ny]) => ({ x: padX + nx * w, y: padY + ny * h }));
  }

  /** Sutherland–Hodgman clip of `poly` to the half-plane of points nearer to
   *  `s` than to `q` — one bisector of a Voronoi cell. */
  private clipToBisector(poly: ScreenPoint[], s: ScreenPoint, q: ScreenPoint): ScreenPoint[] {
    const mx = (s.x + q.x) / 2;
    const my = (s.y + q.y) / 2;
    const nx = q.x - s.x;
    const ny = q.y - s.y;
    const side = (pt: ScreenPoint): number => (pt.x - mx) * nx + (pt.y - my) * ny;
    const out: ScreenPoint[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const da = side(a);
      const db = side(b);
      if (da <= 0) out.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
      }
    }
    return out;
  }

  private pointInPolygon(p: ScreenPoint, poly: ScreenPoint[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  private polygonCentroid(poly: ScreenPoint[]): ScreenPoint {
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const cross = p.x * q.y - q.x * p.y;
      a += cross;
      cx += (p.x + q.x) * cross;
      cy += (p.y + q.y) * cross;
    }
    if (Math.abs(a) < 1e-6) {
      return { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
    }
    return { x: cx / (3 * a), y: cy / (3 * a) };
  }

  /** Compose the whole map for a given size: theme anchors, Voronoi territory
   *  cells that tessellate the frame, and each quote's final dot position
   *  (anchor + its intra-theme offset). Cached until the canvas resizes. */
  private computeLayout(cssW: number, cssH: number): NonNullable<typeof this.layout> {
    if (this.layout && this.layout.w === cssW && this.layout.h === cssH) return this.layout;

    const points = this.mapService.points();
    const clusterCount = this.clusters().length || 1;
    const anchors = this.anchorsFor(cssW, cssH).slice(0, clusterCount);

    // Voronoi cells fill the entire canvas — the territory colors bleed to all
    // four edges (anchors stay inset, so dots/labels never crowd the border).
    const frame: ScreenPoint[] = [
      { x: 0, y: 0 },
      { x: cssW, y: 0 },
      { x: cssW, y: cssH },
      { x: 0, y: cssH },
    ];
    const cells = anchors.map((s, c) => {
      let cell = frame;
      for (let o = 0; o < anchors.length; o++) {
        if (o !== c) cell = this.clipToBisector(cell, s, anchors[o]);
      }
      return cell;
    });

    const scale = Math.min(cssW, cssH) * 0.15;
    const dots = points.map((pt) => {
      const an = anchors[pt.cluster] ?? { x: cssW / 2, y: cssH / 2 };
      const raw = { x: an.x + pt.lx * scale, y: an.y + pt.ly * scale };
      // Keep every "city" inside its own territory — a dot in a neighbor's
      // color reads as a mistake. If it lands outside, pull it back toward the
      // anchor (with a small inset) until it's within the cell.
      const cell = cells[pt.cluster];
      if (!cell || this.pointInPolygon(raw, cell)) return raw;
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2;
        const test = { x: an.x + (raw.x - an.x) * mid, y: an.y + (raw.y - an.y) * mid };
        if (this.pointInPolygon(test, cell)) lo = mid;
        else hi = mid;
      }
      const t = lo * 0.9;
      return { x: an.x + (raw.x - an.x) * t, y: an.y + (raw.y - an.y) * t };
    });

    this.layout = { w: cssW, h: cssH, anchors, dots, cells };
    return this.layout;
  }

  private strokePolygon(ctx: CanvasRenderingContext2D, poly: ScreenPoint[]): void {
    if (poly.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    const wrapper = this.wrapperRef?.nativeElement;
    if (!canvas || !wrapper) return;

    const points = this.mapService.points();
    if (!points.length) return;

    const dpr = this.devicePixelRatio;
    const cssW = wrapper.clientWidth;
    const cssH = wrapper.clientHeight;
    if (cssW === 0 || cssH === 0) return;

    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      this.layout = null; // size changed → recompose
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const ink = this.resolveInk(canvas);
    const highlight = this.highlightedCluster();
    const p = this.entranceProgress;
    const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
    const clusters = this.clusters();
    const { anchors, dots, cells } = this.computeLayout(cssW, cssH);
    const clusterAlpha = (c: number): number => (highlight === null ? 1 : highlight === c ? 1 : DIM_ALPHA);

    // 1 — Territory cells: bold tessellating regions that fill the frame (a
    // Voronoi partition over the theme anchors), each a tinted area with a
    // ruled border, like countries on a map. Drawn first, behind everything.
    for (let c = 0; c < cells.length; c++) {
      const a = clusterAlpha(c) * ease;
      this.strokePolygon(ctx, cells[c]);
      ctx.fillStyle = rgb(CLUSTER_RGB[c], (ink.isDark ? 0.16 : 0.13) * a);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgb(CLUSTER_RGB[c], (ink.isDark ? 0.45 : 0.4) * a);
      ctx.stroke();
    }

    // 2 — Thread stitching between semantically-near quotes (short links only
    // — long lines are noise). Within-thread links (both ends share a
    // cluster) draw as red stitches — legible at rest, not just once
    // selected, so the map reads as red thread the moment it opens. Cross-
    // thread links stay a quiet ink hairline so the red stays meaningful:
    // "this belongs to this thread," not a generic accent.
    const maxLink = Math.min(cssW, cssH) * 0.18;
    for (let i = 0; i < points.length; i++) {
      const from = dots[i];
      const cl = points[i].cluster;
      const neighbors = this.mapService.neighborsOf(points[i].quoteId).slice(0, 3);
      for (const neighborId of neighbors) {
        const j = points.findIndex((point) => point.quoteId === neighborId);
        if (j < 0 || j <= i) continue;
        const to = dots[j];
        if (Math.hypot(to.x - from.x, to.y - from.y) > maxLink) continue;

        const clJ = points[j].cluster;
        if (cl === clJ) {
          const isSelected = highlight === cl;
          const isDimmed = highlight !== null && highlight !== cl;
          const threadAlpha =
            (isSelected ? THREAD_ALPHA_SELECTED : isDimmed ? THREAD_ALPHA_DIMMED : THREAD_ALPHA_REST) * ease;
          if (threadAlpha <= 0.02) continue;
          ctx.setLineDash(THREAD_STITCH_DASH);
          ctx.lineCap = 'round';
          ctx.lineWidth = isSelected ? 1.4 : 1;
          ctx.strokeStyle = rgb(THREAD_RED, threadAlpha);
        } else {
          const isVisible = highlight === null || highlight === cl || highlight === clJ;
          const crossAlpha = (isVisible ? (ink.isDark ? 0.16 : 0.13) : 0.04) * ease;
          if (crossAlpha <= 0.02) continue;
          ctx.setLineDash([]);
          ctx.lineCap = 'butt';
          ctx.lineWidth = 0.6;
          ctx.strokeStyle = rgb(
            { r: ink.isDark ? 255 : 20, g: ink.isDark ? 255 : 20, b: ink.isDark ? 255 : 20 },
            crossAlpha
          );
        }
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }
    // Dash/cap are per-stroke state on the shared context — reset before the
    // dot rings and "you are here" ring below, which must stay solid.
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';

    // 3 — Dots ("cities"): cluster-tinted + thin ink ring. Entrance lifts each
    // out from its theme anchor.
    for (let i = 0; i < points.length; i++) {
      const cl = points[i].cluster;
      const a = clusterAlpha(cl);
      const an = anchors[cl] ?? dots[i];
      const fx = an.x + (dots[i].x - an.x) * ease;
      const fy = an.y + (dots[i].y - an.y) * ease;
      ctx.globalAlpha = a * ease;
      ctx.beginPath();
      ctx.arc(fx, fy, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = hex(CLUSTER_RGB[cl]);
      ctx.fill();
      ctx.lineWidth = DOT_RING_WIDTH;
      ctx.strokeStyle = rgb(
        { r: ink.isDark ? 255 : 20, g: ink.isDark ? 255 : 20, b: ink.isDark ? 255 : 20 },
        DOT_RING_ALPHA
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 4 — Theme labels at each territory's centroid: bold small-caps with a
    // paper halo, like region names printed on a map. Sized and tracked to
    // stay quietly readable at rest, not just once a thread is picked.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 14px ${getComputedStyle(canvas).getPropertyValue('--font-primary') || 'sans-serif'}`;
    ctx.letterSpacing = '0.5px'; // a touch of tracking reads as printed small caps
    for (let c = 0; c < clusters.length; c++) {
      const a = clusterAlpha(c) * ease;
      if (a <= 0.05) continue;
      const ctr = this.polygonCentroid(cells[c]);
      const label = clusters[c].label.toUpperCase();
      // Keep the label fully inside the frame (centroids near an edge would
      // otherwise clip the text).
      const half = ctx.measureText(label).width / 2 + 6;
      const lx = Math.max(half, Math.min(cssW - half, ctr.x));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.lineWidth = 4.5;
      // Canvas defaults to a miter join, which spikes into sharp starbursts
      // at glyph corners once the stroke halo gets this wide relative to the
      // font size — reads as jagged, ghost-duplicated text. Round join keeps
      // the halo a clean, quiet outline instead.
      ctx.lineJoin = 'round';
      ctx.strokeStyle = ink.paper;
      ctx.strokeText(label, lx, ctr.y);
      ctx.fillStyle = ink.ink;
      ctx.fillText(label, lx, ctr.y);
      ctx.restore();
    }
    ctx.letterSpacing = '0px';

    // 5 — "You are here": ring the quote currently being read.
    const cur = this.currentQuote();
    if (cur && p >= 1) {
      const j = points.findIndex((point) => point.quoteId === cur.id);
      if (j >= 0) {
        const s = dots[j];
        ctx.beginPath();
        ctx.arc(s.x, s.y, DOT_RADIUS + 5, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = ink.ink;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s.x, s.y, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = hex(CLUSTER_RGB[points[j].cluster]);
        ctx.fill();
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
