// שפת האתר: נקבעת לפי lang של דף ה־HTML (index.html = עברית, en/index.html = אנגלית, ru/index.html = רוסית).
// tt(עברית, אנגלית, רוסית) מחזיר את הטקסט בשפה הנוכחית (בלי רוסית – האנגלית); הטקסטים הארוכים נמצאים בקבצי js/en/ ו־js/ru/.
const pageLang = typeof document !== 'undefined' ? document.documentElement.lang : 'he';
export const LANG = pageLang === 'en' || pageLang === 'ru' ? pageLang : 'he';
export const LOCALE = { he: 'he-IL', en: 'en-US', ru: 'ru-RU' }[LANG];
export const tt = (he, en, ru = en) => (LANG === 'ru' ? ru : LANG === 'en' ? en : he);
