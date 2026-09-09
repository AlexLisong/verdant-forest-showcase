# Far-tree pool helper

Use `helper.ts` with **80 m pools**. The helper snapshots original instance matrices, groups by spatial tile plus exact material and low-geometry identity, and submits only cells whose horizontal center distance is in **[108, 250) m**. It makes no geometry or instance-matrix changes. All work in this leaf is in scratch; no Site, Git, hosting, browser, or full-scene render actions were performed.

Helper SHA-256: `9aa1e9f55e2d51c2e35f52141b830ef78af19dd2847f9c6391a1bf00a5cf46bd`

The parent has selected a **0.6 m bounds margin** for shader wind. Bounds start with each low geometry's actual bounding box transformed by every unchanged instance matrix. Per-source-chunk bounds include the configured margin. Each pool stores a full-source bound and updates its active bounding box/sphere to include only selected chunks. The helper reads the supplied low geometry at construction, so the parent's updated medium/far leaf scales require no helper constants to change.

## Integration

```ts
import { createFarTreePools } from './far-tree-pools';

// Create after all source tree matrices are populated, before counts can change.
const farTrees = createFarTreePools(cells.filter(c => c.kind === 'tree'), {
  poolSize: 80,
  boundsPadding: 0.6,
});
scene.add(farTrees.group);

// During the existing vegetation update:
// Set original tree cells visible only while their center distance is < 108 m.
farTrees.update(camera); // A world-space Vector3 is also accepted.

// During teardown; shared source geometry and materials are retained.
farTrees.dispose();
```

The returned API includes `group`, `pools`, `meshes`, `poolSize`, `nearDistance`, `farDistance`, `update`, and `dispose`. Each `update` returns counts for visible pools, active instances, changed pools, and copied instances. Repeating a camera position, or moving without changing any cell's selected membership, performs zero matrix uploads. Membership changes dirty only pools containing those cells. Active matrices are copied directly from Float32 snapshots; there is no decomposition, recomposition, or world-space rebasing. Optional per-instance colors are preserved; uncolored sources use white only when pooled with colored sources.

Source meshes must have identity local transforms, as the current forest's tree meshes do. Add the returned identity group in the same coordinate space as the source instance matrices and cell centers. `THREE.Camera` inputs resolve world position, including a parent transform; explicit Vector3 inputs must use the same coordinate space. Source visibility is intentionally ignored, and source matrices/visibility are never mutated. Rejecting duplicate source mesh objects prevents a cell-list mistake from duplicating trees. Material arrays, render order, and layer masks are kept separate when necessary.

Every pool sets `userData.kind = 'tree'`, `userData.dynamicInstances = true`, `userData.farPool = true`, `userData.lodLevel = 2`, `receiveShadow = true`, and `castShadow = false`. Original tree shadows already stop at 90 m, below the 108 m handoff. Geometry/material objects remain shared references. Disposal releases only the new InstancedMesh resources and detaches the pool group; it does not dispose shared geometry/materials.

## Measured 60 m / 80 m tradeoff

The following are **synthetic CPU frustum estimates**, not measurements from the production forest. The fixture has 3,808 trees, 1,024 20 m cells, and 7,248 source mesh batches. It uses 16 separate low-geometry/material combinations, nonuniform scale and rotation, and 48 camera poses. Wood and leaf batches count as separate mesh instances. Synthetic bounds use a 0.5 m margin for pooled meshes; the original-cell comparison uses its exact static bounds, so the baseline is slightly favored. The 60 m and 80 m choices use identical margins.

| Batching | Allocated far pools | Mean visible far draws | Peak visible far draws | Mean submitted mesh instances |
|---|---:|---:|---:|---:|
| Original 20 m cells | — | 662.646 | 776 | 698.375 |
| 60 m pools | 1,506 | 166.125 | 191 | 813.688 |
| 80 m pools | 864 | 119.229 | 170 | 840.875 |

80 m pools reduce mean far draw calls by **28.23%** versus 60 m while submitting **3.34%** more mesh instances. Against original 20 m cells, the synthetic 80 m case reduces mean draws by **82.01%** while submitting **20.40%** more instances because larger pool bounds intersect more frusta. This is the expected draw-call versus frustum-rejection tradeoff. Production triangle cost depends on the actual geometry mix and poses; this leaf makes no browser or FPS claim.

Both sizes retain exactly **487,424 bytes** of source matrix snapshots, in addition to equally sized dynamic instance-matrix buffers. Geometry and material memory is shared. Optional instance colors add separate snapshot/upload arrays only to pools that need colors.

## Validation evidence

- Strict TypeScript compilation: passed with `tsc --strict --noEmit` against the installed Three.js types.
- 20 synthetic selection states across both pool sizes: **43,168 expected matrix instances**, each appearing exactly once with byte-identical matrix values and the correct geometry/material/color.
- **1,036,032 transformed geometry vertices** verified inside selected-pool boxes, spheres, and full-source bounds.
- Distance tests include exactly 108 m (included), immediately below 108 m (excluded), exactly 250 m (excluded), immediately below 250 m (included), negative coordinates, distant empty states, and camera height changes.
- Repeated selections do not increment instance-buffer versions or recopy matrices. Source mutations after construction do not alter the stored snapshots. Parented camera world position, duplicate-source rejection, identity-transform validation, and idempotent disposal are covered.
- All checks use synthetic in-memory geometry. No production geometry, material, matrix, Site code, or runtime lifecycle was modified by the helper audit.

Re-run the audit with `node /workspace/scratch/46479389b383/crown-audit/far-pools/audit.mjs all`. The exact per-view measurements are in `tradeoff.json`, and aggregate correctness results are in `evidence.json`. The TypeScript configuration is `tsconfig.json`.
