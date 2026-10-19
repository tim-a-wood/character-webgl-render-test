/**
 * Bounded, integrity-checked Einar55 decoded-frame cache (browser ES module).
 *
 * Wire format, little endian:
 *   [matrixBytes absolute Float32 bytes][Uint16 absolute/keyframe or delta words]
 * decodedSha256 covers the decompressed wire payload BEFORE delta reconstruction.
 * By default public frames own a copy. With copyFrames:false, returned frames are
 * stable read-only-by-contract views: consumers MUST NOT write to their buffers.
 * Reconstruction never changes previously returned buffers in either mode.
 * Caller-retained evicted frames/copies are outside cache ownership and counters.
 */
export function createFrameCache55({
  frames,
  matrixBytes,
  decodedBytes,
  onProgress,
  maxCachedFrames = 3,
  copyFrames = true,
  fetchImpl = globalThis.fetch,
} = {}) {
  const fail = (code, message, cause) => {
    const error = new Error(`FrameCache55: ${message}`, cause ? { cause } : undefined);
    error.name = 'FrameCache55Error';
    error.code = code;
    return error;
  };
  const require = (condition, message) => {
    if (!condition) throw fail('INVALID_CONFIG', message);
  };
  require(Array.isArray(frames) && frames.length > 0, 'frames must be a nonempty array');
  require(Number.isSafeInteger(decodedBytes) && decodedBytes > 0, 'decodedBytes must be a positive safe integer');
  require(Number.isSafeInteger(matrixBytes) && matrixBytes >= 0 && matrixBytes % 4 === 0,
    'matrixBytes must be a nonnegative multiple of 4');
  require(matrixBytes <= decodedBytes && (decodedBytes - matrixBytes) % 2 === 0,
    'decodedBytes must hold the matrix prefix and whole Uint16 values');
  require(Number.isSafeInteger(maxCachedFrames) && maxCachedFrames >= 1,
    'maxCachedFrames must be a positive safe integer');
  require(typeof fetchImpl === 'function', 'fetchImpl must be a function');
  require(typeof copyFrames === 'boolean', 'copyFrames must be boolean');
  require(onProgress === undefined || typeof onProgress === 'function', 'onProgress must be a function');
  require(typeof globalThis.DecompressionStream === 'function', 'DecompressionStream is required');
  require(typeof globalThis.crypto?.subtle?.digest === 'function', 'crypto.subtle SHA-256 is required');
  require(new Uint8Array(new Uint16Array([1]).buffer)[0] === 1, 'little-endian typed arrays are required');

  const pageURL = globalThis.location?.href;
  const pageOrigin = pageURL ? new URL(pageURL).origin : undefined;
  const keyframes = [];
  // Snapshot the manifest: subsequent caller edits cannot change a running cache.
  const manifest = frames.map((frame, index) => {
    require(frame && typeof frame === 'object', `frame ${index} must be an object`);
    require(Number.isFinite(frame.time), `frame ${index} time must be finite`);
    require(index === 0 || frame.time > frames[index - 1].time, 'frame times must be strictly increasing');
    require(typeof frame.keyframe === 'boolean', `frame ${index} keyframe must be boolean`);
    require(index !== 0 || frame.keyframe, 'first frame must be a keyframe');
    require(typeof frame.sha256 === 'string' && /^[a-f\d]{64}$/i.test(frame.sha256),
      `frame ${index} requires a 64-character compressed SHA-256`);
    require(typeof frame.decodedSha256 === 'string' && /^[a-f\d]{64}$/i.test(frame.decodedSha256),
      `frame ${index} requires a 64-character decoded SHA-256`);
    require(typeof frame.url === 'string' && frame.url.length > 0, `frame ${index} requires a URL string`);
    let url;
    try { url = new URL(frame.url, pageURL); }
    catch (cause) { throw fail('INVALID_CONFIG', `frame ${index} has an invalid URL (relative URLs require location.href)`, cause); }
    require(!url.username && !url.password, `frame ${index} URL must not embed credentials`);
    if (frame.keyframe) keyframes.push(index);
    return Object.freeze({
      time: frame.time, url: url.href, keyframe: frame.keyframe,
      sha256: frame.sha256.toLowerCase(), decodedSha256: frame.decodedSha256.toLowerCase(),
      credentials: pageOrigin && pageOrigin !== 'null' && url.origin === pageOrigin ? 'same-origin' : 'omit',
      baseKeyframe: keyframes[keyframes.length - 1],
    });
  });

  const cache = new Map(); // Oldest access first. Published buffers are never changed.
  const sharedFrames = new WeakMap(); // Does not retain evicted buffers.
  const pending = new Map();
  const queue = [];
  const counters = {
    fetchCount: 0, fetchedCount: 0, decodedCount: 0, cacheHits: 0,
    coalescedRequests: 0, evictions: 0, peakCachedFrames: 0,
    decodedBufferAllocations: 0, totalDecodedAllocatedBytes: 0,
    snapshotCopies: 0, snapshotCopiedBytes: 0,
    peakWorkingDecodedBuffers: 0, peakWorkingDecodedBytes: 0,
    peakResidentDecodedBytes: 0,
  };
  let disposed = false;
  let running = false;
  let activeController = null;
  let activeReader = null;
  let activeDecodedBuffer = null;
  let chunkBytes = 0;
  let activeFetches = 0;
  const disposedError = () => fail('DISPOSED', 'cache has been disposed');
  const assertActive = () => { if (disposed) throw disposedError(); };

  function getStats() {
    const workingDecodedBytes = (activeDecodedBuffer?.byteLength ?? 0) + chunkBytes;
    const workingDecodedBuffers = Number(activeDecodedBuffer !== null) + Number(chunkBytes > 0);
    return {
      ...counters, disposed, frameCount: manifest.length, maxCachedFrames, copyFrames,
      cachedFrames: cache.size, cachedDecodedBytes: cache.size * decodedBytes,
      inflight: pending.size,
      queued: queue.reduce((count, entry) => count + Number(pending.get(entry.index)?.token === entry.token), 0),
      activeFetches, workingDecodedBuffers, workingDecodedBytes,
      residentDecodedBytes: cache.size * decodedBytes + workingDecodedBytes,
    };
  }

  function observeMemory() {
    const stats = getStats();
    counters.peakCachedFrames = Math.max(counters.peakCachedFrames, stats.cachedFrames);
    counters.peakWorkingDecodedBuffers = Math.max(counters.peakWorkingDecodedBuffers, stats.workingDecodedBuffers);
    counters.peakWorkingDecodedBytes = Math.max(counters.peakWorkingDecodedBytes, stats.workingDecodedBytes);
    counters.peakResidentDecodedBytes = Math.max(counters.peakResidentDecodedBytes, stats.residentDecodedBytes);
  }

  function progress(stage, index, extra = {}) {
    observeMemory();
    if (disposed) return;
    // An observer cannot poison an otherwise valid decode or leak its rejection.
    if (onProgress) {
      try {
        const result = onProgress({ stage, index, time: manifest[index]?.time, ...extra, stats: getStats() });
        if (result && typeof result.then === 'function') Promise.resolve(result).catch(() => {});
      } catch { /* Callback failures are deliberately isolated. */ }
    }
  }

  function touch(index) {
    const buffer = cache.get(index);
    if (buffer) { cache.delete(index); cache.set(index, buffer); }
    return buffer;
  }

  function owned(index, source) {
    if (!copyFrames && sharedFrames.has(source)) return sharedFrames.get(source);
    const buffer = copyFrames ? source.slice(0) : source;
    if (copyFrames) {
      counters.snapshotCopies++;
      counters.snapshotCopiedBytes += buffer.byteLength;
      counters.totalDecodedAllocatedBytes += buffer.byteLength;
    }
    const frame = Object.freeze({
      index, time: manifest[index].time, buffer,
      matrices: new Float32Array(buffer, 0, matrixBytes / 4),
      values: new Uint16Array(buffer, matrixBytes, (decodedBytes - matrixBytes) / 2),
    });
    if (!copyFrames) sharedFrames.set(source, frame);
    return frame;
  }

  function resolvePending(index, buffer) {
    const job = pending.get(index);
    if (job) { pending.delete(index); job.resolve(buffer); }
  }

  async function verifyHash(buffer, expected, kind, index) {
    assertActive();
    let digest;
    try { digest = await globalThis.crypto.subtle.digest('SHA-256', buffer); }
    catch (cause) { throw fail('HASH_UNAVAILABLE', `frame ${index} ${kind} SHA-256 failed`, cause); }
    assertActive();
    const actual = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
    if (actual !== expected) throw fail('HASH_MISMATCH', `frame ${index} ${kind} SHA-256 mismatch`);
  }

  async function readPayload(index) {
    const frame = manifest[index];
    const controller = new AbortController();
    activeController = controller;
    let reader = null;
    let success = false;
    try {
      assertActive();
      counters.fetchCount++;
      activeFetches++;
      let response;
      let compressed;
      try {
        progress('fetch', index);
        assertActive();
        response = await fetchImpl(frame.url, {
          credentials: frame.credentials, referrerPolicy: 'no-referrer', signal: controller.signal,
        });
        assertActive();
        if (!response?.ok) throw fail('HTTP_ERROR', `frame ${index} fetch failed (HTTP ${response?.status ?? 'unknown'})`);
        compressed = await response.arrayBuffer();
        assertActive();
        counters.fetchedCount++;
      } finally {
        activeFetches--;
      }
      await verifyHash(compressed, frame.sha256, 'compressed', index);
      assertActive();
      // Read incrementally into exactly one fixed-size frame allocation. A
      // second temporary native decoder chunk is discarded after each copy.
      // Never use Response(decompressedStream).arrayBuffer(), which may inflate
      // arbitrarily before its output size can be checked.
      activeDecodedBuffer = new ArrayBuffer(decodedBytes);
      counters.decodedBufferAllocations++;
      counters.totalDecodedAllocatedBytes += decodedBytes;
      const target = new Uint8Array(activeDecodedBuffer);
      const source = new ReadableStream({
        start(streamController) { streamController.enqueue(new Uint8Array(compressed)); streamController.close(); },
      });
      reader = source.pipeThrough(new DecompressionStream('gzip')).getReader();
      activeReader = reader;
      progress('decode', index, { loadedBytes: 0, totalBytes: decodedBytes });
      let offset = 0;
      for (;;) {
        assertActive();
        const { done, value } = await reader.read();
        assertActive();
        if (done) break;
        chunkBytes = value.byteLength;
        observeMemory();
        if (chunkBytes > decodedBytes - offset) {
          throw fail('DECODED_SIZE', `frame ${index} decoded size exceeds ${decodedBytes} bytes`);
        }
        target.set(value, offset);
        offset += chunkBytes;
        progress('decode', index, { loadedBytes: offset, totalBytes: decodedBytes });
        chunkBytes = 0;
      }
      if (offset !== decodedBytes) {
        throw fail('DECODED_SIZE', `frame ${index} decoded size is ${offset}; expected ${decodedBytes} bytes`);
      }
      await verifyHash(activeDecodedBuffer, frame.decodedSha256, 'decoded', index);
      counters.decodedCount++;
      success = true;
      return activeDecodedBuffer;
    } catch (cause) {
      if (disposed) throw disposedError();
      if (cause?.name === 'FrameCache55Error') throw cause;
      throw fail('FRAME_LOAD_FAILED', `frame ${index} could not be fetched or decoded: ${cause?.message ?? cause}`, cause);
    } finally {
      chunkBytes = 0;
      if (!success) activeDecodedBuffer = null;
      if (reader) {
        if (!success) { try { await reader.cancel(); } catch { /* Preserve the original failure. */ } }
        try { reader.releaseLock(); } catch { /* Cancellation may still be finishing. */ }
      }
      if (activeReader === reader) activeReader = null;
      if (activeController === controller) activeController = null;
    }
  }

  async function ensureFrame(index) {
    assertActive();
    const exact = touch(index);
    if (exact) return exact;
    const keyframe = manifest[index].baseKeyframe;
    let previous = -1;
    for (const cachedIndex of cache.keys()) {
      if (cachedIndex >= keyframe && cachedIndex < index && cachedIndex > previous) previous = cachedIndex;
    }
    const start = previous >= keyframe ? previous + 1 : keyframe;
    for (let current = start; current <= index; current++) {
      assertActive();
      const buffer = await readPayload(current);
      try {
        assertActive();
        if (!manifest[current].keyframe) {
          const priorBuffer = cache.get(current - 1);
          if (!priorBuffer) throw fail('MISSING_BASE', `frame ${current} is missing its reconstructed predecessor`);
          const prior = new Uint16Array(priorBuffer, matrixBytes);
          const values = new Uint16Array(buffer, matrixBytes);
          // Uint16 assignment performs modulo-65536 wrapping, including deltas
          // encoded as two's-complement negative values. Matrix prefix is untouched.
          for (let word = 0; word < values.length; word++) values[word] = values[word] + prior[word];
        }
        while (cache.size >= maxCachedFrames) {
          cache.delete(cache.keys().next().value);
          counters.evictions++;
        }
        cache.set(current, buffer);
        activeDecodedBuffer = null; // Ownership transfers from workspace to cache.
        resolvePending(current, buffer); // Also serves overlapping queued seeks.
        progress('ready', current);
      } finally {
        activeDecodedBuffer = null;
      }
    }
    assertActive();
    return touch(index);
  }

  async function drain() {
    try {
      while (!disposed && queue.length) {
        const entry = queue.shift();
        const job = pending.get(entry.index);
        if (!job || job.token !== entry.token) continue;
        try {
          const buffer = await ensureFrame(job.index);
          assertActive();
          resolvePending(job.index, buffer);
        } catch (error) {
          if (pending.get(job.index) === job) { pending.delete(job.index); job.reject(error); }
          progress('error', job.index, { error });
        }
      }
    } finally {
      running = false;
    }
  }

  function getFrame(index) {
    try {
      assertActive();
      if (!Number.isInteger(index) || index < 0 || index >= manifest.length) {
        throw fail('INVALID_INDEX', `frame index must be an integer between 0 and ${manifest.length - 1}`);
      }
      const cached = touch(index);
      if (cached) {
        counters.cacheHits++;
        return Promise.resolve().then(() => { assertActive(); return owned(index, cached); });
      }
      let job = pending.get(index);
      if (job) {
        counters.coalescedRequests++;
      } else {
        job = { index, token: Symbol() };
        job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
        pending.set(index, job);
        // Queue only lightweight identities. Keeping resolved job promises here
        // would pin every intermediate decoded buffer during a long queued seek.
        queue.push({ index, token: job.token });
      }
      const result = job.promise.then(buffer => { assertActive(); return owned(index, buffer); });
      if (!running) { running = true; void drain(); }
      return result;
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async function getPair(time) {
    assertActive();
    if (!Number.isFinite(time)) throw fail('INVALID_TIME', 'pair time must be finite');
    let lower = 0;
    let upper = manifest.length - 1;
    if (time <= manifest[0].time) upper = 0;
    else if (time >= manifest[upper].time) lower = upper;
    else {
      while (upper - lower > 1) {
        const middle = Math.floor((lower + upper) / 2);
        if (manifest[middle].time <= time) lower = middle;
        else upper = middle;
      }
      if (time === manifest[lower].time) upper = lower;
    }
    let mix = 0;
    if (lower !== upper) {
      const start = manifest[lower].time;
      const end = manifest[upper].time;
      const span = end - start;
      // Finite endpoints may still overflow on subtraction. Halving first
      // preserves a finite interpolation ratio for extremely wide timelines.
      mix = Number.isFinite(span) ? (time - start) / span : (time / 2 - start / 2) / (end / 2 - start / 2);
    }
    const [a, b] = await Promise.all([getFrame(lower), getFrame(upper)]);
    assertActive();
    return { a, b, mix };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    activeController?.abort(disposedError());
    if (activeReader) { try { void activeReader.cancel(disposedError()).catch(() => {}); } catch { /* Already closed. */ } }
    for (const job of pending.values()) job.reject(disposedError());
    pending.clear();
    queue.length = 0;
    cache.clear();
  }

  return Object.freeze({ getFrame, getPair, dispose, getStats });
}
