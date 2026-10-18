// מדפיס (כ־JSON) את כל המשפטים שהקריין מקריא, באותה חלוקה שבה משתמש האתר.
// משמש את tools/generate_audio.py.
import { SUN, PLANETS, TOUR_INTRO, TOUR_OUTRO, SCALE_REAL, SCALE_COMPRESSED, ASTEROID_BELT, GALAXY_MOTION, MILKY_WAY } from '../js/data.js';
import { GLOSSARY, CONTINUE_QUESTION } from '../js/glossary.js';
import { MOONS } from '../js/moons.js';
import { COMETS, COMETS_INFO } from '../js/comets.js';
import { splitSentences } from '../js/speech.js';

const texts = [
  ...[...TOUR_INTRO, SUN, ...PLANETS, TOUR_OUTRO, SCALE_REAL, SCALE_COMPRESSED, ASTEROID_BELT, GALAXY_MOTION, MILKY_WAY].map((d) => d.narration),
  ...GLOSSARY.map((g) => g.text),
  CONTINUE_QUESTION,
  ...Object.values(MOONS).flat().map((m) => m.text),
  ...[COMETS_INFO, ...COMETS].map((c) => c.narration),
];
const sentences = [...new Set(texts.flatMap(splitSentences))];
process.stdout.write(JSON.stringify(sentences, null, 2));
