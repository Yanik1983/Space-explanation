// מדפיס (כ־JSON) את כל המשפטים שהקריין מקריא, באותה חלוקה שבה משתמש האתר.
// משמש את tools/generate_audio.py.
import { SUN, PLANETS, TOUR_INTRO, TOUR_OUTRO, SCALE_REAL, SCALE_COMPRESSED } from '../js/data.js';
import { GLOSSARY } from '../js/glossary.js';
import { splitSentences } from '../js/speech.js';

const texts = [
  ...[TOUR_INTRO, SUN, ...PLANETS, TOUR_OUTRO, SCALE_REAL, SCALE_COMPRESSED].map((d) => d.narration),
  ...GLOSSARY.map((g) => g.text),
];
const sentences = [...new Set(texts.flatMap(splitSentences))];
process.stdout.write(JSON.stringify(sentences, null, 2));
