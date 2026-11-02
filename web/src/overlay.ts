import {
  isRangePair,
  resolveLayout,
  type MetricId,
  type PanelShape,
  type Template,
  type TextAlign,
  type WidgetDef,
} from '@velohud/shared';
import {
  lowerBound,
  nextProfileWindow,
  sampleAt,
  widgetValue,
  type Activity,
  type TelemetrySample,
} from './telemetry.js';
import { formatMetric, type Units } from './format.js';
import {
  DEFAULT_WIDGET_FONT,
  defaultAlignFor,
  mapStrokeWidths,
  navProject,
  navWindow,
} from './widgets.js';

/** Overlay labels are hardcoded English content: templates (incl. AI output) cannot rename them. */
const LABEL: Record<MetricId, string> = {
  speed: 'SPD',
  pace: 'PACE',
  heartRate: 'HR',
  power: 'PWR',
  cadence: 'CAD',
  elevation: 'ELEV',
  distance: 'DIST',
  elapsedTime: 'TIME',
  grade: 'GRADE',
  vam: 'VAM',
  gears: 'GEARS',
  none: '',
};

/** Fallback gauge scales in raw SI units, used when the widget sets no range. */
const GAUGE_DEFAULTS: Record<MetricId, [number, number]> = {
  speed: [0, 15],
  pace: [180, 600],
  heartRate: [40, 200],
  power: [0, 400],
  cadence: [0, 120],
  elevation: [0, 1000],
  distance: [0, 10000],
  elapsedTime: [0, 3600],
  grade: [-15, 15],
  vam: [0, 2000],
  gears: [0, 1],
  none: [0, 1],
};

/** Full series access for history widgets (spark, profile, map, compass, vam). */
export interface OverlayHistory {
  activity: Activity;
  t: number;
}

/** Share animation state: 0..1 progress over the anim window. */
export interface ShareAnim {
  progress: number;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface ResolvedStyle {
  shape: PanelShape;
  background: string;
  backgroundOpacity: number;
  accent: string;
  text: string;
  labelFont: string;
  labelScale: number;
  valueFont: string;
  valueScale: number;
  align: TextAlign;
}

function resolveStyle(template: Template, widget: WidgetDef): ResolvedStyle {
  const s = widget.style ?? {};
  return {
    shape: s.shape ?? 'rect',
    background: s.background ?? template.theme.panel,
    backgroundOpacity: s.backgroundOpacity ?? template.theme.panelOpacity,
    accent: s.accent ?? template.theme.accent,
    text: s.text ?? template.theme.text,
    labelFont: s.labelFont ?? DEFAULT_WIDGET_FONT,
    labelScale: s.labelScale ?? 1,
    valueFont: s.valueFont ?? DEFAULT_WIDGET_FONT,
    valueScale: s.valueScale ?? 1,
    align: s.align ?? defaultAlignFor(widget.kind),
  };
}

function paintPanel(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  shape: PanelShape,
  color: string,
  opacity: number,
): void {
  if (shape === 'none') return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, shape === 'pill' ? Math.min(w, h) / 2 : Math.min(10, h * 0.18));
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.fill();
  ctx.restore();
}

interface WidgetText {
  label: string;
  value: string;
  unit: string;
}

function widgetText(
  widget: WidgetDef,
  sample: TelemetrySample,
  units: Units,
): WidgetText {
  const raw = widgetValue(widget.metric, sample);
  const formatted =
    raw === undefined
      ? { value: '—', unit: '' }
      : formatMetric(widget.metric, raw, units, widget.timeFormat);
  return {
    label: LABEL[widget.metric],
    value: formatted.value,
    unit: widget.showUnit === false ? '' : formatted.unit,
  };
}

function drawStat(
  ctx: Ctx,
  widget: WidgetDef,
  template: Template,
  sample: TelemetrySample,
  x: number,
  y: number,
  w: number,
  h: number,
  units: Units,
): void {
  const style = resolveStyle(template, widget);
  const text = widgetText(widget, sample, units);
  paintPanel(ctx, x, y, w, h, style.shape, style.background, style.backgroundOpacity);

  const pad = Math.min(w, h) * 0.14;
  const showLabel = widget.showLabel !== false;
  const valueSize = showLabel ? h * 0.44 : h * 0.5;
  const labelSize = Math.max(9, h * 0.2);
  const tx =
    style.align === 'center' ? x + w / 2 : style.align === 'right' ? x + w - pad : x + pad;

  ctx.save();
  ctx.textAlign = style.align;
  if (showLabel) {
    ctx.fillStyle = style.accent;
    ctx.font = `600 ${labelSize * style.labelScale}px ${style.labelFont}`;
    ctx.textBaseline = 'top';
    ctx.fillText(text.label, tx, y + pad * 0.7, w - pad * 2);
  }

  ctx.fillStyle = style.text;
  ctx.font = `700 ${valueSize * style.valueScale}px ${style.valueFont}`;
  const line = text.unit ? `${text.value} ${text.unit}` : text.value;
  if (showLabel) {
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(line, tx, y + h - pad * 0.8, w - pad * 2);
  } else {
    ctx.textBaseline = 'middle';
    ctx.fillText(line, tx, y + h * 0.52, w - pad * 2);
  }
  ctx.restore();
}

function drawNumber(
  ctx: Ctx,
  widget: WidgetDef,
  template: Template,
  sample: TelemetrySample,
  x: number,
  y: number,
  w: number,
  h: number,
  units: Units,
): void {
  const style = resolveStyle(template, widget);
  const text = widgetText(widget, sample, units);
  paintPanel(ctx, x, y, w, h, style.shape, style.background, style.backgroundOpacity);

  const pad = Math.min(w, h) * 0.14;
  const cx =
    style.align === 'left' ? x + pad : style.align === 'right' ? x + w - pad : x + w / 2;
  const mw = style.align === 'center' ? w * 0.92 : w - pad * 2;
  ctx.save();
  ctx.textAlign = style.align;
  ctx.fillStyle = style.text;
  ctx.font = `700 ${h * 0.52 * style.valueScale}px ${style.valueFont}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text.value, cx, text.unit ? y + h * 0.4 : y + h * 0.52, mw);
  if (text.unit) {
    ctx.fillStyle = style.accent;
    ctx.font = `600 ${Math.max(9, h * 0.18) * style.labelScale}px ${style.labelFont}`;
    ctx.fillText(text.unit, cx, y + h * 0.8, mw);
  }
  ctx.restore();
}

/** Samples ascend in t (sampleAt binary-searches on it): first index with t >= fromT. */
/** Fraction of [min,max]; a zero-span range draws empty instead of NaN. */
const fracOf = (raw: number, min: number, max: number): number =>
  max - min < 1e-9 ? 0 : Math.min(1, Math.max(0, (raw - min) / (max - min)));

/** Validated gauge scale: a malformed range falls back instead of throwing. */
const gaugeRange = (widget: WidgetDef): [number, number] => {
  if (isRangePair(widget.range)) return widget.range;
  return GAUGE_DEFAULTS[widget.metric];
};

function drawGauge(
  ctx: Ctx,
  widget: WidgetDef,
  template: Template,
  sample: TelemetrySample,
  x: number,
  y: number,
  w: number,
  h: number,
  units: Units,
): void {
  const style = resolveStyle(template, widget);
  const text = widgetText(widget, sample, units);
  paintPanel(ctx, x, y, w, h, style.shape, style.background, style.backgroundOpacity);

  const [min, max] = gaugeRange(widget);
  const raw = widgetValue(widget.metric, sample);
  const frac = raw === undefined ? 0 : fracOf(raw, min, max);

  const cx = x + w / 2;
  const cy = y + h * 0.6;
  const r = Math.max(1, Math.min(w / 2 - 6, h * 0.42));
  const a0 = Math.PI * 0.75;
  const a1 = Math.PI * 2.25;
  const lw = Math.max(4, Math.min(w, h) * 0.09);

  ctx.save();
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a1);
  ctx.stroke();
  ctx.strokeStyle = style.accent;
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a0 + (a1 - a0) * frac);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = style.text;
  ctx.font = `700 ${h * 0.2 * style.valueScale}px ${style.valueFont}`;
  ctx.textBaseline = 'middle';
  const line = text.unit ? `${text.value} ${text.unit}` : text.value;
  // Nudged below the arc center: optical middle sits lower than cy.
  ctx.fillText(line, cx, cy + h * 0.05, w * 0.9);

  if (widget.showLabel !== false) {
    ctx.fillStyle = style.accent;
    ctx.font = `600 ${Math.max(8, h * 0.09) * style.labelScale}px ${style.labelFont}`;
    ctx.textBaseline = 'top';
    ctx.fillText(text.label, cx, y + h * 0.06, w * 0.9);
  }
  ctx.restore();
}

/** Centered '—' for widgets with no data at this moment. Panel already painted. */
function drawMissing(
  ctx: Ctx,
  style: ResolvedStyle,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = style.text;
  ctx.font = `700 ${h * 0.3 * style.valueScale}px ${style.valueFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('—', x + w / 2, y + h / 2);
  ctx.restore();
}

function drawLabelTop(
  ctx: Ctx,
  style: ResolvedStyle,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.fillStyle = style.accent;
  ctx.font = `600 ${Math.max(8, h * 0.09) * style.labelScale}px ${style.labelFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x + w / 2, y + h * 0.06, w * 0.9);
  ctx.restore();
}

/** Classic semicircular speedometer with needle + digital readout. */
function drawSpeedo(
  ctx: Ctx,
  widget: WidgetDef,
  template: Template,
  sample: TelemetrySample,
  x: number,
  y: number,
  w: number,
  h: number,
  units: Units,
): void {
  const style = resolveStyle(template, widget);
  const text = widgetText(widget, sample, units);
  paintPanel(ctx, x, y, w, h, style.shape, style.background, style.backgroundOpacity);
  if (widget.showLabel !== false) drawLabelTop(ctx, style, text.label, x, y, w, h);
  const raw = widgetValue(widget.metric, sample);
  if (raw === undefined) {
    drawMissing(ctx, style, x, y, w, h);
    return;
  }
  const [min, max] = gaugeRange(widget);
  const frac = fracOf(raw, min, max);
  const cx = x + w / 2;
  const cy = y + h * 0.74;
  const r = Math.min(w / 2 - 10, h * 0.6);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(4, h * 0.045);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  ctx.stroke();
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = 2;
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI + (Math.PI * i) / 6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - h * 0.03), cy + Math.sin(a) * (r - h * 0.03));
    ctx.lineTo(cx + Math.cos(a) * (r + h * 0.02), cy + Math.sin(a) * (r + h * 0.02));
    ctx.stroke();
  }
  const na = Math.PI + Math.PI * frac;
  const needleW = Math.max(4, h * 0.032);
  ctx.strokeStyle = style.text;
  ctx.lineWidth = needleW;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(na) * r * 0.92, cy + Math.sin(na) * r * 0.92);
  ctx.stroke();
  ctx.fillStyle = style.text;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(4, needleW * 0.9), 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = style.text;
  ctx.font = `700 ${h * 0.16 * style.valueScale}px ${style.valueFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const line = text.unit ? `${text.value} ${text.unit}` : text.value;
  ctx.fillText(line, cx, y + h * 0.98, w * 0.9);
  ctx.restore();
}

/** Generic full ring for any metric + range, value centered. */
function drawRing(
  ctx: Ctx,
  widget: WidgetDef,
  template: Template,
  sample: TelemetrySample,
  x: number,
  y: number,
  w: number,
  h: number,
  units: Units,
): void {
  const style = resolveStyle(template, widget);
  const text = widgetText(widget, sample, units);
  paintPanel(ctx, x, y, w, h, style.shape, style.background, style.backgroundOpacity);
  if (widget.showLabel !== false) drawLabelTop(ctx, style, text.label, x, y, w, h);
  const raw = widgetValue(widget.metric, sample);
  if (raw === undefined) {
    drawMissing(ctx, style, x, y, w, h);
    return;
  }
  const [min, max] = gaugeRange(widget);
  const frac = fracOf(raw, min, max);
  const cx = x + w / 2;
  const cy = y + h * 0.56;
  const r = Math.max(1, Math.min(w, h) / 2 - 10);
  ctx.save();
  ctx.lineWidth = Math.max(4, Math.min(w, h) * 0.09);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.strokeStyle = style.accent;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * frac);
  ctx.stroke();
  ctx.fillStyle = style.text;
  ctx.font = `700 ${h * 0.2 * style.valueScale}px ${style.valueFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const line = text.unit ? `${text.value} ${text.unit}` : text.value;
  ctx.fillText(line, cx, cy, w * 0.8);
  ctx.restore();
}

/** Display angle for a grade percent: true atan ×2, capped at ±45°. Exported for tests. */
export const gradeAngle = (gradePct: number): number => {
  const doubled = Math.atan(gradePct / 100) * 2;
  return Math.max(-Math.PI / 4, Math.min(Math.PI / 4, doubled));
};

/** Grade inclinometer: the line itself tilts (uphill rises to the right). */
function drawSlope(
  ctx: Ctx,
  widget: WidgetDef,
  template: Template,
  sample: TelemetrySample,
  x: number,
  y: number,
  w: number,
  h: number,
  units: Units,
): void {
  const style = resolveStyle(template, widget);
  const text = widgetText(widget, sample, units);
  paintPanel(ctx, x, y, w, h, style.shape, style.background, style.backgroundOpacity);
  if (widget.showLabel !== false) drawLabelTop(ctx, style, text.label, x, y, w, h);
  const raw = widgetValue(widget.metric, sample);
  if (raw === undefined) {
    drawMissing(ctx, style, x, y, w, h);
    return;
  }
  const angle = gradeAngle(raw);
  const cx = x + w / 2;
  const cy = y + h * 0.66;
  // Short enough to stay inside the panel at any angle.
  const half = Math.min(w / 2 - w * 0.08, h * 0.3);
  const dx = Math.cos(angle) * half;
  const dy = Math.sin(angle) * half;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = Math.max(3, h * 0.03);
  ctx.beginPath();
  ctx.moveTo(cx - dx, cy + dy);
  ctx.lineTo(cx + dx, cy - dy);
  ctx.stroke();
  ctx.fillStyle = style.accent;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(3, h * 0.028), 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = style.text;
  ctx.font = `700 ${h * 0.3 * style.valueScale}px ${style.valueFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const line = text.unit ? `${text.value} ${text.unit}` : text.value;
  ctx.fillText(line, x + w / 2, y + h * 0.36, w * 0.9);
  ctx.restore();
}

/** Front × rear gear teeth, step-held between shift events. */
function drawGears(
  ctx: Ctx,
  widget: WidgetDef,
  template: Template,
  sample: TelemetrySample,
  x: number,
  y: number,
  w: number,
  h: number,
  units: Units,
): void {
  const style = resolveStyle(template, widget);
  paintPanel(ctx, x, y, w, h, style.shape, style.background, style.backgroundOpacity);
  // Index mode falls back to teeth when the file carries no gear numbers.
  const useNum =
    widget.gearsMode === 'index' &&
    typeof sample.frontGearNum === 'number' &&
    typeof sample.rearGearNum === 'number';
  const front = useNum ? sample.frontGearNum : sample.frontGear;
  const rear = useNum ? sample.rearGearNum : sample.rearGear;
  const side = widget.gearsSide ?? 'both';
  const needFront = side !== 'rear';
  const needRear = side !== 'front';
  if ((needFront && typeof front !== 'number') || (needRear && typeof rear !== 'number')) {
    drawMissing(ctx, style, x, y, w, h);
    return;
  }
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = style.text;
  ctx.font = `700 ${h * 0.34 * style.valueScale}px ${style.valueFont}`;
  const combo = side === 'front' ? `${front}` : side === 'rear' ? `${rear}` : `${front}×${rear}`;
  // Both mode shows no unit; single sides suffix T (teeth) or G (index).
  const suffix = widget.gearsMode === 'index' ? 'G' : 'T';
  const line = side === 'both' || widget.showUnit === false ? combo : `${combo} ${suffix}`;
  ctx.fillText(line, x + w / 2, y + h * 0.44, w * 0.92);
  // Subtitle stays English by product decision (overlay content language).
  if (widget.showLabel !== false) {
    ctx.fillStyle = style.accent;
    ctx.font = `600 ${Math.max(8, h * 0.1) * style.labelScale}px ${style.labelFont}`;
    const sub = side === 'front' ? 'FRONT' : side === 'rear' ? 'REAR' : 'FRONT · REAR';
    ctx.fillText(sub, x + w / 2, y + h * 0.7, w * 0.9);
  }
  ctx.restore();
}

/** Shared spark/profile header: left label + right value line. */
function drawChartHeader(
  ctx: Ctx,
  style: ResolvedStyle,
  text: { label: string; line: string; showLabel: boolean },
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save();
  if (text.showLabel) {
    ctx.fillStyle = style.accent;
    ctx.font = `600 ${Math.max(8, h * 0.11) * style.labelScale}px ${style.labelFont}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(text.label, x + w * 0.05, y + h * 0.06, w * 0.4);
  }
  ctx.fillStyle = style.text;
  ctx.font = `700 ${h * 0.16 * style.valueScale}px ${style.valueFont}`;
  ctx.textAlign = 'right';
  ctx.fillText(text.line, x + w * 0.95, y + h * 0.05, w * 0.5);
  ctx.restore();
}

/** Last-30 s sparkline of any metric. */
function drawSpark(
  ctx: Ctx,
  widget: WidgetDef,
  template: Template,
  sample: TelemetrySample,
  x: number,
  y: number,
  w: number,
  h: number,
  units: Units,
  hist: OverlayHistory | undefined,
): void {
  const style = resolveStyle(template, widget);
  const text = widgetText(widget, sample, units);
  paintPanel(ctx, x, y, w, h, style.shape, style.background, style.backgroundOpacity);
  const pts: [number, number][] = [];
  if (hist) {
    const samples = hist.activity.samples;
    for (let i = lowerBound(samples, hist.t - 30); i < samples.length; i++) {
      const s = samples[i];
      if (s.t > hist.t) break;
      const v = widget.metric === 'elapsedTime' ? s.t : s[widget.metric as keyof TelemetrySample];
      if (typeof v === 'number') pts.push([s.t, v]);
    }
  }
  const line = text.unit ? `${text.value} ${text.unit}` : text.value;
  drawChartHeader(ctx, style, { label: text.label, line, showLabel: widget.showLabel !== false }, x, y, w, h);
  if (pts.length < 2) {
    drawMissing(ctx, style, x, y + h * 0.2, w, h * 0.8);
    return;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const [, v] of pts) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max - min < 1e-9) {
    min -= 1;
    max += 1;
  }
  const cx0 = x + w * 0.04;
  const cx1 = x + w * 0.96;
  const cy0 = y + h * 0.3;
  const cy1 = y + h * 0.94;
  const X = (t: number): number => cx0 + ((t - (hist?.t ?? 0) + 30) / 30) * (cx1 - cx0);
  const Y = (v: number): number => cy1 - ((v - min) / (max - min)) * (cy1 - cy0);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(X(pts[0][0]), cy1);
  for (const [t, v] of pts) ctx.lineTo(X(t), Y(v));
  ctx.lineTo(X(pts[pts.length - 1][0]), cy1);
  ctx.closePath();
  ctx.fillStyle = style.accent;
  ctx.globalAlpha = 0.22;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  pts.forEach(([t, v], i) => {
    if (i === 0) ctx.moveTo(X(t), Y(v));
    else ctx.lineTo(X(t), Y(v));
  });
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  const [lt, lv] = pts[pts.length - 1];
  ctx.fillStyle = style.text;
  ctx.beginPath();
  ctx.arc(X(lt), Y(lv), 3, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}

/**
 * Elevation profile: full ride ('full') or a 5-min lookahead slice ('next5')
 * with the dot ~0.5 km ahead of the rendered start. Ridden shading + dot.
 */
function drawProfile(
  ctx: Ctx,
  widget: WidgetDef,
  template: Template,
  sample: TelemetrySample,
  x: number,
  y: number,
  w: number,
  h: number,
  units: Units,
  hist: OverlayHistory | undefined,
  mode: 'full' | 'next5' = 'full',
): void {
  const style = resolveStyle(template, widget);
  const text = widgetText(widget, sample, units);
  paintPanel(ctx, x, y, w, h, style.shape, style.background, style.backgroundOpacity);
  const series: [number, number][] = [];
  const useDist =
    hist !== undefined &&
    typeof hist.activity.samples[0]?.distance === 'number' &&
    typeof sample.distance === 'number';
  const nowX = useDist && typeof sample.distance === 'number' ? sample.distance : sample.t;
  const win =
    hist && mode === 'next5'
      ? nextProfileWindow(hist.activity.samples, sample.t, nowX, useDist)
      : null;
  if (hist) {
    const samples = hist.activity.samples;
    if (mode === 'full') {
      const stride = Math.max(1, Math.floor(samples.length / 800));
      for (let i = 0; i < samples.length; i += stride) {
        const s = samples[i];
        if (typeof s.elevation !== 'number') continue;
        const xk = useDist ? s.distance : s.t;
        if (typeof xk !== 'number') continue;
        series.push([xk, s.elevation]);
      }
      const last = samples[samples.length - 1];
      if (last && typeof last.elevation === 'number') {
        const xk = useDist ? last.distance : last.t;
        if (typeof xk === 'number' && (series.length === 0 || xk !== series[series.length - 1][0])) {
          series.push([xk, last.elevation]);
        }
      }
    } else if (win) {
      const cands: [number, number][] = [];
      for (const s of samples) {
        if (typeof s.elevation !== 'number') continue;
        const xk = useDist ? s.distance : s.t;
        if (typeof xk !== 'number') continue;
        if (xk < win.xMin || xk > win.xMax) continue;
        cands.push([xk, s.elevation]);
      }
      const stride = Math.max(1, Math.floor(cands.length / 800));
      for (let i = 0; i < cands.length; i += stride) series.push(cands[i]);
      const wl = cands[cands.length - 1];
      if (wl && (series.length === 0 || wl[0] !== series[series.length - 1][0])) {
        series.push(wl);
      }
    }
  }
  const line = text.unit ? `${text.value} ${text.unit}` : text.value;
  drawChartHeader(ctx, style, { label: text.label, line, showLabel: widget.showLabel !== false }, x, y, w, h);
  if (series.length < 2 || !hist) {
    drawMissing(ctx, style, x, y + h * 0.2, w, h * 0.8);
    return;
  }
  const xMax = win ? win.xMax : series[series.length - 1][0];
  const xMin = win ? win.xMin : series[0][0];
  let min = Infinity;
  let max = -Infinity;
  for (const [, v] of series) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max - min < 1e-9 || xMax - xMin < 1e-9) {
    drawMissing(ctx, style, x, y + h * 0.2, w, h * 0.8);
    return;
  }
  const cx0 = x + w * 0.04;
  const cx1 = x + w * 0.96;
  const cy0 = y + h * 0.3;
  const cy1 = y + h * 0.92;
  const X = (v: number): number => cx0 + ((v - xMin) / (xMax - xMin)) * (cx1 - cx0);
  const Y = (v: number): number => cy1 - ((v - min) / (max - min)) * (cy1 - cy0);
  ctx.save();
  // Ahead: faint full area. Ridden: accent area + dot.
  const trace = (upto: number): void => {
    ctx.beginPath();
    ctx.moveTo(X(series[0][0]), cy1);
    for (const [xk, v] of series) {
      if (xk > upto) break;
      ctx.lineTo(X(xk), Y(v));
    }
    ctx.lineTo(X(Math.min(upto, xMax)), cy1);
    ctx.closePath();
  };
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.14;
  trace(xMax);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = style.accent;
  ctx.globalAlpha = 0.45;
  trace(nowX);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(X(Math.min(Math.max(nowX, xMin), xMax)), Y(sample.elevation ?? min), 4, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Climb rate over the last 60 s, with trend arrow. */
function drawVam(
  ctx: Ctx,
  widget: WidgetDef,
  template: Template,
  sample: TelemetrySample,
  x: number,
  y: number,
  w: number,
  h: number,
  units: Units,
  hist: OverlayHistory | undefined,
): void {
  const style = resolveStyle(template, widget);
  paintPanel(ctx, x, y, w, h, style.shape, style.background, style.backgroundOpacity);
  const label = LABEL[widget.metric];
  if (widget.showLabel !== false) drawLabelTop(ctx, style, label, x, y, w, h);
  const e1 = hist ? sampleAt(hist.activity, hist.t).elevation : sample.elevation;
  const e0 = hist ? sampleAt(hist.activity, hist.t - 60).elevation : undefined;
  if (typeof e1 !== 'number' || typeof e0 !== 'number') {
    drawMissing(ctx, style, x, y, w, h);
    return;
  }
  const vam = ((e1 - e0) / 60) * 3600;
  const prev = hist ? sampleAt(hist.activity, hist.t - 120).elevation : undefined;
  const prevVam = typeof prev === 'number' ? ((e0 - prev) / 60) * 3600 : vam;
  const arrow = vam > prevVam + 20 ? '▲' : vam < prevVam - 20 ? '▼' : '■';
  const fmt = formatMetric('vam', vam, units);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = style.text;
  ctx.font = `700 ${h * 0.34 * style.valueScale}px ${style.valueFont}`;
  const vamLine = widget.showUnit === false ? fmt.value : `${fmt.value} ${fmt.unit}`;
  ctx.fillText(vamLine, x + w / 2, y + h * 0.52, w * 0.92);
  ctx.fillStyle = vam >= 0 ? style.accent : style.text;
  ctx.font = `600 ${Math.max(8, h * 0.12) * style.labelScale}px ${style.labelFont}`;
  ctx.fillText(`${arrow} 60 s`, x + w / 2, y + h * 0.8, w * 0.9);
  ctx.restore();
}

/** Stride-sampled GPS points plus the ride-final fix, shared by drawMap/drawNavMap. */
export function collectGpsPts(samples: TelemetrySample[]): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const stride = Math.max(1, Math.floor(samples.length / 1000));
  for (let i = 0; i < samples.length; i += stride) {
    const s = samples[i];
    if (typeof s.lat === 'number' && typeof s.lon === 'number') pts.push([s.lon, s.lat, s.t]);
  }
  const last = samples[samples.length - 1];
  if (last && typeof last.lat === 'number' && typeof last.lon === 'number') {
    const tail = pts[pts.length - 1];
    if (!tail || tail[2] !== last.t) pts.push([last.lon, last.lat, last.t]);
  }
  return pts;
}

export interface GpsProjection {
  /** Stride-sampled fixes [lon, lat, t]. */
  pts: [number, number, number][];
  x: (lon: number) => number;
  y: (lat: number) => number;
}

/**
 * Equirectangular fit of the GPS track into a box (origin boxX/boxY, padFrac
 * padding each side). Shared by the map widget and the sync minimap so paint
 * and click hit-testing project identically. Null when fewer than 2 fixes.
 */
export function projectGpsTrack(
  samples: TelemetrySample[],
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  padFrac = 0.1,
): GpsProjection | null {
  const pts = collectGpsPts(samples);
  if (pts.length < 2) return null;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of pts) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanLon = Math.max(1e-9, (maxLon - minLon) * kx);
  const spanLat = Math.max(1e-9, maxLat - minLat);
  const pad = Math.min(boxW, boxH) * padFrac;
  const scale = Math.min((boxW - pad * 2) / spanLon, (boxH - pad * 2) / spanLat);
  const midLon = (minLon + maxLon) / 2;
  const midLat = (minLat + maxLat) / 2;
  return {
    pts,
    x: (lon: number) => boxX + boxW / 2 + (lon - midLon) * kx * scale,
    y: (lat: number) => boxY + boxH / 2 - (lat - midLat) * scale,
  };
}

/** Activity time of the fix nearest to a projected pixel. */
export function nearestGpsT(proj: GpsProjection, px: number, py: number): number {
  let best = proj.pts[0][2];
  let bestD = Infinity;
  for (const [lon, lat, t] of proj.pts) {
    const dx = proj.x(lon) - px;
    const dy = proj.y(lat) - py;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/** GPS track: faint full route, accent ridden trail, you-are-here dot. */
function drawMap(
  ctx: Ctx,
  widget: WidgetDef,
  template: Template,
  sample: TelemetrySample,
  x: number,
  y: number,
  w: number,
  h: number,
  units: Units,
  hist: OverlayHistory | undefined,
): void {
  void units;
  const style = resolveStyle(template, widget);
  paintPanel(ctx, x, y, w, h, style.shape, style.background, style.backgroundOpacity);
  const proj = hist ? projectGpsTrack(hist.activity.samples, x, y, w, h) : null;
  if (!proj || !hist) {
    drawLabelTop(ctx, style, 'MAP', x, y, w, h);
    drawMissing(ctx, style, x, y + h * 0.15, w, h * 0.85);
    return;
  }
  const { pts, x: X, y: Y } = proj;
  const { track: trackW, ridden: riddenW } = mapStrokeWidths(widget.strokeWidth, w, h);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = trackW;
  ctx.beginPath();
  pts.forEach(([lon, lat], i) => {
    if (i === 0) ctx.moveTo(X(lon), Y(lat));
    else ctx.lineTo(X(lon), Y(lat));
  });
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = riddenW;
  ctx.beginPath();
  let started = false;
  let curX = X(pts[0][0]);
  let curY = Y(pts[0][1]);
  for (const [lon, lat, t] of pts) {
    if (t > hist.t) break;
    if (!started) {
      ctx.moveTo(X(lon), Y(lat));
      started = true;
    } else ctx.lineTo(X(lon), Y(lat));
    curX = X(lon);
    curY = Y(lat);
  }
  if (started) ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(X(pts[0][0]) - 3, Y(pts[0][1]) - 3, 6, 6);
  ctx.fillStyle = style.accent;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(curX, curY, 5, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Navigation map: 50 m behind + 400 m ahead, course-up, position arrow. */
function drawNavMap(
  ctx: Ctx,
  widget: WidgetDef,
  template: Template,
  sample: TelemetrySample,
  x: number,
  y: number,
  w: number,
  h: number,
  units: Units,
  hist: OverlayHistory | undefined,
): void {
  void units;
  const style = resolveStyle(template, widget);
  paintPanel(ctx, x, y, w, h, style.shape, style.background, style.backgroundOpacity);
  const pts: [number, number, number][] = hist ? collectGpsPts(hist.activity.samples) : [];
  const missing = (): void => {
    drawLabelTop(ctx, style, 'NAV', x, y, w, h);
    drawMissing(ctx, style, x, y + h * 0.15, w, h * 0.85);
  };
  if (pts.length < 2 || !hist) {
    missing();
    return;
  }
  // Course: GPS motion first, route direction as fallback.
  let course: number | undefined = courseFromMotion(hist.activity, hist.t);
  let i0 = 0;
  while (i0 + 1 < pts.length && pts[i0 + 1][2] <= hist.t) i0 += 1;
  if (course === undefined) {
    const here = pts[i0];
    const next = pts[i0 + 1];
    const prev = pts[i0 - 1];
    if (next && (next[0] !== here[0] || next[1] !== here[1])) {
      course = bearingDeg(here[1], here[0], next[1], next[0]);
    } else if (prev && (prev[0] !== here[0] || prev[1] !== here[1])) {
      course = bearingDeg(prev[1], prev[0], here[1], here[0]);
    }
  }
  if (course === undefined) {
    missing();
    return;
  }
  const heading: number = course;
  const origin = { lon: sample.lon ?? pts[i0][0], lat: sample.lat ?? pts[i0][1] };
  const { start, end } = navWindow(
    pts.map(([lon, lat, t]) => ({ lon, lat, t })),
    hist.t,
  );
  const pad = Math.min(w, h) * 0.08;
  const scale = (h - pad * 2) / 450;
  const dotX = x + w / 2;
  const dotY = y + h - pad - 50 * scale;
  const proj = (lon: number, lat: number): [number, number] => {
    const { fwd, right } = navProject(lon, lat, origin, heading);
    return [dotX + right * scale, dotY - fwd * scale];
  };
  const upcoming: [number, number][] = [proj(origin.lon, origin.lat)];
  const ridden: [number, number][] = [];
  for (let i = start; i <= end; i++) {
    const [lon, lat, t] = pts[i];
    const p = proj(lon, lat);
    if (t <= hist.t) ridden.push(p);
    if (t >= hist.t) upcoming.push(p);
  }
  ridden.push(proj(origin.lon, origin.lat));
  const { track: trackW, ridden: riddenW } = mapStrokeWidths(widget.strokeWidth, w, h);
  ctx.save();
  ctx.beginPath();
  const radius =
    style.shape === 'pill'
      ? Math.min(w, h) / 2
      : style.shape === 'none'
        ? 0
        : Math.min(10, h * 0.18);
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const trace = (line: [number, number][]): void => {
    ctx.beginPath();
    line.forEach(([px, py], i) => {
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  };
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = trackW;
  if (upcoming.length > 1) trace(upcoming);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = riddenW;
  if (ridden.length > 1) trace(ridden);
  // Position arrow, always pointing up.
  const s = Math.min(14, Math.max(7, Math.min(w, h) * 0.055));
  ctx.fillStyle = style.accent;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dotX, dotY - s);
  ctx.lineTo(dotX - s * 0.7, dotY + s * 0.6);
  ctx.lineTo(dotX + s * 0.7, dotY + s * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

const bearingDeg = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = Math.PI / 180;
  const dLon = (lon2 - lon1) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2 * toRad);
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
  return (Math.atan2(y, x) / toRad + 360) % 360;
};

/** Course from GPS motion over the last 3 s, shared by drawNavMap/drawCompass. */
function courseFromMotion(activity: Activity, t: number): number | undefined {
  const a = sampleAt(activity, t - 3);
  const b = sampleAt(activity, t);
  if (
    typeof a.lat === 'number' &&
    typeof a.lon === 'number' &&
    typeof b.lat === 'number' &&
    typeof b.lon === 'number' &&
    (a.lat !== b.lat || a.lon !== b.lon)
  ) {
    return bearingDeg(a.lat, a.lon, b.lat, b.lon);
  }
  return undefined;
}

/** Heading compass from GPS motion, dial rotated so course points up. */
function drawCompass(
  ctx: Ctx,
  widget: WidgetDef,
  template: Template,
  sample: TelemetrySample,
  x: number,
  y: number,
  w: number,
  h: number,
  units: Units,
  hist: OverlayHistory | undefined,
): void {
  void units;
  void sample;
  const style = resolveStyle(template, widget);
  paintPanel(ctx, x, y, w, h, style.shape, style.background, style.backgroundOpacity);
  let course: number | undefined;
  if (hist && hist.t > 3) {
    course = courseFromMotion(hist.activity, hist.t);
  }
  if (course === undefined) {
    drawLabelTop(ctx, style, 'HDG', x, y, w, h);
    drawMissing(ctx, style, x, y + h * 0.15, w, h * 0.85);
    return;
  }
  const cx = x + w / 2;
  const cy = y + h * 0.46;
  const r = Math.min(w, h * 0.72) / 2 - 8;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cards: [string, number][] = [
    ['N', 0],
    ['E', 90],
    ['S', 180],
    ['W', 270],
  ];
  for (const [glyph, deg] of cards) {
    const a = ((deg - course) * Math.PI) / 180 - Math.PI / 2;
    ctx.fillStyle = glyph === 'N' ? style.accent : style.text;
    ctx.font = `700 ${Math.max(8, h * 0.09) * style.labelScale}px ${style.labelFont}`;
    ctx.fillText(glyph, cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78);
  }
  ctx.fillStyle = style.accent;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.52);
  ctx.lineTo(cx - r * 0.1, cy + r * 0.2);
  ctx.lineTo(cx + r * 0.1, cy + r * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = style.text;
  ctx.font = `700 ${h * 0.14 * style.valueScale}px ${style.valueFont}`;
  ctx.fillText(`${String(Math.round(course)).padStart(3, '0')}°`, cx, y + h * 0.88, w * 0.6);
  ctx.restore();
}

/** Share route: faint full track with the accent trail drawing on over the anim window. */
function drawRouteDraw(
  ctx: Ctx,
  widget: WidgetDef,
  template: Template,
  x: number,
  y: number,
  w: number,
  h: number,
  hist: OverlayHistory | undefined,
  progress: number,
): void {
  const style = resolveStyle(template, widget);
  paintPanel(ctx, x, y, w, h, style.shape, style.background, style.backgroundOpacity);
  const pts: [number, number, number][] = hist ? collectGpsPts(hist.activity.samples) : [];
  if (pts.length < 2) return;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of pts) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanLon = Math.max(1e-9, (maxLon - minLon) * kx);
  const spanLat = Math.max(1e-9, maxLat - minLat);
  const pad = Math.min(w, h) * 0.1;
  const scale = Math.min((w - pad * 2) / spanLon, (h - pad * 2) / spanLat);
  const X = (lon: number): number => x + w / 2 + ((lon - (minLon + maxLon) / 2) * kx * scale);
  const Y = (lat: number): number => y + h / 2 - ((lat - (minLat + maxLat) / 2) * scale);
  const { track: trackW, ridden: riddenW } = mapStrokeWidths(widget.strokeWidth, w, h);
  const path = (upto: number): void => {
    ctx.beginPath();
    for (let i = 0; i < upto; i++) {
      if (i === 0) ctx.moveTo(X(pts[i][0]), Y(pts[i][1]));
      else ctx.lineTo(X(pts[i][0]), Y(pts[i][1]));
    }
  };
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = trackW;
  path(pts.length);
  ctx.stroke();
  const drawn = Math.floor(pts.length * Math.min(1, Math.max(0, progress)));
  if (drawn >= 2) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = riddenW;
    path(drawn);
    ctx.stroke();
    const [hx, hy] = pts[drawn - 1];
    ctx.fillStyle = style.accent;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(X(hx), Y(hy), riddenW, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Paints every visible widget of the template over the current frame. */
export function drawOverlay(
  ctx: Ctx,
  template: Template,
  sample: TelemetrySample,
  frameW: number,
  frameH: number,
  units: Units,
  hist?: OverlayHistory,
  share?: ShareAnim,
): void {
  for (const widget of template.widgets) {
    if (!widget.visible) continue;
    const box = resolveLayout(widget.layout, frameW, frameH);
    const x = box.x;
    const y = box.y;
    const w = box.w;
    const h = box.h;
    if (w < 24 || h < 16) continue;
    switch (widget.kind) {
      case 'gauge':
        drawGauge(ctx, widget, template, sample, x, y, w, h, units);
        break;
      case 'number':
        drawNumber(ctx, widget, template, sample, x, y, w, h, units);
        break;
      case 'speedo':
        drawSpeedo(ctx, widget, template, sample, x, y, w, h, units);
        break;
      case 'ring':
        drawRing(ctx, widget, template, sample, x, y, w, h, units);
        break;
      case 'slope':
        drawSlope(ctx, widget, template, sample, x, y, w, h, units);
        break;
      case 'gears':
        drawGears(ctx, widget, template, sample, x, y, w, h, units);
        break;
      case 'spark':
        drawSpark(ctx, widget, template, sample, x, y, w, h, units, hist);
        break;
      case 'profile':
        drawProfile(ctx, widget, template, sample, x, y, w, h, units, hist);
        break;
      case 'profilenext':
        drawProfile(ctx, widget, template, sample, x, y, w, h, units, hist, 'next5');
        break;
      case 'vam':
        drawVam(ctx, widget, template, sample, x, y, w, h, units, hist);
        break;
      case 'map':
        drawMap(ctx, widget, template, sample, x, y, w, h, units, hist);
        break;
      case 'navmap':
        drawNavMap(ctx, widget, template, sample, x, y, w, h, units, hist);
        break;
      case 'compass':
        drawCompass(ctx, widget, template, sample, x, y, w, h, units, hist);
        break;
      case 'routedraw':
        if (share) drawRouteDraw(ctx, widget, template, x, y, w, h, hist, share.progress);
        break;
      default:
        drawStat(ctx, widget, template, sample, x, y, w, h, units);
        break;
    }
  }
}
