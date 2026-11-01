/** Template schema v3: aspect-independent layouts (anchor + vmin units). */

export const TEMPLATE_SCHEMA_VERSION = 3 as const;

export type AspectClass = 'vertical' | 'square' | 'horizontal';

export type MetricId =
  | 'speed'
  | 'pace'
  | 'heartRate'
  | 'power'
  | 'cadence'
  | 'elevation'
  | 'distance'
  | 'elapsedTime'
  | 'grade'
  | 'vam'
  | 'gears'
  | 'none';

export type WidgetKind =
  | 'stat'
  | 'number'
  | 'gauge'
  | 'speedo'
  | 'ring'
  | 'slope'
  | 'gears'
  | 'spark'
  | 'profile'
  | 'profilenext'
  | 'vam'
  | 'map'
  | 'navmap'
  | 'compass';

export type PanelShape = 'rect' | 'pill' | 'none';
export type TextAlign = 'left' | 'center' | 'right';

export const WIDGET_KINDS: readonly WidgetKind[] = [
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

export const METRIC_IDS: readonly MetricId[] = [
  'speed',
  'pace',
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

/** Elapsed-time display: auto adapts (mm:ss under an hour, h:mm:ss above). */
export type TimeFormat = 'auto' | 'hmm' | 'hmmss' | 'h' | 'hm';

export type AnchorX = 'left' | 'center' | 'right';
export type AnchorY = 'top' | 'center' | 'bottom';

const ANCHOR_X: readonly AnchorX[] = ['left', 'center', 'right'];
const ANCHOR_Y: readonly AnchorY[] = ['top', 'center', 'bottom'];

/**
 * Aspect-independent layout. Every number is a % of the frame's smaller side
 * ("vmin %"), so identical values render at identical pixel sizes on any
 * aspect: a 30x30 box is square to the eye everywhere.
 */
export interface WidgetLayout {
  ax: AnchorX;
  ay: AnchorY;
  /** Padding from the anchor edge in vmin %; signed offset when centered. */
  px: number;
  py: number;
  /**
   * Size in vmin % (the w:h ratio is preserved on every aspect). 'stretch'
   * spans the frame on that axis minus the padding on both sides
   * (full-bleed bars).
   */
  w: number | 'stretch';
  h: number | 'stretch';
}

/** Pixel box resolved for one concrete frame. */
export interface ResolvedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Gears display: teeth ("34×18") or cog indexes ("1×6"). */
export type GearsMode = 'teeth' | 'index';

/** Which gears to show: both ("34×18"), front ("34") or rear ("18") only. */
export type GearsSide = 'both' | 'front' | 'rear';

/** Per-widget overrides. Anything absent falls back to the theme + 'rect'. */
export interface WidgetStyle {
  shape?: PanelShape;
  background?: string;
  backgroundOpacity?: number;
  accent?: string;
  text?: string;
  /** Font family for the label line; Inter when absent. */
  labelFont?: string;
  /** Size multiplier for the label line. Defaults to 1. */
  labelScale?: number;
  /** Font family for the value (number) line; Inter when absent. */
  valueFont?: string;
  /** Size multiplier for the value (number) line. Defaults to 1. */
  valueScale?: number;
  /** Text alignment for kinds that lay out text lines (stat, number). */
  align?: TextAlign;
}

export interface WidgetDef {
  id: string;
  metric: MetricId;
  kind: WidgetKind;
  visible: boolean;
  /** Show the unit next to the value. Defaults to true. */
  showUnit?: boolean;
  /** Show the label line. Defaults to true. Ignored by 'number' (no label) and map/navmap/compass (fallback titles only). */
  showLabel?: boolean;
  /** Gears display: teeth (default) or cog indexes. Only read for gears. */
  gearsMode?: GearsMode;
  /** Which gears to show (default both). Only read for gears. */
  gearsSide?: GearsSide;
  /** Gauge scale in raw SI units. Defaults per metric when absent. */
  range?: [number, number];
  /** Map ridden-trail stroke width in px. Auto-sized from the box when absent. */
  strokeWidth?: number;
  /** Elapsed-time display format. Defaults to 'auto'. Only read for elapsedTime. */
  timeFormat?: TimeFormat;
  style?: WidgetStyle;
  layout: WidgetLayout;
}

export interface TemplateTheme {
  text: string;
  accent: string;
  panel: string;
  panelOpacity: number;
}

export interface Template {
  schemaVersion: typeof TEMPLATE_SCHEMA_VERSION;
  id: string;
  name: string;
  description?: string;
  theme: TemplateTheme;
  widgets: WidgetDef[];
}

export function classifyAspect(width: number, height: number): AspectClass {
  const ratio = width / height;
  if (ratio < 0.8) return 'vertical';
  if (ratio > 1.25) return 'horizontal';
  return 'square';
}

/** Neutral theme for blank or imported templates missing theme fields. */
export const DEFAULT_TEMPLATE_THEME: TemplateTheme = {
  text: '#ffffff',
  accent: '#7dd3fc',
  panel: '#0b0e11',
  panelOpacity: 0.45,
};

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * Resolve an aspect-independent layout to a pixel box for one concrete frame.
 * Pure math, no clamping: validation sees the real geometry. Callers clamp
 * the pixel box before inferring back.
 */
export function resolveLayout(
  layout: WidgetLayout,
  frameW: number,
  frameH: number,
): ResolvedBox {
  const u = Math.min(frameW, frameH) / 100;
  const bw = layout.w === 'stretch' ? frameW - 2 * layout.px * u : layout.w * u;
  const bh = layout.h === 'stretch' ? frameH - 2 * layout.py * u : layout.h * u;
  const x =
    layout.w === 'stretch'
      ? layout.px * u
      : layout.ax === 'left'
        ? layout.px * u
        : layout.ax === 'right'
          ? frameW - layout.px * u - bw
          : (frameW - bw) / 2 + layout.px * u;
  const y =
    layout.h === 'stretch'
      ? layout.py * u
      : layout.ay === 'top'
        ? layout.py * u
        : layout.ay === 'bottom'
          ? frameH - layout.py * u - bh
          : (frameH - bh) / 2 + layout.py * u;
  return { x, y, w: bw, h: bh };
}

/**
 * Infer anchor + paddings from a pixel box (editor drag/drop, v2 migration).
 * The nearest edge wins each axis; near-symmetric boxes center. Fixed sizes
 * only: full-bleed bars get manual 'stretch' during migration.
 */
export function inferLayout(box: ResolvedBox, frameW: number, frameH: number): WidgetLayout {
  const u = Math.min(frameW, frameH) / 100;
  const axis = (
    pos: number,
    size: number,
    frame: number,
    start: string,
    end: string,
    center: string,
  ): { a: string; p: number } => {
    const d0 = pos;
    const d1 = frame - pos - size;
    if (Math.abs(d0 - d1) <= 0.01 * frame) {
      return { a: center, p: round3((pos + size / 2 - frame / 2) / u) };
    }
    return d0 <= d1 ? { a: start, p: round3(d0 / u) } : { a: end, p: round3(d1 / u) };
  };
  const hx = axis(box.x, box.w, frameW, 'left', 'right', 'center');
  const vy = axis(box.y, box.h, frameH, 'top', 'bottom', 'center');
  return {
    ax: hx.a as AnchorX,
    ay: vy.a as AnchorY,
    px: hx.p,
    py: vy.p,
    w: round3(box.w / u),
    h: round3(box.h / u),
  };
}

const isLayoutSize = (value: unknown): boolean =>
  value === 'stretch' ||
  (typeof value === 'number' && Number.isFinite(value) && value > 0);

const isLayout = (value: unknown): value is WidgetLayout => {
  if (typeof value !== 'object' || value === null) return false;
  const l = value as Record<string, unknown>;
  return (
    (ANCHOR_X as readonly string[]).includes(l.ax as string) &&
    (ANCHOR_Y as readonly string[]).includes(l.ay as string) &&
    typeof l.px === 'number' &&
    Number.isFinite(l.px) &&
    typeof l.py === 'number' &&
    Number.isFinite(l.py) &&
    isLayoutSize(l.w) &&
    isLayoutSize(l.h)
  );
};

/** Pre-v3 exports carried one box per aspect; recognized for a clear error. */
const isLegacyLayout = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false;
  return 'vertical' in value || 'square' in value || 'horizontal' in value;
};

const TIME_FORMATS: readonly string[] = ['auto', 'hmm', 'hmmss', 'h', 'hm'];
const GEARS_MODES: readonly string[] = ['teeth', 'index'];
const GEARS_SIDES: readonly string[] = ['both', 'front', 'rear'];
const PANEL_SHAPES: readonly string[] = ['rect', 'pill', 'none'];
const TEXT_ALIGNS: readonly string[] = ['left', 'center', 'right'];

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const pickString = (value: unknown, allowed: readonly string[]): string | undefined =>
  typeof value === 'string' && allowed.includes(value) ? value : undefined;

/** True for an exact [number, number] pair of finite numbers (WidgetDef.range shape). */
export function isRangePair(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && isFiniteNumber(v[0]) && isFiniteNumber(v[1]);
}

/** Gauge scale: a [min, max] pair of finite numbers, else absent (theme default). */
const normalizeRange = (value: unknown): [number, number] | undefined => {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const [min, max] = value;
  return isFiniteNumber(min) && isFiniteNumber(max) ? [min, max] : undefined;
};

/** Style is fail-open per field: bad fields drop, good ones survive. */
const normalizeStyle = (value: unknown): WidgetStyle | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const s = value as Record<string, unknown>;
  const style: WidgetStyle = {};
  const shape = pickString(s.shape, PANEL_SHAPES);
  if (shape) style.shape = shape as PanelShape;
  for (const key of ['background', 'accent', 'text', 'labelFont', 'valueFont'] as const) {
    if (typeof s[key] === 'string') style[key] = s[key] as string;
  }
  for (const key of ['backgroundOpacity', 'labelScale', 'valueScale'] as const) {
    if (isFiniteNumber(s[key])) style[key] = s[key] as number;
  }
  const align = pickString(s.align, TEXT_ALIGNS);
  if (align) style.align = align as TextAlign;
  return Object.keys(style).length > 0 ? style : undefined;
};

/**
 * Parse an exported template file back into a Template. Throws
 * `not a template` on malformed JSON or a wrong shape; throws
 * `legacy template` for recognized pre-v3 exports (one box per aspect),
 * which are no longer accepted. The caller assigns a fresh id (an export
 * keeps its original id, which may already exist). Widget optionals are
 * fail-open: invalid values drop to defaults, unknown keys are stripped,
 * and ids default/dedupe.
 */
export function parseTemplateJson(text: string): Template {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error('not a template');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('not a template');
  }
  const rec = raw as Record<string, unknown>;
  if (rec.schemaVersion !== undefined && rec.schemaVersion !== TEMPLATE_SCHEMA_VERSION) {
    throw new Error('legacy template');
  }
  if (typeof rec.name !== 'string' || !Array.isArray(rec.widgets)) {
    throw new Error('not a template');
  }
  for (const w of rec.widgets) {
    if (typeof w !== 'object' || w === null) throw new Error('not a template');
    const widget = w as Record<string, unknown>;
    if (!isLayout(widget.layout)) {
      throw new Error(isLegacyLayout(widget.layout) ? 'legacy template' : 'not a template');
    }
    if (
      typeof widget.kind !== 'string' ||
      !(WIDGET_KINDS as readonly string[]).includes(widget.kind)
    ) {
      throw new Error('not a template');
    }
    if (
      typeof widget.metric !== 'string' ||
      !(METRIC_IDS as readonly string[]).includes(widget.metric)
    ) {
      throw new Error('not a template');
    }
  }
  const theme =
    typeof rec.theme === 'object' && rec.theme !== null
      ? (rec.theme as Record<string, unknown>)
      : {};
  const pick = (key: keyof TemplateTheme, fallback: number | string): number | string => {
    const value = theme[key as string];
    return typeof value === typeof fallback ? (value as number | string) : fallback;
  };
  const panelOpacity = pick('panelOpacity', DEFAULT_TEMPLATE_THEME.panelOpacity) as number;
  // Allowlist build: invalid optionals drop to their defaults and unknown keys
  // (incl. the removed custom `label`) never enter the model. Ids default per
  // index and dedupe with a suffix: override maps key by id.
  const seenIds = new Set<string>();
  const widgets = (rec.widgets as Record<string, unknown>[]).map((w, i): WidgetDef => {
    let id = typeof w.id === 'string' && w.id ? w.id : `widget-${i}`;
    if (seenIds.has(id)) {
      let n = 2;
      while (seenIds.has(`${id}-${n}`)) n += 1;
      id = `${id}-${n}`;
    }
    seenIds.add(id);
    const widget: WidgetDef = {
      id,
      metric: w.metric as MetricId,
      kind: w.kind as WidgetKind,
      visible: typeof w.visible === 'boolean' ? w.visible : true,
      layout: w.layout as WidgetLayout,
    };
    if (typeof w.showUnit === 'boolean') widget.showUnit = w.showUnit;
    if (typeof w.showLabel === 'boolean') widget.showLabel = w.showLabel;
    const gearsMode = pickString(w.gearsMode, GEARS_MODES);
    if (gearsMode) widget.gearsMode = gearsMode as GearsMode;
    const gearsSide = pickString(w.gearsSide, GEARS_SIDES);
    if (gearsSide) widget.gearsSide = gearsSide as GearsSide;
    const range = normalizeRange(w.range);
    if (range) widget.range = range;
    if (isFiniteNumber(w.strokeWidth)) widget.strokeWidth = w.strokeWidth;
    const timeFormat = pickString(w.timeFormat, TIME_FORMATS);
    if (timeFormat) widget.timeFormat = timeFormat as TimeFormat;
    const style = normalizeStyle(w.style);
    if (style) widget.style = style;
    return widget;
  });
  return {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    id: typeof rec.id === 'string' && rec.id ? rec.id : 'imported',
    name: rec.name as string,
    ...(typeof rec.description === 'string' ? { description: rec.description } : {}),
    theme: {
      text: pick('text', DEFAULT_TEMPLATE_THEME.text) as string,
      accent: pick('accent', DEFAULT_TEMPLATE_THEME.accent) as string,
      panel: pick('panel', DEFAULT_TEMPLATE_THEME.panel) as string,
      panelOpacity: Number.isFinite(panelOpacity) ? panelOpacity : DEFAULT_TEMPLATE_THEME.panelOpacity,
    },
    widgets,
  };
}
