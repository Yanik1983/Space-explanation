// בודק שקובצי התוכן באנגלית (js/en/) תואמים במבנה לקבצים העבריים: אותם מפתחות, מספרים ומזהים,
// בלי עברית שנשארה, ובלי נקודות עשרוניות בטקסט שמוקרא (כי המשפט נחתך בנקודה).
import { splitSentences } from '../js/speech.js';

const FILES = ['data', 'glossary', 'moons', 'comets'];
const SAME = new Set(['id', 'color', 'emoji', 'perihelion']); // שדות שחייבים להישאר זהים
const LOOSE_LENGTH = new Set(['forms', 'notBefore']); // ברשימות האלה אורך שונה מותר
const SPOKEN = new Set(['narration', 'text']); // טקסט שנועם מקריא
const errors = [];
const HEBREW = /[֐-׿]/;

function walk(he, en, path) {
  const key = path.split('.').pop().replace(/\[\d+\]$/, '');
  if (typeof he !== typeof en || Array.isArray(he) !== Array.isArray(en) || (he === null) !== (en === null)) {
    return errors.push(`${path}: type differs`);
  }
  if (Array.isArray(he)) {
    if (!LOOSE_LENGTH.has(key) && he.length !== en.length) errors.push(`${path}: length ${he.length} vs ${en.length}`);
    const n = LOOSE_LENGTH.has(key) ? 0 : Math.min(he.length, en.length);
    for (let i = 0; i < n; i++) walk(he[i], en[i], `${path}[${i}]`);
    if (LOOSE_LENGTH.has(key)) en.forEach((s, i) => HEBREW.test(s) && errors.push(`${path}[${i}]: Hebrew left`));
    return;
  }
  if (he && typeof he === 'object') {
    const hk = Object.keys(he).sort().join(), ek = Object.keys(en).sort().join();
    if (hk !== ek) errors.push(`${path}: keys differ (${hk} vs ${ek})`);
    for (const k of Object.keys(he)) if (k in en) walk(he[k], en[k], path ? `${path}.${k}` : k);
    return;
  }
  if (typeof he === 'string') {
    if (SAME.has(key)) {
      if (he !== en) errors.push(`${path}: must stay "${he}", got "${en}"`);
      return;
    }
    if (HEBREW.test(en)) errors.push(`${path}: Hebrew left: ${en.slice(0, 40)}`);
    if (!en.trim()) errors.push(`${path}: empty`);
    if (SPOKEN.has(key)) {
      if (/\d\.\d/.test(en)) errors.push(`${path}: decimal point in spoken text (write it in words)`);
      if (/\b(?:Mr|Mrs|Dr|St|vs|etc|e\.g|i\.e)\./.test(en)) errors.push(`${path}: abbreviation with a period in spoken text`);
      if (!/[.!?]$/.test(en.trim())) errors.push(`${path}: spoken text must end with . ! or ?`);
      try { splitSentences(en); } catch { errors.push(`${path}: cannot split into sentences`); }
    }
    return;
  }
  if (he !== en) errors.push(`${path}: value differs (${he} vs ${en})`);
}

const only = process.argv.slice(2);
for (const f of FILES.filter((x) => !only.length || only.includes(x))) {
  let enMod;
  try { enMod = await import(`../js/en/${f}.js`); } catch (e) { errors.push(`${f}: cannot load js/en/${f}.js (${e.message})`); continue; }
  const heMod = await import(`../js/${f}.js`);
  for (const name of Object.keys(heMod).filter((n) => n !== 'GLOSSARY_FORMS')) {
    if (!(name in enMod)) { errors.push(`${f}.${name}: missing export`); continue; }
    walk(heMod[name], enMod[name], `${f}.${name}`);
  }
}
console.log(errors.length ? errors.join('\n') + `\n${errors.length} problems` : 'OK');
process.exit(errors.length ? 1 : 0);
