// Catalog helpers. The catalog data itself is owned by the backend (served via the API).

export const SECTIONS = Object.freeze({ material: 'materials', color: 'colors', finish: 'finishes' });

export const catalogIds = (catalog) =>
  Object.fromEntries(
    Object.entries(SECTIONS).map(([field, section]) => [field, new Set(catalog[section].map((e) => e.id))]),
  );
