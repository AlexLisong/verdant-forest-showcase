# Crown LOD audit

The current tree generator passes the geometry, attachment, and LOD alignment checks for all eight requested seeds at leafScale 1.2 and density 2.7. No geometry correctness patch is needed. Site source was read only; no Site, Git, hosting, or browser changes were made.

Source: `/workspace/sites/verdant-forest/app/forest/trees.js`  
SHA-256: `bcf13d3c7ddff53d5a5e88489a3bf35386a6ccc159d6fdca5d4b392c60083257`

Measured 2,073,595 indexed triangles and 2,904,529 vertices across 24 variants (48 geometry objects). All position, normal, color, and UV values are finite; all attribute counts agree; every index is valid. No zero normals, non-unit normals beyond 1e-4, degenerate faces below 1e-12 square metres, invalid leaf UVs, or vertices outside their own bounding box/sphere/returned height/radius were found. Wood UVs intentionally repeat outside [0,1].

All 189,516 retained medium/low leaf anchors match the corresponding high anchor with **exactly zero coordinate difference**. All complete woody path traces are also identical across LODs, confirming that thinning preserves the random sequence and scale. Medium retains every third leaf; low retains every sixth.

The audit traced 11,035 wood paths and 18,876 centerline segments. Every branch starts on an earlier path (maximum distance 1.8e-15 m). There are no exact duplicate paths, individually closed paths, or unattached starts. An exhaustive bounding-sphere broad phase followed by 87,732 segment-distance checks found no centerline intersections away from branch origins within 1e-7 m. This establishes an acyclic centerline structure for the checked seeds; it does not claim that thick tube surfaces never overlap, since legitimate branch junctions require overlap.

| Seed | Species | High wood + leaves = total | Medium wood + leaves = total | Low wood + leaves = total | High leaves |
|---:|---|---:|---:|---:|---:|
| 215 | oak | 22,628 + 144,464 = **167,092** | 12,492 + 64,208 = **76,700** | 4,872 + 16,052 = **20,924** | 48,154 |
| 1034 | beech | 20,824 + 139,806 = **160,630** | 11,607 + 62,136 = **73,743** | 4,405 + 15,534 = **19,939** | 46,601 |
| 1853 | oak | 22,218 + 144,464 = **166,682** | 12,306 + 64,208 = **76,514** | 4,749 + 16,052 = **20,801** | 48,154 |
| 2672 | birch | 20,468 + 139,806 = **160,274** | 11,358 + 62,136 = **73,494** | 4,183 + 15,534 = **19,717** | 46,601 |
| 3491 | oak | 22,628 + 144,464 = **167,092** | 12,477 + 64,208 = **76,685** | 4,857 + 16,052 = **20,909** | 48,154 |
| 4310 | beech | 20,824 + 139,806 = **160,630** | 11,589 + 62,136 = **73,725** | 4,387 + 15,534 = **19,921** | 46,601 |
| 5129 | oak | 22,628 + 144,464 = **167,092** | 12,453 + 64,208 = **76,661** | 4,833 + 16,052 = **20,885** | 48,154 |
| 5948 | birch | 20,468 + 139,806 = **160,274** | 11,358 + 62,136 = **73,494** | 4,183 + 15,534 = **19,717** | 46,601 |

One integration caveat needs attention if the scene uses a shared culling bound: the high-LOD bound is not a conservative bound for the enlarged lower-LOD leaves. Oak 215 grows from radius 7.4222359745 m at high detail to 7.5397415079 m at low detail (+0.1175055334 m). Birch 5948 grows from height 19.1708374023 m to 19.2604427338 m (+0.0896053314 m). Each LOD's own bounds are correct. Use the union of the three LOD geometry bounds (and any wind margin) wherever the scene caches one bound for the family. This is a caller-level condition, not evidence that the current scene culls incorrectly; scene integration was outside this leaf's read scope.

Visual inspection covered eight full-crown views, eight wood-only views, and all three levels of oak 215. The crown silhouettes vary and the oak leaders do not rejoin into closed loops. The most recognizable repeated design is the isolated leafy lower limb: every oak has two, and every beech/birch has one. If repeated placement is visible in the final forest, vary this count and the vertical gap per seed. No variation patch was applied or proposed as necessary, because it is a design tradeoff rather than a geometry failure. The low-LOD crown has visibly coarser leaf granularity and less fine infill at the same large screen size; it should remain restricted to distant trees.

The previews use exact exported geometry with native EGL/llvmpipe, an orthographic view, simple double-sided vertex-color lighting, and no production bark shader, wind, or scene lighting. They are asset inspection images, not browser screenshots or evidence of final rendering performance.

- `all-crowns.png`: all eight high-detail crowns.
- `all-wood.png`: all eight wood skeletons.
- `lod-215.png`: high/medium/low oak 215 at comparable scale.
- `evidence.json`: all per-geometry measurements, family alignment, and topology evidence.
- `audit.mjs` and `intersections.py`: regenerate evidence from current Site source.
- `verify-evidence.mjs`: validate evidence and reject stale source hashes.

Parent verification: run `node /root/.codex/skills/remote-skills/skill-6a85d7265c048191848205af6d732ddd/scripts/gate-check.mjs --status /workspace/scratch/46479389b383/crown-audit/GATES.md` and `node /workspace/scratch/46479389b383/crown-audit/verify-evidence.mjs spotcheck`. The spot check generates official, uninstrumented oak 215 high detail and compares exact counts and bounds.
