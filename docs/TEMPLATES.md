# Template schema v3

Templates are JSON data validated against this spec (see `shared/src/template.ts`
for the types). The renderer (`web/src/overlay.ts`) implements exactly what follows —
nothing more.

## Shape

```jsonc
{
  "schemaVersion": 3,
  "id": "apex",            // unique, lowercase
  "name": "Apex",          // display name
  "description": "…",      // optional
  "theme": {
    "text": "#ffffff",     // value + label text
    "accent": "#00e5ff",   // labels, gauge arc, unit
    "panel": "#0b0e11",    // widget background
    "panelOpacity": 0.6    // 0..1
  },
  "widgets": [ Widget, … ]
}
```

## Widget

```jsonc
{
  "id": "speed",           // unique within the template
  "metric": "speed",       // speed|pace|heartRate|power|cadence|elevation|distance|elapsedTime|grade|vam|gears|none (pace = min/km, only when asked)
  "kind": "gauge",         // stat|number|gauge|speedo|ring|slope|gears|spark|profile|profilenext|vam|map|navmap|compass (required)
  "visible": true,
  "showUnit": true,        // optional, default true
  "showLabel": true,       // optional, default true
  "gearsMode": "teeth",      // optional (gears only): teeth|index
  "gearsSide": "both",        // optional (gears only): both|front|rear
  "range": [0, 12],        // optional gauge scale in raw SI units (default per metric)
  "timeFormat": "hmmss",   // optional elapsed-time display: auto|hmm|hmmss|h|hm (default auto)
  "strokeWidth": 6,        // optional trail width in px (map; auto when absent)
  "style": {               // optional per-widget overrides
    "shape": "pill",       // rect|pill|none (default rect)
    "align": "center",     // optional left|center|right (stat, number; default left, number centers)
    "background": "#000000",
    "backgroundOpacity": 0.5,
    "accent": "#ffffff",
    "text": "#ffffff",
    "labelFont": "Oswald, sans-serif",   // optional, Inter when absent
    "labelScale": 1,                      // optional label size multiplier
    "valueFont": "Oswald, sans-serif",   // optional, Inter when absent
    "valueScale": 1.2                    // optional value (number) size multiplier
  },
  "layout": {              // required: aspect-independent anchor layout
    "ax": "right",         // left|center|right (nearest horizontal edge)
    "ay": "bottom",        // top|center|bottom (nearest vertical edge)
    "px": 4,               // padding from the anchor edge, % of min(W,H)
    "py": 3.5,             // (signed offset when centered)
    "w": 34,               // width, % of min(W,H), or "stretch"
    "h": 14.2              // height, % of min(W,H), or "stretch"
  }
}
```

### Kinds

- `stat`: label (accent, top-left) + value + unit (bottom-left). The default workhorse.
  `showLabel: false` hides the label and centers a larger value.
  Honors `align` (default left).
- `number`: big centered value, unit small beneath. No label. Set `shape: 'none'`
  and `showUnit: false` for a pure floating number. Honors `align` (default center).
- `gauge`: 270° arc with background track + accent value arc, value centered,
  label on top (`showLabel: false` hides it). Scale from `range`, else the built-in default.
- `speedo`: 180° speedometer with ticks, needle and digital readout, label on top
  (`showLabel: false` hides it).
- `ring`: full progress ring for any metric + `range`, value centered, label on top
  (`showLabel: false` hides it).
- `slope`: grade inclinometer, the line tilts at 2× the true angle (capped ±45°), label on top
  (`showLabel: false` hides it).
- `gears`: front × rear teeth from shift events (`gears` metric). English subtitle
  per side (`showLabel: false` hides it). `gearsMode: 'index'` shows cog indexes
  (`1×6`); `gearsSide` picks both/front/rear. Single sides suffix `T` (teeth)
  or `G` (index); both mode shows no unit. `—` without Di2/AXS.
- `spark`: last-30 s area sparkline of any metric + current value, label on top-left
  (`showLabel: false` hides it). Needs history.
- `profile`: full-ride elevation profile, ridden part shaded + you-are-here dot,
  label on top-left (`showLabel: false` hides it). Needs history.
- `profilenext`: 5-min lookahead elevation window, dot ~0.5 km ahead of the
  rendered start, label on top-left (`showLabel: false` hides it). Needs history.
- `vam`: 60 s climb rate (`vam` metric) with trend arrow, label on top
  (`showLabel: false` hides it). Needs history.
- `map`: GPS track, faint full route + accent ridden trail + current dot.
  Metric `none`. Needs history with lat/lon. Trail width from `strokeWidth`,
  else auto-sized from the box.
- `navmap`: navigation view, 50 m behind + 400 m ahead, course-up, position
  arrow. Metric `none`. Needs history with lat/lon + motion. Same
  `strokeWidth` as `map`.
- `compass`: GPS course dial, card rotated so course points up + degrees.
  Metric `none`. Needs history with motion.

History kinds (`spark`, `profile`, `profilenext`, `vam`, `map`, `navmap`, `compass`) receive
the full series at render time; without data they show `—`.

### Gauge default ranges (raw SI)

speed `[0, 15]` m/s · heartRate `[40, 200]` bpm · power `[0, 400]` W ·
cadence `[0, 120]` rpm · elevation `[0, 1000]` m · distance `[0, 10000]` m ·
elapsedTime `[0, 3600]` s · grade `[-15, 15]` % · vam `[0, 2000]` m/h.

Gauges suit rate-like metrics (speed, heartRate, power, cadence). Anything is
allowed, but a distance gauge rarely makes sense.

## Layout rules

One layout per widget, resolved to pixels for the concrete frame by
`resolveLayout` (`shared/src/template.ts`). Every number is a % of the frame's
smaller side ("vmin %"), so identical values render at identical pixel sizes on
any aspect: a 30×30 box is square to the eye everywhere, and a widget pinned to
an edge stays pinned in vertical and horizontal alike.

- `ax`/`ay` pin the widget to the nearest edge (or `center`); `px`/`py` are the
  padding from that edge in vmin % (a signed offset when centered).
- `w`/`h` are sizes in vmin % — the `w:h` ratio is preserved on every aspect.
  `"stretch"` spans the frame on that axis minus the padding on both sides
  (full-bleed bars); use it for panel rows, not for geometric kinds.
- Resolved boxes must fit inside the frame at 1280×720, 720×720 and 720×1280.
- Resolved boxes of visible widgets must not overlap at any of those frames.
- Keep every box ≥ 24×16 px at 720p and at 512×288 (thumbnail size), or the
  renderer skips it.
- Gauges need squarish boxes (`w` ≈ `h`); numbers need wide boxes.
- Same size + narrower frame can still collide: dense stacks that fit vertical
  may not fit horizontal. Spread widgets across edges/corners instead of
  stacking full-width rows.

## AI authoring

Internal widget layout is fixed and proportional: label, graphics and value sit
at fixed fractions of the widget box (e.g. speedo label at 6%, dial center at
74%, readout at 98%). There are no JSON fields for internal offsets, and any
invented ones are stripped on import.

Map every spatial request to the widget-level `layout` (move/resize the box):

- "SPD higher up" → move the speedo widget up (`ay`/`py`), not the label.
- "text further from the gauge" → a taller box (`h`); a short box crowds
  label, graphics and value by design, and resizing is the intended fix.
- Never add fields like `labelOffset`/`paddingTop`: unknown keys are stripped.
- The + card (blank, import, AI, auto) needs a loaded video: the target aspect comes from its metadata. Auto designs from the current frame with no prompt (black/white only).
- Auto mode sends the current video frame and constrains colors to black/white by schema.

## Fonts

Widget fonts (`style.labelFont`/`style.valueFont`) come from a fixed list —
copy the stacks verbatim (`"Baloo 2"` needs its quotes). Absent → Inter.
Weight is fixed (labels 600, values 700): "bolder"/"lighter" requests map to
a different family, never to a weight.

- `Inter, sans-serif` (default): neutral grotesque, the safe choice.
- `Barlow Condensed, sans-serif`: narrow, technical condensed.
- `Oswald, sans-serif`: tall condensed, sporty headers.
- `Rajdhani, sans-serif`: squared, techy, semi-condensed.
- `Orbitron, sans-serif`: futuristic, squared sci-fi digits.
- `"Baloo 2", sans-serif`: rounded, chubby, friendly.
- `Bungee Outline, sans-serif`: hollow outline display, maximum contrast.
- `Bungee, sans-serif`: solid chunky display; pairs with the Outline.
- `ui-monospace, monospace`: system mono, tabular digits.

Request mapping: bolder → Bungee; curvier/friendlier → Baloo 2; hollow →
Bungee Outline; futuristic → Orbitron; condensed → Oswald/Barlow Condensed;
neutral → Inter.

## Values and units

Metrics arrive in raw SI units (m/s, m, s, …) and the renderer formats them for
the selected units (metric/imperial). `elapsedTime` is activity elapsed seconds at the
rendered moment and formats as `h:mm:ss`. If a metric is missing from the data,
the widget shows `—`.

## Custom, export, import

The strip starts with a white **+** card that opens the new-template dialog:
type a name to create a blank template (first position, selected, ready for
widgets), or pick a previously exported `.json` to restore it instantly. A
typed name wins over the file's embedded name; imports always get a fresh id
so they never collide with the built-ins.

Each card carries its own small export icon button (right of the name), which
downloads that template with its current widget setup (visibility, layout,
style, added/removed widgets) as `{name}.json`. Deleting a widget removes it
from the export; "Restablecer widgets" brings session edits back. Built-ins show the button only after
a session edit (move, hide, add, restyle…); custom templates always show it.
The importer
(`parseTemplateJson` in `shared/src/template.ts`) requires the shape above —
name string, widgets array, one anchor layout per widget — fills a neutral
theme when fields are missing, and rejects unknown widget kinds/metrics.
Widget optionals are fail-open: invalid values drop to defaults, unknown keys
are stripped, and ids default/dedupe. Pre-v3 exports (one box per aspect) are
rejected with a `legacy template` error and a dedicated message in the import
dialog; old cloud rows are skipped on read. Covered by `npm run check`.

## Built-ins

broadcast · minimal · climb · chrono · strip · story · apex · pulse ·
speedo · ring · slope · gears · spark · profile · vam ·
routemap · navmap · compass.

New metrics: `vam` (m/h, computed over 60 s), `gears` (shift teeth, never
interpolated), `none` (map/compass placeholders).
`apex` and `pulse` exercise gauges, numbers, pill/transparent panels, label
toggles and explicit ranges — use them as the reference for new kinds.
