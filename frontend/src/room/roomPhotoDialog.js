// "Place in room": the customer picks a photo of their room (it stays in the browser, nothing is
// uploaded), marks the floor and the ceiling on the wall, and the wardrobe's 3D cutout is pasted
// into the picture at true scale. The scale comes from the room height (default 250 cm, editable).
// It is an illustration of size and placement, not a rendering of how the wardrobe will look.
import { el, button } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';

// ASSUMPTION: default room height when the customer does not know it (configurable default).
export const DEFAULT_ROOM_HEIGHT_CM = 250;
const MAX_PHOTO_PX = 1600;
const MAX_FILE_BYTES = 12 * 1024 * 1024;

/** Loads an image file into an <img>; rejects anything that is not a decodable image. */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      reject(new Error('The photo is too large (max 12 MB).'));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a photo.')); };
    image.src = url;
  });
}

function loadDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

/** The opaque bounding box of the cutout, so the wardrobe itself (not the canvas) is scaled. */
function opaqueBounds(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width; let top = canvas.height; let right = 0; let bottom = 0;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (data[(y * canvas.width + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return { left, top, width: Math.max(1, right - left + 1), height: Math.max(1, bottom - top + 1) };
}

export function createRoomPhotoDialog({ getDesign, getCutout }) {
  const state = { photo: null, cutout: null, bounds: null, floor: null, ceiling: null, anchor: null, roomHeightCm: DEFAULT_ROOM_HEIGHT_CM };

  const fileInput = el('input', { attrs: { type: 'file', accept: 'image/*', 'data-testid': 'room-photo-file' } });
  const heightInput = el('input', { attrs: { type: 'number', min: 150, max: 600, step: 1, value: String(DEFAULT_ROOM_HEIGHT_CM), 'data-testid': 'room-height' } });
  const canvas = el('canvas', { attrs: { 'data-testid': 'room-canvas' } });
  canvas.hidden = true;
  const empty = el('span', { className: 'dialog__text', text: 'Choose a photo of the room to begin.' });
  const stage = el('div', { className: 'room__stage' }, [empty, canvas]);
  const status = el('p', { className: 'dialog__status', text: 'Step 1: choose a photo of your room.', attrs: { role: 'status', 'data-testid': 'room-status' } });
  const download = button('Download picture', () => {
    const link = document.createElement('a');
    link.download = 'banai-wardrobe-in-room.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, { variant: 'primary', testId: 'room-download', disabled: true });
  const reset = button('Reset marks', () => { state.floor = state.ceiling = state.anchor = null; draw(); }, { testId: 'room-reset', disabled: true });

  const say = (text) => { status.textContent = text; };
  const ctx = canvas.getContext('2d');

  /** Pixels per millimetre on the wall, from the two marks and the room height. */
  const pxPerMm = () => Math.abs(state.ceiling.y - state.floor.y) / (state.roomHeightCm * 10);

  function draw() {
    if (!state.photo) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(state.photo, 0, 0, canvas.width, canvas.height);
    const ready = state.floor && state.ceiling;
    if (ready && state.cutout) {
      const design = getDesign();
      const scale = pxPerMm();
      const h = design.dimensions.height * scale;
      const w = h * (state.bounds.width / state.bounds.height);
      const anchor = state.anchor ?? { x: state.floor.x - w / 2, y: state.floor.y };
      state.anchor = anchor;
      const b = state.bounds;
      // A soft contact shadow so the wardrobe sits on the floor instead of floating.
      ctx.save();
      ctx.filter = 'blur(10px)';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(anchor.x + w * 0.04, anchor.y - h * 0.015, w * 0.95, h * 0.03);
      ctx.restore();
      ctx.drawImage(state.cutout, b.left, b.top, b.width, b.height, anchor.x, anchor.y - h, w, h);
    }
    // Marks: floor and ceiling, with the measured line between them.
    [[state.floor, '#2e7d32', 'Floor'], [state.ceiling, '#1565c0', 'Ceiling']].forEach(([point, colour, label]) => {
      if (!point) return;
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(label, point.x + 10, point.y + 5);
    });
    if (ready) {
      ctx.strokeStyle = '#1565c0';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(state.floor.x, state.floor.y);
      ctx.lineTo(state.ceiling.x, state.ceiling.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#1565c0';
      ctx.fillText(`${state.roomHeightCm} cm`, (state.floor.x + state.ceiling.x) / 2 + 10, (state.floor.y + state.ceiling.y) / 2);
    }
    download.disabled = !ready;
    reset.disabled = !state.floor;
    if (!state.floor) say('Step 2: click where the wall meets the floor, at the spot for the wardrobe.');
    else if (!state.ceiling) say('Step 3: click where that same wall meets the ceiling, straight above the first mark.');
    else say(`Drag the wardrobe to move it. Scale: room height ${state.roomHeightCm} cm, wardrobe ${getDesign().dimensions.height / 10} cm. Illustration of size and placement only.`);
  }

  const toCanvas = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
  };

  let drag = null;
  canvas.addEventListener('pointerdown', (event) => {
    if (!state.photo) return;
    const point = toCanvas(event);
    if (!state.floor) { state.floor = point; draw(); return; }
    if (!state.ceiling) {
      if (Math.abs(point.y - state.floor.y) < 20) { say('The ceiling mark must be well above the floor mark.'); return; }
      state.ceiling = { x: state.floor.x, y: point.y }; // keep the measured line vertical
      state.anchor = null;
      draw();
      return;
    }
    drag = { start: point, anchor: { ...state.anchor } };
    canvas.dataset.dragging = 'true';
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const point = toCanvas(event);
    state.anchor = { x: drag.anchor.x + point.x - drag.start.x, y: drag.anchor.y + point.y - drag.start.y };
    draw();
  });
  const endDrag = () => { drag = null; delete canvas.dataset.dragging; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  heightInput.addEventListener('change', () => {
    const value = Number(heightInput.value);
    if (!Number.isFinite(value) || value < 150 || value > 600) {
      say('Room height must be between 150 and 600 cm.');
      heightInput.value = String(state.roomHeightCm);
      return;
    }
    state.roomHeightCm = Math.round(value);
    draw();
  });

  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files;
    if (!file) return;
    try {
      const photo = await loadImage(file);
      const ratio = Math.min(1, MAX_PHOTO_PX / Math.max(photo.naturalWidth, photo.naturalHeight));
      canvas.width = Math.round(photo.naturalWidth * ratio);
      canvas.height = Math.round(photo.naturalHeight * ratio);
      state.photo = photo;
      state.floor = state.ceiling = state.anchor = null;
      canvas.hidden = false;
      empty.hidden = true;
      draw();
    } catch (error) {
      say(error.message);
    }
  });

  const dialog = createDialog({
    title: 'Place the wardrobe in your room',
    labelId: 'room-dialog-title',
    testId: 'room-dialog',
    body: [
      el('p', { className: 'dialog__text', text: 'The photo stays on your device and is not uploaded. Mark the floor and the ceiling on the wall, and the wardrobe is drawn to scale. If you do not know the room height, 250 cm is used.' }),
      el('div', { className: 'room__controls' }, [
        el('label', {}, [el('span', { text: 'Room photo' }), fileInput]),
        el('label', {}, [el('span', { text: 'Room height (cm)' }), heightInput]),
        reset,
      ]),
      stage,
      status,
    ],
    actions: [download, button('Close', () => dialog.close(), { variant: 'ghost', testId: 'room-close' })],
  });
  dialog.element.classList.add('dialog--wide');

  return {
    ...dialog,
    open: async () => {
      dialog.open();
      // The cutout follows the current design: re-rendered on every open (cheap, off screen).
      try {
        const design = getDesign();
        state.cutout = await loadDataUrl(getCutout(design));
        state.bounds = opaqueBounds(state.cutout);
        draw();
      } catch {
        say('The 3D cutout could not be rendered (WebGL unavailable).');
      }
    },
  };
}
