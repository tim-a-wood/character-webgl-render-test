# Generic Einar WebGL render test

A bounded, public, software-rendering proof of concept using a generic licensed Einar head-and-eyes export and a Three.js viewer.

## Asset attribution

Einar Rig (CC-BY) Blender Foundation | studio.blender.org

Source: https://studio.blender.org/characters/einar/v1/
License: Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/

Modifications: static head and upper-chest extraction, material baking and PBR conversion, mesh compression, and experimental eye colour-map correction. No endorsement implied. Hair, beard, hat, full body, mouth internals, rig and animation are absent. Browser lighting approximates the source; it does not reproduce Blender's native shader graph. Appearance quality remains experimental.

The four benchmark-09 binary chunks concatenate to a 29,666,452-byte GLB with SHA-256 6159e3ed8e4f7c92bf39ad82a1e7d5d33dcca099eacf89fb4919d84cba863642.

## Dependencies and notices

- Three.js 0.160.0 and addons: MIT; complete notice at render-poc/site/assets/THREE-LICENSE.txt.
- Draco decoder from the Three.js distribution: Apache-2.0; complete license at render-poc/site/assets/draco/LICENSE.txt. Source: https://github.com/google/draco
- Playwright Core 1.57.0 is installed from npm during the test, not vendored. Apache-2.0: https://github.com/microsoft/playwright/blob/v1.57.0/LICENSE

## Test boundaries

One standard public GitHub-hosted Ubuntu job, ten-minute timeout, no paid runner, cache or artifact uploads. The job refuses private repositories. Repository token is read-only and is not persisted in checkout. Chromium sandbox stays enabled. Unsafe SwiftShader fallback and security-bypass flags are forbidden. Only local viewer requests are permitted. WebGL or sandbox failure ends the proof of concept.

A screenshot is emitted as bounded base64 text in the workflow log with byte count and SHA-256. Completion requires verifying that payload and inspecting the actual rendered image. A passing load test does not establish appearance fidelity.

## Source-brow diagnostic (iteration 11)

The source-brow variant preserves the iteration09 binary prefix, materials and meshes and adds all 2,735 original Einar eyebrow curves as triangular-cross-section mesh strands. Its four benchmark-11 chunks concatenate to 31,143,104 bytes, SHA-256 7d69964ee59ec09c9f6ac552bf332415c21a9d19e82b68d358fd750f86bedceb. Total unique geometry is 497,022 triangles, of which 247,998 are added brow triangles. No personal likeness data is included.

This is a fidelity-first diagnostic, not a mobile-optimized asset. Source colour and root alpha are baked to vertex colours; strand cross-section, deterministic substitute for the original shader random seed, and omitted source shader-lobe mixes remain approximations. The inherited asset metadata's broad statement that groom is omitted predates this brow-only addition; scalp hair and beard remain absent.

The comparison fixes the camera, lights and model data while yawing a centered model pivot to 0 and +/-45 degrees. Timing readings are diagnostic wall-clock/submission measurements on a software renderer, not physical-device benchmarks. Renderer triangle draws may count multipass rendering and are distinct from unique geometry triangles.

## Controlled brow material comparison (iteration 12)

The benchmark-12 chunks concatenate to 31,190,872 bytes, SHA-256 073e15ac751f31d87b25090f64eff38b2776951dc1e091c8152bbf12ac55fd75. Only brow vertex colour and alpha change from 11, evaluating three-source-lobe colour/opacity mixing. All 132,204 brow vertex positions are identical; geometry remains 497,022 unique triangles. Directional BRDF and original random-seed behavior remain approximations. Camera, lights, roughness and eye optics are unchanged.
