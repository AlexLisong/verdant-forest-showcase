import * as THREE from 'three';

export type FarTreeCell = {
  center: THREE.Vector3;
  /** Pass tree cells only. Mesh[] also accepts the existing vegetation Cell type. */
  meshes: readonly THREE.Mesh[];
};
export type FarTreePoolOptions = {
  poolSize?: 60 | 80;
  nearDistance?: number;
  farDistance?: number;
  /** Extra world-unit margin for shader displacement, beyond exact static bounds. */
  boundsPadding?: number;
};
type Chunk = { cell: number; offset: number; count: number; bounds: THREE.Box3 };
export type FarTreePool = {
  mesh: THREE.InstancedMesh;
  /** Immutable source snapshot; matrices remain in the original coordinate space. */
  sourceMatrices: Float32Array;
  sourceColors: Float32Array | null;
  sourceCount: number;
  /** Conservative bound of every source instance, including inactive cells. */
  bounds: THREE.Box3;
  chunks: readonly Chunk[];
};
export type FarTreeUpdate = {
  visiblePools: number;
  activeInstances: number;
  changedPools: number;
  copiedInstances: number;
};

/**
 * Snapshot static, identity-transform tree meshes before their counts are changed.
 * Add the returned identity Group in the same coordinate space as the source
 * meshes and cell centers. Camera positions use that same space (world space in
 * the current forest). Source geometry/material objects are shared, never cloned
 * or disposed. Source visibility and matrices are never mutated.
 */
export function createFarTreePools(cells: readonly FarTreeCell[], options: FarTreePoolOptions = {}) {
  const poolSize = options.poolSize ?? 80;
  const nearDistance = options.nearDistance ?? 108;
  const farDistance = options.farDistance ?? 250;
  const padding = options.boundsPadding ?? 0;
  if ((poolSize !== 60 && poolSize !== 80) || !Number.isFinite(nearDistance)
    || !Number.isFinite(farDistance) || nearDistance < 0 || farDistance <= nearDistance
    || !Number.isFinite(padding) || padding < 0) throw new Error('Invalid far-tree pool options');
  const group = new THREE.Group();
  group.name = 'far-tree-pools';
  const centers = cells.map(cell => {
    if (![cell.center.x, cell.center.y, cell.center.z].every(Number.isFinite)) throw new Error('Non-finite tree cell center');
    return cell.center.clone();
  });
  const identity = new THREE.Matrix4();
  const materialIds = new Map<THREE.Material | THREE.Material[], number>();
  const seenMeshes = new Set<THREE.InstancedMesh>();
  type Source = { cell: number; mesh: THREE.InstancedMesh; count: number };
  type Pending = { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; sources: Source[]; layers: number; renderOrder: number };
  const pending = new Map<string, Pending>();
  for (let cell = 0; cell < cells.length; cell++) {
    const center = centers[cell];
    const tile = `${Math.floor(center.x / poolSize)},${Math.floor(center.z / poolSize)}`;
    for (const source of cells[cell].meshes) {
      if (!(source instanceof THREE.InstancedMesh)) throw new Error('Far-tree input must contain InstancedMesh objects');
      if (seenMeshes.has(source)) throw new Error('A source tree mesh occurs in more than one cell');
      seenMeshes.add(source);
      const sourceTransform = source.matrixAutoUpdate ? new THREE.Matrix4().compose(source.position, source.quaternion, source.scale) : source.matrix;
      if (!sourceTransform.equals(identity)) throw new Error('Far-tree source meshes must have identity local transforms');
      const geometry = source.userData.lods?.[2];
      if (!(geometry instanceof THREE.BufferGeometry)) throw new Error('A source tree mesh is missing low LOD geometry');
      if (!(source.instanceMatrix.array instanceof Float32Array)) throw new Error('Tree matrices must use Float32 storage');
      if (!Number.isInteger(source.count) || source.count < 0 || source.count > source.instanceMatrix.count) throw new Error('Invalid source instance count');
      if (source.count === 0) continue;
      if (!materialIds.has(source.material)) materialIds.set(source.material, materialIds.size);
      const key = `${tile}|${geometry.id}|${materialIds.get(source.material)}|${source.layers.mask}|${source.renderOrder}`;
      let item = pending.get(key);
      if (!item) {
        item = { geometry, material: source.material, sources: [], layers: source.layers.mask, renderOrder: source.renderOrder };
        pending.set(key, item);
      }
      item.sources.push({ cell, mesh: source, count: source.count });
    }
  }
  const pools: FarTreePool[] = [];
  const cellPools = cells.map(() => new Set<number>());
  const matrix = new THREE.Matrix4();
  const box = new THREE.Box3();
  for (const item of pending.values()) {
    const sourceCount = item.sources.reduce((sum, source) => sum + source.count, 0);
    const sourceMatrices = new Float32Array(sourceCount * 16);
    const hasColors = item.sources.some(source => source.mesh.instanceColor !== null);
    const sourceColors = hasColors ? new Float32Array(sourceCount * 3).fill(1) : null;
    const chunks: Chunk[] = [];
    // Compute on a clone if needed, avoiding mutation of the shared geometry.
    const geometryBounds = item.geometry.boundingBox?.clone() ?? new THREE.Box3().setFromBufferAttribute(item.geometry.getAttribute('position') as THREE.BufferAttribute);
    if (geometryBounds.isEmpty() || ![...geometryBounds.min.toArray(), ...geometryBounds.max.toArray()].every(Number.isFinite)) throw new Error('Low tree geometry has invalid bounds');
    let offset = 0;
    const fullBounds = new THREE.Box3();
    for (const source of item.sources) {
      const values = source.mesh.instanceMatrix.array as Float32Array;
      const snapshot = values.subarray(0, source.count * 16);
      if (!snapshot.every(Number.isFinite)) throw new Error('Non-finite source tree matrix');
      sourceMatrices.set(snapshot, offset * 16);
      if (sourceColors && source.mesh.instanceColor) {
        const colors = source.mesh.instanceColor;
        if (colors.count < source.count) throw new Error('Source tree colors are shorter than its instance count');
        for (let i = 0; i < source.count; i++) {
          sourceColors[(offset + i) * 3] = colors.getX(i);
          sourceColors[(offset + i) * 3 + 1] = colors.getY(i);
          sourceColors[(offset + i) * 3 + 2] = colors.getZ(i);
        }
      }
      const bounds = new THREE.Box3();
      for (let i = 0; i < source.count; i++) {
        matrix.fromArray(sourceMatrices, (offset + i) * 16);
        bounds.union(box.copy(geometryBounds).applyMatrix4(matrix));
      }
      if (padding) bounds.expandByScalar(padding);
      fullBounds.union(bounds);
      chunks.push({ cell: source.cell, offset, count: source.count, bounds });
      cellPools[source.cell].add(pools.length);
      offset += source.count;
    }
    const mesh = new THREE.InstancedMesh(item.geometry, item.material, sourceCount);
    mesh.name = `far-tree-pool-${pools.length}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (sourceColors) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sourceCount * 3), 3).setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.visible = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.layers.mask = item.layers;
    mesh.renderOrder = item.renderOrder;
    mesh.userData.kind = 'tree';
    mesh.userData.dynamicInstances = true;
    mesh.userData.farPool = true;
    mesh.userData.lodLevel = 2;
    mesh.boundingBox = new THREE.Box3();
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
    group.add(mesh);
    pools.push({ mesh, sourceMatrices, sourceColors, sourceCount, bounds: fullBounds, chunks });
  }
  const selected = new Uint8Array(cells.length).fill(255);
  const dirty = new Uint8Array(pools.length);
  const eye = new THREE.Vector3();
  const nearSquared = nearDistance * nearDistance;
  const farSquared = farDistance * farDistance;
  let visiblePools = 0;
  let activeInstances = 0;
  let disposed = false;
  function update(camera: THREE.Camera | THREE.Vector3): FarTreeUpdate {
    if (disposed) throw new Error('Far-tree pools have been disposed');
    if (camera instanceof THREE.Vector3) eye.copy(camera);
    else camera.getWorldPosition(eye);
    if (!Number.isFinite(eye.x) || !Number.isFinite(eye.z)) throw new Error('Non-finite camera position');
    dirty.fill(0);
    for (let i = 0; i < centers.length; i++) {
      const dx = eye.x - centers[i].x, dz = eye.z - centers[i].z;
      const distanceSquared = dx * dx + dz * dz;
      const include = distanceSquared >= nearSquared && distanceSquared < farSquared ? 1 : 0;
      if (include === selected[i]) continue;
      selected[i] = include;
      for (const index of cellPools[i]) dirty[index] = 1;
    }
    let changedPools = 0, copiedInstances = 0;
    for (let index = 0; index < pools.length; index++) {
      if (!dirty[index]) continue;
      changedPools++;
      const pool = pools[index], mesh = pool.mesh;
      activeInstances -= mesh.count;
      if (mesh.visible) visiblePools--;
      let count = 0;
      mesh.boundingBox!.makeEmpty();
      for (const chunk of pool.chunks) {
        if (!selected[chunk.cell]) continue;
        (mesh.instanceMatrix.array as Float32Array).set(pool.sourceMatrices.subarray(chunk.offset * 16, (chunk.offset + chunk.count) * 16), count * 16);
        if (pool.sourceColors) (mesh.instanceColor!.array as Float32Array).set(pool.sourceColors.subarray(chunk.offset * 3, (chunk.offset + chunk.count) * 3), count * 3);
        mesh.boundingBox!.union(chunk.bounds);
        count += chunk.count;
      }
      mesh.count = count;
      mesh.visible = count > 0;
      if (count) {
        mesh.boundingBox!.getBoundingSphere(mesh.boundingSphere!);
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, count * 16);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
          mesh.instanceColor.clearUpdateRanges();
          mesh.instanceColor.addUpdateRange(0, count * 3);
          mesh.instanceColor.needsUpdate = true;
        }
        visiblePools++;
      } else mesh.boundingSphere!.set(eye, 0);
      activeInstances += count;
      copiedInstances += count;
    }
    return { visiblePools, activeInstances, changedPools, copiedInstances };
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    for (const pool of pools) pool.mesh.dispose();
    group.clear();
  }
  return { group, pools, meshes: pools.map(pool => pool.mesh), poolSize, nearDistance, farDistance, update, dispose };
}
