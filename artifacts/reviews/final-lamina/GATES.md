# Gates: final lamina asset correctness

Scope: Read-only audit of the current eight production seeds, high/medium/low, leafScale 1.2, preserving all prior evidence.

- [x] G1: All 24 variants have finite attributes, valid unit normals and indices, nondegenerate triangles, and valid UVs.
  CHECK: node /workspace/scratch/46479389b383/crown-audit/final-lamina/verify.mjs geometry
  EXPECT: GEOMETRY_PASS 24 variants
  EVIDENCE: GEOMETRY_PASS 24 variants

- [x] G2: Retained medium/low leaf bases and complete woody paths remain identical to high detail across all eight families.
  CHECK: node /workspace/scratch/46479389b383/crown-audit/final-lamina/verify.mjs lod
  EXPECT: LOD_PASS 8 families
  EVIDENCE: LOD_PASS 8 families

- [x] G3: All geometry bounding boxes/spheres and returned height/radius conservatively enclose their geometry.
  CHECK: node /workspace/scratch/46479389b383/crown-audit/final-lamina/verify.mjs bounds
  EXPECT: BOUNDS_PASS 24 variants
  EVIDENCE: BOUNDS_PASS 24 variants

- [x] G4: Record exact counts, current source hash, scope, and reproducible evidence in a concise report.
  EVIDENCE: REPORT.md records the current source hash, all 24 exact triangle totals, 184134 retained anchors, static-check scope, and reproducible evidence; no native renders or prior evidence changes.
