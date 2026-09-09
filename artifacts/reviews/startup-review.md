# Startup construction profile

Snapshot: 2026-09-05T04:55:27.403Z. One fresh desktop forest was constructed with inert TextureLoader and the installed Three implementation. Source copies and SHA-256 hashes are in source/ and source-manifest.json. Instrumentation adds stage timers, per-tree wrapper timers, and Node CPU sampling.

**Concurrent native rendering affects these elapsed times.** Process CPU totals separate scheduled work from waiting, but include profiler overhead and process GC work. These are neither browser load-time nor GPU/FPS measurements.

## Construction stages

| Stage | Wall seconds | Process CPU seconds |
|---|---:|---:|
| ground | 1.528 | 0.787 |
| rocks | 0.136 | 0.116 |
| litter | 0.038 | 0.036 |
| mushrooms | 0.033 | 0.007 |
| vegetation | 54.881 | 30.973 |
| deadwood | 0.589 | 0.490 |
| forestDetails | 16.559 | 7.217 |
| finalPacking | 6.646 | 3.505 |
| Total | 80.445 | 43.146 |

The resulting scene contains 2002 trees and 2529528 grass clumps. Raw measurements are in profile.json.

## Vegetation stages

| Stage | Wall seconds | Process CPU seconds |
|---|---:|---:|
| treeBankAndPacking | 31.474 | 16.647 |
| treePlacementAndInstances | 0.524 | 0.456 |
| plantGrids | 0.004 | 0.005 |
| plantGeometryBankAndPacking | 4.763 | 2.780 |
| plantPlacementAndInstances | 18.116 | 11.085 |

## Individual tree builders

Each cell is wall / process CPU seconds. The bank includes all eight seeds at high, medium and low detail.

| Seed | Species | High | Medium | Low |
|---:|---|---:|---:|---:|
| 215 | oak | 2.745 / 1.142 | 0.915 / 0.343 | 0.333 / 0.243 |
| 1034 | beech | 1.419 / 0.831 | 0.701 / 0.375 | 0.396 / 0.208 |
| 1853 | oak | 2.356 / 0.940 | 1.599 / 0.978 | 0.256 / 0.188 |
| 2672 | birch | 1.993 / 0.817 | 0.532 / 0.244 | 0.415 / 0.197 |
| 3491 | oak | 1.093 / 0.568 | 0.468 / 0.232 | 0.333 / 0.162 |
| 4310 | beech | 0.881 / 0.445 | 1.215 / 0.476 | 0.326 / 0.205 |
| 5129 | oak | 0.685 / 0.590 | 0.610 / 0.534 | 0.210 / 0.165 |
| 5948 | birch | 0.400 / 0.360 | 0.243 / 0.214 | 0.194 / 0.163 |

Combined tree builders: 20.317 wall seconds / 10.618 CPU seconds.

## Immediate recommendation: direct packing loops

All embedded and final packGeometries calls together cost **19.724 wall seconds / 10.272 CPU seconds**, or 23.8% of process CPU. These calls are nested inside the stages above and must not be added to the total again. CPU sampling independently identifies packing as the leading application function; construction.cpuprofile and cpu-summary.json retain that evidence.

geometry-memory.ts uses Int16Array.from/Uint16Array.from with per-element mapping callbacks on large floating-point attributes. Replace them with preallocated arrays and direct indexed loops, keeping the identical clamp, Math.round and toHalfFloat operations. This removes iterator/callback temporary work without changing geometry or reducing fidelity. Cache sharing and the terrain UV exception remain unchanged. packing-loops.patch and geometry-memory-optimized.ts are scratch-only implementation suggestions.

One isolated comparison used one freshly generated high-detail oak (seed 215, wood and leaves) and one fern (seed 137), cloned into identical baseline/optimized inputs:

| Path | Wall milliseconds | Process CPU milliseconds |
|---|---:|---:|
| Current TypedArray.from callbacks | 725.564 | 615.573 |
| Direct loops | 173.606 | 134.261 |

In this single comparison, CPU time fell by a factor of 4.585. **This is not a measured whole-scene speedup.** The benchmark ran baseline before optimized; timing is subject to contention and ordering effects. No repeated campaign was run.

All 11 resulting attributes (9135442 bytes) and 3 index arrays were byte-identical across 3 geometries. Attribute constructor, normalization, itemSize and count also matched; packing accounting matched exactly. packing-comparison.json includes hashes.

A secondary source-backed opportunity is precomputing the seven constant deadwood cos/sin pairs in surfaces.ts7–12. insideDeadwood is called from the plant placement loop and accounts for 4.70% of CPU self samples. That change preserves the same floating-point formulas and placement decisions, but was not separately benchmarked because this task allowed one isolated comparison.

## Follow-up scene audit handoff

The parent requested plant-root/trunk-flare and sampled wind-bound checks after the single construction had already started. Its initial runner did not retain the scene after writing timings. I did not rebuild a second full forest. profile.mjs now has an optional post-measurement FOREST_AUDIT_MODULE hook receiving {scene, vegetation, details, THREE}; this allows those checks during the parent's next construction. Those follow-up checks were **not executed** in this profile, and are not claimed as passing. The captured source includes the parent's wood/fern/shrub/ivy wind padding and measured trunk-flare exclusion.

No Site source edits, browser activity, Git operations or Sites lifecycle actions were performed.
