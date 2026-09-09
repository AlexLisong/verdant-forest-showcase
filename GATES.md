# Gates: complete forest
Scope: Dense immersive real-time browser forest and public deployment.

- [x] G1: Complete woodland scene includes trees, grass, ferns, bushes, flowers, roots, deadwood, moss, rocks, soil, leaf litter and wind.
  EVIDENCE: Current app/forest modules and artifacts/memory-desktop.json: complete constructed scene with 3,808 trees, 2,529,528 grass clumps, 39,598 ferns, shrubs/herbs, surface moss, roots, deadwood, fungi and litter. Geometry construction and wind shaders validated; browser rendering limitation is recorded under G4.
- [x] G2: High visual density, irregular vegetation, coherent scale and lighting verified at multiple close and distant positions; defects iterated.
  EVIDENCE: Inspected 50 grid-direction views and 21 entrance/canopy/ground/detail views in artifacts/final-survey-sheet-1.jpg through -5.jpg and artifacts/final-details-sheet-1.jpg through -2.jpg, plus the bark-attached fungus macro. Final source-matched entrance, aerial, canopy, roots, deadwood and eight canopy/deadwood wind-phase images inspected by06:33UTC; selected images are preserved in artifacts/final-canopy-wind-contact.jpg. The earlier61-view iteration, elevated boundary fixes and653 adjacent-frame measurements are documented in PLAN.md. These are explicitly native scene-data renders, not browser screenshots.
- [x] G3: Smooth usable desktop free-camera and touch exploration, resize and recovery states.
  EVIDENCE: Nine deterministic controls checks passed in scripts/audit-controls.mjs and artifacts/controls-audit.json: movement, look smoothing, reset, bounds, focus loss, concurrent touch and cleanup. Resize/reduced-motion/context recovery reviewed in engine.ts. Live graphics/interaction performance is not claimed and remains blocked under G4.
- [ ] G4: Successful production build and measured rendering performance; no runtime errors in browser QA.
  EVIDENCE: Current production build passed at06:24UTC; live browser rendering/FPS cannot be measured because the provided browser reports GL_VENDOR Disabled / GL_RENDERER Disabled and context creation fails. Native shader and image QA is recorded separately.
- [x] G5: At least five hours of active implementation and iteration, with honest work timestamps.
  EVIDENCE: Conservative active work windows2026-09-05 00:17–02:12UTC and03:24–06:32UTC total303minutes (5h03m). The unverified02:12–03:24gap is excluded. Source checkpoints, timestamped implementation notes, native render sequences and audit records support the recorded work; no idle time was added to reach this gate.
- [x] G6: Exact source preserved, complete Site published publicly and terminal deployment verified.
  EVIDENCE: Public version1 uses pushed commit441d09da462c3a116d266831c19bb026459cfbe8. Native deployment appgdep_6a9bb8089f208191b69103212768dc02 succeeded at2026-09-05T06:35:03.428888+00:00. get_site confirms public access and current_live_url https://verdant-forest.lexn8.chatgpt.site. Complete exact IDs and archive hash are recorded in artifacts/deployment-evidence.json. Verification uses native Sites status, not an HTTP fetch of production.

ABANDON: G4 Live browser graphics/FPS verification is impossible in the supplied browser because WebGL is disabled. Source builds and native geometry/shader rendering checks do not substitute for that measurement.
