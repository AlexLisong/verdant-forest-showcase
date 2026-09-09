# Final lamina correctness audit

**All 24 variants pass.** This audit covers the eight production seeds at leafScale 1.2, density 2.7, medium leaf multiplier 1.60, low multiplier 2.20, and the current high-detail mix of curved eight-triangle leaves and four-triangle juvenile leaves.

Source: `/workspace/sites/verdant-forest/app/forest/trees.js`

SHA-256: `d78a8f71602cc20b650b28fd9d158c4ec4738c10630583a2d19dc761aa31e475`

Measured **3,488,112 indexed triangles** across 48 wood/leaf geometry objects. There are zero non-finite attribute values, mismatched attribute lengths, invalid indices, zero/non-unit normals, degenerate triangles below 1e-12 square metres, invalid leaf UVs, or vertices outside their own bounding box, sphere, returned height, or returned radius. Normals were checked to 1e-4 length tolerance and bounds to 1e-6 m. Every returned height is at most 26 m.

All **184,134 retained medium/low leaf bases** match their high-detail anchors with exactly zero coordinate difference. Complete woody path/radius hashes are identical across all three levels in each family. The official, uninstrumented oak 215 high variant also matches the audit's exact triangle count, leaf count, height, and radius.

| Seed | Species | High triangles | Medium triangles | Low triangles | High leaves |
|---:|---|---:|---:|---:|---:|
| 215 | oak | 359,704 | 76,700 | 20,924 | 48,154 |
| 1034 | beech | 347,028 | 73,743 | 19,939 | 46,601 |
| 1853 | oak | 336,170 | 71,614 | 19,477 | 45,048 |
| 2672 | birch | 346,672 | 73,494 | 19,717 | 46,601 |
| 3491 | oak | 336,580 | 71,779 | 19,579 | 45,048 |
| 4310 | beech | 347,028 | 73,725 | 19,921 | 46,601 |
| 5129 | oak | 337,088 | 71,882 | 19,616 | 45,112 |
| 5948 | birch | 335,493 | 71,138 | 19,101 | 45,096 |

This is a static geometry and LOD-alignment check. It makes no rendering or performance claim and does not replace shader-wind margins or the parent's union bounds for shared LOD culling. No Site, Git, hosting, browser, native-render, or prior-evidence changes were made. The new evidence JSON was compacted without removing data when the shared filesystem filled.

Evidence: `evidence.json`. Reproduce with `node /workspace/scratch/46479389b383/crown-audit/final-lamina/audit.mjs`. Revalidate using `verify.mjs geometry`, `verify.mjs lod`, and `verify.mjs bounds`; these checks reject a changed Site source hash.
