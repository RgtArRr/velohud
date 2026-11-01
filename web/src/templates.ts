import broadcast from '../../fixtures/templates/broadcast.json';
import minimal from '../../fixtures/templates/minimal.json';
import climb from '../../fixtures/templates/climb.json';
import chrono from '../../fixtures/templates/chrono.json';
import strip from '../../fixtures/templates/strip.json';
import story from '../../fixtures/templates/story.json';
import apex from '../../fixtures/templates/apex.json';
import pulse from '../../fixtures/templates/pulse.json';
import speedo from '../../fixtures/templates/speedo.json';
import ring from '../../fixtures/templates/ring.json';
import slope from '../../fixtures/templates/slope.json';
import gears from '../../fixtures/templates/gears.json';
import spark from '../../fixtures/templates/spark.json';
import profile from '../../fixtures/templates/profile.json';
import vam from '../../fixtures/templates/vam.json';
import routemap from '../../fixtures/templates/routemap.json';
import navmap from '../../fixtures/templates/navmap.json';
import compass from '../../fixtures/templates/compass.json';
import share from '../../fixtures/templates/share.json';
import { parseTemplateJson, type Template } from '@velohud/shared';

/** Built-in catalog. Fase 6+ adds generated ones. */
const RAW_TEMPLATES: unknown[] = [
  broadcast as Template,
  minimal as Template,
  climb as Template,
  chrono as Template,
  strip as Template,
  story as Template,
  apex as Template,
  pulse as Template,
  speedo as Template,
  ring as Template,
  slope as Template,
  gears as Template,
  spark as Template,
  profile as Template,
  vam as Template,
  routemap as Template,
  navmap as Template,
  compass as Template,
  share as Template,
];

/** Build-time fixtures are trusted, but a corrupt JSON must fail loud, never silent. */
export const BUILTIN_TEMPLATES: Template[] = RAW_TEMPLATES.map((raw, i) => {
  try {
    return parseTemplateJson(JSON.stringify(raw));
  } catch {
    throw new Error(`builtin template #${i} is not a valid Template`);
  }
});
