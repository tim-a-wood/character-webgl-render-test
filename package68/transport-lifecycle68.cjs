'use strict';
// Instrumented diagnostic: browser API observation may affect timing.
// Evaluated runtime asset bytes stay unchanged. No retries, retention fix, or abort exemptions.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const inputs = JSON.parse(fs.readFileSync(path.join(__dirname, 'proof-inputs68.json')));
const files = new Map(inputs.localFiles.map(f => [f.path, f]));
const allowedExternal = new Set(inputs.externalAssets.map(a => a.url));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const check = (ok, message) => { if (!ok) throw Error(message); };
check(inputs.mode === 'pilot' && inputs.nativeSamples === 3, 'Exact three-pose pilot required');
for (const f of inputs.localFiles) {
  const target = path.resolve(root, f.path);
  check(target.startsWith(root + path.sep) && !fs.lstatSync(target).isSymbolicLink(), 'Unsafe local file');
  const bytes = fs.readFileSync(target);
  check(bytes.length === f.bytes && hash(bytes) === f.sha256, 'Frozen file hash mismatch: ' + f.path);
}
const manifestPath = 'package68/packed68/manifest68.json';
const manifestBytes = fs.readFileSync(path.join(root, manifestPath));
const manifest = JSON.parse(manifestBytes);
check(manifest.frames.length === 3 && manifest.staticOnly === true && manifest.playbackAllowed === false && manifest.interpolationAllowed === false, 'Exact-pose-only manifest');
const framePaths = new Set(manifest.frames.map(f => path.posix.normalize(path.posix.join(path.posix.dirname(manifestPath), f.url))));
check(framePaths.size === 3 && [...framePaths].every(p => files.has(p) && /^package68\/packed68\/frame-\d+-source-(539|571|618)\.bin\.gz$/.test(p)), 'Explicit three-frame local allowlist');
const started = process.hrtime.bigint();
const elapsedMs = () => Number(process.hrtime.bigint() - started) / 1e6;
const events = [], errors = [], failures = [], cdpFailures = [], responseErrors = [], blocked = [], requests = [];
let seq = 0, serverId = 0, requestId = 0, origin, browser, page, phase = 'setup';
const record = (layer, event, data = {}) => {
  const row = { seq: ++seq, elapsedMs: elapsedMs(), phase, layer, event, ...data };
  events.push(row);
  console.log('TRANSPORT68_EVENT', JSON.stringify(row));
};
const localFramePath = url => {
  try { const u = new URL(url); return u.origin === origin && framePaths.has(u.pathname.slice(1)) ? u.pathname.slice(1) : null; }
  catch { return null; }
};
const server = http.createServer((req, res) => {
  let id, framePath;
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1);
    check(files.has(name), 'Not in explicit runtime allowlist');
    const f = files.get(name), file = path.resolve(root, name);
    check(file.startsWith(root + path.sep), 'Path traversal');
    const bytes = fs.readFileSync(file);
    check(bytes.length === f.bytes && hash(bytes) === f.sha256, 'Served file changed');
    if (framePaths.has(name)) {
      id = ++serverId; framePath = name;
      record('server', 'request', { id, path: framePath, method: req.method, expectedBytes: bytes.length, sha256: f.sha256 });
      req.on('aborted', () => record('server', 'request-aborted', { id, path: framePath, complete: req.complete }));
      req.on('error', e => record('server', 'request-error', { id, path: framePath, error: e.message }));
      res.on('finish', () => record('server', 'response-finish', { id, path: framePath, status: res.statusCode, writableFinished: res.writableFinished, declaredBytes: bytes.length }));
      res.on('close', () => record('server', 'response-close', { id, path: framePath, writableFinished: res.writableFinished, destroyed: res.destroyed }));
      res.on('error', e => record('server', 'response-error', { id, path: framePath, error: e.message }));
    }
    res.writeHead(200, {
      'Content-Type': { '.js': 'application/javascript', '.mjs': 'application/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.wasm': 'application/wasm', '.md': 'text/plain' }[path.extname(file)] || 'application/octet-stream',
      'Content-Length': bytes.length, 'Cache-Control': 'no-store',
    });
    res.end(bytes);
  } catch (error) { res.writeHead(404).end('Not found'); }
});
const pwRequests = new Map(), cdpRequests = new Map(), responseWaits = [], pendingResponses = new Set();
let loadedState = null, rendered = null, lifecycle = null, lifecycleSnapshotError = null, emittedReport = false;
async function snapshotLifecycle() {
  if (!page || page.isClosed()) return;
  let timer;
  try {
    lifecycle = await Promise.race([
      page.evaluate(() => globalThis.__transportLifecycle68?.snapshot() ?? null),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Lifecycle snapshot exceeded 1500ms')), 1500); }),
    ]);
  } catch (error) { lifecycleSnapshotError = error.message; }
  finally { clearTimeout(timer); }
}
function report(stage) {
  const result = {
    format: 'einar68-instrumented-transport-lifecycle-v1', stage, phase,
    manifestSha256: hash(manifestBytes), threeNativePosesOnly: true,
    fullWalkClaim: false, realTimePerformanceClaim: false,
    strictRequestFailureCheck: true, runtimeAssetBytesModified: false, retriesPerformed: false,
    instrumentedDiagnostic: true, browserApiObservationInstalled: true, instrumentationMayAffectTiming: true,
    loadedState, rendered, lifecycle, lifecycleSnapshotError, events, errors, failures, cdpFailures, responseErrors, blocked,
    limitations: ['Three frame payloads preloaded, one exact pose rendered', 'No abort is exempted from failure', 'Server finish proves handoff to the local socket, not browser receipt', 'JS call observation cannot prove the initiator of an internal browser cancellation', 'WeakMaps do not intentionally retain response, body, reader, or buffer objects; observers can still perturb timing'],
  };
  fs.mkdirSync(path.join(__dirname, 'proof-results68'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'proof-results68', 'transport-lifecycle68.json'), JSON.stringify(result, null, 2));
  console.log('TRANSPORT68_REPORT', JSON.stringify(result));
  emittedReport = true;
}
async function runProbe() {
  check(require('playwright-core/package.json').version === '1.57.0', 'Exact Playwright1.57.0 required');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'chromium', headless: true, chromiumSandbox: true, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'], args: ['--use-gl=angle', '--use-angle=swiftshader'], timeout: 60000 });
  const browserSession = await browser.newBrowserCDPSession();
  const command = await browserSession.send('Browser.getBrowserCommandLine');
  check(!command.arguments.some(a => ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu-sandbox', '--enable-unsafe-swiftshader', '--disable-web-security', '--ignore-gpu-blocklist', '--ignore-certificate-errors'].some(f => a === f || a.startsWith(f + '='))), 'Unsafe Chromium flag');
  console.log('BROWSER68', JSON.stringify({ version: await browser.version(), arguments: command.arguments, sandbox: true, softwareRenderer: true }));
  const context = await browser.newContext({ viewport: { width: 738, height: 480 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await context.addInitScript(({ origin, paths }) => {
    // Keep only primitive records. The maps below hold their keys weakly.
    const allowed = new Set(paths), bodies = new WeakMap(), readers = new WeakMap(), signals = new WeakMap();
    const observed = [], observerErrors = [], installedMethods = [];
    let nextId = 0, dropped = 0;
    const safeObserve = fn => { try { fn(); } catch (error) { observerErrors.push(error?.name || 'ObserverError'); } };
    function emit(kind, details = {}) {
      if (observed.length >= 256) { dropped++; return; }
      observed.push({ kind, performanceMs: performance.now(), wallMs: Date.now(), ...details,
        stack: new Error('Frame lifecycle observation').stack?.split('\n').slice(2, 10).join('\n') ?? null });
    }
    function info(record) { return { frameRequestId: record.id, path: record.path }; }
    function install(object, key, wrap) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (!descriptor || typeof descriptor.value !== 'function') throw Error('Native method unavailable: ' + key);
      Object.defineProperty(object, key, { ...descriptor, value: wrap(descriptor.value) });
      installedMethods.push(key);
    }
    install(globalThis, 'fetch', original => function (...args) {
      // Return the very same native Promise, not a replacement Promise.
      const promise = Reflect.apply(original, this, args);
      safeObserve(() => {
        const input = args[0], init = args[1];
        const text = typeof input === 'string' || input instanceof URL ? input : input?.url;
        const url = new URL(text, location.href), path = url.pathname.slice(1);
        if (url.origin !== origin || !allowed.has(path)) return;
        const record = { id: ++nextId, path, readCalls: 0, readBytes: 0, doneCount: 0 };
        const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
        if (signal) {
          let framePaths = signals.get(signal);
          if (!framePaths) {
            framePaths = new Set(); signals.set(signal, framePaths);
            signal.addEventListener('abort', () => safeObserve(() => emit('signal-abort-event', { paths: [...framePaths] })), { once: true });
          }
          framePaths.add(path);
        }
        emit('frame-fetch-called', { ...info(record), signalAlreadyAborted: signal?.aborted ?? false });
        // Tag the response body before the caller's continuation, without retaining it.
        void promise.then(response => safeObserve(() => {
          if (response.body) bodies.set(response.body, record);
          emit('frame-fetch-resolved', { ...info(record), status: response.status, bodyPresent: !!response.body });
        }), () => safeObserve(() => emit('frame-fetch-rejected', info(record))));
      });
      return promise;
    });
    install(AbortController.prototype, 'abort', original => function (...args) {
      safeObserve(() => { const paths = signals.get(this.signal); if (paths) emit('AbortController.abort', { paths: [...paths], argumentCount: args.length }); });
      return Reflect.apply(original, this, args);
    });
    install(ReadableStream.prototype, 'getReader', original => function (...args) {
      const reader = Reflect.apply(original, this, args);
      safeObserve(() => { const record = bodies.get(this); if (record) { readers.set(reader, record); emit('stream-getReader', info(record)); } });
      return reader;
    });
    install(ReadableStream.prototype, 'cancel', original => function (...args) {
      safeObserve(() => { const record = bodies.get(this); if (record) emit('ReadableStream.cancel', { ...info(record), argumentCount: args.length }); });
      return Reflect.apply(original, this, args);
    });
    install(ReadableStreamDefaultReader.prototype, 'cancel', original => function (...args) {
      safeObserve(() => { const record = readers.get(this); if (record) emit('reader.cancel', { ...info(record), argumentCount: args.length }); });
      return Reflect.apply(original, this, args);
    });
    install(ReadableStreamDefaultReader.prototype, 'releaseLock', original => function (...args) {
      safeObserve(() => { const record = readers.get(this); if (record) emit('reader.releaseLock', { ...info(record), readCalls: record.readCalls, readBytes: record.readBytes, doneCount: record.doneCount }); });
      return Reflect.apply(original, this, args);
    });
    install(ReadableStreamDefaultReader.prototype, 'read', original => function (...args) {
      const promise = Reflect.apply(original, this, args);
      safeObserve(() => {
        const record = readers.get(this); if (!record) return;
        record.readCalls++;
        // Same Promise/values/errors go to the caller. Never store a chunk or result.
        void promise.then(result => safeObserve(() => {
          if (result.done) { record.doneCount++; emit('reader.read-done', { ...info(record), readCalls: record.readCalls, readBytes: record.readBytes, doneCount: record.doneCount }); }
          else record.readBytes += result.value.byteLength;
        }), () => safeObserve(() => emit('reader.read-rejected', info(record))));
      });
      return promise;
    });
    globalThis.__transportLifecycle68 = Object.freeze({ snapshot: () => ({
      instrumentedDiagnostic: true, installedMethods: [...installedMethods], trackedFrameFetches: nextId,
      dropped, observerErrors: [...observerErrors], events: observed.map(x => ({ ...x })),
    }) });
  }, { origin, paths: [...framePaths] });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (new URL(url).origin === origin || allowedExternal.has(url)) return route.continue();
    blocked.push(url); return route.abort();
  });
  page = await context.newPage(); page.setDefaultTimeout(180000);
  page.on('request', request => {
    requests.push(request.url()); const p = localFramePath(request.url()); if (!p) return;
    const id = ++requestId; pwRequests.set(request, { id, path: p, terminal: false });
    record('playwright', 'request', { id, url: request.url(), path: p, method: request.method(), resourceType: request.resourceType(), redirectedFrom: !!request.redirectedFrom() });
  });
  page.on('response', response => {
    if (response.status() >= 400) errors.push('HTTP ' + response.status() + ' ' + response.url());
    const r = pwRequests.get(response.request()); if (!r) return;
    const h = response.headers();
    record('playwright', 'response', { id: r.id, url: response.url(), path: r.path, status: response.status(), contentLength: h['content-length'] ?? null, contentType: h['content-type'] ?? null });
    pendingResponses.add(r.id);
    responseWaits.push(response.finished().then(error => {
      const result = { id: r.id, path: r.path, error: error?.message ?? null };
      if (error) responseErrors.push(result);
      record('playwright', 'response-finished-result', result);
    }, error => {
      const result = { id: r.id, path: r.path, error: error.message };
      responseErrors.push(result);
      record('playwright', 'response-finished-rejected', result);
    }).finally(() => pendingResponses.delete(r.id)));
  });
  page.on('requestfinished', request => {
    const r = pwRequests.get(request); if (!r) return; r.terminal = true;
    record('playwright', 'requestfinished', { id: r.id, path: r.path, timing: request.timing() });
  });
  page.on('requestfailed', request => {
    const failure = { url: request.url(), error: request.failure()?.errorText }; failures.push(failure);
    const r = pwRequests.get(request); if (!r) return; r.terminal = true;
    record('playwright', 'requestfailed', { id: r.id, path: r.path, ...failure, timing: request.timing() });
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const cdp = await context.newCDPSession(page);
  cdp.on('Network.requestWillBeSent', e => {
    const p = localFramePath(e.request.url); if (!p) return;
    cdpRequests.set(e.requestId, { path: p, terminal: false });
    record('cdp', 'requestWillBeSent', { requestId: e.requestId, path: p, url: e.request.url, method: e.request.method, timestamp: e.timestamp, wallTime: e.wallTime, type: e.type, initiatorType: e.initiator?.type, redirect: e.redirectResponse ? { status: e.redirectResponse.status, url: localFramePath(e.redirectResponse.url) ? e.redirectResponse.url : '[non-frame redirect]', encodedDataLength: e.redirectResponse.encodedDataLength } : null });
  });
  cdp.on('Network.responseReceived', e => {
    const r = cdpRequests.get(e.requestId); if (!r) return;
    const x = e.response;
    record('cdp', 'responseReceived', { requestId: e.requestId, path: r.path, timestamp: e.timestamp, status: x.status, mimeType: x.mimeType, protocol: x.protocol, encodedDataLength: x.encodedDataLength, fromDiskCache: !!x.fromDiskCache, fromServiceWorker: !!x.fromServiceWorker, timing: x.timing });
  });
  cdp.on('Network.dataReceived', e => {
    const r = cdpRequests.get(e.requestId); if (!r) return;
    record('cdp', 'dataReceived', { requestId: e.requestId, path: r.path, timestamp: e.timestamp, dataLength: e.dataLength, encodedDataLength: e.encodedDataLength });
  });
  cdp.on('Network.loadingFinished', e => {
    const r = cdpRequests.get(e.requestId); if (!r) return; r.terminal = true;
    record('cdp', 'loadingFinished', { requestId: e.requestId, path: r.path, timestamp: e.timestamp, encodedDataLength: e.encodedDataLength });
  });
  cdp.on('Network.loadingFailed', e => {
    const r = cdpRequests.get(e.requestId); if (!r) return; r.terminal = true;
    const failure = { requestId: e.requestId, path: r.path, timestamp: e.timestamp, errorText: e.errorText, canceled: !!e.canceled, blockedReason: e.blockedReason ?? null, corsErrorStatus: e.corsErrorStatus ?? null, type: e.type };
    cdpFailures.push(failure);
    record('cdp', 'loadingFailed', failure);
  });
  await cdp.send('Network.enable'); // Observation only: no cache override or network interception here.
  phase = 'head-load';
  await page.goto(origin + '/package68/full-demo/index.html?qa68', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: 'main{grid-template-columns:384px 340px}#viewport{width:384px;height:480px;min-height:480px}' });
  await page.waitForFunction(() => window.einarDemoQA68);
  const idle = () => page.evaluate(() => window.einarDemoQA68.scheduler.whenIdle());
  await idle();
  check(!requests.some(url => allowedExternal.has(url) || url.includes('/packed68/') || url.includes('/packed55/') || url.includes('mappings55')), 'Eager assets before explicit load');
  await page.evaluate(() => window.einarDemoQA68.load()); await idle();
  check(!requests.some(url => (allowedExternal.has(url) && /einar-body|body-motion42/.test(url)) || /\/packed68\/|\/packed55\/|mappings55/.test(url)), 'Eager body/motion during head-only load');
  phase = 'body-load';
  await page.evaluate(() => window.einarDemoQA68.loadBody()); await idle();
  loadedState = await page.evaluate(() => window.einarDemoQA68.getPlayer().getState());
  record('runtime', 'loadBody-ready', { compressedStore: loadedState.compressedStore, cache: loadedState.cache, playerError: loadedState.error });
  phase = 'exact-pose';
  rendered = await page.evaluate(async () => {
    const q = window.einarDemoQA68, frame = q.config.frames[2];
    if (q.config.mode !== 'pilot' || q.config.frames.length !== 3 || frame.sourceFrame !== 618 || Math.abs(frame.time - 1.316693) > 1e-12) throw Error('Unexpected diagnostic pose');
    q.clock.seek(frame.time); await q.getPlayer().whenReady();
    await q.scheduler.whenRendered(q.scheduler.invalidate('transport-exact-pose'));
    const gl = q.renderer.getContext(), width = gl.drawingBufferWidth, height = gl.drawingBufferHeight, pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const rawSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)), n => n.toString(16).padStart(2, '0')).join('');
    return { sourceFrame: frame.sourceFrame, time: frame.time, width, height, rawSha256, glError: gl.getError(), draws: { ...q.renderer.info.render }, player: q.getPlayer().getState() };
  });
  record('runtime', 'exact-pose-rendered', rendered);
  phase = 'bounded-observation';
  await page.waitForTimeout(5000); // Fixed observation window, not a retry or cancellation.
  await Promise.race([Promise.allSettled(responseWaits), page.waitForTimeout(1000)]);
  const pending = { responseFinishedIds: [...pendingResponses], playwright: [...pwRequests.values()].filter(r => !r.terminal), cdp: [...cdpRequests.entries()].filter(([, r]) => !r.terminal).map(([id, r]) => ({ requestId: id, ...r })) };
  record('probe', 'observation-ended', { pending });
  await snapshotLifecycle();
  // Emit all evidence before any result assertion or lifecycle teardown.
  report('before-final-checks');
  check(lifecycle?.trackedFrameFetches === 3 && lifecycle.dropped === 0 && lifecycle.observerErrors.length === 0 && lifecycleSnapshotError === null, 'Complete frame-only lifecycle observation');
  check(lifecycle.installedMethods.length === 7, 'All requested native API observations installed');
  for (const frame of manifest.frames) {
    const framePath = path.posix.normalize(path.posix.join(path.posix.dirname(manifestPath), frame.url));
    const observations = lifecycle.events.filter(e => e.path === framePath);
    const only = kind => { const rows = observations.filter(e => e.kind === kind); check(rows.length === 1, 'One lifecycle ' + kind + ' for ' + framePath); return rows[0]; };
    only('frame-fetch-called');
    const resolved = only('frame-fetch-resolved');
    check(resolved.status === 200 && resolved.bodyPresent, 'Observed successful frame response');
    only('stream-getReader');
    for (const kind of ['reader.read-done', 'reader.releaseLock']) {
      const observed = only(kind);
      check(observed.doneCount === 1 && observed.readBytes === frame.compressedBytes && observed.readCalls >= 2, 'Observed complete read boundary for ' + framePath);
    }
  }
  const s = loadedState.compressedStore, expectedBytes = manifest.frames.reduce((sum, f) => sum + f.compressedBytes, 0);
  check(s.ready && !s.disposed && s.fetchAttempts === 3 && s.fetchedFiles === 3 && s.verifiedFiles === 3 && s.downloadedBytes === expectedBytes && s.activeRequests === 0, 'Three complete integrity-verified payloads');
  check(rendered.glError === 0 && rendered.draws.calls > 0 && rendered.draws.triangles > 0 && Math.abs(rendered.player.time - 1.316693) < 1e-12 && !rendered.player.playing && rendered.player.error === null, 'One exact static pose rendered');
  const cache = rendered.player.cache;
  check(cache.fetchCount === 3 && cache.fetchedCount === 3 && cache.decodedCount === 3 && cache.inflight === 0 && cache.activeFetches === 0 && !cache.disposed, 'Final exact pose decoded all three native payloads');
  check([...framePaths].every(p => [...pwRequests.values()].filter(r => r.path === p).length === 1 && [...cdpRequests.values()].filter(r => r.path === p).length === 1), 'Exactly one observed Playwright and CDP request per allowed frame path');
  check(pwRequests.size === 3 && cdpRequests.size === 3 && pending.playwright.length === 0 && pending.cdp.length === 0 && pending.responseFinishedIds.length === 0, 'One terminal network request per frame required');
  check(errors.length === 0 && failures.length === 0 && cdpFailures.length === 0 && responseErrors.length === 0 && blocked.length === 0, JSON.stringify({ errors, failures, cdpFailures, responseErrors, blocked }));
  console.log('TRANSPORT68_PASS', JSON.stringify({ transportPass: true, instrumentedDiagnostic: true, fullWalkClaim: false, sourceFrame: 618 }));
}
let deadline;
Promise.race([runProbe(), new Promise((_, reject) => { deadline = setTimeout(() => reject(Error('Bounded transport probe exceeded 540 seconds')), 540000); })]).catch(async error => {
  errors.push('Probe exception: ' + error.message);
  if (!emittedReport) { await snapshotLifecycle(); report('failure-before-final-checks'); }
  console.error('TRANSPORT68_FAILED', error.stack); process.exitCode = 1;
}).finally(async () => {
  clearTimeout(deadline);
  phase = 'teardown';
  await browser?.close();
  server.close();
});
