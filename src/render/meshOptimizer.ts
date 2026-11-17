import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import * as THREE from 'three';

let meshoptReady = false;
let meshoptInitPromise: Promise<boolean> | null = null;

/**
 * Warms up MIT meshoptimizer WASM asynchronously without blocking first paint.
 */
export function ensureMeshOptimizerReady(): Promise<boolean> {
  if (meshoptReady) return Promise.resolve(true);
  if (!meshoptInitPromise) {
    meshoptInitPromise = MeshoptSimplifier.ready
      .then(() => {
        meshoptReady = Boolean(MeshoptSimplifier.supported);
        return meshoptReady;
      })
      .catch(() => false);
  }
  return meshoptInitPromise;
}

export function isMeshOptimizerReady(): boolean {
  return meshoptReady;
}

export interface GeometryOptimizationStats {
  verticesBefore: number;
  verticesAfter: number;
  indexCount: number;
  usedMeshoptCompact: boolean;
}

/**
 * Welds identical static tile vertices into an indexed buffer (cutting quad vertex memory ~33–45%),
 * compacts vertex order via meshoptimizer when ready, and computes tight frustum-culling bounds.
 */
export function optimizeStaticGeometry(
  geo: THREE.BufferGeometry,
): GeometryOptimizationStats {
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
  const norAttr = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const colAttr = geo.getAttribute('color') as THREE.BufferAttribute | undefined;

  if (!posAttr || posAttr.count < 3 || geo.index !== null) {
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return {
      verticesBefore: posAttr?.count ?? 0,
      verticesAfter: posAttr?.count ?? 0,
      indexCount: geo.index?.count ?? posAttr?.count ?? 0,
      usedMeshoptCompact: false,
    };
  }

  const origCount = posAttr.count;
  const posArr = posAttr.array as Float32Array;
  const norArr = norAttr?.array as Float32Array | undefined;
  const uvArr = uvAttr?.array as Float32Array | undefined;
  const colArr = colAttr?.array as Float32Array | undefined;

  const vertMap = new Map<string, number>();
  const newPos: number[] = [];
  const newNor: number[] = [];
  const newUv: number[] = [];
  const newCol: number[] = [];
  const rawIndices = new Uint32Array(origCount);

  let uniqueCount = 0;
  for (let i = 0; i < origCount; i += 1) {
    const p3 = i * 3;
    const p2 = i * 2;
    const px = posArr[p3]!;
    const py = posArr[p3 + 1]!;
    const pz = posArr[p3 + 2]!;
    const nx = norArr ? norArr[p3]! : 0;
    const ny = norArr ? norArr[p3 + 1]! : 1;
    const nz = norArr ? norArr[p3 + 2]! : 0;
    const u = uvArr ? uvArr[p2]! : 0;
    const v = uvArr ? uvArr[p2 + 1]! : 0;
    const r = colArr ? colArr[p3]! : 1;
    const g = colArr ? colArr[p3 + 1]! : 1;
    const b = colArr ? colArr[p3 + 2]! : 1;

    // 1mm position precision + crisp normal/uv/color quantization preserves sharp facade corners
    const key =
      `${Math.round(px * 500)},${Math.round(py * 500)},${Math.round(pz * 500)}|` +
      `${Math.round(nx * 100)},${Math.round(ny * 100)},${Math.round(nz * 100)}|` +
      `${Math.round(u * 250)},${Math.round(v * 250)}|` +
      `${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}`;

    let idx = vertMap.get(key);
    if (idx === undefined) {
      idx = uniqueCount;
      uniqueCount += 1;
      vertMap.set(key, idx);
      newPos.push(px, py, pz);
      if (norArr) newNor.push(nx, ny, nz);
      if (uvArr) newUv.push(u, v);
      if (colArr) newCol.push(r, g, b);
    }
    rawIndices[i] = idx;
  }

  let finalPos = new Float32Array(newPos);
  let finalNor = norArr ? new Float32Array(newNor) : null;
  let finalUv = uvArr ? new Float32Array(newUv) : null;
  let finalCol = colArr ? new Float32Array(newCol) : null;
  let finalIndices: Uint32Array = rawIndices;
  let usedMeshoptCompact = false;

  if (meshoptReady && uniqueCount > 0) {
    try {
      const [remap, compactCount] = MeshoptSimplifier.compactMesh(rawIndices);
      if (compactCount > 0 && compactCount <= uniqueCount) {
        const cPos = new Float32Array(compactCount * 3);
        const cNor = finalNor ? new Float32Array(compactCount * 3) : null;
        const cUv = finalUv ? new Float32Array(compactCount * 2) : null;
        const cCol = finalCol ? new Float32Array(compactCount * 3) : null;
        for (let oldIdx = 0; oldIdx < uniqueCount; oldIdx += 1) {
          const newIdx = remap[oldIdx];
          if (newIdx === undefined || newIdx === 0xffffffff || newIdx >= compactCount) continue;
          cPos[newIdx * 3] = finalPos[oldIdx * 3]!;
          cPos[newIdx * 3 + 1] = finalPos[oldIdx * 3 + 1]!;
          cPos[newIdx * 3 + 2] = finalPos[oldIdx * 3 + 2]!;
          if (cNor && finalNor) {
            cNor[newIdx * 3] = finalNor[oldIdx * 3]!;
            cNor[newIdx * 3 + 1] = finalNor[oldIdx * 3 + 1]!;
            cNor[newIdx * 3 + 2] = finalNor[oldIdx * 3 + 2]!;
          }
          if (cUv && finalUv) {
            cUv[newIdx * 2] = finalUv[oldIdx * 2]!;
            cUv[newIdx * 2 + 1] = finalUv[oldIdx * 2 + 1]!;
          }
          if (cCol && finalCol) {
            cCol[newIdx * 3] = finalCol[oldIdx * 3]!;
            cCol[newIdx * 3 + 1] = finalCol[oldIdx * 3 + 1]!;
            cCol[newIdx * 3 + 2] = finalCol[oldIdx * 3 + 2]!;
          }
        }
        finalPos = cPos;
        finalNor = cNor;
        finalUv = cUv;
        finalCol = cCol;
        uniqueCount = compactCount;
        usedMeshoptCompact = true;
      }
    } catch {
      // Fallback cleanly to welded indices if WASM call fails on restricted WebView
      finalIndices = rawIndices;
    }
  }

  geo.setAttribute('position', new THREE.BufferAttribute(finalPos, 3));
  if (finalNor) geo.setAttribute('normal', new THREE.BufferAttribute(finalNor, 3));
  if (finalUv) geo.setAttribute('uv', new THREE.BufferAttribute(finalUv, 2));
  if (finalCol) geo.setAttribute('color', new THREE.BufferAttribute(finalCol, 3));

  if (uniqueCount <= 65535) {
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(finalIndices), 1));
  } else {
    geo.setIndex(new THREE.BufferAttribute(finalIndices, 1));
  }

  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  return {
    verticesBefore: origCount,
    verticesAfter: uniqueCount,
    indexCount: finalIndices.length,
    usedMeshoptCompact,
  };
}
