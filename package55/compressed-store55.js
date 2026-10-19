/**
 * Ephemeral, integrity-checked Einar55 compressed-frame preload store.
 * No CacheStorage, service worker, filesystem, cache mode override, or decoding.
 * frames entries require {url, sha256, compressedBytes}.
 */
export async function createCompressedStore55({
  frames,
  maxBytes,
  onProgress,
  signal,
  fetchImpl = globalThis.fetch,
} = {}) {
  const error = (code, message, cause) => {
    const result = new Error(`CompressedStore55: ${message}`, cause ? { cause } : undefined);
    result.name = 'CompressedStore55Error';
    result.code = code;
    return result;
  };
  const require = (condition, message) => {
    if (!condition) throw error('INVALID_CONFIG', message);
  };
  require(Array.isArray(frames) && frames.length > 0, 'frames must be a nonempty array');
  require(Number.isSafeInteger(maxBytes) && maxBytes > 0, 'maxBytes must be a positive safe integer');
  require(typeof fetchImpl === 'function', 'fetchImpl must be a function');
  require(onProgress === undefined || typeof onProgress === 'function', 'onProgress must be a function');
  require(signal === undefined || (typeof signal?.aborted === 'boolean' && typeof signal.addEventListener === 'function' && typeof signal.removeEventListener === 'function'), 'signal must be an AbortSignal');
  require(typeof globalThis.crypto?.subtle?.digest === 'function', 'crypto.subtle SHA-256 is required');
  require(typeof globalThis.Response === 'function', 'Response is required');
  const frameCount = frames.length;

  const pageURL = globalThis.location?.href;
  const pageOrigin = pageURL ? new URL(pageURL).origin : undefined;
  const normalizeURL = input => {
    try {
      const text = typeof input === 'string' || input instanceof URL ? input : input?.url;
      if (typeof text !== 'string' && !(text instanceof URL)) throw new TypeError('URL string is required');
      const url = new URL(text, pageURL);
      if (url.username || url.password) throw new TypeError('embedded URL credentials are not permitted');
      return url;
    } catch (cause) { throw error('INVALID_URL', 'invalid frame URL (relative URLs require location.href)', cause); }
  };
  const manifest = new Map();
  let expectedCompressedBytes = 0;
  frames.forEach((frame, index) => {
    require(frame && typeof frame === 'object', `frame ${index} must be an object`);
    require(typeof frame.url === 'string' && frame.url.length > 0, `frame ${index} requires a URL string`);
    require(typeof frame.sha256 === 'string' && /^[a-f\d]{64}$/i.test(frame.sha256), `frame ${index} requires a 64-character SHA-256`);
    require(Number.isSafeInteger(frame.compressedBytes) && frame.compressedBytes > 0, `frame ${index} compressedBytes must be a positive safe integer`);
    const url = normalizeURL(frame.url);
    const entry = Object.freeze({
      index, url: url.href, sha256: frame.sha256.toLowerCase(), compressedBytes: frame.compressedBytes,
      credentials: pageOrigin && pageOrigin !== 'null' && url.origin === pageOrigin ? 'same-origin' : 'omit',
    });
    const existing = manifest.get(entry.url);
    if (existing) {
      require(existing.sha256 === entry.sha256 && existing.compressedBytes === entry.compressedBytes,
        `duplicate URL for frame ${index} has conflicting size or SHA-256`);
      return; // Identical duplicate URLs share one verified allocation/download.
    }
    if (entry.compressedBytes > maxBytes - expectedCompressedBytes) {
      throw error('BYTE_BUDGET', `declared compressed frames exceed the ${maxBytes}-byte cap`);
    }
    expectedCompressedBytes += entry.compressedBytes;
    manifest.set(entry.url, entry);
  });

  const buffers = new Map();
  const controller = new AbortController();
  let disposed = false;
  let ready = false;
  let stopReason = null;
  let storedBytes = 0;
  let activeBuffer = null;
  let reader = null;
  let chunkBytes = 0;
  let activeRequests = 0;
  let stopReject;
  const stopped = new Promise((_, reject) => { stopReject = reject; });
  stopped.catch(() => {});
  const counters = {
    fetchAttempts: 0, fetchedFiles: 0, verifiedFiles: 0, downloadedBytes: 0,
    peakResidentCompressedBytes: 0, peakChunkBytes: 0, peakObservedCompressedBytes: 0,
    servedResponses: 0, servedCompressedBytes: 0,
  };
  const assertActive = () => { if (disposed) throw stopReason ?? error('DISPOSED', 'store has been disposed'); };
  const interruptible = promise => Promise.race([promise, stopped]);

  function getStats() {
    const loadingCompressedBytes = activeBuffer?.byteLength ?? 0;
    const residentCompressedBytes = storedBytes + loadingCompressedBytes;
    return {
      ...counters, ready, disposed, frameCount, uniqueFiles: manifest.size,
      maxBytes, expectedCompressedBytes, storedFiles: buffers.size,
      storedCompressedBytes: storedBytes, loadingCompressedBytes,
      residentCompressedBytes, chunkBytes,
      observedCompressedBytes: residentCompressedBytes + chunkBytes,
      activeRequests,
    };
  }

  function observeMemory() {
    const stats = getStats();
    counters.peakResidentCompressedBytes = Math.max(counters.peakResidentCompressedBytes, stats.residentCompressedBytes);
    counters.peakChunkBytes = Math.max(counters.peakChunkBytes, chunkBytes);
    counters.peakObservedCompressedBytes = Math.max(counters.peakObservedCompressedBytes, stats.observedCompressedBytes);
  }

  function progress(stage, entry, extra = {}) {
    observeMemory();
    if (!onProgress || disposed) return;
    try {
      const returned = onProgress({
        stage, index: entry?.index, url: entry?.url,
        loadedBytes: counters.downloadedBytes, totalBytes: expectedCompressedBytes,
        ...extra, stats: getStats(),
      });
      if (returned && typeof returned.then === 'function') Promise.resolve(returned).catch(() => {});
    } catch { /* Observers do not own preload lifecycle. */ }
  }

  function stop(reason) {
    if (disposed) return;
    disposed = true;
    ready = false;
    stopReason = reason;
    controller.abort(reason);
    stopReject(reason);
    if (reader) { try { void reader.cancel(reason).catch(() => {}); } catch { /* Already closed. */ } }
    buffers.clear();
    storedBytes = 0;
  }

  function dispose() {
    stop(error('DISPOSED', 'store has been disposed'));
  }

  const onAbort = () => stop(error('ABORTED', 'preload was aborted', signal?.reason));
  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });

  async function load(entry) {
    let ownReader = null;
    let response = null;
    let complete = false;
    try {
      assertActive();
      counters.fetchAttempts++;
      activeRequests = 1;
      progress('fetch', entry);
      assertActive();
      const transport = Promise.resolve().then(() => {
        assertActive();
        // Intentionally omit Request.cache: respect normal HTTP cache policy.
        return fetchImpl(entry.url, {
          credentials: entry.credentials, referrerPolicy: 'no-referrer', signal: controller.signal,
        });
      });
      // If a transport ignores cancellation, cancel any response that arrives late.
      void transport.then(response => {
        if (disposed && response?.body) { try { void response.body.cancel(stopReason).catch(() => {}); } catch { /* Already locked/closed. */ } }
      }, () => {});
      response = await interruptible(transport);
      assertActive();
      if (!response?.ok) throw error('HTTP_ERROR', `frame ${entry.index} fetch failed (HTTP ${response?.status ?? 'unknown'})`);
      if (!response.body || typeof response.body.getReader !== 'function') {
        throw error('BODY_UNAVAILABLE', `frame ${entry.index} requires a readable response body`);
      }
      // The sum of stored and fixed loading allocations can never exceed maxBytes.
      activeBuffer = new ArrayBuffer(entry.compressedBytes);
      observeMemory();
      const target = new Uint8Array(activeBuffer);
      ownReader = response.body.getReader();
      reader = ownReader;
      let offset = 0;
      for (;;) {
        const { done, value } = await interruptible(ownReader.read());
        assertActive();
        if (done) break;
        chunkBytes = value.byteLength;
        counters.downloadedBytes += chunkBytes;
        observeMemory();
        if (chunkBytes > entry.compressedBytes - offset) {
          throw error('COMPRESSED_SIZE', `frame ${entry.index} exceeds its declared ${entry.compressedBytes} compressed bytes`);
        }
        target.set(value, offset);
        offset += chunkBytes;
        progress('download', entry, { frameLoadedBytes: offset, frameTotalBytes: entry.compressedBytes });
        chunkBytes = 0;
      }
      activeRequests = 0;
      counters.fetchedFiles++;
      if (offset !== entry.compressedBytes) {
        throw error('COMPRESSED_SIZE', `frame ${entry.index} has ${offset} compressed bytes; expected ${entry.compressedBytes}`);
      }
      progress('verify', entry);
      assertActive();
      let digest;
      try { digest = await interruptible(globalThis.crypto.subtle.digest('SHA-256', activeBuffer)); }
      catch (cause) {
        assertActive();
        throw error('HASH_UNAVAILABLE', `frame ${entry.index} SHA-256 failed`, cause);
      }
      assertActive();
      const actual = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
      if (actual !== entry.sha256) throw error('HASH_MISMATCH', `frame ${entry.index} compressed SHA-256 mismatch`);
      buffers.set(entry.url, activeBuffer);
      storedBytes += activeBuffer.byteLength;
      activeBuffer = null; // Transfer ownership without copying the verified bytes.
      counters.verifiedFiles++;
      complete = true;
      progress('verified', entry);
      assertActive();
    } catch (cause) {
      if (disposed) throw stopReason;
      if (cause?.name === 'CompressedStore55Error') throw cause;
      throw error('PRELOAD_FAILED', `frame ${entry.index} could not be preloaded: ${cause?.message ?? cause}`, cause);
    } finally {
      activeRequests = 0;
      activeBuffer = null;
      chunkBytes = 0;
      if (ownReader) {
        if (!complete) { try { void ownReader.cancel().catch(() => {}); } catch { /* Preserve original error. */ } }
        try { ownReader.releaseLock(); } catch { /* Cancellation can still be settling. */ }
      } else if (!complete && response?.body) {
        try { void response.body.cancel().catch(() => {}); } catch { /* Preserve original error. */ }
      }
      if (reader === ownReader) reader = null;
    }
  }

  async function cachedFetch(input, init = {}) {
    assertActive();
    const url = normalizeURL(input).href;
    const method = String(init.method ?? input?.method ?? 'GET').toUpperCase();
    if (method !== 'GET' || init.body != null) throw error('METHOD_NOT_ALLOWED', 'stored frame requests must be GET without a body');
    if (!buffers.has(url)) throw error('UNKNOWN_URL', 'URL is not a verified frame in this store');
    const requestSignal = init.signal ?? input?.signal;
    await Promise.resolve(); // Let same-turn abort/dispose invalidate the response.
    assertActive();
    if (requestSignal?.aborted) throw error('ABORTED', 'stored frame request was aborted', requestSignal.reason);
    const buffer = buffers.get(url);
    // Response snapshots the BufferSource. Consumers cannot mutate verified store
    // bytes through body chunks or an arrayBuffer() result.
    const response = new Response(buffer, {
      status: 200,
      headers: { 'Content-Type': 'application/gzip', 'Content-Length': String(buffer.byteLength) },
    });
    counters.servedResponses++;
    counters.servedCompressedBytes += buffer.byteLength;
    return response;
  }

  try {
    assertActive();
    progress('start');
    for (const entry of manifest.values()) await load(entry);
    assertActive();
    ready = true;
    progress('ready');
    assertActive();
    return Object.freeze({ fetchImpl: cachedFetch, getStats, dispose });
  } catch (cause) {
    stop(cause);
    throw cause;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
