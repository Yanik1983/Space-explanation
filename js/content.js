// טוען את הטקסטים של השפה הנוכחית: עברית מ־js/*.js, אנגלית מ־js/en/*.js (אותו מבנה בדיוק).
import { LANG } from './i18n.js';

const dir = LANG === 'en' ? './en/' : './';
const [data, glossary, moons, comets] = await Promise.all(
  ['data', 'glossary', 'moons', 'comets'].map((f) => import(`${dir}${f}.js`)),
);

export const { SUN, PLANETS, TOUR_INTRO, TOUR_OUTRO, SCALE_REAL, SCALE_COMPRESSED, ASTEROID_BELT, GALAXY_MOTION, BLACK_HOLE, MILKY_WAY } = data;
export const { GLOSSARY, GLOSSARY_FORMS, CONTINUE_QUESTION } = glossary;
export const { MOONS } = moons;
export const { COMETS, COMETS_INFO } = comets;
