# Standard-format representative proof 71

This package validates the representative, evaluated Blender export and opens it in the official Khronos glTF Sample Viewer. It is not a custom Three.js renderer and is not the discarded package70 path. The asset must be produced by Blender's maintained glTF exporter; authoring Blender files, source/control rigs and personal photos must never be copied here.

## Repeatable sequence

1. Package only the audited runtime GLB as standard lossless `representative71.glb.gz` for repository transport.
2. Set both compressed and decoded SHA-256/byte counts, plus source-verified clip/timestamp/camera names in `proof-inputs71.json`.
3. `npm ci --ignore-scripts --no-audit --no-fund`
4. `node restore-transport71.cjs`, then `node validate-gltf71.cjs representative71.glb validator71.json`
5. Review every validator warning. The CLI suppresses no issue codes and reports errors independently of the viewer's built-in validator.
6. `bash prepare-official-viewer71.sh`
7. `npx --no-install playwright-core install chromium`
8. In the authorized GitHub runner only: `node capture-standard-viewer71.cjs`

No renderer is run in the current cloud environment. The selected runner must support normal Chromium sandboxing. The harness refuses unsafe/no-sandbox flags instead of using them to obtain WebGL.

The gzip file is transport packaging, not a different runtime format or geometry compression. Node's built-in gunzip restores the original exporter GLB and verifies its exact SHA-256 before validation or viewing. The official viewer still loads a normal uncompressed GLB locally.

## Independent viewer provenance

- Official [Khronos Sample Viewer](https://github.com/KhronosGroup/glTF-Sample-Viewer), commit `97656b51ca86c973eb087ed1483012eaf0af55aa`.
- Its exact [Sample Renderer submodule](https://github.com/KhronosGroup/glTF-Sample-Renderer/tree/5650e2c8958801445ac0b38937a83984e3a6b278), commit `5650e2c8958801445ac0b38937a83984e3a6b278`.
- Official [Validator](https://github.com/KhronosGroup/glTF-Validator) npm `gltf-validator@2.0.0-dev.3.10`, integrity pinned in package-lock.json.
- Playwright Core `1.57.0`, retaining the established sandboxed Chromium/ANGLE SwiftShader launch.

The viewer's documented installation is its renderer submodule plus npm build. Its documented `?model=URL` argument loads this package's GLB from the same localhost HTTP server. The runner downloads upstream archives by exact commit and checks their SHA-256, checks both upstream npm lockfiles, and uses npm-ci. Upstream licensing and third-party notices stay with the downloaded source and generated bundle.

The small, checksum-verified application patch exposes existing view/state/canvas/UI references and adds an opt-in `standardProof71` configuration. In this mode, the official renderer's existing `useIBL=false` and `useDirectionalLightsWithDisabledIBL=true` settings provide directional illumination, the background environment is hidden, and the application does not request optional HDR preprocessing. No loader, shader, skinning, morphing or renderer algorithm is modified. Normal upstream behavior is unchanged without the query flag. Pristine `src/main.js` SHA-256 is `5edeb995790396c4685462baea4fd53fbe46ac2cb9ad1f0ca7a7e90000c2efca`; configured SHA-256 is `8088b12c9c4b9e5bdf01e36eb182578e144246bb3aa92751d2fded5581882555`. See the pinned [application setup](https://github.com/KhronosGroup/glTF-Sample-Viewer/blob/97656b51ca86c973eb087ed1483012eaf0af55aa/src/main.js) and [directional fallback](https://github.com/KhronosGroup/glTF-Sample-Renderer/blob/5650e2c8958801445ac0b38937a83984e3a6b278/source/Renderer/renderer.js).

Exact screenshot times use the existing AnimationTimer and GltfView APIs. Real UI Play, Pause and Reset are separately exercised; reset means clip time zero, distinct from neutral rest with all animations inactive. The corrected asset's embedded cameras are intended to match the source reference views and include the boots. The harness also supports explicit `cameraYfov` framing overrides if recorded in the manifest; such overrides never change camera transforms or geometry.

The pinned public model catalogue JSON and one default public HDR environment are cached during preparation; known requests are fulfilled locally during browser execution. In the configured proof mode, HDR preprocessing is not requested. No sample models are downloaded. Character data is never sent to a vendor viewer or a new service. Unexpected browser network dependencies are blocked and fail the proof. The optional Google font stylesheet is fulfilled empty; operating-system fallback typography does not affect character rendering.

The first browser run timed out at a combined model/environment readiness check. It did not record enough state to identify which predicate stalled. Expensive optional HDR filtering on software rendering is a hypothesis, not a confirmed cause. The bounded directional-light configuration removes that unnecessary workload for this neutral-material deformation proof; the startup wait budget remains 120 seconds. Startup diagnostics now record each readiness value, completed/pending request status, available WebGL status, canvas dimensions, UI text and console messages. Startup WebGL errors/context loss fail the proof rather than being silently consumed.

## Evidence and limitations

Output markers: `VALIDATOR71_RESULT`, `UPSTREAM71_BUILD`, `STANDARD71_STARTUP`, `STANDARD71_SNAPSHOT`, `RENDER_IMAGE_BEGIN/CHUNK/END`, `STANDARD71_RESULT` or `STANDARD71_FAILED`. Exact PNG hashes accompany image bytes. Files are also written to `standard-results71/`.

Checks cover format errors, visible drawing, real animated state changes, finite transforms and morph weights, WebGL errors/context loss, runtime exceptions, UI reset and unchanged return-to-rest state. Neutral, near-extension, plant, release and head samples are selected from source-verified times, not guessed. Screenshots are rendered directly by Khronos. Review these against original-source images before artistic acceptance.

This is a small representative proof, not full-character acceptance, not performance qualification and not an iPhone test. A synthetic GitHub Linux SwiftShader result cannot establish phone frame rate, phone compatibility or artistic fidelity. The local successful upstream build alone is not browser evidence. Diagnostic lighting differs from the source references, so compare silhouette/deformation rather than material color. The first published asset (SHA-256 prefix 178434ff) had a known failing jaw/smile transfer and is diagnostic only. The current candidate (6763ef3a) replaces that transfer using topology correspondence and widens the embedded cameras. Standard-viewer and independent visual review are still required; structural validation or correct export parity alone is not facial-deformation acceptance.

## Publication allowlist

Publish only these files to the already authorized `tim-a-wood/character-webgl-render-test` recipient:

- package71/representative71.glb.gz (after explicit decoded asset provenance/content audit)
- package71/proof-inputs71.json
- package71/package.json and package71/package-lock.json
- package71/validate-gltf71.cjs
- package71/restore-transport71.cjs
- package71/prepare-official-viewer71.sh
- package71/patch-diagnostics71.cjs
- package71/capture-standard-viewer71.cjs
- package71/README71.md
- .github/workflows/generic-head-render.yml

Do not publish the working directory recursively. Do not publish source/control rigs, Blender files, cached earlier packages, personal references, or node_modules. Upstream archives/builds/fixtures are fetched on the runner, not committed.

## Character attribution

Einar Rig © Blender Foundation / Blender Studio, licensed CC BY 4.0. Source: https://studio.blender.org/characters/einar/v1/ . License: https://creativecommons.org/licenses/by/4.0/ . This derivative contains a reduced representative surface, baked deformation joints, compact corrective morphs, and the accepted walk for diagnostic portability testing. It is not the original authoring rig or a complete production character.
