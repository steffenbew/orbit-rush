import * as THREE from '../assets/vendor/three.module.js';

// Fit each part in the home camera's projection. A sphere around the entire model
// leaves long ships and flat formations tiny. Measure only on load or resize, not during orbit.
export function homeDistance(object, radius, aspect, fov, { yaw, pitch, target }) {
  const eye = new THREE.Vector3().setFromSphericalCoords(1, pitch, yaw);
  const toView = new THREE.Matrix4().lookAt(eye, new THREE.Vector3(), new THREE.Vector3(0, 1, 0))
    .setPosition(...target).invert();
  const matrix = new THREE.Matrix4(), p = new THREE.Vector3(), size = new THREE.Vector3();
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * .88; // 6% margin per edge.
  const halfWidth = halfHeight * aspect;
  let distance = radius * 1.12; // Keep the camera outside the hull when orbiting end-on.
  object.updateWorldMatrix(true, true);
  object.traverseVisible(part => {
    if (!part.geometry) return;
    matrix.multiplyMatrices(toView, part.matrixWorld);
    if (part.isSprite) {
      // A glow faces the camera, regardless of the model's rotation. Frame its bright core.
      p.setFromMatrixPosition(matrix); size.setFromMatrixScale(matrix);
      distance = Math.max(distance, p.z + (Math.abs(p.x) + size.x * .32) / halfWidth,
        p.z + (Math.abs(p.y) + size.y * .32) / halfHeight);
      return;
    }
    const shape = part.isInstancedMesh ? part : part.geometry;
    if (!shape.boundingBox) shape.computeBoundingBox();
    const { min, max } = shape.boundingBox;
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
      p.set(x, y, z).applyMatrix4(matrix);
      distance = Math.max(distance, p.z + Math.abs(p.x) / halfWidth, p.z + Math.abs(p.y) / halfHeight);
    }
  });
  return distance;
}
