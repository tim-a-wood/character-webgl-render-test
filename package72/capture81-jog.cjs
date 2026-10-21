'use strict';
// Authorised GitHub runner only. No automatic publication, dispatch, or retry.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const root = __dirname, sha = b => crypto.createHash('sha256').update(b).digest('hex');
const check = (ok, message) => { if (!ok) throw Error(message); };
const inputs = JSON.parse(fs.readFileSync(path.join(root, 'proof-inputs81-jog.json')));
check(inputs.schema === 'loop-jog-comparison-inputs81-v1' && inputs.expectedCaptureCount === 36, 'Unrecognised or unbounded proof');
check(inputs.externalAssets.length === 0, 'External assets forbidden');
const files = new Map(inputs.localFiles.map(f => [f.path, f]));
for (const f of files.values()) {
  const filename = path.resolve(root, f.path);
  check(filename.startsWith(root + path.sep) && fs.realpathSync(filename) === filename, 'Unsafe frozen file');
  const bytes = fs.readFileSync(filename); check(bytes.length === f.bytes && sha(bytes) === f.sha256, 'Frozen file mismatch: ' + f.path);
}
const { chromium } = require('playwright-core');
check(require('playwright-core/package.json').version === '1.57.0', 'Unpinned browser harness');
const output = path.join(root, 'results81-jog'); fs.mkdirSync(output, { recursive: true });
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
  const bytes = Buffer.from(dataURL.split(',')[1], 'base64'), filename = `jog81-${label}.png`;
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
  const beforeAuditBytes=fs.readFileSync(path.join(root,inputs.decodedBeforeSeamAudit.path)),beforeAudit=JSON.parse(beforeAuditBytes);
  check(sha(beforeAuditBytes)===inputs.decodedBeforeSeamAudit.sha256 && beforeAudit.asset.sha256===inputs.asset.sha256 && beforeAudit.clip===inputs.diagnosticBeforeClip && beforeAudit.allTrackEndpointsExactlyEqual,'Decoded retained v5 cycle audit mismatch');
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
    captured.protectedUpperTransformsSha256=sha(JSON.stringify(captured.frozenUpperBodyTransforms));delete captured.frozenUpperBodyTransforms;
    captured.role=role;captured.view=view;captured.image=saveImage(label,captured.image);frames.push(captured);
    console.log('JOG81_FRAME',JSON.stringify(captured));return captured;
  }
  const pairs=[],numerical=[];
  await page.evaluate(()=>window.characterQA72.setContactReference79(true));
  for(const [version,clipName] of [['v5',inputs.diagnosticBeforeClip],['v6',inputs.jog.clip]]){
    await page.locator('#animation').selectOption(clipName);
    const samples=await page.evaluate(count=>Array.from({length:count},(_,i)=>window.characterQA72.captureGaitKey76(i,true)),inputs.jog.samples);
    check(samples.length===49 && samples.every((s,i)=>s.sourceKeyIndex===i && s.sourceFrame===498+i && s.diagnosticContact.enabled),'All49 grounded native numerical samples required');
    numerical.push({version,samples});
  }
  const beforeSamples=numerical[0].samples,afterSamples=numerical[1].samples;
  for(let i=0;i<49;i++){
    const before=beforeSamples[i],after=afterSamples[i];
    check(before.sourceTimeSeconds===after.sourceTimeSeconds,'Before/after native clocks differ');
    check(JSON.stringify(before.upperBodyJoints)===JSON.stringify(after.upperBodyJoints),'Protected upper-body motion changed');
    check(JSON.stringify(before.frozenUpperBodyTransforms)===JSON.stringify(after.frozenUpperBodyTransforms),'Protected upper-body transforms changed');
    check(JSON.stringify(before.diagnosticContact)===JSON.stringify(after.diagnosticContact),'Ground/root restoration differs');
    for(const old of before.morphWeights){
      const next=after.morphWeights.find(m=>m.name===old.name);check(next && next.weights.length===old.weights.length,'Morph schema changed');
      if(!before.allowedMorphRuntimeNames.includes(old.name))check(JSON.stringify(old.weights)===JSON.stringify(next.weights),'Non-allowlisted morph channel changed: '+old.name);
    }
  }
  for(const view of ['side','threeQuarter']){
    const cameraSha=await cameraView(view),keys=inputs.capturePlan[view+'SourceFrames'];
    for(const sourceFrame of keys){
      const pair={view,sourceFrame,sourceTimeSeconds:(sourceFrame-inputs.jog.firstSourceFrame)*inputs.jog.sourceDt};
      for(const [version,clipName] of [['v5',inputs.diagnosticBeforeClip],['v6',inputs.jog.clip]]){
        await page.locator('#animation').selectOption(clipName);
        const c=await page.evaluate(i=>window.characterQA72.captureGaitKey76(i),sourceFrame-inputs.jog.firstSourceFrame);
        check(c.sourceFrame===sourceFrame && c.clipName===clipName && c.diagnosticContact.enabled,'Wrong grounded comparison key');
        pair[version]=record(c,`contact-${version}-${view}-frame${sourceFrame}`,'same-time-grounded-contact-release',view,cameraSha).image;
      }
      pairs.push(pair);
    }
  }
  const sideCamera=await cameraView('side');
  for(const offset of inputs.capturePlan.seamOffsets){
    for(const [version,clipName] of [['v5',inputs.diagnosticBeforeClip],['v6',inputs.jog.clip]]){
      await page.locator('#animation').selectOption(clipName);
      const c=await page.evaluate(key=>window.characterQA72.captureContactSeam81(key),48+offset);
      check(c.unwrappedKey===48+offset && c.clipName===clipName && c.diagnosticContact.enabled,'Wrong grounded seam key');
      record(c,`seam-${version}-side-${offset<0?'minus':'plus'}${Math.abs(offset)}`,'same-time-native-seam-neighbor','side',sideCamera);
    }
  }
  check(frames.length===36,'Bounded36-render plan changed');
  const horizontalSpan=points=>{let span=0;for(const a of points)for(const b of points)span=Math.max(span,Math.hypot(a[0]-b[0],a[2]-b[2]));return span;};
  const kneeMetrics=samples=>{
    const rows=samples.map(s=>{
      const get=kind=>{const joint=s.joints.find(j=>new RegExp('^DEF-'+kind+'\\.?R$').test(j.name));check(joint,'Right leg joint missing');return joint.worldPosition;};
      const hip=get('Thigh'),position=get('Knee'),foot=get('Foot'),a=hip.map((v,i)=>v-position[i]),b=foot.map((v,i)=>v-position[i]);
      return{sourceFrame:s.sourceFrame,sourceTimeSeconds:s.sourceTimeSeconds,position,angleDegrees:Math.acos(Math.max(-1,Math.min(1,a.reduce((n,v,i)=>n+v*b[i],0)/(Math.hypot(...a)*Math.hypot(...b)))))*180/Math.PI};
    });
    const acceleration=rows.slice(1,-1).map((r,i)=>({sourceFrame:r.sourceFrame,vector:r.position.map((v,k)=>(rows[i+2].position[k]-2*v+rows[i].position[k])/(inputs.jog.sourceDt**2))}));
    const jerk=acceleration.slice(1).map((r,i)=>({sourceFrame:r.sourceFrame,magnitude:Math.hypot(...r.vector.map((v,k)=>(v-acceleration[i].vector[k])/inputs.jog.sourceDt))}));
    return{samples:rows,maxAccelerationMetresPerSecondSquared:Math.max(...acceleration.map(r=>Math.hypot(...r.vector))),maxJerkMetresPerSecondCubed:Math.max(...jerk.map(r=>r.magnitude)),maximumInteriorKneeAngleDegrees:Math.max(...rows.map(r=>r.angleDegrees)),acceptanceThreshold:null,policy:'Descriptive same-clock runtime finite differences; not automatic smoothness acceptance.'};
  };
  const contactTravel=numerical.map(({version,samples})=>{
    const support=samples.filter(s=>s.sourceFrame>=inputs.diagnosticContact.supportSourceFrames[0]&&s.sourceFrame<=inputs.diagnosticContact.supportSourceFrames[1]);
    const anchor=inputs.diagnosticContact.persistentRightSoleLabel;
    const rows=support.map(s=>{const p=s.rightSolePoints.find(p=>p.label===anchor);check(p,'Verified persistent sole marker missing');return{sourceFrame:s.sourceFrame,sourceTimeSeconds:s.sourceTimeSeconds,position:p.worldPosition,groundGapMetres:p.worldPosition[1]-inputs.diagnosticContact.groundY};});
    return{version,persistentLabel:anchor,supportSourceFrames:inputs.diagnosticContact.supportSourceFrames,samples:rows,
      persistentPointHorizontalSpanMetres:horizontalSpan(rows.map(r=>r.position)),
      patchMaxIndividualHorizontalSpanMetres:Math.max(...inputs.diagnosticContact.rightSoleVertices.map(def=>horizontalSpan(support.map(s=>s.rightSolePoints.find(p=>p.label===def.label).worldPosition)))),
      all49PersistentPointSamples:samples.map(s=>({sourceFrame:s.sourceFrame,position:s.rightSolePoints.find(p=>p.label===anchor).worldPosition})),
      acceptanceThreshold:null,policy:'Verified runtime sole point in identically restored source world, not in-place treadmill travel. Floor convention and stride are unchanged.'};
  });
  const releaseKneeDiagnostics=numerical.map(({version,samples})=>({version,...kneeMetrics(samples)}));
  const all49Protection={sampleCountPerVersion:49,exactSourceClocks:true,upperBodyJointsExact:true,protectedUpperTransformsExact:true,nonAllowlistedMorphsExact:true,identicalGroundAndRootRestoration:true};
  await page.evaluate(()=>window.characterQA72.setContactReference79(false));
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
  check(!await page.evaluate(()=>window.characterQA72.isLoopingJog80()),'Diagnostic sampling selection must not alter the approved production loop selector');
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
  const report={schema:'loop-jog-comparison-result81-v1',pass:true,technicalChecksPassed:true,artisticAcceptance:false,completedAt:new Date().toISOString(),asset:inputs.asset,baselineAsset:inputs.baselineAsset,browser:browserConfig,throttling,
    sourceClock:{...inputs.jog,slowedOrResampled:false},beforeClipClock:inputs.diagnosticBefore,decodedFinalAssetSeamAudit:{path:inputs.decodedSeamAudit.path,sha256:inputs.decodedSeamAudit.sha256,asset:seamAudit.asset,clip:seamAudit.clip,trackCount:seamAudit.trackCount,allTrackEndpointsExactlyEqual:seamAudit.allTrackEndpointsExactlyEqual,maxEndpointRotationAngleRadians:seamAudit.maxEndpointRotationAngleRadians,nonconstantStepTracks:seamAudit.nonconstantStepTracks,groups:seamAudit.groups,worstBoundaryTracks:[...seamAudit.tracks].sort((a,b)=>b.boundaryVelocity.maxAbs-a.boundaryVelocity.maxAbs).slice(0,12),acceptance:seamAudit.acceptance,policy:seamAudit.policy},modelLoads:1,captureCount:frames.length,cameraByView,pairs,frames,contactTravel,releaseKneeDiagnostics,all49Protection,decodedBeforeCycle:{path:inputs.decodedBeforeSeamAudit.path,sha256:inputs.decodedBeforeSeamAudit.sha256,allTrackEndpointsExactlyEqual:beforeAudit.allTrackEndpointsExactlyEqual},
    actualRepeatedPlayback:{...actual,crossings:actual.events.reduce((n,e)=>n+Math.abs(e.loopDelta),0),eventCount:actual.events.length,presentationSkippedCycleIntervals:actual.events.filter(e=>Math.abs(e.loopDelta)>1),rafIntervalsMs:intervalsMs,
      policy:'Actual wall-clock AnimationMixer LoopRepeat. Sparse software-rendered frames are reported separately from deterministic seam samples. Crossings do not establish every source pose was presented or phone smoothness.'},
    functionalSmoke:{deepLinkPausedFirstPose:true,playNoJump:true,pauseHeldExactPhase:true,resumeNoJump:true,resetExactFirstPose:true,retainedWalkFirstPoseUnchanged:true,walkFiniteEndpoint:true,diagnosticBeforeSamplingDoesNotBroadenProductionLoopSelector:true},
    materialState:materials,geometryAndMorphBasisUnchangedDuringCapture:true,assetTransfer:final.assetTransfer,assetTransferRequests:assets,glErrors:final.glErrors,contextLosses:final.contextLosses,errors,warnings,blocked,failedRequests,
    limits:['Both versions use the same49-key498–546 cycle and exact source clock.','Identical diagnostic source-world root restoration and ground grid are used for contact views; production stays in-place.','Deterministic seam stills preserve native60Hz times and are not claimed to be presented playback frames.','No crossfade, modulo-reset fake loop, slowdown, new geometry or material edits.','Native and decoded seam metrics plus visual review determine acceptance; no automatic next iteration.']};
  fs.writeFileSync(path.join(output,'jog81-result.json'),JSON.stringify(report,null,2));console.log('JOG81_RESULT',JSON.stringify(report));
})().catch(async error=>{
 const report={pass:false,error:error.stack,browser:browserConfig,throttling,cold,frames,state:await diagnostics(),errors,warnings,blocked,failedRequests};
 fs.writeFileSync(path.join(output,'jog81-failure.json'),JSON.stringify(report,null,2));console.error('JOG81_FAILED',JSON.stringify(report));process.exitCode=1;
}).finally(async()=>{await browser?.close();server.close();});
