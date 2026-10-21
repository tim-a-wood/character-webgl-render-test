'use strict';
// Authorised GitHub runner only. No automatic publication, dispatch, or retry.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const root = __dirname, sha = b => crypto.createHash('sha256').update(b).digest('hex');
const check = (ok, message) => { if (!ok) throw Error(message); };
const inputs = JSON.parse(fs.readFileSync(path.join(root, 'proof-inputs74-candidate.json')));
check(inputs.schema === 'standard-character-candidate74-v1' && inputs.playbackSeconds === 30 && inputs.segments.length === 2, 'Unrecognised or unbounded proof');
check(inputs.externalAssets.length === 0, 'External assets forbidden');
const files = new Map(inputs.localFiles.map(f => [f.path, f]));
for (const f of files.values()) {
  const filename = path.resolve(root, f.path);
  check(filename.startsWith(root + path.sep) && fs.realpathSync(filename) === filename, 'Unsafe frozen file');
  const bytes = fs.readFileSync(filename); check(bytes.length === f.bytes && sha(bytes) === f.sha256, 'Frozen file mismatch: ' + f.path);
}
const { chromium } = require('playwright-core');
check(require('playwright-core/package.json').version === '1.57.0', 'Unpinned browser harness');
const output = path.join(root, 'results74-candidate'); fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || inputs.entry;
    check(files.has(name), 'Not in frozen allowlist'); const frozen = files.get(name);
    const bytes = fs.readFileSync(path.join(root, name)); check(bytes.length === frozen.bytes && sha(bytes) === frozen.sha256, 'Changed served bytes');
    res.writeHead(200, { 'Content-Type': { '.js': 'application/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.md': 'text/plain' }[path.extname(name)] || 'application/octet-stream',
      'Content-Length': bytes.length, 'Cache-Control': /^vendor\/three\/examples\/jsm\/libs\/basis\/basis_transcoder\.(js|wasm)$/.test(name) ? 'no-cache' : 'no-store' }); res.end(bytes);
  } catch { res.writeHead(404).end('Not found'); }
});
let browser, page, cdp, cold, browserConfig, throttling, startPoseProof = null, resetProof = null;
const segments = [];
const errors = [], warnings = [], blocked = [], failedRequests = [], transfers = new Map(), snapshots = [];
function saveImage(label, dataURL) {
  const bytes = Buffer.from(dataURL.split(',')[1], 'base64'), filename = `candidate74-${label}.png`;
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
  check(cold.asset.sha256 === inputs.asset.sha256 && cold.asset.bytes === inputs.asset.bytes, 'Exact final GLB required');
  const loadedPose = await page.evaluate(() => window.characterQA72.poseSignature());
  const initialMaterialState = await page.evaluate(() => window.characterQA72.eyeSurfaceState74());
  check(initialMaterialState.length === 2 && initialMaterialState.every(m => m.visible && m.mode === 'candidate'), 'Candidate must show both shells');
  check(initialMaterialState.every(m => Object.values(m.preserved).every(Boolean)), 'Normal/specular/UV properties changed');
  const poseProof = await page.evaluate(() => {
    const q = window.characterQA72;
    q.seek(0); const exactWalkFrame0 = q.poseSignature();
    q.reset(); const beforePlay = q.poseSignature(), beforeState = q.report();
    q.play(); const synchronousAfterPlay = q.poseSignature(); q.pause();
    q.seek(q.report().duration * .52); q.reset(); const afterWalkReset = q.poseSignature();
    q.selectAnimation('Face_JawSmile'); q.reset(); const faceNeutral = q.poseSignature();
    q.seek(.50001); const faceExpression = q.poseSignature();
    q.reset(); const faceReset = q.poseSignature();
    q.selectAnimation('Walk539_618'); const afterWalkReselection = q.poseSignature();
    return { exactWalkFrame0, beforePlay, synchronousAfterPlay, afterWalkReset,
      faceNeutral, faceExpression, faceReset, afterWalkReselection,
      walkStartState: { clip: beforeState.selectedClip, clipTime: beforeState.clipTime, playing: beforeState.playing, neutral: beforeState.neutral } };
  });
  check(loadedPose === poseProof.exactWalkFrame0, 'Initial loaded selected walk must already show exact frame 0');
  check(poseProof.beforePlay === poseProof.synchronousAfterPlay && poseProof.beforePlay === poseProof.exactWalkFrame0, 'Play introduced a start-pose jump');
  check(poseProof.afterWalkReset === poseProof.exactWalkFrame0 && poseProof.afterWalkReselection === poseProof.exactWalkFrame0, 'Walk reset/reselection must restore actual frame0, not zero-morph T-pose');
  check(poseProof.faceExpression !== poseProof.faceNeutral && poseProof.faceReset === poseProof.faceNeutral, 'Facial expression must change and reset to source neutral');
  startPoseProof = { loadedPoseSha256: sha(loadedPose), exactFrame0Sha256: sha(poseProof.exactWalkFrame0),
    beforePlaySha256: sha(poseProof.beforePlay), synchronousAfterPlaySha256: sha(poseProof.synchronousAfterPlay),
    noSynchronousPoseJump: true, walkStartState: poseProof.walkStartState };
  resetProof = { walkFrame0Restored: true, walkReselectionFrame0Restored: true,
    walkResetPoseSha256: sha(poseProof.afterWalkReset), faceNeutralSha256: sha(poseProof.faceNeutral),
    faceResetSha256: sha(poseProof.faceReset), faceExpressionChanged: true, faceNeutralRestored: true,
    policy: 'Walk compares its actual first-pose hash including authored nonzero morph weights; face compares unanimated source neutral.' };
  console.log('CANDIDATE74_START_RESET', JSON.stringify({startPoseProof, resetProof}));
  const hashesBefore = await page.evaluate(() => window.characterQA72.geometryHashes());
  await page.evaluate(() => { window.characterQA72.frameView('whole'); }); await page.evaluate(() => window.characterQA72.rendered());
  const cameraBefore = await page.evaluate(() => window.characterQA72.report().camera);
  for (const segment of inputs.segments) {
    await page.evaluate(() => { const q=window.characterQA72; q.pause(); q.cancelBenchmark(); q.selectAnimation('Walk539_618'); q.reset(); });
    const materialState = await page.evaluate(mode => window.characterQA72.setEyeSurfaceMode74(mode), segment.mode);
    check(JSON.stringify(materialState.map(m=>m.mesh)) === JSON.stringify(inputs.affectedNames), 'Unexpected modified shell names');
    check(materialState.every(m=>m.visible && m.mode===segment.mode && Object.values(m.preserved).every(Boolean)), 'Incorrect material contrast');
    await page.evaluate(() => window.characterQA72.rendered());
    await page.evaluate(() => window.characterQA72.beginBenchmark()); await page.locator('#play').click();
    await page.waitForFunction(() => window.characterQA72.benchmarkComplete, null, {timeout:90000,polling:250});
    const state = await page.evaluate(() => window.characterQA72.report());
    const frameSamples = await page.evaluate(() => window.characterQA72.frameSamples());
    check(state.benchmark.actualDurationMs>=30000 && frameSamples.length>1,'Missing full30-second segment');
    check(JSON.stringify(state.camera)===JSON.stringify(cameraBefore),'A/B camera changed');
    check(state.glErrors.length===0 && state.contextLosses===0 && state.attributeVersionsUnchanged,'Render/geometry failure');
    const result={label:segment.label,mode:segment.mode,materialState,frames:state.frames,
      benchmark:state.benchmark,latestFrame:state.latestFrame,heap:state.heap,
      longTasks:state.longTasks.filter(t=>t.startMs>=state.benchmark.startedMs&&t.startMs<=state.benchmark.endedMs),frameSamples};
    segments.push(result);fs.writeFileSync(path.join(output,segment.label+'-frames74.json'),JSON.stringify(frameSamples));
    console.log('CANDIDATE74_SEGMENT',JSON.stringify(result));
  }
  // Visual comparisons are completely outside the timed series, at identical authored poses/views.
  for (const mode of ['baseline','candidate']) {
    await page.evaluate(mode=>{const q=window.characterQA72;q.pause();q.cancelBenchmark();q.setEyeSurfaceMode74(mode);q.selectAnimation('Walk539_618');q.reset();q.frameView('whole');},mode);
    await snapshot(mode+'-whole-walk-start');
    await page.evaluate(()=>{const q=window.characterQA72;q.selectAnimation('Face_JawSmile');q.reset();q.frameDiagnosticHead74('front');});
    await snapshot(mode+'-head-neutral');
    await page.evaluate(()=>window.characterQA72.frameDiagnosticHead74('three-quarter'));
    await snapshot(mode+'-head-three-quarter');
    await page.evaluate(()=>{const q=window.characterQA72;q.seek(.50001);q.frameDiagnosticHead74('front');});
    await snapshot(mode+'-head-jaw-smile');
  }
  // Explicit finite-end behavior remains; this is not a seamless-loop fix.
  await page.evaluate(()=>{const q=window.characterQA72;q.selectAnimation('Walk539_618');q.seek(q.report().duration-.05);q.play();});
  await page.waitForFunction(()=>!window.characterQA72.report().playing,null,{timeout:15000});
  const finiteEnd=await page.evaluate(()=>{const r=window.characterQA72.report();return {clipTime:r.clipTime,duration:r.duration,playing:r.playing};});
  check(!finiteEnd.playing && Math.abs(finiteEnd.clipTime-finiteEnd.duration)<1e-7,'Finite walk must stop at final sample');
  await page.evaluate(()=>window.characterQA72.reset());
  const hashesAfter=await page.evaluate(()=>window.characterQA72.geometryHashes());
  check(JSON.stringify(hashesBefore)===JSON.stringify(hashesAfter),'Source geometry/morph buffers changed');
  check(errors.length===0&&failedRequests.length===0&&blocked.length===0,'Runtime/network failure');
  const A=segments[0],B=segments[1],comparison={
    frameCount:{A:A.frames.count,B:B.frames.count},
    medianRafMs:{A:A.frames.rafIntervalMs.median,B:B.frames.rafIntervalMs.median},
    p95RafMs:{A:A.frames.rafIntervalMs.p95,B:B.frames.rafIntervalMs.p95},
    medianCpuSubmitMs:{A:A.frames.updateAndRenderSubmitMs.median,B:B.frames.updateAndRenderSubmitMs.median},
    calls:{A:A.frames.callsPerFrame.median,B:B.frames.callsPerFrame.median},
    triangles:{A:A.frames.trianglesPerFrame.median,B:B.frames.trianglesPerFrame.median}};
  const report={schema:'standard-character-candidate74-result-v1',pass:true,reviewerApprovalRequired:true,
    completedAt:new Date().toISOString(),asset:inputs.asset,browser:browserConfig,throttling,
    productionViewerSha256:inputs.productionViewerSha256,affectedNames:inputs.affectedNames,
    candidate:inputs.candidate,cold,startPoseProof,resetProof,finiteEnd,segments,comparison,
    initialMaterialState,geometryBuffersUnchanged:true,snapshots,errors,warnings,blocked,failedRequests,
    limits:['REVIEW CANDIDATE ONLY: not approved for deployment.','Eyes remain visible in both modes; candidate changes only two shell materials using built-in alpha blending.',
      'Opacity0.08, no refraction, depthWritefalse and FrontSide are an explicit appearance approximation, requiring visual review.',
      'Same loaded model/context/camera/clock; baseline precedes candidate, so shader/cache warm-up and run order may affect comparison.',
      'Both30-second samples repeat the finite excerpt with intentional hard resets; not a seamless loop.',
      'Synthetic SwiftShader, not user-device performance.','Geometry/UV/normal/specular sources are retained; source GLB, animation and production72 files unchanged.',
      'Screenshots show actual unedited renderer output. No image edits, source reexports, or hidden eye shells.']};
  fs.writeFileSync(path.join(output,'candidate74-result.json'),JSON.stringify(report,null,2));console.log('CANDIDATE74_RESULT',JSON.stringify(report));
})().catch(async error=>{
  const report={pass:false,reviewerApprovalRequired:true,error:error.stack,browser:browserConfig,throttling,cold,
    startPoseProof,resetProof,segments,state:await diagnostics(),snapshots,errors,warnings,blocked,failedRequests};
  fs.writeFileSync(path.join(output,'candidate74-failure.json'),JSON.stringify(report,null,2));console.error('CANDIDATE74_FAILED',JSON.stringify(report));process.exitCode=1;
}).finally(async()=>{await browser?.close();server.close();});
