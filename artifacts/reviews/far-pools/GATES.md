# Gates: far tree pools

Scope: Scratch-only far-tree InstancedMesh helper preserving original matrices/materials/low geometry and proven selection/bounds, plus 60m/80m CPU tradeoff measurements.

- [x] G1: Implement typed helper grouping cells by spatial pool, source material, and low geometry with exact source matrix snapshots and stable dynamic updates.
  CHECK: node /workspace/scratch/46479389b383/crown-audit/far-pools/audit.mjs correctness
  EXPECT: CORRECTNESS_PASS
  EVIDENCE: CORRECTNESS_PASS boundary cases, stable uploads, snapshot isolation, camera world position, disposal and input guards

- [x] G2: Prove half-open horizontal distance selection, exact matrix bytes, no duplicate instances, original per-instance colors, and conservative bounds across synthetic camera positions.
  CHECK: node /workspace/scratch/46479389b383/crown-audit/far-pools/audit.mjs selection
  EXPECT: SELECTION_PASS
  EVIDENCE: SELECTION_PASS 20 states, 43168 exact instances, 1036032 bounded vertices

- [x] G3: Compare 60m and 80m pools by visible CPU draw count and frustum overdraw estimates across identical deterministic data and camera poses.
  CHECK: node /workspace/scratch/46479389b383/crown-audit/far-pools/audit.mjs tradeoff
  EXPECT: TRADEOFF_PASS
  EVIDENCE: TRADEOFF_PASS {"views":48,"trees":3808,"cells":1024,"sourceMeshes":7248,"original":{"meanDraws":662.6458333333334,"peakDraws":776,"meanInstances":698.375},"pools":{"60":{"allocatedPools":1506,"meanDra

- [x] G4: Write integration/report notes covering matrix coordinate assumptions, update behavior, disposal, measured choice, and limitations.
  EVIDENCE: REPORT.md documents 80m choice from 48 synthetic CPU views, exact API/integration, 0.6m parent wind margin, shared-resource disposal, coordinate assumptions, and browser/FPS limitations. Strict TypeScript compile exited 0.
