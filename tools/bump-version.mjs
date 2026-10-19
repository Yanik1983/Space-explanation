// מעדכן את "מספר הגרסה" של קובצי הקוד באתר. מריצים לפני כל עדכון: node tools/bump-version.mjs
// כל קובץ JS ו־CSS נטען עם ‎?v=גרסה, ולכן אחרי עדכון הדפדפן מוריד את הקבצים החדשים יחד,
// ולא מערבב קובץ ישן אחד עם קבצים חדשים (מה ששובר את האתר).
// תמונות, קול ודגמים לא מקבלים גרסה – הם גדולים ומשתנים לעיתים רחוקות, ואין טעם להוריד אותם מחדש בכל עדכון.
// לכן לא מוחקים ולא משנים שם של קובץ כזה באותו עדכון שבו הקוד מפסיק להשתמש בו.
import fs from 'fs';
import path from 'path';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const file = path.join(root, 'index.html');
const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const v = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;

let html = fs.readFileSync(file, 'utf8');
// מפת הייבוא: כל import יחסי של קובץ מתיקיית js מקבל את הגרסה
html = html.replace(/(<script type="importmap">\s*)([\s\S]*?)(\s*<\/script>)/, (all, a, json, b) => {
  const map = JSON.parse(json);
  for (const k of Object.keys(map.imports)) if (k.startsWith('./js/')) delete map.imports[k];
  for (const f of fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).sort()) {
    map.imports[`./js/${f}`] = `./js/${f}?v=${v}`;
  }
  const body = JSON.stringify(map, null, 2).split('\n').map((l, i) => (i ? '    ' + l : l)).join('\n');
  return a + body + b;
});
html = html.replace(/(href="css\/style\.css)(\?v=[^"]*)?"/, `$1?v=${v}"`);
html = html.replace(/(src="js\/main\.js)(\?v=[^"]*)?"/, `$1?v=${v}"`);
fs.writeFileSync(file, html);
console.log('version', v);
