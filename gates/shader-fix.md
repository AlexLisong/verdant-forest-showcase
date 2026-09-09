# Gates: Forest shader startup repair

Scope: Reproduce the deployed shader compilation failure, repair it without losing forest features, validate WebGL-compatible shader sources, and publish the same public Site.

- [x] G1: Reproduce and identify a concrete shader compilation failure in the existing source.
  CHECK: python3 -c "import json; r=json.load(open('artifacts/webgl-shader-results.json')); assert r['regression']['passed']; print('Original reserved patch rejected')"
  EXPECT: Original reserved patch rejected
  EVIDENCE: Original ground shader restored in memory is rejected with illegal use of reserved word patch; corrected version passes. See artifacts/webgl-shader-results.json.

- [x] G2: All affected material and postprocessing shader variants compile and link using GLSL ES 3.00.
  CHECK: python3 -c "import json; r=json.load(open('artifacts/webgl-shader-results.json')); assert r['passed']==r['total']==43; print('43/43 GLSL ES shader programs passed')"
  EXPECT: 43/43 GLSL ES shader programs passed
  EVIDENCE: 43/43 unmodified Three WebGLProgram GLSL ES 3.00 outputs compile/link in Mesa. Covers ground, standard/custom vegetation, instanced and single meshes, shadows, sky, particles, and all three postprocessing passes. Browser rendering and device performance are not claimed.

- [x] G3: Production build succeeds with the repaired shaders and useful error diagnostics.
  EVIDENCE: Sites build-site.mjs exited 0; all five Vinext build stages succeeded. Ground variable renamed and cache key advanced. Shader errors preserve program, vertex, and fragment driver logs and print sources for diagnosis.

- [x] G4: Corrected version is deployed successfully to the existing public URL.
  EVIDENCE: Sites deployment appgdep_6a9c499217508191b2f54188b23eab47 reported succeeded at 2026-09-05T16:55:57.123388+00:00 for https://verdant-forest.lexn8.chatgpt.site, saved version 2, source c362872993dc97074009999ae22b4f68d647867e. Existing public access preserved.
