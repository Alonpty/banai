// Click-to-select via raycasting. A drag (orbit) is not a click. Hovering a component
// shows a pointer cursor (throttled to one raycast per animation frame).
import * as THREE from 'three';

const CLICK_TOLERANCE_PX = 5;

export function attachPicking({ dom, camera, getTargets, onPick }) {
  const raycaster = new THREE.Raycaster();
  let down = null;
  let hoverFrame = 0;

  const hitAt = (clientX, clientY) => {
    const rect = dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(getTargets(), false)[0] ?? null;
  };

  const onPointerDown = (event) => {
    down = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event) => {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_TOLERANCE_PX) return;
    down = null;
    onPick(hitAt(event.clientX, event.clientY));
  };
  const onPointerMove = (event) => {
    if (event.buttons || hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      dom.style.cursor = hitAt(event.clientX, event.clientY) ? 'pointer' : '';
    });
  };

  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointermove', onPointerMove);
  return () => {
    cancelAnimationFrame(hoverFrame);
    dom.removeEventListener('pointermove', onPointerMove);
    dom.removeEventListener('pointerdown', onPointerDown);
    dom.removeEventListener('pointerup', onPointerUp);
  };
}
