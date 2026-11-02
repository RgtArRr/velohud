# velohud

Web editor that overlays sports telemetry onto video: load a ride/run activity (.FIT/.GPX/.TCX or Intervals.icu) plus MP4/MOV clips, sync them, style telemetry widgets on templates, and render — 100% locally in the browser (WebCodecs + Canvas). Built with Meta's Muse models for the Meta Global AI Developer Hackathon.

Live demo: <https://velohud.pages.dev/app/>

## Features

- **Sync engine**: auto offset from video recording date, ±0.1–5 s nudges, power/speed/cadence/elevation graph with time + km axes, click-to-position route minimap.
- **19 templates, 15 widget kinds**: gauges, speedo, slope inclinometer, gears (AXS/Di2), minigraph, elevation profile, VAM, maps, compass, animated route.
- **AI template studio (Muse Spark)**: generate from a prompt, one-click Auto from the video frame (black/white), surgical adjust of any template. The model only suggests widgets your activity data can feed.
- **Share route videos**: turn a photo into a clip with an animated route draw-on.
- **Private by design**: video and telemetry never leave the machine; account is optional (cloud templates only).

## Commands

```bash
npm install
npm run dev        # web (5173) + api (8787) juntos
npm run dev:web    # solo frontend
npm run dev:api    # solo worker (wrangler local + D1 local)
npm run typecheck
npm run check
npm run build
npm run deploy     # build web + deploy del Worker en Cloudflare
```

Abrir en el navegador: <http://localhost:5173> (Chrome, Edge o Safari actual).

AI endpoints (`/api/ai/template`, `/api/ai/auto`, `/api/ai/adjust`) need Meta Model API credentials: `AI_ENDPOINT` + `AI_KEY` in `api/.dev.vars` locally, or as Worker secrets in production (`wrangler secret put AI_KEY` / `AI_ENDPOINT`). Model defaults to `muse-spark-1.3-contributor` (`AI_MODEL` overrides).

## Estructura

- `web/` — app estática (Vite + TS). Render, editor y overlay en el navegador.
- `api/` — Cloudflare Worker. Auth + plantillas en la nube + Intervals.icu + generación IA + D1.
- `shared/` — schema versionado de templates + tipos comunes.
- `fixtures/` — MP4 de ejemplo, templates de ejemplo, `.fit` (+ script generador).
- `scripts/` — checks (`check.mjs`) y generación SEO (`seo-build.mjs`).
- `docs/` — setup de auth, sistema de diseño, schema de plantillas.

## Soporte

Chrome/Edge en computadora y Android, y Safari actual en iPhone/iPad (se requiere WebCodecs: la app detecta si falta y lo indica).

## Licencia

MIT — ver [LICENSE](LICENSE).
