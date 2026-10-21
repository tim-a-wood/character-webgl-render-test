'use strict';
// Authorised GitHub runner only. No automatic publication, dispatch, or retry.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const root = __dirname, sha = b => crypto.createHash('sha256').update(b).digest('hex');
const check = (ok, message) => { if (!ok) throw Error(message); };
const inputs = JSON.parse(fs.readFileSync(path.join(root, 'proof-inputs76-jog.json')));
check(inputs.schema === 'finite-jog-demo-inputs76-v1' && inputs.expectedCaptureCount === 48, 'Unrecognised or unbounded proof');
check(inputs.externalAssets.length === 0, 'External assets forbidden');
const files = new Map(inputs.localFiles.map(f => [f.path, f]));
for (const f of files.values()) {
  const filename = path.resolve(root, f.path);
  check(filename.startsWith(root + path.sep) && fs.realpathSync(filename) === filename, 'Unsafe frozen file');
  const bytes = fs.readFileSync(filename); check(bytes.length === f.bytes && sha(bytes) === f.sha256, 'Frozen file mismatch: ' + f.path);
}
const { chromium } = require('playwright-core');
check(require('playwright-core/package.json').version === '1.57.0', 'Unpinned browser harness');
const output = path.join(root, 'results76-jog'); fs.mkdirSync(output, { recursive: true });
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
const frames = [];
const errors = [], warnings = [], blocked = [], failedRequests = [], transfers = new Map(), snapshots = [];
function saveImage(label, dataURL) {
  const bytes = Buffer.from(dataURL.split(',')[1], 'base64'), filename = `jog76-${label}.png`;
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
  await page.goto(origin + '/' + inputs.entry + '?clip=' + encodeURIComponent(inputs.jog.clip), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.characterQA72?.ready || window.characterQA72?.report().failure, null, { timeout: 120000 });
  check(await page.evaluate(() => window.characterQA72.ready), 'App failed to load standard export');
  await page.waitForFunction(() => window.characterQA72.report().firstPresentationOpportunityMs !== null);
  cold = await page.evaluate(() => window.characterQA72.report());
  check(cold.asset.sha256 === inputs.asset.sha256 && cold.asset.bytes === inputs.asset.bytes, 'Exact merged Jog asset required');
  check(cold.selectedClip === inputs.jog.clip && !cold.playing && cold.clipTime === 0 && !cold.neutral, 'Jog deep link must open paused at its actual first pose');
  check(Math.abs(cold.duration - inputs.jog.duration) < 1e-5, 'Jog duration changed');
  const names = await page.locator('#animation option').evaluateAll(options => options.map(o => o.value));
  check(inputs.retainedClips.every(name => names.includes(name)) && names.includes(inputs.jog.clip), 'Accepted Walk/face clips or new Jog missing');
  const hashesBefore = await page.evaluate(() => window.characterQA72.geometryHashes());
  const materials = await page.evaluate(() => window.characterQA72.eyeSurfaceState74());
  check(materials.length === 2 && materials.every(m => m.mode === 'candidate' && m.visible && Object.values(m.preserved).every(Boolean)), 'Reviewed eye surfaces changed');
  await page.evaluate(() => window.characterQA72.frameView('whole'));
  await page.evaluate(() => window.characterQA72.rendered());
  const camera = await page.evaluate(() => window.characterQA72.report().camera), cameraSha256 = sha(JSON.stringify(camera));
  const startProof = await page.evaluate(() => {
    const q = window.characterQA72; q.reset(); const before = q.poseSignature(); q.play(); const after = q.poseSignature(); q.pause();
    return { before, after, state: { selectedClip: q.report().selectedClip, neutral: q.report().neutral, clipTime: q.report().clipTime } };
  });
  check(startProof.before === startProof.after && startProof.state.clipTime === 0 && !startProof.state.neutral, 'Jog Play introduces a first-pose jump');
  const jogStartPoseSha256 = sha(startProof.before); delete startProof.before; delete startProof.after; startProof.poseUnchanged = true; startProof.poseSha256 = jogStartPoseSha256;
  // One genuine pointer Play, with the unchanged absolute wall clock and no repetitions.
  await page.evaluate(() => window.characterQA72.beginFiniteJogDemo76());
  await page.evaluate(() => window.characterQA72.rendered());
  await page.locator('#play').click();
  await page.waitForFunction(() => window.characterQA72.report().finiteJogDemo76?.completed, null, { timeout: 60000 });
  const played = await page.evaluate(() => window.characterQA72.report());
  check(!played.playing && Math.abs(played.clipTime - inputs.jog.duration) < 1e-5, 'Finite Jog did not stop at its endpoint');
  check(played.finiteJogDemo76.frames.length > 0 && played.finiteJogDemo76.frames.some(f => f.clipTime > 0), 'No advancing real Play render');
  check(played.controls.some(c => c.kind === 'play' && c.trusted), 'Real pointer Play evidence missing');
  check(played.benchmark === null, 'No repeated playback benchmark allowed');
  await page.locator('#reset').click(); await page.evaluate(() => window.characterQA72.rendered());
  check(sha(await page.evaluate(() => window.characterQA72.poseSignature())) === jogStartPoseSha256, 'Jog Reset does not restore its exact first pose');
  const walkBefore = await page.evaluate(() => {
    const q = window.characterQA72; q.selectAnimation('Walk539_618'); const start = q.poseSignature(); q.seek(40 * .016667); const mid = q.poseSignature(); q.reset();
    return { start, mid, reset: q.poseSignature(), state: { neutral: q.report().neutral, clipTime: q.report().clipTime } };
  });
  check(walkBefore.start === walkBefore.reset && !walkBefore.state.neutral && walkBefore.state.clipTime === 0, 'Accepted Walk first-pose reset changed');
  const walkStart = await snapshot('accepted-walk-start');
  check(walkStart.poseSha256 === sha(walkBefore.start), 'Walk start render changed');
  await page.locator('#animation').selectOption(inputs.jog.clip);
  check(sha(await page.evaluate(() => window.characterQA72.poseSignature())) === jogStartPoseSha256, 'Walk-to-Jog selection did not restore the exact Jog first pose');
  for (let sourceKeyIndex = 0; sourceKeyIndex < inputs.jog.samples; sourceKeyIndex++) {
    const captured = await page.evaluate(i => window.characterQA72.captureGaitKey76(i), sourceKeyIndex);
    check(captured.finite && captured.pixels.nonBackgroundPixels > 500 && captured.draw.triangles > 0, 'Invalid rendered Jog pose');
    check(captured.clipName === inputs.jog.clip && captured.sourceKeyIndex === sourceKeyIndex && captured.sourceFrame === inputs.jog.firstSourceFrame + sourceKeyIndex && !captured.neutral, 'Wrong Jog key');
    check(sha(JSON.stringify(captured.camera)) === cameraSha256, 'Frozen gait camera changed');
    check(captured.joints.length >= 8, 'Missing thigh/knee/foot/toe metadata');
    check(Math.abs(captured.sourceTimeSeconds - sourceKeyIndex * inputs.jog.sourceDt) < 2e-6, 'Native source timestamp changed');
    const foot = captured.projectedFootwearBounds;
    check(foot.min[0] >= -1 && foot.max[0] <= 1 && foot.min[1] >= -1 && foot.max[1] <= 1, 'Whole-character framing cuts footwear');
    captured.poseSha256 = sha(captured.poseSignature); delete captured.poseSignature;
    captured.image = saveImage('frame' + captured.sourceFrame, captured.image);
    frames.push(captured); console.log('JOG76_FRAME', JSON.stringify(captured));
  }
  check(frames.length === inputs.expectedCaptureCount, 'Exactly one native-key Jog cycle required');
  check(frames[0].poseSha256 === jogStartPoseSha256, 'Native key0 and selected start pose disagree');
  const walkAfter = await page.evaluate(() => {
    const q = window.characterQA72; q.selectAnimation('Walk539_618'); const start = q.poseSignature(); q.seek(40 * .016667); const mid = q.poseSignature(); q.selectAnimation('Jog478_525');
    return { start, mid, selectedJogStart: q.poseSignature() };
  });
  check(walkAfter.start === walkBefore.start && walkAfter.mid === walkBefore.mid, 'Jog use contaminated accepted Walk poses');
  check(sha(walkAfter.selectedJogStart) === jogStartPoseSha256, 'Jog selection failed after retained Walk check');
  const hashesAfter = await page.evaluate(() => window.characterQA72.geometryHashes());
  check(JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter), 'Shared geometry or morph basis was modified');
  check(JSON.stringify(materials) === JSON.stringify(await page.evaluate(() => window.characterQA72.eyeSurfaceState74())), 'Reviewed appearance changed during capture');
  const final = await page.evaluate(() => window.characterQA72.report());
  check(final.glErrors.length === 0 && final.contextLosses === 0 && final.attributeVersionsUnchanged, 'WebGL/geometry failure');
  check(final.benchmark === null, 'No playback benchmark allowed');
  const controls = await page.evaluate(() => ({playEnabled: !document.getElementById('play').disabled, pauseDisabled: document.getElementById('pause').disabled,
    resetEnabled: !document.getElementById('reset').disabled, selectedClip: document.getElementById('animation').value, playing: window.characterQA72.report().playing,
    loopLabel: document.getElementById('loop-note').textContent}));
  check(controls.loopLabel.includes('WIP') && controls.loopLabel.includes('not a seamless loop'), 'WIP/finite disclosure missing');
  check(controls.playEnabled && controls.pauseDisabled && controls.resetEnabled && !controls.playing && controls.selectedClip === inputs.jog.clip, 'Unexpected final control state');
  const assets = [...transfers.values()].filter(t => new URL(t.url).pathname === '/' + inputs.asset.filename);
  check(assets.length === 1 && assets[0].completed, 'One model download/loaded model required');
  check(errors.length === 0 && failedRequests.length === 0 && blocked.length === 0, 'Runtime/network failure');
  const report = { schema: 'finite-jog-demo-result76-v1', pass: true, technicalChecksPassed: true, artisticAcceptance: false, reviewStatus: 'Jog v1 WIP, visual review required', completedAt: new Date().toISOString(), asset: inputs.asset,
    baselineAsset: inputs.baselineAsset, mergeAuditSha256: inputs.mergeAuditSha256, browser: browserConfig, throttling,
    sourceClock: { sampleCount: inputs.jog.samples, sourceDt: inputs.jog.sourceDt, nominalHz: 60, duration: inputs.jog.duration,
      actualTimes: 'Stored Float32 native-key timestamps', slowedOrResampled: false, seamlessLoop: false },
    captureCount: frames.length, modelLoads: assets.length, camera, cameraSha256,
    sharedAppearance: inputs.sharedAppearance, materialState: materials, geometryAndMorphBasisUnchanged: true,
    deepLink: { requested: inputs.jog.clip, actualSelected: cold.selectedClip, autoplay: false }, startProof,
    resetProof: { jogExactFirstPose: true, walkExactFirstPose: true, zeroMorphWeightsRequired: false },
    retainedWalkPoseSha256: {start: sha(walkBefore.start), mid: sha(walkBefore.mid), unchangedAfterJog: true},
    acceptedClipsPreservedByMergeAudit: inputs.retainedClips, realFinitePlay: played.finiteJogDemo76,
    firstAdvancedRender: played.firstAnimation, controls, glErrors: final.glErrors, contextLosses: final.contextLosses,
    knownFitLimitations: inputs.jog.fitReview, sourceContactAnchors: inputs.jog.contactAnchors, frames, snapshots, errors, warnings, blocked, failedRequests,
    reviewRequiredBeforeNextIteration: true,
    limits: ['Actual finite Play uses the unchanged wall clock; its rendered sample count is reported honestly and is not a phone-FPS claim.',
      'The48ordered PNGs are actual unedited exact-key renders, not48real-time screenshots or proof of smooth phone playback.',
      'Any assembled video must use original60Hz spacing, explicitly label the finite0.783349-second excerpt, and must not conceal a reset as a seamless loop.',
      'Contacts are source annotations plus measured joint/footwear bounds, not an independent artistic acceptance.',
      'No new geometry, corrective basis, appearance redesign, clock change, face edit or30-second benchmark.'] };
  fs.writeFileSync(path.join(output, 'jog76-result.json'), JSON.stringify(report, null, 2));
  console.log('JOG76_RESULT', JSON.stringify(report));
})().catch(async error => {
  const report = {pass: false, error: error.stack, browser: browserConfig, throttling, cold, frames, state: await diagnostics(), errors, warnings, blocked, failedRequests};
  fs.writeFileSync(path.join(output, 'jog76-failure.json'), JSON.stringify(report, null, 2)); console.error('JOG76_FAILED', JSON.stringify(report)); process.exitCode = 1;
}).finally(async () => {await browser?.close(); server.close();});
