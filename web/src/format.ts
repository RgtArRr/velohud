import type { MetricId, TimeFormat } from '@velohud/shared';
import { formatSpan, splitHMS } from './telemetry.js';

export type Units = 'metric' | 'imperial';

export interface FormattedMetric {
  value: string;
  unit: string;
}

/** Elapsed seconds rendered under a TimeFormat. */
export function formatElapsed(totalSec: number, format: TimeFormat = 'auto'): string {
  if (format === 'auto') return formatSpan(totalSec);
  const { h, mm, ss } = splitHMS(totalSec);
  switch (format) {
    case 'hmm':
      return `${h}:${mm}`;
    case 'hmmss':
      return `${h}:${mm}:${ss}`;
    case 'h':
      return `${h}h`;
    case 'hm':
      return `${h}h ${mm}m`;
    default:
      return formatSpan(totalSec);
  }
}

/** m:ss per unit, the runner's pace readout (raw is sec/km). */
const formatPace = (secPerUnit: number): string => {
  const s = Math.max(0, Math.floor(secPerUnit));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Display formatting for one metric value (raw SI units in). */
export function formatMetric(
  metric: MetricId,
  raw: number,
  units: Units,
  timeFormat: TimeFormat = 'auto',
): FormattedMetric {
  switch (metric) {
    case 'speed':
      return units === 'metric'
        ? { value: (raw * 3.6).toFixed(1), unit: 'km/h' }
        : { value: (raw * 2.23694).toFixed(1), unit: 'mph' };
    case 'pace':
      return units === 'metric'
        ? { value: formatPace(raw), unit: '/km' }
        : { value: formatPace(raw * 1.60934), unit: '/mi' };
    case 'heartRate':
      return { value: String(Math.round(raw)), unit: 'bpm' };
    case 'power':
      return { value: String(Math.round(raw)), unit: 'W' };
    case 'cadence':
      return { value: String(Math.round(raw)), unit: 'rpm' };
    case 'elevation':
      return units === 'metric'
        ? { value: String(Math.round(raw)), unit: 'm' }
        : { value: String(Math.round(raw * 3.28084)), unit: 'ft' };
    case 'distance':
      return units === 'metric'
        ? { value: (raw / 1000).toFixed(2), unit: 'km' }
        : { value: (raw / 1609.34).toFixed(2), unit: 'mi' };
    case 'grade':
      return { value: raw.toFixed(1), unit: '%' };
    case 'elapsedTime':
      return { value: formatElapsed(raw, timeFormat), unit: '' };
    case 'vam':
      return units === 'metric'
        ? { value: String(Math.round(raw)), unit: 'm/h' }
        : { value: String(Math.round(raw * 3.28084)), unit: 'ft/h' };
    case 'gears':
    case 'none':
      return { value: '', unit: '' };
  }
}
