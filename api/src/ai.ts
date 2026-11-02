import { parseTemplateJson, type AspectClass, type Template } from '@velohud/shared';

export const AI_DEFAULT_MODEL = 'muse-spark-1.3-contributor';

/** The 9 overlay fonts, shared by labelFont and valueFont. */
const FONT_ENUM = [
  'Inter, sans-serif',
  'Barlow Condensed, sans-serif',
  'Oswald, sans-serif',
  'Rajdhani, sans-serif',
  'Orbitron, sans-serif',
  '"Baloo 2", sans-serif',
  'Bungee Outline, sans-serif',
  'Bungee, sans-serif',
  'ui-monospace, monospace',
];

/** Template v3 as a JSON Schema for constrained decoding (text.format). */
export const TEMPLATE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'number', enum: [3] },
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    theme: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        accent: { type: 'string' },
        panel: { type: 'string' },
        panelOpacity: { type: 'number' },
      },
      required: ['text', 'accent', 'panel', 'panelOpacity'],
      additionalProperties: false,
    },
    widgets: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          metric: {
            type: 'string',
            enum: [
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
            ],
          },
          kind: {
            type: 'string',
            enum: [
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
            ],
          },
          visible: { type: 'boolean' },
          showUnit: { type: 'boolean' },
          showLabel: { type: 'boolean' },
          gearsMode: { type: 'string', enum: ['teeth', 'index'] },
          gearsSide: { type: 'string', enum: ['both', 'front', 'rear'] },
          range: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
          strokeWidth: { type: 'number' },
          timeFormat: { type: 'string', enum: ['auto', 'hmm', 'hmmss', 'h', 'hm'] },
          style: {
            type: 'object',
            properties: {
              shape: { type: 'string', enum: ['rect', 'pill', 'none'] },
              background: { type: 'string' },
              backgroundOpacity: { type: 'number' },
              accent: { type: 'string' },
              text: { type: 'string' },
              labelFont: {
                type: 'string',
                enum: FONT_ENUM,
              },
              labelScale: { type: 'number' },
              valueFont: {
                type: 'string',
                enum: FONT_ENUM,
              },
              valueScale: { type: 'number' },
              align: { type: 'string', enum: ['left', 'center', 'right'] },
            },
            additionalProperties: false,
          },
          layout: {
            type: 'object',
            properties: {
              ax: { type: 'string', enum: ['left', 'center', 'right'] },
              ay: { type: 'string', enum: ['top', 'center', 'bottom'] },
              px: { type: 'number' },
              py: { type: 'number' },
              w: { anyOf: [{ type: 'number' }, { type: 'string', enum: ['stretch'] }] },
              h: { anyOf: [{ type: 'number' }, { type: 'string', enum: ['stretch'] }] },
            },
            required: ['ax', 'ay', 'px', 'py', 'w', 'h'],
            additionalProperties: false,
          },
        },
        required: ['id', 'metric', 'kind', 'visible', 'layout'],
        additionalProperties: false,
      },
    },
  },
  required: ['schemaVersion', 'id', 'name', 'theme', 'widgets'],
  additionalProperties: false,
};

/** Auto mode: same shape, colors restricted to black/white (no hallucinated hues). */
export const AUTO_JSON_SCHEMA = (() => {
  const s = JSON.parse(JSON.stringify(TEMPLATE_JSON_SCHEMA)) as typeof TEMPLATE_JSON_SCHEMA;
  const bw = { type: 'string', enum: ['#ffffff', '#000000'] };
  s.properties.theme.properties.text = bw;
  s.properties.theme.properties.accent = bw;
  s.properties.theme.properties.panel = bw;
  const style = s.properties.widgets.items.properties.style.properties;
  style.accent = bw;
  style.text = bw;
  style.background = bw;
  return s;
})();

/**
 * Auto mode pool: mainstream widgets only. Everything else (gears, vam,
 * profilenext, map, ring) stays exclusive to prompt mode even when data exists.
 */
export const AUTO_WIDGET_POOL: readonly string[] = [
  'stat',
  'number',
  'gauge',
  'speedo',
  'slope',
  'spark',
  'profile',
  'navmap',
  'compass',
];

/** Kinds that need a GPS track (lat/lon series). */
const GPS_GATED_KINDS: readonly string[] = ['map', 'navmap', 'compass'];
/** Kinds that need an elevation series. */
const ELEVATION_GATED_KINDS: readonly string[] = ['profile', 'profilenext', 'vam'];

/** Client data-availability hint: metric ids with data, plus GPS presence. */
export interface AiAvailability {
  metrics: string[];
  hasGps: boolean;
}

/**
 * Per-request constrained schema: base pool (auto = mainstream only) minus
 * kinds whose data is missing, metrics narrowed to the available ids.
 * Null availability fails open to the base schema (no activity / old client).
 */
export function requestSchema(auto: boolean, avail: AiAvailability | null): Record<string, unknown> {
  const base = auto ? AUTO_JSON_SCHEMA : TEMPLATE_JSON_SCHEMA;
  if (!avail) return base;
  const s = JSON.parse(JSON.stringify(base)) as typeof TEMPLATE_JSON_SCHEMA;
  const items = s.properties.widgets.items.properties;
  const has = (m: string): boolean => avail.metrics.includes(m);
  const pool = (auto ? AUTO_WIDGET_POOL : items.kind.enum).filter(
    (k) =>
      !(GPS_GATED_KINDS.includes(k) && !avail.hasGps) &&
      !(ELEVATION_GATED_KINDS.includes(k) && !has('elevation')) &&
      !(k === 'slope' && !has('grade')) &&
      !(k === 'gears' && !has('gears')),
  );
  // Degenerate input cannot empty the enum: stat/number over the always-present clock.
  const kinds = pool.length > 0 ? pool : ['stat', 'number'];
  items.kind.enum = kinds;
  const gpsLeft = kinds.some((k) => GPS_GATED_KINDS.includes(k));
  // vam/gears metrics render only through their own kinds; 'none' only via map kinds.
  const metrics = items.metric.enum.filter(
    (m) =>
      m === 'elapsedTime' ||
      m === 'none' ||
      (has(m) && !(m === 'vam' && !kinds.includes('vam')) && !(m === 'gears' && !kinds.includes('gears'))),
  );
  items.metric.enum = gpsLeft ? metrics : metrics.filter((m) => m !== 'none');
  return s;
}

/** Human metric names for the availability prompt line. */
const METRIC_WORDS: Record<string, string> = {
  speed: 'speed',
  pace: 'pace (min/km)',
  heartRate: 'heart rate',
  power: 'power',
  cadence: 'cadence',
  elevation: 'elevation',
  distance: 'distance',
  elapsedTime: 'elapsed time',
  grade: 'grade',
  vam: 'VAM',
  gears: 'gears',
};

/**
 * Availability constraint for create prompts. Empty when unknown (fail open).
 * Names the data the model may use; anything else renders an empty widget.
 */
export function availabilityLine(avail: AiAvailability | null): string {
  if (!avail) return '';
  const ids = avail.metrics.filter((m) => m in METRIC_WORDS);
  if (!ids.includes('elapsedTime')) ids.push('elapsedTime');
  const words = ids.map((m) => METRIC_WORDS[m]);
  if (avail.hasGps) words.push('GPS track');
  return `- Available rider data: ${words.join(', ')}. EVERY widget metric MUST be one of: ${ids.join(', ')}. Any other metric renders an EMPTY widget — never emit one.${avail.hasGps ? '' : ' No GPS track: map/compass widgets are unavailable.'}`;
}

/** Shared design guidance once the task head is set. English-only: better results. */
function designGuidance(aspect: AspectClass): string {
  const target =
    aspect === 'horizontal'
      ? 'HORIZONTAL (1280x720)'
      : aspect === 'square'
        ? 'SQUARE (720x720)'
        : 'VERTICAL (720x1280)';
  return `- 1-8 widgets. Prefer sensible metric+kind pairs (speed to gauge/speedo/number/stat, heartRate to stat/gauge, elevation+distance to profile, gears to gears, lat/lon to map). Map kinds (map/navmap/compass) need a GPS track; profile/profilenext/vam need elevation; slope needs grade; gears needs electronic-shifting data.
- pace is min/km for running: use only when the user explicitly asks for pace.
- Internal layout is fixed: label top, graphics middle, value placed per kind. You CANNOT move text inside a widget; move/resize the widget box instead.
- All layout numbers are vmin % (percent of the frame's smaller side). Same numbers = same pixels on any aspect.
- ax/ay pin to the nearest edge (or center); px/py = padding from that edge (signed offset when centered). w/h = size in vmin %. Gauges need squarish boxes (w~h); numbers need wide boxes.
- Target: ${target} — design for it first. Boxes must still fit 1280x720, 720x720 and 720x1280 WITHOUT overlapping each other. Spread across edges/corners; dense vertical stacks collide on horizontal.
- Fonts (copy verbatim): Inter, sans-serif | Barlow Condensed, sans-serif | Oswald, sans-serif | Rajdhani, sans-serif | Orbitron, sans-serif | "Baloo 2", sans-serif | Bungee Outline, sans-serif | Bungee, sans-serif | ui-monospace, monospace. Absent = Inter. Bolder = Bungee; curvier = Baloo 2; hollow = Bungee Outline; futuristic = Orbitron.
- Panels: always set shape 'none' (transparent, floating text) unless the user explicitly asks for boxed panels ('rect'/'pill').`;
}

/** System prompt for creating a template. */
export function buildSystemPrompt(
  aspect: AspectClass = 'vertical',
  avail: AiAvailability | null = null,
): string {
  const line = availabilityLine(avail);
  return `You design velohud overlay templates. Respond with a single template object matching the provided JSON schema.

- "name": short display name in ENGLISH.
${designGuidance(aspect)}${line ? `\n${line}` : ''}`;
}

/** System prompt for automatic templates from a video frame. */
export function buildAutoSystemPrompt(
  aspect: AspectClass = 'vertical',
  avail: AiAvailability | null = null,
): string {
  const line = availabilityLine(avail);
  return `You design velohud overlay templates from the attached video frame. Respond with a single template object matching the provided JSON schema.

- "name": short GENERIC display name in ENGLISH, style-based (e.g. "The Sprint", "Night Pulse", "Apex Dash"). NEVER describe the video content (no "Road Group Ride").
- Read the frame: white text/graphics on dark footage, black on bright footage. Every color must contrast with what is behind it.
${designGuidance(aspect)}${line ? `\n${line}` : ''}`;
}

/** System prompt for adjusting a template. */
export function buildAdjustSystemPrompt(aspect: AspectClass = 'vertical'): string {
  return `You modify velohud overlay templates. You receive the current template plus an instruction. Respond with the FULL updated template object matching the provided JSON schema. Preserve everything the instruction does not change; keep the same "name" unless asked to rename.
Edit surgically: change ONLY the widgets the instruction names, and ONLY what it asks about them. Copy every other widget byte-for-byte identical — same layout numbers, same style. Never reflow, realign or restyle the rest.

${designGuidance(aspect)}`;
}

/** Pull the first {...} JSON block out of model text (fenced or bare). */
export function extractJson(raw: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/** Model output text across response shapes (Responses API, chat-style, bare). */
export function extractOutputText(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (typeof data !== 'object' || data === null) return null;
  const rec = data as Record<string, unknown>;
  if (typeof rec.output_text === 'string') return rec.output_text;
  if (Array.isArray(rec.output)) {
    const parts: string[] = [];
    for (const item of rec.output) {
      const content = (item as { content?: unknown } | null)?.content;
      const chunks = Array.isArray(content) ? content : [content];
      for (const c of chunks) {
        const text = (c as { text?: unknown } | null)?.text;
        if (typeof text === 'string') parts.push(text);
      }
    }
    if (parts.length > 0) return parts.join('');
  }
  const choices = rec.choices;
  if (Array.isArray(choices)) {
    const text = (choices[0] as { message?: { content?: unknown } } | null)?.message?.content;
    if (typeof text === 'string') return text;
  }
  return null;
}

/** Validate AI output into a Template; throws like parseTemplateJson. */
export function parseAiTemplate(raw: string): Template {
  const json = extractJson(raw);
  if (!json) throw new Error('not a template');
  return parseTemplateJson(json);
}

export interface AiGenerateOpts {
  endpoint: string;
  key: string;
  model: string;
  system: string;
  prompt: string;
  timeoutMs?: number;
  /** Lower = more literal. Adjust calls pass 0.2; creates use the API default. */
  temperature?: number;
  /** JPEG data URL attached as input_image. Absent = text-only call. */
  image?: string;
  /** Constrained-decoding schema. Defaults to the full template schema. */
  schema?: Record<string, unknown>;
}

/** One model call; returns the raw text output. Throws on transport failure. */
export async function generateTemplateJson(opts: AiGenerateOpts): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 120000);
  try {
    const userMessage =
      opts.image === undefined
        ? { role: 'user', content: opts.prompt }
        : {
            type: 'message',
            role: 'user',
            content: [
              { type: 'input_text', text: opts.prompt },
              { type: 'input_image', image_url: opts.image },
            ],
          };
    const res = await fetch(opts.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.key}` },
      body: JSON.stringify({
        model: opts.model,
        input: [{ role: 'system', content: opts.system }, userMessage],
        text: {
          format: {
            type: 'json_schema',
            name: 'Template',
            schema: opts.schema ?? TEMPLATE_JSON_SCHEMA,
          },
        },
        ...(opts.temperature === undefined ? {} : { temperature: opts.temperature }),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`ai status ${res.status}`);
    const text = extractOutputText((await res.json()) as unknown);
    if (!text) throw new Error('ai empty');
    return text;
  } finally {
    clearTimeout(timer);
  }
}
