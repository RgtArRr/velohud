import {
  DEFAULT_TEMPLATE_THEME,
  TEMPLATE_SCHEMA_VERSION,
  classifyAspect,
  inferLayout,
  parseTemplateJson,
  resolveLayout,
  type AspectClass,
  type GearsMode,
  type GearsSide,
  type MetricId,
  type Template,
  type TimeFormat,
  type WidgetDef,
  type WidgetKind,
  type WidgetLayout,
  type WidgetStyle,
} from '@velohud/shared';
import {
  activityAvailability,
  activityFromIntervalsStreams,
  activityStartFromOffset,
  formatFixedZone,
  parseActivityXml,
  zoneOffsetHours,
  parseFit,
  parseGotoTime,
  sampleAt,
  summarize,
  formatClock,
  formatSpan,
  formatUtc,
  type Activity,
  type TelemetrySample,
} from './telemetry.js';
import { formatMetric, type Units } from './format.js';
import {
  getCreationDate,
  getCreationTime,
  resolveVideoInstant,
  type VideoZone,
} from './video-meta.js';
import { drawOverlay } from './overlay.js';
import { renderImage, renderVideo } from './render.js';
import { BUILTIN_TEMPLATES } from './templates.js';
import {
  METRIC_IDS,
  WIDGET_KINDS,
  capsFor,
  DEFAULT_WIDGET_FONT,
  defaultAlignFor,
  defaultMetricFor,
  fitShareSize,
  kindLabel,
  makeWidgetDef,
  metricLabel,
  nextWidgetId,
} from './widgets.js';
import { getLocale, saveLocale, t, type Locale } from './i18n.js';
import { DONATE_URL } from '../seo/content.js';
import {
  adjustAiTemplate,
  autoAiTemplate,
  deleteCloudTemplate,
  deleteIntervalsKey,
  fetchSession,
  generateAiTemplate,
  getIntervalsStreams,
  intervalsStatus,
  listCloudTemplates,
  listIntervalsActivities,
  login,
  logout,
  register,
  saveCloudTemplate,
  saveIntervalsKey,
  type AccountUser,
  type AiDataAvailability,
  type AiFailure,
  type IntervalsActivity,
} from './auth.js';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Sparkles glyph shared by every button that invokes the AI. */
function mkAiIcon(): HTMLSpanElement {
  const icon = el('span', 'icon icon-sparkles');
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function mkSelectRow(
  labelText: string,
  options: { value: string; label: string }[],
  selectClass: string,
): [HTMLElement, HTMLSelectElement] {
  const row = el('div', 'editor-row');
  row.append(el('span', 'muted', labelText));
  const select = el('select', `font-select ${selectClass}`);
  for (const opt of options) {
    const node = el('option', undefined, opt.label);
    node.value = opt.value;
    select.appendChild(node);
  }
  row.appendChild(select);
  return [row, select];
}

function formatOffset(sec: number): string {
  const sign = sec < 0 ? '−' : '+';
  const tenths = Math.round(Math.abs(sec) * 10);
  const h = Math.floor(tenths / 36000);
  const m = Math.floor((tenths % 36000) / 600);
  const s10 = tenths % 600;
  const ss = `${String(Math.floor(s10 / 10)).padStart(2, '0')}.${s10 % 10}`;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${ss}`;
}

const tzName = (h: number): string => {
  const sign = h < 0 ? '-' : '+';
  const abs = Math.abs(h);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  return `UTC${sign}${hh}${mm > 0 ? `:${String(mm).padStart(2, '0')}` : ''}`;
};

/** Fixed UTC offsets (hours) offered in the clip timezone selector. */
const FIXED_TZS: number[] = [
  -12, -11, -10, -9.5, -9, -8, -7, -6, -5, -4, -3.5, -3, -2, -1, 0, 1, 2, 3,
  3.5, 4, 4.5, 5, 5.5, 5.75, 6, 6.5, 7, 8, 8.75, 9, 9.5, 10, 10.5, 11, 12,
  12.75, 13, 13.75, 14,
];

/** Host UTC offset in hours, preselected for every new clip. */
const BROWSER_TZ: number = -new Date().getTimezoneOffset() / 60;

/**
 * iOS greys out picker files for extensions it cannot map (e.g. .fit), so
 * there the accept filter is dropped and types validate after picking.
 */
const IS_IOS: boolean =
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** A clip can sit anywhere inside a long activity, so the guard is generous. */
const OFFSET_LIMIT = 86400;

/** Representative sample so template thumbnails render before any activity loads. */
const DEMO_SAMPLE: TelemetrySample = {
  t: 63,
  speed: 9.5,
  heartRate: 152,
  power: 220,
  cadence: 90,
  elevation: 540,
  distance: 5200,
  grade: 4.5,
};

/** Session layout edits replace the whole anchor layout (no per-aspect data). */
type LayoutOverride = WidgetLayout;

/** One video of the ride. Sync/trim/audio are per clip; template + units are global. */
interface Clip {
  id: number;
  name: string;
  file: Blob;
  url: string;
  duration: number;
  videoCreation: Date | null;
  videoWallMs: number | null;
  tz: VideoZone;
  offsetSec: number;
  offsetDirty: boolean;
  trimStart: number;
  trimEnd: number | null;
  includeAudio: boolean;
  status: 'listo' | 'renderizando' | 'hecho' | 'error';
  /** Share flow: still images render animated totals over a synthetic clock. */
  source: 'video' | 'image';
  img: HTMLImageElement | null;
  imgW: number;
  imgH: number;
  shareAnim: number;
  shareTotal: number;
}

export async function renderApp(root: HTMLElement): Promise<void> {
  let activity: Activity | null = null;
  /** Re-anchor data for intervals activities (files carry absolute UTC): wall + fixed offset. */
  let activityTz: { wall: string; offsetHours: number } | null = null;
  let activityTzEditing = false;
  const clips: Clip[] = [];
  let selectedClipId: number | null = null;
  let nextClipId = 1;
  let rendering = false;
  let units: Units = 'metric';
  let selectedTemplateId = BUILTIN_TEMPLATES[0].id;
  const widgetOverrides = new Map<string, Map<string, boolean>>();
  const layoutOverrides = new Map<string, Map<string, LayoutOverride>>();
  const styleOverrides = new Map<string, Map<string, WidgetStyle>>();
  const widthOverrides = new Map<string, Map<string, number>>();
  const addedWidgets = new Map<string, WidgetDef[]>();
  const defOverrides = new Map<
    string,
    Map<string, { metric?: MetricId; kind?: WidgetKind; timeFormat?: TimeFormat; showUnit?: boolean; showLabel?: boolean; gearsMode?: GearsMode; gearsSide?: GearsSide }>
  >();
  /** Share flow: active when the selected clip is a still image. Main video flow untouched. */
  const SHARE_TEMPLATE_ID = 'share';
  const isImageCtx = (): boolean => activeClip()?.source === 'image';
  const SHARE_KINDS: WidgetKind[] = ['routedraw'];
  let lastVideoTemplateId: string | null = null;
  let shareT = 0;
  let shareLast = 0;
  let sharePlaying = true;
  /** Session-removed widget ids per template ("Restablecer widgets" brings them back). */
  const removedWidgets = new Map<string, Set<string>>();
  /** Bumped on any override change so thumbnails repaint (see repaintThumbs sig). */
  let overrideRev = 0;
  /** Selected widget shows outline + handle + the Widget inspector panel. */
  let selected: { templateId: string; widgetId: string } | null = null;
  /** Resize handles: squares at the widget's four corners, hit slop in CSS px. */
  const HANDLE_PX = 14;
  /** Min widget size in px: the overlay skips smaller boxes. */
  const MIN_PX_W = 24;
  const MIN_PX_H = 16;
  /** Resolve a widget to a normalized 0..1 box on a W×H canvas. */
  const resolveNorm = (
    widget: WidgetDef,
    W: number,
    H: number,
  ): { x: number; y: number; w: number; h: number } => {
    const b = resolveLayout(widget.layout, W, H);
    return { x: b.x / W, y: b.y / H, w: b.w / W, h: b.h / H };
  };
  /** Normalized box back to an anchor layout: clamp to frame + min size, then infer. */
  const normToLayout = (
    box: { x: number; y: number; w: number; h: number },
    W: number,
    H: number,
  ): WidgetLayout => {
    const w = Math.min(Math.max(box.w * W, MIN_PX_W), W);
    const h = Math.min(Math.max(box.h * H, MIN_PX_H), H);
    const x = Math.min(Math.max(box.x * W, 0), W - w);
    const y = Math.min(Math.max(box.y * H, 0), H - h);
    return inferLayout({ x, y, w, h }, W, H);
  };
  const bumpRev = (): void => {
    overrideRev += 1;
    syncExportBtns();
    schedulePersist();
    scheduleCloudSave();
  };
  /** Logged-in account; null keeps the app fully local (login-less default). */
  let account: AccountUser | null = null;
  /** Custom template ids backed by the account (synced to the cloud). */
  const cloudIds = new Set<string>();
  let persistTimer = 0;
  const schedulePersist = (): void => {
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => persistLocalCustoms(), 1000);
  };
  let cloudTimer = 0;
  let cloudErrShown = false;
  const scheduleCloudSave = (): void => {
    if (!account) return;
    window.clearTimeout(cloudTimer);
    cloudTimer = window.setTimeout(() => {
      const tpl = selectedTemplate();
      if (!account || !tpl || !cloudIds.has(tpl.id)) return;
      void saveCloudTemplate(tpl.id, tpl.name, effectiveTemplate(tpl)).then((savedId) => {
        if (!savedId) {
          if (!cloudErrShown) {
            cloudErrShown = true;
            showToast(t('auth.errCloud'));
          }
        } else {
          cloudErrShown = false;
          cloudIds.add(savedId);
          persistLocalCustoms();
        }
      });
    }, 2000);
  };

  const activeClip = (): Clip | null =>
    clips.find((c) => c.id === selectedClipId) ?? null;

  /** Session templates from the + card, newest first, ahead of the builtins. */
  const customTemplates: Template[] = [];
  const allTemplates = (): Template[] => [...customTemplates, ...BUILTIN_TEMPLATES];
  let customSeq = 0;
  const freshTemplateId = (): string => {
    customSeq += 1;
    // Random tail: two accounts creating a custom in the same millisecond must not collide (409).
    return `custom-${Date.now().toString(36)}-${customSeq}-${Math.random().toString(36).slice(2, 8)}`;
  };

  const selectedTemplate = (): Template | undefined =>
    allTemplates().find((t) => t.id === selectedTemplateId);

  const effectiveTemplate = (template: Template): Template => {
    const vis = widgetOverrides.get(template.id);
    const lay = layoutOverrides.get(template.id);
    const sty = styleOverrides.get(template.id);
    const wid = widthOverrides.get(template.id);
    const def = defOverrides.get(template.id);
    const added = addedWidgets.get(template.id);
    const removed = removedWidgets.get(template.id);
    if (!vis && !lay && !sty && !wid && !def && !added && !removed) return template;
    const apply = (w: WidgetDef): WidgetDef => {
      const pos = lay?.get(w.id);
      const style = sty?.get(w.id);
      const patch = def?.get(w.id);
      return {
        ...w,
        metric: patch?.metric ?? w.metric,
        kind: patch?.kind ?? w.kind,
        timeFormat: patch?.timeFormat ?? w.timeFormat,
        showUnit: patch?.showUnit ?? w.showUnit,
        showLabel: patch?.showLabel ?? w.showLabel,
        gearsMode: patch?.gearsMode ?? w.gearsMode,
        gearsSide: patch?.gearsSide ?? w.gearsSide,
        visible: vis?.get(w.id) ?? w.visible,
        strokeWidth: wid?.get(w.id) ?? w.strokeWidth,
        style: style ? { ...w.style, ...style } : w.style,
        layout: pos ?? w.layout,
      };
    };
    return {
      ...template,
      widgets: [
        ...template.widgets.filter((w) => !removed?.has(w.id)).map(apply),
        ...(added ?? []).map(apply),
      ],
    };
  };

  root.innerHTML = '';
  const wrap = el('main', 'app');

  // Header: project-level controls (activity, units, fixtures, render all).
  const header = el('header', 'app-header');
  const logo = el('img', 'header-logo');
  logo.src = '/icon.svg';
  logo.alt = '';
  const homeLink = el('a', 'brand');
  homeLink.href = '/';
  homeLink.append(logo, el('h1', undefined, 'velohud'));
  header.append(homeLink);
  header.append(el('span', 'local-badge', t('hdr.badge')));
  const headerSpacer = el('span', 'header-spacer');
  const headerActions = el('div', 'header-actions');
  const unitsGroup = el('div', 'seg-switch');
  unitsGroup.setAttribute('role', 'group');
  unitsGroup.setAttribute('aria-label', t('hdr.units'));
  const unitBtns: HTMLButtonElement[] = [];
  /** Segmented-control active state: one toggle shape for every seg group. */
  const syncSeg = (
    btns: Iterable<HTMLButtonElement>,
    isActive: (btn: HTMLButtonElement) => boolean,
  ): void => {
    for (const btn of btns) {
      const active = isActive(btn);
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  };
  const syncUnits = (): void => {
    syncSeg(unitBtns, (b) => b.dataset.units === units);
  };
  /** Segmented option button shared by the units and locale groups. */
  const mkSegOpt = (
    group: HTMLElement,
    key: 'units' | 'locale',
    value: string,
    text: string,
    onPick: () => void,
  ): HTMLButtonElement => {
    const btn = el('button', 'seg-opt', text);
    btn.type = 'button';
    btn.dataset[key] = value;
    btn.addEventListener('click', onPick);
    group.appendChild(btn);
    return btn;
  };
  const mkUnit = (value: Units, text: string): void => {
    const btn = mkSegOpt(unitsGroup, 'units', value, text, () => {
      if (units === value) return;
      units = value;
      syncUnits();
      renderActivityStats();
    });
    unitBtns.push(btn);
  };
  mkUnit('metric', 'km / m');
  mkUnit('imperial', 'mi / ft');
  syncUnits();
  const localeGroup = el('div', 'seg-switch');
  localeGroup.setAttribute('role', 'group');
  localeGroup.setAttribute('aria-label', t('hdr.locale'));
  const mkLocale = (value: Locale, text: string): void => {
    const btn = mkSegOpt(localeGroup, 'locale', value, text, () => {
      if (getLocale() !== value) {
        saveLocale(value);
        location.reload();
      }
    });
    const active = getLocale() === value;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  };
  mkLocale('es', 'ES');
  mkLocale('en', 'EN');
  const fixtureVertBtn = el('button', 'btn', t('hdr.fixtureVertical'));
  fixtureVertBtn.type = 'button';
  const fixtureHzBtn = el('button', 'btn', t('hdr.fixtureHorizontal'));
  fixtureHzBtn.type = 'button';
  const renderAllBtn = el('button', 'btn btn-primary', t('hdr.renderAll'));
  renderAllBtn.type = 'button';
  // Editor controls first, then a separator, then the system (language) switch.
  const headerSep = el('span', 'header-sep');
  headerSep.setAttribute('aria-hidden', 'true');
  headerActions.append(unitsGroup);
  // Fixtures are a dev-only helper: excluded from production builds.
  if (import.meta.env.DEV) headerActions.append(fixtureVertBtn, fixtureHzBtn);
  headerActions.append(renderAllBtn, headerSep, localeGroup);
  const accountBox = el('span', 'account-box');
  const loginBtn = el('button', 'btn btn-small', t('auth.login'));
  loginBtn.type = 'button';
  const accountName = el('span', 'account-name');
  const logoutBtn = el('button', 'btn btn-small', t('auth.logout'));
  logoutBtn.type = 'button';
  logoutBtn.addEventListener('click', () => {
    void logout().finally(() => location.reload());
  });
  accountBox.appendChild(loginBtn);
  headerActions.appendChild(accountBox);
  const syncAccountUI = (): void => {
    accountBox.replaceChildren();
    if (account) {
      accountName.textContent = account.name ?? account.email ?? '';
      accountBox.append(accountName, logoutBtn);
    } else {
      accountBox.appendChild(loginBtn);
    }
  };
  header.append(headerSpacer, headerActions);
  wrap.appendChild(header);
  const authDialog = el('dialog', 'add-dialog auth-dialog');
  const authH = el('h2', undefined, t('auth.loginH'));
  const authEmail = el('input', 'name-input auth-field');
  authEmail.type = 'email';
  authEmail.placeholder = t('auth.email');
  authEmail.autocomplete = 'email';
  const authPass = el('input', 'name-input auth-field');
  authPass.type = 'password';
  authPass.placeholder = t('auth.password');
  authPass.autocomplete = 'current-password';
  const authConfirm = el('input', 'name-input auth-field');
  authConfirm.type = 'password';
  authConfirm.placeholder = t('auth.confirm');
  authConfirm.autocomplete = 'new-password';
  const authPolicy = el('p', 'muted', t('auth.policy'));
  const authErr = el('p', 'auth-err', '');
  authErr.hidden = true;
  const authSubmit = el('button', 'btn btn-primary provider-btn', t('auth.goLogin'));
  authSubmit.type = 'button';
  const authToggle = el('button', 'link-btn', t('auth.toRegister'));
  authToggle.type = 'button';
  const authActions = el('div', 'add-actions');
  const authCancelBtn = el('button', 'btn', t('tpl.cancel'));
  authCancelBtn.type = 'button';
  authActions.append(authSubmit, authToggle, authCancelBtn);
  authDialog.append(authH, authEmail, authPass, authConfirm, authPolicy, authErr, authActions);
  wrap.appendChild(authDialog);
  let authMode: 'login' | 'register' = 'login';
  const syncAuthDialog = (): void => {
    const registering = authMode === 'register';
    authH.textContent = t(registering ? 'auth.registerH' : 'auth.loginH');
    authPass.autocomplete = registering ? 'new-password' : 'current-password';
    authConfirm.hidden = !registering;
    authPolicy.hidden = !registering;
    authSubmit.textContent = t(registering ? 'auth.goRegister' : 'auth.goLogin');
    authToggle.textContent = t(registering ? 'auth.toLogin' : 'auth.toRegister');
    authErr.hidden = true;
  };
  const authFail = (message: string): void => {
    authErr.textContent = message;
    authErr.hidden = false;
  };
  authToggle.addEventListener('click', () => {
    authMode = authMode === 'login' ? 'register' : 'login';
    syncAuthDialog();
  });
  authSubmit.addEventListener('click', () => {
    const email = authEmail.value.trim();
    const password = authPass.value;
    if (authMode === 'register' && password !== authConfirm.value) {
      authFail(t('auth.errMismatch'));
      return;
    }
    authSubmit.disabled = true;
    const done = authMode === 'register' ? register(email, password) : login(email, password);
    void done.then((res) => {
      authSubmit.disabled = false;
      if ('user' in res) {
        location.reload();
        return;
      }
      const key =
        res.error === 'invalid'
          ? 'auth.errInvalid'
          : res.error === 'email'
            ? 'auth.errEmail'
            : res.error === 'weak'
              ? 'auth.policy'
              : 'auth.errNet';
      authFail(t(key));
    });
  });
  syncAuthDialog();
  authDialog.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      authSubmit.click();
    }
  });
  /** showModal throws when already open: every opener goes through here. */
  const showModal = (dialog: HTMLDialogElement): void => {
    if (!dialog.open) dialog.showModal();
  };
  /** Reusable promise confirm: true on accept, false on cancel/backdrop/Escape. */
  const confirmDialogEl = el('dialog', 'add-dialog');
  const confirmH = el('h2', undefined, '');
  const confirmP = el('p', 'muted', '');
  const confirmActions = el('div', 'add-actions');
  const confirmOk = el('button', 'btn btn-primary', '');
  confirmOk.type = 'button';
  const confirmCancel = el('button', 'btn', '');
  confirmCancel.type = 'button';
  confirmActions.append(confirmOk, confirmCancel);
  confirmDialogEl.append(confirmH, confirmP, confirmActions);
  wrap.appendChild(confirmDialogEl);
  let confirmResolve: ((v: boolean) => void) | null = null;
  const closeConfirm = (v: boolean): void => {
    if (confirmDialogEl.open) confirmDialogEl.close();
    confirmResolve?.(v);
    confirmResolve = null;
  };
  confirmOk.addEventListener('click', () => closeConfirm(true));
  confirmCancel.addEventListener('click', () => closeConfirm(false));
  confirmDialogEl.addEventListener('cancel', () => closeConfirm(false));
  confirmDialogEl.addEventListener('click', (e) => {
    if (e.target === confirmDialogEl) closeConfirm(false);
  });
  const askConfirm = (title: string, body: string, okLabel: string): Promise<boolean> =>
    new Promise((resolve) => {
      closeConfirm(false);
      confirmResolve = resolve;
      confirmH.textContent = title;
      confirmP.textContent = body;
      confirmOk.textContent = okLabel;
      confirmCancel.textContent = t('tpl.cancel');
      showModal(confirmDialogEl);
    });
  loginBtn.addEventListener('click', () => {
    syncAuthDialog();
    showModal(authDialog);
  });
  authCancelBtn.addEventListener('click', () => authDialog.close());
  /** Backdrop-only close: padding and row gaps look inside the card but report
   * the dialog itself as the click target, so test coordinates instead. */
  const wireBackdropClose = (
    dialog: HTMLDialogElement,
    opts: { isBusy?: () => boolean } = {},
  ): void => {
    const outside = (e: { clientX: number; clientY: number }): boolean => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let downOutside = false;
    dialog.addEventListener('pointerdown', (e) => {
      downOutside = outside(e);
    });
    dialog.addEventListener('click', (e) => {
      if (downOutside && outside(e) && !(opts.isBusy?.())) dialog.close();
      downOutside = false;
    });
  };
  wireBackdropClose(authDialog);

  const grid = el('div', 'editor-grid');
  wrap.appendChild(grid);

  // Left column: activity block above the media bin.
  const leftCol = el('div', 'left-col');
  const activityBlock = el('section', 'activity-block');
  activityBlock.append(el('h2', undefined, t('activity.title')));
  const activityDrop = el('div', 'activity-drop', t('activity.drop'));
  activityDrop.setAttribute('role', 'button');
  activityDrop.setAttribute('tabindex', '0');
  const activityInput = el('input');
  activityInput.type = 'file';
  activityInput.accept = IS_IOS ? '' : '.fit,.gpx,.tcx';
  activityDrop.appendChild(activityInput);
  activityDrop.addEventListener('click', () => activityInput.click());
  activityDrop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activityInput.click();
    }
  });
  for (const type of ['dragenter', 'dragover'] as const) {
    activityDrop.addEventListener(type, (e) => {
      e.preventDefault();
      activityDrop.classList.add('over');
    });
  }
  activityDrop.addEventListener('dragleave', () => activityDrop.classList.remove('over'));
  activityDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    activityDrop.classList.remove('over');
    const file = (e as DragEvent).dataTransfer?.files?.[0];
    if (file) {
      void file
        .arrayBuffer()
        .then((buffer) => loadActivityFile(buffer, file.name))
        .catch(() => showToast(t('st.activityUnreadable')));
    }
  });
  // A missed drop must not navigate the app away to the raw file.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
  const activityPill = el('span', 'phase-badge', '');
  activityPill.hidden = true;
  const activityStats = el('div', 'activity-stats');
  activityStats.hidden = true;
  const intervalsPickBtn = el('button', 'btn btn-small act-btn', t('intervals.pick'));
  intervalsPickBtn.type = 'button';
  activityBlock.append(activityDrop, intervalsPickBtn, activityPill, activityStats);
  // Activity zone, intervals-only: files carry absolute UTC, provider walls
  // need a zone. Same fixed-offset selector as clips.
  const activityTzRow = el('div', 'editor-row');
  activityTzRow.append(el('span', 'muted', t('activity.tz')));
  const activityTzSelect = el('select', 'font-select tz-select');
  activityTzSelect.title = t('activity.tzTitle');
  activityTzRow.appendChild(activityTzSelect);
  activityTzRow.hidden = true;
  activityBlock.appendChild(activityTzRow);
  const syncActivityTzRow = (): void => {
    const show = activityTz !== null && activityTzEditing;
    activityTzRow.hidden = !show;
    if (!show || !activityTz) return;
    if (activityTzSelect.options.length === 0) {
      for (const h of FIXED_TZS) {
        const opt = el('option', undefined, tzName(h));
        opt.value = String(h);
        activityTzSelect.appendChild(opt);
      }
    }
    if (!FIXED_TZS.includes(activityTz.offsetHours)) {
      const opt = el('option', undefined, tzName(activityTz.offsetHours));
      opt.value = String(activityTz.offsetHours);
      activityTzSelect.appendChild(opt);
    }
    activityTzSelect.value = String(activityTz.offsetHours);
  };
  activityTzSelect.addEventListener('change', () => {
    if (!activity || !activityTz) return;
    const offsetHours = Number(activityTzSelect.value);
    const next = activityStartFromOffset(activityTz.wall, offsetHours);
    if (!next) {
      showToast(t('activity.tzInvalid'));
      activityTzSelect.value = String(activityTz.offsetHours);
      return;
    }
    activityTz.offsetHours = offsetHours;
    activity.startTime = next;
    renderActivityStats();
    for (const clip of clips) {
      if (!clip.offsetDirty) applyAutoOffset(clip);
    }
    showToast(t('activity.tzApplied', { tz: tzName(activityTz.offsetHours) }));
    activityTzEditing = false;
    syncActivityTzRow();
    binMetaSig = '';
  });
  // Intervals picker: API-key account source, same file load path.
  const icuDialog = el('dialog', 'add-dialog');
  const icuTitle = el('h2', undefined, t('intervals.title'));
  const icuKeyView = el('div');
  const icuKeyInput = el('input', 'name-input auth-field');
  icuKeyInput.type = 'password';
  icuKeyInput.placeholder = t('intervals.keyPh');
  icuKeyInput.autocomplete = 'off';
  icuKeyInput.spellcheck = false;
  const icuKeyErr = el('p', 'auth-err', '');
  icuKeyErr.hidden = true;
  const icuKeySave = el('button', 'btn btn-primary provider-btn', t('intervals.keySave'));
  icuKeySave.type = 'button';
  const icuKeyToggle = el('button', 'btn btn-small', t('intervals.keyShow'));
  icuKeyToggle.type = 'button';
  icuKeyToggle.addEventListener('click', () => {
    const show = icuKeyInput.type === 'password';
    icuKeyInput.type = show ? 'text' : 'password';
    icuKeyToggle.textContent = show ? t('intervals.keyHide') : t('intervals.keyShow');
  });
  icuKeyView.append(
    el('p', 'muted', t('intervals.keyHelp')),
    icuKeyInput,
    icuKeyToggle,
    icuKeyErr,
    icuKeySave,
  );
  const icuListView = el('div');
  const icuState = el('p', 'muted', '');
  const icuList = el('div', 'act-list');
  const icuPager = el('div', 'act-pager');
  const icuPrev = el('button', 'btn btn-small', t('intervals.prev'));
  icuPrev.type = 'button';
  const icuNext = el('button', 'btn btn-small', t('intervals.next'));
  icuNext.type = 'button';
  icuPager.append(icuPrev, icuNext);
  icuListView.append(icuState, icuList, icuPager);
  const icuActions = el('div', 'add-actions');
  const icuDisconnect = el('button', 'link-btn', t('intervals.disconnect'));
  icuDisconnect.type = 'button';
  const icuCancel = el('button', 'btn', t('tpl.cancel'));
  icuCancel.type = 'button';
  icuActions.append(icuDisconnect, icuCancel);
  icuDialog.append(icuTitle, icuKeyView, icuListView, icuActions);
  wrap.appendChild(icuDialog);
  icuCancel.addEventListener('click', () => icuDialog.close());
  let icuBusy = false;
  const setIcuBusy = (busy: boolean): void => {
    icuBusy = busy;
    icuList.querySelectorAll('button').forEach((b) => {
      b.disabled = busy;
    });
    icuPrev.disabled = busy || icuPage <= 1;
    icuNext.disabled = busy || icuPage >= ICU_MAX_PAGE;
    icuCancel.disabled = busy;
    icuDisconnect.disabled = busy;
  };
  wireBackdropClose(icuDialog, { isBusy: () => icuBusy });
  icuDialog.addEventListener('cancel', (e) => {
    if (icuBusy) e.preventDefault();
  });
  const ICU_MAX_PAGE = 12;
  let icuPage = 1;
  const showIcuKey = (message: string): void => {
    icuTitle.textContent = t('intervals.keyH');
    icuKeyView.hidden = false;
    icuListView.hidden = true;
    icuDisconnect.hidden = true;
    icuKeyErr.textContent = message;
    icuKeyErr.hidden = message === '';
  };
  /** The API said the login (not the ICU key) expired: drop the account and prompt sign-in. */
  const icuLoginExpired = (): void => {
    account = null;
    syncAccountUI();
    icuDialog.close();
    syncAuthDialog();
    showModal(authDialog);
    showToast(t('intervals.loginExpired'));
  };
  const renderIcuPage = async (): Promise<void> => {
    icuState.textContent = t('intervals.loading');
    icuList.replaceChildren();
    icuPrev.disabled = true;
    icuNext.disabled = true;
    const res = await listIntervalsActivities(icuPage);
    if ('error' in res) {
      if (res.error === 'login') {
        icuLoginExpired();
        return;
      }
      if (res.error === 'reconnect') showIcuKey(t('intervals.reconnect'));
      else icuState.textContent = t('intervals.error');
      return;
    }
    if (res.activities.length === 0) {
      icuState.textContent = t('intervals.empty');
    } else {
      icuState.textContent = '';
    }
    for (const a of res.activities) {
      const row = el('button', 'act-row');
      row.type = 'button';
      const when = new Date(a.start_date_local);
      const date = Number.isNaN(when.getTime()) ? '' : when.toLocaleDateString(localeTag());
      const sport = a.type ? ` · ${a.type}` : '';
      row.append(
        el('span', 'act-name', a.name || a.type || a.id),
        el('span', 'muted', `${date}${sport} · ${formatSpan(a.elapsed_time)}`),
      );
      row.addEventListener('click', () => void pickIcuActivity(a));
      icuList.appendChild(row);
    }
    icuPrev.disabled = icuPage <= 1;
    icuNext.disabled = icuPage >= ICU_MAX_PAGE;
  };
  /** Determinate loading state first, so no stale view flashes. */
  const showIcuLoading = (): void => {
    icuTitle.textContent = t('intervals.title');
    icuKeyView.hidden = true;
    icuListView.hidden = false;
    icuDisconnect.hidden = true;
    icuList.replaceChildren();
    icuState.textContent = t('intervals.loading');
    icuPrev.disabled = true;
    icuNext.disabled = true;
  };
  const refreshIcu = async (): Promise<void> => {
    showIcuLoading();
    const status = await intervalsStatus();
    if (status === 'login') {
      icuLoginExpired();
      return;
    }
    if (status === 'net') {
      icuState.textContent = t('intervals.error');
      return;
    }
    if (status === 'disconnected') {
      showIcuKey('');
      return;
    }
    icuDisconnect.hidden = false;
    void renderIcuPage();
  };
  const localeTag = (): string => (getLocale() === 'es' ? 'es-ES' : 'en-US');
  const turnIcuPage = (delta: -1 | 1): void => {
    const next = icuPage + delta;
    if (next < 1 || next > ICU_MAX_PAGE) return;
    icuPage = next;
    void renderIcuPage();
  };
  icuPrev.addEventListener('click', () => turnIcuPage(-1));
  icuNext.addEventListener('click', () => turnIcuPage(1));
  icuKeySave.addEventListener('click', () => {
    const key = icuKeyInput.value.trim();
    if (!key) {
      showIcuKey(t('intervals.keyBad'));
      return;
    }
    icuKeySave.disabled = true;
    void saveIntervalsKey(key).then((ok) => {
      icuKeySave.disabled = false;
      if (ok) {
        icuKeyInput.value = '';
        icuPage = 1;
        void refreshIcu();
      } else {
        showIcuKey(t('intervals.keyBad'));
      }
    });
  });
  icuDisconnect.addEventListener('click', () => {
    void deleteIntervalsKey().then(() => showIcuKey(''));
  });
  const pickIcuActivity = async (a: IntervalsActivity): Promise<void> => {
    if (icuBusy) return;
    setIcuBusy(true);
    try {
      icuState.textContent = t('intervals.loading');
      const res = await getIntervalsStreams(a.id);
      if ('error' in res) {
        if (res.error === 'login') {
          icuLoginExpired();
          return;
        }
        if (res.error === 'reconnect') showIcuKey(t('intervals.reconnect'));
        else icuState.textContent = t('intervals.error');
        return;
      }
      try {
        const act = activityFromIntervalsStreams(res.streams, a.start_date_local, a.timezone);
        icuDialog.close();
        loadActivity(act, t('intervals.source', { name: a.name || a.id }), {
          wall: a.start_date_local,
          offsetHours: zoneOffsetHours(act.startTime, a.timezone ?? 'UTC') ?? 0,
        });
      } catch (err) {
        activity = null;
        activityTz = null;
        activityTzEditing = false;
        activityPill.hidden = true;
        renderActivityStats();
        syncActivityTzRow();
        showToast(err instanceof Error ? err.message : t('intervals.error'));
      }
    } finally {
      setIcuBusy(false);
    }
  };
  intervalsPickBtn.addEventListener('click', () => {
    if (!account) {
      syncAuthDialog();
      showModal(authDialog);
      return;
    }
    icuPage = 1;
    showIcuLoading();
    showModal(icuDialog);
    void refreshIcu();
  });
  leftCol.appendChild(activityBlock);
  /** Basic stats of the loaded activity, re-rendered on load and on units change. */
  const renderActivityStats = (): void => {
    activityStats.replaceChildren();
    if (!activity) {
      activityStats.hidden = true;
      return;
    }
    const s = summarize(activity);
    const dist = formatMetric('distance', s.distanceM, units);
    const endDate = new Date(activity.startTime.getTime() + s.durationSec * 1000);
    const mkStampRow = (label: string, date: Date, editable: boolean): void => {
      const row = el('div', 'activity-stat');
      const value = el('span', 'activity-stat-v', formatUtc(date));
      if (Number.isFinite(date.getTime())) {
        const offH = activityTz?.offsetHours ?? -date.getTimezoneOffset() / 60;
        value.title = t('activity.localTip', {
          time: formatFixedZone(date, offH),
          off: tzName(offH),
        });
      }
      if (editable) {
        const editBtn = el('button', 'icon-btn');
        editBtn.type = 'button';
        editBtn.title = t('activity.tzEdit');
        editBtn.setAttribute('aria-label', t('activity.tzEdit'));
        editBtn.appendChild(el('span', 'icon icon-edit'));
        editBtn.addEventListener('click', () => {
          activityTzEditing = true;
          syncActivityTzRow();
          activityTzSelect.focus();
        });
        value.append(' ', editBtn);
      }
      row.append(el('span', 'muted', label), value);
      activityStats.appendChild(row);
    };
    mkStampRow(t('activity.start'), activity.startTime, activityTz !== null);
    mkStampRow(t('activity.end'), endDate, false);
    const rows: [string, string][] = [
      [t('activity.dur'), formatSpan(s.durationSec)],
      [t('activity.dist'), `${dist.value} ${dist.unit}`],
      [t('activity.samples'), String(s.samples)],
    ];
    if (s.avgSpeed !== null) {
      const avg = formatMetric('speed', s.avgSpeed, units);
      rows.push([t('activity.avgSpeed'), `${avg.value} ${avg.unit}`]);
    }
    if (s.avgHeartRate !== null) rows.push([t('activity.avgHr'), `${Math.round(s.avgHeartRate)} bpm`]);
    if (s.avgPower !== null) rows.push([t('activity.avgPower'), `${Math.round(s.avgPower)} W`]);
    for (const [label, value] of rows) {
      const row = el('div', 'activity-stat');
      row.append(el('span', 'muted', label), el('span', 'activity-stat-v', value));
      activityStats.appendChild(row);
    }
    activityStats.hidden = false;
  };

  // Media bin (left): the ride's clips.
  const bin = el('aside', 'bin');
  const binHead = el('div', 'bin-head');
  binHead.append(el('h2', undefined, t('bin.title')));
  const binCount = el('span', 'muted', '0');
  binHead.appendChild(binCount);
  const addLabel = el('button', 'file-label', t('bin.add'));
  addLabel.type = 'button';
  addLabel.hidden = true;
  const videoInput = el('input');
  videoInput.type = 'file';
  videoInput.accept =
    'video/mp4,.mp4,video/quicktime,.mov,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';
  videoInput.multiple = true;
  const binDrop = el('div', 'bin-drop', t('bin.drop'));
  binDrop.setAttribute('role', 'button');
  binDrop.setAttribute('tabindex', '0');
  binDrop.appendChild(videoInput);
  addLabel.addEventListener('click', () => videoInput.click());
  binDrop.addEventListener('click', () => videoInput.click());
  binDrop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      videoInput.click();
    }
  });
  const addDropped = (files: FileList | null | undefined): void => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (/\.(mp4|mov)$/i.test(file.name) || file.type.startsWith('video/')) {
        addClip(file, file.name);
      }
    }
  };
  for (const type of ['dragenter', 'dragover'] as const) {
    bin.addEventListener(type, (e) => {
      e.preventDefault();
      bin.classList.add('over');
    });
  }
  bin.addEventListener('dragleave', (e) => {
    if (e.target === bin) bin.classList.remove('over');
  });
  bin.addEventListener('drop', (e) => {
    e.preventDefault();
    bin.classList.remove('over');
    addDropped((e as DragEvent).dataTransfer?.files);
  });
  const binList = el('div', 'bin-list');
  bin.append(binHead, addLabel, binDrop, binList);
  leftCol.appendChild(bin);
  grid.appendChild(leftCol);

  // Center: viewer + sync + templates.
  const center = el('div', 'center');
  grid.appendChild(center);
  const stage = el('section', 'stage');
  const video = el('video', 'source-video');
  video.preload = 'auto';
  video.setAttribute('aria-hidden', 'true');
  /** Which clip the current video src belongs to (loadedmetadata may land after a switch). */
  let srcClipId: number | null = null;
  const canvas = el('canvas', 'live-preview');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', t('stage.ariaPreview'));
  const liveCtx = canvas.getContext('2d');
  if (!liveCtx) throw new Error(t('stage.errCanvas'));
  const timeline = el('input', 'timeline');
  timeline.type = 'range';
  timeline.min = '0';
  timeline.max = '0';
  timeline.step = '0.05';
  timeline.value = '0';
  timeline.disabled = true;
  timeline.setAttribute('aria-label', t('stage.ariaTimeline'));
  const clocks = el('div', 'clocks');
  const playBtn = el('button', 'btn btn-small play-btn');
  playBtn.type = 'button';
  playBtn.disabled = true;
  playBtn.setAttribute('aria-label', t('stage.play'));
  const playIcon = el('span', 'icon icon-play');
  playIcon.setAttribute('aria-hidden', 'true');
  playBtn.appendChild(playIcon);
  const videoClock = el('span', undefined, t('stage.video', { vt: '00:00', dur: '00:00' }));
  const teleClock = el('span', undefined, t('stage.teleNone'));
  const offsetClock = el('strong', undefined, formatOffset(0));
  clocks.append(playBtn, videoClock, teleClock, offsetClock);
  const touchCapable = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  const coarsePointer =
    (window.matchMedia?.('(pointer: coarse)').matches ?? false) ||
    (touchCapable && (window.matchMedia?.('(max-width: 640px)').matches ?? false));
  const stageHint = el(
    'p',
    'muted',
    coarsePointer ? t('stage.hintTouch') : t('stage.hint'),
  );
  const stageTools = el('div', 'stage-tools');
  stage.append(stageTools, video, canvas, timeline, clocks, stageHint);
  center.appendChild(stage);

  // Sync lives right under the video timeline.
  const syncBox = el('section', 'offset-box');
  syncBox.append(el('h2', undefined, t('sync.title')));
  const offsetBtns = el('div', 'offset-btns');
  syncBox.append(offsetBtns);
  syncBox.append(
    el(
      'p',
      'muted',
      coarsePointer ? t('sync.hintTouch') : t('sync.hint'),
    ),
  );
  center.appendChild(syncBox);

  // Template selector, right under the live preview.
  const templateBox = el('section', 'template-box');
  const templateHead = el('div', 'template-head');
  templateHead.append(el('h2', undefined, t('tpl.title')));
  const resetWidgetsBtn = el('button', 'btn btn-small', t('tpl.reset'));
  resetWidgetsBtn.type = 'button';
  resetWidgetsBtn.title = t('tpl.resetTitle');
  resetWidgetsBtn.addEventListener('click', () => {
    const template = selectedTemplate();
    if (!template) return;
    widgetOverrides.delete(template.id);
    layoutOverrides.delete(template.id);
    styleOverrides.delete(template.id);
    widthOverrides.delete(template.id);
    addedWidgets.delete(template.id);
    defOverrides.delete(template.id);
    removedWidgets.delete(template.id);
    selected = null;
    bumpRev();
  });
  const addOpenBtn = el('button', 'btn btn-small btn-primary', t('tpl.add'));
  addOpenBtn.type = 'button';
  addOpenBtn.title = t('tpl.addTitle');
  // Add lives in a modal: the inspector keeps swapping clip/widget/render only.
  const addDialog = el('dialog', 'add-dialog');
  addDialog.append(el('h2', undefined, t('tpl.addH')));
  const [addKindRow, addKindSel] = mkSelectRow(
    t('tpl.type'),
    WIDGET_KINDS.map((value) => ({ value, label: kindLabel(value) })),
    'kind-select',
  );
  const [addMetricRow, addMetricSel] = mkSelectRow(
    t('tpl.metric'),
    METRIC_IDS.map((value) => ({ value, label: metricLabel(value) })),
    'metric-select',
  );
  addKindSel.setAttribute('autofocus', '');
  addMetricSel.value = defaultMetricFor(addKindSel.value as WidgetKind);
  addKindSel.addEventListener('change', () => {
    addMetricSel.value = defaultMetricFor(addKindSel.value as WidgetKind);
  });
  const addActions = el('div', 'add-actions');
  const addConfirmBtn = el('button', 'btn btn-primary', t('tpl.confirm'));
  addConfirmBtn.type = 'button';
  const addCancelBtn = el('button', 'btn', t('tpl.cancel'));
  addCancelBtn.type = 'button';
  addActions.append(addConfirmBtn, addCancelBtn);
  addDialog.append(addKindRow, addMetricRow, addActions);
  addCancelBtn.addEventListener('click', () => addDialog.close());
  // Backdrop-only close: padding and row gaps look inside the card but report
  // the dialog itself as the click target, so test coordinates instead.
  wireBackdropClose(addDialog);
  addConfirmBtn.addEventListener('click', () => {
    const template = selectedTemplate();
    if (!template) return;
    const kind = addKindSel.value as WidgetKind;
    const metric = addMetricSel.value as MetricId;
    const current = effectiveTemplate(template).widgets;
    const id = nextWidgetId(
      current.map((w) => w.id),
      kind,
    );
    const slot = addedWidgets.get(template.id)?.length ?? 0;
    const list = addedWidgets.get(template.id) ?? [];
    list.push(makeWidgetDef(kind, metric, id, slot));
    addedWidgets.set(template.id, list);
    selected = { templateId: template.id, widgetId: id };
    addDialog.close();
    bumpRev();
  });
  addOpenBtn.addEventListener('click', () => showModal(addDialog));
  /** Export downloads a template with its current widget setup. */
  const downloadTemplate = (template: Template): void => {
    const slug = template.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const blob = new Blob([JSON.stringify(effectiveTemplate(template), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug || template.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Delayed: revoking synchronously can cancel the download before it starts.
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  templateHead.append(resetWidgetsBtn);
  stageTools.appendChild(addOpenBtn);
  wrap.appendChild(addDialog);
  templateBox.appendChild(templateHead);
  interface Thumb {
    template: Template;
    card: HTMLElement;
    open: HTMLButtonElement;
    exp: HTMLButtonElement;
    custom: boolean;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    sig: string;
  }
  let thumbAspect: AspectClass = 'horizontal';
  let lastThumbSample: TelemetrySample = DEMO_SAMPLE;
  const thumbs: Thumb[] = [];
  const cardsBox = el('div', 'template-cards');
  const syncCards = (): void => {
    for (const th of thumbs) {
      const active = th.template.id === selectedTemplateId;
      th.card.classList.toggle('selected', active);
      th.open.setAttribute('aria-pressed', String(active));
    }
  };
  const thumbErr = t('tpl.errThumb');
  /** Any session edit (move, hide, add, delete, restyle, kind/metric, width). */
  const isEdited = (id: string): boolean =>
    [widgetOverrides, layoutOverrides, styleOverrides, widthOverrides, defOverrides].some(
      (m) => (m.get(id)?.size ?? 0) > 0,
    ) ||
    (addedWidgets.get(id)?.length ?? 0) > 0 ||
    (removedWidgets.get(id)?.size ?? 0) > 0;
  /** Builtins show export only once edited; customs always (export is their only save). */
  const syncExportBtns = (): void => {
    for (const th of thumbs) {
      th.exp.hidden = !th.custom && !isEdited(th.template.id);
    }
  };
  /** Card corner button: titled + labelled, with an icon glyph or '×' text. */
  const mkCardIconBtn = (
    className: string,
    title: string,
    label: string,
    iconClass: string | null,
    onClick: () => void,
  ): HTMLButtonElement => {
    const btn = el('button', className);
    btn.type = 'button';
    if (iconClass === null) btn.textContent = '×';
    else {
      const icon = el('span', `icon ${iconClass}`);
      icon.setAttribute('aria-hidden', 'true');
      btn.appendChild(icon);
    }
    btn.title = title;
    btn.setAttribute('aria-label', label);
    btn.addEventListener('click', onClick);
    return btn;
  };
  const addCard = (tpl: Template, custom = false): HTMLElement => {
    const card = el('div', 'template-card');
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 512;
    thumbCanvas.height = 288;
    thumbCanvas.className = 'template-thumb';
    thumbCanvas.setAttribute('aria-hidden', 'true');
    const thumbCtx = thumbCanvas.getContext('2d');
    if (!thumbCtx) throw new Error(thumbErr);
    const openBtn = el('button', 'template-open');
    openBtn.type = 'button';
    openBtn.setAttribute('aria-label', tpl.name);
    openBtn.appendChild(thumbCanvas);
    const selectThis = (): void => {
      selectedTemplateId = tpl.id;
      syncCards();
    };
    openBtn.addEventListener('click', selectThis);
    const nameBtn = el('button', 'template-name', tpl.name);
    nameBtn.type = 'button';
    nameBtn.addEventListener('click', selectThis);
    /** Customs rename inline (double-click): builtins are a fixed catalog. */
    if (custom) {
      nameBtn.title = t('tpl.renameTitle');
      nameBtn.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (nameBtn.isContentEditable) return;
        nameBtn.contentEditable = 'true';
        nameBtn.focus();
        document.getSelection()?.selectAllChildren(nameBtn);
        const commit = (save: boolean): void => {
          nameBtn.contentEditable = 'false';
          nameBtn.removeEventListener('blur', onBlur);
          nameBtn.removeEventListener('keydown', onKey);
          const next = (nameBtn.textContent ?? '').trim().slice(0, 60);
          if (save && next && next !== tpl.name) {
            tpl.name = next;
            nameBtn.textContent = next;
            openBtn.setAttribute('aria-label', next);
            schedulePersist();
            if (account && cloudIds.has(tpl.id)) {
              void saveCloudTemplate(tpl.id, tpl.name, effectiveTemplate(tpl)).then((savedId) => {
                if (!savedId) showToast(t('auth.errCloud'));
              });
            }
          } else {
            nameBtn.textContent = tpl.name;
          }
        };
        const onBlur = (): void => commit(true);
        const onKey = (ev: KeyboardEvent): void => {
          if (ev.isComposing || ev.keyCode === 229) return;
          // code fallback: some keyboards/automation emit no key (calibrated headless).
          const k = ev.key || ev.code;
          if (k === 'Enter') {
            ev.preventDefault();
            nameBtn.blur();
          } else if (k === 'Escape') {
            ev.preventDefault();
            commit(false);
          }
        };
        nameBtn.addEventListener('blur', onBlur);
        nameBtn.addEventListener('keydown', onKey);
      });
    }
    const foot = el('div', 'card-foot');
    foot.appendChild(nameBtn);
    const exportBtn = mkCardIconBtn('card-export', t('tpl.exportTitle'), t('tpl.export'), 'icon-download', () =>
      downloadTemplate(tpl),
    );
    if (custom) {
      const delBtn = mkCardIconBtn('card-delete', t('tpl.deleteTitle'), t('tpl.delete'), null, () => {
        void askConfirm(t('tpl.deleteH'), t('tpl.deleteBody', { name: tpl.name }), t('tpl.delete')).then(
          (ok) => {
            if (ok) deleteCustom(tpl.id);
          },
        );
      });
      foot.appendChild(delBtn);
    }
    const cardAiBtn = mkCardIconBtn('card-ai', t('ai.improveTitle'), t('ai.improveTitle'), 'icon-sparkles', () =>
      openAdjustDialog(tpl),
    );
    // The AI schema doesn't know share kinds: offering adjust would strip them.
    foot.append(exportBtn);
    if (tpl.id !== SHARE_TEMPLATE_ID) foot.appendChild(cardAiBtn);
    card.append(openBtn, foot);
    cardsBox.appendChild(card);
    thumbs.push({
      template: tpl,
      card,
      open: openBtn,
      exp: exportBtn,
      custom,
      canvas: thumbCanvas,
      ctx: thumbCtx,
      sig: '',
    });
    syncExportBtns();
    return card;
  };
  // "+" card first: same size as a template, white with a black border.
  const newCard = el('button', 'template-card new-template');
  newCard.type = 'button';
  newCard.title = t('tpl.newTitle');
  newCard.setAttribute('aria-label', t('tpl.newTitle'));
  newCard.append(el('span', 'new-plus', '+'), el('span', 'template-name', t('tpl.new')));
  cardsBox.appendChild(newCard);
  for (const tpl of allTemplates()) addCard(tpl);
  /** Image context shows only the share card; the share card hides everywhere else. */
  const syncCardGate = (): void => {
    const image = isImageCtx();
    for (const th of thumbs) th.card.hidden = image ? th.template.id !== SHARE_TEMPLATE_ID : th.template.id === SHARE_TEMPLATE_ID;
    newCard.hidden = image;
  };
  syncCardGate();
  /** Thumbnails mirror the loaded video's aspect so cards preview the real layout. */
  const sizeThumbs = (): void => {
    const dims =
      thumbAspect === 'vertical'
        ? { w: 162, h: 288 }
        : thumbAspect === 'square'
          ? { w: 288, h: 288 }
          : { w: 512, h: 288 };
    for (const th of thumbs) {
      th.canvas.width = dims.w;
      th.canvas.height = dims.h;
      th.sig = '';
    }
    // "+" card matches a template card: 108px thumb height (style.css) + 16px padding + 4px border.
    newCard.style.width = `${((108 * dims.w) / dims.h + 20).toFixed(1)}px`;
  };
  sizeThumbs();
  templateBox.appendChild(cardsBox);
  // Vertical wheel over the strip scrolls it horizontally; page scroll resumes at the ends.
  cardsBox.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = cardsBox.scrollWidth - cardsBox.clientWidth;
      if (max <= 0) return;
      const atStart = cardsBox.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = cardsBox.scrollLeft >= max && e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      cardsBox.scrollLeft += e.deltaY;
    },
    { passive: false },
  );
  syncCards();
  // New-template dialog: name a blank template or restore an exported JSON.
  const newDialog = el('dialog', 'add-dialog');
  newDialog.append(el('h2', undefined, t('tpl.createH')));
  const nameRow = el('div', 'editor-row');
  nameRow.append(el('span', 'muted', t('tpl.nameLabel')));
  const nameInput = el('input', 'name-input');
  nameInput.type = 'text';
  nameInput.placeholder = t('tpl.namePh');
  nameInput.maxLength = 60;
  nameInput.setAttribute('autofocus', '');
  nameRow.appendChild(nameInput);
  const fileRow = el('div', 'editor-row');
  fileRow.append(el('span', 'muted', t('tpl.fileLabel')));
  const fileInput = el('input', 'name-input');
  fileInput.type = 'file';
  fileInput.accept = IS_IOS ? '' : 'application/json,.json';
  fileRow.appendChild(fileInput);
  const importErr = el('p', 'import-err', t('tpl.errImport'));
  importErr.hidden = true;
  type NewMode = 'blank' | 'import' | 'ai' | 'auto';
  const modeTabs = el('div', 'seg-switch fill tab-bar');
  modeTabs.setAttribute('role', 'tablist');
  modeTabs.setAttribute('aria-label', t('tpl.createH'));
  const tabBtns = new Map<NewMode, HTMLButtonElement>();
  for (const [mode, text] of [
    ['blank', t('tpl.tabBlank')],
    ['import', t('tpl.tabImport')],
    ['ai', t('tpl.tabAi')],
    ['auto', t('ai.auto')],
  ] as [NewMode, string][]) {
    const btn = el('button', 'seg-opt', text);
    btn.type = 'button';
    if (mode === 'ai' || mode === 'auto') {
      btn.classList.add('has-icon');
      btn.prepend(mkAiIcon());
    }
    btn.setAttribute('role', 'tab');
    btn.dataset.newMode = mode;
    modeTabs.appendChild(btn);
    tabBtns.set(mode, btn);
  }
  const blankBody = el('p', 'muted', t('tpl.blankHint'));
  const promptRow = el('div', 'prompt-row');
  promptRow.append(el('span', 'muted', t('ai.promptLabel')));
  const promptInput = document.createElement('textarea');
  promptInput.className = 'name-input prompt-input';
  promptInput.placeholder = t('ai.promptPh');
  promptInput.maxLength = 500;
  promptInput.rows = 4;
  promptRow.appendChild(promptInput);
  promptRow.hidden = true;
  const autoBody = el('p', 'muted', t('ai.autoBody'));
  autoBody.hidden = true;
  const newActions = el('div', 'add-actions');
  const primaryBtn = el('button', 'btn btn-primary has-icon');
  primaryBtn.type = 'button';
  const primaryIcon = mkAiIcon();
  const primaryLabel = el('span', undefined, t('tpl.create'));
  primaryBtn.append(primaryIcon, primaryLabel);
  const newCancelBtn = el('button', 'btn', t('tpl.cancel'));
  newCancelBtn.type = 'button';
  newActions.append(primaryBtn, newCancelBtn);
  newDialog.append(modeTabs, nameRow, blankBody, fileRow, promptRow, autoBody, importErr, newActions);
  newCancelBtn.addEventListener('click', () => newDialog.close());
  wireBackdropClose(newDialog, { isBusy: () => aiBusy });
  newDialog.addEventListener('cancel', (e) => {
    if (aiBusy) e.preventDefault();
  });
  /** Drops a session custom (card + model) so cloud restores can replace it. */
  const removeCustom = (id: string): void => {
    widgetOverrides.delete(id);
    layoutOverrides.delete(id);
    styleOverrides.delete(id);
    widthOverrides.delete(id);
    defOverrides.delete(id);
    addedWidgets.delete(id);
    removedWidgets.delete(id);
    const ti = thumbs.findIndex((th) => th.custom && th.template.id === id);
    if (ti >= 0) {
      thumbs[ti].card.remove();
      thumbs.splice(ti, 1);
    }
    const ci = customTemplates.findIndex((c) => c.id === id);
    if (ci >= 0) customTemplates.splice(ci, 1);
  };
  /** User deletes a custom: drop it locally and from the cloud. No confirm (matches widget delete). */
  const deleteCustom = (id: string): void => {
    if (cloudIds.has(id)) {
      cloudIds.delete(id);
      void deleteCloudTemplate(id).then((ok) => {
        if (!ok) showToast(t('auth.errCloud'));
      });
    }
    const wasSelected = selectedTemplateId === id;
    removeCustom(id);
    if (wasSelected) {
      selectedTemplateId = allTemplates()[0]?.id ?? '';
      selected = null;
    }
    syncCards();
    sizeThumbs();
    bumpRev();
  };
  /** Custom templates land right after the + card, selected and ready. */
  const insertCustom = (tpl: Template, silent = false): void => {
    removeCustom(tpl.id);
    customTemplates.unshift(tpl);
    const card = addCard(tpl, true);
    cardsBox.insertBefore(card, newCard.nextSibling);
    if (!silent) {
      selectedTemplateId = tpl.id;
      selected = null;
      cardsBox.scrollLeft = 0;
    }
    syncCards();
    syncCardGate();
    sizeThumbs();
    bumpRev();
    if (account && !cloudIds.has(tpl.id)) {
      void saveCloudTemplate(tpl.id, tpl.name, effectiveTemplate(tpl)).then((savedId) => {
        // Adopt whatever id the server stored (it round-trips ours today).
        if (savedId) cloudIds.add(savedId);
        else showToast(t('auth.errCloud'));
      });
    }
  };
  let newMode: NewMode = 'blank';
  let aiBusy = false;
  const syncPrimary = (): void => {
    primaryLabel.textContent =
      aiBusy
        ? t('ai.generating')
        : newMode === 'ai' || newMode === 'auto'
          ? t('ai.generate')
          : t('tpl.create');
    primaryIcon.hidden = !aiBusy && newMode !== 'ai' && newMode !== 'auto';
    primaryBtn.disabled =
      aiBusy ||
      (newMode === 'import' && !fileInput.files?.length) ||
      (newMode === 'ai' && !promptInput.value.trim());
  };
  const setNewMode = (mode: NewMode): void => {
    newMode = mode;
    nameRow.hidden = mode !== 'blank';
    blankBody.hidden = mode !== 'blank';
    fileRow.hidden = mode !== 'import';
    promptRow.hidden = mode !== 'ai';
    autoBody.hidden = mode !== 'auto';
    importErr.hidden = true;
    syncSeg(tabBtns.values(), (btn) => btn.dataset.newMode === mode);
    syncPrimary();
  };
  const aspectNow = (): string =>
    activeClip() ? classifyAspect(canvas.width, canvas.height) : 'vertical';
  /** Data availability for AI create calls; undefined without an activity (server fails open). */
  const aiAvailable = (): AiDataAvailability | undefined =>
    activity ? activityAvailability(activity) : undefined;
  const runAiRequest = (req: Promise<Template | AiFailure>): void => {
    aiBusy = true;
    syncPrimary();
    const aiReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    newDialog.inert = true;
    importErr.hidden = true;
    void req.then((result) => {
      aiBusy = false;
      syncPrimary();
      newDialog.inert = false;
      aiReturnFocus?.focus();
      if (typeof result === 'string') {
        importErr.textContent =
          result === 'login' ? t('ai.errLogin') : result === 'net' ? t('ai.errNet') : t('ai.errInvalid');
        importErr.hidden = false;
        return;
      }
      insertCustom({
        ...result,
        id: freshTemplateId(),
        name: result.name.trim() || t('tpl.untitled'),
      });
      newDialog.close();
    });
  };
  /** Current video frame as a small JPEG data URL for the auto mode. */
  const captureFrame = (): string | null => {
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;
    const shot = document.createElement('canvas');
    const scale = Math.min(1, 480 / video.videoWidth);
    shot.width = Math.max(2, Math.round(video.videoWidth * scale));
    shot.height = Math.max(2, Math.round(video.videoHeight * scale));
    const shotCtx = shot.getContext('2d');
    if (!shotCtx) return null;
    shotCtx.drawImage(video, 0, 0, shot.width, shot.height);
    return shot.toDataURL('image/jpeg', 0.7);
  };
  primaryBtn.addEventListener('click', () => {
    const typed = nameInput.value.trim();
    if (newMode === 'blank') {
      insertCustom({
        schemaVersion: TEMPLATE_SCHEMA_VERSION,
        id: freshTemplateId(),
        name: typed || t('tpl.untitled'),
        theme: { ...DEFAULT_TEMPLATE_THEME },
        widgets: [],
      });
      newDialog.close();
      return;
    }
    if (newMode === 'import') {
      const file = fileInput.files?.[0] ?? null;
      if (!file) return;
      void file
        .text()
        .then((text) => {
          let tpl: Template;
          try {
            tpl = parseTemplateJson(text);
          } catch (err) {
            importErr.textContent =
              err instanceof Error && err.message === 'legacy template'
                ? t('tpl.errLegacy')
                : t('tpl.errImport');
            importErr.hidden = false;
            return;
          }
          insertCustom({
            ...tpl,
            id: freshTemplateId(),
            name: tpl.name.trim() || t('tpl.untitled'),
          });
          newDialog.close();
        })
        .catch(() => {
          importErr.hidden = false;
        });
      return;
    }
    if (aiBusy) return;
    if (newMode === 'ai') {
      const prompt = promptInput.value.trim();
      if (!prompt) return;
      runAiRequest(generateAiTemplate(prompt, aspectNow(), aiAvailable()));
      return;
    }
    const image = captureFrame();
    if (!image) {
      showToast(t('ai.needClip'));
      return;
    }
    runAiRequest(autoAiTemplate(image, aspectNow(), aiAvailable()));
  });
  setNewMode('blank');
  const AI_CONSENT_KEY = 'override.aiConsent';
  const AI_CONSENT_FRAME_KEY = 'override.aiConsentFrame';
  const hasAiConsent = (key: string): boolean => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  };
  promptInput.addEventListener('input', syncPrimary);
  fileInput.addEventListener('change', syncPrimary);
  const ensureAiConsent = async (body: string, key = AI_CONSENT_KEY): Promise<boolean> => {
    if (hasAiConsent(key)) return true;
    const ok = await askConfirm(t('ai.consentH'), body, t('ai.continue'));
    if (!ok) return false;
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* private mode: ask again next time */
    }
    return true;
  };
  tabBtns.get('blank')?.addEventListener('click', () => setNewMode('blank'));
  tabBtns.get('import')?.addEventListener('click', () => setNewMode('import'));
  tabBtns.get('ai')?.addEventListener('click', () => {
    void ensureAiConsent(t('ai.consentBody')).then((ok) => {
      if (!ok) return;
      setNewMode('ai');
      promptInput.focus();
    });
  });
  tabBtns.get('auto')?.addEventListener('click', () => {
    void ensureAiConsent(t('ai.consentBodyAuto'), AI_CONSENT_FRAME_KEY).then((ok) => {
      if (!ok) return;
      setNewMode('auto');
    });
  });
  newCard.addEventListener('click', () => {
    // No video, no modal: creation (blank, import, AI) needs the video aspect.
    if (activeClip() === null || video.videoWidth === 0) {
      showToast(t('ai.needClip'));
      return;
    }
    nameInput.value = '';
    fileInput.value = '';
    promptInput.value = '';
    importErr.textContent = t('tpl.errImport');
    importErr.hidden = true;
    setNewMode('blank');
    showModal(newDialog);
  });
  const adjustDialog = el('dialog', 'add-dialog');
  const adjustH = el('h2', undefined, t('ai.adjustH'));
  const adjustName = el('p', 'muted', '');
  const adjustRow = el('div', 'editor-row');
  const adjustInput = document.createElement('textarea');
  adjustInput.className = 'name-input prompt-input';
  adjustInput.placeholder = t('ai.adjustPh');
  adjustInput.maxLength = 500;
  adjustInput.rows = 4;
  adjustRow.appendChild(adjustInput);
  const adjustErr = el('p', 'import-err', t('ai.errInvalid'));
  adjustErr.hidden = true;
  const adjustActions = el('div', 'add-actions');
  const improveBtn = el('button', 'btn btn-primary has-icon');
  improveBtn.type = 'button';
  const improveLabel = el('span', undefined, t('ai.improve'));
  improveBtn.append(mkAiIcon(), improveLabel);
  const adjustCancelBtn = el('button', 'btn', t('tpl.cancel'));
  adjustCancelBtn.type = 'button';
  adjustActions.append(improveBtn, adjustCancelBtn);
  adjustDialog.append(adjustH, adjustName, adjustRow, adjustErr, adjustActions);
  wrap.appendChild(adjustDialog);
  let adjustTarget: Template | null = null;
  let adjusting = false;
  const syncImproveBtn = (): void => {
    improveBtn.disabled = adjusting || !adjustInput.value.trim();
    improveLabel.textContent = adjusting ? t('ai.generating') : t('ai.improve');
  };
  const openAdjustDialog = (tpl: Template): void => {
    if (activeClip() === null || video.videoWidth === 0) {
      showToast(t('ai.needClip'));
      return;
    }
    void ensureAiConsent(t('ai.consentBody')).then((ok) => {
      if (!ok) return;
      adjustTarget = tpl;
      adjustName.textContent = tpl.name;
      adjustInput.value = '';
      adjustErr.hidden = true;
      syncImproveBtn();
      showModal(adjustDialog);
    });
  };
  adjustInput.addEventListener('input', syncImproveBtn);
  adjustCancelBtn.addEventListener('click', () => adjustDialog.close());
  adjustDialog.addEventListener('cancel', (e) => {
    if (adjusting) e.preventDefault();
  });
  improveBtn.addEventListener('click', () => {
    if (adjusting || !adjustTarget) return;
    const instruction = adjustInput.value.trim();
    if (!instruction) return;
    adjusting = true;
    syncImproveBtn();
    const adjustReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    adjustDialog.inert = true;
    adjustErr.hidden = true;
    const target = adjustTarget;
    const aspect = activeClip() ? classifyAspect(canvas.width, canvas.height) : 'vertical';
    void adjustAiTemplate(effectiveTemplate(target), instruction, aspect, aiAvailable()).then((result) => {
      adjusting = false;
      syncImproveBtn();
      adjustDialog.inert = false;
      adjustReturnFocus?.focus();
      if (typeof result === 'string') {
        adjustErr.textContent = result === 'net' ? t('ai.errNet') : t('ai.errInvalid');
        adjustErr.hidden = false;
        return;
      }
      const suffix = getLocale() === 'es' ? ' (IA)' : ' (AI)';
      insertCustom({ ...result, id: freshTemplateId(), name: `${target.name}${suffix}`.slice(0, 60) });
      adjustDialog.close();
    });
  });
  wrap.appendChild(newDialog);
  /** Session customs survive reloads (flattened); the cloud wins on id clash unless local is newer. */
  const CUSTOMS_KEY = 'override.customs';
  let localCustomsSavedAt: string | null = null;
  const persistLocalCustoms = (): void => {
    try {
      const flat = customTemplates.map((c) => effectiveTemplate(c));
      localCustomsSavedAt = new Date().toISOString();
      localStorage.setItem(
        CUSTOMS_KEY,
        JSON.stringify({ savedAt: localCustomsSavedAt, templates: flat }),
      );
    } catch {
      /* quota/private mode: session-only */
    }
  };
  const restoreLocalCustoms = (): void => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(CUSTOMS_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      // Legacy shape was a bare array (no timestamp: cloud always wins for it).
      const rec = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as {
        savedAt?: unknown;
        templates?: unknown;
      };
      const list: unknown = Array.isArray(parsed) ? parsed : rec.templates;
      if (typeof rec.savedAt === 'string') localCustomsSavedAt = rec.savedAt;
      if (!Array.isArray(list)) return;
      for (const item of [...list].reverse()) {
        try {
          insertCustom(parseTemplateJson(JSON.stringify(item)), true);
        } catch {
          /* skip corrupt */
        }
      }
    } catch {
      /* ignore */
    }
  };
  /** Local snapshot wins only when clearly newer (60s grace for clock skew); else cloud wins. */
  const localNewerThanCloud = (cloudUpdatedAt: string): boolean => {
    if (!localCustomsSavedAt) return false;
    const local = Date.parse(localCustomsSavedAt);
    const cloud = Date.parse(cloudUpdatedAt);
    if (!Number.isFinite(local) || !Number.isFinite(cloud)) return false;
    return local > cloud + 60_000;
  };
  /** Login-less by default: customs restore locally, cloud loads only on session. */
  const bootAccount = async (): Promise<void> => {
    restoreLocalCustoms();
    account = await fetchSession();
    syncAccountUI();
    if (!account) return;
    const cloud = await listCloudTemplates();
    if (!cloud) {
      showToast(t('auth.errCloud'));
      return;
    }
    for (const ct of cloud) {
      try {
        const tpl = parseTemplateJson(JSON.stringify(ct.definition));
        cloudIds.add(ct.id);
        const local = customTemplates.find((c) => c.id === ct.id);
        if (local && localNewerThanCloud(ct.updatedAt)) {
          // Edited here while offline: push local up instead of clobbering it.
          const savedId = await saveCloudTemplate(local.id, local.name, effectiveTemplate(local));
          if (savedId) cloudIds.add(savedId);
          continue;
        }
        insertCustom({ ...tpl, id: ct.id, name: ct.name }, true);
      } catch {
        /* skip corrupt */
      }
    }
    for (const tpl of customTemplates) {
      if (cloudIds.has(tpl.id)) continue;
      const savedId = await saveCloudTemplate(tpl.id, tpl.name, effectiveTemplate(tpl));
      if (savedId) cloudIds.add(savedId);
    }
  };
  // Templates sit above the viewer: one strip, no scroll to pick one.
  center.prepend(templateBox);

  // Inspector (right): always visible; empty state when no clip is loaded.
  const inspector = el('aside', 'inspector');
  const emptyPanel = el('div', 'empty-panel');
  emptyPanel.append(el('h2', undefined, t('clip.title')));
  emptyPanel.append(el('p', 'muted', t('clip.none')));
  inspector.appendChild(emptyPanel);
  const clipPanel = el('div', 'clip-panel');
  clipPanel.append(el('h2', undefined, t('clip.title')));
  const clipName = el('p', 'clip-name', t('clip.none'));
  clipPanel.appendChild(clipName);
  // Recording-time callout: the parser proof the user checks before tweaking tz.
  const recordedBanner = el('p', 'recorded-banner warn', t('clip.recordedNone'));
  clipPanel.appendChild(recordedBanner);
  const trimRow = el('div', 'editor-row');
  const mkTrim = (labelText: string, btnText: string): [HTMLInputElement, HTMLButtonElement] => {
    const group = el('label', 'trim-group', labelText);
    const input = el('input', 'trim-input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.1';
    input.placeholder = 's';
    const btn = el('button', 'btn btn-small', btnText);
    btn.type = 'button';
    group.append(input, btn);
    trimRow.appendChild(group);
    return [input, btn];
  };
  const [trimStartInput, trimStartBtn] = mkTrim(t('clip.start'), '⦉ cursor');
  const [trimEndInput, trimEndBtn] = mkTrim(t('clip.end'), 'cursor ⦊');
  for (const [input, btn] of [
    [trimStartInput, trimStartBtn],
    [trimEndInput, trimEndBtn],
  ] as const) {
    btn.addEventListener('click', () => {
      input.value = video.currentTime.toFixed(1);
      input.dispatchEvent(new Event('change'));
    });
  }
  const wireTrimInput = (input: HTMLInputElement, apply: (clip: Clip, raw: string) => void): void => {
    input.addEventListener('change', () => {
      const clip = activeClip();
      if (clip) apply(clip, input.value);
    });
  };
  wireTrimInput(trimStartInput, (clip, raw) => {
    clip.trimStart = Math.max(0, Number(raw) || 0);
  });
  wireTrimInput(trimEndInput, (clip, raw) => {
    const v = raw.trim();
    clip.trimEnd = v === '' ? null : Math.max(0, Number(v) || 0);
  });
  clipPanel.appendChild(trimRow);
  const audioLabel = el('label', 'check', t('clip.audio'));
  const audioCheck = el('input');
  audioCheck.type = 'checkbox';
  audioCheck.checked = true;
  audioLabel.prepend(audioCheck);
  audioCheck.addEventListener('change', () => {
    const clip = activeClip();
    if (clip) clip.includeAudio = audioCheck.checked;
  });
  clipPanel.appendChild(audioLabel);
  const tzRow = el('div', 'editor-row');
  tzRow.append(el('span', 'muted', t('clip.tz')));
  const tzSelect = el('select', 'font-select tz-select');
  tzSelect.title = t('clip.tzTitle');
  const tzOption = (label: string, value: string): void => {
    const opt = el('option', undefined, label);
    opt.value = value;
    tzSelect.appendChild(opt);
  };
  for (const h of FIXED_TZS) tzOption(tzName(h), String(h));
  tzSelect.value = String(BROWSER_TZ);
  tzRow.appendChild(tzSelect);
  tzSelect.addEventListener('change', () => {
    const clip = activeClip();
    if (!clip) return;
    clip.tz = Number(tzSelect.value);
    refreshClipInstant(clip);
    if (clip.id === selectedClipId) showRecorded(clip);
    if (!clip.videoCreation) {
      showToast(t('clip.tzNoDate'));
    } else if (applyAutoOffset(clip)) {
      clip.offsetDirty = true;
      showToast(
        t('clip.tzApplied', {
          tz: tzName(clip.tz),
          name: clip.name,
          off: formatOffset(clip.offsetSec),
        }),
      );
    } else {
      showToast(t('clip.tzNeedActivity'));
    }
    binMetaSig = '';
  });
  clipPanel.appendChild(tzRow);
  inspector.appendChild(clipPanel);

  // Widget panel: every option of the selected widget.
  const widgetPanel = el('div', 'widget-panel');
  widgetPanel.hidden = true;
  widgetPanel.append(el('h2', undefined, t('w.title')));
  const widgetTitle = el('p', 'clip-name', '');
  const widgetSub = el('p', 'muted', '');
  widgetPanel.append(widgetTitle, widgetSub);

  const mkField = (
    row: HTMLElement,
    labelText: string,
    type: string,
    className: string,
    title?: string,
  ): HTMLInputElement => {
    const group = el('label', 'trim-group', labelText);
    if (title) group.title = title;
    const input = el('input', className);
    input.type = type;
    group.appendChild(input);
    row.appendChild(group);
    return input;
  };

  const [kindRow, kindSel] = mkSelectRow(
    t('tpl.type'),
    WIDGET_KINDS.map((value) => ({ value, label: kindLabel(value) })),
    'kind-select',
  );
  const [metricRow, metricSel] = mkSelectRow(
    t('tpl.metric'),
    METRIC_IDS.map((value) => ({ value, label: metricLabel(value) })),
    'metric-select',
  );
  const TIME_FORMATS: { value: TimeFormat; label: string }[] = [
    { value: 'auto', label: t('w.auto') },
    { value: 'hmm', label: 'H:MM' },
    { value: 'hmmss', label: 'H:MM:SS' },
    { value: 'h', label: 'Hh' },
    { value: 'hm', label: 'Hh MMm' },
  ];
  const [fmtRow, fmtSel] = mkSelectRow(
    t('w.format'),
    TIME_FORMATS,
    'format-select',
  );
  /** Image context offers only share kinds; video context hides them. */
  const syncKindOptions = (): void => {
    const image = isImageCtx();
    const kinds = image ? SHARE_KINDS : WIDGET_KINDS.filter((k) => !SHARE_KINDS.includes(k));
    for (const sel of [addKindSel, kindSel]) {
      const prev = sel.value;
      sel.innerHTML = '';
      for (const k of kinds) {
        const opt = el('option', undefined, kindLabel(k));
        opt.value = k;
        sel.appendChild(opt);
      }
      sel.value = (kinds as string[]).includes(prev) ? prev : kinds[0];
    }
    addMetricSel.value = defaultMetricFor(addKindSel.value as WidgetKind);
  };
  syncKindOptions();
  const unitRow = el('div', 'editor-row');
  const unitCheck = mkField(unitRow, t('w.unit'), 'checkbox', 'unit-check');
  const labelRow = el('div', 'editor-row');
  const labelCheck = mkField(labelRow, t('w.label'), 'checkbox', 'unit-check');
  const gearsModeRow = el('div', 'editor-row');
  gearsModeRow.append(el('span', 'muted', t('w.gearsMode')));
  const gearsModeSeg = el('div', 'seg-switch fill');
  gearsModeSeg.setAttribute('role', 'group');
  gearsModeSeg.setAttribute('aria-label', t('w.gearsMode'));
  const gearsModeBtns: HTMLButtonElement[] = [];
  for (const [value, text] of [
    ['teeth', t('w.gearsTeeth')],
    ['index', t('w.gearsIndex')],
  ]) {
    const btn = el('button', 'seg-opt', text);
    btn.type = 'button';
    btn.dataset.gearsMode = value;
    gearsModeSeg.appendChild(btn);
    gearsModeBtns.push(btn);
  }
  gearsModeRow.appendChild(gearsModeSeg);
  const gearsSideRow = el('div', 'editor-row');
  gearsSideRow.append(el('span', 'muted', t('w.gearsSide')));
  const gearsSideSeg = el('div', 'seg-switch fill');
  gearsSideSeg.setAttribute('role', 'group');
  gearsSideSeg.setAttribute('aria-label', t('w.gearsSide'));
  const gearsSideBtns: HTMLButtonElement[] = [];
  for (const [value, text] of [
    ['both', t('w.gearsBoth')],
    ['front', t('w.gearsFront')],
    ['rear', t('w.gearsRear')],
  ]) {
    const btn = el('button', 'seg-opt', text);
    btn.type = 'button';
    btn.dataset.gearsSide = value;
    gearsSideSeg.appendChild(btn);
    gearsSideBtns.push(btn);
  }
  gearsSideRow.appendChild(gearsSideSeg);

  const posRow = el('div', 'editor-row');
  const xInput = mkField(posRow, 'X ', 'number', 'trim-input');
  const yInput = mkField(posRow, 'Y ', 'number', 'trim-input');
  const sizeRow = el('div', 'editor-row');
  const wInput = mkField(sizeRow, 'W ', 'number', 'trim-input');
  const hInput = mkField(sizeRow, 'H ', 'number', 'trim-input');
  for (const input of [xInput, yInput, wInput, hInput]) {
    input.min = '0';
    input.max = '1';
    input.step = '0.01';
  }
  const bgRow = el('div', 'editor-row');
  const bgInput = mkField(bgRow, t('w.bg'), 'color', 'color-input');
  const opGroup = el('label', 'op-group', t('w.opacity'));
  const opInput = el('input', 'range-input');
  opInput.type = 'range';
  opInput.min = '0';
  opInput.max = '100';
  opInput.step = '1';
  const opPct = el('span', 'pct', '');
  opGroup.append(opInput, opPct);
  bgRow.appendChild(opGroup);
  const shapeRow = el('div', 'editor-row');
  shapeRow.append(el('span', 'muted', t('w.shape')));
  const shapeSeg = el('div', 'seg-switch fill');
  shapeSeg.setAttribute('role', 'group');
  shapeSeg.setAttribute('aria-label', t('w.shape'));
  const shapeBtns: HTMLButtonElement[] = [];
  for (const [value, text] of [
    ['rect', t('w.shapeRect')],
    ['pill', t('w.shapePill')],
    ['none', t('w.shapeNone')],
  ]) {
    const btn = el('button', 'seg-opt', text);
    btn.type = 'button';
    btn.dataset.shape = value;
    shapeSeg.appendChild(btn);
    shapeBtns.push(btn);
  }
  shapeRow.appendChild(shapeSeg);
  const alignRow = el('div', 'editor-row');
  alignRow.append(el('span', 'muted', t('w.align')));
  const alignSeg = el('div', 'seg-switch fill');
  alignSeg.setAttribute('role', 'group');
  alignSeg.setAttribute('aria-label', t('w.align'));
  const alignBtns: HTMLButtonElement[] = [];
  for (const [value, text] of [
    ['left', t('w.alignLeft')],
    ['center', t('w.alignCenter')],
    ['right', t('w.alignRight')],
  ]) {
    const btn = el('button', 'seg-opt seg-icon');
    btn.type = 'button';
    btn.dataset.align = value;
    btn.title = text;
    btn.setAttribute('aria-label', text);
    const icon = el('span', `icon icon-align-${value}`);
    icon.setAttribute('aria-hidden', 'true');
    btn.appendChild(icon);
    alignSeg.appendChild(btn);
    alignBtns.push(btn);
  }
  alignRow.appendChild(alignSeg);
  const widthRow = el('div', 'editor-row');
  const widthGroup = el('label', 'op-group', t('w.width'));
  const widthInput = el('input', 'range-input');
  widthInput.type = 'range';
  widthInput.min = '0';
  widthInput.max = '24';
  widthInput.step = '0.5';
  widthInput.title = t('w.widthTitle');
  const widthPct = el('span', 'pct', '');
  widthGroup.append(widthInput, widthPct);
  widthRow.appendChild(widthGroup);
  const syncWidthPct = (): void => {
    widthPct.textContent =
      Number(widthInput.value) <= 0 ? t('w.auto') : `${widthInput.value} px`;
  };
  const FONT_OPTIONS: [string, string][] = [
    ['Inter', 'Inter, sans-serif'],
    ['Barlow Condensed', 'Barlow Condensed, sans-serif'],
    ['Oswald', 'Oswald, sans-serif'],
    ['Rajdhani', 'Rajdhani, sans-serif'],
    ['Orbitron', 'Orbitron, sans-serif'],
    ['Baloo 2', '"Baloo 2", sans-serif'],
    ['Bungee Outline', 'Bungee Outline, sans-serif'],
    ['Bungee', 'Bungee, sans-serif'],
    ['Mono', 'ui-monospace, monospace'],
  ];
  /** Minimal custom select for fonts: each option previews ABC/123 in its typeface. */
  interface FontPicker {
    readonly root: HTMLElement;
    value: string;
  }
  let openFontPicker: { root: HTMLElement; close: () => void } | null = null;
  document.addEventListener('pointerdown', (e) => {
    if (openFontPicker && e.target instanceof Node && !openFontPicker.root.contains(e.target)) {
      openFontPicker.close();
    }
  });
  const mkFontPicker = (onPick: (value: string) => void): FontPicker => {
    const root = el('div', 'font-picker');
    const btn = el('button', 'font-select font-picker-btn');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const nameSpan = el('span', 'font-picker-name', '');
    const caret = el('span', 'font-picker-caret', '▾');
    caret.setAttribute('aria-hidden', 'true');
    btn.append(nameSpan, caret);
    const list = el('div', 'font-picker-list');
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    root.append(btn, list);
    let value = FONT_OPTIONS[0][1];
    const options: HTMLButtonElement[] = [];
    const syncBtn = (): void => {
      const found = FONT_OPTIONS.find(([, v]) => v === value);
      nameSpan.textContent = found ? found[0] : value;
      nameSpan.style.fontFamily = value;
      btn.title = nameSpan.textContent ?? '';
      options.forEach((opt, i) =>
        opt.setAttribute('aria-selected', String(FONT_OPTIONS[i][1] === value)),
      );
    };
    const close = (): void => {
      if (list.hidden) return;
      list.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (openFontPicker?.close === close) openFontPicker = null;
    };
    const open = (): void => {
      openFontPicker?.close();
      list.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      openFontPicker = { root, close };
    };
    btn.addEventListener('click', () => (list.hidden ? open() : close()));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowDown' && list.hidden) open();
    });
    for (const [label, stack] of FONT_OPTIONS) {
      const opt = el('button', 'font-picker-opt');
      opt.type = 'button';
      opt.setAttribute('role', 'option');
      const name = el('span', 'font-picker-opt-name', label);
      const abc = el('span', 'font-picker-opt-preview', 'AaGgQqRr');
      abc.style.fontFamily = stack;
      const nums = el('span', 'font-picker-opt-preview font-picker-opt-digits', '0123456789');
      nums.style.fontFamily = stack;
      opt.append(name, abc, nums);
      opt.addEventListener('click', () => {
        value = stack;
        syncBtn();
        close();
        btn.focus();
        onPick(stack);
      });
      options.push(opt);
      list.appendChild(opt);
    }
    syncBtn();
    return {
      root,
      get value() {
        return value;
      },
      set value(v: string) {
        if (v === value) return;
        value = v;
        syncBtn();
      },
    };
  };
  const mkFontRow = (
    colorLabel: string,
    colorTitle: string | undefined,
    onPick: (value: string) => void,
  ): [HTMLElement, HTMLInputElement, FontPicker, HTMLInputElement, HTMLSpanElement, HTMLElement] => {
    const row = el('div', 'editor-row');
    const color = mkField(row, colorLabel, 'color', 'color-input', colorTitle);
    const picker = mkFontPicker(onPick);
    const scale = el('input', 'range-input');
    scale.type = 'range';
    scale.min = '50';
    scale.max = '200';
    scale.step = '5';
    const pct = el('span', 'pct', '');
    const scaleGroup = el('span', 'op-group');
    scaleGroup.append(scale, pct);
    row.append(picker.root, scaleGroup);
    return [row, color, picker, scale, pct, scaleGroup];
  };
  const [labelFontRow, accentInput, labelFontPicker, labelScaleInput, labelPct, labelScaleGroup] =
    mkFontRow(t('w.accent'), t('w.accentTitle'), (v) => writeStylePatch({ labelFont: v }));
  const [valueFontRow, textInput, valueFontPicker, valueScaleInput, valuePct, valueScaleGroup] =
    mkFontRow(t('w.text'), undefined, (v) => writeStylePatch({ valueFont: v }));
  const widgetDeleteBtn = el('button', 'btn btn-danger', t('w.delete'));
  widgetDeleteBtn.type = 'button';
  widgetPanel.append(
    kindRow,
    metricRow,
    fmtRow,
    unitRow,
    labelRow,
    gearsModeRow,
    gearsSideRow,
    posRow,
    sizeRow,
    shapeRow,
    bgRow,
    alignRow,
    widthRow,
    labelFontRow,
    valueFontRow,
    widgetDeleteBtn,
  );
  inspector.appendChild(widgetPanel);

  const selectedWidget = (): { template: Template; widget: WidgetDef } | null => {
    const template = selectedTemplate();
    const sel = selected;
    if (!template || !sel || sel.templateId !== template.id) return null;
    const widget = effectiveTemplate(template).widgets.find((w) => w.id === sel.widgetId);
    return widget && widget.visible ? { template, widget } : null;
  };

  /** Get-or-create per-template override map (outer level shared by all override kinds). */
  const ovMap = <V>(map: Map<string, Map<string, V>>, templateId: string): Map<string, V> => {
    let per = map.get(templateId);
    if (!per) {
      per = new Map();
      map.set(templateId, per);
    }
    return per;
  };

  const styleOv = (templateId: string, widgetId: string): WidgetStyle => {
    const per = ovMap(styleOverrides, templateId);
    let ov = per.get(widgetId);
    if (!ov) {
      ov = {};
      per.set(widgetId, ov);
    }
    return ov;
  };

  const writeLayoutPatch = (patch: Partial<{ x: number; y: number; w: number; h: number }>): void => {
    const sw = selectedWidget();
    if (!sw) return;
    const W = canvas.width;
    const H = canvas.height;
    const box = resolveNorm(sw.widget, W, H);
    const x = Math.min(Math.max(patch.x ?? box.x, 0), 1);
    const y = Math.min(Math.max(patch.y ?? box.y, 0), 1);
    const w = Math.min(Math.max(patch.w ?? box.w, MIN_PX_W / W), 1 - x);
    const h = Math.min(Math.max(patch.h ?? box.h, MIN_PX_H / H), 1 - y);
    const per = ovMap(layoutOverrides, sw.template.id);
    per.set(sw.widget.id, normToLayout({ x, y, w, h }, W, H));
    bumpRev();
  };

  const writeStylePatch = (patch: Partial<WidgetStyle>): void => {
    const sw = selectedWidget();
    if (!sw) return;
    Object.assign(styleOv(sw.template.id, sw.widget.id), patch);
    bumpRev();
  };

  const writeDefPatch = (patch: {
    metric?: MetricId;
    kind?: WidgetKind;
    timeFormat?: TimeFormat;
    showUnit?: boolean;
    showLabel?: boolean;
    gearsMode?: GearsMode;
    gearsSide?: GearsSide;
  }): void => {
    const sw = selectedWidget();
    if (!sw) return;
    const per = ovMap(defOverrides, sw.template.id);
    const prev = per.get(sw.widget.id) ?? {};
    per.set(sw.widget.id, { ...prev, ...patch });
    bumpRev();
  };

  const hideWidget = (template: Template, widgetId: string): void => {
    let perTemplate = widgetOverrides.get(template.id);
    if (!perTemplate) {
      perTemplate = new Map(
        effectiveTemplate(template).widgets.map((w) => [w.id, w.visible]),
      );
      widgetOverrides.set(template.id, perTemplate);
    }
    perTemplate.set(widgetId, false);
    if (selected?.widgetId === widgetId) selected = null;
    bumpRev();
  };

  /** True delete: added widgets drop from the list, builtins go to the removed set. */
  const deleteWidget = (template: Template, widgetId: string): void => {
    const added = addedWidgets.get(template.id);
    const ai = added?.findIndex((w) => w.id === widgetId) ?? -1;
    if (added && ai >= 0) {
      added.splice(ai, 1);
    } else {
      let perTemplate = removedWidgets.get(template.id);
      if (!perTemplate) {
        perTemplate = new Set();
        removedWidgets.set(template.id, perTemplate);
      }
      perTemplate.add(widgetId);
    }
    // Stale per-id overrides would leak onto a future widget reusing the id.
    layoutOverrides.get(template.id)?.delete(widgetId);
    styleOverrides.get(template.id)?.delete(widgetId);
    widthOverrides.get(template.id)?.delete(widgetId);
    defOverrides.get(template.id)?.delete(widgetId);
    widgetOverrides.get(template.id)?.delete(widgetId);
    if (selected?.widgetId === widgetId) selected = null;
    bumpRev();
  };

  xInput.addEventListener('change', () => writeLayoutPatch({ x: Number(xInput.value) }));
  yInput.addEventListener('change', () => writeLayoutPatch({ y: Number(yInput.value) }));
  wInput.addEventListener('change', () => writeLayoutPatch({ w: Number(wInput.value) }));
  hInput.addEventListener('change', () => writeLayoutPatch({ h: Number(hInput.value) }));
  bgInput.addEventListener('input', () => writeStylePatch({ background: bgInput.value }));
  opInput.addEventListener('input', () =>
    writeStylePatch({ backgroundOpacity: Number(opInput.value) / 100 }),
  );
  for (const btn of shapeBtns) {
    btn.addEventListener('click', () => {
      writeStylePatch({ shape: btn.dataset.shape as WidgetStyle['shape'] });
    });
  }
  for (const btn of alignBtns) {
    btn.addEventListener('click', () => {
      writeStylePatch({ align: btn.dataset.align as WidgetStyle['align'] });
    });
  }
  accentInput.addEventListener('input', () => writeStylePatch({ accent: accentInput.value }));
  textInput.addEventListener('input', () => writeStylePatch({ text: textInput.value }));
  labelScaleInput.addEventListener('input', () =>
    writeStylePatch({ labelScale: Number(labelScaleInput.value) / 100 }),
  );
  valueScaleInput.addEventListener('input', () =>
    writeStylePatch({ valueScale: Number(valueScaleInput.value) / 100 }),
  );
  kindSel.addEventListener('change', () =>
    writeDefPatch({ kind: kindSel.value as WidgetKind }),
  );
  fmtSel.addEventListener('change', () =>
    writeDefPatch({ timeFormat: fmtSel.value as TimeFormat }),
  );
  metricSel.addEventListener('change', () =>
    writeDefPatch({ metric: metricSel.value as MetricId }),
  );
  unitCheck.addEventListener('change', () => writeDefPatch({ showUnit: unitCheck.checked }));
  labelCheck.addEventListener('change', () => writeDefPatch({ showLabel: labelCheck.checked }));
  for (const btn of gearsModeBtns) {
    btn.addEventListener('click', () => {
      writeDefPatch({ gearsMode: btn.dataset.gearsMode as GearsMode });
    });
  }
  for (const btn of gearsSideBtns) {
    btn.addEventListener('click', () => {
      writeDefPatch({ gearsSide: btn.dataset.gearsSide as GearsSide });
    });
  }
  widgetDeleteBtn.addEventListener('click', () => {
    const sw = selectedWidget();
    if (sw) deleteWidget(sw.template, sw.widget.id);
  });
  widthInput.addEventListener('input', () => {
    const sw = selectedWidget();
    if (!sw) return;
    const per = ovMap(widthOverrides, sw.template.id);
    const v = Number(widthInput.value);
    if (v <= 0) per.delete(sw.widget.id);
    else per.set(sw.widget.id, v);
    syncWidthPct();
    bumpRev();
  });

  const toHex = (value: string, fallback: string): string =>
    /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;

  const setIfIdle = (input: HTMLInputElement | HTMLSelectElement, value: string): void => {
    if (document.activeElement !== input && input.value !== value) input.value = value;
  };

  const fillWidgetPanel = (): void => {
    const sw = selectedWidget();
    if (!sw) return;
    const box = resolveNorm(sw.widget, canvas.width, canvas.height);
    const st = sw.widget.style ?? {};
    widgetTitle.textContent = sw.widget.id;
    widgetSub.textContent = `${sw.widget.kind} · ${sw.widget.metric} · ${sw.widget.layout.ax}/${sw.widget.layout.ay}`;
    setIfIdle(kindSel, sw.widget.kind);
    // Unoffered-but-valid metrics (AI pace) still display: append once, never offered for picks.
    if (![...metricSel.options].some((o) => o.value === sw.widget.metric)) {
      const opt = el('option', undefined, metricLabel(sw.widget.metric));
      opt.value = sw.widget.metric;
      metricSel.appendChild(opt);
    }
    setIfIdle(metricSel, sw.widget.metric);
    metricRow.hidden = sw.widget.kind === 'routedraw';
    fmtRow.hidden = sw.widget.metric !== 'elapsedTime';
    setIfIdle(fmtSel, sw.widget.timeFormat ?? 'auto');
    const caps = capsFor(sw.widget.kind);
    // Gears in both mode shows no unit, so there is nothing to toggle.
    unitRow.hidden = !caps.unit || (sw.widget.kind === 'gears' && (sw.widget.gearsSide ?? 'both') === 'both');
    unitCheck.checked = sw.widget.showUnit !== false;
    labelRow.hidden = !caps.labelToggle;
    labelCheck.checked = sw.widget.showLabel !== false;
    gearsModeRow.hidden = !caps.gearsMode;
    syncSeg(gearsModeBtns, (btn) => btn.dataset.gearsMode === (sw.widget.gearsMode ?? 'teeth'));
    gearsSideRow.hidden = !caps.gearsMode;
    syncSeg(gearsSideBtns, (btn) => btn.dataset.gearsSide === (sw.widget.gearsSide ?? 'both'));
    setIfIdle(xInput, box.x.toFixed(2));
    setIfIdle(yInput, box.y.toFixed(2));
    setIfIdle(wInput, box.w.toFixed(2));
    setIfIdle(hInput, box.h.toFixed(2));
    if (document.activeElement !== bgInput) {
      bgInput.value = toHex(st.background ?? sw.template.theme.panel, '#0d0d0d');
    }
    const op = Math.round((st.backgroundOpacity ?? sw.template.theme.panelOpacity) * 100);
    setIfIdle(opInput, String(op));
    opPct.textContent = `${op} %`;
    const shape = st.shape ?? 'rect';
    // No panel painted: background + opacity would be dead controls.
    bgRow.hidden = shape === 'none';
    for (const btn of shapeBtns) {
      const active = btn.dataset.shape === shape;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
    // Only stat/number lay out text lines: the row would be a dead control elsewhere.
    const alignable = sw.widget.kind === 'stat' || sw.widget.kind === 'number';
    alignRow.hidden = !alignable;
    const align = st.align ?? defaultAlignFor(sw.widget.kind);
    for (const btn of alignBtns) {
      const active = btn.dataset.align === align;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
    if (document.activeElement !== accentInput) {
      accentInput.value = toHex(st.accent ?? sw.template.theme.accent, '#0099ff');
    }
    if (document.activeElement !== textInput) {
      textInput.value = toHex(st.text ?? sw.template.theme.text, '#ffffff');
    }
    widthRow.hidden = !caps.trailWidth;
    if (caps.trailWidth) {
      setIfIdle(widthInput, String(sw.widget.strokeWidth ?? 0));
      syncWidthPct();
    }
    // Kinds without text (maps) keep only the trail/dot color: their label
    // font styles a fallback title, and the whole value row paints nothing.
    // Label font also hides when the kind's label is toggled off (its color
    // may still paint graphics, e.g. the gauge arc, so the row stays).
    const labelOff = caps.labelToggle && sw.widget.showLabel === false;
    labelFontPicker.root.hidden = !caps.text || labelOff;
    labelScaleGroup.hidden = !caps.text || labelOff;
    valueFontRow.hidden = !caps.text;
    // The highlight row is dead when it paints nothing: `stat`/`gears` with
    // their label off (their only accent use), `number` with its unit off.
    labelFontRow.hidden =
      (sw.widget.kind === 'stat' && sw.widget.showLabel === false) ||
      (sw.widget.kind === 'gears' && sw.widget.showLabel === false) ||
      (sw.widget.kind === 'number' && sw.widget.showUnit === false);
    labelFontPicker.value = st.labelFont ?? DEFAULT_WIDGET_FONT;
    const ls = Math.round((st.labelScale ?? 1) * 100);
    setIfIdle(labelScaleInput, String(ls));
    labelPct.textContent = `${ls} %`;
    valueFontPicker.value = st.valueFont ?? DEFAULT_WIDGET_FONT;
    const vs = Math.round((st.valueScale ?? 1) * 100);
    setIfIdle(valueScaleInput, String(vs));
    valuePct.textContent = `${vs} %`;
  };

  const syncInspector = (): void => {
    const clip = activeClip();
    emptyPanel.hidden = clip !== null;
    const showWidget = clip !== null && selectedWidget() !== null;
    clipPanel.hidden = clip === null || showWidget;
    widgetPanel.hidden = !showWidget || clip === null;
    renderPanel.hidden = clip === null || showWidget;
    if (showWidget) fillWidgetPanel();
  };
  // Render lives in its own panel so the Widget panel can hide it.
  const renderPanel = el('div', 'render-panel');
  renderPanel.append(el('h2', undefined, t('r.title')));
  const renderRow = el('div', 'render-row');
  const renderBtn = el('button', 'btn btn-primary', t('r.clip'));
  renderBtn.type = 'button';
  renderRow.appendChild(renderBtn);
  renderPanel.appendChild(renderRow);
  // Share timing: animation window then static hold. Image context only.
  const shareRow = el('div', 'render-share');
  shareRow.hidden = true;
  const mkShareInput = (labelText: string, initial: string): HTMLInputElement => {
    const group = el('label', 'trim-group', labelText);
    const input = el('input', 'trim-input');
    input.type = 'number';
    input.min = '0.5';
    input.max = '60';
    input.step = '0.5';
    input.value = initial;
    group.appendChild(input);
    shareRow.appendChild(group);
    return input;
  };
  const animInput = mkShareInput(t('r.anim'), '4');
  const totalInput = mkShareInput(t('r.total'), '8');
  const syncShareInputs = (which: 'anim' | 'total'): void => {
    const clip = activeClip();
    if (!clip || clip.source !== 'image') return;
    const anim = Math.min(60, Math.max(0.5, Number(animInput.value) || 4));
    const total = Math.min(60, Math.max(1, Number(totalInput.value) || 8));
    // The animation window never outruns the video: clamp the edited field.
    clip.shareAnim = which === 'anim' ? Math.min(anim, total) : Math.min(clip.shareAnim, total);
    clip.shareTotal = which === 'total' ? Math.max(total, clip.shareAnim) : total;
    animInput.value = String(clip.shareAnim);
    totalInput.value = String(clip.shareTotal);
    binMetaSig = '';
  };
  animInput.addEventListener('change', () => syncShareInputs('anim'));
  totalInput.addEventListener('change', () => syncShareInputs('total'));
  renderPanel.insertBefore(shareRow, renderRow);
  const progress = el('progress', 'render-progress');
  progress.max = 1;
  progress.value = 0;
  progress.hidden = true;
  progress.setAttribute('aria-label', t('r.progress'));
  const progressLabel = el('p', 'muted', '');
  const result = el('div', 'result');
  let renderUrls: string[] = [];
  renderPanel.append(progress, progressLabel, result);
  inspector.appendChild(renderPanel);
  grid.appendChild(inspector);

  // Clicking anywhere except the canvas, the Widget panel or the add modal deselects.
  window.addEventListener('pointerdown', (e) => {
    const target = e.target;
    if (
      target instanceof Node &&
      (target === canvas ||
        target === addOpenBtn ||
        widgetPanel.contains(target) ||
        addDialog.contains(target))
    )
      return;
    selected = null;
  });

  // Activity timeline: lives in the center column under sync, not full-width.
  const timelineBox = el('section', 'timeline-box');
  timelineBox.append(el('h2', undefined, t('act.title')));
  const activityCanvas = el('canvas', 'activity-overview');
  activityCanvas.width = 1400;
  activityCanvas.height = 110;
  activityCanvas.setAttribute('role', 'img');
  activityCanvas.setAttribute('aria-label', t('act.aria'));
  const activityCtx = activityCanvas.getContext('2d');
  if (!activityCtx) throw new Error(t('act.errCanvas'));
  const activityLabel = el('p', 'muted', t('act.empty'));
  timelineBox.append(activityCanvas, activityLabel);
  const gotoRow = el('div', 'editor-row');
  const gotoInput = mkField(gotoRow, t('act.goto'), 'text', 'trim-input goto-input');
  gotoInput.placeholder = '1:20:12';
  gotoInput.setAttribute('aria-label', t('act.goto'));
  gotoInput.addEventListener('focus', () => gotoInput.select());
  const gotoBtn = el('button', 'btn btn-small', t('act.go'));
  gotoBtn.type = 'button';
  gotoRow.appendChild(gotoBtn);
  const gotoApply = (): void => {
    const clip = activeClip();
    if (!clip || !activity || activity.durationSec <= 0) {
      showToast(!clip ? t('st.needVideo') : t('act.empty'));
      return;
    }
    const target = parseGotoTime(gotoInput.value);
    if (target === null) {
      showToast(t('act.gotoInvalid'));
      return;
    }
    const vt = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const videoDur = clip.duration > 0 ? clip.duration : 0;
    const maxStart = Math.max(0, activity.durationSec - videoDur);
    clip.offsetSec = Math.min(
      OFFSET_LIMIT,
      Math.max(-OFFSET_LIMIT, Math.min(Math.max(target - vt, 0), maxStart)),
    );
    clip.offsetDirty = true;
  };
  gotoBtn.addEventListener('click', gotoApply);
  gotoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') gotoApply();
  });
  timelineBox.append(gotoRow);
  center.appendChild(timelineBox);

  const footer = el('p', 'muted');
  wrap.appendChild(footer);
  const siteFooter = el('p', 'site-footer');
  const footerLocale = getLocale();
  const footerLinks: [string, string, boolean][] = [
    [t('ftr.home'), footerLocale === 'es' ? '/es/' : '/en/', false],
    [t('ftr.privacy'), footerLocale === 'es' ? '/es/privacidad/' : '/en/privacy/', false],
    [t('ftr.terms'), footerLocale === 'es' ? '/es/terminos/' : '/en/terms/', false],
    [t('ftr.donate'), DONATE_URL, true],
  ];
  for (const [label, href, external] of footerLinks) {
    const link = el('a', 'btn btn-small', label);
    link.href = href;
    if (external) {
      link.target = '_blank';
      link.rel = 'noopener';
    }
    siteFooter.appendChild(link);
  }
  wrap.appendChild(siteFooter);
  root.appendChild(wrap);

  const toastBox = el('div', 'toast-box');
  toastBox.setAttribute('aria-live', 'polite');
  wrap.appendChild(toastBox);
  /** Toasts fired while a dialog is open queue here; tick flushes them once all dialogs close. */
  const pendingToasts: string[] = [];
  /** Top-right auto-dismissing toast for action feedback. */
  const showToast = (text: string): void => {
    if (wrap.querySelector('dialog[open]')) {
      pendingToasts.push(text);
      return;
    }
    const node = el('div', 'toast', text);
    toastBox.appendChild(node);
    window.setTimeout(() => node.remove(), 4000);
  };

  const repaintThumbs = (sample: TelemetrySample): void => {
    lastThumbSample = sample;
    for (const th of thumbs) {
      const vis = widgetOverrides.get(th.template.id);
      const visKey = th.template.widgets
        .map((w) => `${w.id}:${vis?.get(w.id) ?? w.visible}`)
        .join(',');
      const sig = `${th.template.id}|${units}|${thumbAspect}|${Math.floor(sample.t)}|${visKey}|${overrideRev}`;
      if (sig === th.sig) continue;
      th.sig = sig;
      th.ctx.fillStyle = '#0d0d0d';
      th.ctx.fillRect(0, 0, th.canvas.width, th.canvas.height);
      // Share cards preview the finished frame (progress 1).
      const shareCtx =
        th.template.id === SHARE_TEMPLATE_ID && activity ? { progress: 1 } : undefined;
      drawOverlay(
        th.ctx,
        effectiveTemplate(th.template),
        sample,
        th.canvas.width,
        th.canvas.height,
        units,
        activity ? { activity, t: sample.t } : undefined,
        shareCtx,
      );
    }
  };

  const fmtRecorded = (d: Date): string => {
    const pad = (n: number): string => String(n).padStart(2, '0');
    return (
      `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  };

  const clipWindow = (clip: Clip): [number, number] => {
    const dur = clip.duration > 0 ? clip.duration : 0;
    const start = clip.offsetSec + clip.trimStart;
    const end = clip.offsetSec + (clip.trimEnd ?? dur);
    return [start, Math.max(end, start)];
  };

  const binRows = new Map<number, { row: HTMLDivElement; meta: HTMLSpanElement }>();

  const syncBin = (): void => {
    binCount.textContent = String(clips.length);
    addLabel.hidden = clips.length === 0;
    binDrop.hidden = clips.length > 0;
    binList.innerHTML = '';
    binRows.clear();
    for (const clip of clips) {
      const row = el('div', 'clip-row');
      if (clip.id === selectedClipId) row.classList.add('selected');
      const main = el('button', 'clip-main');
      main.type = 'button';
      main.setAttribute('aria-label', clip.name);
      const dot = el('span', `clip-dot clip-dot-${clip.status}`);
      dot.setAttribute('aria-hidden', 'true');
      const name = el('span', 'clip-title', clip.name);
      name.title = clip.name;
      const meta = el('span', 'clip-meta');
      main.append(dot, name, meta);
      const remove = el('button', 'clip-remove', '×');
      remove.type = 'button';
      remove.title = t('bin.remove');
      remove.setAttribute('aria-label', `${t('bin.remove')}: ${clip.name}`);
      remove.addEventListener('click', () => removeClip(clip.id));
      row.append(main, remove);
      main.addEventListener('click', () => selectClip(clip.id));
      binList.appendChild(row);
      binRows.set(clip.id, { row, meta });
    }
    syncBinMeta();
  };

  /** Offset text updates live; called from tick with a cheap string compare. */
  let binMetaSig = '';
  const syncBinMeta = (): void => {
    const sig = clips
      .map(
        (c) =>
          `${c.id}:${c.status}:${(c.source === 'image' ? c.shareTotal : c.duration).toFixed(1)}`,
      )
      .join('|');
    if (sig === binMetaSig) return;
    binMetaSig = sig;
    for (const clip of clips) {
      const refs = binRows.get(clip.id);
      if (!refs) continue;
      refs.meta.textContent =
        clip.source === 'image'
          ? formatClock(clip.shareTotal)
          : clip.duration > 0
            ? formatClock(clip.duration)
            : '—';
      refs.row.classList.toggle('selected', clip.id === selectedClipId);
    }
  };

  const showRecorded = (clip: Clip | null): void => {
    if (clip?.videoCreation) {
      recordedBanner.textContent = t('clip.recorded', {
        date: fmtRecorded(clip.videoCreation),
      });
      recordedBanner.title = t('activity.localTip', {
        time: formatFixedZone(clip.videoCreation, clip.tz),
        off: tzName(clip.tz),
      });
    } else {
      recordedBanner.textContent = t('clip.recordedNone');
      recordedBanner.title = '';
    }
    recordedBanner.classList.toggle('warn', !clip?.videoCreation);
  };

  const refreshClipInstant = (clip: Clip): void => {
    clip.videoCreation =
      clip.videoWallMs === null ? null : new Date(resolveVideoInstant(clip.videoWallMs, clip.tz));
  };

  const syncTzSelect = (): void => {
    const clip = activeClip();
    if (clip) tzSelect.value = String(clip.tz);
  };

  const selectClip = (id: number): void => {
    const clip = clips.find((c) => c.id === id);
    if (!clip) return;
    const prevSource = activeClip()?.source ?? 'video';
    selectedClipId = id;
    const isImage = clip.source === 'image';
    if (isImage) {
      video.pause();
      shareT = 0;
      shareLast = 0;
      sharePlaying = true;
      // Image context locks the share template; leaving restores the video one.
      if (prevSource !== 'image' && selectedTemplateId !== SHARE_TEMPLATE_ID) {
        lastVideoTemplateId = selectedTemplateId;
        selectedTemplateId = SHARE_TEMPLATE_ID;
        selected = null;
      } else {
        selectedTemplateId = SHARE_TEMPLATE_ID;
      }
    } else {
      if (video.src !== clip.url) {
        video.src = clip.url;
        srcClipId = clip.id;
        video.currentTime = 0;
      }
      if (prevSource === 'image') {
        selectedTemplateId = lastVideoTemplateId ?? selectedTemplateId;
        selected = null;
      }
    }
    trimStartInput.value = clip.trimStart > 0 ? String(clip.trimStart) : '';
    trimEndInput.value = clip.trimEnd !== null ? String(clip.trimEnd) : '';
    audioCheck.checked = clip.includeAudio;
    trimRow.hidden = isImage;
    audioLabel.hidden = isImage;
    tzRow.hidden = isImage;
    timeline.hidden = isImage;
    if (isImage) playBtn.disabled = false;
    else if (video.readyState >= 1) playBtn.disabled = false;
    shareRow.hidden = !isImage;
    if (isImage) {
      animInput.value = String(clip.shareAnim);
      totalInput.value = String(clip.shareTotal);
    }
    syncTzSelect();
    syncCardGate();
    syncCards();
    syncKindOptions();
    syncPlayBtn();
    clipName.textContent = clip.name;
    showRecorded(clip);
    binMetaSig = '';
    syncBinMeta();
  };

  const removeClip = (id: number): void => {
    if (rendering) {
      showToast(t('st.removeBlocked'));
      return;
    }
    const idx = clips.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const [clip] = clips.splice(idx, 1);
    if (clip.url.startsWith('blob:')) URL.revokeObjectURL(clip.url);
    if (selectedClipId === id) {
      selectedClipId = null;
      const next = clips[0];
      if (next) {
        // selectClip can't see the removed clip's context (id already nulled).
        if (clip.source === 'image' && next.source === 'video' && selectedTemplateId === SHARE_TEMPLATE_ID) {
          selectedTemplateId = lastVideoTemplateId ?? selectedTemplateId;
          selected = null;
        }
        selectClip(next.id);
      } else {
        video.removeAttribute('src');
        video.load();
        timeline.disabled = true;
        timeline.value = '0';
        timeline.max = '0';
        playBtn.disabled = true;
        clipName.textContent = t('clip.none');
        showRecorded(null);
        syncTzSelect();
        shareRow.hidden = true;
        timeline.hidden = false;
        if (selectedTemplateId === SHARE_TEMPLATE_ID) {
          selectedTemplateId = lastVideoTemplateId ?? BUILTIN_TEMPLATES[0].id;
        }
        syncCardGate();
        syncCards();
      }
    }
    binMetaSig = '';
    syncBin();
  };

  const applyAutoOffset = (clip: Clip): boolean => {
    if (!activity || !clip.videoCreation) return false;
    clip.offsetSec = Math.min(
      OFFSET_LIMIT,
      Math.max(
        -OFFSET_LIMIT,
        (clip.videoCreation.getTime() - activity.startTime.getTime()) / 1000,
      ),
    );
    clip.offsetDirty = true;
    return true;
  };

  const tryAutoSync = (clip: Clip | null = activeClip()): void => {
    if (!clip || clip.offsetDirty) return;
    if (!activity || !clip.videoCreation) {
      if (activity && !clip.videoCreation) {
        showToast(
          t('st.noDate', { name: clip.name }),
        );
      }
      return;
    }
    const fmt = (d: Date): string => d.toLocaleTimeString(getLocale(), { hour12: false });
    applyAutoOffset(clip);
    showToast(
      t('st.autoOffset', {
        name: clip.name,
        off: formatOffset(clip.offsetSec),
        a: fmt(clip.videoCreation),
        b: fmt(activity.startTime),
      }),
    );
  };

  const addClip = (file: Blob, name: string): number => {
    const isImage = file.type.startsWith('image/');
    const clip: Clip = {
      id: nextClipId++,
      name,
      file,
      url: URL.createObjectURL(file),
      duration: 0,
      videoCreation: null,
      videoWallMs: null,
      tz: BROWSER_TZ,
      offsetSec: 0,
      offsetDirty: false,
      trimStart: 0,
      trimEnd: null,
      includeAudio: true,
      status: 'listo',
      source: isImage ? 'image' : 'video',
      img: null,
      imgW: 0,
      imgH: 0,
      shareAnim: 4,
      shareTotal: 8,
    };
    clips.push(clip);
    syncBin();
    if (selectedClipId === null) selectClip(clip.id);
    else binMetaSig = '';
    if (isImage) {
      // Still frames carry no recording metadata: just decode for preview dims.
      const img = new Image();
      img.onload = () => {
        if (!clips.includes(clip)) return;
        clip.img = img;
        clip.imgW = img.naturalWidth;
        clip.imgH = img.naturalHeight;
        lastLiveSig = '';
      };
      img.src = clip.url;
      showToast(t('st.clipAdded', { name }));
      return clip.id;
    }
    void Promise.all([getCreationDate(file), getCreationTime(file)]).then(([cd, ct]) => {
      if (!clips.includes(clip)) return;
      if (cd) {
        clip.videoWallMs = cd.wallMs;
        // A file-declared zone wins over the browser assumption.
        const browserMin = -new Date(cd.wallMs).getTimezoneOffset();
        if (cd.offsetMin !== browserMin && FIXED_TZS.includes(cd.offsetMin / 60)) {
          clip.tz = cd.offsetMin / 60;
        }
      } else if (ct) {
        clip.videoWallMs = ct.getTime();
      }
      refreshClipInstant(clip);
      if (clip.id === selectedClipId) {
        showRecorded(clip);
        syncTzSelect();
      }
      tryAutoSync(clip);
      binMetaSig = '';
    });
    showToast(t('st.clipAdded', { name }));
    return clip.id;
  };

  /** Any parsed source (file, provider streams) becomes the activity here. */
  const loadActivity = (
    act: Activity,
    name: string,
    tzMeta?: { wall: string; offsetHours: number } | null,
  ): void => {
    activity = act;
    activityTz = tzMeta ?? null;
    activityTzEditing = false;
    activityPill.textContent = name;
    activityPill.hidden = false;
    overviewCache = null;
    const metric = pickOverviewMetric(activity);
    if (metric) {
      let min = Infinity;
      let max = -Infinity;
      for (const s of activity.samples) {
        const v = s[metric];
        if (typeof v === 'number') {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      if (max > min) overviewCache = { metric, min, max };
    }
    const s = summarize(activity);
    const distUnit = formatMetric('distance', s.distanceM, units);
    const speedUnit = s.avgSpeed !== null ? formatMetric('speed', s.avgSpeed, units) : null;
    footer.textContent =
      t('activity.footer1', { name, n: s.samples, dur: formatSpan(s.durationSec) }) +
      `, ${distUnit.value} ${distUnit.unit}` +
      (speedUnit ? t('activity.footerAvg', { v: speedUnit.value, u: speedUnit.unit }) : '') +
      t('activity.footerSchema', { v: TEMPLATE_SCHEMA_VERSION });
    // One ride, many videos: every undated clip gets its auto offset now.
    for (const clip of clips) {
      if (!clip.offsetDirty) applyAutoOffset(clip);
    }
    renderActivityStats();
    syncActivityTzRow();
    const clip = activeClip();
    if (clip && activity && !clip.videoCreation) tryAutoSync(clip);
    binMetaSig = '';
  };

  const loadActivityFile = (buffer: ArrayBuffer, name: string): void => {
    // One file loader, three formats: XML tracks share the telemetry builder.
    const ext = name.toLowerCase().split('.').pop();
    if (ext !== 'fit' && ext !== 'gpx' && ext !== 'tcx') {
      activity = null;
      activityTz = null;
      activityTzEditing = false;
      activityPill.hidden = true;
      renderActivityStats();
      syncActivityTzRow();
      showToast(t('st.activityBadType'));
      return;
    }
    try {
      const act =
        ext === 'gpx' || ext === 'tcx'
          ? parseActivityXml(new TextDecoder().decode(buffer))
          : parseFit(buffer);
      loadActivity(act, name);
    } catch (err) {
      activity = null;
      activityTz = null;
      activityTzEditing = false;
      activityPill.hidden = true;
      renderActivityStats();
      syncActivityTzRow();
      showToast(err instanceof Error ? err.message : t('st.activityUnreadable'));
    }
  };

  videoInput.addEventListener('change', () => {
    const files = videoInput.files;
    if (files) for (const file of files) addClip(file, file.name);
    videoInput.value = '';
  });

  activityInput.addEventListener('change', () => {
    const file = activityInput.files?.[0];
    if (file) {
      void file
        .arrayBuffer()
        .then((buffer) => loadActivityFile(buffer, file.name))
        .catch(() => showToast(t('st.activityUnreadable')));
    }
  });

  if (import.meta.env.DEV) {
    const loadFixtures = (which: 'vert' | 'hz'): void => {
      showToast(t('st.loadingFixtures'));
      let fixtureId = -1;
      void import('./fixtures.js')
        .then(({ FIXTURE_VIDEO_VERT_URL, FIXTURE_VIDEO_HZ_URL, FIXTURE_FIT_URL }) => {
          const [videoUrl, videoName] =
            which === 'vert'
              ? [FIXTURE_VIDEO_VERT_URL, 'sample-vertical.mp4']
              : [FIXTURE_VIDEO_HZ_URL, 'sample-720p.mp4'];
          return fetch(videoUrl)
            .then((res) => {
              if (!res.ok) throw new Error(t('st.errFixtureVideo'));
              return res.blob();
            })
            .then((blob) => {
              fixtureId = addClip(blob, videoName);
            })
          .then(() => fetch(FIXTURE_FIT_URL))
          .then((res) => {
            if (!res.ok) throw new Error(t('st.errFixtureFit'));
            return res.arrayBuffer();
          })
          .then((buffer) => {
            loadActivityFile(buffer, 'sample.fit');
            // Fixtures are synthetic: pin sync instead of trusting file dates.
            const clip = clips.find((c) => c.id === fixtureId);
            if (clip) {
              clip.offsetSec = 0;
              clip.offsetDirty = true;
              binMetaSig = '';
            }
          });
        })
        .catch((err: unknown) => {
          showToast(err instanceof Error ? err.message : t('st.errFixtures'));
        });
    };
    fixtureVertBtn.addEventListener('click', () => loadFixtures('vert'));
    fixtureHzBtn.addEventListener('click', () => loadFixtures('hz'));
  }

  // Sync buttons act on the selected clip.
  const needClip = (): Clip | null => {
    const clip = activeClip();
    if (!clip) showToast(t('st.needVideo'));
    return clip;
  };
  const autoBtn = el('button', 'btn', t('sync.auto'));
  autoBtn.type = 'button';
  autoBtn.title = t('sync.autoTitle');
  autoBtn.addEventListener('click', () => {
    const clip = needClip();
    if (!clip) return;
    if (!activity) {
      showToast(t('sync.noActivity'));
      return;
    }
    if (!clip.videoCreation) {
      showToast(t('sync.noDate'));
      return;
    }
    applyAutoOffset(clip);
  });
  offsetBtns.appendChild(autoBtn);
  for (const delta of [-0.5, -0.1, 0.1, 0.5]) {
    const btn = el('button', 'btn', `${delta > 0 ? '+' : ''}${delta.toFixed(1)} s`);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      const clip = needClip();
      if (!clip) return;
      clip.offsetSec = Math.min(OFFSET_LIMIT, Math.max(-OFFSET_LIMIT, clip.offsetSec + delta));
      clip.offsetDirty = true;
    });
    offsetBtns.appendChild(btn);
  }
  // Activity overview: coarse clip positioning for long activities.
  type OverviewMetric = 'power' | 'speed' | 'heartRate';
  const OVERVIEW_LABELS: Record<OverviewMetric, string> = {
    power: t('act.power'),
    speed: t('act.speed'),
    heartRate: t('act.hr'),
  };
  const OVERVIEW_PAD = 10;
  let overviewCache: { metric: OverviewMetric; min: number; max: number } | null = null;

  const pickOverviewMetric = (act: Activity): OverviewMetric | null => {
    const keys: OverviewMetric[] = ['power', 'speed', 'heartRate'];
    const stride = Math.max(1, Math.floor(act.samples.length / 200));
    for (const key of keys) {
      let present = 0;
      let total = 0;
      for (let i = 0; i < act.samples.length; i += stride) {
        total += 1;
        if (typeof act.samples[i][key] === 'number') present += 1;
      }
      if (total > 0 && present / total > 0.5) return key;
    }
    return null;
  };

  let lastOverviewSig = '';
  const paintOverview = (tt: number): void => {
    const sig = `${tt.toFixed(2)}|${activity?.durationSec ?? -1}|${overviewCache ? `${overviewCache.metric}|${overviewCache.min}|${overviewCache.max}` : ''}|${clips.map((c) => `${c.id}:${c.offsetSec}:${c.trimStart}:${c.trimEnd ?? ''}:${c.status}`).join(',')}|${selectedClipId}|${activityCanvas.width}x${activityCanvas.height}`;
    if (sig === lastOverviewSig) return;
    lastOverviewSig = sig;
    const W = activityCanvas.width;
    const H = activityCanvas.height;
    activityCtx.fillStyle = '#ffffff';
    activityCtx.fillRect(0, 0, W, H);
    if (!activity || !overviewCache || activity.durationSec <= 0) {
      activityCtx.fillStyle = '#898989';
      activityCtx.font = '300 20px Inter, system-ui, sans-serif';
      activityCtx.textAlign = 'center';
      activityCtx.textBaseline = 'middle';
      activityCtx.fillText(
        activity ? t('act.noData') : t('act.emptyCanvas'),
        W / 2,
        H / 2,
      );
      activityLabel.textContent = activity ? '' : t('act.empty');
      return;
    }
    const { metric, min, max } = overviewCache;
    const dur = activity.durationSec;
    const X = (t: number): number =>
      OVERVIEW_PAD + (Math.min(Math.max(t, 0), dur) / dur) * (W - OVERVIEW_PAD * 2);
    const Y = (v: number): number =>
      H - OVERVIEW_PAD - ((v - min) / (max - min)) * (H - OVERVIEW_PAD * 2);
    activityCtx.beginPath();
    activityCtx.moveTo(X(0), H - OVERVIEW_PAD);
    const stride = Math.max(1, Math.floor(activity.samples.length / 400));
    for (let i = 0; i < activity.samples.length; i += stride) {
      const s = activity.samples[i];
      const v = s[metric];
      activityCtx.lineTo(X(s.t), Y(typeof v === 'number' ? v : min));
    }
    activityCtx.lineTo(X(dur), H - OVERVIEW_PAD);
    activityCtx.closePath();
    activityCtx.fillStyle = 'rgba(36, 36, 36, 0.14)';
    activityCtx.fill();
    for (const clip of clips) {
      const [winStart, winEnd] = clipWindow(clip);
      const selected = clip.id === selectedClipId;
      activityCtx.fillStyle = selected ? 'rgba(0, 153, 255, 0.16)' : 'rgba(36, 36, 36, 0.10)';
      activityCtx.fillRect(X(winStart), 2, Math.max(2, X(winEnd) - X(winStart)), H - 4);
      activityCtx.strokeStyle = selected ? '#101010' : '#898989';
      activityCtx.lineWidth = 1;
      activityCtx.strokeRect(X(winStart) + 0.5, 2.5, Math.max(2, X(winEnd) - X(winStart)), H - 5);
    }
    activityCtx.strokeStyle = '#0099ff';
    activityCtx.lineWidth = 2;
    activityCtx.beginPath();
    activityCtx.moveTo(X(tt), 0);
    activityCtx.lineTo(X(tt), H);
    activityCtx.stroke();
    const clip = activeClip();
    activityLabel.textContent = clip
      ? t('act.labelClip', {
          metric: OVERVIEW_LABELS[metric],
          clip: clip.name,
          a: formatSpan(clipWindow(clip)[0]),
          b: formatSpan(clipWindow(clip)[1]),
        })
      : t('act.labelN', { metric: OVERVIEW_LABELS[metric], n: clips.length });
  };

  const overviewSeek = (clientX: number, center: boolean): void => {
    const clip = activeClip();
    if (!clip || !activity || activity.durationSec <= 0) return;
    const rect = activityCanvas.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * activityCanvas.width;
    const t =
      ((px - OVERVIEW_PAD) / (activityCanvas.width - OVERVIEW_PAD * 2)) * activity.durationSec;
    const videoDur = clip.duration > 0 ? clip.duration : 0;
    const maxStart = Math.max(0, activity.durationSec - videoDur);
    const target = center ? t - videoDur / 2 : t - (overviewDrag?.grabDelta ?? 0);
    clip.offsetSec = Math.min(
      OFFSET_LIMIT,
      Math.max(-OFFSET_LIMIT, Math.min(Math.max(target, 0), maxStart)),
    );
    clip.offsetDirty = true;
  };

  let overviewDrag: { grabDelta: number; downX: number; downY: number; moved: boolean } | null =
    null;
  activityCanvas.addEventListener('pointerdown', (e) => {
    const clip = activeClip();
    if (!clip || !activity || activity.durationSec <= 0) return;
    const rect = activityCanvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * activityCanvas.width;
    const t =
      ((px - OVERVIEW_PAD) / (activityCanvas.width - OVERVIEW_PAD * 2)) * activity.durationSec;
    overviewDrag = {
      grabDelta: t - clip.offsetSec,
      downX: e.clientX,
      downY: e.clientY,
      moved: false,
    };
    activityCanvas.setPointerCapture(e.pointerId);
  });
  activityCanvas.addEventListener('pointermove', (e) => {
    if (!overviewDrag) return;
    if (Math.hypot(e.clientX - overviewDrag.downX, e.clientY - overviewDrag.downY) > 4) {
      overviewDrag.moved = true;
    }
    if (overviewDrag.moved) overviewSeek(e.clientX, false);
  });
  activityCanvas.addEventListener('pointerup', (e) => {
    if (overviewDrag && !overviewDrag.moved) overviewSeek(e.clientX, true);
    overviewDrag = null;
  });
  activityCanvas.addEventListener('pointercancel', () => {
    overviewDrag = null;
  });

  const syncPlayBtn = (): void => {
    const paused = isImageCtx() ? !sharePlaying : video.paused;
    playIcon.classList.toggle('icon-play', paused);
    playIcon.classList.toggle('icon-pause', !paused);
    playBtn.setAttribute('aria-label', paused ? t('stage.play') : t('stage.pause'));
  };

  const togglePlay = (): void => {
    if (isImageCtx()) {
      sharePlaying = !sharePlaying;
      syncPlayBtn();
      return;
    }
    if (!video.src) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
    syncPlayBtn();
  };

  playBtn.addEventListener('click', togglePlay);
  video.addEventListener('play', syncPlayBtn);
  video.addEventListener('pause', syncPlayBtn);

  // Widget drag & drop on the live canvas.
  interface DragState {
    widgetId: string;
    mode: 'move' | 'resize';
    corner: 'nw' | 'ne' | 'sw' | 'se' | null;
    dx: number;
    dy: number;
    moved: boolean;
  }
  let drag: DragState | null = null;
  let downPos: { x: number; y: number } | null = null;

  const toNorm = (e: { clientX: number; clientY: number }): { nx: number; ny: number } => {
    const rect = canvas.getBoundingClientRect();
    return {
      nx: (e.clientX - rect.left) / rect.width,
      ny: (e.clientY - rect.top) / rect.height,
    };
  };

  const hitWidget = (nx: number, ny: number): string | undefined => {
    const template = selectedTemplate();
    if (!template || !activity) return undefined;
    const widgets = effectiveTemplate(template).widgets;
    for (let i = widgets.length - 1; i >= 0; i--) {
      const w = widgets[i];
      if (!w.visible) continue;
      const b = resolveNorm(w, canvas.width, canvas.height);
      if (nx >= b.x && nx <= b.x + b.w && ny >= b.y && ny <= b.y + b.h) return w.id;
    }
    return undefined;
  };

  const selectedBox = (): { x: number; y: number; w: number; h: number } | null => {
    const template = selectedTemplate();
    const sel = selected;
    if (!template || !sel || sel.templateId !== template.id || !activity) return null;
    const found = effectiveTemplate(template).widgets.find((w) => w.id === sel.widgetId);
    return found ? resolveNorm(found, canvas.width, canvas.height) : null;
  };

  const onCorner = (e: {
    clientX: number;
    clientY: number;
    pointerType?: string;
  }): 'nw' | 'ne' | 'sw' | 'se' | null => {
    const box = selectedBox();
    if (!box) return null;
    const rect = canvas.getBoundingClientRect();
    const slop = e.pointerType === 'touch' ? HANDLE_PX * 2 : HANDLE_PX;
    const x0 = rect.left + box.x * rect.width;
    const x1 = rect.left + (box.x + box.w) * rect.width;
    const y0 = rect.top + box.y * rect.height;
    const y1 = rect.top + (box.y + box.h) * rect.height;
    const inX0 = e.clientX >= x0 && e.clientX <= x0 + slop;
    const inX1 = e.clientX >= x1 - slop && e.clientX <= x1;
    const inY0 = e.clientY >= y0 && e.clientY <= y0 + slop;
    const inY1 = e.clientY >= y1 - slop && e.clientY <= y1;
    if (inX0 && inY0) return 'nw';
    if (inX1 && inY0) return 'ne';
    if (inX0 && inY1) return 'sw';
    if (inX1 && inY1) return 'se';
    return null;
  };

  canvas.addEventListener('pointerdown', (e) => {
    downPos = { x: e.clientX, y: e.clientY };
    const template = selectedTemplate();
    if (!template) return;
    const { nx, ny } = toNorm(e);
    const hit = hitWidget(nx, ny);
    if (!hit) return;
    selected = { templateId: template.id, widgetId: hit };
    const found = effectiveTemplate(template).widgets.find((w) => w.id === hit);
    if (!found) return;
    const box = resolveNorm(found, canvas.width, canvas.height);
    const corner = onCorner(e);
    drag =
      corner === null
        ? { widgetId: hit, mode: 'move', corner, dx: nx - box.x, dy: ny - box.y, moved: false }
        : {
            widgetId: hit,
            mode: 'resize',
            corner,
            dx: corner === 'nw' || corner === 'sw' ? nx - box.x : box.x + box.w - nx,
            dy: corner === 'nw' || corner === 'ne' ? ny - box.y : box.y + box.h - ny,
            moved: false,
          };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor =
      corner === null
        ? 'grabbing'
        : corner === 'nw' || corner === 'se'
          ? 'nwse-resize'
          : 'nesw-resize';
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      const template = selectedTemplate();
      if (!template) return;
      if (
        downPos &&
        Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 3
      ) {
        drag.moved = true;
      }
      const W = canvas.width;
      const H = canvas.height;
      const minW = MIN_PX_W / W;
      const minH = MIN_PX_H / H;
      const widgetId = drag.widgetId;
      const found = effectiveTemplate(template).widgets.find((w) => w.id === widgetId);
      if (!found) return;
      const box = resolveNorm(found, W, H);
      const { nx, ny } = toNorm(e);
      const perTemplate = ovMap(layoutOverrides, template.id);
      if (drag.mode === 'resize' && drag.corner !== null) {
        const x1 = box.x + box.w;
        const y1 = box.y + box.h;
        const west = drag.corner === 'nw' || drag.corner === 'sw';
        const north = drag.corner === 'nw' || drag.corner === 'ne';
        const x = west ? Math.min(Math.max(nx - drag.dx, 0), x1 - minW) : box.x;
        const y = north ? Math.min(Math.max(ny - drag.dy, 0), y1 - minH) : box.y;
        const w = west ? x1 - x : Math.min(Math.max(nx + drag.dx - x, minW), 1 - x);
        const h = north ? y1 - y : Math.min(Math.max(ny + drag.dy - y, minH), 1 - y);
        perTemplate.set(drag.widgetId, normToLayout({ x, y, w, h }, W, H));
      } else {
        perTemplate.set(
          drag.widgetId,
          normToLayout(
            {
              x: Math.min(Math.max(nx - drag.dx, 0), 1 - box.w),
              y: Math.min(Math.max(ny - drag.dy, 0), 1 - box.h),
              w: box.w,
              h: box.h,
            },
            W,
            H,
          ),
        );
      }
      bumpRev();
    } else if (e.pointerType === 'mouse' && downPos === null) {
      const { nx, ny } = toNorm(e);
      const corner = onCorner(e);
      if (corner !== null) {
        canvas.style.cursor = corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize';
      } else {
        canvas.style.cursor = hitWidget(nx, ny) ? 'grab' : 'default';
      }
    }
  });

  const endDrag = (e: PointerEvent): void => {
    if (drag) {
      drag = null;
      canvas.style.cursor = 'default';
    } else if (
      downPos &&
      Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 6
    ) {
      // Empty click only deselects: play lives on the play button.
      selected = null;
    }
    downPos = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => {
    drag = null;
    downPos = null;
  });

  canvas.addEventListener('dblclick', (e) => {
    const template = selectedTemplate();
    if (!template) return;
    const { nx, ny } = toNorm(e);
    const hit = hitWidget(nx, ny);
    if (hit && layoutOverrides.get(template.id)?.delete(hit)) bumpRev();
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const template = selectedTemplate();
    if (!template) return;
    const { nx, ny } = toNorm(e);
    const hit = hitWidget(nx, ny);
    if (!hit) return;
    hideWidget(template, hit);
  });

  const outputName = (clip: Clip): string => {
    const base = clip.name.replace(/\.[^.]*$/, '') || 'clip';
    return `${base}-overlay.mp4`;
  };

  /** Direct-to-disk render destination (File System Access, Chromium-only). */
  interface DiskSave {
    stream: FileSystemWritableFileStream;
    name: string;
  }
  const canPickFile = (): boolean => typeof window.showSaveFilePicker === 'function';
  const canPickDir = (): boolean => typeof window.showDirectoryPicker === 'function';
  // In-memory fallback warning: without the pickers above, the whole output is
  // buffered in RAM and long renders may die. Backdrop/Esc count as cancel.
  const memDialog = el('dialog', 'add-dialog');
  memDialog.append(el('h2', undefined, t('r.memH')));
  memDialog.append(el('p', 'muted', t('r.memBody')));
  const memActions = el('div', 'add-actions');
  const memGoBtn = el('button', 'btn btn-primary', t('r.memGo'));
  memGoBtn.type = 'button';
  const memCancelBtn = el('button', 'btn', t('tpl.cancel'));
  memCancelBtn.type = 'button';
  memActions.append(memGoBtn, memCancelBtn);
  memDialog.append(memActions);
  wrap.appendChild(memDialog);
  let memResolve: ((ok: boolean) => void) | null = null;
  memGoBtn.addEventListener('click', () => memDialog.close('go'));
  memCancelBtn.addEventListener('click', () => memDialog.close());
  memDialog.addEventListener('close', () => {
    memResolve?.(memDialog.returnValue === 'go');
    memResolve = null;
  });
  wireBackdropClose(memDialog);
  const confirmMemoryRender = (): Promise<boolean> =>
    new Promise((resolve) => {
      memResolve = resolve;
      showModal(memDialog);
    });
  /** Best effort: discard the partial temp file (rejects when still locked). */
  const abortSave = async (save: DiskSave): Promise<void> => {
    try {
      await save.stream.abort();
    } catch {
      /* ignore: the browser drops unclosed writables on its own */
    }
  };

  /** Renders one clip; sequential by design (one encoder at a time). */
  const renderOne = async (clip: Clip, tag: string, save: DiskSave | null = null): Promise<void> => {
    if (!activity) throw new Error(t('sync.noActivity'));
    const template = selectedTemplate();
    if (!template) throw new Error(t('r.errTemplate'));
    const trimStart = Math.max(0, clip.trimStart);
    if (clip.source === 'video' && clip.trimEnd !== null && !(clip.trimEnd > trimStart)) {
      throw new Error(t('r.errTrim', { name: clip.name }));
    }
    clip.status = 'renderizando';
    binMetaSig = '';
    const onProgress = (done: number, total: number): void => {
      progress.value = total > 0 ? done / total : 0;
      progressLabel.textContent = t('r.progressLine', {
        tag,
        name: clip.name,
        done: formatClock(done),
        total: formatClock(total),
      });
    };
    const blob =
      clip.source === 'image'
        ? await renderImage({
            file: clip.file,
            activity,
            template: effectiveTemplate(template),
            units,
            animSec: clip.shareAnim,
            totalSec: clip.shareTotal,
            saveStream: save?.stream,
            onProgress,
          })
        : await renderVideo({
            file: clip.file,
            activity,
            offsetSec: clip.offsetSec,
            template: effectiveTemplate(template),
            units,
            includeAudio: clip.includeAudio,
            trimStart,
            trimEnd: clip.trimEnd,
            saveStream: save?.stream,
            onProgress,
          });
    if (blob === null) {
      // Streamed path: finalize already closed the file; nothing to download.
      result.appendChild(el('p', 'result-line', t('r.saved', { name: save?.name ?? outputName(clip) })));
      clip.status = 'hecho';
      binMetaSig = '';
      return;
    }
    const url = URL.createObjectURL(blob);
    renderUrls.push(url);
    const mb = (blob.size / 1024 / 1024).toFixed(2);
    const line = el('p', 'result-line');
    const link = el('a', undefined, `${outputName(clip)} (${mb} MB)`);
    link.href = url;
    link.download = outputName(clip);
    line.append(t('r.ready'), link);
    result.appendChild(line);
    clip.status = 'hecho';
    binMetaSig = '';
  };

  const setRendering = (on: boolean): void => {
    rendering = on;
    renderBtn.disabled = on;
    renderAllBtn.disabled = on;
    progress.hidden = !on;
    if (on) {
      progress.value = 0;
      for (const u of renderUrls) URL.revokeObjectURL(u);
      renderUrls = [];
      result.innerHTML = '';
    }
  };

  /** Failed clip render: error state + toast (picker-cancel paths return before this). */
  const failClip = (clip: Clip, err: unknown): void => {
    clip.status = 'error';
    binMetaSig = '';
    showToast(err instanceof Error ? err.message : t('r.failed'));
  };
  renderBtn.addEventListener('click', () => {
    if (rendering) return;
    const clip = needClip();
    if (!clip || !activity) {
      if (!activity) showToast(t('sync.noActivity'));
      return;
    }
    void (async () => {
      // Disk path first: one save picker, output streams to the file.
      let save: DiskSave | null = null;
      if (canPickFile()) {
        try {
          const handle = await window.showSaveFilePicker?.({
            suggestedName: outputName(clip),
            types: [{ description: 'MP4', accept: { 'video/mp4': ['.mp4'] } }],
          });
          if (!handle) return;
          save = { stream: await handle.createWritable(), name: outputName(clip) };
        } catch {
          return; // picker cancelled: leave everything untouched
        }
      } else if (!(await confirmMemoryRender())) {
        return;
      }
      setRendering(true);
      try {
        await renderOne(clip, t('r.tagOne'), save);
        progressLabel.textContent = '';
        showToast(t('r.doneOne', { name: outputName(clip) }));
      } catch (err: unknown) {
        if (save) await abortSave(save);
        failClip(clip, err);
        progressLabel.textContent = '';
      } finally {
        setRendering(false);
      }
    })();
  });

  renderAllBtn.addEventListener('click', () => {
    if (rendering) return;
    if (clips.length === 0) {
      showToast(t('st.needVideo'));
      return;
    }
    if (!activity) {
      showToast(t('sync.noActivity'));
      return;
    }
    void (async () => {
      // Disk path first: one folder picker for the whole batch.
      let dir: FileSystemDirectoryHandle | null = null;
      if (canPickDir()) {
        try {
          dir = (await window.showDirectoryPicker?.()) ?? null;
        } catch {
          return; // picker cancelled: leave everything untouched
        }
        if (!dir) return;
      } else if (!(await confirmMemoryRender())) {
        return;
      }
      // Same-name clips must not overwrite each other inside the folder.
      const usedNames = new Set<string>();
      const uniqueName = (base: string): string => {
        let name = base;
        let n = 2;
        while (usedNames.has(name)) {
          name = base.replace(/\.mp4$/, ` (${n}).mp4`);
          n += 1;
        }
        usedNames.add(name);
        return name;
      };
      setRendering(true);
      try {
        let done = 0;
        for (const clip of clips) {
          let save: DiskSave | null = null;
          if (dir) {
            try {
              const name = uniqueName(outputName(clip));
              const fileHandle = await dir.getFileHandle(name, { create: true });
              save = { stream: await fileHandle.createWritable(), name };
            } catch (err) {
              failClip(clip, err);
              break;
            }
          }
          try {
            await renderOne(clip, t('r.tagN', { done: done + 1, total: clips.length }), save);
            done += 1;
          } catch (err) {
            if (save) await abortSave(save);
            failClip(clip, err);
            break;
          }
        }
        progressLabel.textContent = '';
        if (done === clips.length) showToast(t('r.doneN', { done }));
      } finally {
        setRendering(false);
      }
    })();
  });

  video.addEventListener('error', () => {
    showToast(t('st.videoDecode'));
  });

  video.addEventListener('loadedmetadata', () => {
    timeline.max = String(video.duration);
    timeline.disabled = false;
    playBtn.disabled = false;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    // The event may land after the user switched clips: tag the clip this src belongs to.
    const clip = srcClipId !== null ? (clips.find((c) => c.id === srcClipId) ?? null) : activeClip();
    if (clip) {
      clip.duration = Number.isFinite(video.duration) ? video.duration : 0;
      binMetaSig = '';
    }
    const thumbClass = classifyAspect(canvas.width, canvas.height);
    if (thumbClass !== thumbAspect) {
      thumbAspect = thumbClass;
      sizeThumbs();
      repaintThumbs(lastThumbSample);
    }
    if (
      clip &&
      clip.id === selectedClipId &&
      trimEndInput.value.trim() === '' &&
      Number.isFinite(video.duration)
    ) {
      trimEndInput.value = video.duration.toFixed(1);
      clip.trimEnd = Number.isFinite(video.duration) ? video.duration : null;
    }
  });

  let scrubbing = false;
  timeline.addEventListener('pointerdown', () => {
    scrubbing = true;
  });
  window.addEventListener('pointerup', () => {
    scrubbing = false;
  });
  timeline.addEventListener('input', () => {
    video.currentTime = Number(timeline.value);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === ' ') return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
      return;
    const step = event.shiftKey ? 0.5 : 0.1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const clip = activeClip();
      if (!clip) return;
      const delta = event.key === 'ArrowLeft' ? -step : step;
      clip.offsetSec = Math.min(OFFSET_LIMIT, Math.max(-OFFSET_LIMIT, clip.offsetSec + delta));
      clip.offsetDirty = true;
      event.preventDefault();
    }
  });

  const paintPlaceholder = (): void => {
    if (canvas.width === 300 && canvas.height === 150) {
      canvas.width = 1280;
      canvas.height = 720;
    }
    liveCtx.fillStyle = '#0d0d0d';
    liveCtx.fillRect(0, 0, canvas.width, canvas.height);
    liveCtx.fillStyle = '#898989';
    liveCtx.font = '300 28px Inter, system-ui, sans-serif';
    liveCtx.textAlign = 'center';
    liveCtx.textBaseline = 'middle';
    liveCtx.fillText(t('stage.empty'), canvas.width / 2, canvas.height / 2);
  };
  paintPlaceholder();

  let lastLiveSig = '';

  /** Selection outline + resize handles. Preview-only: render.ts never sees it. */
  const paintSelection = (): void => {
    const selBox = selectedBox();
    if (!selBox) return;
    const sx = selBox.x * canvas.width;
    const sy = selBox.y * canvas.height;
    const sw = selBox.w * canvas.width;
    const sh = selBox.h * canvas.height;
    liveCtx.save();
    liveCtx.lineWidth = 10;
    liveCtx.strokeStyle = '#ffffff';
    liveCtx.strokeRect(sx, sy, sw, sh);
    liveCtx.strokeStyle = '#0099ff';
    liveCtx.lineWidth = 5;
    liveCtx.setLineDash([12, 7]);
    liveCtx.strokeRect(sx, sy, sw, sh);
    liveCtx.setLineDash([]);
    const hs = Math.max(14, canvas.width * 0.012);
    liveCtx.fillStyle = '#ffffff';
    liveCtx.strokeStyle = '#0099ff';
    liveCtx.lineWidth = 3;
    for (const [hx, hy] of [
      [sx, sy],
      [sx + sw - hs, sy],
      [sx, sy + sh - hs],
      [sx + sw - hs, sy + sh - hs],
    ]) {
      liveCtx.fillRect(hx, hy, hs, hs);
      liveCtx.strokeRect(hx, hy, hs, hs);
    }
    liveCtx.restore();
  };

  const tick = (): void => {
    const clip = activeClip();
    if (pendingToasts.length > 0 && !wrap.querySelector('dialog[open]')) {
      for (const text of pendingToasts.splice(0)) showToast(text);
    }
    const offsetSec = clip?.offsetSec ?? 0;
    const vt = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    if (!scrubbing && Number.isFinite(video.duration)) {
      timeline.max = String(video.duration);
      timeline.value = String(vt);
    }
    // Video time stays outside the canvas: it is UI chrome, never rendered output.
    const dur = Number.isFinite(video.duration) ? video.duration : 0;
    videoClock.textContent = t('stage.video', { vt: formatClock(vt), dur: formatClock(dur) });
    offsetClock.textContent = formatOffset(offsetSec);

    const shareImg = clip?.source === 'image' ? (clip.img && clip.imgW > 0 ? clip.img : null) : null;
    if (shareImg && clip) {
      // Share preview: static image, looping synthetic clock, always repainting.
      const { w: fw, h: fh } = fitShareSize(clip.imgW, clip.imgH);
      if (canvas.width !== fw || canvas.height !== fh) {
        canvas.width = fw;
        canvas.height = fh;
      }
      const now = performance.now();
      // Paused preview still refreshes shareLast so resume doesn't jump.
      const dt = sharePlaying && shareLast > 0 ? (now - shareLast) / 1000 : 0;
      shareLast = now;
      shareT = (shareT + dt) % Math.max(clip.shareTotal, 0.5);
      videoClock.textContent = `${formatClock(shareT)} / ${formatClock(clip.shareTotal)}`;
      offsetClock.textContent = '';
      liveCtx.setTransform(1, 0, 0, 1, 0, 0);
      liveCtx.drawImage(shareImg, 0, 0, fw, fh);
      if (activity) {
        const progress = Math.min(1, shareT / Math.max(clip.shareAnim, 0.1));
        const template = selectedTemplate();
        if (template) {
          drawOverlay(
            liveCtx,
            effectiveTemplate(template),
            sampleAt(activity, activity.durationSec),
            fw,
            fh,
            units,
            { activity, t: activity.durationSec },
            { progress },
          );
        }
        paintSelection();
        teleClock.textContent = t('stage.tele', { t: formatSpan(activity.durationSec), suffix: '' });
        teleClock.classList.toggle('out-of-range', false);
        repaintThumbs(sampleAt(activity, activity.durationSec));
      } else {
        teleClock.textContent = t('stage.teleNone');
        repaintThumbs(DEMO_SAMPLE);
      }
    } else if (video.src && video.readyState >= 2 && video.videoWidth > 0) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      // The video element applies rotation metadata and the canvas tracks the
      // rotation-adjusted videoWidth/videoHeight, so preview stays correct.
      // Paused video repaints only when something actually changed.
      const playing = !video.paused && !video.ended;
      const liveSig = `${vt}|${offsetSec}|${overrideRev}|${units}|${selectedTemplateId}|${selected?.templateId ?? ''}:${selected?.widgetId ?? ''}|${activity?.durationSec ?? -1}|${canvas.width}x${canvas.height}`;
      const drawLive = playing || liveSig !== lastLiveSig;
      if (drawLive) lastLiveSig = liveSig;
      if (drawLive) liveCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (activity) {
        const tt = vt + offsetSec;
        const inRange = tt >= 0 && tt <= activity.durationSec;
        const sample = sampleAt(activity, tt);
        const template = selectedTemplate();
        if (template && drawLive) {
          drawOverlay(
            liveCtx,
            effectiveTemplate(template),
            sample,
            canvas.width,
            canvas.height,
            units,
            { activity, t: tt },
          );
        }
        if (drawLive) paintSelection();
        teleClock.textContent = t('stage.tele', {
          t: formatSpan(sample.t),
          suffix: inRange ? '' : t('stage.outOfRange'),
        });
        teleClock.classList.toggle('out-of-range', !inRange);
        repaintThumbs(sample);
      } else {
        teleClock.textContent = t('stage.teleNone');
        repaintThumbs({ ...DEMO_SAMPLE, t: vt });
      }
    } else if (!video.src) {
      teleClock.textContent = t('stage.teleNone');
      repaintThumbs(DEMO_SAMPLE);
      if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) paintPlaceholder();
    }
    syncBinMeta();
    syncInspector();
    paintOverview(activity ? vt + offsetSec : 0);
    requestAnimationFrame(tick);
  };
  syncBin();
  void bootAccount();
  // Late webfonts would otherwise stick on fallback glyphs behind the paint gates.
  // ready() is one-shot for startup fonts; loadingdone re-arms for families first
  // used later (AI templates), when a paused preview would never repaint.
  const bustPaintGates = (): void => {
    lastLiveSig = '';
    lastOverviewSig = '';
    for (const th of thumbs) th.sig = '';
  };
  void document.fonts?.ready.then(bustPaintGates);
  document.fonts?.addEventListener('loadingdone', bustPaintGates);
  requestAnimationFrame(tick);
}
