import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { registerHooks } from 'node:module';
import { summarize, frameStatistics, readGlbJSON, sha256 } from './metrics72.js';
import * as THREE from './vendor/three/build/three.module.js';

assert.deepEqual(summarize([null, NaN, Infinity]), { count: 0, min: null, median: null, p95: null, p99: null, max: null, mean: null });
const stats = frameStatistics([{ rafDeltaMs: null, updateAndRenderSubmitMs: 2, calls: 9, triangles: 100 },
  { rafDeltaMs: 20, updateAndRenderSubmitMs: 3, calls: 10, triangles: 120 },
  { rafDeltaMs: 40, updateAndRenderSubmitMs: 4, calls: 11, triangles: 140 }]);
assert.equal(stats.rafIntervalMs.count, 2); assert.equal(stats.callsPerFrame.mean, 10);
assert.equal(stats.trianglesPerFrame.mean, 120); assert.equal(stats.intervalsOver33ms, 1);
assert.equal(await sha256(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
const json = Buffer.from('{"asset":{"version":"2.0"}}  ');
const glb = Buffer.alloc(20 + json.length); glb.writeUInt32LE(0x46546c67); glb.writeUInt32LE(2, 4);
glb.writeUInt32LE(glb.length, 8); glb.writeUInt32LE(json.length, 12); glb.writeUInt32LE(0x4e4f534a, 16); json.copy(glb, 20);
assert.equal(readGlbJSON(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength)).asset.version, '2.0');
assert.throws(() => readGlbJSON(new ArrayBuffer(8)));
const broken = glb.slice(); broken.writeUInt32LE(0, 0); assert.throws(() => readGlbJSON(broken.buffer.slice(broken.byteOffset, broken.byteOffset + broken.byteLength)));

// Standard r160 AnimationMixer supports animated morph weights and exact finite rest/seek semantics.
assert.equal(THREE.REVISION, '160');
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
geometry.morphAttributes.position = [new THREE.Float32BufferAttribute([0, 1, 0], 3)];
const model = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
const mixer = new THREE.AnimationMixer(model);
const clip = new THREE.AnimationClip('test', 1, [new THREE.NumberKeyframeTrack('.morphTargetInfluences[0]', [0, .5, 1], [0, 1, 0])]);
const action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
for (const [t, expected] of [[.5, 1], [1, 0], [.5, 1], [0, 0]]) {
  action.enabled = true; action.paused = false; mixer.setTime(t); assert.ok(Math.abs(model.morphTargetInfluences[0] - expected) < 1e-9);
}
mixer.stopAllAction(); assert.equal(model.morphTargetInfluences[0], 0);
const vendor = JSON.parse(fs.readFileSync(new URL('./vendor-integrity72.json', import.meta.url)));
for (const item of vendor.files) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(new URL(item.path, import.meta.url))).digest('hex');
  assert.equal(hash, item.sha256, item.path);
}
const app = fs.readFileSync(new URL('./viewer72.js', import.meta.url), 'utf8');
assert.ok(!/onBeforeCompile|ShaderMaterial|RawShaderMaterial|\.needsUpdate\s*=/.test(app), 'No custom shader or dynamic geometry patch');
assert.ok(app.includes('renderer.info.reset(); renderer.render(scene, camera)'));
assert.ok(app.includes("await import('three/addons/libs/meshopt_decoder.module.js')"));
console.log('UNIT72_PASS: metrics, GLB envelope, hashes, standard r160 morph seek/reset, vendor integrity and static shader checks. No browser was launched.');

// Optional CPU-only loader/mixer test of a separately supplied audited standard GLB.
// Does not copy the asset, render, publish, or substitute it into runtime72.json.
if (process.argv[2]) {
  const hook = registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier === 'three') return { url: new URL('./vendor/three/build/three.module.js', import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
  } });
  const { GLTFLoader } = await import('./vendor/three/examples/jsm/loaders/GLTFLoader.js');
  const bytes = fs.readFileSync(process.argv[2]);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const json = readGlbJSON(buffer); assert.ok(json.asset.generator.includes('glTF Blender I/O'));
  const loader = new GLTFLoader();
  if (json.extensionsUsed?.includes('EXT_meshopt_compression')) {
    const { MeshoptDecoder } = await import('./vendor/three/examples/jsm/libs/meshopt_decoder.module.js');
    await MeshoptDecoder.ready; loader.setMeshoptDecoder(MeshoptDecoder);
  }
  const asset = await loader.parseAsync(buffer, ''); const walk = asset.animations.find(c => c.name === 'Walk539_618');
  assert.ok(walk); const mixer = new THREE.AnimationMixer(asset.scene), action = mixer.clipAction(walk);
  const nodes = []; asset.scene.traverse(n => nodes.push(n));
  const signature = () => JSON.stringify(nodes.map(n => [n.position.toArray(), n.quaternion.toArray(), n.scale.toArray(), n.morphTargetInfluences]));
  const rest = signature(); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
  const times = [0, .23333801329135895, .6333460360765457, walk.duration, 0];
  for (const t of times) {
    action.enabled = true; action.paused = false; mixer.setTime(t); asset.scene.updateMatrixWorld(true);
    assert.ok(nodes.every(n => [...n.matrixWorld.elements, ...(n.morphTargetInfluences || [])].every(Number.isFinite)));
  }
  assert.notEqual(signature(), rest); mixer.stopAllAction(); assert.equal(signature(), rest);
  console.log('LOADER72_PASS', JSON.stringify({ sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    skinnedMeshes: nodes.filter(n => n.isSkinnedMesh).length, clips: asset.animations.map(c => c.name), testedTimes: times,
    neutralRestored: true, browserLaunched: false })); hook.deregister();
}
