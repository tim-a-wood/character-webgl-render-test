# Einar46 reference runtime

A small Three.js host integration for the tested Einar character reference. The independent demo loads the head first, exposes four facial controls, and downloads the dressed body and sampled wrist movement only when requested.

This is a heavy source-reference prototype. Physical phone performance, game-engine portability and full source-material fidelity have not been approved. It is not a general skeletal animation rig.

## Demo

From this directory, run a standard local static server, for example:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open http://127.0.0.1:8080/demo/ in your browser. Keep the manifest, runtime modules and dependency files at their supplied relative paths. Do not open it through file://. The manifest pins external generic model bytes to immutable revisions; an internet connection is required for those assets. No account credentials or user photos are part of the package.

Use Load character, then the jaw, smile, brow and blink sliders. Load body adds one continuous wrist-gesture slider. Head and Full body change framing. Reset restores neutral expressions, wrist zero and the current camera view. Dispose releases the character resources; Load character creates a new instance.

The reference host owns its renderer, scene, camera, controls and demand-render scheduling. Use createReferenceScene46 with a dedicated renderer: it installs the reference opaque sorting and restores the default comparator on disposal. The SDK owns character loading and deformation. The SDK must be disposed before its host renderer is destroyed. Initial loading returns an instance only after the promise resolves; initial network fetches are not abortable. A host that cancels during that stage should retain the pending promise, invalidate its generation, and dispose the eventual result rather than launching duplicate loads. The demo follows this pattern. Disposing an instance during body loading prevents late completion from resurrecting it.

This distribution contains code, dependency files and a pinned manifest. Model bytes are fetched from the immutable public generic test repository when needed; it is not an offline asset bundle.

## Public API

Import loadEinar46 and createReferenceScene46 from einar46.js. Pass an existing Three.js renderer, the package manifest URL, onChange and onProgress callbacks to loadEinar46. Await the returned character and add character.root to your scene. Use the supplied import map for Three.js r160; avoid mixing Three.js revisions.

```js
import {loadEinar46, createReferenceScene46} from './einar46.js';
const reference = createReferenceScene46(renderer);
const character = await loadEinar46({
  renderer,
  manifestUrl: new URL('./manifest.json', import.meta.url).href,
  onChange: () => scheduler.invalidate('character-change'),
  onProgress: progress => console.log(progress)
});
reference.scene.add(character.root);
character.setExpressions({jaw: 0.3, smile: 0.5, brow: 0, blink: 0});
// Only after an explicit body request:
await character.loadBody();
character.setWrist(0.5);
// When the host no longer needs the character:
reference.scene.remove(character.root);
character.dispose();
```

The example assumes your host has created `renderer` and `scheduler`. See demo/demo.js for the complete host lifecycle, responsive resizing and camera setup. `root` and `getBounds()` use source-world coordinates; the demo applies head centering or the tested full-body offset without changing source geometry.

- setExpressions({jaw, smile, brow, blink}): values in [0,1].
- getState(): inspect current expression/body state.
- loadBody(): idempotently load the optional dressed body and wrist data.
- setWrist(value): use [0,1] after body loading.
- reset(): restore neutral deformation.
- getBounds(): source-space bounds for framing.
- capabilities and metadata: inspect supported features and delivery details.
- dispose(): release the character and its owned resources.

Call your renderer invalidation callback after changes. The supplied demo uses the tested demand scheduler and does not keep submitting frames when controls have settled. That does not imply zero GPU allocation, zero battery use or a measured device frame rate.

## Delivery and limitations

The head is about91.4 MB. On a device supporting ASTC4x4, the dressed body is85.63 MB, plus12.35 MB wrist data and approximately0.65 MB of decoder files. Unsupported devices select the original94.86 MB PNG body before download. The fallback is independent of the compressed body; no unsupported compressed download is required first.

237 accepted colour/roughness-metallic textures use ASTC4x4. Every normal map remains original. Estimated body texture mip payload falls from349.52 MB to232.35 MB (33.5%); this excludes geometry, driver overhead, decoded buffers, shader targets and other GPU/CPU memory.

The wrist movement uses six sampled source keys. Held-out cloth error reaches6.29 mm, and fine glove-normal outliers remain. This is one gesture, not arbitrary animation. Hair grain and portable material differences remain visible. Moustache deformation is approximate, with tested held-out maximum error1.22 mm. Facial correctives cover tested combinations rather than the full authored rig.

The source character and dependency licenses are documented in ATTRIBUTION.md and licenses/. Browser verification of this package is pending until its combined integration gate finishes; earlier explorer verification alone is not a package test.
