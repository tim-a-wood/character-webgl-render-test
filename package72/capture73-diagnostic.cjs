'use strict';
// Authorised GitHub runner only. No automatic publication, dispatch, or retry.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const root = __dirname, sha = b => crypto.createHash('sha256').update(b).digest('hex');
const check = (ok, message) => { if (!ok) throw Error(message); };
const inputs = JSON.parse(fs.readFileSync(path.join(root, 'proof-inputs73-diagnostic.json')));
check(inputs.schema === 'standard-character-diagnostic73-v1' && inputs.playbackSeconds === 30 && inputs.segments.length === 2, 'Unrecognised or unbounded proof');
check(inputs.externalAssets.length === 0, 'External assets forbidden');
const files = new Map(inputs.localFiles.map(f => [f.path, f]));
for (const f of files.values()) {
  const filename = path.resolve(root, f.path);
  check(filename.startsWith(root + path.sep) && fs.realpathSync(filename) === filename, 'Unsafe frozen file');
  const bytes = fs.readFileSync(filename); check(bytes.length === f.bytes && sha(bytes) === f.sha256, 'Frozen file mismatch: ' + f.path);
}
const { chromium } = require('playwright-core');
check(require('playwright-core/package.json').version === '1.57.0', 'Unpinned browser harness');
const output = path.join(root, 'results73-diagnostic'); fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || inputs.entry;
    check(files.has(name), 'Not in frozen allowlist'); const frozen = files.get(name);
    const bytes = fs.readFileSync(path.join(root, name)); check(bytes.length === frozen.bytes && sha(bytes) === frozen.sha256, 'Changed served bytes');
    res.writeHead(200, { 'Content-Type': { '.js': 'application/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.md': 'text/plain' }[path.extname(name)] || 'application/octet-stream',
      'Content-Length': bytes.length, 'Cache-Control': /^vendor\/three\/examples\/jsm\/libs\/basis\/basis_transcoder\.(js|wasm)$/.test(name) ? 'no-cache' : 'no-store' }); res.end(bytes);
  } catch { res.writeHead(404).end('Not found'); }
});
let browser, page, cdp, cold, browserConfig, throttling;
const segments = []; let restoredVisibility = null;
const errors = [], warnings = [], blocked = [], failedRequests = [], transfers = new Map(), snapshots = [];
function saveImage(label, dataURL) {
  const bytes = Buffer.from(dataURL.split(',')[1], 'base64'), filename = `diagnostic73-${label}.png`;
  fs.writeFileSync(path.join(output, filename), bytes);
  const record = { name: filename, bytes: bytes.length, sha256: sha(bytes), mime: 'image/png' };
  console.log('RENDER_IMAGE_BEGIN', JSON.stringify(record)); const encoded = bytes.toString('base64');
  for (let i = 0; i < encoded.length; i += 2048) console.log('RENDER_IMAGE_CHUNK', String(i / 2048).padStart(5, '0'), encoded.slice(i, i + 2048));
  console.log('RENDER_IMAGE_END'); return record;
}
async function snapshot(label) {
  await page.evaluate(() => window.characterQA72.rendered());
  const snap = await page.evaluate(() => window.characterQA72.snapshot());
  check(snap.finite && snap.pixels.nonBackgroundPixels > 500 && snap.draw.triangles > 0, 'Invalid or empty character snapshot: ' + label);
  snap.poseSha256 = sha(snap.poseSignature); delete snap.poseSignature; snap.image = saveImage(label, snap.image);
  snapshots.push({ label, ...snap }); return snap;
}
async function diagnostics() {
  if (!page) return null;
  let timer;
  const result = await Promise.race([page.evaluate(() => ({ state: window.characterQA72?.report(), text: document.body.innerText.slice(0, 2000) })).catch(e => ({ error: String(e) })),
    new Promise(resolve => { timer = setTimeout(() => resolve({ timedOut: true }), 5000); })]);
  clearTimeout(timer); return result;
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chromium', headless: true, chromiumSandbox: true,
    ignoreDefaultArgs: ['--enable-unsafe-swiftshader'], args: ['--use-gl=angle', '--use-angle=swiftshader'], timeout: 60000 });
  const session = await browser.newBrowserCDPSession(); const command = await session.send('Browser.getBrowserCommandLine');
  const forbidden = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu-sandbox', '--enable-unsafe-swiftshader', '--disable-web-security', '--ignore-gpu-blocklist', '--ignore-certificate-errors'];
  check(!command.arguments.some(a => forbidden.some(f => a === f || a.startsWith(f + '='))), 'Unsafe Chromium launch');
  browserConfig = { version: await browser.version(), arguments: command.arguments, sandbox: true,
    viewport: inputs.viewport, deviceScaleFactor: inputs.deviceScaleFactor, conditions: inputs.conditionsLabel };
  const context = await browser.newContext({ viewport: inputs.viewport, deviceScaleFactor: inputs.deviceScaleFactor, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = route.request().url(); if (new URL(url).origin === origin) return route.continue();
    blocked.push(url); return route.abort();
  });
  page = await context.newPage(); page.setDefaultTimeout(60000); cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  // These are controlled synthetic conditions, not a device emulation claim. Failure is explicit.
  throttling = { network: inputs.network, cpuRate: inputs.cpuThrottlingRate, applied: false };
  await cdp.send('Network.emulateNetworkConditions', inputs.network);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: inputs.cpuThrottlingRate }); throttling.applied = true;
  cdp.on('Network.requestWillBeSent', e => transfers.set(e.requestId, { requestId: e.requestId, url: e.request.url, startSeconds: e.timestamp }));
  cdp.on('Network.responseReceived', e => {
    const item = transfers.get(e.requestId); if (item) Object.assign(item, { status: e.response.status,
      fromDiskCache: !!e.response.fromDiskCache, fromServiceWorker: !!e.response.fromServiceWorker, fromPrefetchCache: !!e.response.fromPrefetchCache,
      protocol: e.response.protocol, responseSeconds: e.timestamp });
  });
  cdp.on('Network.loadingFinished', e => { const item = transfers.get(e.requestId); if (item) Object.assign(item, { completed: true, finishedSeconds: e.timestamp,
    encodedDataLength: e.encodedDataLength, requestDurationMs: 1000 * (e.timestamp - item.startSeconds) }); });
  cdp.on('Network.loadingFailed', e => { const item = transfers.get(e.requestId); if (item) Object.assign(item, { failed: true, error: e.errorText, failedSeconds: e.timestamp, canceled: !!e.canceled, blockedReason: e.blockedReason ?? null }); });
  page.on('pageerror', e => errors.push({ kind: 'pageerror', message: e.message }));
  page.on('console', m => { if (m.type() === 'error') errors.push({ kind: 'console', message: m.text() }); else if (m.type() === 'warning') warnings.push(m.text()); });
  page.on('requestfailed', r => failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
  page.on('response', r => { if (r.status() >= 400) errors.push({ kind: 'http', message: `${r.status()} ${r.url()}` }); });
  await page.goto(origin + '/' + inputs.entry, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.characterQA72?.ready || window.characterQA72?.report().failure, null, { timeout: 120000 });
  check(await page.evaluate(() => window.characterQA72.ready), 'App failed to load standard export');
  await page.waitForFunction(() => window.characterQA72.report().firstPresentationOpportunityMs !== null);
  cold = await page.evaluate(() => window.characterQA72.report());
  check(cold.asset.sha256 === inputs.asset.sha256 && cold.asset.bytes === inputs.asset.bytes, 'Exact final asset identity required');
  check(cold.firstPixels.nonBackgroundPixels > 500, 'No visible character');
  const assetRequests = [...transfers.values()].filter(t => new URL(t.url).pathname === '/' + inputs.asset.filename);
  check(assetRequests.length === 1 && assetRequests[0].completed, 'Exactly one completed model load required');
  const visibilityBefore = await page.evaluate(() => window.characterQA72.setDiagnosticEyeVisibility(true));
  check(visibilityBefore.before.every(n => n.visible), 'Baseline eye meshes must already be visible');
  const geometryBefore = await page.evaluate(() => window.characterQA72.geometryHashes());
  await snapshot('appearance-all-visible-before');
  const cameraBefore = await page.evaluate(() => window.characterQA72.report().camera);
  for (const segment of inputs.segments) {
    await page.evaluate(() => { window.characterQA72.pause(); window.characterQA72.cancelBenchmark(); window.characterQA72.reset(); });
    const visibility = await page.evaluate(visible => window.characterQA72.setDiagnosticEyeVisibility(visible), segment.eyesVisible);
    check(JSON.stringify(visibility.after.map(n => n.name)) === JSON.stringify(inputs.affectedNames), 'Affected mesh names changed');
    check(visibility.after.every(n => n.visible === segment.eyesVisible), 'Visibility contrast not applied exactly');
    await page.evaluate(() => window.characterQA72.rendered());
    await page.evaluate(() => window.characterQA72.beginBenchmark()); await page.locator('#play').click();
    await page.waitForFunction(() => window.characterQA72.benchmarkComplete, null, { timeout: 90000, polling: 250 });
    const state = await page.evaluate(() => window.characterQA72.report());
    const frameSamples = await page.evaluate(() => window.characterQA72.frameSamples());
    check(state.benchmark.actualDurationMs >= 30000 && frameSamples.length > 1, 'Missing full 30-second segment');
    check(frameSamples.every(f => Number.isFinite(f.rafMs) && Number.isFinite(f.updateAndRenderSubmitMs) && f.calls > 0 && f.triangles > 0), 'Invalid frame samples');
    check(state.glErrors.length === 0 && state.contextLosses === 0 && state.attributeVersionsUnchanged, 'Renderer/geometry failure');
    check(JSON.stringify(state.camera) === JSON.stringify(cameraBefore), 'Camera changed between A/B segments');
    const result = { label: segment.label, eyesVisible: segment.eyesVisible, visibility, frames: state.frames,
      benchmark: state.benchmark, latestFrame: state.latestFrame, heap: state.heap,
      longTasks: state.longTasks.filter(t => t.startMs >= state.benchmark.startedMs && t.startMs <= state.benchmark.endedMs),
      glErrors: state.glErrors, contextLosses: state.contextLosses, frameSamples };
    segments.push(result);
    fs.writeFileSync(path.join(output, segment.label + '-frames73.json'), JSON.stringify(frameSamples));
    console.log('DIAGNOSTIC73_SEGMENT', JSON.stringify(result));
  }
  await page.evaluate(() => { window.characterQA72.pause(); window.characterQA72.cancelBenchmark(); window.characterQA72.reset(); });
  restoredVisibility = await page.evaluate(() => window.characterQA72.setDiagnosticEyeVisibility(true));
  check(restoredVisibility.after.every(n => n.visible), 'Restore all eye appearance');
  const geometryAfter = await page.evaluate(() => window.characterQA72.geometryHashes());
  check(JSON.stringify(geometryBefore) === JSON.stringify(geometryAfter), 'Model buffers changed');
  await snapshot('appearance-all-visible-restored');
  await page.evaluate(() => window.characterQA72.frameView('head')); await snapshot('head-all-visible-restored');
  check(errors.length === 0 && failedRequests.length === 0 && blocked.length === 0, 'Runtime/network error');
  const A = segments[0], B = segments[1], ratio = (a, b) => a && b ? a / b : null;
  const comparison = {
    frameCount: { A: A.frames.count, B: B.frames.count },
    medianRafMs: { A: A.frames.rafIntervalMs.median, B: B.frames.rafIntervalMs.median, AdivB: ratio(A.frames.rafIntervalMs.median, B.frames.rafIntervalMs.median) },
    p95RafMs: { A: A.frames.rafIntervalMs.p95, B: B.frames.rafIntervalMs.p95 },
    medianCpuSubmitMs: { A: A.frames.updateAndRenderSubmitMs.median, B: B.frames.updateAndRenderSubmitMs.median },
    calls: { A: A.frames.callsPerFrame.median, B: B.frames.callsPerFrame.median },
    triangles: { A: A.frames.trianglesPerFrame.median, B: B.frames.trianglesPerFrame.median }
  };
  const report = { schema: 'standard-character-diagnostic73-result-v1', pass: true,
    completedAt: new Date().toISOString(), asset: inputs.asset, browser: browserConfig, throttling,
    productionViewerSha256: inputs.productionViewerSha256, affectedNames: inputs.affectedNames,
    cold, modelLoads: assetRequests.length, visibilityBefore, segments, comparison, restoredVisibility,
    geometryBuffersUnchanged: true, snapshots, errors, warnings, blocked, failedRequests,
    limits: ['TEST ONLY: hiding cornea and meniscus is not a proposed production appearance change.',
      'A and B reuse one browser, context, model, camera, animation, network, CPU and security configuration.',
      'A precedes B without reload; shader/cache warm-up and run order can affect comparison.',
      'Both segments repeat the finite source clip with intentional hard resets, no seamless-loop claim.',
      'Synthetic SwiftShader timings do not establish performance on the user device.',
      'Clock, source GLB, animation, materials and production viewer are unchanged.',
      'All screenshots show the original all-visible appearance; no images were edited.',
      'No screenshots, geometry hashes, pixel readbacks or full report serialization run inside either timed segment.'] };
  fs.writeFileSync(path.join(output, 'diagnostic73-result.json'), JSON.stringify(report, null, 2));
  console.log('DIAGNOSTIC73_RESULT', JSON.stringify(report));
})().catch(async error => {
  // Best-effort restoration only within this diagnostic page, never a production write.
  try { restoredVisibility = await page?.evaluate(() => { const q = window.characterQA72; if (!q?.ready) return null; q.pause(); q.cancelBenchmark(); return q.setDiagnosticEyeVisibility(true); }); } catch {}
  const report = { pass: false, error: error.stack, browser: browserConfig, throttling, cold, segments,
    restoredVisibility, state: await diagnostics(), snapshots, errors, warnings, blocked, failedRequests };
  fs.writeFileSync(path.join(output, 'diagnostic73-failure.json'), JSON.stringify(report, null, 2));
  console.error('DIAGNOSTIC73_FAILED', JSON.stringify(report)); process.exitCode = 1;
}).finally(async () => { await browser?.close(); server.close(); });
