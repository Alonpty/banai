import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Placeholder viewer for the foundations phase; wardrobe geometry arrives in Milestone 3.
export function createViewer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f3f0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 2));

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(2.5, 1.8, 3.5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, 0);
  controls.update();

  scene.add(new THREE.GridHelper(6, 12, 0xcccccc, 0xe5e5e5));

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / Math.max(clientHeight, 1);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  return { scene, camera, renderer, controls };
}
