/** Pure builders for robots.txt / sitemap.xml / static content pages. */
import { DONATE_URL, LEGAL_CONTACT, type Faq, type FooterNav, type GuideCopy, type HubCopy, type LegalCopy, type Locale } from './content.js';

/** Editor URL: every content CTA points here, never at the locale gateway. */
const APP_PATH = '/app/';

export const escXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const escHtml = (s: string): string => escXml(s).replace(/"/g, '&quot;');

const OG_LOCALE: Record<Locale, string> = { es: 'es_ES', en: 'en_US' };

const CONTENT_CSS = `:root{--paper:#f4f4f4;--surface:#fff;--ink:#101010;--graphite:#242424;--muted:#5b6472;--border:#e5e7eb;--accent:#0099ff;--accent-ink:#006fb9}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--graphite);font:400 17px/1.65 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:0 24px 64px}
.wrap.wide{max-width:1120px}
.wrap.wide .lede{max-width:68ch}
header.site{display:flex;align-items:center;gap:16px;padding:20px 0}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);text-decoration:none;font:600 18px Poppins,Inter,sans-serif}
.brand img{width:28px;height:28px}
nav.site{margin-left:auto;display:flex;align-items:center;gap:16px;font-size:15px}
nav.site a{color:var(--graphite);text-decoration:none}
nav.site a:hover{text-decoration:underline}
nav.site a.cta{color:#fff}
.cta{display:inline-block;background:var(--ink);color:#fff;text-decoration:none;border-radius:9999px;padding:12px 24px;font-size:15px}
.cta:hover{text-decoration:none;opacity:.88}
main h1{font:600 clamp(32px,5vw,44px)/1.15 Poppins,Inter,sans-serif;color:var(--ink);letter-spacing:.01em;margin:40px 0 16px}
.lede{font-size:19px;margin:0 0 28px}
section.block{margin-top:56px;border-top:1px solid var(--border);padding-top:8px}
section.block h2{font:600 24px/1.3 Poppins,Inter,sans-serif;color:var(--ink);margin:28px 0 12px}
section.block p,section.block li{margin:0 0 12px}
ol.steps,ul.flat{padding-left:24px}
details.faq{background:var(--surface);border-radius:12px;box-shadow:rgba(34,42,53,.05) 0 4px 8px 0;margin:12px 0;padding:16px 20px}
details.faq summary{cursor:pointer;font-weight:500;color:var(--ink)}
details.faq p{margin:12px 0 4px}
.guide-link{display:block;background:var(--surface);border-radius:12px;box-shadow:rgba(34,42,53,.05) 0 4px 8px 0;padding:16px 20px;margin:12px 0;text-decoration:none}
.guide-link strong{display:block;color:var(--ink);font-weight:600}
.guide-link span{color:var(--muted);font-size:15px}
footer.site{margin-top:64px;border-top:1px solid var(--border);padding-top:20px;color:var(--muted);font-size:14px;display:flex;gap:16px;flex-wrap:wrap}
footer.site a{color:var(--muted)}
.feature-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:8px}
.feature{background:var(--surface);border-radius:12px;box-shadow:rgba(34,42,53,.05) 0 4px 8px 0;padding:16px 20px}
.feature strong{display:block;color:var(--ink);margin-bottom:4px}
.feature p{margin:0;font-size:15px;color:var(--muted)}
.example{margin:24px 0}
.example img{display:block;width:100%;height:auto;border-radius:12px;box-shadow:rgba(34,42,53,.08) 0 8px 24px 0}
.example.tall img{width:min(300px,72%);margin:0 auto}
.example.tall figcaption{text-align:center}
.example figcaption{color:var(--muted);font-size:14px;margin-top:8px}
.donate{background:var(--surface);border-radius:12px;box-shadow:rgba(34,42,53,.05) 0 4px 8px 0;padding:8px 20px 20px;margin-top:8px}
a{color:var(--accent-ink)}
main p,main li{max-width:60ch;text-wrap:pretty}
a:focus-visible,summary:focus-visible{outline:2px solid var(--accent-ink);outline-offset:2px}
@media (max-width:560px){header.site{flex-wrap:wrap;row-gap:12px}nav.site{margin-left:0;flex-wrap:wrap;gap:12px}.cta{padding:10px 18px}}`;

export interface HeadOpts {
  locale: Locale;
  path: string;
  title: string;
  description: string;
  alternates: { locale: Locale; path: string }[];
  jsonLd: unknown;
  /** Site-relative Markdown mirror, e.g. `/es/index.md`. */
  mdPath: string;
}

export function contentHead(base: string, o: HeadOpts): string {
  const url = base + o.path;
  const hreflang = o.alternates
    .map((a) => `    <link rel="alternate" hreflang="${a.locale}" href="${base + a.path}" />`)
    .join('\n');
  return `    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src https://static.cloudflareinsights.com; img-src 'self'; font-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com; object-src 'none'; base-uri 'none'"
    />
    <meta name="description" content="${escHtml(o.description)}" />
    <title>${escHtml(o.title)}</title>
    <link rel="canonical" href="${url}" />
${hreflang}
    <link rel="alternate" hreflang="x-default" href="${base}/" />
    <link rel="alternate" type="text/markdown" href="${base + o.mdPath}" />
    <link rel="describedby" href="${base}/llms.txt" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="velohud" />
    <meta property="og:title" content="${escHtml(o.title)}" />
    <meta property="og:description" content="${escHtml(o.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${base}/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="${OG_LOCALE[o.locale]}" />
    <meta property="og:locale:alternate" content="${OG_LOCALE[o.locale === 'es' ? 'en' : 'es']}" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/fonts.css" />
    <style>${CONTENT_CSS}</style>
    <script type="application/ld+json">${JSON.stringify(o.jsonLd)}</script>`;
}

export function contentShell(lang: Locale, head: string, body: string): string {
  return `<!doctype html>
<html lang="${lang}">
  <head>
${head}
  </head>
  <body>
${body}
  </body>
</html>
`;
}

export function hubJsonLd(base: string, path: string, locale: Locale, faqs: readonly Faq[]): unknown {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'velohud',
      url: base + path,
      applicationCategory: 'Multimedia',
      operatingSystem: 'Web',
      inLanguage: [locale],
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ];
}

export interface GuideLink {
  path: string;
  h1: string;
  lede: string;
}

export function renderHub(
  locale: Locale,
  hub: HubCopy,
  otherPath: string,
  guides: readonly GuideLink[],
  legal: FooterNav,
): string {
  const items = (xs: readonly string[]): string => xs.map((x) => `          <li>${escHtml(x)}</li>`).join('\n');
  const faqs = hub.faqs
    .map(
      (f) =>
        `        <details class="faq">\n          <summary>${escHtml(f.q)}</summary>\n          <p>${escHtml(f.a)}</p>\n        </details>`,
    )
    .join('\n');
  const guideLinks = guides
    .map(
      (g) =>
        `        <a class="guide-link" href="${g.path}"><strong>${escHtml(g.h1)}</strong><span>${escHtml(g.lede)}</span></a>`,
    )
    .join('\n');
  const features = hub.features
    .map((f) => `            <div class="feature"><strong>${escHtml(f.title)}</strong><p>${escHtml(f.text)}</p></div>`)
    .join('\n');
  const examples = hub.examples
    .map(
      (e, i) =>
        `          <figure class="example${e.tall ? ' tall' : ''}"><img src="${e.img}" alt="${escHtml(e.alt)}" width="${e.width}" height="${e.height}"${i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'} /><figcaption>${escHtml(e.caption)}</figcaption></figure>`,
    )
    .join('\n');
  return `    <div class="wrap wide">
      <header class="site">
        <a class="brand" href="/${locale}/"><img src="/icon.svg" alt="" />velohud</a>
        <nav class="site">
          <a href="${otherPath}">${escHtml(hub.otherLocaleLabel)}</a>
          <a class="cta" href="${APP_PATH}">${escHtml(hub.ctaApp)}</a>
        </nav>
      </header>
      <main>
        <h1>${escHtml(hub.h1)}</h1>
        <p class="lede">${escHtml(hub.lede)}</p>
        <a class="cta" href="${APP_PATH}">${escHtml(hub.ctaApp)}</a>
        <section class="block">
          <h2>${escHtml(hub.examplesTitle)}</h2>
${examples}
        </section>
        <section class="block">
          <h2>${escHtml(hub.featuresTitle)}</h2>
          <div class="feature-grid">
${features}
          </div>
        </section>
        <section class="block">
          <h2>${escHtml(hub.howTitle)}</h2>
          <ol class="steps">
${items(hub.how)}
          </ol>
        </section>
        <section class="block">
          <h2>${escHtml(hub.fmtTitle)}</h2>
          <ul class="flat">
${items(hub.formats)}
          </ul>
        </section>
        <section class="block">
          <h2>${escHtml(hub.privTitle)}</h2>
${hub.priv.map((p) => `          <p>${escHtml(p)}</p>`).join('\n')}
        </section>
${
  guides.length > 0
    ? `        <section class="block" id="guides">\n          <h2>${escHtml(hub.guidesTitle)}</h2>\n${guideLinks}\n        </section>\n`
    : ''
}        <section class="block">
          <h2>${escHtml(hub.faqTitle)}</h2>
${faqs}
        </section>
        <section class="block">
          <h2>${escHtml(hub.donateTitle)}</h2>
          <div class="donate">
            <p>${escHtml(hub.donateText)}</p>
            <p><a class="cta" href="${DONATE_URL}" target="_blank" rel="noopener">${escHtml(hub.donateCta)}</a></p>
          </div>
        </section>
      </main>
      <footer class="site">
        <span>velohud — ${escHtml(hub.badge)}</span>
        <a href="${otherPath}">${escHtml(hub.otherLocaleLabel)}</a>
        <a href="${APP_PATH}">${escHtml(hub.ctaApp)}</a>
        <a href="${legal.privacyPath}">${escHtml(legal.privacyLabel)}</a>
        <a href="${legal.termsPath}">${escHtml(legal.termsLabel)}</a>
        <a href="${legal.donateUrl}" target="_blank" rel="noopener">${escHtml(legal.donateLabel)}</a>
      </footer>
    </div>`;
}

export function guideJsonLd(copy: GuideCopy): unknown {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: copy.h1,
    description: copy.lede,
    step: copy.steps.map((s) => ({ '@type': 'HowToStep', name: s.name, text: s.text })),
  };
}

export function renderGuide(
  copy: GuideCopy,
  hub: HubCopy,
  hubPathStr: string,
  otherPath: string,
  legal: FooterNav,
): string {
  const sections = copy.sections
    .map(
      (s) =>
        `        <section class="block">\n          <h2>${escHtml(s.h2)}</h2>\n${s.paragraphs.map((p) => `          <p>${escHtml(p)}</p>`).join('\n')}\n        </section>`,
    )
    .join('\n');
  const steps = copy.steps
    .map((s) => `            <li><strong>${escHtml(s.name)}.</strong> ${escHtml(s.text)}</li>`)
    .join('\n');
  return `    <div class="wrap">
      <header class="site">
        <a class="brand" href="${hubPathStr}"><img src="/icon.svg" alt="" />velohud</a>
        <nav class="site">
          <a href="${otherPath}">${escHtml(hub.otherLocaleLabel)}</a>
          <a class="cta" href="${APP_PATH}">${escHtml(copy.ctaApp)}</a>
        </nav>
      </header>
      <main>
        <p><a href="${hubPathStr}">${escHtml(copy.backLabel)}</a></p>
        <h1>${escHtml(copy.h1)}</h1>
        <p class="lede">${escHtml(copy.lede)}</p>
${sections}
        <section class="block">
          <h2>${escHtml(copy.stepsTitle)}</h2>
          <ol class="steps">
${steps}
          </ol>
        </section>
        <section class="block">
          <h2>${escHtml(copy.tipsTitle)}</h2>
          <ul class="flat">
${copy.tips.map((t) => `            <li>${escHtml(t)}</li>`).join('\n')}
          </ul>
        </section>
        <p><a class="cta" href="${APP_PATH}">${escHtml(copy.ctaApp)}</a></p>
      </main>
      <footer class="site">
        <span>velohud — ${escHtml(hub.badge)}</span>
        <a href="${hubPathStr}">${escHtml(copy.backLabel)}</a>
        <a href="${otherPath}">${escHtml(hub.otherLocaleLabel)}</a>
        <a href="${APP_PATH}">${escHtml(copy.ctaApp)}</a>
        <a href="${legal.privacyPath}">${escHtml(legal.privacyLabel)}</a>
        <a href="${legal.termsPath}">${escHtml(legal.termsLabel)}</a>
        <a href="${legal.donateUrl}" target="_blank" rel="noopener">${escHtml(legal.donateLabel)}</a>
      </footer>
    </div>`;
}

export interface MdPage {
  mdUrl: string;
  htmlUrl: string;
  h1: string;
  lede: string;
}

export function hubMarkdown(base: string, page: MdPage, hub: HubCopy, guides: readonly GuideLink[]): string {
  const lines = [
    `# ${hub.h1}`,
    '',
    `> ${hub.lede}`,
    '',
    `Canonical: ${page.htmlUrl}`,
    '',
    `## ${hub.howTitle}`,
    '',
    ...hub.how.map((s, i) => `${i + 1}. ${s}`),
    '',
    `## ${hub.fmtTitle}`,
    '',
    ...hub.formats.map((s) => `- ${s}`),
    '',
    `## ${hub.privTitle}`,
    '',
    ...hub.priv,
    '',
  ];
  lines.push(`## ${hub.featuresTitle}`, '');
  for (const f of hub.features) lines.push(`### ${f.title}`, '', f.text, '');
  lines.push(`## ${hub.examplesTitle}`, '');
  for (const e of hub.examples) lines.push(`![${e.alt}](${base}${e.img})`, '', e.caption, '');
  lines.push(`## ${hub.donateTitle}`, '', hub.donateText, '', `[${hub.donateCta}](${DONATE_URL})`, '');
  if (guides.length > 0) {
    lines.push(`## ${hub.guidesTitle}`, '');
    for (const g of guides) lines.push(`- [${g.h1}](${base + g.path}index.md): ${g.lede}`);
    lines.push('');
  }
  lines.push(`## ${hub.faqTitle}`, '');
  for (const f of hub.faqs) lines.push(`### ${f.q}`, '', f.a, '');
  lines.push(`[Open the app](${base}/app/)`);
  return lines.join('\n') + '\n';
}

export function guideMarkdown(base: string, page: MdPage, copy: GuideCopy, hubPathStr: string): string {
  const lines = [`# ${copy.h1}`, '', `> ${copy.lede}`, '', `Canonical: ${page.htmlUrl}`, ''];
  for (const s of copy.sections) lines.push(`## ${s.h2}`, '', ...s.paragraphs, '');
  lines.push(`## ${copy.stepsTitle}`, '');
  copy.steps.forEach((s, i) => lines.push(`${i + 1}. **${s.name}.** ${s.text}`));
  lines.push('', `## ${copy.tipsTitle}`, '', ...copy.tips.map((t) => `- ${t}`), '');
  lines.push(`[← ${base}${hubPathStr}](${base}${hubPathStr}) · [Open the app](${base}/app/)`);
  return lines.join('\n') + '\n';
}

export function llmsTxt(
  base: string,
  hubs: readonly { locale: Locale; mdUrl: string; h1: string; lede: string }[],
  guides: readonly { locale: Locale; mdUrl: string; h1: string; lede: string }[],
): string {
  const lines = [
    '# velohud',
    '',
    '> Web editor that overlays sports telemetry from .FIT, .GPX or .TCX files (or Intervals.icu) onto MP4/MOV clips, with a 100% local, private in-browser render: nothing is uploaded. Content in English and Spanish; every page links its Markdown mirror.',
    '> Editor web que incrusta telemetría deportiva de archivos .FIT, .GPX o .TCX (o Intervals.icu) en clips MP4/MOV, con render 100% local y privado en el navegador: nada se sube.',
    '',
    '## Pages',
    '',
    ...hubs.map((h) => `- [${h.h1}](${h.mdUrl}): ${h.lede}`),
    '',
  ];
  for (const locale of ['es', 'en'] as Locale[]) {
    lines.push(`## Guides (${locale.toUpperCase()})`, '');
    for (const g of guides.filter((x) => x.locale === locale)) lines.push(`- [${g.h1}](${g.mdUrl}): ${g.lede}`);
    lines.push('');
  }
  lines.push('## App', '', `- [Open the app](${base}/app/): the editor itself (needs a WebCodecs-capable browser).`, '');
  return lines.join('\n');
}

export function legalJsonLd(copy: LegalCopy): unknown {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: copy.h1,
    description: copy.lede,
  };
}

export function renderLegal(
  copy: LegalCopy,
  hub: HubCopy,
  hubPathStr: string,
  otherPath: string,
  legal: FooterNav,
): string {
  const sections = copy.sections
    .map(
      (s) =>
        `        <section class="block">\n          <h2>${escHtml(s.h2)}</h2>\n${s.paragraphs.map((p) => `          <p>${escHtml(p)}</p>`).join('\n')}\n        </section>`,
    )
    .join('\n');
  return `    <div class="wrap">
      <header class="site">
        <a class="brand" href="${hubPathStr}"><img src="/icon.svg" alt="" />velohud</a>
        <nav class="site">
          <a href="${otherPath}">${escHtml(hub.otherLocaleLabel)}</a>
          <a class="cta" href="${APP_PATH}">${escHtml(copy.ctaApp)}</a>
        </nav>
      </header>
      <main>
        <p><a href="${hubPathStr}">${escHtml(copy.backLabel)}</a></p>
        <h1>${escHtml(copy.h1)}</h1>
        <p class="lede">${escHtml(copy.lede)}</p>
${sections}
        <section class="block">
          <h2>${escHtml(copy.contactTitle)}</h2>
          <p><a href="${LEGAL_CONTACT}">${escHtml(copy.contactLabel)}</a></p>
        </section>
      </main>
      <footer class="site">
        <span>velohud — ${escHtml(hub.badge)}</span>
        <a href="${hubPathStr}">${escHtml(copy.backLabel)}</a>
        <a href="${otherPath}">${escHtml(hub.otherLocaleLabel)}</a>
        <a href="${APP_PATH}">${escHtml(copy.ctaApp)}</a>
        <a href="${legal.privacyPath}">${escHtml(legal.privacyLabel)}</a>
        <a href="${legal.termsPath}">${escHtml(legal.termsLabel)}</a>
        <a href="${legal.donateUrl}" target="_blank" rel="noopener">${escHtml(legal.donateLabel)}</a>
      </footer>
    </div>`;
}

export function legalMarkdown(base: string, page: MdPage, copy: LegalCopy, hubPathStr: string): string {
  const lines = [`# ${copy.h1}`, '', `> ${copy.lede}`, '', `Canonical: ${page.htmlUrl}`, ''];
  for (const s of copy.sections) lines.push(`## ${s.h2}`, '', ...s.paragraphs, '');
  lines.push(`## ${copy.contactTitle}`, '', `[${copy.contactLabel}](${LEGAL_CONTACT})`, '');
  lines.push(`[← ${base}${hubPathStr}](${base}${hubPathStr}) · [Open the app](${base}/app/)`);
  return lines.join('\n') + '\n';
}


export function robotsTxt(base: string): string {
  return `User-agent: *
Allow: /

Sitemap: ${base}/sitemap.xml
`;
}

export function sitemapXml(base: string, paths: readonly string[], lastmod: string): string {
  const urls = paths
    .map((p) => `  <url>\n    <loc>${escXml(base + p)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
