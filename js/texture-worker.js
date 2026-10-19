// מייצר טקסטורות מפורטות ברקע, כדי שהאתר לא ייתקע בזמן החישוב.
// texgen נטען עם אותו מספר גרסה כמו הקובץ הזה (ל־Worker אין מפת ייבוא – ראו tools/bump-version.mjs)
const texgen = import(`./texgen.js${new URL(import.meta.url).search}`);

self.onmessage = async (e) => {
  const { generate, SIZES } = await texgen;
  const { id } = e.data;
  const [w, h] = SIZES[id];
  const { rgba, bump } = generate(id, w, h, true);
  const transfer = [rgba.buffer];
  if (bump) transfer.push(bump.buffer);
  self.postMessage({ id, w, h, rgba, bump }, transfer);
};
