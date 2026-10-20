# Iteration 61: optional local measurement of unchanged iteration 60

## Scope

This separate `package61/demo/` route imports the exact tested `package60/einar-walk60.js` runtime and the complete 41-key `package60/packed60/overlayManifest60.json` overlay. It does not change motion, appearance, lighting, geometry, the renderer, interpolation, frame caches, or the existing iteration 60 page. No iteration 58 GPU runtime or rejected iteration 59 optimization candidate is imported.

The measurement helper is a byte-identical copy of the parked iteration 59 helper. The demand renderer, player clock and startup handling are byte-identical copies from the full iteration 60 host. Changes are confined to the measurement host, presentation, documentation, and inclusion of the existing iteration 60 browser preview without changing its bytes.

## Use

1. Load the character, then load the body and upright walk.
2. Explicitly click **Measure this device**. There is no automatic measurement.
3. Keep the page visible. The helper prepares the first pose and then runs one finite pass. An eight-second timer limits the measured pass on a best-effort basis; synchronous JavaScript rendering can delay the timer. Preparation and state restoration can take additional time.
4. **Cancel measurement** and **Dispose character** remain available. Hiding the page or losing the WebGL context interrupts the run.
5. Read the summary or expand the raw details. Results remain in the page's memory. There is no measurement telemetry, storage, automatic upload or copy action.

## Measurements and limits

- Observed animation-frame callback intervals: not proof of presented frames.
- Renderer call-start intervals: measured between calls for this scene and camera.
- Synchronous `renderer.render` wall time: can include driver stalls; not GPU completion.
- Latest observed pose-apply wall time: sampled from the player's last update, not a complete trace of every update.
- Buffering duration/count: RAF-sampled estimates that may miss short waits.
- Fewer than ten interval or render samples is explicitly flagged as insufficient. Interrupted runs are identified as invalid completed measurements.

This is an observation UI, not a speed optimization, device FPS score, hardware certification, or claim of smoother motion. The included video is the unchanged, previously recorded iteration 60 browser preview; it does not measure the viewing device.

## Restoration

The helper restores the prior active clip pose or inactive reference, expression values, play/pause state and the renderer's original own-property descriptor (or inherited render method). The host additionally snapshots/restores camera position, orientation, up vector, zoom, orbit target, and controls state. Controls that could alter the scene are disabled during the run; Cancel and Dispose remain usable. A disposed character is not revived. An abort or disposal during state restoration cannot be reported as a valid completed result.

The original iteration 60 page and iteration 57 comparison remain directly linked. Credits are in `ATTRIBUTION.md`.

## Public test-only host

The public browser-test HTML omits the visual-reference video section and uses relative comparison links. The private viewer retains the unchanged preview. All measurement JavaScript is byte-identical. This public test does not deliver a preview video.
