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

## Alpha/depth diagnostic (iteration 13)

Only brow material BLEND changes to MASK with alphaCutoff 0.5; the entire BIN chunk is unchanged from12. A small replacement header reconstructs the exact31,190,888-byte GLB from12 chunks during CI, verified SHA-256 42e3d3a0cc0d42b9d94b05b2a62de1178613423dbb4aa1f73754867f89167019. Camera, lights, colour and roughness are unchanged.

## Source-fitted brow cards (iteration15)

All2,735 source curves are represented in64 local cards with128 brow triangles and two2048-square atlases. Total249,152 triangles;35,345,140 bytes; SHA-256 8e6911c9bfc9f2cc44abc57f3f2cb30ebfb7b4adff056efca825083d9334839e. Reconstructed from unchanged09 BIN payload, replacement header and5,677,244-byte suffix. Projection residual median0.545mm,p952.13mm,max9.28mm: glancing silhouette loss is a known limitation. This larger-file/lower-triangle diagnostic adds a75-degree glancing view; camera and lights stay fixed. No appearance or mobile-performance approval.

## Placement correction16

15 had an incorrect identity transform and is not a valid card-fidelity test.16 only restores the source brow node translation; all BIN data, atlas textures and materials remain identical. Strict overall-model framing guard restored. Exact35,345,220-byte model SHA-256 cf910551ab600c6d1334fe417cd5059f4044e917f39a5ec43fcb3d3f87a52bd0.

## Source-following ribbons17

All2,735 source curves represented individually with66,441 brow triangles,315,465 total. Original below50k target missed; revised80k diagnostic budget passed. No atlas; source13 MASK0.5/roughness0.35 and full-mixture vertex colours. Exact33,451,932-byte SHA-256 4cbe74db46e47a2b816d2c126481cec273972c65bfd0d544939d73bf78065d2a. Source centerline/radius/linearRGBA interpolation errors bounded by0.04997mm/0.001996mm/0.019986. Strict source and overall bounds passed. Edge-on width loss is a known risk, evaluated at both75-degree views. Appearance and mobile performance unapproved.

## Source hat18

Original hat geometry and UVs retained with three2048 composed maps; KHR specular/IOR, omitted source sheen.22,432 added triangles,337,897 total;47,647,900bytes; SHA-256 e6a03bc8b8f573142e04ac886fe5732b545890cc7559910018aa7e90865d36ee. Native reference already shows lighter/flatter shading, not fidelity-approved. Header+hat suffix reuse exact17 BIN. Explicit source18 bounds [[-0.13972650468349457, 1.45891173183918, -0.13773080246869823], [0.13972605764865875, 1.880686596688355, 0.17094007777084727]] define center and camera distance 0.801771719833492m at34-degree FOV; bounds checked before capture. Camera fit expands deliberately for hat crown/depth, lights unchanged.

## View-facing under-chin patch23

Exact18 GLB unchanged. Isolated module SHA-256 a9ed72e154900d49d8c8a3671ccc81b6da9a646ce09c80be5feceeac9bb287b7;918,356-byte buffer SHA-256 a4eaae5af5b1ce03fa6a751eda2151f318c6137285bccdde530d11961bfc1840.602 full-length source curves,15,031 triangles; custom view-facing vertex expansion with source vertexRGBA and alphaHash. Not a standaloneGLB or full beard. World-to-local camera uniform handles pivot orbit. Five fixed views plus44/46-degree orbit samples; synchronized render wall costs via gl.finish are software diagnostics, not mobile benchmarks. Native masks include surrounding beard occlusion absent here, so no direct opacity-parity claim. No appearance approval.

## Selected source head groom24

All37,873 curves from the selected beard, beard-messy, scalp-hair, hair-messy and eyelash source components and571,676 source points retained; no decimation or LOD.1,034,814 added groom triangles,1,372,711 total.26,043,251-byte gzip SHA-256 12140bb3080bb81f354a05a8c94bcd462f5a8295f46d526cc93b6c402c9a6aed,62,725,272-byte decoded SHA-256 dee778cc5bdd6e6aa298af3c80647400a3a9dac2421acb14125b2457062fb60e. Immutable module SHA-256 adc30fa229e809ca58ddd4d966c088e861bb9980c9f880bc3dd78d308d9693d2. Four chunk fetches become a temporary Blob URL; original module checks compressed+decoded hashes. Replaces23 patch on unchanged18 base/camera. Five fixed views, bounded orbit and patch on/off diagnostics;480-second script budget within10-minute standard runner job,60-second per-render/screenshot budget. No silent source reduction; budget failure is reported. Native matched front is feasibility evidence, not source shader parity or mobile approval.

## Controlled alpha pipeline25

Exact24 selected head-groom buffer and18 base. Module SHA-256 4a45701a59ecec9bd4efcd26947fb744bbc745049d9fe8bfb98807eebdc08bfa. Only alpha pipeline changes: hash baseline versus actual MSAA alphaToCoverage+NoBlending. Samples/SAMPLE_BUFFERS checked per observed draw target; zero-sample targets fail. Front/+45 repeated same-pose raw-pixel measurements report coverage proxy against groom-hidden render and local Laplacian grain, not source opacity. No fidelity or mobile approval.


Iteration26 adds source-sampled jaw, smile, brow and blink with midpoint/interaction corrective deltas, plus embedded source oral maps. Exact18 base and24 full groom remain unchanged. Generic Einar Rig © Blender Foundation / Blender Studio, CC BY4.0; modifications are source-sampled runtime deformation and portable PBR oral export. CPU-heavy diagnostic, incomplete rig, no mobile performance approval.

Scope clarification: groom24 excludes the separate authored moustache, ear/nose hair and face/hat fuzz. Version24 also excludes oral meshes and has no functioning rig or animation. Version26 adds oral meshes and four experimental facial controls; it does not add those excluded groom components, body or a full rig.
