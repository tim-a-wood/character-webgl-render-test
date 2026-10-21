'use strict';
// Authorised GitHub runner only. No automatic publication, dispatch, or retry.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const root = __dirname, sha = b => crypto.createHash('sha256').update(b).digest('hex');
const check = (ok, message) => { if (!ok) throw Error(message); };
const inputs = JSON.parse(fs.readFileSync(path.join(root, 'proof-inputs78-jog.json')));
check(inputs.schema === 'compact-jog-comparison-inputs78-v1' && inputs.expectedCaptureCount === 30, 'Unrecognised or unbounded proof');
check(inputs.externalAssets.length === 0, 'External assets forbidden');
const files = new Map(inputs.localFiles.map(f => [f.path, f]));
for (const f of files.values()) {
  const filename = path.resolve(root, f.path);
  check(filename.startsWith(root + path.sep) && fs.realpathSync(filename) === filename, 'Unsafe frozen file');
  const bytes = fs.readFileSync(filename); check(bytes.length === f.bytes && sha(bytes) === f.sha256, 'Frozen file mismatch: ' + f.path);
}
const { chromium } = require('playwright-core');
check(require('playwright-core/package.json').version === '1.57.0', 'Unpinned browser harness');
const output = path.join(root, 'results78-jog'); fs.mkdirSync(output, { recursive: true });
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
  const bytes = Buffer.from(dataURL.split(',')[1], 'base64'), filename = `jog78-${label}.png`;
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
  check(cold.asset.sha256 === inputs.asset.sha256 && cold.asset.bytes === inputs.asset.bytes, 'Exact animation-only v3 diagnostic asset required');
  check(cold.selectedClip === inputs.jog.clip && !cold.playing && cold.clipTime === 0 && !cold.neutral, 'V3 deep link must open paused in its first pose');
  const names = await page.locator('#animation option').evaluateAll(options => options.map(o => o.value));
  check([...inputs.retainedClips, inputs.jog.clip, inputs.diagnosticBeforeClip].every(name => names.includes(name)), 'Required retained/comparison clip missing');
  const hashesBefore = await page.evaluate(() => window.characterQA72.geometryHashes());
  const materials = await page.evaluate(() => window.characterQA72.eyeSurfaceState74());
  check(materials.length === 2 && materials.every(m => m.mode === 'candidate' && m.visible && Object.values(m.preserved).every(Boolean)), 'Reviewed eye appearance changed');
  const startProof = await page.evaluate(() => {
    const q = window.characterQA72; q.reset(); const before = q.poseSignature(); q.play(); const after = q.poseSignature(); q.pause();
    q.selectAnimation('Walk539_618'); const walk = q.poseSignature(); q.selectAnimation('Jog478_525');
    return {before, after, walk, selectedStart: q.poseSignature()};
  });
  check(startProof.before === startProof.after && startProof.before === startProof.selectedStart, 'V3 start, Play or selection introduced a jump');
  const cameraByView = {}, pairs = [];
  for (const view of inputs.views) {
    await page.evaluate(view => window.characterQA72.setComparisonView77(view), view);
    await page.evaluate(() => window.characterQA72.rendered());
    cameraByView[view] = await page.evaluate(() => window.characterQA72.report().camera);
    const cameraSha256 = sha(JSON.stringify(cameraByView[view]));
    for (const clipName of [inputs.diagnosticBeforeClip, inputs.jog.clip]) {
      await page.locator('#animation').selectOption(clipName);
      for (const sourceFrame of view === 'front' ? [...new Set([...inputs.sourceFrames, ...inputs.orderedSourceFrames])].sort((a,b)=>a-b) : inputs.sourceFrames) {
        const captured = await page.evaluate(i => window.characterQA72.captureGaitKey76(i), sourceFrame - inputs.jog.firstSourceFrame);
        check(captured.finite && captured.pixels.nonBackgroundPixels > 500 && captured.draw.triangles > 0, 'Invalid comparison render');
        check(captured.clipName === clipName && captured.sourceFrame === sourceFrame && !captured.neutral, 'Wrong exact comparison pose');
        check(Math.abs(captured.sourceTimeSeconds - (sourceFrame - inputs.jog.firstSourceFrame) * inputs.jog.sourceDt) < 2e-6, 'Native source time changed');
        check(sha(JSON.stringify(captured.camera)) === cameraSha256, 'Paired comparison camera moved');
        check(captured.joints.length >= 8, 'Missing frozen leg/foot joint evidence');
        const foot = captured.projectedFootwearBounds;
        check(foot.min[0] >= -1 && foot.max[0] <= 1 && foot.min[1] >= -1 && foot.max[1] <= 1, 'Whole-character framing cuts footwear');
        captured.poseSha256 = sha(captured.poseSignature); delete captured.poseSignature;
        captured.version = clipName === inputs.diagnosticBeforeClip ? 'v2' : 'v3'; captured.view = view;
        captured.captureRoles = [inputs.sourceFrames.includes(sourceFrame) ? 'focused' : null, view === 'front' && inputs.orderedSourceFrames.includes(sourceFrame) ? 'ordered-style' : null].filter(Boolean);
        check(captured.upperBodyJoints.some(j => /^DEF-Wrist\.?L$/.test(j.name)) && captured.upperBodyJoints.some(j => /^DEF-Wrist\.?R$/.test(j.name)), 'Missing wrist style evidence');
        captured.image = saveImage(`${captured.version}-${view}-frame${sourceFrame}`, captured.image);
        frames.push(captured); console.log('JOG78_FRAME', JSON.stringify(captured));
      }
    }
  }
  check(frames.length === 30, 'Bounded thirty-render comparison required');
  for (const before of frames.filter(f => f.version === 'v2')) {
    const after = frames.find(f => f.version === 'v3' && f.view === before.view && f.sourceFrame === before.sourceFrame);
    check(after && before.sourceTimeSeconds === after.sourceTimeSeconds, 'Comparison timestamps disagree');
    check(JSON.stringify(before.joints) === JSON.stringify(after.joints), 'Frozen leg/foot joint motion changed');
    check(JSON.stringify(before.footwearBounds) === JSON.stringify(after.footwearBounds), 'Frozen footwear deformation changed');
    check(JSON.stringify(before.frozenLowerBodyTransforms) === JSON.stringify(after.frozenLowerBodyTransforms), 'Frozen lower-body attachment/node transform changed');
    check(JSON.stringify(before.allowedMorphRuntimeNames) === JSON.stringify(after.allowedMorphRuntimeNames), 'Morph allowlist changed during capture');
    let changedAllowedMorphValues = 0;
    for (const old of before.morphWeights) {
      const next = after.morphWeights.find(m => m.name === old.name); check(next && next.weights.length === old.weights.length, 'Morph schema changed');
      if (before.allowedMorphRuntimeNames.includes(old.name)) changedAllowedMorphValues += next.weights.filter((v,i) => v !== old.weights[i]).length;
      else check(JSON.stringify(old.weights) === JSON.stringify(next.weights), 'Non-allowlisted morph weights changed: ' + old.name);
    }
    const upperBodyJointDeltas = before.upperBodyJoints.map(old => {
      const next = after.upperBodyJoints.find(j => j.name === old.name); check(next, 'Missing corresponding upper-body joint');
      return {name:old.name,positionDeltaMetres:Math.hypot(...next.worldPosition.map((v,i)=>v-old.worldPosition[i]))};
    });
    pairs.push({sourceFrame: before.sourceFrame, sourceTimeSeconds: before.sourceTimeSeconds, view: before.view,
      beforeImage: before.image, afterImage: after.image, exactLegFootJoints: true, exactFootwearBounds: true,
      exactLowerBodyAttachments:true,nonAllowlistedMorphWeightsExact:true,changedAllowedMorphValues,upperBodyJointDeltas});
  }
  await page.evaluate(() => {const q=window.characterQA72;q.selectAnimation('Jog478_525');q.setComparisonView77('front');q.beginFiniteJogDemo76();});
  await page.evaluate(() => window.characterQA72.rendered());
  await page.locator('#play').click();
  await page.waitForFunction(() => window.characterQA72.report().finiteJogDemo76?.completed, null, {timeout: 60000});
  const played = await page.evaluate(() => window.characterQA72.report());
  check(!played.playing && Math.abs(played.clipTime - inputs.jog.duration) < 1e-5, 'Finite v3 Jog failed to stop');
  check(played.finiteJogDemo76.frames.some(f => f.clipTime > 0) && played.controls.some(c => c.kind === 'play' && c.trusted), 'Real advancing pointer Play not verified');
  await page.locator('#reset').click(); await page.evaluate(() => window.characterQA72.rendered());
  check(sha(await page.evaluate(() => window.characterQA72.poseSignature())) === sha(startProof.before), 'V3 reset failed exact first-pose restoration');
  const retainedWalk = await page.evaluate(() => {const q=window.characterQA72;q.selectAnimation('Walk539_618');const pose=q.poseSignature();q.selectAnimation('Jog478_525');return pose;});
  check(retainedWalk === startProof.walk, 'Jog comparison contaminated retained Walk pose');
  check(JSON.stringify(hashesBefore) === JSON.stringify(await page.evaluate(() => window.characterQA72.geometryHashes())), 'Runtime geometry/basis mutated');
  check(JSON.stringify(materials) === JSON.stringify(await page.evaluate(() => window.characterQA72.eyeSurfaceState74())), 'Reviewed eye surfaces mutated');
  const final = await page.evaluate(() => window.characterQA72.report());
  check(final.glErrors.length === 0 && final.contextLosses === 0 && final.attributeVersionsUnchanged && final.benchmark === null, 'GL, attribute or unexpected benchmark failure');
  const transferNames = inputs.asset.parts?.map(p => p.filename) || [inputs.asset.filename];
  const assets = [...transfers.values()].filter(t => transferNames.includes(new URL(t.url).pathname.slice(1)));
  check(assets.length === transferNames.length && assets.every(t => t.completed) && transferNames.every(name => assets.some(t => new URL(t.url).pathname === '/' + name)), 'Expected one complete frozen model transfer');
  check(final.assetTransfer.parts === transferNames.length && final.assetTransfer.parsedModels === 1 && final.assetTransfer.bytes === inputs.asset.bytes, 'Transport must assemble exactly one complete standard GLB');
  check(errors.length === 0 && failedRequests.length === 0 && blocked.length === 0, 'Runtime/network failure');
  const report = {schema:'compact-jog-comparison-result78-v1',pass:true,technicalChecksPassed:true,artisticAcceptance:false,
    reviewStatus:'Jog v3 WIP; compare source images and review before any next iteration',completedAt:new Date().toISOString(),
    asset:inputs.asset,baselineAsset:inputs.baselineAsset,mergeAuditSha256:inputs.mergeAuditSha256,browser:browserConfig,throttling,
    sourceClock:{samples:48,sourceDt:inputs.jog.sourceDt,duration:inputs.jog.duration,slowedOrResampled:false,seamlessLoop:false},
    captureCount:30,modelLoads:1,assetTransfer:final.assetTransfer,assetTransferRequests:assets,sourceFrames:inputs.sourceFrames,orderedSourceFrames:inputs.orderedSourceFrames,views:inputs.views,cameraByView,animationEditContract:inputs.animationEditContract,
    materialState:materials,geometryAndMorphBasisUnchangedDuringCapture:true,pairs,frames,
    functionalSmoke:{deepLinkPausedFirstPose:true,playNoJump:true,resetExactFirstPose:true,retainedWalkPoseUnchanged:true,
      jogStartPoseSha256:sha(startProof.before),retainedWalkPoseSha256:sha(startProof.walk),realFinitePlay:played.finiteJogDemo76},
    knownFitLimitations:inputs.jog.fitReview,glErrors:final.glErrors,contextLosses:final.contextLosses,errors,warnings,blocked,failedRequests,
    limits:['Four focused source poses in front/side plus nine ordered front poses per version, overlapping endpoints reused:30raw PNGs total; no full48-frame repeat or30-second benchmark.',
      'Both clips share exactly the v2 model, target basis and materials. Only declared upper-body animation tracks differ; pelvis/legs/feet and lower-body attachments remain frozen.',
      'Native source images are separate evidence and require review. Technical preservation is not artistic acceptance.',
      'Actual finite Play uses unchanged source timing; synthetic browser frame count is not a phone-FPS claim.',
      'Ordered stills are sparsely sampled at original source timestamps, not full-rate motion. Do not slow presentation or label sparse captures as60FPS.',
      'Do not start v4 before the v3 demo, review and retro.']};
  fs.writeFileSync(path.join(output,'jog78-result.json'),JSON.stringify(report,null,2));console.log('JOG78_RESULT',JSON.stringify(report));
})().catch(async error=>{
 const report={pass:false,error:error.stack,browser:browserConfig,throttling,cold,frames,state:await diagnostics(),errors,warnings,blocked,failedRequests};
 fs.writeFileSync(path.join(output,'jog78-failure.json'),JSON.stringify(report,null,2));console.error('JOG78_FAILED',JSON.stringify(report));process.exitCode=1;
}).finally(async()=>{await browser?.close();server.close();});
