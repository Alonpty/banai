// The measuring tool's readout in the properties panel: the same measurement the 3D label
// shows, as text for screen readers, plus the keyboard path (pick parts under "All parts").
import { button, el, section } from './fields.js';
import { describeMeasure } from '../viewer/format.js';

export function measureSection({ design, measure, clearMeasure, setMeasureMode }) {
  const container = section('Measure', [
    el('p', { className: 'panel__note', text: 'Click two parts in the 3D view, or choose them under All parts, to see the vertical distance between them. Nothing in the design changes.' }),
    el('p', { className: 'measure__result', text: describeMeasure(design, measure.ids), attrs: { 'aria-live': 'polite' } }),
    el('div', { className: 'button-row' }, [
      button('Clear', clearMeasure, { variant: 'ghost', testId: 'measure-clear', disabled: measure.ids.length === 0 }),
      button('Done measuring', () => setMeasureMode(false), { variant: 'ghost', testId: 'measure-done' }),
    ]),
  ]);
  container.dataset.testid = 'measure-section';
  container.querySelector('.measure__result').dataset.testid = 'measure-result';
  return container;
}
