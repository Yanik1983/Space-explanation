// מייצר טקסטורות מפורטות ברקע, כדי שהאתר לא ייתקע בזמן החישוב.
import { generate, SIZES } from './texgen.js';

self.onmessage = (e) => {
  const { id } = e.data;
  const [w, h] = SIZES[id];
  const { rgba, bump } = generate(id, w, h, true);
  const transfer = [rgba.buffer];
  if (bump) transfer.push(bump.buffer);
  self.postMessage({ id, w, h, rgba, bump }, transfer);
};
