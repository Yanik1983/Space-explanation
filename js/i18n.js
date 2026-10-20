// שפת האתר: נקבעת לפי lang של דף ה־HTML (index.html = עברית, en/index.html = אנגלית).
// tt(עברית, אנגלית) מחזיר את הטקסט בשפה הנוכחית; הטקסטים הארוכים נמצאים בקבצי js/en/.
export const LANG = typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'he';
export const LOCALE = LANG === 'en' ? 'en-US' : 'he-IL';
export const tt = (he, en) => (LANG === 'en' ? en : he);
