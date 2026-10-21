# Standard character browser proof 72

Frozen whole-character standard glTF mobile derivative. Exact asset identity, standard-export provenance and lossless repository transport are recorded in runtime72.json. The browser test measures this asset, not an earlier representative or discarded prototype. Lower groom density is an intentional screen-scale LOD tradeoff; the fixed corrective basis is validated for the accepted finite walk, not arbitrary future motion.

## Reuse and standard runtime

This retains the existing package70 plain HTML/CSS, standard Three r160 GLTFLoader/OrbitControls/AnimationMixer route, and established Playwright 1.57.0 sandboxed launch. There is no framework, custom skin shader, shader patch, vertex-frame cache or dynamic position/morph-buffer upload. Source materials loaded by GLTFLoader are not replaced. Lighting is the existing small diagnostic hemisphere/directional setup, not material-fidelity acceptance. Frustum culling is disabled for character meshes so the whole workload is drawn instead of accidentally culled by rest-pose bounds.

Baseline r160 is kept for compatibility with the established app rather than silently upgrading. The optional unmodified MeshoptDecoder shipped with r160 loads only if the asset declares `EXT_meshopt_compression`. It is never requested for an uncompressed GLB. `KHR_meshopt_compression` requires a reviewed newer loader/decoder baseline and fails explicitly here. Other unsupported required extensions must be resolved before this becomes a production loader. Licenses and exact vendor hashes are preserved.

Primary APIs: [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [renderer info and reset](https://threejs.org/docs/pages/WebGLRenderer.html), [AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html). Only standard APIs are used. The baseline source is [Three r160](https://github.com/mrdoob/three.js/tree/r160).

## What is measured

- Cold browser context, disabled HTTP cache, blocked service workers, no-store responses, localhost-only frozen file allowlist. CDP records each request, cache status, encoded transferred bytes and completion. Resource Timing records encoded/decoded body sizes. One GLB fetch only: official validation is a separate offline CI step, never an in-app duplicate download.
- Navigation-relative fetch start, response headers, body completion, SHA verification, GLTFLoader parse and scene-ready stages.
- First character render submission, synchronous framebuffer confirmation of non-background pixels, and the next rAF presentation opportunity. These are explicitly not physical display/scanout timestamps. Pixel readback includes its synchronization cost.
- First standard animation pose change rendered after a trusted Play click, distinct from merely activating the time-zero correction. Event-to-submit and handler-to-submit timings are separate.
- Exactly thirty seconds of repeated finite playback. Each submitted frame has its own reset renderer.info calls/triangles, rAF interval and CPU animation-update/render-submission time. Raw series plus median/p95/p99 are retained. No cumulative counter is mislabeled as per-frame work or GPU time.
- Trusted Play, Pause, Reset and Orbit event-to-render latency. Orbit must change the camera; Reset must restore all initial transforms and zero morph weights. Next-rAF opportunities are not presentation guarantees.
- Runtime errors, GL errors/context loss, finite snapshot transforms, unchanged geometry/morph attribute versions and byte hashes, and paused idle rendering.

No screenshots, geometry hashes, framebuffer readback or expensive report serialization occur during the thirty-second series. The controller polls one boolean every 250 ms. UI refresh and the actual animation/render submission remain part of the workload. Long-task observations are reported, not treated as a hardware benchmark.

Default conditions retain the previous narrow viewport (390×844, DPR 1), 40 ms synthetic network latency, 1.25 MB/s download, and 2× CPU throttling. The report records whether these settings applied; unsupported application fails instead of pretending it was measured. Sandboxed ANGLE SwiftShader is desktop software rendering, not an iPhone GPU, Safari test or real cellular transfer.

## Before an authorised runner test

1. Supply only an audited self-contained standard Blender GLB, sets its local filename/bytes/SHA-256 in runtime72.json, and verifies exact clip/duration. Do not copy a private directory recursively.
2. Use the established Node 24.19.0 runtime, then `npm ci --ignore-scripts --no-audit --no-fund` and `npm test`.
3. Run the separate official Khronos validator against the frozen GLB. Review all warnings; do not suppress issues. This app does not replace that gate.
4. `node freeze72.cjs` verifies official vendor bytes and emits the explicit serving allowlist. Review the generated proof-inputs72.json.
5. Only in the authorised sandbox-capable runner: install the pinned Chromium with Playwright, then run `timeout 300s node capture72.cjs`.

The capture refuses unsafe/no-sandbox browser flags and all unexpected network requests. It never publishes, dispatches a workflow, uploads data or retries a failed test. Outputs are results72/browser-result72.json, frame-samples72.json and three hash-checked PNGs, also emitted via bounded log markers. A failure preserves diagnostics. No thresholds in this harness claim acceptable phone performance; engineering acceptance uses the measured conditions and separate visual review.

## Prior representative evidence

Run 39535430979 passed the official Khronos compatibility proof for asset 6763ef3a. Its 3,299 ms Play/Pause wall segment and 2.0295-second animation timer proved state advancement, not thirty-second stability. Draws 100→250 were cumulative; mesh statistics were 131,408 triangles. Its ready diagnostic timed out internally after five seconds and is not a first-visible timestamp. The GLB was fetched twice, separately by loader and validator. Do not repurpose those measurements as this cold-load/per-frame proof, and do not relabel the earlier failed run.

## Audited standard postprocessing

The generator gate also accepts glTF-Transform v4.5.1 only when the frozen asset manifest explicitly records the original Blender exporter, SHA-256 of that exported generic runtime asset, and @gltf-transform/core 4.5.1 postprocessor. This does not claim glTF Transform is Blender or accept custom GLB writers. Both generator and provenance are retained in the browser report. Original exported geometry and compressed runtime must have separate decoded deformation/normal audits before publication.

## Texture and expression checks

KHR_texture_basisu uses the unmodified official Three r160 KTX2Loader and its pinned Basis transcoder, loaded only when required. Texture transcoding uses standard loader workers and no custom shader. Exact vendor hashes are checked before serving. Five standard generic facial clips are selectable alongside the accepted finite walk. Whole-character plant/bend/release/extension and neutral/JawSmile close-up screenshots are captured only after the thirty-second timing series; they do not contaminate that series. These images remain subject to independent artistic review.

The production-oriented viewer caps rendering pixel ratio at 1.5 while retaining CSS dimensions, bounding high-DPR phone fill cost. The default automated proof remains DPR 1, and the report records both device and effective ratios; it does not extrapolate a phone frame rate.

Published model filenames include their content hash, and the model request permits browser caching for repeat visits. Runtime configuration stays fresh. The automated cold-load proof still disables browser cache and serves no-store responses, so this does not conceal first-visit download cost.
