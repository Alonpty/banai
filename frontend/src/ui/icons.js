// Minimal inline line icons (24×24, stroke = currentColor). Built with DOM APIs from
// constant path data only: no HTML strings, no external assets.
const SVG_NS = 'http://www.w3.org/2000/svg';

const PATHS = Object.freeze({
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  redo: ['m15 14 5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  chevronLeft: ['m15 18-6-6 6-6'],
  chevronRight: ['m9 18 6-6-6-6'],
  close: ['M18 6 6 18', 'm6 6 12 12'],
  front: ['M5 3h14v18H5z', 'M12 3v18', 'M9.5 12h.01', 'M14.5 12h.01'],
  interior: ['M5 3h14v18H5z', 'M5 9h14', 'M5 15h14', 'M12 15v6'],
  ruler: ['M3 17 17 3l4 4L7 21z', 'm7 13 2 2', 'm10 10 2 2', 'm13 7 2 2'],
  reset: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5'],
  send: ['M12 19V5', 'm5 12 7-7 7 7'],
  sparkle: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 17l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'],
  check: ['M20 6 9 17l-5-5'],
  link: ['M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7', 'M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'],
  copy: ['M8 8h12v12H8z', 'M4 16V4h12'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'],
  room: ['M3 21h18', 'M5 21V8l7-5 7 5v13', 'M9 21v-7h6v7'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0'],
});

export function icon(name, { size = 18 } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  (PATHS[name] ?? []).forEach((d) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  });
  return svg;
}
