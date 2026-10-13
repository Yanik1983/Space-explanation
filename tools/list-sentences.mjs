// מדפיס (כ־JSON) את כל המשפטים שהקריין מקריא, באותה חלוקה שבה משתמש האתר.
// משמש את tools/generate_audio.py.
import { SUN, PLANETS, TOUR_INTRO, TOUR_OUTRO } from '../js/data.js';
import { splitSentences } from '../js/speech.js';

const texts = [TOUR_INTRO, SUN, ...PLANETS, TOUR_OUTRO].map((d) => d.narration);
const sentences = [...new Set(texts.flatMap(splitSentences))];
process.stdout.write(JSON.stringify(sentences, null, 2));
