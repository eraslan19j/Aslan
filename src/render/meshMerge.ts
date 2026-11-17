import * as THREE from 'three';

export interface ColoredGeometryPart {
  geometry: THREE.BufferGeometry;
  color: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

/**
 * Bakes multiple positioned/rotated/scaled primitive geometries with per-part colors
 * into a single non-indexed vertex-colored BufferGeometry (1 draw call!).
 * Disposes source temporary geometries automatically.
 */
export function mergeColoredParts(parts: readonly ColoredGeometryPart[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  const mat4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const posVec = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const normalMat = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const col = new THREE.Color();

  for (const part of parts) {
    const nonIdx = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    const posAttr = nonIdx.getAttribute('position');
    if (!posAttr) {
      if (nonIdx !== part.geometry) nonIdx.dispose();
      part.geometry.dispose();
      continue;
    }
    if (!nonIdx.getAttribute('normal')) {
      nonIdx.computeVertexNormals();
    }
    const norAttr = nonIdx.getAttribute('normal');

    posVec.set(part.position?.[0] ?? 0, part.position?.[1] ?? 0, part.position?.[2] ?? 0);
    euler.set(part.rotation?.[0] ?? 0, part.rotation?.[1] ?? 0, part.rotation?.[2] ?? 0);
    quat.setFromEuler(euler);
    scaleVec.set(part.scale?.[0] ?? 1, part.scale?.[1] ?? 1, part.scale?.[2] ?? 1);
    mat4.compose(posVec, quat, scaleVec);
    normalMat.getNormalMatrix(mat4);

    col.setHex(part.color);

    for (let i = 0; i < posAttr.count; i += 1) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(mat4);
      positions.push(v.x, v.y, v.z);

      n.fromBufferAttribute(norAttr, i).applyMatrix3(normalMat).normalize();
      normals.push(n.x, n.y, n.z);

      colors.push(col.r, col.g, col.b);
    }

    if (nonIdx !== part.geometry) nonIdx.dispose();
    part.geometry.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}
