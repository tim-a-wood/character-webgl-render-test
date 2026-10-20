// Einar © Blender Foundation / Blender Studio, CC BY 4.0.
// Bounded rendering backend for corrected57 full-character motion. No motion changes.
import * as THREE from 'three';

const MiB = 1024 * 1024;
const SCHEMA = 'einar58-quantized-mesh-pair-v1';
function requireThat(ok, message) { if (!ok) throw new Error(`MeshGpu58: ${message}`); }
function shape(texels, width, maxTextureSize) {
  const height = Math.max(1, Math.ceil(texels / width));
  requireThat(height <= maxTextureSize, 'atlas exceeds MAX_TEXTURE_SIZE');
  return {width, height, texels: width * height};
}

// Pure planning: check a complete runtime inventory before allocating or touching it.
export function planMeshGpu58(bindings, {maxTextureSize = 4096, textureWidth = 1024,
  maxGpuBytes = 96 * MiB, maxCpuStagingBytes = 96 * MiB, expectedMeshCount = 181} = {}) {
  requireThat(Array.isArray(bindings) && bindings.length === expectedMeshCount, 'incomplete mesh inventory');
  requireThat(Number.isSafeInteger(maxTextureSize) && maxTextureSize >= 1, 'invalid texture limit');
  requireThat(Number.isSafeInteger(textureWidth) && textureWidth >= 1, 'invalid texture width');
  requireThat(Number.isSafeInteger(maxGpuBytes) && maxGpuBytes > 0, 'invalid GPU budget');
  requireThat(Number.isSafeInteger(maxCpuStagingBytes) && maxCpuStagingBytes > 0, 'invalid CPU staging budget');
  const width = Math.min(textureWidth, maxTextureSize);
  let vectors = 0, vertices = 0, words = 0, headMeshes = 0;
  const seen = new Set();
  const records = bindings.map(x => {
    requireThat(x?.mesh?.isMesh && !x.mesh.isSkinnedMesh && !x.mesh.isInstancedMesh, 'unsupported mesh type');
    requireThat(!seen.has(x.mesh), 'duplicate mesh'); seen.add(x.mesh);
    requireThat(x.g === x.mesh.geometry, 'geometry binding mismatch');
    requireThat(!x.g.attributes.tangent, 'explicit mesh tangents need a separately validated backend');
    requireThat(!x.g.attributes.position.isInterleavedBufferAttribute && !x.g.attributes.normal.isInterleavedBufferAttribute, 'interleaved mesh attributes');
    requireThat(x.g.attributes.position.itemSize === 3 && x.g.attributes.normal.itemSize === 3, 'mesh attribute width');
    const s = x.o.s, count = x.g.attributes.position.count;
    requireThat(x.pmap.length === count && x.cmap.length === count && x.g.attributes.normal.count === count, 'mapping count');
    requireThat(x.o.baseP.length === s.positionCount * 3 && x.o.baseN.length === s.normalCount * 3, 'source base count');
    requireThat(s.positionCount > 0 && s.normalCount > 0, 'empty mesh source');
    requireThat(s.positionOffset % 2 === 0 && s.normalOffset % 2 === 0 && s.matrixOffset % 4 === 0, 'unaligned source');
    requireThat(s.positionUnit?.length === 3 && s.normalUnit?.length === 3 && [...s.positionUnit, ...s.normalUnit].every(Number.isFinite), 'quantization units');
    requireThat([...x.localFromSource.elements, ...x.localNormal.elements].every(Number.isFinite), 'nonfinite local transform');
    for (let i = 0; i < count; i++) {
      requireThat(x.pmap[i] < s.positionCount && x.cmap[i] < x.o.loopGroup.length && x.o.loopGroup[x.cmap[i]] < s.normalCount, 'mapping bounds');
    }
    requireThat(!Array.isArray(x.mesh.material), 'material arrays need per-group shadow validation');
    for (const mat of [x.mesh.material, x.mesh.customDepthMaterial, x.mesh.customDistanceMaterial].filter(Boolean)) {
      requireThat(mat?.isMaterial && !mat.isShaderMaterial && !mat.isRawShaderMaterial, 'unsupported custom material');
    }
    const rec = {name: s.name, runtimeVertices: count, mapVertexBase: vertices,
      positionBase: vectors, normalBase: vectors + s.positionCount,
      positionWord: words, normalWord: words + s.positionCount * 3,
      positionCount: s.positionCount, normalCount: s.normalCount,
      positionOffset: s.positionOffset, normalOffset: s.normalOffset, matrixOffset: s.matrixOffset,
      head: !!x.head, overlay: !!x.o.overlay, preserveRuntimeNormals: !!x.entry.preserveRuntimeNormals};
    vectors += s.positionCount + s.normalCount;
    words += (s.positionCount + s.normalCount) * 3;
    vertices += count;
    return rec;
  });
  records.forEach((r, i) => {
    if (r.head) {
      headMeshes++;
      requireThat(bindings[i].sourceRestP?.length === r.runtimeVertices * 3 && bindings[i].sourceRestN?.length === r.runtimeVertices * 3, 'head source-rest snapshots');
      r.faceRestPositionBase = vectors; vectors += r.runtimeVertices;
      r.faceRestNormalBase = vectors; vectors += r.runtimeVertices;
    } else r.faceRestPositionBase = r.faceRestNormalBase = 0;
  });
  requireThat(headMeshes <= 1, 'multiple head bindings');
  requireThat(vectors < 2 ** 24 && vertices < 2 ** 24 && words < 2 ** 31, 'shader addressing overflow');
  const base = shape(vectors, width, maxTextureSize);
  const mapping = shape(Math.ceil(vertices / 2), width, maxTextureSize);
  const frame = shape(Math.ceil(words / 4), width, maxTextureSize);
  const bytes = {baseAtlas: base.texels * 16, mappingAtlas: mapping.texels * 16,
    frameSlot: frame.texels * 8, frameSlots: frame.texels * 8 * 2};
  bytes.total = bytes.baseAtlas + bytes.mappingAtlas + bytes.frameSlots;
  requireThat(bytes.total <= maxGpuBytes, `logical GPU budget exceeded (${bytes.total} > ${maxGpuBytes})`);
  requireThat(bytes.total <= maxCpuStagingBytes, `CPU typed-array staging budget exceeded (${bytes.total} > ${maxCpuStagingBytes})`);
  return {schema: SCHEMA, meshCount: records.length, headMeshes, runtimeVertices: vertices,
    sourceVectors: vectors, frameWords: words, frameSlotCount: 2, base, mapping, frame, bytes,
    maxGpuBytes, maxCpuStagingBytes, records};
}

export const VERTEX_LIBRARY_58 = /* glsl */`
uniform highp sampler2D e58Base;
uniform highp usampler2D e58Map;
uniform highp isampler2D e58FrameA;
uniform highp isampler2D e58FrameB;
uniform int e58BaseWidth;
uniform int e58MapWidth;
uniform int e58FrameWidth;
uniform int e58MapVertexBase;
uniform ivec2 e58SourceBase;
uniform ivec2 e58DeltaBase;
uniform ivec2 e58FaceRestBase;
uniform bool e58Head;
uniform bool e58PreserveNormals;
uniform float e58Mix;
uniform vec3 e58PositionUnit;
uniform vec3 e58NormalUnit;
uniform mat4 e58MatrixA;
uniform mat4 e58MatrixB;
uniform mat3 e58NormalA;
uniform mat3 e58NormalB;
uniform mat4 e58Local;
uniform mat3 e58LocalNormal;
uniform mat4 e58HeadInverse;
uniform mat3 e58HeadNormalInverse;
ivec2 e58Address(int index, int width) { return ivec2(index % width, index / width); }
vec3 e58BaseVector(int index) { return texelFetch(e58Base, e58Address(index, e58BaseWidth), 0).xyz; }
ivec2 e58Mapping() {
  int vertex = e58MapVertexBase + gl_VertexID;
  uvec4 pair = texelFetch(e58Map, e58Address(vertex / 2, e58MapWidth), 0);
  return ivec2(vertex % 2 == 0 ? pair.xy : pair.zw);
}
vec3 e58Delta(highp isampler2D image, int word) {
  int texel = word / 4;
  int lane = word % 4;
  ivec4 first = texelFetch(image, e58Address(texel, e58FrameWidth), 0);
  if (lane < 2) return vec3(first[lane], first[lane + 1], first[lane + 2]);
  ivec4 second = texelFetch(image, e58Address(texel + 1, e58FrameWidth), 0);
  return lane == 2 ? vec3(first.z, first.w, second.x) : vec3(first.w, second.x, second.y);
}
vec3 e58Normalize(vec3 v) { float d = length(v); return d > 0.0 ? v / d : v; }
vec3 e58Position(vec3 facePosition) {
  int index = e58Mapping().x;
  vec3 base = e58BaseVector(e58SourceBase.x + index);
  int word = e58DeltaBase.x + index * 3;
  vec3 a = (e58MatrixA * vec4(base + e58Delta(e58FrameA, word) * e58PositionUnit, 1.0)).xyz;
  vec3 b = (e58MatrixB * vec4(base + e58Delta(e58FrameB, word) * e58PositionUnit, 1.0)).xyz;
  vec3 p = mix(a, b, e58Mix);
  if (e58Head) p = (e58HeadInverse * vec4(p, 1.0)).xyz;
  p = (e58Local * vec4(p, 1.0)).xyz;
  if (e58Head) p += facePosition - e58BaseVector(e58FaceRestBase.x + gl_VertexID);
  return p;
}
vec3 e58Normal(vec3 faceNormal) {
  if (e58PreserveNormals) return faceNormal;
  int index = e58Mapping().y;
  vec3 base = e58BaseVector(e58SourceBase.y + index);
  int word = e58DeltaBase.y + index * 3;
  vec3 a = e58Normalize(e58NormalA * (base + e58Delta(e58FrameA, word) * e58NormalUnit));
  vec3 b = e58Normalize(e58NormalB * (base + e58Delta(e58FrameB, word) * e58NormalUnit));
  vec3 n = e58Normalize(mix(a, b, e58Mix));
  if (e58Head) n = e58HeadNormalInverse * n;
  n = e58LocalNormal * n;
  if (e58Head) n += faceNormal - e58BaseVector(e58FaceRestBase.y + gl_VertexID);
  return e58Normalize(n);
}
`;

export function patchShader58(shader, uniforms) {
  requireThat(shader.vertexShader.includes('#include <begin_vertex>'), 'vertex hook missing after existing material hook');
  shader.uniforms = {...shader.uniforms, ...uniforms};
  shader.vertexShader = VERTEX_LIBRARY_58 + shader.vertexShader
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = e58Position(position);\n#ifdef USE_ALPHAHASH\nvPosition = transformed;\n#endif')
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = e58Normal(normal);');
  // Fragment source is intentionally untouched, including all material maps.
  return shader;
}

function texture(array, dimensions, format, type, internalFormat) {
  const t = new THREE.DataTexture(array, dimensions.width, dimensions.height, format, type);
  t.internalFormat = internalFormat;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false; t.flipY = false; t.unpackAlignment = 1;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}
function putVectors(target, first, source) {
  for (let i = 0, j = first * 4; i < source.length; i += 3, j += 4) {
    target[j] = source[i]; target[j + 1] = source[i + 1]; target[j + 2] = source[i + 2];
  }
}
function u(value) { return {value}; }

export function assertGpuRenderer58(renderer) {
  requireThat(THREE.REVISION === '160', 'prototype is pinned to Three r160');
  const caps = renderer?.capabilities;
  requireThat(caps?.isWebGL2 && caps.maxVertexTextures >= 4, 'WebGL2 and four vertex texture units are required');
  requireThat(!caps.getMaxPrecision || caps.getMaxPrecision('highp') === 'highp', 'highp shader precision is required');
  requireThat(Number.isSafeInteger(caps.maxTextureSize) && caps.maxTextureSize > 0, 'MAX_TEXTURE_SIZE is required');
  return caps;
}

export function createMeshGpu58({bindings, renderer, ...options} = {}) {
  const caps = assertGpuRenderer58(renderer);
  const plan = planMeshGpu58(bindings, {...options, maxTextureSize: caps.maxTextureSize});
  const ownedTextures = [], ownedMaterials = [], records = [];
  let active = false, disposed = false, frameUploads = 0, totalCopiedBytes = 0, pairUpdates = 0;
  let lastFramePackingMs = 0, totalFramePackingMs = 0, maxFramePackingMs = 0;
  const hasOverlay = plan.records.some(r => r.overlay);
  let nextToken = 0;
  const frameTokens = new WeakMap(); // Does not retain evicted CPU frame buffers.
  const slots = [];
  try {
    const baseData = new Float32Array(plan.base.texels * 4);
    const mappingData = new Uint32Array(plan.mapping.texels * 4);
    plan.records.forEach((r, i) => {
      const x = bindings[i];
      putVectors(baseData, r.positionBase, x.o.baseP);
      putVectors(baseData, r.normalBase, x.o.baseN);
      if (r.head) {
        putVectors(baseData, r.faceRestPositionBase, x.sourceRestP);
        putVectors(baseData, r.faceRestNormalBase, x.sourceRestN);
      }
      for (let j = 0; j < r.runtimeVertices; j++) {
        const at = (r.mapVertexBase + j) * 2;
        mappingData[at] = x.pmap[j]; mappingData[at + 1] = x.o.loopGroup[x.cmap[j]];
      }
    });
    const baseTexture = texture(baseData, plan.base, THREE.RGBAFormat, THREE.FloatType, 'RGBA32F');
    const mapTexture = texture(mappingData, plan.mapping, THREE.RGBAIntegerFormat, THREE.UnsignedIntType, 'RGBA32UI');
    ownedTextures.push(baseTexture, mapTexture);
    for (let i = 0; i < 2; i++) {
      const t = texture(new Int16Array(plan.frame.texels * 4), plan.frame, THREE.RGBAIntegerFormat, THREE.ShortType, 'RGBA16I');
      ownedTextures.push(t); slots.push({texture: t, token: null, frameIndex: null, overlayFrameIndex: null});
    }
    const common = {e58Base: u(baseTexture), e58Map: u(mapTexture),
      e58FrameA: u(slots[0].texture), e58FrameB: u(slots[1].texture),
      e58BaseWidth: u(plan.base.width), e58MapWidth: u(plan.mapping.width), e58FrameWidth: u(plan.frame.width),
      e58HeadInverse: u(new THREE.Matrix4()), e58HeadNormalInverse: u(new THREE.Matrix3())};
    function cloneMaterial(original, uniforms, role) {
      const material = original.clone();
      if (original.defines) material.defines = {...original.defines};
      material.precision = 'highp'; // Atlas integer addresses exceed mediump range.
      const priorHook = original.onBeforeCompile;
      const priorKey = original.customProgramCacheKey.call(original);
      material.onBeforeCompile = function(shader, currentRenderer) {
        priorHook.call(this, shader, currentRenderer);
        patchShader58(shader, uniforms);
      };
      material.customProgramCacheKey = () => `${priorKey}|${SCHEMA}|${role}`;
      ownedMaterials.push(material);
      return material;
    }
    plan.records.forEach((r, i) => {
      const x = bindings[i], mesh = x.mesh;
      const uniforms = {...common, e58Mix: u(0),
        e58MapVertexBase: u(r.mapVertexBase), e58SourceBase: u(new THREE.Vector2(r.positionBase, r.normalBase)),
        e58DeltaBase: u(new THREE.Vector2(r.positionWord, r.normalWord)),
        e58FaceRestBase: u(new THREE.Vector2(r.faceRestPositionBase, r.faceRestNormalBase)),
        e58Head: u(r.head), e58PreserveNormals: u(r.preserveRuntimeNormals),
        e58PositionUnit: u(new THREE.Vector3().fromArray(x.o.s.positionUnit)),
        e58NormalUnit: u(new THREE.Vector3().fromArray(x.o.s.normalUnit)),
        e58MatrixA: u(new THREE.Matrix4()), e58MatrixB: u(new THREE.Matrix4()),
        e58NormalA: u(new THREE.Matrix3()), e58NormalB: u(new THREE.Matrix3()),
        e58Local: u(x.localFromSource.clone()), e58LocalNormal: u(x.localNormal.clone())};
      const original = {material: mesh.material, depth: mesh.customDepthMaterial, distance: mesh.customDistanceMaterial,
        depthOwn: Object.hasOwn(mesh, 'customDepthMaterial'), distanceOwn: Object.hasOwn(mesh, 'customDistanceMaterial'), frustum: mesh.frustumCulled};
      const visible = Array.isArray(original.material)
        ? original.material.map(m => cloneMaterial(m, uniforms, 'visible'))
        : cloneMaterial(original.material, uniforms, 'visible');
      const depthSource = original.depth ?? new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking});
      const distanceSource = original.distance ?? new THREE.MeshDistanceMaterial();
      const depth = cloneMaterial(depthSource, uniforms, 'depth');
      const distance = cloneMaterial(distanceSource, uniforms, 'distance');
      // Temporary material shells allocate no textures or GPU resources.
      if (!original.depth) depthSource.dispose();
      if (!original.distance) distanceSource.dispose();
      records.push({r, mesh, uniforms, original, visible, depth, distance});
    });
    function guard() { requireThat(!disposed, 'disposed'); }
    function frameIdentity(frame) {
      requireThat(frame?.buffer instanceof ArrayBuffer && Number.isSafeInteger(frame.index) && frame.index >= 0, 'invalid decoded frame');
      if (!frameTokens.has(frame.buffer)) frameTokens.set(frame.buffer, ++nextToken);
      return frameTokens.get(frame.buffer);
    }
    function endpointToken(endpoint) {
      const baseToken = frameIdentity(endpoint.base);
      const overlayToken = hasOverlay ? frameIdentity(endpoint.overlay) : 0;
      for (const r of plan.records) {
        const frame = r.overlay ? endpoint.overlay : endpoint.base;
        requireThat(r.positionOffset + r.positionCount * 6 <= frame.buffer.byteLength && r.normalOffset + r.normalCount * 6 <= frame.buffer.byteLength && r.matrixOffset + 64 <= frame.buffer.byteLength, 'truncated decoded frame');
        const matrix = new Float32Array(frame.buffer, r.matrixOffset, 16);
        requireThat(matrix.every(Number.isFinite), 'nonfinite decoded matrix');
      }
      // Both source identities are required: a changed overlay must invalidate
      // residency even when the corresponding base endpoint is unchanged.
      return `${baseToken}:${overlayToken}`;
    }
    function upload(slot, endpoint, token) {
      const started = performance.now(), target = slot.texture.image.data;
      for (const r of plan.records) {
        const frame = r.overlay ? endpoint.overlay : endpoint.base;
        target.set(new Int16Array(frame.buffer, r.positionOffset, r.positionCount * 3), r.positionWord);
        target.set(new Int16Array(frame.buffer, r.normalOffset, r.normalCount * 3), r.normalWord);
      }
      slot.texture.needsUpdate = true; slot.token = token;
      slot.frameIndex = endpoint.base.index;
      slot.overlayFrameIndex = hasOverlay ? endpoint.overlay.index : null;
      frameUploads++; totalCopiedBytes += plan.frameWords * 2;
      const elapsed = performance.now() - started;
      lastFramePackingMs += elapsed; totalFramePackingMs += elapsed;
      maxFramePackingMs = Math.max(maxFramePackingMs, elapsed);
    }
    function activate() {
      if (active) return;
      records.forEach(r => {
        r.mesh.material = r.visible; r.mesh.customDepthMaterial = r.depth;
        r.mesh.customDistanceMaterial = r.distance; r.mesh.frustumCulled = false;
      });
      active = true;
    }
    function apply({a, b, mix, overlay, headInverse, headNormalInverse}) {
      guard();
      requireThat(Number.isFinite(mix) && mix >= 0 && mix <= 1, 'invalid interpolation weight');
      requireThat(headInverse?.isMatrix4 && headNormalInverse?.isMatrix3 && [...headInverse.elements, ...headNormalInverse.elements].every(Number.isFinite), 'invalid head transform');
      requireThat(!hasOverlay || (overlay && Number.isFinite(overlay.mix) && overlay.mix >= 0 && overlay.mix <= 1), 'corrected overlay pair is required');
      const endpointA = {base: a, overlay: overlay?.a}, endpointB = {base: b, overlay: overlay?.b};
      const at = endpointToken(endpointA), bt = endpointToken(endpointB);
      lastFramePackingMs = 0;
      const wanted = [...new Set([at, bt])];
      const sources = new Map([[at, endpointA], [bt, endpointB]]);
      for (const token of wanted) {
        if (slots.some(s => s.token === token)) continue;
        const slot = slots.find(s => !wanted.includes(s.token));
        requireThat(slot, 'two-slot residency invariant');
        upload(slot, sources.get(token), token);
      }
      common.e58FrameA.value = slots.find(s => s.token === at).texture;
      common.e58FrameB.value = slots.find(s => s.token === bt).texture;
      common.e58HeadInverse.value.copy(headInverse);
      common.e58HeadNormalInverse.value.copy(headNormalInverse);
      for (const {r, uniforms: q} of records) {
        const selected = r.overlay ? overlay : {a, b, mix};
        q.e58Mix.value = selected.mix;
        q.e58MatrixA.value.fromArray(new Float32Array(selected.a.buffer, r.matrixOffset, 16)).transpose();
        q.e58MatrixB.value.fromArray(new Float32Array(selected.b.buffer, r.matrixOffset, 16)).transpose();
        q.e58NormalA.value.getNormalMatrix(q.e58MatrixA.value);
        q.e58NormalB.value.getNormalMatrix(q.e58MatrixB.value);
      }
      activate(); pairUpdates++;
    }
    function reset() {
      if (!active) return;
      records.forEach(({mesh, original: o}) => {
        mesh.material = o.material;
        if (o.depthOwn) mesh.customDepthMaterial = o.depth; else delete mesh.customDepthMaterial;
        if (o.distanceOwn) mesh.customDistanceMaterial = o.distance; else delete mesh.customDistanceMaterial;
        mesh.frustumCulled = o.frustum;
      });
      active = false;
    }
    function getStats() {
      return {schema: SCHEMA, active, disposed, meshCount: plan.meshCount, runtimeVertices: plan.runtimeVertices,
        frameSlotCount: disposed ? 0 : 2, residentFrames: disposed ? 0 : slots.filter(s => s.token !== null).length,
        residentFrameIndices: disposed ? [] : slots.filter(s => s.token !== null).map(s => s.frameIndex),
        residentOverlayFrameIndices: disposed ? [] : slots.filter(s => s.token !== null).map(s => s.overlayFrameIndex),
        overlayMeshCount: plan.records.filter(r => r.overlay).length,
        frameUploads, totalCopiedBytes, lastFramePackingMs, totalFramePackingMs, maxFramePackingMs,
        requestedTextureUploadBytes: frameUploads * plan.bytes.frameSlot, actualDriverUploadMs: null, pairUpdates, textureCount: ownedTextures.length, materialCount: ownedMaterials.length,
        cpuTypedArrayStagingBytes: disposed ? 0 : plan.bytes.total,
        logicalGpuCapacityBytes: disposed ? 0 : plan.bytes.total, peakLogicalGpuCapacityBytes: plan.bytes.total,
        bytes: {...plan.bytes}, actualDriverBytes: null,
        memoryCaveat: 'Logical texture payload and CPU upload arrays only; no browser/GPU allocation or timing was measured. Excludes existing geometry/material textures, decoded/compressed cache, JS objects, renderer staging and driver overhead.'};
    }
    function dispose() {
      if (disposed) return;
      reset(); disposed = true;
      for (const material of ownedMaterials) material.dispose();
      for (const t of ownedTextures) { t.dispose(); t.image.data = null; }
      common.e58Base.value = common.e58Map.value = common.e58FrameA.value = common.e58FrameB.value = null;
      ownedMaterials.length = ownedTextures.length = records.length = slots.length = 0;
    }
    return {apply, reset, dispose, getStats, plan};
  } catch (error) {
    for (const material of ownedMaterials) material.dispose();
    for (const t of ownedTextures) { t.dispose(); t.image.data = null; }
    throw error;
  }
}
