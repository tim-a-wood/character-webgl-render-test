'use strict';
// Authorised GitHub runner only. No automatic publication, dispatch, or retry.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const root = __dirname, sha = b => crypto.createHash('sha256').update(b).digest('hex');
const check = (ok, message) => { if (!ok) throw Error(message); };
const inputs = JSON.parse(fs.readFileSync(path.join(root, 'proof-inputs80-jog.json')));
check(inputs.schema === 'loop-jog-comparison-inputs80-v1' && inputs.expectedCaptureCount === 30, 'Unrecognised or unbounded proof');
check(inputs.externalAssets.length === 0, 'External assets forbidden');
const files = new Map(inputs.localFiles.map(f => [f.path, f]));
for (const f of files.values()) {
  const filename = path.resolve(root, f.path);
  check(filename.startsWith(root + path.sep) && fs.realpathSync(filename) === filename, 'Unsafe frozen file');
  const bytes = fs.readFileSync(filename); check(bytes.length === f.bytes && sha(bytes) === f.sha256, 'Frozen file mismatch: ' + f.path);
}
const { chromium } = require('playwright-core');
check(require('playwright-core/package.json').version === '1.57.0', 'Unpinned browser harness');
const output = path.join(root, 'results80-jog'); fs.mkdirSync(output, { recursive: true });
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
  const bytes = Buffer.from(dataURL.split(',')[1], 'base64'), filename = `jog80-${label}.png`;
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
  check(cold.asset.sha256 === inputs.asset.sha256 && cold.asset.bytes === inputs.asset.bytes, 'Exact frozen full-cycle diagnostic asset required');
  check(cold.selectedClip === inputs.jog.clip && !cold.playing && cold.clipTime === 0 && !cold.neutral && cold.loopState80.active, 'Deep link must open paused at validated cycle first pose');
  const seamAuditBytes=fs.readFileSync(path.join(root,inputs.decodedSeamAudit.path)),seamAudit=JSON.parse(seamAuditBytes);
  check(sha(seamAuditBytes)===inputs.decodedSeamAudit.sha256 && seamAudit.asset.sha256===inputs.asset.sha256 && seamAudit.clip===inputs.jog.clip && seamAudit.fullDecodedAuditSha256===inputs.jog.loopValidation.decodedAuditSha256,'Decoded final-asset seam audit mismatch');
  const names = await page.locator('#animation option').evaluateAll(options => options.map(o => o.value));
  check([...inputs.retainedClips, inputs.jog.clip, inputs.diagnosticBeforeClip].every(name => names.includes(name)), 'Retained/comparison clip missing');
  const hashesBefore = await page.evaluate(() => window.characterQA72.geometryHashes());
  const materials = await page.evaluate(() => window.characterQA72.eyeSurfaceState74());
  check(materials.length === 2 && materials.every(m => m.mode === 'candidate' && m.visible && Object.values(m.preserved).every(Boolean)), 'Reviewed eye appearance changed');
  const startProof = await page.evaluate(jog => {
    const q=window.characterQA72;q.reset();const before=q.poseSignature();q.play();const after=q.poseSignature();q.pause();
    q.selectAnimation('Walk539_618');const walk=q.poseSignature();q.selectAnimation(jog);
    return {before,after,walk,selectedStart:q.poseSignature()};
  },inputs.jog.clip);
  check(startProof.before===startProof.after && startProof.before===startProof.selectedStart,'Cycle start, Play or selection introduced a jump');
  const cameraByView={};
  async function cameraView(view){
    await page.evaluate(view=>window.characterQA72.setComparisonView77(view),view);
    await page.evaluate(()=>window.characterQA72.rendered());
    const c=await page.evaluate(()=>window.characterQA72.report().camera);cameraByView[view]??=c;
    check(JSON.stringify(c)===JSON.stringify(cameraByView[view]),'Frozen comparison camera moved');return sha(JSON.stringify(c));
  }
  function record(captured,label,role,view,cameraSha){
    check(captured.finite && captured.pixels.nonBackgroundPixels>500 && captured.draw.triangles>0 && !captured.neutral,'Invalid character capture');
    check(sha(JSON.stringify(captured.camera))===cameraSha,'Paired camera changed');
    const foot=captured.projectedFootwearBounds;check(foot.min[0]>=-1 && foot.max[0]<=1 && foot.min[1]>=-1 && foot.max[1]<=1,'Whole-character frame cuts feet');
    check(captured.joints.length>=8 && captured.upperBodyJoints.some(j=>/^DEF-Wrist\.?L$/.test(j.name)) && captured.upperBodyJoints.some(j=>/^DEF-Wrist\.?R$/.test(j.name)),'Required leg/arm joint evidence missing');
    captured.poseSha256=sha(captured.poseSignature);delete captured.poseSignature;
    captured.role=role;captured.view=view;captured.image=saveImage(label,captured.image);frames.push(captured);
    console.log('JOG80_FRAME',JSON.stringify(captured));return captured;
  }
  const intervals=inputs.jog.samples-1;
  for(const view of ['front','side']){
    const cameraSha=await cameraView(view);
    for(const offset of inputs.capturePlan.seamOffsets){
      const c=await page.evaluate(key=>window.characterQA72.captureLoopKey80(key),intervals+offset);
      check(c.unwrappedKey===intervals+offset && c.clipName===inputs.jog.clip,'Wrong seam key');
      record(c,`seam-${view}-${offset<0?'minus':'plus'}${Math.abs(offset)}`,'seam-native-neighbor',view,cameraSha);
    }
  }
  const frontCamera=await cameraView('front');
  for(const key of inputs.capturePlan.cycleKeyIndices){
    const c=await page.evaluate(i=>window.characterQA72.captureGaitKey76(i),key);
    check(c.sourceKeyIndex===key && c.clipName===inputs.jog.clip,'Wrong cycle pose');
    record(c,`cycle-front-key${String(key).padStart(2,'0')}`,'ordered-cycle', 'front',frontCamera);
  }
  const armPairs=[];
  for(const view of ['front','side']){
    const cameraSha=await cameraView(view);
    for(const sourceFrame of inputs.capturePlan.armSourceFrames){
      const pair={view,sourceFrame};
      for(const [version,clipName,spec] of [['v4',inputs.diagnosticBeforeClip,inputs.diagnosticBefore],['v5',inputs.jog.clip,inputs.jog]]){
        await page.locator('#animation').selectOption(clipName);
        const c=await page.evaluate(i=>window.characterQA72.captureGaitKey76(i),sourceFrame-spec.firstSourceFrame);
        check(c.sourceFrame===sourceFrame && c.clipName===clipName && Math.abs(c.sourceTimeSeconds-(sourceFrame-spec.firstSourceFrame)*spec.sourceDt)<2e-6,'Independent source-clock arm comparison differs');
        pair[version]=record(c,`arms-${version}-${view}-frame${sourceFrame}`,'same-source-arm-comparison',view,cameraSha).image;
      }
      armPairs.push(pair);
    }
  }
  check(frames.length===30,'Bounded thirty-render plan changed');
  await page.evaluate(jog=>{const q=window.characterQA72;q.selectAnimation(jog);q.setComparisonView77('front');q.beginLoopPlayback80();},inputs.jog.clip);
  await page.evaluate(()=>window.characterQA72.rendered());
  await page.locator('#play').click();
  await page.waitForFunction(()=>window.characterQA72.report().loopState80.completedCycles>=3,null,{timeout:60000,polling:100});
  await page.locator('#pause').click();
  await page.evaluate(()=>window.characterQA72.rendered());
  const played=await page.evaluate(()=>window.characterQA72.report()),held=await page.evaluate(()=>window.characterQA72.poseSignature());
  await page.waitForTimeout(200);await page.evaluate(()=>window.characterQA72.rendered());
  check(!played.playing && held===await page.evaluate(()=>window.characterQA72.poseSignature()),'Pause did not hold exact phase');
  check(played.loopPlayback80.events.reduce((n,e)=>n+Math.abs(e.loopDelta),0)>=3 && played.loopPlayback80.frames.some(f=>f.phaseSeconds>0),'Three real repeat crossings not observed');
  check(played.controls.some(c=>c.kind==='play'&&c.trusted) && played.controls.some(c=>c.kind==='pause'&&c.trusted),'Actual pointer Play/Pause missing');
  const resumeProof=await page.evaluate(()=>{const q=window.characterQA72,before=q.poseSignature(),state=q.report().loopState80;q.play();const after=q.poseSignature();q.pause();return{before,after,state};});
  check(resumeProof.before===resumeProof.after && resumeProof.state.unwrappedSeconds===played.loopState80.unwrappedSeconds,'Resume introduced reset/jump');
  await page.evaluate(()=>window.characterQA72.endLoopPlayback80());
  await page.locator('#reset').click();await page.evaluate(()=>window.characterQA72.rendered());
  check(sha(await page.evaluate(()=>window.characterQA72.poseSignature()))===sha(startProof.before),'Reset failed exact cycle first-pose restoration');
  await page.locator('#animation').selectOption('Walk539_618');
  check(await page.evaluate(()=>window.characterQA72.poseSignature())===startProof.walk,'Loop contaminated retained Walk pose');
  await page.locator('#play').click();await page.waitForFunction(()=>!window.characterQA72.report().playing,null,{timeout:60000,polling:100});
  const walkEnd=await page.evaluate(()=>window.characterQA72.report());
  check(Math.abs(walkEnd.clipTime-1.316693)<1e-5 && !walkEnd.loopState80.active,'Accepted Walk did not retain finite endpoint');
  await page.locator('#animation').selectOption(inputs.diagnosticBeforeClip);
  check(!await page.evaluate(()=>window.characterQA72.isLoopingJog80()),'Old finite v4 excerpt must never loop');
  await page.evaluate(jog=>window.characterQA72.selectAnimation(jog),inputs.jog.clip);
  check(JSON.stringify(hashesBefore)===JSON.stringify(await page.evaluate(()=>window.characterQA72.geometryHashes())),'Runtime geometry/basis mutated');
  check(JSON.stringify(materials)===JSON.stringify(await page.evaluate(()=>window.characterQA72.eyeSurfaceState74())),'Reviewed eye surfaces mutated');
  const final=await page.evaluate(()=>window.characterQA72.report());
  check(final.glErrors.length===0 && final.contextLosses===0 && final.attributeVersionsUnchanged && final.benchmark===null,'GL, attribute or unexpected benchmark failure');
  const transferNames=inputs.asset.parts?.map(p=>p.filename)||[inputs.asset.filename],assets=[...transfers.values()].filter(t=>transferNames.includes(new URL(t.url).pathname.slice(1)));
  check(assets.length===transferNames.length && assets.every(t=>t.completed),'Expected one complete frozen model transfer');
  check(final.assetTransfer.parts===transferNames.length && final.assetTransfer.parsedModels===1 && final.assetTransfer.bytes===inputs.asset.bytes,'Transport must parse exactly one complete standard GLB');
  check(errors.length===0 && failedRequests.length===0 && blocked.length===0,'Runtime/network failure');
  const actual=played.loopPlayback80,intervalsMs=actual.frames.slice(1).map((f,i)=>f.rafMs-actual.frames[i].rafMs);
  const report={schema:'loop-jog-comparison-result80-v1',pass:true,technicalChecksPassed:true,artisticAcceptance:false,completedAt:new Date().toISOString(),asset:inputs.asset,baselineAsset:inputs.baselineAsset,browser:browserConfig,throttling,
    sourceClock:{...inputs.jog,slowedOrResampled:false},beforeClipClock:inputs.diagnosticBefore,decodedFinalAssetSeamAudit:{path:inputs.decodedSeamAudit.path,sha256:inputs.decodedSeamAudit.sha256,asset:seamAudit.asset,clip:seamAudit.clip,trackCount:seamAudit.trackCount,allTrackEndpointsExactlyEqual:seamAudit.allTrackEndpointsExactlyEqual,maxEndpointRotationAngleRadians:seamAudit.maxEndpointRotationAngleRadians,nonconstantStepTracks:seamAudit.nonconstantStepTracks,groups:seamAudit.groups,worstBoundaryTracks:[...seamAudit.tracks].sort((a,b)=>b.boundaryVelocity.maxAbs-a.boundaryVelocity.maxAbs).slice(0,12),acceptance:seamAudit.acceptance,policy:seamAudit.policy},modelLoads:1,captureCount:frames.length,cameraByView,armPairs,frames,
    actualRepeatedPlayback:{...actual,crossings:actual.events.reduce((n,e)=>n+Math.abs(e.loopDelta),0),eventCount:actual.events.length,presentationSkippedCycleIntervals:actual.events.filter(e=>Math.abs(e.loopDelta)>1),rafIntervalsMs:intervalsMs,
      policy:'Actual wall-clock AnimationMixer LoopRepeat. Sparse software-rendered frames are reported separately from deterministic seam samples. Crossings do not establish every source pose was presented or phone smoothness.'},
    functionalSmoke:{deepLinkPausedFirstPose:true,playNoJump:true,pauseHeldExactPhase:true,resumeNoJump:true,resetExactFirstPose:true,retainedWalkFirstPoseUnchanged:true,walkFiniteEndpoint:true,oldV4ExcerptNeverLoops:true},
    materialState:materials,geometryAndMorphBasisUnchangedDuringCapture:true,assetTransfer:final.assetTransfer,assetTransferRequests:assets,glErrors:final.glErrors,contextLosses:final.contextLosses,errors,warnings,blocked,failedRequests,
    limits:['The new49-key498–546 cycle is authored from source, not an unchanged raw excerpt.','The v4 comparison is a different finite478–525 excerpt; arm comparisons use shared absolute source frames with independently correct local timestamps.','Deterministic seam stills preserve native60Hz times and are not claimed to be presented playback frames.','No crossfade, modulo-reset fake loop, slowdown, new geometry or material edits.','Native and decoded seam metrics plus visual review determine acceptance; no automatic next iteration.']};
  fs.writeFileSync(path.join(output,'jog80-result.json'),JSON.stringify(report,null,2));console.log('JOG80_RESULT',JSON.stringify(report));
})().catch(async error=>{
 const report={pass:false,error:error.stack,browser:browserConfig,throttling,cold,frames,state:await diagnostics(),errors,warnings,blocked,failedRequests};
 fs.writeFileSync(path.join(output,'jog80-failure.json'),JSON.stringify(report,null,2));console.error('JOG80_FAILED',JSON.stringify(report));process.exitCode=1;
}).finally(async()=>{await browser?.close();server.close();});
