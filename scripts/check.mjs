// npm run check — one small runnable check for the pure logic (no frameworks).
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activityFromIntervalsStreams, activityFromTrackPoints, buildActivity, activityStartFromOffset, fillDerivedGrade, formatFixedZone, formatInZone, formatUtc, parseActivityStart, zoneOffsetHours, zoneOffsetName, nextProfileWindow, parseFit, parseGotoTime, sampleAt, summarize, widgetValue, zonedTimeToUtc } from '../web/src/telemetry.ts';
import { hashPassword, needsRehash, normalizeEmail, storedIterations, validatePassword, verifyPassword } from '../api/src/password.ts';
import {
  AUTO_JSON_SCHEMA,
  TEMPLATE_JSON_SCHEMA,
  buildAdjustSystemPrompt,
  buildAutoSystemPrompt,
  buildSystemPrompt,
  extractJson,
  extractOutputText,
  parseAiTemplate,
} from '../api/src/ai.ts';
import { STRINGS, resolveLocale, setLocale, t } from '../web/src/i18n.ts';
import {
  GUIDES,
  HUB,
  LEGAL,
  SEO_BASE_URL,
  SEO_PAGES,
  guidePath,
  footerNav,
  legalPath,
} from '../web/seo/content.ts';
import { classifyAspect, inferLayout, parseTemplateJson, resolveLayout } from '../shared/src/template.ts';
import { formatElapsed, formatMetric } from '../web/src/format.ts';
import {
  getCreationDate,
  getCreationTime,
  resolveVideoInstant,
} from '../web/src/video-meta.ts';
import {
  METRIC_IDS,
  WIDGET_KINDS,
  capsFor,
  defaultMetricFor,
  makeWidgetDef,
  kindLabel,
  kindShowsUnit,
  mapStrokeWidths,
  metricLabel,
  navProject,
  navWindow,
  nextWidgetId,
} from '../web/src/widgets.ts';
import { gradeAngle } from '../web/src/overlay.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fitBytes = readFileSync(join(root, 'fixtures/activity/sample.fit'));
const fitBuf = fitBytes.buffer.slice(fitBytes.byteOffset, fitBytes.byteOffset + fitBytes.byteLength);

// FIT parsing (trust boundary).
const act = parseFit(fitBuf);
assert.equal(act.samples.length, 120);
assert.equal(act.durationSec, 119);
assert.equal(act.samples[0].t, 0);
assert.ok(typeof act.samples[0].lat === 'number');
assert.throws(() => parseFit(new ArrayBuffer(32)), /FIT/);

// Shift events merge into samples as forward-filled teeth (Edge + AXS/Di2).
assert.equal(act.samples[5].rearGear, undefined);
assert.equal(act.samples[15].frontGear, 34);
assert.equal(act.samples[15].rearGear, 28);
assert.equal(act.samples[65].frontGear, 34);
assert.equal(act.samples[65].rearGear, 24);
assert.equal(act.samples[5].rearGearNum, undefined);
assert.equal(act.samples[15].frontGearNum, 1);
assert.equal(act.samples[15].rearGearNum, 5);
assert.equal(act.samples[65].rearGearNum, 6);
assert.equal(sampleAt(act, 119).rearGear, 24);

// Newer Edge firmware: enhanced-only altitude/speed, no native grade.
const enhBytes = readFileSync(join(root, 'fixtures/activity/sample-enhanced.fit'));
const enhBuf = enhBytes.buffer.slice(enhBytes.byteOffset, enhBytes.byteOffset + enhBytes.byteLength);
const enh = parseFit(enhBuf);
assert.equal(enh.samples.length, 120);
assert.equal(enh.samples[0].elevation, 500);
assert.ok(typeof enh.samples[0].speed === 'number');
assert.ok(typeof enh.samples[60].grade === 'number', 'grade derived from elevation+distance');
assert.ok(typeof sampleAt(enh, 60).elevation === 'number', 'vam window head');
assert.ok(typeof sampleAt(enh, 0).elevation === 'number', 'vam window tail');

// Derived grade fills only when native grade is fully absent.
const gs = [
  { t: 0, elevation: 100, distance: 0 },
  { t: 10, elevation: 110, distance: 100 },
  { t: 20, elevation: 120, distance: 200 },
];
fillDerivedGrade(gs);
assert.equal(gs[1].grade, 10);
const native = [
  { t: 0, grade: 5, elevation: 100, distance: 0 },
  { t: 10, elevation: 110, distance: 100 },
];
fillDerivedGrade(native);
assert.equal(native[1].grade, undefined);
const stopped = [
  { t: 0, elevation: 100, distance: 0 },
  { t: 10, elevation: 100, distance: 2 },
];
fillDerivedGrade(stopped);
assert.equal(stopped[0].grade, 0);
const noElev = [{ t: 0, distance: 0 }];
fillDerivedGrade(noElev);
assert.equal(noElev[0].grade, undefined);

// IANA wall readings -> UTC (fixed zone, DST winter/summer, bad input).
assert.equal(zonedTimeToUtc('2026-01-15T10:00:00', 'America/Lima')?.toISOString(), '2026-01-15T15:00:00.000Z');
assert.equal(zonedTimeToUtc('2026-01-15T10:00:00', 'America/New_York')?.toISOString(), '2026-01-15T15:00:00.000Z');
assert.equal(zonedTimeToUtc('2026-07-15T10:00:00', 'America/New_York')?.toISOString(), '2026-07-15T14:00:00.000Z');
assert.equal(zonedTimeToUtc('nope', 'America/Lima'), null);
assert.equal(zonedTimeToUtc('2026-01-15T10:00:00', 'Mars/Olympus'), null);

// intervals.icu streams -> Activity (grade derived, zone applied).
const icu = {
  time: [0, 1, 2, 3],
  distance: [0, 8, 16, 24],
  latlng: [[-12.0, -77.0], [-12.001, -77.001], [-12.002, -77.002], [-12.003, -77.003]],
  altitude: [100, 101, 102, 103],
  velocity_smooth: [8, 8, 8, 8],
  heartrate: [120, 121, 122, 123],
  watts: [200, 201, 202, 203],
};
const iact = activityFromIntervalsStreams(icu, '2026-10-26T10:00:00', 'America/Lima');
assert.equal(iact.samples.length, 4);
assert.equal(iact.samples[2].power, 202);
assert.equal(iact.samples[0].lat, -12.0);
assert.equal(iact.samples[3].speed, 8);
assert.ok(typeof iact.samples[1].grade === 'number');
assert.equal(iact.startTime.toISOString(), '2026-10-26T15:00:00.000Z');
assert.throws(() => activityFromIntervalsStreams({}, '2026-10-26T10:00:00', null), /telemet/);

// Shared XML converter (node has no DOMParser, so the DOM extraction itself
// is browser-tested; the derivation logic lives here).
const xmlTrack = activityFromTrackPoints([
  { time: 0, lat: -12.0, lon: -77.0, ele: 100, hr: 120 },
  { time: 1000, lat: -12.0, lon: -77.0001, ele: 102, hr: 125 },
  { time: 2000, lat: -12.0, lon: -77.0002, ele: 104, hr: 130 },
]);
assert.equal(xmlTrack.samples.length, 3);
assert.equal(xmlTrack.durationSec, 2);
assert.equal(xmlTrack.startTime.toISOString(), '1970-01-01T00:00:00.000Z');
assert.equal(xmlTrack.samples[0].heartRate, 120);
// ~10.9m per 0.0001 lon step at lat -12: haversine accumulates, speed derives.
assert.ok(xmlTrack.samples[2].distance > 15 && xmlTrack.samples[2].distance < 30);
assert.ok(xmlTrack.samples[1].speed > 5 && xmlTrack.samples[1].speed < 20);
// Non-monotonic times drop: sampleAt binary-searches on ascending t.
const xmlMono = activityFromTrackPoints([{ time: 0 }, { time: 2000 }, { time: 1000 }]);
assert.equal(xmlMono.samples.length, 2);
assert.throws(() => activityFromTrackPoints([]), /(archivo|file)/);
const built = buildActivity(new Date(0), [{ t: 0 }, { t: 5 }]);
assert.equal(built.durationSec, 5);

// Credentials policy + hashing (WebCrypto, Workers-safe).
assert.equal(normalizeEmail('  USER@X.test  '), 'user@x.test');
assert.equal(normalizeEmail('nope'), null);
assert.equal(normalizeEmail(123), null);
assert.equal(validatePassword('secretpass99'), null);
assert.equal(validatePassword('short1'), 'weak');
assert.equal(validatePassword('longpasswordwithoutdigit'), 'weak');
assert.equal(validatePassword('12345678901'), 'weak');
assert.equal(validatePassword(`${'a1'.repeat(65)}`), 'weak');
const ph = await hashPassword('secretpass99');
assert.ok(ph.startsWith('pbkdf2$100000$'));
assert.equal(await verifyPassword('secretpass99', ph), true);
assert.equal(await verifyPassword('wrongpass11', ph), false);
assert.equal(storedIterations(ph), 100000);
assert.equal(needsRehash(ph), false);
assert.equal(needsRehash('pbkdf2$310000$c2FsdA$hash'), true);

// Interpolation + clamp.
const mid = sampleAt(act, 30.5);
assert.equal(mid.t, 30.5);
const avg = (act.samples[30].speed + act.samples[31].speed) / 2;
assert.ok(Math.abs(mid.speed - avg) < 1e-9);
assert.equal(sampleAt(act, 9999).t, 119);
assert.equal(sampleAt(act, -5).t, 0);

// Summary sanity.
const s = summarize(act);
assert.equal(s.samples, 120);
assert.ok(s.distanceM > 1000 && s.distanceM < 1300);
assert.ok(s.avgSpeed > 8 && s.avgSpeed < 11);

// Aspect classification incl. edges.
assert.equal(classifyAspect(1280, 720), 'horizontal');
assert.equal(classifyAspect(720, 1280), 'vertical');
assert.equal(classifyAspect(720, 720), 'square');
assert.equal(classifyAspect(800, 1000), 'square');
assert.equal(classifyAspect(1250, 1000), 'square');

// Template layouts.
const METRICS = new Set([
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
]);
const dims = { horizontal: [1280, 720], square: [720, 720], vertical: [720, 1280] };
const files = readdirSync(join(root, 'fixtures/templates')).filter((f) => f.endsWith('.json'));
assert.ok(files.length >= 8);
const KINDS = new Set([
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
]);
const SHAPES = new Set(['rect', 'pill', 'none']);
const ALIGNS = new Set(['left', 'center', 'right']);
for (const file of files) {
  const t = JSON.parse(readFileSync(join(root, 'fixtures/templates', file), 'utf8'));
  assert.equal(t.schemaVersion, 3, file);
  for (const w of t.widgets) {
    assert.ok(KINDS.has(w.kind), `${file} ${w.id} kind`);
    if (w.style?.shape) assert.ok(SHAPES.has(w.style.shape), `${file} ${w.id} shape`);
    if (w.style?.align) assert.ok(ALIGNS.has(w.style.align), `${file} ${w.id} align`);
    if (w.range) {
      assert.ok(Array.isArray(w.range) && w.range.length === 2 && w.range[0] < w.range[1], `${file} ${w.id} range`);
    }
    if (w.showUnit !== undefined) {
      assert.equal(typeof w.showUnit, 'boolean', `${file} ${w.id} showUnit`);
    }
    if (w.strokeWidth !== undefined) {
      assert.ok(typeof w.strokeWidth === 'number' && w.strokeWidth > 0, `${file} ${w.id} strokeWidth`);
    }
  }
  for (const [aspect, [W, H]] of Object.entries(dims)) {
    const boxes = t.widgets.map((w) => {
      assert.ok(METRICS.has(w.metric), `${file} ${w.id}`);
      const b = resolveLayout(w.layout, W, H);
      assert.ok(
        b.x >= -0.001 && b.y >= -0.001 && b.x + b.w <= W + 0.001 && b.y + b.h <= H + 0.001,
        `${file} ${w.id}@${aspect} frame`,
      );
      assert.ok(b.w >= 24 && b.h >= 16, `${file} ${w.id}@${aspect} size`);
      const th = resolveLayout(w.layout, 512, 288);
      assert.ok(th.w >= 24 && th.h >= 16, `${file} ${w.id}@${aspect} thumb`);
      return { id: w.id, ...b };
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        assert.ok(!hit, `${file}@${aspect} overlap ${a.id} x ${b.id}`);
      }
    }
  }
}

// mvhd creation_time parsing.
const mvhd = (version, creation) => {
  const b = new Uint8Array(32);
  b.set([0x6d, 0x76, 0x68, 0x64], 4);
  b[8] = version;
  const dv = new DataView(b.buffer);
  if (version === 1) {
    dv.setUint32(12, 0);
    dv.setUint32(16, creation);
  } else {
    dv.setUint32(12, creation);
  }
  return b;
};
const KNOWN = 3875513055; // 2026-10-22T11:24:15Z
assert.equal(
  (await getCreationTime(new Blob([mvhd(0, KNOWN)]))).toISOString(),
  '2026-10-22T11:24:15.000Z',
);
assert.equal(
  (await getCreationTime(new Blob([mvhd(1, KNOWN)]))).toISOString(),
  '2026-10-22T11:24:15.000Z',
);
assert.equal(await getCreationTime(new Blob([new Uint8Array(32)])), null);
assert.equal(await getCreationTime(new Blob([mvhd(0, 0)])), null);
const big = new Uint8Array(1500000);
big.set(mvhd(0, KNOWN), big.length - 100);
assert.equal(
  (await getCreationTime(new Blob([big]))).toISOString(),
  '2026-10-22T11:24:15.000Z',
);
assert.equal(
  (await getCreationTime(new Blob([readFileSync(join(root, 'fixtures/video/sample-720p.mp4'))]))).toISOString(),
  '2026-10-26T10:00:05.000Z',
);
assert.equal(
  await getCreationTime(new Blob([readFileSync(join(root, 'fixtures/video/sample-vertical.mp4'))])),
  null,
);

// Time widget shows activity elapsed at the rendered moment.
const probe = { t: 999, speed: 10, heartRate: 150 };
assert.equal(widgetValue('elapsedTime', probe), 999);
assert.equal(widgetValue('speed', probe), 10);
assert.equal(widgetValue('power', probe), undefined);
// Pace exists (derived, imperial-aware) but is not offered anywhere yet.
assert.equal(widgetValue('pace', { t: 0, speed: 1000 / 300 }), 300);
assert.equal(widgetValue('pace', { t: 0, speed: 0 }), undefined);
assert.equal(widgetValue('pace', { t: 0 }), undefined);
assert.deepEqual(formatMetric('pace', 300, 'metric'), { value: '5:00', unit: '/km' });
assert.deepEqual(formatMetric('pace', 300, 'imperial'), { value: '8:02', unit: '/mi' });

// Widget catalog + factory (right panel: add widget, switch metric/kind).
const kindValues = WIDGET_KINDS;
assert.deepEqual(new Set(kindValues), KINDS);
const metricValues = METRIC_IDS;
assert.equal(metricValues.length, METRICS.size);
for (const m of metricValues) assert.ok(METRICS.has(m), `catalog metric ${m}`);
for (const kind of kindValues) {
  assert.ok(METRICS.has(defaultMetricFor(kind)), `default metric ${kind}`);
  const def = makeWidgetDef(kind, defaultMetricFor(kind), `t-${kind}`, 0);
  assert.equal(def.visible, true);
  assert.equal(def.kind, kind);
  for (const [aspect, [W, H]] of Object.entries(dims)) {
    const b = resolveLayout(def.layout, W, H);
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= W + 0.001 && b.y + b.h <= H + 0.001, `${kind}@${aspect} frame`);
    assert.ok(b.w >= 24 && b.h >= 16, `${kind}@${aspect} size`);
  }
}
// Ids stay unique and cascaded copies stay inside the frame.
assert.equal(nextWidgetId(new Set(['gauge', 'gauge-2']), 'gauge'), 'gauge-3');
assert.equal(nextWidgetId(new Set(['gauge']), 'stat'), 'stat');
for (let slot = 0; slot < 8; slot++) {
  const def = makeWidgetDef('map', 'none', `m${slot}`, slot);
  for (const [aspect, [W, H]] of Object.entries(dims)) {
    const b = resolveLayout(def.layout, W, H);
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= W + 0.001 && b.y + b.h <= H + 0.001, `cascade@${aspect}#${slot}`);
  }
}

// Map stroke widths: explicit px wins (trail at 70%), else auto from the box.
const autoW = mapStrokeWidths(undefined, 397, 396);
assert.ok(Math.abs(autoW.ridden - 396 * 0.013) < 1e-9);
assert.ok(Math.abs(autoW.track - 396 * 0.009) < 1e-9);
assert.ok(autoW.ridden > autoW.track);
const tinyW = mapStrokeWidths(undefined, 24, 16);
assert.equal(tinyW.track, 2.5);
assert.equal(tinyW.ridden, 3.5);
const expW = mapStrokeWidths(6, 397, 396);
assert.equal(expW.ridden, 6);
assert.ok(Math.abs(expW.track - 4.2) < 1e-9);
assert.equal(mapStrokeWidths(0, 100, 100).ridden, 1);
assert.equal(mapStrokeWidths(-3, 100, 100).track, 1);
assert.deepEqual(mapStrokeWidths(NaN, 100, 100), mapStrokeWidths(undefined, 100, 100));

// Nav window + course-up projection (synthetic straight track, 10 m spacing).
const DEG10 = 10 / 110540;
const track = [];
for (let i = 0; i <= 100; i++) track.push({ lon: -3.7, lat: 40.4 + i * DEG10, t: i });
const win = navWindow(track, 50, 55, 405);
assert.equal(win.start, 44);
assert.equal(win.end, 91);
assert.equal(navWindow(track, 0, 55, 405).start, 0);
assert.equal(navWindow(track, 100, 55, 405).end, 100);
const pN = navProject(track[60].lon, track[60].lat, track[50], 0);
assert.ok(Math.abs(pN.fwd - 100) < 0.5 && Math.abs(pN.right) < 0.5);
const pE = navProject(track[60].lon, track[60].lat, track[50], 90);
assert.ok(Math.abs(pE.fwd) < 0.5 && Math.abs(pE.right + 100) < 0.5);

// com.apple.quicktime.creationdate: wall reading + embedded offset.
const mkMdta = (payload) => {
  const enc = new TextEncoder();
  const key = enc.encode('creationdate');
  const data = enc.encode(payload);
  const box = new Uint8Array(16 + data.length);
  const dv = new DataView(box.buffer);
  dv.setUint32(0, box.length);
  box.set([0x64, 0x61, 0x74, 0x61], 4); // 'data'
  dv.setUint32(8, 1); // utf-8
  dv.setUint32(12, 0); // locale
  box.set(data, 16);
  const out = new Uint8Array(key.length + 8 + box.length);
  out.set(key, 0);
  out.set(box, key.length + 8);
  return new Blob([out]);
};
const cd = await getCreationDate(mkMdta('2026-10-22T11:24:15-0600'));
assert.equal(cd.wallMs, Date.UTC(2026, 9, 22, 11, 24, 15));
assert.equal(cd.offsetMin, -360);
const cdZ = await getCreationDate(mkMdta('2026-10-22T11:24:15Z'));
assert.equal(cdZ.offsetMin, 0);
assert.equal(await getCreationDate(new Blob([new Uint8Array(64)])), null);
assert.equal(await getCreationDate(mkMdta('not-a-date')), null);
// iPhone layout: a decoy value first, real date ~600 bytes after the key.
const mkGap = (payload, gap) => {
  const enc = new TextEncoder();
  const key = enc.encode('creationdate');
  const decoy = enc.encode('3.466196');
  const dbox = new Uint8Array(16 + decoy.length);
  const dd = new DataView(dbox.buffer);
  dd.setUint32(0, dbox.length);
  dbox.set([0x64, 0x61, 0x74, 0x61], 4);
  dd.setUint32(8, 1);
  dd.setUint32(12, 0);
  dbox.set(decoy, 16);
  const data = enc.encode(payload);
  const box = new Uint8Array(16 + data.length);
  const dv = new DataView(box.buffer);
  dv.setUint32(0, box.length);
  box.set([0x64, 0x61, 0x74, 0x61], 4);
  dv.setUint32(8, 1);
  dv.setUint32(12, 0);
  box.set(data, 16);
  const out = new Uint8Array(key.length + dbox.length + gap + box.length);
  out.set(key, 0);
  out.set(dbox, key.length);
  out.set(box, key.length + dbox.length + gap);
  return new Blob([out]);
};
const cdGap = await getCreationDate(mkGap('2026-10-22T06:24:15-0500', 600));
assert.equal(cdGap.wallMs, Date.UTC(2026, 9, 22, 6, 24, 15));
assert.equal(cdGap.offsetMin, -300);

// resolveVideoInstant: fixed offsets reinterpret the file wall reading.
const WALL = Date.UTC(2026, 9, 22, 16, 0, 0);
assert.equal(resolveVideoInstant(WALL, -6), WALL + 6 * 3600e3);
assert.equal(resolveVideoInstant(WALL, 5.5), WALL - 5.5 * 3600e3);
assert.equal(resolveVideoInstant(WALL, 0), WALL);

// Unit toggle visibility per kind (mirrors the painters reading text.unit).
for (const k of ['stat', 'number', 'gauge', 'speedo', 'ring', 'slope', 'gears', 'spark', 'profile', 'profilenext', 'vam']) {
  assert.equal(kindShowsUnit(k), true, `unit ${k}`);
}
for (const k of ['map', 'navmap', 'compass']) {
  assert.equal(kindShowsUnit(k), false, `unit ${k}`);
}
// Capability table per kind (drives inspector visibility).
const LABEL_TOGGLE = ['stat', 'gauge', 'speedo', 'slope', 'spark', 'profile', 'profilenext', 'vam', 'ring', 'gears'];
for (const k of WIDGET_KINDS) {
  assert.equal(capsFor(k).labelToggle, LABEL_TOGGLE.includes(k), `caps labelToggle ${k}`);
  assert.equal(capsFor(k).trailWidth, k === 'map' || k === 'navmap', `caps trailWidth ${k}`);
  assert.equal(capsFor(k).text, k !== 'map' && k !== 'navmap', `caps text ${k}`);
  assert.equal(capsFor(k).gearsMode, k === 'gears', `caps gearsMode ${k}`);
}

// profilenext window: dot ~0.5 km ahead of the rendered start, 5 min ahead at right.
const winSamples = [];
for (let tt = 0; tt <= 3600; tt++) {
  winSamples.push({ t: tt, distance: tt * 5, elevation: 100 + tt * 0.01 });
}
let pwin = nextProfileWindow(winSamples, 1000, 5000, true);
assert.equal(pwin.xMin, 4500);
assert.equal(pwin.xMax, 6500);
pwin = nextProfileWindow(winSamples, 100, 500, true);
assert.equal(pwin.xMin, 0);
assert.equal(pwin.xMax, 2000);
pwin = nextProfileWindow(winSamples, 3500, 17500, true);
assert.equal(pwin.xMin, 17000);
assert.equal(pwin.xMax, 18000);
pwin = nextProfileWindow(winSamples, 1000, 1000, false);
assert.equal(pwin.xMin, 940);
assert.equal(pwin.xMax, 1300);
assert.equal(nextProfileWindow([], 0, 0, true), null);
assert.equal(nextProfileWindow([{ t: 0, elevation: 5 }], 0, 0, true), null);

// parseGotoTime: h:mm:ss, mm:ss or plain seconds.
assert.equal(parseGotoTime('1:20:12'), 4812);
assert.equal(parseGotoTime('20:12'), 1212);
assert.equal(parseGotoTime('12'), 12);
assert.equal(parseGotoTime('4812.5'), 4812.5);
assert.equal(parseGotoTime('1:20:12.5'), 4812.5);
assert.equal(parseGotoTime('90:00'), 5400);
assert.equal(parseGotoTime('  7  '), 7);
assert.equal(parseGotoTime('abc'), null);
assert.equal(parseGotoTime(''), null);
assert.equal(parseGotoTime('1:2:3:4'), null);
assert.equal(parseGotoTime('-5'), null);
assert.equal(parseGotoTime('1::2'), null);

// formatUtc: UTC stamps for activity start/end.
assert.equal(formatUtc(new Date('2026-10-28T14:05:06.789Z')), '2026-10-28 14:05:06 UTC');
assert.equal(formatUtc(new Date(NaN)), '—');

// parseActivityStart: intervals local wall + athlete zone anchors UTC.
assert.equal(
  parseActivityStart('2026-10-23T18:29:27', 'America/Lima')?.toISOString(),
  '2026-10-23T23:29:27.000Z',
);
assert.equal(parseActivityStart('2026-10-23T18:29:27', null)?.toISOString(), '2026-10-23T18:29:27.000Z');
// Re-anchor math behind the activity zone selector (New York is on DST here).
assert.equal(
  parseActivityStart('2026-10-23T18:29:27', 'America/New_York')?.toISOString(),
  '2026-10-23T22:29:27.000Z',
);

// formatInZone: local-time tooltips in an IANA zone.
assert.equal(formatInZone(new Date('2026-10-23T23:29:27.000Z'), 'America/Lima'), '2026-10-23 18:29:27');
assert.equal(formatInZone(new Date('2026-10-23T23:29:27.000Z'), 'Pacific/Auckland'), '2026-10-24 12:29:27');
assert.equal(formatInZone(new Date('2026-10-23T23:29:27.000Z'), 'Nope/Nowhere'), null);
assert.equal(formatInZone(new Date(NaN), 'America/Lima'), null);

// zoneOffsetName: UTC offset label of a zone at an instant.
assert.equal(zoneOffsetName(new Date('2026-10-23T23:29:27.000Z'), 'America/Lima'), 'UTC-5');
assert.equal(zoneOffsetName(new Date('2026-10-23T23:29:27.000Z'), 'Pacific/Auckland'), 'UTC+13');
assert.equal(zoneOffsetName(new Date('2026-10-23T23:29:27.000Z'), 'Asia/Kathmandu'), 'UTC+5:45');
assert.equal(zoneOffsetName(new Date('2026-10-23T23:29:27.000Z'), 'Nope/Nowhere'), null);

// activityStartFromOffset: re-anchor math behind the activity zone selector.
assert.equal(
  activityStartFromOffset('2026-10-23T18:29:27', -5)?.toISOString(),
  '2026-10-23T23:29:27.000Z',
);
assert.equal(
  activityStartFromOffset('2026-10-23T18:29:27', 5.75)?.toISOString(),
  '2026-10-23T12:44:27.000Z',
);
assert.equal(activityStartFromOffset('not-a-date', -5), null);
assert.equal(activityStartFromOffset('2026-10-23T18:29:27', NaN), null);

// zoneOffsetHours: fixed offset of a zone at an instant (selector preselect).
assert.equal(zoneOffsetHours(new Date('2026-10-23T23:29:27.000Z'), 'America/Lima'), -5);
assert.equal(zoneOffsetHours(new Date('2026-10-23T23:29:27.000Z'), 'Pacific/Auckland'), 13);
assert.equal(zoneOffsetHours(new Date('2026-10-23T23:29:27.000Z'), 'Nope/Nowhere'), null);

// formatFixedZone: clip tooltip wall under the selected fixed offset.
assert.equal(formatFixedZone(new Date('2026-10-29T01:56:08.000Z'), -5), '2026-10-28 20:56:08');
assert.equal(formatFixedZone(new Date('2026-10-29T01:56:08.000Z'), 5.75), '2026-10-29 07:41:08');
assert.equal(formatFixedZone(new Date('2026-10-29T01:56:08.000Z'), 0), '2026-10-29 01:56:08');
assert.equal(formatFixedZone(new Date(NaN), -5), '—');

// i18n: stored preference wins, else navigator autodetect, else English.
assert.equal(resolveLocale('en', ['es-ES']), 'en');
assert.equal(resolveLocale('es', ['en-US']), 'es');
assert.equal(resolveLocale('fr', ['es-MX']), 'es');
assert.equal(resolveLocale(null, ['es-ES', 'es']), 'es');
assert.equal(resolveLocale(null, ['en-US']), 'en');
assert.equal(resolveLocale(null, []), 'en');
assert.equal(resolveLocale(null, ['fr-FR', 'de']), 'en');
assert.equal(resolveLocale(null, ['ES-mx']), 'es');
// Both locales carry the same keys; interpolation + fallback hold.
assert.deepEqual(Object.keys(STRINGS.es).sort(), Object.keys(STRINGS.en).sort());
setLocale('en');
assert.equal(t('clip.title'), 'Clip');
assert.equal(t('st.clipAdded', { name: 'X' }), 'Clip added: X.');
assert.equal(t('no.such.key'), 'no.such.key');
assert.equal(kindLabel('speedo'), 'Speedometer');
assert.equal(metricLabel('heartRate'), 'Heart rate');
assert.throws(() => parseFit(new Uint8Array(8).buffer), /not a valid FIT/);
setLocale('es');
assert.equal(t('clip.title'), 'Clip');
assert.equal(kindLabel('speedo'), 'Velocímetro');
assert.equal(metricLabel('heartRate'), 'Frecuencia cardíaca');
assert.throws(() => parseFit(new Uint8Array(8).buffer), /no es un FIT/);

// Template export/import roundtrip: every fixture parses, and bad shapes throw.
for (const f of files) {
  const tpl = parseTemplateJson(readFileSync(join(root, 'fixtures/templates', f), 'utf8'));
  assert.equal(tpl.schemaVersion, 3);
  assert.ok(tpl.name.length > 0);
  assert.ok(Array.isArray(tpl.widgets));
  assert.equal(parseTemplateJson(JSON.stringify(tpl)).widgets.length, tpl.widgets.length);
}
assert.throws(() => parseTemplateJson('no json'), /not a template/);
assert.throws(() => parseTemplateJson('{}'), /not a template/);
assert.throws(() => parseTemplateJson('{"name":"x"}'), /not a template/);
assert.throws(() => parseTemplateJson('{"name":"x","widgets":[null]}'), /not a template/);
assert.throws(
  () => parseTemplateJson('{"name":"x","widgets":[{"id":"a","kind":"stat"}]}'),
  /not a template/,
);
const slim = parseTemplateJson('{"name":"","widgets":[]}');
assert.equal(slim.id, 'imported');
assert.equal(slim.theme.accent, '#7dd3fc');

// Elapsed-time formats (+ roundtrip through template JSON).
assert.equal(formatElapsed(5025), '1:23:45');
assert.equal(formatElapsed(90), '01:30');
assert.equal(formatElapsed(5025, 'hmm'), '1:23');
assert.equal(formatElapsed(5025, 'hmmss'), '1:23:45');
assert.equal(formatElapsed(90, 'hmmss'), '0:01:30');
assert.equal(formatElapsed(5025, 'h'), '1h');
assert.equal(formatElapsed(5025, 'hm'), '1h 23m');
assert.equal(formatMetric('elapsedTime', 5025, 'metric', 'h').value, '1h');
assert.equal(formatMetric('elapsedTime', 90, 'metric').value, '01:30');
const withFmt = parseTemplateJson(
  JSON.stringify({
    name: 't',
    widgets: [
      { id: 'a', kind: 'stat', metric: 'elapsedTime', timeFormat: 'hm', layout: { ax: 'left', ay: 'top', px: 0, py: 0, w: 50, h: 20 } },
    ],
  }),
);
assert.equal(withFmt.widgets[0].timeFormat, 'hm');

// v3 layouts: unknown kinds/metrics rejected, legacy v2 exports recognized.
const badKind = JSON.stringify({
  name: 't',
  widgets: [{ id: 'a', kind: 'nope', metric: 'speed', layout: { ax: 'left', ay: 'top', px: 0, py: 0, w: 10, h: 10 } }],
});
assert.throws(() => parseTemplateJson(badKind), /not a template/);
const badMetric = JSON.stringify({
  name: 't',
  widgets: [{ id: 'a', kind: 'stat', metric: 'nope', layout: { ax: 'left', ay: 'top', px: 0, py: 0, w: 10, h: 10 } }],
});
assert.throws(() => parseTemplateJson(badMetric), /not a template/);
const legacy = JSON.stringify({
  name: 't',
  widgets: [{ id: 'a', kind: 'stat', metric: 'speed', layout: { vertical: { x: 0, y: 0, w: 1, h: 1 } } }],
});
assert.throws(() => parseTemplateJson(legacy), /legacy template/);
const badVersion = JSON.stringify({
  name: 't',
  schemaVersion: 2,
  widgets: [{ id: 'a', kind: 'stat', metric: 'speed', layout: { ax: 'left', ay: 'top', px: 0, py: 0, w: 10, h: 10 } }],
});
assert.throws(() => parseTemplateJson(badVersion), /legacy template/);
const v1shape = JSON.stringify({
  name: 't',
  widgets: [{ id: 'a', metric: 'speed', layout: { vertical: { x: 0, y: 0, w: 1, h: 1 } } }],
});
assert.throws(() => parseTemplateJson(v1shape), /legacy template/);

// Custom labels are stripped: overlay text is hardcoded English.
const stripped = parseTemplateJson(
  JSON.stringify({
    name: 't',
    widgets: [
      { id: 'a', kind: 'stat', metric: 'speed', label: 'XXX', layout: { ax: 'left', ay: 'top', px: 0, py: 0, w: 50, h: 20 } },
    ],
  }),
);
assert.equal('label' in stripped.widgets[0], false);

// Fail-open optionals: invalid values drop to defaults instead of rejecting.
const dirtyLayout = { ax: 'left', ay: 'top', px: 0, py: 0, w: 50, h: 20 };
const dirty = parseTemplateJson(
  JSON.stringify({
    name: 't',
    theme: { panelOpacity: 'opaque', fontFamily: 'Comic Sans' },
    widgets: [
      {
        id: 'a', kind: 'gauge', metric: 'speed', visible: 'yes', showUnit: 1, showLabel: 0,
        range: 'bogus', strokeWidth: 'big', timeFormat: 'bogus', gearsMode: 'bogus',
        gearsSide: 'bogus', style: 'bogus', title: 'zzz', layout: dirtyLayout,
      },
      { id: 'a', kind: 'stat', metric: 'speed', layout: dirtyLayout },
      { id: '', kind: 'stat', metric: 'speed', layout: dirtyLayout },
      { kind: 'stat', metric: 'speed', layout: dirtyLayout },
      {
        id: 'ok', kind: 'stat', metric: 'elapsedTime', visible: false, showUnit: false,
        showLabel: false, range: [0, 100], strokeWidth: 3, timeFormat: 'hm',
        gearsMode: 'index', gearsSide: 'rear',
        style: { shape: 'pill', background: '#fff', backgroundOpacity: 0.5, align: 'bogus' },
        layout: dirtyLayout,
      },
    ],
  }),
);
const [d0, , , , d4] = dirty.widgets;
assert.equal(d0.visible, true);
for (const key of ['showUnit', 'showLabel', 'range', 'strokeWidth', 'timeFormat', 'gearsMode', 'gearsSide', 'style', 'title']) {
  assert.equal(key in d0, false, `${key} dropped`);
}
assert.deepEqual(
  dirty.widgets.map((w) => w.id),
  ['a', 'a-2', 'widget-2', 'widget-3', 'ok'],
);
assert.equal(d4.visible, false);
assert.equal(d4.showUnit, false);
assert.equal(d4.showLabel, false);
assert.deepEqual(d4.range, [0, 100]);
assert.equal(d4.strokeWidth, 3);
assert.equal(d4.timeFormat, 'hm');
assert.equal(d4.gearsMode, 'index');
assert.equal(d4.gearsSide, 'rear');
assert.deepEqual(d4.style, { shape: 'pill', background: '#fff', backgroundOpacity: 0.5 });
assert.equal(dirty.theme.panelOpacity, 0.45);
assert.equal('fontFamily' in dirty.theme, false, 'theme font removed: widgets fall back to Inter');

// Unknown time formats fall back to auto instead of printing undefined.
assert.equal(formatElapsed(90, 'bogus'), '01:30');

// Inclinometer: true atan ×2, capped at ±45°.
assert.equal(gradeAngle(0), 0);
assert.ok(Math.abs(gradeAngle(20) - Math.atan(0.2) * 2) < 1e-12);
assert.equal(gradeAngle(100), Math.PI / 4);
assert.equal(gradeAngle(-200), -Math.PI / 4);
assert.ok(gradeAngle(-50) < 0 && gradeAngle(50) > 0);

// AI helpers: extraction, output shapes, naming, prompt constraints.
assert.equal(extractJson('```json\n{"a":1}\n```'), '{"a":1}');
assert.equal(extractJson('  {"a":1}  '), '{"a":1}');
assert.equal(extractJson('nope'), null);
assert.equal(extractOutputText('raw'), 'raw');
assert.equal(extractOutputText({ output_text: 'x' }), 'x');
assert.equal(extractOutputText({ output: [{ content: [{ text: 'a' }, { text: 'b' }] }] }), 'ab');
assert.equal(extractOutputText({ choices: [{ message: { content: 'c' } }] }), 'c');
assert.equal(extractOutputText({ nope: 1 }), null);
const aiTpl = parseAiTemplate('```json\n{"name":"Cronos","widgets":[]}\n```');
assert.equal(aiTpl.name, 'Cronos');
assert.throws(() => parseAiTemplate('garbage'), /not a template/);
assert.throws(
  () =>
    parseAiTemplate(
      JSON.stringify({
        name: 't',
        widgets: [{ id: 'a', kind: 'stat', metric: 'speed', layout: { vertical: {} } }],
      }),
    ),
  /legacy template/,
);
assert.ok(buildSystemPrompt().includes('in ENGLISH'));
assert.ok(buildSystemPrompt().includes("always set shape 'none'"));
assert.ok(buildSystemPrompt().includes('"Baloo 2"'));
assert.ok(buildSystemPrompt('horizontal').includes('HORIZONTAL (1280x720)'));
assert.ok(buildSystemPrompt().includes('VERTICAL (720x1280)'));
// Constrained-decoding schema: no invented keys (esp. `label`), 1-8 widgets.
assert.equal(TEMPLATE_JSON_SCHEMA.additionalProperties, false);
assert.deepEqual(TEMPLATE_JSON_SCHEMA.required, ['schemaVersion', 'id', 'name', 'theme', 'widgets']);
assert.equal(TEMPLATE_JSON_SCHEMA.properties.widgets.minItems, 1);
assert.equal(TEMPLATE_JSON_SCHEMA.properties.widgets.maxItems, 8);
assert.equal(TEMPLATE_JSON_SCHEMA.properties.widgets.items.additionalProperties, false);
assert.ok(
  TEMPLATE_JSON_SCHEMA.properties.widgets.items.properties.style.properties.labelFont.enum.includes(
    '"Baloo 2", sans-serif',
  ),
);
assert.ok(TEMPLATE_JSON_SCHEMA.properties.widgets.items.properties.metric.enum.includes('pace'));
assert.ok(buildSystemPrompt().includes('min/km for running'));
// Adjust variant: full object back, preserve the untouched.
assert.ok(buildAdjustSystemPrompt().includes('FULL updated'));
assert.ok(buildAdjustSystemPrompt().includes('Preserve everything'));
assert.ok(buildAdjustSystemPrompt().includes('byte-for-byte identical'));
// Auto mode: black/white colors only, base schema untouched.
assert.deepEqual(AUTO_JSON_SCHEMA.properties.theme.properties.text.enum, ['#ffffff', '#000000']);
assert.deepEqual(
  AUTO_JSON_SCHEMA.properties.widgets.items.properties.style.properties.background.enum,
  ['#ffffff', '#000000'],
);
assert.equal('enum' in TEMPLATE_JSON_SCHEMA.properties.theme.properties.text, false);
assert.ok(buildAutoSystemPrompt().includes('video frame'));
assert.ok(buildAutoSystemPrompt().includes('white text'));
assert.ok(buildAutoSystemPrompt().includes('NEVER describe the video content'));
assert.ok(buildAdjustSystemPrompt('square').includes('SQUARE (720x720)'));

// resolve: same vmin numbers render identical pixels on both orientations.
const sq = { ax: 'left', ay: 'top', px: 0, py: 0, w: 25, h: 25 };
assert.deepEqual(resolveLayout(sq, 1000, 800), { x: 0, y: 0, w: 200, h: 200 });
assert.deepEqual(resolveLayout(sq, 800, 1000), { x: 0, y: 0, w: 200, h: 200 });
assert.deepEqual(
  resolveLayout({ ax: 'right', ay: 'bottom', px: 5, py: 5, w: 25, h: 25 }, 1000, 800),
  { x: 760, y: 560, w: 200, h: 200 },
);
// stretch spans the frame minus margins; infer round-trips resolve.
const bar = { ax: 'center', ay: 'bottom', px: 5, py: 5, w: 'stretch', h: 25 };
assert.deepEqual(resolveLayout(bar, 1000, 800), { x: 40, y: 560, w: 920, h: 200 });
assert.deepEqual(inferLayout({ x: 0, y: 0, w: 200, h: 200 }, 1000, 800), {
  ax: 'left', ay: 'top', px: 0, py: 0, w: 25, h: 25,
});
assert.deepEqual(resolveLayout(inferLayout({ x: 40, y: 560, w: 920, h: 200 }, 1000, 800), 1000, 800), {
  x: 40, y: 560, w: 920, h: 200,
});

// SEO: generated dist must carry crawler head + machine files matching the manifest.
const distDir = join(root, 'web', 'dist');
assert.ok(existsSync(distDir), 'web/dist missing: run `npm run build --workspace=web` first');
// Root is a locale gateway: instant JS redirect + crawler-followable links.
const distIndex = readFileSync(join(distDir, 'index.html'), 'utf8');
assert.ok(distIndex.includes(`<link rel="canonical" href="${SEO_BASE_URL}/" />`), 'gateway canonical');
assert.ok(distIndex.includes('<script src="/redirect.js"'), 'gateway redirect script');
assert.ok(distIndex.includes('<a href="/es/">') && distIndex.includes('<a href="/en/"'), 'gateway locale links');
// CSP: Cloudflare Web Analytics beacon allowed (gateway + app + static pages).
const cspOf = (html) => html.match(/Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';
const gatewayCsp = cspOf(distIndex);
assert.ok(gatewayCsp.includes("script-src 'self' https://static.cloudflareinsights.com"), 'gateway csp beacon script');
assert.ok(gatewayCsp.includes('https://cloudflareinsights.com'), 'gateway csp beacon connect');
// Editor lives at /app/, uncrawled: noindex, no entity JSON-LD.
const appIndex = readFileSync(join(distDir, 'app', 'index.html'), 'utf8');
assert.ok(appIndex.includes(`<link rel="canonical" href="${SEO_BASE_URL}/app/" />`), 'app canonical');
assert.ok(appIndex.includes('<meta name="robots" content="noindex"'), 'app noindex');
assert.ok(!appIndex.includes('application/ld+json'), 'app has no JSON-LD');
assert.ok(appIndex.includes('type="module"'), 'app boots JS');
const appCsp = cspOf(appIndex);
assert.ok(appCsp.includes("script-src 'self' https://static.cloudflareinsights.com"), 'app csp beacon script');
assert.ok(appCsp.includes('https://cloudflareinsights.com'), 'app csp beacon connect');
assert.ok(!appCsp.includes('localhost:8787') && !appCsp.includes('127.0.0.1'), 'app csp drops dev origins');
assert.ok(!appCsp.includes('ws:') && !appCsp.includes('wss:'), 'app csp drops ws');
const firstGuideHtml = readFileSync(
  join(distDir, guidePath('es', GUIDES[0]).replace(/^\/|\/$/g, ''), 'index.html'),
  'utf8',
);
const staticCsp = cspOf(firstGuideHtml);
assert.ok(staticCsp.includes('script-src https://static.cloudflareinsights.com'), 'static csp beacon script');
assert.ok(staticCsp.includes('https://cloudflareinsights.com'), 'static csp beacon connect');
for (const prop of ['og:title', 'og:type', 'og:image', 'og:url', 'og:description', 'og:locale']) {
  assert.ok(distIndex.includes(`property="${prop}"`), `gateway ${prop}`);
}
const robots = readFileSync(join(distDir, 'robots.txt'), 'utf8');
assert.ok(robots.includes('Allow: /'), 'robots allows crawling');
assert.ok(robots.includes(`Sitemap: ${SEO_BASE_URL}/sitemap.xml`), 'robots declares sitemap');
const sitemap = readFileSync(join(distDir, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
assert.ok(locs.length > 0, 'sitemap lists urls');
for (const page of SEO_PAGES) {
  assert.ok(locs.includes(`${SEO_BASE_URL}${page.path}`), `sitemap lists ${page.path}`);
}
for (const loc of locs) {
  assert.ok(loc.startsWith(`${SEO_BASE_URL}/`), `sitemap loc on host: ${loc}`);
  const rel = loc.slice(SEO_BASE_URL.length).replace(/^\/|\/$/g, '');
  assert.ok(existsSync(join(distDir, rel, 'index.html')), `sitemap target exists: ${loc}`);
}
// Hubs: reciprocal hreflang pair + x-default, FAQPage matching the manifest, no app JS.
for (const locale of ['es', 'en']) {
  const other = locale === 'es' ? 'en' : 'es';
  const html = readFileSync(join(distDir, locale, 'index.html'), 'utf8');
  assert.ok(html.includes(`<html lang="${locale}">`), `${locale} html lang`);
  assert.ok(html.includes(`hreflang="${locale}" href="${SEO_BASE_URL}/${locale}/"`), `${locale} self hreflang`);
  assert.ok(html.includes(`hreflang="${other}" href="${SEO_BASE_URL}/${other}/"`), `${locale} reciprocal hreflang`);
  assert.ok(html.includes(`hreflang="x-default" href="${SEO_BASE_URL}/"`), `${locale} x-default`);
  assert.ok(!html.includes('<script src'), `${locale} has no app JS`);
  const hubLd = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(hubLd, `${locale} has JSON-LD`);
  const hubData = JSON.parse(hubLd[1]);
  assert.ok(Array.isArray(hubData), `${locale} json-ld graph`);
  const [soft, faq] = hubData;
  assert.equal(soft['@type'], 'SoftwareApplication');
  assert.equal(soft.name, 'velohud');
  assert.equal(soft.url, `${SEO_BASE_URL}/${locale}/`);
  assert.equal(faq['@type'], 'FAQPage');
  assert.equal(faq.mainEntity.length, HUB[locale].faqs.length);
  assert.ok(faq.mainEntity.length >= 8, `${locale} faq depth`);
  assert.ok(html.includes('href="/app/"'), `${locale} cta to app`);
  assert.ok(!html.includes('href="/"'), `${locale} no stale root links`);
}
// Guides: reciprocal hreflang pairs, HowTo matching the manifest, Markdown mirrors.
assert.equal(GUIDES.length, 5);
const slugs = new Set();
for (const g of GUIDES) {
  for (const locale of ['es', 'en']) {
    const other = locale === 'es' ? 'en' : 'es';
    const path = guidePath(locale, g);
    assert.ok(!slugs.has(`${locale}${path}`), `unique guide path ${path}`);
    slugs.add(`${locale}${path}`);
    const rel = path.replace(/^\/|\/$/g, '');
    const html = readFileSync(join(distDir, rel, 'index.html'), 'utf8');
    assert.ok(html.includes(`<link rel="canonical" href="${SEO_BASE_URL}${path}" />`), `${path} canonical`);
    assert.ok(
      html.includes(`hreflang="${locale}" href="${SEO_BASE_URL}${path}"`),
      `${path} self hreflang`,
    );
    assert.ok(
      html.includes(`hreflang="${other}" href="${SEO_BASE_URL}${guidePath(other, g)}"`),
      `${path} reciprocal hreflang`,
    );
    const mdPath = `${path}index.md`;
    assert.ok(
      html.includes(`rel="alternate" type="text/markdown" href="${SEO_BASE_URL}${mdPath}"`),
      `${path} md alternate`,
    );
    assert.ok(html.includes(`rel="describedby" href="${SEO_BASE_URL}/llms.txt"`), `${path} describedby`);
    const guideLd = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(guideLd, `${path} has JSON-LD`);
    const guideData = JSON.parse(guideLd[1]);
    assert.equal(guideData['@type'], 'HowTo');
    assert.equal(guideData.step.length, g.copy[locale].steps.length);
    assert.ok(guideData.step.length >= 5, `${path} step depth`);
    const md = readFileSync(join(distDir, rel, 'index.md'), 'utf8');
    assert.ok(md.startsWith(`# ${g.copy[locale].h1}\n`), `${mdPath} H1`);
    assert.ok(md.includes(SEO_BASE_URL), `${mdPath} absolute links`);
  }
}
// llms.txt: v2 shape (H1 first, summary, sections) linking every mirror.
const llms = readFileSync(join(distDir, 'llms.txt'), 'utf8');
assert.ok(llms.startsWith('# velohud\n'), 'llms H1 first');
assert.ok(llms.includes('\n> '), 'llms summary blockquote');
for (const locale of ['es', 'en']) {
  assert.ok(llms.includes(`${SEO_BASE_URL}/${locale}/index.md`), `llms links ${locale} hub mirror`);
  const hubHtml = readFileSync(join(distDir, locale, 'index.html'), 'utf8');
  for (const g of GUIDES) {
    assert.ok(hubHtml.includes(`href="${guidePath(locale, g)}"`), `${locale} hub links ${g.slug[locale]}`);
    assert.ok(
      llms.includes(`${SEO_BASE_URL}${guidePath(locale, g)}index.md`),
      `llms links ${locale}/${g.slug[locale]} mirror`,
    );
  }
}
// Legal: reciprocal hreflang pairs, WebPage matching the manifest, Markdown mirrors.
assert.equal(LEGAL.length, 2);
for (const e of LEGAL) {
  for (const locale of ['es', 'en']) {
    const other = locale === 'es' ? 'en' : 'es';
    const path = legalPath(locale, e);
    const rel = path.replace(/^\/|\/$/g, '');
    const html = readFileSync(join(distDir, rel, 'index.html'), 'utf8');
    assert.ok(html.includes(`<link rel="canonical" href="${SEO_BASE_URL}${path}" />`), `${path} canonical`);
    assert.ok(
      html.includes(`hreflang="${locale}" href="${SEO_BASE_URL}${path}"`),
      `${path} self hreflang`,
    );
    assert.ok(
      html.includes(`hreflang="${other}" href="${SEO_BASE_URL}${legalPath(other, e)}"`),
      `${path} reciprocal hreflang`,
    );
    assert.ok(
      html.includes(`rel="alternate" type="text/markdown" href="${SEO_BASE_URL}${path}index.md"`),
      `${path} md alternate`,
    );
    const legalLd = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(legalLd, `${path} has JSON-LD`);
    const legalData = JSON.parse(legalLd[1]);
    assert.equal(legalData['@type'], 'WebPage');
    assert.equal(legalData.name, e.copy[locale].h1);
    const md = readFileSync(join(distDir, rel, 'index.md'), 'utf8');
    assert.ok(md.startsWith(`# ${e.copy[locale].h1}\n`), `${path}index.md H1`);
    assert.ok(e.copy[locale].sections.length >= 6, `${path} section depth`);
  }
}
for (const locale of ['es', 'en']) {
  const nav = footerNav(locale);
  const hubHtml = readFileSync(join(distDir, locale, 'index.html'), 'utf8');
  assert.ok(hubHtml.includes(`href="${nav.privacyPath}"`), `${locale} hub links privacy`);
  assert.ok(hubHtml.includes(`href="${nav.termsPath}"`), `${locale} hub links terms`);
  assert.ok(hubHtml.includes(`href="${nav.donateUrl}"`), `${locale} hub links donate`);
}
// Fonts: self-hosted, no third-party font requests anywhere in dist.
const fontsCss = readFileSync(join(distDir, 'fonts.css'), 'utf8');
for (const fam of ['Inter', 'Poppins', 'Barlow Condensed', 'Oswald', 'Rajdhani']) {
  assert.ok(fontsCss.includes(`font-family: '${fam}'`), `fonts.css has ${fam}`);
}
const woff2 = [...fontsCss.matchAll(/url\('([^']+\.woff2)'\)/g)].map((m) => m[1]);
assert.ok(woff2.length >= 13, 'fonts.css lists woff2 files');
for (const ref of woff2) {
  assert.ok(existsSync(join(distDir, ref.replace(/^\//, ''))), `dist has ${ref}`);
}
const distHtml = [
  join(distDir, 'index.html'),
  join(distDir, 'es', 'index.html'),
  join(distDir, 'en', 'index.html'),
].map((p) => readFileSync(p, 'utf8'));
for (const html of distHtml) {
  assert.ok(!html.includes('fonts.googleapis.com'), 'no google fonts link');
  assert.ok(!html.includes('fonts.gstatic.com'), 'no google fonts host');
  assert.ok(html.includes('href="/fonts.css"'), 'links local fonts.css');
}
for (const css of readdirSync(join(distDir, 'assets')).filter((f) => f.endsWith('.css'))) {
  const body = readFileSync(join(distDir, 'assets', css), 'utf8');
  assert.ok(!body.includes('fonts.googleapis.com'), `no google fonts in ${css}`);
}

// Late webfonts (e.g. AI-picked families) must bust the paint gates when they
// arrive, or a paused preview sticks on fallback glyphs until the next click.
const appSrc = readFileSync(join(root, 'web', 'src', 'app.ts'), 'utf8');
assert.ok(
  appSrc.includes(`document.fonts?.addEventListener('loadingdone'`),
  'app repaints when late webfonts arrive',
);
assert.ok(appSrc.includes(`lastLiveSig = ''`), 'font arrival resets the live paint gate');

console.log(`check passed: fit(120 samples) + aspects + ${files.length} templates + mvhd + widgets + catalog(${kindValues.length} kinds) + profwin + i18n + tpljson + seo(${locs.length} urls) + fontgate`);
