# Lower-growth variation patch

`lower-growth.patch` is ready for the parent to apply to `app/forest/trees.js`. The Site source remains unchanged by this leaf. This is a requested visual variation patch; the original generator had no geometry correctness defect.

A separate hash selects lower-limb retention with a 50% distribution over general seeds. It removes the isolated lower-leaf-lobe motif from exactly four of the eight actual seeds. A second hash selects sparse epicormic growth only on some cleared trunks. Main-crown generation runs before either decision, and a separate random source sets sprig heights and lengths. Short shoots extend through the local trunk surface, with only 16 physical leaves per shoot at high detail. Their foliage starts on the exposed outer segment.

| Seed | Species | Lower live limbs | Epicormic sprigs | High triangles | Medium triangles | Low triangles |
|---:|---|---:|---:|---:|---:|---:|
| 215 | oak | 2 | 0 | 167,092 | 76,700 | 20,924 |
| 1034 | beech | 1 | 0 | 160,630 | 73,743 | 19,939 |
| 1853 | oak | 0 | 0 | 155,978 | 71,614 | 19,477 |
| 2672 | birch | 1 | 0 | 160,274 | 73,494 | 19,717 |
| 3491 | oak | 0 | 0 | 156,388 | 71,779 | 19,579 |
| 4310 | beech | 1 | 0 | 160,630 | 73,725 | 19,921 |
| 5129 | oak | 0 | 4 | 156,644 | 71,882 | 19,616 |
| 5948 | birch | 0 | 3 | 155,109 | 71,138 | 19,101 |

All 24 candidate variants pass the full geometry, normal, UV, index, conservative per-LOD bounds, stable leaf-anchor, and branch topology audits. All main-crown positions, normals, colors, UVs, and indices match the original geometry **byte for byte** at all three LODs for every seed. `prefix-evidence.json` records the preserved geometry lengths, and `compare-prefix.mjs` regenerates that comparison. The candidate also has no duplicate or closed centerline path, no unattached branch, and no centerline intersection away from a branch origin within 1e-7 m.

The four changed seeds are 1853, 3491, 5129, and 5948. Oak 1853 and oak 3491 have clear lower trunks; oak 5129 has four small sprouts; birch 5948 has three. Seed 215 oak, 1034 beech, 2672 birch, and 4310 beech retain their original lower branches. The before/after sheet confirms the main crown silhouettes are unchanged, and the tiny trunk shoots avoid replacing the old motif with another isolated branch lobe.

Inspection files:

- `lower-growth-before-after.png`: all four affected trees before/after.
- `5129-trunk-before-after.png` and `5948-trunk-before-after.png`: closer trunk comparisons.
- `candidate/all-crowns.png`: full candidate lineup.
- `candidate/evidence.json`: candidate measurements.
- `candidate/trees.js`: complete candidate source (not copied into the Site).
- `lower-growth.patch`: minimal unified diff for parent integration.

Run `node /workspace/scratch/46479389b383/crown-audit/verify-patch.mjs` to revalidate the recorded candidate evidence. The parent owns the shared LOD-bound union fix; this patch does not change scene integration.
