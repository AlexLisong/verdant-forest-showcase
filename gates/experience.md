# Gates: rendering and exploration
- [x] E1: Shader programs compile with shadow, fog and wind support.
  EVIDENCE: 27 native programs compiled from production shader hooks, including instanced/non-instanced plants and attached surfaces, depth wind, sky and particles. This validates exported GLSL, not the disabled browser GPU.
- [x] E2: Desktop controls move and look reliably, with focus reset; mobile touch controls support movement and look.
  CHECK: node scripts/audit-controls.mjs
  EVIDENCE: Nine deterministic source/DOM-event behavior checks passed; live browser graphics performance is not claimed.
- [x] E3: Scene lifecycle disposes resources; resize, context errors and reduced motion handled.
  EVIDENCE: Source review against installed Three identified and fixed compileAsync disposal race and HDR warm-up target mismatch. Abort/context cleanup, ResizeObserver, reduced motion, visibility timing reset and custom depth/LOD resource disposal are implemented. See artifacts/reviews/render-review.md and engine.ts.
- [x] E4: Multi-view screenshots inspected and concrete visual issues fixed.
  EVIDENCE: All 71 native scene-data views inspected via five survey contact sheets and two detail contact sheets; they are not browser screenshots. PLAN.md records crown/fern/shrub, moss scale, terrain contact, material, sky, shadow and foliage-placement corrections. Motion review covers653 adjacent pairs across the360-frame trail and296valid stationary frames, with mild shadow stepping and no major pop in inspected outliers. Final-source wind-phase images supplement this older-iteration sequence.
