// JOG ITERATION 2 REVIEW COPY. Accepted v13 viewer and runtime remain unchanged.
// Derived from the existing package70 plain-Three viewer scaffold, not its discarded asset.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { summarize, sha256, readGlbJSON, frameStatistics } from './metrics72.js';

const now = () => performance.now();
const el = id => document.getElementById(id);
const canvas = el('canvas'), viewport = el('viewport');
const metrics = {
  schema: 'standard-character-browser72-v1', bootMs: now(), ready: false,
  firstCharacterRenderSubmittedMs: null, firstPixelConfirmedMs: null,
  firstPresentationOpportunityMs: null, firstAnimation: null,
  controls: [], longTasks: [], glErrors: [], contextLosses: 0, frameCount: 0,
  frameSamples: [], benchmark: null, asset: null, stages: {}, meshoptLoaded: false
};
try {
  new PerformanceObserver(list => {
    for (const item of list.getEntries()) metrics.longTasks.push({ startMs: item.startTime, durationMs: item.duration });
  }).observe({ type: 'longtask', buffered: true });
  metrics.longTaskObserverSupported = true;
} catch { metrics.longTaskObserverSupported = false; }

const scene = new THREE.Scene(); scene.background = new THREE.Color('#eef0eb');
const camera = new THREE.PerspectiveCamera(32, 1, .01, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
const effectivePixelRatio = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(effectivePixelRatio);
metrics.pixelRatio = { device: devicePixelRatio, effective: effectivePixelRatio, cap: 1.5 };
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
// Explicit reset once per measured frame, including any standard material passes.
renderer.info.autoReset = false;
scene.add(new THREE.HemisphereLight(0xe9f3ff, 0x706e57, 2.5));
const key = new THREE.DirectionalLight(0xfff4df, 3.4); key.position.set(3, 6, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0xc7dfff, 1.2); fill.position.set(-4, 2, -3); scene.add(fill);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = false;
let model, mixer, action, clip, config, availableClips = [], playing = false, neutral = true, clipTime = 0;
let raf = 0, playWall = 0, playOffset = 0, lastRaf = null, firstMotionPending = null;
const initial = [], meshes = [], attributes = [], pendingControls = [];

function requestRender() { if (!raf) raf = requestAnimationFrame(render); }
function resize() {
  const box = viewport.getBoundingClientRect(); renderer.setSize(box.width, box.height, false);
  camera.aspect = box.width / box.height; camera.updateProjectionMatrix(); requestRender();
}
function drawStats() {
  return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    lines: renderer.info.render.lines, points: renderer.info.render.points,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
}
function checkGL() {
  const gl = renderer.getContext();
  for (let i = 0; i < 16; i++) { const error = gl.getError(); if (!error) break; metrics.glErrors.push({ error, atMs: now() }); }
}
function poseSignature() {
  const values = [];
  model.traverse(node => values.push(...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray(), ...(node.morphTargetInfluences || [])));
  return values.map(n => Math.round(n * 1e7)).join(',');
}
function cameraSignature() { return [...camera.position.toArray(), ...camera.quaternion.toArray()].join(','); }
function pixelEvidence() {
  // Only at startup and snapshots, never within the steady 30-second timing series.
  const gl = renderer.getContext(), width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const corner = Array.from(pixels.slice(0, 3)); let different = 0;
  for (let i = 0; i < pixels.length; i += 4)
    if (Math.abs(pixels[i] - corner[0]) + Math.abs(pixels[i + 1] - corner[1]) + Math.abs(pixels[i + 2] - corner[2]) > 24) different++;
  checkGL(); return { width, height, corner, nonBackgroundPixels: different, fraction: different / (width * height) };
}
function queueControl(event, kind) {
  if (!event) return;
  pendingControls.push({ kind, eventType: event.type, trusted: event.isTrusted,
    eventMs: event.timeStamp, handlerStartMs: now(), expectedCameraChange: kind === 'orbit', cameraBefore: cameraSignature() });
}
function locomotionKind76(name = clip?.name) { return name === config?.clip ? 'walk' : (name === config?.jog?.clip || name === config?.diagnosticBeforeClip) ? 'jog' : null; }
function updateUi() {
  const locomotion = locomotionKind76();
  const jogLabel77 = clip?.name === config?.diagnosticBeforeClip ? 'Jog v1 · diagnostic' : 'Jog v2 · WIP';
  el('play').textContent = locomotion ? 'Play ' + locomotion : 'Play expression';
  el('reset').textContent = locomotion ? 'Reset to start' : 'Reset to neutral';
  if (!metrics.benchmark?.active) el('loop-note').textContent = locomotion === 'jog'
    ? jogLabel77 + ': finite 48-frame excerpt, not a seamless loop. Stops at the end; press Play again to repeat.'
    : locomotion === 'walk' ? 'Walk: finite 80-frame excerpt, not a seamless loop. Press Play again to repeat.'
    : 'Finite expression clip. Reset returns to neutral.';
  if (metrics.ready) el('status').textContent = locomotion === 'jog'
    ? jogLabel77 + '. Bounded jacket and wire correction under review. Finite excerpt, not yet artistically accepted.'
    : locomotion === 'walk' ? 'Accepted walk. Starts at its first pose and stops at the end; press Play again to repeat.'
    : 'Existing expression clip. Reset returns to neutral.';
  el('badge').textContent = playing ? 'Playing' : neutral ? 'Neutral' : clipTime === 0 ? 'Start pose' : 'Paused';
  el('time').textContent = `${clipTime.toFixed(3)} / ${(clip?.duration || 0).toFixed(3)} s`;
  el('play').disabled = !metrics.ready || playing; el('pause').disabled = !playing; el('reset').disabled = !metrics.ready;
}
function applyTime(seconds) {
  action.enabled = true; action.paused = false; mixer.setTime(seconds); model.updateMatrixWorld(true); clipTime = seconds;
}
function activate() {
  if (!neutral) return;
  action.reset().setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play(); neutral = false;
}
function pause(event) { queueControl(event, 'pause'); playing = false; lastRaf = null; updateUi(); requestRender(); }
function seek(seconds) {
  pause(); activate(); applyTime(Math.max(0, Math.min(Number(seconds), clip.duration))); updateUi(); requestRender();
}
function play(event) {
  if (!metrics.ready || playing) return;
  queueControl(event, 'play'); activate(); if (clipTime >= clip.duration) applyTime(0); else applyTime(clipTime);
  firstMotionPending = metrics.firstAnimation ? null : { requestedMs: now(), eventMs: event?.timeStamp ?? null, poseAtStart: poseSignature() };
  playOffset = clipTime; playWall = now(); lastRaf = null; playing = true;
  if (metrics.benchmark?.active) metrics.benchmark.startedMs = playWall;
  updateUi(); requestRender();
}
function reset(event) {
  queueControl(event, 'reset'); pause(); mixer.stopAllAction();
  for (const s of initial) {
    s.node.position.copy(s.position); s.node.quaternion.copy(s.quaternion); s.node.scale.copy(s.scale);
    if (s.weights) s.node.morphTargetInfluences.splice(0, s.weights.length, ...s.weights);
  }
  model.updateMatrixWorld(true); neutral = true; clipTime = 0; firstMotionPending = null;
  // A selected locomotion clip is ready at its actual first sample, not the source T-pose.
  // Facial clips still reset to the unanimated source neutral.
  if (locomotionKind76()) { activate(); applyTime(0); }
  updateUi(); requestRender();
}
function selectAnimation(name, event) {
  const selected = availableClips.find(c => c.name === name);
  if (!selected || metrics.benchmark?.active) return;
  queueControl(event, 'select-animation'); clip = selected;
  action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; reset();
  el('animation').value = clip.name; updateUi(); requestRender();
}
function render(timestamp) {
  raf = 0; const startedMs = now(); const bench = metrics.benchmark; const measured = !!bench?.active && playing; const demoMeasured76 = !!metrics.finiteJogDemo76?.active && playing;
  let stopBenchmark = false;
  if (playing) {
    const elapsed = playOffset + Math.max(0, timestamp - playWall) / 1000;
    if (measured) {
      applyTime(elapsed % clip.duration);
      bench.hardResetCount = Math.floor(elapsed / clip.duration);
      stopBenchmark = timestamp - bench.startedMs >= 30000;
    } else { applyTime(Math.min(elapsed, clip.duration)); if (elapsed >= clip.duration) playing = false; }
  }
  renderer.info.reset(); renderer.render(scene, camera);
  const submittedMs = now(), draw = drawStats(); metrics.frameCount++;
  if (demoMeasured76) {
    metrics.finiteJogDemo76.frames.push({ rafMs: timestamp, submittedMs, clipTime, playing, updateAndRenderSubmitMs: submittedMs - startedMs, ...draw });
    if (!playing) { metrics.finiteJogDemo76.active = false; metrics.finiteJogDemo76.completed = true; metrics.finiteJogDemo76.endedMs = submittedMs; checkGL(); }
  }
  if (measured) {
    metrics.frameSamples.push({ frame: metrics.frameCount, rafMs: timestamp, submittedMs,
      rafDeltaMs: lastRaf === null ? null : timestamp - lastRaf,
      updateAndRenderSubmitMs: submittedMs - startedMs, ...draw, clipTime });
    lastRaf = timestamp;
  }
  if (model && metrics.firstCharacterRenderSubmittedMs === null && draw.triangles > 0) {
    metrics.firstCharacterRenderSubmittedMs = submittedMs;
    metrics.firstPixels = pixelEvidence(); metrics.firstPixelConfirmedMs = now();
    requestAnimationFrame(() => { metrics.firstPresentationOpportunityMs = now(); });
  }
  if (firstMotionPending && clipTime > 0 && poseSignature() !== firstMotionPending.poseAtStart) {
    const { poseAtStart, ...start } = firstMotionPending;
    const result = { ...start, firstAdvancedRenderSubmittedMs: submittedMs,
      eventToSubmitMs: start.eventMs === null ? null : submittedMs - start.eventMs,
      handlerToSubmitMs: submittedMs - start.requestedMs };
    metrics.firstAnimation ||= result; firstMotionPending = null;
  }
  for (let i = pendingControls.length - 1; i >= 0; i--) {
    const c = pendingControls[i]; if (c.expectedCameraChange && c.cameraBefore === cameraSignature()) continue;
    pendingControls.splice(i, 1); const { cameraBefore, ...record } = c;
    Object.assign(record, { renderSubmittedMs: submittedMs, eventToSubmitMs: submittedMs - c.eventMs,
      handlerToSubmitMs: submittedMs - c.handlerStartMs, dispatchDelayMs: c.handlerStartMs - c.eventMs });
    metrics.controls.push(record);
    requestAnimationFrame(() => { record.nextRafOpportunityMs = now(); });
  }
  if (stopBenchmark) {
    playing = false; bench.active = false; bench.completed = true; bench.endedMs = submittedMs;
    bench.actualDurationMs = submittedMs - bench.startedMs; checkGL();
  }
  if (!measured || stopBenchmark || metrics.frameCount % 20 === 0) updateUi();
  if (playing) requestRender();
}
function report() {
  return { ...metrics, frameSamples: undefined, playing, neutral, clipTime, selectedClip: clip?.name, duration: clip?.duration,
    frames: frameStatistics(metrics.frameSamples), latestFrame: drawStats(), threeRevision: THREE.REVISION,
    attributeVersionsUnchanged: attributes.every(x => x.attribute.version === x.version),
    camera: { position: camera.position.toArray(), target: controls.target.toArray(), projection: camera.projectionMatrix.toArray(),
      view: camera.matrixWorldInverse.toArray(), fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far },
    lighting: { background: '#eef0eb', hemisphere: { sky: 'e9f3ff', ground: '706e57', intensity: 2.5 },
      key: { color: 'fff4df', intensity: 3.4, position: [3, 6, 5] }, fill: { color: 'c7dfff', intensity: 1.2, position: [-4, 2, -3] },
      toneMapping: 'ACESFilmicToneMapping', exposure: 1.15, hdrPreprocessing: false, materialsModified: false },
    resources: performance.getEntriesByType('resource').map(r => ({ name: r.name, initiatorType: r.initiatorType,
      startTime: r.startTime, responseStart: r.responseStart, responseEnd: r.responseEnd, duration: r.duration,
      transferSize: r.transferSize, encodedBodySize: r.encodedBodySize, decodedBodySize: r.decodedBodySize })),
    navigation: performance.getEntriesByType('navigation').map(r => r.toJSON()),
    heap: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize, jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      limitation: 'Chromium JS heap estimate only, not process or GPU memory.' } : null,
    controlLatency: summarize(metrics.controls.map(c => c.eventToSubmitMs)) };
}
function snapshot() {
  renderer.info.reset(); renderer.render(scene, camera); const pixels = pixelEvidence();
  model.updateMatrixWorld(true); let finite = true;
  model.traverse(n => { if (![...n.matrixWorld.elements, ...(n.morphTargetInfluences || [])].every(Number.isFinite)) finite = false; });
  return { image: canvas.toDataURL('image/png'), poseSignature: poseSignature(), finite, pixels,
    morphWeights: meshes.filter(m => m.morphTargetInfluences).map(m => ({ name: m.name, weights: [...m.morphTargetInfluences] })),
    draw: drawStats(), neutral, clipTime, camera: report().camera };
}
function frameView(kind = 'whole') {
  const target = kind === 'head' ? model.getObjectByName('Mobile_HeadSkin') : model;
  if (!target) throw Error('Missing requested visual inspection target');
  model.updateMatrixWorld(true); // Skin bounds depend on sibling armature world matrices.
  const box = new THREE.Box3().setFromObject(target, true);
  const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const fit = Math.max(size.y / 2, size.x / (2 * camera.aspect));
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(.22, .025, 1).normalize().multiplyScalar(fit / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.25 + size.z / 2));
  camera.updateProjectionMatrix(); controls.update(); requestRender();
}
// Two reversible, built-in-material eye-shell candidates; no shader/source changes.
const eyeSurfaceCandidates74 = [];
function configureEyeSurfaceCandidates74() {
  for (const name of ['Mobile_EyeCornea', 'Mobile_EyeMeniscus']) {
    const node = model.getObjectByName(name);
    if (!node?.isMesh || Array.isArray(node.material)) throw Error('Expected one-material eye shell: ' + name);
    const original = node.material;
    const candidate = original.clone();
    candidate.name = original.name + '_AlphaSurface74';
    candidate.transmission = 0;
    candidate.transparent = true;
    candidate.opacity = 0.08;
    candidate.depthWrite = false;
    candidate.side = THREE.FrontSide;
    candidate.needsUpdate = true;
    eyeSurfaceCandidates74.push({ node, original, candidate });
  }
  setEyeSurfaceMode74('candidate');
}
function eyeSurfaceState74() {
  return eyeSurfaceCandidates74.map(({ node, original, candidate }) => ({
    mesh: node.name, visible: node.visible, mode: node.material === original ? 'baseline' : node.material === candidate ? 'candidate' : 'unexpected',
    materialType: node.material.type, opacity: node.material.opacity, transmission: node.material.transmission,
    transparent: node.material.transparent, depthWrite: node.material.depthWrite, side: node.material.side,
    roughness: node.material.roughness, metalness: node.material.metalness,
    original: { type: original.type, opacity: original.opacity, transmission: original.transmission,
      transparent: original.transparent, depthWrite: original.depthWrite, side: original.side,
      roughness: original.roughness, metalness: original.metalness },
    preserved: { geometry: true, uv: true, normalMap: candidate.normalMap === original.normalMap,
      normalScale: candidate.normalScale.equals(original.normalScale), map: candidate.map === original.map,
      roughnessMap: candidate.roughnessMap === original.roughnessMap,
      specularIntensity: candidate.specularIntensity === original.specularIntensity,
      specularColor: candidate.specularColor.equals(original.specularColor),
      specularIntensityMap: candidate.specularIntensityMap === original.specularIntensityMap,
      specularColorMap: candidate.specularColorMap === original.specularColorMap }
  }));
}
function setEyeSurfaceMode74(mode) {
  if (!['baseline', 'candidate'].includes(mode)) throw Error('Unknown eye surface mode');
  if (playing || metrics.benchmark?.active) throw Error('Pause/cancel before comparing eye surfaces');
  for (const pair of eyeSurfaceCandidates74) { pair.node.visible = true; pair.node.material = pair[mode === 'baseline' ? 'original' : 'candidate']; }
  metrics.eyeSurfaceCandidate74 = { mode, opacity: 0.08,
    approximation: 'Review-only glossy alpha surface: no refraction, depthWrite false, FrontSide. Geometry, UV, normal and specular properties retained.' };
  requestRender(); return eyeSurfaceState74();
}
function frameDiagnosticHead74(view) {
  frameView('head');
  const distance = camera.position.distanceTo(controls.target);
  const direction = view === 'three-quarter' ? new THREE.Vector3(.7, .08, 1) : new THREE.Vector3(0, .025, 1);
  camera.position.copy(controls.target).add(direction.normalize().multiplyScalar(distance));
  controls.update(); requestRender();
}
// Bounded native-key demo capture; no new playback scheduler or benchmark.
async function fetchFrozenAsset77(asset) {
  const parts = asset.parts;
  if (!parts) {
    const response = await fetch('./' + asset.filename, { cache: 'force-cache' });
    if (!response.ok) throw Error('Asset HTTP ' + response.status);
    metrics.stages.headersMs = now();
    const bytes = await response.arrayBuffer(); metrics.stages.bodyCompleteMs = now();
    metrics.assetTransfer = { mode: 'single-file', parts: 1, bytes: bytes.byteLength, parsedModels: 1 };
    return bytes;
  }
  if (!Array.isArray(parts) || parts.length !== 2 || parts.some((p,i) => p.filename !== asset.filename + '.part' + i
    || !Number.isSafeInteger(p.bytes) || p.bytes <= 0 || p.bytes > 25 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(p.sha256))
    || parts.reduce((sum,p) => sum + p.bytes, 0) !== asset.bytes) throw Error('Expected exactly two bounded frozen GLB transport parts');
  const chunks = [];
  for (const part of parts) {
    const response = await fetch('./' + part.filename, { cache: 'force-cache' });
    if (!response.ok) throw Error('Asset part HTTP ' + response.status);
    metrics.stages.headersMs ??= now();
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== part.bytes || await sha256(bytes) !== part.sha256) throw Error('Asset part integrity mismatch');
    chunks.push(new Uint8Array(bytes));
  }
  const joined = new Uint8Array(asset.bytes); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  chunks.length = 0; metrics.stages.bodyCompleteMs = now();
  metrics.assetTransfer = { mode: 'two-lossless-parts', parts: 2, bytes: joined.byteLength, parsedModels: 1,
    policy: 'Exact complete standard GLB assembled before final hash check and normal GLTFLoader parse; no custom mesh or frame format.' };
  return joined.buffer;
}
function captureGaitKey76(sourceKeyIndex) {
  const isJog = clip.name === config.jog.clip || clip.name === config.diagnosticBeforeClip;
  if (!isJog && clip.name !== config.clip) throw Error('Select Walk or Jog for gait capture');
  const sampleCount = isJog ? config.jog.samples : 80, firstSourceFrame = isJog ? config.jog.firstSourceFrame : 539;
  if (!Number.isInteger(sourceKeyIndex) || sourceKeyIndex < 0 || sourceKeyIndex >= sampleCount) throw Error('Invalid native gait key');
  const clocks = clip.tracks.filter(t => t.times.length === sampleCount && Math.abs(t.times[0]) < 1e-8 && Math.abs(t.times[sampleCount-1]-clip.duration) < 1e-7);
  if (!clocks.length) throw Error('Exact source key clock missing');
  const sourceTimeSeconds = Number(clocks[0].times[sourceKeyIndex]);
  if (clocks.some(t=>Math.abs(t.times[sourceKeyIndex]-sourceTimeSeconds)>1e-7)) throw Error('Source key clocks disagree');
  pause(); activate(); applyTime(sourceTimeSeconds); if (raf) { cancelAnimationFrame(raf); raf = 0; } updateUi();
  const rendered = snapshot(), joints = [];
  model.traverse(node=>{if(node.isBone && /^DEF-(Thigh|Knee|Foot|Toes)\.?[LR]$/.test(node.name)) joints.push({name:node.name,worldPosition:node.getWorldPosition(new THREE.Vector3()).toArray(),worldQuaternion:node.getWorldQuaternion(new THREE.Quaternion()).toArray()});});
  const footwear=model.getObjectByName('Mobile_Footwear');if(!footwear)throw Error('Footwear target missing');
  model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(footwear,true),projected=new THREE.Box3();
  for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])projected.expandByPoint(new THREE.Vector3(x,y,z).project(camera));
  const sourceFrame=firstSourceFrame+sourceKeyIndex;
  return {...rendered,clipName:clip.name,sourceKeyIndex,sourceFrame,sourceTimeSeconds,nominalSourceHz:60,joints,
    footwearBounds:{min:box.min.toArray(),max:box.max.toArray()},projectedFootwearBounds:{min:projected.min.toArray(),max:projected.max.toArray()},
    contactAnnotations:(config.jog.contactAnchors||[]).filter(a=>a.sourceFrame===sourceFrame),
    capturePolicy:'Actual native-key still. Original source time; no slowdown, loop or interpolated extra frames.'};
}
function setComparisonView77(view) {
  if (!['front', 'side'].includes(view) || playing || metrics.benchmark?.active) throw Error('Select a paused declared comparison view');
  const preset = config.comparisonCamera;
  if (!preset || !preset.target.every(Number.isFinite) || !(preset.distance > 0)) throw Error('Frozen comparison camera missing');
  controls.target.fromArray(preset.target);
  const direction = view === 'front' ? new THREE.Vector3(0, .025, 1) : new THREE.Vector3(1, .025, 0);
  camera.position.copy(controls.target).add(direction.normalize().multiplyScalar(preset.distance));
  camera.fov = preset.fov; camera.updateProjectionMatrix(); controls.update(); requestRender();
  return report().camera;
}
function beginFiniteJogDemo76() {
  if (clip.name!==config.jog.clip || playing || metrics.benchmark?.active) throw Error('Select paused Jog first');
  reset(); metrics.finiteJogDemo76={active:true,completed:false,frames:[],clip:clip.name,duration:clip.duration,policy:'One real finite Play, original clock, no repetition or benchmark.'};
}
window.characterQA72 = {
  setComparisonView77, captureGaitKey76, beginFiniteJogDemo76,
  setEyeSurfaceMode74, eyeSurfaceState74, frameDiagnosticHead74, poseSignature,
  get ready() { return metrics.ready; }, report, snapshot, play, pause, reset, seek, selectAnimation, frameView,
  get benchmarkComplete() { return !!metrics.benchmark?.completed; },
  async rendered() { requestRender(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); },
  beginBenchmark() {
    selectAnimation(config.clip); seek(0); metrics.frameSamples = []; metrics.benchmark = { active: true, completed: false, startedMs: null,
      requestedDurationMs: 30000, hardResetCount: 0, policy: 'Repeated finite excerpt with hard resets, not a seamless loop.' };
    el('loop-note').textContent = '30-second measurement: repeated finite excerpt with hard resets, not a seamless loop.';
  },
  cancelBenchmark() { if (metrics.benchmark) metrics.benchmark.active = false; },
  frameSamples: () => metrics.frameSamples,
  async geometryHashes() {
    const output = []; for (const a of attributes) {
      const x = a.attribute.array; output.push({ name: a.name, sha256: await sha256(new Uint8Array(x.buffer, x.byteOffset, x.byteLength)) });
    } return output;
  }
};
controls.addEventListener('change', requestRender);
// Capture runs before OrbitControls mutates the camera, so a latency sample requires actual motion.
canvas.addEventListener('pointermove', event => { if (event.buttons && metrics.ready) queueControl(event, 'orbit'); }, { capture: true });
el('animation').addEventListener('change', event => selectAnimation(event.target.value, event));
el('play').addEventListener('click', play); el('pause').addEventListener('click', pause); el('reset').addEventListener('click', reset);
canvas.addEventListener('webglcontextlost', () => { metrics.contextLosses++; playing = false; });
new ResizeObserver(resize).observe(viewport); resize();

try {
  if (THREE.REVISION !== '160') throw Error('Unexpected Three baseline');
  config = await (await fetch('./runtime77-jog.json', { cache: 'no-store' })).json();
  if (!config.asset || !/^[a-zA-Z0-9_.-]+\.glb$/.test(config.asset.filename)) throw Error('No frozen local standard-export asset configured');
  metrics.stages.fetchStartMs = now();
  const bytes = await fetchFrozenAsset77(config.asset);
  if (bytes.byteLength !== config.asset.bytes || await sha256(bytes) !== config.asset.sha256) throw Error('Asset integrity mismatch');
  metrics.stages.hashVerifiedMs = now(); metrics.asset = config.asset;
  const json = readGlbJSON(bytes);
  const generator = json.asset.generator || '';
  const directBlender = generator.includes('glTF Blender I/O');
  const provenance = config.asset.provenance;
  const standardPostprocessed = generator === 'glTF-Transform v4.5.1' && provenance?.exporter?.includes('glTF Blender I/O')
    && /^[a-f0-9]{64}$/.test(provenance.exportedAssetSha256 || '')
    && provenance.postprocessor === '@gltf-transform/core 4.5.1';
  if (!directBlender && !standardPostprocessed) throw Error('Expected Blender export or explicitly audited standard postprocessing');
  metrics.assetGenerator = generator; metrics.assetProvenance = provenance || null;
  if ([...(json.buffers || []), ...(json.images || [])].some(x => x.uri && !x.uri.startsWith('data:'))) throw Error('Self-contained GLB required');
  const loader = new GLTFLoader();
  if ((json.extensionsRequired || []).includes('KHR_meshopt_compression')) throw Error('KHR_meshopt_compression requires an explicitly reviewed newer Three/decoder baseline');
  const supportedRequired = new Set(['KHR_lights_punctual', 'KHR_materials_clearcoat', 'KHR_materials_ior',
    'KHR_materials_sheen', 'KHR_materials_specular', 'KHR_materials_transmission', 'KHR_materials_iridescence',
    'KHR_materials_anisotropy', 'KHR_materials_unlit', 'KHR_materials_volume', 'KHR_texture_transform',
    'KHR_texture_basisu', 'KHR_mesh_quantization', 'KHR_materials_emissive_strength', 'EXT_materials_bump', 'EXT_texture_webp',
    'EXT_texture_avif', 'EXT_meshopt_compression', 'EXT_mesh_gpu_instancing']);
  for (const extension of json.extensionsRequired || [])
    if (!supportedRequired.has(extension)) throw Error('Required extension needs reviewed support: ' + extension);
  if ((json.extensionsUsed || []).includes('EXT_meshopt_compression')) {
    const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
    await MeshoptDecoder.ready; loader.setMeshoptDecoder(MeshoptDecoder); metrics.meshoptLoaded = true;
  }
  if ((json.extensionsUsed || []).includes('KHR_texture_basisu')) {
    const { KTX2Loader } = await import('./vendor/three/examples/jsm/loaders/KTX2Loader.js');
    const ktx2 = new KTX2Loader().setTranscoderPath('./vendor/three/examples/jsm/libs/basis/').setWorkerLimit(2).detectSupport(renderer);
    loader.setKTX2Loader(ktx2); metrics.ktx2Loaded = true;
  }
  metrics.stages.parseStartMs = now(); const gltf = await loader.parseAsync(bytes, location.href); metrics.stages.parseEndMs = now();
  model = gltf.scene; scene.add(model); clip = gltf.animations.find(c => c.name === config.clip);
  if (!clip || Math.abs(clip.duration - config.duration) > 1e-5) throw Error('Expected accepted-walk clip/duration not found');
  model.traverse(node => {
    initial.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(), weights: node.morphTargetInfluences ? [...node.morphTargetInfluences] : null });
    if (node.isMesh) {
      meshes.push(node); node.frustumCulled = false; // Whole-character workload, no rest-bound culling confound.
      for (const [name, attribute] of Object.entries(node.geometry.attributes)) attributes.push({ name: node.name + '/' + name, attribute, version: attribute.version });
      for (const [name, list] of Object.entries(node.geometry.morphAttributes)) list.forEach((attribute, i) => attributes.push({ name: node.name + '/morph/' + name + '/' + i, attribute, version: attribute.version }));
    }
  });
  model.updateMatrixWorld(true); // Update the entire hierarchy before evaluating skinned vertices.
  const box = new THREE.Box3().setFromObject(model, true), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const height = Math.max(size.y, .01), fit = Math.max(size.y / 2, size.x / (2 * camera.aspect));
  controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(.4, .035, 1).normalize().multiplyScalar(fit / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.25 + size.z / 2));
  camera.near = Math.max(.001, height / 1000); camera.far = height * 100; camera.updateProjectionMatrix(); controls.update();
  const jog = gltf.animations.find(c => c.name === config.jog?.clip);
  if (config.diagnosticBeforeClip && !gltf.animations.some(c => c.name === config.diagnosticBeforeClip && Math.abs(c.duration - config.jog.duration) < 1e-5)) throw Error('Missing declared v1 diagnostic Jog');
  if (!jog || Math.abs(jog.duration - config.jog.duration) > 1e-5 || config.jog.loopMode !== 'finite') throw Error('Expected explicitly finite Jog clip/duration not found');
  availableClips = gltf.animations.filter(c => c.name === config.clip || c.name === config.jog.clip || c.name === config.diagnosticBeforeClip || /^Face_(Jaw|Smile|Brow|Blink|JawSmile)$/.test(c.name));
  el('animation').replaceChildren(...availableClips.map(c => { const o = document.createElement('option'); o.value = c.name; o.textContent = c.name === config.clip ? 'Accepted walk' : c.name === config.jog.clip ? 'Jog v2 · WIP' : c.name === config.diagnosticBeforeClip ? 'Jog v1 · diagnostic' : c.name.replace('Face_', '').replace('JawSmile', 'Jaw + smile'); return o; }));
  el('animation').value = clip.name; el('animation').disabled = false;
  mixer = new THREE.AnimationMixer(model); action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true;
  configureEyeSurfaceCandidates74(); reset();
  // Bounded deep link: only already-validated available clips are selectable; no autoplay.
  const requestedClip76 = new URLSearchParams(location.search).get('clip');
  if (requestedClip76 && availableClips.some(c => c.name === requestedClip76)) selectAnimation(requestedClip76);
  metrics.stages.sceneReadyMs = now(); metrics.ready = true;
  metrics.geometry = { meshes: meshes.length, skinnedMeshes: meshes.filter(m => m.isSkinnedMesh).length,
    morphMeshes: meshes.filter(m => m.morphTargetInfluences?.length).length, materialPolicy: 'Standard GLTFLoader materials with reviewed lightweight non-refractive eye shells.', frustumCulling: false };
  el('status').textContent = 'Ready. Choose Walk or Jog. Each starts at its first pose and stops at the end; press Play to repeat.'; updateUi(); requestRender();
} catch (error) {
  metrics.failure = String(error.stack || error); el('badge').textContent = 'Not ready'; el('status').textContent = error.message; console.error(error);
}
