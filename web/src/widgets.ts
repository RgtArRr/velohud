import type {
  MetricId,
  TextAlign,
  WidgetDef,
  WidgetKind,
  WidgetLayout,
} from '@velohud/shared';
import { t } from './i18n.js';
import { METERS_PER_DEG_LAT, METERS_PER_DEG_LON } from './geo.js';

/** Pure, DOM-free widget catalog + factory for the right panel. No side effects. */

export const WIDGET_KINDS: WidgetKind[] = [
  'stat',
  'number',
  'gauge',
  'speedo',
  'ring',
  'slope',
  'gears',
  'spark',
  'profile',
  'profilenext',
  'vam',
  'map',
  'navmap',
  'compass',
];

// Inspector-only list: deliberately omits 'pace' (valid in templates, never offered here).
export const METRIC_IDS: MetricId[] = [
  'speed',
  'heartRate',
  'power',
  'cadence',
  'elevation',
  'distance',
  'elapsedTime',
  'grade',
  'vam',
  'gears',
  'none',
];

export const kindLabel = (kind: WidgetKind): string => t(`kind.${kind}`);

/** Widget font when the style sets none: the first entry of the inspector font list. */
export const DEFAULT_WIDGET_FONT = 'Inter, sans-serif';

export const metricLabel = (metric: MetricId): string => t(`metric.${metric}`);

/** Canonical metric per kind, mirroring the built-in fixtures. */
const DEFAULT_METRIC: Record<WidgetKind, MetricId> = {
  stat: 'speed',
  number: 'power',
  gauge: 'speed',
  speedo: 'speed',
  ring: 'cadence',
  slope: 'grade',
  gears: 'gears',
  spark: 'power',
  profile: 'elevation',
  profilenext: 'elevation',
  vam: 'vam',
  map: 'none',
  navmap: 'none',
  compass: 'none',
};

export function defaultMetricFor(kind: WidgetKind): MetricId {
  return DEFAULT_METRIC[kind];
}

/** Text alignment default per kind (numbers center, the rest left). */
export function defaultAlignFor(kind: WidgetKind): TextAlign {
  return kind === 'number' ? 'center' : 'left';
}

/** Kinds whose painter renders the metric unit (they honor showUnit). */
/**
 * Per-kind capabilities driving inspector visibility. One row per kind;
 * `Record` fails compilation when a new kind lacks one.
 */
export interface KindCaps {
  /** Paints a unit (Unidad checkbox). */
  unit: boolean;
  /** Label can be toggled (Etiqueta checkbox). */
  labelToggle: boolean;
  /** Paints a GPS trail with configurable width (Grosor slider). */
  trailWidth: boolean;
  /** Paints label/value text in normal render (maps only show a fallback title). */
  text: boolean;
  /** Shows the teeth/index display mode selector (gears only). */
  gearsMode: boolean;
}

const DEFAULT_CAPS: KindCaps = {
  unit: true, labelToggle: true, trailWidth: false, text: true, gearsMode: false,
};

const KIND_CAPS: Record<WidgetKind, KindCaps> = {
  stat: { ...DEFAULT_CAPS },
  number: { ...DEFAULT_CAPS, labelToggle: false },
  gauge: { ...DEFAULT_CAPS },
  speedo: { ...DEFAULT_CAPS },
  ring: { ...DEFAULT_CAPS },
  slope: { ...DEFAULT_CAPS },
  gears: { ...DEFAULT_CAPS, gearsMode: true },
  spark: { ...DEFAULT_CAPS },
  profile: { ...DEFAULT_CAPS },
  profilenext: { ...DEFAULT_CAPS },
  vam: { ...DEFAULT_CAPS },
  map: { ...DEFAULT_CAPS, unit: false, labelToggle: false, trailWidth: true, text: false },
  navmap: { ...DEFAULT_CAPS, unit: false, labelToggle: false, trailWidth: true, text: false },
  compass: { ...DEFAULT_CAPS, unit: false, labelToggle: false },
};

export const capsFor = (kind: WidgetKind): KindCaps => KIND_CAPS[kind];
export const kindShowsUnit = (kind: WidgetKind): boolean => capsFor(kind).unit;

/** Default size per kind in vmin %, converted from the v2 horizontal bases. */
const BASE_SIZE: Record<WidgetKind, { w: number; h: number }> = {
  stat: { w: 32, h: 13 },
  number: { w: 28, h: 18 },
  gauge: { w: 39, h: 30 },
  speedo: { w: 46, h: 26 },
  ring: { w: 36, h: 30 },
  slope: { w: 46, h: 16 },
  gears: { w: 36, h: 18 },
  spark: { w: 57, h: 18 },
  profile: { w: 60, h: 20 },
  profilenext: { w: 60, h: 20 },
  vam: { w: 36, h: 20 },
  map: { w: 46, h: 34 },
  navmap: { w: 46, h: 34 },
  compass: { w: 28, h: 26 },
};

/**
 * Default layout: centered, stepped down-right per slot so consecutive adds
 * don't stack exactly. Capped offsets keep every kind inside any frame.
 */
export function defaultLayout(kind: WidgetKind, slot = 0): WidgetLayout {
  const base = BASE_SIZE[kind];
  return {
    ax: 'center',
    ay: 'center',
    px: Math.min(slot * 5, 10),
    py: Math.min(slot * 4, 10),
    w: base.w,
    h: base.h,
  };
}

/** First free id: `kind`, `kind-2`, `kind-3`, … */
export function nextWidgetId(taken: Iterable<string>, kind: WidgetKind): string {
  const set = new Set(taken);
  if (!set.has(kind)) return kind;
  let n = 2;
  while (set.has(`${kind}-${n}`)) n += 1;
  return `${kind}-${n}`;
}

/** Map stroke widths in px: explicit `strokeWidth` wins (full trail at 70 %), else auto from the box. */
export function mapStrokeWidths(
  strokeWidth: number | undefined,
  w: number,
  h: number,
): { track: number; ridden: number } {
  const unit = Math.min(w, h);
  if (strokeWidth === undefined || !Number.isFinite(strokeWidth)) {
    return { track: Math.max(2.5, unit * 0.009), ridden: Math.max(3.5, unit * 0.013) };
  }
  const ridden = Math.max(1, strokeWidth);
  return { track: Math.max(1, ridden * 0.7), ridden };
}

/** GPS point for navigation-window math. */
export interface NavPoint {
  lon: number;
  lat: number;
  t: number;
}

function segMeters(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const kx = Math.cos((((aLat + bLat) / 2) * Math.PI) / 180);
  return Math.hypot((bLon - aLon) * kx * METERS_PER_DEG_LON, (bLat - aLat) * METERS_PER_DEG_LAT);
}

/** Walk from `i0` toward `dir` until `budgetM` accumulates or points run out. */
function walk(points: NavPoint[], i0: number, dir: -1 | 1, budgetM: number): number {
  let i = i0;
  let acc = 0;
  while ((dir < 0 ? i > 0 : i + 1 < points.length) && acc < budgetM) {
    const a = points[i];
    const b = points[i + dir];
    acc += segMeters(a.lon, a.lat, b.lon, b.lat);
    i += dir;
  }
  return i;
}

/**
 * Index window holding `behindM` before and `aheadM` after time `t` along the
 * track. Points must be time-ordered. Edges clamp to the available points.
 */
export function navWindow(
  points: NavPoint[],
  t: number,
  behindM = 50,
  aheadM = 400,
): { start: number; end: number } {
  let i0 = 0;
  while (i0 + 1 < points.length && points[i0 + 1].t <= t) i0 += 1;
  const start = walk(points, i0, -1, behindM);
  const end = walk(points, i0, 1, aheadM);
  return { start, end };
}

/** Meters forward/right of `origin`, rotated so `courseDeg` points up. */
export function navProject(
  lon: number,
  lat: number,
  origin: { lon: number; lat: number },
  courseDeg: number,
): { fwd: number; right: number } {
  const kx = Math.cos((origin.lat * Math.PI) / 180);
  const dx = (lon - origin.lon) * kx * METERS_PER_DEG_LON;
  const dy = (lat - origin.lat) * METERS_PER_DEG_LAT;
  const c = (courseDeg * Math.PI) / 180;
  return { fwd: dx * Math.sin(c) + dy * Math.cos(c), right: dx * Math.cos(c) - dy * Math.sin(c) };
}

/** A visible widget with a default box per aspect. Range falls back to the renderer default. */
export function makeWidgetDef(
  kind: WidgetKind,
  metric: MetricId,
  id: string,
  slot = 0,
): WidgetDef {
  return {
    id,
    metric,
    kind,
    visible: true,
    layout: defaultLayout(kind, slot),
  };
}
