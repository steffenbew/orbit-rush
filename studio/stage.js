import * as THREE from '../assets/vendor/three.module.js';
import { homeDistance } from './framing.js';

function homeView(profile) {
  return { yaw: profile ? 1.33 : .88, pitch: profile ? 1.52 : 1.16, distance: 3, target: [0, 0, 0] };
}

export function isValidView(view) {
  return Number.isFinite(view?.yaw) && Number.isFinite(view.pitch) && view.pitch > 0 && view.pitch < Math.PI
    && Number.isFinite(view.distance) && view.distance > 0
    && Array.isArray(view.target) && view.target.length === 3 && view.target.every(Number.isFinite);
}

function createViewport(canvas, pixelRatio) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(pixelRatio);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40);
  const key = new THREE.DirectionalLight(0xffe7d0, 3);
  key.position.set(-2, 3, 2);
  scene.add(new THREE.HemisphereLight(0xd9eaff, 0x453c5d, 2.6), key);
  const target = new THREE.Vector3(), center = new THREE.Vector3();
  let object, radius = 1, home = homeView(false);
  function frame() {
    if (object) home.distance = homeDistance(object, radius, camera.aspect, camera.fov, home);
  }

  function render(view) {
    const { distance } = view;
    target.fromArray(view.target);
    // Resolve shallow hull panels at orbit distance; move the clip plane in for detail work.
    camera.near = Math.min(radius * .1, distance * .04);
    camera.far = distance + target.distanceTo(center) + 2 * radius;
    camera.updateProjectionMatrix();
    camera.position.setFromSphericalCoords(distance, view.pitch, view.yaw).add(target);
    camera.lookAt(target);
    renderer.render(scene, camera);
  }
  function setSize(width, height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    frame();
  }
  function setModel(next, profile = false) {
    if (object) {
      scene.remove(object);
      const resources = new Set();
      object.traverse(part => {
        if (part.geometry && !part.isSprite) resources.add(part.geometry); // Three shares sprite geometry across scenes.
        if (part.isInstancedMesh) resources.add(part);
        if (part.material) {
          resources.add(part.material);
          if (part.material.map) resources.add(part.material.map);
        }
      });
      for (const resource of resources) resource.dispose();
    }
    object = next;
    if (!object) { renderer.renderLists.dispose(); return; }
    scene.add(object);
    const bounds = new THREE.Box3().setFromObject(object);
    bounds.getCenter(center);
    radius = Math.max(.001, bounds.getBoundingSphere(new THREE.Sphere()).radius);
    home = homeView(profile);
    home.target = center.toArray();
    frame();
  }
  return { camera, target, setSize, setModel, render, get home() { return home; }, get radius() { return radius; } };
}

// One small offscreen renderer for the whole menu. Keep only the still image per row.
export function createThumbnailRenderer() {
  const canvas = document.createElement('canvas');
  const viewport = createViewport(canvas, 1);
  viewport.setSize(168, 112);
  return object => {
    try {
      viewport.setModel(object);
      viewport.render(viewport.home);
      return canvas.toDataURL();
    } finally { viewport.setModel(null); }
  };
}

export function createStage(canvas, view, resetButton) {
  const viewport = createViewport(canvas, Math.min(devicePixelRatio, 2));
  const { camera, target } = viewport;
  function render() {
    if (!view) return;
    const home = viewport.home;
    resetButton.hidden = view.yaw === home.yaw && view.pitch === home.pitch
      && view.distance === home.distance && view.target.every((value, i) => value === home.target[i]);
    viewport.render(view);
  }
  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    const previousFit = viewport.home.distance;
    viewport.setSize(width, height);
    if (view && previousFit !== viewport.home.distance) view.distance = view.distance / previousFit * viewport.home.distance;
    render();
  }
  new ResizeObserver(resize).observe(canvas);
  function reset() {
    view = { ...viewport.home, target: [...viewport.home.target] };
    render();
  }
  resetButton.onclick = () => {
    canvas.focus({ preventScroll: true });
    reset();
  };
  function show(next, viewMode, sideView) {
    const previous = viewport.home, previousRadius = viewport.radius;
    viewport.setModel(next, sideView);
    if (!view || viewMode === 'home') { reset(); return; }
    if (viewMode === 'relative') {
      // A different level or occurrence can be thousands of units away on the course.
      const home = viewport.home;
      view.distance = view.distance / previous.distance * home.distance;
      view.target = view.target.map((value, i) =>
        home.target[i] + (value - previous.target[i]) * viewport.radius / previousRadius);
    }
    // Reroll and source reload keep the actual orbit target and distance, not a fraction of the new bounds.
    render();
  }
  function orbit(dx, dy) {
    view.yaw -= dx * .009;
    view.pitch = THREE.MathUtils.clamp(view.pitch - dy * .009, .005, Math.PI - .005);
  }
  function zoom(delta) {
    const fit = viewport.home.distance;
    view.distance = THREE.MathUtils.clamp(view.distance * Math.exp(delta), .003 * fit, 8 * fit);
  }
  let drag;
  canvas.onpointerdown = e => {
    if (drag || ![0, 2].includes(e.button)) return;
    canvas.classList.add('pointer-focus');
    canvas.focus();
    canvas.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 };
  };
  canvas.onpointermove = e => {
    if (drag?.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.pan) {
      const perPixel = 2 * camera.position.distanceTo(target) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / canvas.clientHeight;
      new THREE.Vector3(-dx, dy, 0).applyQuaternion(camera.quaternion).multiplyScalar(perPixel)
        .add(target).toArray(view.target);
    } else orbit(dx, dy);
    drag.x = e.clientX; drag.y = e.clientY;
    render();
  };
  canvas.onlostpointercapture = () => { drag = null; };
  canvas.onblur = () => canvas.classList.remove('pointer-focus');
  canvas.oncontextmenu = e => e.preventDefault();
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoom(THREE.MathUtils.clamp(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1) * .0015, -1, 1));
    render();
  }, { passive: false });
  canvas.onkeydown = e => {
    switch (e.key) {
      case 'ArrowLeft': orbit(-12, 0); break;
      case 'ArrowRight': orbit(12, 0); break;
      case 'ArrowUp': orbit(0, -12); break;
      case 'ArrowDown': orbit(0, 12); break;
      case '+': case '=': zoom(-.18); break;
      case '-': zoom(.18); break;
      case 'Home': reset(); break;
      default: return;
    }
    canvas.classList.remove('pointer-focus');
    e.preventDefault(); render();
  };
  resize();
  return { show, get view() { return view; } };
}
