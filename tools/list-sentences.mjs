// מדפיס (כ־JSON) את כל המשפטים שהקריין מקריא, באותה חלוקה שבה משתמש האתר.
// משמש את tools/generate_audio.py.
import { splitSentences } from '../js/speech.js';

// --lang en: הטקסטים באנגלית מ־js/en/ (אותו מבנה כמו בעברית)
const dir = process.argv.includes('--lang') && process.argv[process.argv.indexOf('--lang') + 1] === 'en' ? '../js/en/' : '../js/';
const { SUN, PLANETS, TOUR_INTRO, TOUR_OUTRO, SCALE_REAL, SCALE_COMPRESSED, ASTEROID_BELT, GALAXY_MOTION, BLACK_HOLE, MILKY_WAY } = await import(dir + 'data.js');
const { GLOSSARY, CONTINUE_QUESTION } = await import(dir + 'glossary.js');
const { MOONS } = await import(dir + 'moons.js');
const { COMETS, COMETS_INFO } = await import(dir + 'comets.js');

const texts = [
  ...[...TOUR_INTRO, SUN, ...PLANETS, TOUR_OUTRO, SCALE_REAL, SCALE_COMPRESSED, ASTEROID_BELT, GALAXY_MOTION, BLACK_HOLE, MILKY_WAY].map((d) => d.narration),
  ...GLOSSARY.map((g) => g.text),
  CONTINUE_QUESTION,
  ...Object.values(MOONS).flat().map((m) => m.text),
  ...[COMETS_INFO, ...COMETS].map((c) => c.narration),
];
const sentences = [...new Set(texts.flatMap(splitSentences))];
process.stdout.write(JSON.stringify(sentences, null, 2));
