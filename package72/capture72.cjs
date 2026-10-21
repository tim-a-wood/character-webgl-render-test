'use strict';
// Authorised GitHub runner only. No automatic publication, dispatch, or retry.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const root = __dirname, sha = b => crypto.createHash('sha256').update(b).digest('hex');
const check = (ok, message) => { if (!ok) throw Error(message); };
const inputs = JSON.parse(fs.readFileSync(path.join(root, 'proof-inputs72.json')));
check(inputs.schema === 'standard-character-browser-inputs72-v1' && inputs.playbackSeconds === 30, 'Unrecognised or unbounded proof');
check(inputs.externalAssets.length === 0, 'External assets forbidden');
const files = new Map(inputs.localFiles.map(f => [f.path, f]));
for (const f of files.values()) {
  const filename = path.resolve(root, f.path);
  check(filename.startsWith(root + path.sep) && fs.realpathSync(filename) === filename, 'Unsafe frozen file');
  const bytes = fs.readFileSync(filename); check(bytes.length === f.bytes && sha(bytes) === f.sha256, 'Frozen file mismatch: ' + f.path);
}
const { chromium } = require('playwright-core');
check(require('playwright-core/package.json').version === '1.57.0', 'Unpinned browser harness');
const output = path.join(root, 'results72'); fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || inputs.entry;
    check(files.has(name), 'Not in frozen allowlist'); const frozen = files.get(name);
    const bytes = fs.readFileSync(path.join(root, name)); check(bytes.length === frozen.bytes && sha(bytes) === frozen.sha256, 'Changed served bytes');
    res.writeHead(200, { 'Content-Type': { '.js': 'application/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.md': 'text/plain' }[path.extname(name)] || 'application/octet-stream',
      'Content-Length': bytes.length, 'Cache-Control': /^vendor\/three\/examples\/jsm\/libs\/basis\/basis_transcoder\.(js|wasm)$/.test(name) ? 'no-cache' : 'no-store' }); res.end(bytes);
  } catch { res.writeHead(404).end('Not found'); }
});
let browser, page, cdp, cold, playback, reset, idle, browserConfig, throttling;
const errors = [], warnings = [], blocked = [], failedRequests = [], transfers = new Map(), snapshots = [];
function saveImage(label, dataURL) {
  const bytes = Buffer.from(dataURL.split(',')[1], 'base64'), filename = `browser72-${label}.png`;
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
  check(cold.firstPixels.nonBackgroundPixels > 500, 'First submitted character has no visible pixel evidence');
  check(cold.asset.sha256 === inputs.asset.sha256 && cold.asset.bytes === inputs.asset.bytes, 'Loaded asset mismatch');
  check(Math.abs(cold.duration - inputs.expectedDuration) < 1e-5, 'Changed accepted clip duration');
  const coldTransfers = [...transfers.values()].map(t => ({ ...t }));
  const assetRequests = coldTransfers.filter(t => new URL(t.url).pathname === '/' + inputs.asset.filename);
  check(assetRequests.length === 1 && assetRequests[0].completed, 'Expected one completed GLB download, no duplicate in-app validator fetch');
  check(coldTransfers.every(t => !t.fromDiskCache && !t.fromServiceWorker && !t.fromPrefetchCache), 'Cold transfer used a browser cache');
  cold.network = { requests: coldTransfers, totalEncodedTransferBytes: coldTransfers.reduce((n, t) => n + (t.encodedDataLength || 0), 0),
    assetRequest: assetRequests[0], limitation: 'CDP encodedDataLength includes transfer overhead; localhost plus configured throttling, not WAN or phone radio.' };
  const beforeHashes = await page.evaluate(() => window.characterQA72.geometryHashes());
  const neutral = await snapshot('neutral');
  // A finite 1.3-second clip can finish before a software-rendered click round trip.
  // Exercise trusted Pause during bounded repetition, then discard this warm-up series.
  await page.evaluate(() => window.characterQA72.beginBenchmark());
  await page.locator('#play').click();
  await page.waitForFunction(() => window.characterQA72.report().firstAnimation !== null);
  await page.locator('#pause').click();
  await page.evaluate(() => window.characterQA72.cancelBenchmark()); await snapshot('animated');
  // Trusted orbit input, with visible camera movement checked independently of event receipt.
  const cameraBefore = await page.evaluate(() => window.characterQA72.report().camera.position);
  const bounds = await page.locator('#canvas').boundingBox();
  await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .5);
  await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .55, { steps: 5 }); await page.mouse.up();
  await page.evaluate(() => window.characterQA72.rendered());
  const cameraAfter = await page.evaluate(() => window.characterQA72.report().camera.position);
  check(JSON.stringify(cameraBefore) !== JSON.stringify(cameraAfter), 'Orbit did not change camera');
  await page.locator('#reset').click(); await page.evaluate(() => window.characterQA72.rendered());
  const resetSnap = await snapshot('reset'); check(resetSnap.poseSha256 === neutral.poseSha256, 'Reset failed to restore neutral transforms and morphs');
  check(resetSnap.morphWeights.every(m => m.weights.every(w => Math.abs(w) < 1e-6)), 'Neutral reset retained morph deformation');
  reset = { poseRestored: true, morphsZero: true };
  const idleStart = await page.evaluate(() => window.characterQA72.report().frameCount); await page.waitForTimeout(750);
  const idleEnd = await page.evaluate(() => window.characterQA72.report().frameCount); idle = { observationMs: 750, extraFrames: idleEnd - idleStart };
  check(idle.extraFrames === 0, 'Paused scene unnecessarily renders continuously');
  await page.evaluate(() => window.characterQA72.beginBenchmark()); await page.locator('#play').click();
  await page.waitForFunction(() => window.characterQA72.benchmarkComplete, null, { timeout: 60000, polling: 250 });
  playback = await page.evaluate(() => window.characterQA72.report());
  const frameSamples = await page.evaluate(() => window.characterQA72.frameSamples());
  check(playback.benchmark.actualDurationMs >= 30000 && frameSamples.length > 1, 'Missing bounded 30-second playback evidence');
  check(frameSamples.every(f => Number.isFinite(f.rafMs) && Number.isFinite(f.updateAndRenderSubmitMs) && f.calls > 0 && f.triangles > 0), 'Invalid per-frame render statistics');
  check(playback.attributeVersionsUnchanged, 'Unexpected base/morph attribute reuploads');
  const afterHashes = await page.evaluate(() => window.characterQA72.geometryHashes());
  check(JSON.stringify(beforeHashes) === JSON.stringify(afterHashes), 'Geometry or morph buffers mutated');
  check(playback.controls.some(c => c.kind === 'play' && c.trusted) && playback.controls.some(c => c.kind === 'pause' && c.trusted) &&
    playback.controls.some(c => c.kind === 'reset' && c.trusted) && playback.controls.some(c => c.kind === 'orbit' && c.trusted), 'Missing trusted control-to-render samples');
  check(playback.controls.every(c => Number.isFinite(c.eventToSubmitMs) && c.eventToSubmitMs >= 0 &&
    Number.isFinite(c.handlerToSubmitMs) && c.handlerToSubmitMs >= 0), 'Invalid control timing clock/order');
  // All visual inspection is after the timed series, never part of its performance sample.
  await page.evaluate(() => { window.characterQA72.selectAnimation('Walk539_618'); window.characterQA72.frameView('whole'); });
  for (const [label, frame] of [['plant539',539],['bend553',553],['release564',564],['extension577',577]]) {
    await page.evaluate(seconds => window.characterQA72.seek(seconds), (frame - 539) * .016667);
    await snapshot(label);
  }
  await page.locator('#animation').selectOption('Face_JawSmile');
  await page.evaluate(() => { window.characterQA72.seek(.50001); window.characterQA72.frameView('head'); });
  await snapshot('head-jaw-smile');
  await page.locator('#reset').click(); await snapshot('head-neutral');
  check(playback.glErrors.length === 0 && playback.contextLosses === 0, 'WebGL failure');
  check(errors.length === 0 && failedRequests.length === 0 && blocked.length === 0, 'Runtime or network failure');
  const report = { schema: 'standard-character-browser-result72-v1', pass: true, completedAt: new Date().toISOString(), asset: inputs.asset,
    browser: browserConfig, throttling, cold, playback, reset, idle, snapshots, errors, warnings, blocked, failedRequests,
    limits: ['Synthetic desktop SwiftShader, not iPhone compatibility or performance.', 'Frame statistics are per submitted frame, not cumulative draw counters.',
      'Cold pixel confirmation/readback and next-rAF opportunity are not physical display timestamps.', 'Control timings end at render submission, not screen scanout.',
      'Thirty seconds repeat a finite excerpt with intentional hard resets; no seamless-loop or artistic-fidelity acceptance.',
      'No screenshots, geometry hashes, GL readbacks or full report serialization occur inside the measured frame loop.'] };
  fs.writeFileSync(path.join(output, 'frame-samples72.json'), JSON.stringify(frameSamples));
  fs.writeFileSync(path.join(output, 'browser-result72.json'), JSON.stringify(report, null, 2));
  console.log('BROWSER72_FRAMES', JSON.stringify(frameSamples)); console.log('BROWSER72_RESULT', JSON.stringify(report));
})().catch(async error => {
  const report = { pass: false, error: error.stack, browser: browserConfig, throttling, cold, playback, reset, idle,
    state: await diagnostics(), snapshots, errors, warnings, blocked, failedRequests, requests: [...transfers.values()] };
  fs.writeFileSync(path.join(output, 'browser-failure72.json'), JSON.stringify(report, null, 2));
  console.error('BROWSER72_FAILED', JSON.stringify(report)); process.exitCode = 1;
}).finally(async () => { await browser?.close(); server.close(); });
