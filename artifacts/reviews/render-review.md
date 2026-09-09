# Rendering integration review

Reviewed engine.ts, materials.ts, volumetrics.ts, geometry-memory.ts, compact-grass.ts, vegetation.ts and trunk-life.ts against installed Three 0.180.0. Read-only Site access; all scripts/results below are scratch files. No browser performance claim is made.

## Concrete findings

1. **P1 — abort during compileAsync can throw asynchronously and strand initialization.** engine.ts72 installs immediate disposal on abort; engine.ts95 awaits Three compileAsync. Three WebGLRenderer.js1417–1424 later runs a timer that blindly calls `properties.get(material).currentProgram.isReady()`. Material disposal removes those properties (1050–1068). Executing the actual extracted Three implementation with real WebGLProperties reproduces `Cannot read properties of undefined (reading 'isReady')`, outside the original Promise executor; initialization remains pending. Startup context restoration also replaces this property store. `compile-abort-proof.mjs` reproduces it without WebGL. `minimal-lifecycle.patch` replaces the asynchronous precompile with synchronous compile; the parent can instead implement guarded deferred disposal if asynchronous startup is required.

2. **P2 — wind deformation exceeds CPU culling bounds.** vegetation.ts28 adds only 0.02m to the wood union. Numerical evaluation of actual generated vertices and the production wind equations found oak-wood-215 extending 0.08419m outside that already-padded sphere. Fern and shrub shapes have no wind allowance before instance bounds are computed (vegetation.ts146), with maximum sampled excesses 0.04610m and 0.04642m. Three Frustum.js148–160 uses these undeformed bounds for camera and shadow culling. This is a confirmed under-bound, with edge popping a potential visible consequence, not a browser-observed screenshot defect. Use a 0.22m wood allowance; for fern/shrub, pad each geometry once before instance bounds by `max(0,maxY) * (.38 or .24) * hypot(1.36*.13,.068)`. The ivy leaf/stem geometries in trunk-life.ts68–69 likewise need a wind allowance when their spheres are computed. `wind-bounds.mjs` and `wind-bounds.json` contain the actual sampled witnesses.

3. **P2 — warm-up compiles the wrong color pipeline.** engine.ts95 precompiles with the default framebuffer active. WebGLPrograms.js165–173 and202 select ACES+sRGB for that state, while volumetrics.ts87 renders the real scene to a linear HDR target. Three recompiles those materials on first render. This does not corrupt final color, but creates avoidable programs and defeats that warm-up. Compile with sceneTarget active if retaining an explicit warm-up. The depth and fullscreen materials are also outside Three's scene material traversal and are only first-used at post.render.

## Confirmed integration behavior

- `packing-proof.mjs` exercises actual WebGLAttributes: Int16 normals and Uint16 colors are float shader inputs with normalization; Float16BufferAttribute UVs upload as HALF_FLOAT and round-trip correctly. Compact grass retains all InstancedBufferAttribute flags, matching counts, divisors of one, and shared placement arrays across LODs.
- Standard/depth wind uses the same generator and unique per-kind cache keys. Tree wood and ivy stems use the same wood wind helper for visible and depth materials.
- Three resolves scene color and depth MSAA at the end of renderer.render (WebGLRenderer.js1659–1664; WebGLTextures.js2150–2169). Both attachments use matching dimensions; no missing depth resolve was found.
- HDR tone mapping occurs once at composite-to-screen; Three disables renderer tone mapping for the intermediate render targets. The Uint8 fallback does clamp HDR values, an intentional limitation to disclose only if fallback behavior becomes relevant.
- Context restore after initialization reinstates shadow map settings and rebuilds GPU resources through Three; the application requests a fresh shadow render. The startup compile race is the specific lifecycle defect.
- Fern/shrub LOD instance compaction preserves a conservative static population sphere apart from missing wind padding; changing the active subset does not require shrinking or recomputing it. Tree LOD geometry spheres already use a union across levels; grass uses a shape union, per-patch root bounds and additional padding.

## Measured coarse memory

Fresh scratch construction reproduced **212,026,886B** of retained geometry/instance ArrayBuffers, excluding textures, browser/driver overhead and render targets. This is a CPU retained-buffer measurement; GPU upload depends on visibility and navigation history.

| Category | Bytes |
|---|---:|
| Tree high leaves | 60,518,020 |
| Tree high wood | 4,108,472 |
| Tree medium leaves | 23,078,128 |
| Tree medium wood | 2,837,880 |
| Tree low leaves | 7,610,872 |
| Tree low wood | 886,396 |
| Grass geometry and instance data | 35,199,744 |
| Fern geometry and instance data | 23,431,860 |
| Ivy leaves | 13,405,392 |

Reusing the existing medium leaf geometry for coarse LOD0 while retaining high wood removes 60,518,020B (28.5% of all coarse buffers), with a close-leaf-detail tradeoff. For unchanged macro leaf quality, generate and evict high leaf variants according to the nearby variant set. Removing high wood saves only 4,108,472B and directly degrades trunk/branch inspection. `profile.json` and `tree-profile.json` record all source-derived counts. These are options for the parent, not changes made by this review.

## Boundaries

No WebGL browser run, FPS measurement, Site source modification, Git operation, publishing or lifecycle operation was performed. No guaranteed device-compatibility claim follows from these source/native checks. Format-specific float MSAA support is not proven by a driver's global maxSamples, but no failing device was available, so this is not listed as an observed defect.
