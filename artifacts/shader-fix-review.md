# WebGL shader startup repair

The ground material declared a local float named `patch`, which GLSL ES 3.00
reserves for future use. The earlier test converted shaders to desktop GLSL
330 and removed precision qualifiers, allowing a WebGL-specific error through.

The runtime repair renames this local to `coverPatch` without changing the
expression or visual output, advances the ground program cache key, and retains
driver error logs and shader sources when a future compilation fails.

The regression harness uses the installed Three 0.180 WebGLPrograms and
WebGLProgram modules to generate GLSL ES 3.00 sources, including their original
precision declarations and prefixes. It records shaderSource calls, then
compiles and links those exact strings with Mesa. The recorder itself does not
claim compilation success. No browser or device FPS testing is implied.

Validation: 43/43 shader programs passed. Restoring `patch` in the ground shader
in memory causes the compiler to reject it with `illegal use of reserved word`.
Production build completed successfully. The scene geometry, lighting,
vegetation density, controls, textures, and postprocessing are preserved.

Run `node scripts/export-webgl-shaders.mjs`, then
`python3 scripts/compile-webgl-shaders.py --check-regression` with an EGL driver.
`FOREST_LIBEGL` and `__EGL_VENDOR_LIBRARY_FILENAMES` can locate non-system Mesa.
The native render scripts remain separate and are not WebGL acceptance tests.

Specification: https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf
Section 3.8, reserved keywords.
