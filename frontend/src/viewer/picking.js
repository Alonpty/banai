// Click-to-select via raycasting. A drag (orbit) is not a click.
import * as THREE from 'three';

const CLICK_TOLERANCE_PX = 5;

export function attachPicking({ dom, camera, getTargets, onPick }) {
  const raycaster = new THREE.Raycaster();
  let down = null;

  const onPointerDown = (event) => {
    down = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event) => {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_TOLERANCE_PX) return;
    down = null;
    const rect = dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const [hit] = raycaster.intersectObjects(getTargets(), false);
    onPick(hit ?? null);
  };

  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointerup', onPointerUp);
  return () => {
    dom.removeEventListener('pointerdown', onPointerDown);
    dom.removeEventListener('pointerup', onPointerUp);
  };
}
