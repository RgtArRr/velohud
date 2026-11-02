import { Decoder, Stream } from '@garmin/fitsdk';
import { t } from './i18n.js';
import { EARTH_RADIUS_M } from './geo.js';
import type { RecordMesg } from '@garmin/fitsdk';
import type { MetricId } from '@velohud/shared';

/** One normalized telemetry point. `t` is seconds since activity start. */
export interface TelemetrySample {
  t: number;
  speed?: number;
  heartRate?: number;
  power?: number;
  cadence?: number;
  elevation?: number;
  distance?: number;
  grade?: number;
  lat?: number;
  lon?: number;
  /** Gear teeth, forward-filled from shift events. Never interpolated. */
  frontGear?: number;
  rearGear?: number;
  /** Cog indexes (1 = innermost), same fill rules as teeth. */
  frontGearNum?: number;
  rearGearNum?: number;
}

export interface Activity {
  startTime: Date;
  durationSec: number;
  samples: TelemetrySample[];
}

export interface ActivitySummary {
  samples: number;
  durationSec: number;
  distanceM: number;
  avgSpeed: number | null;
  avgHeartRate: number | null;
  avgPower: number | null;
}

const SEMI_TO_DEG = 180 / 2 ** 31;

/** 'YYYY-MM-DDTHH:mm:ss' wall reading -> UTC ms of the same face values; null when malformed. */
const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
function parseWall(wall: string): number | null {
  const m = WALL_RE.exec(wall);
  if (!m) return null;
  return Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? '0'),
  );
}

/**
 * Zoned date-time parts of an instant ('24' midnight normalized to '00').
 * Throws on an unknown zone, like the Intl block it replaces.
 */
function zonedParts(ms: number, timeZone: string): Record<string, string> {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  if (parts['hour'] === '24') parts['hour'] = '00';
  return parts;
}

/**
 * Interprets a wall reading ('YYYY-MM-DDTHH:mm:ss') in an IANA zone as a UTC
 * instant, via one format round-trip (DST-safe: the offset is read at that
 * instant). Null on bad input or unknown zone.
 */
export function zonedTimeToUtc(wall: string, timeZone: string): Date | null {
  const asUtc = parseWall(wall);
  if (asUtc === null) return null;
  try {
    const parts = zonedParts(asUtc, timeZone);
    const back = Date.UTC(
      Number(parts['year']),
      Number(parts['month']) - 1,
      Number(parts['day']),
      Number(parts['hour']),
      Number(parts['minute']),
      Number(parts['second']),
    );
    return new Date(asUtc - (back - asUtc));
  } catch {
    return null;
  }
}

/**
 * One generic track point from any XML source (GPX trkpt, TCX Trackpoint).
 * Times are ms epoch; every metric optional, like TelemetrySample.
 */
export interface TrackPoint {
  time: number;
  lat?: number;
  lon?: number;
  ele?: number;
  dist?: number;
  hr?: number;
  cad?: number;
  watts?: number;
  speed?: number;
}

const haversineM = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const r = (d: number): number => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
};

/**
 * Shared XML -> Activity converter: GPX and TCX differ only in tag names, so
 * both extract to TrackPoint[] and meet here. Native distance wins when every
 * point carries it (TCX); otherwise it accumulates by haversine (GPX). Speed
 * derives from distance/time when absent. Non-monotonic times are dropped:
 * sampleAt binary-searches on ascending t.
 */
export function activityFromTrackPoints(points: TrackPoint[]): Activity {
  if (points.length === 0) throw new Error(t('err.trackInvalid'));
  const ordered = points.filter((p, i) => i === 0 || p.time >= points[i - 1].time);
  if (ordered.length === 0) throw new Error(t('err.trackInvalid'));
  const t0 = ordered[0].time;
  const nativeDist = ordered.every((p) => typeof p.dist === 'number');
  let odo = 0;
  let prevT = 0;
  let prevD = 0;
  const derived: boolean[] = [];
  const samples: TelemetrySample[] = ordered.map((p, i) => {
    const time = (p.time - t0) / 1000;
    let dist: number | undefined;
    if (nativeDist) {
      dist = p.dist;
    } else if (i === 0) {
      dist = 0;
    } else {
      const q = ordered[i - 1];
      if (
        p.lat !== undefined &&
        p.lon !== undefined &&
        q.lat !== undefined &&
        q.lon !== undefined
      ) {
        odo += haversineM(q.lat, q.lon, p.lat, p.lon);
      }
      dist = p.lat === undefined ? undefined : odo;
    }
    let speed = p.speed;
    if (speed === undefined && i > 0 && dist !== undefined) {
      const dt = time - prevT;
      speed = dt > 0 ? Math.max(0, (dist - prevD) / dt) : undefined;
    }
    derived.push(p.speed === undefined && speed !== undefined);
    prevT = time;
    if (dist !== undefined) prevD = dist;
    const s: TelemetrySample = { t: time };
    if (dist !== undefined) s.distance = dist;
    if (speed !== undefined) s.speed = speed;
    if (p.hr !== undefined) s.heartRate = p.hr;
    if (p.cad !== undefined) s.cadence = p.cad;
    if (p.watts !== undefined) s.power = p.watts;
    if (p.ele !== undefined) s.elevation = p.ele;
    if (p.lat !== undefined) s.lat = p.lat;
    if (p.lon !== undefined) s.lon = p.lon;
    return s;
  });
  // Derived speeds inherit GPS jitter: light 3-point smoothing, natives untouched.
  for (let i = 0; i < samples.length; i++) {
    if (!derived[i]) continue;
    const vals = [samples[i - 1]?.speed, samples[i].speed, samples[i + 1]?.speed].filter(
      (v): v is number => typeof v === 'number',
    );
    if (vals.length > 0) samples[i].speed = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  if (samples.length > 1 && samples[0].speed === undefined && samples[1].speed !== undefined) {
    samples[0].speed = samples[1].speed;
  }
  return buildActivity(new Date(t0), samples);
}

/** Direct child text by local tag name (namespace-agnostic). */
const childText = (parent: Element, name: string): string | null => {
  const lower = name.toLowerCase();
  for (const child of Array.from(parent.children)) {
    if (child.localName.toLowerCase() === lower) return child.textContent?.trim() ?? null;
  }
  return null;
};

/** First descendant text by local tag name, any namespace (extensions). */
const descText = (parent: Element, name: string): string | null => {
  const found = parent.getElementsByTagNameNS('*', name)[0];
  return found?.textContent?.trim() ?? null;
};

const num = (value: string | null): number | undefined => {
  if (value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const set = <K extends 'lat' | 'lon' | 'ele' | 'dist' | 'hr' | 'cad' | 'watts' | 'speed'>(
  p: TrackPoint,
  key: K,
  value: number | undefined,
): void => {
  if (value !== undefined) p[key] = value;
};

type TrackField = 'lat' | 'lon' | 'ele' | 'dist' | 'hr' | 'cad' | 'watts' | 'speed';
type TagText = (el: Element, tag: string) => string | null;
/** One tag->field extraction row: read tag text via get, coerce, store (map adjusts). */
interface TagRow {
  key: TrackField;
  tag: string;
  get: TagText;
  map?: (n: number) => number;
}
const applyTagRows = (p: TrackPoint, el: Element, rows: readonly TagRow[]): void => {
  for (const row of rows) {
    const v = num(row.get(el, row.tag));
    set(p, row.key, v === undefined || row.map === undefined ? v : row.map(v));
  }
};

/** Attribute text as a TagText (GPX lat/lon live on the trkpt itself). */
const attrText = (el: Element, tag: string): string | null => el.getAttribute(tag);

/** Nested '<tag><Value>' text (TCX HeartRateBpm). */
const nestedValue = (el: Element, tag: string): string | null => {
  const inner = Array.from(el.children).find((c) => c.localName === tag);
  return inner ? childText(inner, 'Value') : null;
};

const GPX_ROWS: readonly TagRow[] = [
  { key: 'lat', tag: 'lat', get: attrText },
  { key: 'lon', tag: 'lon', get: attrText },
  { key: 'ele', tag: 'ele', get: childText },
  { key: 'hr', tag: 'hr', get: descText },
  { key: 'cad', tag: 'cad', get: descText },
  { key: 'watts', tag: 'power', get: descText },
  { key: 'speed', tag: 'speed', get: descText },
];

/** TCX rows; running cadence counts both feet, so rpm halves it (map). */
const tcxRows = (halveCadence: boolean): readonly TagRow[] => [
  { key: 'lat', tag: 'LatitudeDegrees', get: descText },
  { key: 'lon', tag: 'LongitudeDegrees', get: descText },
  { key: 'ele', tag: 'AltitudeMeters', get: childText },
  { key: 'dist', tag: 'DistanceMeters', get: childText },
  { key: 'hr', tag: 'HeartRateBpm', get: nestedValue },
  { key: 'cad', tag: 'Cadence', get: childText, map: halveCadence ? (n) => n / 2 : undefined },
  { key: 'watts', tag: 'Watts', get: descText },
];

function extractGpx(doc: Document): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (const el of Array.from(doc.getElementsByTagName('trkpt'))) {
    const time = Date.parse(childText(el, 'time') ?? '');
    if (!Number.isFinite(time)) continue;
    const p: TrackPoint = { time };
    applyTagRows(p, el, GPX_ROWS);
    points.push(p);
  }
  return points;
}

function extractTcx(doc: Document, halveCadence: boolean): TrackPoint[] {
  const points: TrackPoint[] = [];
  const rows = tcxRows(halveCadence);
  for (const el of Array.from(doc.getElementsByTagName('Trackpoint'))) {
    const time = Date.parse(childText(el, 'Time') ?? '');
    if (!Number.isFinite(time)) continue;
    const p: TrackPoint = { time };
    applyTagRows(p, el, rows);
    points.push(p);
  }
  return points;
}

/**
 * GPX/TCX entry: detects the root, extracts to TrackPoint[] (the only
 * format-specific code), and shares activityFromTrackPoints + buildActivity
 * with every other source. Throws err.trackInvalid on anything else.
 */
export function parseActivityXml(text: string): Activity {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error(t('err.trackInvalid'));
  }
  const root = doc.documentElement?.localName;
  let points: TrackPoint[] | null = null;
  if (root === 'gpx') {
    points = extractGpx(doc);
  } else if (root === 'TrainingCenterDatabase') {
    // TCX running cadence counts both feet; cycling-style rpm halves it.
    const sport = doc.getElementsByTagName('Activity')[0]?.getAttribute('Sport');
    points = extractTcx(doc, sport === 'Running');
  }
  if (!points || points.length === 0) throw new Error(t('err.trackInvalid'));
  return activityFromTrackPoints(points);
}

/** Provider streams as our API serves them: stream type -> data. */
export type StreamSet = Record<string, unknown>;

/**
 * Builds an Activity from intervals.icu streams. No native grade stream:
 * elevation+distance derive it like parseFit. velocity_smooth is m/s
 * (metric API; verify against a real ride if speed reads off).
 */
/**
 * Activity start instant: IANA zone first, then native parse for offset/UTC
 * forms, else the naive wall as UTC (deterministic across devices: a
 * browser-tz guess would shift the same activity per device). Null when
 * nothing parses.
 */
export function parseActivityStart(wall: string, timeZone: string | null): Date | null {
  if (timeZone) {
    const zoned = zonedTimeToUtc(wall, timeZone);
    if (zoned) return zoned;
  }
  const native = new Date(/([zZ]|[+-]\d{2}:?\d{2})$/.test(wall) ? wall : `${wall}Z`);
  return Number.isNaN(native.getTime()) ? null : native;
}

/**
 * Shared tail of every source (FIT, intervals, GPX/TCX): derived grade plus
 * duration from the last sample. Callers guarantee at least one sample.
 */
export function buildActivity(startTime: Date, samples: TelemetrySample[]): Activity {
  fillDerivedGrade(samples);
  return {
    startTime,
    durationSec: samples.length > 0 ? samples[samples.length - 1].t : 0,
    samples,
  };
}

export function activityFromIntervalsStreams(
  streams: StreamSet,
  startDateLocal: string,
  timezone: string | null,
): Activity {
  const numArr = (v: unknown): number[] | undefined =>
    Array.isArray(v) && v.every((x) => typeof x === 'number')
      ? (v as number[])
      : undefined;
  const time = numArr(streams['time']) ?? [];
  if (time.length === 0) throw new Error(t('err.intervalsEmpty'));
  const start = parseActivityStart(startDateLocal, timezone);
  if (!start) throw new Error(t('err.intervalsDate'));
  const distance = numArr(streams['distance']);
  const altitude = numArr(streams['altitude']);
  const speed = numArr(streams['velocity_smooth']);
  const heartRate = numArr(streams['heartrate']);
  const cadence = numArr(streams['cadence']);
  const power = numArr(streams['watts']);
  const rawPairs = streams['latlng'];
  const pairs: [number, number][] | undefined =
    Array.isArray(rawPairs) &&
    rawPairs.every(
      (p): p is [number, number] =>
        Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number',
    )
      ? (rawPairs as [number, number][])
      : undefined;
  const at = (arr: number[] | undefined, i: number): number | undefined =>
    arr && i < arr.length ? arr[i] : undefined;
  const samples: TelemetrySample[] = time.map((tt, i) => {
    const s: TelemetrySample = { t: tt };
    const vSpeed = at(speed, i);
    if (vSpeed !== undefined) s.speed = vSpeed;
    const vHr = at(heartRate, i);
    if (vHr !== undefined) s.heartRate = vHr;
    const vPower = at(power, i);
    if (vPower !== undefined) s.power = vPower;
    const vCad = at(cadence, i);
    if (vCad !== undefined) s.cadence = vCad;
    const vEle = at(altitude, i);
    if (vEle !== undefined) s.elevation = vEle;
    const vDist = at(distance, i);
    if (vDist !== undefined) s.distance = vDist;
    const pair = pairs && i < pairs.length ? pairs[i] : undefined;
    if (pair) {
      s.lat = pair[0];
      s.lon = pair[1];
    }
    return s;
  });
  return buildActivity(start, samples);
}

function pickRecords(messages: Record<string, unknown>): RecordMesg[] {
  for (const key of ['recordMesgs', 'record']) {
    const value = messages[key];
    if (Array.isArray(value)) return value as RecordMesg[];
  }
  return [];
}

export function parseFit(buffer: ArrayBuffer): Activity {
  const decoder = new Decoder(Stream.fromArrayBuffer(buffer));
  if (!decoder.isFIT()) throw new Error(t('err.fitInvalid'));
  const { messages, errors } = decoder.read();
  if (errors.length > 0) {
    throw new Error(t('err.fitDecode', { n: errors.length }));
  }
  const records = pickRecords(messages as Record<string, unknown>).filter(
    (r) => r.timestamp instanceof Date,
  );
  if (records.length === 0) throw new Error(t('err.fitNoRecords'));

  const t0 = (records[0].timestamp as Date).getTime();
  // Shift events are sparse: carry the last known combo forward like the bike does.
  let lastFront: number | undefined;
  let lastRear: number | undefined;
  const samples: TelemetrySample[] = records.map((r) => {
    const s: TelemetrySample = { t: ((r.timestamp as Date).getTime() - t0) / 1000 };
    // Newer Edge firmware logs only the high-res enhanced* variants (same units).
    if (typeof r.speed === 'number') s.speed = r.speed;
    else if (typeof r.enhancedSpeed === 'number') s.speed = r.enhancedSpeed;
    if (typeof r.heartRate === 'number') s.heartRate = r.heartRate;
    if (typeof r.power === 'number') s.power = r.power;
    if (typeof r.cadence === 'number') s.cadence = r.cadence;
    if (typeof r.altitude === 'number') s.elevation = r.altitude;
    else if (typeof r.enhancedAltitude === 'number') s.elevation = r.enhancedAltitude;
    if (typeof r.distance === 'number') s.distance = r.distance;
    if (typeof r.grade === 'number') s.grade = r.grade;
    if (typeof r.positionLat === 'number') s.lat = r.positionLat * SEMI_TO_DEG;
    if (typeof r.positionLong === 'number') s.lon = r.positionLong * SEMI_TO_DEG;
    const gears = r as unknown as { frontGear?: unknown; rearGear?: unknown };
    if (typeof gears.frontGear === 'number') lastFront = gears.frontGear;
    if (typeof gears.rearGear === 'number') lastRear = gears.rearGear;
    if (lastFront !== undefined) s.frontGear = lastFront;
    if (lastRear !== undefined) s.rearGear = lastRear;
    return s;
  });

  // Edge + AXS/Di2 log shifts as event markers carrying teeth, not record
  // fields. Merge them by timestamp; events win over record fields on overlap.
  const shifts = (
    ((messages as Record<string, unknown>).eventMesgs as
      | {
          timestamp?: unknown;
          event?: unknown;
          frontGear?: unknown;
          rearGear?: unknown;
          frontGearNum?: unknown;
          rearGearNum?: unknown;
        }[]
      | undefined) ?? []
  )
    .filter(
      (e) =>
        e.timestamp instanceof Date && (e.event === 'rearGearChange' || e.event === 'frontGearChange'),
    )
    .sort((a, b) => (a.timestamp as Date).getTime() - (b.timestamp as Date).getTime());
  let si = 0;
  let evFront: number | undefined;
  let evRear: number | undefined;
  let evFrontNum: number | undefined;
  let evRearNum: number | undefined;
  for (const s of samples) {
    const tMs = t0 + s.t * 1000;
    while (si < shifts.length && (shifts[si].timestamp as Date).getTime() <= tMs) {
      const e = shifts[si++];
      if (typeof e.frontGear === 'number') evFront = e.frontGear;
      if (typeof e.rearGear === 'number') evRear = e.rearGear;
      if (typeof e.frontGearNum === 'number') evFrontNum = e.frontGearNum;
      if (typeof e.rearGearNum === 'number') evRearNum = e.rearGearNum;
    }
    if (evFront !== undefined) s.frontGear = evFront;
    if (evRear !== undefined) s.rearGear = evRear;
    if (evFrontNum !== undefined) s.frontGearNum = evFrontNum;
    if (evRearNum !== undefined) s.rearGearNum = evRearNum;
  }

  return buildActivity(records[0].timestamp as Date, samples);
}

/**
 * Grade fallback: many files record elevation + distance but no slope. When NO
 * sample carries native grade, derive it as Δelevation/Δdistance over a
 * ±10-sample window (0 when stopped). Native grade always wins; mixing both
 * sources would read inconsistently.
 */
export function fillDerivedGrade(samples: TelemetrySample[]): void {
  if (samples.some((s) => typeof s.grade === 'number')) return;
  const K = 10;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(0, i - K)];
    const b = samples[Math.min(samples.length - 1, i + K)];
    if (
      a.elevation === undefined ||
      a.distance === undefined ||
      b.elevation === undefined ||
      b.distance === undefined
    ) {
      continue;
    }
    const run = b.distance - a.distance;
    samples[i].grade = run >= 10 ? ((b.elevation - a.elevation) / run) * 100 : 0;
  }
}

const NUMERIC_KEYS = [
  'speed',
  'heartRate',
  'power',
  'cadence',
  'elevation',
  'distance',
  'grade',
  'lat',
  'lon',
] as const;

/** Discrete fields: step-held from the left sample, never interpolated. */
const STEP_KEYS = ['frontGear', 'rearGear', 'frontGearNum', 'rearGearNum'] as const;

/**
 * First index with t >= target over ascending-t samples (classic lower bound;
 * samples.length when every sample precedes it, 0 when empty or t leads all).
 */
export function lowerBound(samples: readonly { t: number }[], t: number): number {
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Interpolated sample at time t (clamped to the activity range). */
export function sampleAt(activity: Activity, t: number): TelemetrySample {
  const { samples } = activity;
  const clamped = Math.min(Math.max(t, 0), activity.durationSec);
  // Last sample at-or-before t: lowerBound lands on the first sample
  // at-or-after t, so step back past it unless it sits exactly on t, then
  // advance over equals (ties resolve to the last sample at t, as before).
  let lo = lowerBound(samples, clamped);
  if (lo === samples.length || samples[lo].t > clamped) {
    lo -= 1;
  } else {
    while (lo + 1 < samples.length && samples[lo + 1].t <= clamped) lo += 1;
  }
  if (lo < 0) lo = 0;
  const a = samples[lo];
  const b = samples[Math.min(lo + 1, samples.length - 1)];
  const span = b.t - a.t;
  const f = span > 0 ? (clamped - a.t) / span : 0;
  const out: TelemetrySample = { t: clamped };
  for (const key of NUMERIC_KEYS) {
    const va = a[key];
    const vb = b[key];
    if (typeof va === 'number' && typeof vb === 'number') out[key] = va + (vb - va) * f;
    else if (typeof va === 'number') out[key] = va;
    else if (typeof vb === 'number') out[key] = vb;
  }
  for (const key of STEP_KEYS) {
    const va = a[key];
    if (typeof va === 'number') out[key] = va;
    else if (typeof b[key] === 'number') out[key] = b[key];
  }
  return out;
}

export function summarize(activity: Activity): ActivitySummary {
  const { samples } = activity;
  const nums = (pick: (s: TelemetrySample) => number | undefined): number[] =>
    samples.map(pick).filter((v): v is number => typeof v === 'number');
  const avg = (xs: number[]): number | null =>
    xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

  const dist = nums((s) => s.distance);
  return {
    samples: samples.length,
    durationSec: activity.durationSec,
    distanceM: dist.length > 0 ? dist[dist.length - 1] - dist[0] : 0,
    avgSpeed: avg(nums((s) => s.speed)),
    avgHeartRate: avg(nums((s) => s.heartRate)),
    avgPower: avg(nums((s) => s.power)),
  };
}

/** Which metrics carry data (plus GPS presence) so the AI only suggests viable widgets. */
export interface DataAvailability {
  metrics: MetricId[];
  hasGps: boolean;
}

/**
 * Availability scan over samples. Derived metrics resolve to their source:
 * pace needs speed, vam needs elevation, grade is native or elevation+distance
 * derived (buildActivity already filled it). elapsedTime is always available.
 */
export function activityAvailability(activity: Activity): DataAvailability {
  const { samples } = activity;
  const any = (pick: (s: TelemetrySample) => unknown): boolean =>
    samples.some((s) => typeof pick(s) === 'number');
  const metrics: MetricId[] = [];
  const hasSpeed = any((s) => s.speed);
  if (hasSpeed) metrics.push('speed');
  if (hasSpeed) metrics.push('pace');
  if (any((s) => s.heartRate)) metrics.push('heartRate');
  if (any((s) => s.power)) metrics.push('power');
  if (any((s) => s.cadence)) metrics.push('cadence');
  const hasElevation = any((s) => s.elevation);
  if (hasElevation) metrics.push('elevation');
  if (any((s) => s.distance)) metrics.push('distance');
  metrics.push('elapsedTime');
  if (any((s) => s.grade)) metrics.push('grade');
  if (hasElevation) metrics.push('vam');
  if (any((s) => s.frontGear ?? s.rearGear ?? s.frontGearNum ?? s.rearGearNum)) {
    metrics.push('gears');
  }
  const hasGps = samples.some((s) => typeof s.lat === 'number' && typeof s.lon === 'number');
  return { metrics, hasGps };
}

/** Forward-looking profile: 5 min ahead of the dot. */
export const PROFILE_NEXT_AHEAD_SEC = 300;
/** Dot sits ~0.5 km ahead of the rendered start (distance mode). */
export const PROFILE_NEXT_BEHIND_M = 500;
/** Rendered start behind the dot when samples carry no distance. */
export const PROFILE_NEXT_BEHIND_SEC = 60;

export interface ProfileWindow {
  xMin: number;
  xMax: number;
}

/**
 * Sliding window for the 'profilenext' kind over ascending-t samples.
 * nowT/nowX locate the dot (interpolated sample values are fine).
 * Returns null when the window degenerates: the caller shows the missing glyph.
 */
export function nextProfileWindow(
  samples: TelemetrySample[],
  nowT: number,
  nowX: number,
  useDist: boolean,
): ProfileWindow | null {
  if (samples.length === 0) return null;
  const xk = (s: TelemetrySample): number | undefined => (useDist ? s.distance : s.t);
  // Right edge: first sample at least 5 min ahead, else the ride end.
  const target = nowT + PROFILE_NEXT_AHEAD_SEC;
  const lo = lowerBound(samples, target);
  const xMax = xk(samples[Math.min(lo, samples.length - 1)]);
  // Left edge: ~0.5 km behind the dot, clamped to the ride start.
  let xMin = nowX - (useDist ? PROFILE_NEXT_BEHIND_M : PROFILE_NEXT_BEHIND_SEC);
  for (const s of samples) {
    const first = xk(s);
    if (typeof first === 'number') {
      if (xMin < first) xMin = first;
      break;
    }
  }
  if (typeof xMax !== 'number' || !(xMax - xMin > 1e-9)) return null;
  return { xMin, xMax };
}

/** Raw value for an overlay widget from the activity sample at the rendered moment.
 * elapsedTime is the activity clock, not the video position. */
export function widgetValue(
  metric: MetricId,
  sample: TelemetrySample,
): number | undefined {
  if (metric === 'elapsedTime') return sample.t;
  // Pace derives from speed (sec/km); stopped/missing speed has no pace.
  if (metric === 'pace') return sample.speed && sample.speed > 0 ? 1000 / sample.speed : undefined;
  // Computed (vam), composite (gears) or absent (none): custom kinds read history directly.
  if (metric === 'vam' || metric === 'gears' || metric === 'none') return undefined;
  return sample[metric];
}

/**
 * Shared h/m/s split of clamped whole seconds: h (hours), m (total minutes),
 * mm/ss (zero-padded minute-of-hour/second). formatClock reads m + ss; the
 * span formatters read h + mm + ss.
 */
export function splitHMS(totalSec: number): { h: number; m: number; mm: string; ss: string } {
  const s = Math.max(0, Math.floor(totalSec));
  return {
    h: Math.floor(s / 3600),
    m: Math.floor(s / 60),
    mm: String(Math.floor((s % 3600) / 60)).padStart(2, '0'),
    ss: String(s % 60).padStart(2, '0'),
  };
}

export function formatClock(totalSec: number): string {
  const { m, ss } = splitHMS(totalSec);
  return `${String(m).padStart(2, '0')}:${ss}`;
}

/** h:mm:ss past the hour, mm:ss below it. For activity-scale spans. */
export function formatSpan(totalSec: number): string {
  const { h, mm, ss } = splitHMS(totalSec);
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Parses a "go to" time: h:mm:ss, mm:ss or plain seconds ("90:00" works,
 * minutes may exceed 59). Returns null when the text is not a time.
 */
export function parseGotoTime(text: string): number | null {
  const clean = text.trim();
  if (!clean) return null;
  if (/^\d+(\.\d+)?$/.test(clean)) {
    const s = Number(clean);
    return Number.isFinite(s) ? s : null;
  }
  const parts = clean.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((part) => /^\d+(\.\d+)?$/.test(part))) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [h, m, s] = nums.length === 3 ? nums : [0, nums[0], nums[1]];
  return h * 3600 + m * 60 + s;
}

/** 'YYYY-MM-DD HH:mm:ss UTC' for activity start/end stamps ('—' when unknown). */
export function formatUtc(date: Date): string {
  if (!Number.isFinite(date.getTime())) return '—';
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

/** Wall reading of an instant in an IANA zone, or null on bad input/zone. */
function zonedWall(date: Date, timeZone: string): { text: string; wallMs: number } | null {
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const parts = zonedParts(date.getTime(), timeZone);
    const y = Number(parts['year']);
    const mo = Number(parts['month']);
    const d = Number(parts['day']);
    const h = parts['hour'] ?? '';
    const mi = Number(parts['minute']);
    const s = Number(parts['second']);
    if (!y || !mo || !d || !h || !Number.isFinite(mi) || !Number.isFinite(s)) return null;
    const wallMs = Date.UTC(y, mo - 1, d, Number(h), mi, s);
    const pad = (n: number): string => String(n).padStart(2, '0');
    return { text: `${y}-${pad(mo)}-${pad(d)} ${pad(Number(h))}:${pad(mi)}:${pad(s)}`, wallMs };
  } catch {
    return null;
  }
}

/**
 * 'YYYY-MM-DD HH:mm:ss' wall reading of an instant in an IANA zone
 * (local-time tooltips). Null on bad input or unknown zone.
 */
export function formatInZone(date: Date, timeZone: string): string | null {
  return zonedWall(date, timeZone)?.text ?? null;
}

/**
 * 'UTC-5' style offset of an IANA zone at an instant (local-time tooltips).
 * Null on bad input or unknown zone.
 */
export function zoneOffsetName(date: Date, timeZone: string): string | null {
  const w = zonedWall(date, timeZone);
  if (!w) return null;
  const offMin = Math.round((w.wallMs - date.getTime()) / 60000);
  const sign = offMin < 0 ? '-' : '+';
  const abs = Math.abs(offMin);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return `UTC${sign}${hh}${mm > 0 ? `:${String(mm).padStart(2, '0')}` : ''}`;
}

/**
 * 'YYYY-MM-DD HH:mm:ss' wall reading of an instant under a fixed UTC offset
 * in hours (clip local-time tooltips; fractional zones supported).
 */
export function formatFixedZone(date: Date, tzHours: number): string {
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(tzHours)) return '—';
  const shifted = new Date(date.getTime() + tzHours * 3600e3);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ` +
    `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`
  );
}

/**
 * Activity start from a provider wall reading ('YYYY-MM-DDTHH:mm:ss') under a
 * fixed UTC offset in hours. Null on bad input.
 */
export function activityStartFromOffset(wall: string, offsetHours: number): Date | null {
  const asUtc = parseWall(wall);
  if (asUtc === null || !Number.isFinite(offsetHours)) return null;
  const ms = asUtc - offsetHours * 3600e3;
  return Number.isNaN(ms) ? null : new Date(ms);
}

/**
 * UTC offset in hours of an IANA zone at an instant (fractional zones kept).
 * Null on bad input or unknown zone.
 */
export function zoneOffsetHours(date: Date, timeZone: string): number | null {
  const w = zonedWall(date, timeZone);
  if (!w) return null;
  return Math.round((w.wallMs - date.getTime()) / 60000) / 60;
}
