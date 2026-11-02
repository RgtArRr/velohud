/** SEO/GEO manifest: single source of truth for sitemap, hubs, guides and llms.txt.
 *
 * Pure data: no DOM access, safe to import from node builds and checks.
 * Hub/guide copy lands here in later phases; the sitemap grows with it.
 */
import type { Locale } from '../src/i18n.js';

export type { Locale };

/** Canonical origin for sitemap, canonicals and llms.txt. Custom-domain switch: change this one const. */
export const SEO_BASE_URL = 'https://velohud.pages.dev';

/** A page the sitemap must list. */
export interface SitemapPage {
  /** Site-relative path with leading and trailing slash, e.g. `/es/`. */
  path: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface HubFeature {
  title: string;
  text: string;
}

export interface HubExample {
  img: string;
  alt: string;
  caption: string;
  /** Portrait shots render narrower so a 9:16 still fits the viewport. */
  tall?: boolean;
  /** Intrinsic pixels: reserves layout space (CLS) before the file loads. */
  width: number;
  height: number;
}

export interface HubCopy {
  title: string;
  description: string;
  h1: string;
  lede: string;
  featuresTitle: string;
  features: HubFeature[];
  examplesTitle: string;
  examples: HubExample[];
  howTitle: string;
  how: string[];
  fmtTitle: string;
  formats: string[];
  privTitle: string;
  priv: string[];
  guidesTitle: string;
  donateTitle: string;
  donateText: string;
  donateCta: string;
  faqTitle: string;
  faqs: Faq[];
  ctaApp: string;
  badge: string;
  otherLocaleLabel: string;
}

export const HUB: Record<Locale, HubCopy> = {
  es: {
    title: 'Telemetría deportiva en tus videos: potencia, FC, GPS | velohud',
    description:
      'Incrusta potencia, frecuencia cardíaca, velocidad y GPS de tu actividad (FIT, GPX o TCX) en tus clips MP4/MOV. Render 100% local en tu navegador: nada se sube y tu privacidad queda intacta. Gratis y sin instalar nada.',
    h1: 'Incrusta la telemetría de tu FIT en tus videos',
    lede: 'velohud sincroniza tu actividad con tus clips y dibuja potencia, FC, velocidad y mapa sobre el video. Todo se procesa en tu navegador: tus archivos nunca salen de tu equipo.',
    howTitle: 'Cómo funciona',
    how: [
      'Agrega tus clips MP4 o MOV y tu archivo .FIT, .GPX o .TCX (o elige una actividad de Intervals.icu).',
      'Sincroniza cada clip: el offset automático usa la fecha de grabación del video y afinas con ← / →.',
      'Elige una plantilla, coloca los widgets y renderiza. El video se guarda directo en tu disco.',
    ],
    fmtTitle: 'Formatos y compatibilidad',
    formats: [
      'Video: MP4 y MOV con H.264. El HEVC de iPhone no decodifica en Chrome: conviértelo a H.264 primero.',
      'Telemetría: archivos .FIT, .GPX o .TCX con registros y marca temporal (Garmin y compatibles) o actividades de Intervals.icu.',
      'Navegadores: Chrome y Edge en computadora y Android, y Safari actual en iPhone/iPad. Se requiere WebCodecs: la app detecta si falta y te lo indica.',
      'Plantillas: 18 incluidas en 14 tipos de widget; crea las tuyas y expórtalas como JSON.',
    ],
    privTitle: 'Privado por diseño',
    priv: [
      'El render es 100% local con WebCodecs: ni el video ni tu actividad se suben a ningún servidor.',
      'La cuenta es opcional: solo guarda tus plantillas en la nube y tu clave de Intervals.icu.',
    ],
    guidesTitle: 'Guías',
    faqTitle: 'Preguntas frecuentes',
    faqs: [
      {
        q: '¿Qué es velohud?',
        a: 'Un editor web que incrusta telemetría deportiva (potencia, frecuencia cardíaca, velocidad, GPS) de tu archivo .FIT, .GPX o .TCX en tus clips MP4/MOV, con plantillas y widgets configurables.',
      },
      {
        q: '¿Tengo que subir mis videos a algún servidor?',
        a: 'No. El render ocurre íntegramente en tu navegador con WebCodecs: ni el video ni tu actividad salen de tu equipo.',
      },
      {
        q: '¿Qué archivos acepta?',
        a: 'Videos MP4 y MOV codificados en H.264, y telemetría en formato .FIT, .GPX o .TCX con registros y marca temporal. También puedes traer actividades desde Intervals.icu con tu clave API.',
      },
      {
        q: '¿Cómo sincroniza el video con la actividad?',
        a: 'Lee la fecha de grabación del video, calcula el offset contra el inicio de la actividad y te deja afinar con las flechas (0.1 s, o 0.5 s con Mayús) o arrastrando sobre la vista de actividad.',
      },
      {
        q: '¿Funciona en mi navegador?',
        a: 'En Chrome y Edge, en computadora y Android, y en Safari actual en iPhone/iPad. Si tu navegador no tiene WebCodecs, la app detecta el caso y te lo indica.',
      },
      {
        q: '¿Necesito crearme una cuenta?',
        a: 'No. La app funciona sin cuenta. Si te registras, tus plantillas se guardan en la nube y puedes conectar Intervals.icu.',
      },
      {
        q: '¿Mis videos de iPhone sirven?',
        a: 'Si están en HEVC, Chrome no puede decodificarlos: conviértelos a H.264 antes de cargarlos. La app te avisa cuando un video no decodifica.',
      },
      {
        q: '¿Puedo crear mis propias plantillas?',
        a: 'Sí. Parte de una de las 18 incluidas, agrega, mueve y redimensiona widgets, y exporta tu plantilla como JSON para reutilizarla o compartirla.',
      },
      {
        q: '¿Qué es Intervals.icu aquí?',
        a: 'Una fuente opcional de telemetría: pegas tu clave API personal y eliges actividades sin pasar por archivos. La clave se guarda cifrada en tu cuenta.',
      },
      {
        q: '¿Por qué no hay conexión con Strava?',
        a: 'Este es un proyecto pequeño y los límites de Strava no encajan: las apps nuevas solo acceden a su propio autor, exigen revisión para crecer y las cuotas de API no dan para muchos usuarios. Con archivos .FIT, .GPX o .TCX, o Intervals.icu por clave personal, tienes la misma telemetría sin esos techos.',
      },
      {
        q: '¿Por qué no puedo entrar con mi cuenta de Garmin?',
        a: 'Garmin no ofrece un “entrar con Garmin” autogestionado: el acceso a datos pasa por su programa de desarrolladores, con solicitud y revisión pensadas para empresas. Como proyecto pequeño, la vía práctica es la misma: descarga el archivo (.FIT, .GPX o .TCX) desde Garmin Connect o sincroniza vía Intervals.icu.',
      },
      {
        q: '¿Dónde se guardan mis plantillas?',
        a: 'En tu navegador por defecto. Con cuenta, también en la nube, y las recuperas en cualquier equipo.',
      },
    ],
    featuresTitle: 'Por qué velohud',
    features: [
      {
        title: 'Salida directa en MP4',
        text: 'Sin videos intermedios ni editores externos: el overlay se quema en tu clip y se guarda directo en tu disco.',
      },
      {
        title: 'FIT, GPX y TCX nativos',
        text: 'Lee los tres formatos sin conversiones, o trae actividades desde Intervals.icu con tu clave API.',
      },
      {
        title: 'Plantillas estilo broadcast',
        text: '18 plantillas con 14 tipos de widget: números grandes, velocímetros, perfil de elevación, pendiente, mapas y brújula.',
      },
      {
        title: 'Sincronización automática',
        text: 'Lee la fecha de grabación de cada video y lo alinea con la actividad; afinas a 0,1 s con las flechas.',
      },
      {
        title: 'Varios clips, una actividad',
        text: 'Sincroniza varios videos contra la misma salida, cada uno con su offset y plantilla.',
      },
      {
        title: 'Gratis, sin marca de agua',
        text: 'Sin planes ni suscripciones: se sostiene con donaciones puntuales en Ko-fi.',
      },
    ],
    examplesTitle: 'Hecho con velohud',
    examples: [
      {
        img: '/examples/home-hz.jpg',
        alt: 'Video horizontal con overlay de potencia, FC y velocidad',
        caption: 'Plantilla Broadcast en video horizontal',
        width: 1280,
        height: 720,
      },
      {
        img: '/examples/home-vt.jpg',
        alt: 'Video vertical con overlay de telemetría deportiva',
        caption: 'Plantilla Broadcast en vertical',
        tall: true,
        width: 720,
        height: 1280,
      },
    ],
    donateTitle: 'Sostén el proyecto',
    donateText:
      'velohud es gratis y de código abierto. Si te sirve, una donación puntual en Ko-fi ayuda a pagar el dominio y seguir mejorándolo.',
    donateCta: 'Donar en Ko-fi',
    ctaApp: 'Abrir la app',
    badge: 'render 100% local',
    otherLocaleLabel: 'English',
  },
  en: {
    title: 'Sports telemetry on your videos: power, HR, GPS | velohud',
    description:
      'Overlay power, heart rate, speed and GPS from your activity (FIT, GPX or TCX) onto MP4/MOV clips. 100% local render in your browser: nothing is uploaded, your privacy stays intact. Free, no install.',
    h1: 'Overlay your FIT telemetry on your videos',
    lede: 'velohud syncs your activity with your clips and draws power, HR, speed and map over the video. Everything renders in your browser: your files never leave your machine.',
    howTitle: 'How it works',
    how: [
      'Add your MP4 or MOV clips and your .FIT, .GPX or .TCX file (or pick an activity from Intervals.icu).',
      'Sync each clip: auto offset uses the video recording date, then nudge with ← / →.',
      'Pick a template, place the widgets and render. The video saves straight to your disk.',
    ],
    fmtTitle: 'Formats and compatibility',
    formats: [
      'Video: MP4 and MOV in H.264. iPhone HEVC does not decode in Chrome: convert to H.264 first.',
      'Telemetry: .FIT, .GPX or .TCX files with timestamped records (Garmin and compatibles) or Intervals.icu activities.',
      'Browsers: Chrome and Edge on desktop and Android, and current Safari on iPhone/iPad. WebCodecs is required: the app detects when it is missing and tells you.',
      'Templates: 18 included across 14 widget kinds; build your own and export them as JSON.',
    ],
    privTitle: 'Private by design',
    priv: [
      'Rendering is 100% local with WebCodecs: neither the video nor your activity is ever uploaded anywhere.',
      'An account is optional: it only stores your templates in the cloud and your Intervals.icu key.',
    ],
    guidesTitle: 'Guides',
    faqTitle: 'Frequently asked questions',
    faqs: [
      {
        q: 'What is velohud?',
        a: 'A web editor that overlays sports telemetry (power, heart rate, speed, GPS) from your .FIT, .GPX or .TCX file onto MP4/MOV clips, with configurable templates and widgets.',
      },
      {
        q: 'Do I have to upload my videos to a server?',
        a: 'No. Rendering happens entirely in your browser with WebCodecs: neither the video nor your activity leaves your machine.',
      },
      {
        q: 'Which files does it accept?',
        a: 'MP4 and MOV video encoded in H.264, and telemetry in .FIT, .GPX or .TCX format with timestamped records. You can also pull activities from Intervals.icu with your API key.',
      },
      {
        q: 'How does it sync the video with the activity?',
        a: 'It reads the video recording date, computes the offset against the activity start, and lets you nudge with the arrow keys (0.1 s, or 0.5 s with Shift) or by dragging over the activity view.',
      },
      {
        q: 'Does it work in my browser?',
        a: 'In Chrome and Edge, on desktop and Android, and in current Safari on iPhone/iPad. If your browser lacks WebCodecs, the app detects that case and tells you.',
      },
      {
        q: 'Do I need an account?',
        a: 'No. The app works without one. If you register, your templates are stored in the cloud and you can connect Intervals.icu.',
      },
      {
        q: 'Do my iPhone videos work?',
        a: 'If they are HEVC, Chrome cannot decode them: convert to H.264 before loading. The app warns you when a video fails to decode.',
      },
      {
        q: 'Can I build my own templates?',
        a: 'Yes. Start from one of the 18 included, add, move and resize widgets, and export your template as JSON to reuse or share it.',
      },
      {
        q: 'What is Intervals.icu here?',
        a: 'An optional telemetry source: paste your personal API key and pick activities without files. The key is stored encrypted on your account.',
      },
      {
        q: 'Why is there no Strava connection?',
        a: 'This is a small project and Strava’s limits don’t fit: new apps can only access their own author, require review to grow, and the API quotas can’t sync many users. With .FIT, .GPX or .TCX files, or Intervals.icu via personal API key, you get the same telemetry without those ceilings.',
      },
      {
        q: 'Why can’t I sign in with my Garmin account?',
        a: 'Garmin offers no self-service “sign in with Garmin”: data access goes through their developer program, with an application and review aimed at companies. As a small project, the practical path is the same: download the file (.FIT, .GPX or .TCX) from Garmin Connect or sync via Intervals.icu.',
      },
      {
        q: 'Where are my templates stored?',
        a: 'In your browser by default. With an account, also in the cloud, and you get them back on any machine.',
      },
    ],
    featuresTitle: 'Why velohud',
    features: [
      {
        title: 'Direct MP4 output',
        text: 'No intermediate videos or external editors: the overlay is burned into your clip and saved straight to disk.',
      },
      {
        title: 'Native FIT, GPX and TCX',
        text: 'Reads all three formats with no conversion, or pulls activities from Intervals.icu with your API key.',
      },
      {
        title: 'Broadcast-style templates',
        text: '18 templates with 14 widget kinds: big numbers, gauges, elevation profile, grade, maps and compass.',
      },
      {
        title: 'Automatic sync',
        text: 'Reads each video recording date and aligns it with the activity; fine-tune to 0.1 s with the arrows.',
      },
      {
        title: 'Many clips, one activity',
        text: 'Sync several videos against a single ride, each with its own offset and template.',
      },
      {
        title: 'Free, no watermark',
        text: 'No plans or subscriptions: supported by one-time Ko-fi donations.',
      },
    ],
    examplesTitle: 'Made with velohud',
    examples: [
      {
        img: '/examples/home-hz.jpg',
        alt: 'Horizontal video with power, HR and speed overlay',
        caption: 'Broadcast template on horizontal video',
        width: 1280,
        height: 720,
      },
      {
        img: '/examples/home-vt.jpg',
        alt: 'Vertical video with sports telemetry overlay',
        caption: 'Broadcast template on vertical video',
        tall: true,
        width: 720,
        height: 1280,
      },
    ],
    donateTitle: 'Support the project',
    donateText:
      'velohud is free and open source. If it helps you, a one-time Ko-fi donation helps pay for the domain and keep improving it.',
    donateCta: 'Donate on Ko-fi',
    ctaApp: 'Open the app',
    badge: '100% local render',
    otherLocaleLabel: 'Español',
  },
};

export const hubPath = (locale: Locale): string => `/${locale}/`;

export interface GuideSection {
  h2: string;
  paragraphs: string[];
}

export interface GuideStep {
  name: string;
  text: string;
}

export interface GuideCopy {
  title: string;
  description: string;
  h1: string;
  lede: string;
  sections: GuideSection[];
  stepsTitle: string;
  steps: GuideStep[];
  tipsTitle: string;
  tips: string[];
  backLabel: string;
  ctaApp: string;
}

export interface GuideEntry {
  slug: Record<Locale, string>;
  dir: Record<Locale, string>;
  copy: Record<Locale, GuideCopy>;
}

export const GUIDES: GuideEntry[] = [
  {
    slug: { es: 'sincronizar-fit-con-video', en: 'sync-fit-with-video' },
    dir: { es: 'guias', en: 'guides' },
    copy: {
      es: {
        title: 'Cómo sincronizar tu FIT con tu video (GoPro, iPhone) | velohud',
        description:
          'Sincroniza tu archivo .FIT, .GPX o .TCX con tus clips MP4/MOV: offset automático por fecha de grabación, zona horaria por clip y ajuste fino. Guía paso a paso.',
        h1: 'Sincroniza tu FIT con tu video',
        lede: 'La sincronía es el corazón del overlay: cada frame debe mostrar el dato del segundo exacto. velohud propone un offset automático y te deja afinarlo a mano.',
        sections: [
          {
            h2: 'Cómo funciona el offset',
            paragraphs: [
              'Cada clip tiene un offset en segundos que desplaza la telemetría respecto al video. Si tu video empezó 90 segundos después del inicio de la actividad, el offset es +90 s.',
              'El botón Auto calcula ese offset restando el inicio de la actividad a la fecha de grabación del video. Por eso la fecha del archivo y la zona horaria importan: si la zona está mal, el offset nace desplazado horas enteras.',
            ],
          },
          {
            h2: 'Antes de empezar',
            paragraphs: [
              'Carga primero la actividad: sin actividad no hay nada contra qué sincronizar. Revisa que el clip tenga fecha de grabación (el panel Clip la muestra); sin fecha, tendrás que posicionar el clip a mano sobre la vista de actividad.',
              'Si tu video es HEVC de iPhone, conviértelo a H.264 antes: Chrome no puede decodificarlo.',
            ],
          },
        ],
        stepsTitle: 'Pasos',
        steps: [
          {
            name: 'Carga la actividad',
            text: 'Arrastra tu archivo (.FIT, .GPX o .TCX) a la zona de actividad o haz clic para elegirlo. Verás el resumen (duración, distancia, muestras) y la gráfica de la actividad.',
          },
          {
            name: 'Agrega el clip',
            text: 'Agrega tu MP4 o MOV. El panel Clip muestra su hora de grabación y la zona horaria con que se interpreta.',
          },
          {
            name: 'Fija la zona horaria',
            text: 'Elige la zona donde grabaste el video. La app la aplica por clip: viajar con la cámara en otra zona no rompe el resto del proyecto.',
          },
          {
            name: 'Pulsa Auto',
            text: 'El botón Auto calcula el offset desde la fecha del video y el inicio de la actividad. El estado te muestra el cálculo (video − actividad) para verificarlo.',
          },
          {
            name: 'Afina a mano',
            text: 'Con el clip seleccionado, usa ← / → para mover 0.1 s (0.5 s con Mayús) hasta que un esfuerzo visible —un sprint, una curva— coincida con el dato.',
          },
          {
            name: 'Verifica en la previsualización',
            text: 'Reproduce el clip con la plantilla aplicada: el número debe cambiar al ritmo del video. Repite por cada clip; cada uno guarda su propio offset.',
          },
        ],
        tipsTitle: 'Consejos',
        tips: [
          'Sin fecha de grabación, arrastra sobre la vista de actividad para posicionar el clip a ojo y luego afina con las flechas.',
          'Un sprint o un puerto reconocible es el mejor punto de referencia para afinar.',
          'La zona horaria no tiene efecto si el clip no trae fecha: la app te lo indica.',
        ],
        backLabel: '← Guías',
        ctaApp: 'Abrir la app',
      },
      en: {
        title: 'How to sync your FIT with your video (GoPro, iPhone) | velohud',
        description:
          'Sync your .FIT, .GPX or .TCX file with MP4/MOV clips: automatic offset from the recording date, per-clip time zone and fine nudging. Step-by-step guide.',
        h1: 'Sync your FIT with your video',
        lede: 'Sync is the heart of the overlay: every frame must show the data of the exact second. velohud proposes an automatic offset and lets you fine-tune it by hand.',
        sections: [
          {
            h2: 'How the offset works',
            paragraphs: [
              'Each clip has an offset in seconds that shifts telemetry relative to the video. If your video started 90 seconds into the activity, the offset is +90 s.',
              'The Auto button computes that offset by subtracting the activity start from the video recording date. That is why the file date and time zone matter: with the wrong zone, the offset is born hours off.',
            ],
          },
          {
            h2: 'Before you start',
            paragraphs: [
              'Load the activity first: without an activity there is nothing to sync against. Check the clip carries a recording date (the Clip panel shows it); without one, you must place the clip by hand over the activity view.',
              'If your video is iPhone HEVC, convert it to H.264 first: Chrome cannot decode it.',
            ],
          },
        ],
        stepsTitle: 'Steps',
        steps: [
          {
            name: 'Load the activity',
            text: 'Drag your file (.FIT, .GPX or .TCX) onto the activity area or click to pick it. You will see the summary (duration, distance, samples) and the activity chart.',
          },
          {
            name: 'Add the clip',
            text: 'Add your MP4 or MOV. The Clip panel shows its recording time and the time zone used to interpret it.',
          },
          {
            name: 'Set the time zone',
            text: 'Pick the zone where you recorded. The app applies it per clip: travelling with the camera in another zone does not break the rest.',
          },
          {
            name: 'Press Auto',
            text: 'The Auto button computes the offset from the video date and the activity start. The status line shows the math (video − activity) so you can verify it.',
          },
          {
            name: 'Nudge by hand',
            text: 'With the clip selected, use ← / → to move 0.1 s (0.5 s with Shift) until a visible effort —a sprint, a corner— matches the data.',
          },
          {
            name: 'Check the preview',
            text: 'Play the clip with the template on: numbers must move with the video. Repeat per clip; each keeps its own offset.',
          },
        ],
        tipsTitle: 'Tips',
        tips: [
          'Without a recording date, drag over the activity view to place the clip by eye, then nudge with the arrows.',
          'A recognizable sprint or climb is the best landmark for fine-tuning.',
          'The time zone has no effect when the clip has no date: the app tells you.',
        ],
        backLabel: '← Guides',
        ctaApp: 'Open the app',
      },
    },
  },
  {
    slug: { es: 'overlay-potencia-fc-velocidad-gps', en: 'power-hr-speed-gps-overlay' },
    dir: { es: 'guias', en: 'guides' },
    copy: {
      es: {
        title: 'Overlay de potencia, FC, velocidad y GPS en tu video | velohud',
        description:
          'Dibuja potencia, frecuencia cardíaca, velocidad y mapa GPS sobre tus clips: 18 plantillas, 14 tipos de widget y personalización total. Guía paso a paso.',
        h1: 'Pon potencia, FC, velocidad y GPS sobre tu video',
        lede: 'Los widgets leen tu actividad segundo a segundo y se dibujan sobre cada frame al renderizar. Elige una plantilla lista o construye la tuya.',
        sections: [
          {
            h2: 'Plantillas y widgets',
            paragraphs: [
              'Hay 18 plantillas incluidas y 14 tipos de widget: dato, número grande, arco, velocímetro, anillo, inclinómetro, desarrollos, minigráfico de 30 s, perfil, perfil próximos 5 min, VAM, mapa de ruta, navegación y brújula.',
              'Cada widget muestra una métrica (velocidad, FC, potencia, cadencia, altitud, distancia, tiempo, pendiente, VAM, desarrollos) y se puede mover, redimensionar, dar forma de rectángulo o píldora, y teñir con acento y fondo.',
            ],
          },
          {
            h2: 'Mapa y GPS',
            paragraphs: [
              'Los widgets de mapa dibujan tu ruta con el trazado recorrido hasta el segundo actual; el grosor de línea es ajustable. Necesitan que la actividad traiga posiciones GPS.',
              'Si tu actividad es de rodillo sin GPS, el mapa sale vacío: usa widgets de dato en su lugar.',
            ],
          },
        ],
        stepsTitle: 'Pasos',
        steps: [
          {
            name: 'Elige una plantilla',
            text: 'En el panel Plantilla, recorre la tira y elige la que encaje con tu video. La previsualización la aplica al instante.',
          },
          {
            name: 'Agrega widgets',
            text: 'Con “Agregar widget”, elige tipo y métrica. Aparece sobre la previsualización listo para colocar.',
          },
          {
            name: 'Coloca y dimensiona',
            text: 'Arrastra el widget para moverlo y tira de su esquina azul para redimensionarlo. Doble clic restablece posición y tamaño.',
          },
          {
            name: 'Ajusta el estilo',
            text: 'En el panel Widget cambia fondo, opacidad, forma, acento, texto y tipografías de etiqueta y número.',
          },
          {
            name: 'Elimina lo que sobre',
            text: 'Clic derecho sobre un widget (mantén presionado en táctil) para quitarlo. “Restablecer widgets” recupera la plantilla original.',
          },
          {
            name: 'Guarda tu plantilla',
            text: 'Exporta tu plantilla como JSON para reutilizarla, o créala desde cero con “Nueva plantilla”. Con cuenta, se guarda en la nube.',
          },
        ],
        tipsTitle: 'Consejos',
        tips: [
          'Menos es más: 2–4 widgets bien colocados se leen mejor que ocho amontonados.',
          'El minigráfico de 30 s cuenta la historia del esfuerzo mejor que un número solo.',
          'Prueba la plantilla en un clip vertical y uno horizontal: cada aspecto guarda su propio layout.',
        ],
        backLabel: '← Guías',
        ctaApp: 'Abrir la app',
      },
      en: {
        title: 'Power, HR, speed and GPS overlay on your video | velohud',
        description:
          'Draw power, heart rate, speed and GPS map over your clips: 18 templates, 14 widget kinds, full styling. Step-by-step guide.',
        h1: 'Put power, HR, speed and GPS on your video',
        lede: 'Widgets read your activity second by second and draw over every frame at render. Pick a ready template or build your own.',
        sections: [
          {
            h2: 'Templates and widgets',
            paragraphs: [
              'There are 18 included templates and 14 widget kinds: value, big number, arc, speedometer, ring, inclinometer, gears, 30 s sparkline, profile, profile next 5 min, VAM, route map, navigation and compass.',
              'Each widget shows one metric (speed, HR, power, cadence, elevation, distance, time, grade, VAM, gears) and can be moved, resized, shaped as rectangle or pill, and tinted with accent and background.',
            ],
          },
          {
            h2: 'Map and GPS',
            paragraphs: [
              'Map widgets draw your route with the track covered up to the current second; line width is adjustable. They need GPS positions in the activity.',
              'If your activity is an indoor ride without GPS, the map renders empty: use value widgets instead.',
            ],
          },
        ],
        stepsTitle: 'Steps',
        steps: [
          {
            name: 'Pick a template',
            text: 'In the Template panel, browse the strip and pick one that fits your video. The preview applies it instantly.',
          },
          {
            name: 'Add widgets',
            text: 'With “Add widget”, choose kind and metric. It lands on the preview ready to place.',
          },
          {
            name: 'Place and size',
            text: 'Drag the widget to move it and pull its blue corner to resize. Double-click resets position and size.',
          },
          {
            name: 'Style it',
            text: 'In the Widget panel change background, opacity, shape, accent, text and label/number fonts.',
          },
          {
            name: 'Remove the excess',
            text: 'Right-click a widget (touch and hold on touch) to delete it. “Reset widgets” restores the original template.',
          },
          {
            name: 'Save your template',
            text: 'Export your template as JSON to reuse it, or start from scratch with “New template”. With an account, it is stored in the cloud.',
          },
        ],
        tipsTitle: 'Tips',
        tips: [
          'Less is more: 2–4 well-placed widgets read better than eight crowded ones.',
          'The 30 s sparkline tells the effort story better than a lone number.',
          'Try the template on a vertical and a horizontal clip: each aspect keeps its own layout.',
        ],
        backLabel: '← Guides',
        ctaApp: 'Open the app',
      },
    },
  },
  {
    slug: { es: 'exportar-video-telemetria', en: 'export-video-with-telemetry' },
    dir: { es: 'guias', en: 'guides' },
    copy: {
      es: {
        title: 'Cómo exportar tu video con telemetría (MP4) | velohud',
        description:
          'Renderiza tus clips con el overlay de telemetría y guarda el MP4 directo en tu disco. Recorte, audio, render en memoria y consejos de calidad.',
        h1: 'Renderiza y exporta tu video con telemetría',
        lede: 'El render dibuja los widgets sobre cada frame y produce un MP4 listo para compartir. Todo ocurre en tu navegador.',
        sections: [
          {
            h2: 'Recorte y audio',
            paragraphs: [
              'Cada clip tiene inicio y fin: recorta antes de renderizar para no procesar de más. El fin debe ser mayor que el inicio o el render se niega con un aviso.',
              '“Incluir audio” conserva el sonido original del clip en el MP4 exportado.',
            ],
          },
          {
            h2: 'Dónde se guarda',
            paragraphs: [
              'Si tu navegador lo permite, el video se escribe directo a disco mientras se renderiza (eliges la carpeta una vez). Si no, se mantiene en memoria: funciona, pero con videos largos o en alta resolución puede fallar por falta de memoria.',
              'Renderiza por clips (“Renderizar clip”) o todo el proyecto (“Renderizar todo”) según prefieras.',
            ],
          },
        ],
        stepsTitle: 'Pasos',
        steps: [
          {
            name: 'Recorta el clip',
            text: 'Fija inicio y fin en el panel Clip. Usa los botones de cursor para llevar los bordes al punto exacto del video.',
          },
          {
            name: 'Decide el audio',
            text: 'Activa “Incluir audio” si quieres conservar el sonido ambiente o tus comentarios.',
          },
          {
            name: 'Comprueba la plantilla',
            text: 'Reproduce unos segundos: widgets visibles, números cambiando al ritmo del esfuerzo.',
          },
          {
            name: 'Renderiza',
            text: 'Pulsa “Renderizar clip” (o “Renderizar todo”). La barra muestra el progreso frame a frame.',
          },
          {
            name: 'Guarda el MP4',
            text: 'Con guardado a disco, el archivo aparece en tu carpeta al terminar. En memoria, la app te ofrece la descarga.',
          },
        ],
        tipsTitle: 'Consejos',
        tips: [
          'Para YouTube o redes, renderiza el definitivo al final: cada render reprocesa todos los frames.',
          'Si un render en memoria falla, prueba con un recorte más corto o menor resolución.',
          'Verifica un render completo antes de lanzar “Renderizar todo” con muchos clips.',
        ],
        backLabel: '← Guías',
        ctaApp: 'Abrir la app',
      },
      en: {
        title: 'How to export your video with telemetry (MP4) | velohud',
        description:
          'Render clips with the telemetry overlay and save the MP4 straight to disk. Trimming, audio, in-memory render and quality tips.',
        h1: 'Render and export your video with telemetry',
        lede: 'Rendering draws the widgets over every frame and produces an MP4 ready to share. It all happens in your browser.',
        sections: [
          {
            h2: 'Trim and audio',
            paragraphs: [
              'Each clip has a start and end: trim before rendering so you process no more than needed. The end must be after the start or the render refuses with a notice.',
              '“Include audio” keeps the original clip sound in the exported MP4.',
            ],
          },
          {
            h2: 'Where it saves',
            paragraphs: [
              'When the browser allows it, the video writes straight to disk while rendering (pick the folder once). Otherwise it stays in memory: it works, but long or high-resolution videos may run out of memory.',
              'Render per clip (“Render clip”) or the whole project (“Render all”) as you prefer.',
            ],
          },
        ],
        stepsTitle: 'Steps',
        steps: [
          {
            name: 'Trim the clip',
            text: 'Set start and end in the Clip panel. Use the cursor buttons to snap edges to the exact video point.',
          },
          {
            name: 'Decide on audio',
            text: 'Enable “Include audio” to keep ambience or your commentary.',
          },
          {
            name: 'Check the template',
            text: 'Play a few seconds: widgets visible, numbers moving with the effort.',
          },
          {
            name: 'Render',
            text: 'Press “Render clip” (or “Render all”). The bar shows frame-by-frame progress.',
          },
          {
            name: 'Save the MP4',
            text: 'With disk saving, the file lands in your folder when done. In memory, the app offers the download.',
          },
        ],
        tipsTitle: 'Tips',
        tips: [
          'For YouTube or social, render the final cut last: every render reprocesses all frames.',
          'If an in-memory render fails, try a shorter trim or lower resolution.',
          'Verify one full render before launching “Render all” on many clips.',
        ],
        backLabel: '← Guides',
        ctaApp: 'Open the app',
      },
    },
  },
  {
    slug: { es: 'intervals-icu-como-fuente', en: 'intervals-icu-as-source' },
    dir: { es: 'guias', en: 'guides' },
    copy: {
      es: {
        title: 'Usar Intervals.icu como fuente de telemetría | velohud',
        description:
          'Conecta Intervals.icu con tu clave API y elige actividades sin archivos: lista, ventanas de 30 días y streams por segundo.',
        h1: 'Trae tu telemetría desde Intervals.icu',
        lede: 'Si tus actividades viven en Intervals.icu, no necesitas descargar archivos: conecta tu clave API personal y elige la actividad dentro de la app.',
        sections: [
          {
            h2: 'Cómo se conecta',
            paragraphs: [
              'Necesitas cuenta en velohud y tu clave API personal, que está al final de tu página de ajustes en Intervals.icu. La app la valida contra tu atleta antes de guardarla.',
              'La clave se guarda cifrada ligada a tu cuenta y solo se usa para pedir tus actividades y sus streams. Puedes olvidarla cuando quieras con “Desconectar”.',
            ],
          },
          {
            h2: 'Qué trae cada actividad',
            paragraphs: [
              'La lista muestra tus actividades en ventanas de 30 días (hasta 12 páginas atrás). Al elegir una, la app descarga sus streams por segundo: potencia, FC, velocidad, GPS y demás.',
              'La hora de inicio se interpreta con la zona horaria de la actividad, igual que un archivo local: la sincronía con el video funciona igual.',
            ],
          },
        ],
        stepsTitle: 'Pasos',
        steps: [
          {
            name: 'Inicia sesión',
            text: 'Entra a tu cuenta (o créala): la conexión con Intervals.icu vive ligada a tu usuario.',
          },
          {
            name: 'Abre “Elegir de Intervals”',
            text: 'Junto a la zona de actividad verás el botón para elegir desde Intervals.icu.',
          },
          {
            name: 'Pega tu clave API',
            text: 'Copia tu clave personal desde el final de tus ajustes en Intervals.icu y pégala. La app la valida al momento.',
          },
          {
            name: 'Elige la actividad',
            text: 'Navega las ventanas de 30 días con Anterior/Siguiente y elige tu salida.',
          },
          {
            name: 'Sincroniza y renderiza',
            text: 'Desde aquí todo es igual que con un archivo: sincroniza el clip, elige plantilla y renderiza.',
          },
        ],
        tipsTitle: 'Consejos',
        tips: [
          'Si cambias tu clave en Intervals.icu, la guardada deja de funcionar: la app te pedirá pegarla de nuevo.',
          'Sin GPS (rodillo), los widgets de mapa salen vacíos: usa datos numéricos.',
          '“Desconectar” olvida tu clave del servidor pero conserva tus plantillas.',
        ],
        backLabel: '← Guías',
        ctaApp: 'Abrir la app',
      },
      en: {
        title: 'Using Intervals.icu as a telemetry source | velohud',
        description:
          'Connect Intervals.icu with your API key and pick activities without files: listing, 30-day windows and per-second streams.',
        h1: 'Pull your telemetry from Intervals.icu',
        lede: 'If your activities live in Intervals.icu, skip downloading files: connect your personal API key and pick the activity inside the app.',
        sections: [
          {
            h2: 'How it connects',
            paragraphs: [
              'You need an velohud account and your personal API key, at the bottom of your Intervals.icu settings page. The app validates it against your athlete before storing it.',
              'The key is stored encrypted on your account and only fetches your activities and their streams. You can forget it anytime with “Disconnect”.',
            ],
          },
          {
            h2: 'What each activity brings',
            paragraphs: [
              'The list shows your activities in 30-day windows (up to 12 pages back). Picking one downloads its per-second streams: power, HR, speed, GPS and more.',
              'Start time is interpreted with the activity time zone, just like a local file: syncing with video works the same.',
            ],
          },
        ],
        stepsTitle: 'Steps',
        steps: [
          {
            name: 'Sign in',
            text: 'Sign in to your account (or create it): the Intervals.icu connection lives on your user.',
          },
          {
            name: 'Open “Pick from Intervals”',
            text: 'Next to the activity area you will find the button to pick from Intervals.icu.',
          },
          {
            name: 'Paste your API key',
            text: 'Copy your personal key from the bottom of your Intervals.icu settings and paste it. The app validates it on the spot.',
          },
          {
            name: 'Pick the activity',
            text: 'Browse the 30-day windows with Previous/Next and pick your workout.',
          },
          {
            name: 'Sync and render',
            text: 'From here everything matches the file flow: sync the clip, pick a template, render.',
          },
        ],
        tipsTitle: 'Tips',
        tips: [
          'If you rotate your Intervals.icu key, the stored one stops working: the app will ask you to paste it again.',
          'Without GPS (indoor), map widgets render empty: use numeric data.',
          '“Disconnect” forgets your key on the server but keeps your templates.',
        ],
        backLabel: '← Guides',
        ctaApp: 'Open the app',
      },
    },
  },
  {
    slug: { es: 'alternativas-dashware-virb-edit', en: 'dashware-virb-edit-alternatives' },
    dir: { es: 'guias', en: 'guides' },
    copy: {
      es: {
        title: 'Alternativas a Dashware y VIRB Edit (gratis y de pago) | velohud',
        description:
          'Dashware y VIRB Edit están descontinuados. Compara las alternativas activas: Telemetry Overlay, OVRLEY, RaceRender y velohud, gratis y en tu navegador.',
        h1: 'Alternativas a Dashware y VIRB Edit',
        lede: 'Los dos gigantes gratuitos del overlay de telemetría dejaron de desarrollarse. Esto es lo que queda en pie —de pago, gratis y open source— y para quién es cada opción.',
        sections: [
          {
            h2: 'Qué pasó con Dashware y VIRB Edit',
            paragraphs: [
              'Dashware dejó de desarrollarse hace años (GoPro lo congeló) y cada vez falla más en sistemas modernos. VIRB Edit, el editor gratuito de Garmin, también está descontinuado y siempre estuvo atado a su ecosistema.',
              'Si vienes de alguno de los dos, tus archivos .FIT siguen valiendo: el formato no cambió y todas las alternativas de abajo los leen. Lo que cambia es la app.',
            ],
          },
          {
            h2: 'Qué queda en pie',
            paragraphs: [
              'Telemetry Overlay (unos $30, solo Windows) es la referencia comercial: la personalización más profunda, mantenida por un solo desarrollador. OVRLEY es gratis y open source, pero de escritorio (Windows, macOS, Linux), con más de 40 widgets. RaceRender (unos $59) está estancado y enfocado en motor. GPXrender y gpx2video cubren nichos (macOS/Linux).',
              'Todas exigen descargar e instalar. Ninguna funciona en el navegador.',
            ],
          },
          {
            h2: 'Dónde encaja velohud',
            paragraphs: [
              'Es la única opción que corre en el navegador: sin instalar, en cualquier sistema con Chrome o Edge. Gratis y open source (MIT), con FIT nativo, Intervals.icu, 18 plantillas y 14 tipos de widget.',
              'Sus límites, con honestidad: aún no lee GPX/TCX ni telemetría embebida en el MP4 (GPMF de GoPro, SRT de DJI), y exporta el MP4 final, no un overlay transparente para tu NLE. Si necesitas eso, Telemetry Overlay u OVRLEY te sirven mejor.',
            ],
          },
        ],
        stepsTitle: 'Cómo migrar en 5 pasos',
        steps: [
          {
            name: 'Rescata tus .FIT',
            text: 'Tus actividades valen igual: reúne los .FIT que usabas en Dashware o VIRB Edit. No hay que convertir nada.',
          },
          {
            name: 'Abre la app, sin instalar',
            text: 'Abre la app en Chrome o Edge, en computadora o Android. Sin instalador y sin cuenta obligatoria.',
          },
          {
            name: 'Carga y sincroniza un clip de prueba',
            text: 'Sube un FIT y un MP4/MOV en H.264, usa el offset automático y afina con ← / → hasta que dato y video coincidan.',
          },
          {
            name: 'Elige tu plantilla',
            text: 'Recorre las 18 incluidas hasta encontrar un estilo parecido al que usabas; luego muévela a tu gusto y expórtala como JSON.',
          },
          {
            name: 'Renderiza y compara',
            text: 'Renderiza ese primer clip y míralo junto a uno viejo: mismos datos, nuevo motor. A partir de ahí, todo tu flujo vive en el navegador.',
          },
        ],
        tipsTitle: 'Consejos',
        tips: [
          'Si tu flujo dependía de GPX o TCX, esta app aún no los lee: OVRLEY o Cyclemetry son mejor destino.',
          'Si componías el overlay transparente en DaVinci o Premiere, aquí el render es el MP4 final: ajusta la plantilla antes, no después.',
          'Los videos HEVC de iPhone hay que convertirlos a H.264 primero, igual que antes.',
        ],
        backLabel: '← Guías',
        ctaApp: 'Abrir la app',
      },
      en: {
        title: 'Dashware & VIRB Edit alternatives (free and paid) | velohud',
        description:
          'Dashware and VIRB Edit are discontinued. Compare the active alternatives: Telemetry Overlay, OVRLEY, RaceRender and velohud, free in your browser.',
        h1: 'Dashware & VIRB Edit alternatives',
        lede: 'The two free giants of telemetry overlay stopped development. Here is what is left standing —paid, free and open source— and who each option fits.',
        sections: [
          {
            h2: 'What happened to Dashware and VIRB Edit',
            paragraphs: [
              'Dashware stopped development years ago (GoPro froze it) and breaks more with every modern system. VIRB Edit, Garmin’s free editor, is discontinued too and was always tied to its ecosystem.',
              'If you come from either, your .FIT files still count: the format did not change and every alternative below reads them. What changes is the app.',
            ],
          },
          {
            h2: 'What is left standing',
            paragraphs: [
              'Telemetry Overlay (about $30, Windows-only) is the commercial reference: the deepest customization, maintained by a single developer. OVRLEY is free and open source, but desktop (Windows, macOS, Linux) with 40+ widgets. RaceRender (about $59) is stalled and motorsport-focused. GPXrender and gpx2video cover niches (macOS/Linux).',
              'All of them require download and install. None runs in the browser.',
            ],
          },
          {
            h2: 'Where velohud fits',
            paragraphs: [
              'It is the only option running in the browser: no install, on any system with Chrome or Edge. Free and open source (MIT), with native FIT, Intervals.icu, 18 templates and 14 widget kinds.',
              'Its limits, honestly: it does not read GPX/TCX yet, nor telemetry embedded in the MP4 (GoPro GPMF, DJI SRT), and it exports the final MP4, not a transparent overlay for your NLE. If you need that, Telemetry Overlay or OVRLEY serve you better.',
            ],
          },
        ],
        stepsTitle: 'How to migrate in 5 steps',
        steps: [
          {
            name: 'Rescue your .FITs',
            text: 'Your activities count the same: gather the .FIT files you used in Dashware or VIRB Edit. Nothing to convert.',
          },
          {
            name: 'Open the app, no install',
            text: 'Open the app in Chrome or Edge, on desktop or Android. No installer, no mandatory account.',
          },
          {
            name: 'Load and sync a test clip',
            text: 'Upload a FIT and an H.264 MP4/MOV, use auto offset and nudge with ← / → until data and video match.',
          },
          {
            name: 'Pick your template',
            text: 'Browse the 18 included until you find a style close to your old one; then tweak it and export it as JSON.',
          },
          {
            name: 'Render and compare',
            text: 'Render that first clip and watch it next to an old one: same data, new engine. From there, your whole flow lives in the browser.',
          },
        ],
        tipsTitle: 'Tips',
        tips: [
          'If your flow relied on GPX or TCX, this app does not read them yet: OVRLEY or Cyclemetry are a better destination.',
          'If you composited the transparent overlay in DaVinci or Premiere, here the render is the final MP4: tune the template before, not after.',
          'iPhone HEVC videos must be converted to H.264 first, same as before.',
        ],
        backLabel: '← Guides',
        ctaApp: 'Open the app',
      },
    },
  },
];

export const guidePath = (locale: Locale, g: GuideEntry): string =>
  `/${locale}/${g.dir[locale]}/${g.slug[locale]}/`;

export interface LegalSection {
  h2: string;
  paragraphs: string[];
}

export interface LegalCopy {
  title: string;
  description: string;
  h1: string;
  lede: string;
  sections: LegalSection[];
  backLabel: string;
  ctaApp: string;
  contactTitle: string;
  contactLabel: string;
}

export interface LegalEntry {
  slug: Record<Locale, string>;
  copy: Record<Locale, LegalCopy>;
}

/** Contact channel for data requests and questions (public repo issues). */
export const LEGAL_CONTACT = 'https://github.com/RgtArRr/velohud/issues';

/** One-time donations (Ko-fi, no account needed to donate). */
export const DONATE_URL = 'https://ko-fi.com/rgtarrr';

export const LEGAL: LegalEntry[] = [
  {
    slug: { es: 'privacidad', en: 'privacy' },
    copy: {
      es: {
        title: 'Política de privacidad | velohud',
        description:
          'Qué datos guarda velohud (cuenta, plantillas, clave de Intervals.icu) y qué nunca sale de tu navegador. Sin cookies de rastreo.',
        h1: 'Política de privacidad',
        lede: 'Vigente desde el 28 de octubre de 2026. En resumen: tus videos y tus archivos de actividad (.FIT, .GPX o .TCX) nunca salen de tu navegador; solo guardamos datos si creas una cuenta, y puedes pedir su borrado.',
        sections: [
          {
            h2: 'Responsable',
            paragraphs: [
              'velohud es un proyecto personal. Para cualquier solicitud sobre tus datos (acceso, rectificación, borrado), abre un issue en el repositorio del proyecto.',
            ],
          },
          {
            h2: 'Datos que guardamos',
            paragraphs: [
              'Si navegas sin cuenta, no guardamos nada sobre ti.',
              'Si creas una cuenta, guardamos tu correo, un hash de tu contraseña (nunca en claro), tus sesiones (caducan a los 30 días) y las plantillas que sincronices en la nube.',
              'Si conectas Intervals.icu, guardamos tu clave API cifrada y la usamos solo para pedir tus actividades y sus datos.',
            ],
          },
          {
            h2: 'Lo que nunca sale de tu equipo',
            paragraphs: [
              'Tus videos y tus archivos de actividad (.FIT, .GPX o .TCX) se procesan íntegramente en tu navegador con WebCodecs. El render es 100% local: esos archivos jamás se suben a nuestros servidores.',
            ],
          },
          {
            h2: 'Terceros',
            paragraphs: [
              'Alojamiento y analítica sin cookies: Cloudflare. Fuentes tipográficas: autohospedadas, sin peticiones a terceros. Telemetría opcional: Intervals.icu, solo si conectas tu clave. No vendemos ni compartimos datos con nadie más.',
            ],
          },
          {
            h2: 'Cookies',
            paragraphs: [
              'Solo la cookie de sesión, imprescindible para mantenerte dentro de tu cuenta. No hay cookies de rastreo ni banner de consentimiento porque no hace falta.',
            ],
          },
          {
            h2: 'Tus derechos',
            paragraphs: [
              'Puedes desconectar Intervals.icu en cualquier momento desde la app. Para acceder, rectificar o borrar tus datos de cuenta, abre un issue y lo gestionamos. Conservamos los datos de cuenta mientras exista la cuenta; las sesiones caducan a los 30 días.',
            ],
          },
          {
            h2: 'Cambios',
            paragraphs: [
              'Si esta política cambia de forma relevante, actualizaremos la fecha de vigencia en esta página.',
            ],
          },
        ],
        backLabel: '← Inicio',
        ctaApp: 'Abrir la app',
        contactTitle: 'Contacto',
        contactLabel: 'Abrir un issue en GitHub',
      },
      en: {
        title: 'Privacy policy | velohud',
        description:
          'What data velohud stores (account, templates, Intervals.icu key) and what never leaves your browser. No tracking cookies.',
        h1: 'Privacy policy',
        lede: 'Effective October 28, 2026. In short: your videos and activity files (.FIT, .GPX or .TCX) never leave your browser; we only store data if you create an account, and you can request its deletion.',
        sections: [
          {
            h2: 'Controller',
            paragraphs: [
              'velohud is a personal project. For any request about your data (access, rectification, erasure), open an issue in the project repository.',
            ],
          },
          {
            h2: 'Data we store',
            paragraphs: [
              'If you browse without an account, we store nothing about you.',
              'If you create an account, we store your email, a hash of your password (never plaintext), your sessions (they expire after 30 days) and the templates you sync to the cloud.',
              'If you connect Intervals.icu, we store your API key encrypted and use it only to fetch your activities and their data.',
            ],
          },
          {
            h2: 'What never leaves your machine',
            paragraphs: [
              'Your videos and activity files (.FIT, .GPX or .TCX) are processed entirely in your browser with WebCodecs. Rendering is 100% local: those files are never uploaded to our servers.',
            ],
          },
          {
            h2: 'Third parties',
            paragraphs: [
              'Hosting and cookieless analytics: Cloudflare. Fonts: self-hosted, no third-party requests. Optional telemetry: Intervals.icu, only if you connect your key. We sell or share data with nobody else.',
            ],
          },
          {
            h2: 'Cookies',
            paragraphs: [
              'Only the session cookie, strictly necessary to keep you signed in. No tracking cookies and no consent banner, because none is needed.',
            ],
          },
          {
            h2: 'Your rights',
            paragraphs: [
              'You can disconnect Intervals.icu anytime from the app. To access, rectify or erase your account data, open an issue and we will handle it. We keep account data while the account exists; sessions expire after 30 days.',
            ],
          },
          {
            h2: 'Changes',
            paragraphs: [
              'If this policy changes materially, we will update the effective date on this page.',
            ],
          },
        ],
        backLabel: '← Home',
        ctaApp: 'Open the app',
        contactTitle: 'Contact',
        contactLabel: 'Open a GitHub issue',
      },
    },
  },
  {
    slug: { es: 'terminos', en: 'terms' },
    copy: {
      es: {
        title: 'Términos del servicio | velohud',
        description:
          'Condiciones de uso de velohud: servicio tal cual, uso aceptable, tu contenido y el código abierto MIT.',
        h1: 'Términos del servicio',
        lede: 'Vigentes desde el 28 de octubre de 2026. Al usar velohud aceptas estas condiciones.',
        sections: [
          {
            h2: 'El servicio',
            paragraphs: [
              'velohud es un editor web gratuito que incrusta telemetría en tus videos, con render 100% local en tu navegador. La cuenta es opcional y sirve para sincronizar plantillas y conectar Intervals.icu.',
            ],
          },
          {
            h2: 'Uso aceptable',
            paragraphs: [
              'No abuses del servicio: nada de ataques, spam, sobrecarga deliberada del API ni uso ilegal. Podemos cerrar cuentas que lo incumplan.',
            ],
          },
          {
            h2: 'Tu contenido',
            paragraphs: [
              'Tus plantillas son tuyas. Al sincronizarlas nos das permiso para alojarlas y mostrártelas. Tus videos y archivos de actividad nunca llegan a nuestros servidores, así que ni siquiera entran en este apartado.',
            ],
          },
          {
            h2: 'Disponibilidad',
            paragraphs: [
              'El servicio se ofrece “tal cual”, sin garantías ni SLA. Es un proyecto personal: puede fallar, cambiar o cerrarse, y haremos lo razonable para avisarlo.',
            ],
          },
          {
            h2: 'Cuentas',
            paragraphs: [
              'Guarda bien tu contraseña: no hay recuperación por correo. Si la pierdes, tendrás que crear una cuenta nueva. Puedes dejar de usar el servicio cuando quieras.',
            ],
          },
          {
            h2: 'Código abierto',
            paragraphs: [
              'El código de la app es open source bajo licencia MIT. Estos términos cubren el servicio alojado, no el código.',
            ],
          },
          {
            h2: 'Responsabilidad',
            paragraphs: [
              'En la medida que permita la ley, no respondemos por daños derivados del uso o la indisponibilidad del servicio.',
            ],
          },
          {
            h2: 'Cambios',
            paragraphs: [
              'Si estos términos cambian de forma relevante, actualizaremos la fecha de vigencia en esta página.',
            ],
          },
        ],
        backLabel: '← Inicio',
        ctaApp: 'Abrir la app',
        contactTitle: 'Contacto',
        contactLabel: 'Abrir un issue en GitHub',
      },
      en: {
        title: 'Terms of service | velohud',
        description:
          'velohud terms of use: as-is service, acceptable use, your content and the MIT open-source code.',
        h1: 'Terms of service',
        lede: 'Effective October 28, 2026. By using velohud you accept these terms.',
        sections: [
          {
            h2: 'The service',
            paragraphs: [
              'velohud is a free web editor that overlays telemetry on your videos, with a 100% local render in your browser. An account is optional and serves to sync templates and connect Intervals.icu.',
            ],
          },
          {
            h2: 'Acceptable use',
            paragraphs: [
              'Do not abuse the service: no attacks, spam, deliberate API overload or unlawful use. We may close accounts that breach this.',
            ],
          },
          {
            h2: 'Your content',
            paragraphs: [
              'Your templates are yours. By syncing them you allow us to host and show them to you. Your videos and activity files never reach our servers, so they are not even covered here.',
            ],
          },
          {
            h2: 'Availability',
            paragraphs: [
              'The service is provided “as is”, without warranties or SLA. It is a personal project: it may fail, change or shut down, and we will do what is reasonable to announce it.',
            ],
          },
          {
            h2: 'Accounts',
            paragraphs: [
              'Keep your password safe: there is no email recovery. If you lose it, you will need a new account. You can stop using the service anytime.',
            ],
          },
          {
            h2: 'Open source',
            paragraphs: [
              'The app code is open source under the MIT license. These terms cover the hosted service, not the code.',
            ],
          },
          {
            h2: 'Liability',
            paragraphs: [
              'To the extent permitted by law, we are not liable for damages arising from the use or unavailability of the service.',
            ],
          },
          {
            h2: 'Changes',
            paragraphs: [
              'If these terms change materially, we will update the effective date on this page.',
            ],
          },
        ],
        backLabel: '← Home',
        ctaApp: 'Open the app',
        contactTitle: 'Contact',
        contactLabel: 'Open a GitHub issue',
      },
    },
  },
];

export const legalPath = (locale: Locale, e: LegalEntry): string => `/${locale}/${e.slug[locale]}/`;

export interface FooterNav {
  privacyLabel: string;
  privacyPath: string;
  termsLabel: string;
  termsPath: string;
  donateLabel: string;
  donateUrl: string;
}

export const footerNav = (locale: Locale): FooterNav => {
  const privacy = LEGAL.find((e) => e.slug.en === 'privacy') as LegalEntry;
  const terms = LEGAL.find((e) => e.slug.en === 'terms') as LegalEntry;
  return {
    privacyLabel: locale === 'es' ? 'Privacidad' : 'Privacy',
    privacyPath: legalPath(locale, privacy),
    termsLabel: locale === 'es' ? 'Términos' : 'Terms',
    termsPath: legalPath(locale, terms),
    donateLabel: locale === 'es' ? 'Donar' : 'Donate',
    donateUrl: DONATE_URL,
  };
};

export const SEO_PAGES: SitemapPage[] = [
  { path: '/' },
  { path: '/es/' },
  { path: '/en/' },
  ...(['es', 'en'] as Locale[]).flatMap((locale) => [
    ...GUIDES.map((g): SitemapPage => ({ path: guidePath(locale, g) })),
    ...LEGAL.map((e): SitemapPage => ({ path: legalPath(locale, e) })),
  ]),
];
